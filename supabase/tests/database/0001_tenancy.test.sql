-- Tenancy isolation tests for migration 0001.
-- Simulates JWT claims via request.jwt.claims, exactly as auth.jwt() reads them.
begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the test superuser, which bypasses RLS)
-- ---------------------------------------------------------------------------
select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner-a@test.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'owner-b@test.local');
select testkit.create_user('99999999-9999-9999-9999-999999999999', 'admin@platform.local');

insert into public.subscription_tiers (id, code, name, price_monthly, price_yearly)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'test-fixture-tier', 'Test Fixture Tier', 100000, 1000000);

insert into public.companies (id, code, name, status, subscription_tier_id, subscription_status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTCOMPA', 'Company A', 'approved', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'trial'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTCOMPB', 'Company B', 'approved', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'trial');

select testkit.add_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Admin', '{ViewFinancials,SettleOrder}');
select testkit.add_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Admin', '{ViewFinancials}');

-- ---------------------------------------------------------------------------
-- As an authenticated member of company A
-- ---------------------------------------------------------------------------
select testkit.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Admin');

select is(
  (select count(*)::int from public.companies),
  1,
  'member sees exactly one company'
);

select is(
  (select code from public.companies limit 1),
  'TESTCOMPA',
  'the visible company is their own'
);

select is(
  (select count(*)::int from public.roles where not is_template),
  1,
  'member sees only their own company roles'
);

select is(
  (select count(*)::int from public.roles where is_template),
  4,
  'member also sees the platform role templates'
);

select is(
  (select count(*)::int from public.company_memberships),
  1,
  'member sees only their own company memberships'
);

select throws_ok(
  $$insert into public.companies (code, name) values ('HAX', 'Hax')$$,
  '42501',
  null,
  'member cannot insert a company'
);

-- Update of the invisible company B silently affects zero rows.
update public.companies set name = 'Hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;
select is(
  (select name from public.companies where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'Company B',
  'member cannot update another company (RLS hides the row)'
);

-- ---------------------------------------------------------------------------
-- As a platform admin
-- ---------------------------------------------------------------------------
-- True totals captured as superuser (seed adds a demo company; the assertion
-- is "platform admin sees ALL rows", not a hardcoded count).
create temp table true_counts as
select (select count(*)::int from public.companies) as companies,
       (select count(*)::int from public.company_memberships) as memberships;
grant select on pg_temp.true_counts to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';

select is(
  (select count(*)::int from public.companies),
  (select companies from true_counts),
  'platform admin sees all companies'
);

select is(
  (select count(*)::int from public.company_memberships),
  (select memberships from true_counts),
  'platform admin sees all memberships'
);

-- ---------------------------------------------------------------------------
-- As anonymous (storefront visitor): no tenant data
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.companies),
  0,
  'anon sees no companies'
);

select is(
  (select count(*)::int from public.subscription_tiers where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  1,
  'anon can read subscription tiers (public pricing for registration)'
);

select * from finish();
rollback;
