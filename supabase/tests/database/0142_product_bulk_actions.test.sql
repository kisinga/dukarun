begin;
select no_plan();
select testkit.create_user('14200000-0000-4000-8000-000000000001','bulk-admin@local.test');
select testkit.create_user('14200000-0000-4000-8000-000000000002','bulk-catalog@local.test');
select testkit.create_user('14200000-0000-4000-8000-000000000003','bulk-stock@local.test');
select testkit.create_user('14200000-0000-4000-8000-000000000004','bulk-other@local.test');
create temp table bulk_companies as select
 testkit.provision('14200000-0000-4000-8000-000000000001','Bulk Company') company_id,
 testkit.provision('14200000-0000-4000-8000-000000000004','Other Bulk Company') other_id;
grant select on bulk_companies to authenticated;
select testkit.add_member((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000002','Catalog',array['ManageCatalog']);
select testkit.add_member((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000003','Stock',array['ManageStockAdjustments']);
reset role;
update public.companies set status='approved',public_slug='bulk-company',public_storefront_enabled=true where id=(select company_id from bulk_companies);
insert into public.products(id,company_id,name,active,storefront_published,updated_at) values
 ('14210000-0000-4000-8000-000000000001',(select company_id from bulk_companies),'First',true,true,'2000-01-01'),
 ('14210000-0000-4000-8000-000000000002',(select company_id from bulk_companies),'Second',true,false,'2000-01-01'),
 ('14210000-0000-4000-8000-000000000003',(select company_id from bulk_companies),'Third',false,true,'2000-01-01'),
 ('14210000-0000-4000-8000-000000000004',(select other_id from bulk_companies),'Foreign',true,true,'2000-01-01');
insert into public.product_variants(id,product_id,company_id,name,sku,price,barcode,active) values
 ('14220000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000001',(select company_id from bulk_companies),'Base','BULK1',100,'BULK-ONE',true),
 ('14220000-0000-4000-8000-000000000002','14210000-0000-4000-8000-000000000002',(select company_id from bulk_companies),'Base','BULK2',100,'BULK-TWO',true),
 ('14220000-0000-4000-8000-000000000003','14210000-0000-4000-8000-000000000003',(select company_id from bulk_companies),'Base','BULK3',100,'BULK-THREE',false);
insert into public.categories(id,company_id,name,slug) values ('14230000-0000-4000-8000-000000000001',(select company_id from bulk_companies),'Bulk category','bulk-category');
insert into public.product_categories(company_id,product_id,category_id)
 select company_id,'14210000-0000-4000-8000-000000000001','14230000-0000-4000-8000-000000000001' from bulk_companies;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'42501','permission denied for function set_products_storefront_published','set_products_storefront_published: anonymous denied');
set local role authenticated;
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','not_authenticated','set_products_storefront_published: missing identity denied');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'42501','permission denied for function set_products_active','set_products_active: anonymous denied');
set local role authenticated;
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','not_authenticated','set_products_active: missing identity denied');
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000002','Catalog');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','permission_denied: ManageStockAdjustments required','catalog permission cannot activate');
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000003','Stock');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','permission_denied: ManageCatalog required','stock permission cannot publish');
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000001','Admin');
select throws_ok($$select public.set_products_storefront_published(null,false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 0');
select throws_ok($$select public.set_products_storefront_published('{}'::uuid[],false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 1');
select throws_ok($$select public.set_products_storefront_published(array[null]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 2');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001',null]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 3');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 4');
select throws_ok($$select public.set_products_storefront_published((select array_agg(gen_random_uuid()) from generate_series(1,101)),false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 5');
select throws_ok($$select public.set_products_storefront_published(array[['14210000-0000-4000-8000-000000000001']]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_storefront_published: invalid array 6');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001']::uuid[],null)$$,'P0001','invalid_target_state','set_products_storefront_published: null state');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000004']::uuid[],false)$$,'P0001','product_not_found','set_products_storefront_published: foreign or absent member aborts batch');
select throws_ok($$select public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000099']::uuid[],false)$$,'P0001','product_not_found','set_products_storefront_published: foreign or absent member aborts batch');
select throws_ok($$select public.set_products_active(null,false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 0');
select throws_ok($$select public.set_products_active('{}'::uuid[],false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 1');
select throws_ok($$select public.set_products_active(array[null]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 2');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001',null]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 3');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000001']::uuid[],false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 4');
select throws_ok($$select public.set_products_active((select array_agg(gen_random_uuid()) from generate_series(1,101)),false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 5');
select throws_ok($$select public.set_products_active(array[['14210000-0000-4000-8000-000000000001']]::uuid[],false)$$,'P0001','invalid_product_ids','set_products_active: invalid array 6');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001']::uuid[],null)$$,'P0001','invalid_target_state','set_products_active: null state');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000004']::uuid[],false)$$,'P0001','product_not_found','set_products_active: foreign or absent member aborts batch');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000099']::uuid[],false)$$,'P0001','product_not_found','set_products_active: foreign or absent member aborts batch');
select ok((select active and storefront_published from public.products where id='14210000-0000-4000-8000-000000000001'),'failed validation leaves valid rows unchanged');
reset role;
create temp table bulk_head as select coalesce(max(sequence),0) sequence from public.cache_change_log where company_id=(select company_id from bulk_companies) and stream='catalog';
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000002','Catalog');
select is(public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],false),'{"product_count":2,"changed_count":1}'::jsonb,'mixed publication changes only one row');
select is(public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],false),'{"product_count":2,"changed_count":0}'::jsonb,'repeating publication is idempotent');
select is((select updated_at from public.products where id='14210000-0000-4000-8000-000000000002'),'2000-01-01'::timestamptz,'unchanged row timestamp is preserved');
select ok((select active from public.products where id='14210000-0000-4000-8000-000000000001'),'publication preserves activation');
select is((select count(*)::int from public.variant_catalog where product_id in ('14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002')),2,'unpublished products remain readable internally');
reset role;
select is((select count(*)::int from public.audit_log where table_name='products' and operation='UPDATE' and actor='14200000-0000-4000-8000-000000000002'),1,'only changed publication emits an audit event');
select is((select count(*)::int from public.cache_change_log where stream='catalog' and entity_id='14210000-0000-4000-8000-000000000001' and sequence>(select sequence from bulk_head)),1,'publication reuses catalogue cache events');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(jsonb_array_length(public.storefront_page('bulk-company')->'rows'),0,'anon: bulk unpublish hides page');
select is((select count(*)::int from public.storefront_catalog_page('bulk-company')),0,'anon: bulk unpublish hides legacy page');
select is((select count(*)::int from public.storefront_product('bulk-company','14210000-0000-4000-8000-000000000001')),0,'anon: bulk unpublish hides details');
select is(jsonb_array_length(public.storefront_product_units('bulk-company','14210000-0000-4000-8000-000000000001')),0,'anon: bulk unpublish hides pack details');
select is((select count(*)::int from public.storefront_categories('bulk-company')),0,'anon: bulk unpublish hides empty categories');
select ok(not exists(select 1 from jsonb_array_elements(public.public_storefront_sitemap()) item where item->>'product_id'='14210000-0000-4000-8000-000000000001'),'anon: bulk unpublish removes sitemap entry');
set local role authenticated;
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000001','Admin');
select is(jsonb_array_length(public.storefront_page('bulk-company')->'rows'),0,'authenticated: bulk unpublish hides page');
select is((select count(*)::int from public.storefront_catalog_page('bulk-company')),0,'authenticated: bulk unpublish hides legacy page');
select is((select count(*)::int from public.storefront_product('bulk-company','14210000-0000-4000-8000-000000000001')),0,'authenticated: bulk unpublish hides details');
select is(jsonb_array_length(public.storefront_product_units('bulk-company','14210000-0000-4000-8000-000000000001')),0,'authenticated: bulk unpublish hides pack details');
select is((select count(*)::int from public.storefront_categories('bulk-company')),0,'authenticated: bulk unpublish hides empty categories');
select ok(not exists(select 1 from jsonb_array_elements(public.public_storefront_sitemap()) item where item->>'product_id'='14210000-0000-4000-8000-000000000001'),'authenticated: bulk unpublish removes sitemap entry');
select is(public.set_products_storefront_published(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],true),'{"product_count":2,"changed_count":2}'::jsonb,'republish restores both products');
select is(jsonb_array_length(public.storefront_page('bulk-company')->'rows'),2,'republish restores public readers');
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000003','Stock');
select is(public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],false),'{"product_count":2,"changed_count":2}'::jsonb,'stock permission can deactivate');
select is(public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],false),'{"product_count":2,"changed_count":0}'::jsonb,'activation is idempotent');
select ok((select bool_and(storefront_published) from public.products),'activation preserves publication');
select is((select count(*)::int from public.product_variants where active),2,'deactivation preserves variant states');
select is(public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],true),'{"product_count":2,"changed_count":2}'::jsonb,'reactivation restores products');
select is(jsonb_array_length(public.storefront_page('bulk-company')->'rows'),2,'reactivation restores published products publicly');
reset role;
select is((select count(*)::int from public.audit_log where table_name='products' and operation='UPDATE' and actor='14200000-0000-4000-8000-000000000003'),4,'activation audits only changed rows');
select is((select count(*)::int from public.cache_change_log where stream='catalog' and entity_id='14210000-0000-4000-8000-000000000002' and sequence>(select sequence from bulk_head)),3,'republish and activation reuse cache events');
-- Two inactive parents may contain a barcode that will collide only when reactivated.
update public.products set active=false where id in ('14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002');
update public.products set barcode='BULK-CONFLICT' where id='14210000-0000-4000-8000-000000000001';
update public.product_variants set barcode=null where id='14220000-0000-4000-8000-000000000001';
update public.product_variants set barcode='BULK-CONFLICT' where id='14220000-0000-4000-8000-000000000002';
select testkit.as_user((select company_id from bulk_companies),'14200000-0000-4000-8000-000000000003','Stock');
select throws_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000001','14210000-0000-4000-8000-000000000002']::uuid[],true)$$,'P0001','barcode_conflict: BULK-CONFLICT','reactivation barcode conflict fails atomically');
select is((select count(*)::int from public.products where active),0,'failed reactivation rolls back all products');
select lives_ok($$select public.set_products_active(array['14210000-0000-4000-8000-000000000003']::uuid[],true)$$,'parent may reactivate while its variant stays inactive');
select is((select active from public.product_variants where id='14220000-0000-4000-8000-000000000003'),false,'inactive variant remains inactive');
select * from finish();
rollback;
