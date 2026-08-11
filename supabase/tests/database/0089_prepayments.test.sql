begin;
select plan(49);

select has_table('public','customer_deposits','customer deposits have a subledger');
select has_table('public','supplier_advances','supplier advances have a subledger');
select has_function('public','record_customer_deposit',
  array['uuid','bigint','text','text','text','uuid'],'customer deposit RPC exists');
select has_function('public','apply_customer_deposit',
  array['uuid','bigint','text'],'customer application RPC exists');
select has_function('public','record_supplier_advance',
  array['uuid','bigint','text','text','text','uuid'],'supplier advance RPC exists');
select has_function('public','apply_supplier_advance',
  array['uuid','bigint','text'],'supplier application RPC exists');
select has_function('public','customer_deposit_activity',
  array['uuid','integer'],'customer deposit activity RPC exists');
select has_function('public','supplier_advance_activity',
  array['uuid','integer'],'supplier advance activity RPC exists');
select has_index('public','purchase_drafts','purchase_drafts_company_client_ref_unique',
  'purchase draft client references are unique per company');

select testkit.create_user('89000000-0000-4000-8000-000000000001','prepayments@test.local');
create temp table prepayment_fixture as select testkit.provision(
  '89000000-0000-4000-8000-000000000001','Prepayment Store') company_id;
grant select on pg_temp.prepayment_fixture to authenticated;

select testkit.create_user('89000000-0000-4000-8000-000000000099','prepayments-other@test.local');
select testkit.create_user('89000000-0000-4000-8000-000000000006','prepayments-cashier@test.local');
select testkit.create_user('89000000-0000-4000-8000-000000000007','prepayments-reverser@test.local');
create temp table other_fixture as select testkit.provision(
  '89000000-0000-4000-8000-000000000099','Other Prepayment Store') company_id;
