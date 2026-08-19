begin;
select plan(11);

select testkit.create_user(
  '10600000-0000-4000-8000-000000000001',
  'pos-observability-owner@test.local'
);
select testkit.create_user(
  '10600000-0000-4000-8000-000000000009',
  'pos-observability-platform@test.local'
);

create temp table pos_observability_company as
select testkit.provision(
  '10600000-0000-4000-8000-000000000001',
  'POS Observability Co'
) company_id;
grant select on pg_temp.pos_observability_company to authenticated;

insert into public.platform_admins(user_id)
values ('10600000-0000-4000-8000-000000000009');

select testkit.as_user(
  (select company_id from pos_observability_company),
  '10600000-0000-4000-8000-000000000001',
  'Admin'
);

reset role;

insert into public.pos_devices(
  id, company_id, device_key, user_id, pending_count, last_seen_at, last_synced_at
)
select
  '10600000-0000-4000-8000-000000000010', company_id, 'active-device',
  '10600000-0000-4000-8000-000000000001', 3, now(), now()
from pos_observability_company;

insert into public.pos_devices(
  id, company_id, device_key, user_id, pending_count, last_seen_at
)
select
  '10600000-0000-4000-8000-000000000012', company_id, 'dormant-device',
  '10600000-0000-4000-8000-000000000001', 0, now() - interval '31 days'
from pos_observability_company;

insert into public.pos_devices(
  id, company_id, device_key, user_id, pending_count, last_seen_at, retired_at
)
select
  '10600000-0000-4000-8000-000000000013', company_id, 'retired-device',
  '10600000-0000-4000-8000-000000000001', 0, now() - interval '2 days', now()
from pos_observability_company;

insert into public.pos_devices(
  id, company_id, device_key, user_id, pending_count, last_seen_at
)
select
  '10600000-0000-4000-8000-000000000011', company_id, 'stale-device',
  '10600000-0000-4000-8000-000000000001', 0, now() - interval '25 hours'
from pos_observability_company;

create temp table pos_audit_before as
select count(*)::integer audit_count from public.audit_log
where table_name = 'pos_devices' and operation = 'UPDATE';

update public.pos_devices
set last_seen_at = now(), last_synced_at = now()
where id = '10600000-0000-4000-8000-000000000010';

select is(
  (select count(*)::integer from public.audit_log
   where table_name = 'pos_devices' and operation = 'UPDATE'),
  (select audit_count from pos_audit_before),
  'heartbeat-only updates are not stored in the audit log'
);

insert into public.audit_log(
  company_id, table_name, operation, row_id, actor, old_data, new_data
)
select
  company_id, 'pos_devices', 'UPDATE', 'historical-heartbeat',
  '10600000-0000-4000-8000-000000000001',
  '{"device_key":"old-device","pending_count":0,"last_seen_at":"2026-01-01T00:00:00Z"}',
  '{"device_key":"old-device","pending_count":0,"last_seen_at":"2026-01-01T00:01:00Z"}'
from pos_observability_company;

select testkit.as_user(
  (select company_id from pos_observability_company),
  '10600000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  (select count(*)::integer from public.list_audit_events(100, 0, null, null, null, null, null)
   where entity_id = 'historical-heartbeat'),
  0,
  'previously stored heartbeat-only rows are hidden from tenant activity'
);

reset role;
update public.pos_devices
set pending_count = 2, last_seen_at = now()
where id = '10600000-0000-4000-8000-000000000010';

select testkit.as_user(
  (select company_id from pos_observability_company),
  '10600000-0000-4000-8000-000000000001',
  'Admin'
);

select ok(
  exists(
    select 1 from public.list_audit_events(100, 0, null, null, null, null, null)
    where entity_type = 'pos_devices'
      and entity_id = '10600000-0000-4000-8000-000000000010'
      and operation = 'UPDATE'
      and (after_data ->> 'pending_count')::integer = 2
  ),
  'offline queue changes remain visible in tenant activity'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10600000-0000-4000-8000-000000000009","role":"authenticated","is_platform_admin":true}',
  true
);

select is((public.platform_stats() ->> 'pos_devices_total')::integer, 3,
  'platform stats counts non-retired POS devices');
select is((public.platform_stats() ->> 'pos_devices_recent_30d')::integer, 2,
  'platform stats bounds the recent-device denominator');
select is((public.platform_stats() ->> 'pos_devices_active_24h')::integer, 1,
  'platform stats counts active POS devices');
select is((public.platform_stats() ->> 'pos_devices_stale_30d')::integer, 1,
  'platform stats counts recently stale POS devices');
select is((public.platform_stats() ->> 'pos_devices_dormant_30d')::integer, 1,
  'platform stats separates dormant POS devices');
select is(
  (public.platform_stats() ->> 'pos_devices_with_last_reported_pending')::integer,
  1,
  'platform stats counts devices with a last-reported queue'
);
select is(
  (public.platform_stats() ->> 'offline_sales_last_reported_pending')::integer,
  2,
  'platform stats totals last-reported pending sales'
);
select is((public.platform_stats() ->> 'companies_with_active_pos_30d')::integer, 1,
  'platform stats counts companies recently using POS');

select * from finish();
rollback;
