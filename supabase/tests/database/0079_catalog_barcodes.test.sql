begin;
select plan(17);

select testkit.create_user('78787878-7878-4787-8787-787878787871', 'barcode-admin@local.test');
select testkit.create_user('78787878-7878-4787-8787-787878787872', 'barcode-cashier@local.test');
select testkit.create_user('78787878-7878-4787-8787-787878787873', 'barcode-other@local.test');

create temp table barcode_company as
select testkit.provision('78787878-7878-4787-8787-787878787871', 'Barcode Co') company_id;
grant select on pg_temp.barcode_company to authenticated;

select testkit.add_member(
  (select company_id from barcode_company),
  '78787878-7878-4787-8787-787878787872',
  'Barcode Cashier',
  array['SettleOrder']
);

select testkit.as_user(
  (select company_id from barcode_company),
  '78787878-7878-4787-8787-787878787871',
  'Admin'
);

create temp table barcode_good as
select public.create_catalog_product('Flour', '[{
  "price": 180,
  "barcode": "001234567890",
  "opening_quantity": 4,
  "opening_unit_cost": 120
}]') product_id;

create temp table barcode_service as
select public.create_catalog_product('Delivery', '[{
  "price": 250,
  "kind": "service",
  "barcode": "SERVICE-DELIVERY"
}]') product_id;

create temp table barcode_missing as
select public.create_catalog_product('Unlabelled', '[{"price": 75}]') product_id;

select is(
  (select product_name from public.resolve_catalog_barcode(E'\t001234567890\r\n')),
  'Flour',
  'resolver trims scanner whitespace and preserves leading zeroes'
);
select is(
  (select price from public.resolve_catalog_barcode('001234567890')),
  180::bigint,
  'resolver returns current price'
);
select is(
  (select stock from public.resolve_catalog_barcode('001234567890')),
  4::numeric,
  'resolver returns stock at the active location'
);
select is(
  (select kind from public.resolve_catalog_barcode('SERVICE-DELIVERY')),
  'service',
  'services resolve like goods'
);
select is(
  (select count(*)::integer from public.resolve_catalog_barcode('UNKNOWN')),
  0,
  'unknown barcode returns no row'
);

select public.update_catalog_product(
  (select product_id from barcode_service),
  'Delivery',
  jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from public.product_variants
      where product_id = (select product_id from barcode_service)),
    'price', 250,
    'kind', 'service',
    'barcode', 'SERVICE-DELIVERY',
    'active', false
  ))
);
select is(
  (select count(*)::integer from public.resolve_catalog_barcode('SERVICE-DELIVERY')),
  0,
  'inactive variant does not resolve'
);
select public.update_catalog_product(
  (select product_id from barcode_service),
  'Delivery',
  jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from public.product_variants
      where product_id = (select product_id from barcode_service)),
    'price', 250,
    'kind', 'service',
    'barcode', 'SERVICE-DELIVERY',
    'active', true
  ))
);

create temp table assigned as
select * from public.assign_missing_variant_barcodes(jsonb_build_array(jsonb_build_object(
  'variant_id', (select id from public.product_variants
    where product_id = (select product_id from barcode_missing)),
  'barcode', 'DR7A21F904BC18'
)));

select is((select barcode from assigned), 'DR7A21F904BC18', 'bulk assignment returns barcode');
select ok((select assigned from assigned), 'missing barcode is assigned');
select is(
  (select product_name from public.resolve_catalog_barcode('DR7A21F904BC18')),
  'Unlabelled',
  'assigned barcode is immediately resolvable'
);
select is(
  (select barcode from public.catalog_cache_page() where product_id = (select product_id from barcode_missing)),
  'DR7A21F904BC18',
  'assigned barcode is visible to the offline catalog cache'
);

create temp table skipped as
select * from public.assign_missing_variant_barcodes(jsonb_build_array(jsonb_build_object(
  'variant_id', (select id from public.product_variants
    where product_id = (select product_id from barcode_missing)),
  'barcode', 'DRFFFFFFFFFFFF'
)));
select is((select barcode from skipped), 'DR7A21F904BC18', 'existing barcode is retained');
select ok(not (select assigned from skipped), 'existing barcode reports skipped');

select throws_ok(
  $$select * from public.assign_missing_variant_barcodes(
    (select jsonb_agg(jsonb_build_object('variant_id', gen_random_uuid(), 'barcode', 'DR' || n))
     from generate_series(1, 501) n)
  )$$,
  'P0001', 'too_many_barcode_assignments: maximum 500',
  'bulk assignment is capped at 500'
);

select throws_ok(
  $$select * from public.assign_missing_variant_barcodes(jsonb_build_array(
    jsonb_build_object('variant_id', (select id from public.product_variants
      where product_id = (select product_id from barcode_good)), 'barcode', 'A'),
    jsonb_build_object('variant_id', (select id from public.product_variants
      where product_id = (select product_id from barcode_good)), 'barcode', 'B')
  ))$$,
  'P0001', 'duplicate_variant_assignment',
  'duplicate variant assignments are rejected atomically'
);

reset role;
create temp table barcode_other_company as
select testkit.provision('78787878-7878-4787-8787-787878787873', 'Other Barcode Co') company_id;
grant select on pg_temp.barcode_other_company to authenticated;
select testkit.as_user(
  (select company_id from barcode_other_company),
  '78787878-7878-4787-8787-787878787873',
  'Admin'
);
create temp table barcode_other_family as
select public.create_catalog_product('Other Product', '[{"price":10}]') product_id;
create temp table barcode_other_product as
select family.product_id, variant.id variant_id
from barcode_other_family family
join public.product_variants variant on variant.product_id = family.product_id;
grant select on pg_temp.barcode_other_product to authenticated;

select testkit.as_user(
  (select company_id from barcode_company),
  '78787878-7878-4787-8787-787878787871',
  'Admin'
);
select throws_ok(
  $$select * from public.assign_missing_variant_barcodes(jsonb_build_array(jsonb_build_object(
    'variant_id', (select variant_id from barcode_other_product),
    'barcode', 'DRCROSSCOMPANY'
  )))$$,
  'P0001', 'invalid_variant: assignment outside this company',
  'bulk assignment rejects cross-tenant variants'
);

select testkit.as_user(
  (select company_id from barcode_company),
  '78787878-7878-4787-8787-787878787872',
  'Barcode Cashier'
);
select throws_ok(
  $$select * from public.assign_missing_variant_barcodes('[]')$$,
  'P0001', 'permission_denied: ManageStockAdjustments required',
  'bulk assignment requires catalog write permission'
);
select is(
  (select count(*)::integer from public.resolve_catalog_barcode('DR7A21F904BC18')),
  1,
  'resolver remains available to ordinary sellers'
);

select * from finish();
rollback;
