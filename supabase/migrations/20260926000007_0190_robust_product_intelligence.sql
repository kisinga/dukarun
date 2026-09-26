-- Robust, explainable product planning and separate performance leaders.
-- Factual sales remain unchanged; planning quantities cap unusual selling days.

alter table public.product_window_metrics
  drop constraint if exists product_window_metrics_window_days_check;

alter table public.product_window_metrics
  add constraint product_window_metrics_window_days_check
    check(window_days in (7,30,90,180,365)),
  add column current_order_count integer,
  add column previous_order_count integer,
  add column current_active_days integer,
  add column previous_active_days integer,
  add column current_median_quantity numeric(18,3),
  add column previous_median_quantity numeric(18,3),
  add column current_max_quantity numeric(18,3),
  add column previous_max_quantity numeric(18,3),
  add column current_robust_quantity numeric(18,3),
  add column previous_robust_quantity numeric(18,3),
  add column previous_margin bigint;

alter table public.product_attention
  add column planning_daily_demand numeric(18,5),
  add column observed_average_daily_demand numeric(18,5),
  add column planning_window_days integer,
  add column demand_confidence text
    check(demand_confidence in ('low','medium','high')),
  add column active_sale_days integer,
  add column order_count integer,
  add column outlier_detected boolean,
  add column outlier_share numeric(18,5);

