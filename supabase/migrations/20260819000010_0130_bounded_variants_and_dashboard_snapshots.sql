-- Bound product detail and make live dashboard work shared, compact and lazy.
-- Dashboard snapshots are computed only when viewed. A changed snapshot may be
-- served for at most 60 seconds; one caller recomputes it while concurrent
-- callers reuse the previous value.

-- ---------------------------------------------------------------------------
-- A product is a useful category only while its active variant set stays small.
-- Enforce this once at the table boundary so RPCs, imports and future writers
-- all behave the same way. Product-scoped transaction locks serialize the
-- count without adding a second counter that could drift.
-- ---------------------------------------------------------------------------
do $$
declare
  v_oversized text;
begin
  select string_agg(format('%s=%s', product_id, variant_count), ', ' order by product_id)
  into v_oversized
  from (
    select product_id, count(*)::integer as variant_count
    from public.product_variants
    where active
    group by product_id
    having count(*) > 16
  ) oversized;

  if v_oversized is not null then
    raise exception 'active_variant_limit_preflight: products above 16 active variants: %',
      v_oversized;
  end if;
end;
$$;

create or replace function public.enforce_product_active_variant_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_first_product uuid;
  v_second_product uuid;
  v_active_count integer;
begin
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    v_first_product := least(old.product_id, new.product_id);
    v_second_product := greatest(old.product_id, new.product_id);
    perform pg_advisory_xact_lock(hashtextextended(v_first_product::text, 16));
    perform pg_advisory_xact_lock(hashtextextended(v_second_product::text, 16));
  else
    perform pg_advisory_xact_lock(hashtextextended(new.product_id::text, 16));
  end if;

  if new.active and (
    tg_op = 'INSERT'
    or not old.active
    or old.product_id is distinct from new.product_id
  ) then
    select count(*)::integer into v_active_count
    from public.product_variants variant
    where variant.product_id = new.product_id
      and variant.active
      and variant.id is distinct from new.id;

    if v_active_count >= 16 then
      raise exception 'active_variant_limit_exceeded: maximum 16 active variants per product';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists product_variants_enforce_active_limit on public.product_variants;
create trigger product_variants_enforce_active_limit
before insert or update of product_id, active on public.product_variants
for each row execute function public.enforce_product_active_variant_limit();

revoke execute on function public.enforce_product_active_variant_limit()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared lazy dashboard snapshots. scope_key is derived from the complete set
-- of locations the caller may see, so staff with different access never share
-- a snapshot. No scheduled job scans idle companies.
-- ---------------------------------------------------------------------------
create table public.dashboard_snapshot_cache (
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_key text not null,
  range_days smallint not null check (range_days between 1 and 7),
  as_of_date date not null,
  sales_sequence bigint not null default 0,
  settings_sequence bigint not null default 0,
  snapshot jsonb not null,
  computed_at timestamptz not null default clock_timestamp(),
  primary key (company_id, scope_key, range_days)
);

alter table public.dashboard_snapshot_cache enable row level security;
grant all on public.dashboard_snapshot_cache to service_role;
revoke all on public.dashboard_snapshot_cache from public, anon, authenticated;

comment on table public.dashboard_snapshot_cache is
  'Demand-driven operational dashboard snapshots, bounded to seven rolling ranges per access scope. Never refresh globally: dashboard_location_snapshot owns lazy recomputation.';

