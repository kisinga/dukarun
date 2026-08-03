-- 0030_live_dashboard.sql
-- The reporting MVs remain the source for heavier report screens and refresh
-- hourly. The operational dashboard needs read-after-write consistency, so it
-- gets a small, tenant-scoped live snapshot built from the source tables.

create or replace function public.dashboard_sales_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      coalesce(sum(l.quantity), 0) as quantity,
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
$$;

revoke execute on function public.dashboard_sales_snapshot(date) from anon, public;
grant execute on function public.dashboard_sales_snapshot(date) to authenticated;

-- Keep supplier screens in sync across tabs/users. Local writes already reload
-- after their RPC completes; these publications cover external changes too.
alter publication supabase_realtime add table public.purchases;
alter publication supabase_realtime add table public.purchase_payments;

