begin;
select plan(38);

select testkit.create_user(
  '98000000-0000-4000-8000-000000000001','team-owner@test.local','254713000001'
);
select testkit.create_user(
  '98000000-0000-4000-8000-000000000002','team-invitee@test.local','254713000002'
);
select testkit.create_user(
  '98000000-0000-4000-8000-000000000003','team-second@test.local','254713000003'
);
select testkit.create_user(
  '98000000-0000-4000-8000-000000000004','team-actor@test.local','254713000004'
);

create temp table team_notice_company as
select testkit.provision(
  '98000000-0000-4000-8000-000000000001','Notification Store'
) company_id;
grant select on pg_temp.team_notice_company to authenticated;

update public.companies
set subscription_status = 'active',
    notification_category_preferences = jsonb_build_object('legacy',true)
where id = (select company_id from team_notice_company);
update public.subscription_tiers
set max_team_members = 10, whatsapp_per_period = 100, sms_per_period = 100
where id = (
  select subscription_tier_id from public.companies
  where id = (select company_id from team_notice_company)
);

create temp table team_notice_role as
select id role_id from public.roles
where company_id = (select company_id from team_notice_company) and name = 'Admin';
grant select on pg_temp.team_notice_role to authenticated;

insert into public.company_memberships(company_id,user_id,role_id,authorization_status)
select company_id,'98000000-0000-4000-8000-000000000004',role_id,'approved'
from team_notice_company cross join team_notice_role;
update public.company_staff_profiles
set display_name = 'Supporting Admin'
where company_id = (select company_id from team_notice_company)
  and user_id = '98000000-0000-4000-8000-000000000004';

select is(
  public.primary_contact_notification_preferences(
    (select company_id from team_notice_company)
  ),
  '{"channel":"whatsapp","team":true,"cashierSessions":true}'::jsonb,
  'legacy preferences resolve to backward-compatible primary-contact defaults'
);
select is(
  has_column_privilege(
    'authenticated','public.companies','notification_category_preferences','UPDATE'
  ),
  false,'raw notification preference JSON is not directly writable by clients'
);

select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
create temp table first_invite_result as
select public.invite_team_member(
  '0713 000 002',(select role_id from team_notice_role),'New Administrator'
) result;
grant select on pg_temp.first_invite_result to authenticated;

select is((select result ->> 'status' from first_invite_result),'invited',
  'new non-member receives a pending invitation');
select is((select result ->> 'delivery_status' from first_invite_result),'queued',
  'successful invitation reports queued delivery');

reset role;
create temp table first_invitation as
select id,notification_version from public.team_invitations
where company_id = (select company_id from team_notice_company)
  and phone = '254713000002';
grant select on pg_temp.first_invitation to authenticated;

