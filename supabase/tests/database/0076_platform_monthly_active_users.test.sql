-- Platform MAU uses successful sign-ins in the current Nairobi calendar month.
begin;
select plan(3);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'active@mau.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'inactive@mau.local');
select testkit.create_user('99999999-9999-9999-9999-999999999999', 'root@mau.local');

update auth.users
set last_sign_in_at = null;

update auth.users
set last_sign_in_at =
  (date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi')
  + interval '1 hour'
where id = '11111111-1111-1111-1111-111111111111';

update auth.users
set last_sign_in_at =
  (date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi')
  - interval '1 second'
where id = '22222222-2222-2222-2222-222222222222';

insert into public.platform_admins (user_id)
values ('99999999-9999-9999-9999-999999999999');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}',
  true
);

select is(
  (public.platform_stats() ->> 'monthly_active_users')::int,
  1,
  'platform stats counts a successful sign-in in the current Nairobi month'
);

select is(
  (public.platform_stats() ->> 'users_total')::int,
  (select count(*)::int from auth.users),
  'platform stats includes the registered user total'
);

select ok(
  public.platform_stats() ? 'monthly_active_users',
  'platform stats exposes the MAU key'
);

select * from finish();
rollback;
