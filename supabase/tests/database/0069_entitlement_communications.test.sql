begin;
select plan(52);

select is(
  public.next_monthly_anniversary('2026-01-31 10:00:00+03','2026-02-01 00:00:00+03'),
  '2026-02-28 10:00:00+03'::timestamptz,
  'communication periods retain the subscription anniversary and clamp short months'
);

select is(
  (select storefront_available from public.subscription_tiers where code='standard'),
  true,
  'standard includes storefront access'
);
select is(
  (select customer_campaigns_available from public.subscription_tiers where code='standard'),
  true,
  'standard includes customer campaigns'
);
select is(
  (select payment_reminders_available from public.subscription_tiers where code='standard'),
  true,
  'standard includes payment reminders'
);
select is(
  (select whatsapp_per_period=sms_per_period from public.subscription_tiers where code='standard'),
  true,
  'standard WhatsApp quota matches its SMS quota'
);

select is(public.sms_segment_count(repeat('a',160)),1,'160 GSM-7 characters use one segment');
select is(public.sms_segment_count(repeat('a',161)),2,'161 GSM-7 characters use two segments');
select is(public.sms_segment_count(repeat('界',70)),1,'70 Unicode characters use one segment');
select is(public.sms_segment_count(repeat('界',71)),2,'71 Unicode characters use two segments');
select is(
  public.render_message_template('Hello {{customer_first_name}}',jsonb_build_object('customer_first_name','Amina')),
  'Hello Amina',
  'strict template renderer substitutes known values'
);
select throws_ok(
  $$select public.render_message_template('Hello {{unknown}}','{}'::jsonb)$$,
  'P0001',
  'missing_template_variable: unknown',
  'missing template variables block rendering'
);

select testkit.create_user(
  '69696969-6969-4696-9696-696969696961',
  'communications@test.local',
  '+254700000061'
);
create temp table communications_fixture as
select testkit.provision(
  '69696969-6969-4696-9696-696969696961',
  'Communications Test Store'
) company_id;
grant select on pg_temp.communications_fixture to authenticated;

select is(
  (select count(*)::int from public.payment_reminder_rules
   where company_id=(select company_id from communications_fixture)),
  4,
  'new companies receive the four fixed reminder stages'
);
select ok(
  (select 'ManageCommunications'=any(r.permissions)
   from public.company_memberships m join public.roles r on r.id=m.role_id
   where m.company_id=(select company_id from communications_fixture)
     and m.user_id='69696969-6969-4696-9696-696969696961'),
  'provisioned admin can manage communications'
);

insert into public.customers(
  id,company_id,first_name,phone,is_credit_approved,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled
)
select '69696969-6969-4696-9696-696969696962',company_id,'Amina','+254700000062',true,true,true,true
from communications_fixture;
insert into public.customers(
  id,company_id,first_name,phone,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled
)
select '69696969-6969-4696-9696-696969696963',company_id,'Opted Out','+254700000063',false,true,true
from communications_fixture;

select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);

select is(
  (public.campaign_preview('sms','Hello {{customer_first_name}}','all')->>'eligible')::int,
  1,
  'campaign preview applies master and channel consent'
);

create temp table communications_campaign as
select public.create_message_campaign(
  'Consent snapshot','sms','Hello {{customer_first_name}} from {{store_name}}','all'
) campaign_id;
select is(
  (public.send_message_campaign((select campaign_id from communications_campaign))->>'queued')::int,
  1,
  'campaign queues only eligible recipients'
);
select is(
  (select rendered_body from public.campaign_recipients
   where campaign_id=(select campaign_id from communications_campaign) and customer_id='69696969-6969-4696-9696-696969696962'),
  'Hello Amina from Communications Test Store',
  'campaign stores the final personalized body'
);
select is(
  (select skip_reason from public.campaign_recipients
   where campaign_id=(select campaign_id from communications_campaign) and customer_id='69696969-6969-4696-9696-696969696963'),
  'opted_out',
  'campaign snapshot records suppression reasons'
);
select is(
  (select quota_state from public.outbox where campaign_id=(select campaign_id from communications_campaign)),
  'reserved',
  'queued tenant delivery reserves quota'
);

