begin;
select plan(12);
select testkit.create_user('19700000-0000-4000-8000-000000000001','decision-admin@test.local');
select testkit.create_user('19700000-0000-4000-8000-000000000002','decision-staff@test.local');
create temp table decision_company as select testkit.provision('19700000-0000-4000-8000-000000000001','Decision lists') company_id;
create temp table decision_location as select id location_id from public.stock_locations where company_id=(select company_id from decision_company) and is_default;
grant select on decision_company,decision_location to authenticated;
select testkit.add_member((select company_id from decision_company),'19700000-0000-4000-8000-000000000002','Stock staff','{SettleOrder}');
insert into public.products(id,company_id,name) select '19700000-0000-4000-8000-000000000010',company_id,'Decision product' from decision_company;
insert into public.product_variants(id,product_id,company_id,name,sku,price,track_inventory)
select ('19700000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,'19700000-0000-4000-8000-000000000010',company_id,
  'Variant '||i,case when i=3 then '' else 'DEC-'||i end,100,true from decision_company cross join generate_series(1,6) i;
insert into public.product_attention(company_id,location_id,variant_id,signal,current_stock,current_value,reason_code)
select company_id,location_id,('19700000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,
  (array['stockout','reorder','low_cover','healthy','slow','insufficient_history'])[i],i,100,'test_reason'
from decision_company cross join decision_location cross join generate_series(1,6) i;
select testkit.as_user((select company_id from decision_company),'19700000-0000-4000-8000-000000000001','Admin');
create temp table decision_result as select public.product_intelligence(p_location_id=>(select location_id from decision_location),p_decision=>'needs_attention',p_limit=>1) payload;
select is((select (payload->'summary'->>'trackedVariants')::int from decision_result),3,'aggregate filters all three urgency classes before pagination');
select is((select jsonb_array_length(payload->'items') from decision_result),1,'page limit remains unchanged');
select is((select (payload->>'nextOffset')::int from decision_result),1,'aggregate pages continue');
select is((select payload->'items'->0->>'signal' from decision_result),'stockout','urgency ordering remains unchanged');
select is((public.product_intelligence(p_location_id=>(select location_id from decision_location),p_decision=>'needs_attention',p_limit=>1,p_offset=>2)->'items'->0->>'signal'),'low_cover','aggregate third page contains low cover');
select is((select payload->'decisionCounts' from decision_result),'{"all":6,"needsAttention":3,"stockouts":1}'::jsonb,'decision counts describe pre-decision scope');
select is(public.product_intelligence(p_location_id=>(select location_id from decision_location),p_decision=>'healthy')->'decisionCounts',(select payload->'decisionCounts' from decision_result),'changing decision does not change shortcut counts');
select is((public.product_intelligence(p_location_id=>(select location_id from decision_location),p_search=>'DEC-2')->'decisionCounts'->>'all')::int,1,'text search scopes shortcut counts');
select is((public.product_intelligence(p_location_id=>(select location_id from decision_location),p_variant_id=>'19700000-0000-4000-8000-000000000023')->'items'->0->>'variant_id'),'19700000-0000-4000-8000-000000000023','exact variant works without a SKU');
select is((public.product_intelligence(p_location_id=>(select location_id from decision_location),p_manufacturer_id=>'19700000-0000-4000-8000-000000000099')->'decisionCounts'->>'all')::int,0,'manufacturer scope is applied before counts');
reset role;
select testkit.as_user((select company_id from decision_company),'19700000-0000-4000-8000-000000000002','Staff');
select is(public.product_intelligence(p_location_id=>(select location_id from decision_location),p_decision=>'needs_attention')->'summary'->'stockValue','null'::jsonb,'financial amounts remain masked without permission');
select throws_ok($$select public.product_intelligence(p_location_id=>(select location_id from decision_location),p_decision=>'unknown')$$,'P0001','invalid_product_decision','unknown filter is still rejected');
select * from finish();
rollback;
