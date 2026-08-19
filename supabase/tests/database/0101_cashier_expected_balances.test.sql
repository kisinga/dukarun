begin;
select plan(7);

select testkit.create_user(
  'a1080000-0000-4000-8000-000000000001',
  'cashier-balances-admin@test.local'
);
select testkit.create_user(
  'a1080000-0000-4000-8000-000000000002',
  'cashier-balances-cashier@test.local'
);
select testkit.create_user(
  'a1080000-0000-4000-8000-000000000003',
  'cashier-balances-staff@test.local'
);

create temp table cashier_balance_fixture as
select testkit.provision(
  'a1080000-0000-4000-8000-000000000001',
  'Cashier Balance Store'
) as company_id;
grant select on pg_temp.cashier_balance_fixture to authenticated;

select testkit.add_member(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000002',
  'Settlement cashier',
  '{SettleOrder}'
);
select testkit.add_member(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000003',
  'Restricted staff',
  array[]::text[]
);

insert into public.stock_locations(id, company_id, name, code, is_default)
select 'a1080000-0000-4000-8000-000000000004', company_id, 'Admin Branch', 'ADMIN', false
from cashier_balance_fixture;

delete from public.company_membership_locations ml
using public.company_memberships m
where ml.membership_id = m.id
  and ml.location_id = 'a1080000-0000-4000-8000-000000000004'
  and m.user_id in (
    'a1080000-0000-4000-8000-000000000002',
    'a1080000-0000-4000-8000-000000000003'
  );

select testkit.as_user(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000001',
  'Admin'
);

create temp table cashier_balance_locations as
select id as main_id
from public.stock_locations
where company_id = (select company_id from cashier_balance_fixture)
  and is_default;
grant select on pg_temp.cashier_balance_locations to authenticated;

create temp table cashier_balance_session as
select public.open_cashier_session_at_location(
  (select main_id from cashier_balance_locations),
  '[{"account_code":"CASH_ON_HAND","declared":700},{"account_code":"MPESA","declared":300}]'
) as session_id;

select public.close_cashier_session_at_location(
  (select main_id from cashier_balance_locations),
  (select session_id from cashier_balance_session),
  '[{"account_code":"CASH_ON_HAND","declared":700},{"account_code":"MPESA","declared":300}]'
);

select testkit.as_user(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000002',
  'Settlement cashier'
);

select is(
  (select count(*)::integer
   from public.cashier_expected_balances((select main_id from cashier_balance_locations))),
  2,
  'cashier sees only the two controlled till accounts'
);

select results_eq(
  $$select account_code::text
    from public.cashier_expected_balances((select main_id from cashier_balance_locations))$$,
  $$values ('CASH_ON_HAND'), ('MPESA')$$,
  'cashier balance read excludes non-controlled bank accounts'
);

select is(
  (select expected_balance
   from public.cashier_expected_balances((select main_id from cashier_balance_locations))
   where account_code = 'CASH_ON_HAND'),
  700::bigint,
  'cash expectation uses the location cash balance'
);

select is(
  (select expected_balance
   from public.cashier_expected_balances((select main_id from cashier_balance_locations))
   where account_code = 'MPESA'),
  300::bigint,
  'mobile-money expectation uses the location balance'
);

select throws_ok(
  $$select * from public.cashier_expected_balances(
    'a1080000-0000-4000-8000-000000000004'
  )$$,
  'P0001',
  'location_access_denied',
  'cashier cannot inspect an inaccessible location'
);

select testkit.as_user(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000003',
  'Restricted staff'
);

select throws_ok(
  $$select * from public.cashier_expected_balances(
    (select main_id from cashier_balance_locations)
  )$$,
  'P0001',
  'permission_denied: SettleOrder required',
  'staff without settlement permission cannot read till expectations'
);

select testkit.as_user(
  (select company_id from cashier_balance_fixture),
  'a1080000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  (select count(*)::integer
   from public.cashier_expected_balances((select main_id from cashier_balance_locations))),
  2,
  'admin settlement access uses the same narrow read model'
);

select * from finish();
rollback;
