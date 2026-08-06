-- 0023_commissioning_hardening.sql
-- Transactional correctness gates required before general commissioning:
-- serialized FIFO, serialized AR/AP limits and allocations, durable payment
-- reversal state, atomic product limits, resettable/reserved SMS quotas, and
-- realtime inventory hydration.

-- -------------------------------------------------------------------------
-- 0. Company lifecycle is an authorization boundary. Registration may create
-- an unapproved workspace, but no tenant claim or RLS tenant scope is issued
-- until a platform administrator approves it.
-- -------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.companies c
  where c.id = nullif(auth.jwt() ->> 'company_id', '')::uuid
    and c.status = 'approved'
$$;

create or replace function public.is_approved_member(p_company_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and m.authorization_status = 'approved'
      and c.status = 'approved'
  )
$$;

create or replace function public.my_companies()
returns table (company_id uuid, name text, code text, role_name text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.code, coalesce(r.name, ''), up.active_company_id = c.id
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up on up.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.authorization_status = 'approved'
    and c.status = 'approved'
  order by c.name
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  v_claims := v_claims - 'company_id' - 'user_role' - 'is_platform_admin';
  select m.company_id, r.name into v_company_id, v_role_name
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up
    on up.user_id = m.user_id and up.active_company_id = m.company_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
    and c.status = 'approved'
  order by (up.user_id is not null) desc, m.created_at asc
  limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role_name, '')));
  end if;
  select exists (
    select 1 from public.platform_admins p
    where p.user_id = (event ->> 'user_id')::uuid
  ) into v_is_platform_admin;
  if v_is_platform_admin then
    v_claims := jsonb_set(v_claims, '{is_platform_admin}', 'true'::jsonb);
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$function$;

-- -------------------------------------------------------------------------
-- 1. FIFO: lock every eligible batch before calculating availability. The
-- old implementation checked first and locked later, allowing two sales to
-- pass the same pre-lock total. The remainder assertion is a final invariant.
-- -------------------------------------------------------------------------
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
  v_location_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity';
  end if;

  if p_source_type = 'Sale' then
    select o.location_id into v_location_id
    from public.orders o
    where o.id = p_source_id::uuid and o.company_id = p_company_id;
  end if;
  if v_location_id is null then
    begin
      v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_location_id := null;
    end;
  end if;
  if v_location_id is null then
    select l.id into v_location_id
    from public.stock_locations l
    where l.company_id = p_company_id and l.is_active
    order by l.is_default desc, l.created_at
    limit 1;
  end if;
  if v_location_id is null then raise exception 'stock_location_not_found'; end if;

  -- PostgreSQL row locks are held to transaction end. A competing consumer
  -- waits here, then calculates availability from the committed remainder.
  perform 1
  from public.inventory_batches b
  where b.company_id = p_company_id
    and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
    and b.remaining > 0
  order by b.purchased_at, b.created_at, b.id
  for update;

  select coalesce(sum(b.remaining), 0) into v_available
  from public.inventory_batches b
  where b.company_id = p_company_id
    and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
    and b.remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select b.id, b.remaining, b.unit_cost
    from public.inventory_batches b
    where b.company_id = p_company_id
      and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
      and b.remaining > 0
    order by b.purchased_at, b.created_at, b.id
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;

    update public.inventory_batches
    set remaining = remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_movements (
      company_id, variant_id, batch_id, stock_location_id, type, quantity,
      unit_cost, total_cost, source_type, source_id
    ) values (
      p_company_id, p_variant_id, v_batch.id, v_location_id, p_movement_type,
      -v_take, v_batch.unit_cost, v_cost, p_source_type, p_source_id
    );

    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id,
      'quantity', v_take,
      'unit_cost', v_batch.unit_cost,
      'total_cost', v_cost,
      'location_id', v_location_id
    );
  end loop;

  if v_remaining <> 0 then
    raise exception 'fifo_invariant_failed: % units remained unconsumed', v_remaining;
  end if;

  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- -------------------------------------------------------------------------
-- 2. AR/AP serialization. All monetary RPCs eventually insert journal lines,
-- so one trigger covers direct sales, bulk allocations, purchases, and future
-- callers. Locking the customer/supplier row makes the balance check atomic.
-- -------------------------------------------------------------------------
create or replace function public.enforce_credit_serialization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_code text;
  v_source_type text;
  v_source_id text;
  v_party_id uuid;
  v_party record;
  v_balance bigint;
  v_order_balance bigint;
  v_order_debits bigint;
  v_order_credits bigint;
