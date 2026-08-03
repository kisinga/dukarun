-- Session enforcement is a DB invariant. UI guards are explanatory only.
begin;
select plan(17);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@session-guard.local');

create temp table sg_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Session Guard Co'
) as company_id;
grant select on pg_temp.sg_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000031', company_id, 'Session product'
from sg_company;

insert into public.product_variants (
  id, product_id, company_id, name, kind, sku, price, track_inventory
)
select
  'aa000000-0000-0000-0000-000000000031',
  'a0000000-0000-0000-0000-000000000031',
  company_id,
  'Default',
  'service',
  'SESSION-SVC',
  10000,
  false
from sg_company;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000032', company_id, 'Stock item'
from sg_company;

insert into public.product_variants (id, product_id, company_id, name, sku, price)
select
  'aa000000-0000-0000-0000-000000000032',
  'a0000000-0000-0000-0000-000000000032',
  company_id,
  'Default',
  'SESSION-STOCK',
  5000
from sg_company;

insert into public.customers (id, company_id, first_name, is_supplier, supplier_credit_limit)
select
  'c0000000-0000-0000-0000-000000000031',
  company_id,
  'Session Supplier',
  true,
  100000
from sg_company;

select testkit.as_user(
  (select company_id from sg_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

-- Non-financial preparation stays usable with a closed till.
create temp table sg_parked as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000031","quantity":1,"unit_price":10000}]',
  '[]',
  true
) as order_id;

select ok((select order_id from sg_parked) is not null, 'a sale can be parked without a session');
select is(
  (select status from public.orders where id = (select order_id from sg_parked)),
  'pending_payment',
  'parked order remains pending payment'
);

select throws_ok(
  $$select public.post_sale(
    null,
    '[{"variant_id":"aa000000-0000-0000-0000-000000000031","quantity":1,"unit_price":10000}]',
    '[{"method":"cash","amount":10000}]'
  )$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'a completed sale is rejected without a session'
);

select lives_ok(
  $$select public.record_purchase(
    'c0000000-0000-0000-0000-000000000031',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000032","quantity":2,"unit_cost":3000}]',
    true,
    'CREDIT-NO-SESSION'
  )$$,
  'a credit purchase is allowed without a session'
);

select throws_ok(
  $$select public.record_purchase(
    'c0000000-0000-0000-0000-000000000031',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000032","quantity":1,"unit_cost":3000}]',
    false,
    'PAID-NO-SESSION'
  )$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'a paid purchase is rejected without a session'
);

select throws_ok(
  $$select public.post_expense(1000, 'CASH_ON_HAND', 'test')$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'an expense is rejected without a session'
);

select throws_ok(
  $$select public.post_transfer('CASH_ON_HAND', 'BANK_MAIN', 1000, 0, 'closed-transfer')$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'a transfer is rejected without a session'
);

select throws_ok(
  $$select public.pay_supplier(
    'c0000000-0000-0000-0000-000000000031', 1000, 'CASH_ON_HAND'
  )$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'a supplier payment is rejected without a session'
);

create temp table sg_session as select testkit.ensure_open_session() as session_id;
select ok((select session_id from sg_session) is not null, 'session opens');

create temp table sg_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000031","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]'
) as order_id;

select ok((select order_id from sg_sale) is not null, 'sale succeeds with an open session');
select is(
  (select cashier_session_id from public.orders where id = (select order_id from sg_sale)),
  (select session_id from sg_session),
  'completed order is linked to the open session'
);
select ok(
  (
    select bool_and(l.meta ->> 'openSessionId' = (select session_id::text from sg_session))
    from public.ledger_journal_lines l
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'Payment' and l.order_id = (select order_id from sg_sale)
  ),
  'every sale payment journal line is tagged with the session'
);

create temp table sg_paid_purchase as
select public.record_purchase(
  'c0000000-0000-0000-0000-000000000031',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000032","quantity":1,"unit_cost":3000}]',
  false,
  'PAID-WITH-SESSION'
) as purchase_id;

select ok((select purchase_id from sg_paid_purchase) is not null, 'paid purchase succeeds with a session');
select ok(
  (
    select bool_and(l.meta ->> 'openSessionId' = (select session_id::text from sg_session))
    from public.ledger_journal_lines l
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'InventoryPurchase'
      and e.source_id = (select purchase_id::text from sg_paid_purchase)
  ),
  'every paid-purchase journal line is tagged with the session'
);

select lives_ok(
  $$select public.post_expense(1000, 'CASH_ON_HAND', 'test')$$,
  'expense succeeds with an open session'
);

select testkit.close_open_session();
select is(
  (select status from public.cashier_sessions where id = (select session_id from sg_session)),
  'closed',
  'session closes'
);

select throws_ok(
  $$select public.settle_order(
    (select order_id from sg_parked),
    '[{"method":"cash","amount":10000}]'
  )$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'settling a parked order is rejected after the session closes'
);

select * from finish();
rollback;
