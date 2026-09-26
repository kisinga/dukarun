begin;
select plan(23);

select has_column('public','product_window_metrics','current_robust_quantity',
  'window cache stores robust quantity');
select has_column('public','product_attention','demand_confidence',
  'attention stores demand confidence');
select has_function('public','product_performance',array['integer','uuid','integer'],
  'separate product performance RPC exists');

select testkit.create_user(
  '18400000-0000-4000-8000-000000000001','robust-admin@test.local');
select testkit.create_user(
  '18400000-0000-4000-8000-000000000002','robust-staff@test.local');
create temp table robust_company as
select testkit.provision(
  '18400000-0000-4000-8000-000000000001','Robust Product Store') company_id;
grant select on pg_temp.robust_company to authenticated;
select testkit.add_member(
  (select company_id from robust_company),
  '18400000-0000-4000-8000-000000000002','Robust staff','{SettleOrder}'
);
update public.companies set low_stock_threshold=5
where id=(select company_id from robust_company);

create temp table robust_location as
select id location_id from public.stock_locations
where company_id=(select company_id from robust_company) and is_default;
grant select on pg_temp.robust_location to authenticated;

create temp table robust_new_location as
select '18400000-0000-4000-8000-000000000009'::uuid location_id;
grant select on pg_temp.robust_new_location to authenticated;
insert into public.stock_locations(id,company_id,code,name,is_active,is_default)
select location_id,company_id,'NEW','New branch',true,false
from robust_new_location cross join robust_company;

select testkit.as_user(
  (select company_id from robust_company),
  '18400000-0000-4000-8000-000000000001','Admin');
create temp table robust_clock as select public.current_business_date() today;
grant select on pg_temp.robust_clock to authenticated;
reset role;

insert into public.products(id,company_id,name) values
  ('18400000-0000-4000-8000-000000000010',
    (select company_id from robust_company),'Spike Product'),
  ('18400000-0000-4000-8000-000000000011',
    (select company_id from robust_company),'Single Bulk Product'),
  ('18400000-0000-4000-8000-000000000012',
    (select company_id from robust_company),'Repeat Growth Product');
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,track_inventory,created_at
) values
  ('18400000-0000-4000-8000-000000000020','18400000-0000-4000-8000-000000000010',
    (select company_id from robust_company),'Default','SPIKE',100,true,now()-interval '100 days'),
  ('18400000-0000-4000-8000-000000000021','18400000-0000-4000-8000-000000000011',
    (select company_id from robust_company),'Default','BULK',100,true,now()-interval '2 days'),
  ('18400000-0000-4000-8000-000000000022','18400000-0000-4000-8000-000000000012',
    (select company_id from robust_company),'Default','GROWTH',100,true,now()-interval '100 days');

insert into public.product_daily_facts(
  company_id,location_id,day,variant_id,net_quantity,gross_quantity,
  gross_revenue,net_revenue,corrected_cogs,margin,order_count
)
select company_id,location_id,today-1,
  '18400000-0000-4000-8000-000000000020'::uuid,1,1,100,100,60,40,1
from robust_company cross join robust_location cross join robust_clock
union all
select company_id,location_id,today,
  '18400000-0000-4000-8000-000000000020'::uuid,30,30,3000,3000,1800,1200,1
from robust_company cross join robust_location cross join robust_clock
union all
select company_id,location_id,today,
  '18400000-0000-4000-8000-000000000021'::uuid,40,40,4000,4000,2400,1600,1
from robust_company cross join robust_location cross join robust_clock
union all
select company_id,location_id,today,
  '18400000-0000-4000-8000-000000000020'::uuid,20,20,2000,2000,1200,800,1
from robust_company cross join robust_new_location cross join robust_clock;

insert into public.product_daily_facts(
  company_id,location_id,day,variant_id,net_quantity,gross_quantity,
  gross_revenue,net_revenue,corrected_cogs,margin,order_count
)
select company_id,location_id,today-offset_day,
  '18400000-0000-4000-8000-000000000022'::uuid,2,2,200,200,120,80,1
from robust_company cross join robust_location cross join robust_clock
cross join generate_series(0,9) offset_day
union all
select company_id,location_id,today-offset_day,
  '18400000-0000-4000-8000-000000000022'::uuid,1,1,100,100,60,40,1
from robust_company cross join robust_location cross join robust_clock
cross join generate_series(61,68) offset_day;

select public.refresh_product_window_metrics(company_id,location_id,variant_id)
from robust_company cross join robust_location cross join (values
  ('18400000-0000-4000-8000-000000000020'::uuid),
  ('18400000-0000-4000-8000-000000000021'::uuid),
  ('18400000-0000-4000-8000-000000000022'::uuid)
) variants(variant_id);
select public.refresh_product_window_metrics(company_id,location_id,
  '18400000-0000-4000-8000-000000000020'::uuid)
