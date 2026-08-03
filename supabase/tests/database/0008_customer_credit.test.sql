-- Customer credit tests (migration 0008): credit validation at sale time,
-- AR allocations with the per-order invariant.
begin;
select plan(9);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@credit.local');

create temp table cr_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Credit Co') as company_id;
grant select on pg_temp.cr_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000cc', company_id, 'Service' from cr_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000cc', 'a0000000-0000-0000-0000-0000000000cc', company_id, 'Default', 'service', 'SVC', 10000, false from cr_company;

-- Customers: approved-with-limit, unapproved, zero-limit (unlimited).
insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000c1', company_id, 'Ltd Customer', true, 15000 from cr_company;
insert into public.customers (id, company_id, first_name, is_credit_approved)
select 'c0000000-0000-0000-0000-0000000000c2', company_id, 'Not Approved', false from cr_company;

-- Staff role without ApproveCustomerCredit (post-0020: over-limit succeeds
-- for ApproveCustomerCredit holders with an audit record; staff hard-fails).
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'staff@credit.local');

select testkit.add_member((select company_id from cr_company), '22222222-2222-2222-2222-222222222222', 'Staff', '{SettleOrder,OverridePrice}');

select testkit.as_user((select company_id from cr_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- 1. Unapproved customer cannot take credit.
select throws_ok(
  $$select public.post_sale('c0000000-0000-0000-0000-0000000000c2',
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":1,"unit_price":10000}]', '[]')$$,
  'P0001', 'credit_not_approved: customer c0000000-0000-0000-0000-0000000000c2',
  'unapproved customer cannot make a credit sale'
);

-- 2. Over-limit credit sale is rejected FOR STAFF (limit 15000, sale 20000).
-- Note: ApproveCustomerCredit holders (Admin) now succeed with an approved
-- overdraft audit record — the hard fail applies to roles without it.
select testkit.as_user((select company_id from cr_company), '22222222-2222-2222-2222-222222222222', 'Staff');

select throws_ok(
  $$select public.post_sale('c0000000-0000-0000-0000-0000000000c1',
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":2,"unit_price":10000}]', '[]')$$,
  'P0001', 'credit_limit_exceeded: balance 0 + 20000 > limit 15000',
  'credit sale beyond the limit is rejected for staff'
);

select testkit.as_user((select company_id from cr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 3. Within-limit credit sale works.
create temp table cr_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000c1',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":1,"unit_price":10000}]', '[]') as order_id;

select ok(
  (select is_credit_sale from public.orders where id = (select order_id from cr_sale)),
  'within-limit credit sale completes'
);

-- 4. Cumulative limit: balance 10000 + 10000 > 15000 (staff).
select testkit.as_user((select company_id from cr_company), '22222222-2222-2222-2222-222222222222', 'Staff');

select throws_ok(
  $$select public.post_sale('c0000000-0000-0000-0000-0000000000c1',
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":1,"unit_price":10000}]', '[]')$$,
  'P0001', 'credit_limit_exceeded: balance 10000 + 10000 > limit 15000',
  'credit limit is enforced cumulatively against AR balance'
);

select testkit.as_user((select company_id from cr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 5. Allocation: repay 4000 cash against the credit order.
create temp table alloc1 as
select public.post_payment_allocation((select order_id from cr_sale), 4000, 'cash', null) as payment_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'PaymentAllocation' and e.source_id = (select payment_id::text from alloc1)
    order by a.code$$,
  $$values
    ('ACCOUNTS_RECEIVABLE', 0::bigint, 4000::bigint),
    ('CASH_ON_HAND', 4000::bigint, 0::bigint)$$,
  'allocation posts DR clearing / CR ACCOUNTS_RECEIVABLE'
);

-- 6. Allocation reduces AR exposure: balance now 6000, sale of 8000 fits limit.
select lives_ok(
  $$select public.post_sale('c0000000-0000-0000-0000-0000000000c1',
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":1,"unit_price":8000}]', '[]')$$,
  'repayment frees up credit limit'
);

-- 7. Overpayment rejected: repay 6000 against order with 10000 AR debit
--    and 4000 already repaid -> 4000+6000 > 10000 is fine? no: 10000 >= 10000 ok.
--    Use 7000: 4000+7000 = 11000 > 10000 -> reject.
select throws_ok(
  $$select public.post_payment_allocation((select order_id from cr_sale), 7000, 'cash', null)$$,
  'P0001', 'ar_overpayment: order ' || (select order_id from cr_sale) || ' AR credits 11000 exceed debits 10000',
  'overpaying an order AR balance is rejected'
);

-- 8. Allocation against an order with no AR debit fails.
create temp table cash_sale as
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000cc","quantity":1,"unit_price":5000}]',
  '[{"method":"cash","amount":5000}]') as order_id;

select throws_ok(
  $$select public.post_payment_allocation((select order_id from cash_sale), 1000, 'cash', null)$$,
  'P0001', 'ar_allocation_without_debt: order ' || (select order_id from cash_sale) || ' has no AR balance',
  'allocation without AR debt is rejected'
);

-- 9. Global invariant.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits across all entries'
);

select * from finish();
rollback;
