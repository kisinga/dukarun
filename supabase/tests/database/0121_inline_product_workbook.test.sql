begin;
select no_plan();
select testkit.create_user('aa210000-0000-4000-8000-000000000001','inline-workbook@test.local');
create temp table inline_company as
select testkit.provision('aa210000-0000-4000-8000-000000000001','Inline Workbook Shop') company_id;
select testkit.as_user((select company_id from inline_company),'aa210000-0000-4000-8000-000000000001','Admin');

create temp table inline_existing as select public.create_catalog_product('Existing workbook eggs',
  '[{"name":"Large","sku":"INLINE-EXISTING","price":20,"stock_unit":"egg","packs":[{"id":"aa210000-0000-4000-8000-000000000002","name":"Tray","units_per_pack":30,"sale_price":480}],"opening_quantity":10,"opening_unit_cost":14}]') id;
create temp table inline_variant as select v.id, v.updated_at,
  (select id from public.stock_locations where company_id=v.company_id and code='MAIN') location_id
from public.product_variants v where v.product_id=(select id from inline_existing);

create temp table inline_import as select (public.begin_catalog_import('merge',
  p_idempotency_key=>'aa210000-0000-4000-8000-000000000010')->>'import_id')::uuid id;
select public.append_catalog_import_chunk((select id from inline_import),0,
  jsonb_build_array(
    jsonb_build_object('name','New workbook eggs','product_key','new-eggs','variants',jsonb_build_array(
      jsonb_build_object('name','Large','sku','INLINE-NEW-LARGE','price',20,'stock_unit','egg',
        'opening_quantity',120,'opening_unit_cost',14,'opening_location_id',(select location_id from inline_variant),
        'packs','[{"id":"aa210000-0000-4000-8000-000000000003","name":"Tray","units_per_pack":30,"sale_price":480,"barcode":"INLINE-TRAY-L"},{"id":"aa210000-0000-4000-8000-000000000004","name":"Box","units_per_pack":12,"sale_price":null}]'::jsonb),
      jsonb_build_object('name','Small','sku','INLINE-NEW-SMALL','price',18,'stock_unit','egg',
        'opening_quantity',60,'opening_unit_cost',12,'opening_location_id',(select location_id from inline_variant),
        'packs','[{"id":"aa210000-0000-4000-8000-000000000005","name":"Tray","units_per_pack":30,"sale_price":420,"barcode":"INLINE-TRAY-S"}]'::jsonb)
    )),
    jsonb_build_object('name','Existing workbook eggs','product_key','existing-eggs',
      'product_id',(select id from inline_existing),
      'expected_product_updated_at',(select updated_at from public.products where id=(select id from inline_existing)),
      'variants',jsonb_build_array(jsonb_build_object('name','Small','sku','INLINE-EXISTING-SMALL',
        'price',18,'stock_unit','egg','opening_quantity',25,'opening_unit_cost',12,
        'opening_location_id',(select location_id from inline_variant),
        'packs','[{"id":"aa210000-0000-4000-8000-000000000006","name":"Tray","units_per_pack":30,"sale_price":420}]'::jsonb)))
  ));
create temp table inline_changes as select
  jsonb_build_array(jsonb_build_object('variant_id',id,'expected_updated_at',updated_at,
    'new_retail_price',22,'stock_location_id',location_id,'expected_stock_quantity',10,'new_stock_quantity',9)) variants,
  jsonb_build_array(jsonb_build_object('variant_id',id,'stock_unit','egg',
    'expected_packs',(select packs from public.catalog_pack_definitions(array[inline_variant.id])),
    'packs',jsonb_set((select packs from public.catalog_pack_definitions(array[inline_variant.id])),'{0,sale_price}','500'::jsonb))) packs
from inline_variant;
create temp table inline_result as select public.apply_catalog_workbook_units(
  p_variant_changes=>(select variants from inline_changes),
  p_pack_changes=>(select packs from inline_changes),p_import_id=>(select id from inline_import)) result;
