begin;
select plan(4);

select testkit.create_user('12121212-1212-1212-1212-121212121212', 'platform-split@test.local');
select testkit.create_user('13131313-1313-1313-1313-131313131313', 'tenant-split@test.local');
select testkit.create_user('14141414-1414-1414-1414-141414141414', 'company-owner@test.local');

create temp table identity_boundary_company as
select testkit.provision(
  '14141414-1414-1414-1414-141414141414', 'Identity Boundary Co'
) as company_id;

insert into public.platform_admins (user_id)
values ('12121212-1212-1212-1212-121212121212');

select throws_ok(
  $$select testkit.add_member(
      (select company_id from identity_boundary_company),
      '12121212-1212-1212-1212-121212121212', 'Admin', '{}'
    )$$,
  'P0001',
  'tenant_identity_cannot_be_platform_admin',
  'platform identity cannot receive a tenant membership'
);

select testkit.add_member(
  (select company_id from identity_boundary_company),
  '13131313-1313-1313-1313-131313131313', 'Admin', '{}'
);

select throws_ok(
  $$insert into public.platform_admins (user_id)
    values ('13131313-1313-1313-1313-131313131313')$$,
  'P0001',
  'platform_identity_cannot_have_company_memberships',
  'tenant identity cannot become a platform administrator'
);

select ok(
  exists (select 1 from public.platform_admins where user_id = '12121212-1212-1212-1212-121212121212'),
  'platform-only identity remains valid'
);

select ok(
  exists (select 1 from public.company_memberships where user_id = '13131313-1313-1313-1313-131313131313'),
  'tenant-only identity remains valid'
);

select * from finish();
rollback;
