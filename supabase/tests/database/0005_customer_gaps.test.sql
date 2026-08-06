-- Customer gap fixes (migration 0005).
begin;
select plan(4);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@gaps.local');

create temp table gaps_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Gaps Co') as company_id;
grant select on pg_temp.gaps_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000009', company_id, 'Service' from gaps_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000009', company_id, 'Default', 'service', 'SVC', 5000, false from gaps_company;

select testkit.as_user((select company_id from gaps_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

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
    '[{"variant_id":"aa000000-0000-0000-0000-000000000009","quantity":1,"unit_price":5000}]',
    '[]'
  )$$,
  'P0001', 'credit_requires_customer',
  'credit sale without a customer is rejected'
);

-- 4. Credit sale with a real (credit-approved) customer still works.
reset role;
update public.customers set is_credit_approved = true
where id = (select customer_id from new_customer);
select testkit.as_user((select company_id from gaps_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  format(
    $$select public.post_sale(
      '%s',
      '[{"variant_id":"aa000000-0000-0000-0000-000000000009","quantity":1,"unit_price":5000}]',
      '[]'
    )$$,
    (select customer_id from new_customer)
  ),
  'credit sale with a customer succeeds'
);

select * from finish();
rollback;
