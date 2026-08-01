-- Period closing tests (migration 0010): reconciliation gate, lock
-- enforcement, no closing entries, permissions.
begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@period.local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cashier@period.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table pc_company as select public.provision_company('Period Co', 'Main') as company_id;
reset role;

insert into public.roles (company_id, name, permissions)
select company_id, 'Cashier', '{SettleOrder}' from pc_company;
insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
select p.company_id, '22222222-2222-2222-2222-222222222222', r.id, 'approved'
from pc_company p, public.roles r where r.company_id = p.company_id and r.name = 'Cashier';

insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-0000000000ee', company_id, 'Service', 'SVC', 10000, false from pc_company;

create temp table pc_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from pc_company;
grant select on pg_temp.pc_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from pc_claims), true);

-- Seed activity.
select public.post_sale(null,
  '[{"product_id":"a0000000-0000-0000-0000-0000000000ee","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]');

-- 1. Close without any verified reconciliation fails.
select throws_ok(
  $$select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date)$$,
  'P0001', 'reconciliation_required: method bank has no verified reconciliation this period',
  'period close requires verified reconciliations'
);

-- 2. Cashier cannot close periods.
select set_config('request.jwt.claims', (
  select format('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","company_id":"%s","user_role":"Cashier"}', company_id)
  from pc_company), true);

select throws_ok(
  $$select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date)$$,
  'P0001', 'permission_denied: CloseAccountingPeriod required',
  'cashier cannot close accounting periods'
);

select set_config('request.jwt.claims', (select claims from pc_claims), true);

-- 3-4. Manual reconciliation (matching declarations: verified, zero variance).
create temp table recon1 as
select public.record_manual_reconciliation('[{"account_code":"CASH_ON_HAND","declared":10000}]') as recon_id;

select ok((select recon_id from recon1) is not null, 'manual reconciliation recorded');

select is(
  (select count(*)::int from public.ledger_journal_entries where source_type = 'VarianceAdjustment'),
  0,
  'matching reconciliation posts no variance'
);

-- 5-7. Close the period (today).
create temp table entry_count as select count(*)::int as n from public.ledger_journal_entries;

create temp table closed_period as
select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date) as period_id;

select is(
  (select status from public.accounting_periods where id = (select period_id from closed_period)),
  'closed',
  'period recorded as closed'
);

select is(
  (select lock_end_date from public.period_locks where company_id = (select company_id from pc_company)),
  (now() at time zone 'Africa/Nairobi')::date,
  'period lock set to the closing date'
);

select is(
  (select count(*)::int from public.ledger_journal_entries),
  (select n from entry_count),
  'closing posts NO closing entries (faithful: balances accumulate)'
);

-- 8. Posting into the locked period is rejected.
select throws_ok(
  $$select public.post_expense(1000, 'CASH_ON_HAND', 'utilities')$$,
  'P0001', 'period_locked: entry date ' || ((now() at time zone 'Africa/Nairobi')::date) || ' is within a locked period',
  'posting into a locked period is rejected'
);

-- 9. Closing again with the same date fails.
select throws_ok(
  $$select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date)$$,
  'P0001', null,
  'cannot re-close an already-locked period'
);

select * from finish();
rollback;
