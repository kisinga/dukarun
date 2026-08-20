begin;
select plan(6);

select testkit.create_user(
  'a1080000-0000-4000-8000-000000000001',
  'multi-company-owner@test.local',
  '254714000001'
);
select testkit.create_user(
  'a1080000-0000-4000-8000-000000000002',
  'multi-company-invitee@test.local',
  '254714000002'
);

create temp table existing_company as
select testkit.provision(
  'a1080000-0000-4000-8000-000000000002',
  'Existing Company'
) as company_id;
create temp table inviting_company as
select testkit.provision(
  'a1080000-0000-4000-8000-000000000001',
  'Inviting Company'
) as company_id;
grant select on pg_temp.existing_company,pg_temp.inviting_company to authenticated;

update public.companies
set subscription_tier_id=(select id from public.subscription_tiers where code='standard'),
    subscription_status='active'
where id=(select company_id from inviting_company);

create temp table inviting_role as
select id as role_id from public.roles
where company_id=(select company_id from inviting_company) and name='Admin';
grant select on pg_temp.inviting_role to authenticated;

select testkit.as_user(
  (select company_id from inviting_company),
  'a1080000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  public.invite_team_member(
    '0714 000 002',(select role_id from inviting_role),'Returning Member'
  )->>'status',
  'invited',
  'a user belonging to another company receives an invitation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','a1080000-0000-4000-8000-000000000002',
    'role','authenticated',
    'company_id',(select company_id from existing_company),
    'user_role','Admin'
  )::text,
  true
);

select is(
  (public.claim_team_invitations()->>'claimed_count')::integer,
  1,
  'an existing company member can claim an invitation to another company'
);

select is(
  (select active_company_id from public.user_preferences
   where user_id='a1080000-0000-4000-8000-000000000002'),
  (select company_id from existing_company),
  'claiming preserves an existing valid active company'
);

select is(
  (select count(*)::integer from public.my_companies()),
  2,
  'the company switcher projection contains both companies after the claim'
);

select ok(
  exists(
    select 1 from public.my_companies()
    where company_id=(select company_id from inviting_company)
      and status='approved'
  ),
  'the newly joined company is immediately switchable'
);

select is(
  (public.claim_team_invitations()->>'claimed_count')::integer,
  0,
  'reconciling invitations is idempotent'
);

select * from finish();
rollback;
