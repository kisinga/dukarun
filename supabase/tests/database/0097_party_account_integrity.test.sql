begin;
select plan(24);

select has_table('public','supplier_payments',
  'supplier payments have a reversible business-event header');
select has_function('public','post_supplier_payment',array['uuid','uuid','bigint','text','text'],
  'canonical supplier payment RPC exists');
select has_function('public','post_supplier_fifo_payment',array['uuid','bigint','text','text'],
  'typed supplier-wide FIFO payment RPC exists');
select has_function('public','reverse_supplier_payment',array['uuid','text'],
  'supplier payment reversal RPC exists');

select testkit.create_user(
  '97000000-0000-4000-8000-000000000001','party-integrity-admin@test.local');
create temp table integrity_fixture as select testkit.provision(
  '97000000-0000-4000-8000-000000000001','Party Integrity Store') company_id;
grant select on pg_temp.integrity_fixture to authenticated;

insert into public.products(id,company_id,name)
select '97000000-0000-4000-8000-000000000002',company_id,'Integrity item'
from integrity_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '97000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000002',company_id,'Default','INTEGRITY',1000,100
from integrity_fixture;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select '97000000-0000-4000-8000-000000000004',company_id,'Integrity Supplier',true,10000
from integrity_fixture;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select '97000000-0000-4000-8000-000000000005',company_id,'Integrity Customer',true,10000
from integrity_fixture;

select testkit.as_user((select company_id from integrity_fixture),
  '97000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

select throws_ok(
  $$select public.post_balance_adjustment(
    '97000000-0000-4000-8000-000000000005',100,'naked AR')$$,
  'P0001','manual_balance_adjustment_removed: use a sale, receipt reversal, or credit note',
  'manual customer balance adjustment is retired');
select throws_ok(
  $$select public.post_supplier_balance_adjustment(
    '97000000-0000-4000-8000-000000000004',100,'naked AP')$$,
  'P0001','manual_balance_adjustment_removed: use a purchase, supplier payment reversal, or supplier credit',
  'manual supplier balance adjustment is retired');

create temp table integrity_purchase_one as select public.record_purchase(
  '97000000-0000-4000-8000-000000000004',
  '[{"variant_id":"97000000-0000-4000-8000-000000000003","quantity":4,"unit_cost":100}]',
  true,'INTEGRITY-1') purchase_id;
create temp table integrity_purchase_two as select public.record_purchase(
  '97000000-0000-4000-8000-000000000004',
  '[{"variant_id":"97000000-0000-4000-8000-000000000003","quantity":6,"unit_cost":100}]',
  true,'INTEGRITY-2') purchase_id;

reset role;
update public.purchases set purchase_date=current_date-2
where id=(select purchase_id from integrity_purchase_one);
update public.purchases set purchase_date=current_date-1
where id=(select purchase_id from integrity_purchase_two);
select testkit.as_user((select company_id from integrity_fixture),
  '97000000-0000-4000-8000-000000000001','Admin');

create temp table integrity_payment as select public.post_supplier_fifo_payment(
  '97000000-0000-4000-8000-000000000004',750,'CASH_ON_HAND','integrity-pay-1'
) payment_id;
grant select on pg_temp.integrity_payment to authenticated;

select is((select amount from public.supplier_payments
  where id=(select payment_id from integrity_payment)),750::bigint,
  'payment header retains the full user action');
select results_eq(
  $$select pp.purchase_id,pp.amount from public.purchase_payments pp
    join public.purchases p on p.id=pp.purchase_id
    where pp.supplier_payment_id=(select payment_id from integrity_payment)
    order by p.purchase_date,p.created_at,p.id$$,
  $$values
    ((select purchase_id from integrity_purchase_one),400::bigint),
    ((select purchase_id from integrity_purchase_two),350::bigint)$$,
  'one supplier payment allocates FIFO across purchases');
select is((select difference from public.supplier_account_status(
  '97000000-0000-4000-8000-000000000004')),0::bigint,
  'payment keeps supplier documents and AP in agreement');
select is(public.post_supplier_payment(
  '97000000-0000-4000-8000-000000000004',null,750,'CASH_ON_HAND','integrity-pay-1'),
  (select payment_id from integrity_payment),
  'payment retry returns the original business event');
select throws_ok(
  $$select public.post_supplier_payment(
    '97000000-0000-4000-8000-000000000004',null,749,'CASH_ON_HAND','integrity-pay-1')$$,
  'P0001','supplier_payment_idempotency_conflict: reference integrity-pay-1 has different details',
  'payment retry rejects a changed payload');
select is((select count(*)::int from public.supplier_payments
  where supplier_id='97000000-0000-4000-8000-000000000004'),1,
  'payment retry does not duplicate the event');
select throws_ok(
  $$select public.post_supplier_payment(
    '97000000-0000-4000-8000-000000000004',null,251,'CASH_ON_HAND','too-much')$$,
  'P0001','ap_overpayment: 251 exceeds outstanding 250',
  'canonical workflow rejects supplier overpayment');

create temp table integrity_reversal as select public.reverse_supplier_payment(
  (select payment_id from integrity_payment),'Wrong bank amount') reversal_id;
select is((select status from public.supplier_payments
  where id=(select payment_id from integrity_payment)),'reversed',
  'reversal marks the payment header');
select is((select count(*)::int from public.purchase_payments
  where supplier_payment_id=(select payment_id from integrity_payment) and status='cancelled'),2,
  'reversal cancels every FIFO allocation');
select is((select document_balance from public.supplier_account_status(
  '97000000-0000-4000-8000-000000000004')),1000::bigint,
  'reversal restores the source-backed payable');
select is(public.reverse_supplier_payment(
  (select payment_id from integrity_payment),'Retry reversal'),
  (select reversal_id from integrity_reversal),
  'reversal retry is idempotent');

select ok(public.reverse_credit_purchase(
  (select purchase_id from integrity_purchase_one),'Wrong supplier invoice') is not null,
  'untouched unpaid credit purchase can be reversed');
select is((select status from public.purchases
  where id=(select purchase_id from integrity_purchase_one)),'reversed',
  'purchase reversal retains an auditable status');
select is((select document_balance from public.supplier_account_status(
  '97000000-0000-4000-8000-000000000004')),600::bigint,
  'purchase reversal removes only its source-backed payable');

-- Simulate privileged import/maintenance traffic, which can write the source
-- tables directly and can set the generic non-accounting limits bypass.
reset role;

select throws_ok($sql$
  do $block$
  begin
    perform set_config('app.bypass_business_limits','on',true);
    insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
      status,settlement_kind)
    values((select company_id from integrity_fixture),
      (select purchase_id from integrity_purchase_two),1,'CASH_ON_HAND',auth.uid(),
      'settled','account');
    set constraints purchase_payments_account_consistency immediate;
  end
  $block$
$sql$,
  'P0001','supplier_account_out_of_balance: ledger 600, documents 599',
  'business-limit bypass cannot commit a payment allocation without its AP journal');

