-- Location-aware restocking intelligence for supplier and manufacturer decisions.

create materialized view public.mv_daily_location_product_sales as
select
  orders.company_id,
  orders.location_id,
  (orders.completed_at at time zone company.business_timezone)::date as day,
  line.variant_id,
  coalesce(sum(line.quantity), 0)::numeric as quantity,
  coalesce(sum(line.line_total), 0)::bigint as revenue,
  coalesce(sum(line.cogs_total), 0)::bigint as cogs
from public.orders orders
join public.companies company on company.id = orders.company_id
join public.order_lines line on line.order_id = orders.id
where orders.status = 'completed'
  and orders.completed_at is not null
  and orders.location_id is not null
group by orders.company_id, orders.location_id,
  (orders.completed_at at time zone company.business_timezone)::date,
  line.variant_id;

create unique index mv_daily_location_product_sales_idx
  on public.mv_daily_location_product_sales(company_id, location_id, day, variant_id);
create index mv_daily_location_product_sales_variant_day_idx
  on public.mv_daily_location_product_sales(company_id, location_id, variant_id, day desc);

revoke all on public.mv_daily_location_product_sales from public, anon, authenticated;

create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_daily_sales_summary;
  refresh materialized view concurrently public.mv_daily_product_sales;
  refresh materialized view concurrently public.mv_daily_location_product_sales;
  refresh materialized view concurrently public.mv_daily_customer_stats;
  refresh materialized view concurrently public.mv_daily_order_stats;
end;
$$;

revoke execute on function public.refresh_analytics() from authenticated, anon, public;
grant execute on function public.refresh_analytics() to service_role;