select is(
  (select count(*)::integer from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation'),
  1,'initial invitation queues one invitee message'
);
select ok(
  (select body like '%{{app_url}}/login%'
      and body like '%Do not register a new company%'
   from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation'),
  'invite message contains the runtime login link and anti-registration guidance'
);
select ok(
  (select scheduled_after <= now() from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation'),
  'transactional team invitation bypasses WhatsApp quiet hours'
);
select is(
  (select fallback_channel from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation'),
  'sms','invitee WhatsApp has an SMS fallback'
);
select is(
  (select count(*)::integer from public.notifications
   where dedupe_key like 'team:invitation:%:primary:v1'),
  0,'primary contact is not redundantly notified about their own invitation action'
);

select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
select is(
  public.invite_team_member(
    '0713000002',(select role_id from team_notice_role),'Updated Administrator'
  ) ->> 'status',
  'updated_invitation','editing an active invitation does not resend it'
);
reset role;
select is(
  (select count(*)::integer from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and fallback_for_outbox_id is null),
  1,'editing preserves a single invitee delivery'
);

select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
select throws_ok(
  format(
    'select public.resend_team_invitation(%L)',
    (select id from first_invitation)
  ),
  'P0001','invitation_resend_too_soon: wait five minutes before resending',
  'resend is rate limited'
);
reset role;
update public.team_invitations set last_notified_at = now() - interval '6 minutes'
where id = (select id from first_invitation);
select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
create temp table resend_result as
select public.resend_team_invitation((select id from first_invitation)) result;
select is((select result ->> 'delivery_status' from resend_result),'queued',
  'explicit resend queues a new delivery');
reset role;
select is(
  (select notification_version from public.team_invitations
   where id = (select id from first_invitation)),
  2,'resend increments the notification version'
);
select is(
  (select count(*)::integer from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and fallback_for_outbox_id is null),
  2,'resend creates exactly one new parent message'
);

create temp table fallback_result as
with parent as (
  update public.outbox set status = 'failed',error = 'provider unavailable'
  where team_invitation_id = (select id from first_invitation)
    and dedupe_key like '%:invitee:v2'
  returning id
)
select public.queue_sms_fallback((select id from parent)) fallback_id;
select ok(
  (select o.fallback_for_outbox_id is not null
     from public.outbox o where o.id = (select fallback_id from fallback_result)),
  'terminal WhatsApp failure creates one linked SMS fallback'
);
select ok(
  (select o.team_invitation_id = (select id from first_invitation)
      and o.dedupe_key like '%:invitee:v2'
   from public.outbox o where o.id = (select fallback_id from fallback_result)),
  'SMS fallback preserves invitation and dedupe metadata'
);
update public.outbox set status = 'sent',sent_at = now()
where id = (select fallback_id from fallback_result);
select is(
  public.team_invitation_delivery_status(
    (select id from first_invitation),2
  ) ->> 'status',
  'sms_fallback_sent','delivery projection reports the successful fallback channel'
);

select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
select is(
  public.set_primary_contact_notification_preferences(
    'whatsapp_sms_fallback',true,false
  ) ->> 'channel',
  'whatsapp_sms_fallback','ManageTeam admin updates primary-contact delivery preferences'
);
select is(
  public.primary_contact_notification_settings() -> 'preferences' ->> 'cashierSessions',
  'false','settings RPC returns the validated cashier preference'
);
reset role;
select is(
  (select notification_category_preferences ->> 'legacy'
   from public.companies where id = (select company_id from team_notice_company)),
  'true','preference update preserves unrelated notification JSON'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000002","role":"authenticated"}',true
);
select is(
  (public.claim_team_invitations() ->> 'claimed_count')::integer,
  1,'verified invitee claims the invitation once'
);
reset role;
select is(
  (select count(*)::integer from public.notifications
   where company_id = (select company_id from team_notice_company)
     and dedupe_key in (
       'team:invitation:' || (select id from first_invitation)::text || ':accepted:member',
       'team:invitation:' || (select id from first_invitation)::text || ':accepted:primary'
     )),
  2,'acceptance creates targeted inbox records for the member and primary contact'
);
select is(
  (select count(*)::integer from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation-accepted-primary'
     and fallback_for_outbox_id is null),
  1,'acceptance queues one external alert for the primary contact'
);
select is(
  (select fallback_channel from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation-accepted-primary'),
  'sms','primary-contact fallback preference is applied to acceptance'
);
select is(
  (select count(*)::integer from public.outbox
   where team_invitation_id = (select id from first_invitation)
     and template_key = 'team-invitation-accepted-member'),
  0,'accepted member receives no redundant external confirmation'
);

update public.subscription_tiers set whatsapp_per_period = 0
where id = (
  select subscription_tier_id from public.companies
  where id = (select company_id from team_notice_company)
);
select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000004','Admin'
);
create temp table quota_invite_result as
select public.invite_team_member(
  '0713000003',(select role_id from team_notice_role),'Quota Safe Invite'
) result;
select is((select result ->> 'delivery_status' from quota_invite_result),'not_queued',
  'quota exhaustion is reported without failing invitation creation');
reset role;
select is(
  (select count(*)::integer from public.team_invitations
   where company_id = (select company_id from team_notice_company)
     and phone = '254713000003' and status = 'pending'),
  1,'quota exhaustion preserves the pending invitation'
);
select is(
  (select count(*)::integer from public.notifications
   where user_id = '98000000-0000-4000-8000-000000000001'
     and dedupe_key like 'team:invitation:%:primary:v1'),
  1,'a different inviter still creates the primary-contact inbox alert'
);
select is(
  (select last_delivery_error from public.team_invitations
   where company_id = (select company_id from team_notice_company)
     and phone = '254713000003'),
  'quota_exhausted','non-queued delivery retains a safe actionable error code'
);

reset role;
create temp table expired_invitation as
select id from public.team_invitations
where company_id = (select company_id from team_notice_company)
  and phone = '254713000003';
grant select on pg_temp.expired_invitation to authenticated;
update public.team_invitations
set status = 'expired',
    expires_at = now() - interval '1 day',
    last_notified_at = now() - interval '8 days'
where company_id = (select company_id from team_notice_company)
  and phone = '254713000003';
select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
select ok(
  public.team_management_snapshot() -> 'invitations' @> jsonb_build_array(
    jsonb_build_object(
      'id',(select id from expired_invitation),
      'status','expired'
    )
  ),
  'expired invitation remains visible for renewal'
);
select is(
  public.resend_team_invitation(
    (select id from expired_invitation)
  ) ->> 'delivery_status',
  'not_queued','expired invitation can be renewed even when delivery remains unavailable'
);
reset role;
select ok(
  (select status = 'pending' and expires_at > now()
   from public.team_invitations
   where company_id = (select company_id from team_notice_company)
     and phone = '254713000003'),
  'renewing an expired invitation restores pending status and expiry'
);

select testkit.as_user(
  (select company_id from team_notice_company),
  '98000000-0000-4000-8000-000000000001','Admin'
);
create temp table preference_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":0},
  {"account_code":"MPESA","declared":0}
]') session_id;
set constraints cashier_session_notifications immediate;
select ok((select session_id is not null from preference_session),
  'cashier operation succeeds with external alerts disabled');
select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id = (select session_id from preference_session)),
  0,'disabled cashier category suppresses external delivery'
);
select is(
  (select count(*)::integer from public.notifications
   where dedupe_key = 'cashier:' || (select session_id from preference_session)::text ||
     ':opened:primary'),
  1,'disabled external category retains the primary-contact inbox record'
);

reset role;
create temp table runtime_sms_quota as
select public.queue_message(
  (select company_id from team_notice_company),'sms','+254713000001',
  repeat('A',140) || '{{app_url}}','Runtime quota check'
) outbox_id;
select is(
  (select quota_units from public.outbox
   where id = (select outbox_id from runtime_sms_quota)),
  1,'placeholder SMS initially reserves its queued segment count'
);
select is(
  public.reconcile_runtime_sms_quota(
    (select outbox_id from runtime_sms_quota),
    repeat('A',140) || 'https://app.dukarun.com'
  ),
  2,'runtime URL expansion reconciles SMS quota to the final segment count'
);

select * from finish();
rollback;
