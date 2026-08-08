begin;
select plan(19);

select is(
  (select count(*)::integer from public.platform_billing_settings where singleton),
  1,
  'billing settings has exactly one singleton row'
);

insert into public.subscription_tiers (
  code, name, price_monthly, price_yearly,
  multiple_locations_enabled, staff_performance_enabled, commissions_available,
  max_team_members, max_products, max_stock_locations, max_orders_per_month, sms_per_period
)
values ('trial-plus', 'Trial Plus', 2500, 25000, true, true, true, 10, 10000, 5, 20000, 1000);

select testkit.create_user('69696969-6969-6969-6969-696969696969', 'trial-config@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"69696969-6969-6969-6969-696969696969","role":"authenticated"}';

create temp table configured_trial_company as
select public.provision_company(
  'Configured Trial Co', 'Main', 'KES', null, null, 'trial-plus'
) company_id;

reset role;

select is(
  (select subscription_status from public.companies where id = (select company_id from configured_trial_company)),
  null,
  'pending company is not counted as an active trial'
);

select is(
  (select status from public.companies where id = (select company_id from configured_trial_company)),
  'unapproved',
  'new company still requires platform approval'
);

select is(
  (select trial_started_at from public.companies where id = (select company_id from configured_trial_company)),
  null,
  'trial does not start during approval wait'
);

select is(
  (select trial_ends_at from public.companies where id = (select company_id from configured_trial_company)),
  null,
  'pending company has no running trial deadline'
);

select is(
  (select t.code from public.companies c join public.subscription_tiers t on t.id = c.subscription_tier_id
   where c.id = (select company_id from configured_trial_company)),
  'trial-plus',
  'requested active tier is snapshotted onto the company'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"69696969-6969-6969-6969-696969696969","role":"authenticated","is_platform_admin":true}';

select lives_ok(
  $$select public.platform_update_billing_config(
    14,
    (select id from public.subscription_tiers where code = 'standard')
  )$$,
  'platform admin can configure future trial duration and default tier'
);

reset role;

insert into public.subscription_tiers (
  code, name, price_monthly, price_yearly,
  multiple_locations_enabled, staff_performance_enabled, commissions_available
)
values ('inactive-trial', 'Inactive Trial', 500, 5000, false, false, false);
update public.subscription_tiers set is_active = false where code = 'inactive-trial';

set local role authenticated;
set local request.jwt.claims = '{"sub":"69696969-6969-6969-6969-696969696969","role":"authenticated","is_platform_admin":true}';

select throws_ok(
  $$select public.platform_update_billing_config(
    14,
    (select id from public.subscription_tiers where code = 'inactive-trial')
  )$$,
  'P0001',
  'default_trial_tier_not_active',
  'inactive tier cannot become the default trial tier'
);

reset role;

select throws_ok(
  $$update public.subscription_tiers set is_active = false where code = 'standard'$$,
  'P0001',
  'cannot_deactivate_default_trial_tier',
  'configured default trial tier cannot be deactivated'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"69696969-6969-6969-6969-696969696969","role":"authenticated","is_platform_admin":true}';

select lives_ok(
  format('select public.platform_set_company_status(%L, %L)',
    (select company_id from configured_trial_company), 'approved'),
  'platform approval starts the pending trial'
);

reset role;
select testkit.create_user('68686868-6868-6868-6868-686868686868', 'default-trial@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"68686868-6868-6868-6868-686868686868","role":"authenticated"}';

create temp table default_trial_company as
select public.provision_company('Default Trial Co') company_id;

reset role;

select is(
  (select t.code from public.companies c join public.subscription_tiers t on t.id = c.subscription_tier_id
   where c.id = (select company_id from default_trial_company)),
  'standard',
  'registration without a requested tier uses the active configured default'
);

select ok(
  (select trial_started_at between now() - interval '2 seconds' and now()
   from public.companies where id = (select company_id from configured_trial_company)),
  'approval records the trial start instant'
);

select ok(
  (select trial_ends_at between now() + interval '13 days 23 hours 59 minutes'
                            and now() + interval '14 days 1 minute'
   from public.companies where id = (select company_id from configured_trial_company)),
  'approval applies the configured duration'
);

select is(
  (select subscription_expires_at = trial_ends_at
   from public.companies where id = (select company_id from configured_trial_company)),
  true,
  'subscription expiry matches the snapshotted trial deadline'
);

-- Changing global policy does not move a trial that has already started.
update public.platform_billing_settings set trial_duration_days = 45 where singleton;

select ok(
  (select trial_ends_at < now() + interval '15 days'
   from public.companies where id = (select company_id from configured_trial_company)),
  'later configuration changes do not alter an existing trial'
);

update public.companies
set trial_started_at = now() - interval '31 days',
    trial_ends_at = now() - interval '1 second',
    subscription_expires_at = now() - interval '1 second'
where id = (select company_id from configured_trial_company);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  testkit.claims(
    (select company_id from configured_trial_company),
    '69696969-6969-6969-6969-696969696969',
    'Admin'
  ),
  true
);

select throws_ok(
  format('select public.assert_entitled(%L, null)',
    (select company_id from configured_trial_company)),
  'P0001',
  'subscription_expired: trial ended; subscribe to continue',
  'trial access is denied immediately at its deadline without waiting for cron'
);

reset role;
select public.subscription_expiry_scan();

select is(
  (select subscription_grace_period_end from public.companies
   where id = (select company_id from configured_trial_company)),
  null,
  'expired trials receive no paid-subscription grace period'
);

-- A missing singleton used to make the platform settings save update zero
-- rows, leaving public_billing_config() null indefinitely.
delete from public.platform_billing_settings where singleton;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69696969-6969-6969-6969-696969696969","role":"authenticated","is_platform_admin":true}';

select lives_ok(
  $$select public.platform_update_billing_config(
    21,
    (select id from public.subscription_tiers where code = 'standard')
  )$$,
  'saving trial policy recreates a missing billing settings singleton'
);

reset role;

select is(
  (public.public_billing_config() ->> 'trialDays')::integer,
  21,
  'recreated billing settings are publicly readable'
);

select * from finish();
rollback;
