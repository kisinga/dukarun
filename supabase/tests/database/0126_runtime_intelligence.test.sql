-- Incremental credit and product intelligence: evidence, scoring, sparse
-- positions, bounded reads, role-shaped responses and legacy compatibility.
begin;
select no_plan();

select has_table('public','credit_document_performance','credit documents are cached');
select has_table('public','party_credit_profile','party profiles are cached');
select has_table('public','credit_dirty_parties','credit refreshes use a coalescing queue');
select has_table('public','product_daily_facts','product facts are incremental');
select has_table('public','product_window_metrics','preset windows are cached');
select has_table('public','inventory_position_days','inventory positions are sparse');
select has_table('public','analytics_dirty_buckets','product refreshes use a coalescing queue');
select has_column('public','customer_receipts','paid_on','customer receipts retain payment evidence');
select has_column('public','supplier_payments','paid_on','supplier payments retain payment evidence');
select has_function('public','credit_decision_summary',array['uuid'],'bounded checkout summary exists');
select has_function('public','record_credit_advisory_snapshot',array['uuid','text'],
  'advisory snapshots accept only server-resolved evidence');
select has_function('public','product_profile',array['uuid','uuid','date','date'],
  'bounded product profile exists');
select has_function('public','product_intelligence',
  array['integer','uuid','uuid','uuid','text','integer','integer','date','date'],
  'inventory intelligence accepts bounded custom periods');
select has_function('public','update_inventory_settings',array['integer','boolean','integer','integer'],
  'inventory preferences have one atomic update boundary');
select has_function('public','current_business_date',array[]::text[],
  'clients can read the server-derived tenant business date');

select testkit.create_user(
  '12600000-0000-4000-8000-000000000001','insights-admin@test.local');
select testkit.create_user(
  '12600000-0000-4000-8000-000000000002','insights-cashier@test.local');
create temp table insight_company as
select testkit.provision(
  '12600000-0000-4000-8000-000000000001','Runtime Intelligence Store') company_id;
grant select on pg_temp.insight_company to authenticated;
select testkit.add_member(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000002',
  'Insight cashier','{SettleOrder}'
);

insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit,credit_terms_days)
select '12600000-0000-4000-8000-000000000010',company_id,'Late Customer',true,1000,30
from insight_company;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '12600000-0000-4000-8000-000000000011',company_id,'Evidence Customer',true,1000
from insight_company;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_active)
select '12600000-0000-4000-8000-000000000012',company_id,'Insight Supplier',true,true
from insight_company;

insert into public.products(id,company_id,name)
select '12600000-0000-4000-8000-000000000020',company_id,'Insight Rice'
from insight_company;
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,wholesale_price,track_inventory
)
select '12600000-0000-4000-8000-000000000021',
  '12600000-0000-4000-8000-000000000020',company_id,
  'Default','INSIGHT-RICE',100,50,true
from insight_company;
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,wholesale_price,track_inventory
)
select '12600000-0000-4000-8000-000000000024',
  '12600000-0000-4000-8000-000000000020',company_id,
  'Bulk','INSIGHT-RICE-BULK',500,250,true
from insight_company;
insert into public.products(id,company_id,name)
select '12600000-0000-4000-8000-000000000022',company_id,'Credit Service'
from insight_company;
insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,track_inventory
)
select '12600000-0000-4000-8000-000000000023',
  '12600000-0000-4000-8000-000000000022',company_id,
  'Default','service','INSIGHT-CREDIT',1000,false
from insight_company;

select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

-- A legacy caller remains valid and receives explicitly estimated evidence.
create temp table legacy_receipt as select public.post_customer_receipt(
  null,'12600000-0000-4000-8000-000000000011',50,'cash',null,'legacy-evidence') result;
select is((select paid_on_source from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from legacy_receipt)),'estimated',
  'legacy receipt callers receive estimated evidence');
select ok((select paid_on is not null from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from legacy_receipt)),
  'legacy receipt evidence always has an effective date');

-- Create one materially overdue account and apply a partial, backdated receipt.
create temp table late_order as select
  (public.post_sale_at_location(null,'12600000-0000-4000-8000-000000000010',
    '[{"variant_id":"12600000-0000-4000-8000-000000000023","quantity":1,"unit_price":1000}]',
    '[]',false,'insight-late-sale')->>'order_id')::uuid id;
grant select on pg_temp.late_order to authenticated;
reset role;
update public.orders set completed_at=now()-interval '100 days',credit_due_at=current_date-70
where id=(select id from late_order);
select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000001','Admin');
create temp table dated_receipt as select public.post_customer_receipt(
  null,'12600000-0000-4000-8000-000000000010',400,'cash',null,'dated-evidence',
  current_date-40,'manual') result;
