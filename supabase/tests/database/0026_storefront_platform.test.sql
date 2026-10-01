-- Storefront + platform tests (migration 0026).
begin;
select plan(62);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@sf.local');
select testkit.create_user('99999999-9999-9999-9999-999999999999', 'root@sf.local');
create temp table sf_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'SF Co') as company_id;
grant select on pg_temp.sf_company to authenticated;

reset role;
insert into public.platform_admins (user_id) values ('99999999-9999-9999-9999-999999999999');

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Tea' from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Box', 'TEA1', 10000 from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Case', 'TEA2', 15000 from sf_company;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Coffee' from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Bag', 'COFFEE1', 20000 from sf_company;

-- Company starts unapproved: invisible in the directory.
update public.companies
set status = 'unapproved', public_storefront_enabled = true, public_slug = 'sf-co'
where id = (select company_id from sf_company);

-- 1. Anon sees nothing while unapproved.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.public_storefronts where slug = 'sf-co'),
  0,
  'unapproved storefront hidden from anon'
);

-- 2. Approved + paid access: visible with catalogue.
reset role;
update public.companies set status = 'approved' where id = (select company_id from sf_company);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select catalogue_visible from public.public_storefronts where slug = 'sf-co'),
  true,
  'approved paid storefront visible with catalogue'
);

select ok(
  (select count(*) from public.storefront_catalog_page('sf-co')) > 0,
  'paged catalog returns variants for the slug'
);

select is(
  (select total_count from public.storefront_catalog_page('sf-co', 'Tea') limit 1),
  1::bigint,
  'paged catalog searches and counts product families'
);

select is(
  (select bool_and(available) from public.storefront_product(
    'sf-co', 'a0000000-0000-0000-0000-0000000000aa'
  )),
  false,
  'public product reports tracked variants without stock as unavailable'
);

