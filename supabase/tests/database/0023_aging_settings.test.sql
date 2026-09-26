-- Aging + settings tests (migration 0023).
begin;
select plan(14);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@age.local');
create temp table age_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Age Co') as company_id;
grant select on pg_temp.age_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000e1', company_id, 'Soap' from age_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1', company_id, 'Bar', 'SOAP1', 10000, false from age_company;

insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000e1', company_id, 'Aging Jane', true, 0 from age_company;
insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-0000000000e2', company_id, 'Old Supplier', true from age_company;

select testkit.as_user((select company_id from age_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- Credit sale today + an OLD credit sale (backdated entry).
create temp table age_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000e1',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":1,"unit_price":10000}]', '[]') as order_id;

reset role;
-- Backdate the entry to 45 days ago (simulates old debt).
-- Posted ledger rows are immutable unless the backfill escape hatch is set.
select set_config('app.allow_ledger_mutation', 'on', true);
update public.ledger_journal_entries
set entry_date = entry_date - 45
where source_id = (select order_id::text from age_sale) and source_type = 'CreditSale';
select set_config('app.allow_ledger_mutation', 'off', true);

-- 1-3. Customer aging view.
select is(
  (select balance from public.customer_credit_aging where customer_id = 'c0000000-0000-0000-0000-0000000000e1'),
  10000::bigint,
  'aging view shows customer balance'
);

select is(
  (select days_outstanding from public.customer_credit_aging where customer_id = 'c0000000-0000-0000-0000-0000000000e1'),
  45,
  'aging days computed from entry date'
);

select is(
  (select bucket from public.customer_credit_aging where customer_id = 'c0000000-0000-0000-0000-0000000000e1'),
  '31-60',
  'bucketed 31-60'
);

-- Repay -> row disappears (balance 0).
select testkit.as_user((select company_id from age_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select public.post_payment_allocation((select order_id from age_sale), 10000, 'cash', null);

select is(
  (select count(*)::int from public.customer_credit_aging where customer_id = 'c0000000-0000-0000-0000-0000000000e1'),
  0,
  'fully repaid customer drops out of aging'
);

-- 4-5. Supplier aging via a backdated credit purchase.
select public.record_purchase('c0000000-0000-0000-0000-0000000000e2',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":2,"unit_cost":4000}]',
  true, 'PO-OLD');

reset role;
select set_config('app.allow_ledger_mutation', 'on', true);
update public.ledger_journal_entries
set entry_date = entry_date - 70
where source_type = 'InventoryPurchase';
select set_config('app.allow_ledger_mutation', 'off', true);

select is(
  (select bucket from public.supplier_ap_aging where supplier_id = 'c0000000-0000-0000-0000-0000000000e2'),
  '60+',
  'supplier AP bucketed 60+'
);

-- Customer-level corrections and overpayments settle positive orders FIFO.
insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000e3', company_id, 'FIFO Customer', true, 0
from age_company;

select testkit.as_user((select company_id from age_company),
  '11111111-1111-1111-1111-111111111111', 'Admin');
create temp table fifo_customer_old as
select public.post_sale('c0000000-0000-0000-0000-0000000000e3',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":1,"unit_price":4000}]',
  '[]') as order_id;
create temp table fifo_customer_new as
select public.post_sale('c0000000-0000-0000-0000-0000000000e3',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":1,"unit_price":6000}]',
  '[]') as order_id;

reset role;
select set_config('app.allow_ledger_mutation', 'on', true);
update public.ledger_journal_entries
set entry_date = entry_date - case
  when source_id = (select order_id::text from fifo_customer_old) then 60
  else 30
end
where source_type = 'CreditSale'
  and source_id in (
    (select order_id::text from fifo_customer_old),
    (select order_id::text from fifo_customer_new)
  );
select set_config('app.allow_ledger_mutation', 'off', true);

select public.post_journal_entry(
  (select company_id from age_company), 'BalanceAdjustment', 'aging-customer-fifo-1',
  'Unlinked customer correction',
  '[{"account_code":"BALANCE_ADJUSTMENT","debit":15000,"meta":{"customerId":"c0000000-0000-0000-0000-0000000000e3"}},
    {"account_code":"ACCOUNTS_RECEIVABLE","credit":15000,"meta":{"customerId":"c0000000-0000-0000-0000-0000000000e3"}}]'
);

select is(
  (select balance from public.customer_credit_aging
   where customer_id = 'c0000000-0000-0000-0000-0000000000e3'),
  5000::bigint,
  'unlinked customer correction reduces the aging balance'
);

select is(
  (select days_outstanding from public.customer_credit_aging
   where customer_id = 'c0000000-0000-0000-0000-0000000000e3'),
  30,
  'customer correction settles the oldest order first'
);

select public.post_journal_entry(
  (select company_id from age_company), 'BalanceAdjustment', 'aging-customer-fifo-2',
  'Clear remaining customer balance',
  '[{"account_code":"BALANCE_ADJUSTMENT","debit":5000,"meta":{"customerId":"c0000000-0000-0000-0000-0000000000e3"}},
    {"account_code":"ACCOUNTS_RECEIVABLE","credit":5000,"meta":{"customerId":"c0000000-0000-0000-0000-0000000000e3"}}]'
);

select is(
  (select count(*)::int from public.customer_credit_aging
   where customer_id = 'c0000000-0000-0000-0000-0000000000e3'),
  0,
  'zero-balance customer has no aging row after an unlinked correction'
);

select is(
  (select balance from public.customer_ar_balances
   where customer_id = 'c0000000-0000-0000-0000-0000000000e3'),
  0::bigint,
  'customer aging disappearance agrees with authoritative AR'
);

-- Supplier-level unlinked payments settle positive purchases FIFO.
insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-0000000000e4', company_id, 'FIFO Supplier', true
from age_company;

select testkit.as_user((select company_id from age_company),
  '11111111-1111-1111-1111-111111111111', 'Admin');
create temp table fifo_supplier_old as
select public.record_purchase('c0000000-0000-0000-0000-0000000000e4',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":1,"unit_cost":4000}]',
  true, 'FIFO-OLD') as purchase_id;
create temp table fifo_supplier_new as
select public.record_purchase('c0000000-0000-0000-0000-0000000000e4',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000e1","quantity":2,"unit_cost":4000}]',
  true, 'FIFO-NEW') as purchase_id;

reset role;
select set_config('app.allow_ledger_mutation', 'on', true);
update public.ledger_journal_entries
set entry_date = entry_date - case
  when source_id = (select purchase_id::text from fifo_supplier_old) then 70
  else 40
end
where source_type = 'InventoryPurchase'
  and source_id in (
    (select purchase_id::text from fifo_supplier_old),
    (select purchase_id::text from fifo_supplier_new)
  );
select set_config('app.allow_ledger_mutation', 'off', true);

select public.post_journal_entry(
  (select company_id from age_company), 'SupplierPayment', 'aging-supplier-fifo-1',
  'Unlinked supplier payment',
  '[{"account_code":"ACCOUNTS_PAYABLE","debit":5000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4"}},
    {"account_code":"BALANCE_ADJUSTMENT","credit":5000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4"}}]'
);

select public.post_journal_entry(
  (select company_id from age_company), 'SupplierBalanceAdjustment',
  'aging-supplier-adjustment', 'Temporary supplier adjustment',
  '[{"account_code":"BALANCE_ADJUSTMENT","debit":10000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4","reason":"Reversed supplier adjustment fixture"}},
    {"account_code":"ACCOUNTS_PAYABLE","credit":10000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4","reason":"Reversed supplier adjustment fixture"}}]'
);

select public.post_journal_entry(
  (select company_id from age_company), 'OpsSupplierBalanceAdjustmentReversal',
  'aging-supplier-adjustment-reversal', 'Reverse temporary supplier adjustment',
  '[{"account_code":"ACCOUNTS_PAYABLE","debit":10000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4","reason":"Reversed supplier adjustment fixture"}},
    {"account_code":"BALANCE_ADJUSTMENT","credit":10000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4","reason":"Reversed supplier adjustment fixture"}}]'
);

select is(
  (select balance from public.supplier_ap_aging
   where supplier_id = 'c0000000-0000-0000-0000-0000000000e4'),
  7000::bigint,
  'unlinked supplier payment reduces the aging balance'
);

select is(
  (select days_outstanding from public.supplier_ap_aging
   where supplier_id = 'c0000000-0000-0000-0000-0000000000e4'),
  40,
  'supplier payment settles the oldest purchase first'
);

select public.post_journal_entry(
  (select company_id from age_company), 'SupplierPayment', 'aging-supplier-fifo-2',
  'Clear remaining supplier balance',
  '[{"account_code":"ACCOUNTS_PAYABLE","debit":7000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4"}},
    {"account_code":"BALANCE_ADJUSTMENT","credit":7000,"meta":{"supplierId":"c0000000-0000-0000-0000-0000000000e4"}}]'
);

select is(
  (select count(*)::int from public.supplier_ap_aging
   where supplier_id = 'c0000000-0000-0000-0000-0000000000e4'),
  0,
  'zero-balance supplier has no aging row after unlinked payments'
);

select is(
  (select balance from public.supplier_ap_balances
   where supplier_id = 'c0000000-0000-0000-0000-0000000000e4'),
  0::bigint,
  'supplier aging disappearance agrees with authoritative AP'
);

-- update_payment_method.
select testkit.as_user((select company_id from age_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select public.update_payment_method('bank', false);

select is(
  (select enabled from public.payment_methods
   where company_id = (select company_id from age_company) and code = 'bank'),
  false,
  'update_payment_method disables a method'
);

select * from finish();
rollback;
