-- Audit trail tests (migration 0015).
begin;
select plan(7);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@audit.local');

create temp table au_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Audit Co') as company_id;
grant select on pg_temp.au_company to authenticated;

-- 1. Provisioning itself was audited (companies insert with actor).
select ok(
  exists (
    select 1 from public.audit_log
    where table_name = 'companies' and operation = 'INSERT'
      and actor = '11111111-1111-1111-1111-111111111111'
  ),
  'provisioning writes an audit row with the actor'
);

-- 2-3. Product create/update captured with new/old snapshots.
select testkit.as_user((select company_id from au_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

create temp table au_prod as
select public.create_product('Audit Bread') as id;

select is(
  (select new_data ->> 'name' from public.audit_log
   where table_name = 'products' and operation = 'INSERT'
     and row_id = (select id::text from au_prod)),
  'Audit Bread',
  'product insert captured with new_data snapshot'
);

-- Price lives on the variant now: update it there and check the old snapshot.
create temp table au_var as
select public.upsert_variant((select id from au_prod), 'Default', 5000, null, 'AB1') as id;

select public.upsert_variant((select id from au_prod), 'Default', 6000, (select id from au_var));

select is(
  (select (old_data ->> 'price')::bigint from public.audit_log
   where table_name = 'product_variants' and operation = 'UPDATE'
     and row_id = (select id::text from au_var)),
  5000::bigint,
  'variant update captured with old_data snapshot'
);

-- 4. Journal tables are NOT audited (immutable — they are the audit).
select testkit.as_user((select company_id from au_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table au_svc as
select public.create_product('Svc') as id;

create temp table au_svc_var as
select public.upsert_variant((select id from au_svc), 'Default', 5000, null, 'SVCAE', null, null, null, null, null, 'service') as id;

select public.post_sale(null,
  format('[{"variant_id":"%s","quantity":1,"unit_price":5000}]', (select id from au_svc_var))::jsonb,
  '[{"method":"cash","amount":5000}]');

select is(
  (select count(*)::int from public.audit_log
   where table_name in ('ledger_journal_entries', 'ledger_journal_lines')),
  0,
  'ledger tables excluded from audit (they are immutable records themselves)'
);

-- 5. Deletes captured (via superuser path — proves no path bypasses it).
reset role;
delete from public.roles where company_id = (select company_id from au_company) and name = 'Admin';

select ok(
  exists (
    select 1 from public.audit_log
    where table_name = 'roles' and operation = 'DELETE'
  ),
  'delete captured even from a non-RPC path'
);

-- 6-7. RLS: member reads their company audit; second company sees nothing of it.
reset role;
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'other@audit.local');

create temp table au_company2 as select testkit.provision('22222222-2222-2222-2222-222222222222', 'Other Co') as company_id2;
grant select on pg_temp.au_company2 to authenticated;

select testkit.as_user((select company_id2 from au_company2), '22222222-2222-2222-2222-222222222222', 'Admin');

select is(
  (select count(*)::int from public.audit_log
   where company_id = (select company_id from au_company)),
  0,
  'tenant B cannot see tenant A audit rows'
);

select ok(
  (select count(*)::int from public.audit_log
   where company_id = (select company_id2 from au_company2)) > 0,
  'tenant B sees their own audit rows'
);

select * from finish();
rollback;
