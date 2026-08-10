begin;
select plan(33);

select testkit.create_user('82828282-8282-4282-8282-828282828281','metrics-admin@test.local','+254700000821');
select testkit.create_user('82828282-8282-4282-8282-828282828289','metrics-platform@test.local','+254700000829');
select testkit.create_user('82828282-8282-4282-8282-828282828283','metrics-restricted@test.local','+254700000823');
create temp table metrics_fixture as
select testkit.provision('82828282-8282-4282-8282-828282828281','Metrics Test Store') company_id;
grant select on pg_temp.metrics_fixture to authenticated;
select testkit.add_member((select company_id from metrics_fixture),'82828282-8282-4282-8282-828282828283','Metrics Restricted',array[]::text[]);
insert into public.platform_admins(user_id) values('82828282-8282-4282-8282-828282828289');
insert into public.customers(id,company_id,first_name,phone,notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled)
select '82828282-8282-4282-8282-828282828282',company_id,'Amina','+254700000822',true,true,true from metrics_fixture;

select testkit.as_user((select company_id from metrics_fixture),'82828282-8282-4282-8282-828282828281','Admin');
select throws_ok(
  $$select public.platform_save_campaign_draft('No access','in_app','Title','Body','all',null,null,null,null,null,null)$$,
  'P0001','platform_admin_required','tenant admin cannot create platform drafts'
);
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"82828282-8282-4282-8282-828282828289","role":"authenticated","is_platform_admin":true}';
create temp table campaign_fixture as select public.platform_save_campaign_draft(
  'Metrics campaign','in_app','Hello {{merchant_name}}','Review your update','selected',null,null,
  array[(select company_id from metrics_fixture)],'Open settings','/settings',null
) id;
grant select on pg_temp.campaign_fixture to authenticated;
select is((select status from public.message_campaigns where id=(select id from campaign_fixture)),'draft','campaign saves as draft');
select throws_ok($$select public.platform_launch_campaign((select id from campaign_fixture),null)$$,
  'P0001','campaign_review_required','unreviewed draft cannot launch');
select is((public.platform_review_campaign((select id from campaign_fixture))->>'eligible')::int,1,'review resolves primary admin');
select public.platform_save_campaign_draft(
  'Metrics campaign','in_app','Hello {{merchant_name}}','Review your updated message','selected',null,null,
  array[(select company_id from metrics_fixture)],'Open settings','/settings',(select id from campaign_fixture)
);
select throws_ok($$select public.platform_launch_campaign((select id from campaign_fixture),null)$$,
  'P0001','campaign_review_required','editing invalidates prior review');
select public.platform_review_campaign((select id from campaign_fixture));
select lives_ok($$select public.platform_launch_campaign((select id from campaign_fixture),now()+interval '1 day')$$,'draft schedules');
select is((select status from public.message_campaigns where id=(select id from campaign_fixture)),'scheduled','future launch remains scheduled');
select is(public.platform_cancel_campaign((select id from campaign_fixture)),true,'scheduled campaign cancels');
create temp table duplicate_fixture as select public.platform_duplicate_campaign((select id from campaign_fixture)) id;
grant select on pg_temp.duplicate_fixture to authenticated;
select is((select status from public.message_campaigns where id=(select id from duplicate_fixture)),'draft','duplicate is editable draft');
select public.platform_review_campaign((select id from duplicate_fixture));
select lives_ok($$select public.platform_launch_campaign((select id from duplicate_fixture),null)$$,'duplicate dispatches now');
select is((select status from public.message_campaigns where id=(select id from duplicate_fixture)),'completed','in-app dispatch completes');
select is((select action_label from public.notifications where campaign_id=(select id from duplicate_fixture)),'Open settings','campaign CTA reaches notification');
select is((public.platform_campaign_metrics((select id from duplicate_fixture))->>'targeted')::int,1,'campaign metrics count target');
reset role;

