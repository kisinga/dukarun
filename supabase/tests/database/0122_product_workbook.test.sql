begin;
select no_plan();
select testkit.create_user('aa220000-0000-4000-8000-000000000001','products-workbook@test.local');
create temp table workbook_company as select testkit.provision('aa220000-0000-4000-8000-000000000001','Products Workbook Shop') id;
grant select on workbook_company to authenticated;
select testkit.as_user((select id from workbook_company),'aa220000-0000-4000-8000-000000000001','Admin');
create temp table workbook_product as select public.create_catalog_product('Workbook eggs',
  '[{"name":"Large","sku":"WB-EGGS","price":20,"stock_unit":"egg","packs":[{"id":"aa220000-0000-4000-8000-000000000002","name":"Tray","units_per_pack":30,"sale_price":480}],"opening_quantity":97,"opening_unit_cost":14,"opening_total_cost":1400}]') id;
create temp table workbook_variant as select id,product_id from public.product_variants where product_id=(select id from workbook_product);
create temp table workbook_location as select id from public.stock_locations where company_id=(select id from workbook_company) and code='MAIN';

create function pg_temp.workbook_change(p_variant uuid,p_price bigint,p_count numeric default null)
returns jsonb language plpgsql as $$
declare v jsonb; p jsonb; packs jsonb; stock numeric; loc uuid;
begin
  select to_jsonb(x) into v from public.product_variants x where id=p_variant;
  select to_jsonb(x) into p from public.products x where id=(v->>'product_id')::uuid;
  select id into loc from public.stock_locations where company_id=(p->>'company_id')::uuid and code='MAIN';
  select d.packs into packs from public.catalog_pack_definitions(array[p_variant]) d;
  select coalesce(sum(remaining),0) into stock from public.inventory_batches where variant_id=p_variant and stock_location_id=loc;
  return jsonb_build_object('format','dukarun-products-1','company_id',public.current_company_id(),'location_id',loc,
    'manufacturers','[]'::jsonb,'batches','[]'::jsonb,
    'stock',case when p_count is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('variant_id',p_variant,
      'stock_location_id',loc,'expected_stock_quantity',stock,'new_stock_quantity',p_count)) end,
    'products',jsonb_build_array(jsonb_build_object('key',p->>'id','id',p->>'id','expected_updated_at',p->>'updated_at',
      'values',jsonb_build_object('name',p->>'name','barcode',p->'barcode','active',p->'active','manufacturer_key',p->'manufacturer_id','tax_category_id',p->'tax_category_id'),
      'variants',jsonb_build_array(jsonb_build_object('key',v->>'id','id',v->>'id','expected_updated_at',v->>'updated_at',
        'values',(v-'id'-'company_id'-'product_id'-'created_at'-'updated_at')||jsonb_build_object('price',p_price),
        'expected_packs',packs,'packs',packs)))));
end;
$$;

create temp table workbook_snapshot as select public.product_workbook_snapshot((select id from workbook_location)) data;
select is((select (data#>>'{stock,0,quantity}')::numeric from workbook_snapshot),97::numeric,'snapshot counts stock once in the base unit');
select is((select data#>>'{stock,0,value}' from workbook_snapshot),'1400','snapshot preserves exact value independently of rounded cost');
select is((select data#>>'{stock,0,batch,unit_cost}' from workbook_snapshot),'14','snapshot retains actual buying price');
select is((select jsonb_array_length(data->'packs') from workbook_snapshot),1,'snapshot includes existing packs');

create temp table workbook_request as select pg_temp.workbook_change((select id from workbook_variant),22,95) data;
create temp table workbook_result as select public.apply_product_workbook('aa220000-0000-4000-8000-000000000010',(select data from workbook_request)) data;
select is((select price from public.product_variants where id=(select id from workbook_variant)),22::bigint,'price edit is applied');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from workbook_variant)),95::numeric,'count is the final location quantity');
select is(public.apply_product_workbook('aa220000-0000-4000-8000-000000000010',(select data from workbook_request)),(select data from workbook_result),'update-only retry returns the original result');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from workbook_variant)),95::numeric,'retry does not repeat inventory changes');
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000010',jsonb_set((select data from workbook_request),'{products,0,variants,0,values,price}','30'))$$,
  'P0001','product_workbook_retry_mismatch','a request ID cannot be reused for different edits');
select ok((select not (result::text like '%unit_cost%') and length(result->>'product_workbook_hash')=64 from public.catalog_imports where idempotency_key='aa220000-0000-4000-8000-000000000010'),'retry history retains a hash and counts without financial input');

-- All creations and existing edits share the same transaction and reference map.
create temp table workbook_creation as select jsonb_set(
  pg_temp.workbook_change((select id from workbook_variant),23),'{manufacturers}',
  '[{"key":"new-maker-6","id":null,"expected_updated_at":null,"name":"Workbook supplier","active":true}]') data;
