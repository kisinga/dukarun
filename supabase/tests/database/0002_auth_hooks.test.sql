-- Auth hook tests (migration 0002).
begin;
select plan(6);

-- Fixtures
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@test.local', '', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'loner@test.local', '', now(), now()),
  ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'root@platform.local', '', now(), now());

insert into public.companies (id, code, name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'HOOKCO', 'Hook Co');

insert into public.roles (id, company_id, name, permissions)
values ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin', '{ViewFinancials}');

insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'approved');

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

select * from finish();
rollback;
