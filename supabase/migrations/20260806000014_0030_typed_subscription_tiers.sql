-- Subscription tiers are a fixed product contract, not user-defined metadata.
-- Store capabilities and quotas as typed columns so invalid or misspelled
-- entitlement keys cannot enter the system. Trial is a lifecycle status over
-- Standard, not a separate capability tier.

alter table public.subscription_tiers
  add column multiple_locations_enabled boolean not null default false,
  add column staff_performance_enabled boolean not null default false,
  add column commissions_available boolean not null default false,
  add column max_team_members integer check (max_team_members is null or max_team_members >= 0),
  add column max_products integer check (max_products is null or max_products >= 0),
  add column max_stock_locations integer check (max_stock_locations is null or max_stock_locations >= 0),
  add column max_orders_per_month integer check (max_orders_per_month is null or max_orders_per_month >= 0),
  add column sms_per_period integer check (sms_per_period is null or sms_per_period >= 0),
  add constraint subscription_tiers_locations_consistent check (
    multiple_locations_enabled or coalesce(max_stock_locations, 1) <= 1
  );

update public.subscription_tiers
set multiple_locations_enabled = coalesce((features ->> 'multipleLocations')::boolean, false),
    staff_performance_enabled = coalesce((features ->> 'staffPerformance')::boolean, false),
    commissions_available = coalesce((features ->> 'commissions')::boolean, false),
    max_team_members = (limits ->> 'maxAdmins')::integer,
    max_products = (limits ->> 'maxProducts')::integer,
    max_stock_locations = (limits ->> 'maxStockLocations')::integer,
    max_orders_per_month = (limits ->> 'maxOrdersPerMonth')::integer,
    sms_per_period = (limits ->> 'smsPerPeriod')::integer;

do $$
declare
  v_standard_id uuid;
begin
  select id into v_standard_id from public.subscription_tiers where code = 'standard';
  if exists (select 1 from public.companies) and v_standard_id is null then
    raise exception 'standard subscription tier is required';
  end if;
  update public.companies
  set subscription_tier_id = v_standard_id, updated_at = now()
  where subscription_tier_id in (
    select id from public.subscription_tiers where code = 'trial'
  );
end;
$$;

delete from public.subscription_tiers where code = 'trial';

alter table public.subscription_tiers
  drop column features,
  drop column limits;

-- Provisioning now creates a Standard-tier trial.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.provision_company(text,text,text,text,text)'::regprocedure)
    into v_definition;
  if position('code = ''trial''' in v_definition) = 0 then
    raise exception 'Could not update provision_company to Standard trial';
  end if;
  execute replace(v_definition, 'code = ''trial''', 'code = ''standard''');
end;
$$;

create or replace function public.feature_enabled(p_company_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_feature
    when 'multipleLocations' then t.multiple_locations_enabled
    when 'staffPerformance' then t.staff_performance_enabled
    when 'commissions' then t.commissions_available
    else false
  end
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id
$$;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', jsonb_build_object(
      'multipleLocations', coalesce(t.multiple_locations_enabled, false),
      'staffPerformance', coalesce(t.staff_performance_enabled, false),
      'commissions', coalesce(t.commissions_available, false)
    ),
    'settings', jsonb_build_object('commissionsEnabled', c.commissions_enabled),
    'limits', jsonb_strip_nulls(jsonb_build_object(
      'maxTeamMembers', t.max_team_members,
      'maxProducts', t.max_products,
      'maxStockLocations', t.max_stock_locations,
      'maxOrdersPerMonth', t.max_orders_per_month,
      'smsPerPeriod', t.sms_per_period
    )),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id and l.is_active),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  return v_result;
end;
$$;

create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_now timestamptz := now();
begin
  if p_company_id is distinct from public.current_company_id()
     and not public.is_platform_admin() then raise exception 'not_authorized'; end if;
  select c.*, t.max_team_members, t.max_orders_per_month
    into v_company
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id;
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
  if p_check = 'order' and v_company.max_orders_per_month is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= v_company.max_orders_per_month then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_company.max_orders_per_month;
  end if;
  if p_check = 'team' and v_company.max_team_members is not null
     and (select count(*) from public.company_memberships m
       where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= v_company.max_team_members then
    raise exception 'limit_reached: team member limit (%); upgrade your plan',
      v_company.max_team_members;
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
  select t.max_products into v_limit
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

create or replace function public.create_stock_location(
  p_code text,
  p_name text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_count int;
  v_limit int;
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  perform public.assert_entitled(v_company_id, null);
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;
  perform 1 from public.companies where id = v_company_id for update;
  select count(*) into v_count from public.stock_locations where company_id = v_company_id;
  if v_count > 0 and not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;
  select t.max_stock_locations into v_limit
  from public.companies c left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'limit_reached: stock location limit (%); upgrade your plan', v_limit;
  end if;
  if p_is_default or v_count = 0 then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;
  insert into public.stock_locations (company_id, code, name, is_default)
  values (v_company_id, v_code, trim(p_name), p_is_default or v_count = 0)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

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
    select t.sms_per_period, c.sms_used_this_period, c.sms_period_end
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

drop function public.platform_upsert_tier(text, text, bigint, bigint, jsonb, jsonb, uuid, boolean);

create function public.platform_upsert_tier(
  p_code text,
  p_name text,
  p_price_monthly bigint,
  p_price_yearly bigint,
  p_multiple_locations_enabled boolean,
  p_staff_performance_enabled boolean,
  p_commissions_available boolean,
  p_max_team_members integer default null,
  p_max_products integer default null,
  p_max_stock_locations integer default null,
  p_max_orders_per_month integer default null,
  p_sms_per_period integer default null,
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
  if p_multiple_locations_enabled = false and coalesce(p_max_stock_locations, 1) > 1 then
    raise exception 'invalid_tier: multiple locations must be enabled when location limit exceeds one';
  end if;
  if p_tier_id is not null then
    update public.subscription_tiers
    set name = p_name,
        price_monthly = p_price_monthly,
        price_yearly = p_price_yearly,
        multiple_locations_enabled = p_multiple_locations_enabled,
        staff_performance_enabled = p_staff_performance_enabled,
        commissions_available = p_commissions_available,
        max_team_members = p_max_team_members,
        max_products = p_max_products,
        max_stock_locations = p_max_stock_locations,
        max_orders_per_month = p_max_orders_per_month,
        sms_per_period = p_sms_per_period,
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_tier_id
    returning id into v_id;
    if v_id is null then raise exception 'tier_not_found: %', p_tier_id; end if;
  else
    insert into public.subscription_tiers (
      code, name, price_monthly, price_yearly,
      multiple_locations_enabled, staff_performance_enabled, commissions_available,
      max_team_members, max_products, max_stock_locations, max_orders_per_month, sms_per_period
    ) values (
      p_code, p_name, p_price_monthly, p_price_yearly,
      p_multiple_locations_enabled, p_staff_performance_enabled, p_commissions_available,
      p_max_team_members, p_max_products, p_max_stock_locations, p_max_orders_per_month, p_sms_per_period
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.platform_upsert_tier(
  text, text, bigint, bigint, boolean, boolean, boolean,
  integer, integer, integer, integer, integer, uuid, boolean
) from anon, authenticated, public;
grant execute on function public.platform_upsert_tier(
  text, text, bigint, bigint, boolean, boolean, boolean,
  integer, integer, integer, integer, integer, uuid, boolean
) to service_role;
