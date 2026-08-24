begin;
select plan(9);

select testkit.create_user('11500000-0000-4000-8000-000000000001', 'trial-user@test.local');
select testkit.create_user('11500000-0000-4000-8000-000000000099', 'trial-admin@test.local');
insert into public.platform_admins(user_id)
values ('11500000-0000-4000-8000-000000000099')
on conflict do nothing;

create temp table trial_company as
select testkit.provision('11500000-0000-4000-8000-000000000001', 'Trial Request Co') as company_id;
grant select on pg_temp.trial_company to authenticated;

reset role;
update public.companies
set subscription_status = null,
    subscription_expires_at = null,
    subscription_grace_period_end = null,
    subscription_exempt_until = null,
    subscription_exempt_reason = null,
    last_payment_reference = null
where id = (select company_id from trial_company);

select has_table('public', 'trial_access_requests', 'trial request table exists');

select testkit.as_user(
  (select company_id from trial_company),
  '11500000-0000-4000-8000-000000000001',
  'Admin'
);

create temp table trial_request as
select public.request_trial_access(14, 'We need two weeks to test sales and stock control.') as id;
grant select on pg_temp.trial_request to authenticated;

select is(
  (select status from public.trial_access_requests where id = (select id from trial_request)),
  'pending',
  'tenant can submit pending trial request'
);

select is(
  public.current_trial_access_request()->>'status',
  'pending',
  'tenant sees current trial request'
);

select throws_ok(
  $$insert into public.trial_access_requests(company_id, requested_by, requested_days, reason)
    values (
      (select company_id from trial_company),
      '11500000-0000-4000-8000-000000000001',
      7,
      'Direct insert should not be allowed'
    )$$,
  '42501',
  null,
  'tenant cannot bypass request RPC with direct insert'
);

select throws_ok(
  $$select public.request_trial_access(7, 'Duplicate trial request for the same company')$$,
  'P0001',
  'trial_request_already_pending',
  'one pending request per company'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11500000-0000-4000-8000-000000000099","role":"authenticated","is_platform_admin":true}';

select is(
  jsonb_array_length(public.platform_trial_access_requests('pending', 100)),
  1,
  'platform admin sees pending request'
);

select public.platform_review_trial_access_request(
  (select id from trial_request),
  'approved',
  (select id from public.subscription_tiers where code = 'standard'),
  now() + interval '14 days',
  'approved for evaluation'
);

select ok(
  (select subscription_exempt_until > now()
     and subscription_exempt_reason like 'trial_request:%'
   from public.companies where id = (select company_id from trial_company)),
  'approval grants company exemption'
);

select is(
  (select status from public.trial_access_requests where id = (select id from trial_request)),
  'approved',
  'request is marked approved'
);

reset role;
select testkit.as_user(
  (select company_id from trial_company),
  '11500000-0000-4000-8000-000000000001',
  'Admin'
);

select throws_ok(
  $$select public.request_trial_access(7, 'Another request while trial access is active')$$,
  'P0001',
  'trial_access_already_available',
  'active trial exemption blocks another request'
);

select * from finish();
rollback;
