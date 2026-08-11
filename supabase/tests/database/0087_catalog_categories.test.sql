-- Canonical category schema, mutations, filters, storefront, and cache events.
begin;
select plan(30);

select testkit.create_user('87878787-8787-4787-8787-878787878781', 'category-admin@local.test');
select testkit.create_user('87878787-8787-4787-8787-878787878782', 'category-peer@local.test');
select testkit.create_user('87878787-8787-4787-8787-878787878783', 'category-other@local.test');

create temp table category_companies as
select
  testkit.provision('87878787-8787-4787-8787-878787878781', 'Category Company') company_id,
  testkit.provision('87878787-8787-4787-8787-878787878783', 'Other Category Company') other_company_id;
grant select on pg_temp.category_companies to authenticated;
select testkit.add_member(
  (select company_id from category_companies),
  '87878787-8787-4787-8787-878787878782',
  'Category Viewer', array['SettleOrder']
);

reset role;
insert into public.products(id, company_id, name) values
  ('87000000-0000-4000-8000-000000000001', (select company_id from category_companies), 'Black Tea'),
  ('87000000-0000-4000-8000-000000000002', (select company_id from category_companies), 'Green Tea'),
  ('87000000-0000-4000-8000-000000000003', (select company_id from category_companies), 'Loose Leaf'),
  ('87000000-0000-4000-8000-000000000009', (select other_company_id from category_companies), 'Foreign Tea');
insert into public.product_variants(id, product_id, company_id, name, sku, price) values
  ('87100000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', (select company_id from category_companies), 'Box', 'CAT-1', 100),
  ('87100000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002', (select company_id from category_companies), 'Box', 'CAT-2', 200),
  ('87100000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000003', (select company_id from category_companies), 'Bag', 'CAT-3', 300),
  ('87100000-0000-4000-8000-000000000009', '87000000-0000-4000-8000-000000000009', (select other_company_id from category_companies), 'Box', 'CAT-9', 900);
update public.companies
set public_storefront_enabled=true, public_slug='category-company'
where id=(select company_id from category_companies);

select is(to_regclass('public.categories')::text, 'categories', 'categories is the canonical table');
select is(to_regclass('public.product_categories')::text, 'product_categories', 'product_categories is the canonical link table');
select is(to_regclass('public.collections'), null::regclass, 'legacy collections table is absent');
select is(to_regclass('public.product_collections'), null::regclass, 'legacy product_collections table is absent');
select ok(to_regprocedure('public.upsert_category(text,text,text,uuid,boolean)') is not null, 'category mutation RPC exists');
select ok(to_regprocedure('public.patch_product_categories(uuid[],uuid[],uuid[])') is not null, 'batch category RPC exists');
select is(to_regprocedure('public.upsert_collection(text,text,text,uuid,boolean)'), null::regprocedure, 'legacy collection RPC is absent');

select testkit.as_user(
  (select company_id from category_companies),
  '87878787-8787-4787-8787-878787878781', 'Admin'
);
create temp table category_ids as
select public.upsert_category('Herbal Teas') herbal_id;
alter table category_ids add column premium_id uuid;
alter table category_ids add column seasonal_id uuid;
update category_ids set
  premium_id=public.upsert_category('Premium'),
  seasonal_id=public.upsert_category('Seasonal');

select is(
  (select slug from public.categories where id=(select herbal_id from category_ids)),
  'herbal-teas', 'category creation generates a slug'
);
select public.set_product_categories(
  '87000000-0000-4000-8000-000000000001',
  array[(select herbal_id from category_ids), (select premium_id from category_ids)]
);
select public.set_product_categories(
  '87000000-0000-4000-8000-000000000002',
  array[(select premium_id from category_ids), (select seasonal_id from category_ids)]
);
select is(
  (select count(*)::integer from public.product_categories where product_id='87000000-0000-4000-8000-000000000001'),
  2, 'single-product assignment replaces membership with the requested categories'
);

create temp table batch_result as
select public.patch_product_categories(
  array['87000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000002']::uuid[],
  array[(select herbal_id from category_ids)],
  array[(select premium_id from category_ids)]
) result;
select is((select (result->>'product_count')::integer from batch_result), 2, 'batch reports product count');
select is((select (result->>'added_count')::integer from batch_result), 1, 'batch reports inserted link count');
select is((select (result->>'removed_count')::integer from batch_result), 2, 'batch reports removed link count');
select ok(
  exists(select 1 from public.product_categories where product_id='87000000-0000-4000-8000-000000000002' and category_id=(select seasonal_id from category_ids)),
  'batch preserves untouched memberships'
);

