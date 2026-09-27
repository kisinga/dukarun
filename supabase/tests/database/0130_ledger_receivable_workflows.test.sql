begin;
select no_plan();

select testkit.create_user('a1960000-0000-4000-8000-000000000001','receivable-admin@test.local');
select testkit.create_user('a1960000-0000-4000-8000-000000000002','receivable-limits@test.local');
select testkit.create_user('a1960000-0000-4000-8000-000000000003','receivable-other@test.local');
select testkit.create_user('a1960000-0000-4000-8000-000000000006','receivable-cashier@test.local');
create temp table fixture as select testkit.provision(
  'a1960000-0000-4000-8000-000000000001','Receivable Workflows') company_id;
create temp table other_fixture as select testkit.provision(
  'a1960000-0000-4000-8000-000000000003','Other Receivable Store') company_id;
select testkit.add_member((select company_id from fixture),
  'a1960000-0000-4000-8000-000000000002','Limits only',array['ManageCustomerCreditLimit']);
select testkit.add_member((select company_id from fixture),
  'a1960000-0000-4000-8000-000000000006','Receipt cashier',array['SettleOrder']);
select set_config('request.jwt.claims',testkit.claims((select company_id from fixture),
  'a1960000-0000-4000-8000-000000000001','Admin'),true);
select testkit.ensure_open_session();
insert into public.products(id,company_id,name)
select 'a1960000-0000-4000-8000-000000000004',company_id,'Test Service' from fixture;
insert into public.product_variants(id,company_id,product_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1960000-0000-4000-8000-000000000005',company_id,
  'a1960000-0000-4000-8000-000000000004','Default','RECEIVABLE-SERVICE','service',1000,1000,false from fixture;

-- Synthetic migration-shaped correction; no real customer IDs or bypassed guards.
-- Original + reversal cancel; allocation is the sole surviving correction.
create function pg_temp.invoice(p_name text,p_received bigint,p_correction bigint default 0,p_cash boolean default false)
returns uuid language plpgsql as $$
declare v_company uuid:=public.current_company_id();v_customer uuid;v_order uuid;
  v_original uuid;v_lines jsonb;v_reverse jsonb;
begin
  insert into public.customers(company_id,first_name,is_credit_approved,credit_limit)
  values(v_company,p_name,true,100000) returning id into v_customer;
  v_order:=(public.post_sale_at_location(null,v_customer,
    '[{"variant_id":"a1960000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
    case when p_cash then '[{"method":"cash","amount":1000}]'::jsonb else '[]'::jsonb end,
    false,p_name)->>'order_id')::uuid;
  if not p_cash and p_received>0 then
    perform public.post_customer_receipt(null,v_customer,least(p_received,1000),'cash',null,p_name||'-receipt');
  end if;
  if p_correction<>0 then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',greatest(p_correction,0),
        'credit',greatest(-p_correction,0),'order_id',v_order,'meta',jsonb_build_object('customerId',v_customer)),
      jsonb_build_object('account_code','BALANCE_ADJUSTMENT','debit',greatest(-p_correction,0),
        'credit',greatest(p_correction,0)));
    v_original:=public.post_journal_entry(v_company,'BalanceAdjustment',p_name,'Synthetic correction',v_lines);
    select jsonb_agg(value||jsonb_build_object('debit',value->'credit','credit',value->'debit'))
      into v_reverse from jsonb_array_elements(v_lines);
    perform public.post_reversal_entry(v_company,'BalanceAdjustmentReversal',v_original::text,
      'Scope correction',v_reverse,v_original);
    select jsonb_agg(value||jsonb_build_object('meta',coalesce(value->'meta','{}'::jsonb)||
      jsonb_build_object('originalEntryId',v_original,'orderId',v_order)))
      into v_lines from jsonb_array_elements(v_lines);
    perform public.post_journal_entry(v_company,'BalanceAdjustmentAllocation',v_original::text,
      'Scoped correction',v_lines);
  end if;
  if not p_cash and p_received>1000 then
    perform public.post_customer_receipt(null,v_customer,p_received-1000,'cash',null,p_name||'-extra');
  end if;
  return v_order;
end;
$$;
create temp table cases as
select 'writeoff' name,pg_temp.invoice('writeoff',600,-400) id,600::bigint paid,0::bigint due
union all select 'positive',pg_temp.invoice('positive',1000,500),1000,500
union all select 'positive-paid',pg_temp.invoice('positive-paid',1500,500),1500,0
union all select 'unpaid',pg_temp.invoice('unpaid',0),0,1000
union all select 'partial',pg_temp.invoice('partial',600),600,400
union all select 'cash',pg_temp.invoice('cash',1000,0,true),1000,0;
select lives_ok('set constraints all immediate','all synthetic starting accounts reconcile');
set constraints all deferred;
select is(s.outstanding,c.due,c.name||': batch read uses ledger due')
from cases c join public.order_receivable_statuses(array(select id from cases)) s on s.order_id=c.id;
select is(s.settled_amount,c.paid,c.name||': credit settlement evidence is ledger-backed')
from cases c join public.order_receivable_statuses(array(select id from cases where name<> 'cash')) s on s.order_id=c.id;
select throws_ok($$select * from public.order_receivable_statuses(array[null::uuid])$$,
  'P0001','order_not_found','missing order never becomes a zero balance');

