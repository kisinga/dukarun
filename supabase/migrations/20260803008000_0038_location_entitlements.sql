-- Central entitlement read model plus gated stock-location management.

alter table public.stock_locations
  add column if not exists is_default boolean not null default false;

with ranked as (
  select id, row_number() over (partition by company_id order by created_at, id) as position
  from public.stock_locations
)
update public.stock_locations l
set is_default = true
from ranked r
where r.id = l.id and r.position = 1
  and not exists (
    select 1 from public.stock_locations existing
    where existing.company_id = l.company_id and existing.is_default
  );

create unique index if not exists stock_locations_one_default_idx
  on public.stock_locations (company_id) where is_default;

update public.subscription_tiers
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'multipleLocations', case
    when features ? 'multipleLocations' then (features ->> 'multipleLocations')::boolean
    else coalesce((limits ->> 'maxStockLocations')::int, 1) > 1
  end
);

create or replace function public.feature_enabled(p_company_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.features ? p_feature then coalesce((t.features ->> p_feature)::boolean, false)
    when p_feature = 'multipleLocations'
      then coalesce((t.limits ->> 'maxStockLocations')::int, 1) > 1
    else false
  end
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id
$$;

revoke execute on function public.feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.feature_enabled(uuid, text) to service_role;

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
    'features', coalesce(t.features, '{}'::jsonb),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id),
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

revoke execute on function public.current_entitlements() from public, anon;
grant execute on function public.current_entitlements() to authenticated, service_role;

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

  select nullif(t.limits ->> 'maxStockLocations', '')::int into v_limit
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

create or replace function public.update_stock_location(
  p_location_id uuid,
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
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = v_company_id)
    then raise exception 'stock_location_not_found: %', p_location_id; end if;

  if p_is_default then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;
  update public.stock_locations
  set code = v_code, name = trim(p_name), is_default = is_default or p_is_default, updated_at = now()
  where id = p_location_id and company_id = v_company_id;
  return p_location_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

create or replace function public.delete_stock_location(p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location public.stock_locations%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  select * into v_location from public.stock_locations
  where id = p_location_id and company_id = v_company_id for update;
  if v_location.id is null then raise exception 'stock_location_not_found: %', p_location_id; end if;
  if v_location.is_default then raise exception 'default_location_cannot_be_deleted'; end if;
  if exists (select 1 from public.inventory_batches where stock_location_id = p_location_id)
     or exists (select 1 from public.purchases where stock_location_id = p_location_id) then
    raise exception 'location_in_use: move or retain its stock history';
  end if;

  delete from public.stock_locations where id = p_location_id and company_id = v_company_id;
  return p_location_id;
end;
$$;

revoke execute on function public.create_stock_location(text, text, boolean) from public, anon;
revoke execute on function public.update_stock_location(uuid, text, text, boolean) from public, anon;
revoke execute on function public.delete_stock_location(uuid) from public, anon;
grant execute on function public.create_stock_location(text, text, boolean) to authenticated, service_role;
grant execute on function public.update_stock_location(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.delete_stock_location(uuid) to authenticated, service_role;

