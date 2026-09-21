-- Keep accounting analytics in stock units and documents in the purchased/sold unit.

-- Reuse the established public visibility boundary; never expose cost, wholesale or barcodes.
create or replace function public.storefront_product_units(p_slug text,p_product_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('stock_unit',v.stock_unit,'packs',
  (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,
    'units_per_pack',p.units_per_pack,'sale_price',p.sale_price,'active',true,
    'available',r.available and (not v.track_inventory or coalesce(s.stock,0)>=p.units_per_pack))
    order by p.units_per_pack,p.name),'[]'::jsonb)
   from public.variant_packs p where p.variant_id=v.id and p.active and p.sale_price is not null))), '[]'::jsonb)
from public.storefront_product(p_slug,p_product_id) r
join public.product_variants v on v.id=r.variant_id
left join public.variant_catalog s on s.variant_id=v.id
$$;
revoke all on function public.storefront_product_units(text,uuid) from public;
grant execute on function public.storefront_product_units(text,uuid) to anon,authenticated,service_role;


drop view public.rpt_daily_product_sales;
drop materialized view public.mv_daily_product_sales;
create materialized view public.mv_daily_product_sales as  SELECT o.company_id,
    (o.created_at AT TIME ZONE 'Africa/Nairobi'::text)::date AS day,
    l.variant_id,
    COALESCE(sum(l.stock_quantity), 0::numeric) AS quantity,
    COALESCE(sum(l.line_total), 0::numeric)::bigint AS revenue,
    COALESCE(sum(round(c.cogs * l.line_total::numeric / NULLIF(o.total, 0)::numeric)), 0::numeric)::bigint AS cogs
   FROM orders o
     JOIN order_lines l ON l.order_id = o.id
     LEFT JOIN LATERAL ( SELECT sum(jl.debit) AS cogs
           FROM ledger_journal_lines jl
             JOIN ledger_accounts a ON a.id = jl.account_id
          WHERE a.code::text = 'COGS'::text AND jl.order_id = o.id) c ON true
  WHERE o.status = 'completed'::text
  GROUP BY o.company_id, ((o.created_at AT TIME ZONE 'Africa/Nairobi'::text)::date), l.variant_id;;

CREATE UNIQUE INDEX mv_daily_product_sales_idx ON public.mv_daily_product_sales USING btree (company_id, day, variant_id);

revoke all on public.mv_daily_product_sales from public,anon,authenticated;

drop materialized view public.mv_daily_location_product_sales;
create materialized view public.mv_daily_location_product_sales as  SELECT orders.company_id,
    orders.location_id,
    (orders.completed_at AT TIME ZONE company.business_timezone)::date AS day,
    line.variant_id,
    COALESCE(sum(line.stock_quantity), 0::numeric) AS quantity,
    COALESCE(sum(line.line_total), 0::numeric)::bigint AS revenue,
    COALESCE(sum(line.cogs_total), 0::numeric)::bigint AS cogs
   FROM orders orders
     JOIN companies company ON company.id = orders.company_id
     JOIN order_lines line ON line.order_id = orders.id
  WHERE orders.status = 'completed'::text AND orders.completed_at IS NOT NULL AND orders.location_id IS NOT NULL
  GROUP BY orders.company_id, orders.location_id, ((orders.completed_at AT TIME ZONE company.business_timezone)::date), line.variant_id;;

CREATE UNIQUE INDEX mv_daily_location_product_sales_idx ON public.mv_daily_location_product_sales USING btree (company_id, location_id, day, variant_id);

CREATE INDEX mv_daily_location_product_sales_variant_day_idx ON public.mv_daily_location_product_sales USING btree (company_id, location_id, variant_id, day DESC);

revoke all on public.mv_daily_location_product_sales from public,anon,authenticated;

create or replace view public.supplier_variant_performance with (security_invoker=true) as  SELECT pl.company_id,
    p.supplier_id,
    pl.variant_id,
    count(DISTINCT pl.purchase_id) AS purchase_count,
    sum(pl.stock_quantity) AS total_quantity,
    sum(pl.line_total)::bigint AS total_spend,
    round(sum(pl.line_total) / NULLIF(sum(pl.stock_quantity), 0::numeric))::bigint AS average_unit_cost,
    min(round(pl.line_total / nullif(pl.stock_quantity, 0)))::bigint AS lowest_unit_cost,
    max(round(pl.line_total / nullif(pl.stock_quantity, 0)))::bigint AS highest_unit_cost,
    (array_agg(round(pl.line_total / nullif(pl.stock_quantity, 0))::bigint ORDER BY p.purchase_date DESC, p.created_at DESC, pl.created_at DESC))[1] AS last_unit_cost,
    max(p.purchase_date) AS last_purchase_date
   FROM purchase_lines pl
     JOIN purchases p ON p.id = pl.purchase_id AND p.company_id = pl.company_id
  WHERE p.status = 'posted'::text
  GROUP BY pl.company_id, p.supplier_id, pl.variant_id;;