from robust_company cross join robust_new_location;
select public.refresh_product_attention(company_id,location_id,variant_id)
from robust_company cross join robust_location cross join (values
  ('18400000-0000-4000-8000-000000000020'::uuid),
  ('18400000-0000-4000-8000-000000000021'::uuid),
  ('18400000-0000-4000-8000-000000000022'::uuid)
) variants(variant_id);
select public.refresh_product_attention(company_id,location_id,
  '18400000-0000-4000-8000-000000000020'::uuid)
from robust_company cross join robust_new_location;

select is((select current_quantity from public.product_window_metrics
  where variant_id='18400000-0000-4000-8000-000000000020' and window_days=30
    and location_id=(select location_id from robust_location)),
  31::numeric,'factual quantity keeps the unusual sale');
select is((select current_robust_quantity from public.product_window_metrics
  where variant_id='18400000-0000-4000-8000-000000000020' and window_days=30
    and location_id=(select location_id from robust_location)),
  4::numeric,'robust quantity caps the unusual selling day at three medians');
select is((select outlier_detected from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000020'
    and location_id=(select location_id from robust_location)),true,
  'dominant unusual day is flagged');
select is((select demand_confidence from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000020'
    and location_id=(select location_id from robust_location)),'low',
  'two selling days remain low confidence');
select cmp_ok((select reorder_quantity from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000020'
    and location_id=(select location_id from robust_location)),'<=',5::numeric,
  'low-confidence spike reorder is capped at the configured threshold');
select is((select signal from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000021'),'stockout',
  'single bulk sale remains a critical stockout');
select cmp_ok((select reorder_quantity from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000021'),'<=',5::numeric,
  'single bulk sale cannot create an uncapped reorder');
select is((select demand_confidence from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000022'),'high',
  'repeat multi-day demand earns high confidence');
select cmp_ok((select reorder_quantity from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000022'),'>',5::numeric,
  'repeat demand receives an uncapped recommendation');
select is((select demand_confidence from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000020'
    and location_id=(select location_id from robust_new_location)),'low',
  'an old catalog item starts with low confidence at a new location');
select cmp_ok((select reorder_quantity from public.product_attention
  where variant_id='18400000-0000-4000-8000-000000000020'
    and location_id=(select location_id from robust_new_location)),'<=',5::numeric,
  'new-location demand cannot create an uncapped reorder');

select testkit.as_user(
  (select company_id from robust_company),
  '18400000-0000-4000-8000-000000000001','Admin');
create temp table admin_performance as select public.product_performance(
  30,(select location_id from robust_location),10) value;
grant select on pg_temp.admin_performance to authenticated;
create temp table all_location_performance as select public.product_performance(30,null,25) value;
grant select on pg_temp.all_location_performance to authenticated;
select ok(public.dashboard_location_snapshot(
  (select today-6 from robust_clock),(select location_id from robust_location))?'productPerformance',
  'dashboard snapshot includes product performance additively');
select ok(not exists(select 1 from admin_performance,
  jsonb_array_elements(value->'leaders'->'trending') item
  where item->>'variant_id' in(
    '18400000-0000-4000-8000-000000000020',
    '18400000-0000-4000-8000-000000000021')),
  'low-confidence one-offs cannot become trending leaders');
select ok(exists(select 1 from admin_performance,
  jsonb_array_elements(value->'leaders'->'trending') item
  where item->>'variant_id'='18400000-0000-4000-8000-000000000022'),
  'repeated multi-day growth becomes trending');
select is((select (item->>'trend_score')::numeric from admin_performance,
  jsonb_array_elements(value->'leaders'->'trending') item
  where item->>'variant_id'='18400000-0000-4000-8000-000000000022'),0::numeric,
  'trending percentiles are calculated only among eligible candidates');
select is((select count(distinct item->>'location_id') from all_location_performance,
  jsonb_array_elements(value->'leaders'->'volume') item
  where item->>'variant_id'='18400000-0000-4000-8000-000000000020'),2::bigint,
  'all-location performance keeps each variant-location demand series separate');
select ok((select bool_and(item->'margin' is not null) from admin_performance,
  jsonb_array_elements(value->'leaders'->'margin') item),
  'financial users receive margin evidence');

select is((select count(distinct value->'items'->0->>'planning_daily_demand')
  from (values
    (public.product_intelligence(30,(select location_id from robust_location),
      null,null,null,10,0,(select today-6 from robust_clock),(select today from robust_clock))),
    (public.product_intelligence(30,(select location_id from robust_location),
      null,null,null,10,0,(select today-29 from robust_clock),(select today from robust_clock)))
  ) periods(value)),1::bigint,
  'changing reporting period does not change the fixed planning forecast');

select testkit.as_user(
  (select company_id from robust_company),
  '18400000-0000-4000-8000-000000000002','Robust staff');
select is((public.product_performance(30,(select location_id from robust_location),10)
  ->>'financialsIncluded')::boolean,false,
  'non-financial users receive a redacted performance response');
select is(jsonb_array_length(public.product_performance(
  30,(select location_id from robust_location),10)->'leaders'->'margin'),0,
  'non-financial users receive no margin leaders');

select * from finish();
rollback;
