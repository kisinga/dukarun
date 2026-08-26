begin;
select plan(17);

select testkit.create_user('c1200000-0000-4000-8000-000000000001','money-account-admin@test.local');
select testkit.create_user('c1200000-0000-4000-8000-000000000002','money-account-cashier@test.local');

create temp table money_account_fixture as
select testkit.provision(
  'c1200000-0000-4000-8000-000000000001','Selectable Accounts Store'
) company_id;
grant select on pg_temp.money_account_fixture to authenticated;

select testkit.add_member(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000002','Cashier','{SettleOrder}'
);
select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000001','Admin'
);

create temp table money_account_location as
select id from public.stock_locations
where company_id=(select company_id from money_account_fixture) and is_default;
grant select on pg_temp.money_account_location to authenticated;

select is(
  (select money_account_kind from public.ledger_accounts
   where company_id=(select company_id from money_account_fixture) and code='BANK_MAIN'),
  'bank','seed bank account is categorized'
);
select is(
  (select money_account_kind from public.ledger_accounts
   where company_id=(select company_id from money_account_fixture) and code='MPESA'),
  'mpesa','seed M-PESA account is categorized'
);

create temp table created_money_accounts as
select public.create_money_account('bank','Equity Westlands') bank_id,
       public.create_money_account('mpesa','M-PESA Till 123456') mpesa_id;
grant select on pg_temp.created_money_accounts to authenticated;

select is(
  (select count(*)::int from public.ledger_accounts
   where company_id=(select company_id from money_account_fixture)
     and money_account_kind is not null and is_active),
  4,'customers can add Bank and M-PESA accounts without creating arbitrary ledger types'
);

select results_eq(
  $$select method_code,count(*)::int from public.available_tender_accounts(
      (select id from money_account_location)) group by method_code order by method_code$$,
  $$values ('bank',2),('mpesa',2)$$,
  'checkout exposes every active account in the matching category'
);

select public.set_location_payment_account(
  (select id from money_account_location),'mpesa',
  (select code from public.ledger_accounts where id=(select mpesa_id from created_money_accounts))
);

select is(
  (select account_name from public.available_tender_accounts((select id from money_account_location))
   where method_code='mpesa' and is_default),
  'M-PESA Till 123456','location default is explicit and returned to checkout'
);

select public.set_payment_method_locations(
  'mpesa',array[(select id from money_account_location)],true
);
select is(
  (select lpm.ledger_account_code from public.location_payment_methods lpm
   join public.payment_methods pm on pm.id=lpm.payment_method_id
   where lpm.location_id=(select id from money_account_location) and pm.code='mpesa'),
  (select code from public.ledger_accounts where id=(select mpesa_id from created_money_accounts)),
  'changing method availability preserves its location default'
);

reset role;
create temp table linked_mpesa_provider as
with provider_account as (
  insert into public.payment_provider_accounts(
    company_id,provider,environment,display_name,status,ledger_account_code
  )
  select company_id,'mpesa','production','Seed M-PESA till','active','MPESA'
  from money_account_fixture
  returning id,company_id
), mapped as (
  insert into public.location_payment_provider_accounts(
    location_id,company_id,provider,provider_account_id
  )
  select (select id from money_account_location),company_id,'mpesa',id
  from provider_account
)
select id from provider_account;
grant select on pg_temp.linked_mpesa_provider to authenticated;
select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000001','Admin'
);
select is(
  (select account_code from public.available_tender_accounts((select id from money_account_location))
   where method_code='mpesa' and is_default),
  'MPESA','active M-PESA provider link becomes the checkout default'
);
reset role;
update public.payment_provider_accounts
set status='disabled',disabled_at=now()
where id=(select id from linked_mpesa_provider);
select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000001','Admin'
);

select throws_ok(
  $$select public.set_location_payment_account(
    (select id from money_account_location),'bank',
    (select code from public.ledger_accounts where id=(select mpesa_id from created_money_accounts)))$$,
  'P0001','payment_account_not_available: ' ||
    (select code from public.ledger_accounts where id=(select mpesa_id from created_money_accounts)),
  'a default must match the payment account category'
);