select is((select (result->>'created')::integer from inline_result),1,'one upload creates one new product');
select is((select (result->>'created_variants')::integer from inline_result),3,'new and existing products receive three new variants');
select is((select count(*)::integer from public.product_variants where sku like 'INLINE-NEW-%'),2,'both new-product variants are created');
select is((select count(*)::integer from public.product_variants where product_id=(select id from inline_existing)),2,'existing product retains its old variant and gains a new one');
select is((select count(*)::integer from public.variant_packs p join public.product_variants v on v.id=p.variant_id where v.sku like 'INLINE-%'),5,'each pack is attached once to its intended variant');
select is((select stock_unit from public.product_variants where sku='INLINE-NEW-LARGE'),'egg','creation preserves the configured base unit');
select is((select v.sku from public.product_variants v join public.variant_packs p on p.variant_id=v.id where p.barcode='INLINE-TRAY-S'),'INLINE-NEW-SMALL','pack barcode belongs to its specific new variant');
select is((select sum(b.remaining) from public.inventory_batches b join public.product_variants v on v.id=b.variant_id where v.sku like 'INLINE-NEW-%'),180::numeric,'opening stock is stored once per variant in base units');
select is((select sum(b.remaining_cost)::bigint from public.inventory_batches b join public.product_variants v on v.id=b.variant_id where v.sku like 'INLINE-NEW-%'),2400::bigint,'opening stock cost is conserved');
select is((select price from public.product_variants where id=(select id from inline_variant)),22::bigint,'existing price edits apply with creation');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from inline_variant)),9::numeric,'existing stock edits apply with creation');
select is((select sale_price from public.variant_packs where id='aa210000-0000-4000-8000-000000000002'),500::bigint,'existing pack edits apply with creation');
select is(public.apply_catalog_workbook_units(p_variant_changes=>(select variants from inline_changes),
  p_pack_changes=>(select packs from inline_changes),p_import_id=>(select id from inline_import)),
  (select result from inline_result),'a retry returns the original full result before stale checks');
select is((select count(*)::integer from public.product_variants where sku like 'INLINE-%'),4,'retry does not duplicate variants');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from inline_variant)),9::numeric,'retry does not repeat a stock adjustment');
select ok((select not (result ? 'workbook_request') and length(result->>'workbook_request_hash')=64
  from public.catalog_imports where id=(select id from inline_import)),
  'retry history keeps a fingerprint without exposing workbook financial inputs');
select throws_ok($$select public.apply_catalog_workbook_units(p_import_id=>(select id from inline_import))$$,
  'P0001','catalog_workbook_retry_mismatch','a completed creation cannot be reused for a different workbook');

-- A failure saving an existing pack occurs after creation and ordinary updates;
-- it must roll the entire operation back, including the staged-import completion.
create temp table inline_failed_import as select (public.begin_catalog_import('merge',
  p_idempotency_key=>'aa210000-0000-4000-8000-000000000020')->>'import_id')::uuid id;
select public.append_catalog_import_chunk((select id from inline_failed_import),0,
  '[{"name":"Workbook must roll back","variants":[{"name":"Default","sku":"INLINE-ROLLBACK","price":20,"stock_unit":"piece","packs":[],"opening_quantity":10,"opening_unit_cost":5}]}]');
create temp table inline_failure_changes as select
  jsonb_build_array(jsonb_build_object('variant_id',v.id,'expected_updated_at',v.updated_at,'new_retail_price',30)) variants,
  jsonb_build_array(jsonb_build_object('variant_id',v.id,'stock_unit','egg',
    'expected_packs',(select packs from public.catalog_pack_definitions(array[v.id])),
    'packs',jsonb_set((select packs from public.catalog_pack_definitions(array[v.id])),'{0,units_per_pack}','20'::jsonb))) packs
