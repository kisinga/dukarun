-- Coupled product creation tests (migration 0019).
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@cpv.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table cpv_company as select public.provision_company('CPV Co', 'Main') as company_id;
reset role;

create temp table cpv_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from cpv_company;
grant select on pg_temp.cpv_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from cpv_claims), true);

-- 1. Zero variants rejected.
select throws_ok(
  $$select public.create_product_with_variants('Empty Thing', '[]')$$,
  'P0001', 'variants_required: a product needs at least one variant',
  'product without variants is rejected'
);

-- 2. Single variant without a label becomes 'Default'.
create temp table cpv_single as
select public.create_product_with_variants('Bread 400g',
  '[{"price": 6000}]') as product_id;

select is(
  (select name from public.product_variants where product_id = (select product_id from cpv_single)),
  'Default',
  'single unlabeled variant becomes Default'
);

-- 3. Auto-sku generated.
select ok(
  (select sku is not null and length(sku) >= 4 from public.product_variants
   where product_id = (select product_id from cpv_single)),
  'variant sku auto-generated'
);

-- 4-5. Multi-variant product with labels (sizes) + price check.
create temp table cpv_multi as
select public.create_product_with_variants('T-Shirt', '[
  {"name": "S", "price": 80000},
  {"name": "M", "price": 85000},
  {"name": "L", "price": 90000, "wholesale_price": 80000}
]', '6001112223334') as product_id;

select is(
  (select count(*)::int from public.product_variants where product_id = (select product_id from cpv_multi)),
  3,
  'multi-variant product creates all variants'
);

select is(
  (select barcode from public.products where id = (select product_id from cpv_multi)),
  '6001112223334',
  'family barcode stored on the product'
);

-- 6. Variant missing price rejected (atomic: nothing left behind).
select throws_ok(
  $$select public.create_product_with_variants('Broken', '[{"name":"S"}]')$$,
  'P0001', 'invalid_price: every variant needs a price',
  'variant without price rejected'
);

select is(
  (select count(*)::int from public.products where name = 'Broken'),
  0,
  'failed creation is atomic (no orphaned product)'
);

-- 7. Service variant in the bundle gets track_inventory=false.
create temp table cpv_svc as
select public.create_product_with_variants('Delivery', '[{"price": 5000, "kind": "service", "track_inventory": true}]') as product_id;

select is(
  (select track_inventory from public.product_variants where product_id = (select product_id from cpv_svc)),
  false,
  'service variant forced non-tracked even when requested tracked'
);

select * from finish();
rollback;
