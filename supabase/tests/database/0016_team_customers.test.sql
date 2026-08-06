-- Team & customers tests (migration 0016).
begin;
select plan(9);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner@team.local', '254711111111');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'cashier@team.local', '254722222222');

create temp table tm_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Team Co') as company_id;
grant select on pg_temp.tm_company to authenticated;

-- This suite exercises team CRUD, so place its fixture on a tier that allows a team.
update public.companies set subscription_tier_id =
  (select id from public.subscription_tiers where code = 'standard'), subscription_status = 'active'
where id = (select company_id from tm_company);

select testkit.as_user((select company_id from tm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. Admin role has ManageTeam after provisioning.
select ok(
  (select 'ManageTeam' = any(permissions) from public.roles
   where company_id = (select company_id from tm_company) and name = 'Admin'),
  'provisioned Admin role includes ManageTeam'
);

-- 2. The provisioned Cashier role is available (0023: seeded at provision).
create temp table cashier_role as
select id as role_id from public.roles
where company_id = (select company_id from tm_company) and name = 'Cashier';

select ok((select role_id from cashier_role) is not null, 'Cashier role exists from provisioning');

-- 3. Add member by phone (07-normalized).
select public.add_team_member('0722 222 222', (select role_id from cashier_role));

select is(
  (select authorization_status from public.company_memberships
   where company_id = (select company_id from tm_company)
     and user_id = '22222222-2222-2222-2222-222222222222'),
  'approved',
  'add_team_member attaches the user by phone (07-normalized)'
);

-- 4. Token hook would now give them claims (hook is auth-admin-only; call as superuser).
reset role;
select is(
  (public.custom_access_token_hook(
    '{"user_id":"22222222-2222-2222-2222-222222222222","claims":{"sub":"22222222-2222-2222-2222-222222222222"}}'
  ) -> 'claims' ->> 'user_role'),
  'Cashier',
  'added member gets role claims via token hook'
);

select testkit.as_user((select company_id from tm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 5. Adding an unregistered phone fails.
select throws_ok(
  $$select public.add_team_member('0733333333', (select role_id from cashier_role))$$,
  'P0001', 'user_not_registered: 0733333333 must log in once before being added',
  'unregistered phone is rejected with a helpful message'
);

-- 6. Disable a member.
create temp table membership_m as
select id from public.company_memberships
where company_id = (select company_id from tm_company)
  and user_id = '22222222-2222-2222-2222-222222222222';

select public.update_team_member((select id from membership_m), null, 'disabled');

select is(
  (select authorization_status from public.company_memberships where id = (select id from membership_m)),
  'disabled',
  'update_team_member disables a member'
);

-- 7. Disabled member loses claims (hook only reads approved).
reset role;
select ok(
  (public.custom_access_token_hook(
    '{"user_id":"22222222-2222-2222-2222-222222222222","claims":{"sub":"22222222-2222-2222-2222-222222222222"}}'
  ) -> 'claims' -> 'company_id') is null,
  'disabled member gets no tenant claims'
);

-- 8. Cannot remove yourself.
create temp table own_membership as
select id from public.company_memberships
where company_id = (select company_id from tm_company)
  and user_id = '11111111-1111-1111-1111-111111111111';

select throws_ok(
  format($$select public.remove_team_member('%s')$$, (select id from own_membership)),
  'P0001', 'cannot_remove_self',
  'cannot remove your own membership'
);

-- 9. update_customer partial update.
reset role;
insert into public.customers (id, company_id, first_name, phone)
select 'c0000000-0000-0000-0000-0000000000ee', company_id, 'Jane', '0711000000' from tm_company;
select testkit.as_user((select company_id from tm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select public.update_customer('c0000000-0000-0000-0000-0000000000ee', null, 'Mwangi');

select is(
  (select last_name from public.customers where id = 'c0000000-0000-0000-0000-0000000000ee'),
  'Mwangi',
  'update_customer applies partial updates'
);

select * from finish();
rollback;
