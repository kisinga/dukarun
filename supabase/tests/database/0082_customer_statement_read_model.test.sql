begin;
select plan(16);

select has_function(
  'public',
  'customer_statement',
  array['uuid','timestamp with time zone','uuid','integer'],
  'customer statement is resolved server-side'
);

select testkit.create_user('82000000-0000-4000-8000-000000000001','statement-model@test.local');
select testkit.create_user('82000000-0000-4000-8000-000000000005','statement-clerk@test.local');
create temp table statement_company as select testkit.provision(
  '82000000-0000-4000-8000-000000000001','Statement Model Store') company_id;
grant select on pg_temp.statement_company to authenticated;
select testkit.add_member(
  (select company_id from statement_company),
  '82000000-0000-4000-8000-000000000005',
  'Statement Clerk',
  array['ManageCustomers']
);

insert into public.products(id,company_id,name)
select '82000000-0000-4000-8000-000000000002',company_id,'Statement Service'
from statement_company;
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,wholesale_price,kind,track_inventory
)
select '82000000-0000-4000-8000-000000000003',
  '82000000-0000-4000-8000-000000000002',company_id,'Default','STATEMENT-SERVICE',
  10000,6000,'service',false from statement_company;
insert into public.customers(
  id,company_id,first_name,is_credit_approved,credit_limit
)
select '82000000-0000-4000-8000-000000000004',company_id,'Statement Customer',true,100000
from statement_company;

select testkit.as_user((select company_id from statement_company),
  '82000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

create temp table statement_sale as select public.post_sale(
  '82000000-0000-4000-8000-000000000004',
  '[{"variant_id":"82000000-0000-4000-8000-000000000003","quantity":1,"unit_price":10000}]',
  '[]') order_id;
create temp table statement_payment as select public.post_payment_allocation(
  (select order_id from statement_sale),4000,'cash','STATEMENT-PAY') payment_id;
select public.post_balance_adjustment(
  '82000000-0000-4000-8000-000000000004',1000,'Statement correction');
create temp table reversible_payment as select public.post_payment_allocation(
  (select order_id from statement_sale),1000,'cash','STATEMENT-REVERSIBLE') payment_id;
select public.post_payment_reversal(
  (select payment_id from reversible_payment),'Statement reversal');

create temp table voided_statement_sale as select public.post_sale(
  '82000000-0000-4000-8000-000000000004',
  '[{"variant_id":"82000000-0000-4000-8000-000000000003","quantity":1,"unit_price":2000}]',
  '[]') order_id;
select public.void_sale((select order_id from voided_statement_sale),'Statement void');

select is((select count(*)::int from public.customer_statement(
  '82000000-0000-4000-8000-000000000004')),7,
  'statement is sourced from every customer AR ledger event');
select is((select debit from public.customer_statement(
  '82000000-0000-4000-8000-000000000004')
  where reference=(select code from public.orders where id=(select order_id from statement_sale))),
  10000::bigint,'credit sale increases the running account');
select is((select credit from public.customer_statement(
  '82000000-0000-4000-8000-000000000004') where reference='STATEMENT-PAY'),4000::bigint,
  'payment allocation reduces the running account');
select is((select debit from public.customer_statement(
  '82000000-0000-4000-8000-000000000004') where description='Statement correction'),1000::bigint,
  'balance adjustment is included');
select is((select debit from public.customer_statement(
  '82000000-0000-4000-8000-000000000004') where description='Reversed payment'),1000::bigint,
  'payment reversal restores the customer balance');
select is((select credit from public.customer_statement(
  '82000000-0000-4000-8000-000000000004') where description='Voided sale'),
  (select total::bigint from public.orders where id=(select order_id from voided_statement_sale)),
  'order reversal removes the voided credit sale');
select is((select balance from public.customer_statement(
  '82000000-0000-4000-8000-000000000004') limit 1),7000::bigint,
  'latest statement row has the authoritative running balance');
select is((select balance from public.customer_ar_balances
  where customer_id='82000000-0000-4000-8000-000000000004'),7000::bigint,
  'statement balance agrees with the AR balance projection');

create temp table statement_page_one as select * from public.customer_statement(
  '82000000-0000-4000-8000-000000000004',null,null,2);
select is((select count(*)::int from statement_page_one),2,
  'first statement page obeys its row bound');
select ok((select bool_and(has_more) from statement_page_one),
  'first statement page reports older activity');
create temp table statement_page_two as select * from public.customer_statement(
  '82000000-0000-4000-8000-000000000004',
  (select date from statement_page_one order by date,id limit 1),
  (select id from statement_page_one order by date,id limit 1),2);
select is((select count(*)::int from statement_page_two),2,
  'cursor returns the next bounded statement page');
select is((select count(*)::int from statement_page_two p
  join statement_page_one first_page using(id)),0,
  'cursor pages do not overlap');
select ok((select bool_and(has_more) from statement_page_two),
  'second statement page still reports its remaining history');

select testkit.as_user((select company_id from statement_company),
  '82000000-0000-4000-8000-000000000005','Statement Clerk');
select throws_ok(
  $$select * from public.customer_statement('82000000-0000-4000-8000-000000000004')$$,
  'P0001','permission_denied: ViewFinancials required',
  'role without ViewFinancials cannot read customer statements'
);

select testkit.as_user((select company_id from statement_company),
  '82000000-0000-4000-8000-000000000001','Admin');
select is((select count(*)::int from public.customer_statement(
  '82000000-0000-4000-8000-000000000099')),0,
  'unknown customer returns no statement rows');

select * from finish();
rollback;
