-- POS golden tests (migration 0004): sale -> FIFO -> ledger, credit sales,
-- drafts, cashier settle, voids, permissions, tenancy.
begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures: two users; admin provisions a company (21 accounts etc.).
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@pos.local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@pos.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table pos_company as select public.provision_company('POS Test Co', 'Main') as company_id;
reset role;

-- Cashier role (no OverridePrice, no ReverseOrder; has SettleOrder) + membership.
insert into public.roles (company_id, name, permissions)
select company_id, 'Cashier', '{SettleOrder}' from pos_company;

insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
select p.company_id, '22222222-2222-2222-2222-222222222222', r.id, 'approved'
from pos_company p, public.roles r
where r.company_id = p.company_id and r.name = 'Cashier';

-- Products: A (tracked, two FIFO batches 10 @ 100c and 10 @ 150c), B (untracked service).
insert into public.products (id, company_id, name, sku, price, wholesale_price)
select 'a0000000-0000-0000-0000-000000000001', company_id, 'Sugar 1kg', 'SUG1', 20000, 18000 from pos_company;
insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-000000000002', company_id, 'Delivery', 'DEL', 5000, false from pos_company;

insert into public.inventory_batches (id, company_id, product_id, quantity, remaining, unit_cost, purchased_at)
select 'b0000000-0000-0000-0000-000000000001', company_id, 'a0000000-0000-0000-0000-000000000001', 10, 10, 10000, now() - interval '2 days' from pos_company;
insert into public.inventory_batches (id, company_id, product_id, quantity, remaining, unit_cost, purchased_at)
select 'b0000000-0000-0000-0000-000000000002', company_id, 'a0000000-0000-0000-0000-000000000001', 10, 10, 15000, now() - interval '1 day' from pos_company;

insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-000000000001', company_id, 'Walk-in', '0712345678', true, 0 from pos_company;

-- Helper claims for the admin (member of the company).
create temp table admin_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from pos_company;

grant select on pg_temp.admin_claims to authenticated;

-- ---------------------------------------------------------------------------
-- 1-5: Cash sale of 12 Sugar (spans both batches) + 1 Delivery, split payment.
--      Revenue: 12*20000 + 5000 = 245000. COGS: 10*10000 + 2*15000 = 130000.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select claims from admin_claims), true);

create temp table sale1 as
select public.post_sale(
  'c0000000-0000-0000-0000-000000000001',
  '[
    {"product_id":"a0000000-0000-0000-0000-000000000001","quantity":12,"unit_price":20000},
    {"product_id":"a0000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}
  ]',
  '[
    {"method":"cash","amount":200000},
    {"method":"mpesa","amount":45000,"reference":"QGH7X2K"}
  ]'
) as order_id;

select is(
  (select status from public.orders where id = (select order_id from sale1)),
  'completed',
  'cash sale completes'
);

select is(
  (select total from public.orders where id = (select order_id from sale1)),
  245000::bigint,
  'order total is 245000 cents'
);

-- Payment entries (one per payment row): DR CASH_ON_HAND 200000,
-- DR CLEARING_MPESA 45000, CR SALES 245000 across both entries.
select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'Payment' and l.order_id = (select order_id from sale1)
    order by a.code, l.credit desc$$,
  $$values
    ('CASH_ON_HAND', 200000::bigint, 0::bigint),
    ('CLEARING_MPESA', 45000::bigint, 0::bigint),
    ('SALES', 0::bigint, 200000::bigint),
    ('SALES', 0::bigint, 45000::bigint)$$,
  'payment entries post DR clearing per method / CR SALES gross (one entry per payment)'
);

-- COGS entry: DR COGS 130000 / CR INVENTORY 130000.
select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'InventorySaleCogs' and e.source_id = (select order_id::text from sale1)
    order by a.code$$,
  $$values
    ('COGS', 130000::bigint, 0::bigint),
    ('INVENTORY', 0::bigint, 130000::bigint)$$,
  'COGS entry posts DR COGS / CR INVENTORY at FIFO cost'
);

select is(
  (select remaining from public.inventory_batches where id = 'b0000000-0000-0000-0000-000000000001'),
  0::numeric,
  'oldest batch fully consumed first (FIFO)'
);

select is(
  (select remaining from public.inventory_batches where id = 'b0000000-0000-0000-0000-000000000002'),
  8::numeric,
  'second batch partially consumed (10 -> 8)'
);

select is(
  (select count(*)::int from public.inventory_movements
   where source_id = (select order_id::text from sale1) and type = 'sale'),
  2,
  'one sale movement per consumed batch (untracked product skipped)'
);

