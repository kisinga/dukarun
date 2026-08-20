begin;
select plan(37);

select testkit.create_user('73000000-0000-0000-0000-000000000001', 'legal-admin@test.local');
select testkit.create_user('73000000-0000-0000-0000-000000000002', 'legal-staff@test.local');
select testkit.create_user('73000000-0000-0000-0000-000000000003', 'legal-founder@test.local');
select testkit.create_user('73000000-0000-0000-0000-000000000004', 'legal-platform@test.local');
select testkit.create_user('73000000-0000-0000-0000-000000000005', 'nonmaterial-founder@test.local');

create temp table legal_company as
select testkit.provision('73000000-0000-0000-0000-000000000001', 'Legal Existing Co') company_id;
grant select on pg_temp.legal_company to authenticated;

delete from public.legal_document_versions
where document_type = 'terms'
  and version = '2026-08-09'
  and publication_state = 'draft';

insert into public.legal_document_versions (
  document_type, version, content_sha256, effective_at, enforcement_at,
  publication_state, requires_company_acceptance
) values (
  'terms', '2026-08-09',
  '32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415',
  now() - interval '1 day', now() + interval '14 days', 'draft', true
);

select testkit.add_member(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000002',
  'Legal Staff',
  array[]::text[]
);

update public.legal_document_versions
set publication_state='published',
    enforcement_at=now()+interval '14 days',
    content_sha256='32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415'
where document_type='terms' and version='2026-08-09';

select testkit.as_user(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000001',
  'Admin'
);

select is((public.current_company_legal_status()->>'required')::boolean, true,
  'published current Terms require company acceptance');
select is((public.current_company_legal_status()->>'accepted')::boolean, false,
  'existing company starts unaccepted');
select is((public.current_company_legal_status()->>'can_accept')::boolean, true,
  'ManageTeam member may accept');
select is((public.current_company_legal_status()->>'enforcement_started')::boolean, false,
  'existing company receives the configured grace period');

select throws_ok(
  $$select public.accept_company_terms('2026-08-09', repeat('f',64), 'account')$$,
  'P0001', 'legal_document_mismatch', 'stale or incorrect content hash is rejected'
);

create temp table legal_acceptance as
select public.accept_company_terms(
  '2026-08-09',
  '32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415',
  'account'
) id;
grant select on pg_temp.legal_acceptance to authenticated;

select ok((select id from legal_acceptance) is not null, 'authorized acceptance returns an id');
select is((public.current_company_legal_status()->>'accepted')::boolean, true,
  'accepted company reports current acceptance');
select is(
  public.accept_company_terms(
    '2026-08-09',
    '32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415',
    'account'
  ),
  (select id from legal_acceptance),
  'acceptance is idempotent'
);
select is((select count(*)::int from public.company_legal_acceptances
  where company_id=(select company_id from legal_company)), 1,
  'one company acceptance is stored per version');

reset role;
select throws_ok(
  $$update public.company_legal_acceptances set source='registration'
    where id=(select id from legal_acceptance)$$,
  'P0001', 'legal_acceptances_are_immutable', 'acceptance evidence cannot be updated'
);

select testkit.as_user(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000002',
  'Legal Staff'
);
select is((public.current_company_legal_status()->>'can_accept')::boolean, false,
  'ordinary staff cannot accept for the company');
select throws_ok(
  $$select public.accept_company_terms(
    '2026-08-09',
    '32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415',
    'account')$$,
  'P0001', 'permission_denied: ManageTeam required', 'staff acceptance is rejected'
);
select throws_ok(
  $$insert into public.company_legal_acceptances(
      company_id,document_version_id,accepted_by,source)
    select (select company_id from legal_company),id,
      '73000000-0000-0000-0000-000000000002','account'
    from public.legal_document_versions where document_type='terms' and version='2026-08-09'$$,
  '42501', null, 'direct acceptance inserts are not granted'
);

reset role;
create temp table company_count_before as select count(*) n from public.companies;
grant select on pg_temp.company_count_before to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.provision_company_registration(
    'Bad Legal Co','Main','KES',null,null,'2026-08-09',repeat('f',64))$$,
  'P0001', 'legal_document_mismatch', 'invalid acceptance prevents provisioning'
);
reset role;
select is((select count(*) from public.companies), (select n from company_count_before),
  'failed legal provisioning creates no company');

set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000003","role":"authenticated"}';
create temp table accepted_provision as
select (public.provision_company_registration(
  'Accepted Legal Co','Main','KES',null,null,'2026-08-09',
  '32cda54a4a204a635aab24e46965470b8feca6cb57930e043f2765b98e5b9415',
  'Legal Founder'
)->>'company_id')::uuid company_id;
grant select on pg_temp.accepted_provision to authenticated;
reset role;
select is((select count(*)::int from public.company_legal_acceptances
  where company_id=(select company_id from accepted_provision)), 1,
  'valid provisioning atomically records acceptance');
select is((select source from public.company_legal_acceptances
  where company_id=(select company_id from accepted_provision)), 'registration',
  'provisioning records the registration source');