update workbook_creation set data=jsonb_set(data,'{products}',(data->'products')||jsonb_build_array(jsonb_build_object(
  'key','new-product-10','id',null,'expected_updated_at',null,
  'values',jsonb_build_object('name','Workbook soap','barcode',null,'active',true,'manufacturer_key','new-maker-6','tax_category_id',null),
  'variants',jsonb_build_array(jsonb_build_object('key','new-variant-10','id',null,'expected_updated_at',null,
    'values',jsonb_build_object('name','250g','sku','WB-SOAP','barcode',null,'kind','good','price',50,'wholesale_price',45,
      'stock_unit','bar','track_inventory',true,'allow_fractional',false,'active',true),
    'packs','[{"id":"aa220000-0000-4000-8000-000000000003","name":"Box","units_per_pack":12,"sale_price":540,"barcode":"WB-BOX","active":true}]'::jsonb,
    'expected_packs','[]'::jsonb,'opening_quantity',48,'opening_unit_cost',32)))));
create temp table workbook_creation_result as select public.apply_product_workbook('aa220000-0000-4000-8000-000000000011',(select data from workbook_creation)) data;
select is((select (data->>'products_created')::integer from workbook_creation_result),1,'mixed workbook creates its product');
select is((select v.stock_unit from public.product_variants v where v.sku='WB-SOAP'),'bar','new stock unit maps to the actual variant field');
select is((select m.name from public.products p join public.manufacturers m on m.id=p.manufacturer_id where p.name='Workbook soap'),'Workbook supplier','new manufacturer resolves before product creation');
select is((select v.sku from public.variant_packs p join public.product_variants v on v.id=p.variant_id where p.barcode='WB-BOX'),'WB-SOAP','new pack is assigned to the intended variant');
select is((select sum(b.remaining) from public.inventory_batches b join public.product_variants v on v.id=b.variant_id where v.sku='WB-SOAP'),48::numeric,'opening stock is stored once');
select is((select sum(b.remaining_cost) from public.inventory_batches b join public.product_variants v on v.id=b.variant_id where v.sku='WB-SOAP'),1536::numeric,'opening inventory value is preserved');
select is(public.apply_product_workbook('aa220000-0000-4000-8000-000000000011',(select data from workbook_creation)),(select data from workbook_creation_result),'creation retry returns the saved result');
select is((select count(*)::integer from public.product_variants where sku='WB-SOAP'),1,'retry never duplicates a created variant');

-- Invalid pack conversions fail after catalogue work and roll that work back.
create temp table workbook_failure as select jsonb_set(pg_temp.workbook_change((select id from workbook_variant),99),'{products,0,variants,0,packs,0,units_per_pack}','12') data;
update workbook_failure set data=jsonb_set(data,'{manufacturers}',
  '[{"key":"new-maker-8","id":null,"expected_updated_at":null,"name":"Must roll back","active":true}]');
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000012',(select data from workbook_failure))$$,
  'P0001','pack_contents_immutable: retire this pack and create a replacement','a used pack cannot be resized');
select is((select count(*)::integer from public.manufacturers where name='Must roll back'),0,'failure rolls back earlier manufacturer creation');
select is((select price from public.product_variants where id=(select id from workbook_variant)),23::bigint,'failure rolls back the price edit');
select is((select count(*)::integer from public.catalog_imports where idempotency_key='aa220000-0000-4000-8000-000000000012'),0,'failed apply leaves no completed retry record');

-- New child rows use an existing product; pack counts report individual changes.
create temp table workbook_child as select pg_temp.workbook_change((select id from workbook_variant),23) data;
update workbook_child set data=jsonb_set(data,'{products,0,variants,0,packs,0,sale_price}','490');
update workbook_child set data=jsonb_set(data,'{products,0,variants}',(data#>'{products,0,variants}')||jsonb_build_array(jsonb_build_object(
  'key','new-small-eggs','id',null,'expected_updated_at',null,
  'values',(data#>'{products,0,variants,0,values}')||jsonb_build_object('name','Small','sku','WB-SMALL','price',15),
  'expected_packs','[]'::jsonb,
  'packs','[{"id":"aa220000-0000-4000-8000-000000000030","name":"Half tray","units_per_pack":15,"sale_price":210,"barcode":null,"active":true},{"id":"aa220000-0000-4000-8000-000000000031","name":"Carton","units_per_pack":6,"sale_price":80,"barcode":null,"active":true}]'::jsonb,
  'opening_quantity',5,'opening_unit_cost',10)));
create temp table workbook_child_result as select public.apply_product_workbook('aa220000-0000-4000-8000-000000000032',(select data from workbook_child)) data;
select is((select (data->>'packs_changed')::integer from workbook_child_result),3,'result counts changed and newly created packs individually');
select is((select product_id from public.product_variants where sku='WB-SMALL'),(select id from workbook_product),'new size/type attaches to its existing product');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from public.product_variants where sku='WB-SMALL')),5::numeric,'new child receives its own opening stock');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from workbook_variant)),95::numeric,'new child stock does not change its sibling');