grant select on pg_temp.other_fixture to authenticated;
select testkit.add_member((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000006','Deposit requester',array['SettleOrder']);
select testkit.add_member((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000007','Deposit reverser',array['ReverseOrder']);

insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '89000000-0000-4000-8000-000000000002',company_id,'Deposit Customer',true,300
from prepayment_fixture;
insert into public.customers(id,company_id,first_name,is_credit_approved)
select '89000000-0000-4000-8000-000000000008',company_id,'Mixed Channel Customer',true
from prepayment_fixture;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select '89000000-0000-4000-8000-000000000003',company_id,'Advance Supplier',true,200
from prepayment_fixture;
insert into public.customers(id,company_id,first_name)
select '89000000-0000-4000-8000-000000000098',company_id,'Other Customer'
from other_fixture;

insert into public.products(id,company_id,name)
select '89000000-0000-4000-8000-000000000004',company_id,'Prepayment Tea'
from prepayment_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '89000000-0000-4000-8000-000000000005','89000000-0000-4000-8000-000000000004',
  company_id,'Default','PREPAY-TEA',1000,500 from prepayment_fixture;

select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

-- Seed one inventory unit without AP so the mixed sale exercises production completion.
select public.record_purchase_complete(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":3,"unit_cost":500}]',
  '[]',1500,'PREPAY-STOCK','CASH_ON_HAND');

select public.record_customer_deposit('89000000-0000-4000-8000-000000000002',600,
  'cash',null,'customer-deposit-1');
select public.record_customer_deposit('89000000-0000-4000-8000-000000000002',400,
  'cash',null,'customer-deposit-2');
select is(public.customer_deposit_available('89000000-0000-4000-8000-000000000002'),
  1000::bigint,'customer may deposit before any sale');

create temp table mixed_sale as select public.post_sale_with_prepayment_at_location(
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),
  '89000000-0000-4000-8000-000000000002',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
  '[]',700,300,'mixed-sale-1') result;

select is((select result->>'status' from mixed_sale),'completed','mixed sale completes');
select is((select coalesce(sum(l.debit)-sum(l.credit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from prepayment_fixture)
    and a.code='ACCOUNTS_RECEIVABLE'
    and l.meta->>'customerId'='89000000-0000-4000-8000-000000000002'),
  300::bigint,'only explicit residual remains in AR');
select is((select count(*)::int from public.customer_deposit_allocations x
  join public.customer_deposit_applications a on a.id=x.application_id
  where a.order_id=((select result->>'order_id' from mixed_sale)::uuid)),2,
  'customer deposit application allocates across FIFO sources');
select is((select available from public.customer_deposit_source_balances
  where reference is null order by created_at,id limit 1),0::bigint,'oldest customer deposit is exhausted first');
select is(public.customer_deposit_available('89000000-0000-4000-8000-000000000002'),
  300::bigint,'unapplied customer money remains separate');
select is((public.post_sale_with_prepayment_at_location(
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),'89000000-0000-4000-8000-000000000002','[]','[]',700,300,
  'mixed-sale-1')->>'order_id'),(select result->>'order_id' from mixed_sale),
  'mixed sale replay is idempotent');
select throws_ok(format('select public.apply_customer_deposit(%L,301)',
  (select result->>'order_id' from mixed_sale)),'P0001',
  'ar_overpayment: 301 exceeds outstanding 300','customer application cannot over-settle AR');

select public.reverse_customer_deposit_application((select id
  from public.customer_deposit_applications where order_id=((select result->>'order_id' from mixed_sale)::uuid)),
  'Test reversal');
select is(public.customer_deposit_available('89000000-0000-4000-8000-000000000002'),
  1000::bigint,'reversing an application restores customer availability');
select is((select status from public.payments where order_id=((select result->>'order_id' from mixed_sale)::uuid)
  and settlement_kind='customer_deposit'),'cancelled','application reversal cancels its settlement row');
select public.post_customer_deposit_refund('89000000-0000-4000-8000-000000000002',200,
  'Unused balance','cash',null,'customer-refund-1');
select is(public.customer_deposit_available('89000000-0000-4000-8000-000000000002'),
  800::bigint,'unused customer money can be refunded');
select is((select coalesce(sum(l.credit)-sum(l.debit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from prepayment_fixture) and a.code='CUSTOMER_DEPOSITS'),
  800::bigint,'customer subledger ties to its liability control account');

select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000006','Deposit requester');
create temp table refund_approval as select public.post_customer_deposit_refund(
  '89000000-0000-4000-8000-000000000002',100,'Cashier requested refund','cash',null,
  'customer-refund-approval') result;
select is((select result->>'status' from refund_approval),'approval_required',
  'SettleOrder requests customer deposit refund approval');
select is((public.post_customer_deposit_refund(
  '89000000-0000-4000-8000-000000000002',100,'Cashier requested refund','cash',null,
  'customer-refund-approval')->>'approval_id'),
  (select result->>'approval_id' from refund_approval),
  'refund approval replay returns the same request');
select throws_ok($$select public.post_customer_deposit_refund(
  '89000000-0000-4000-8000-000000000002',50,'Different pending refund','cash',null,
  'customer-refund-conflict')$$,'P0001',
  format('customer_deposit_refund_already_pending: %s',
    (select result->>'approval_id' from refund_approval)),
  'a different refund cannot silently reuse pending approval metadata');
select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');
select public.approve_request((select (result->>'approval_id')::uuid from refund_approval),
  'Approved by another user');
select is(public.customer_deposit_available('89000000-0000-4000-8000-000000000002'),
  700::bigint,'approved refund revalidates and consumes available balance');

select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000006','Deposit requester');
create temp table external_mixed_sale as select public.post_sale_with_prepayment_at_location(
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),'89000000-0000-4000-8000-000000000002',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
  '[{"method":"bank","amount":900,"reference":"BANK-PREPAY-1"}]',100,0,
  'mixed-sale-external-approval') result;
select is((select result->>'status' from external_mixed_sale),'approval_required',
  'mixed settlement carries direct-account tender into approval');
select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');
select public.approve_request((select (result->>'approval_id')::uuid from external_mixed_sale),
  'Verified direct account settlement');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from external_mixed_sale)),'completed',
  'approved mixed settlement completes with its deposit allocation');

