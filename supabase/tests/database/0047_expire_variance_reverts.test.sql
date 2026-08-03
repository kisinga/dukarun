-- Variance reversals expire as soon as a newer reconciliation is recorded.
begin;
select plan(1);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@expired-variance.local');
create temp table evr_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Expired Variance Co'
) as company_id;

select testkit.as_user(
  (select company_id from evr_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

create temp table evr_first_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":0},
  {"account_code":"MPESA","declared":0}
]') as session_id;

select public.close_cashier_session((select session_id from evr_first_session), '[
  {"account_code":"CASH_ON_HAND","declared":1000},
  {"account_code":"MPESA","declared":0}
]');

-- The next opening is a newer reconciliation and closes the prior review window.
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":1000},
  {"account_code":"MPESA","declared":0}
]');

select throws_ok(
  format($$select public.revert_variance((
    select ra.id
    from public.reconciliation_accounts ra
    join public.reconciliations r on r.id = ra.reconciliation_id
    where r.scope_ref_id = '%s:closing'
      and ra.account_code = 'CASH_ON_HAND'
  ))$$, (select session_id from evr_first_session)),
  'P0001',
  'variance_revert_expired: newer reconciliation activity exists',
  'new session permanently expires the previous variance revert'
);

select * from finish();
rollback;
