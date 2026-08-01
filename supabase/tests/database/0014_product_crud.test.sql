-- Product CRUD tests (migration 0014).
begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@prod.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table pr_company as select public.provision_company('Prod Co', 'Main') as company_id;
reset role;

create temp table pr_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from pr_company;
grant select on pg_temp.pr_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from pr_claims), true);

-- 1. Create with explicit sku.
create temp table prod1 as
select public.create_product('Sugar 1kg', 20000, 'SUG1', '6001234567890', 18000, false, true) as id;

select is(
  (select sku from public.products where id = (select id from prod1)),
  'SUG1',
  'create_product stores the sku'
);

-- 2. Auto-generated sku when blank.
create temp table prod_auto as
select public.create_product('Mandazi', 2000) as id;

select ok(
  (select sku is not null and length(sku) >= 4 from public.products where id = (select id from prod_auto)),
  'create_product auto-generates a sku when blank'
);

-- 3. Invalid price rejected.
select throws_ok(
  $$select public.create_product('Bad', -5)$$,
  'P0001', 'invalid_price',
  'negative price rejected'
);

-- 4. Partial update keeps other fields.
create temp table prod2 as
select public.update_product((select id from prod1), null, 22000) as id;

select is(
  (select price from public.products where id = (select id from prod1)),
  22000::bigint,
  'update_product changes the price'
);

select is(
  (select barcode from public.products where id = (select id from prod1)),
  '6001234567890',
  'update_product keeps untouched fields'
);

-- 5. product_stock view derives from batches.
reset role;
insert into public.inventory_batches (company_id, product_id, quantity, remaining, unit_cost)
select company_id, (select id from prod1), 10, 4, 15000 from pr_company;
set local role authenticated;
select set_config('request.jwt.claims', (select claims from pr_claims), true);

select is(
  (select stock from public.product_stock where product_id = (select id from prod1)),
  4::numeric,
  'product_stock derives remaining stock from batches'
);

select * from finish();
rollback;