-- Immutable history must survive credit notes unchanged.
create temp table journal_before as select e.id,to_jsonb(e) row from public.ledger_journal_entries e
where e.company_id=(select company_id from fixture);
create temp table lines_before as select l.id,to_jsonb(l) row from public.ledger_journal_lines l
where l.company_id=(select company_id from fixture);
create temp table refunds_posted as select c.*,
  public.post_full_refund(c.id,'cash','Regression full credit note','write_off') result from cases c;
select is(result->>'status','completed',name||': full refund completes') from refunds_posted;
select is(public.order_receivable_ledger_balance_core(id),0::bigint,name||': refund leaves no receivable') from cases;
select is((select coalesce(sum(l.credit-l.debit),0)::bigint from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id
  where l.entry_id=(r.result->>'resource_id')::uuid and a.code='CASH_ON_HAND'),paid,
  name||': cash refund equals actual collections, not the correction') from refunds_posted r;
select ok(not exists(select 1 from journal_before b left join public.ledger_journal_entries e on e.id=b.id
  where to_jsonb(e) is distinct from b.row),'refund does not rewrite historical journal headers');
select ok(not exists(select 1 from lines_before b left join public.ledger_journal_lines l on l.id=b.id
  where to_jsonb(l) is distinct from b.row),'refund does not rewrite historical journal lines');
select lives_ok('set constraints all immediate','refunded accounts pass every deferred invariant');
set constraints all deferred;
select throws_ok(format($$select public.post_full_refund(%L,'cash','Duplicate','write_off')$$,
  (select id from cases where name='writeoff')),'P0001','sale_already_refunded','duplicate refund is blocked');
select throws_like(format($$select public.post_customer_receipt_reversal(%L,'Already refunded')$$,
  (select p.customer_receipt_id from public.payments p join cases c on c.id=p.order_id where c.name='writeoff')),
  '%refunded_order%','a refunded collection cannot be paid out again by reversing its receipt');
select throws_like(format($$select public.post_payment_reversal(%L,'Already refunded')$$,
  (select p.id from public.payments p join cases c on c.id=p.order_id where c.name='cash')),
  '%refunded_order%','a refunded cash payment cannot be reversed either');

-- Negative AR and wrong-party lines cannot conceal divergence under other invoices.
select throws_ok(format($$select public.post_journal_entry(%L,'BadParty','bad-party','Bad',
  jsonb_build_array(jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',1,
    'order_id',%L,'meta',jsonb_build_object('customerId',%L)),
    jsonb_build_object('account_code','SALES','credit',1)))$$,
  (select company_id from fixture),(select id from cases where name='partial'),
  (select o.customer_id from public.orders o join cases c on c.id=o.id where c.name='unpaid')),
  'P0001','ar_order_customer_mismatch','AR cannot be attributed to a different customer');
create function pg_temp.overallocate(p_order uuid) returns void language plpgsql as $$
begin
  perform public.post_journal_entry(public.current_company_id(),'BadAR','bad-ar','Bad',
    jsonb_build_array(jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',1,'order_id',p_order),
      jsonb_build_object('account_code','SALES','debit',1)));
  set constraints all immediate;
end;
$$;
select throws_like(format($$select pg_temp.overallocate(%L)$$,(select id from cases where name='partial')),
  '%customer_order_ar_overallocated%','negative per-order AR is rejected');
set constraints all deferred;

create temp table ambiguous as select pg_temp.invoice('ambiguous',600) id;
select public.post_journal_entry((select company_id from fixture),'BalanceAdjustmentAllocation',
  gen_random_uuid()::text,'Correction without provenance',jsonb_build_array(
    jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',400,'order_id',(select id from ambiguous)),
    jsonb_build_object('account_code','BALANCE_ADJUSTMENT','debit',400)));
select throws_like(format($$select public.post_full_refund(%L,'cash','Unknown correction','write_off')$$,
  (select id from ambiguous)),'%refund_correction_review_required%',
  'ambiguous corrections stop for review instead of inventing balancing money');
select is((select count(*) from public.refunds where order_id=(select id from ambiguous)),0::bigint,
  'review-required refund leaves no refund record');
