begin;
select plan(15);

select testkit.create_user('66666666-6666-4666-8666-666666666661', 'catalog-admin@local.test');
select testkit.create_user('66666666-6666-4666-8666-666666666662', 'catalog-cashier@local.test');
create temp table catalog_company as
select testkit.provision('66666666-6666-4666-8666-666666666661', 'Catalog Import Co') company_id;
grant select on pg_temp.catalog_company to authenticated;
select testkit.add_member(
  (select company_id from catalog_company),
  '66666666-6666-4666-8666-666666666662',
  'Import Cashier',
  array['SettleOrder']
);

select testkit.as_user((select company_id from catalog_company),
  '66666666-6666-4666-8666-666666666661', 'Admin');

create temp table first_import as
select public.import_catalog_products(
  '[{"product_key":"NEW-1","name":"Flour","manufacturer_name":"Millers","active":false,"variants":[
    {"name":"1kg","sku":"FLOUR-1","price":180,"kind":"good"},
    {"name":"2kg","sku":"FLOUR-2","price":340,"kind":"good","active":false}
  ]}]',
  'merge',
  '66666666-6666-4666-8666-666666666610'
) result;

select is((select result ->> 'status' from first_import), 'completed', 'merge completes');
select is((select (result ->> 'created')::int from first_import), 1, 'merge reports create');
select is((select count(*)::int from public.product_variants where sku like 'FLOUR-%'), 2,
  'all variants created');
select is((select name from public.manufacturers where normalized_name = 'millers'), 'Millers',
  'manufacturer resolved');
select is((select active from public.products where name = 'Flour'), false,
  'new product active flag retained');
select is((select active from public.product_variants where sku = 'FLOUR-2'), false,
  'new variant active flag retained');
select is(
  public.import_catalog_products(
    '[{"product_key":"NEW-1","name":"Flour","variants":[{"name":"1kg","sku":"OTHER","price":1}]}]',
    'merge', '66666666-6666-4666-8666-666666666610'
  ),
  (select result from first_import),
  'same idempotency key returns original result'
);

create temp table bread as
select public.create_catalog_product('Bread', '[{"name":"400g","sku":"BREAD-400","price":60}]') id;
create temp table export_marker as
select public.start_catalog_export() marker;

select throws_ok(
  $$select public.import_catalog_products(
    '[{"product_id":"00000000-0000-0000-0000-000000000001","name":"Forged","variants":[{"price":1}]}]',
    'replace',
    '66666666-6666-4666-8666-666666666612',
    '66666666-6666-4666-8666-666666666699'
  )$$,
  'P0001', 'replace_requires_full_export', 'replace requires a server-issued export marker'
);

create temp table flour_ids as
select p.id product_id, jsonb_agg(jsonb_build_object(
  'variant_id', v.id, 'name', v.name, 'sku', v.sku, 'price', v.price,
  'kind', v.kind, 'track_inventory', v.track_inventory,
  'allow_fractional', v.allow_fractional, 'active', v.active
) order by v.created_at) variants
from public.products p join public.product_variants v on v.product_id = p.id
where p.name = 'Flour' group by p.id;

create temp table replace_import as
select public.import_catalog_products(
  jsonb_build_array(jsonb_build_object(
    'product_id', product_id, 'name', 'Flour', 'active', true, 'variants', variants
  )),
  'replace',
  '66666666-6666-4666-8666-666666666611',
  (select (marker ->> 'export_id')::uuid from export_marker)
) result from flour_ids;

select is((select result ->> 'status' from replace_import), 'completed', 'replace completes');
select is((select (result ->> 'deactivated_products')::int from replace_import), 1,
  'replace reports omitted product');
select is((select active from public.products where id = (select id from bread)), false,
  'omitted product deactivated');
select is((select active from public.product_variants where sku = 'BREAD-400'), false,
  'omitted variant deactivated');
select is((select count(*)::int from public.catalog_imports), 2, 'jobs recorded once per key');

select testkit.as_user((select company_id from catalog_company),
  '66666666-6666-4666-8666-666666666662', 'Import Cashier');
select throws_ok(
  $$select public.import_catalog_products('[{"name":"Denied","variants":[{"price":1}]}]')$$,
  'P0001', 'permission_denied: ManageCatalog required', 'permission required'
);
select is((select count(*)::int from public.products where name = 'Denied'), 0,
  'denied import writes nothing');

select * from finish();
rollback;
