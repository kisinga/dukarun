-- Period closing tests (migration 0010): reconciliation gate, lock
-- enforcement, no closing entries, permissions.
begin;
-- Business-day assertions must not depend on the CI runner's UTC date near
-- midnight in Nairobi.
set local timezone to 'Africa/Nairobi';
select plan(9);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@period.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'cashier@period.local');

create temp table pc_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Period Co') as company_id;
grant select on pg_temp.pc_company to authenticated;

select testkit.add_member((select company_id from pc_company), '22222222-2222-2222-2222-222222222222', 'Cashier', '{SettleOrder}');

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000ee', company_id, 'Service' from pc_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000ee', 'a0000000-0000-0000-0000-0000000000ee', company_id, 'Default', 'service', 'SVC', 10000, false from pc_company;

select testkit.as_user((select company_id from pc_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- Seed activity.
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000ee","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]');
-- End the fixture session without creating a reconciliation: this test's next
-- assertion specifically exercises the missing-reconciliation gate.
reset role;
update public.cashier_sessions
set status = 'closed', closed_at = now()
where company_id = (select company_id from pc_company) and status = 'open';
delete from public.reconciliation_accounts
where reconciliation_id in (
  select id from public.reconciliations where company_id = (select company_id from pc_company)
);
delete from public.reconciliations where company_id = (select company_id from pc_company);
select testkit.as_user((select company_id from pc_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. Close without any verified reconciliation fails.
select throws_ok(
  $$select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date)$$,
  'P0001', 'reconciliation_required: method bank has no verified reconciliation this period',
  'period close requires verified reconciliations'
);

-- 2. Cashier cannot close periods.
select testkit.as_user((select company_id from pc_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

select throws_ok(
  $$select public.close_accounting_period((now() at time zone 'Africa/Nairobi')::date)$$,
  'P0001', 'permission_denied: CloseAccountingPeriod required',
  'cashier cannot close accounting periods'
);

select testkit.as_user((select company_id from pc_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 3-4. Manual reconciliation covering every reconciliation-requiring
-- method's account (matching declarations: verified, zero variance).
create temp table recon1 as
select public.record_manual_reconciliation((
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_code', pm.ledger_account_code,
           'declared', public.account_balance((select company_id from pc_company), pm.ledger_account_code)
         )), '[]'::jsonb)
  from public.payment_methods pm
  join public.ledger_accounts a
    on a.company_id = pm.company_id and a.code = pm.ledger_account_code
  where pm.company_id = (select company_id from pc_company)
    and pm.requires_reconciliation and pm.enabled
    and a.is_active and not a.is_parent and a.type = 'asset' and a.allow_manual_posting
)) as recon_id;

select ok((select recon_id from recon1) is not null, 'manual reconciliation recorded');

select is(
  (select count(*)::int from public.ledger_journal_entries where source_type = 'VarianceAdjustment'),
  0,
  'matching reconciliation posts no variance'
);

select public.sign_off_business_day((now() at time zone 'Africa/Nairobi')::date);

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
