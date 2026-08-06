begin;
select plan(8);

select testkit.create_user('65656565-6565-4565-8565-656565656565', 'manufacturer-a@local.test');
select testkit.create_user('65656565-6565-4565-8565-656565656566', 'manufacturer-b@local.test');
create temp table manufacturer_companies as
select testkit.provision('65656565-6565-4565-8565-656565656565', 'Manufacturer A') company_a,
       testkit.provision('65656565-6565-4565-8565-656565656566', 'Manufacturer B') company_b;
grant select on pg_temp.manufacturer_companies to authenticated;

select testkit.as_user((select company_a from manufacturer_companies),
  '65656565-6565-4565-8565-656565656565', 'Admin');

create temp table manufacturer_a as select public.upsert_manufacturer(' Brookside ') id;
select is(
  (select name from public.manufacturers where id=(select id from manufacturer_a)),
  'Brookside',
  'manufacturer names are trimmed'
);

select is(
  public.upsert_manufacturer('brookside'),
  (select id from manufacturer_a),
  'case-insensitive duplicate reuses manufacturer'
);

create temp table manufacturer_product as
select public.create_catalog_product_with_manufacturer(
  'Milk', '[{"price":100}]', null, null, (select id from manufacturer_a)
) product_id;

select is(
  (select manufacturer_id from public.products where id=(select product_id from manufacturer_product)),
  (select id from manufacturer_a),
  'coupled create links manufacturer'
);

select is(
  (select manufacturer_name from public.variant_catalog
   where product_id=(select product_id from manufacturer_product)),
  'Brookside',
  'variant catalog exposes manufacturer name'
);

create temp table product_without_manufacturer as
select public.create_catalog_product_with_manufacturer('Loose Eggs', '[{"price":20}]') product_id;
select is(
  (select manufacturer_id from public.products
   where id=(select product_id from product_without_manufacturer)),
  null::uuid,
  'manufacturer remains optional'
);

select public.update_catalog_product_with_manufacturer(
  (select product_id from manufacturer_product),
  'Milk',
  jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from public.product_variants
                   where product_id=(select product_id from manufacturer_product)),
    'name', 'Default', 'price', 100
  )),
  null, true, null
);
select is(
  (select manufacturer_id from public.products where id=(select product_id from manufacturer_product)),
  null::uuid,
  'coupled edit can clear manufacturer'
);

select testkit.as_user((select company_b from manufacturer_companies),
  '65656565-6565-4565-8565-656565656566', 'Admin');
select is(
  (select count(*)::int from public.manufacturers),
  0,
  'manufacturer list is tenant isolated'
);

select throws_ok(
  format(
    $$select public.create_catalog_product_with_manufacturer('Bad', '[{"price":1}]', null, null, '%s')$$,
    (select id from manufacturer_a)
  ),
  'P0001', 'manufacturer_not_found',
  'product cannot link another company manufacturer'
);

select * from finish();
rollback;
