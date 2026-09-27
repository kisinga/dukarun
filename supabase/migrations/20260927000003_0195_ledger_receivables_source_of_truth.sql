-- Make the immutable AR ledger the sole source for customer receivable balances.
-- Payments remain settlement evidence; they never calculate exposure or invoice due.
-- Run as one transaction. The short maintenance lock prevents a receipt from
-- racing the historical repair or the before/after accounting assertions.
begin;
lock table public.orders,public.payments,public.ledger_journal_entries,
  public.ledger_journal_lines in share row exclusive mode;
create temporary table receivable_repair_account_baseline on commit drop as
select company_id,account_id,sum(debit-credit)::bigint balance
from public.ledger_journal_lines group by company_id,account_id;
create temporary table receivable_repair_customer_baseline on commit drop as
select l.company_id,l.customer_id,sum(l.debit-l.credit)::bigint balance
from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
where a.code='ACCOUNTS_RECEIVABLE' group by l.company_id,l.customer_id;

-- ---------------------------------------------------------------------------
-- Canonical order/customer AR projections (computed, never persisted).
-- ---------------------------------------------------------------------------

create or replace function public.order_receivable_ledger_balance_core(p_order_id uuid)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(l.debit-l.credit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id=l.account_id and a.company_id=l.company_id
  where l.order_id=p_order_id
    and a.code='ACCOUNTS_RECEIVABLE'
$$;

revoke execute on function public.order_receivable_ledger_balance_core(uuid)
  from public,anon,authenticated;
grant execute on function public.order_receivable_ledger_balance_core(uuid) to service_role;

create or replace function public.order_open_balance_core(p_order_id uuid)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select greatest(public.order_receivable_ledger_balance_core(p_order_id),0)::bigint
$$;

create or replace function public.customer_document_balance(
  p_company_id uuid,p_customer_id uuid
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(l.debit-l.credit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id=l.account_id and a.company_id=l.company_id
  join public.orders o
    on o.id=l.order_id and o.company_id=l.company_id
  where l.company_id=p_company_id
    and o.customer_id=p_customer_id
    and a.code='ACCOUNTS_RECEIVABLE'
$$;

comment on function public.customer_document_balance(uuid,uuid) is
  'Order-scoped AR ledger balance. The immutable ledger is the only receivable balance source.';

revoke execute on function public.customer_document_balance(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.customer_document_balance(uuid,uuid) to service_role;

create or replace function public.customer_receivable_documents(p_customer_id uuid)
returns table(
  id uuid,
  code text,
  total bigint,
  is_credit_sale boolean,
  created_at timestamptz,
  status text,
  paid bigint,
  outstanding bigint
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('SettleOrder')
    and not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: customer account access required';
  end if;
  if not exists(
    select 1 from public.customers c
    where c.id=p_customer_id and c.company_id=v_company_id and c.deleted_at is null
  ) then raise exception 'customer_not_found'; end if;
  return query
  select o.id,o.code,o.total,o.is_credit_sale,o.created_at,o.status,
    public.order_receivable_settlements_core(o.id) paid,
    greatest(b.balance,0)::bigint outstanding
  from public.orders o
  cross join lateral (
    select public.order_receivable_ledger_balance_core(o.id) balance
  ) b
  where o.company_id=v_company_id
    and o.customer_id=p_customer_id
    and o.status='completed'
    and o.receivable_kind='credit'
    and b.balance>0
  order by o.created_at desc,o.id desc;
end;
$$;

revoke execute on function public.customer_receivable_documents(uuid) from public,anon;
grant execute on function public.customer_receivable_documents(uuid) to authenticated,service_role;

create or replace function public.customer_receipt_preview(p_customer_id uuid,p_amount bigint)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  with due as (
    select o.id,o.code,o.created_at,public.order_open_balance_core(o.id) due
    from public.orders o
    where o.company_id=public.current_company_id()
      and o.customer_id=p_customer_id
      and o.receivable_kind='credit'
      and o.status='completed'
      and public.order_open_balance_core(o.id)>0
  ), running as (
    select d.*,coalesce(sum(d.due) over(
      order by d.created_at,d.id rows between unbounded preceding and 1 preceding
    ),0)::bigint prior
    from due d
  ), allocations as (
    select id,code,created_at,least(due,greatest(p_amount-prior,0))::bigint amount
    from running where p_amount>prior
  ), totals as (
    select coalesce(sum(amount),0)::bigint applied,
      coalesce(jsonb_agg(jsonb_build_object(
        'order_id',id,'order_code',code,'amount',amount
      ) order by created_at,id) filter(where amount>0),'[]'::jsonb) allocations
    from allocations
  )
  select jsonb_build_object(
    'amount',p_amount,
    'applied_amount',applied,
    'downpayment_amount',greatest(p_amount-applied,0),
    'allocations',allocations
  ) from totals
$$;

-- ---------------------------------------------------------------------------
-- Customer receipt allocation reads FIFO dues from the AR ledger.
-- ---------------------------------------------------------------------------

create or replace function public.execute_customer_receipt(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_customer_id uuid;
  v_receipt public.customer_receipts%rowtype;v_order record;v_remaining bigint;
  v_take bigint;v_applied bigint:=0;v_deposit_id uuid;v_payment_id uuid;
  v_account_code text;v_lines jsonb:='[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select customer_id into v_customer_id from public.customer_receipts
  where id=p_receipt_id and company_id=v_company_id;
  if v_customer_id is null then raise exception 'customer_receipt_not_found'; end if;
  perform public.lock_customer_account(v_company_id,v_customer_id);
  select * into v_receipt from public.customer_receipts
  where id=p_receipt_id and company_id=v_company_id for update;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  if v_receipt.status='posted' then return v_receipt.id; end if;
  if v_receipt.status<>'pending_approval' then
    raise exception 'customer_receipt_not_postable: %',v_receipt.status;
  end if;
  if not public.current_user_has_permission('SettleOrder')
    and nullif(current_setting('app.approved_customer_receipt_id',true),'')::uuid
      is distinct from v_receipt.id then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  perform set_config('app.business_location_id',v_receipt.location_id::text,true);
  if public.require_open_cashier_session(v_company_id) is distinct from v_receipt.cashier_session_id then
    raise exception 'customer_receipt_session_changed';
  end if;
  v_account_code:=public.prepayment_tender_account(
    v_receipt.location_id,v_receipt.method_code,v_receipt.reference);
  v_remaining:=v_receipt.amount;
  v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'debit',v_receipt.amount,
    'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
      'locationId',v_receipt.location_id,'method',v_receipt.method_code,
      'reference',v_receipt.reference,'openSessionId',v_receipt.cashier_session_id));
  perform 1 from public.orders o
  where o.company_id=v_company_id and o.customer_id=v_receipt.customer_id
    and o.receivable_kind='credit' and o.status='completed'
  order by o.created_at,o.id for update;
  for v_order in
    select o.id,o.code,o.created_at,public.order_open_balance_core(o.id) due
    from public.orders o
    where o.company_id=v_company_id and o.customer_id=v_receipt.customer_id
      and o.receivable_kind='credit' and o.status='completed'
      and public.order_open_balance_core(o.id)>0
    order by o.created_at,o.id
  loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_order.due);
    insert into public.payments(company_id,order_id,method_code,amount,reference,status,
      location_id,settlement_kind,customer_receipt_id)
    values(v_company_id,v_order.id,v_receipt.method_code,v_take,v_receipt.reference,'settled',
      v_receipt.location_id,'tender',v_receipt.id) returning id into v_payment_id;
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_take,
      'order_id',v_order.id,'meta',jsonb_build_object('customerId',v_receipt.customer_id,
        'receiptId',v_receipt.id,'paymentId',v_payment_id,'orderCode',v_order.code,
        'openSessionId',v_receipt.cashier_session_id));
    v_applied:=v_applied+v_take;v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining>0 then
    insert into public.customer_deposits(company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,customer_receipt_id,created_by)
    values(v_company_id,v_receipt.customer_id,v_remaining,v_receipt.method_code,v_receipt.reference,
      v_receipt.location_id,v_receipt.cashier_session_id,v_receipt.client_ref||':downpayment',
      v_receipt.id,v_receipt.created_by) returning id into v_deposit_id;
    v_lines:=v_lines||jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_remaining,
      'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
        'depositId',v_deposit_id,'locationId',v_receipt.location_id,
        'openSessionId',v_receipt.cashier_session_id));
  end if;
  perform public.post_journal_entry(v_company_id,'CustomerReceipt',v_receipt.id::text,
    'Customer receipt',v_lines);
  update public.customer_receipts set status='posted',applied_amount=v_applied,
    downpayment_amount=v_remaining,posted_at=now() where id=v_receipt.id;
  return v_receipt.id;
