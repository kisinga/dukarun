-- Provisioning tests (migration 0003).
begin;
select plan(15);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'founder@test.local');

-- Exercise the internal provisioning primitive. Public registration uses the
-- Terms-aware wrapper and authenticated access to this primitive is revoked.
set local role service_role;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temp table provision_result as
select public.provision_company(
  'Mama Mboga Stores', 'Kiosk 1', 'KES',
  'info@mamamboga.co.ke', 'Kiosk 1, Tom Mboya Street, Nairobi'
) as company_id;
grant select on pg_temp.provision_result to authenticated;

reset role;

select ok(
  (select company_id from provision_result) is not null,
  'provision_company returns a company id'
);

select is(
  (select email from public.companies where id = (select company_id from provision_result)),
  'info@mamamboga.co.ke',
  'provisioning stores the company email (0019)'
);

select is(
  (select address from public.companies where id = (select company_id from provision_result)),
  'Kiosk 1, Tom Mboya Street, Nairobi',
  'provisioning stores the company address (0019)'
);

select is(
  (select status from public.companies where id = (select company_id from provision_result)),
  'unapproved',
  'new company starts unapproved'
);

select is(
  (select subscription_status from public.companies where id = (select company_id from provision_result)),
  null,
  'new company has no access before its initial purchase'
);

select is(
  (select count(*)::int from public.ledger_accounts where company_id = (select company_id from provision_result)),
  24,
  'provisioning seeds 24 ledger accounts'
);

select is(
  (select count(*)::int from public.ledger_accounts a
   join public.ledger_accounts p on a.parent_id = p.id
   where a.company_id = (select company_id from provision_result) and p.code = 'CASH'),
  3,
  'CASH parent has 3 sub-accounts (CASH_ON_HAND, BANK_MAIN, MPESA)'
);

select is(
  (select count(*)::int from public.payment_methods where company_id = (select company_id from provision_result)),
  4,
  'provisioning seeds 4 payment methods (cash, mpesa, bank, credit)'
);

select is(
  (select ledger_account_code from public.payment_methods
   where company_id = (select company_id from provision_result) and code = 'mpesa'),
  'MPESA',
  'mpesa payment method maps to MPESA'
);

select is(
  (select count(*)::int from public.roles
   where company_id = (select company_id from provision_result) and name = 'Admin'),
  1,
  'provisioning creates the Admin role'
);

select is(
  (select authorization_status from public.company_memberships
   where company_id = (select company_id from provision_result)
     and user_id = '11111111-1111-1111-1111-111111111111'),
  'approved',
  'founder membership is approved'
);

-- Second provision by the same user now succeeds (multi-company, 0018) and
-- becomes the active company via user_preferences.
set local role service_role;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temp table provision_result_2 as
select public.provision_company('Another Shop') as company_id;
grant select on pg_temp.provision_result_2 to authenticated;

reset role;

select isnt(
  (select company_id from provision_result_2),
  (select company_id from provision_result),
  'a user can provision a second company'
);

select is(
  (select active_company_id from public.user_preferences
   where user_id = '11111111-1111-1111-1111-111111111111'),
  (select company_id from provision_result_2),
  'newly provisioned company becomes the active company'
);

-- Platform approval is required before either membership can become a live
-- tenant context. Provisioning itself intentionally leaves both pending.
update public.companies set status = 'approved'
where id in ((select company_id from provision_result), (select company_id from provision_result_2));

-- Switching back as the authenticated user: company_memberships RLS only
-- exposes the active company, so this exercises is_approved_member (0018).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

update public.user_preferences
set active_company_id = (select company_id from provision_result)
where user_id = '11111111-1111-1111-1111-111111111111';

reset role;

select is(
  (select active_company_id from public.user_preferences
   where user_id = '11111111-1111-1111-1111-111111111111'),
  (select company_id from provision_result),
  'user can switch their active company to another approved membership'
);

-- Activating a company the user does NOT belong to is rejected by RLS.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$update public.user_preferences
    set active_company_id = '00000000-0000-0000-0000-000000000000'
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'activating a non-member company is rejected'
);

reset role;

select * from finish();
rollback;