create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_timezone text;
  v_today date;
  v_since date;
  v_days integer;
  v_previous_start timestamptz;
  v_end timestamptz;
  v_location_ids uuid[];
  v_scope_key text;
  v_sales_sequence bigint := 0;
  v_settings_sequence bigint := 0;
  v_cached public.dashboard_snapshot_cache%rowtype;
  v_has_lock boolean;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if p_location_id is not null and not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;

  select company.business_timezone into v_timezone
  from public.companies company where company.id = v_company_id;
  v_today := (now() at time zone v_timezone)::date;
  v_since := coalesce(p_since, v_today - 6);
  if v_since < v_today - 6 or v_since > v_today then
    raise exception 'invalid_dashboard_range: dashboard supports at most 7 days';
  end if;
  v_days := greatest((v_today - v_since) + 1, 1);

  if p_location_id is null then
    select coalesce(array_agg(location.id order by location.id), '{}'::uuid[])
    into v_location_ids
    from public.accessible_business_locations() location;
  else
    v_location_ids := array[p_location_id];
  end if;
  v_scope_key := encode(
    extensions.digest(convert_to(array_to_string(v_location_ids, ','), 'UTF8'), 'sha256'),
    'hex'
  );

  select
    coalesce(max(head_sequence) filter (where stream = 'sales'), 0),
    coalesce(max(head_sequence) filter (where stream = 'settings'), 0)
  into v_sales_sequence, v_settings_sequence
  from public.cache_stream_heads
  where company_id = v_company_id
    and stream in ('sales', 'settings');

  select * into v_cached
  from public.dashboard_snapshot_cache cache
  where cache.company_id = v_company_id
    and cache.scope_key = v_scope_key
    and cache.range_days = v_days;

  if found
    and v_cached.as_of_date = v_today
    and v_cached.sales_sequence = v_sales_sequence
    and v_cached.settings_sequence = v_settings_sequence then
    return v_cached.snapshot;
  end if;
  if found and v_cached.computed_at > clock_timestamp() - interval '60 seconds' then
    return v_cached.snapshot || jsonb_build_object(
      'refreshAfter', v_cached.computed_at + interval '60 seconds'
    );
  end if;

  v_has_lock := pg_try_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || v_scope_key || ':' || v_since::text, 60)
  );
  if not v_has_lock and v_cached.snapshot is not null then
    return v_cached.snapshot || jsonb_build_object(
      'refreshAfter', clock_timestamp() + interval '2 seconds'
    );
  end if;
  if not v_has_lock then
    perform pg_advisory_xact_lock(
      hashtextextended(v_company_id::text || ':' || v_scope_key || ':' || v_since::text, 60)
    );
    select * into v_cached
    from public.dashboard_snapshot_cache cache
    where cache.company_id = v_company_id
      and cache.scope_key = v_scope_key
      and cache.range_days = v_days;
    if found
      and v_cached.as_of_date = v_today
      and v_cached.sales_sequence = v_sales_sequence
      and v_cached.settings_sequence = v_settings_sequence then
      return v_cached.snapshot;
    end if;
  end if;

  v_previous_start := ((v_since - v_days)::timestamp at time zone v_timezone);
  v_end := ((v_today + 1)::timestamp at time zone v_timezone);

  with scoped_orders as materialized (
    select
      orders.id,
      orders.location_id,
      orders.total,
      orders.cogs_total,
      orders.quantity_total,
      (orders.completed_at at time zone v_timezone)::date as day
    from public.orders orders
    where orders.company_id = v_company_id
      and orders.status = 'completed'
      and orders.completed_at >= v_previous_start
      and orders.completed_at < v_end
      and orders.location_id = any(v_location_ids)
  ), current_orders as materialized (
    select * from scoped_orders where day >= v_since
  ), summary as (
    select day, count(*)::integer as orders,
      coalesce(sum(total), 0)::bigint as revenue,
      coalesce(sum(cogs_total), 0)::bigint as cogs,
      (coalesce(sum(total), 0) - coalesce(sum(cogs_total), 0))::bigint as margin,
      coalesce(sum(quantity_total), 0) as quantity
    from current_orders
    group by day
  ), variant_totals as (
    select line.variant_id,
      coalesce(sum(line.quantity), 0) as quantity,
      coalesce(sum(line.line_total), 0)::bigint as revenue,
      coalesce(sum(round(
        orders.cogs_total * line.line_total::numeric / nullif(orders.total, 0)
      )), 0)::bigint as cogs
    from current_orders orders
    join public.order_lines line on line.order_id = orders.id
    group by line.variant_id
  ), top_variants as (
    select variant_id, quantity, revenue, cogs, (revenue - cogs)::bigint as margin
    from variant_totals
    order by (revenue - cogs) desc, revenue desc, variant_id
    limit 5
  ), locations as (
    select location.id as location_id, location.name as location_name,
      count(orders.id)::integer as orders,
      coalesce(sum(orders.total), 0)::bigint as revenue,
      coalesce(sum(orders.quantity_total), 0) as quantity,
      coalesce(sum(orders.cogs_total), 0)::bigint as cogs,
      (coalesce(sum(orders.total), 0) - coalesce(sum(orders.cogs_total), 0))::bigint as margin
    from public.stock_locations location
    left join current_orders orders on orders.location_id = location.id
    where location.company_id = v_company_id
      and location.is_active
      and location.id = any(v_location_ids)
    group by location.id, location.name
  ), comparison as (
    select
      coalesce(sum(total) filter (where day >= v_since), 0)::bigint as current_revenue,
      coalesce(sum(quantity_total) filter (where day >= v_since), 0) as current_quantity,
      count(*) filter (where day >= v_since)::integer as current_orders,
      coalesce(sum(total) filter (where day < v_since), 0)::bigint as previous_revenue,
      coalesce(sum(quantity_total) filter (where day < v_since), 0) as previous_quantity,
      count(*) filter (where day < v_since)::integer as previous_orders
    from scoped_orders
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(row) order by row.day) from summary row), '[]'::jsonb),
    'topVariants', coalesce((select jsonb_agg(to_jsonb(row) order by row.margin desc, row.revenue desc) from top_variants row), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(row) order by row.revenue desc, row.location_name) from locations row), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(row) from comparison row), '{}'::jsonb)
  ) into v_result;

  insert into public.dashboard_snapshot_cache(
    company_id, scope_key, range_days, as_of_date, sales_sequence,
    settings_sequence, snapshot, computed_at
  ) values (
    v_company_id, v_scope_key, v_days, v_today, v_sales_sequence,
    v_settings_sequence, v_result, clock_timestamp()
  )
  on conflict (company_id, scope_key, range_days) do update
  set as_of_date = excluded.as_of_date,
      sales_sequence = excluded.sales_sequence,
      settings_sequence = excluded.settings_sequence,
      snapshot = excluded.snapshot,
      computed_at = excluded.computed_at;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date,uuid) from public, anon;
grant execute on function public.dashboard_location_snapshot(date,uuid) to authenticated;

comment on function public.dashboard_location_snapshot(date,uuid) is
  'Returns compact live stats. Reuses an unchanged snapshot indefinitely; after changes, serves it for at most 60 seconds and lazily recomputes once per permission-safe location scope.';
