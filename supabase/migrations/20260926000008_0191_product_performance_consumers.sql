-- Route dashboards and supplier analysis through the authoritative planning result.

do $$
begin
  if to_regprocedure('public.dashboard_location_snapshot_legacy(date,uuid)') is null then
    alter function public.dashboard_location_snapshot(date,uuid)
      rename to dashboard_location_snapshot_legacy;
  end if;
end;
$$;

revoke execute on function public.dashboard_location_snapshot_legacy(date,uuid)
  from public,anon,authenticated;

create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date-6),
  p_location_id uuid default null
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select public.dashboard_location_snapshot_legacy(p_since,p_location_id)
    || jsonb_build_object(
      'productPerformance',public.product_performance(7,p_location_id,10)
    );
$$;

revoke execute on function public.dashboard_location_snapshot(date,uuid) from public,anon;
grant execute on function public.dashboard_location_snapshot(date,uuid) to authenticated;

comment on function public.dashboard_location_snapshot(date,uuid) is
  'Returns the compatible dashboard snapshot plus robust product performance leaders.';

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
set search_path=''
as $$
declare
  v_company_id uuid:=public.current_company_id();v_days integer;v_previous_since date;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_low_stock_threshold numeric:=0;v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if p_since is null or p_until is null or p_since>p_until then
    raise exception 'invalid_restock_intelligence_range';
  end if;
  v_days:=p_until-p_since+1;
  if v_days>366 then
    raise exception 'restock_intelligence_range_too_large: maximum 366 days';
  end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  if (p_supplier_id is null)=(p_manufacturer_id is null) then
    raise exception 'restock_scope_required: choose one supplier or manufacturer';
  end if;
  if p_supplier_id is not null and not exists(
    select 1 from public.customers s where s.id=p_supplier_id
      and s.company_id=v_company_id and s.is_supplier and s.deleted_at is null
  ) then raise exception 'supplier_not_found'; end if;
  if p_manufacturer_id is not null and not exists(
    select 1 from public.manufacturers m where m.id=p_manufacturer_id
      and m.company_id=v_company_id
  ) then raise exception 'manufacturer_not_found'; end if;

  select low_stock_threshold into v_low_stock_threshold
  from public.companies where id=v_company_id;
  v_previous_since:=p_since-v_days;

  with candidate_variants as materialized (
    select v.id variant_id,v.product_id,p.name product_name,v.name variant_name,
      p.manufacturer_id,m.name manufacturer_name
    from public.product_variants v
    join public.products p on p.id=v.product_id and p.company_id=v.company_id
    left join public.manufacturers m on m.id=p.manufacturer_id and m.company_id=p.company_id
    where v.company_id=v_company_id and v.active and p.active and v.track_inventory
      and v.kind<>'service' and (p_manufacturer_id is null or p.manufacturer_id=p_manufacturer_id)
      and (p_supplier_id is null or exists(
        select 1 from public.inventory_batches b where b.company_id=v_company_id
          and b.supplier_id=p_supplier_id and b.stock_location_id=p_location_id
          and b.variant_id=v.id and b.remaining>0
      ) or exists(
        select 1 from public.purchase_lines pl join public.purchases pu
          on pu.id=pl.purchase_id and pu.company_id=pl.company_id
        where pl.company_id=v_company_id and pl.variant_id=v.id
          and pu.supplier_id=p_supplier_id and pu.stock_location_id=p_location_id
          and pu.status='posted'
      ))
  ), period_sales as materialized (
    select f.variant_id,
      coalesce(sum(f.quantity) filter(where f.day>=p_since),0)::numeric current_quantity,
      coalesce(sum(f.revenue) filter(where f.day>=p_since),0)::bigint current_revenue,
      coalesce(sum(f.cogs) filter(where f.day>=p_since),0)::bigint current_cogs,
      (coalesce(sum(f.revenue) filter(where f.day>=p_since),0)
        -coalesce(sum(f.cogs) filter(where f.day>=p_since),0))::bigint current_margin,
      coalesce(sum(f.quantity) filter(where f.day<p_since),0)::numeric previous_quantity,
      coalesce(sum(f.revenue) filter(where f.day<p_since),0)::bigint previous_revenue
    from public.mv_daily_location_product_sales f
    join candidate_variants c on c.variant_id=f.variant_id
    where f.company_id=v_company_id and f.location_id=p_location_id
      and f.day between v_previous_since and p_until group by f.variant_id
  ), current_stock as materialized (
    select b.variant_id,coalesce(sum(b.remaining),0)::numeric stock,
      coalesce(sum(b.remaining_cost),0)::bigint stock_value,
      coalesce(sum(b.remaining) filter(where b.supplier_id=p_supplier_id),0)::numeric supplier_stock
    from public.inventory_batches b join candidate_variants c on c.variant_id=b.variant_id
    where b.company_id=v_company_id and b.stock_location_id=p_location_id and b.remaining>0
    group by b.variant_id
  ), metrics as materialized (
    select c.*,coalesce(s.current_quantity,0)::numeric current_quantity,
      coalesce(s.current_revenue,0)::bigint current_revenue,
      coalesce(s.current_cogs,0)::bigint current_cogs,
      coalesce(s.current_margin,0)::bigint current_margin,
      coalesce(s.previous_quantity,0)::numeric previous_quantity,
      coalesce(s.previous_revenue,0)::bigint previous_revenue,
      coalesce(a.current_stock,st.stock,0)::numeric stock,
      coalesce(a.current_value,st.stock_value,0)::bigint stock_value,
      coalesce(st.supplier_stock,0)::numeric supplier_stock,
      coalesce(a.days_of_cover,case when coalesce(s.current_quantity,0)>0
        then coalesce(st.stock,0)/(s.current_quantity/v_days) end)::numeric days_cover,
      a.reorder_quantity,a.signal,a.demand_confidence,a.outlier_detected,a.outlier_share,
      coalesce(a.planning_daily_demand,a.average_daily_demand) planning_daily_demand,
      coalesce(a.observed_average_daily_demand,a.average_daily_demand)
        observed_average_daily_demand
    from candidate_variants c left join period_sales s on s.variant_id=c.variant_id
    left join current_stock st on st.variant_id=c.variant_id
    left join public.product_attention a on a.company_id=v_company_id
      and a.location_id=p_location_id and a.variant_id=c.variant_id
    where coalesce(a.current_stock,st.stock,0)>0 or coalesce(s.current_quantity,0)>0
      or coalesce(s.previous_quantity,0)>0
  ), ranked as materialized (
    select * from metrics order by
      case signal when 'stockout' then 0 when 'reorder' then 1 when 'low_cover' then 2
        when 'healthy' then 3 when 'slow' then 4 else 5 end,
      days_cover nulls last,current_quantity desc,current_revenue desc,variant_id limit v_limit
  ), latest_purchase as materialized (
    select distinct on(pl.variant_id) pl.variant_id,pu.supplier_id last_supplier_id,
      trim(concat_ws(' ',supplier.first_name,supplier.last_name)) last_supplier_name,
      pl.unit_cost last_unit_cost,pu.purchase_date last_purchase_date
    from public.purchase_lines pl join ranked r on r.variant_id=pl.variant_id
    join public.purchases pu on pu.id=pl.purchase_id and pu.company_id=pl.company_id
    join public.customers supplier on supplier.id=pu.supplier_id
      and supplier.company_id=pu.company_id
    where pl.company_id=v_company_id and pu.stock_location_id=p_location_id
      and pu.status='posted' and (p_supplier_id is null or pu.supplier_id=p_supplier_id)
    order by pl.variant_id,pu.purchase_date desc,pu.created_at desc,pl.created_at desc
  ), current_days as (
    select generate_series(p_since,p_until,interval '1 day')::date as day
  ), product_trends as (
    select r.variant_id,jsonb_agg(coalesce(f.quantity,0) order by d.day) quantities
    from ranked r cross join current_days d left join public.mv_daily_location_product_sales f
      on f.company_id=v_company_id and f.location_id=p_location_id
      and f.variant_id=r.variant_id and f.day=d.day group by r.variant_id
  ), overall_current as (
    select f.day,sum(f.quantity)::numeric quantity,sum(f.revenue)::bigint revenue
    from public.mv_daily_location_product_sales f
    join candidate_variants c on c.variant_id=f.variant_id
    where f.company_id=v_company_id and f.location_id=p_location_id
      and f.day between p_since and p_until group by f.day
  ), overall_previous as (
    select (f.day+v_days)::date as day,sum(f.quantity)::numeric quantity,
      sum(f.revenue)::bigint revenue
    from public.mv_daily_location_product_sales f
    join candidate_variants c on c.variant_id=f.variant_id
    where f.company_id=v_company_id and f.location_id=p_location_id
      and f.day between v_previous_since and p_since-1 group by f.day
  ), overall_trend as (
    select d.day,coalesce(c.quantity,0)::numeric current_quantity,
      coalesce(p.quantity,0)::numeric previous_quantity,
      coalesce(c.revenue,0)::bigint current_revenue,
      coalesce(p.revenue,0)::bigint previous_revenue
    from current_days d left join overall_current c on c.day=d.day
    left join overall_previous p on p.day=d.day
  )
  select jsonb_build_object(
    'days',v_days,'lowStockThreshold',v_low_stock_threshold,
    'summary',jsonb_build_object(
      'products',(select count(*) from metrics),
      'unitsSold',coalesce((select sum(current_quantity) from metrics),0),
      'sales',coalesce((select sum(current_revenue) from metrics),0),
      'stock',coalesce((select sum(stock) from metrics),0),
      'stockValue',coalesce((select sum(stock_value) from metrics),0),
      'restockRisks',coalesce((select count(*) from metrics
        where signal in('stockout','reorder','low_cover')),0)),
    'trend',coalesce((select jsonb_agg(jsonb_build_object(
      'day',t.day,'currentQuantity',t.current_quantity,'previousQuantity',t.previous_quantity,
      'currentRevenue',t.current_revenue,'previousRevenue',t.previous_revenue) order by t.day)
      from overall_trend t),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'variantId',r.variant_id,'productId',r.product_id,'productName',r.product_name,
      'variantName',r.variant_name,'manufacturerId',r.manufacturer_id,
      'manufacturerName',r.manufacturer_name,'currentQuantity',r.current_quantity,
      'currentRevenue',r.current_revenue,'currentCogs',r.current_cogs,
      'currentMargin',r.current_margin,'previousQuantity',r.previous_quantity,
      'previousRevenue',r.previous_revenue,'stock',r.stock,'stockValue',r.stock_value,
      'supplierStock',r.supplier_stock,'daysCover',r.days_cover,
      'reorderQuantity',r.reorder_quantity,'signal',r.signal,
      'demandConfidence',r.demand_confidence,'outlierDetected',r.outlier_detected,
      'outlierShare',r.outlier_share,'planningDailyDemand',r.planning_daily_demand,
      'observedAverageDailyDemand',r.observed_average_daily_demand,
      'lastSupplierId',lp.last_supplier_id,'lastSupplierName',lp.last_supplier_name,
      'lastUnitCost',lp.last_unit_cost,'lastPurchaseDate',lp.last_purchase_date,
      'lastSoldOn',last_sale.day,'trend',pt.quantities)
      order by case r.signal when 'stockout' then 0 when 'reorder' then 1
        when 'low_cover' then 2 when 'healthy' then 3 when 'slow' then 4 else 5 end,
        r.days_cover nulls last,r.current_quantity desc,r.variant_id)
      from ranked r join product_trends pt on pt.variant_id=r.variant_id
      left join latest_purchase lp on lp.variant_id=r.variant_id
      left join lateral(
        select f.day from public.mv_daily_location_product_sales f where f.company_id=v_company_id
          and f.location_id=p_location_id and f.variant_id=r.variant_id and f.day<=p_until
          and f.quantity>0 order by f.day desc limit 1
      ) last_sale on true),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  from public,anon;
grant execute on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  to authenticated,service_role;

comment on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer) is
  'Returns factual selected-period sales with authoritative robust planning cover and reorder quantities.';