end;
$$;

create or replace function public.execute_customer_receipt_core(
  p_receipt_id uuid,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_receipt public.customer_receipts%rowtype;v_order record;v_remaining bigint;v_take bigint;
  v_applied bigint:=0;v_deposit_id uuid;v_payment_id uuid;v_account_code text;
  v_lines jsonb:='[]'::jsonb;
begin
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  perform public.lock_customer_account(v_receipt.company_id,v_receipt.customer_id);
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id for update;
  if v_receipt.status='posted' then return v_receipt.id; end if;
  if v_receipt.status<>'pending_approval' then
    raise exception 'customer_receipt_not_postable: %',v_receipt.status; end if;
  if v_receipt.location_id is distinct from (p_context).location_id
    or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
    raise exception 'posting_context_receipt_mismatch'; end if;
  v_account_code:=public.prepayment_tender_account(
    v_receipt.location_id,v_receipt.method_code,v_receipt.reference);
  v_remaining:=v_receipt.amount;
  v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'debit',v_receipt.amount,
    'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
      'locationId',v_receipt.location_id,'method',v_receipt.method_code,
      'reference',v_receipt.reference));
  perform 1 from public.orders o where o.company_id=v_receipt.company_id
    and o.customer_id=v_receipt.customer_id and o.receivable_kind='credit'
    and o.status='completed' order by o.created_at,o.id for update;
  for v_order in
    select o.id,o.code,o.created_at,public.order_open_balance_core(o.id) due
    from public.orders o
    where o.company_id=v_receipt.company_id and o.customer_id=v_receipt.customer_id
      and o.receivable_kind='credit' and o.status='completed'
      and public.order_open_balance_core(o.id)>0
    order by o.created_at,o.id
  loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_order.due);
    insert into public.payments(company_id,order_id,method_code,amount,reference,status,
      location_id,settlement_kind,customer_receipt_id,cashier_session_id,ledger_account_code)
    values(v_receipt.company_id,v_order.id,v_receipt.method_code,v_take,v_receipt.reference,'settled',
      v_receipt.location_id,'tender',v_receipt.id,(p_context).cashier_session_id,v_account_code)
    returning id into v_payment_id;
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_take,
      'order_id',v_order.id,'meta',jsonb_build_object('customerId',v_receipt.customer_id,
        'receiptId',v_receipt.id,'paymentId',v_payment_id,'orderCode',v_order.code));
    v_applied:=v_applied+v_take;v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining>0 then
    insert into public.customer_deposits(company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,customer_receipt_id,created_by)
    values(v_receipt.company_id,v_receipt.customer_id,v_remaining,v_receipt.method_code,
      v_receipt.reference,v_receipt.location_id,(p_context).cashier_session_id,
      v_receipt.client_ref||':downpayment',v_receipt.id,v_receipt.created_by)
    returning id into v_deposit_id;
    v_lines:=v_lines||jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_remaining,
      'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
        'depositId',v_deposit_id,'locationId',v_receipt.location_id));
  end if;
  perform public.post_journal_entry_with_context(v_receipt.company_id,'CustomerReceipt',
    v_receipt.id::text,'Customer receipt',v_lines,p_context);
  update public.customer_receipts set status='posted',applied_amount=v_applied,
    downpayment_amount=v_remaining,posted_at=now() where id=v_receipt.id;
  return v_receipt.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-time production normalization. Every mutation has an exact old-value
-- precondition. Ledger history is corrected only with new reversal/allocation
-- entries; finalized rows are never edited.
-- ---------------------------------------------------------------------------

do $$
declare
  v_jutik uuid:='510311a5-b973-41b5-a0ba-bae511324b40';
  v_payment record;v_adjustment record;v_entry public.ledger_journal_entries%rowtype;
  v_lines jsonb;v_reversal_lines jsonb;v_count integer;