reset role;
select public.finalize_message_quota(
  (select id from public.outbox where campaign_id=(select campaign_id from communications_campaign)),
  true
);
select is(
  (select quota_state from public.outbox where campaign_id=(select campaign_id from communications_campaign)),
  'used',
  'provider acceptance converts reserved quota to used'
);
select public.finalize_message_quota(
  (select id from public.outbox where campaign_id=(select campaign_id from communications_campaign)),
  true
);
select is(
  (select sms_used_this_period from public.companies where id=(select company_id from communications_fixture)),
  1,
  'quota finalization is idempotent'
);

insert into public.subscription_tiers(
  id,code,name,price_monthly,price_yearly,multiple_locations_enabled,
  staff_performance_enabled,commissions_available,storefront_available
) values(
  '69696969-6969-4696-9696-696969696964','communications-lite','Communications Lite',0,0,
  false,false,false,false
);
update public.companies set public_storefront_enabled=true,
  subscription_tier_id='69696969-6969-4696-9696-696969696964'
where id=(select company_id from communications_fixture);
select ok(
  (select storefront_entitlement_grace_end between now()+interval '6 days 23 hours' and now()+interval '7 days 1 hour'
   from public.companies where id=(select company_id from communications_fixture)),
  'storefront downgrade starts seven-day entitlement grace'
);
select ok(
  (select public.storefront_catalogue_visible(c) from public.companies c
   where id=(select company_id from communications_fixture)),
  'catalogue remains visible during downgrade grace'
);
update public.companies set storefront_entitlement_grace_end=now()-interval '1 second'
where id=(select company_id from communications_fixture);
select is(
  (select public.storefront_catalogue_visible(c) from public.companies c
   where id=(select company_id from communications_fixture)),
  false,
  'catalogue becomes contact-only after grace'
);

update public.companies set subscription_tier_id=(select id from public.subscription_tiers where code='standard')
where id=(select company_id from communications_fixture);
select is(
  (select storefront_entitlement_grace_end is null from public.companies
   where id=(select company_id from communications_fixture)),
  true,
  'restoring entitlement clears storefront grace'
);

create temp table statement_fixture as
select public.issue_customer_statement_link(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696962'
) token;
grant select on pg_temp.statement_fixture to anon;
set local role anon;
select is(
  (public.public_customer_statement((select token from statement_fixture))->>'customer_first_name'),
  'Amina',
  'anonymous statement resolves a valid opaque token'
);
select is(
  public.public_customer_statement('not-a-valid-token'),
  null,
  'invalid statement token reveals nothing'
);

reset role;
select ok(
  position('OPENWA_BASE_URL' in pg_get_functiondef('public.send_sms_hook(jsonb)'::regprocedure))>0
  and position('TEXTSMS_API_KEY' in pg_get_functiondef('public.send_sms_hook(jsonb)'::regprocedure))>0,
  'OTP hook submits through both SMS and WhatsApp provider boundaries'
);

select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
reset role;
update public.companies set subscription_status='expired',subscription_grace_period_end=null,
  subscription_exempt_until=null where id=(select company_id from communications_fixture);
select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select throws_ok(
  $$select public.campaign_preview('sms','Hello {{customer_first_name}}','all')$$,
  'P0001','subscription_expired: renew to continue selling',
  'expired tenants cannot preview campaigns'
);
reset role;
update public.companies set subscription_grace_period_end=now()+interval '1 day'
where id=(select company_id from communications_fixture);
select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select is(
  (public.campaign_preview('sms','Hello {{customer_first_name}}','all')->>'eligible')::int,
  1,
  'paid subscription grace preserves campaign access'
);
reset role;
update public.companies set subscription_grace_period_end=null
where id=(select company_id from communications_fixture);
select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select throws_ok(
  $$select public.update_communication_settings(true,'whatsapp',true,'Pay by M-Pesa',null)$$,
  'P0001','subscription_expired: renew to continue selling',
  'expired tenants cannot enable payment reminders'
);

