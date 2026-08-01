-- Reporting views + credit management tests (migration 0012).
begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@views.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table vw_company as select public.provision_company('Views Co', 'Main') as company_id;
reset role;

insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Service', 'SVC', 10000, false from vw_company;

insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000aa', company_id, 'AR Jane', true, 0 from vw_company;

create temp table vw_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from vw_company;
grant select on pg_temp.vw_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from vw_claims), true);

-- 1-2. AR view reflects credit sales net of allocations.
create temp table vw_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000aa',
  '[{"product_id":"a0000000-0000-0000-0000-0000000000aa","quantity":3,"unit_price":10000}]', '[]') as order_id;

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
set local role authenticated;
select set_config('request.jwt.claims', (select claims from vw_claims), true);

select public.record_purchase('c0000000-0000-0000-0000-0000000000ab',
  '[{"product_id":"a0000000-0000-0000-0000-0000000000aa","quantity":2,"unit_cost":5000}]',
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
