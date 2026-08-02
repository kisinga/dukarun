-- POS golden tests (migration 0004): sale -> FIFO -> ledger, credit sales,
-- drafts, cashier settle, voids, permissions, tenancy.
begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures: two users; admin provisions a company (21 accounts etc.).
-- ---------------------------------------------------------------------------
select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@pos.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'cashier@pos.local');

create temp table pos_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'POS Test Co') as company_id;
grant select on pg_temp.pos_company to authenticated;

-- Cashier role (no OverridePrice, no ReverseOrder; has SettleOrder) + membership.
select testkit.add_member((select company_id from pos_company), '22222222-2222-2222-2222-222222222222', 'Cashier', '{SettleOrder}');

-- Products: A (tracked good, two FIFO batches 10 @ 100c and 10 @ 150c),
-- B (untracked service). Family rows + one sellable variant each.
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000001', company_id, 'Sugar 1kg' from pos_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price, wholesale_price)
select 'aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', company_id, 'Default', 'SUG1', 20000, 18000 from pos_company;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000002', company_id, 'Delivery' from pos_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', company_id, 'Default', 'service', 'DEL', 5000, false from pos_company;

insert into public.inventory_batches (id, company_id, variant_id, quantity, remaining, unit_cost, purchased_at)
select 'b0000000-0000-0000-0000-000000000001', company_id, 'aa000000-0000-0000-0000-000000000001', 10, 10, 10000, now() - interval '2 days' from pos_company;
insert into public.inventory_batches (id, company_id, variant_id, quantity, remaining, unit_cost, purchased_at)
select 'b0000000-0000-0000-0000-000000000002', company_id, 'aa000000-0000-0000-0000-000000000001', 10, 10, 15000, now() - interval '1 day' from pos_company;

insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-000000000001', company_id, 'Walk-in', '0712345678', true, 0 from pos_company;

-- ---------------------------------------------------------------------------
-- 1-5: Cash sale of 12 Sugar (spans both batches) + 1 Delivery, split payment.
--      Revenue: 12*20000 + 5000 = 245000. COGS: 10*10000 + 2*15000 = 130000.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from pos_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table sale1 as
select public.post_sale(
  'c0000000-0000-0000-0000-000000000001',
  '[
    {"variant_id":"aa000000-0000-0000-0000-000000000001","quantity":12,"unit_price":20000},
    {"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}
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
  '[{"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":2,"unit_price":5000}]',
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
    '[{"variant_id":"aa000000-0000-0000-0000-000000000001","quantity":999,"unit_price":20000}]',
    '[{"method":"cash","amount":19980000}]'
  )$$,
  'P0001', null,
  'overselling tracked stock is rejected atomically'
);

select throws_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}]',
    '[{"method":"cash","amount":4000}]'
  )$$,
  'P0001', 'payment_mismatch: paid 4000 <> order total 5000',
  'underpayment is rejected'
);

-- ---------------------------------------------------------------------------
-- 10-11: Price override permission.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from pos_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

select throws_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000,"custom_price":4000,"override_reason":"regular customer"}]',
    '[{"method":"cash","amount":4000}]'
  )$$,
  'P0001', 'permission_denied: OverridePrice required',
  'cashier cannot override price without OverridePrice'
);

select testkit.as_user((select company_id from pos_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  $$select public.post_sale(
    'c0000000-0000-0000-0000-000000000001',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000,"custom_price":4000,"override_reason":"regular customer"}]',
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
  '[{"variant_id":"aa000000-0000-0000-0000-000000000002","quantity":1,"unit_price":5000}]'
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
select (public.void_sale((select order_id from sale1), 'customer returned goods') ->> 'entry_id')::uuid as entry_id;

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