begin
  select count(*) into v_count from public.legacy_customer_account_reconciliations;
  if v_count not in (0,9) then
    raise exception 'unexpected_legacy_customer_reconciliation_count: %',v_count;
  end if;
  if v_count=0 then return; end if;
  perform public.lock_customer_account(r.company_id,r.customer_id)
  from public.legacy_customer_account_reconciliations r
  order by r.company_id,r.customer_id;
  if (select count(*) from public.legacy_customer_account_reconciliations
      where company_id=v_jutik)<>8 then
    raise exception 'unexpected_jutik_customer_reconciliation_manifest';
  end if;

  -- Repair mutable settlement evidence only where the immutable imported
  -- PaymentAllocation journal proves the exact amount.
  for v_payment in
    select * from (values
      ('caf21ed3-5e92-4f13-ae7d-65ae6f6f65a6'::uuid,'b73594ff-546d-47b2-b9f9-680fbdc6e59c'::uuid,345::bigint,400::bigint),
      ('f5b0699d-bbfc-43db-b0e6-6157f4d134b3'::uuid,'51e3fc04-23d3-4ca7-9801-c796b84117e9'::uuid,8621::bigint,10000::bigint),
      ('a322b5e9-c3fb-4266-b90c-a287c321e593'::uuid,'3291854d-34b8-4c28-b93a-f1e18d46b998'::uuid,603::bigint,700::bigint),
      ('d82a0f38-7ae3-475c-863c-4caba01c126f'::uuid,'66d5da69-7a13-4ec8-a6ec-0a4eb667d890'::uuid,1078::bigint,1250::bigint),
      ('264a23e7-0936-4f28-bddf-3fac93bd159a'::uuid,'2473daa0-3df0-4e84-bbb5-1373396e2250'::uuid,603::bigint,700::bigint),
      ('8ba462c3-1766-488a-a248-cd4da558cd17'::uuid,'778012c2-e971-4b68-83f0-2a32e422cb25'::uuid,21121::bigint,22000::bigint),
      ('d201ea0e-6a38-4314-8fb6-bf8c37310f42'::uuid,'49f53aa8-268e-40b1-bae9-63eaf42d7345'::uuid,15776::bigint,17300::bigint)
    ) manifest(payment_id,order_id,old_amount,new_amount)
  loop
    if not exists(
      select 1 from public.payments p
      where p.id=v_payment.payment_id and p.company_id=v_jutik
        and p.order_id=v_payment.order_id and p.amount=v_payment.old_amount
        and p.status='settled'
    ) then raise exception 'payment_repair_precondition_failed: %',v_payment.payment_id; end if;
    if not exists (
      select 1 from public.ledger_journal_lines l
      join public.ledger_journal_entries e on e.id=l.entry_id
      join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=v_jutik and l.order_id=v_payment.order_id
        and a.code='ACCOUNTS_RECEIVABLE' and e.source_type='PaymentAllocation'
        and l.credit=v_payment.new_amount and l.debit=0
    ) then raise exception 'payment_repair_missing_ledger_evidence: %',v_payment.payment_id; end if;
    update public.payments set amount=v_payment.new_amount where id=v_payment.payment_id;
  end loop;

  -- The later KSh 1,900 receipt used the bad evidence and put KSh 172 on an
  -- already-settled invoice. Reallocate only AR between its two orders; cash
  -- and the receipt header remain unchanged.
  if not exists(
    select 1 from public.payments
    where id='0b200790-dfe7-4bab-8c81-4786013b5f90'
      and customer_receipt_id='7ea63027-88a9-4b01-9287-94e3189b71f7'
      and order_id='66d5da69-7a13-4ec8-a6ec-0a4eb667d890'
      and amount=172 and status='settled'
  ) then raise exception 'receipt_reallocation_precondition_failed'; end if;
  perform public.post_journal_entry(
    v_jutik,'CustomerReceiptReallocation','7ea63027-88a9-4b01-9287-94e3189b71f7',
    'Correct migrated receipt allocation',jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',172,
        'order_id','66d5da69-7a13-4ec8-a6ec-0a4eb667d890',
        'meta',jsonb_build_object('customerId','387e3b97-3315-486f-9958-3e2a5e0846d6',
          'receiptId','7ea63027-88a9-4b01-9287-94e3189b71f7',
          'paymentId','0b200790-dfe7-4bab-8c81-4786013b5f90','repair','ledger-source-of-truth')),
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',172,
        'order_id','93a9f8f7-06a0-464f-859d-dfda684f8fe5',
        'meta',jsonb_build_object('customerId','387e3b97-3315-486f-9958-3e2a5e0846d6',
          'receiptId','7ea63027-88a9-4b01-9287-94e3189b71f7',
          'paymentId','0b200790-dfe7-4bab-8c81-4786013b5f90','repair','ledger-source-of-truth'))
    )
  );
  update public.payments set order_id='93a9f8f7-06a0-464f-859d-dfda684f8fe5'
  where id='0b200790-dfe7-4bab-8c81-4786013b5f90';

  -- Reverse every unscoped adjustment. Valid corrections are reposted against
  -- the exact order. The KSh 9,700 adjustment is preserved: its memo alone
  -- does not establish that it should be written off.
  for v_adjustment in
    select * from (values
      ('7e7b4f91-a4f7-489e-8a0b-e424b4078b69'::uuid,'cd34bd8a-4f6c-4a6f-a65b-d5d5aed520d0'::uuid,true),
      ('36f1b2e5-fd4f-4306-b1a4-2d61704d2ff8'::uuid,'e9b24e7f-3a0c-4f7c-a003-3c438378547e'::uuid,true),
      ('16e19bec-0ad1-4f24-b903-216ee5078fc0'::uuid,'93a9f8f7-06a0-464f-859d-dfda684f8fe5'::uuid,true),
      ('5a9d4ae8-1c20-4fa7-a370-bf996ec748e0'::uuid,'93a9f8f7-06a0-464f-859d-dfda684f8fe5'::uuid,true),
      ('1e2614db-010f-401c-a74d-2e9ca5f6cf57'::uuid,'93a9f8f7-06a0-464f-859d-dfda684f8fe5'::uuid,true),
      ('a36c81a8-5e5f-44a9-a107-71efa74d2bf0'::uuid,'778012c2-e971-4b68-83f0-2a32e422cb25'::uuid,true),
      ('5f15b463-99af-4def-a0eb-9feb50e361fd'::uuid,'5341d9d2-5c4d-43e5-b9a5-c524b7480953'::uuid,true),
      ('91b8199a-9db5-4e09-86f8-532ccc09da93'::uuid,'51e3fc04-23d3-4ca7-9801-c796b84117e9'::uuid,true)
    ) manifest(entry_id,order_id,repost)
  loop
    select * into v_entry from public.ledger_journal_entries
    where id=v_adjustment.entry_id and source_type='BalanceAdjustment';
    if v_entry.id is null then
      raise exception 'balance_adjustment_precondition_failed: %',v_adjustment.entry_id;
    end if;
    if not exists (
      select 1 from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      join public.orders o on o.id=v_adjustment.order_id
      where l.entry_id=v_entry.id and a.code='ACCOUNTS_RECEIVABLE'
        and l.order_id is null and l.company_id=o.company_id
        and l.customer_id=o.customer_id and o.company_id=v_jutik
    ) then raise exception 'adjustment_order_party_precondition_failed: %',v_entry.id; end if;
    if exists(select 1 from public.ledger_journal_entries where reversal_of=v_entry.id) then
      raise exception 'balance_adjustment_already_reversed: %',v_entry.id;
    end if;
    select jsonb_agg(jsonb_build_object(
      'account_code',a.code,'debit',l.credit,'credit',l.debit,
      'order_id',l.order_id,'meta',l.meta||jsonb_build_object(
        'repair','ledger-source-of-truth','originalEntryId',v_entry.id)
    ) order by l.id) into v_reversal_lines
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id
    where l.entry_id=v_entry.id;
    perform public.post_reversal_entry(v_entry.company_id,'BalanceAdjustmentReversal',
      v_entry.id::text,'Reverse legacy unscoped adjustment',v_reversal_lines,v_entry.id);
    if v_adjustment.repost then
      select jsonb_agg(jsonb_build_object(
        'account_code',a.code,'debit',l.debit,'credit',l.credit,
        'order_id',case when a.code='ACCOUNTS_RECEIVABLE' then v_adjustment.order_id end,
        'meta',l.meta||jsonb_build_object('repair','ledger-source-of-truth',
          'originalEntryId',v_entry.id,'orderId',v_adjustment.order_id)
      ) order by l.id) into v_lines
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      where l.entry_id=v_entry.id;
      perform public.post_journal_entry(v_entry.company_id,'BalanceAdjustmentAllocation',
        v_entry.id::text,'Allocate legacy adjustment to receivable document',v_lines);
    end if;
  end loop;

  -- v1 represented a credit sale as a settled "credit" pseudo-payment. The
  -- ledger correctly retains KSh 86 AR; repair the order/evidence semantics.
  if not exists(
    select 1 from public.orders o join public.payments p on p.order_id=o.id
    where o.id='2ac0a508-516d-4a42-8f6f-1dbac6f29cba'
      and not o.is_credit_sale and o.receivable_kind is null
      and p.id='97964688-d211-443c-ab97-122737420273'
      and p.method_code='credit' and p.amount=86 and p.status='settled'
  ) then raise exception 'kitho_credit_sale_precondition_failed'; end if;
  update public.payments set status='cancelled'
  where id='97964688-d211-443c-ab97-122737420273';
  update public.orders set is_credit_sale=true,receivable_kind='credit',updated_at=now()
  where id='2ac0a508-516d-4a42-8f6f-1dbac6f29cba';

  -- Non-cash historical corrections settle exposure but must never improve
  -- punctual-payment history.
  insert into public.credit_document_history_exclusions(
    company_id,side,party_id,document_id,reason
  )
  select o.company_id,'customer',o.customer_id,o.id,
    'Legacy balance correction allocated to the order; not payment evidence'
  from public.orders o
  where o.id=any(array[
    'cd34bd8a-4f6c-4a6f-a65b-d5d5aed520d0'::uuid,
    'e9b24e7f-3a0c-4f7c-a003-3c438378547e'::uuid,
    '93a9f8f7-06a0-464f-859d-dfda684f8fe5'::uuid,
    '778012c2-e971-4b68-83f0-2a32e422cb25'::uuid,
    '5341d9d2-5c4d-43e5-b9a5-c524b7480953'::uuid
  ])
  on conflict(company_id,side,document_id) do nothing;

  -- Retain the removed bridge in the existing immutable audit trail, not in a
  -- second balance table or compatibility view.
  insert into public.audit_log(company_id,table_name,operation,row_id,actor,old_data,new_data)
  select r.company_id,'legacy_customer_account_reconciliations','DELETE',r.id,
    auth.uid(),to_jsonb(r),null
  from public.legacy_customer_account_reconciliations r;
  delete from public.legacy_customer_account_reconciliations;
