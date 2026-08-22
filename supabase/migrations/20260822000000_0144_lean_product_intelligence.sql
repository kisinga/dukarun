-- Lean product intelligence: actionable dashboard signals.

alter table public.dashboard_snapshot_cache
  add column catalog_sequence bigint not null default 0;

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
  v_catalog_sequence bigint := 0;
  v_low_stock_threshold numeric := 0;
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

  select company.business_timezone, company.low_stock_threshold
  into v_timezone, v_low_stock_threshold
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
    coalesce(max(head_sequence) filter (where stream = 'settings'), 0),
    coalesce(max(head_sequence) filter (where stream = 'catalog'), 0)
  into v_sales_sequence, v_settings_sequence, v_catalog_sequence
  from public.cache_stream_heads
  where company_id = v_company_id
    and stream in ('sales', 'settings', 'catalog');

  select * into v_cached
  from public.dashboard_snapshot_cache cache
  where cache.company_id = v_company_id
    and cache.scope_key = v_scope_key
    and cache.range_days = v_days;

  if found
    and v_cached.as_of_date = v_today
    and v_cached.sales_sequence = v_sales_sequence
    and v_cached.settings_sequence = v_settings_sequence
    and v_cached.catalog_sequence = v_catalog_sequence then
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
      and v_cached.settings_sequence = v_settings_sequence
      and v_cached.catalog_sequence = v_catalog_sequence then
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
  ), variant_totals as materialized (
    select line.variant_id,
      coalesce(sum(line.quantity), 0) as quantity,
      coalesce(sum(line.line_total), 0)::bigint as revenue,
      coalesce(sum(round(
        orders.cogs_total * line.line_total::numeric / nullif(orders.total, 0)
      )), 0)::bigint as cogs
    from current_orders orders
    join public.order_lines line on line.order_id = orders.id
    group by line.variant_id
  ), tracked_variant_totals as materialized (
    select totals.*
    from variant_totals totals
    join public.product_variants variant
      on variant.id = totals.variant_id and variant.company_id = v_company_id
    join public.products product
      on product.id = variant.product_id and product.company_id = v_company_id
    where variant.track_inventory and variant.kind <> 'service'
      and variant.active and product.active
  ), scoped_stock as materialized (
    select batch.variant_id, coalesce(sum(batch.remaining), 0)::numeric as stock
    from public.inventory_batches batch
    where batch.company_id = v_company_id
      and batch.stock_location_id = any(v_location_ids)
      and batch.remaining > 0
    group by batch.variant_id
  ), top_variants as (
    select variant_id, quantity, revenue, cogs, (revenue - cogs)::bigint as margin
    from variant_totals
    order by (revenue - cogs) desc, revenue desc, variant_id
    limit 5
  ), fast_variants as (
    select variant_id, quantity, revenue, cogs, (revenue - cogs)::bigint as margin
    from tracked_variant_totals
    order by quantity desc, revenue desc, variant_id
    limit 5
  ), restock_risks as (
    select totals.variant_id, totals.quantity,
      coalesce(stock.stock, 0)::numeric as stock,
      v_low_stock_threshold as low_stock_threshold
    from tracked_variant_totals totals
    left join scoped_stock stock on stock.variant_id = totals.variant_id
    where totals.quantity > 0
      and coalesce(stock.stock, 0) <= v_low_stock_threshold
    order by totals.quantity desc, totals.revenue desc, totals.variant_id
    limit 3
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
    'productSignals', jsonb_build_object(
      'restockRisks', coalesce((select jsonb_agg(to_jsonb(row) order by row.quantity desc) from restock_risks row), '[]'::jsonb),
      'fastVariants', coalesce((select jsonb_agg(to_jsonb(row) order by row.quantity desc, row.revenue desc) from fast_variants row), '[]'::jsonb)
    ),
    'locations', coalesce((select jsonb_agg(to_jsonb(row) order by row.revenue desc, row.location_name) from locations row), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(row) from comparison row), '{}'::jsonb)
  ) into v_result;

  insert into public.dashboard_snapshot_cache(
    company_id, scope_key, range_days, as_of_date, sales_sequence,
    settings_sequence, catalog_sequence, snapshot, computed_at
  ) values (
    v_company_id, v_scope_key, v_days, v_today, v_sales_sequence,
    v_settings_sequence, v_catalog_sequence, v_result, clock_timestamp()
  )
  on conflict (company_id, scope_key, range_days) do update
  set as_of_date = excluded.as_of_date,
      sales_sequence = excluded.sales_sequence,
      settings_sequence = excluded.settings_sequence,
      catalog_sequence = excluded.catalog_sequence,
      snapshot = excluded.snapshot,
      computed_at = excluded.computed_at;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date,uuid) from public, anon;
grant execute on function public.dashboard_location_snapshot(date,uuid) to authenticated;

comment on function public.dashboard_location_snapshot(date,uuid) is
  'Returns compact live stats and product signals. Sales, settings, and catalog changes invalidate the lazy location-scoped cache.';
