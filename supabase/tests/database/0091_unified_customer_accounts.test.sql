begin;
select plan(36);

select has_table('public','customer_receipts','customer receipts have a parent record');
select has_view('public','customer_account_balances','unified customer balance view exists');
select has_function('public','post_customer_receipt',
  array['uuid','uuid','bigint','text','text','text'],'customer receipt RPC exists');
select has_function('public','post_credit_sale_at_location',
  array['uuid','uuid','jsonb','text','uuid','text'],'automatic account sale RPC exists');
select has_function('public','post_customer_receipt_reversal',
  array['uuid','text'],'whole receipt reversal RPC exists');
select testkit.create_user('91000000-0000-4000-8000-000000000001','accounts-admin@test.local');
select testkit.create_user('91000000-0000-4000-8000-000000000002','accounts-cashier@test.local');
create temp table account_fixture as select testkit.provision(
  '91000000-0000-4000-8000-000000000001','Unified Account Store') company_id;
grant select on pg_temp.account_fixture to authenticated;
select testkit.add_member((select company_id from account_fixture),
  '91000000-0000-4000-8000-000000000002','Receipt cashier',array['SettleOrder']);

insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '91000000-0000-4000-8000-000000000010',company_id,'Account Customer',true,10000
from account_fixture;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '91000000-0000-4000-8000-000000000011',company_id,'Deposit Only',false,0
from account_fixture;
insert into public.customers(id,company_id,first_name,is_supplier)
select '91000000-0000-4000-8000-000000000012',company_id,'Stock Supplier',true
from account_fixture;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '91000000-0000-4000-8000-000000000015',company_id,'Receipt reversal',true,1000
from account_fixture;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '91000000-0000-4000-8000-000000000016',company_id,'Approval split',true,150
from account_fixture;
insert into public.products(id,company_id,name)
select '91000000-0000-4000-8000-000000000013',company_id,'Account Item' from account_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '91000000-0000-4000-8000-000000000014','91000000-0000-4000-8000-000000000013',
  company_id,'Default','ACCOUNT-ITEM',100,50 from account_fixture;

