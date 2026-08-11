begin;
select plan(31);

select testkit.create_user(
  '91000000-0000-4000-8000-000000000001',
  'financial-hardening-admin@test.local'
);
select testkit.create_user(
  '91000000-0000-4000-8000-000000000002',
  'financial-hardening-cashier@test.local'
);

create temp table hardening_fixture as
select testkit.provision(
  '91000000-0000-4000-8000-000000000001',
  'Financial Hardening Store'
) as company_id;
grant select on pg_temp.hardening_fixture to authenticated;

select testkit.add_member(
  (select company_id from hardening_fixture),
  '91000000-0000-4000-8000-000000000002',
  'Settlement-only cashier',
  '{SettleOrder}'
);

insert into public.stock_locations(id,company_id,name,code,is_default)
select '91000000-0000-4000-8000-000000000003',company_id,'Branch','BRANCH',false
from hardening_fixture;

insert into public.company_membership_locations(company_id,membership_id,location_id,is_primary)
select f.company_id,m.id,'91000000-0000-4000-8000-000000000003',false
from hardening_fixture f
join public.company_memberships m on m.company_id=f.company_id
where m.user_id in (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002'
)
on conflict(membership_id,location_id) do nothing;

insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select '91000000-0000-4000-8000-000000000004',company_id,'Protected Supplier',true,100000
from hardening_fixture;

select testkit.as_user(
  (select company_id from hardening_fixture),
  '91000000-0000-4000-8000-000000000001',
  'Admin'
);

create temp table hardening_locations as
select
  (array_agg(id order by id) filter(where is_default))[1] as main_id,
  (array_agg(id order by id) filter(where code='BRANCH'))[1] as branch_id
from public.stock_locations
where company_id=(select company_id from hardening_fixture);
grant select on pg_temp.hardening_locations to authenticated;

create temp table main_session as
select public.open_cashier_session_at_location(
  (select main_id from hardening_locations),
  '[{"account_code":"CASH_ON_HAND","declared":100},{"account_code":"MPESA","declared":0}]'
) as session_id;
grant select on pg_temp.main_session to authenticated;

-- Arbitrary, duplicated, and negative declaration inputs are rejected before
-- a reconciliation or journal entry can be created.
select throws_ok(
  $$select public.close_cashier_session(
    (select session_id from main_session),
    '[{"account_code":"CASH_ON_HAND","declared":100},{"account_code":"MPESA","declared":0},{"account_code":"SALES","declared":100}]'
  )$$,
  'P0001','unexpected_declaration: SALES',
  'closing cannot reconcile an arbitrary ledger account'
);

select is(
  (select count(*)::int from public.reconciliations
   where scope_ref_id=(select session_id::text from main_session)||':closing'),
  0,
  'an invalid close creates no reconciliation'
);

select is(
  (select status from public.cashier_sessions where id=(select session_id from main_session)),
  'open',
  'an invalid close leaves the session open'
);

select throws_ok(
  $$select public.close_cashier_session(
    (select session_id from main_session),
    '[{"account_code":"CASH_ON_HAND","declared":100},{"account_code":"CASH_ON_HAND","declared":100},{"account_code":"MPESA","declared":0}]'
  )$$,
  'P0001','duplicate_declaration: CASH_ON_HAND',
  'closing requires a unique account set'
);

select throws_ok(
  $$select public.close_cashier_session(
    (select session_id from main_session),
    '[{"account_code":"CASH_ON_HAND","declared":-1},{"account_code":"MPESA","declared":0}]'
  )$$,
  'P0001','invalid_declaration: account_code and nonnegative integer declared are required',
  'closing rejects negative declarations'
);

-- A second location starts from its own balance. Its count adds to the
-- company control account rather than replacing the first location's cash.
create temp table branch_session as
select public.open_cashier_session_at_location(
  (select branch_id from hardening_locations),
  '[{"account_code":"CASH_ON_HAND","declared":50},{"account_code":"MPESA","declared":0}]'
) as session_id;
grant select on pg_temp.branch_session to authenticated;

select ok((select session_id from branch_session) is not null,
  'a different location may open concurrently');

select is(
  public.account_balance((select company_id from hardening_fixture),'CASH_ON_HAND'),
  150::bigint,
  'company cash is the sum of both location balances'
);

select is(
  (select coalesce(sum(jl.debit)-sum(jl.credit),0)::bigint
   from public.ledger_journal_lines jl
   join public.ledger_accounts a on a.id=jl.account_id
   where jl.company_id=(select company_id from hardening_fixture)
     and jl.location_id=(select main_id from hardening_locations)
     and a.code='CASH_ON_HAND'),
  100::bigint,
  'main retains its own cash balance'
);

select is(
  (select coalesce(sum(jl.debit)-sum(jl.credit),0)::bigint
   from public.ledger_journal_lines jl
   join public.ledger_accounts a on a.id=jl.account_id
   where jl.company_id=(select company_id from hardening_fixture)
     and jl.location_id=(select branch_id from hardening_locations)
     and a.code='CASH_ON_HAND'),
  50::bigint,
  'branch retains its own cash balance'
);

select ok(
  (select bool_and(jl.location_id is not null)
   from public.ledger_journal_lines jl
   join public.ledger_accounts a on a.id=jl.account_id
   where jl.company_id=(select company_id from hardening_fixture)
     and a.code='CASH_ON_HAND'),
  'cash journal lines persist location attribution'
);

