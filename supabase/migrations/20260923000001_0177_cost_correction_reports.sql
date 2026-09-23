-- Cost corrections are appended as credits, never edits to posted journal amounts.
-- Keep existing report shapes, tenancy checks, and sale/void attribution.
-- Gross-sales reports retain their existing treatment of refund journals:
-- only sale-cost correction credits restate the original sale's buying cost.
drop view public.rpt_daily_sales_summary;
drop view public.rpt_daily_product_sales;
drop materialized view public.mv_daily_sales_summary;
drop materialized view public.mv_daily_product_sales;

create materialized view public.mv_daily_sales_summary as
select o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::integer as orders, coalesce(sum(o.total),0)::bigint as revenue,
  coalesce(sum(c.cogs),0)::bigint as cogs,
  (coalesce(sum(o.total),0)-coalesce(sum(c.cogs),0))::bigint as margin
from public.orders o
left join lateral (
  select sum(l.debit-case when e.source_type='InventorySaleCogsCorrection' then l.credit else 0 end) as cogs
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  join public.ledger_journal_entries e on e.id=l.entry_id
  where a.code='COGS' and l.order_id=o.id
) c on true
where o.status='completed'
group by o.company_id,(o.created_at at time zone 'Africa/Nairobi')::date;
create unique index mv_daily_sales_summary_idx on public.mv_daily_sales_summary(company_id,day);

create materialized view public.mv_daily_product_sales as
select o.company_id,(o.created_at at time zone 'Africa/Nairobi')::date as day,l.variant_id,
  coalesce(sum(l.stock_quantity),0) as quantity,
  coalesce(sum(l.line_total),0)::bigint as revenue,
  coalesce(sum(round(c.cogs*l.line_total::numeric/nullif(o.total,0)::numeric)),0)::bigint as cogs
from public.orders o join public.order_lines l on l.order_id=o.id
left join lateral (
  select sum(jl.debit-case when e.source_type='InventorySaleCogsCorrection' then jl.credit else 0 end) as cogs
  from public.ledger_journal_lines jl join public.ledger_accounts a on a.id=jl.account_id
  join public.ledger_journal_entries e on e.id=jl.entry_id
  where a.code='COGS' and jl.order_id=o.id
) c on true
where o.status='completed'
group by o.company_id,(o.created_at at time zone 'Africa/Nairobi')::date,l.variant_id;
create unique index mv_daily_product_sales_idx on public.mv_daily_product_sales(company_id,day,variant_id);
revoke all on public.mv_daily_sales_summary,public.mv_daily_product_sales from public,anon,authenticated;

create view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where (company_id=(select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
  or (select public.is_platform_admin());
create view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where (company_id=(select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
  or (select public.is_platform_admin());
revoke all on public.rpt_daily_sales_summary,public.rpt_daily_product_sales from public,anon,authenticated;
grant select on public.rpt_daily_sales_summary,public.rpt_daily_product_sales to authenticated;

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
      coalesce(sum(l.debit-case when e.source_type='InventorySaleCogsCorrection' then l.credit else 0 end)
        filter (where a.code = 'COGS'), 0)::bigint as cogs
    from completed_orders o
    left join public.ledger_journal_lines l
      on l.company_id = o.company_id and l.order_id = o.id
    left join public.ledger_accounts a
      on a.id = l.account_id and a.company_id = o.company_id
    left join public.ledger_journal_entries e on e.id=l.entry_id
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
      select sum(l.debit-l.credit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.order_id = o.id
        and exists (
          select 1 from public.ledger_journal_entries e
          where e.id = l.entry_id and e.source_type in ('InventorySaleCogs','InventorySaleCogsCorrection')
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
      select sum(l.debit-l.credit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      join public.ledger_journal_entries ce on ce.id = l.entry_id
      where l.order_id = o.id and ce.source_type in ('InventorySaleCogs','InventorySaleCogsCorrection')
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