select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000006','Deposit requester');
create temp table dual_approval_sale as select public.post_sale_with_prepayment_at_location(
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),'89000000-0000-4000-8000-000000000002',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
  '[{"method":"bank","amount":800,"reference":"BANK-PREPAY-DUAL"}]',100,100,
  'mixed-sale-dual-approval') result;
select is((select count(*)::int from public.approvals
  where subject_id=(select (result->>'order_id')::uuid from dual_approval_sale)
    and type in ('external_account_payment','overdraft') and status='pending'),2,
  'mixed sale creates both required approvals');
select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');
select public.approve_request((select id from public.approvals
  where subject_id=(select (result->>'order_id')::uuid from dual_approval_sale)
    and type='external_account_payment'),'Verified external tender');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from dual_approval_sale)),'pending_payment',
  'first of two approvals leaves the sale held');
select public.approve_request((select id from public.approvals
  where subject_id=(select (result->>'order_id')::uuid from dual_approval_sale)
    and type='overdraft'),'Approved residual overdraft');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from dual_approval_sale)),'completed',
  'second approval completes the mixed sale');

select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000007','Deposit reverser');
select testkit.ensure_open_session();
select is((public.post_customer_deposit_refund(
  '89000000-0000-4000-8000-000000000002',50,'Reverse-only refund',null,null,
  'reverse-only-refund')->>'status'),'completed',
  'ReverseOrder alone can execute a refund through the public wrapper');
select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');

select public.record_customer_deposit('89000000-0000-4000-8000-000000000008',100,
  'cash',null,'mixed-channel-cash');
select public.record_customer_deposit('89000000-0000-4000-8000-000000000008',100,
  'bank','BANK-MIXED-CHANNEL','mixed-channel-bank');
select throws_ok($$select public.post_customer_deposit_refund(
  '89000000-0000-4000-8000-000000000008',150,'Mixed original channels',null,null,
  'mixed-channel-refund')$$,'P0001','refund_channel_required_for_mixed_sources',
  'default refund channel cannot misstate a multi-channel FIFO refund');
select ok(jsonb_array_length(public.customer_deposit_activity(
  '89000000-0000-4000-8000-000000000002'))>0,
  'customer activity exposes deposit lifecycle entries');

select public.record_supplier_advance('89000000-0000-4000-8000-000000000003',300,
  'CASH_ON_HAND',null,'supplier-advance-1');
select public.record_supplier_advance('89000000-0000-4000-8000-000000000003',300,
  'CASH_ON_HAND',null,'supplier-advance-2');
select public.record_supplier_advance('89000000-0000-4000-8000-000000000003',300,
  'CASH_ON_HAND',null,'supplier-advance-3');
select is(public.supplier_advance_available('89000000-0000-4000-8000-000000000003'),
  900::bigint,'supplier may receive an advance before its purchase');

create temp table mixed_purchase as select public.record_purchase_with_advance(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_cost":600}]',
  '[]',0,400,200,'MIXED-PURCHASE','CASH_ON_HAND',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),'mixed-purchase-1') purchase_id;
select ok((select purchase_id is not null from mixed_purchase),
  'purchase passes supplier limit using residual AP');
