begin;
select plan(19);

select testkit.create_user('75000000-0000-0000-0000-000000000001', 'team-owner@test.local');
select testkit.create_user('75000000-0000-0000-0000-000000000002', 'team-staff@test.local');

create temp table navigation_company as
select testkit.provision('75000000-0000-0000-0000-000000000001', 'Snapshot Co') company_id;
grant select on pg_temp.navigation_company to authenticated;

select testkit.add_member(
  (select company_id from navigation_company),
  '75000000-0000-0000-0000-000000000002',
  'Snapshot Staff',
  array['SettleOrder']
);

select testkit.as_user(
  (select company_id from navigation_company),
  '75000000-0000-0000-0000-000000000001',
  'Admin'
);

select is(
  public.team_management_snapshot() ->> 'company_id',
  (select company_id::text from navigation_company),
  'Team snapshot is scoped to the claimed company'
);
select is(
  jsonb_array_length(public.team_management_snapshot() -> 'members'),
  2,
  'Team snapshot returns all company memberships'
);
select is(
  jsonb_array_length(public.team_management_snapshot() -> 'roles'),
  (select count(*)::integer from public.roles
   where company_id = (select company_id from navigation_company) and not is_template),
  'Team snapshot returns assignable company roles'
);
select is(
  jsonb_array_length(public.team_management_snapshot() -> 'locations'),
  1,
  'Team snapshot returns active locations'
);
select ok(
  jsonb_array_length(public.team_management_snapshot() -> 'membership_locations') >= 1,
  'Team snapshot returns membership-location assignments'
);
select is(
  public.team_management_snapshot() -> 'members' -> 0 ? 'staff_profile',
  true,
  'Membership projection includes its staff profile field'
);

set local role authenticated;
select set_config('request.jwt.claims', testkit.claims(
  (select company_id from navigation_company),
  '75000000-0000-0000-0000-000000000002',
  'Snapshot Staff'
), true);
select throws_ok(
  $$select public.team_management_snapshot()$$,
  'P0001',
  'permission_denied: ManageTeam required',
  'Team snapshot rejects a member without ManageTeam'
);
reset role;

create temp table team_head_before as
select coalesce(head_sequence, 0) sequence
from public.cache_stream_heads
where company_id = (select company_id from navigation_company) and stream = 'team';

update public.company_staff_profiles
set display_name = 'Renamed Staff'
where company_id = (select company_id from navigation_company)
  and user_id = '75000000-0000-0000-0000-000000000002';

select is(
  (select entity_type from public.cache_change_log
   where company_id = (select company_id from navigation_company) and stream = 'team'
   order by sequence desc limit 1),
  'staff_profile',
  'Staff profile changes emit a Team journal event'
);
select ok(
  (select head_sequence from public.cache_stream_heads
   where company_id = (select company_id from navigation_company) and stream = 'team')
    > (select sequence from team_head_before),
  'Staff profile changes advance the Team stream'
);

create temp table assignment_head_before as
select head_sequence sequence from public.cache_stream_heads
where company_id = (select company_id from navigation_company) and stream = 'team';

update public.company_membership_locations
set is_primary = is_primary
where company_id = (select company_id from navigation_company)
  and membership_id = (
    select id from public.company_memberships
    where company_id = (select company_id from navigation_company)
      and user_id = '75000000-0000-0000-0000-000000000001'
  );

select is(
  (select entity_type from public.cache_change_log
   where company_id = (select company_id from navigation_company) and stream = 'team'
   order by sequence desc limit 1),
  'membership_location',
  'Membership-location changes emit a Team journal event'
);
select ok(
  (select head_sequence from public.cache_stream_heads
   where company_id = (select company_id from navigation_company) and stream = 'team')
    > (select sequence from assignment_head_before),
  'Membership-location changes advance the Team stream'
);

create temp table legal_head_before as
select coalesce(head_sequence, 0) sequence from public.cache_stream_heads
where company_id = (select company_id from navigation_company) and stream = 'settings';

insert into public.legal_document_versions (
  document_type, version, content_sha256, effective_at,
  publication_state, requires_company_acceptance
) values (
  'privacy', '2026-08-09', repeat('7', 64), now(), 'published', false
);

select is(
  (select entity_type from public.cache_change_log
   where company_id = (select company_id from navigation_company) and stream = 'settings'
   order by sequence desc limit 1),
  'legal_document',
  'Publishing a legal document emits a durable settings event'
);
select ok(
  (select head_sequence from public.cache_stream_heads
   where company_id = (select company_id from navigation_company) and stream = 'settings')
    > (select sequence from legal_head_before),
  'Publishing legal content advances the company settings stream'
);

insert into public.legal_document_versions (
  document_type, version, content_sha256, effective_at,
  publication_state, requires_company_acceptance
) values (
  'terms', '2026-08-09', repeat('8', 64), now(), 'published', true
);
insert into public.company_legal_acceptances (
  company_id, document_version_id, accepted_by, source
)
select
  (select company_id from navigation_company),
  id,
  '75000000-0000-0000-0000-000000000001',
  'account'
from public.legal_document_versions
where document_type = 'terms' and version = '2026-08-09';

select is(
  (select entity_type from public.cache_change_log
   where company_id = (select company_id from navigation_company) and stream = 'settings'
   order by sequence desc limit 1),
  'legal_acceptance',
  'Company acceptance emits a company-scoped legal event'
);
select is(
  (select count(*)::integer from public.cache_change_log
   where company_id = (select company_id from navigation_company)
     and stream = 'settings' and entity_type = 'legal_acceptance'),
  1,
  'Acceptance produces one durable event for the accepting company'
);
select has_function(
  'public', 'team_management_snapshot', array[]::text[],
  'Team snapshot RPC exists'
);
select function_privs_are(
  'public', 'team_management_snapshot', array[]::text[], 'authenticated',
  array['EXECUTE'],
  'Authenticated users can execute the permission-checked Team snapshot RPC'
);

reset role;
update public.roles
set permissions = array_append(permissions, 'ManageTeam')
where company_id = (select company_id from navigation_company)
  and name = 'Snapshot Staff'
  and not ('ManageTeam' = any(permissions));
update public.company_memberships
set role_id = (
  select id from public.roles
  where company_id = (select company_id from navigation_company) and name = 'Cashier'
)
where company_id = (select company_id from navigation_company)
  and user_id = '75000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', testkit.claims(
  (select company_id from navigation_company),
  '75000000-0000-0000-0000-000000000001',
  'Admin'
), true);
select is(
  public.current_access_snapshot() -> 'permissions' ? 'ManageTeam',
  false,
  'Access snapshot observes a role revocation despite a stale Admin token claim'
);
select throws_ok(
  $$select public.team_management_snapshot()$$,
  'P0001',
  'permission_denied: ManageTeam required',
  'Authoritative Team RPC blocks a revoked stale-token caller'
);

select * from finish();
rollback;
