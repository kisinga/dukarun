begin;
select plan(10);

select has_view('public','purchase_history','purchase history read model exists');
select has_view('public','supplier_purchase_metrics','supplier metrics read model exists');
select has_view('public','low_stock_variants_by_location','location low-stock read model exists');

select testkit.create_user('81000000-0000-4000-8000-000000000001','history-models@test.local');
create temp table history_fixture as select testkit.provision(
  '81000000-0000-4000-8000-000000000001','History Models Store') company_id;

insert into public.products(id,company_id,name)
select '81000000-0000-4000-8000-000000000002',company_id,'History Tea' from history_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002',
  company_id,'Default','HIST-TEA',15000,10000 from history_fixture;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select '81000000-0000-4000-8000-000000000004',company_id,'History Supplier',true,500000
from history_fixture;
update public.companies set low_stock_threshold=20
where id=(select company_id from history_fixture);

select testkit.as_user((select company_id from history_fixture),
  '81000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
create temp table history_purchase as select public.record_purchase_with_payment(
  '81000000-0000-4000-8000-000000000004',
  '[{"variant_id":"81000000-0000-4000-8000-000000000003","quantity":10,"unit_cost":10000}]',
  40000,'HISTORY-PART') purchase_id;
create temp table history_paid_purchase as select public.record_purchase_with_payment(
  '81000000-0000-4000-8000-000000000004',
  '[{"variant_id":"81000000-0000-4000-8000-000000000003","quantity":1,"unit_cost":10000}]',
  10000,'HISTORY-PAID') purchase_id;

select is((select payment_status from public.purchase_history
  where id=(select purchase_id from history_purchase)),'part_paid','payment state is aggregated');
select is((select paid from public.purchase_history
  where id=(select purchase_id from history_purchase)),40000::bigint,'paid total is aggregated');
select is((select purchase_count from public.supplier_purchase_metrics
  where supplier_id='81000000-0000-4000-8000-000000000004'),2::bigint,
  'supplier purchase count is authoritative');
select is((select payment_status from public.purchase_history
  where id=(select purchase_id from history_paid_purchase)),'paid',
  'paid-now purchase is classified as paid without an allocation row');
select is((select paid from public.purchase_history
  where id=(select purchase_id from history_paid_purchase)),10000::bigint,
  'paid-now purchase reports its full cost as paid');
select is((select outstanding from public.supplier_purchase_metrics
  where supplier_id='81000000-0000-4000-8000-000000000004'),60000::bigint,
  'supplier outstanding excludes paid-now purchases');
select is((select count(*)::int from public.low_stock_variants_by_location
  where variant_id='81000000-0000-4000-8000-000000000003'),1,
  'low stock is projected for its location');

select * from finish();
rollback;