end;
$$;

drop table public.legacy_customer_account_reconciliations;

-- Future AR must be order-scoped. Account consistency also rejects negative
-- order balances, so an over-allocation cannot be hidden by another invoice.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_ledger_control_party()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text;v_source_type text;
begin
  select a.code into v_code from public.ledger_accounts a
  where a.id=new.account_id and a.company_id=new.company_id;
  if v_code='ACCOUNTS_RECEIVABLE' then
    if new.order_id is null then raise exception 'ar_order_required'; end if;
    new.customer_id:=coalesce(new.customer_id,
      case when new.meta->>'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.meta->>'customerId')::uuid end,
      (select o.customer_id from public.orders o
       where o.id=new.order_id and o.company_id=new.company_id));
    if new.customer_id is null then
      select e.source_type into v_source_type from public.ledger_journal_entries e where e.id=new.entry_id;
      if v_source_type='PaymentAllocation' then
        raise exception 'ar_allocation_without_debt: order % has no AR balance',new.order_id;
      end if;
      raise exception 'ar_customer_required';
    end if;
    if not exists(
      select 1 from public.orders o
      where o.id=new.order_id and o.company_id=new.company_id
        and o.customer_id=new.customer_id
    ) then raise exception 'ar_order_customer_mismatch'; end if;
  elsif v_code='ACCOUNTS_PAYABLE' then
    new.supplier_id:=coalesce(new.supplier_id,
      case when new.meta->>'supplierId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.meta->>'supplierId')::uuid end);
    if new.supplier_id is null then raise exception 'ap_supplier_required'; end if;
    if not exists(select 1 from public.customers c
      where c.id=new.supplier_id and c.company_id=new.company_id and c.is_supplier) then
      raise exception 'supplier_not_found';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.assert_customer_account_consistent(
  p_company_id uuid,p_customer_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_ledger bigint;v_documents bigint;v_order uuid;v_order_balance bigint;
begin
  v_ledger:=public.customer_ledger_balance(p_company_id,p_customer_id);
  v_documents:=public.customer_document_balance(p_company_id,p_customer_id);
  if v_ledger<>v_documents then
    raise exception 'customer_account_out_of_balance: ledger %, order-scoped %',
      v_ledger,v_documents;
  end if;
  select o.id,public.order_receivable_ledger_balance_core(o.id)
  into v_order,v_order_balance
  from public.orders o
  where o.company_id=p_company_id and o.customer_id=p_customer_id
    and public.order_receivable_ledger_balance_core(o.id)<0
  order by o.id limit 1;
  if v_order is not null then
    raise exception 'customer_order_ar_overallocated: order %, balance %',v_order,v_order_balance;
  end if;
end;
$$;

-- Settlement evidence is validated against AR journal credits. It is never used
-- to compute debt. Applying this to all touched AR orders avoids a legacy bypass.
create or replace function public.order_receivable_settlements_core(p_order_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(l.credit-l.debit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id=l.entry_id
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  where l.order_id=p_order_id and a.code='ACCOUNTS_RECEIVABLE'
    and e.source_type in (
      'Payment','PaymentAllocation','PaymentReversal',
      'CustomerReceipt','CustomerReceiptReversal','CustomerReceiptReallocation',
      'CustomerDepositApplication','CustomerDepositApplicationReversal'
    )
$$;
revoke all on function public.order_receivable_settlements_core(uuid) from public,anon,authenticated;
grant execute on function public.order_receivable_settlements_core(uuid) to service_role;

create or replace function public.assert_order_receivable_evidence(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_evidence bigint;v_ledger bigint;
begin
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null or v_order.status<>'completed' then return; end if;
  if not exists (
    select 1 from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id
    where l.order_id=p_order_id and a.code='ACCOUNTS_RECEIVABLE'
  ) then
    if v_order.receivable_kind in ('credit','cod') then
      raise exception 'receivable_order_missing_ledger: %',p_order_id;
    end if;
    return;
  end if;
  select coalesce(sum(p.amount),0)::bigint into v_evidence
  from public.payments p where p.order_id=p_order_id and p.status='settled';
  v_ledger:=public.order_receivable_settlements_core(p_order_id);
  if v_evidence<>v_ledger then
    raise exception 'payment_ledger_evidence_mismatch: order %, payments %, ledger %',
      p_order_id,v_evidence,v_ledger;
  end if;
end;
$$;
revoke all on function public.assert_order_receivable_evidence(uuid) from public,anon,authenticated;
grant execute on function public.assert_order_receivable_evidence(uuid) to service_role;

create or replace function public.enforce_order_receivable_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='orders' then
    perform public.assert_order_receivable_evidence(coalesce(new.id,old.id));
  else
    if tg_op<>'INSERT' then perform public.assert_order_receivable_evidence(old.order_id); end if;
    if tg_op<>'DELETE' then perform public.assert_order_receivable_evidence(new.order_id); end if;
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function public.enforce_order_receivable_evidence() from public,anon,authenticated;

create constraint trigger payments_receivable_evidence
after insert or update or delete on public.payments deferrable initially deferred
for each row execute function public.enforce_order_receivable_evidence();
create constraint trigger journal_lines_receivable_evidence
after insert on public.ledger_journal_lines deferrable initially deferred
for each row execute function public.enforce_order_receivable_evidence();
create constraint trigger orders_receivable_evidence
after insert or update on public.orders deferrable initially deferred
for each row execute function public.enforce_order_receivable_evidence();

-- Every ledger balance mutation schedules reconstruction of the disposable
-- credit cache, including non-cash corrections with no payment row.
create or replace function public.enqueue_credit_from_ar_ledger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.customer_id is not null then
    perform public.enqueue_credit_party(new.company_id,'customer',new.customer_id,'ar_ledger');
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_credit_from_ar_ledger() from public,anon,authenticated;
create trigger ledger_lines_enqueue_customer_credit
after insert on public.ledger_journal_lines
for each row execute function public.enqueue_credit_from_ar_ledger();

-- Route every active customer due consumer through the same ledger calculation.
CREATE OR REPLACE FUNCTION public.apply_customer_deposit(p_order_id uuid, p_amount bigint, p_client_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id(); v_order public.orders%rowtype; v_id uuid;
  v_due bigint; v_remaining bigint:=p_amount; v_available bigint; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.customer_deposit_applications
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null or v_order.status<>'completed' or v_order.customer_id is null then
    raise exception 'settleable_customer_order_not_found'; end if;
  v_due:=public.order_open_balance_core(p_order_id);
  if p_amount>v_due then raise exception 'ar_overpayment: % exceeds outstanding %',p_amount,v_due; end if;
  perform 1 from public.customer_deposits d
  where d.company_id=v_company_id and d.customer_id=v_order.customer_id and d.status='active'
  order by d.created_at,d.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.customer_deposit_source_balances b
  where b.company_id=v_company_id and b.customer_id=v_order.customer_id;
  if p_amount>v_available then raise exception 'insufficient_customer_deposit: % available',v_available; end if;
  insert into public.customer_deposit_applications(company_id,customer_id,order_id,amount,client_ref,created_by)
  values(v_company_id,v_order.customer_id,p_order_id,p_amount,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.customer_deposit_source_balances b
    where b.company_id=v_company_id and b.customer_id=v_order.customer_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.customer_deposit_allocations(company_id,application_id,deposit_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  insert into public.payments(company_id,order_id,method_code,amount,status,location_id,
    settlement_kind,customer_deposit_application_id)
  values(v_company_id,p_order_id,'customer_deposit',p_amount,'settled',v_order.location_id,
    'customer_deposit',v_id);
  perform public.post_journal_entry(v_company_id,'CustomerDepositApplication',v_id::text,
    'Apply customer deposit to '||v_order.code,jsonb_build_array(
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','debit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code)),
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code))));
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.credit_reminder_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row record;v_pending record;v_rule record;v_template record;v_token text;v_url text;
  v_body text;v_fallback_body text;v_outbox uuid;v_count int:=0;v_statement_origin text;
  v_missing_url_notified uuid[]:='{}';v_admin_user_id uuid;
begin
  select nullif(rtrim(decrypted_secret,'/'),'') into v_statement_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;

  -- A payment can settle the debt after a reminder was queued but before the
  -- worker sends it. Release that reservation and cancel the stale delivery.
  for v_pending in
    select o.id,o.attempts from public.outbox o
    where o.source='reminder' and o.status='pending'
      and not exists(
        select 1 from public.orders sale
        where sale.company_id=o.company_id and sale.customer_id=o.customer_id
          and sale.is_credit_sale and sale.status='completed'
          and public.order_open_balance_core(sale.id)>0
      )
    for update
  loop
    perform public.finalize_message_quota(v_pending.id,v_pending.attempts>0);
    update public.outbox set status='cancelled',
      error=case when v_pending.attempts>0 then 'balance_settled_after_attempt_delivery_uncertain' else 'balance_settled' end
    where id=v_pending.id and status='pending';
  end loop;

  for v_row in
    select c.id company_id,cu.id customer_id,cu.first_name,cu.phone,c.name store_name,
      cu.notifications_enabled,cu.sms_notifications_enabled,cu.whatsapp_notifications_enabled,
      c.payment_reminder_channel,c.payment_reminder_sms_fallback,sum(a.balance)::bigint balance,
      min(a.credit_due_at) earliest_due_date,
      max((now() at time zone 'Africa/Nairobi')::date-a.credit_due_at)::int days_overdue
    from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
    join public.customers cu on cu.company_id=c.id
    join (select o.company_id,o.customer_id,o.credit_due_at,
      public.order_open_balance_core(o.id) balance
      from public.orders o where o.is_credit_sale and o.status='completed') a
      on a.company_id=c.id and a.customer_id=cu.id
    where public.external_messaging_allowed(c.id,true) and c.payment_reminders_enabled and t.payment_reminders_available and a.balance>0
      and a.credit_due_at<=(now() at time zone 'Africa/Nairobi')::date
      and public.company_subscription_accessible(c.id)
    group by c.id,cu.id,cu.first_name,cu.phone,cu.notifications_enabled,cu.sms_notifications_enabled,
      cu.whatsapp_notifications_enabled,c.name,c.payment_reminder_channel,c.payment_reminder_sms_fallback
  loop
    select * into v_rule from public.payment_reminder_rules r where r.company_id=v_row.company_id
      and r.stage_days=v_row.days_overdue and r.enabled;
    if not found or exists(select 1 from public.credit_notification_checkpoints cp where cp.company_id=v_row.company_id
      and cp.customer_id=v_row.customer_id and cp.bucket='due_'||v_row.days_overdue) then continue; end if;
    if v_row.phone is null or not v_row.notifications_enabled
      or (v_row.payment_reminder_channel='sms' and not v_row.sms_notifications_enabled)
      or (v_row.payment_reminder_channel='whatsapp' and not v_row.whatsapp_notifications_enabled) then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        case when v_row.phone is null then 'Customer has no phone number.' else 'Customer has opted out of this channel.' end,
        '/customers/'||v_row.customer_id::text);
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      continue;
    end if;
    if v_statement_origin is null then
      if not (v_row.company_id=any(v_missing_url_notified)) then
        select coalesce(
          (select m.user_id from public.company_memberships m join public.roles role on role.id=m.role_id
           where m.company_id=v_row.company_id and m.authorization_status='approved'
             and 'ManageTeam'=any(role.permissions) order by m.created_at limit 1),
          (select m.user_id from public.company_memberships m where m.company_id=v_row.company_id
           and m.authorization_status='approved' order by m.created_at limit 1))
        into v_admin_user_id;
        perform public.notify(v_row.company_id,'credit_reminder','Payment reminders are not configured',
          'STOREFRONT_PUBLIC_URL is missing. No reminder was sent.','/settings',v_admin_user_id);
        v_missing_url_notified:=array_append(v_missing_url_notified,v_row.company_id);
      end if;
      continue;
    end if;
    v_token:=public.issue_customer_statement_link(v_row.company_id,v_row.customer_id);
    v_url:=v_statement_origin||'/statement/'||v_token;
    select mt.* into v_template
    from public.message_templates mt where mt.template_key=v_rule.template_key
      and (mt.company_id=v_row.company_id or mt.company_id is null)
    order by mt.company_id nulls last limit 1;
    if not found then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        'Reminder template is missing.','/messaging');
      continue;
    end if;
    v_body:=public.render_message_template(
      case when v_row.payment_reminder_channel='sms' then v_template.sms_body else v_template.whatsapp_body end,
      jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
        'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
        'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY')));
    v_fallback_body:=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then
      public.render_message_template(v_template.sms_body,
        jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
          'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
          'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY'))) end;
    begin
      v_outbox:=public.queue_message(v_row.company_id,v_row.payment_reminder_channel,v_row.phone,v_body);
      update public.outbox set source='reminder',customer_id=v_row.customer_id,template_key=v_rule.template_key,
        template_version=v_template.version,fallback_body=v_fallback_body,
        fallback_channel=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then 'sms' end,
        max_attempts=case when v_row.payment_reminder_channel='whatsapp' then 2 else 5 end where id=v_outbox;
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      v_count:=v_count+1;
    exception when others then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',sqlerrm,'/messaging');
    end;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.external_document_context(p_document_type text, p_subject_id uuid, p_channel text, p_include_company_copy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();v_company public.companies%rowtype;
  v_party public.customers%rowtype;v_order public.orders%rowtype;v_purchase public.purchases%rowtype;
  v_paid bigint:=0;v_balance bigint:=0;v_lines jsonb:='[]'::jsonb;v_payments jsonb:='[]'::jsonb;
  v_number text;v_issue_date date;v_valid_until date;v_total bigint;v_status text;v_notes text;
  v_copy_phone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if p_document_type not in ('receipt','invoice','proforma','purchase_order') then
    raise exception 'invalid_document_type'; end if;
  if not public.external_messaging_allowed(v_company_id,false) then
    raise exception 'external_messaging_disabled'; end if;
  select * into v_company from public.companies where id=v_company_id;

  if p_document_type in ('receipt','invoice','proforma') then
    select * into v_order from public.orders where id=p_subject_id and company_id=v_company_id;
    if not found or v_order.customer_id is null then raise exception 'customer_order_required'; end if;
    select * into v_party from public.customers
      where id=v_order.customer_id and company_id=v_company_id and not is_supplier;
    if not found then raise exception 'customer_not_found'; end if;
    select coalesce(sum(p.amount),0)::bigint into v_paid from public.payments p
      where p.order_id=v_order.id and p.status='settled';
    v_balance:=case when v_order.status='draft' then v_order.total
      else public.order_open_balance_core(v_order.id) end;
    if p_document_type='receipt' and (v_order.status<>'completed' or v_balance>0) then
      raise exception 'fully_settled_sale_required';
    elsif p_document_type='invoice' and (v_order.status<>'completed' or not v_order.is_credit_sale) then
      raise exception 'completed_credit_sale_required';
    elsif p_document_type='proforma' and (v_order.status<>'draft' or v_order.expires_at<=now()) then
      raise exception 'active_proforma_required';
    end if;
    v_number:=v_order.code;v_total:=v_order.total;
    v_issue_date:=(v_order.created_at at time zone 'Africa/Nairobi')::date;
    v_valid_until:=case when p_document_type='proforma'
      then (v_order.expires_at at time zone 'Africa/Nairobi')::date else v_order.credit_due_at end;
    v_status:=case when p_document_type='proforma' then 'active'
      when v_balance=0 then 'paid' else 'outstanding' end;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')||public.transaction_unit_suffix(ol.unit_name,ol.units_per_unit,ol.stock_unit_name),
      'quantity',ol.quantity,'unit_price',coalesce(ol.custom_price,ol.unit_price),'line_total',ol.line_total)
      order by ol.created_at),'[]'::jsonb) into v_lines
    from public.order_lines ol left join public.variant_catalog vc on vc.variant_id=ol.variant_id
    where ol.order_id=v_order.id and ol.company_id=v_company_id;
    select coalesce(jsonb_agg(jsonb_build_object('method',p.method_code,'amount',p.amount,
      'reference',p.reference,'date',p.created_at) order by p.created_at),'[]'::jsonb) into v_payments
    from public.payments p where p.order_id=v_order.id and p.status='settled';
  else
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required'; end if;
    select * into v_purchase from public.purchases where id=p_subject_id and company_id=v_company_id;
    if not found then raise exception 'purchase_not_found'; end if;
    select * into v_party from public.customers where id=v_purchase.supplier_id
      and company_id=v_company_id and is_supplier and supplier_active;
    if not found then raise exception 'active_supplier_required'; end if;
    v_number:=coalesce(nullif(trim(v_purchase.reference),''),'PO-'||upper(left(v_purchase.id::text,8)));
    v_total:=v_purchase.total_cost;v_balance:=0;v_paid:=0;v_status:='issued';v_notes:=v_purchase.notes;
    v_issue_date:=v_purchase.purchase_date;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')||public.transaction_unit_suffix(pl.unit_name,pl.units_per_unit,pl.stock_unit_name),
      'quantity',pl.quantity,'unit_price',pl.unit_cost,'line_total',pl.line_total)
      order by pl.created_at),'[]'::jsonb) into v_lines
    from public.purchase_lines pl left join public.variant_catalog vc on vc.variant_id=pl.variant_id
    where pl.purchase_id=v_purchase.id and pl.company_id=v_company_id;
  end if;

  if nullif(trim(v_party.phone),'') is null then raise exception 'recipient_has_no_phone'; end if;
  if not v_party.notifications_enabled
    or (p_channel='sms' and not v_party.sms_notifications_enabled)
    or (p_channel='whatsapp' and not v_party.whatsapp_notifications_enabled) then
    raise exception 'recipient_opted_out'; end if;
  if p_include_company_copy and p_document_type not in ('invoice','purchase_order') then
    raise exception 'company_copy_not_available'; end if;
  if p_include_company_copy then
    v_copy_phone:=nullif(trim(v_company.public_whatsapp_number),'');
    if v_copy_phone is null then raise exception 'company_whatsapp_not_configured'; end if;
    if regexp_replace(v_copy_phone,'\D','','g')=regexp_replace(v_party.phone,'\D','','g') then
      raise exception 'company_copy_matches_recipient'; end if;
  end if;

  return jsonb_build_object('company_id',v_company_id,'company_name',v_company.name,
    'company_address',v_company.address,'company_whatsapp',v_company.public_whatsapp_number,
    'company_logo_path',v_company.logo_path,'party_id',v_party.id,
    'party_name',trim(v_party.first_name||' '||coalesce(v_party.last_name,'')),
    'recipient',v_party.phone,'company_copy_recipient',v_copy_phone,
    'document_type',p_document_type,'document_number',v_number,'subject_id',p_subject_id,
    'issue_date',v_issue_date,'valid_until',v_valid_until,'total',v_total,'paid',v_paid,
    'balance',v_balance,'status',v_status,'notes',v_notes,'lines',v_lines,'payments',v_payments,
    'channel',p_channel,'include_company_copy',p_include_company_copy);
