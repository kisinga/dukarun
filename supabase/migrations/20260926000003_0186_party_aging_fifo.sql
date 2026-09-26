-- Age only balances remaining after document-linked settlements, unlinked
-- corrections, and overpayments have been applied oldest-first.

drop view if exists public.customer_credit_aging;
create view public.customer_credit_aging with (security_invoker = true) as
with ar_lines as (
  select
    l.company_id,
    (l.meta ->> 'customerId')::uuid as customer_id,
    l.order_id,
    e.id as entry_id,
    e.entry_date,
    (l.debit - l.credit)::numeric as signed_balance,
    o.receivable_kind
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id = l.account_id and a.company_id = l.company_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  left join public.orders o
    on o.id = l.order_id and o.company_id = l.company_id
  where a.code = 'ACCOUNTS_RECEIVABLE'
    and l.meta ? 'customerId'
), items as (
  select
    company_id,
    customer_id,
    'order:' || order_id::text as item_key,
    min(entry_date) as item_date,
    sum(signed_balance) as balance
  from ar_lines
  where order_id is not null and receivable_kind = 'credit'
  group by company_id, customer_id, order_id

  union all

  select
    company_id,
    customer_id,
    'entry:' || entry_id::text as item_key,
    entry_date as item_date,
    sum(signed_balance) as balance
  from ar_lines
  where order_id is null
  group by company_id, customer_id, entry_id, entry_date
), pools as (
  select
    company_id,
    customer_id,
    coalesce(sum(-balance) filter (where balance < 0), 0::numeric) as credit_pool
  from items
  group by company_id, customer_id
), ranked as (
  select
    i.*,
    p.credit_pool,
    coalesce(
      sum(i.balance) over (
        partition by i.company_id, i.customer_id
        order by i.item_date, i.item_key
        rows between unbounded preceding and 1 preceding
      ),
      0::numeric
    ) as positive_before
  from items i
  join pools p using (company_id, customer_id)
  where i.balance > 0
), remaining as (
  select
    company_id,
    customer_id,
    item_date,
    greatest(
      balance - greatest(credit_pool - positive_before, 0::numeric),
      0::numeric
    ) as balance
  from ranked
), aged as (
  select
    company_id,
    customer_id,
    sum(balance)::bigint as balance,
    min(item_date) as oldest_unpaid_date
  from remaining
  where balance > 0
  group by company_id, customer_id
)
select
  aged.company_id,
  aged.customer_id,
  aged.balance,
  aged.oldest_unpaid_date,
  (business.today - aged.oldest_unpaid_date)::integer as days_outstanding,
  case
    when business.today - aged.oldest_unpaid_date <= 7 then 'current'
    when business.today - aged.oldest_unpaid_date <= 30 then '8-30'
    when business.today - aged.oldest_unpaid_date <= 60 then '31-60'
    else '60+'
  end as bucket
from aged
join public.companies company on company.id = aged.company_id
cross join lateral (
  select (now() at time zone company.business_timezone)::date as today
) business;

drop view if exists public.supplier_ap_aging;
create view public.supplier_ap_aging with (security_invoker = true) as
with ap_lines as (
  select
    l.company_id,
    (l.meta ->> 'supplierId')::uuid as supplier_id,
    nullif(l.meta ->> 'purchaseId', '') as purchase_id,
    e.id as entry_id,
    e.entry_date,
    e.source_type,
    l.meta ->> 'reason' as reason,
    (l.credit - l.debit)::numeric as signed_balance
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id = l.account_id and a.company_id = l.company_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_PAYABLE'
    and l.meta ? 'supplierId'
), items as (
  select
    company_id,
    supplier_id,
    'purchase:' || purchase_id as item_key,
    min(entry_date) as item_date,
    sum(signed_balance) as balance
  from ap_lines
  where purchase_id is not null
  group by company_id, supplier_id, purchase_id

  union all

  select
    company_id,
    supplier_id,
    'adjustment:' || coalesce(reason, entry_id::text) as item_key,
    min(entry_date) as item_date,
    sum(signed_balance) as balance
  from ap_lines
  where purchase_id is null
    and source_type like '%SupplierBalanceAdjustment%'
  group by company_id, supplier_id, coalesce(reason, entry_id::text)

  union all

  select
    company_id,
    supplier_id,
    'entry:' || entry_id::text as item_key,
    entry_date as item_date,
    sum(signed_balance) as balance
  from ap_lines
  where purchase_id is null
    and source_type not like '%SupplierBalanceAdjustment%'
  group by company_id, supplier_id, entry_id, entry_date
), pools as (
  select
    company_id,
    supplier_id,
    coalesce(sum(-balance) filter (where balance < 0), 0::numeric) as credit_pool
  from items
  group by company_id, supplier_id
), ranked as (
  select
    i.*,
    p.credit_pool,
    coalesce(
      sum(i.balance) over (
        partition by i.company_id, i.supplier_id
        order by i.item_date, i.item_key
        rows between unbounded preceding and 1 preceding
      ),
      0::numeric
    ) as positive_before
  from items i
  join pools p using (company_id, supplier_id)
  where i.balance > 0
), remaining as (
  select
    company_id,
    supplier_id,
    item_date,
    greatest(
      balance - greatest(credit_pool - positive_before, 0::numeric),
      0::numeric
    ) as balance
  from ranked
), aged as (
  select
    company_id,
    supplier_id,
    sum(balance)::bigint as balance,
    min(item_date) as oldest_unpaid_date
  from remaining
  where balance > 0
  group by company_id, supplier_id
)
select
  aged.company_id,
  aged.supplier_id,
  aged.balance,
  aged.oldest_unpaid_date,
  (business.today - aged.oldest_unpaid_date)::integer as days_outstanding,
  case
    when business.today - aged.oldest_unpaid_date <= 7 then 'current'
    when business.today - aged.oldest_unpaid_date <= 30 then '8-30'
    when business.today - aged.oldest_unpaid_date <= 60 then '31-60'
    else '60+'
  end as bucket
from aged
join public.companies company on company.id = aged.company_id
cross join lateral (
  select (now() at time zone company.business_timezone)::date as today
) business;

revoke all on public.customer_credit_aging, public.supplier_ap_aging from public, anon;
grant select on public.customer_credit_aging, public.supplier_ap_aging
  to authenticated, service_role;