select throws_ok(
  $$select public.update_money_account(
    (select mpesa_id from created_money_accounts),null,false)$$,
  'P0001','money_account_is_location_default',
  'a location default cannot be archived'
);

reset role;
insert into public.products(id,company_id,name)
select 'c1200000-0000-4000-8000-000000000101',company_id,'Service' from money_account_fixture;
insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,track_inventory
)
select 'c1200000-0000-4000-8000-000000000102',
  'c1200000-0000-4000-8000-000000000101',company_id,
  'Default','service','ACCOUNT-SVC',100,false from money_account_fixture;

select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000001','Admin'
);

create temp table money_account_session as
select public.open_cashier_session_at_location(
  (select id from money_account_location),
  jsonb_build_array(
    jsonb_build_object('account_code','CASH_ON_HAND','declared',0),
    jsonb_build_object(
      'account_code',(select code from public.ledger_accounts
        where id=(select mpesa_id from created_money_accounts)),'declared',0)
  )
) session_id;
grant select on pg_temp.money_account_session to authenticated;

create temp table selected_account_sale as
select public.post_sale(
  null,
  '[{"variant_id":"c1200000-0000-4000-8000-000000000102","quantity":1,"unit_price":100}]',
  jsonb_build_array(jsonb_build_object(
    'method','mpesa','amount',100,'reference','QGH7X2K1','account_code','MPESA'
  ))
) order_id;

select is(
  (select ledger_account_code from public.payments
   where order_id=(select order_id from selected_account_sale)),
  'MPESA','payment preserves the explicitly selected non-default account'
);
select is(
  (select a.code from public.ledger_journal_lines l
   join public.ledger_accounts a on a.id=l.account_id
   join public.ledger_journal_entries e on e.id=l.entry_id
   where e.source_type='Payment' and l.debit=100 and l.order_id=(select order_id from selected_account_sale)),
  'MPESA','sale journal debits the selected account'
);

select is(
  (select count(*)::int from public.cashier_count_accounts(
    (select id from money_account_location),(select session_id from money_account_session))),
  3,'closing includes defaults plus a non-default controlled account used during the session'
);
select ok(
  exists(select 1 from public.cashier_expected_balances(
    (select id from money_account_location),(select session_id from money_account_session))
    where account_code='MPESA' and expected_balance=100),
  'closing guidance includes the used non-default M-PESA balance'
);

select public.close_cashier_session(
  (select session_id from money_account_session),
  jsonb_build_array(
    jsonb_build_object('account_code','CASH_ON_HAND','declared',0),
    jsonb_build_object('account_code','MPESA','declared',100),
    jsonb_build_object(
      'account_code',(select code from public.ledger_accounts
        where id=(select mpesa_id from created_money_accounts)),'declared',0)
  )
);
select is(
  (select status from public.cashier_sessions where id=(select session_id from money_account_session)),
  'closed','dynamic cashier account set validates and closes normally'
);

select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000002','Cashier'
);
select throws_ok(
  $$select public.create_money_account('bank','Unauthorized Bank')$$,
  'P0001','permission_denied: ManageReconciliation required',
  'settlement permission alone cannot manage accounts'
);

select testkit.as_user(
  (select company_id from money_account_fixture),
  'c1200000-0000-4000-8000-000000000001','Admin'
);
select public.update_money_account(
  (select bank_id from created_money_accounts),'Equity Main',null
);
select is(
  (select name from public.ledger_accounts where id=(select bank_id from created_money_accounts)),
  'Equity Main','account names can change without changing their stable ledger code'
);

select throws_ok(
  $$select public.update_money_account(
    (select bank_id from created_money_accounts),'Bank - Main',null)$$,
  'P0001','money_account_name_exists',
  'duplicate active account names return a clean domain error'
);

select * from finish();
rollback;