CREATE OR REPLACE FUNCTION public.dashboard_sales_snapshot(p_since date DEFAULT (((now() AT TIME ZONE 'Africa/Nairobi'::text))::date - 6))
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_result jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  with completed_orders as (
    select
      o.id,
      o.company_id,
      (o.created_at at time zone 'Africa/Nairobi')::date as day,
      o.total
    from public.orders o
    where o.company_id = v_company_id
      and o.status = 'completed'
      and (o.created_at at time zone 'Africa/Nairobi')::date >= v_since
  ),
  order_costs as (
    select
      o.id,
      o.company_id,
      o.day,
      o.total,
      coalesce(sum(l.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs
    from completed_orders o
    left join public.ledger_journal_lines l
      on l.company_id = o.company_id and l.order_id = o.id
    left join public.ledger_accounts a
      on a.id = l.account_id and a.company_id = o.company_id
    group by o.id, o.company_id, o.day, o.total
  ),
  summary as (
    select
      company_id,
      day,
      count(*)::int as orders,
      coalesce(sum(total), 0)::bigint as revenue,
      coalesce(sum(cogs), 0)::bigint as cogs,
      (coalesce(sum(total), 0) - coalesce(sum(cogs), 0))::bigint as margin
    from order_costs
    group by company_id, day
  ),
  product_sales as (
    select
      o.company_id,
      o.day,
      l.variant_id,
      coalesce(sum(l.stock_quantity), 0) as quantity,
      coalesce(sum(l.line_total), 0)::bigint as revenue,
      coalesce(
        sum(round(o.cogs * l.line_total::numeric / nullif(o.total, 0))),
        0
      )::bigint as cogs
    from order_costs o
    join public.order_lines l on l.order_id = o.id and l.company_id = o.company_id
    group by o.company_id, o.day, l.variant_id
  )
  select jsonb_build_object(
    'summary', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.day) from summary s),
      '[]'::jsonb
    ),
    'productSales', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.dashboard_location_snapshot(p_since date DEFAULT (((now() AT TIME ZONE 'Africa/Nairobi'::text))::date - 6), p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      coalesce(sum(line.stock_quantity), 0) as quantity,
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
$function$
;


CREATE OR REPLACE FUNCTION public.staff_sales_daily(p_from date, p_to date, p_staff_user_id uuid)
 RETURNS TABLE(day date, transactions integer, gross_sales bigint, refunds bigint, voided_sales bigint, net_sales bigint, quantity numeric, collected bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ), completed as (
    select
      (o.completed_at at time zone 'Africa/Nairobi')::date as day,
      count(*)::int as transactions,
      sum(o.total)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.orders o
    left join lateral (
      select sum(l.stock_quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where o.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (o.completed_at at time zone 'Africa/Nairobi')::date
  ), refunded as (
    select (r.created_at at time zone 'Africa/Nairobi')::date as day,
      sum(r.amount)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id
    where r.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (r.created_at at time zone 'Africa/Nairobi')::date
  ), voided as (
    select (e.posted_at at time zone 'Africa/Nairobi')::date as day,
      sum(o.total)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.stock_quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and o.created_by is not distinct from p_staff_user_id
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (e.posted_at at time zone 'Africa/Nairobi')::date
  ), collection as (
    select c.occurred_on as day, sum(c.basis_amount)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    where c.staff_user_id is not distinct from p_staff_user_id
    group by c.occurred_on
  )
  select
    d.day,
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(r.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(r.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    coalesce(col.collected, 0)
  from days d
  left join completed c on c.day = d.day
  left join refunded r on r.day = d.day
  left join voided v on v.day = d.day
  left join collection col on col.day = d.day
  order by d.day;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.staff_sales_performance(p_from date, p_to date)
 RETURNS TABLE(staff_user_id uuid, display_name text, role_name text, authorization_status text, transactions integer, gross_sales bigint, refunds bigint, voided_sales bigint, net_sales bigint, quantity numeric, cogs bigint, margin bigint, collected bigint, credit_sales bigint, voids integer, average_sale bigint, held_count integer, held_value bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with completed as (
    select
      o.created_by as user_id,
      count(*)::int as transactions,
      coalesce(sum(o.total), 0)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs,
      coalesce(sum(o.total) filter (where o.is_credit_sale), 0)::bigint as credit_sales
    from public.orders o
    left join lateral (
      select sum(l.stock_quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.order_id = o.id
        and exists (
          select 1 from public.ledger_journal_entries e
          where e.id = l.entry_id and e.source_type = 'InventorySaleCogs'
        )
    ) cost on true
    where o.company_id = v_company_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), refunded as (
    select o.created_by as user_id, coalesce(sum(r.amount), 0)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id and o.company_id = r.company_id
    where r.company_id = v_company_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), voided as (
    select
      o.created_by as user_id,
      count(*)::int as voids,
      coalesce(sum(o.total), 0)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.stock_quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      join public.ledger_journal_entries ce on ce.id = l.entry_id
      where l.order_id = o.id and ce.source_type = 'InventorySaleCogs'
    ) cost on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), collection as (
    select c.staff_user_id as user_id, coalesce(sum(c.basis_amount), 0)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    group by c.staff_user_id
  ), held as (
    select
      o.created_by as user_id,
      count(*)::int as held_count,
      coalesce(sum(o.total), 0)::bigint as held_value
    from public.orders o
    where o.company_id = v_company_id
      and o.status = 'pending_payment'
      and (o.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), people as (
    select p.user_id from public.company_staff_profiles p where p.company_id = v_company_id
    union select c.user_id from completed c
    union select r.user_id from refunded r
    union select v.user_id from voided v
    union select c.user_id from collection c
    union select h.user_id from held h
  )
  select
    people.user_id,
    coalesce(p.display_name, 'Unassigned'),
    coalesce(r.name, p.last_role_name),
    coalesce(m.authorization_status, 'removed'),
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(f.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))::bigint,
    (
      coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0)
      - (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))
    )::bigint,
    coalesce(col.collected, 0),
    coalesce(c.credit_sales, 0),
    coalesce(v.voids, 0),
    case when coalesce(c.transactions, 0) - coalesce(v.voids, 0) <= 0 then 0
      else round(
        (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::numeric
        / (c.transactions - coalesce(v.voids, 0))
      )::bigint
    end,
    coalesce(h.held_count, 0),
    coalesce(h.held_value, 0)
  from people
  left join public.company_staff_profiles p
    on p.company_id = v_company_id and p.user_id is not distinct from people.user_id
  left join public.company_memberships m
    on m.company_id = v_company_id and m.user_id is not distinct from people.user_id
  left join public.roles r on r.id = m.role_id
  left join completed c on c.user_id is not distinct from people.user_id
  left join refunded f on f.user_id is not distinct from people.user_id
  left join voided v on v.user_id is not distinct from people.user_id
  left join collection col on col.user_id is not distinct from people.user_id
  left join held h on h.user_id is not distinct from people.user_id
  order by 9 desc, 2;
end;
$function$
;


create or replace function public.transaction_unit_suffix(p_name text,p_factor numeric,p_stock_unit text)
returns text language sql immutable set search_path='' as $$
select case when p_factor>1 then ' — '||p_name||' ('||trim(to_char(p_factor,'999999999990'))||' '||p_stock_unit||')'
 when p_stock_unit<>'item' then ' — '||p_stock_unit else '' end
$$;
revoke all on function public.transaction_unit_suffix(text,numeric,text) from public,anon;
grant execute on function public.transaction_unit_suffix(text,numeric,text) to authenticated;


CREATE OR REPLACE FUNCTION public.external_document_context(p_document_type text, p_subject_id uuid, p_channel text, p_include_company_copy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();v_company public.companies%rowtype;
  v_party public.customers%rowtype;v_order public.orders%rowtype;v_purchase public.purchases%rowtype;
  v_paid bigint:=0;v_balance bigint:=0;v_lines jsonb:='[]'::jsonb;v_payments jsonb:='[]'::jsonb;
  v_number text;v_issue_date date;v_valid_until date;v_total bigint;v_status text;v_notes text;
  v_copy_phone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if p_document_type not in ('receipt','invoice','proforma','purchase_order') then
    raise exception 'invalid_document_type'; end if;
  if not public.external_messaging_allowed(v_company_id,false) then
    raise exception 'external_messaging_disabled'; end if;
  select * into v_company from public.companies where id=v_company_id;

  if p_document_type in ('receipt','invoice','proforma') then
    select * into v_order from public.orders where id=p_subject_id and company_id=v_company_id;
    if not found or v_order.customer_id is null then raise exception 'customer_order_required'; end if;
    select * into v_party from public.customers
      where id=v_order.customer_id and company_id=v_company_id and not is_supplier;
    if not found then raise exception 'customer_not_found'; end if;
    select coalesce(sum(p.amount),0)::bigint into v_paid from public.payments p
      where p.order_id=v_order.id and p.status='settled';
    v_balance:=greatest(v_order.total-v_paid,0);
    if p_document_type='receipt' and (v_order.status<>'completed' or v_balance>0) then
      raise exception 'fully_settled_sale_required';
    elsif p_document_type='invoice' and (v_order.status<>'completed' or not v_order.is_credit_sale) then
      raise exception 'completed_credit_sale_required';
    elsif p_document_type='proforma' and (v_order.status<>'draft' or v_order.expires_at<=now()) then
      raise exception 'active_proforma_required';
    end if;
    v_number:=v_order.code;v_total:=v_order.total;
    v_issue_date:=(v_order.created_at at time zone 'Africa/Nairobi')::date;
    v_valid_until:=case when p_document_type='proforma'
      then (v_order.expires_at at time zone 'Africa/Nairobi')::date else v_order.credit_due_at end;
    v_status:=case when p_document_type='proforma' then 'active'
      when v_balance=0 then 'paid' else 'outstanding' end;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')||public.transaction_unit_suffix(ol.unit_name,ol.units_per_unit,ol.stock_unit_name),
      'quantity',ol.quantity,'unit_price',coalesce(ol.custom_price,ol.unit_price),'line_total',ol.line_total)
      order by ol.created_at),'[]'::jsonb) into v_lines
    from public.order_lines ol left join public.variant_catalog vc on vc.variant_id=ol.variant_id
    where ol.order_id=v_order.id and ol.company_id=v_company_id;
    select coalesce(jsonb_agg(jsonb_build_object('method',p.method_code,'amount',p.amount,
      'reference',p.reference,'date',p.created_at) order by p.created_at),'[]'::jsonb) into v_payments
    from public.payments p where p.order_id=v_order.id and p.status='settled';
  else
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required'; end if;
    select * into v_purchase from public.purchases where id=p_subject_id and company_id=v_company_id;
    if not found then raise exception 'purchase_not_found'; end if;
    select * into v_party from public.customers where id=v_purchase.supplier_id
      and company_id=v_company_id and is_supplier and supplier_active;
    if not found then raise exception 'active_supplier_required'; end if;
    v_number:=coalesce(nullif(trim(v_purchase.reference),''),'PO-'||upper(left(v_purchase.id::text,8)));
    v_total:=v_purchase.total_cost;v_balance:=0;v_paid:=0;v_status:='issued';v_notes:=v_purchase.notes;
    v_issue_date:=v_purchase.purchase_date;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')||public.transaction_unit_suffix(pl.unit_name,pl.units_per_unit,pl.stock_unit_name),
      'quantity',pl.quantity,'unit_price',pl.unit_cost,'line_total',pl.line_total)
      order by pl.created_at),'[]'::jsonb) into v_lines
    from public.purchase_lines pl left join public.variant_catalog vc on vc.variant_id=pl.variant_id
    where pl.purchase_id=v_purchase.id and pl.company_id=v_company_id;
  end if;

  if nullif(trim(v_party.phone),'') is null then raise exception 'recipient_has_no_phone'; end if;
  if not v_party.notifications_enabled
    or (p_channel='sms' and not v_party.sms_notifications_enabled)
    or (p_channel='whatsapp' and not v_party.whatsapp_notifications_enabled) then
    raise exception 'recipient_opted_out'; end if;
  if p_include_company_copy and p_document_type not in ('invoice','purchase_order') then
    raise exception 'company_copy_not_available'; end if;
  if p_include_company_copy then
    v_copy_phone:=nullif(trim(v_company.public_whatsapp_number),'');
    if v_copy_phone is null then raise exception 'company_whatsapp_not_configured'; end if;
    if regexp_replace(v_copy_phone,'\D','','g')=regexp_replace(v_party.phone,'\D','','g') then
      raise exception 'company_copy_matches_recipient'; end if;
  end if;

  return jsonb_build_object('company_id',v_company_id,'company_name',v_company.name,
    'company_address',v_company.address,'company_whatsapp',v_company.public_whatsapp_number,
    'company_logo_path',v_company.logo_path,'party_id',v_party.id,
    'party_name',trim(v_party.first_name||' '||coalesce(v_party.last_name,'')),
    'recipient',v_party.phone,'company_copy_recipient',v_copy_phone,
    'document_type',p_document_type,'document_number',v_number,'subject_id',p_subject_id,
    'issue_date',v_issue_date,'valid_until',v_valid_until,'total',v_total,'paid',v_paid,
    'balance',v_balance,'status',v_status,'notes',v_notes,'lines',v_lines,'payments',v_payments,
    'channel',p_channel,'include_company_copy',p_include_company_copy);
