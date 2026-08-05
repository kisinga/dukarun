-- 0015_staff_held_sales.sql
-- Surface held (still unpaid) sales per staff member on the performance
-- leaderboard: orders sitting in the cashier queue (status 'pending_payment').
-- Adds held_count / held_value to staff_sales_performance. The returns table
-- changes, so the function must be dropped before re-creation; grants are
-- re-applied exactly as in the original definition (0003_sales.sql).

drop function public.staff_sales_performance(date, date);

create or replace function public.staff_sales_performance(
  p_from date,
  p_to date
)
returns table (
  staff_user_id uuid,
  display_name text,
  role_name text,
  authorization_status text,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  cogs bigint,
  margin bigint,
  collected bigint,
  credit_sales bigint,
  voids integer,
  average_sale bigint,
  held_count integer,
  held_value bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
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
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
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
$$;

revoke execute on function public.staff_sales_performance(date, date) from anon, public;
grant execute on function public.staff_sales_performance(date, date) to authenticated;
