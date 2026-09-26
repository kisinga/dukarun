-- Keep preset inventory reads on precomputed window rows, while allowing an
-- explicitly selected custom period to aggregate the sparse daily facts.
drop function if exists public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer);

create function public.product_intelligence(
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
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_finance boolean;
  v_timezone text;
  v_today date;
  v_custom boolean := p_since is not null or p_until is not null;
  v_since date;
  v_until date;
  v_days integer;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;

  select business_timezone into v_timezone
  from public.companies
  where id = v_company;
  v_today := (now() at time zone coalesce(v_timezone, 'Africa/Nairobi'))::date;

  if v_custom then
    if p_since is null or p_until is null then
      raise exception 'invalid_product_period';
    end if;
    if p_since > p_until then
      raise exception 'invalid_product_period';
    end if;
    if p_until > v_today then
      raise exception 'product_period_in_future';
    end if;
    v_days := p_until - p_since + 1;
    if v_days > 365 then
      raise exception 'product_period_too_large';
    end if;
    v_since := p_since;
    v_until := p_until;
  else
    if p_window_days not in (7, 30, 180, 365) then
      raise exception 'invalid_product_window';
    end if;
    v_days := p_window_days;
    v_until := v_today;
    v_since := v_today - (p_window_days - 1);
  end if;

  v_finance := public.current_user_has_permission('ViewFinancials');

  with rows as materialized (
    select
      v.id as variant_id,
      v.product_id,
      p.name as product_name,
      v.name as variant_name,
      v.stock_unit,
      p.manufacturer_id,
      mf.name as manufacturer_name,
      preferred.supplier_id as preferred_supplier_id,
      preferred.supplier_name as preferred_supplier_name,
      coalesce(
        case when v_custom then custom.current_quantity else w.current_quantity end,
        0
      ) as current_quantity,
      coalesce(
        case when v_custom then custom.previous_quantity else w.previous_quantity end,
        0
      ) as previous_quantity,
      case when v_finance then coalesce(
        case when v_custom then custom.gross_revenue else w.gross_revenue end,
        0
      ) end as gross_revenue,
      case when v_finance then coalesce(
        case when v_custom then custom.refund_amount else w.refund_amount end,
        0
      ) end as refund_amount,
      case when v_finance then coalesce(
        case when v_custom then custom.net_revenue else w.net_revenue end,
        0
      ) end as net_revenue,
      case when v_finance then coalesce(
        case when v_custom then custom.corrected_cogs else w.corrected_cogs end,
        0
      ) end as corrected_cogs,
      case when v_finance then coalesce(
        case when v_custom then custom.margin else w.margin end,
        0
      ) end as margin,
      a.signal,
      coalesce(a.current_stock, 0) as current_stock,
      case when v_finance then coalesce(a.current_value, 0) end as current_value,
      a.days_of_cover,
      a.reorder_quantity,
      a.last_sale_date,
      a.reason_code,
      greatest(
        coalesce(
          case when v_custom then custom.refreshed_at else w.refreshed_at end,
          a.refreshed_at
        ),
        a.refreshed_at
      ) as refreshed_at,
      case a.signal
        when 'stockout' then 1
        when 'reorder' then 2
        when 'low_cover' then 3
        when 'insufficient_history' then 4
        when 'slow' then 5
        else 6
      end as priority
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.company_id = v.company_id
    left join public.manufacturers mf
      on mf.id = p.manufacturer_id and mf.company_id = p.company_id
    left join public.product_window_metrics w
      on not v_custom
     and w.company_id = v.company_id
     and w.location_id = p_location_id
     and w.variant_id = v.id
     and w.window_days = p_window_days
    left join lateral (
      select
        coalesce(sum(f.net_quantity) filter (
          where f.day between v_since and v_until
        ), 0) as current_quantity,
        coalesce(sum(f.net_quantity) filter (
          where f.day between v_since - v_days and v_since - 1
        ), 0) as previous_quantity,
        coalesce(sum(f.gross_revenue) filter (
          where f.day between v_since and v_until
        ), 0)::bigint as gross_revenue,
        coalesce(sum(f.refund_amount) filter (
          where f.day between v_since and v_until
        ), 0)::bigint as refund_amount,
        coalesce(sum(f.net_revenue) filter (
          where f.day between v_since and v_until
        ), 0)::bigint as net_revenue,
        coalesce(sum(f.corrected_cogs) filter (
          where f.day between v_since and v_until
        ), 0)::bigint as corrected_cogs,
        coalesce(sum(f.margin) filter (
          where f.day between v_since and v_until
        ), 0)::bigint as margin,
        max(f.refreshed_at) as refreshed_at
      from public.product_daily_facts f
      where v_custom
        and f.company_id = v.company_id
        and f.location_id = p_location_id
        and f.variant_id = v.id
        and f.day between v_since - v_days and v_until
    ) custom on v_custom
    left join public.product_attention a
      on a.company_id = v.company_id
     and a.location_id = p_location_id
     and a.variant_id = v.id
    left join lateral (
      select
        pu.supplier_id,
        trim(concat_ws(' ', supplier.first_name, supplier.last_name)) as supplier_name
      from public.purchase_lines pl
      join public.purchases pu
        on pu.id = pl.purchase_id and pu.company_id = pl.company_id
      join public.customers supplier
        on supplier.id = pu.supplier_id and supplier.company_id = pu.company_id
      where pl.company_id = v.company_id
        and pl.variant_id = v.id
        and pu.status = 'posted'
        and (p_supplier_id is null or pu.supplier_id = p_supplier_id)
      order by pu.purchase_date desc, pu.created_at desc, pu.id desc
      limit 1
    ) preferred on true
    where v.company_id = v_company
      and v.active
      and p.active
      and v.kind <> 'service'
      and v.track_inventory
      and (
        p_search is null
        or p.name ilike '%' || p_search || '%'
        or v.name ilike '%' || p_search || '%'
        or v.sku ilike '%' || p_search || '%'
      )
      and (p_manufacturer_id is null or p.manufacturer_id = p_manufacturer_id)
      and (p_supplier_id is null or preferred.supplier_id is not null)
  ), page as (
    select *
    from rows
    order by priority, days_of_cover nulls last, current_quantity desc, variant_id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'windowDays', v_days,
    'since', v_since,
    'until', v_until,
    'summary', (
      select jsonb_build_object(
        'trackedVariants', count(*),
        'needsAttention', count(*) filter (
          where signal in ('stockout', 'reorder', 'low_cover')
        ),
        'stockouts', count(*) filter (where signal = 'stockout'),
        'unitsSold', coalesce(sum(current_quantity), 0),
        'stockOnHand', coalesce(sum(current_stock), 0),
        'stockValue', case when v_finance then coalesce(sum(current_value), 0) end,
        'netRevenue', case when v_finance then coalesce(sum(net_revenue), 0) end,
        'margin', case when v_finance then coalesce(sum(margin), 0) end
      )
      from rows
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(page) - 'priority'
        order by priority, days_of_cover nulls last, current_quantity desc, variant_id)
      from page
    ), '[]'::jsonb),
    'nextOffset', case
      when exists (select 1 from rows offset (v_offset + v_limit) limit 1)
        then v_offset + v_limit
      else null
    end,
    'financialsIncluded', v_finance
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  from public, anon;
grant execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  to authenticated;