begin
  -- Production ETL imports historical truth as service_role. Interactive
  -- application calls retain authenticated JWTs and must pass every guard.
  if current_setting('app.bypass_business_limits', true) = 'on' then return new; end if;

  select a.code into v_account_code
  from public.ledger_accounts a
  where a.id = new.account_id and a.company_id = new.company_id;
  if v_account_code not in ('ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE') then return new; end if;

  select e.source_type, e.source_id into v_source_type, v_source_id
  from public.ledger_journal_entries e where e.id = new.entry_id;

  if v_account_code = 'ACCOUNTS_RECEIVABLE' then
    v_party_id := nullif(new.meta ->> 'customerId', '')::uuid;
    if v_party_id is null then return new; end if;

    select * into v_party
    from public.customers c
    where c.id = v_party_id and c.company_id = new.company_id and not c.is_supplier
    for update;
    if v_party is null then raise exception 'customer_not_found'; end if;

    if v_source_type = 'CreditSale' and new.debit > 0 then
      if not v_party.is_credit_approved then raise exception 'credit_not_approved: customer %', v_party_id; end if;
      select coalesce(sum(l.debit) - sum(l.credit), 0)::bigint into v_balance
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.company_id = new.company_id
        and a.code = 'ACCOUNTS_RECEIVABLE'
        and l.meta ->> 'customerId' = v_party_id::text;
      if v_party.credit_limit > 0 and v_balance + new.debit > v_party.credit_limit
         and not exists (
           select 1 from public.approvals ap
           where ap.company_id = new.company_id
             and ap.type = 'overdraft'
             and ap.status = 'approved'
             and ap.metadata ->> 'order_id' = v_source_id
         ) then
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_balance, new.debit, v_party.credit_limit;
      end if;
    elsif v_source_type = 'PaymentAllocation' and new.credit > 0 then
      select coalesce(sum(l.debit), 0)::bigint,
             coalesce(sum(l.credit), 0)::bigint
        into v_order_debits, v_order_credits
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.company_id = new.company_id
        and a.code = 'ACCOUNTS_RECEIVABLE'
        and l.order_id = new.order_id;
      v_order_balance := v_order_debits - v_order_credits;
      if new.credit > v_order_balance then
        raise exception 'ar_overpayment: order % AR credits % exceed debits %',
          new.order_id, v_order_credits + new.credit, v_order_debits;
      end if;
    end if;
  else
    v_party_id := nullif(new.meta ->> 'supplierId', '')::uuid;
    if v_party_id is null then return new; end if;

    select * into v_party
    from public.customers c
    where c.id = v_party_id and c.company_id = new.company_id and c.is_supplier
    for update;
    if v_party is null then raise exception 'supplier_not_found'; end if;

    select coalesce(sum(l.credit) - sum(l.debit), 0)::bigint into v_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = new.company_id
      and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = v_party_id::text;

    if v_source_type = 'InventoryPurchase' and new.credit > 0
       and v_party.supplier_credit_limit > 0
       and v_balance + new.credit > v_party.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_balance, new.credit, v_party.supplier_credit_limit;
    elsif v_source_type = 'SupplierPayment' and new.debit > 0 and new.debit > v_balance then
      raise exception 'ap_overpayment: supplier balance is %', v_balance;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_lines_serialize_credit on public.ledger_journal_lines;
create trigger ledger_lines_serialize_credit
before insert on public.ledger_journal_lines
for each row execute function public.enforce_credit_serialization();

revoke execute on function public.enforce_credit_serialization() from authenticated, anon, public;

