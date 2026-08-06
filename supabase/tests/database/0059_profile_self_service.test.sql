-- Profile self-service tests (migration 0009).
begin;
select plan(7);

select testkit.create_user('bbbbbbbb-0009-0009-0009-000000000001', 'me@profile.local', '254709000001');
select testkit.create_user('bbbbbbbb-0009-0009-0009-000000000002', 'other@profile.local', '254709000002');

create temp table p_company as
select testkit.provision('bbbbbbbb-0009-0009-0009-000000000001', 'Profile Co') as company_id;
grant select on pg_temp.p_company to authenticated;

select testkit.as_user((select company_id from p_company), 'bbbbbbbb-0009-0009-0009-000000000001', 'Admin');

-- 1. Member sets their own display name (no ManageTeam RPC involved).
select public.update_my_profile('Amina Self', null);

select is(
  (select display_name from public.company_staff_profiles
   where company_id = (select company_id from p_company)
     and user_id = 'bbbbbbbb-0009-0009-0009-000000000001'),
  'Amina Self',
  'member sets their own display name'
);

-- 2. Member sets an avatar path under the company prefix.
select public.update_my_profile(null, (select company_id from p_company)::text || '/avatar-1.jpg');

select is(
  (select avatar_path from public.company_staff_profiles
   where company_id = (select company_id from p_company)
     and user_id = 'bbbbbbbb-0009-0009-0009-000000000001'),
  (select company_id from p_company)::text || '/avatar-1.jpg',
  'member sets an avatar path under the company prefix'
);

-- 3. Null name leaves the existing name untouched (avatar-only update above proves it).
select is(
  (select display_name from public.company_staff_profiles
   where company_id = (select company_id from p_company)
     and user_id = 'bbbbbbbb-0009-0009-0009-000000000001'),
  'Amina Self',
  'omitting the name keeps the previous value'
);

-- 4. Empty avatar path clears the avatar.
select public.update_my_profile(null, '');

select ok(
  (select avatar_path from public.company_staff_profiles
   where company_id = (select company_id from p_company)
     and user_id = 'bbbbbbbb-0009-0009-0009-000000000001') is null,
  'empty avatar path clears the avatar'
);

-- 5. Empty / whitespace names are rejected.
select throws_ok(
  $$select public.update_my_profile('   ', null)$$,
  'P0001', 'invalid_display_name: 1-120 characters required',
  'blank display name is rejected'
);

-- 6. Avatar paths outside the company prefix are rejected.
select throws_ok(
  format($$select public.update_my_profile(null, '%s/stolen.jpg')$$,
    'cccccccc-0009-0009-0009-000000000099'),
  'P0001', 'invalid_avatar_path: must live under the company prefix',
  'avatar path outside the company prefix is rejected'
);

-- 7. A non-member (no company claims) cannot use the RPC.
select testkit.as_user((select company_id from p_company), 'bbbbbbbb-0009-0009-0009-000000000002', 'Admin');
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0009-0009-0009-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.update_my_profile('Intruder', null)$$,
  'P0001', 'not_authenticated',
  'user without company claims is rejected'
);

select * from finish();
rollback;