select is((select paid_on_source from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from dated_receipt)),'manual',
  'dated receipt records manual provenance');
select is((select paid_on from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from dated_receipt)),current_date-40,
  'dated receipt preserves the entered business date');
reset role;
select throws_ok(format($$update public.customer_receipts set paid_on=current_date-39 where id=%L$$,
  (select (result->>'receipt_id')::uuid from dated_receipt)),
  'P0001','payment_evidence_immutable','confirmed payment evidence is immutable');

select public.process_credit_dirty_parties(100);
select is((select outstanding_amount from public.credit_document_performance
  where document_id=(select id from late_order)),600::bigint,
  'partial receipts leave the correct cached exposure');
select is((select settled_principal_days from public.credit_document_performance
  where document_id=(select id from late_order)),12000::numeric,
  'principal-days account for the paid portion once');
select ok((select score<=2.9 from public.party_credit_profile
  where side='customer' and party_id='12600000-0000-4000-8000-000000000010'),
  'material debt over 60 days applies the high-risk score cap');
select is((select band from public.party_credit_profile
  where side='customer' and party_id='12600000-0000-4000-8000-000000000010'),'high_risk',
  'material debt over 60 days is high risk');
select ok(exists(select 1 from public.cache_change_log
  where company_id=(select company_id from insight_company) and stream='parties'
    and entity_type='customer' and entity_id='12600000-0000-4000-8000-000000000010'),
  'credit profile changes invalidate the cached customer projection');

select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000001','Admin');
select is((public.party_credit_profile(
  '12600000-0000-4000-8000-000000000010','customer')->>'opportunity_cost')::bigint,
  27::bigint,'opportunity cost uses partial-payment principal-days at the configured rate');

select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000002','Insight cashier');
select public.record_credit_advisory_snapshot((select id from late_order),'Manager accepted');
reset role;
select is((select band from public.sale_credit_advisory_snapshots
  where order_id=(select id from late_order)),
  (select band from public.party_credit_profile where side='customer'
    and party_id='12600000-0000-4000-8000-000000000010'),
  'advisory snapshots use the authoritative server profile');

select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000001','Admin');
select is(public.current_business_date(),
  (select (now() at time zone business_timezone)::date from public.companies
    where id=(select company_id from insight_company)),
  'business date uses the database clock and company timezone');

-- Product activity is rebuilt per dirty day/variant and list reads use preset rows.
select public.record_purchase_complete(
  '12600000-0000-4000-8000-000000000012',
  '[{"variant_id":"12600000-0000-4000-8000-000000000021","quantity":10,"unit_cost":50}]',
  '[]',500,'INSIGHT-STOCK','CASH_ON_HAND');
select public.post_sale(null,
  '[{"variant_id":"12600000-0000-4000-8000-000000000021","quantity":2,"unit_price":100}]',
  '[{"method":"cash","amount":200}]');
reset role;
select public.process_analytics_dirty_buckets(1000);
select is((select net_quantity from public.product_daily_facts
  where variant_id='12600000-0000-4000-8000-000000000021'
    and day=current_date),2::numeric,'dirty worker builds the affected daily fact');
select is((select current_quantity from public.product_window_metrics
  where variant_id='12600000-0000-4000-8000-000000000021' and window_days=7),2::numeric,
  'preset window metrics are precomputed');
select is((select count(*)::int from public.inventory_position_days
  where variant_id='12600000-0000-4000-8000-000000000021' and day=current_date),1,
  'multiple same-day stock changes coalesce into one sparse position');
select is((select count(*)::int from public.product_attention
  where variant_id='12600000-0000-4000-8000-000000000023'),0,
  'service variants never produce inventory attention signals');
select is((select relkind::text from pg_class where oid='public.mv_daily_product_sales'::regclass),'v',
  'legacy product report name is now a cheap compatibility view');

select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000001','Admin');
select is((select (item->>'current_quantity')::numeric from jsonb_array_elements(
  public.product_intelligence(7,
    (select id from public.stock_locations where company_id=(select company_id from insight_company)
      and is_default),null,null,null,10,0)->'items') item
  where item->>'variant_id'='12600000-0000-4000-8000-000000000021'),
  2::numeric,'product directory reads the precomputed preset row');
select is((public.product_intelligence(7,
    (select id from public.stock_locations where company_id=(select company_id from insight_company)
      and is_default),null,null,null,10,0)->'summary'->>'trackedVariants')::int,
  2,'inventory summary covers the full filtered tracked population');
select is((public.product_intelligence(7,
    (select id from public.stock_locations where company_id=(select company_id from insight_company)
      and is_default),null,null,null,1,0)->>'nextOffset')::int,
  1,'inventory pagination reports another page only when another row exists');