from public.product_variants v where v.id=(select id from inline_variant);
select throws_ok($$select public.apply_catalog_workbook_units(
  p_variant_changes=>(select variants from inline_failure_changes),
  p_pack_changes=>(select packs from inline_failure_changes),p_import_id=>(select id from inline_failed_import))$$,
  'P0001','pack_contents_immutable: retire this pack and create a replacement','invalid pack contents reject the whole workbook');
select is((select count(*)::integer from public.products where name='Workbook must roll back'),0,'failed workbook leaves no new product');
select is((select count(*)::integer from public.product_variants where sku='INLINE-ROLLBACK'),0,'failed workbook leaves no variant or opening batch');
select is((select price from public.product_variants where id=(select id from inline_variant)),22::bigint,'failed workbook rolls back existing price changes');
select is((select status from public.catalog_imports where id=(select id from inline_failed_import)),'processing','failed apply retains a retryable staged import');

-- New variants on an existing product require its exported version.
create temp table inline_stale_import as select (public.begin_catalog_import('merge',
  p_idempotency_key=>'aa210000-0000-4000-8000-000000000030')->>'import_id')::uuid id;
select public.append_catalog_import_chunk((select id from inline_stale_import),0,
  jsonb_build_array(jsonb_build_object('name','Existing workbook eggs','product_id',(select id from inline_existing),
    'expected_product_updated_at',(select updated_at from public.products where id=(select id from inline_existing)),
    'variants','[{"name":"Medium","sku":"INLINE-STALE","price":19,"stock_unit":"egg","packs":[]}]'::jsonb)));
reset role;
update public.products set updated_at=clock_timestamp()+interval '1 second' where id=(select id from inline_existing);
set local role authenticated;
select throws_ok($$select public.apply_catalog_workbook_units(p_import_id=>(select id from inline_stale_import))$$,
  'P0001','stale_catalog_product_export','concurrent parent edits prevent adding a variant from an old workbook');
select is((select count(*)::integer from public.product_variants where sku='INLINE-STALE'),0,'stale parent check runs before creation');

-- Product creation retains its existing stock-adjustment permission requirement,
-- with or without nested packs.
reset role;
select testkit.create_user('aa210000-0000-4000-8000-000000000040','inline-catalog-only@test.local');
select testkit.add_member((select company_id from inline_company),
  'aa210000-0000-4000-8000-000000000040','Catalog only',array['ManageCatalog']);
select testkit.as_user((select company_id from inline_company),
  'aa210000-0000-4000-8000-000000000040','Catalog only');
create temp table inline_basic_import as select (public.begin_catalog_import('merge',
  p_idempotency_key=>'aa210000-0000-4000-8000-000000000041')->>'import_id')::uuid id;
select public.append_catalog_import_chunk((select id from inline_basic_import),0,
  '[{"name":"Catalogue-only workbook product","variants":[{"name":"Default","sku":"INLINE-BASIC","price":20,"stock_unit":"item"}]}]');
select throws_ok($$select public.apply_catalog_workbook_units(p_import_id=>(select id from inline_basic_import))$$,
  'P0001','catalog_create_failed: permission_denied: ManageStockAdjustments required',
  'plain product creation retains the existing stock permission requirement');
create temp table inline_denied_import as select (public.begin_catalog_import('merge',
  p_idempotency_key=>'aa210000-0000-4000-8000-000000000042')->>'import_id')::uuid id;
select public.append_catalog_import_chunk((select id from inline_denied_import),0,
  '[{"name":"Workbook pack permission denied","variants":[{"name":"Default","sku":"INLINE-DENIED","price":20,"packs":[{"name":"Box","units_per_pack":10,"sale_price":180}]}]}]');
select throws_ok($$select public.apply_catalog_workbook_units(p_import_id=>(select id from inline_denied_import))$$,
  'P0001','catalog_create_failed: permission_denied: ManageStockAdjustments required',
  'nested new packs enforce the existing stock permission');
select is((select count(*)::integer from public.products where name='Workbook pack permission denied'),
  0,'permission failure rolls back nested creation');

select * from finish();
rollback;