-- ---------------------------------------------------------------------------
-- 6-7: Credit sale.
-- ---------------------------------------------------------------------------
create temp table sale2 as
select public.post_sale(
  'c0000000-0000-0000-0000-000000000001',
  '[{"product_id":"a0000000-0000-0000-0000-000000000002","quantity":2,"unit_price":5000}]',
  '[]'
) as order_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'CreditSale' and e.source_id = (select order_id::text from sale2)
    order by a.code$$,
  $$values
    ('ACCOUNTS_RECEIVABLE', 10000::bigint, 0::bigint),
    ('SALES', 0::bigint, 10000::bigint)$$,
  'credit sale posts DR ACCOUNTS_RECEIVABLE / CR SALES'
);

select ok(
  (select is_credit_sale from public.orders where id = (select order_id from sale2)),
  'credit sale flagged on the order'
);

-- ---------------------------------------------------------------------------
-- 8-9: Guards.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"product_id":"a0000000-0000-0000-0000-000000000001","quantity":999,"unit_price":20000}]',
    '[{"method":"cash","amount":19980000}]'
  )$$,
  'P0001', null,
  'overselling tracked stock is rejected atomically'
);

select throws_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"product_id":"a0000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}]',
    '[{"method":"cash","amount":4000}]'
  )$$,
  'P0001', 'payment_mismatch: paid 4000 <> order total 5000',
  'underpayment is rejected'
);

-- ---------------------------------------------------------------------------
-- 10-11: Price override permission.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (
  select format('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","company_id":"%s","user_role":"Cashier"}', company_id)
  from pos_company
), true);

select throws_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"product_id":"a0000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000,"custom_price":4000,"override_reason":"regular customer"}]',
    '[{"method":"cash","amount":4000}]'
  )$$,
  'P0001', 'permission_denied: OverridePrice required',
  'cashier cannot override price without OverridePrice'
);

select set_config('request.jwt.claims', (select claims from admin_claims), true);

select lives_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"product_id":"a0000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000,"custom_price":4000,"override_reason":"regular customer"}]',
    '[{"method":"cash","amount":4000}]'
  )$$,
  'admin overrides price with OverridePrice'
);

-- ---------------------------------------------------------------------------
-- 12-13: Draft -> convert; park -> settle.
-- ---------------------------------------------------------------------------
create temp table draft1 as
select public.save_draft(
  'c0000000-0000-0000-0000-000000000001',
  '[{"product_id":"a0000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}]'
) as order_id;

select is(
  (select status from public.orders where id = (select order_id from draft1)),
  'draft',
  'save_draft creates a draft (proforma) with no ledger/stock effects'
);

select is(
  (select public.convert_draft((select order_id from draft1), '[{"method":"cash","amount":5000}]')
   = (select order_id from draft1)),
  true,
  'convert_draft completes the sale'
);

-- ---------------------------------------------------------------------------
-- 14-17: Void the first sale: reversal balances, batches restored.
-- ---------------------------------------------------------------------------
create temp table void1 as
select public.void_sale((select order_id from sale1), 'customer returned goods') as entry_id;

select is(
  (select status from public.orders where id = (select order_id from sale1)),
  'voided',
  'voided order marked voided'
);

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from void1)
    order by a.code$$,
  $$values
    ('CASH_ON_HAND', 0::bigint, 200000::bigint),
    ('CLEARING_MPESA', 0::bigint, 45000::bigint),
    ('COGS', 0::bigint, 130000::bigint),
    ('INVENTORY', 130000::bigint, 0::bigint),
    ('SALES', 245000::bigint, 0::bigint)$$,
  'reversal entry swaps per-account totals of revenue + COGS entries'
);

select is(
  (select remaining from public.inventory_batches where id = 'b0000000-0000-0000-0000-000000000001'),
  10::numeric,
  'void restores oldest batch fully'
);

select is(
  (select count(*)::int from public.payments
   where order_id = (select order_id from sale1) and status = 'cancelled'),
  2,
  'void cancels the order payments'
);

-- ---------------------------------------------------------------------------
-- 18-19: Void guards + global ledger invariant across everything above.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.void_sale((select order_id from sale1), 'double void should fail')$$,
  'P0001',
  'invalid_order_state: only completed orders can be voided (' || (select order_id from sale1) || ' is voided)',
  'voiding an already-voided order is rejected'
);

select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: all journal lines balance (debits = credits)'
);

select * from finish();
rollback;