select throws_ok($sql$
  do $block$
  begin
    perform set_config('app.bypass_business_limits','on',true);
    perform public.post_journal_entry(
      (select company_id from integrity_fixture),'IntegrityBypassProbe','ap-only','AP-only probe',
      jsonb_build_array(
        jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',1,
          'meta',jsonb_build_object('supplierId','97000000-0000-4000-8000-000000000004')),
        jsonb_build_object('account_code','CASH_ON_HAND','credit',1,
          'meta',jsonb_build_object('supplierId','97000000-0000-4000-8000-000000000004'))
      )
    );
    set constraints journal_lines_account_consistency immediate;
  end
  $block$
$sql$,
  'P0001','supplier_account_out_of_balance: ledger 599, documents 600',
  'business-limit bypass cannot commit an AP journal without a source document');

select throws_ok($sql$
  do $block$
  begin
    perform set_config('app.bypass_business_limits','on',true);
    insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
      status,settlement_kind)
    values((select company_id from integrity_fixture),
      (select purchase_id from integrity_purchase_two),601,'CASH_ON_HAND',auth.uid(),
      'settled','account');
    perform public.post_journal_entry(
      (select company_id from integrity_fixture),'IntegrityBypassProbe','balanced-overallocation',
      'Balanced over-allocation probe',jsonb_build_array(
        jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',601,
          'meta',jsonb_build_object('supplierId','97000000-0000-4000-8000-000000000004')),
        jsonb_build_object('account_code','CASH_ON_HAND','credit',601,
          'meta',jsonb_build_object('supplierId','97000000-0000-4000-8000-000000000004'))
      )
    );
    set constraints purchase_payments_not_overallocated immediate;
  end
  $block$
$sql$,
  'P0001','purchase_overallocated: payments 601 exceed total 600',
  'business-limit bypass cannot commit a balanced purchase over-allocation');

select is((select sum(debit)-sum(credit) from public.ledger_journal_lines
  where company_id=(select company_id from integrity_fixture)),0::numeric,
  'integrity workflow preserves double-entry balance');

select * from finish();
rollback;
