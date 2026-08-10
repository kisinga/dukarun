-- Company-scoped, ledger-authoritative customer statement. The drawer reads a
-- bounded page; explicit "load older" and print actions follow the cursor.

drop function if exists public.customer_statement(uuid);
drop function if exists public.customer_statement(uuid, timestamptz, uuid, integer);
create function public.customer_statement(
  p_customer_id uuid,
  p_before_date timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 25
)
returns table(
  id uuid,
  date timestamptz,
  reference text,
  description text,
  debit bigint,
  credit bigint,
  balance bigint,
  has_more boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if (p_before_date is null) <> (p_before_id is null) then
    raise exception 'invalid_statement_cursor';
  end if;

  return query
  with entries as materialized (
    select
      jl.id,
      je.posted_at as occurred_at,
      case
        when je.source_type in ('Payment', 'PaymentAllocation', 'PaymentReversal')
          then coalesce(p.reference, jl.meta ->> 'orderCode', je.source_id)
        else coalesce(jl.meta ->> 'orderCode', je.source_id)
      end as entry_reference,
      case je.source_type
        when 'CreditSale' then 'Credit sale'
        when 'Payment' then 'Payment received'
        when 'PaymentAllocation' then 'Payment received'
        when 'PaymentReversal' then 'Reversed payment'
        when 'OrderReversal' then 'Voided sale'
        when 'BalanceAdjustment' then coalesce(je.memo, 'Balance adjustment')
        else coalesce(je.memo, initcap(regexp_replace(je.source_type, '([a-z])([A-Z])', '\1 \2', 'g')))
      end as entry_description,
      jl.debit::bigint,
      jl.credit::bigint
    from public.ledger_journal_lines jl
    join public.ledger_journal_entries je
      on je.id = jl.entry_id and je.company_id = jl.company_id
    join public.ledger_accounts la
      on la.id = jl.account_id and la.company_id = jl.company_id
    left join public.payments p
      on je.source_type in ('Payment', 'PaymentAllocation', 'PaymentReversal')
      and p.company_id = jl.company_id
      and p.id::text = regexp_replace(je.source_id, '-reversal$', '')
    where jl.company_id = v_company_id
      and la.code = 'ACCOUNTS_RECEIVABLE'
      and jl.meta @> jsonb_build_object('customerId', p_customer_id)
  ), page_source as materialized (
    select e.*
    from entries e
    where p_before_date is null
      or (e.occurred_at, e.id) < (p_before_date, p_before_id)
    order by e.occurred_at desc, e.id desc
    limit v_limit + 1
  ), numbered_page as (
    select
      ps.*,
      row_number() over (order by ps.occurred_at desc, ps.id desc) as row_number,
      count(*) over () > v_limit as page_has_more
    from page_source ps
  ), visible_page as (
    select np.*
    from numbered_page np
    where np.row_number <= v_limit
  ), newest as (
    select vp.occurred_at, vp.id
    from visible_page vp
    order by vp.occurred_at desc, vp.id desc
    limit 1
  ), anchor as (
    select coalesce(sum(e.debit - e.credit), 0)::bigint as opening_balance
    from entries e
    cross join newest n
    where (e.occurred_at, e.id) <= (n.occurred_at, n.id)
  )
  select
    vp.id,
    vp.occurred_at,
    vp.entry_reference,
    vp.entry_description,
    vp.debit,
    vp.credit,
    (
      a.opening_balance - coalesce(sum(vp.debit - vp.credit) over (
        order by vp.occurred_at desc, vp.id desc
        rows between unbounded preceding and 1 preceding
      ), 0)
    )::bigint as balance,
    vp.page_has_more
  from visible_page vp
  cross join anchor a
  order by vp.occurred_at desc, vp.id desc;
end;
$$;

revoke execute on function public.customer_statement(uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.customer_statement(uuid, timestamptz, uuid, integer)
  to authenticated;

comment on function public.customer_statement(uuid, timestamptz, uuid, integer) is
  'Returns a cursor-paged AR-ledger statement for one customer; requires ViewFinancials.';
