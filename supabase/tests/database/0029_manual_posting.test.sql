-- Manual-posting account tests (migration 0029): allow_manual_posting flags,
-- MPESA rename, and the tightened account validator.
begin;
select plan(6);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@manual.local');

create temp table mp_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Manual Co') as company_id;
grant select on pg_temp.mp_company to authenticated;

select testkit.as_user((select company_id from mp_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- 1-2. Exactly the three real money accounts are manually transactable.
select is(
  (select count(*)::int from public.ledger_accounts
   where company_id = (select company_id from mp_company) and allow_manual_posting),
  3,
  'exactly 3 accounts allow manual posting'
);

select results_eq(
  $$select code::text from public.ledger_accounts
    where allow_manual_posting order by code$$,
  $$values ('BANK_MAIN'), ('CASH_ON_HAND'), ('MPESA')$$,
  'manual posting accounts are BANK_MAIN, CASH_ON_HAND, MPESA'
);

-- 3. M-Pesa is a real money account: expenses can be paid from it.
select ok(
  public.post_expense(1000, 'MPESA', 'airtime') is not null,
  'expense paid from MPESA posts'
);

-- 4-5. System-only asset leaves are rejected as expense sources.
select throws_ok(
  $$select public.post_expense(5000, 'ACCOUNTS_RECEIVABLE')$$,
  'P0001', 'invalid_source_account: ACCOUNTS_RECEIVABLE',
  'expense source cannot be ACCOUNTS_RECEIVABLE'
);

select throws_ok(
  $$select public.post_expense(5000, 'CLEARING_GENERIC')$$,
  'P0001', 'invalid_source_account: CLEARING_GENERIC',
  'expense source cannot be CLEARING_GENERIC'
);

-- 6. Transfers are gated too (system account as destination).
select throws_ok(
  $$select public.post_transfer('CASH_ON_HAND', 'CLEARING_GENERIC', 1000, 0, 'tr-manual-denied')$$,
  'P0001', 'invalid_source_account: CLEARING_GENERIC',
  'transfer destination cannot be CLEARING_GENERIC'
);

select * from finish();
rollback;