select is(public.order_receivable_ledger_balance_core((select id from ambiguous)),0::bigint,
  'review-required refund leaves AR unchanged');

-- A repaired receipt must reverse its original allocation AND the reallocation.
create temp table moved_receipt as
select pg_temp.invoice('reallocated',1000) first_order;
alter table moved_receipt add column customer_id uuid,add column receipt_id uuid;
update moved_receipt m set customer_id=(select customer_id from public.orders where id=m.first_order),
  receipt_id=(select customer_receipt_id from public.payments where order_id=m.first_order);
alter table moved_receipt add column second_order uuid;
update moved_receipt set second_order=(public.post_sale_at_location(null,customer_id,
  '[{"variant_id":"a1960000-0000-4000-8000-000000000005","quantity":1,"unit_price":1000}]',
  '[]',false,'reallocated-second')->>'order_id')::uuid;
update public.payments set order_id=(select second_order from moved_receipt)
where customer_receipt_id=(select receipt_id from moved_receipt);
select public.post_journal_entry((select company_id from fixture),'CustomerReceiptReallocation',
  receipt_id::text,'Move original collection',jsonb_build_array(
    jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',1000,'order_id',first_order),
    jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',1000,'order_id',second_order)))
from moved_receipt;
select lives_ok('set constraints all immediate','reallocation and payment evidence reconcile');
set constraints all deferred;
select is((public.post_customer_receipt_reversal((select receipt_id from moved_receipt),'Duplicate collection')->>'status'),
  'completed','reallocated receipt reverses through the normal workflow');
select is(public.order_receivable_ledger_balance_core(first_order),1000::bigint,
  'receipt reversal preserves original invoice debt') from moved_receipt;
select is(public.order_receivable_ledger_balance_core(second_order),1000::bigint,
  'receipt reversal reopens the destination invoice') from moved_receipt;
select lives_ok(format($$select public.execute_customer_receipt_reversal(%L,'Replay')$$,
  (select receipt_id from moved_receipt)),'receipt reversal executor safely replays');
select is((select count(*) from public.ledger_journal_entries where source_type='CustomerReceiptReversal'
  and source_id=(select receipt_id::text||'-reversal' from moved_receipt)),1::bigint,
  'reallocated receipt reverses exactly once');
select lives_ok('set constraints all immediate','all follow-through records remain consistent');
set constraints all deferred;

create temp table approved_refund as select pg_temp.invoice('approved-refund',600,-400) id;
select set_config('request.jwt.claims',testkit.claims((select company_id from fixture),
  'a1960000-0000-4000-8000-000000000006','Receipt cashier'),true);
create temp table refund_request as select public.post_full_refund(id,'cash','Needs approval','write_off') result
from approved_refund;
select is((select result->>'status' from refund_request),'approval_required','cashier credit note needs approval');
select set_config('request.jwt.claims',testkit.claims((select company_id from fixture),
  'a1960000-0000-4000-8000-000000000001','Admin'),true);
select public.approve_request((select (result->>'approval_id')::uuid from refund_request),'Reviewed');
select is((select status from public.approvals where id=(select (result->>'approval_id')::uuid from refund_request)),
  'approved','approved credit note uses the same corrected-ledger workflow');
select is(public.order_receivable_ledger_balance_core((select id from approved_refund)),0::bigint,
  'approved corrected invoice ends with zero debt');
select is((select sum(l.credit-l.debit)::bigint from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id=l.entry_id join public.ledger_accounts a on a.id=l.account_id
  where l.order_id=(select id from approved_refund) and e.source_type='Refund' and a.code='CASH_ON_HAND'),
  600::bigint,'approved credit note refunds only the actual collection');
select lives_ok('set constraints all immediate','approved correction refund also satisfies every invariant');
set constraints all deferred;

grant select on fixture,other_fixture,cases to authenticated;
select testkit.as_user((select company_id from fixture),'a1960000-0000-4000-8000-000000000002','Limits only');
select throws_ok($$select * from public.customer_receivable_documents(
  (select customer_id from public.orders where id=(select id from cases limit 1)))$$,
  'P0001','permission_denied: customer account access required','credit-limit permission does not expose account details');
select throws_ok($$select * from public.order_receivable_statuses(array(select id from cases))$$,
  'P0001','permission_denied: sales access required','sales balance RPC checks sales permissions');
reset role;
select testkit.as_user((select company_id from other_fixture),'a1960000-0000-4000-8000-000000000003','Admin');
select throws_ok($$select * from public.order_receivable_statuses(array(select id from cases))$$,
  'P0001','order_not_found','foreign-company orders cannot be read');
reset role;
set local role anon;
select throws_like($$select * from public.order_receivable_statuses('{}')$$,
  '%permission denied%','anonymous callers cannot read receivables');
reset role;
select * from finish();
rollback;
