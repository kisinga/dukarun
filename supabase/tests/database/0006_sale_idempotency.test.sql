-- Sale idempotency tests (migration 0006).
begin;
select plan(4);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@idem.local');

create temp table idem_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Idem Co') as company_id;
grant select on pg_temp.idem_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Service' from idem_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Default', 'service', 'SVC', 5000, false from idem_company;

select testkit.as_user((select company_id from idem_company), '11111111-1111-1111-1111-111111111111', 'Admin');

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