end;
$function$;

CREATE OR REPLACE FUNCTION public.execute_customer_receipt_reversal(p_receipt_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid:=public.current_company_id();
  v_customer_id uuid;
  v_receipt public.customer_receipts%rowtype;
  v_entry public.ledger_journal_entries%rowtype;
  v_existing uuid;
  v_deposit public.customer_deposits%rowtype;
  v_line record;
  v_lines jsonb:='[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select customer_id into v_customer_id from public.customer_receipts
    where id=p_receipt_id and company_id=v_company_id;
  if v_customer_id is null then raise exception 'customer_receipt_not_found'; end if;
  perform public.lock_customer_account(v_company_id,v_customer_id);
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=v_company_id for update;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  select id into v_existing from public.ledger_journal_entries where company_id=v_company_id
    and source_type='CustomerReceiptReversal' and source_id=p_receipt_id::text||'-reversal';
  if v_existing is not null then return v_existing; end if;
  if v_receipt.status<>'posted' then raise exception 'customer_receipt_not_reversible: %',v_receipt.status; end if;
  if exists(select 1 from public.payments where customer_receipt_id=v_receipt.id
    and status<>'settled') then raise exception 'receipt_has_dependent_activity: invoice allocation changed'; end if;
  select * into v_deposit from public.customer_deposits where customer_receipt_id=v_receipt.id for update;
  if v_deposit.id is not null and (v_deposit.status<>'active' or
    public.customer_deposit_available(v_receipt.customer_id)<v_deposit.amount or
    (select available from public.customer_deposit_source_balances where id=v_deposit.id)<v_deposit.amount) then
    raise exception 'receipt_has_dependent_activity: downpayment was applied or refunded';
  end if;
  select * into v_entry from public.ledger_journal_entries where company_id=v_company_id
    and source_type='CustomerReceipt' and source_id=v_receipt.id::text;
  if v_entry.id is null then raise exception 'original_entry_not_found: %',v_receipt.id; end if;
  for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id or l.entry_id in (
      select e.id from public.ledger_journal_entries e
      where e.company_id=v_company_id and e.source_type='CustomerReceiptReallocation'
        and e.source_id=v_receipt.id::text
    )
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,'order_id',v_line.order_id,'meta',v_line.meta);
  end loop;
  v_existing:=public.post_reversal_entry(v_company_id,'CustomerReceiptReversal',
    v_receipt.id::text||'-reversal','Reverse customer receipt: '||btrim(p_reason),v_lines,v_entry.id);
  update public.payments set status='cancelled' where customer_receipt_id=v_receipt.id;
  update public.customer_deposits set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where customer_receipt_id=v_receipt.id;
  update public.customer_receipts set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_receipt.id;
  return v_existing;
