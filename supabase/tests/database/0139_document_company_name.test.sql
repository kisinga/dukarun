begin;
select plan(23);
select testkit.create_user('93900000-0000-4000-8000-000000000001','designer-name@test.local');
select testkit.create_user('93900000-0000-4000-8000-000000000002','designer-name-cashier@test.local');
select testkit.create_user('93900000-0000-4000-8000-000000000003','designer-name-other@test.local');
create temp table designer_name_company as select
  testkit.provision('93900000-0000-4000-8000-000000000001','Designer Name') id,
  testkit.provision('93900000-0000-4000-8000-000000000003','Other shop') other_id;
grant select on designer_name_company to authenticated;
select testkit.add_member((select id from designer_name_company),'93900000-0000-4000-8000-000000000002','Cashier','{SettleOrder}');
select testkit.as_user((select id from designer_name_company),'93900000-0000-4000-8000-000000000001','Admin');

select is((select show_company_name_on_documents from public.companies where id=public.current_company_id()),true,'company names are shown by default');
select is(public.save_document_design('receipt','{"version":1,"layout":"compact","message":"Thanks","showVatBreakdown":false,"custom":{"label":"","value":"","display":"text"}}')->>'showCompanyName','true','older designs resolve the shared default');
select is(public.save_document_design('invoice','{"version":1,"layout":"modern","message":"Terms","showCompanyName":false,"custom":{"label":"","value":"","display":"text"}}')->>'showCompanyName','true','individual designs cannot override the shared preference');
select is(public.save_document_company_name(false)->>'show_company_name_on_documents','false','one save hides company names for all documents');
select is((select count(*) from public.companies c, jsonb_each(c.document_designs) d where c.id=public.current_company_id() and d.value->'showCompanyName'='false'::jsonb),6::bigint,'all six resolved designs hide the name');
select is((select document_designs#>>'{invoice,layout}' from public.companies where id=public.current_company_id()),'modern','shared save preserves custom layouts');
select is((select document_designs#>>'{receipt,message}' from public.companies where id=public.current_company_id()),'Thanks','shared save preserves document messages');
select is((select document_designs#>>'{receipt,showVatBreakdown}' from public.companies where id=public.current_company_id()),'false','shared save preserves VAT settings');
select is((select name from public.companies where id=public.current_company_id()),'Designer Name','hiding names leaves company identity intact');
select throws_ok($$select public.save_document_company_name(null)$$,'P0001','invalid_company_name_visibility','null visibility rejected');
select throws_ok($$update public.companies set show_company_name_on_documents=true where id=public.current_company_id()$$,'42501',null,'direct update cannot bypass shared design synchronization');
select throws_ok($$select public.save_document_design('receipt','{"version":1,"layout":"classic","message":"","showCompanyName":"false","custom":{"label":"","value":"","display":"text"}}')$$,'P0001','invalid_document_design','malformed snapshot preference is rejected');
select testkit.as_user((select id from designer_name_company),'93900000-0000-4000-8000-000000000002','Cashier');
select throws_ok($$select public.save_document_company_name(true)$$,'P0001','permission_denied: ManageCompanySettings required','cashiers cannot change shared name visibility');
reset role;
select is((select show_company_name_on_documents from public.companies where id=(select other_id from designer_name_company)),true,'other tenant preference remains unchanged');

insert into public.customers(id,company_id,first_name) select '93900000-0000-4000-8000-000000000010',id,'Buyer' from designer_name_company;
insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at)
select id,'93900000-0000-4000-8000-000000000010','receipt','93900000-0000-4000-8000-000000000011',encode(extensions.digest('designer-name-public','sha256'),'hex'),'{}',now()+interval '1 day' from designer_name_company;
insert into public.customer_statement_links(company_id,customer_id,token_hash,expires_at)
select id,'93900000-0000-4000-8000-000000000010',encode(extensions.digest('designer-name-statement','sha256'),'hex'),now()+interval '1 day' from designer_name_company;
set local role anon;
select is(public.public_external_document('designer-name-public')#>>'{document_design,showCompanyName}','false','issued document captures the shared preference');
select is(public.public_customer_statement('designer-name-statement')#>>'{document_design,showCompanyName}','false','live statements use the shared preference');
select throws_ok($$select public.save_document_company_name(true)$$,'42501',null,'anonymous viewers cannot change shared visibility');
reset role;
select testkit.as_user((select id from designer_name_company),'93900000-0000-4000-8000-000000000001','Admin');
select is(public.save_document_design('receipt','{"version":1,"layout":"compact","message":"Draft from another tab","showCompanyName":true,"custom":{"label":"","value":"","display":"text"}}')->>'showCompanyName','false','stale drafts cannot undo the shared preference');
select is(public.save_document_design('receipt','{"version":1,"layout":"classic","message":"","custom":{"label":"","value":"","display":"text"}}')->>'showCompanyName','false','restoring a design retains the shared preference');
select is(public.save_document_company_name(true)->>'show_company_name_on_documents','true','one save shows names again');
select is((select count(*) from public.companies c, jsonb_each(c.document_designs) d where c.id=public.current_company_id() and d.value->'showCompanyName'='true'::jsonb),6::bigint,'all six designs show the name again');
reset role;
set local role anon;
select is(public.public_external_document('designer-name-public')#>>'{document_design,showCompanyName}','false','already-issued documents retain their captured preference');
select is(public.public_customer_statement('designer-name-statement')#>>'{document_design,showCompanyName}','true','live statements follow the updated shared preference');
reset role;
select * from finish();
rollback;
