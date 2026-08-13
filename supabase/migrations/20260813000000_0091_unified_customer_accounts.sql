-- Unified customer accounts. A receipt is one cash event whose customer-side
-- credit clears FIFO receivables before becoming an unapplied downpayment.

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount bigint not null check (amount > 0),
  method_code text not null,
  reference text,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid references public.cashier_sessions(id),
  client_ref text not null,
  request_fingerprint text not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval','posted','reversed','cancelled')),
  applied_amount bigint not null default 0 check (applied_amount >= 0),
  downpayment_amount bigint not null default 0 check (downpayment_amount >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  check (applied_amount + downpayment_amount in (0, amount))
);

create unique index customer_receipts_client_ref_unique
  on public.customer_receipts(company_id,client_ref);
create index customer_receipts_customer_activity_idx
  on public.customer_receipts(company_id,customer_id,created_at desc,id desc);

alter table public.customer_receipts enable row level security;
create policy "customer receipts readable by members" on public.customer_receipts for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.customer_receipts to authenticated;
grant all on public.customer_receipts to service_role;

alter table public.payments
  add column customer_receipt_id uuid references public.customer_receipts(id);
create index payments_customer_receipt_idx on public.payments(customer_receipt_id)
  where customer_receipt_id is not null;

alter table public.customer_deposits
  add column customer_receipt_id uuid references public.customer_receipts(id);
create unique index customer_deposits_receipt_unique
  on public.customer_deposits(customer_receipt_id) where customer_receipt_id is not null;

alter table public.orders add column account_sale_request_fingerprint text;

create or replace function public.lock_customer_account(p_company_id uuid,p_customer_id uuid)
returns void language sql security definer set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_company_id::text||':customer-account:'||p_customer_id::text,0))
$$;
revoke execute on function public.lock_customer_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_customer_account(uuid,uuid) to service_role;

create or replace function public.customer_receipt_result(p_receipt_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'receipt_id',r.id,
    'amount',r.amount,
    'applied_amount',r.applied_amount,
    'downpayment_amount',r.downpayment_amount,
    'allocations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_id',p.id,'order_id',o.id,'order_code',o.code,'amount',p.amount
      ) order by o.created_at,o.id)
      from public.payments p join public.orders o on o.id=p.order_id
      where p.customer_receipt_id=r.id
    ),'[]'::jsonb)
  )
  from public.customer_receipts r
  where r.id=p_receipt_id and r.company_id=public.current_company_id()
$$;
revoke execute on function public.customer_receipt_result(uuid) from public,anon;
grant execute on function public.customer_receipt_result(uuid) to authenticated,service_role;

create or replace function public.customer_receipt_preview(p_customer_id uuid,p_amount bigint)
returns jsonb language sql stable security definer set search_path='' as $$
  with due as (
    select o.id,o.code,o.created_at,
      greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)::bigint due
    from public.orders o left join public.payments p on p.order_id=o.id and p.company_id=o.company_id
    where o.company_id=public.current_company_id() and o.customer_id=p_customer_id
      and o.is_credit_sale and o.status='completed'
    group by o.id
  ), running as (
    select d.*,coalesce(sum(d.due) over(order by d.created_at,d.id rows between unbounded preceding and 1 preceding),0)::bigint prior
    from due d where d.due>0
  ), allocations as (
    select id,code,created_at,least(due,greatest(p_amount-prior,0))::bigint amount
    from running where p_amount>prior
  ), totals as (
    select coalesce(sum(amount),0)::bigint applied,
      coalesce(jsonb_agg(jsonb_build_object('order_id',id,'order_code',code,'amount',amount)
        order by created_at,id) filter(where amount>0),'[]'::jsonb) allocations
    from allocations
  )
  select jsonb_build_object('amount',p_amount,'applied_amount',applied,
    'downpayment_amount',greatest(p_amount-applied,0),'allocations',allocations) from totals
$$;
revoke execute on function public.customer_receipt_preview(uuid,bigint) from public,anon;
grant execute on function public.customer_receipt_preview(uuid,bigint) to authenticated,service_role;