create function pg_temp.workbook_batch_change(p_variant uuid,p_price bigint,p_count numeric default null,p_cost bigint default null,p_value bigint default null)
returns jsonb language sql as $$
  select jsonb_set(pg_temp.workbook_change(p_variant,p_price,p_count),'{batches}',jsonb_build_array(jsonb_build_object(
    'action','update','batch_id',b.id,'variant_id',p_variant,'stock_location_id',b.stock_location_id,'latest',true,
    'expected_remaining',b.remaining,'expected_unit_cost',b.unit_cost,'expected_remaining_cost',b.remaining_cost,
    'expected_batch_number',b.batch_number,'expected_expiry_date',b.expiry_date,
    'new_unit_cost',coalesce(p_cost,b.unit_cost),'new_batch_number',b.batch_number,'new_expiry_date',b.expiry_date,
    'quantity_added',greatest(0,coalesce(p_count,b.remaining)-b.remaining))
    ||case when p_value is null then '{}'::jsonb else jsonb_build_object('new_remaining_cost',p_value) end))
  from public.inventory_batches b where b.variant_id=p_variant and b.remaining>0 order by b.purchased_at desc,b.created_at desc,b.id desc limit 1
$$;
select lives_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000033',pg_temp.workbook_batch_change((select id from workbook_variant),23,null,null,1499))$$,'exact batch value can be corrected without changing rounded buying price');
select is((select sum(remaining_cost) from public.inventory_batches where variant_id=(select id from workbook_variant)),1499::numeric,'exact batch correction keeps the entered value');
select is((select unit_cost from public.inventory_batches where variant_id=(select id from workbook_variant) and remaining>0),14::numeric,'exact correction preserves the buying price');
select lives_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000034',pg_temp.workbook_batch_change((select id from workbook_variant),23,97,16))$$,'increased count and buying correction apply together');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from workbook_variant)),97::numeric,'increased count receives only the difference');
select is((select sum(remaining_cost) from public.inventory_batches where variant_id=(select id from workbook_variant)),1552::numeric,'buying correction and additional stock preserve accounting value');

create temp table workbook_stale as select pg_temp.workbook_change((select id from workbook_variant),24) data;
reset role;
update public.product_variants set updated_at=clock_timestamp()+interval '1 second' where id=(select id from workbook_variant);
set local role authenticated;
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000013',(select data from workbook_stale))$$,
  'P0001','stale_workbook_variant','intervening catalogue changes reject stale edits');
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000014',jsonb_set(pg_temp.workbook_change((select id from workbook_variant),24),'{company_id}','"aa220000-0000-4000-8000-000000000099"'))$$,
  'P0001','invalid_product_workbook','company identity is authoritative');
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000015',jsonb_set(pg_temp.workbook_change((select id from workbook_variant),24),'{products,0,variants,0,values,stock_unit}','"kg"'))$$,
  'P0001','existing_stock_unit_immutable_in_workbook','workbooks do not reinterpret existing stock');

-- Fractional base units do not require retiring the existing selling pack.
select lives_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000040',
  jsonb_set(pg_temp.workbook_change((select id from workbook_variant),23),
    '{products,0,variants,0,values,allow_fractional}','true'))$$,
  'workbook enables fractional base quantities without retiring an active pack');
select ok((select allow_fractional from public.product_variants where id=(select id from workbook_variant)),
  'workbook persists fractional base quantity setting');
select ok((select active from public.variant_packs where id='aa220000-0000-4000-8000-000000000002'),
  'workbook retains the active pack');

-- Catalogue managers retain price edits; financial values never enter their export.
reset role;
select testkit.create_user('aa220000-0000-4000-8000-000000000020','products-workbook-catalog@test.local');
select testkit.add_member((select id from workbook_company),'aa220000-0000-4000-8000-000000000020','Catalog only',array['ManageCatalog']);
select testkit.as_user((select id from workbook_company),'aa220000-0000-4000-8000-000000000020','Catalog only');
select ok(not (public.product_workbook_snapshot((select id from workbook_location))::text like '%remaining_cost%'),'restricted snapshot contains no batch costs');
select ok(not (public.product_workbook_snapshot((select id from workbook_location))#>'{stock,0}' ? 'value'),'restricted snapshot omits exact stock value');
select lives_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000021',pg_temp.workbook_change((select id from workbook_variant),25))$$,'catalogue-only permission can edit a price');
select throws_ok($$select public.apply_product_workbook('aa220000-0000-4000-8000-000000000022',pg_temp.workbook_change((select id from workbook_variant),26,0))$$,
  'P0001','permission_denied: ManageStockAdjustments required','counted stock retains its stock permission');
select is((select price from public.product_variants where id=(select id from workbook_variant)),25::bigint,'a denied stock change rolls back its price change');

select * from finish();
rollback;
