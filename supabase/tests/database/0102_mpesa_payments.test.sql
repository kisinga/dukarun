begin;
-- Provider timestamps and period locks are compared in the Kenyan business day.
set local timezone to 'Africa/Nairobi';
select plan(62);

select has_table('public','mpesa_onboarding_requests','onboarding is durable');
select has_table('public','mpesa_daraja_apps','Daraja apps are separate from merchant accounts');
select has_table('public','payment_provider_accounts','provider-neutral accounts exist');
select has_column('public','payment_provider_accounts','ledger_account_code',
  'provider accounts point at the money account they post into');
select has_table('public','payment_collections','actual money is recorded as collections');
select has_table('public','payment_collection_allocations','accounting allocations exist');
select has_table('public','mpesa_connections','merchant connections exist');
select has_table('public','mpesa_payment_intents','payment intents exist');
select has_table('public','mpesa_provider_events','callback inbox exists');
select has_function('public','mpesa_availability',array['uuid'],'safe availability RPC exists');
select has_function('public','mpesa_setup_status',array[]::text[],'gated setup RPC exists');
select has_function('public','prepare_mpesa_checkout',
  array['text','uuid','text','bigint','bigint','text','uuid','jsonb','uuid','uuid','boolean'],
  'checkout preparation RPC exists');
select has_function('public','allocate_mpesa_collection',array['uuid','uuid','uuid','uuid','text'],
  'collection allocation RPC exists');
select has_function('public','request_mpesa_reversal',array['uuid','text','timestamp with time zone','text'],
  'recorded reversal RPC exists');
select has_function('public','list_mpesa_provider_event_reviews',array['integer'],
  'provider-event review queue RPC exists');
select has_function('public','review_mpesa_provider_event',array['uuid','text','text'],
  'provider-event resolution RPC exists');
select has_function('public','mpesa_latest_trusted_callback_payload',array['uuid'],
  'status polling uses a correlation-gated callback payload RPC');
select ok(exists(select 1 from public.roles r join public.companies c on c.id=r.company_id
  where c.name='Mama Mboga Stores' and r.name='Admin'
    and 'ManageMpesaIntegration'=any(r.permissions)),
  'seeded Admin can open M-PESA settings');

select testkit.create_user('b2000000-0000-4000-8000-000000000001','mpesa-admin@test.local');
create temp table mpesa_fixture as select testkit.provision(
  'b2000000-0000-4000-8000-000000000001','M-PESA Test Store') company_id;