select set_config('app.business_location_id','',true);
select throws_ok(
  $$select public.post_expense(1,'CASH_ON_HAND','ambiguous')$$,
  'P0001','business_location_required: multiple cashier sessions are open',
  'location-less money posting cannot choose an arbitrary open till'
);

select is(
  public.close_cashier_session(
    (select session_id from main_session),
    '[{"account_code":"CASH_ON_HAND","declared":100},{"account_code":"MPESA","declared":0}]'
  ),
  (select session_id from main_session),
  'main closes against its location balance'
);

select is(
  public.close_cashier_session(
    (select session_id from branch_session),
    '[{"account_code":"CASH_ON_HAND","declared":50},{"account_code":"MPESA","declared":0}]'
  ),
  (select session_id from branch_session),
  'branch closes against its location balance'
);

select is(
  (select count(*)::int from public.cashier_sessions
   where company_id=(select company_id from hardening_fixture) and status='open'),
  0,
  'both location sessions are closed'
);

-- Supplier corrections are not available to a settlement-only cashier.
select testkit.as_user(
  (select company_id from hardening_fixture),
  '91000000-0000-4000-8000-000000000002',
  'Settlement-only cashier'
);

select throws_ok(
  $$select public.post_supplier_balance_adjustment(
    '91000000-0000-4000-8000-000000000004',100,'unauthorized correction'
  )$$,
  'P0001','permission_denied: ManageSupplierCreditPurchases required',
  'settlement-only cashier cannot adjust supplier AP'
);

select is(
  (select count(*)::int from public.ledger_journal_entries
   where company_id=(select company_id from hardening_fixture)
     and source_type='SupplierBalanceAdjustment'),
  0,
  'denied supplier adjustment posts no journal'
);

select testkit.as_user(
  (select company_id from hardening_fixture),
  '91000000-0000-4000-8000-000000000001',
  'Admin'
);

select ok(
  public.post_supplier_balance_adjustment(
    '91000000-0000-4000-8000-000000000004',100,'authorized correction'
  ) is not null,
  'supplier-credit manager may adjust supplier AP'
);

select is(
  (select coalesce(sum(jl.credit)-sum(jl.debit),0)::bigint
   from public.ledger_journal_lines jl
   join public.ledger_accounts a on a.id=jl.account_id
   where jl.company_id=(select company_id from hardening_fixture)
     and a.code='ACCOUNTS_PAYABLE'
     and jl.meta->>'supplierId'='91000000-0000-4000-8000-000000000004'),
  100::bigint,
  'authorized supplier adjustment changes AP'
);

reset role;

select is(public.cashier_session_required_for_source('PurchaseExpense'),true,
  'purchase expenses retain cashier session attribution');

select has_column('public','ledger_journal_entries','payload_hash',
  'journal entries persist a canonical payload hash');

create temp table hash_entry as
select public.post_journal_entry(
  (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
  '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100},{"account_code":"BALANCE_ADJUSTMENT","credit":100}]',
  current_date
) as entry_id;

select ok((select entry_id from hash_entry) is not null,
  'journal test entry posts');

select ok(
  (select length(payload_hash)=64 from public.ledger_journal_entries
   where id=(select entry_id from hash_entry)),
  'journal payload hash is stored'
);

select is(
  public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
    '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100},{"account_code":"BALANCE_ADJUSTMENT","credit":100}]',
    current_date
  ),
  (select entry_id from hash_entry),
  'an identical journal retry is idempotent'
);

select is(
  public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
    '[{"account_code":"BALANCE_ADJUSTMENT","credit":100},{"account_code":"ACCOUNTS_RECEIVABLE","debit":100}]',
    current_date
  ),
  (select entry_id from hash_entry),
  'journal line order does not change the canonical payload'
);

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Changed memo',
    '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100},{"account_code":"BALANCE_ADJUSTMENT","credit":100}]',
    current_date
  )$$,
  'P0001','journal_idempotency_conflict: source HashTest/stable-source was already posted with a different payload',
  'journal retry rejects a changed memo'
);

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
    '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100},{"account_code":"BALANCE_ADJUSTMENT","credit":100}]',
    current_date - 1
  )$$,
  'P0001','journal_idempotency_conflict: source HashTest/stable-source was already posted with a different payload',
  'journal retry rejects a changed date'
);

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
    '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100},{"account_code":"ACCOUNTS_PAYABLE","credit":100}]',
    current_date
  )$$,
  'P0001','journal_idempotency_conflict: source HashTest/stable-source was already posted with a different payload',
  'journal retry rejects changed accounts'
);

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from hardening_fixture),'HashTest','stable-source','Stable memo',
    '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":101},{"account_code":"BALANCE_ADJUSTMENT","credit":101}]',
    current_date
  )$$,
  'P0001','journal_idempotency_conflict: source HashTest/stable-source was already posted with a different payload',
  'journal retry rejects changed amounts'
);

select ok(
  strpos(
    pg_get_functiondef('public.close_accounting_period(date)'::regprocedure),
    'pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0))'
  ) > 0,
  'period closing uses a company-only advisory lock key'
);

select ok(
  strpos(pg_get_functiondef('public.close_accounting_period(date)'::regprocedure),
    'pg_advisory_xact_lock')
  < strpos(pg_get_functiondef('public.close_accounting_period(date)'::regprocedure),
    'select * into v_lock'),
  'period lock row is read after the company advisory lock'
);

select is(
  (select sum(debit)-sum(credit) from public.ledger_journal_lines
   where company_id=(select company_id from hardening_fixture)),
  0::numeric,
  'hardening scenarios preserve double-entry balance'
);

select * from finish();
rollback;
