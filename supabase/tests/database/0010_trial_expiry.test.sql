-- 0010_trial_expiry: provisioning sets an enforceable expiry, and the daily
-- scan actually flips a lapsed trial to expired with a grace window.
begin;
select plan(5);

select testkit.create_user('60606060-6060-6060-6060-606060606060', 'trial-expiry@test.local');

create temp table trial_company as
select testkit.provision('60606060-6060-6060-6060-606060606060', 'Trial Co') company_id;
grant select on pg_temp.trial_company to authenticated;

select is(
  (select subscription_status from public.companies where id = (select company_id from trial_company)),
  'trial',
  'new company starts on trial'
);

select is(
  (select t.code from public.companies c
   join public.subscription_tiers t on t.id = c.subscription_tier_id
   where c.id = (select company_id from trial_company)),
  'standard',
  'trial status uses the Standard capability tier'
);

select is(
  (select subscription_expires_at is not null from public.companies where id = (select company_id from trial_company)),
  true,
  'provisioning sets subscription_expires_at (the field the expiry scan enforces)'
);

select is(
  (select subscription_expires_at = trial_ends_at from public.companies where id = (select company_id from trial_company)),
  true,
  'expiry matches trial_ends_at'
);

-- Fast-forward past the trial: the scan flips to expired and sets grace.
update public.companies
set trial_started_at = now() - interval '31 days',
    trial_ends_at = now() - interval '1 day',
    subscription_expires_at = now() - interval '1 day'
where id = (select company_id from trial_company);

select public.subscription_expiry_scan();

select is(
  (select subscription_status from public.companies where id = (select company_id from trial_company)),
  'expired',
  'lapsed trial flips to expired'
);

select * from finish();
rollback;