create or replace function public.refresh_product_window_metrics(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date;v_timezone text;
begin
  select business_timezone into v_timezone
  from public.companies where id=p_company_id;
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;

  insert into public.product_window_metrics(
    company_id,location_id,variant_id,window_days,
    current_quantity,previous_quantity,gross_revenue,refund_amount,net_revenue,
    corrected_cogs,margin,previous_net_revenue,current_from,current_to,refreshed_at,
    current_order_count,previous_order_count,current_active_days,previous_active_days,
    current_median_quantity,previous_median_quantity,current_max_quantity,
    previous_max_quantity,current_robust_quantity,previous_robust_quantity,previous_margin
  )
  with windows(days) as (values(7),(30),(90),(180),(365)),
  periods as (
    select w.days,'current'::text as period,v_today-(w.days-1) as from_day,v_today as to_day
    from windows w
    union all
    select w.days,'previous',v_today-(w.days*2-1),v_today-w.days
    from windows w
  ), summaries as (
    select p.days,p.period,
      coalesce(sum(f.net_quantity),0)::numeric(18,3) as quantity,
      coalesce(sum(f.gross_revenue),0)::bigint as gross_revenue,
      coalesce(sum(f.refund_amount),0)::bigint as refund_amount,
      coalesce(sum(f.net_revenue),0)::bigint as net_revenue,
      coalesce(sum(f.corrected_cogs),0)::bigint as corrected_cogs,
      coalesce(sum(f.margin),0)::bigint as margin,
      coalesce(sum(f.order_count),0)::integer as order_count,
      count(*) filter(where f.net_quantity>0)::integer as active_days,
      coalesce(percentile_disc(0.5) within group(order by f.net_quantity)
        filter(where f.net_quantity>0),0)::numeric(18,3) as median_quantity,
      coalesce(max(f.net_quantity) filter(where f.net_quantity>0),0)::numeric(18,3)
        as max_quantity
    from periods p
    left join public.product_daily_facts f
      on f.company_id=p_company_id and f.location_id=p_location_id
     and f.variant_id=p_variant_id and f.day between p.from_day and p.to_day
    group by p.days,p.period
  ), robust as (
    select s.*,
      coalesce(sum(least(greatest(f.net_quantity,0),3*s.median_quantity))
        filter(where f.net_quantity>0),0)::numeric(18,3) as robust_quantity
    from summaries s
    left join public.product_daily_facts f
      on f.company_id=p_company_id and f.location_id=p_location_id
     and f.variant_id=p_variant_id
     and f.day between
       case when s.period='current' then v_today-(s.days-1) else v_today-(s.days*2-1) end
       and case when s.period='current' then v_today else v_today-s.days end
    group by s.days,s.period,s.quantity,s.gross_revenue,s.refund_amount,s.net_revenue,
      s.corrected_cogs,s.margin,s.order_count,s.active_days,s.median_quantity,s.max_quantity
  )
  select p_company_id,p_location_id,p_variant_id,w.days,
    c.quantity,p.quantity,c.gross_revenue,c.refund_amount,c.net_revenue,c.corrected_cogs,
    c.margin,p.net_revenue,v_today-(w.days-1),v_today,now(),
    c.order_count,p.order_count,c.active_days,p.active_days,c.median_quantity,p.median_quantity,
    c.max_quantity,p.max_quantity,c.robust_quantity,p.robust_quantity,p.margin
  from windows w
  join robust c on c.days=w.days and c.period='current'
  join robust p on p.days=w.days and p.period='previous'
  on conflict(company_id,location_id,variant_id,window_days) do update set
    current_quantity=excluded.current_quantity,previous_quantity=excluded.previous_quantity,
    gross_revenue=excluded.gross_revenue,refund_amount=excluded.refund_amount,
    net_revenue=excluded.net_revenue,corrected_cogs=excluded.corrected_cogs,
    margin=excluded.margin,previous_net_revenue=excluded.previous_net_revenue,
    current_from=excluded.current_from,current_to=excluded.current_to,
    current_order_count=excluded.current_order_count,
    previous_order_count=excluded.previous_order_count,
    current_active_days=excluded.current_active_days,
    previous_active_days=excluded.previous_active_days,
    current_median_quantity=excluded.current_median_quantity,
    previous_median_quantity=excluded.previous_median_quantity,
    current_max_quantity=excluded.current_max_quantity,
    previous_max_quantity=excluded.previous_max_quantity,
    current_robust_quantity=excluded.current_robust_quantity,
    previous_robust_quantity=excluded.previous_robust_quantity,
    previous_margin=excluded.previous_margin,refreshed_at=now();
end;
$$;

revoke execute on function public.refresh_product_window_metrics(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_product_window_metrics(uuid,uuid,uuid) to service_role;

create or replace function public.refresh_product_attention(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_stock numeric;v_value bigint;v_demand numeric;v_observed numeric;v_cover numeric;
  v_reorder numeric;v_last date;v_lead integer;v_safety integer;v_threshold numeric;
  v_signal text;v_reason text;v_eligible boolean;v_exposure_started date;
  v_today date;v_timezone text;
  v_history_days integer;v_exposure_30 integer;v_exposure_90 integer;
  v_rate_30 numeric:=0;v_rate_90 numeric:=0;v_active integer:=0;v_orders integer:=0;
  v_outlier boolean:=false;v_outlier_share numeric:=0;v_confidence text;
  v_30 public.product_window_metrics%rowtype;v_90 public.product_window_metrics%rowtype;
begin
  select v.active and v.kind<>'service' and v.track_inventory,
    coalesce(v.reorder_lead_days,c.default_reorder_lead_days),
    coalesce(v.reorder_safety_days,c.default_reorder_safety_days),
    greatest(1,c.low_stock_threshold),c.business_timezone
  into v_eligible,v_lead,v_safety,v_threshold,v_timezone
  from public.product_variants v join public.companies c on c.id=v.company_id
  where v.id=p_variant_id and v.company_id=p_company_id;
  if not coalesce(v_eligible,false) then
    delete from public.product_attention where company_id=p_company_id
      and location_id=p_location_id and variant_id=p_variant_id;
    return;
  end if;

  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  select min(evidence.evidence_day) into v_exposure_started
  from (
    select min(f.day) as evidence_day
    from public.product_daily_facts f
    where f.company_id=p_company_id and f.location_id=p_location_id
      and f.variant_id=p_variant_id
    union all
    select min((b.created_at at time zone coalesce(v_timezone,'Africa/Nairobi'))::date)
    from public.inventory_batches b
    where b.company_id=p_company_id and b.stock_location_id=p_location_id
      and b.variant_id=p_variant_id
    union all
    select min(i.day)
    from public.inventory_position_days i
    where i.company_id=p_company_id and i.location_id=p_location_id
      and i.variant_id=p_variant_id
  ) evidence
  where evidence.evidence_day is not null;
  v_history_days:=greatest(1,v_today-coalesce(v_exposure_started,v_today)+1);
  v_exposure_30:=least(30,greatest(14,v_history_days));
  v_exposure_90:=least(90,greatest(14,v_history_days));

  select * into v_30 from public.product_window_metrics m
  where m.company_id=p_company_id and m.location_id=p_location_id
    and m.variant_id=p_variant_id and m.window_days=30;
  select * into v_90 from public.product_window_metrics m
  where m.company_id=p_company_id and m.location_id=p_location_id
    and m.variant_id=p_variant_id and m.window_days=90;

  if v_30.current_robust_quantity is not null then
    v_rate_30:=case
      when coalesce(v_30.current_active_days,0)::numeric/v_exposure_30>=0.5
        then v_30.current_robust_quantity/v_exposure_30
      else coalesce(v_30.current_active_days,0)::numeric/v_exposure_30
        *coalesce(v_30.current_median_quantity,0)
    end;
  else
    v_rate_30:=coalesce(v_30.current_quantity/30.0,0);
  end if;
  if v_90.current_robust_quantity is not null then
    v_rate_90:=case
      when coalesce(v_90.current_active_days,0)::numeric/v_exposure_90>=0.5
        then v_90.current_robust_quantity/v_exposure_90
      else coalesce(v_90.current_active_days,0)::numeric/v_exposure_90
        *coalesce(v_90.current_median_quantity,0)
    end;
  else
    v_rate_90:=coalesce(v_30.current_quantity/30.0,0);
  end if;

  v_demand:=round(greatest(0,0.6*v_rate_30+0.4*v_rate_90),5);
  v_observed:=round(greatest(0,coalesce(v_30.current_quantity,0)/30.0),5);
  v_active:=coalesce(v_90.current_active_days,v_30.current_active_days,0);
  v_orders:=coalesce(v_90.current_order_count,v_30.current_order_count,0);
  v_outlier_share:=case when coalesce(v_90.current_quantity,0)>0
    then least(1,coalesce(v_90.current_max_quantity,0)/v_90.current_quantity)
    else 0 end;
  v_outlier:=v_active>=2
    and coalesce(v_90.current_median_quantity,0)>0
    and coalesce(v_90.current_max_quantity,0)>=3*v_90.current_median_quantity
    and v_outlier_share>=0.6;
  v_confidence:=case
    when v_history_days<14 or v_active<3 or v_orders<3 then 'low'
    when v_history_days<60 or v_active<8 or v_orders<8 or v_outlier then 'medium'
    else 'high' end;

  select coalesce(sum(b.remaining),0),coalesce(sum(b.remaining_cost),0)::bigint
    into v_stock,v_value from public.inventory_batches b
  where b.company_id=p_company_id and b.stock_location_id=p_location_id
    and b.variant_id=p_variant_id and b.remaining>0;
  select max(day) into v_last from public.product_daily_facts
  where company_id=p_company_id and location_id=p_location_id
    and variant_id=p_variant_id and net_quantity>0;

  if coalesce(v_demand,0)<=0 then
    v_cover:=null;v_reorder:=null;
    if v_stock>0 then v_signal:='slow';v_reason:='no_recent_demand';
    else v_signal:='insufficient_history';v_reason:='insufficient_demand_history'; end if;
  else
    v_cover:=round(v_stock/v_demand,2);
    v_reorder:=greatest(0,ceil(v_demand*(v_lead+v_safety)-v_stock));
    if v_confidence='low' then v_reorder:=least(v_reorder,v_threshold); end if;
    if v_stock<=0 then v_signal:='stockout';v_reason:='demand_without_stock';
    elsif v_reorder>0 and v_cover<=v_lead then
      v_signal:='reorder';
      v_reason:=case when v_confidence='low' then 'low_confidence_reorder'
        when v_outlier then 'outlier_adjusted_reorder' else 'below_lead_time_cover' end;
    elsif v_reorder>0 then
      v_signal:='low_cover';
      v_reason:=case when v_confidence='low' then 'low_confidence_reorder'
        when v_outlier then 'outlier_adjusted_reorder' else 'below_target_cover' end;
    else v_signal:='healthy';v_reason:='stock_covers_target'; end if;
  end if;

  insert into public.product_attention(
    company_id,location_id,variant_id,signal,current_stock,current_value,
    average_daily_demand,days_of_cover,reorder_quantity,last_sale_date,reason_code,
    planning_daily_demand,observed_average_daily_demand,planning_window_days,
    demand_confidence,active_sale_days,order_count,outlier_detected,outlier_share
  ) values(
    p_company_id,p_location_id,p_variant_id,v_signal,v_stock,v_value,v_demand,v_cover,
    v_reorder,v_last,v_reason,v_demand,v_observed,90,v_confidence,v_active,v_orders,
    v_outlier,round(v_outlier_share,5)
  )
  on conflict(company_id,location_id,variant_id) do update set
    signal=excluded.signal,current_stock=excluded.current_stock,current_value=excluded.current_value,
    average_daily_demand=excluded.average_daily_demand,days_of_cover=excluded.days_of_cover,
    reorder_quantity=excluded.reorder_quantity,last_sale_date=excluded.last_sale_date,
    reason_code=excluded.reason_code,planning_daily_demand=excluded.planning_daily_demand,
    observed_average_daily_demand=excluded.observed_average_daily_demand,
    planning_window_days=excluded.planning_window_days,
    demand_confidence=excluded.demand_confidence,active_sale_days=excluded.active_sale_days,
    order_count=excluded.order_count,outlier_detected=excluded.outlier_detected,
    outlier_share=excluded.outlier_share,refreshed_at=now();
end;
$$;

revoke execute on function public.refresh_product_attention(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_product_attention(uuid,uuid,uuid) to service_role;

create or replace function public.product_performance(
  p_window_days integer default 30,
  p_location_id uuid default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company uuid:=public.current_company_id();
  v_finance boolean;
  v_limit integer:=least(greatest(coalesce(p_limit,10),1),25);
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_window_days not in (7,30,180,365) then raise exception 'invalid_product_window'; end if;
  if p_location_id is not null and not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  v_finance:=public.current_user_has_permission('ViewFinancials');

  with base as materialized (
    select m.location_id,l.name location_name,m.variant_id,v.product_id,
      p.name product_name,v.name variant_name,v.stock_unit,
      m.current_quantity::numeric current_quantity,
      coalesce(m.current_robust_quantity,m.current_quantity)::numeric robust_quantity,
      coalesce(m.previous_robust_quantity,m.previous_quantity)::numeric previous_robust_quantity,
      m.net_revenue::bigint revenue,m.margin::bigint margin,
      coalesce(m.current_order_count,0)::integer order_count,
      coalesce(m.current_active_days,0)::integer active_days,
      coalesce(a.current_stock,0)::numeric stock,
      coalesce(a.planning_daily_demand,a.average_daily_demand,0)::numeric planning_daily_demand,
      coalesce(a.demand_confidence,'low') confidence,
      coalesce(a.outlier_detected,false) outlier_detected,
      coalesce(a.outlier_share,0)::numeric outlier_share
    from public.product_window_metrics m
    join public.product_variants v on v.id=m.variant_id and v.company_id=m.company_id
    join public.products p on p.id=v.product_id and p.company_id=v.company_id
    join public.stock_locations l on l.id=m.location_id and l.company_id=m.company_id
    left join public.product_attention a on a.company_id=m.company_id
      and a.location_id=m.location_id and a.variant_id=m.variant_id
    where m.company_id=v_company and m.window_days=p_window_days
      and public.current_user_can_access_location(m.location_id)
      and (p_location_id is null or m.location_id=p_location_id)
      and v.active and p.active and v.track_inventory and v.kind<>'service'
  ), covered as materialized (
    select b.*,
      case when planning_daily_demand>0 then round(stock/planning_daily_demand,2) end days_of_cover
    from base b
  ), scored as materialized (
    select c.*,
      (0.5*percent_rank() over(order by robust_quantity-previous_robust_quantity)
       +0.3*percent_rank() over(order by robust_quantity)
       +0.2*percent_rank() over(order by order_count+active_days))::numeric trend_score
    from covered c
  ), eligible_trending as materialized (
    select * from covered where order_count>=3 and active_days>=2
      and confidence<>'low' and robust_quantity>previous_robust_quantity
  ), trending_scored as materialized (
    select e.*,
      (0.5*percent_rank() over(order by robust_quantity-previous_robust_quantity)
       +0.3*percent_rank() over(order by robust_quantity)
       +0.2*percent_rank() over(order by order_count+active_days))::numeric trend_score
    from eligible_trending e
  ), trending as (
    select * from trending_scored
    order by trend_score desc,robust_quantity desc,order_count desc,variant_id,location_id
    limit v_limit
  ), volume as (
    select * from scored where robust_quantity>0
    order by robust_quantity desc,current_quantity desc,order_count desc,variant_id,location_id
    limit v_limit
  ), margin_leaders as (
    select * from scored where v_finance and order_count>=2 and active_days>=2
      and confidence<>'low' and margin>0
    order by margin desc,robust_quantity desc,order_count desc,variant_id,location_id limit v_limit
  ), consistent as (
    select * from scored where robust_quantity>0
    order by active_days::numeric/p_window_days desc,order_count desc,robust_quantity desc,
      variant_id,location_id
    limit v_limit
  )
  select jsonb_build_object(
    'windowDays',p_window_days,'generatedAt',now(),
    'leaders',jsonb_build_object(
      'trending',coalesce((select jsonb_agg(
        (to_jsonb(t)-'confidence'-'revenue'-'margin')||jsonb_build_object(
          'confidence',t.confidence,'revenue',case when v_finance then t.revenue end,
          'margin',case when v_finance then t.margin end)
        order by t.trend_score desc,t.variant_id,t.location_id) from trending t),'[]'::jsonb),
      'volume',coalesce((select jsonb_agg(
        (to_jsonb(t)-'confidence'-'revenue'-'margin')||jsonb_build_object(
          'confidence',t.confidence,'revenue',case when v_finance then t.revenue end,
          'margin',case when v_finance then t.margin end)
        order by t.robust_quantity desc,t.current_quantity desc,t.variant_id,t.location_id)
        from volume t),'[]'::jsonb),
      'margin',coalesce((select jsonb_agg(
        (to_jsonb(t)-'confidence'-'revenue'-'margin')||jsonb_build_object(
          'confidence',t.confidence,'revenue',case when v_finance then t.revenue end,
          'margin',case when v_finance then t.margin end)
        order by t.margin desc,t.variant_id,t.location_id) from margin_leaders t),'[]'::jsonb),
      'consistent',coalesce((select jsonb_agg(
        (to_jsonb(t)-'confidence'-'revenue'-'margin')||jsonb_build_object(
          'confidence',t.confidence,'revenue',case when v_finance then t.revenue end,
          'margin',case when v_finance then t.margin end)
        order by t.active_days::numeric/p_window_days desc,t.order_count desc,t.variant_id,
          t.location_id)
        from consistent t),'[]'::jsonb)
    ),'financialsIncluded',v_finance
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.product_performance(integer,uuid,integer) from public,anon;
grant execute on function public.product_performance(integer,uuid,integer) to authenticated;

-- Preserve the existing product directory contract and add planning evidence.
create or replace function public.product_intelligence(
  p_window_days integer default 30,
  p_location_id uuid default null,
  p_supplier_id uuid default null,
  p_manufacturer_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_since date default null,
  p_until date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company uuid:=public.current_company_id();v_finance boolean;v_timezone text;v_today date;
  v_custom boolean:=p_since is not null or p_until is not null;v_since date;v_until date;
  v_days integer;v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  select business_timezone into v_timezone from public.companies where id=v_company;
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  if v_custom then
    if p_since is null or p_until is null or p_since>p_until then
      raise exception 'invalid_product_period';
    end if;
    if p_until>v_today then raise exception 'product_period_in_future'; end if;
    v_days:=p_until-p_since+1;
    if v_days>365 then raise exception 'product_period_too_large'; end if;
    v_since:=p_since;v_until:=p_until;
  else
    if p_window_days not in (7,30,180,365) then raise exception 'invalid_product_window'; end if;
    v_days:=p_window_days;v_until:=v_today;v_since:=v_today-(p_window_days-1);
  end if;
  v_finance:=public.current_user_has_permission('ViewFinancials');

  with rows as materialized (
    select v.id variant_id,v.product_id,p.name product_name,v.name variant_name,v.stock_unit,
      p.manufacturer_id,mf.name manufacturer_name,preferred.supplier_id preferred_supplier_id,
      preferred.supplier_name preferred_supplier_name,
      coalesce(case when v_custom then custom.current_quantity else w.current_quantity end,0)
        current_quantity,
      coalesce(case when v_custom then custom.previous_quantity else w.previous_quantity end,0)
        previous_quantity,
      case when v_finance then coalesce(
        case when v_custom then custom.gross_revenue else w.gross_revenue end,0) end gross_revenue,
      case when v_finance then coalesce(
        case when v_custom then custom.refund_amount else w.refund_amount end,0) end refund_amount,
      case when v_finance then coalesce(
        case when v_custom then custom.net_revenue else w.net_revenue end,0) end net_revenue,
      case when v_finance then coalesce(
        case when v_custom then custom.corrected_cogs else w.corrected_cogs end,0) end corrected_cogs,
      case when v_finance then coalesce(
        case when v_custom then custom.margin else w.margin end,0) end margin,
      a.signal,coalesce(a.current_stock,0) current_stock,
      case when v_finance then coalesce(a.current_value,0) end current_value,
      a.days_of_cover,a.reorder_quantity,a.last_sale_date,a.reason_code,
      coalesce(a.planning_daily_demand,a.average_daily_demand) planning_daily_demand,
      coalesce(a.observed_average_daily_demand,a.average_daily_demand)
        observed_average_daily_demand,
      coalesce(a.planning_window_days,30) planning_window_days,
      a.demand_confidence,a.active_sale_days,a.order_count,a.outlier_detected,a.outlier_share,
      greatest(coalesce(case when v_custom then custom.refreshed_at else w.refreshed_at end,
        a.refreshed_at),a.refreshed_at) refreshed_at,
      case a.signal when 'stockout' then 1 when 'reorder' then 2 when 'low_cover' then 3
        when 'insufficient_history' then 4 when 'slow' then 5 else 6 end priority
    from public.product_variants v
    join public.products p on p.id=v.product_id and p.company_id=v.company_id
    left join public.manufacturers mf on mf.id=p.manufacturer_id and mf.company_id=p.company_id
    left join public.product_window_metrics w on not v_custom and w.company_id=v.company_id
      and w.location_id=p_location_id and w.variant_id=v.id and w.window_days=p_window_days
    left join lateral (
      select
        coalesce(sum(f.net_quantity) filter(where f.day between v_since and v_until),0)
          current_quantity,
        coalesce(sum(f.net_quantity) filter(
          where f.day between v_since-v_days and v_since-1),0) previous_quantity,
        coalesce(sum(f.gross_revenue) filter(where f.day between v_since and v_until),0)::bigint
          gross_revenue,
        coalesce(sum(f.refund_amount) filter(where f.day between v_since and v_until),0)::bigint
          refund_amount,
        coalesce(sum(f.net_revenue) filter(where f.day between v_since and v_until),0)::bigint
          net_revenue,
        coalesce(sum(f.corrected_cogs) filter(where f.day between v_since and v_until),0)::bigint
          corrected_cogs,
        coalesce(sum(f.margin) filter(where f.day between v_since and v_until),0)::bigint margin,
        max(f.refreshed_at) refreshed_at
      from public.product_daily_facts f where v_custom and f.company_id=v.company_id
        and f.location_id=p_location_id and f.variant_id=v.id
        and f.day between v_since-v_days and v_until
    ) custom on v_custom
    left join public.product_attention a on a.company_id=v.company_id
      and a.location_id=p_location_id and a.variant_id=v.id
    left join lateral (
      select pu.supplier_id,
        trim(concat_ws(' ',supplier.first_name,supplier.last_name)) supplier_name
      from public.purchase_lines pl
      join public.purchases pu on pu.id=pl.purchase_id and pu.company_id=pl.company_id
      join public.customers supplier on supplier.id=pu.supplier_id
        and supplier.company_id=pu.company_id
      where pl.company_id=v.company_id and pl.variant_id=v.id and pu.status='posted'
        and (p_supplier_id is null or pu.supplier_id=p_supplier_id)
      order by pu.purchase_date desc,pu.created_at desc,pu.id desc limit 1
    ) preferred on true
    where v.company_id=v_company and v.active and p.active and v.kind<>'service'
      and v.track_inventory
      and (p_search is null or p.name ilike '%'||p_search||'%'
        or v.name ilike '%'||p_search||'%' or v.sku ilike '%'||p_search||'%')
      and (p_manufacturer_id is null or p.manufacturer_id=p_manufacturer_id)
      and (p_supplier_id is null or preferred.supplier_id is not null)
  ), page as (
    select * from rows order by priority,days_of_cover nulls last,current_quantity desc,variant_id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'windowDays',v_days,'since',v_since,'until',v_until,
    'summary',(select jsonb_build_object(
      'trackedVariants',count(*),
      'needsAttention',count(*) filter(where signal in ('stockout','reorder','low_cover')),
      'stockouts',count(*) filter(where signal='stockout'),
      'unitsSold',coalesce(sum(current_quantity),0),'stockOnHand',coalesce(sum(current_stock),0),
      'stockValue',case when v_finance then coalesce(sum(current_value),0) end,
      'netRevenue',case when v_finance then coalesce(sum(net_revenue),0) end,
      'margin',case when v_finance then coalesce(sum(margin),0) end) from rows),
    'items',coalesce((select jsonb_agg(to_jsonb(page)-'priority'
      order by priority,days_of_cover nulls last,current_quantity desc,variant_id) from page),'[]'::jsonb),
    'nextOffset',case when exists(select 1 from rows offset(v_offset+v_limit) limit 1)
      then v_offset+v_limit else null end,
    'financialsIncluded',v_finance
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  from public,anon;
grant execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  to authenticated;

-- Backfill only known variant/location pairs through the bounded dirty-bucket worker.
with tracked_variants as materialized (
  select v.company_id,v.id variant_id
  from public.product_variants v
  join public.products p on p.id=v.product_id and p.company_id=v.company_id and p.active
  where v.active and v.track_inventory and v.kind<>'service'
), relevant_pairs as materialized (
  select f.company_id,f.location_id,f.variant_id
  from public.product_daily_facts f
  join tracked_variants v on v.company_id=f.company_id and v.variant_id=f.variant_id
  union
  select b.company_id,b.stock_location_id,b.variant_id
  from public.inventory_batches b
  join tracked_variants v on v.company_id=b.company_id and v.variant_id=b.variant_id
  where b.stock_location_id is not null
  union
  select a.company_id,a.location_id,a.variant_id
  from public.product_attention a
  join tracked_variants v on v.company_id=a.company_id and v.variant_id=a.variant_id
  union
  select m.company_id,m.location_id,m.variant_id
  from public.product_window_metrics m
  join tracked_variants v on v.company_id=m.company_id and v.variant_id=m.variant_id
  union
  select i.company_id,i.location_id,i.variant_id
  from public.inventory_position_days i
  join tracked_variants v on v.company_id=i.company_id and v.variant_id=i.variant_id
)
insert into public.analytics_dirty_buckets(
  company_id,location_id,day,variant_id,sales_dirty,attention_dirty,position_dirty,reason
)
select r.company_id,r.location_id,(now() at time zone c.business_timezone)::date,r.variant_id,
  true,true,false,'robust_product_intelligence_backfill'
from relevant_pairs r
join public.companies c on c.id=r.company_id
join public.stock_locations l on l.id=r.location_id and l.company_id=r.company_id and l.is_active
on conflict(company_id,location_id,day,variant_id) do update set
  sales_dirty=true,attention_dirty=true,
  available_at=least(public.analytics_dirty_buckets.available_at,now()),
  reason='robust_product_intelligence_backfill';

-- Force cached dashboard snapshots to rebuild after the additive contract change.
update public.dashboard_snapshot_cache set catalog_sequence=-1;