reset role;
update public.companies set subscription_status='active',subscription_grace_period_end=null,
  payment_reminders_enabled=true,payment_reminder_channel='whatsapp',payment_reminder_sms_fallback=true
where id=(select company_id from communications_fixture);
insert into public.orders(id,company_id,code,customer_id,status,total,is_credit_sale,credit_due_at)
select '69696969-6969-4696-9696-696969696965',company_id,'COMM-FUTURE',
  '69696969-6969-4696-9696-696969696962','completed',10000,true,
  (now() at time zone 'Africa/Nairobi')::date+1 from communications_fixture;
select public.credit_reminder_scan();
select is(
  (select count(*)::int from public.outbox where source='reminder'
    and company_id=(select company_id from communications_fixture)),
  0,
  'future debts never enter the due-today reminder stage'
);
update public.orders set credit_due_at=(now() at time zone 'Africa/Nairobi')::date
where id='69696969-6969-4696-9696-696969696965';
select public.credit_reminder_scan();
select is(
  (select count(*)::int from public.outbox where source='reminder'
    and company_id=(select company_id from communications_fixture)),
  0,
  'missing storefront origin fails closed without queueing a reminder'
);
select is(
  (select count(*)::int from public.notifications where company_id=(select company_id from communications_fixture)
    and title='Payment reminders are not configured'),
  1,
  'missing storefront origin notifies the chosen store admin'
);
select vault.create_secret('https://storefront.test','STOREFRONT_PUBLIC_URL');
select public.credit_reminder_scan();
select is(
  (select count(*)::int from public.outbox where source='reminder'
    and company_id=(select company_id from communications_fixture)),
  1,
  'configured due-today reminder queues normally'
);
select ok(
  (select fallback_body is not null and fallback_body<>body from public.outbox
    where source='reminder' and company_id=(select company_id from communications_fixture)),
  'WhatsApp reminders persist the separately rendered SMS fallback'
);
create temp table reminder_fallback as
select public.queue_sms_fallback(id) first_id, id source_id from public.outbox
where source='reminder' and company_id=(select company_id from communications_fixture);
grant select on pg_temp.reminder_fallback to authenticated;
select is(
  public.queue_sms_fallback((select source_id from reminder_fallback)),
  (select first_id from reminder_fallback),
  'repeated fallback creation returns the existing delivery'
);
select is(
  (select count(*)::int from public.outbox where fallback_for_outbox_id=(select source_id from reminder_fallback)),
  1,
  'a failed WhatsApp delivery can create only one SMS fallback'
);

select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select public.update_customer_communication_preferences(
  '69696969-6969-4696-9696-696969696962',true,true,false
);
select is(
  (select status from public.outbox where id=(select source_id from reminder_fallback)),
  'cancelled',
  'WhatsApp opt-out cancels the matching pending delivery'
);
reset role;
select ok(
  (select count(*)>0 from public.customer_statement_links where customer_id='69696969-6969-4696-9696-696969696962'
    and revoked_at is null),
  'channel-specific opt-out keeps statement links available'
);
update public.outbox set attempts=1 where id=(select first_id from reminder_fallback);
select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select public.update_customer_communication_preferences(
  '69696969-6969-4696-9696-696969696962',false,false,false
);
reset role;
select is(
  (select quota_state from public.outbox where id=(select first_id from reminder_fallback)),
  'used',
  'attempted delivery cancellation consumes reserved quota as uncertain'
);
select is(
  (select count(*)::int from public.customer_statement_links where customer_id='69696969-6969-4696-9696-696969696962'
    and revoked_at is null),
  0,
  'master opt-out revokes active statement links'
);