select testkit.as_user((select company_id from account_fixture),
  '91000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
select public.record_purchase_complete('91000000-0000-4000-8000-000000000012',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":30,"unit_cost":50}]',
  '[]',1500,'ACCOUNT-STOCK','CASH_ON_HAND');

create temp table account_orders as
select (public.post_sale_at_location(null,'91000000-0000-4000-8000-000000000010',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":1,"unit_price":100}]',
  '[]',false,'account-order-1')->>'order_id')::uuid id
union all
select (public.post_sale_at_location(null,'91000000-0000-4000-8000-000000000010',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":2,"unit_price":100}]',
  '[]',false,'account-order-2')->>'order_id')::uuid;

create temp table cash_receipt as select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000010',350,'cash',null,'account-receipt-1') result;
select is((select result->>'status' from cash_receipt),'completed','customer receipt posts');
select is((select (result->>'applied_amount')::bigint from cash_receipt),300::bigint,
  'receipt applies all open invoices first');
select is((select (result->>'downpayment_amount')::bigint from cash_receipt),50::bigint,
  'receipt remainder becomes downpayment');
select is((select count(*)::int from public.payments where customer_receipt_id=
  (select (result->>'receipt_id')::uuid from cash_receipt)),2,
  'receipt records one payment allocation per invoice');
select is((select count(*)::int from public.ledger_journal_entries where source_type='CustomerReceipt'
  and source_id=(select result->>'receipt_id' from cash_receipt)),1,
  'one receipt creates one journal event');
select ok(not exists(select 1 from public.ledger_journal_entries e
  join lateral(select sum(l.debit) debit,sum(l.credit) credit from public.ledger_journal_lines l
    where l.entry_id=e.id) totals on true
  where e.source_type='CustomerReceipt' and totals.debit<>totals.credit),
  'customer receipt journal is balanced');
select is((select net_balance from public.customer_account_balances
  where customer_id='91000000-0000-4000-8000-000000000010'),-50::bigint,
  'unified account view reports a customer credit balance');
select is((public.post_customer_receipt(null,'91000000-0000-4000-8000-000000000010',350,
  'cash',null,'account-receipt-1')->>'receipt_id'),(select result->>'receipt_id' from cash_receipt),
  'same client reference and payload replays the receipt');
select public.update_payment_method('cash',false,null,null);
select is((public.post_customer_receipt(null,'91000000-0000-4000-8000-000000000010',350,
  'cash',null,'account-receipt-1')->>'receipt_id'),(select result->>'receipt_id' from cash_receipt),
  'completed receipt replays after its payment method is disabled');
select public.update_payment_method('cash',true,null,null);
select is((select min(l.meta->>'openSessionId') from public.ledger_journal_entries e
  join public.ledger_journal_lines l on l.entry_id=e.id
  where e.source_type='CustomerReceipt' and e.source_id=(select result->>'receipt_id' from cash_receipt)),
  (select cashier_session_id::text from public.customer_receipts
    where id=(select (result->>'receipt_id')::uuid from cash_receipt)),
  'receipt journal retains the session captured when the receipt was submitted');
select throws_ok($$select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000010',351,'cash',null,'account-receipt-1')$$,
  'P0001','client_ref_payload_mismatch','client reference cannot replay a different payload');
select throws_ok(format($$select public.post_payment_reversal(%L,'Wrong reversal surface')$$,
  (select id from public.payments where customer_receipt_id=
    (select (result->>'receipt_id')::uuid from cash_receipt) limit 1)),
  'P0001',format('reverse_parent_customer_receipt: %s',
    (select result->>'receipt_id' from cash_receipt)),
  'receipt allocations cannot be reversed independently');

create temp table deposit_receipt as select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000011',100,'cash',null,'deposit-only-receipt') result;
create temp table covered_sale as select public.post_credit_sale_at_location(null,
  '91000000-0000-4000-8000-000000000011',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":1,"unit_price":100}]',
  'covered-account-sale',null,null) result;
select is((select result->>'status' from covered_sale),'completed',
  'downpayment may fully cover an unapproved customer sale');
select is((select (result->>'credit_amount')::bigint from covered_sale),0::bigint,
  'fully covered sale creates no residual credit');
select is(public.customer_deposit_available('91000000-0000-4000-8000-000000000011'),0::bigint,
  'automatic account sale consumes available downpayment');
select throws_ok(format($$select public.post_customer_receipt_reversal(%L,'Consumed funds')$$,
  (select (result->>'receipt_id')::uuid from deposit_receipt)),
  'P0001','receipt_has_dependent_activity: downpayment was applied or refunded',
  'receipt reversal explains dependent downpayment activity');

create temp table reversible_receipt as select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000011',75,'cash',null,'reversible-receipt') result;
select is((public.post_customer_receipt_reversal(
  (select (result->>'receipt_id')::uuid from reversible_receipt),'Duplicate receipt')->>'status'),
  'completed','unused whole receipt reverses atomically');
select is((select status from public.customer_deposits where customer_receipt_id=
  (select (result->>'receipt_id')::uuid from reversible_receipt)),'reversed',
  'whole receipt reversal reverses its downpayment source');

create temp table reversal_order as select (public.post_sale_at_location(null,
  '91000000-0000-4000-8000-000000000015',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":1,"unit_price":100}]',
  '[]',false,'reversal-order')->>'order_id')::uuid id;
create temp table allocated_receipt as select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000015',100,'cash',null,'allocated-receipt') result;
select is((public.post_customer_receipt_reversal(
  (select (result->>'receipt_id')::uuid from allocated_receipt),'Duplicate collection')->>'status'),
  'completed','allocated receipt reverses as one accounting event');
select is((select status from public.payments where customer_receipt_id=
  (select (result->>'receipt_id')::uuid from allocated_receipt)),'cancelled',
  'receipt reversal cancels its linked invoice allocation');
select is((select receivable_balance from public.customer_account_balances
  where customer_id='91000000-0000-4000-8000-000000000015'),100::bigint,
  'receipt reversal reopens the affected invoice balance');

-- Approval-held automatic sales do not reserve downpayment. A later sale may
-- consume it; approval must then expire and replace a stale credit review.
select public.post_customer_receipt(null,'91000000-0000-4000-8000-000000000016',100,
  'cash',null,'approval-split-funding');
select public.post_sale_at_location(null,'91000000-0000-4000-8000-000000000016',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":1,"unit_price":100}]',
  '[]',false,'approval-existing-ar');

select testkit.as_user((select company_id from account_fixture),
  '91000000-0000-4000-8000-000000000002','Receipt cashier');
select testkit.ensure_open_session();
create temp table stale_split_sale as select public.post_credit_sale_at_location(null,
  '91000000-0000-4000-8000-000000000016',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":2,"unit_price":100}]',
  'stale-split-sale',null,'Review residual credit') result;
select is((select result->>'status' from stale_split_sale),'approval_required',
  'automatic sale reports its reviewed deposit and residual credit split');
create temp table intervening_sale as select public.post_credit_sale_at_location(null,
  '91000000-0000-4000-8000-000000000016',
  '[{"variant_id":"91000000-0000-4000-8000-000000000014","quantity":1,"unit_price":100}]',
  'intervening-split-sale',null,null) result;
select is((select result->>'status' from intervening_sale),'completed',
  'a later fully covered sale does not wait for the earlier approval');
select is(public.customer_deposit_available('91000000-0000-4000-8000-000000000016'),0::bigint,
  'approval-held sale does not reserve downpayment');

create temp table pending_receipt as select public.post_customer_receipt(null,
  '91000000-0000-4000-8000-000000000010',80,'bank','BANK-ACCOUNT-1','bank-receipt') result;
select is((select result->>'status' from pending_receipt),'approval_required',
  'direct account receipt waits for finance approval');
select is((select status from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from pending_receipt)),'pending_approval',
  'approval-held receipt has not posted');
select ok(not exists(select 1 from public.ledger_journal_entries where source_type='CustomerReceipt'
  and source_id=(select result->>'receipt_id' from pending_receipt)),
  'approval-held receipt has no ledger side effects');

select testkit.as_user((select company_id from account_fixture),
  '91000000-0000-4000-8000-000000000001','Admin');
select public.approve_request((select (result->>'approval_id')::uuid from stale_split_sale),
  'Approved reviewed split');
select is((select status from public.approvals where id=
  (select (result->>'approval_id')::uuid from stale_split_sale)),'expired',
  'approval expires instead of silently increasing reviewed credit');
select is((select (metadata->>'reviewed_credit_amount')::bigint from public.approvals
  where subject_id=(select (result->>'order_id')::uuid from stale_split_sale) and status='pending'),
  200::bigint,'replacement approval exposes the recalculated residual credit');
select is((select status from public.orders where id=
  (select (result->>'order_id')::uuid from stale_split_sale)),'pending_payment',
  'stale automatic sale remains pending for replacement review');
select public.approve_request((select (result->>'approval_id')::uuid from pending_receipt),
  'Verified bank receipt');
select is((select status from public.customer_receipts where id=
  (select (result->>'receipt_id')::uuid from pending_receipt)),'posted',
  'finance approval posts the receipt once');

select * from finish();
rollback;
