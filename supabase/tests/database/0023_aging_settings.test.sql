-- Aging + settings tests (migration 0023).
begin;
select plan(6);

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

-- 6. update_payment_method.
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
