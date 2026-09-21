begin;
select no_plan();
select testkit.create_user('aa200000-0000-4000-8000-000000000001','packs@test.local');
create temp table pack_fixture as select testkit.provision('aa200000-0000-4000-8000-000000000001','Pack Test') company_id;
grant select on pg_temp.pack_fixture to authenticated;
insert into public.products(id,company_id,name) select 'aa200000-0000-4000-8000-000000000002',company_id,'Tablets' from pack_fixture;
insert into public.product_variants(id,company_id,product_id,name,sku,price,wholesale_price,stock_unit)
select 'aa200000-0000-4000-8000-000000000003',company_id,'aa200000-0000-4000-8000-000000000002','Default','TABLET',15,12,'tablet' from pack_fixture;
insert into public.variant_packs(id,company_id,variant_id,name,units_per_pack,sale_price,barcode)
select 'aa200000-0000-4000-8000-000000000004',company_id,'aa200000-0000-4000-8000-000000000003','Box',100,900,'PACK-BOX' from pack_fixture;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select 'aa200000-0000-4000-8000-000000000005',company_id,'Supplier',true,100000 from pack_fixture;
select testkit.as_user((select company_id from pack_fixture),'aa200000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
create temp table pack_purchase as select public.record_purchase_complete(
 'aa200000-0000-4000-8000-000000000005',
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":2,"unit_cost":755}]',
 '[]',0,'PACK-BUY') id;
select results_eq($$select quantity,stock_quantity,unit_cost,line_total,unit_name from public.purchase_lines where purchase_id=(select id from pack_purchase)$$,
 $$values (2::numeric,200::numeric,755::bigint,1510::bigint,'Box'::text)$$,'supplier invoice retains boxes and exact box cost');
select results_eq($$select quantity,remaining,original_cost,remaining_cost from public.inventory_batches where variant_id='aa200000-0000-4000-8000-000000000003'$$,
 $$values (200::numeric,200::numeric,1510::bigint,1510::bigint)$$,'one stock balance preserves indivisible acquisition value');
select is(public.resolve_catalog_selling_unit('PACK-BOX')->>'selected_pack_id','aa200000-0000-4000-8000-000000000004','barcode resolves exact pack');
select throws_ok($$select public.save_draft(null,'[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":0.5}]')$$,'P0001','whole_packs_required','partial boxes rejected');
select throws_ok($$select public.save_draft(null,'[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":1,"expected_unit_price":899}]')$$,'P0001','selling_price_changed: refresh this line before posting','stale selling price cannot silently change tendered money');
create temp table packed_draft as select public.save_draft(null,
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":1}]') id;
select throws_ok($$select public.save_draft(null,'[{"variant_id":"aa200000-0000-4000-8000-000000000003","quantity":1}]',(select id from packed_draft))$$,
 'P0001','pack_client_update_required: reopen the app before editing this sale','older clients cannot flatten a held box into a piece');
select throws_ok($$select public.post_sale(null,
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","quantity":1,"unit_price":15}]',
 '[{"method":"cash","amount":15}]',p_draft_id=>(select id from packed_draft))$$,
 'P0001','pack_client_update_required: reopen the app before editing this sale',
 'legacy checkout cannot replace a held pack with a base-unit sale');
select throws_ok($$select public.post_offline_sale_at_location(
 (select id from public.stock_locations where company_id=(select company_id from pack_fixture) and code='MAIN'),
 null,'[{"variant_id":"aa200000-0000-4000-8000-000000000003","quantity":1,"unit_price":15}]',
 '[{"method":"cash","amount":15}]','legacy-pack-checkout',now(),'pack-test-device',
 p_draft_id=>(select id from packed_draft))$$,
 'P0001','pack_client_update_required: reopen the app before editing this sale',
 'offline checkout applies the same held-pack compatibility guard');
select is((select stock_quantity from public.order_lines where order_id=(select id from packed_draft)),
 100::numeric,'rejected legacy checkouts preserve the original held pack');
create temp table pack_sale as select public.post_sale(null,
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":1,"units_per_unit":100},{"variant_id":"aa200000-0000-4000-8000-000000000003","quantity":1,"units_per_unit":1}]',
 '[{"method":"cash","amount":915}]',p_client_ref=>'pack-checkout',p_draft_id=>(select id from packed_draft)) id;
select is((select count(*)::int from public.orders where id=(select id from packed_draft)),0,
 'pack-aware checkout replaces the source draft');
select is(public.post_sale(null,
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":1,"units_per_unit":100},{"variant_id":"aa200000-0000-4000-8000-000000000003","quantity":1,"units_per_unit":1}]',
 '[{"method":"cash","amount":915}]',p_client_ref=>'pack-checkout',p_draft_id=>(select id from packed_draft)),
 (select id from pack_sale),'pack checkout retry succeeds after the source draft was deleted');
select is((select quantity_total from public.orders where id=(select id from pack_sale)),101::numeric,'mixed cart reports normalized pieces');
select is((select total from public.orders where id=(select id from pack_sale)),915::bigint,'box has independent price below wholesale equivalent');
select is((select remaining from public.inventory_batches where variant_id='aa200000-0000-4000-8000-000000000003'),99::numeric,'mixed sale consumes the same stock');
select is((select sum(cogs_total)::bigint from public.order_lines where order_id=(select id from pack_sale))+
 (select remaining_cost from public.inventory_batches where variant_id='aa200000-0000-4000-8000-000000000003'),1510::bigint,'COGS plus remaining cost exactly conserves purchase value');
select throws_ok($$select public.post_sale(null,'[{"variant_id":"aa200000-0000-4000-8000-000000000003","pack_id":"aa200000-0000-4000-8000-000000000004","quantity":1}]','[{"method":"cash","amount":900}]')$$,'P0001',null,'99 loose pieces cannot fulfill a box of 100');
select is(public.post_full_refund((select id from pack_sale),'cash','Returned mixed units','return_to_stock')->>'status','completed','full refund completes');
select results_eq($$select remaining,remaining_cost from public.inventory_batches where variant_id='aa200000-0000-4000-8000-000000000003'$$,
 $$values (200::numeric,1510::bigint)$$,'refund restores exact stock and acquisition value');
select lives_ok($$select public.reverse_purchase((select id from pack_purchase),'Supplier cancelled invoice')$$,'purchase reversal compares normalized batch quantity');
select is((select remaining from public.inventory_batches where variant_id='aa200000-0000-4000-8000-000000000003'),0::numeric,'reversal removes the complete purchased stock');
create temp table created_pack_product as select public.save_catalog_product_units(
 '{"name":"Atomic pack product","category_ids":[]}',
 '[{"price":15,"sku":"ATOMIC-PACK","opening_quantity":10,"opening_unit_cost":8,"opening_total_cost":75,"packs":[],"stock_unit":"piece"}]',
 'aa200000-0000-4000-8000-000000000007') id;
select is(public.save_catalog_product_units('{"name":"Atomic pack product","category_ids":[]}',
 '[{"price":15,"sku":"ATOMIC-PACK","opening_quantity":10,"opening_unit_cost":8,"opening_total_cost":75,"packs":[],"stock_unit":"piece"}]',
 'aa200000-0000-4000-8000-000000000007'),(select id from created_pack_product),'retry does not duplicate the product or opening stock');
select is((select sum(b.remaining_cost)::bigint from public.inventory_batches b join public.product_variants v on v.id=b.variant_id where v.product_id=(select id from created_pack_product)),75::bigint,'exact opening cost survives retry');
select throws_ok($$select public.save_catalog_product_units('{"name":"Must roll back","category_ids":["aa200000-0000-4000-8000-000000000099"]}',
 '[{"price":15,"sku":"ROLLBACK-PACK","packs":[]}]','aa200000-0000-4000-8000-000000000008')$$,'P0001',null,'invalid category rolls back product creation');
select is((select count(*)::int from public.product_variants where sku='ROLLBACK-PACK'),0,'failed category assignment leaves no partial product');
reset role;
select throws_ok($$update public.variant_packs set units_per_pack=50 where id='aa200000-0000-4000-8000-000000000004'$$,'P0001','pack_contents_immutable: retire this pack and create a replacement','contents cannot rewrite historical or offline conversion');
select throws_ok($$update public.product_variants set barcode='PACK-BOX' where id='aa200000-0000-4000-8000-000000000003'$$,'P0001',null,'pack and piece barcode namespace cannot collide');
select lives_ok($$update public.product_variants set allow_fractional=true where id='aa200000-0000-4000-8000-000000000003'$$,'base quantities can become fractional while keeping active packs');
-- Pack-only changes must reach existing catalogue consumers, including missed-event replay.
create temp table pack_cache_head as select head_sequence from public.cache_stream_heads
where company_id=(select company_id from pack_fixture) and stream='catalog';
select public.save_variant_packs('aa200000-0000-4000-8000-000000000003','tablet',
 '[{"id":"aa200000-0000-4000-8000-000000000004","name":"Box","units_per_pack":100,"sale_price":880,"barcode":"PACK-BOX","active":true}]');
select ok(exists(select 1 from public.cache_change_log where company_id=(select company_id from pack_fixture)
 and stream='catalog' and entity_type='variant' and entity_id='aa200000-0000-4000-8000-000000000003'
 and sequence>(select head_sequence from pack_cache_head)), 'pack price change wakes the existing variant journal');
select is((select packs->0->>'sale_price' from public.catalog_pack_definitions(array['aa200000-0000-4000-8000-000000000003'::uuid])),
 '880','catalogue hydration reads the updated fixed pack price');
select public.save_variant_packs('aa200000-0000-4000-8000-000000000003','tablet','[]');
select is((select packs->0->>'active' from public.catalog_pack_definitions(array['aa200000-0000-4000-8000-000000000003'::uuid])),
 'false','retirement persists in cache hydration without deleting historical identity');
select is((select unit_price from public.order_lines where order_id=(select id from pack_sale) and pack_id is not null),
 900::bigint,'catalogue changes leave historical pack price intact');
select throws_ok($$update public.purchase_lines set units_per_unit=1 where purchase_id=(select id from pack_purchase)$$,
 'P0001',null,'posted purchase conversion cannot be rewritten');
-- Workbook pack-only edits use the same aggregate and reject stale exports.
create temp table pack_export as select jsonb_build_array(jsonb_build_object(
 'variant_id','aa200000-0000-4000-8000-000000000003','stock_unit','tablet',
 'expected_packs',public.catalog_packs_json('aa200000-0000-4000-8000-000000000003'),
 'packs',jsonb_set(public.catalog_packs_json('aa200000-0000-4000-8000-000000000003'),'{0,active}','true'))) changes;
select is(public.apply_catalog_workbook_units(p_pack_changes=>(select changes from pack_export))->>'pack_changes',
 '1','pack-only workbook applies without requiring an unrelated price/stock edit');
select throws_ok($$select public.apply_catalog_workbook_units(p_pack_changes=>(select changes from pack_export))$$,
 'P0001','stale_pack_export: pack definitions changed after export','old workbook cannot overwrite newer pack definitions');

-- A committed product can be retried after a lost response without cleanup deleting its photo.
insert into storage.objects(bucket_id,name) select 'product-images',company_id::text||'/aa200000-0000-4000-8000-000000000077.webp' from pack_fixture;
update public.products set image_path=(select company_id::text||'/aa200000-0000-4000-8000-000000000077.webp' from pack_fixture)
where id=(select id from created_pack_product);
set local role authenticated;
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id='product-images' and name=(select company_id::text||'/aa200000-0000-4000-8000-000000000077.webp' from pack_fixture);
reset role;
select is((select count(*)::int from storage.objects where bucket_id='product-images'
 and name=(select company_id::text||'/aa200000-0000-4000-8000-000000000077.webp' from pack_fixture)),1,
 'cleanup cannot remove an attached product image after an uncertain save');
-- Retired pack history must not prevent quantity-type changes or later edits.
select lives_ok($q$select public.update_catalog_product(
 'aa200000-0000-4000-8000-000000000002','Tablets',
 jsonb_build_array(jsonb_build_object(
   'variant_id','aa200000-0000-4000-8000-000000000003','price',15,
   'allow_fractional',true,'stock_unit','tablet',
   'packs',jsonb_set(public.catalog_packs_json('aa200000-0000-4000-8000-000000000003'),'{0,active}','false'))))$q$,
 'retire packs and enable fractional quantities in one product save');
select lives_ok($q$select public.save_variant_packs(
 'aa200000-0000-4000-8000-000000000003','tablet',
 public.catalog_packs_json('aa200000-0000-4000-8000-000000000003'))$q$,
 'retired packs can be saved again on fractional goods');
select lives_ok($q$update public.variant_packs set active=true
 where id='aa200000-0000-4000-8000-000000000004'$q$,
 'fractional goods can reactivate packs');
select throws_ok($q$update public.product_variants set kind='service'
 where id='aa200000-0000-4000-8000-000000000003'$q$,
 'P0001','retire_packs_before_changing_quantity_type','services still require pack retirement');
update public.variant_packs set active=false where id='aa200000-0000-4000-8000-000000000004';
select lives_ok($q$select public.update_catalog_product(
 'aa200000-0000-4000-8000-000000000002','Tablets',
 jsonb_build_array(jsonb_build_object(
   'variant_id','aa200000-0000-4000-8000-000000000003','price',15,
   'kind','service','stock_unit','tablet',
   'packs',public.catalog_packs_json('aa200000-0000-4000-8000-000000000003'))))$q$,
 'retired packs can be retained when changing to a service');
select throws_ok($q$update public.variant_packs set active=true
 where id='aa200000-0000-4000-8000-000000000004'$q$,
 'P0001','packs_require_goods','services still cannot reactivate packs');
select throws_ok($q$update public.variant_packs set units_per_pack=50
 where id='aa200000-0000-4000-8000-000000000004'$q$,
 'P0001','pack_contents_immutable: retire this pack and create a replacement',
 'retired pack contents remain immutable after quantity-type changes');
-- Replacement packs may reuse retired barcodes without rewriting old documents.
update public.product_variants set kind='good',allow_fractional=false
where id='aa200000-0000-4000-8000-000000000003';
select lives_ok($q$select public.save_catalog_product_units(
 '{"product_id":"aa200000-0000-4000-8000-000000000002","name":"Tablets"}',
 '[{"variant_id":"aa200000-0000-4000-8000-000000000003","price":15,"stock_unit":"tablet","packs":[
 {"id":"aa200000-0000-4000-8000-000000000090","name":"Small box","units_per_pack":50,"sale_price":450,"barcode":"PACK-BOX","active":true},
 {"id":"aa200000-0000-4000-8000-000000000004","name":"Box","units_per_pack":100,"sale_price":880,"barcode":"PACK-BOX","active":false}]}]',
 'aa200000-0000-4000-8000-000000000091')$q$,
 'product editor can replace a retired pack using the same barcode');