end;
$function$
;


CREATE OR REPLACE FUNCTION public.fulfillment_board(p_location_id uuid, p_statuses text[] DEFAULT NULL::text[], p_mine boolean DEFAULT false, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, order_id uuid, order_code text, fulfillment_type text, status text, collection_kind text, promised_at timestamp with time zone, updated_at timestamp with time zone, state_version bigint, assigned_membership_id uuid, assigned_name text, recipient_name text, phone_normalized text, address_line text, landmark text, map_link text, preparation_notes text, handoff_notes text, order_status text, cod_balance bigint, items jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();v_membership uuid;
  v_manage boolean;v_process boolean;v_complete boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_manage:=public.current_user_has_permission('ManageFulfillments');
  v_process:=public.fulfillment_has_capability('ProcessFulfillments');
  v_complete:=public.fulfillment_has_capability('CompleteFulfillments');
  if not (v_manage or v_process or v_complete) then
    raise exception 'permission_denied: fulfillment capability required'; end if;
  v_membership:=public.current_fulfillment_membership_id(p_location_id);
  return query
  select f.id,f.order_id,o.code,f.fulfillment_type,f.status,f.collection_kind,f.promised_at,
    f.updated_at,f.state_version,f.assigned_membership_id,
    coalesce(sp.display_name,am.user_id::text),
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.recipient_name end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.phone_normalized end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.address_line end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.landmark end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.map_link end,
    case when v_manage or v_process then f.preparation_notes end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.handoff_notes end,
    o.status,
    case when f.collection_kind='cod'
      and (v_manage or (v_complete and f.assigned_membership_id=v_membership)) then
      public.order_open_balance_core(o.id) end,
    coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end||public.transaction_unit_suffix(line.unit_name,line.units_per_unit,line.stock_unit_name),
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb)
  from public.order_fulfillments f
  join public.orders o on o.id=f.order_id and o.company_id=f.company_id
  left join public.company_memberships am on am.id=f.assigned_membership_id
  left join public.company_staff_profiles sp on sp.company_id=am.company_id and sp.user_id=am.user_id
  where f.company_id=v_company_id and f.location_id=p_location_id
    and (f.collection_kind='cod' or o.status='completed')
    and (p_statuses is null or f.status=any(p_statuses))
    and (p_cursor is null or f.updated_at<p_cursor)
    and (not p_mine or f.assigned_membership_id=v_membership)
    and (v_manage or v_process or f.assigned_membership_id=v_membership
      or (v_complete and f.assigned_membership_id is null and f.status in('ready','failed')))
  order by f.updated_at desc,f.id desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$function$
