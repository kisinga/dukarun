begin;
select plan(15);

select testkit.create_user(
  '12121212-1212-1212-1212-121212121212',
  'subscription-reminders@test.local',
  '+254712121212'
);

create temp table subscription_reminder_company as
select testkit.provision(
  '12121212-1212-1212-1212-121212121212',
  'Reminder Co'
) company_id;

update public.companies
set status = 'approved',
    primary_contact_user_id = '12121212-1212-1212-1212-121212121212',
    subscription_status = 'trial',
    trial_ends_at = (
      date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '7 days 12 hours'
    ) at time zone 'Africa/Nairobi',
    subscription_exempt_until = null
where id = (select company_id from subscription_reminder_company);

select is(public.subscription_expiry_scan(), 0, 'a reminder-only scan expires nothing');
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  1,
  'seven-day trial scan creates one inbox reminder'
);
select is(
  (select user_id from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  '12121212-1212-1212-1212-121212121212'::uuid,
  'the reminder targets the primary contact'
);
select is(
  (select link from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  '/billing',
  'the reminder links to Billing'
);

select public.subscription_expiry_scan();
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  1,
  'repeated scans do not duplicate a reminder stage'
);

update public.companies
set trial_ends_at = (
  date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '7 days 13 hours'
) at time zone 'Africa/Nairobi'
where id = (select company_id from subscription_reminder_company);
select public.subscription_expiry_scan();
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  2,
  'a changed expiry starts a fresh reminder sequence'
);

update public.companies
set subscription_status = 'active',
    subscription_expires_at = (
      date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '1 day 12 hours'
    ) at time zone 'Africa/Nairobi',
    primary_contact_user_id = '12121212-1212-1212-1212-121212121212'
where id = (select company_id from subscription_reminder_company);
select public.subscription_expiry_scan();
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and title = 'Subscription expires tomorrow'),
  1,
  'one-day paid subscription reminder is created'
);

update public.companies
set subscription_status = 'trial',
    trial_ends_at = (
      date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '1 day 13 hours'
    ) at time zone 'Africa/Nairobi',
    primary_contact_user_id = null
where id = (select company_id from subscription_reminder_company);
select public.subscription_expiry_scan();
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and title = 'Trial ends tomorrow'
     and user_id is null),
  1,
  'missing primary contact creates a company-wide reminder'
);

update public.companies
set trial_ends_at = (
      date_trunc('day', now() at time zone 'Africa/Nairobi') + interval '7 days 14 hours'
    ) at time zone 'Africa/Nairobi',
    subscription_exempt_until = now() + interval '1 day'
where id = (select company_id from subscription_reminder_company);
select public.subscription_expiry_scan();
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from subscription_reminder_company)
     and type = 'subscription'),
  4,
  'active exemptions suppress reminders'
);

update public.companies
set subscription_status = 'trial',
    trial_started_at = now() - interval '2 seconds',
    trial_ends_at = now() - interval '1 second',
    subscription_exempt_until = null,
    subscription_grace_period_end = null
where id = (select company_id from subscription_reminder_company);
select is(public.subscription_expiry_scan(), 1, 'an elapsed trial is expired');
select is(
  (select subscription_status from public.companies
   where id = (select company_id from subscription_reminder_company)),
  'expired',
  'trial expiry remains immediate'
);
select is(
  (select subscription_grace_period_end from public.companies
   where id = (select company_id from subscription_reminder_company)),
  null,
  'trial expiry still has no grace period'
);

update public.companies
set subscription_status = 'active',
    subscription_expires_at = now() - interval '1 second',
    subscription_grace_period_end = null
where id = (select company_id from subscription_reminder_company);
select is(public.subscription_expiry_scan(), 1, 'an elapsed paid subscription is expired');
select is(
  (select subscription_status from public.companies
   where id = (select company_id from subscription_reminder_company)),
  'expired',
  'paid expiry still changes the subscription state'
);
select is(
  (select subscription_grace_period_end = subscription_expires_at + interval '3 days'
   from public.companies
   where id = (select company_id from subscription_reminder_company)),
  true,
  'paid expiry retains the three-day grace period'
);

select * from finish();
rollback;