select is((select display_name from public.company_staff_profiles
  where company_id=(select company_id from accepted_provision)
    and user_id='73000000-0000-0000-0000-000000000003'), 'Legal Founder',
  'provisioning stores the owner name before company approval');

set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(public.current_company_legal_status()->>'company_status', 'unapproved',
  'a returning founder can detect a pending company without a tenant claim');
select is(public.current_company_id(), null::uuid,
  'an unapproved company never receives tenant scope');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$select public.provision_company('Unchecked Legal Co')$$,
  '42501', null, 'authenticated callers cannot bypass Terms-aware provisioning'
);
reset role;

update public.legal_document_versions
set publication_state = 'superseded'
where document_type = 'terms' and publication_state = 'published';
insert into public.legal_document_versions (
  document_type, version, content_sha256, effective_at, enforcement_at,
  publication_state, requires_company_acceptance
) values (
  'terms', '2026-08-10', repeat('a', 64), now() - interval '1 day',
  now() - interval '1 minute', 'published', true
);

select testkit.as_user(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000002',
  'Legal Staff'
);
select is((public.current_company_legal_status()->>'enforcement_started')::boolean, true,
  'new material Terms enter enforcement');
select is(public.current_company_id(), null::uuid,
  'an unaccepted company has no tenant scope after enforcement');
update public.companies set address = 'should not change'
where id = (select company_id from legal_company);
reset role;
select is((select address from public.companies where id = (select company_id from legal_company)),
  null::text, 'direct tenant writes are blocked after enforcement');

select testkit.as_user(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000001',
  'Admin'
);
select is((public.current_company_legal_status()->>'can_accept')::boolean, true,
  'blocked administrators can still accept Terms');
select public.accept_company_terms('2026-08-10', repeat('a', 64), 'account');
select is(public.current_company_id(), (select company_id from legal_company),
  'acceptance restores tenant scope');

set local role authenticated;
select set_config('request.jwt.claims', testkit.claims(
  (select company_id from legal_company),
  '73000000-0000-0000-0000-000000000002',
  'Legal Staff'
), true);
select throws_ok(
  $$select * from public.platform_company_legal_status()$$,
  'P0001', 'platform_admin_required', 'platform report rejects tenant users'
);
reset role;

insert into public.platform_admins(user_id) values ('73000000-0000-0000-0000-000000000004');
set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000004","role":"authenticated","is_platform_admin":true}';
select ok(exists(select 1 from public.platform_company_legal_status()
  where company_id=(select company_id from legal_company) and legal_status='accepted'),
  'platform report exposes company acceptance state to platform admins');

reset role;
update public.legal_document_versions
set publication_state = 'superseded'
where document_type = 'terms' and publication_state = 'published';
insert into public.legal_document_versions (
  document_type, version, content_sha256, effective_at,
  publication_state, requires_company_acceptance
) values (
  'terms', '2026-08-11', repeat('b', 64), now() - interval '1 day',
  'published', false
);
update public.companies set status = 'approved'
where id = (select company_id from accepted_provision);

set local role authenticated;
select set_config('request.jwt.claims', testkit.claims(
  (select company_id from accepted_provision),
  '73000000-0000-0000-0000-000000000003',
  'Admin'
), true);
select is(public.current_company_legal_status()->>'required_version', '2026-08-10',
  'a non-material successor retains the latest required predecessor');
select is(public.current_company_legal_status()->>'version', '2026-08-11',
  'the acceptance prompt shows the latest published Terms');
select is((public.current_company_legal_status()->>'accepted')::boolean, false,
  'the retained predecessor remains outstanding');
select is(public.current_company_id(), null::uuid,
  'a non-material successor does not reopen a blocked tenant');
select lives_ok(
  $$select public.accept_company_terms('2026-08-11', repeat('b', 64), 'account')$$,
  'accepting the current Terms satisfies the retained predecessor'
);
select is(public.current_company_id(), (select company_id from accepted_provision),
  'accepting the retained predecessor restores tenant scope');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"73000000-0000-0000-0000-000000000005","role":"authenticated"}';
create temp table nonmaterial_provision as
select (public.provision_company_registration(
  'Nonmaterial Terms Co', 'Main', 'KES', null, null,
  '2026-08-11', repeat('b', 64)
)->>'company_id')::uuid company_id;
grant select on pg_temp.nonmaterial_provision to authenticated;
reset role;
select is((select count(*)::integer from public.company_legal_acceptances
  where company_id = (select company_id from nonmaterial_provision)), 1,
  'registration records acceptance for non-material current Terms');
select is((select requires_company_acceptance from public.legal_document_versions
  where version = '2026-08-11'), false,
  'non-material Terms do not trigger existing-company reacceptance');
select is(public.company_has_terms_acceptance_at_or_after(
    (select company_id from nonmaterial_provision), '2026-08-10'), true,
  'registration acceptance of a successor satisfies its required predecessor');

select * from finish();
rollback;