select is((select item->>'preferred_supplier_id' from jsonb_array_elements(
  public.product_intelligence(7,
    (select id from public.stock_locations where company_id=(select company_id from insight_company)
      and is_default),null,null,null,10,0)->'items') item
  where item->>'variant_id'='12600000-0000-4000-8000-000000000021'),
  '12600000-0000-4000-8000-000000000012',
  'inventory decisions expose the latest product source');
select is((select (item->>'current_quantity')::numeric from jsonb_array_elements(
  public.product_intelligence(
    p_window_days=>30,
    p_location_id=>(select id from public.stock_locations
      where company_id=(select company_id from insight_company) and is_default),
    p_since=>public.current_business_date(),
    p_until=>public.current_business_date())->'items') item
  where item->>'variant_id'='12600000-0000-4000-8000-000000000021'),
  2::numeric,'custom inventory periods aggregate sparse daily facts');
select throws_ok(format($$select public.product_intelligence(
    p_location_id=>%L,p_since=>public.current_business_date(),
    p_until=>public.current_business_date()+1)$$,
  (select id from public.stock_locations where company_id=(select company_id from insight_company)
    and is_default)),
  'P0001','product_period_in_future','custom inventory periods cannot extend past server today');
select ok(not exists(select 1 from jsonb_array_elements(public.product_intelligence(7,
    (select id from public.stock_locations where company_id=(select company_id from insight_company)
      and is_default),null,null,null,10,0)->'items') item
  where item->>'variant_id'='12600000-0000-4000-8000-000000000023'),
  'product intelligence omits service variants');
select is((public.list_party_credit_profiles('customer',null,null,false,null,null,1,null)
    ->>'nextCursor')::uuid,
  '12600000-0000-4000-8000-000000000010'::uuid,
  'credit portfolio returns a usable seek cursor');
select throws_ok(format($$select public.product_profile(
  '12600000-0000-4000-8000-000000000021',%L,current_date-366,current_date)$$,
  (select id from public.stock_locations where company_id=(select company_id from insight_company)
    and is_default)),
  'P0001','product_profile_range_too_large','product history expansion is capped at 366 days');

select is((public.post_full_refund((select id from late_order),'cash',
  'Runtime intelligence credit note','write_off')->>'status'),'completed',
  'full credit note posts for the overdue sale');
reset role;
select ok(exists(select 1 from public.credit_dirty_parties
  where side='customer' and party_id='12600000-0000-4000-8000-000000000010'),
  'refunds enqueue the affected credit profile');
select public.process_credit_dirty_parties(100);
select is((select outstanding_amount from public.credit_document_performance
  where document_id=(select id from late_order)),0::bigint,
  'receivable credit notes settle cached document exposure');

insert into public.stock_locations(id,company_id,code,name)
select '12600000-0000-4000-8000-000000000030',company_id,'PRIVATE','Private warehouse'
from insight_company;
delete from public.company_membership_locations ml using public.company_memberships m
where ml.membership_id=m.id and ml.location_id='12600000-0000-4000-8000-000000000030'
  and m.user_id='12600000-0000-4000-8000-000000000002';
insert into public.product_attention(company_id,location_id,variant_id,signal,reason_code)
select company_id,'12600000-0000-4000-8000-000000000030',
  '12600000-0000-4000-8000-000000000023','stockout','restricted_location'
from insight_company;

-- Cashiers receive compact score evidence but cannot enumerate finance profiles.
select testkit.as_user(
  (select company_id from insight_company),
  '12600000-0000-4000-8000-000000000002','Insight cashier');
select ok((public.credit_cache_summaries(
  array['12600000-0000-4000-8000-000000000010'::uuid])->'items'->0) ? 'band',
  'cashier cache receives the compact score band');
select ok(not ((public.credit_cache_summaries(
  array['12600000-0000-4000-8000-000000000010'::uuid])->'items'->0) ? 'balance'),
  'cashier cache does not expose monetary profile fields');
select ok(not exists(select 1 from jsonb_array_elements(
  public.insight_attention_feed('products',null,100,0)->'items') item
  where item->>'entity_id'='12600000-0000-4000-8000-000000000023'),
  'all-location attention excludes locations the caller cannot access');
select throws_ok(
  $$select public.list_party_credit_profiles('customer')$$,
  'P0001','permission_denied: ViewFinancials required',
  'cashiers cannot enumerate the finance portfolio');
select ok((public.product_intelligence(7,
  (select id from public.stock_locations where company_id=(select company_id from insight_company)
    and is_default),null,null,null,10,0)->'items'->0->'gross_revenue')='null'::jsonb,
  'non-finance product responses redact monetary fields at the database boundary');

select * from finish();
rollback;