select ok(
  has_function_privilege('supabase_auth_admin',
    'public.record_auth_otp_delivery_request(text,text,bigint,bigint,text,text)','EXECUTE'),
  'auth admin can execute the narrow OTP metadata recorder'
);
select is(
  has_table_privilege('supabase_auth_admin','public.auth_otp_delivery_requests','INSERT'),
  false,
  'auth admin has no direct OTP metadata table access'
);
select ok(
  position('record_auth_otp_delivery_request' in
    pg_get_functiondef('public.send_sms_hook(jsonb)'::regprocedure))>0,
  'OTP hook records transport metadata through the auth-admin-only recorder'
);

update public.customers set notifications_enabled=true,sms_notifications_enabled=true,
  whatsapp_notifications_enabled=true where id='69696969-6969-4696-9696-696969696962';
insert into public.customers(id,company_id,first_name,phone,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled)
select '69696969-6969-4696-9696-696969696966',company_id,repeat('a',155),'+254700000066',true,true,true
from communications_fixture;
select testkit.as_user(
  (select company_id from communications_fixture),
  '69696969-6969-4696-9696-696969696961',
  'Admin'
);
select is(
  (public.campaign_preview('sms','{{customer_first_name}}123456','all')->>'units')::int,
  3,
  'SMS preview sums authoritative segments for every personalized recipient'
);
create temp table personalized_campaign as
select public.create_message_campaign('Personalized units','sms','{{customer_first_name}}123456','all') campaign_id;
select public.send_message_campaign((select campaign_id from personalized_campaign));
select is(
  (select sum(quota_units)::int from public.outbox where campaign_id=(select campaign_id from personalized_campaign)),
  3,
  'queued campaign quota exactly matches personalized preview units'
);
select throws_ok(
  format($$select public.set_campaign_status('%s','resume')$$,(select campaign_id from personalized_campaign)),
  'P0001','invalid_campaign_transition: queued -> queued',
  'campaign resume is allowed only from paused state'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';
select public.platform_save_tier(
  'communications-lite','Communications Lite',0,0,false,false,false,true,false,false,
  null,null,null,null,null,null,'69696969-6969-4696-9696-696969696964',true
);
reset role;
update public.companies set public_storefront_enabled=true,
  subscription_tier_id='69696969-6969-4696-9696-696969696964'
where id=(select company_id from communications_fixture);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';
select public.platform_save_tier(
  'communications-lite','Communications Lite',0,0,false,false,false,false,false,false,
  null,null,null,null,null,null,'69696969-6969-4696-9696-696969696964',true
);
reset role;
select ok(
  (select storefront_entitlement_grace_end>now() from public.companies
    where id=(select company_id from communications_fixture)),
  'atomic tier edit starts storefront grace when access is removed'
);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';
select public.platform_save_tier(
  'communications-lite','Communications Lite',0,0,false,false,false,true,false,false,
  null,null,null,null,null,null,'69696969-6969-4696-9696-696969696964',true
);
reset role;
select is(
  (select storefront_entitlement_grace_end is null from public.companies
    where id=(select company_id from communications_fixture)),
  true,
  'restoring storefront access through atomic tier edit clears grace'
);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';
select throws_ok(
  $$select public.platform_save_tier(
    'communications-lite','Should Roll Back',0,0,false,false,false,true,false,false,
    null,null,null,null,null,-1,'69696969-6969-4696-9696-696969696964',true)$$,
  '23514','new row for relation "subscription_tiers" violates check constraint "subscription_tiers_whatsapp_per_period_check"',
  'atomic tier save rejects an invalid communication quota'
);
reset role;
select is(
  (select name from public.subscription_tiers where id='69696969-6969-4696-9696-696969696964'),
  'Communications Lite',
  'failed atomic tier save leaves base tier fields unchanged'
);
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';
select public.platform_send_campaign('Admin only','in_app','Notice','Hello {{merchant_name}}','selected',
  null,null,array[(select company_id from communications_fixture)]);
reset role;
select is(
  (select user_id from public.notifications where company_id=(select company_id from communications_fixture)
    and title='Notice' order by created_at desc limit 1),
  '69696969-6969-4696-9696-696969696961'::uuid,
  'platform in-app campaign targets only the resolved merchant admin'
);

select * from finish();
rollback;