-- -------------------------------------------------------------------------
-- 3. Payment reversal state. Journal reversal and payment cancellation are
-- one transaction; refund ceilings and customer allocation sums immediately
-- stop counting the reversed collection.
-- -------------------------------------------------------------------------
create or replace function public.post_payment_reversal(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_payment public.payments%rowtype;
  v_entry record;
  v_existing uuid;
  v_reversal_id uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_payment
  from public.payments p
  where p.id = p_payment_id and p.company_id = v_company_id
  for update;
  if v_payment.id is null then raise exception 'payment_not_found: %', p_payment_id; end if;

  select id into v_existing
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';
  if v_existing is not null then
    update public.payments set status = 'cancelled' where id = p_payment_id;
    return v_existing;
  end if;
  if v_payment.status <> 'settled' then raise exception 'payment_not_settled'; end if;

  select * into v_entry
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;
  if v_entry is null then raise exception 'original_entry_not_found: %', p_payment_id; end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  v_reversal_id := public.post_reversal_entry(
    v_company_id,
    'PaymentReversal',
    p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text,
    v_reversal_lines,
    v_entry.id
  );
  update public.payments set status = 'cancelled' where id = p_payment_id;
  return v_reversal_id;
end;
$$;

revoke execute on function public.post_payment_reversal(uuid) from anon, public;
grant execute on function public.post_payment_reversal(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- 4. Product limits. Restocking and purchase drafts must never be blocked at
-- the limit. New/activated variants are the only operations that consume it;
-- a company-row lock makes multi-variant and concurrent additions atomic.
-- -------------------------------------------------------------------------
create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  if p_company_id is distinct from public.current_company_id()
     and not public.is_platform_admin() then raise exception 'not_authorized'; end if;
  select * into v_company from public.companies where id = p_company_id;
  if v_company is null then raise exception 'company_not_found: %', p_company_id; end if;
  if v_company.status <> 'approved' then
    raise exception 'company_unavailable: %', v_company.status;
  end if;
  if v_company.subscription_exempt_until is not null
     and v_company.subscription_exempt_until > v_now then return; end if;
  if v_company.subscription_status not in ('trial', 'active') then
    if not (v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;
  if p_check is null or p_check = 'product' then return; end if;

  select t.limits into v_limits from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;
  if v_limits is null then return; end if;
  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= (v_limits ->> 'maxOrdersPerMonth')::int then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_limits ->> 'maxOrdersPerMonth';
  end if;
  if p_check = 'team' and (v_limits ->> 'maxAdmins') is not null
     and (select count(*) from public.company_memberships m
       where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= (v_limits ->> 'maxAdmins')::int then
    raise exception 'limit_reached: team member limit (%); upgrade your plan',
      v_limits ->> 'maxAdmins';
  end if;
end;
$$;

create or replace function public.enforce_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_used int;
begin
  if current_setting('app.bypass_business_limits', true) = 'on' then return new; end if;
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active then return new; end if;

  perform 1 from public.companies c where c.id = new.company_id for update;
  select (t.limits ->> 'maxProducts')::int into v_limit
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = new.company_id
    and not (c.subscription_exempt_until is not null and c.subscription_exempt_until > now());
  if v_limit is null then return new; end if;

  select count(*)::int into v_used
  from public.product_variants v
  where v.company_id = new.company_id and v.active;
  if v_used >= v_limit then
    raise exception 'limit_reached: product limit (%); upgrade your plan', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_enforce_limit on public.product_variants;
create trigger product_variants_enforce_limit
before insert or update of active on public.product_variants
for each row execute function public.enforce_product_limit();

revoke execute on function public.enforce_product_limit() from authenticated, anon, public;

-- -------------------------------------------------------------------------
-- 5. SMS quota: reset at the calendar-month boundary and reserve capacity
-- atomically when queueing. This prevents a large batch from passing before
-- delivery-time metering catches up. Pending rows are reserved on upgrade.
-- -------------------------------------------------------------------------
update public.companies c
set sms_used_this_period = case
      when c.sms_period_end is null or c.sms_period_end <= now()
        then pending.pending_count
      else c.sms_used_this_period + pending.pending_count
    end,
    sms_period_end = case
      when c.sms_period_end is null or c.sms_period_end <= now()
        then (date_trunc('month', now() at time zone 'Africa/Nairobi') + interval '1 month')
             at time zone 'Africa/Nairobi'
      else c.sms_period_end
    end
from (
  select o.company_id, count(*)::int as pending_count
  from public.outbox o where o.channel = 'sms' and o.status = 'pending'
  group by o.company_id
) pending
where c.id = pending.company_id;

create or replace function public.queue_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_scheduled timestamptz := now();
  v_eat_hour int;
  v_limit int;
  v_used int;
  v_period_end timestamptz;
begin
  if p_channel = 'whatsapp' then
    v_eat_hour := extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_eat_hour >= 19 or v_eat_hour < 8 then
      v_scheduled := ((v_scheduled at time zone 'Africa/Nairobi')::date
        + case when v_eat_hour >= 19 then interval '1 day' else interval '0' end
        + interval '8 hours') at time zone 'Africa/Nairobi';
    end if;
  end if;

  if p_channel = 'sms' then
    select (t.limits ->> 'smsPerPeriod')::int,
           c.sms_used_this_period,
           c.sms_period_end
      into v_limit, v_used, v_period_end
    from public.companies c
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.id = p_company_id
    for update of c;
    if not found then raise exception 'company_not_found: %', p_company_id; end if;

    if v_period_end is null or v_period_end <= now() then
      v_used := 0;
      v_period_end := (date_trunc('month', now() at time zone 'Africa/Nairobi')
        + interval '1 month') at time zone 'Africa/Nairobi';
      update public.companies
      set sms_used_this_period = 0, sms_period_end = v_period_end
      where id = p_company_id;
    end if;
    if v_limit is not null and coalesce(v_used, 0) >= v_limit then
      raise exception 'sms_limit_reached: % of % used this period', v_used, v_limit;
    end if;
    update public.companies
    set sms_used_this_period = sms_used_this_period + 1
    where id = p_company_id;
  end if;

  insert into public.outbox (company_id, channel, recipient, subject, body, scheduled_after)
  values (p_company_id, p_channel, p_recipient, p_subject, p_body, v_scheduled)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.queue_message(uuid, text, text, text, text)
  from authenticated, anon, public;
grant execute on function public.queue_message(uuid, text, text, text, text) to service_role;

-- Compatibility for an old edge worker during a rolling deploy. Quota is now
-- reserved by queue_message; delivery must not increment it a second time.
create or replace function public.increment_sms_usage(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$ begin return; end $$;

revoke execute on function public.increment_sms_usage(uuid) from authenticated, anon, public;
grant execute on function public.increment_sms_usage(uuid) to service_role;

-- Catalog cache stock hydration follows inventory changes in realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_batches'
  ) then
    alter publication supabase_realtime add table public.inventory_batches;
  end if;
end $$;