end; $function$;

CREATE OR REPLACE FUNCTION public.refresh_credit_party(p_company_id uuid, p_side text, p_party_id uuid, p_baseline boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date;v_timezone text;v_party record;v_previous public.party_credit_profile%rowtype;
  v_score numeric;v_raw_score numeric;v_band text;v_confidence text;v_recommendation text;
  v_punctuality numeric;v_overdue_component numeric;v_utilization_component numeric;v_trend numeric;
  v_weight numeric:=0;v_total numeric:=0;v_balance bigint;v_limit bigint;v_overdue bigint;
  v_oldest date;v_oldest_days integer;v_settled integer;v_history integer;v_utilization numeric;
  v_material numeric;v_reasons text[]:=array[]::text[];v_next date;v_opportunity bigint;v_changed boolean;
begin
  if p_side not in ('customer','supplier') then raise exception 'invalid_credit_side'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  select c.*,trim(concat_ws(' ',c.first_name,c.last_name)) party_name into v_party
  from public.customers c where c.id=p_party_id and c.company_id=p_company_id;
  if not found then return; end if;
  v_limit:=case when p_side='supplier' then v_party.supplier_credit_limit else v_party.credit_limit end;
  select * into v_previous from public.party_credit_profile
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  delete from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  if p_side='customer' then
    insert into public.credit_document_performance(company_id,side,party_id,document_id,document_code,
      issued_on,due_on,original_amount,settled_amount,outstanding_amount,settled_on,
      settled_days_late,punctuality_factor,overdue_days,settled_principal_days,
      principal_days_as_of,next_refresh_on,refreshed_at)
    select p_company_id,'customer',o.customer_id,o.id,o.code,
      (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date,
      coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),
      public.order_open_balance_core(o.id)+public.order_receivable_settlements_core(o.id),
      public.order_receivable_settlements_core(o.id),public.order_open_balance_core(o.id),
      pay.settled_on,
      case when public.order_open_balance_core(o.id)=0 then greatest(pay.settled_on-coalesce(o.credit_due_at,
        (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0) end,
      pay.punctuality,greatest(v_today-coalesce(o.credit_due_at,
        (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0),
      coalesce(pay.principal_days,0),v_today,
      case when public.order_open_balance_core(o.id)>0 then
        (select min(x) from unnest(array[
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+8,
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+31,
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+61
        ]) x where x>v_today) end,now()
    from public.orders o
    left join lateral (
      select sum(p.amount) filter(where p.status='settled')::bigint paid,
        max(coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date))
          filter(where p.status='settled') settled_on,
        case when sum(p.amount) filter(where p.status='settled')>0 then
          sum(p.amount*(case
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date) then 1
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+7 then .8
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+30 then .5
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+60 then .2 else 0 end))
            filter(where p.status='settled')/nullif(sum(p.amount) filter(where p.status='settled'),0) end punctuality,
        sum(p.amount*greatest(coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)-
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0))
          filter(where p.status='settled') principal_days
      from public.payments p left join public.customer_receipts r on r.id=p.customer_receipt_id
      where p.order_id=o.id
    ) pay on true
    where o.company_id=p_company_id and o.customer_id=p_party_id and o.is_credit_sale
      and o.status='completed' and (public.order_open_balance_core(o.id)>0
        or pay.settled_on>=v_today-365);
  else
    insert into public.credit_document_performance(company_id,side,party_id,document_id,document_code,
      issued_on,due_on,original_amount,settled_amount,outstanding_amount,settled_on,
      settled_days_late,punctuality_factor,overdue_days,settled_principal_days,
      principal_days_as_of,next_refresh_on,refreshed_at)
    select p_company_id,'supplier',p.supplier_id,p.id,coalesce(nullif(p.reference,''),'Purchase '||left(p.id::text,8)),
      p.purchase_date,coalesce(p.credit_due_at,p.purchase_date),p.total_cost,
      least(coalesce(pay.paid,0),p.total_cost),greatest(p.total_cost-coalesce(pay.paid,0),0),pay.settled_on,
      case when coalesce(pay.paid,0)>=p.total_cost then greatest(pay.settled_on-coalesce(p.credit_due_at,p.purchase_date),0) end,
      pay.punctuality,greatest(v_today-coalesce(p.credit_due_at,p.purchase_date),0),
      coalesce(pay.principal_days,0),v_today,
      case when p.total_cost-coalesce(pay.paid,0)>0 then
        (select min(x) from unnest(array[coalesce(p.credit_due_at,p.purchase_date),
          coalesce(p.credit_due_at,p.purchase_date)+8,coalesce(p.credit_due_at,p.purchase_date)+31,
          coalesce(p.credit_due_at,p.purchase_date)+61]) x where x>v_today) end,now()
    from public.purchases p
    left join lateral (
      select sum(pp.amount) filter(where pp.status='settled')::bigint paid,
        max(coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date))
          filter(where pp.status='settled') settled_on,
        case when sum(pp.amount) filter(where pp.status='settled')>0 then
          sum(pp.amount*(case
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date) then 1
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+7 then .8
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+30 then .5
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+60 then .2 else 0 end))
            filter(where pp.status='settled')/nullif(sum(pp.amount) filter(where pp.status='settled'),0) end punctuality,
        sum(pp.amount*greatest(coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)-
          coalesce(p.credit_due_at,p.purchase_date),0)) filter(where pp.status='settled') principal_days
      from public.purchase_payments pp left join public.supplier_payments sp on sp.id=pp.supplier_payment_id
      where pp.purchase_id=p.id
    ) pay on true
    where p.company_id=p_company_id and p.supplier_id=p_party_id and p.is_credit and p.status='posted'
      and (p.total_cost-coalesce(pay.paid,0)>0 or pay.settled_on>=v_today-365);
  end if;

  select coalesce(sum(outstanding_amount),0)::bigint,
    coalesce(sum(outstanding_amount) filter(where due_on<v_today),0)::bigint,
    min(due_on) filter(where outstanding_amount>0 and due_on<v_today),
    coalesce(max(v_today-due_on) filter(where outstanding_amount>0 and due_on<v_today),0)::int,
    count(*) filter(where outstanding_amount=0)::int,
    coalesce(v_today-min(issued_on),0)::int,
    sum(punctuality_factor*settled_amount*(case when settled_on>=v_today-90 then 1
      when settled_on>=v_today-180 then .75 else .5 end)) /
      nullif(sum(settled_amount*(case when settled_on>=v_today-90 then 1
      when settled_on>=v_today-180 then .75 else .5 end)) filter(where punctuality_factor is not null),0),
    min(next_refresh_on),
    coalesce(round(sum(settled_principal_days+outstanding_amount*greatest(v_today-due_on,0)) *
      (select credit_opportunity_rate_bps from public.companies where id=p_company_id)/10000.0/365.0),0)::bigint
  into v_balance,v_overdue,v_oldest,v_oldest_days,v_settled,v_history,v_punctuality,v_next,v_opportunity
  from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  v_utilization:=case when v_limit>0 then v_balance::numeric/v_limit end;
  if v_punctuality is not null then v_total:=v_total+v_punctuality*.45;v_weight:=v_weight+.45; end if;
  if v_balance>0 then
    v_overdue_component:=greatest(0,1-(v_overdue::numeric/greatest(v_balance,1)) *
      (case when v_oldest_days>60 then 1 when v_oldest_days>30 then .8 when v_oldest_days>7 then .6 else .4 end));
    v_total:=v_total+v_overdue_component*.30;v_weight:=v_weight+.30;
  end if;
  if v_limit>0 then
    v_utilization_component:=case when v_utilization<=.5 then 1 when v_utilization<=1 then 2-2*v_utilization else 0 end;
    v_total:=v_total+v_utilization_component*.15;v_weight:=v_weight+.15;
  end if;
  select .5+greatest(-1,least(1,
    coalesce(avg(punctuality_factor) filter(where settled_on>=v_today-90),.5)-
    coalesce(avg(punctuality_factor) filter(where settled_on between v_today-180 and v_today-91),.5)))/2
  into v_trend from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id and punctuality_factor is not null;
  if v_settled>=2 then v_total:=v_total+v_trend*.10;v_weight:=v_weight+.10; end if;

  if v_settled=0 and v_overdue=0 then
    v_score:=null;v_band:='unrated';v_confidence:='unrated';
  else
    v_raw_score:=round((10*v_total/nullif(v_weight,0))::numeric,1);
    v_score:=least(v_raw_score,case when v_settled=0 then 6.9 else 10 end);
    if v_limit>0 and v_balance>v_limit then v_score:=least(v_score,6.9); end if;
    v_material:=v_overdue::numeric/greatest(v_balance,v_limit,1);
    if v_oldest_days>30 and v_material>=.10 then v_score:=least(v_score,4.9); end if;
    if v_oldest_days>60 and v_material>=.25 then v_score:=least(v_score,2.9); end if;
    v_band:=case when v_score>=8.5 then 'strong' when v_score>=7 then 'good'
      when v_score>=5 then 'watch' when v_score>=3 then 'restricted' else 'high_risk' end;
    v_confidence:=case when v_settled<3 or v_history<90 then 'provisional' else 'established' end;
  end if;
  v_recommendation:=case v_band when 'strong' then 'maintain_review_eligible'
    when 'good' then 'maintain' when 'watch' then 'pause_increases_target_down_10'
    when 'restricted' then 'manager_review_target_down_25'
    when 'high_risk' then 'pause_new_credit' else 'establish_limit' end;
  if v_limit=0 and v_band<>'unrated' then v_recommendation:='establish_limit'; end if;
  if v_limit>0 and v_balance>v_limit then v_reasons:=array_append(v_reasons,'over_limit'); end if;
  if v_oldest_days>60 then v_reasons:=array_append(v_reasons,'overdue_60_plus');
  elsif v_oldest_days>30 then v_reasons:=array_append(v_reasons,'overdue_31_60');
  elsif v_oldest_days>7 then v_reasons:=array_append(v_reasons,'overdue_8_30');
  elsif v_oldest_days>0 then v_reasons:=array_append(v_reasons,'overdue_1_7'); end if;
  if v_punctuality is not null and v_punctuality<.5 then v_reasons:=array_append(v_reasons,'frequently_late'); end if;
  if cardinality(v_reasons)=0 then v_reasons:=array['no_current_risk']; end if;

  v_changed:=v_previous.party_id is null or v_previous.score is distinct from v_score
    or v_previous.band is distinct from v_band or v_previous.confidence is distinct from v_confidence;
  insert into public.party_credit_profile(company_id,side,party_id,party_name,score,band,confidence,
    balance,credit_limit,available_credit,utilization,overdue_amount,oldest_due_on,oldest_overdue_days,
    settled_documents,history_days,punctuality,recommendation_code,reason_codes,opportunity_cost,
    next_refresh_on,refreshed_at)
  values(p_company_id,p_side,p_party_id,v_party.party_name,v_score,v_band,v_confidence,v_balance,v_limit,
    case when v_limit>0 then greatest(v_limit-v_balance,0) end,v_utilization,v_overdue,v_oldest,v_oldest_days,
    v_settled,v_history,v_punctuality,v_recommendation,v_reasons,v_opportunity,v_next,now())
  on conflict(company_id,side,party_id) do update set party_name=excluded.party_name,score=excluded.score,
    band=excluded.band,confidence=excluded.confidence,balance=excluded.balance,credit_limit=excluded.credit_limit,
    available_credit=excluded.available_credit,utilization=excluded.utilization,
    overdue_amount=excluded.overdue_amount,oldest_due_on=excluded.oldest_due_on,
    oldest_overdue_days=excluded.oldest_overdue_days,settled_documents=excluded.settled_documents,
    history_days=excluded.history_days,punctuality=excluded.punctuality,
    recommendation_code=excluded.recommendation_code,reason_codes=excluded.reason_codes,
    opportunity_cost=excluded.opportunity_cost,next_refresh_on=excluded.next_refresh_on,refreshed_at=now();

  if v_changed then
    insert into public.credit_profile_events(company_id,side,party_id,model_version,score,band,confidence,reason_codes)
    values(p_company_id,p_side,p_party_id,'credit-v1',v_score,v_band,v_confidence,v_reasons);
  end if;
  if not p_baseline and p_side='customer' and v_previous.party_id is not null
    and v_previous.band is distinct from v_band and v_band<>'unrated' then
    insert into public.credit_band_notification_queue(company_id,customer_id,from_band,to_band,score,reason_code,send_after)
    values(p_company_id,p_party_id,v_previous.band,v_band,v_score,v_reasons[1],
      greatest(now(),coalesce((select max(sent_at)+interval '14 days' from public.credit_band_notification_queue
        where company_id=p_company_id and customer_id=p_party_id),now())))
    on conflict(company_id,customer_id) do update set
      from_band=case when public.credit_band_notification_queue.sent_at is null
        then public.credit_band_notification_queue.from_band else excluded.from_band end,
      to_band=excluded.to_band,score=excluded.score,reason_code=excluded.reason_code,changed_at=now(),
      send_after=greatest(public.credit_band_notification_queue.send_after,excluded.send_after),
      sent_at=null,last_error=null;
  end if;