select throws_ok(
  $$select * from public.storefront_catalog_page('sf-co', null, null, 49, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'storefront page size is bounded'
);

select throws_ok(
  $$select * from public.storefront_catalog_page('sf-co', null, null, null, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'storefront page size cannot bypass bounds with null'
);

select is(
  public.storefront_page('sf-co', null, null, 1, 0) #>> '{storefront,slug}',
  'sf-co',
  'page-shaped storefront read includes shop identity'
);
select is(
  jsonb_array_length(public.storefront_page('sf-co', null, null, 1, 0) -> 'rows'),
  1,
  'page-shaped storefront read returns one bounded product family'
);
select is(
  (public.storefront_page('sf-co', null, null, 1, 0) ->> 'hasMore')::boolean,
  true,
  'storefront pagination detects a next page without an exact count'
);
select is(
  public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,product_name}',
  'Tea',
  'storefront search uses the catalog search projection'
);
select is(
  (public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,variant_count}')::integer,
  2,
  'storefront list returns one product summary with its option count'
);
select is(
  (public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,max_price}')::bigint,
  15000::bigint,
  'storefront product summary retains the full variant price range'
);
select throws_ok(
  $$select public.storefront_page('sf-co', null, null, 49, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'page-shaped storefront reads remain bounded'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public'
    and indexname='products_storefront_page_idx'),
  'storefront product ordering has a supporting index'
);

-- Publication is independent of activation, internal access, and category membership.
reset role;
select testkit.create_user('11111111-1111-1111-1111-111111111112', 'stock@sf.local');
select testkit.create_user('11111111-1111-1111-1111-111111111113', 'catalog@sf.local');
select testkit.add_member((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111112', 'Stock', array['ManageStockAdjustments']);
select testkit.add_member((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111113', 'Catalog', array['ManageCatalog']);
select testkit.create_user('11111111-1111-1111-1111-111111111114', 'other@sf.local');
create temp table other_sf_company as
select testkit.provision('11111111-1111-1111-1111-111111111114', 'Other SF Co') company_id;
insert into public.products(id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000ff', company_id, 'Foreign' from other_sf_company;

select is((select storefront_published from public.products where name='Tea'), true,
  'products are published by default');
select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111111', 'Admin');
create temp table sf_category as select public.upsert_category('Tea only') id;
grant select on sf_category to anon,authenticated;
select public.set_product_categories('a0000000-0000-0000-0000-0000000000aa',
  array[(select id from sf_category)]);
select is((select count(*)::int from public.storefront_categories('sf-co')), 1,
  'a category containing a published product is public');
select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000ab',false);
select is(public.storefront_page('sf-co',null,null,1,0)#>>'{rows,0,product_name}','Tea',
  'an unpublished first product does not leave an empty page');
select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000ab',true);


select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111112', 'Stock');
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',false)$$,
  'P0001','permission_denied: ManageCatalog required','stock permission alone cannot change publication');
select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111113', 'Catalog');
select throws_ok($$select public.set_product_storefront_published(null,false)$$,
  'P0001','invalid_storefront_publication','null product rejected');
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',null)$$,
  'P0001','invalid_storefront_publication','null publication rejected');
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000ff',false)$$,
  'P0001','product_not_found','cross-company product rejected');
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-000000000099',false)$$,
  'P0001','product_not_found','missing product rejected');
reset role;
create temp table publication_cache_head as select coalesce(max(sequence),0) sequence from public.cache_change_log
where company_id=(select company_id from sf_company) and stream='catalog';
select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111113', 'Catalog');
select is(public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',false), false,
  'ManageCatalog alone can unpublish and gets saved value');
select is(public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',false), false,
  'unpublishing twice is idempotent');
reset role;
select is((select count(*)::int from public.audit_log where table_name='products' and operation='UPDATE'
  and row_id='a0000000-0000-0000-0000-0000000000aa'
  and old_data->>'storefront_published'='true' and new_data->>'storefront_published'='false'
  and actor='11111111-1111-1111-1111-111111111113'),1,
  'publication reuses audit trigger and repeated value creates no extra audit');
select is((select count(*)::int from public.cache_change_log where stream='catalog'
  and entity_id='a0000000-0000-0000-0000-0000000000aa'
  and sequence>(select sequence from publication_cache_head)),1,
  'publication emits one existing catalogue cache change');
select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111113', 'Catalog');
select is((select active from public.products where name='Tea'), true,
  'unpublishing does not deactivate internal product');
select is((select count(*)::int from public.variant_catalog where product_id='a0000000-0000-0000-0000-0000000000aa'), 2,
  'unpublished variants remain available to the internal catalogue and POS');
select is((select count(*)::int from public.storefront_product('sf-co','a0000000-0000-0000-0000-0000000000aa')), 0,
  'authenticated public detail reads also hide unpublished products');
select is(jsonb_array_length(public.storefront_page('sf-co','TEA1')->'rows'), 0,
  'authenticated public search also hides unpublished products');

select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111111', 'Admin');
select public.update_catalog_product('a0000000-0000-0000-0000-0000000000aa','Tea',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","name":"Box","sku":"TEA1","price":10000},
    {"variant_id":"aa000000-0000-0000-0000-0000000000ac","name":"Case","sku":"TEA2","price":15000}]');
select is((select storefront_published from public.products where name='Tea'), false,
  'ordinary product edits preserve explicit unpublishing');
select public.save_catalog_product_units(
  jsonb_build_object('product_id','a0000000-0000-0000-0000-0000000000aa','name','Tea',
    'category_ids',jsonb_build_array((select id from sf_category)), 'storefront_published',true),
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","name":"Box","sku":"TEA1","price":10000,"packs":[]},
    {"variant_id":"aa000000-0000-0000-0000-0000000000ac","name":"Case","sku":"TEA2","price":15000,"packs":[]}]',
  'a0000000-0000-4000-8000-000000000088');
select is((select storefront_published from public.products where name='Tea'), false,
  'current product editor RPC preserves unpublishing even if its payload contains the field');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',true)$$,
  '42501','permission denied for function set_product_storefront_published','anonymous writes rejected');
select is((select count(*)::int from public.storefront_product('sf-co','a0000000-0000-0000-0000-0000000000aa')), 0,
  'anonymous detail reader hides unpublished product');
select is(jsonb_array_length(public.storefront_product_units('sf-co','a0000000-0000-0000-0000-0000000000aa')), 0,
  'pack-aware detail reader inherits publication filtering');
select is(jsonb_array_length(public.storefront_page('sf-co','TEA1')->'rows'), 0,
  'anonymous search hides unpublished products');
select is((select count(*)::int from public.storefront_catalog_page('sf-co','Tea')), 0,
  'legacy search hides unpublished products');
select is((select total_count from public.storefront_catalog_page('sf-co') limit 1),1::bigint,
  'legacy count excludes unpublished products');
