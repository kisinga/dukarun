begin;
select plan(16);

select testkit.create_user(
  '96000000-0000-4000-8000-000000000001',
  'reconciliation-admin@test.local'
);

create temp table reconciliation_company as
select testkit.provision(
  '96000000-0000-4000-8000-000000000001',
  'Reconciliation Co'
) as company_id;
grant select on pg_temp.reconciliation_company to authenticated;

select testkit.as_user(
  (select company_id from reconciliation_company),
  '96000000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  (select count(*)::integer from public.list_reconcilable_accounts()),
  3,
  'only real-money accounts are reconcilable'
);

select results_eq(
  $$select account_code::text from public.list_reconcilable_accounts() order by account_code$$,
  $$values ('BANK_MAIN'), ('CASH_ON_HAND'), ('MPESA')$$,
  'bank appears even though it is not cashier controlled'
);

create temp table bank_first as
select public.record_manual_reconciliation(
  '[{"account_code":"BANK_MAIN","declared":1000,"reason":"Opening bank statement"}]'
) as reconciliation_id;

select ok(
  (select reconciliation_id from bank_first) is not null,
  'bank can be reconciled independently'
);

select is(
  public.account_balance((select company_id from reconciliation_company), 'BANK_MAIN'),
  1000::bigint,
  'reconciliation sets the company-wide book balance'
);

select is(
  (
    select ra.reason
    from public.reconciliation_accounts ra
    where ra.reconciliation_id = (select reconciliation_id from bank_first)
  ),
  'Opening bank statement',
  'adjustment reason is stored with reconciliation history'
);

select throws_ok(
  $$select public.record_manual_reconciliation(
    '[{"account_code":"ACCOUNTS_PAYABLE","declared":100,"reason":"Unsafe"}]'
  )$$,
  'P0001',
  'account_not_reconcilable: ACCOUNTS_PAYABLE',
  'supplier control account cannot be reconciled here'
);

select throws_ok(
  $$select public.record_manual_reconciliation(
    '[{"account_code":"MPESA","declared":100}]'
  )$$,
  'P0001',
  'invalid_reason: reason required when balance changes',
  'balance changes require an audit reason'
);

create temp table cash_first as
select public.record_manual_reconciliation(
  '[{"account_code":"CASH_ON_HAND","declared":1000,"reason":"Cash count"}]'
) as reconciliation_id;

select ok(
  (select reconciliation_id from cash_first) is not null,
  'cash reconciliation records independently'
);

create temp table bank_second as
select public.record_manual_reconciliation(
  '[{"account_code":"BANK_MAIN","declared":2000,"reason":"Later bank statement"}]'
) as reconciliation_id;

select ok(
  (select reconciliation_id from bank_second) is not null,
  'a later bank reconciliation records'
);

select ok(
  public.revert_variance(
    (
      select ra.id
      from public.reconciliation_accounts ra
      where ra.reconciliation_id = (select reconciliation_id from cash_first)
    ),
    'Cash correction was entered twice'
  ) is not null,
  'newer bank activity does not expire cash reversal'
);

create temp table cash_second as
select public.record_manual_reconciliation(
  '[{"account_code":"CASH_ON_HAND","declared":500,"reason":"Second cash count"}]'
) as reconciliation_id;

select ok(
  (select reconciliation_id from cash_second) is not null,
  'second cash reconciliation records'
);

create temp table cash_third as
select public.record_manual_reconciliation(
  '[{"account_code":"CASH_ON_HAND","declared":700,"reason":"Third cash count"}]'
) as reconciliation_id;

select ok(
  (select reconciliation_id from cash_third) is not null,
  'third cash reconciliation records'
);

select throws_ok(
  format(
    $$select public.revert_variance('%s', 'Too late')$$,
    (
      select ra.id
      from public.reconciliation_accounts ra
      where ra.reconciliation_id = (select reconciliation_id from cash_second)
    )
  ),
  'P0001',
  'variance_revert_expired: newer reconciliation activity exists',
  'newer activity on the same account expires reversal'
);

select ok(
  public.record_manual_reconciliation(
    '[{"account_code":"MPESA","declared":0}]'
  ) is not null,
  'matching zero balance can be verified without a reason'
);

select ok(
  public.close_accounting_period(current_date) is not null,
  'system-controlled customer credit does not block period closing'
);

select is(
  (
    select count(*)::integer
    from public.reconciliation_accounts ra
    where ra.account_code = 'ACCOUNTS_PAYABLE'
  ),
  0,
  'supplier control account remains untouched'
);

select * from finish();
rollback;
