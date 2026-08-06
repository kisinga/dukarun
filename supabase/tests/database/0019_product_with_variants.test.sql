-- Coupled product creation tests (migration 0019).
begin;
select plan(8);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@cpv.local');

create temp table cpv_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'CPV Co') as company_id;
grant select on pg_temp.cpv_company to authenticated;

select testkit.as_user((select company_id from cpv_company), '11111111-1111-1111-1111-111111111111', 'Admin');

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
