begin;
select plan(15);

select has_column('public','purchases','credit_due_at',
  'supplier credit purchases snapshot a due date');
select has_function('public','credit_health_dashboard',array['integer'],
  'credit health dashboard RPC exists');

select testkit.create_user(
  '94000000-0000-4000-8000-000000000001','credit-health-admin@test.local');
select testkit.create_user(
  '94000000-0000-4000-8000-000000000002','credit-health-cashier@test.local');

create temp table credit_health_fixture as select testkit.provision(
  '94000000-0000-4000-8000-000000000001','Credit Health Store') company_id;
grant select on pg_temp.credit_health_fixture to authenticated;

select testkit.add_member(
  (select company_id from credit_health_fixture),
  '94000000-0000-4000-8000-000000000002',
  'Settlement-only cashier','{SettleOrder}');

insert into public.products(id,company_id,name)
select '94000000-0000-4000-8000-000000000003',company_id,'Credit Tea'
from credit_health_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price,track_inventory)
select '94000000-0000-4000-8000-000000000004',
  '94000000-0000-4000-8000-000000000003',company_id,
  'Default','CREDIT-TEA',10000,4000,false
from credit_health_fixture;
insert into public.customers(
  id,company_id,first_name,is_credit_approved,credit_limit,credit_terms_days
)
select '94000000-0000-4000-8000-000000000005',company_id,
  'Collect Jane',true,20000,7
from credit_health_fixture;
insert into public.customers(
  id,company_id,first_name,is_supplier,supplier_credit_limit,supplier_credit_terms_days
)
select '94000000-0000-4000-8000-000000000006',company_id,
  'Pay Tea Ltd',true,50000,14
from credit_health_fixture;

select testkit.as_user(
  (select company_id from credit_health_fixture),
  '94000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

create temp table health_sale as select public.post_sale(
  '94000000-0000-4000-8000-000000000005',
  '[{"variant_id":"94000000-0000-4000-8000-000000000004","quantity":1,"unit_price":10000}]',
  '[]'
) order_id;
grant select on pg_temp.health_sale to authenticated;

create temp table health_purchase as select public.record_purchase_complete(
  '94000000-0000-4000-8000-000000000006',
  '[{"variant_id":"94000000-0000-4000-8000-000000000004","quantity":2,"unit_cost":4000}]',
  '[]',0,'HEALTH-PO'
) purchase_id;
grant select on pg_temp.health_purchase to authenticated;

select is(
  (select credit_due_at from public.purchases where id=(select purchase_id from health_purchase)),
  (select purchase_date + 14 from public.purchases where id=(select purchase_id from health_purchase)),
  'supplier terms are snapshotted on the purchase'
);

reset role;
update public.orders set credit_due_at=(now() at time zone 'Africa/Nairobi')::date-40
where id=(select order_id from health_sale);
update public.purchases set credit_due_at=(now() at time zone 'Africa/Nairobi')::date+1
where id=(select purchase_id from health_purchase);

select testkit.as_user(
  (select company_id from credit_health_fixture),
  '94000000-0000-4000-8000-000000000001','Admin');

create temp table health_dashboard as
select public.credit_health_dashboard(30) value;
grant select on pg_temp.health_dashboard to authenticated;

select is((select (value->'metrics'->>'receivables')::bigint from health_dashboard),10000::bigint,
  'receivables total comes from the ledger');
select is((select (value->'metrics'->>'payables')::bigint from health_dashboard),8000::bigint,
  'payables total comes from the ledger');
select is((select (value->'metrics'->>'overdue_receivables')::bigint from health_dashboard),10000::bigint,
  'overdue receivables use the snapshotted document due date');
select is((select (value->'metrics'->>'payables_due_soon')::bigint from health_dashboard),8000::bigint,
  'supplier amount due in seven days is surfaced');
select is((select (item->>'amount')::bigint from health_dashboard,
  jsonb_array_elements(value->'aging') item
  where item->>'side'='receivables' and item->>'bucket'='31-60'),10000::bigint,
  'document exposure is placed in its true overdue bucket');
select is((select (item->>'parties')::int from health_dashboard,
  jsonb_array_elements(value->'utilization') item
  where item->>'bucket'='50_80'),1,
  'customer utilization is grouped by its share of the limit');
select is((select jsonb_array_length(value->'trend') from health_dashboard),30,
  'requested trend range is bounded and complete');
select is((select value->'collect_now'->0->>'party_name' from health_dashboard),'Collect Jane',
  'collection queue prioritizes the overdue customer');
select is((select value->'pay_soon'->0->>'party_name' from health_dashboard),'Pay Tea Ltd',
  'payment queue includes the supplier due soon');

select public.post_payment_allocation((select order_id from health_sale),4000,'cash',null);
select public.post_balance_adjustment(
  '94000000-0000-4000-8000-000000000005',1000,'Unscheduled opening correction');

create temp table adjusted_dashboard as
select public.credit_health_dashboard(30) value;
grant select on pg_temp.adjusted_dashboard to authenticated;

select is((select (value->'metrics'->>'receivables')::bigint from adjusted_dashboard),7000::bigint,
  'repayments and manual corrections update the total');
select is((select (item->>'amount')::bigint from adjusted_dashboard,
  jsonb_array_elements(value->'aging') item
  where item->>'side'='receivables' and item->>'bucket'='unscheduled'),1000::bigint,
  'manual exposure is disclosed as unscheduled instead of given a fake due date');

select testkit.as_user(
  (select company_id from credit_health_fixture),
  '94000000-0000-4000-8000-000000000002','Settlement-only cashier');
select throws_ok(
  $$select public.credit_health_dashboard(30)$$,
  'P0001','permission_denied: ViewFinancials required',
  'credit health data requires financial permission'
);

select * from finish();
rollback;