select testkit.as_user((select company_id from metrics_fixture),'82828282-8282-4282-8282-828282828281','Admin');
select is(public.record_notification_click((select id from public.notifications where campaign_id=(select id from duplicate_fixture))),true,'recipient records CTA click');
create temp table click_fixture as select clicked_at from public.notifications where campaign_id=(select id from duplicate_fixture);
select is(public.record_notification_click((select id from public.notifications where campaign_id=(select id from duplicate_fixture))),true,'repeat click remains valid');
select is((select clicked_at from public.notifications where campaign_id=(select id from duplicate_fixture)),(select clicked_at from click_fixture),'click timestamp is idempotent');
reset role;

insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at)
select company_id,'82828282-8282-4282-8282-828282828282','receipt',gen_random_uuid(),
  encode(extensions.digest('metrics-document','sha256'),'hex'),'{"document_number":"OPEN-1"}',now()+interval '1 day' from metrics_fixture;
set local role anon;
select is(public.public_external_document('metrics-document')->>'document_number','OPEN-1','valid document opens');
select is(public.public_external_document('missing-document'),null,'invalid document reveals nothing');
select public.public_external_document('metrics-document');
reset role;
select is((select open_count from public.external_document_links where token_hash=encode(extensions.digest('metrics-document','sha256'),'hex')),2,'valid loads increment aggregate counter');
select ok((select first_opened_at is not null and last_opened_at is not null from public.external_document_links where token_hash=encode(extensions.digest('metrics-document','sha256'),'hex')),'open timestamps recorded');
insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at)
select company_id,'82828282-8282-4282-8282-828282828282','receipt',gen_random_uuid(),
  encode(extensions.digest('expired-document','sha256'),'hex'),'{}',now()-interval '1 minute' from metrics_fixture;
set local role anon;
select is(public.public_external_document('expired-document'),null,'expired document token reveals nothing');
reset role;
select is((select open_count from public.external_document_links where token_hash=encode(extensions.digest('expired-document','sha256'),'hex')),0,'expired document does not increment opens');
insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at,revoked_at)
select company_id,'82828282-8282-4282-8282-828282828282','receipt',gen_random_uuid(),
  encode(extensions.digest('revoked-document','sha256'),'hex'),'{}',now()+interval '1 day',now() from metrics_fixture;
set local role anon;
select is(public.public_external_document('revoked-document'),null,'revoked document token reveals nothing');
reset role;
select is((select open_count from public.external_document_links where token_hash=encode(extensions.digest('revoked-document','sha256'),'hex')),0,'revoked document does not increment opens');
insert into public.customer_statement_links(company_id,customer_id,token_hash,expires_at,revoked_at)
select company_id,'82828282-8282-4282-8282-828282828282',
  encode(extensions.digest('revoked-statement','sha256'),'hex'),now()+interval '1 day',now() from metrics_fixture;
set local role anon;
select is(public.public_customer_statement('revoked-statement'),null,'revoked statement token reveals nothing');
reset role;
select is((select open_count from public.customer_statement_links where token_hash=encode(extensions.digest('revoked-statement','sha256'),'hex')),0,'revoked statement does not increment opens');
select testkit.as_user((select company_id from metrics_fixture),'82828282-8282-4282-8282-828282828281','Admin');
select is((select count(*)::integer from public.external_document_links),3,'authorized admin can read company document metrics');
select is((select count(*)::integer from public.customer_statement_links),1,'authorized admin can read company statement metrics');
reset role;
select testkit.as_user((select company_id from metrics_fixture),'82828282-8282-4282-8282-828282828283','Metrics Restricted');
select is((select count(*)::integer from public.external_document_links),0,'member without communications or finance permission cannot read document metrics');
select is((select count(*)::integer from public.customer_statement_links),0,'member without communications or finance permission cannot read statement metrics');
reset role;
select ok(position('v_copy_token' in pg_get_functiondef('public.send_external_document(text,uuid,text,boolean,boolean)'::regprocedure))>0,'document copy receives separate token');
select hasnt_function('public','platform_send_campaign',array['text','text','text','text','text','uuid','text','uuid[]'],'legacy immediate-send RPC is removed');
select hasnt_function('public','platform_broadcast',array['text','text','text'],'legacy broadcast RPC is removed');

select * from finish();
rollback;
