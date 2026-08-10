begin;
select plan(12);

select testkit.create_user('85858585-8585-4585-8585-858585858581','followup-a@test.local','+254700000851');
select testkit.create_user('85858585-8585-4585-8585-858585858582','followup-b@test.local','+254700000852');
select testkit.create_user('85858585-8585-4585-8585-858585858589','followup-platform@test.local','+254700000859');
create temp table followup_a as select testkit.provision('85858585-8585-4585-8585-858585858581','Follow-up A') company_id;
create temp table followup_b as select testkit.provision('85858585-8585-4585-8585-858585858582','Follow-up B') company_id;
insert into public.platform_admins(user_id) values('85858585-8585-4585-8585-858585858589');
insert into public.customers(id,company_id,first_name,phone)
select '85858585-8585-4585-8585-858585858583',company_id,'Amina','+254700000853' from followup_a;
insert into public.customers(id,company_id,first_name,phone)
select '85858585-8585-4585-8585-858585858584',company_id,'Benta','+254700000854' from followup_b;

insert into public.external_document_links(id,company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at,open_count,audience_role)
select '85858585-8585-4585-8585-858585858585',company_id,'85858585-8585-4585-8585-858585858583',
  'invoice',gen_random_uuid(),encode(extensions.digest('followup-document','sha256'),'hex'),'{}',now()+interval '1 day',2,'company_copy'
from followup_a;
select throws_ok(
  $$update public.external_document_links set audience_role='legacy_shared' where id='85858585-8585-4585-8585-858585858585'$$,
  '23514',null,'legacy shared-link role is rejected'
);
select is(
  (select count(*)::integer from public.external_document_links where audience_role not in ('primary','company_copy')),
  0,'only attributable document-link roles remain'
);
insert into public.outbox(company_id,channel,recipient,body,status,source,external_document_link_id)
select company_id,'whatsapp','+254700000851','Company copy','sent','manual_document_copy','85858585-8585-4585-8585-858585858585' from followup_a;
insert into public.outbox(company_id,channel,recipient,body,status,source)
select company_id,'sms','+254700000851','Campaign','failed','campaign' from followup_a;
insert into public.outbox(company_id,channel,recipient,body,status,source)
select company_id,'sms','+254700000851','Direct','pending','direct' from followup_a;

set local role authenticated;
set local request.jwt.claims='{"sub":"85858585-8585-4585-8585-858585858589","role":"authenticated","is_platform_admin":true}';
create temp table metric_result as select public.platform_external_communication_metrics(now()-interval '1 hour') value;
select is((select (value->>'provider_accepted')::int from metric_result),1,'company-copy acceptance is included');
select is((select (value->>'failed')::int from metric_result),1,'customer campaign failure is included');
select is((select (value->>'pending')::int from metric_result),1,'direct pending delivery is included');
select is((select (value->>'documents_opened')::int from metric_result),1,'tracked link counted once');
select is((select (value->>'link_opens')::int from metric_result),2,'tracked link opens are not duplicated');
reset role;

insert into public.message_campaigns(id,scope,name,audience,audience_config,channel,title,body,status,recipient_count)
values('85858585-8585-4585-8585-858585858586','platform','Finalize','all','{}','sms','Title','Body','sending',2);
insert into public.campaign_recipients(id,campaign_id,company_id,recipient,rendered_body,status)
select '85858585-8585-4585-8585-858585858587','85858585-8585-4585-8585-858585858586',company_id,'+254700000851','One','queued' from followup_a;
insert into public.campaign_recipients(id,campaign_id,company_id,recipient,rendered_body,status)
select '85858585-8585-4585-8585-858585858588','85858585-8585-4585-8585-858585858586',company_id,'+254700000852','Two','queued' from followup_b;
select public.finalize_campaign_recipient('85858585-8585-4585-8585-858585858587','sent');
select is((select status from public.message_campaigns where id='85858585-8585-4585-8585-858585858586'),'sending','campaign remains active while recipient queued');
select public.finalize_campaign_recipient('85858585-8585-4585-8585-858585858588','failed');
select is((select status||':'||sent_count||':'||failed_count from public.message_campaigns where id='85858585-8585-4585-8585-858585858586'),'partial:1:1','final campaign totals update atomically');
insert into public.outbox(id,company_id,channel,recipient,body,status,source,campaign_id,campaign_recipient_id)
select '85858585-8585-4585-8585-858585858580',company_id,'sms','+254700000851','One','sent','platform',
  '85858585-8585-4585-8585-858585858586','85858585-8585-4585-8585-858585858587' from followup_a;
update public.campaign_recipients set status='queued',outbox_id='85858585-8585-4585-8585-858585858580'
where id='85858585-8585-4585-8585-858585858587';
update public.message_campaigns set status='sending',sent_count=0 where id='85858585-8585-4585-8585-858585858586';
select ok(public.reconcile_platform_campaign_deliveries()>=1,'reconciler repairs missed worker bookkeeping');
select is((select status||':'||sent_count||':'||failed_count from public.message_campaigns where id='85858585-8585-4585-8585-858585858586'),'partial:1:1','reconciled campaign totals are correct');

insert into public.customer_statement_links(company_id,customer_id,token_hash,expires_at)
select company_id,'85858585-8585-4585-8585-858585858584',encode(extensions.digest('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','sha256'),'hex'),now()+interval '1 day' from followup_b;
insert into public.outbox(company_id,channel,recipient,body,status,source)
select company_id,'sms','+254700000851','/statement/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','pending','reminder' from followup_a;
select is((select customer_statement_link_id from public.outbox where body like '/statement/aaaa%'),null,'statement attribution cannot cross tenants');

select * from finish();
rollback;
