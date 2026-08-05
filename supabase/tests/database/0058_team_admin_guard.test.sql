-- Last-admin guard tests (migration 0008).
begin;
select plan(6);

select testkit.create_user('aaaaaaaa-0008-0008-0008-000000000001', 'owner@guard.local', '254708000001');
select testkit.create_user('aaaaaaaa-0008-0008-0008-000000000002', 'second@guard.local', '254708000002');

create temp table g_company as
select testkit.provision('aaaaaaaa-0008-0008-0008-000000000001', 'Guard Co') as company_id;
grant select on pg_temp.g_company to authenticated;

update public.companies set subscription_tier_id =
  (select id from public.subscription_tiers where code = 'standard'), subscription_status = 'active'
where id = (select company_id from g_company);

select testkit.as_user((select company_id from g_company), 'aaaaaaaa-0008-0008-0008-000000000001', 'Admin');

create temp table g_roles as
select
  (select id from public.roles where company_id = (select company_id from g_company) and name = 'Admin') as admin_role,
  (select id from public.roles where company_id = (select company_id from g_company) and name = 'Cashier') as cashier_role;
grant select on pg_temp.g_roles to authenticated;

create temp table g_own as
select id from public.company_memberships
where company_id = (select company_id from g_company)
  and user_id = 'aaaaaaaa-0008-0008-0008-000000000001';
grant select on pg_temp.g_own to authenticated;

-- 1. Sole admin cannot demote themselves to Cashier.
select throws_ok(
  format($$select public.update_team_member('%s', '%s', null)$$,
    (select id from g_own), (select cashier_role from g_roles)),
  'P0001', 'last_team_admin: keep at least one active member with team management rights',
  'sole team manager cannot change own role to Cashier'
);

-- 2. Sole admin cannot disable themselves.
select throws_ok(
  format($$select public.update_team_member('%s', null, 'disabled')$$, (select id from g_own)),
  'P0001', 'last_team_admin: keep at least one active member with team management rights',
  'sole team manager cannot be disabled'
);

-- 3. Role change that keeps ManageTeam is still allowed (Admin -> Admin is a no-op, use re-approve).
select lives_ok(
  format($$select public.update_team_member('%s', '%s', null)$$,
    (select id from g_own), (select admin_role from g_roles)),
  'team manager can be reassigned a role that keeps ManageTeam'
);

-- 4. With a second team manager present, demotion of the first succeeds.
select testkit.add_member(
  (select company_id from g_company),
  'aaaaaaaa-0008-0008-0008-000000000002',
  'Second Admin',
  array['ManageTeam']
);

select lives_ok(
  format($$select public.update_team_member('%s', '%s', null)$$,
    (select id from g_own), (select cashier_role from g_roles)),
  'demotion allowed once another approved team manager exists'
);

select is(
  (select role_id from public.company_memberships where id = (select id from g_own)),
  (select cashier_role from g_roles),
  'demoted member now holds the Cashier role'
);

-- 5. The remaining sole team manager is protected again.
create temp table g_second as
select id from public.company_memberships
where company_id = (select company_id from g_company)
  and user_id = 'aaaaaaaa-0008-0008-0008-000000000002';
grant select on pg_temp.g_second to authenticated;

select throws_ok(
  format($$select public.update_team_member('%s', '%s', null)$$,
    (select id from g_second), (select cashier_role from g_roles)),
  'P0001', 'last_team_admin: keep at least one active member with team management rights',
  'remaining sole team manager is protected again'
);

select * from finish();
rollback;
