-- 0024_billing.sql
-- Phase 5 backend: subscription activation (Paystack-confirmed), entitlement
-- enforcement in write RPCs, daily expiry scanner via pg_cron.
-- Model faithful to the old system: one-off charges (no Paystack plans),
-- locally-managed expiry, grace period, exemption fields.

-- Idempotency marker for webhook replays.
alter table public.companies add column last_payment_reference text;

-- ---------------------------------------------------------------------------
-- activate_subscription: called by the paystack-webhook edge function after a
-- verified charge.success. Idempotent on the Paystack reference.
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription(
  p_company_id uuid,
  p_tier_id uuid,
  p_billing_cycle text,
  p_reference text,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_now timestamptz := now();
  v_base timestamptz;
begin
  select * into v_company from public.companies where id = p_company_id for update;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  -- Webhook replay: same reference = already processed.
  if v_company.last_payment_reference = p_reference then
    return p_company_id;
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_cycle';
  end if;

  if not exists (select 1 from public.subscription_tiers where id = p_tier_id and is_active) then
    raise exception 'tier_not_found: %', p_tier_id;
  end if;

  -- Extend from current expiry when still active, else from now.
  v_base := case
    when v_company.subscription_expires_at is not null and v_company.subscription_expires_at > v_now
      then v_company.subscription_expires_at
    else v_now
  end;

  update public.companies
  set subscription_tier_id = p_tier_id,
      subscription_status = 'active',
      subscription_started_at = coalesce(subscription_started_at, v_now),
      subscription_expires_at = v_base + (case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end),
      subscription_grace_period_end = null,
      billing_cycle = p_billing_cycle,
      last_payment_date = v_now,
      last_payment_amount = p_amount,
      last_payment_reference = p_reference,
      updated_at = now()
  where id = p_company_id;

  return p_company_id;
end;
$$;

revoke execute on function public.activate_subscription(uuid, uuid, text, text, bigint) from authenticated, anon, public;
grant execute on function public.activate_subscription(uuid, uuid, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- assert_entitled: subscription gate for write RPCs.
-- Entitled = trial/active, OR expired-but-in-grace, OR manually exempt.
-- p_check = 'order' | 'product' also enforces tier limits.
-- ---------------------------------------------------------------------------
create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  select * into v_company from public.companies where id = p_company_id;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  -- Manual exemption always wins (platform support tool).
  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > v_now then
    return;
  end if;

  if v_company.subscription_status not in ('trial', 'active') then
    if not (
      v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now
    ) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;

  if p_check is null then
    return;
  end if;

  select t.limits into v_limits
  from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;

  if v_limits is null then
    return;
  end if;

  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null then
    if (select count(*) from public.orders o
        where o.company_id = p_company_id
          and o.created_at >= date_trunc('month', v_now)
          and o.status <> 'voided') >= (v_limits ->> 'maxOrdersPerMonth')::int then
      raise exception 'limit_reached: monthly order limit (%); upgrade your plan', v_limits ->> 'maxOrdersPerMonth';
    end if;
  end if;

  if p_check = 'product' and (v_limits ->> 'maxProducts') is not null then
    if (select count(*) from public.product_variants v where v.company_id = p_company_id and v.active)
       >= (v_limits ->> 'maxProducts')::int then
      raise exception 'limit_reached: product limit (%); upgrade your plan', v_limits ->> 'maxProducts';
    end if;
  end if;
end;
$$;

revoke execute on function public.assert_entitled(uuid, text) from authenticated, anon, public;
grant execute on function public.assert_entitled(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enforce in the creation RPCs (order creation + product creation points).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_entitled(v_company_id, 'order');

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- create_product_with_variants: product limit gate.
create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- subscription_expiry_scan: daily. trial/active past expiry -> expired + 3-day
-- grace; grace passed -> suspension is enforced by assert_entitled (grace end).
-- Reminder flags set for Phase 6 delivery.
-- ---------------------------------------------------------------------------
create or replace function public.subscription_expiry_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int := 0;
  v_now timestamptz := now();
begin
  -- Flip to expired + set grace (3 days) once.
  update public.companies
  set subscription_status = 'expired',
      subscription_grace_period_end = subscription_expires_at + interval '3 days',
      updated_at = v_now
  where subscription_status in ('trial', 'active')
    and subscription_expires_at is not null
    and subscription_expires_at < v_now
    and subscription_grace_period_end is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.subscription_expiry_scan() from authenticated, anon, public;
grant execute on function public.subscription_expiry_scan() to service_role;

select cron.schedule(
  'subscription-expiry-scan',
  '13 3 * * *', -- 06:13 EAT daily
  $$select public.subscription_expiry_scan()$$
);