grant select on pg_temp.mpesa_fixture to authenticated;
select testkit.as_user((select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000001','Admin');

select ok(public.current_user_has_permission('ManageMpesaIntegration'),
  'company Admin gets setup permission');
create temp table mpesa_request as select public.request_mpesa_onboarding(
  'M-PESA Test Store Ltd','555555','till','business-admin','Test Owner',
  '0712345678','owner@example.test','Pilot') request_id;
grant select on pg_temp.mpesa_request to authenticated;
select ok((select request_id from mpesa_request) is not null,'merchant can request setup');
select is(public.mpesa_setup_status()->'onboarding_requests'->0->>'status',
  'requested','request starts as requested');
select is(public.mpesa_setup_status()->'onboarding_requests'->0->>'ledger_account_code',
  'MPESA','setup request is tied to a M-PESA money account');
select ok(position('consumer_key' in public.mpesa_setup_status()::text)=0
  and position('passkey' in public.mpesa_setup_status()::text)=0,
  'merchant setup status exposes no credential fields');
select is((select count(*)::int from information_schema.columns
  where table_schema='public' and table_name like 'mpesa%'
    and column_name ilike '%otp%'),0,'no OTP field exists');
select throws_ok('select * from public.payment_provider_accounts',
  '42501','permission denied for table payment_provider_accounts',
  'company members cannot read provider tables directly');

reset role;
create temp table mpesa_account as
with app as (
  insert into public.mpesa_daraja_apps(company_id,app_name,environment,
    consumer_key_secret_id,consumer_secret_secret_id,status)
  select company_id,'Test Daraja','production',
    vault.create_secret('test-consumer-key','MPESA_TEST_CONSUMER_KEY_'||gen_random_uuid()::text,
      'M-PESA test consumer key'),
    vault.create_secret('test-consumer-secret','MPESA_TEST_CONSUMER_SECRET_'||gen_random_uuid()::text,
      'M-PESA test consumer secret'),'verified'
  from mpesa_fixture returning id,company_id
), account as (
  insert into public.payment_provider_accounts(
    company_id,provider,environment,display_name,status,ledger_account_code
  )
  select company_id,'mpesa','production','Till 555555','active','MPESA' from app
  returning id,company_id
), connection as (
  insert into public.mpesa_connections(provider_account_id,company_id,onboarding_request_id,
    daraja_app_id,shortcode_type,organization_shortcode,business_shortcode,party_b,passkey_secret_id)
  select account.id,account.company_id,(select request_id from mpesa_request),app.id,
    'till','555555','555555','555555',
    vault.create_secret('test-passkey','MPESA_TEST_PASSKEY_'||gen_random_uuid()::text,
      'M-PESA test passkey')
  from account join app using(company_id)
  returning provider_account_id,company_id
)
select c.provider_account_id account_id,c.company_id,
  (select l.id from public.stock_locations l
    where l.company_id=c.company_id and l.is_default) location_id
from connection c;
grant select on pg_temp.mpesa_account to authenticated;
select is((select ledger_account_code from public.payment_provider_accounts
  where id=(select account_id from mpesa_account)),
  'MPESA','active provider account has a durable money-account link');

insert into public.orders(id,company_id,location_id,code,status,total)
select 'b2000000-0000-4000-8000-000000000120',a.company_id,a.location_id,
  'MP-RESUME','pending_payment',60
from mpesa_account a;
select testkit.as_user((select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
create temp table prepared_checkout as select public.prepare_mpesa_checkout(
  'order',(select location_id from mpesa_account),
  '254712345678',60,0,'resume-checkout',null,null,
  'b2000000-0000-4000-8000-000000000120',null,false) result;
grant select on pg_temp.prepared_checkout to authenticated;
select is((select result->>'action' from prepared_checkout),'send_prompt',
  'a new checkout asks the edge function to send one prompt');
create temp table prepared_attempt as select public.create_mpesa_payment_attempt(
  (select (result->>'intent_id')::uuid from prepared_checkout),repeat('c',64)) attempt_id;
grant select on pg_temp.prepared_attempt to authenticated;
create temp table resumed_checkout as select public.prepare_mpesa_checkout(
  'order',(select location_id from mpesa_account),
  '254712345678',60,0,'resume-checkout',null,null,
  'b2000000-0000-4000-8000-000000000120',null,false) result;
select is((select result->>'intent_id' from resumed_checkout),
  (select result->>'intent_id' from prepared_checkout),
  'the same client reference and fingerprint resume the existing intent');
select is((select result->>'action' from resumed_checkout),'poll',
  'an in-flight checkout polls instead of sending a duplicate prompt');
select testkit.close_open_session();
select is((public.prepare_mpesa_checkout(
  'order',(select location_id from mpesa_account),
  '254712345678',60,0,'resume-checkout',null,null,
  'b2000000-0000-4000-8000-000000000120',null,false)->>'intent_id'),
  (select result->>'intent_id' from prepared_checkout),
  'refresh after till close still resumes the captured intent');

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.mpesa_ingest_provider_event(repeat('c',64),'stk_callback','CHECKOUT-BIND-1',
  '{"Body":{"stkCallback":{"CheckoutRequestID":"CHECKOUT-BIND-1"}}}'::jsonb,repeat('d',64));
select results_eq(
  $$select a.checkout_request_id,e.status from public.mpesa_payment_attempts a
    join public.mpesa_provider_events e on e.attempt_id=a.id
    where a.id=(select attempt_id from prepared_attempt) and e.provider_event_key='CHECKOUT-BIND-1'$$,
  $$values ('CHECKOUT-BIND-1'::text,'queued'::text)$$,
  'a token-authenticated callback binds a missing checkout ID once');
select public.mpesa_ingest_provider_event(repeat('c',64),'stk_callback','CHECKOUT-CONFLICT',
  '{"Body":{"stkCallback":{"CheckoutRequestID":"CHECKOUT-CONFLICT"}}}'::jsonb,repeat('e',64));
select results_eq(
  $$select i.status,a.status,e.status from public.mpesa_payment_intents i
    join public.mpesa_payment_attempts a on a.id=i.current_attempt_id
    join public.mpesa_provider_events e on e.attempt_id=a.id
    where i.id=(select (result->>'intent_id')::uuid from prepared_checkout)
      and e.provider_event_key='CHECKOUT-CONFLICT'$$,
  $$values ('manual_review'::text,'manual_review'::text,'manual_review'::text)$$,
  'a conflicting callback ID enters review without being processed');
select is(public.mpesa_latest_trusted_callback_payload(
  (select attempt_id from prepared_attempt))#>>'{Body,stkCallback,CheckoutRequestID}',
  'CHECKOUT-BIND-1','status polling ignores a quarantined callback');

select set_config('request.jwt.claims',testkit.claims(
  (select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000001','Admin'),true);
select is((select count(*)::int from public.list_mpesa_provider_event_reviews(50)
  where provider_event_key='CHECKOUT-CONFLICT'),1,
  'a reconciliation manager can see quarantined provider events');
select is((public.review_mpesa_provider_event(
  (select id from public.mpesa_provider_events where provider_event_key='CHECKOUT-CONFLICT'),
  'dismiss_no_money','Verified that the callback belongs to another checkout')->>'status'),
  'dismissed','an operator can explicitly resolve a callback with no money evidence');
select is((select status from public.mpesa_provider_events
  where provider_event_key='CHECKOUT-CONFLICT'),'dismissed',
  'resolved provider events no longer remain close blockers');

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.mpesa_record_c2b_collection(
  (select account_id from mpesa_account),'TIMELESS',1,null,'254712345678','Test Payer','')$$,
  'P0001','invalid_provider_transaction_time',
  'money without a provider transaction time cannot enter accounting');
create temp table first_collection as select public.mpesa_record_c2b_collection(
  (select account_id from mpesa_account),'RCT001',250,now(),'254712345678',
  'Test Payer','') result;
select public.mpesa_record_c2b_collection((select account_id from mpesa_account),
  'RCT001',250,(select occurred_at from public.payment_collections where provider_receipt='RCT001'),
  '254712345678','Test Payer','');
select is((select count(*)::int from public.payment_collections where provider_receipt='RCT001'),1,
  'duplicate provider receipt creates one collection');
select is((select allocation_status from public.payment_collections where provider_receipt='RCT001'),
  'unallocated','unknown C2B enters reconciliation');
select is((select count(*)::int from public.payment_collection_allocations a
  join public.payment_collections c on c.id=a.collection_id where c.provider_receipt='RCT001'),0,
  'unknown C2B never posts accounting');

insert into public.mpesa_callback_tokens(company_id,provider_account_id,kind,token_hash,status,activated_at)
select company_id,account_id,'c2b',repeat('a',64),'active',now() from mpesa_account;
select public.mpesa_ingest_provider_event(repeat('a',64),'c2b_confirmation','EVT001',
  '{"TransID":"EVT001","TransAmount":"10"}'::jsonb,repeat('b',64));
select public.mpesa_ingest_provider_event(repeat('a',64),'c2b_confirmation','EVT001',
  '{"TransID":"EVT001","TransAmount":"10"}'::jsonb,repeat('b',64));
select is((select count(*)::int from public.mpesa_provider_events where provider_event_key='EVT001'),1,
  'repeated callbacks are idempotent');

select public.mpesa_record_c2b_collection((select account_id from mpesa_account),
  'RCT001',251,now(),'254712345678','Test Payer','');
select is((select verification_status from public.payment_collections where provider_receipt='RCT001'),
  'disputed','receipt amount conflict is disputed');

select set_config('request.jwt.claims',testkit.claims(
  (select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000001','Admin'),true);
insert into public.payment_collections(company_id,provider_account_id,provider,environment,
  provider_receipt,amount,occurred_at,source,verification_status)
select company_id,account_id,'mpesa','production','RCT002',100,now(),'c2b','provider_notified'
from mpesa_account;
insert into public.orders(id,company_id,code,status,total)
select 'b2000000-0000-4000-8000-000000000101',company_id,'MP-A','pending_payment',60
from mpesa_account;
insert into public.orders(id,company_id,code,status,total)
select 'b2000000-0000-4000-8000-000000000102',company_id,'MP-B','pending_payment',50
from mpesa_account;
insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id)
select c.id,c.company_id,60,'b2000000-0000-4000-8000-000000000101'
from public.payment_collections c where c.provider_receipt='RCT002';
select throws_ok($sql$
  insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id)
  select c.id,c.company_id,50,'b2000000-0000-4000-8000-000000000102'
  from public.payment_collections c where c.provider_receipt='RCT002'
$sql$,'P0001','collection_overallocated','allocations cannot exceed money received');

insert into public.payment_collections(company_id,provider_account_id,provider,environment,
  provider_receipt,amount,occurred_at,source,verification_status,classification)
select company_id,account_id,'mpesa','production','RCT-LATE',75,now()-interval '1 day',
  'c2b','provider_notified','surplus' from mpesa_account;
insert into public.orders(id,company_id,location_id,code,status,total)
select 'b2000000-0000-4000-8000-000000000103',company_id,location_id,
  'MP-LATE','pending_payment',75 from mpesa_account;
insert into public.period_locks(company_id,lock_end_date,updated_at)
select company_id,current_date-1,now() from mpesa_account
on conflict(company_id) do update set lock_end_date=excluded.lock_end_date,updated_at=now();
select testkit.ensure_open_session();
create temp table late_allocation as select public.allocate_mpesa_collection(
  (select id from public.payment_collections where provider_receipt='RCT-LATE'),
  'b2000000-0000-4000-8000-000000000103',null,null,'Matched bank evidence') result;
grant select on pg_temp.late_allocation to authenticated;
select is((select result->>'status' from late_allocation),'late_review',
  'manual reconciliation cannot post provider money into a locked accounting date');
select is((select status from public.orders
  where id='b2000000-0000-4000-8000-000000000103'),'pending_payment',
  'a late reconciled sale remains unfinalized while approval is pending');
select is((select status from public.mpesa_late_posting_reviews
  where id=(select (result->>'review_id')::uuid from late_allocation)),'pending',
  'manual and automatic late settlements share the same review queue');
select is((public.review_mpesa_late_posting(
  (select (result->>'review_id')::uuid from late_allocation),false,
  'The payment belongs to another sale')->>'status'),'rejected',
  'rejecting a late allocation releases it back to reconciliation');

insert into public.mpesa_payment_intents(id,company_id,provider_account_id,location_id,workflow,
  subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,status,created_by)
select 'b2000000-0000-4000-8000-000000000201',a.company_id,a.account_id,a.location_id,
  'order','order','b2000000-0000-4000-8000-000000000101','unknown-response','unknown-response',
  '254712345678',60,'requesting','b2000000-0000-4000-8000-000000000001'
from mpesa_account a;
insert into public.mpesa_payment_attempts(id,intent_id,company_id,attempt_number)
select 'b2000000-0000-4000-8000-000000000211',
  'b2000000-0000-4000-8000-000000000201',company_id,1 from mpesa_account;
update public.mpesa_payment_intents set current_attempt_id='b2000000-0000-4000-8000-000000000211'
where id='b2000000-0000-4000-8000-000000000201';
insert into public.mpesa_payment_intents(id,company_id,provider_account_id,location_id,workflow,
  subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,status,created_by)
select 'b2000000-0000-4000-8000-000000000202',a.company_id,a.account_id,a.location_id,
  'order','order','b2000000-0000-4000-8000-000000000102','terminal-response','terminal-response',
  '254712345678',50,'requesting','b2000000-0000-4000-8000-000000000001'
from mpesa_account a;
insert into public.mpesa_payment_attempts(id,intent_id,company_id,attempt_number)
select 'b2000000-0000-4000-8000-000000000212',
  'b2000000-0000-4000-8000-000000000202',company_id,1 from mpesa_account;
update public.mpesa_payment_intents set current_attempt_id='b2000000-0000-4000-8000-000000000212'
where id='b2000000-0000-4000-8000-000000000202';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.mpesa_record_stk_request('b2000000-0000-4000-8000-000000000211',null,null,
  '500.001.1001','Unfamiliar provider response',null);
select is((select status from public.mpesa_payment_intents
  where id='b2000000-0000-4000-8000-000000000201'),'pending',
  'unknown request response keeps intent pending');
select is((select status from public.mpesa_payment_attempts
  where id='b2000000-0000-4000-8000-000000000211'),'request_unknown',
  'unknown request response is not blindly retryable');
select public.mpesa_record_stk_request('b2000000-0000-4000-8000-000000000212',null,null,
  '2001','Invalid initiator information',null);
select is((select status from public.mpesa_payment_intents
  where id='b2000000-0000-4000-8000-000000000202'),'failed',
  'known terminal request response fails intent');
select is((select status from public.mpesa_payment_attempts
  where id='b2000000-0000-4000-8000-000000000212'),'failed',
  'known terminal request response fails attempt');

select testkit.create_user('b2000000-0000-4000-8000-000000000002','mpesa-platform@test.local');
insert into public.platform_admins(user_id) values('b2000000-0000-4000-8000-000000000002');

create temp table mpesa_authorization_request as
with app as (
  insert into public.mpesa_daraja_apps(company_id,app_name,environment,
    consumer_key_secret_id,consumer_secret_secret_id,status)
  select company_id,'Authorization App','production',gen_random_uuid(),gen_random_uuid(),'verified'
  from mpesa_fixture returning id,company_id
), request as (
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,status,
    prepared_daraja_app_id,requested_by)
  select app.company_id,'Auth Store Ltd','666666','till','auth-admin','Auth Owner',
    '0712345678','auth@example.test',
    array[(select id from public.stock_locations where company_id=app.company_id and is_default)],
    'merchant_verification',app.id,'b2000000-0000-4000-8000-000000000001'
  from app returning id
)
select id request_id from request;
grant select on pg_temp.mpesa_authorization_request to authenticated;

create temp table mpesa_app_boundary_request as
with prepared_app as (
  insert into public.mpesa_daraja_apps(company_id,app_name,environment,
    consumer_key_secret_id,consumer_secret_secret_id,status)
  select company_id,'Prepared Boundary App','production',gen_random_uuid(),gen_random_uuid(),'verified'
  from mpesa_fixture returning id,company_id
), other_app as (
  insert into public.mpesa_daraja_apps(company_id,app_name,environment,
    consumer_key_secret_id,consumer_secret_secret_id,status)
  select company_id,'Wrong Boundary App','production',gen_random_uuid(),gen_random_uuid(),'verified'
  from mpesa_fixture returning id
), request as (
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,status,
    prepared_daraja_app_id,safaricom_authorization_verified_at,safaricom_authorization_reference,
    requested_by)
  select prepared_app.company_id,'Boundary Store Ltd','777777','till','boundary-admin',
    'Boundary Owner','0712345678','boundary@example.test',
    array[(select id from public.stock_locations where company_id=prepared_app.company_id and is_default)],
    'merchant_verification',prepared_app.id,now(),'Ticket SAF-456',
    'b2000000-0000-4000-8000-000000000001'
  from prepared_app returning id
)
select request.id request_id,(select id from other_app) other_app_id from request;
grant select on pg_temp.mpesa_app_boundary_request to authenticated;

select testkit.as_user((select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000002','Platform');
select set_config('request.jwt.claims',format(
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated","company_id":"%s","user_role":"Platform","is_platform_admin":true}',
  (select company_id from mpesa_fixture)),true);
select throws_ok($$select public.platform_advance_mpesa_request(
    (select request_id from mpesa_authorization_request),'authorization_verified')$$,
  'P0001','safaricom_authorization_reference_required',
  'Safaricom authorization requires an evidence reference');
select lives_ok($$select public.platform_advance_mpesa_request(
    (select request_id from mpesa_authorization_request),'authorization_verified','Ticket SAF-123')$$,
  'Safaricom authorization can be recorded with evidence');
reset role;
select is((select safaricom_authorization_reference from public.mpesa_onboarding_requests
  where id=(select request_id from mpesa_authorization_request)),'Ticket SAF-123',
  'Safaricom authorization evidence is retained');
select testkit.as_user((select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000002','Platform');
select set_config('request.jwt.claims',format(
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated","company_id":"%s","user_role":"Platform","is_platform_admin":true}',
  (select company_id from mpesa_fixture)),true);
select throws_ok($$select public.platform_configure_mpesa_connection(
    (select request_id from mpesa_app_boundary_request),'Ignored','production',
    '777777','777777','777777',null,null,'PASSKEY',
    (select other_app_id from mpesa_app_boundary_request))$$,
  'P0001','prepared_daraja_app_mismatch',
  'configured Daraja app must match the tenant-authorized app');

reset role;
update public.mpesa_onboarding_requests set status='testing'
where id=(select request_id from mpesa_request);
select testkit.as_user((select company_id from mpesa_fixture),
  'b2000000-0000-4000-8000-000000000002','Platform');
select set_config('request.jwt.claims',format(
  '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated","company_id":"%s","user_role":"Platform","is_platform_admin":true}',
  (select company_id from mpesa_fixture)),true);
select throws_ok(format(
  'select public.platform_update_mpesa_connection(%L,''activate'',null,null,null)',
  (select account_id from mpesa_account)),
  'P0001','mpesa_activation_checks_incomplete','activation requires both KES 1 tests');

reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((public.mpesa_private_connection((select account_id from mpesa_account))->>'callback_base_url'),
  'https://supa.dukarun.com/functions/v1',
  'private M-PESA config uses the platform callback base URL');

update public.mpesa_provider_events set received_at=now()-interval '91 days'
  where provider_event_key='EVT001';
select public.purge_mpesa_raw_payloads();
select is((select payload from public.mpesa_provider_events where provider_event_key='EVT001'),
  null::jsonb,'raw callback body is purged after 90 days');
select is((select payload_sha256 from public.mpesa_provider_events where provider_event_key='EVT001'),
  repeat('b',64),'callback hash survives raw-body cleanup');
select ok(position('collection_allocation_id' in pg_get_functiondef(
  'public.complete_order_core(uuid,jsonb,public.posting_context)'::regprocedure))>0,
  'accounting primitive requires explicit collection evidence');
select ok(position('app.system_company_id' in pg_get_functiondef(
  'public.current_company_id()'::regprocedure))=0
  and position('posting_context' in pg_get_functiondef(
  'public.mpesa_apply_collection_to_intent(uuid,uuid,uuid)'::regprocedure))>0,
  'service settlement uses explicit company context without JWT impersonation');
select ok(to_regclass('public.mpesa_inbound_transactions') is null
  and to_regclass('public.mpesa_webhook_events') is null,
  'staged legacy M-PESA tables are absent');

select * from finish();
rollback;
