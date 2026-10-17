begin;
select no_plan();
select testkit.create_user('94300000-0000-4000-8000-000000000001','print-format@test.local');
create temp table print_fixture as select testkit.provision('94300000-0000-4000-8000-000000000001','Print Store') company_id;
grant select on print_fixture to authenticated;
select set_config('request.jwt.claims',testkit.claims(company_id,'94300000-0000-4000-8000-000000000001','Admin'),true) from print_fixture;
select vault.create_secret('https://print.test','STOREFRONT_PUBLIC_URL');
insert into public.orders(id,company_id,location_id,code,status,total,is_credit_sale,completed_at)
select ('94300000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,f.company_id,l.id,'PRINT-'||i,'completed',1000,false,now()
from print_fixture f join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN' cross join generate_series(10,12) i;
insert into public.payments(company_id,order_id,method_code,amount,status)
select company_id,id,'cash',1000,'settled' from public.orders where company_id=(select company_id from print_fixture);
create temp table print_results(key text primary key,value jsonb);
grant all on print_results to authenticated;
select testkit.as_user(company_id,'94300000-0000-4000-8000-000000000001','Admin') from print_fixture;
insert into print_results values('mobile',public.request_sale_document('94300000-0000-4000-8000-000000000010','94300000-0000-4000-8000-000000000100','0712345701','Amina','Buyer','receipt-52mm'));
select is((select value->>'paper_format' from print_results where key='mobile'),'receipt-52mm','acceptance returns the selected format');
select is(public.sale_document_context('94300000-0000-4000-8000-000000000010')#>>'{delivery,paper_format}','receipt-52mm','delivery context exposes the saved format');
select is(public.request_sale_document('94300000-0000-4000-8000-000000000010','94300000-0000-4000-8000-000000000100',null,null,null,'receipt-80mm'),(select value from print_results where key='mobile'),'changed size with same request key retains original acceptance');
insert into print_results values('wide',public.request_sale_document('94300000-0000-4000-8000-000000000011','94300000-0000-4000-8000-000000000101','0712345701','Amina','Buyer','receipt-80mm'));
insert into print_results values('legacy',public.request_sale_document('94300000-0000-4000-8000-000000000012','94300000-0000-4000-8000-000000000102','0712345701','Amina','Buyer'));
select is((select value->>'paper_format' from print_results where key='legacy'),'a4','omitted format defaults to A4');
select throws_ok($$select public.request_sale_document('94300000-0000-4000-8000-000000000010','94300000-0000-4000-8000-000000000103',null,null,null,'invalid')$$,'P0001','invalid_paper_format','invalid formats are rejected');
reset role;
select is((select snapshot->>'paper_format' from public.external_document_links where id=(select external_document_link_id from public.outbox where id=(select (value->>'outbox_id')::uuid from print_results where key='mobile'))),'receipt-52mm','narrow size is frozen in snapshot');
select is((select snapshot->>'paper_format' from public.external_document_links where id=(select external_document_link_id from public.outbox where id=(select (value->>'outbox_id')::uuid from print_results where key='wide'))),'receipt-80mm','wide size is frozen in snapshot');
select is((select count(*) from public.external_document_links where company_id=(select company_id from print_fixture) and snapshot->>'pdf_renderer_version'='2'),3::bigint,'new documents use the current renderer version');
select is(public.claim_sale_document_delivery((select (value->>'outbox_id')::uuid from print_results where key='mobile'))#>>'{snapshot,paper_format}','receipt-52mm','delivery worker receives the frozen size');
set local role anon;
select throws_like($$select public.request_sale_document('94300000-0000-4000-8000-000000000010','94300000-0000-4000-8000-000000000104',null,null,null,'receipt-52mm')$$,'%permission denied%','anonymous callers cannot queue a format-aware job');
reset role;
select * from finish();
rollback;
