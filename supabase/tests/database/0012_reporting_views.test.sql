-- Reporting views + credit management tests (migration 0012).
begin;
select plan(5);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@views.local');

create temp table vw_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Views Co') as company_id;
grant select on pg_temp.vw_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Service' from vw_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Default', 'service', 'SVC', 10000, false from vw_company;

-- A stocked good for the purchase (services cannot be stocked under 0017).
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Flour' from vw_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Default', 'FLR', 5000 from vw_company;

insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000aa', company_id, 'AR Jane', true, 0 from vw_company;

select testkit.as_user((select company_id from vw_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- 1-2. AR view reflects credit sales net of allocations.
create temp table vw_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000aa',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","quantity":3,"unit_price":10000}]', '[]') as order_id;

select is(
  (select balance from public.customer_ar_balances where customer_id = 'c0000000-0000-0000-0000-0000000000aa'),
  30000::bigint,
  'AR view shows the credit sale balance'
);

select public.post_payment_allocation((select order_id from vw_sale), 12000, 'cash', null);

select is(
  (select balance from public.customer_ar_balances where customer_id = 'c0000000-0000-0000-0000-0000000000aa'),
  18000::bigint,
  'AR view nets repayments'
);

-- 3. AP view reflects a credit purchase.
reset role;
insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-0000000000ab', company_id, 'Supplier Joe', true from vw_company;
select testkit.as_user((select company_id from vw_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select public.record_purchase('c0000000-0000-0000-0000-0000000000ab',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000ab","quantity":2,"unit_cost":5000}]',
  true, 'PO-X');

select is(
  (select balance from public.supplier_ap_balances where supplier_id = 'c0000000-0000-0000-0000-0000000000ab'),
  10000::bigint,
  'AP view shows the credit purchase balance'
);

-- 4. update_customer_credit updates limit/approval/terms.
select public.update_customer_credit('c0000000-0000-0000-0000-0000000000aa', 50000, true, 30);

select is(
  (select credit_limit from public.customers where id = 'c0000000-0000-0000-0000-0000000000aa'),
  50000::bigint,
  'update_customer_credit sets the limit'
);

-- 5. create_customer with supplier flag.
create temp table new_sup as
select public.create_customer('Wholesale', 'Ltd', null, null, true) as id;

select is(
  (select is_supplier from public.customers where id = (select id from new_sup)),
  true,
  'create_customer accepts the supplier flag'
);

select * from finish();
rollback;
