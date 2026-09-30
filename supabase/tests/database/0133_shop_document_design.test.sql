begin;
select plan(26);
select testkit.create_user('93300000-0000-4000-8000-000000000001','document-owner@test.local');
select testkit.create_user('93300000-0000-4000-8000-000000000002','document-cashier@test.local');
select testkit.create_user('93300000-0000-4000-8000-000000000003','document-other@test.local');
create temp table document_companies as select
  testkit.provision('93300000-0000-4000-8000-000000000001','Document Shop') company_id,
  testkit.provision('93300000-0000-4000-8000-000000000003','Other Document Shop') other_id;
grant select on pg_temp.document_companies to authenticated;
select testkit.add_member((select company_id from document_companies),'93300000-0000-4000-8000-000000000002','Cashier','{SettleOrder}');
update public.companies set public_slug='document-taken' where id=(select other_id from document_companies);
select testkit.as_user((select company_id from document_companies),'93300000-0000-4000-8000-000000000001','Admin');
select is(public.save_document_design('receipt','{"version":1,"layout":"compact","message":"Thanks","custom":{"label":"Website","value":"https://example.test","display":"text"}}')->>'layout','compact','settings permission can save a receipt design');
select lives_ok($$select public.save_document_design('invoice','{"version":1,"layout":"modern","message":"Terms","custom":{"label":"","value":"","display":"text"}}')$$,'independent document save succeeds');
select is((select document_designs#>>'{receipt,layout}' from public.companies where id=public.current_company_id()),'compact','saving invoice retains receipt');
select throws_ok($$select public.save_document_design('receipt','{"version":1,"layout":"html","message":"","custom":{"label":"","value":"","display":"text"}}')$$,'P0001','invalid_document_design','unknown layout rejected');
select throws_ok($$select public.save_document_design('receipt','{"version":1,"layout":"classic","message":"","custom":{"label":"","value":"abc","display":"qr"}}')$$,'P0001','invalid_document_qr','unprepared QR rejected');
select throws_ok($$select public.save_document_design('other','{}')$$,'P0001','invalid_document_type','unknown document rejected');
select throws_ok($$update public.companies set document_designs='{}' where id=public.current_company_id()$$,'42501',null,'direct replacement of all document designs denied');
select is(public.save_shop_setup('{"identity_reviewed":true}')->>'identity_reviewed','true','setup review stored');
select is(public.save_shop_setup('{"address_deferred":true}')->>'identity_reviewed','true','setup patch preserves other choices');
select throws_ok($$select public.save_shop_setup('{"learning_completed":true}')$$,'P0001','invalid_setup_state','learning progress cannot be stored as shop readiness');
select is(public.shop_address_availability('document-taken')->>'available','false','collision reported without exposing another shop');
select is(public.shop_address_availability('document-taken')->>'suggestion','document-taken-2','collision has a useful alternative');
update public.companies set public_slug='document-test-own',website_url='https://example.test' where id=public.current_company_id();
select is((select public_storefront_enabled from public.companies where id=public.current_company_id()),false,'saving web address does not publish shop');
select throws_ok($$update public.companies set public_slug='Invalid Slug' where id=public.current_company_id()$$,'23514',null,'address format enforced by database');
select throws_ok($$update public.companies set public_slug='document-taken' where id=public.current_company_id()$$,'23505',null,'unique constraint remains final authority');
select testkit.as_user((select company_id from document_companies),'93300000-0000-4000-8000-000000000002','Cashier');
select throws_ok($$select public.save_document_design('receipt','{}')$$,'P0001','permission_denied: ManageCompanySettings required','cashier cannot save designs');
select throws_ok($$select public.save_shop_setup('{"offered":true}')$$,'P0001','permission_denied: ManageCompanySettings required','cashier cannot change setup');
reset role;
select is((select document_designs from public.companies where id=(select other_id from document_companies)),'{}'::jsonb,'other tenant designs remain unchanged');
insert into public.customers(id,company_id,first_name)
select '93300000-0000-4000-8000-000000000010',company_id,'Document customer' from document_companies;
insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at)
select company_id,'93300000-0000-4000-8000-000000000010','receipt','93300000-0000-4000-8000-000000000011',
  encode(extensions.digest('document-design-snapshot','sha256'),'hex'),'{"document_number":"SNAPSHOT-1"}',now()+interval '1 day' from document_companies;
insert into public.customer_statement_links(company_id,customer_id,token_hash,expires_at)
select company_id,'93300000-0000-4000-8000-000000000010',encode(extensions.digest('document-design-live','sha256'),'hex'),now()+interval '1 day' from document_companies;
select testkit.as_user((select company_id from document_companies),'93300000-0000-4000-8000-000000000001','Admin');
select public.save_document_design('receipt','{"version":1,"layout":"modern","message":"Changed","custom":{"label":"","value":"","display":"text"}}');
select public.save_document_design('statement','{"version":1,"layout":"compact","message":"Current statement","custom":{"label":"","value":"","display":"text"}}');
reset role;
set local role anon;
select is(public.public_external_document('document-design-snapshot')#>>'{document_design,layout}','compact','shared document retains captured layout');
select is(public.public_external_document('document-design-snapshot')#>>'{document_design,message}','Thanks','shared document retains captured text');
select is(public.public_external_document('document-design-snapshot')->>'company_website','https://example.test','shared document includes public website');
select is(public.public_external_document('document-design-snapshot') ?| array['document_designs','shop_setup'],false,'public snapshot omits private configuration');
select is(public.public_customer_statement('document-design-live')#>>'{document_design,layout}','compact','live statement uses current statement design');
reset role;
update public.external_document_links set revoked_at=now() where token_hash=encode(extensions.digest('document-design-snapshot','sha256'),'hex');
set local role anon;
select is(public.public_external_document('document-design-snapshot'),null::jsonb,'revocation still blocks captured design');
reset role;
update public.external_document_links set revoked_at=null,expires_at=now()-interval '1 second' where token_hash=encode(extensions.digest('document-design-snapshot','sha256'),'hex');
update public.customer_statement_links set expires_at=now()-interval '1 second' where token_hash=encode(extensions.digest('document-design-live','sha256'),'hex');
set local role anon;
select is(public.public_external_document('document-design-snapshot'),null::jsonb,'expired snapshot is unavailable');
select is(public.public_customer_statement('document-design-live'),null::jsonb,'expired live statement is unavailable');
reset role;
select * from finish();
rollback;