select is((select coalesce(sum(l.credit)-sum(l.debit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from prepayment_fixture) and a.code='ACCOUNTS_PAYABLE'
    and l.meta->>'purchaseId'=(select purchase_id::text from mixed_purchase)),
  200::bigint,'only explicit residual remains in AP');
select is((select count(*)::int from public.supplier_advance_allocations x
  join public.supplier_advance_applications a on a.id=x.application_id
  where a.purchase_id=(select purchase_id from mixed_purchase)),2,
  'supplier application allocates across FIFO sources');
select is(public.supplier_advance_available('89000000-0000-4000-8000-000000000003'),
  500::bigint,'unapplied supplier advance remains available');

select public.reverse_supplier_advance_application((select id from public.supplier_advance_applications
  where purchase_id=(select purchase_id from mixed_purchase)),'Test reversal');
select is(public.supplier_advance_available('89000000-0000-4000-8000-000000000003'),
  900::bigint,'supplier application reversal restores availability');
select is((select status from public.purchase_payments
  where purchase_id=(select purchase_id from mixed_purchase) and settlement_kind='supplier_advance'),
  'cancelled','supplier application reversal cancels its settlement row');
select public.record_supplier_advance_return('89000000-0000-4000-8000-000000000003',100,
  'CASH_ON_HAND','Supplier returned unused funds',null,'supplier-return-1');
select is(public.supplier_advance_available('89000000-0000-4000-8000-000000000003'),
  800::bigint,'supplier return consumes only unused advance');
select is((select coalesce(sum(l.debit)-sum(l.credit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from prepayment_fixture) and a.code='SUPPLIER_ADVANCES'),
  800::bigint,'supplier subledger ties to its asset control account');

reset role;
insert into public.ledger_accounts(company_id,code,name,type,allow_manual_posting)
select company_id,'UNMAPPED_MONEY','Unmapped money','asset',true from prepayment_fixture;
update public.customers set supplier_credit_limit=1000
where id='89000000-0000-4000-8000-000000000003';
select testkit.as_user((select company_id from prepayment_fixture),
  '89000000-0000-4000-8000-000000000001','Admin');
select throws_ok($$select public.record_supplier_advance(
  '89000000-0000-4000-8000-000000000003',50,'UNMAPPED_MONEY',null,'unmapped-advance')$$,
  'P0001','payment_account_not_available_at_location: UNMAPPED_MONEY',
  'supplier advance rejects an account without an enabled location method');

create temp table advance_draft as select public.save_purchase_draft_with_advance(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_cost":100}]',
  '[]',null,null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),0,100,null,'advance-draft-replay') draft_id;
select is(public.save_purchase_draft_with_advance(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_cost":100}]',
  '[]',null,null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),0,100,null,'advance-draft-replay'),
  (select draft_id from advance_draft),'purchase draft save replays by client reference');
create temp table confirmed_advance_draft as
  select public.confirm_purchase_draft_with_advance((select draft_id from advance_draft)) purchase_id;
select is(public.confirm_purchase_draft_with_advance((select draft_id from advance_draft)),
  (select purchase_id from confirmed_advance_draft),
  'confirmed advance draft retry returns the posted purchase');
create temp table cleared_advance_draft as select public.save_purchase_draft_with_advance(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_cost":100}]',
  '[]',null,null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),0,100,null,'advance-draft-cleared') draft_id;
select public.save_purchase_draft_with_advance(
  '89000000-0000-4000-8000-000000000003',
  '[{"variant_id":"89000000-0000-4000-8000-000000000005","quantity":1,"unit_cost":100}]',
  '[]',null,null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from prepayment_fixture)
    and is_default limit 1),0,0,null,'advance-draft-cleared',
  (select draft_id from cleared_advance_draft));
select is((select advance_amount from public.purchase_drafts
  where id=(select draft_id from cleared_advance_draft)),0::bigint,
  'saving zero clears a draft advance instead of restoring stale funds');
select ok(jsonb_array_length(public.supplier_advance_activity(
  '89000000-0000-4000-8000-000000000003'))>0,
  'supplier activity exposes advance lifecycle entries');

select ok(not exists(select 1 from public.ledger_journal_entries e
  join lateral(select coalesce(sum(l.debit),0) debit,coalesce(sum(l.credit),0) credit
    from public.ledger_journal_lines l where l.entry_id=e.id) totals on true
  where e.company_id=(select company_id from prepayment_fixture)
    and e.source_type in ('CustomerDeposit','CustomerDepositApplication',
      'CustomerDepositApplicationReversal','CustomerDepositRefund','SupplierAdvance',
      'SupplierAdvanceApplication','SupplierAdvanceApplicationReversal','SupplierAdvanceReturn')
    and totals.debit<>totals.credit),'every prepayment journal is balanced');

select throws_ok($$select public.record_customer_deposit(
  '89000000-0000-4000-8000-000000000098',100,'cash')$$,
  'P0001','customer_not_found','cross-tenant customer deposit is rejected');

select * from finish();
rollback;
