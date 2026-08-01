-- Sale idempotency tests (migration 0006).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@idem.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table idem_company as select public.provision_company('Idem Co', 'Main') as company_id;
reset role;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Service' from idem_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Default', 'service', 'SVC', 5000, false from idem_company;

create temp table idem_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from idem_company;
grant select on pg_temp.idem_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from idem_claims), true);

-- 1. First post with a client_ref succeeds and stores the ref.
create temp table sale_a as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","quantity":1,"unit_price":5000}]',
  '[{"method":"cash","amount":5000}]',
  false,
  'device-0001-sale-0001'
) as order_id;

select is(
  (select client_ref from public.orders where id = (select order_id from sale_a)),
  'device-0001-sale-0001',
  'client_ref stored on the order'
);

-- 2. Replay with the same ref returns the SAME order (no double post).
select is(
  public.post_sale(
    null,
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","quantity":1,"unit_price":5000}]',
    '[{"method":"cash","amount":5000}]',
    false,
    'device-0001-sale-0001'
  ),
  (select order_id from sale_a),
  'replaying the same client_ref returns the original order'
);

-- 3. No duplicate orders were created by the replay.
select is(
  (select count(*)::int from public.orders
   where company_id = (select company_id from idem_company)),
  1,
  'replay created no duplicate order'
);

-- 4. A different ref creates a distinct order.
select ok(
  public.post_sale(
    null,
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","quantity":1,"unit_price":5000}]',
    '[{"method":"cash","amount":5000}]',
    false,
    'device-0001-sale-0002'
  ) <> (select order_id from sale_a),
  'a different client_ref creates a new order'
);

select * from finish();
rollback;