select public.upsert_category(
  'Seasonal', null, null, (select seasonal_id from category_ids), false
);
select throws_ok(
  format(
    $$select public.patch_product_categories(array['87000000-0000-4000-8000-000000000001']::uuid[], array[%L]::uuid[], '{}'::uuid[])$$,
    (select seasonal_id from category_ids)
  ), 'P0001', 'category_not_found_or_inactive', 'inactive categories cannot be added'
);
select lives_ok(
  format(
    $$select public.set_product_categories('87000000-0000-4000-8000-000000000002', array[%1$L,%2$L]::uuid[])$$,
    (select herbal_id from category_ids),
    (select seasonal_id from category_ids)
  ),
  'an existing inactive category membership can be preserved while editing a product'
);
select ok(
  exists(select 1 from public.product_categories where product_id='87000000-0000-4000-8000-000000000001' and category_id=(select herbal_id from category_ids)),
  'a rejected batch rolls back without changing existing memberships'
);
select throws_ok(
  $$select public.patch_product_categories(array['87000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'invalid_product_ids', 'duplicate product IDs are rejected'
);
select throws_ok(
  format(
    $$select public.patch_product_categories(array['87000000-0000-4000-8000-000000000001']::uuid[], array[%1$L]::uuid[], array[%1$L]::uuid[])$$,
    (select herbal_id from category_ids)
  ), 'P0001', 'category_change_overlap', 'overlapping add and remove IDs are rejected'
);
select throws_ok(
  $$select public.patch_product_categories(array['87000000-0000-4000-8000-000000000009']::uuid[], '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'product_not_found', 'foreign products are rejected without leaking tenancy'
);
select throws_ok(
  $$select public.patch_product_categories(array(select gen_random_uuid() from generate_series(1,101)), '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'invalid_product_ids', 'batch size is limited to 100 products'
);

select testkit.as_user(
  (select company_id from category_companies),
  '87878787-8787-4787-8787-878787878782', 'Category Viewer'
);
select throws_ok(
  $$select public.upsert_category('Denied')$$,
  'P0001', 'permission_denied: ManageCatalog required', 'category creation requires ManageCatalog'
);
select throws_ok(
  $$select public.patch_product_categories(array['87000000-0000-4000-8000-000000000001']::uuid[], '{}'::uuid[], '{}'::uuid[])$$,
  'P0001', 'permission_denied: ManageCatalog required', 'batch categorization requires ManageCatalog'
);

select testkit.as_user(
  (select company_id from category_companies),
  '87878787-8787-4787-8787-878787878781', 'Admin'
);
select is(
  (public.catalog_management_page('active','all','all',(select herbal_id::text from category_ids),null,'name','asc',1,25,null)->>'total')::integer,
  2, 'management category filter returns assigned products'
);
select is(
  (public.catalog_management_page('active','all','all','uncategorized',null,'name','asc',1,25,null)->>'total')::integer,
  1, 'management uncategorized filter returns products without links'
);

grant select on pg_temp.category_ids to anon;
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select is(
  (select count(distinct product_id)::integer from public.storefront_catalog_page(
    'category-company', null, (select herbal_id from category_ids), 12, 0
  )), 2, 'storefront category filtering preserves category behavior'
);
select is(
  (select count(distinct product_id)::integer from public.storefront_catalog_page(
    'category-company', null, (select seasonal_id from category_ids), 12, 0
  )), 0, 'storefront category filtering rejects inactive categories'
);
select is(
  (select count(*)::integer from public.storefront_categories('category-company')),
  2, 'storefront categories expose active categories only'
);

reset role;
select ok(
  exists(select 1 from public.cache_change_log where stream='catalog' and entity_type='category'),
  'category mutations emit category cache events'
);
select ok(
  exists(select 1 from public.cache_change_log where stream='catalog' and entity_type='product_category'),
  'membership mutations emit product_category cache events'
);
select is(
  (select public from storage.buckets where id='product-images'), true,
  'product-images bucket remains public'
);

select * from finish();
rollback;
