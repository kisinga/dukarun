-- Auth hook tests (migration 0002).
begin;
select plan(10);

-- Fixtures
select testkit.create_user('11111111-1111-1111-1111-111111111111', 'member@test.local');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'loner@test.local');
select testkit.create_user('99999999-9999-9999-9999-999999999999', 'root@platform.local');

insert into public.companies (id, code, name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'HOOKCO', 'Hook Co');

select testkit.add_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Admin', '{ViewFinancials}');

insert into public.platform_admins (user_id)
values ('99999999-9999-9999-9999-999999999999');

-- 1-2. Approved member gets company_id + role claims.
select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111","aud":"authenticated"}}'
  ) -> 'claims' ->> 'company_id'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'token hook injects company_id for approved member'
);

select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111","aud":"authenticated"}}'
  ) -> 'claims' ->> 'user_role'),
  'Admin',
  'token hook injects user_role'
);

-- 3. Platform admin gets the bypass claim.
select is(
  (public.custom_access_token_hook(
    '{"user_id":"99999999-9999-9999-9999-999999999999","claims":{"sub":"99999999-9999-9999-9999-999999999999"}}'
  ) -> 'claims' ->> 'is_platform_admin'),
  'true',
  'token hook injects is_platform_admin for platform admins'
);

-- 4-5. User with no membership: no tenant claims, no error (hook must never block auth).
select ok(
  (public.custom_access_token_hook(
    '{"user_id":"33333333-3333-3333-3333-333333333333","claims":{"sub":"33333333-3333-3333-3333-333333333333"}}'
  ) -> 'claims' -> 'company_id') is null,
  'token hook adds no company_id for users without membership'
);

select ok(
  (public.custom_access_token_hook(
    '{"user_id":"33333333-3333-3333-3333-333333333333","claims":{"sub":"33333333-3333-3333-3333-333333333333"}}'
  ) -> 'claims' -> 'is_platform_admin') is null,
  'token hook adds no is_platform_admin for regular users'
);

-- 6. send_sms_hook without configured secrets: no-op, returns event unchanged
--    (local dev logins must keep working; OTP appears in GoTrue logs).
select is(
  public.send_sms_hook('{"user":{"phone":"+254712345678"},"sms":{"otp":"123456"}}'),
  '{"user":{"phone":"+254712345678"},"sms":{"otp":"123456"}}'::jsonb,
  'send_sms_hook is a safe no-op without TextSMS secrets'
);

-- 7-10. Multi-company (0018): the active company in user_preferences wins;
-- its membership supplies the role; stale/disabled preferences fall back.
insert into public.companies (id, code, name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'HOOKCO2', 'Hook Co Two');

select testkit.add_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Cashier', '{SettleOrder}');

insert into public.user_preferences (user_id, active_company_id)
values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111"}}'
  ) -> 'claims' ->> 'company_id'),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'token hook prefers the active company from user_preferences'
);

select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111"}}'
  ) -> 'claims' ->> 'user_role'),
  'Cashier',
  'role resolves from the active company membership'
);

-- Preference points at a membership that is no longer approved: fall back to
-- the earliest approved membership.
update public.company_memberships
set authorization_status = 'disabled'
where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  and user_id = '11111111-1111-1111-1111-111111111111';

select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111"}}'
  ) -> 'claims' ->> 'company_id'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'disabled active membership falls back to earliest approved company'
);

-- No preference row at all: earliest approved membership wins (legacy users).
delete from public.user_preferences
where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  (public.custom_access_token_hook(
    '{"user_id":"11111111-1111-1111-1111-111111111111","claims":{"sub":"11111111-1111-1111-1111-111111111111"}}'
  ) -> 'claims' ->> 'company_id'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'missing preference falls back to earliest approved company'
);

select * from finish();
rollback;
