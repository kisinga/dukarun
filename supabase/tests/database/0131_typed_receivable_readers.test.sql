begin;
select no_plan();

select testkit.create_user('a1970000-0000-4000-8000-000000000001','typed-ar@test.local');
select testkit.create_user('a1970000-0000-4000-8000-000000000002','typed-ar-other@test.local');
create temp table fixture as select testkit.provision(
  'a1970000-0000-4000-8000-000000000001','Typed AR readers') company_id;
create temp table other_fixture as select testkit.provision(
  'a1970000-0000-4000-8000-000000000002','Other typed AR readers') company_id;
select set_config('request.jwt.claims',testkit.claims((select company_id from fixture),
  'a1970000-0000-4000-8000-000000000001','Admin'),true);
select testkit.ensure_open_session();
insert into public.customers(id,company_id,first_name,phone,is_credit_approved,credit_limit,
  notifications_enabled,sms_notifications_enabled)
select 'a1970000-0000-4000-8000-000000000003',company_id,'Typed customer','+254700000197',
  true,10000,true,true from fixture;
insert into public.products(id,company_id,name)
select 'a1970000-0000-4000-8000-000000000004',company_id,'Typed service' from fixture;
insert into public.product_variants(id,company_id,product_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1970000-0000-4000-8000-000000000005',company_id,
  'a1970000-0000-4000-8000-000000000004','Default','TYPED-AR','service',1000,1000,false from fixture;
create temp table invoice as select (public.post_sale_at_location(null,
  'a1970000-0000-4000-8000-000000000003',
  '[{"variant_id":"a1970000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
  '[]',false,'typed-ar-invoice')->>'order_id')::uuid id;

-- A valid order-scoped journal need not duplicate customer identity in JSON.
create temp table correction as select public.post_journal_entry(
  (select company_id from fixture),'TypedReceivableTest','typed-ar-correction','Typed AR correction',
  jsonb_build_array(
    jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',100,'order_id',(select id from invoice)),
    jsonb_build_object('account_code','BALANCE_ADJUSTMENT','debit',100))) id;
select lives_ok('set constraints all immediate','order-only AR entry satisfies every ledger invariant');
set constraints all deferred;
select is((select customer_id from public.ledger_journal_lines
  where entry_id=(select id from correction) and order_id=(select id from invoice)),
  'a1970000-0000-4000-8000-000000000003'::uuid,'AR owner is inferred and stored in the typed link');
select ok(not exists(select 1 from public.ledger_journal_lines
  where entry_id=(select id from correction) and meta ? 'customerId'),
  'readers do not require a second customer identity in JSON');
select is(public.customer_ledger_balance((select company_id from fixture),
  'a1970000-0000-4000-8000-000000000003'),900::bigint,'canonical customer balance is 900');
select is(public.order_receivable_ledger_balance_core((select id from invoice)),900::bigint,
  'canonical invoice balance is 900');
select is(public.customer_credit_exposure((select company_id from fixture),
  'a1970000-0000-4000-8000-000000000003'),900::bigint,'credit exposure is 900');

select testkit.as_user((select company_id from fixture),'a1970000-0000-4000-8000-000000000001','Admin');
select is((select balance from public.customer_ar_balances
  where customer_id='a1970000-0000-4000-8000-000000000003'),900::bigint,'AR balance view includes order-only entry');
select is((select receivable_balance from public.customer_account_balances
  where customer_id='a1970000-0000-4000-8000-000000000003'),900::bigint,'account AR includes order-only entry');
select is((select net_balance from public.customer_account_balances
  where customer_id='a1970000-0000-4000-8000-000000000003'),900::bigint,'account net includes order-only entry');
select is((select balance from public.customer_credit_aging
  where customer_id='a1970000-0000-4000-8000-000000000003'),900::bigint,'aging includes order-only entry');
select is((select sum(debit-credit)::bigint from public.customer_statement(
  'a1970000-0000-4000-8000-000000000003')),900::bigint,'statement activities include order-only entry');
select is((public.credit_health_dashboard()->'metrics'->>'receivables')::bigint,900::bigint,
  'dashboard total includes order-only entry');
select is((public.preview_customer_statement('a1970000-0000-4000-8000-000000000003','sms')
  ->>'account_balance')::bigint,900::bigint,'message preview includes order-only entry');
reset role;

create temp table statement_token as select public.issue_customer_statement_link(
  (select company_id from fixture),'a1970000-0000-4000-8000-000000000003') token;
grant select on statement_token to anon;
set local role anon;
create temp table statement as select public.public_customer_statement((select token from statement_token)) data;
select is((select (data->>'account_balance')::bigint from statement),900::bigint,
  'public statement total includes order-only entry');
select is((select (data->'orders'->0->>'balance')::bigint from statement),900::bigint,
  'public statement invoice includes order-only entry');
select is((select sum((entry->>'debit')::bigint-(entry->>'credit')::bigint)::bigint
  from statement,jsonb_array_elements(data->'activities') entry),900::bigint,
  'public statement activities include order-only entry');
reset role;

-- The typed identity must also drive the write-time business-limit guard.
update public.customers set credit_limit=900 where id='a1970000-0000-4000-8000-000000000003';
insert into public.orders(id,company_id,code,customer_id,status,total,is_credit_sale,receivable_kind,completed_at)
select 'a1970000-0000-4000-8000-000000000006',company_id,'TYPED-LIMIT',
  'a1970000-0000-4000-8000-000000000003','completed',100,true,'credit',now() from fixture;
select throws_like($$select public.post_journal_entry((select company_id from fixture),
  'CreditSale','a1970000-0000-4000-8000-000000000006','Metadata-free credit limit test',
  '[{"account_code":"ACCOUNTS_RECEIVABLE","debit":100,"order_id":"a1970000-0000-4000-8000-000000000006"},
    {"account_code":"SALES","credit":100}]')$$,
  'credit_limit_exceeded:%','omitting JSON customer identity cannot bypass the credit limit');

select testkit.as_user((select company_id from other_fixture),
  'a1970000-0000-4000-8000-000000000002','Admin');
select is((select count(*) from public.customer_ar_balances
  where customer_id='a1970000-0000-4000-8000-000000000003'),0::bigint,'typed AR view retains tenant isolation');
select is((select count(*) from public.customer_account_balances
  where customer_id='a1970000-0000-4000-8000-000000000003'),0::bigint,'account view retains tenant isolation');
select is((select count(*) from public.customer_credit_aging
  where customer_id='a1970000-0000-4000-8000-000000000003'),0::bigint,'aging retains tenant isolation');
reset role;
select * from finish();
rollback;