;


CREATE OR REPLACE FUNCTION public.fulfillment_detail(p_fulfillment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_f public.order_fulfillments%rowtype;v_membership uuid;v_manage boolean;
  v_process boolean;v_complete boolean;v_sensitive boolean;v_claimable boolean;v_result jsonb;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  v_membership:=public.current_fulfillment_membership_id(v_f.location_id);
  v_manage:=public.current_user_has_permission('ManageFulfillments');
  v_process:=public.fulfillment_has_capability('ProcessFulfillments');
  v_complete:=public.fulfillment_has_capability('CompleteFulfillments');
  v_sensitive:=v_manage or (v_complete and v_f.assigned_membership_id=v_membership);
  v_claimable:=v_complete and v_f.assigned_membership_id is null
    and v_f.status in('ready','failed');
  if not (v_manage or v_process or v_sensitive or v_claimable) then
    raise exception 'permission_denied: fulfillment not assigned'; end if;
  select jsonb_build_object(
    'id',f.id,'order_id',o.id,'order_code',o.code,'order_status',o.status,
    'fulfillment_type',f.fulfillment_type,'status',f.status,'collection_kind',f.collection_kind,
    'promised_at',f.promised_at,'updated_at',f.updated_at,'state_version',f.state_version,
    'assigned_membership_id',f.assigned_membership_id,
    'recipient_name',case when v_sensitive then f.recipient_name end,
    'phone_normalized',case when v_sensitive then f.phone_normalized end,
    'address_line',case when v_sensitive then f.address_line end,
    'landmark',case when v_sensitive then f.landmark end,
    'map_link',case when v_sensitive then f.map_link end,
    'preparation_notes',case when v_manage or v_process then f.preparation_notes end,
    'handoff_notes',case when v_sensitive then f.handoff_notes end,
    'cod_balance',case when f.collection_kind='cod' and v_sensitive then
      public.order_open_balance_core(o.id) end,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end||public.transaction_unit_suffix(line.unit_name,line.units_per_unit,line.stock_unit_name),
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_kind',e.event_kind,'from_status',e.from_status,
      'to_status',e.to_status,'note',case when v_sensitive then e.note end,
      'source_kind',e.source_kind,
      'created_at',e.created_at) order by e.created_at,e.id)
      from public.fulfillment_events e where e.fulfillment_id=f.id),'[]'::jsonb)
  ) into v_result
  from public.order_fulfillments f join public.orders o on o.id=f.order_id
  where f.id=v_f.id;
  return v_result;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.public_fulfillment_tracking(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if p_token is null or p_token!~'^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object(
    'merchant_name',c.name,'merchant_phone',c.public_whatsapp_number,
    'order_code',o.code,'fulfillment_type',f.fulfillment_type,'status',f.status,
    'promised_at',f.promised_at,'updated_at',f.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end||public.transaction_unit_suffix(line.unit_name,line.units_per_unit,line.stock_unit_name),
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb),
    'milestones',coalesce((select jsonb_agg(jsonb_build_object(
      'status',e.to_status,'at',e.created_at) order by e.created_at,e.id)
      from public.fulfillment_events e where e.fulfillment_id=f.id
        and e.to_status is not null),'[]'::jsonb)
  ) into v_result
  from public.order_fulfillments f
  join public.orders o on o.id=f.order_id
  join public.companies c on c.id=f.company_id
  where f.tracking_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and f.tracking_expires_at>now();
  return v_result;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.save_purchase_draft_complete(p_supplier_id uuid, p_lines jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_stock_location_id uuid DEFAULT NULL::uuid, p_payment_mode text DEFAULT NULL::text, p_payment_amount bigint DEFAULT NULL::bigint, p_account_code text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id(); v_line jsonb; v_total bigint:=0;
  v_qty numeric; v_id uuid; v_value_source text; v_line_total bigint; v_unit_cost bigint;
  v_variant public.product_variants%rowtype; v_amount bigint; v_category text;
  v_unit jsonb; v_resolved_lines jsonb:='[]'::jsonb;
  v_custom_label text; v_settlement text; v_expense_account text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id
    and is_supplier and supplier_active) then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;
  if p_stock_location_id is null or not exists(select 1 from public.stock_locations
    where id=p_stock_location_id and company_id=v_company_id and is_active)
    or not public.current_user_can_access_location(p_stock_location_id) then
    raise exception 'invalid_stock_location'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty:=nullif(v_line->>'quantity','')::numeric; v_value_source:=coalesce(v_line->>'value_source','unit');
    if v_qty is null or v_qty<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_qty<>trunc(v_qty) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    v_unit:=public.resolve_transaction_unit(v_variant.id,nullif(v_line->>'pack_id','')::uuid,v_qty,false);
    v_resolved_lines:=v_resolved_lines||jsonb_build_array(v_line||v_unit);
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::bigint;
      if v_unit_cost is null or v_unit_cost<=0 then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_qty*v_unit_cost);
    end if;
    v_total:=v_total+v_line_total;
  end loop;
  if p_draft_id is not null and exists(select 1 from public.purchase_drafts d
    cross join lateral jsonb_array_elements(d.lines) l
    where d.id=p_draft_id and d.company_id=v_company_id and nullif(l->>'pack_id','') is not null)
    and exists(select 1 from jsonb_array_elements(p_lines) l where not l?'units_per_unit') then
    raise exception 'pack_client_update_required: reopen the app before editing this purchase'; end if;
  p_lines:=v_resolved_lines;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=nullif(v_line->>'amount','')::bigint;
    v_category:=lower(nullif(trim(v_line->>'category'),''));
    v_custom_label:=nullif(trim(v_line->>'custom_label'),'');
    v_settlement:=nullif(v_line->>'settlement','');
    if v_amount is null or v_amount<=0 or v_category is null
      or v_category not in ('transport','loading','packaging','duty','other')
      or (v_category='other' and v_custom_label is null)
      or (v_category<>'other' and v_custom_label is not null)
      or v_settlement not in ('supplier_bill','separate') then
      raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then v_total:=v_total+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_line->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
    end if;
  end loop;
  if p_payment_mode not in ('paid','partial','later') then raise exception 'invalid_payment_mode'; end if;
  if p_payment_mode='paid' and p_payment_amount<>v_total then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='partial' and (p_payment_amount is null or p_payment_amount<=0 or p_payment_amount>=v_total)
    then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='later' and coalesce(p_payment_amount,0)<>0 then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode in ('partial','later')
    and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_mode in ('paid','partial') then
    perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,
      expenses,total_cost,stock_location_id,payment_mode,payment_amount,account_code,created_by)
    values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),
      p_purchase_date,p_lines,p_expenses,v_total,p_stock_location_id,p_payment_mode,p_payment_amount,p_account_code,auth.uid())
    returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=nullif(trim(coalesce(p_reference,'')),''),
      notes=nullif(trim(coalesce(p_notes,'')),''),purchase_date=p_purchase_date,lines=p_lines,expenses=p_expenses,
      total_cost=v_total,stock_location_id=p_stock_location_id,payment_mode=p_payment_mode,
      payment_amount=p_payment_amount,account_code=p_account_code,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$function$
