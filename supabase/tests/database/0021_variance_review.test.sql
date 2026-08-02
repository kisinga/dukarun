-- Variance review tests (migration 0021): revert restores balance, guards.
begin;
select plan(6);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@vr.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'staff@vr.local');
create temp table vr_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'VR Co') as company_id;
grant select on pg_temp.vr_company to authenticated;
select testkit.add_member((select company_id from vr_company), '22222222-2222-2222-2222-222222222222', 'Cashier', '{SettleOrder}');

-- Product + variant + stock for a cash sale.
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000c1', company_id, 'Oil' from vr_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c1', company_id, '1L', 'OIL1', 10000 from vr_company;
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'aa000000-0000-0000-0000-0000000000c1', 10, 10, 5000 from vr_company;

select testkit.as_user((select company_id from vr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- Open session, cash sale 10000, close with a 1000 shortage.
create temp table vr_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":0},
  {"account_code":"CLEARING_MPESA","declared":0}
]') as session_id;

select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000c1","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]');

select public.close_cashier_session((select session_id from vr_session), '[
  {"account_code":"CASH_ON_HAND","declared":9000},
  {"account_code":"CLEARING_MPESA","declared":0}
]');

-- Baseline: CASH_ON_HAND balance is 9000 (10000 - 1000 variance).
select is(
  public.account_balance((select company_id from vr_company), 'CASH_ON_HAND'),
  9000::bigint,
  'shortage posted before review'
);

-- Guard: cashier cannot revert.
select testkit.as_user((select company_id from vr_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

select throws_ok(
  format($$select public.revert_variance((
    select ra.id from public.reconciliation_accounts ra
    join public.reconciliations r on r.id = ra.reconciliation_id
    where r.scope_ref_id = '%s:closing' and ra.account_code = 'CASH_ON_HAND'
  ))$$, (select session_id from vr_session)),
  'P0001', 'permission_denied: ManageReconciliation required',
  'cashier cannot revert variances'
);

-- Revert as admin.
select testkit.as_user((select company_id from vr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table vr_revert as
select public.revert_variance((
  select ra.id from public.reconciliation_accounts ra
  join public.reconciliations r on r.id = ra.reconciliation_id
  where r.scope_ref_id = (select session_id::text from vr_session) || ':closing'
    and ra.account_code = 'CASH_ON_HAND'
), 'recount found the note') as entry_id;

select is(
  public.account_balance((select company_id from vr_company), 'CASH_ON_HAND'),
  10000::bigint,
  'revert restores the account balance'
);

select ok(
  (select e.reversal_of is not null from public.ledger_journal_entries e
   where e.id = (select entry_id from vr_revert)),
  'reversal entry links reversal_of'
);

select ok(
  (select ra.reviewed_at is not null from public.reconciliation_accounts ra
   join public.reconciliations r on r.id = ra.reconciliation_id
   where r.scope_ref_id = (select session_id::text from vr_session) || ':closing'
     and ra.account_code = 'CASH_ON_HAND'),
  'recon account marked reviewed'
);

-- Double revert rejected.
select throws_ok(
  format($$select public.revert_variance((
    select ra.id from public.reconciliation_accounts ra
    join public.reconciliations r on r.id = ra.reconciliation_id
    where r.scope_ref_id = '%s:closing' and ra.account_code = 'CASH_ON_HAND'
  ))$$, (select session_id from vr_session)),
  'P0001', 'already_reviewed',
  'double revert rejected'
);

select * from finish();
rollback;
