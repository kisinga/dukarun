begin;
select plan(11);

select testkit.create_user('68686868-6868-4686-8686-686868686861', 'search-a@local.test');
select testkit.create_user('68686868-6868-4686-8686-686868686862', 'search-b@local.test');
create temp table search_companies as
select testkit.provision('68686868-6868-4686-8686-686868686861', 'Search A') company_a,
       testkit.provision('68686868-6868-4686-8686-686868686862', 'Search B') company_b;
grant select on pg_temp.search_companies to authenticated;

select testkit.as_user((select company_a from search_companies),
  '68686868-6868-4686-8686-686868686861', 'Admin');

create temp table search_fixture as
select public.upsert_manufacturer('Brookside') manufacturer_id;

create temp table search_product as
select public.create_catalog_product_with_manufacturer(
  'Fresh Milk',
  '[{"name":"500 ml","sku":"MILK-500","barcode":"616123","price":100}]',
  null,
  null,
  (select manufacturer_id from search_fixture)
) product_id;

select is(
  (select count(*)::int from public.search_catalog_variants('milk brookside')),
  1,
  'combined product and manufacturer tokens match'
);
select is(
  (select manufacturer_name from public.search_catalog_variants('brookside')),
  'Brookside',
  'manufacturer-only search matches'
);
select is(
  (select sku from public.search_catalog_variants('milk-500')),
  'MILK-500',
  'punctuated SKU search matches'
);
select is(
  (select barcode from public.search_catalog_variants('616123')),
  '616123',
  'barcode search matches'
);
select is(
  (select stock from public.search_catalog_variants('fresh brook')),
  0::numeric,
  'search returns location stock'
);

reset role;
update public.manufacturers set name = 'Brookside Dairy'
where id = (select manufacturer_id from search_fixture);
select testkit.as_user((select company_a from search_companies),
  '68686868-6868-4686-8686-686868686861', 'Admin');
select is(
  (select manufacturer_name from public.search_catalog_variants('milk dairy')),
  'Brookside Dairy',
  'manufacturer edits refresh search documents'
);

reset role;
update public.products set name = 'Long Life Milk' where id = (select product_id from search_product);
select testkit.as_user((select company_a from search_companies),
  '68686868-6868-4686-8686-686868686861', 'Admin');
select is(
  (select product_name from public.search_catalog_variants('long dairy')),
  'Long Life Milk',
  'product edits refresh search documents'
);

reset role;
update public.product_variants set active = false
where product_id = (select product_id from search_product);
select testkit.as_user((select company_a from search_companies),
  '68686868-6868-4686-8686-686868686861', 'Admin');
select is(
  (select count(*)::int from public.search_catalog_variants('milk')),
  0,
  'inactive variants are excluded'
);
reset role;
update public.product_variants set active = true
where product_id = (select product_id from search_product);

select testkit.as_user((select company_b from search_companies),
  '68686868-6868-4686-8686-686868686862', 'Admin');
select is(
  (select count(*)::int from public.search_catalog_variants('milk')),
  0,
  'search is tenant isolated'
);
select ok(
  not has_table_privilege('authenticated', 'public.catalog_search_documents', 'select'),
  'search projection is not directly readable'
);
select throws_ok(
  $$select public.search_catalog_variants(repeat('x', 121))$$,
  'P0001',
  'invalid_search_query',
  'oversized queries are rejected'
);

select * from finish();
rollback;
