-- 0023_aging_settings.sql
-- Sprint 6: credit aging views (customer AR + supplier AP) and the
-- payment-method settings RPC.

-- ---------------------------------------------------------------------------
-- customer_credit_aging: per customer — balance, oldest unpaid credit order,
-- days outstanding, bucket. Per-order AR balances from journal lines
-- (order_id column), oldest by entry_date.
-- ---------------------------------------------------------------------------
create view public.customer_credit_aging
with (security_invoker = true) as
with per_order as (
  select
    l.company_id,
    l.meta ->> 'customerId' as customer_id,
    l.order_id,
    sum(l.debit) - sum(l.credit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id is not null
  group by l.company_id, l.meta ->> 'customerId', l.order_id
)
select
  company_id,
  customer_id::uuid as customer_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_order
where balance > 0
group by company_id, customer_id;

-- ---------------------------------------------------------------------------
-- supplier_ap_aging: mirror for AP (per purchase, meta purchaseId).
-- ---------------------------------------------------------------------------
create view public.supplier_ap_aging
with (security_invoker = true) as
with per_purchase as (
  select
    l.company_id,
    l.meta ->> 'supplierId' as supplier_id,
    l.meta ->> 'purchaseId' as purchase_id,
    sum(l.credit) - sum(l.debit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_PAYABLE'
    and l.meta ? 'purchaseId'
  group by l.company_id, l.meta ->> 'supplierId', l.meta ->> 'purchaseId'
)
select
  company_id,
  supplier_id::uuid as supplier_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_purchase
where balance > 0
group by company_id, supplier_id;

grant select on public.customer_credit_aging to authenticated;
grant select on public.supplier_ap_aging to authenticated;

-- ---------------------------------------------------------------------------
-- update_payment_method: enable/disable + reconciliation flag.
-- ---------------------------------------------------------------------------
create or replace function public.update_payment_method(
  p_code text,
  p_enabled boolean default null,
  p_requires_reconciliation boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_payment_method(text, boolean, boolean) from anon, public;
grant execute on function public.update_payment_method(text, boolean, boolean) to authenticated;