create or replace function public.restock_product_intelligence(
  p_since date,
  p_until date,
  p_location_id uuid,
  p_supplier_id uuid default null,
  p_manufacturer_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_days integer;
  v_previous_since date;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_low_stock_threshold numeric := 0;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if p_since is null or p_until is null or p_since > p_until then
    raise exception 'invalid_restock_intelligence_range';
  end if;
  v_days := (p_until - p_since) + 1;
  if v_days > 366 then
    raise exception 'restock_intelligence_range_too_large: maximum 366 days';
  end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  if (p_supplier_id is null) = (p_manufacturer_id is null) then
    raise exception 'restock_scope_required: choose one supplier or manufacturer';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.customers supplier
    where supplier.id = p_supplier_id
      and supplier.company_id = v_company_id
      and supplier.is_supplier
      and supplier.deleted_at is null
  ) then
    raise exception 'supplier_not_found';
  end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.manufacturers manufacturer
    where manufacturer.id = p_manufacturer_id
      and manufacturer.company_id = v_company_id
  ) then
    raise exception 'manufacturer_not_found';
  end if;

  select company.low_stock_threshold into v_low_stock_threshold
  from public.companies company where company.id = v_company_id;
  v_previous_since := p_since - v_days;

  with candidate_variants as materialized (
    select
      variant.id as variant_id,
      variant.product_id,
      product.name as product_name,
      variant.name as variant_name,
      product.manufacturer_id,
      manufacturer.name as manufacturer_name
    from public.product_variants variant
    join public.products product
      on product.id = variant.product_id and product.company_id = variant.company_id
    left join public.manufacturers manufacturer
      on manufacturer.id = product.manufacturer_id
     and manufacturer.company_id = product.company_id
    where variant.company_id = v_company_id
      and variant.active
      and product.active
      and variant.track_inventory
      and variant.kind <> 'service'
      and (p_manufacturer_id is null or product.manufacturer_id = p_manufacturer_id)
      and (
        p_supplier_id is null
        or exists (
          select 1
          from public.inventory_batches batch
          where batch.company_id = v_company_id
            and batch.supplier_id = p_supplier_id
            and batch.stock_location_id = p_location_id
            and batch.variant_id = variant.id
            and batch.remaining > 0
        )
        or exists (
          select 1
          from public.purchase_lines purchase_line
          join public.purchases purchase
            on purchase.id = purchase_line.purchase_id
           and purchase.company_id = purchase_line.company_id
          where purchase_line.company_id = v_company_id
            and purchase_line.variant_id = variant.id
            and purchase.supplier_id = p_supplier_id
            and purchase.stock_location_id = p_location_id
            and purchase.status = 'posted'
        )
      )
  ), period_sales as materialized (
    select
      sale.variant_id,
      coalesce(sum(sale.quantity) filter (where sale.day >= p_since), 0)::numeric
        as current_quantity,
      coalesce(sum(sale.revenue) filter (where sale.day >= p_since), 0)::bigint
        as current_revenue,
      coalesce(sum(sale.cogs) filter (where sale.day >= p_since), 0)::bigint
        as current_cogs,
      coalesce(sum(sale.quantity) filter (where sale.day < p_since), 0)::numeric
        as previous_quantity,
      coalesce(sum(sale.revenue) filter (where sale.day < p_since), 0)::bigint
        as previous_revenue
    from public.mv_daily_location_product_sales sale
    join candidate_variants candidate on candidate.variant_id = sale.variant_id
    where sale.company_id = v_company_id
      and sale.location_id = p_location_id
      and sale.day between v_previous_since and p_until
    group by sale.variant_id
  ), current_stock as materialized (
    select
      batch.variant_id,
      coalesce(sum(batch.remaining), 0)::numeric as stock,
      coalesce(sum(batch.remaining_cost), 0)::bigint as stock_value,
      coalesce(sum(batch.remaining) filter (where batch.supplier_id = p_supplier_id), 0)::numeric
        as supplier_stock
    from public.inventory_batches batch
    join candidate_variants candidate on candidate.variant_id = batch.variant_id
    where batch.company_id = v_company_id
      and batch.stock_location_id = p_location_id
      and batch.remaining > 0
    group by batch.variant_id
  ), metrics as materialized (
    select
      candidate.*,
      coalesce(sales.current_quantity, 0)::numeric as current_quantity,
      coalesce(sales.current_revenue, 0)::bigint as current_revenue,
      coalesce(sales.current_cogs, 0)::bigint as current_cogs,
      (coalesce(sales.current_revenue, 0) - coalesce(sales.current_cogs, 0))::bigint
        as current_margin,
      coalesce(sales.previous_quantity, 0)::numeric as previous_quantity,
      coalesce(sales.previous_revenue, 0)::bigint as previous_revenue,
      coalesce(stock.stock, 0)::numeric as stock,
      coalesce(stock.stock_value, 0)::bigint as stock_value,
      coalesce(stock.supplier_stock, 0)::numeric as supplier_stock,
      case when coalesce(sales.current_quantity, 0) > 0 then
        coalesce(stock.stock, 0) / (sales.current_quantity / v_days)
      end::numeric as days_cover
    from candidate_variants candidate
    left join period_sales sales on sales.variant_id = candidate.variant_id
    left join current_stock stock on stock.variant_id = candidate.variant_id
    where coalesce(stock.stock, 0) > 0
       or coalesce(sales.current_quantity, 0) > 0
       or coalesce(sales.previous_quantity, 0) > 0
  ), ranked as materialized (
    select metrics.*
    from metrics
    order by
      case
        when (current_quantity > 0 or previous_quantity > 0)
          and stock <= v_low_stock_threshold then 0
        when current_quantity > 0 and days_cover <= 14 then 1
        when current_quantity > previous_quantity and days_cover <= 30 then 2
        when current_quantity = 0 then 4
        else 3
      end,
      current_quantity desc,
      current_revenue desc,
      variant_id
    limit v_limit
  ), latest_purchase as materialized (
    select distinct on (purchase_line.variant_id)
      purchase_line.variant_id,
      purchase.supplier_id as last_supplier_id,
      trim(concat_ws(' ', supplier.first_name, supplier.last_name)) as last_supplier_name,
      purchase_line.unit_cost as last_unit_cost,
      purchase.purchase_date as last_purchase_date
    from public.purchase_lines purchase_line
    join ranked product on product.variant_id = purchase_line.variant_id
    join public.purchases purchase
      on purchase.id = purchase_line.purchase_id
     and purchase.company_id = purchase_line.company_id
    join public.customers supplier
      on supplier.id = purchase.supplier_id and supplier.company_id = purchase.company_id
    where purchase_line.company_id = v_company_id
      and purchase.stock_location_id = p_location_id
      and purchase.status = 'posted'
      and (p_supplier_id is null or purchase.supplier_id = p_supplier_id)
    order by purchase_line.variant_id, purchase.purchase_date desc,
      purchase.created_at desc, purchase_line.created_at desc
  ), current_days as (
    select generate_series(p_since, p_until, interval '1 day')::date as day
  ), product_trends as (
    select
      ranked.variant_id,
      jsonb_agg(coalesce(sale.quantity, 0) order by current_days.day) as quantities
    from ranked
    cross join current_days
    left join public.mv_daily_location_product_sales sale
      on sale.company_id = v_company_id
     and sale.location_id = p_location_id
     and sale.variant_id = ranked.variant_id
     and sale.day = current_days.day
    group by ranked.variant_id
  ), overall_current as (
    select
      sale.day,
      sum(sale.quantity)::numeric as quantity,
      sum(sale.revenue)::bigint as revenue
    from public.mv_daily_location_product_sales sale
    join candidate_variants candidate on candidate.variant_id = sale.variant_id
    where sale.company_id = v_company_id
      and sale.location_id = p_location_id
      and sale.day between p_since and p_until
    group by sale.day
  ), overall_previous as (
    select
      (sale.day + v_days)::date as day,
      sum(sale.quantity)::numeric as quantity,
      sum(sale.revenue)::bigint as revenue
    from public.mv_daily_location_product_sales sale
    join candidate_variants candidate on candidate.variant_id = sale.variant_id
    where sale.company_id = v_company_id
      and sale.location_id = p_location_id
      and sale.day between v_previous_since and p_since - 1
    group by sale.day
  ), overall_trend as (
    select
      current_days.day,
      coalesce(current_period.quantity, 0)::numeric as current_quantity,
      coalesce(previous_period.quantity, 0)::numeric as previous_quantity,
      coalesce(current_period.revenue, 0)::bigint as current_revenue,
      coalesce(previous_period.revenue, 0)::bigint as previous_revenue
    from current_days
    left join overall_current current_period on current_period.day = current_days.day
    left join overall_previous previous_period on previous_period.day = current_days.day
  )
  select jsonb_build_object(
    'days', v_days,
    'lowStockThreshold', v_low_stock_threshold,
    'summary', jsonb_build_object(
      'products', (select count(*) from metrics),
      'unitsSold', coalesce((select sum(current_quantity) from metrics), 0),
      'sales', coalesce((select sum(current_revenue) from metrics), 0),
      'stock', coalesce((select sum(stock) from metrics), 0),
      'stockValue', coalesce((select sum(stock_value) from metrics), 0),
      'restockRisks', coalesce((select count(*) from metrics
        where (current_quantity > 0 or previous_quantity > 0)
          and (stock <= v_low_stock_threshold or days_cover <= 14)), 0)
    ),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', trend.day,
        'currentQuantity', trend.current_quantity,
        'previousQuantity', trend.previous_quantity,
        'currentRevenue', trend.current_revenue,
        'previousRevenue', trend.previous_revenue
      ) order by trend.day)
      from overall_trend trend
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variantId', product.variant_id,
        'productId', product.product_id,
        'productName', product.product_name,
        'variantName', product.variant_name,
        'manufacturerId', product.manufacturer_id,
        'manufacturerName', product.manufacturer_name,
        'currentQuantity', product.current_quantity,
        'currentRevenue', product.current_revenue,
        'currentCogs', product.current_cogs,
        'currentMargin', product.current_margin,
        'previousQuantity', product.previous_quantity,
        'previousRevenue', product.previous_revenue,
        'stock', product.stock,
        'stockValue', product.stock_value,
        'supplierStock', product.supplier_stock,
        'daysCover', product.days_cover,
        'lastSupplierId', purchase.last_supplier_id,
        'lastSupplierName', purchase.last_supplier_name,
        'lastUnitCost', purchase.last_unit_cost,
        'lastPurchaseDate', purchase.last_purchase_date,
        'lastSoldOn', latest_sale.day,
        'trend', product_trend.quantities
      ) order by
        case
          when (product.current_quantity > 0 or product.previous_quantity > 0)
            and product.stock <= v_low_stock_threshold then 0
          when product.current_quantity > 0 and product.days_cover <= 14 then 1
          when product.current_quantity > product.previous_quantity and product.days_cover <= 30 then 2
          when product.current_quantity = 0 then 4
          else 3
        end,
        product.current_quantity desc,
        product.current_revenue desc,
        product.variant_id)
      from ranked product
      join product_trends product_trend on product_trend.variant_id = product.variant_id
      left join latest_purchase purchase on purchase.variant_id = product.variant_id
      left join lateral (
        select sale.day
        from public.mv_daily_location_product_sales sale
        where sale.company_id = v_company_id
          and sale.location_id = p_location_id
          and sale.variant_id = product.variant_id
          and sale.day <= p_until
        order by sale.day desc
        limit 1
      ) latest_sale on true
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  from public, anon;
grant execute on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  to authenticated, service_role;

comment on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer) is
  'Returns bounded location-aware sales trends, stock cover, and purchase context for one supplier or manufacturer.';
