-- Provisioning tests (migration 0003).
begin;
select plan(10);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'founder@test.local');

-- Provision as the authenticated founder.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temp table provision_result as
select public.provision_company('<tenant> Stores', 'Kiosk 1') as company_id;

reset role;

select ok(
  (select company_id from provision_result) is not null,
  'provision_company returns a company id'
);

select is(
  (select status from public.companies where id = (select company_id from provision_result)),
  'unapproved',
  'new company starts unapproved'
);

select is(
  (select subscription_status from public.companies where id = (select company_id from provision_result)),
  'trial',
  'new company starts on trial'
);

select is(
  (select count(*)::int from public.ledger_accounts where company_id = (select company_id from provision_result)),
  21,
  'provisioning seeds 21 ledger accounts'
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

-- Second provision attempt by the same user must fail.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$select public.provision_company('Another Shop')$$,
  'P0001',
  'already_provisioned',
  'a user cannot provision a second company'
);

select * from finish();
rollback;
