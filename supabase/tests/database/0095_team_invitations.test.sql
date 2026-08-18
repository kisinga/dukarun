begin;
select plan(15);

select testkit.create_user(
  '95000000-0000-4000-8000-000000000001',
  'invite-owner@test.local',
  '254712000001'
);
select testkit.create_user(
  '95000000-0000-4000-8000-000000000002',
  'existing-invitee@test.local',
  '254712000002'
);
select testkit.create_user(
  '95000000-0000-4000-8000-000000000003',
  'disabled-member@test.local',
  '254712000003'
);

create temp table invite_company as
select testkit.provision(
  '95000000-0000-4000-8000-000000000001',
  'Invitation Co'
) as company_id;
grant select on pg_temp.invite_company to authenticated;

update public.companies
set subscription_tier_id = (select id from public.subscription_tiers where code = 'standard'),
    subscription_status = 'active'
where id = (select company_id from invite_company);
update public.subscription_tiers set max_team_members = 2 where code = 'standard';

create temp table invite_role as
select id as role_id from public.roles
where company_id = (select company_id from invite_company) and name = 'Admin';
grant select on pg_temp.invite_role to authenticated;

insert into public.company_memberships(company_id, user_id, role_id, authorization_status)
values(
  (select company_id from invite_company),
  '95000000-0000-4000-8000-000000000003',
  (select role_id from invite_role),
  'disabled'
);

select testkit.as_user(
  (select company_id from invite_company),
  '95000000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  public.invite_team_member(
    '0712 000 002',
    (select role_id from invite_role),
    'Invited Admin'
  )->>'status',
  'invited',
  'an existing auth user without membership receives a pending invitation'
);

reset role;
select is(
  (select phone from public.team_invitations
    where company_id = (select company_id from invite_company) and status = 'pending'),
  '254712000002',
  'invitation phone is normalized'
);

select is(
  (select count(*)::integer from public.team_invitations
    where company_id = (select company_id from invite_company) and status = 'pending'),
  1,
  'one pending invitation reserves one seat'
);

select testkit.as_user(
  (select company_id from invite_company),
  '95000000-0000-4000-8000-000000000001',
  'Admin'
);
select is(
  public.invite_team_member(
    '+254712000002',
    (select role_id from invite_role),
    'Renamed Invite'
  )->>'status',
  'updated_invitation',
  'editing a pending invitation does not implicitly resend it'
);

select throws_ok(
  format(
    $$select public.invite_team_member('0712000003', '%s', 'Too Many')$$,
    (select role_id from invite_role)
  ),
  'P0001',
  'limit_reached: team member limit (2); cancel an invitation or upgrade your plan',
  'pending invitations consume team capacity'
);

select throws_ok(
  format(
    $$select public.add_team_member('0712000003', '%s')$$,
    (select role_id from invite_role)
  ),
  'P0001',
  'limit_reached: team member limit (2); cancel an invitation or upgrade your plan',
  'legacy member creation cannot consume a reserved invitation seat'
);

select throws_ok(
  $$select public.update_team_member(
      (select id from public.company_memberships
       where company_id = (select company_id from invite_company)
         and user_id = '95000000-0000-4000-8000-000000000003'),
      null,
      'approved'
    )$$,
  'P0001',
  'limit_reached: team member limit (2); cancel an invitation or upgrade your plan',
  'membership reactivation cannot consume a reserved invitation seat'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is(
  (public.claim_team_invitations()->>'claimed_count')::integer,
  1,
  'verified phone owner claims the invitation'
);

reset role;
select is(
  (select authorization_status from public.company_memberships
    where company_id = (select company_id from invite_company)
      and user_id = '95000000-0000-4000-8000-000000000002'),
  'approved',
  'claim creates an approved company membership'
);

select is(
  (select display_name from public.company_staff_profiles
    where company_id = (select company_id from invite_company)
      and user_id = '95000000-0000-4000-8000-000000000002'),
  'Renamed Invite',
  'claim carries the invited display name into the staff profile'
);

select is(
  (select status from public.team_invitations
    where company_id = (select company_id from invite_company)
      and phone = '254712000002'),
  'accepted',
  'claimed invitation is closed'
);

select is(
  (select active_company_id from public.user_preferences
    where user_id = '95000000-0000-4000-8000-000000000002'),
  (select company_id from invite_company),
  'first claimed invitation becomes the active company'
);

select is(
  public.custom_access_token_hook(
    '{"user_id":"95000000-0000-4000-8000-000000000002","claims":{"sub":"95000000-0000-4000-8000-000000000002"}}'
  )->'claims'->>'company_id',
  (select company_id::text from invite_company),
  'next token receives the invited company claim'
);

select testkit.as_user(
  (select company_id from invite_company),
  '95000000-0000-4000-8000-000000000001',
  'Admin'
);
select is(
  (public.team_management_snapshot()->'invitations')::text,
  '[]',
  'accepted invitations disappear from the team snapshot'
);

reset role;
select lives_ok(
  format(
    'delete from public.companies where id = %L',
    (select company_id from invite_company)
  ),
  'company cascade skips cache emission after the parent is deleted'
);

select * from finish();
rollback;
