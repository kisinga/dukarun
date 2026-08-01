-- Money ops tests (migration 0007): expenses, transfers, refunds, reversals,
-- balance adjustments, posting idempotency.
begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@mops.local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@mops.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table mops_company as select public.provision_company('Mops Co', 'Main') as company_id;
reset role;

insert into public.roles (company_id, name, permissions)
select company_id, 'Cashier', '{SettleOrder}' from mops_company;
insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
select p.company_id, '22222222-2222-2222-2222-222222222222', r.id, 'approved'
from mops_company p, public.roles r where r.company_id = p.company_id and r.name = 'Cashier';

insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-0000000000bb', company_id, 'Service', 'SVC', 10000, false from mops_company;

create temp table mops_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from mops_company;
grant select on pg_temp.mops_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from mops_claims), true);

-- Seed cash via a sale so transfer/expense sources have balances (not required
-- by the ledger, but keeps scenarios realistic).
select public.post_sale(null,
  '[{"product_id":"a0000000-0000-0000-0000-0000000000bb","quantity":10,"unit_price":10000}]',
  '[{"method":"cash","amount":100000}]');

-- 1-2. Expense: DR EXPENSES / CR CASH_ON_HAND.
create temp table exp1 as
select public.post_expense(5000, 'CASH_ON_HAND', 'utilities', 'Power tokens') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from exp1)
    order by a.code$$,
  $$values ('CASH_ON_HAND', 0::bigint, 5000::bigint), ('EXPENSES', 5000::bigint, 0::bigint)$$,
  'expense posts DR EXPENSES / CR source account'
);

select throws_ok(
  $$select public.post_expense(5000, 'ACCOUNTS_PAYABLE')$$,
  'P0001', 'invalid_source_account: ACCOUNTS_PAYABLE',
  'expense source must be an asset leaf account'
);

-- 3-5. Transfer with fee.
create temp table tr1 as
select public.post_transfer('CASH_ON_HAND', 'BANK_MAIN', 30000, 500, 'tr-0001') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from tr1)
    order by a.code$$,
  $$values
    ('BANK_MAIN', 30000::bigint, 0::bigint),
    ('CASH_ON_HAND', 0::bigint, 30500::bigint),
    ('PROCESSOR_FEES', 500::bigint, 0::bigint)$$,
  'transfer with fee: DR to-acct, DR PROCESSOR_FEES, CR from-acct principal+fee'
);

-- Idempotent: same transfer_id returns the same entry.
select is(
  public.post_transfer('CASH_ON_HAND', 'BANK_MAIN', 30000, 500, 'tr-0001'),
  (select entry_id from tr1),
  'transfer with duplicate id returns existing entry (idempotent)'
);

select is(
  (select count(*)::int from public.ledger_journal_entries where source_type = 'InterAccountTransfer'),
  1,
  'no duplicate transfer entry created'
);

-- 6. Transfer permission.
select set_config('request.jwt.claims', (
  select format('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","company_id":"%s","user_role":"Cashier"}', company_id)
  from mops_company), true);

select throws_ok(
  $$select public.post_transfer('CASH_ON_HAND', 'BANK_MAIN', 1000, 0, 'tr-denied')$$,
  'P0001', 'permission_denied: CreateInterAccountTransfer required',
  'cashier cannot create transfers'
);

select set_config('request.jwt.claims', (select claims from mops_claims), true);

-- 7-9. Refund against the earlier sale.
create temp table sale_m as
select id as order_id from public.orders
where company_id = (select company_id from mops_company) and status = 'completed'
limit 1;

create temp table ref1 as
select public.post_refund((select order_id from sale_m), 20000, 'cash', 'defective') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from ref1)
    order by a.code$$,
  $$values
    ('CASH_ON_HAND', 0::bigint, 20000::bigint),
    ('SALES_RETURNS', 20000::bigint, 0::bigint)$$,
  'refund posts DR SALES_RETURNS / CR clearing'
);

select is(
  (select count(*)::int from public.refunds where order_id = (select order_id from sale_m)),
  1,
  'refund tracked in refunds table'
);

-- 10-12. Payment reversal.
create temp table pay_m as
select id as payment_id from public.payments where order_id = (select order_id from sale_m) limit 1;

create temp table prev1 as
select public.post_payment_reversal((select payment_id from pay_m)) as entry_id;

select ok(
  (select reversal_of is not null from public.ledger_journal_entries where id = (select entry_id from prev1)),
  'payment reversal records reversal_of'
);

select is(
  public.post_payment_reversal((select payment_id from pay_m)),
  (select entry_id from prev1),
  'payment reversal is idempotent'
);

select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines
   where entry_id in ((select entry_id from prev1), (select reversal_of from public.ledger_journal_entries where id = (select entry_id from prev1)))),
  0::numeric,
  'reversal + original nets to zero per account totals'
);

-- 13-15. Customer balance adjustments.
reset role;
insert into public.customers (id, company_id, first_name)
select 'c0000000-0000-0000-0000-0000000000bb', company_id, 'Credit Jane' from mops_company;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from mops_claims), true);

create temp table badj as
select public.post_balance_adjustment('c0000000-0000-0000-0000-0000000000bb', 15000, 'correction') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from badj)
    order by a.code$$,
  $$values
    ('ACCOUNTS_RECEIVABLE', 15000::bigint, 0::bigint),
    ('BALANCE_ADJUSTMENT', 0::bigint, 15000::bigint)$$,
  'positive adjustment: DR AR / CR BALANCE_ADJUSTMENT'
);

create temp table badj2 as
select public.post_balance_adjustment('c0000000-0000-0000-0000-0000000000bb', -5000, 'forgive') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from badj2)
    order by a.code$$,
  $$values
    ('ACCOUNTS_RECEIVABLE', 0::bigint, 5000::bigint),
    ('BALANCE_ADJUSTMENT', 5000::bigint, 0::bigint)$$,
  'negative adjustment (forgive): DR BALANCE_ADJUSTMENT / CR AR'
);

select set_config('request.jwt.claims', (
  select format('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","company_id":"%s","user_role":"Cashier"}', company_id)
  from mops_company), true);

select throws_ok(
  $$select public.post_balance_adjustment('c0000000-0000-0000-0000-0000000000bb', 1000, 'nope')$$,
  'P0001', 'permission_denied: OverrideCustomerBalance required',
  'cashier cannot adjust customer balances'
);

select set_config('request.jwt.claims', (select claims from mops_claims), true);

-- 16. Global invariant after everything.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits across all entries'
);

select * from finish();
rollback;
