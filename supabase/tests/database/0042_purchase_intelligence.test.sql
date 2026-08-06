begin;
select plan(18);

select has_column('public','customers','supplier_active','suppliers can be archived reversibly');
select has_view('public','supplier_variant_performance','supplier/product price history is queryable');
select has_function('public','record_purchase_with_prices',
  array['uuid','jsonb','boolean','text','text','text','date','uuid'],
  'purchase and selected price updates share one transaction');
select has_function('public','set_supplier_active',array['uuid','boolean'],
  'supplier archive RPC exists');
select function_returns('public','set_supplier_active',array['uuid','boolean'],'uuid',
  'supplier archive RPC returns supplier id');

select testkit.create_user('42424242-4242-4242-4242-424242424242','purchase-intel@test.local');
create temp table pi_company as select testkit.provision(
  '42424242-4242-4242-4242-424242424242','Purchase Intel Co') company_id;
grant select on pg_temp.pi_company to authenticated;
select testkit.create_user('42424242-4242-4242-4242-424242424243','receiver@test.local');
select testkit.add_member((select company_id from pi_company),
  '42424242-4242-4242-4242-424242424243','Receiver',array[]::text[]);

insert into public.products(id,company_id,name) select
  '42000000-0000-0000-0000-000000000001',company_id,'Coffee' from pi_company;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '42000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001',
  company_id,'Default','COFFEE',15000,10000 from pi_company;
insert into public.customers(id,company_id,first_name,is_supplier) select
  '42000000-0000-0000-0000-000000000003',company_id,'Supplier A',true from pi_company;
insert into public.customers(id,company_id,first_name,is_supplier) select
  '42000000-0000-0000-0000-000000000004',company_id,'Supplier B',true from pi_company;

select testkit.as_user((select company_id from pi_company),
  '42424242-4242-4242-4242-424242424242','Admin');
select testkit.ensure_open_session();

create temp table pi_purchase as select public.record_purchase_with_prices(
  '42000000-0000-0000-0000-000000000003',
  '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":10,"unit_cost":9000,
     "new_wholesale_price":11000,"new_retail_price":16000}]',false,'PI-1') purchase_id;

select is((select wholesale_price from public.product_variants
  where id='42000000-0000-0000-0000-000000000002'),11000::bigint,
  'purchase updates wholesale price atomically');
select is((select price from public.product_variants
  where id='42000000-0000-0000-0000-000000000002'),16000::bigint,
  'purchase updates retail price atomically');
select is((select count(*)::int from public.purchase_lines
  where purchase_id=(select purchase_id from pi_purchase)),1,'purchase line is retained');
select is((select average_unit_cost from public.supplier_variant_performance
  where supplier_id='42000000-0000-0000-0000-000000000003'),9000::bigint,
  'supplier product cost aggregate is accurate');

select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000004',
  '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":5,"unit_cost":8500}]',
  false,'PI-2');
select is((select count(*)::int from public.supplier_variant_performance
  where variant_id='42000000-0000-0000-0000-000000000002'),2,
  'supplier comparison keeps one aggregate per supplier and product');

select testkit.as_user((select company_id from pi_company),
  '42424242-4242-4242-4242-424242424243','Receiver');

select lives_ok(
  $$select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000003',
    '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":8800}]',
    false,'PI-RECEIVER')$$,
  'receiver can record invoice cost without changing catalog prices');
select throws_ok(
  $$select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000003',
    '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":8800,
      "new_retail_price":16500}]',false,'PI-RECEIVER-PRICE')$$,
  'P0001','permission_denied: ManageStockAdjustments required for price updates',
  'receiver cannot change catalog prices while receiving');
select is((select count(*)::int from public.purchases where reference='PI-RECEIVER-PRICE'),0,
  'denied catalog price change leaves no purchase behind');

select testkit.as_user((select company_id from pi_company),
  '42424242-4242-4242-4242-424242424242','Admin');

select public.set_supplier_active('42000000-0000-0000-0000-000000000004',false);
select is((select supplier_active from public.customers
  where id='42000000-0000-0000-0000-000000000004'),false,'supplier is archived');
select throws_ok(
  $$select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000004',
    '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":8500}]',
    false,'PI-ARCHIVED')$$,'P0001','supplier_archived_or_not_found',
  'archived supplier cannot receive a new purchase');

select throws_ok(
  $$select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000003',
    '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":9000,
      "new_wholesale_price":17000,"new_retail_price":16000}]',false,'PI-BAD-PRICE')$$,
  'P0001','retail_price_below_wholesale','invalid catalog pricing rejects the transaction');
select is((select count(*)::int from public.purchases where reference='PI-BAD-PRICE'),0,
  'invalid price update leaves no purchase behind');

select public.record_purchase_with_prices('42000000-0000-0000-0000-000000000003',
  '[{"variant_id":"42000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":9000}]',
  true,'PI-CREDIT');
select throws_ok(
  $$select public.set_supplier_active('42000000-0000-0000-0000-000000000003',false)$$,
  'P0001','supplier_has_outstanding_balance','supplier with an AP balance cannot be archived');

select * from finish();
rollback;
