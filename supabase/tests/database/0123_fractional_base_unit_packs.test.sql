begin;
select no_plan();
select testkit.create_user('aa230000-0000-4000-8000-000000000001','fractional-packs@test.local');
create temp table fractional_pack_company as
  select testkit.provision('aa230000-0000-4000-8000-000000000001','Fractional Pack Shop') id;
grant select on fractional_pack_company to authenticated;
select testkit.as_user((select id from fractional_pack_company),'aa230000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

-- Create through the same aggregate used by the product editor.
create temp table fractional_pack_product as select public.save_catalog_product_units(
  '{"name":"Cable"}',
  '[{"name":"Red","sku":"FRACTIONAL-CABLE","kind":"good","price":20,"stock_unit":"metre","allow_fractional":true,"packs":[{"id":"aa230000-0000-4000-8000-000000000002","name":"Roll","units_per_pack":90,"sale_price":1500,"barcode":"FRACTIONAL-ROLL","active":true}]}]',
  'aa230000-0000-4000-8000-000000000003') id;
create temp table fractional_pack_variant as select id from public.product_variants
  where product_id=(select id from fractional_pack_product);
select ok((select allow_fractional from public.product_variants where id=(select id from fractional_pack_variant)),
  'editor creates fractional base units alongside active packs');
select is(public.resolve_catalog_selling_unit('FRACTIONAL-ROLL')->>'selected_pack_id',
  'aa230000-0000-4000-8000-000000000002','barcode resolves the pack of a fractional good');

reset role;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select 'aa230000-0000-4000-8000-000000000004',id,'Cable supplier',true,100000 from fractional_pack_company;
set local role authenticated;
create temp table fractional_pack_purchase as select public.record_purchase_complete(
  'aa230000-0000-4000-8000-000000000004',
  jsonb_build_array(
    jsonb_build_object('variant_id',(select id from fractional_pack_variant),'pack_id','aa230000-0000-4000-8000-000000000002','quantity',2,'unit_cost',901),
    jsonb_build_object('variant_id',(select id from fractional_pack_variant),'quantity',0.5,'unit_cost',10)),
  '[]',0,'FRACTIONAL-PACK-BUY') id;
select results_eq($$select quantity,stock_quantity,unit_cost,line_total from public.purchase_lines
  where purchase_id=(select id from fractional_pack_purchase) order by stock_quantity desc$$,
  $$values (2::numeric,180::numeric,901::bigint,1802::bigint),(0.5::numeric,0.5::numeric,10::bigint,5::bigint)$$,
  'purchase mixes complete rolls and fractional metres without rounding invoice costs');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from fractional_pack_variant)),
  180.5::numeric,'both purchase units feed one stock balance');
select throws_ok($$select public.record_purchase_complete('aa230000-0000-4000-8000-000000000004',
  jsonb_build_array(jsonb_build_object('variant_id',(select id from fractional_pack_variant),
    'pack_id','aa230000-0000-4000-8000-000000000002','quantity',0.5,'unit_cost',901)))$$,
  'P0001','whole_packs_required','fractional pack purchases remain forbidden');
select throws_ok($$select public.save_draft(null,jsonb_build_array(jsonb_build_object(
  'variant_id',(select id from fractional_pack_variant),'pack_id','aa230000-0000-4000-8000-000000000002','quantity',0.5)))$$,
  'P0001','whole_packs_required','fractional pack sales remain forbidden');

create temp table fractional_pack_lines as select jsonb_build_array(
  jsonb_build_object('variant_id',(select id from fractional_pack_variant),'pack_id','aa230000-0000-4000-8000-000000000002','quantity',1,'units_per_unit',90),
  jsonb_build_object('variant_id',(select id from fractional_pack_variant),'quantity',0.5,'units_per_unit',1)) data;
create temp table fractional_pack_sale as select public.post_sale(null,
  (select data from fractional_pack_lines),'[{"method":"cash","amount":1510}]',
  p_client_ref=>'fractional-pack-sale') id;
select results_eq($$select quantity,stock_quantity,unit_name,stock_unit_name from public.order_lines
  where order_id=(select id from fractional_pack_sale) order by stock_quantity desc$$,
  $$values (1::numeric,90::numeric,'Roll'::text,'metre'::text),(0.5::numeric,0.5::numeric,'metre'::text,'metre'::text)$$,
  'sale snapshots preserve both whole packs and fractional base quantities');
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from fractional_pack_variant)),
  90::numeric,'mixed sale consumes exactly 90.5 metres');
select is((select sum(remaining_cost) from public.inventory_batches where variant_id=(select id from fractional_pack_variant))+
  (select sum(cogs_total) from public.order_lines where order_id=(select id from fractional_pack_sale)),
  1807::numeric,'mixed sale preserves exact stock value plus COGS');
select is(public.post_full_refund((select id from fractional_pack_sale),'cash','Mixed cable returned','return_to_stock')->>'status',
  'completed','mixed sale refund completes');
select results_eq($$select sum(remaining),sum(remaining_cost) from public.inventory_batches where variant_id=(select id from fractional_pack_variant)$$,
  $$values (180.5::numeric,1807::numeric)$$,'refund restores exact fractional stock and value');

create temp table fractional_pack_offline_sale as select public.post_offline_sale_at_location(
  (select id from public.stock_locations where company_id=(select id from fractional_pack_company) and code='MAIN'),
  null,(select data from fractional_pack_lines),'[{"method":"cash","amount":1510}]',
  'fractional-pack-offline',now(),'fractional-pack-test-device') result;
select is((select sum(remaining) from public.inventory_batches where variant_id=(select id from fractional_pack_variant)),
  90::numeric,'offline posting also accepts whole rolls plus fractional metres');
select is(public.post_full_refund((select (result->>'order_id')::uuid from fractional_pack_offline_sale),'cash','Offline cable returned','return_to_stock')->>'status',
  'completed','offline mixed sale can be refunded');
select lives_ok($$select public.reverse_purchase((select id from fractional_pack_purchase),'Supplier cancelled')$$,
  'purchase reversal accepts restored whole-pack and fractional-base batches');
select results_eq($$select sum(remaining),sum(remaining_cost) from public.inventory_batches where variant_id=(select id from fractional_pack_variant)$$,
  $$values (0::numeric,0::numeric)$$,'purchase reversal removes the exact original quantities and value');

select lives_ok($$select public.save_catalog_product_units(
  jsonb_build_object('product_id',(select id from fractional_pack_product),'name','Cable'),
  jsonb_build_array(jsonb_build_object('variant_id',(select id from fractional_pack_variant),
    'name','Red','price',20,'stock_unit','metre','allow_fractional',true,
    'packs',jsonb_build_array(jsonb_build_object('id','aa230000-0000-4000-8000-000000000002',
      'name','Roll','units_per_pack',90,'sale_price',null,'barcode','FRACTIONAL-ROLL','active',true)))),
  'aa230000-0000-4000-8000-000000000005')$$,
  'fractional goods can retain purchase-only packs');
select throws_ok($$select public.save_draft(null,jsonb_build_array(jsonb_build_object(
  'variant_id',(select id from fractional_pack_variant),'pack_id','aa230000-0000-4000-8000-000000000002','quantity',1)))$$,
  'P0001','pack_not_available','an unpriced pack is still excluded from selling');

select * from finish();
rollback;