end;
$function$;

-- Rebuild derived scoring data once; these tables remain disposable caches.
-- Baseline mode avoids sending credit-band messages during the maintenance.
do $$
declare v_party record;
begin
  for v_party in select distinct company_id,customer_id from public.orders
    where customer_id is not null and receivable_kind='credit'
  loop
    perform public.refresh_credit_party(v_party.company_id,'customer',v_party.customer_id,true);
  end loop;
end;
$$;

-- Abort the entire migration if any monetary account or customer balance moved.
do $$
declare r record;
begin
  if exists (
    (select * from receivable_repair_account_baseline
     except select company_id,account_id,sum(debit-credit)::bigint
       from public.ledger_journal_lines group by company_id,account_id)
    union all
    (select company_id,account_id,sum(debit-credit)::bigint
       from public.ledger_journal_lines group by company_id,account_id
     except select * from receivable_repair_account_baseline)
  ) then raise exception 'repair_changed_ledger_account_balances'; end if;
  if exists (
    (select * from receivable_repair_customer_baseline
     except select l.company_id,l.customer_id,sum(l.debit-l.credit)::bigint
       from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
       where a.code='ACCOUNTS_RECEIVABLE' group by l.company_id,l.customer_id)
    union all
    (select l.company_id,l.customer_id,sum(l.debit-l.credit)::bigint
       from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
       where a.code='ACCOUNTS_RECEIVABLE' group by l.company_id,l.customer_id
     except select * from receivable_repair_customer_baseline)
  ) then raise exception 'repair_changed_customer_balances'; end if;
  for r in select company_id,id from public.customers loop
    perform public.assert_customer_account_consistent(r.company_id,r.id);
  end loop;
  for r in select distinct order_id from public.ledger_journal_lines
    where order_id is not null loop
    perform public.assert_order_receivable_evidence(r.order_id);
  end loop;
end;
$$;
commit;