select is(public.storefront_page('sf-co',null,null,1,0)#>>'{rows,0,product_name}','Coffee',
  'filtering occurs before page limits');
select is((public.storefront_page('sf-co',null,null,1,0)->>'hasMore')::boolean,false,
  'hidden products do not create a phantom next page');
select is(jsonb_array_length(public.storefront_page('sf-co',null,null,1,1)->'rows'),0,
  'offset applies after publication filtering');
select is((select count(*)::int from public.storefront_categories('sf-co')),0,
  'categories with only unpublished products are hidden');
select is(jsonb_array_length(public.storefront_page('sf-co')->'categories'),0,
  'page category list also excludes unpublished-only categories');
select is(jsonb_array_length(public.storefront_page('sf-co',null,(select id from sf_category))->'rows'),0,
  'category filter cannot expose unpublished products');
select ok(not exists(select 1 from jsonb_array_elements(public.public_storefront_sitemap()) item
  where item->>'product_id'='a0000000-0000-0000-0000-0000000000aa'),
  'sitemap excludes unpublished products');

set local role authenticated;
select throws_ok($$select public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',true)$$,
  'P0001','not_authenticated','missing authenticated identity rejected');
select testkit.as_user((select company_id from sf_company),
  '11111111-1111-1111-1111-111111111113', 'Catalog');
select is(public.set_product_storefront_published('a0000000-0000-0000-0000-0000000000aa',true),true,
  'republish returns saved state');
select is((select count(*)::int from public.storefront_product('sf-co','a0000000-0000-0000-0000-0000000000aa')),2,
  'republishing restores public details');
select is((select count(*)::int from public.storefront_categories('sf-co')),1,
  'republishing restores eligible category');
select ok(exists(select 1 from jsonb_array_elements(public.public_storefront_sitemap()) item
  where item->>'product_id'='a0000000-0000-0000-0000-0000000000aa'),
  'republishing restores sitemap entry');

reset role;
update public.product_variants set active=false where product_id='a0000000-0000-0000-0000-0000000000aa';
set local role anon;
select is((select count(*)::int from public.storefront_categories('sf-co')),0,
  'published products without active variants do not make a category public');
reset role;
update public.product_variants set active=true where product_id='a0000000-0000-0000-0000-0000000000aa';
update public.products set active=false where id='a0000000-0000-0000-0000-0000000000aa';
set local role anon;
select is((select count(*)::int from public.storefront_categories('sf-co')),0,
  'inactive published products do not make a category public');
select is((select count(*)::int from public.storefront_product('sf-co','a0000000-0000-0000-0000-0000000000aa')),0,
  'publishing never overrides product activation');

-- 4. Lapsed subscription: identity stays, catalogue hides.
reset role;
update public.companies
set subscription_status = 'expired', subscription_grace_period_end = now() - interval '1 day'
where id = (select company_id from sf_company);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select catalogue_visible from public.public_storefronts where slug = 'sf-co'),
  false,
  'lapsed subscription hides the catalogue'
);

select ok(
  (select count(*) from public.public_storefronts where slug = 'sf-co') = 1,
  'lapsed storefront identity still listed'
);

-- 5. Catalog function returns nothing for lapsed.
select is(
  (select count(*)::int from public.storefront_catalog_page('sf-co')),
  0,
  'catalog empty when lapsed'
);

-- 6-8. Platform RPCs.
reset role;
select testkit.as_user((select company_id from sf_company), '99999999-9999-9999-9999-999999999999', 'Admin');
-- claims for platform admin need the flag: build manually
select set_config('request.jwt.claims', format('{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}'), true);

select lives_ok(
  format($$select public.platform_set_company_status('%s', 'disabled')$$, (select company_id from sf_company)),
  'platform admin disables a company'
);

select is(
  (select status from public.companies where id = (select company_id from sf_company)),
  'disabled',
  'status updated'
);

select ok(
  (public.platform_stats() ->> 'companies_total')::int >= 1,
  'platform_stats returns counts'
);

-- 9-10. Non-platform users are rejected.
select testkit.as_user((select company_id from sf_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select throws_ok(
  format($$select public.platform_set_company_status('%s', 'approved')$$, (select company_id from sf_company)),
  'P0001', 'platform_admin_required',
  'regular admin cannot call platform RPCs'
);

select throws_ok(
  $$select public.platform_stats()$$,
  'P0001', 'platform_admin_required',
  'regular admin cannot read platform stats'
);

select * from finish();
rollback;