create or replace function public.execute_customer_receipt(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_customer_id uuid;
  v_receipt public.customer_receipts%rowtype;
  v_order record;
  v_remaining bigint;
  v_take bigint;
  v_applied bigint:=0;
  v_deposit_id uuid;
  v_payment_id uuid;
  v_account_code text;
  v_lines jsonb:='[]'::jsonb;
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
    and o.is_credit_sale and o.status='completed'
  order by o.created_at,o.id for update;

  for v_order in
    select o.id,o.code,o.created_at,
      greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)::bigint due
    from public.orders o left join public.payments p on p.order_id=o.id and p.company_id=o.company_id
    where o.company_id=v_company_id and o.customer_id=v_receipt.customer_id
      and o.is_credit_sale and o.status='completed'
    group by o.id
    having greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)>0
    order by o.created_at,o.id
  loop
    exit when v_remaining=0;
    v_take:=least(v_remaining,v_order.due);
    insert into public.payments(company_id,order_id,method_code,amount,reference,status,
      location_id,settlement_kind,customer_receipt_id)
    values(v_company_id,v_order.id,v_receipt.method_code,v_take,v_receipt.reference,'settled',
      v_receipt.location_id,'tender',v_receipt.id) returning id into v_payment_id;
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_take,
      'order_id',v_order.id,'meta',jsonb_build_object('customerId',v_receipt.customer_id,
        'receiptId',v_receipt.id,'paymentId',v_payment_id,'orderCode',v_order.code,
        'openSessionId',v_receipt.cashier_session_id));
    v_applied:=v_applied+v_take;
    v_remaining:=v_remaining-v_take;
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
end; $$;
revoke execute on function public.execute_customer_receipt(uuid) from public,anon,authenticated;
grant execute on function public.execute_customer_receipt(uuid) to service_role;

create or replace function public.post_customer_receipt(
  p_location_id uuid,p_customer_id uuid,p_amount bigint,p_method_code text,
  p_reference text default null,p_client_ref text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid;
  v_existing_customer_id uuid;
  v_session_id uuid;
  v_receipt public.customer_receipts%rowtype;
  v_method record;
  v_client_ref text:=coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text);
  v_fingerprint text;
  v_approval_id uuid;
  v_preview jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select customer_id,location_id into v_existing_customer_id,v_location_id
  from public.customer_receipts where company_id=v_company_id and client_ref=v_client_ref;
  if v_existing_customer_id is null then
    if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
    if not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company_id
      and not is_supplier and deleted_at is null) then raise exception 'customer_not_found'; end if;
    v_location_id:=public.resolve_business_location(p_location_id);
  end if;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'customer_id',p_customer_id,'amount',p_amount,'method_code',p_method_code,
    'reference',nullif(btrim(p_reference),''),'location_id',v_location_id)::text,'sha256'),'hex');
  -- Take the shared account lock before the receipt row's customer FK acquires
  -- a row lock. This keeps concurrent receipts and sales on one lock order.
  perform public.lock_customer_account(v_company_id,coalesce(v_existing_customer_id,p_customer_id));

  select * into v_receipt from public.customer_receipts
  where company_id=v_company_id and client_ref=v_client_ref for update;
  if v_receipt.id is not null then
    if v_receipt.request_fingerprint<>v_fingerprint then
      raise exception 'client_ref_payload_mismatch'; end if;
    if v_receipt.status='posted' or v_receipt.status='reversed' then
      return jsonb_build_object('status','completed','resource_id',v_receipt.id,
        'subject_id',v_receipt.id)||public.customer_receipt_result(v_receipt.id);
    end if;
    select id into v_approval_id from public.approvals where company_id=v_company_id
      and type='external_account_payment' and subject_type='customer_receipt'
      and subject_id=v_receipt.id and status='pending';
    if v_approval_id is not null then
      return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
        'subject_id',v_receipt.id,'receipt_id',v_receipt.id,
        'preview',public.customer_receipt_preview(p_customer_id,p_amount));
    end if;
    raise exception 'customer_receipt_not_postable: %',v_receipt.status;
  end if;

  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  perform public.prepayment_tender_account(v_location_id,p_method_code,p_reference);
  select * into v_method from public.available_payment_methods(v_location_id)
    where code=p_method_code;
  if v_method is null then raise exception 'payment_method_not_available: %',p_method_code; end if;

  insert into public.customer_receipts(company_id,customer_id,amount,method_code,reference,
    location_id,cashier_session_id,client_ref,request_fingerprint,created_by)
  values(v_company_id,p_customer_id,p_amount,p_method_code,nullif(btrim(p_reference),''),
    v_location_id,v_session_id,v_client_ref,v_fingerprint,auth.uid()) returning * into v_receipt;
  v_preview:=public.customer_receipt_preview(p_customer_id,p_amount);

  if not coalesce(v_method.is_cashier_controlled,false)
    and not public.current_user_has_permission('ViewFinancials') then
    insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
    values(v_company_id,'external_account_payment','customer_receipt',v_receipt.id,
      jsonb_build_object('receipt_id',v_receipt.id,'customer_id',p_customer_id,'amount',p_amount,
        'method_code',p_method_code,'reference',nullif(btrim(p_reference),''),
        'location_id',v_location_id,'allocation_preview',v_preview),auth.uid())
    returning id into v_approval_id;
    return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
      'subject_id',v_receipt.id,'receipt_id',v_receipt.id,'preview',v_preview);
  end if;

  perform public.execute_customer_receipt(v_receipt.id);
  return jsonb_build_object('status','completed','resource_id',v_receipt.id,
    'subject_id',v_receipt.id)||public.customer_receipt_result(v_receipt.id);
