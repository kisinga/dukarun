-- Appended cost corrections must reach every ledger-backed sales report.
begin;
select no_plan();
select testkit.create_user('aa250000-0000-4000-8000-000000000001','cost-report@test.local');
create temp table correction_company as
select testkit.provision('aa250000-0000-4000-8000-000000000001','Correction Reports') id;
grant select on correction_company to authenticated;
-- A production-copy rehearsal may contain enforced legal-document fixtures.
insert into public.company_legal_acceptances(company_id,document_version_id,accepted_by,source)
select c.id,d.id,'aa250000-0000-4000-8000-000000000001','registration'
from correction_company c cross join public.legal_document_versions d
where d.document_type='terms' and d.requires_company_acceptance;
update public.companies c set subscription_tier_id=t.id
from public.subscription_tiers t where c.id=(select id from correction_company) and t.code='standard';
insert into public.products(id,company_id,name)
select 'aa250000-0000-4000-8000-000000000002',id,'Cost report fixture' from correction_company;
insert into public.product_variants(id,company_id,product_id,name,sku,price)
select 'aa250000-0000-4000-8000-000000000003',id,'aa250000-0000-4000-8000-000000000002',
  'Default','COST-CORRECTION-REPORT',500 from correction_company;
insert into public.inventory_batches(company_id,variant_id,quantity,remaining,unit_cost)
select id,'aa250000-0000-4000-8000-000000000003',10,10,100 from correction_company;
select testkit.as_user((select id from correction_company),'aa250000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
create temp table correction_sale as
select public.post_sale(null,'[{"variant_id":"aa250000-0000-4000-8000-000000000003","quantity":2}]',
  '[{"method":"cash","amount":1000}]') id;
grant select on correction_sale to authenticated;
reset role;

-- Only the reporting contract is under test: debit 200, correction credit 160.
select public.post_journal_entry_with_context(
  (select id from correction_company),'InventorySaleCogsCorrection','report-fixture','Correct a base-unit cost',
  jsonb_build_array(
    jsonb_build_object('account_code','INVENTORY','debit',160,'credit',0,'order_id',(select id from correction_sale)),
    jsonb_build_object('account_code','COGS','debit',0,'credit',160,'order_id',(select id from correction_sale))),
  row((select id from correction_company),(select location_id from public.orders where id=(select id from correction_sale)),
    null,null,now(),(now() at time zone 'Africa/Nairobi')::date,'manual_cost_repair',null)::public.posting_context
);
refresh materialized view public.mv_daily_sales_summary;
refresh materialized view public.mv_daily_product_sales;
select is((select sum(l.debit)::bigint from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id=l.entry_id join public.ledger_accounts a on a.id=l.account_id
  where l.order_id=(select id from correction_sale) and a.code='COGS' and e.source_type='InventorySaleCogs'),
  200::bigint,'original posted COGS debit is preserved');
select ok(not has_table_privilege('authenticated','public.mv_daily_sales_summary','select'),
  'raw sales summary remains inaccessible to tenants');
select ok(not has_table_privilege('authenticated','public.mv_daily_product_sales','select'),
  'raw product sales remain inaccessible to tenants');
select testkit.as_user((select id from correction_company),'aa250000-0000-4000-8000-000000000001','Admin');
select is((select cogs from public.rpt_daily_sales_summary),40::bigint,'daily summary nets correction credits');
select is((select margin from public.rpt_daily_sales_summary),960::bigint,'daily margin uses corrected costs');
select is((select cogs from public.rpt_daily_product_sales),40::bigint,'product report nets correction credits');
select is((public.dashboard_sales_snapshot()->'summary'->0->>'cogs')::bigint,40::bigint,
  'dashboard nets correction credits');
select is((select cogs from public.staff_sales_performance(current_date-1,current_date+1)
  where staff_user_id='aa250000-0000-4000-8000-000000000001'),40::bigint,
  'staff performance includes sale-cost corrections');
select is((select margin from public.staff_sales_performance(current_date-1,current_date+1)
  where staff_user_id='aa250000-0000-4000-8000-000000000001'),960::bigint,
  'staff margin uses corrected costs');
-- A refund is a separate event, not a restatement of the original gross sale cost.
savepoint refund_reporting;
reset role;
select public.post_journal_entry_with_context(
  (select id from correction_company),'RefundRestock','refund-report-fixture','Returned sale cost',
  jsonb_build_array(
    jsonb_build_object('account_code','INVENTORY','debit',40,'credit',0,'order_id',(select id from correction_sale)),
    jsonb_build_object('account_code','COGS','debit',0,'credit',40,'order_id',(select id from correction_sale))),
  row((select id from correction_company),(select location_id from public.orders where id=(select id from correction_sale)),
    null,null,now(),(now() at time zone 'Africa/Nairobi')::date,'manual_cost_repair',null)::public.posting_context
);
refresh materialized view public.mv_daily_sales_summary;
refresh materialized view public.mv_daily_product_sales;
select testkit.as_user((select id from correction_company),'aa250000-0000-4000-8000-000000000001','Admin');
select is((select cogs from public.rpt_daily_sales_summary),40::bigint,
  'gross sales summary does not confuse refund credits with buying-cost corrections');
select is((select cogs from public.rpt_daily_product_sales),40::bigint,
  'gross product report preserves separate refund treatment');
select is((public.dashboard_sales_snapshot()->'summary'->0->>'cogs')::bigint,40::bigint,
  'dashboard preserves separate refund treatment');
rollback to savepoint refund_reporting;
select public.void_sale((select id from correction_sale),'Report reversal fixture');
select is((select cogs from public.staff_sales_performance(current_date-1,current_date+1)
  where staff_user_id='aa250000-0000-4000-8000-000000000001'),0::bigint,
  'void subtracts the corrected sale cost exactly once');
select is((select margin from public.staff_sales_performance(current_date-1,current_date+1)
  where staff_user_id='aa250000-0000-4000-8000-000000000001'),0::bigint,
  'void leaves neither phantom margin nor original inflated cost');
reset role;
refresh materialized view public.mv_daily_sales_summary;
refresh materialized view public.mv_daily_product_sales;
select testkit.as_user((select id from correction_company),'aa250000-0000-4000-8000-000000000001','Admin');
select is((select count(*)::int from public.rpt_daily_sales_summary),0,'voided sale leaves the daily summary');
select is((select count(*)::int from public.rpt_daily_product_sales),0,'voided sale leaves the product report');
select * from finish();
rollback;
