begin;
select plan(6);

select testkit.create_user(
  '11800000-0000-4000-8000-000000000001',
  'legacy-account-reconciliation@test.local'
);
create temp table legacy_account_fixture as
select testkit.provision(
  '11800000-0000-4000-8000-000000000001',
  'Legacy Account Reconciliation Store'
) company_id;
select set_config(
  'request.jwt.claims',
  testkit.claims(
    (select company_id from legacy_account_fixture),
    '11800000-0000-4000-8000-000000000001',
    'Admin'
  ),
  true
);

insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '11800000-0000-4000-8000-000000000002',company_id,
  'Legacy Customer',true,10000
from legacy_account_fixture;

-- Model a migrated account whose source documents say 2,522 while the
-- immutable AR journal and the balance preserved at migration say 1,900.
-- Both sides are written in one transaction because the account-integrity
-- constraints are deferred until transaction completion.
insert into public.orders(
  id,company_id,code,customer_id,status,total,is_credit_sale,receivable_kind
)
select '11800000-0000-4000-8000-000000000003',company_id,'LEGACY-ACCOUNT-1',
  '11800000-0000-4000-8000-000000000002','completed',2522,true,'credit'
from legacy_account_fixture;

insert into public.legacy_customer_account_reconciliations(
  id,company_id,customer_id,amount,ledger_balance,prior_document_balance,reason
)
select '11800000-0000-4000-8000-000000000004',company_id,
  '11800000-0000-4000-8000-000000000002',-622,1900,2522,
  'Regression fixture: preserve migrated customer balance'
from legacy_account_fixture;

select public.post_journal_entry(
  (select company_id from legacy_account_fixture),
  'LegacyAccountReconciliationFixture',
  'legacy-account-reconciliation-fixture',
  'Legacy customer account balance',
  jsonb_build_array(
    jsonb_build_object(
      'account_code','ACCOUNTS_RECEIVABLE',
      'debit',1900,
      'order_id','11800000-0000-4000-8000-000000000003',
      'meta',jsonb_build_object(
        'customerId','11800000-0000-4000-8000-000000000002',
        'orderCode','LEGACY-ACCOUNT-1'
      )
    ),
    jsonb_build_object(
      'account_code','SALES',
      'credit',1900,
      'order_id','11800000-0000-4000-8000-000000000003',
      'meta',jsonb_build_object('orderCode','LEGACY-ACCOUNT-1')
    )
  )
);

select ok(
  position(
    'legacy_customer_account_reconciliations'
    in pg_get_functiondef('public.customer_document_balance(uuid,uuid)'::regprocedure)
  ) > 0,
  'customer document balance retains the explicit migration reconciliation source'
);
select is(
  (select sum(o.total-coalesce(paid.amount,0))::bigint
   from public.orders o
   left join lateral (
     select sum(p.amount)::bigint amount
     from public.payments p
     where p.order_id=o.id and p.status='settled'
   ) paid on true
   where o.customer_id='11800000-0000-4000-8000-000000000002'
     and o.receivable_kind in ('credit','cod') and o.status='completed'),
  2522::bigint,
  'source documents retain their pre-reconciliation balance'
);
select is(
  public.customer_document_balance(
    (select company_id from legacy_account_fixture),
    '11800000-0000-4000-8000-000000000002'
  ),
  1900::bigint,
  'document balance applies the durable migration reconciliation'
);
select is(
  public.customer_ledger_balance(
    (select company_id from legacy_account_fixture),
    '11800000-0000-4000-8000-000000000002'
  ),
  1900::bigint,
  'AR control balance retains the migrated amount'
);
select lives_ok(
  format(
    'select public.assert_customer_account_consistent(%L::uuid,%L::uuid)',
    (select company_id from legacy_account_fixture),
    '11800000-0000-4000-8000-000000000002'
  ),
  'legacy reconciliation satisfies the canonical account invariant'
);
select lives_ok(
  'set constraints orders_account_consistency, journal_lines_account_consistency immediate',
  'deferred account constraints accept the reconciled legacy account'
);

select * from finish();
rollback;
