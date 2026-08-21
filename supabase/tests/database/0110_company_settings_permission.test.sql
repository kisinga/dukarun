begin;
select plan(14);

select testkit.create_user('11000000-0000-0000-0000-000000000001', 'settings-owner@test.local');
select testkit.create_user('11000000-0000-0000-0000-000000000002', 'settings-cashier@test.local');
select testkit.create_user('11000000-0000-0000-0000-000000000003', 'settings-editor@test.local');

create temp table settings_company as
select testkit.provision(
  '11000000-0000-0000-0000-000000000001',
  'Settings Permission Co'
) as company_id;
grant select on pg_temp.settings_company to authenticated;

select testkit.add_member(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000002',
  'Cashier',
  '{SettleOrder}'
);
select testkit.add_member(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000003',
  'Settings editor',
  '{ManageCompanySettings}'
);

select is(
  (select count(*)::int from public.roles
   where is_template
     and name in ('Admin', 'Manager')
     and 'ManageCompanySettings' = any(permissions)),
  2,
  'Admin and Manager templates receive the settings permission'
);

select is(
  (select count(*)::int from public.roles
   where company_id = (select company_id from settings_company)
     and name in ('Admin', 'Manager')
     and 'ManageCompanySettings' = any(permissions)),
  2,
  'provisioned Admin and Manager roles receive the settings permission'
);

insert into public.roles (company_id, name, permissions)
select company_id, 'manager', '{}'::text[] from settings_company;

select is(
  (select 'ManageCompanySettings' = any(permissions) from public.roles
   where company_id = (select company_id from settings_company) and name = 'manager'),
  false,
  'a user-created role named manager receives only its explicit permissions'
);

select is(
  (select 'ManageCompanySettings' = any(permissions) from public.roles
   where company_id = (select company_id from settings_company) and name = 'Cashier'),
  false,
  'Cashier does not inherit the settings permission'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000002',
  'Cashier'
);

select is(public.current_user_has_permission('ManageCompanySettings'), false,
  'Cashier is denied the settings permission');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    select 'company-logos', company_id::text || '/permission-test.svg',
      '{"state":"cashier"}'::jsonb
    from settings_company$$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'Cashier cannot insert a company logo object'
);

update public.companies set address = 'Cashier change'
where id = public.current_company_id();

reset role;
select is(
  (select address from public.companies
   where id = (select company_id from settings_company)),
  null::text,
  'Cashier cannot update the company settings row'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000003',
  'Settings editor'
);

select is(public.current_user_has_permission('ManageCompanySettings'), true,
  'an explicitly granted settings editor has the permission');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    select 'company-logos', company_id::text || '/permission-test.svg',
      '{"state":"created"}'::jsonb
    from settings_company$$,
  'settings editor can insert a company logo object'
);

update public.companies set address = 'Authorized change'
where id = public.current_company_id();

reset role;
select is(
  (select address from public.companies
   where id = (select company_id from settings_company)),
  'Authorized change',
  'the explicit permission authorizes company settings updates'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000002',
  'Cashier'
);

update storage.objects
set metadata = '{"state":"cashier"}'::jsonb
where bucket_id = 'company-logos'
  and name = (select company_id::text || '/permission-test.svg' from settings_company);

reset role;
select is(
  (select metadata ->> 'state' from storage.objects
   where bucket_id = 'company-logos'
     and name = (select company_id::text || '/permission-test.svg' from settings_company)),
  'created',
  'Cashier cannot update a company logo object'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000002',
  'Cashier'
);

select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects
where bucket_id = 'company-logos'
  and name = (select company_id::text || '/permission-test.svg' from settings_company);

reset role;
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'company-logos'
     and name = (select company_id::text || '/permission-test.svg' from settings_company)),
  1,
  'Cashier cannot delete a company logo object'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000003',
  'Settings editor'
);

update storage.objects
set metadata = '{"state":"authorized"}'::jsonb
where bucket_id = 'company-logos'
  and name = (select company_id::text || '/permission-test.svg' from settings_company);

reset role;
select is(
  (select metadata ->> 'state' from storage.objects
   where bucket_id = 'company-logos'
     and name = (select company_id::text || '/permission-test.svg' from settings_company)),
  'authorized',
  'settings editor can update a company logo object'
);

select testkit.as_user(
  (select company_id from settings_company),
  '11000000-0000-0000-0000-000000000003',
  'Settings editor'
);

delete from storage.objects
where bucket_id = 'company-logos'
  and name = (select company_id::text || '/permission-test.svg' from settings_company);

reset role;
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'company-logos'
     and name = (select company_id::text || '/permission-test.svg' from settings_company)),
  0,
  'settings editor can delete a company logo object'
);

select * from finish();
rollback;
