-- Customer gap fixes (migration 0005).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@gaps.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table gaps_company as select public.provision_company('Gaps Co', 'Main') as company_id;
reset role;

insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-000000000009', company_id, 'Service', 'SVC', 5000, false from gaps_company;

-- Claims with tenant + role for RPC calls.
create temp table gaps_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from gaps_company;
grant select on pg_temp.gaps_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from gaps_claims), true);

-- 1. create_customer works and scopes to the caller's company.
create temp table new_customer as
select public.create_customer('Jane', 'Mwangi', '0722000000', null) as customer_id;

select is(
  (select first_name from public.customers where id = (select customer_id from new_customer)),
  'Jane',
  'create_customer creates the customer'
);

-- 2. Blank optional fields become null, not empty strings.
select ok(
  (select email is null from public.customers where id = (select customer_id from new_customer)),
  'optional fields normalize to null'
);

-- 3. Credit sale with no customer is rejected.
select throws_ok(
  $$select public.post_sale(
    null,
    '[{"product_id":"a0000000-0000-0000-0000-000000000009","quantity":1,"unit_price":5000}]',
    '[]'
  )$$,
  'P0001', 'credit_requires_customer',
  'credit sale without a customer is rejected'
);

-- 4. Credit sale with a real customer still works.
select lives_ok(
  format(
    $$select public.post_sale(
      '%s',
      '[{"product_id":"a0000000-0000-0000-0000-000000000009","quantity":1,"unit_price":5000}]',
      '[]'
    )$$,
    (select customer_id from new_customer)
  ),
  'credit sale with a customer succeeds'
);

select * from finish();
rollback;
