-- Supplier credit tests (migration 0011): purchases, AP payments, limits,
-- write-offs, value adjustments.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@supplier.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table sp_company as select public.provision_company('Supplier Co', 'Main') as company_id;
reset role;

insert into public.products (id, company_id, name, sku, price)
select 'a0000000-0000-0000-0000-0000000000f1', company_id, 'Bread', 'BRD', 5000 from sp_company;

insert into public.customers (id, company_id, first_name, is_supplier, supplier_credit_limit)
select 'c0000000-0000-0000-0000-0000000000f1', company_id, 'Brookside', true, 100000 from sp_company;

create temp table sp_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from sp_company;
grant select on pg_temp.sp_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from sp_claims), true);

-- 1-3. Cash purchase: batch created, movement recorded, DR INVENTORY/CR CASH_ON_HAND.
create temp table pur1 as
select public.record_purchase('c0000000-0000-0000-0000-0000000000f1',
  '[{"product_id":"a0000000-0000-0000-0000-0000000000f1","quantity":20,"unit_cost":3000}]',
  false, 'PO-001') as purchase_id;

select is(
  (select remaining from public.inventory_batches where product_id = 'a0000000-0000-0000-0000-0000000000f1'),
  20::numeric,
  'purchase creates inventory batch'
);

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'InventoryPurchase' and e.source_id = (select purchase_id::text from pur1)
    order by a.code$$,
  $$values
    ('CASH_ON_HAND', 0::bigint, 60000::bigint),
    ('INVENTORY', 60000::bigint, 0::bigint)$$,
  'cash purchase posts DR INVENTORY / CR CASH_ON_HAND'
);

-- 4. Credit purchase beyond supplier limit (limit 100000): 40 * 3000 = 120000.
select throws_ok(
  $$select public.record_purchase('c0000000-0000-0000-0000-0000000000f1',
    '[{"product_id":"a0000000-0000-0000-0000-0000000000f1","quantity":40,"unit_cost":3000}]',
    true, 'PO-002')$$,
  'P0001', 'supplier_credit_limit_exceeded: balance 0 + 120000 > limit 100000',
  'credit purchase beyond supplier limit is rejected'
);

-- 5. Credit purchase within limit posts to AP.
create temp table pur2 as
select public.record_purchase('c0000000-0000-0000-0000-0000000000f1',
  '[{"product_id":"a0000000-0000-0000-0000-0000000000f1","quantity":30,"unit_cost":3000}]',
  true, 'PO-003') as purchase_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'InventoryPurchase' and e.source_id = (select purchase_id::text from pur2)
    order by a.code$$,
  $$values
    ('ACCOUNTS_PAYABLE', 0::bigint, 90000::bigint),
    ('INVENTORY', 90000::bigint, 0::bigint)$$,
  'credit purchase posts DR INVENTORY / CR ACCOUNTS_PAYABLE'
);

-- 6-8. Supplier payment: oldest-first allocation (pur2 is the only credit purchase).
create temp table pay1 as
select public.pay_supplier('c0000000-0000-0000-0000-0000000000f1', 50000, 'CASH_ON_HAND') as payment_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'SupplierPayment' and e.source_id = (select payment_id::text from pay1)
    order by a.code$$,
  $$values
    ('ACCOUNTS_PAYABLE', 50000::bigint, 0::bigint),
    ('CASH_ON_HAND', 0::bigint, 50000::bigint)$$,
  'supplier payment posts DR ACCOUNTS_PAYABLE / CR source account'
);

select is(
  (select sum(amount) from public.purchase_payments where purchase_id = (select purchase_id from pur2)),
  50000::numeric,
  'payment allocated against the credit purchase'
);

select throws_ok(
  $$select public.pay_supplier('c0000000-0000-0000-0000-0000000000f1', 45000, 'CASH_ON_HAND')$$,
  'P0001', 'ap_overpayment: 45000 exceeds outstanding 40000',
  'overpaying supplier AP is rejected'
);

-- 9-10. Write-off with expiry reason: FIFO consume + DR EXPIRY_LOSS.
create temp table wo1 as
select public.post_inventory_write_off('a0000000-0000-0000-0000-0000000000f1', 5, 'expired stock') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from wo1)
    order by a.code$$,
  $$values
    ('EXPIRY_LOSS', 15000::bigint, 0::bigint),
    ('INVENTORY', 0::bigint, 15000::bigint)$$,
  'expiry write-off posts DR EXPIRY_LOSS / CR INVENTORY'
);

select is(
  (select coalesce(sum(remaining), 0) from public.inventory_batches where product_id = 'a0000000-0000-0000-0000-0000000000f1'),
  45::numeric,
  'write-off consumes batches FIFO (50 - 5)'
);

-- 11-12. Value adjustments.
create temp table adj1 as
select public.post_inventory_adjustment('a0000000-0000-0000-0000-0000000000f1', 2000, 'recount gain') as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from adj1)
    order by a.code$$,
  $$values
    ('INVENTORY', 2000::bigint, 0::bigint),
    ('INVENTORY_ADJUSTMENT', 0::bigint, 2000::bigint)$$,
  'positive adjustment: DR INVENTORY / CR INVENTORY_ADJUSTMENT'
);

select ok(
  public.post_inventory_adjustment('a0000000-0000-0000-0000-0000000000f1', 0, 'no-op') is null,
  'zero adjustment is a no-op'
);

-- 13. Global invariant.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits across all entries'
);

select * from finish();
rollback;