end; $$;
revoke execute on function public.post_customer_receipt(uuid,uuid,bigint,text,text,text)
  from public,anon;
grant execute on function public.post_customer_receipt(uuid,uuid,bigint,text,text,text)
  to authenticated;

create or replace function public.post_customer_payment(
  p_customer_id uuid,p_amount bigint,p_method_code text,p_reference text default null
)
returns jsonb language sql security definer set search_path='' as $$
  select public.post_customer_receipt(null,p_customer_id,p_amount,p_method_code,p_reference,null)
$$;

create or replace function public.execute_customer_receipt_reversal(p_receipt_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
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
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
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
end; $$;
revoke execute on function public.execute_customer_receipt_reversal(uuid,text)
  from public,anon,authenticated;
grant execute on function public.execute_customer_receipt_reversal(uuid,text) to service_role;

create or replace function public.post_customer_receipt_reversal(p_receipt_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_receipt public.customer_receipts%rowtype;
  v_resource_id uuid;
  v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=v_company_id;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id:=public.execute_customer_receipt_reversal(p_receipt_id,p_reason);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_receipt_id);
  end if;
  v_approval_id:=public.request_sale_approval(v_company_id,'customer_receipt_reversal',
    'customer_receipt',p_receipt_id,jsonb_build_object('receipt_id',p_receipt_id,
      'customer_id',v_receipt.customer_id,'amount',v_receipt.amount,'method_code',v_receipt.method_code,
      'reference',v_receipt.reference,'reason',btrim(p_reason)));
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_receipt_id);
end; $$;
revoke execute on function public.post_customer_receipt_reversal(uuid,text) from public,anon;
grant execute on function public.post_customer_receipt_reversal(uuid,text) to authenticated;

