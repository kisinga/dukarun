-- Tenancy isolation tests for migration 0001.
-- Simulates JWT claims via request.jwt.claims, exactly as auth.jwt() reads them.
begin;
select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures (created as the test superuser, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test.local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test.local', '', now(), now()),
  ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@platform.local', '', now(), now());

insert into public.subscription_tiers (id, code, name, price_monthly, price_yearly)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'test-fixture-tier', 'Test Fixture Tier', 100000, 1000000);

insert into public.companies (id, code, name, subscription_tier_id, subscription_status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TESTCOMPA', 'Company A', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'trial'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TESTCOMPB', 'Company B', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'trial');

insert into public.roles (id, company_id, name, permissions)
values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin', '{ViewFinancials,SettleOrder}'),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Admin', '{ViewFinancials}');

insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'approved'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved');

-- ---------------------------------------------------------------------------
-- As an authenticated member of company A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","user_role":"Admin"}';

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
  (select count(*)::int from public.roles),
  1,
  'member sees only their own company roles'
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
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';

select is(
  (select count(*)::int from public.companies),
  2,
  'platform admin sees all companies'
);

select is(
  (select count(*)::int from public.company_memberships),
  2,
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
