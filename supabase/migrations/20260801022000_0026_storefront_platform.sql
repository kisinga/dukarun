-- 0026_storefront_platform.sql
-- Phase 7 backend: public storefront read surface (anon) + platform
-- (super-admin) RPCs.

-- ---------------------------------------------------------------------------
-- Storefront visibility rule (old storefront-public.resolver.ts):
-- public when approved + opted in; CATALOGUE only while subscription is
-- active/trial/in-grace/exempt (identity stays visible when lapsed).
-- ---------------------------------------------------------------------------
create or replace function public.storefront_catalogue_visible(c public.companies)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'approved'
    and c.public_storefront_enabled
    and (
      c.subscription_status in ('trial', 'active')
      or (c.subscription_status = 'expired'
          and c.subscription_grace_period_end is not null
          and c.subscription_grace_period_end > now())
      or (c.subscription_exempt_until is not null and c.subscription_exempt_until > now())
    )
$$;

-- Public storefront directory (anon).
create view public.public_storefronts as
select
  id,
  name,
  public_slug as slug,
  logo_path,
  public_whatsapp_number,
  public.storefront_catalogue_visible(c) as catalogue_visible
from public.companies c
where c.status = 'approved' and c.public_storefront_enabled;

grant select on public.public_storefronts to anon, authenticated;

-- Public catalog for a slug (anon). Products only when catalogue_visible.
create or replace function public.storefront_catalog(p_slug text)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
$$;

revoke execute on function public.storefront_catalog(text) from public;
grant execute on function public.storefront_catalog(text) to anon, authenticated;

-- Public collections for a slug.
create or replace function public.storefront_collections(p_slug text)
returns setof public.collections
language sql
stable
security definer
set search_path = ''
as $$
  select col.*
  from public.collections col
  join public.companies c on c.id = col.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and col.active
$$;

revoke execute on function public.storefront_collections(text) from public;
grant execute on function public.storefront_collections(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform (super-admin) RPCs. All gated on is_platform_admin().
-- ---------------------------------------------------------------------------
create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;
end;
$$;

revoke execute on function public.assert_platform_admin() from authenticated, anon, public;
grant execute on function public.assert_platform_admin() to authenticated, service_role;

-- Company lifecycle: approve / disable / ban.
create or replace function public.platform_set_company_status(p_company_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  if p_status not in ('unapproved', 'approved', 'disabled', 'banned') then
    raise exception 'invalid_status';
  end if;

  update public.companies
  set status = p_status, updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Subscription override: tier, exemption, grace extension.
create or replace function public.platform_update_subscription(
  p_company_id uuid,
  p_tier_id uuid default null,
  p_subscription_status text default null,
  p_exempt_until timestamptz default null,
  p_exempt_reason text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  update public.companies
  set subscription_tier_id = coalesce(p_tier_id, subscription_tier_id),
      subscription_status = coalesce(p_subscription_status, subscription_status),
      subscription_exempt_until = coalesce(p_exempt_until, subscription_exempt_until),
      subscription_exempt_reason = coalesce(p_exempt_reason, subscription_exempt_reason),
      subscription_expires_at = coalesce(p_expires_at, subscription_expires_at),
      updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Tier management.
create or replace function public.platform_upsert_tier(
  p_code text,
  p_name text,
  p_price_monthly bigint,
  p_price_yearly bigint,
  p_limits jsonb default '{}',
  p_features jsonb default '{}',
  p_tier_id uuid default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.assert_platform_admin();

  if p_tier_id is not null then
    update public.subscription_tiers
    set code = coalesce(p_code, code),
        name = coalesce(p_name, name),
        price_monthly = coalesce(p_price_monthly, price_monthly),
        price_yearly = coalesce(p_price_yearly, price_yearly),
        limits = coalesce(p_limits, limits),
        features = coalesce(p_features, features),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_tier_id
    returning id into v_id;

    if v_id is null then
      raise exception 'tier_not_found: %', p_tier_id;
    end if;
  else
    insert into public.subscription_tiers (code, name, price_monthly, price_yearly, limits, features)
    values (p_code, p_name, p_price_monthly, p_price_yearly, coalesce(p_limits, '{}'), coalesce(p_features, '{}'))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Platform stats (dashboard).
create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_approved', (select count(*) from public.companies where status = 'approved'),
    'companies_pending', (select count(*) from public.companies where status = 'unapproved'),
    'subscriptions_active', (select count(*) from public.companies where subscription_status = 'active'),
    'subscriptions_trial', (select count(*) from public.companies where subscription_status = 'trial'),
    'subscriptions_expired', (select count(*) from public.companies where subscription_status = 'expired'),
    'orders_today', (
      select count(*) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'mrr_estimate', (
      select coalesce(sum(case when c.billing_cycle = 'yearly' then t.price_yearly / 12 else t.price_monthly end), 0)
      from public.companies c join public.subscription_tiers t on t.id = c.subscription_tier_id
      where c.subscription_status = 'active'
    )
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'platform_set_company_status(uuid, text)',
    'platform_update_subscription(uuid, uuid, text, timestamptz, text, timestamptz)',
    'platform_upsert_tier(text, text, bigint, bigint, jsonb, jsonb, uuid, boolean)',
    'platform_stats()'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