select is(public.resolve_catalog_selling_unit('PACK-BOX')->>'selected_pack_id',
 'aa200000-0000-4000-8000-000000000090','barcode resolves only the replacement pack');
select is((select units_per_unit from public.order_lines where order_id=(select id from pack_sale) and pack_id is not null),
 100::numeric,'old sale retains its original pack contents');
select throws_ok($q$update public.variant_packs set active=true
 where id='aa200000-0000-4000-8000-000000000004'$q$,
 '23505',null,'reactivation cannot duplicate an active pack barcode');
select throws_ok($q$update public.product_variants set barcode='PACK-BOX'
 where id='aa200000-0000-4000-8000-000000000003'$q$,
 'P0001',null,'replacement barcode still cannot collide with a base-unit barcode');
select lives_ok($q$select public.save_variant_packs(
 'aa200000-0000-4000-8000-000000000003','tablet',
 '[{"id":"aa200000-0000-4000-8000-000000000092","name":"Mini box","units_per_pack":25,"sale_price":225,"barcode":"PACK-BOX","active":true},
 {"id":"aa200000-0000-4000-8000-000000000090","name":"Small box","units_per_pack":50,"sale_price":450,"barcode":"PACK-BOX","active":false}]')$q$,
 'replacement may precede the active pack being retired in the same request');
select lives_ok($q$select public.save_variant_packs(
 'aa200000-0000-4000-8000-000000000003','tablet',
 '[{"id":"aa200000-0000-4000-8000-000000000093","name":"Tiny box","units_per_pack":10,"sale_price":90,"barcode":"PACK-BOX","active":true}]')$q$,
 'omitted pack retires before its barcode is reused');
select is(public.resolve_catalog_selling_unit('PACK-BOX')->>'selected_pack_id',
 'aa200000-0000-4000-8000-000000000093','barcode resolves the final replacement');
select * from finish();
rollback;