;


CREATE OR REPLACE FUNCTION public.snapshot_tax_document_unit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.order_lines%rowtype;
begin
  if new.source_order_line_id is not null then
    select * into l from public.order_lines where id=new.source_order_line_id and company_id=new.company_id;
    if l.id is not null then
      new.pack_id:=l.pack_id;new.unit_name:=l.unit_name;new.stock_unit_name:=l.stock_unit_name;
      new.units_per_unit:=l.units_per_unit;
      if not exists(select 1 from public.tax_documents d where d.id=new.tax_document_id and d.document_kind='credit_note') then
        new.description:=new.description||public.transaction_unit_suffix(l.unit_name,l.units_per_unit,l.stock_unit_name);
      end if;
    end if;
  end if;
  return new;
end;
$function$
;

create view public.rpt_daily_product_sales as  SELECT company_id,
    day,
    variant_id,
    quantity,
    revenue,
    cogs
   FROM mv_daily_product_sales
  WHERE company_id = (( SELECT current_company_id() AS current_company_id)) AND ( SELECT current_user_has_permission('ViewFinancials'::text) AS current_user_has_permission) OR ( SELECT is_platform_admin() AS is_platform_admin);;
revoke all on public.rpt_daily_product_sales from public,anon,authenticated;
grant select on public.rpt_daily_product_sales to authenticated;