-- A dedicated account-sale RPC never trusts a client-computed deposit/credit split.
create or replace function public.post_credit_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_client_ref text default null,
  p_draft_id uuid default null,p_approval_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
  v_client_ref text:=coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text);
  v_fingerprint text;
  v_order public.orders%rowtype;
  v_deposit bigint;
  v_credit bigint;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_customer_id is null then raise exception 'identified_customer_required_for_credit_sale'; end if;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('location_id',v_location_id,
    'customer_id',p_customer_id,'lines',coalesce(p_lines,'[]'::jsonb),'draft_id',p_draft_id)::text,
    'sha256'),'hex');
  select * into v_order from public.orders where company_id=v_company_id and client_ref=v_client_ref;
  if v_order.id is not null and v_order.account_sale_request_fingerprint is distinct from v_fingerprint then
    raise exception 'client_ref_payload_mismatch'; end if;
  perform public.lock_customer_account(v_company_id,p_customer_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  -- The order is parked only long enough to derive and post its server-owned
  -- account split. Reuse the established internal hold exemption when the
  -- company does not operate a cashier queue.
  perform set_config('app.external_payment_hold','on',true);
  v_order.id:=public.post_sale(p_customer_id,p_lines,'[]'::jsonb,true,v_client_ref,p_draft_id);
  update public.orders set account_sale_request_fingerprint=v_fingerprint
    where id=v_order.id and account_sale_request_fingerprint is null;
  select * into v_order from public.orders where id=v_order.id and company_id=v_company_id for update;
  if v_order.account_sale_request_fingerprint<>v_fingerprint then raise exception 'client_ref_payload_mismatch'; end if;
  if v_order.status='completed' then
    select coalesce(sum(amount),0)::bigint into v_deposit from public.customer_deposit_applications
      where order_id=v_order.id and status='active';
    return jsonb_build_object('status','completed','resource_id',v_order.id,'subject_id',v_order.id,
      'order_id',v_order.id,'downpayment_applied',v_deposit,'credit_amount',v_order.total-v_deposit);
  end if;
  v_deposit:=least(public.customer_deposit_available(p_customer_id),v_order.total);
  v_credit:=v_order.total-v_deposit;
  v_result:=public.post_sale_with_prepayment_at_location(v_location_id,p_customer_id,p_lines,
    '[]'::jsonb,v_deposit,v_credit,v_client_ref,p_draft_id);
  if v_result->>'status'='approval_required' then
    update public.approvals set metadata=metadata||jsonb_build_object(
      'automatic_customer_account',true,'reviewed_deposit_amount',v_deposit,
      'reviewed_credit_amount',v_credit,'reason',coalesce(nullif(btrim(p_approval_reason),''),
        'Residual credit exceeds the customer limit'))
    where company_id=v_company_id and subject_id=v_order.id and status='pending' and type='overdraft';
  end if;
  return v_result||jsonb_build_object('downpayment_applied',v_deposit,'credit_amount',v_credit);
end; $$;
revoke execute on function public.post_credit_sale_at_location(uuid,uuid,jsonb,text,uuid,text)
  from public,anon;
grant execute on function public.post_credit_sale_at_location(uuid,uuid,jsonb,text,uuid,text)
  to authenticated;

-- Canonical approval types and dispatch.
alter table public.approvals drop constraint approvals_type_check;
alter table public.approvals add constraint approvals_type_check check(type in (
  'overdraft','customer_credit','below_wholesale','order_reversal','external_account_payment',
  'sale_refund','payment_reversal','customer_deposit_refund','customer_receipt_reversal'));

create or replace function public.can_approve_request_type(p_type text)
returns boolean language sql stable set search_path='' as $$
  select case
    when p_type in ('order_reversal','sale_refund','payment_reversal','customer_deposit_refund',
      'customer_receipt_reversal') then public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ReverseOrder')
    when p_type='external_account_payment' then public.current_user_has_permission('ViewFinancials')
    when p_type='overdraft' then public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ApproveCustomerCredit')
    when p_type='customer_credit' then public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ManageCustomerCreditLimit')
    else public.current_user_has_permission('ManageApprovals') end
$$;

create or replace function public.assert_approval_authority(p_type text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.can_approve_request_type(p_type) then return; end if;
  if p_type in ('order_reversal','sale_refund','payment_reversal','customer_deposit_refund',
    'customer_receipt_reversal') then
    raise exception 'permission_denied: ManageApprovals and ReverseOrder required';
  elsif p_type='external_account_payment' then raise exception 'permission_denied: ViewFinancials required';
  elsif p_type='overdraft' then raise exception 'permission_denied: ManageApprovals and ApproveCustomerCredit required';
  elsif p_type='customer_credit' then raise exception 'permission_denied: ManageApprovals and ManageCustomerCreditLimit required';
  else raise exception 'permission_denied: ManageApprovals required'; end if;
end; $$;

create or replace function public.set_approval_subject()
returns trigger language plpgsql set search_path='' as $$
begin
  new.subject_type:=coalesce(new.subject_type,case
    when new.type='payment_reversal' then 'payment'
    when new.type='customer_credit' then 'customer'
    when new.type='customer_receipt_reversal' then 'customer_receipt'
    else 'order' end);
  new.subject_id:=coalesce(new.subject_id,case
    when new.type='payment_reversal' then nullif(new.metadata->>'payment_id','')::uuid
    when new.type='customer_credit' then nullif(new.metadata->>'customer_id','')::uuid
    when new.type='customer_receipt_reversal' then nullif(new.metadata->>'receipt_id','')::uuid
    else nullif(new.metadata->>'order_id','')::uuid end);
  return new;
end; $$;

create or replace function public.request_sale_approval(
  p_company_id uuid,p_type text,p_subject_type text,p_subject_id uuid,p_metadata jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_existing_metadata jsonb;
begin
  if p_company_id is distinct from public.current_company_id() then
    raise exception 'permission_denied: company mismatch'; end if;
  if p_type not in ('order_reversal','sale_refund','payment_reversal','customer_receipt_reversal') then
    raise exception 'unsupported_approval_type: %',p_type; end if;
  insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
  values(p_company_id,p_type,p_subject_type,p_subject_id,coalesce(p_metadata,'{}'),auth.uid())
  on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
  do nothing returning id into v_id;
  if v_id is null then
    select id,metadata into v_id,v_existing_metadata from public.approvals
    where company_id=p_company_id and type=p_type and subject_id=p_subject_id and status='pending'
    order by created_at limit 1;
    if v_existing_metadata is distinct from coalesce(p_metadata,'{}') then
      raise exception 'approval_already_pending: %',v_id; end if;
  end if;
  return v_id;
end; $$;

create or replace function public.expire_approval_request(
  p_approval_id uuid,p_reason text,p_void_held_order boolean default false
)
returns void language plpgsql security definer set search_path='' as $$
declare v_approval public.approvals%rowtype;v_order_id uuid;
begin
  update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
    decision_reason=p_reason where id=p_approval_id and company_id=public.current_company_id()
    and status='pending' returning * into v_approval;
  if found then
    if v_approval.type='external_account_payment' and v_approval.subject_type='customer_receipt' then
      update public.customer_receipts set status='cancelled' where id=v_approval.subject_id
        and status='pending_approval';
    elsif p_void_held_order then
      v_order_id:=coalesce(v_approval.subject_id,nullif(v_approval.metadata->>'order_id','')::uuid);
      if v_order_id is not null then perform public.void_approval_held_order(v_order_id,p_reason); end if;
    end if;
    perform public.notify_approval_requester(p_approval_id);
  end if;
end; $$;

create or replace function public.deny_request(p_approval_id uuid,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_approval public.approvals%rowtype;v_order_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  select * into v_approval from public.approvals where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null or v_approval.status<>'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;
  perform public.assert_approval_authority(v_approval.type);
  if v_approval.requested_by=auth.uid() then raise exception 'self_approval_denied'; end if;
  update public.approvals set status='denied',decided_by=auth.uid(),decided_at=now(),
    decision_reason=btrim(p_reason) where id=p_approval_id;
  if v_approval.type='external_account_payment' and v_approval.subject_type='customer_receipt' then
    update public.customer_receipts set status='cancelled' where id=v_approval.subject_id
      and status='pending_approval';
  elsif v_approval.type in ('external_account_payment','overdraft') then
    v_order_id:=coalesce(v_approval.subject_id,nullif(v_approval.metadata->>'order_id','')::uuid);
    perform public.void_approval_held_order(v_order_id,'Approval denied: '||btrim(p_reason));
  end if;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end; $$;

-- Extend the established approval executor at stable branch anchors.
do $migration$
declare v_definition text;v_replacement text;
begin
  v_definition:=pg_get_functiondef('public.approve_request(uuid,text)'::regprocedure);
  v_definition:=replace(v_definition,'v_valid boolean;',
    'v_valid boolean; v_available bigint; v_deposit_amount bigint; v_credit_amount bigint; v_current_ar bigint; v_customer_id uuid;');
  v_replacement:=replace(v_definition,
    $old$  elsif v_approval.type='external_account_payment' then$old$,
    $new$  elsif v_approval.type='external_account_payment' and v_approval.subject_type='customer_receipt' then
    perform set_config('app.approved_customer_receipt_id',v_approval.subject_id::text,true);
    begin
      v_resource_id:=public.execute_customer_receipt(v_approval.subject_id);
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Customer receipt could not post: '||v_error,false); return p_approval_id;
    end;

  elsif v_approval.type='external_account_payment' then$new$);
  if v_replacement=v_definition then raise exception 'external receipt approval anchor not found'; end if;
  v_definition:=v_replacement;
  v_replacement:=replace(v_definition,
    $old$  elsif v_approval.type='below_wholesale' then$old$,
    $new$  elsif v_approval.type='customer_receipt_reversal' then
    v_resource_id:=public.execute_customer_receipt_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved customer receipt reversal'));

  elsif v_approval.type='below_wholesale' then$new$);
  if v_replacement=v_definition then raise exception 'receipt reversal approval anchor not found'; end if;
  v_definition:=v_replacement;
  v_replacement:=replace(v_definition,
    $old$  elsif v_approval.type='overdraft' then
    select * into v_order from public.orders where id=v_approval.subject_id$old$,
    $new$  elsif v_approval.type='overdraft'
    and coalesce((v_approval.metadata->>'automatic_customer_account')::boolean,false) then
    select customer_id into v_customer_id from public.orders where id=v_approval.subject_id
      and company_id=v_company_id;
    if v_customer_id is not null then
      perform public.lock_customer_account(v_company_id,v_customer_id);
    end if;
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,'Credit sale is no longer valid',true);
      return p_approval_id;
    end if;
    v_available:=public.customer_deposit_available(v_customer.id);
    v_deposit_amount:=least(v_available,v_order.total);
    v_credit_amount:=v_order.total-v_deposit_amount;
    if v_credit_amount>coalesce((v_approval.metadata->>'reviewed_credit_amount')::bigint,0) then
      select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_current_ar
      from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.meta->>'customerId'=v_customer.id::text;
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Downpayment availability changed; credit exposure must be reviewed again'
      where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'overdraft','order',v_order.id,v_approval.metadata||jsonb_build_object(
        'deposit_amount',v_deposit_amount,'credit_amount',v_credit_amount,
        'reviewed_deposit_amount',v_deposit_amount,'reviewed_credit_amount',v_credit_amount,
        'ar_balance',v_current_ar,'projected_balance',v_current_ar+v_credit_amount,
        'reason','Downpayment changed; review the updated residual credit'),v_approval.requested_by);
      return p_approval_id;
    end if;
    perform set_config('app.business_location_id',v_order.location_id::text,true);
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
    perform public.complete_order_with_prepayment(v_order.id,'[]'::jsonb,v_deposit_amount,
      v_credit_amount,nullif(v_approval.metadata->>'client_ref',''));
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft' then
    select * into v_order from public.orders where id=v_approval.subject_id$new$);
  if v_replacement=v_definition then raise exception 'automatic credit approval anchor not found'; end if;
  execute v_replacement;
end;
$migration$;

create or replace function public.notify_approval_requester(p_approval_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_approval public.approvals%rowtype;v_order_id uuid;v_order_code text;v_action text;v_body text;v_link text;
begin
  select * into v_approval from public.approvals where id=p_approval_id;
  if v_approval.id is null or v_approval.requested_by is null or v_approval.status='pending' then return; end if;
  v_order_id:=nullif(v_approval.metadata->>'order_id','')::uuid;
  if v_order_id is null and v_approval.subject_type='order' then v_order_id:=v_approval.subject_id; end if;
  if v_order_id is not null then select code into v_order_code from public.orders
    where id=v_order_id and company_id=v_approval.company_id; end if;
  v_action:=case v_approval.type when 'order_reversal' then 'Void' when 'sale_refund' then 'Refund'
    when 'payment_reversal' then 'Payment reversal' when 'customer_receipt_reversal' then 'Receipt reversal'
    when 'below_wholesale' then 'Price exception' when 'external_account_payment' then 'Direct account payment'
    when 'overdraft' then 'Credit sale' when 'customer_credit' then 'Customer credit' else 'Approval' end;
  v_body:=concat_ws(' — ',case when v_order_code is not null then 'Sale '||v_order_code else null end,
    nullif(v_approval.decision_reason,''));
  v_link:=case when v_approval.type='below_wholesale' and v_order_id is not null then
      '/pos/proformas?order='||v_order_id::text||'&approval='||v_approval.id::text
    when v_order_id is not null then '/sales?order='||v_order_id::text||'&approval='||v_approval.id::text
    when v_approval.subject_type in ('customer','customer_receipt') then
      '/customers?customer='||coalesce(nullif(v_approval.metadata->>'customer_id','')::uuid,
        v_approval.subject_id)::text||'&approval='||v_approval.id::text else '/notifications' end;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  values(v_approval.company_id,v_approval.requested_by,'approval',
    v_action||' request '||v_approval.status,nullif(v_body,''),v_link);
end; $$;

-- Receipt allocations cannot be reversed independently.
create or replace function public.post_payment_reversal(p_payment_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_payment public.payments%rowtype;
  v_reason text:=btrim(coalesce(p_reason,'Legacy payment reversal'));
  v_resource_id uuid;v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  select * into v_payment from public.payments where id=p_payment_id and company_id=v_company_id;
  if v_payment.id is null then raise exception 'payment_not_found: %',p_payment_id; end if;
  if v_payment.customer_receipt_id is not null then
    raise exception 'reverse_parent_customer_receipt: %',v_payment.customer_receipt_id; end if;
  select id into v_resource_id from public.ledger_journal_entries where company_id=v_company_id
    and source_type='PaymentReversal' and source_id=p_payment_id::text||'-reversal';
  if v_resource_id is not null then return jsonb_build_object('status','completed',
    'resource_id',v_resource_id,'subject_id',p_payment_id); end if;
  if v_payment.status<>'settled' then raise exception 'payment_not_settled'; end if;
  if not exists(select 1 from public.ledger_journal_entries where company_id=v_company_id
    and source_type in ('Payment','PaymentAllocation') and source_id=p_payment_id::text) then
    raise exception 'original_entry_not_found: %',p_payment_id; end if;
  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id:=public.execute_payment_reversal(p_payment_id,v_reason);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,'subject_id',p_payment_id);
  end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  v_approval_id:=public.request_sale_approval(v_company_id,'payment_reversal','payment',p_payment_id,
    jsonb_build_object('payment_id',p_payment_id,'order_id',v_payment.order_id,'reason',btrim(p_reason)));
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,'subject_id',p_payment_id);
end; $$;

-- Lower-level RPC grants remain for rolling compatibility. First-party receipt
-- and account-sale surfaces route exclusively through the unified functions.

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean language sql immutable set search_path='' as $$
  select p_source_type=any(array['Payment','CreditSale','PaymentAllocation','Expense','PurchaseExpense',
    'InterAccountTransfer','SupplierPayment','Refund','PaymentReversal','CustomerDeposit',
    'CustomerDepositRefund','SupplierAdvance','SupplierAdvanceReturn','MixedSaleTender',
    'CustomerReceipt','CustomerReceiptReversal'])
$$;

create or replace view public.customer_account_balances with (security_invoker=true) as
with ar as (
  select l.company_id,l.meta->>'customerId' customer_id,
    coalesce(sum(l.debit)-sum(l.credit),0)::bigint receivable_balance
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where a.code='ACCOUNTS_RECEIVABLE' group by l.company_id,l.meta->>'customerId'
), deposits as (
  select l.company_id,l.meta->>'customerId' customer_id,
    coalesce(sum(l.credit)-sum(l.debit),0)::bigint downpayment_balance
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where a.code='CUSTOMER_DEPOSITS' group by l.company_id,l.meta->>'customerId'
)
select c.company_id,c.id customer_id,coalesce(ar.receivable_balance,0)::bigint receivable_balance,
  coalesce(deposits.downpayment_balance,0)::bigint downpayment_balance,
  (coalesce(ar.receivable_balance,0)-coalesce(deposits.downpayment_balance,0))::bigint net_balance
from public.customers c left join ar on ar.company_id=c.company_id and ar.customer_id=c.id::text
left join deposits on deposits.company_id=c.company_id and deposits.customer_id=c.id::text
where not c.is_supplier and c.deleted_at is null;
grant select on public.customer_account_balances to authenticated;

drop function public.customer_statement(uuid,timestamptz,uuid,integer);
create function public.customer_statement(
  p_customer_id uuid,p_before_date timestamptz default null,p_before_id uuid default null,p_limit integer default 25
)
returns table(id uuid,date timestamptz,reference text,description text,debit bigint,credit bigint,
  balance bigint,activity_kind text,receipt_id uuid,details jsonb,has_more boolean)
language plpgsql stable security invoker set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_limit integer:=least(greatest(coalesce(p_limit,25),1),100);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then raise exception 'permission_denied: ViewFinancials required'; end if;
  if (p_before_date is null)<>(p_before_id is null) then raise exception 'invalid_statement_cursor'; end if;
  return query
  with entries as materialized (
    select je.id,je.posted_at occurred_at,
      case
        when je.source_type in ('CustomerReceipt','CustomerReceiptReversal') then coalesce(r.reference,je.source_id)
        when je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
          then coalesce(max(p.reference),max(jl.meta->>'orderCode'),je.source_id)
        else coalesce(max(jl.meta->>'orderCode'),je.source_id) end entry_reference,
      case je.source_type when 'CreditSale' then 'Credit sale' when 'CustomerReceipt' then 'Payment received'
        when 'CustomerReceiptReversal' then 'Payment reversed' when 'CustomerDepositRefund' then 'Downpayment refunded'
        when 'Payment' then 'Payment received' when 'PaymentAllocation' then 'Payment received'
        when 'PaymentReversal' then 'Reversed payment' when 'OrderReversal' then 'Voided sale'
        when 'BalanceAdjustment' then coalesce(je.memo,'Balance adjustment')
        else coalesce(je.memo,initcap(regexp_replace(je.source_type,'([a-z])([A-Z])','\1 \2','g'))) end entry_description,
      sum(jl.debit)::bigint entry_debit,sum(jl.credit)::bigint entry_credit,
      lower(regexp_replace(je.source_type,'([a-z])([A-Z])','\1_\2','g')) activity_kind,
      r.id receipt_id,
      case when r.id is null then '{}'::jsonb else public.customer_receipt_result(r.id) end details
    from public.ledger_journal_entries je join public.ledger_journal_lines jl on jl.entry_id=je.id
    join public.ledger_accounts la on la.id=jl.account_id
    left join public.customer_receipts r on r.company_id=je.company_id and
      ((je.source_type='CustomerReceipt' and je.source_id=r.id::text) or
       (je.source_type='CustomerReceiptReversal' and je.source_id=r.id::text||'-reversal'))
    left join public.payments p on p.company_id=je.company_id
      and je.source_type in ('Payment','PaymentAllocation','PaymentReversal')
      and p.id::text=regexp_replace(je.source_id,'-reversal$','')
    where je.company_id=v_company_id and la.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
      and jl.meta @> jsonb_build_object('customerId',p_customer_id)
    group by je.id,r.id,r.reference
    having sum(jl.debit-jl.credit)<>0
  ), page_source as materialized (
    select e.* from entries e where p_before_date is null or (e.occurred_at,e.id)<(p_before_date,p_before_id)
    order by e.occurred_at desc,e.id desc limit v_limit+1
  ), numbered as (
    select p.*,row_number() over(order by p.occurred_at desc,p.id desc) row_no,
      count(*) over()>v_limit page_has_more from page_source p
  ), visible as (select * from numbered where row_no<=v_limit), newest as (
    select v.occurred_at,v.id from visible v order by v.occurred_at desc,v.id desc limit 1
  ), anchor as (
    select coalesce(sum(e.entry_debit-e.entry_credit),0)::bigint opening_balance
    from entries e cross join newest n where (e.occurred_at,e.id)<=(n.occurred_at,n.id)
  )
  select v.id,v.occurred_at,v.entry_reference,v.entry_description,v.entry_debit,v.entry_credit,
    (a.opening_balance-coalesce(sum(v.entry_debit-v.entry_credit) over(order by v.occurred_at desc,v.id desc
      rows between unbounded preceding and 1 preceding),0))::bigint,
    v.activity_kind,v.receipt_id,v.details,v.page_has_more
  from visible v cross join anchor a order by v.occurred_at desc,v.id desc;
end; $$;
revoke execute on function public.customer_statement(uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.customer_statement(uuid,timestamptz,uuid,integer) to authenticated;

create or replace function public.public_customer_statement(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_link record;v_result jsonb;v_id uuid;v_amount_due bigint;v_downpayment bigint;v_net bigint;
begin
  update public.customer_statement_links set open_count=open_count+1,
    first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now()
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now()
  returning id into v_id;
  if v_id is null then return null; end if;
  select l.*,c.first_name,co.name store_name,co.logo_path,co.public_whatsapp_number,co.customer_payment_instructions
  into v_link from public.customer_statement_links l join public.customers c on c.id=l.customer_id
  join public.companies co on co.id=l.company_id where l.id=v_id;
  select greatest(net_balance,0),greatest(-net_balance,0),net_balance
  into v_amount_due,v_downpayment,v_net from public.customer_account_balances
  where company_id=v_link.company_id and customer_id=v_link.customer_id;
  with balances as (
    select o.code,(o.completed_at at time zone 'Africa/Nairobi')::date sale_date,o.credit_due_at,
      greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0),0)::bigint balance
    from public.orders o where o.company_id=v_link.company_id and o.customer_id=v_link.customer_id
      and o.is_credit_sale and o.status='completed'
  ), activities as (
    select je.id,je.posted_at,je.source_type,coalesce(r.reference,max(jl.meta->>'orderCode'),je.source_id) reference,
      sum(jl.debit-jl.credit)::bigint amount
    from public.ledger_journal_entries je join public.ledger_journal_lines jl on jl.entry_id=je.id
    join public.ledger_accounts a on a.id=jl.account_id
    left join public.customer_receipts r on r.company_id=je.company_id and
      ((je.source_type='CustomerReceipt' and je.source_id=r.id::text) or
       (je.source_type='CustomerReceiptReversal' and je.source_id=r.id::text||'-reversal'))
    where je.company_id=v_link.company_id and a.code in ('ACCOUNTS_RECEIVABLE','CUSTOMER_DEPOSITS')
      and jl.meta @> jsonb_build_object('customerId',v_link.customer_id)
    group by je.id,r.reference having sum(jl.debit-jl.credit)<>0
    order by je.posted_at desc,je.id desc limit 50
  )
  select jsonb_build_object('store_name',v_link.store_name,'logo_path',v_link.logo_path,
    'whatsapp_number',v_link.public_whatsapp_number,'payment_instructions',v_link.customer_payment_instructions,
    'customer_first_name',v_link.first_name,'expires_at',v_link.expires_at,
    'account_balance',coalesce(v_net,0),'amount_due',coalesce(v_amount_due,0),
    'downpayment_available',coalesce(v_downpayment,0),'outstanding_total',coalesce(v_amount_due,0),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('code',code,'sale_date',sale_date,
      'due_date',credit_due_at,'balance',balance) order by credit_due_at) from balances where balance>0),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',posted_at,
      'kind',lower(regexp_replace(source_type,'([a-z])([A-Z])','\1_\2','g')),
      'reference',reference,'amount',abs(amount),'direction',case when amount>0 then 'charge' else 'payment' end)
      order by posted_at desc,id desc) from activities),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;