-- Fiscal provider item mappings refer to the base stock unit. Preserve exact totals.
CREATE OR REPLACE FUNCTION public.tax_document_integration_envelope(p_tax_document_id uuid, p_provider_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id();v_document public.tax_documents%rowtype;
  v_profile public.company_tax_profiles%rowtype;v_provider text;v_branch text;v_branch_version integer;
  v_original_number text;v_lines jsonb;v_payments jsonb;v_blockers jsonb:='[]'::jsonb;
  v_mapping_snapshot jsonb;
begin
  if v_company_id is null and auth.role()='service_role' then
    select d.company_id into v_company_id from public.tax_documents d where d.id=p_tax_document_id;
  end if;
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if auth.role()<>'service_role' and not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select * into v_document from public.tax_documents d
  where d.id=p_tax_document_id and d.company_id=v_company_id;
  if v_document.id is null then raise exception 'tax_document_not_found'; end if;
  select * into v_profile from public.company_tax_profiles p where p.id=v_document.tax_profile_id;
  v_provider:=upper(coalesce(nullif(btrim(p_provider_code),''),case when exists(
    select 1 from public.tax_jurisdictions j where j.id=v_profile.jurisdiction_id
      and j.country_code='KE') then 'KRA_ETIMS' end));
  if v_provider is null then v_blockers:=v_blockers||jsonb_build_array('provider_mapping'); end if;
  select m.external_branch_code,m.version into v_branch,v_branch_version
  from public.tax_integration_location_mappings m where m.company_id=v_company_id
    and m.jurisdiction_id=v_profile.jurisdiction_id and m.location_id=v_document.source_location_id
    and m.provider_code=v_provider;
  if v_branch is null then v_blockers:=v_blockers||jsonb_build_array('location_mapping'); end if;
  if nullif(btrim(coalesce(v_document.issuer_tax_registration_number,'')),'') is null then
    v_blockers:=v_blockers||jsonb_build_array('issuer_tax_registration_number'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',x.sequence,'description',x.description,'quantity',x.stock_quantity,
    'transaction_unit',jsonb_build_object('pack_id',x.pack_id,'name',x.unit_name,'quantity',x.quantity,'units_per_unit',x.units_per_unit,'stock_unit',x.stock_unit_name),
    'unit_price',case when x.units_per_unit>1 then x.gross_total/nullif(x.stock_quantity,0) else x.unit_price end,'barcode',x.barcode,'gross_total',x.gross_total,
    'net_total',x.net_total,'tax_total',x.tax_total,'tax_rate_bps',x.tax_rate_bps,
    'tax_category_code',x.tax_category_code,'tax_classification',x.tax_classification,
    'external_tax_code',x.external_tax_code,'external_item_code',x.external_item_code,
    'item_classification_code',x.item_classification_code,'item_type_code',x.item_type_code,
    'origin_country_code',x.origin_country_code,'packaging_unit_code',x.packaging_unit_code,
    'quantity_unit_code',x.quantity_unit_code) order by x.sequence),'[]'::jsonb)
  into v_lines from(
    select row_number() over(order by l.created_at,l.id) sequence,l.*,
      rm.external_tax_code,im.external_item_code,im.item_classification_code,im.item_type_code,
      im.origin_country_code,im.packaging_unit_code,im.quantity_unit_code,
      im.id item_mapping_id,im.version item_mapping_version,rm.version rate_mapping_version,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='tax_type' and r.code=rm.external_tax_code and r.active) tax_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='item_classification' and r.code=im.item_classification_code and r.active) class_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='item_type' and r.code=im.item_type_code and r.active) item_type_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='country' and r.code=im.origin_country_code and r.active) country_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='packaging_unit' and r.code=im.packaging_unit_code and r.active) package_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='quantity_unit' and r.code=im.quantity_unit_code and r.active) quantity_valid
    from public.tax_document_lines l
    left join public.tax_integration_item_mappings im on im.company_id=l.company_id
      and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
      and im.provider_code=v_provider
    left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
      and rm.provider_code=v_provider where l.tax_document_id=v_document.id
  ) x;
  if exists(select 1 from public.tax_document_lines l
    left join public.tax_integration_item_mappings im on im.company_id=l.company_id
      and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
      and im.provider_code=v_provider
    where l.tax_document_id=v_document.id and (im.id is null
      or nullif(btrim(im.external_item_code),'') is null
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='item_classification'
          and r.code=im.item_classification_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='item_type' and r.code=im.item_type_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='country' and r.code=im.origin_country_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='packaging_unit'
          and r.code=im.packaging_unit_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='quantity_unit'
          and r.code=im.quantity_unit_code and r.active))) then
    v_blockers:=v_blockers||jsonb_build_array('item_mapping'); end if;
  if exists(select 1 from public.tax_document_lines l
    left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
      and rm.provider_code=v_provider
    where l.tax_document_id=v_document.id and not exists(
      select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='tax_type' and r.code=rm.external_tax_code and r.active)) then
    v_blockers:=v_blockers||jsonb_build_array('tax_code_mapping'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('internal_method_code',p.method_code,
    'external_payment_code',tm.external_payment_code,'amount',p.amount) order by p.method_code),'[]'::jsonb)
  into v_payments from jsonb_to_recordset(v_document.payment_breakdown)
    as p(method_code text,amount bigint)
  left join public.tax_integration_tender_mappings tm on tm.jurisdiction_id=v_profile.jurisdiction_id
    and tm.provider_code=v_provider and tm.internal_method_code=p.method_code;
  if exists(select 1
    from unnest(coalesce(v_document.payment_method_codes,'{}'::text[])) as methods(method_code)
    left join public.tax_integration_tender_mappings tm
      on tm.jurisdiction_id=v_profile.jurisdiction_id and tm.provider_code=v_provider
      and tm.internal_method_code=lower(methods.method_code)
    left join public.tax_integration_reference_codes r on r.provider_code=tm.provider_code
      and r.code_type='payment_type' and r.code=tm.external_payment_code and r.active
    where tm.internal_method_code is null or r.code is null) then
    v_blockers:=v_blockers||jsonb_build_array('payment_mapping'); end if;
  select jsonb_build_object('location',jsonb_build_object('id',m.id,'version',m.version),
    'items',coalesce(jsonb_agg(distinct jsonb_build_object('id',im.id,'version',im.version))
      filter(where im.id is not null),'[]'::jsonb),
    'rates',coalesce(jsonb_agg(distinct jsonb_build_object('rate_version_id',rm.tax_rate_version_id,
      'version',rm.version)) filter(where rm.tax_rate_version_id is not null),'[]'::jsonb))
  into v_mapping_snapshot from public.tax_integration_location_mappings m
  left join public.tax_document_lines l on l.tax_document_id=v_document.id
  left join public.tax_integration_item_mappings im on im.company_id=v_document.company_id
    and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
    and im.provider_code=v_provider
  left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
    and rm.provider_code=v_provider
  where m.company_id=v_document.company_id and m.jurisdiction_id=v_profile.jurisdiction_id
    and m.location_id=v_document.source_location_id and m.provider_code=v_provider
  group by m.id,m.version;
  select d.document_number into v_original_number from public.tax_documents d
    where d.id=v_document.original_document_id;
  return jsonb_build_object('schema_version',v_document.integration_schema_version,
    'provider_hint',v_provider,'ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,
    'mapping_snapshot',coalesce(v_mapping_snapshot,'{}'::jsonb),
    'document',jsonb_build_object('id',v_document.id,'number',v_document.document_number,
      'kind',v_document.document_kind,'original_document_number',v_original_number,
      'tax_point_at',v_document.tax_point_at,'source_order_code',v_document.source_order_code),
    'issuer',jsonb_build_object('name',v_document.issuer_name,
      'tax_registration_number',v_document.issuer_tax_registration_number,'address',v_document.issuer_address),
    'buyer',jsonb_build_object('id',v_document.buyer_id,'name',v_document.buyer_name,
      'tax_registration_number',v_document.buyer_tax_registration_number,'phone',v_document.buyer_phone),
    'location',jsonb_build_object('id',v_document.source_location_id,
      'code',v_document.source_location_code,'name',v_document.source_location_name,
      'branch_code',v_branch,'mapping_version',v_branch_version),
    'payments',v_payments,'currency_code',v_document.currency_code,
    'totals',jsonb_build_object('gross',v_document.gross_total,'net',v_document.net_total,
      'tax',v_document.tax_total),'lines',v_lines);
end;
$function$
;
