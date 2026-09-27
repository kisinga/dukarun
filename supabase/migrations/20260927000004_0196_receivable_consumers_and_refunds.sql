-- Follow-up to the already-applied 0195. No historical rows are rewritten.
begin;

-- A collection already returned by a full credit note cannot be reversed or
-- moved elsewhere. Lock the order so this also holds when refund and reversal
-- race. Existing reversal functions roll back their journal atomically on error.
create or replace function public.protect_refunded_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='settled' and (tg_op='DELETE' or
    (new.status,new.amount,new.order_id,new.company_id) is distinct from
    (old.status,old.amount,old.order_id,old.company_id)) then
    perform 1 from public.orders where id=old.order_id and company_id=old.company_id for update;
    if found and exists(select 1 from public.refunds r
      where r.company_id=old.company_id and r.order_id=old.order_id) then
      raise exception 'payment_has_refunded_order: collection was already refunded';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.protect_refunded_payment() from public,anon,authenticated;
create trigger payments_protect_refunded_collection
before update or delete on public.payments
for each row execute function public.protect_refunded_payment();

-- Shared sales read model: a missing/unauthorized order is not a zero balance.
create or replace function public.order_receivable_statuses(p_order_ids uuid[])
returns table(order_id uuid,outstanding bigint,settled_amount bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_can_access_scope('data.sales') then
    raise exception 'permission_denied: sales access required'; end if;
  if cardinality(p_order_ids)>500 then raise exception 'too_many_orders'; end if;
  if exists(select 1 from unnest(p_order_ids) requested(id)
    left join public.orders o on o.id=requested.id and o.company_id=v_company_id
    where o.id is null) then raise exception 'order_not_found'; end if;
  return query
  select o.id,public.order_open_balance_core(o.id),
    public.order_receivable_settlements_core(o.id)
  from public.orders o where o.company_id=v_company_id and o.id=any(p_order_ids);
end;
$$;
revoke all on function public.order_receivable_statuses(uuid[]) from public,anon;
grant execute on function public.order_receivable_statuses(uuid[]) to authenticated,service_role;

-- All refund entry points take customer -> order locks, like receipt posting.
-- Approval execution must acquire these before its own order row lock too.
create or replace function public.lock_receivable_order_customer(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.orders
    where id=p_order_id and company_id=v_company_id;
  if v_customer_id is not null then
    perform public.lock_customer_account(v_company_id,v_customer_id);
    perform 1 from public.customers where id=v_customer_id and company_id=v_company_id for update;
  end if;
end;
$$;
revoke all on function public.lock_receivable_order_customer(uuid) from public,anon,authenticated;
grant execute on function public.lock_receivable_order_customer(uuid) to service_role;

-- Both direct and approved full credit notes call this function.
create or replace function public.execute_full_credit_note(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_account_code text;v_refund_id uuid;v_entry_id uuid;v_collected bigint;
  v_receivable_credit bigint:=0;v_lines jsonb;v_timezone text;v_entry_date date;
  v_has_ar boolean;v_correction record;v_original uuid;v_delta bigint;
  v_corrections jsonb:='[]'::jsonb;v_reversal jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then
    raise exception 'stock_outcome_required'; end if;
  perform public.lock_receivable_order_customer(p_order_id);
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then
    raise exception 'invalid_order_state: only completed sales can be credited'; end if;
  if exists(select 1 from public.refunds r where r.company_id=v_company_id and r.order_id=p_order_id) then
    raise exception 'sale_already_refunded'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  select exists(select 1 from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and l.order_id=p_order_id
      and a.code='ACCOUNTS_RECEIVABLE') into v_has_ar;

  if v_has_ar then
    perform public.assert_order_receivable_evidence(p_order_id);
    v_collected:=public.order_receivable_settlements_core(p_order_id);
    v_receivable_credit:=public.order_receivable_ledger_balance_core(p_order_id);
    for v_correction in
      select e.* from public.ledger_journal_entries e
      where e.company_id=v_company_id and e.source_type='BalanceAdjustmentAllocation'
        and exists(select 1 from public.ledger_journal_lines l
          where l.entry_id=e.id and l.order_id=p_order_id)
        and not exists(select 1 from public.ledger_journal_entries r where r.reversal_of=e.id)
      order by e.id
    loop
      -- Only a fully evidenced, sale-specific reallocation can be unwound.
      -- No generic balancing journal or inferred customer-level correction.
      select e.id into v_original from public.ledger_journal_entries e
      where e.company_id=v_company_id and e.source_type='BalanceAdjustment'
        and e.id::text=v_correction.source_id
        and exists(select 1 from public.ledger_journal_entries r
          where r.company_id=v_company_id and r.reversal_of=e.id);
      if v_original is null or exists(
        select l.account_id from public.ledger_journal_lines l
        where l.entry_id=v_original or l.entry_id in (
          select r.id from public.ledger_journal_entries r
          where r.company_id=v_company_id and r.reversal_of=v_original
        ) group by l.account_id having sum(l.debit-l.credit)<>0
      ) or exists(
        select 1 from public.ledger_journal_lines l
        join public.ledger_accounts a on a.id=l.account_id
        where l.entry_id=v_original and a.code='ACCOUNTS_RECEIVABLE'
          and (l.customer_id is distinct from v_order.customer_id
            or (l.order_id is not null and l.order_id<>p_order_id))
      ) or exists(
        select 1 from public.ledger_journal_lines l
        join public.ledger_accounts a on a.id=l.account_id
        where l.entry_id=v_correction.id and (
          a.code not in ('ACCOUNTS_RECEIVABLE','BALANCE_ADJUSTMENT')
          or l.company_id<>v_company_id
          or l.meta->>'originalEntryId' is distinct from v_original::text
          or l.meta->>'orderId' is distinct from p_order_id::text
          or (a.code='ACCOUNTS_RECEIVABLE' and
            (l.order_id is distinct from p_order_id or l.customer_id is distinct from v_order.customer_id))
          or (l.order_id is not null and l.order_id<>p_order_id)
        )
      ) or exists(
        (select account_id,sum(debit),sum(credit) from public.ledger_journal_lines
          where entry_id=v_original group by account_id
         except select account_id,sum(debit),sum(credit) from public.ledger_journal_lines
          where entry_id=v_correction.id group by account_id)
        union all
        (select account_id,sum(debit),sum(credit) from public.ledger_journal_lines
          where entry_id=v_correction.id group by account_id
         except select account_id,sum(debit),sum(credit) from public.ledger_journal_lines
          where entry_id=v_original group by account_id)
      ) then raise exception 'refund_correction_review_required: %',v_correction.id; end if;
      select sum(l.debit-l.credit)::bigint into v_delta
      from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
      where l.entry_id=v_correction.id and a.code='ACCOUNTS_RECEIVABLE';
      if v_delta is null or v_delta=0 then
        raise exception 'refund_correction_review_required: %',v_correction.id; end if;
      v_receivable_credit:=v_receivable_credit-v_delta;
      v_corrections:=v_corrections||jsonb_build_object('entry_id',v_correction.id);
    end loop;
  else
    -- Cash-sale refunds also use posted settlement evidence, not an editable
    -- payment amount. A missing journal is review-required, never assumed paid.
    select coalesce(sum(l.debit-l.credit),0)::bigint into v_collected
    from public.payments p
    join public.ledger_journal_entries e on e.company_id=p.company_id
      and e.source_type='Payment' and e.source_id=p.id::text
    join public.ledger_journal_lines l on l.entry_id=e.id
    join public.ledger_accounts a on a.id=l.account_id
    where p.company_id=v_company_id and p.order_id=p_order_id and p.status='settled'
      and a.code not in ('SALES','TAX_PAYABLE');
  end if;
  if v_collected<0 or v_collected+v_receivable_credit<>v_order.gross_total then
    raise exception 'refund_ledger_reconciliation_required: order %',p_order_id;
  end if;
  if v_collected>0 then
    v_account_code:=public.resolve_tender_account(v_company_id,v_order.location_id,p_method_code,null);
  end if;
  perform set_config('app.refund_stock_outcome',p_stock_outcome,true);
  insert into public.refunds(company_id,order_id,amount,method_code,reason,created_by,ledger_account_code)
  values(v_company_id,p_order_id,v_order.gross_total,p_method_code,btrim(p_reason),auth.uid(),v_account_code)
  returning id into v_refund_id;
  for v_correction in select value from jsonb_array_elements(v_corrections)
  loop
    select jsonb_agg(jsonb_build_object('account_code',a.code,'debit',l.credit,'credit',l.debit,
      'order_id',l.order_id,'meta',l.meta||jsonb_build_object('refundId',v_refund_id)) order by l.id)
      into v_reversal
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.entry_id=(v_correction.value->>'entry_id')::uuid;
    perform public.post_reversal_entry(v_company_id,'RefundCorrectionReversal',
      v_correction.value->>'entry_id','Unwind sale correction for full refund',
      v_reversal,(v_correction.value->>'entry_id')::uuid);
  end loop;
  v_lines:=jsonb_build_array(jsonb_build_object('account_code','SALES_RETURNS',
    'debit',v_order.gross_total,'order_id',p_order_id,'meta',jsonb_build_object(
      'orderCode',v_order.code,'customerId',v_order.customer_id,'refundId',v_refund_id)));
  if v_collected>0 then
    v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'credit',v_collected,
      'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
        'customerId',v_order.customer_id,'method',p_method_code,'refundId',v_refund_id));
  end if;
  -- Reversing an already-paid positive correction can temporarily make AR
  -- negative. Return that evidenced money too; the final order balance is zero.
  if v_receivable_credit<>0 then
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE',
      'debit',greatest(-v_receivable_credit,0),'credit',greatest(v_receivable_credit,0),
      'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
        'customerId',v_order.customer_id,'refundId',v_refund_id));
  end if;
  v_entry_id:=public.post_journal_entry(v_company_id,'Refund',v_refund_id::text,
    'Full credit note for order '||v_order.code,v_lines,v_entry_date);
  if public.order_receivable_ledger_balance_core(p_order_id)<>0 then
    raise exception 'refund_left_receivable_balance'; end if;
  return v_entry_id;
end;
$$;
revoke execute on function public.execute_full_credit_note(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.execute_full_credit_note(uuid,text,text,text) to service_role;
create or replace function public.post_full_refund(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_resource_id uuid;v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then
    raise exception 'stock_outcome_required'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  perform public.lock_receivable_order_customer(p_order_id);
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then
    raise exception 'invalid_order_state: only completed sales can be credited'; end if;
  if exists(select 1 from public.refunds r where r.company_id=v_company_id and r.order_id=p_order_id) then
    raise exception 'sale_already_refunded'; end if;
  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id:=public.execute_full_credit_note(
      p_order_id,p_method_code,btrim(p_reason),p_stock_outcome);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_order_id);
  end if;
  v_approval_id:=public.request_sale_approval(v_company_id,'sale_refund','order',p_order_id,
    jsonb_build_object('order_id',p_order_id,'amount',v_order.gross_total,
      'method_code',p_method_code,'reason',btrim(p_reason),'stock_outcome',p_stock_outcome,
      'full_refund',true));
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_order_id);
end;
$$;

revoke execute on function public.execute_full_credit_note(uuid,text,text,text)
from public,anon,authenticated;
grant execute on function public.execute_full_credit_note(uuid,text,text,text) to service_role;

-- Approval execution must use the same full-credit-note path, including for
-- unpaid credit sales. Pending legacy partial-refund approvals expire safely.
create or replace function public.approve_request(p_approval_id uuid,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_approval public.approvals%rowtype;
  v_order public.orders%rowtype;v_customer public.customers%rowtype;v_payment_status text;
  v_resource_id uuid;v_error text;v_valid boolean;v_available bigint;v_deposit_amount bigint;
  v_credit_amount bigint;v_current_ar bigint;v_customer_id uuid;v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_approval from public.approvals
  where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;
  perform public.assert_approval_authority(v_approval.type);
  if v_approval.status<>'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;
  if v_approval.requested_by=auth.uid() then raise exception 'self_approval_denied'; end if;
  if v_approval.due_at is not null and v_approval.due_at<=now() then
    perform public.expire_approval_request(p_approval_id,'Approval request expired',
      v_approval.type in ('external_account_payment','overdraft'));
    return p_approval_id;
  end if;

  if v_approval.type='order_reversal' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed' then
      perform public.expire_approval_request(p_approval_id,
        'Sale is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.do_void(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved reversal'));

  elsif v_approval.type='sale_refund' then
    perform public.lock_receivable_order_customer(v_approval.subject_id);
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed'
      or coalesce((v_approval.metadata->>'full_refund')::boolean,false) is not true
      or (v_approval.metadata->>'amount')::bigint is distinct from v_order.gross_total
      or exists(select 1 from public.refunds r where r.company_id=v_company_id
        and r.order_id=v_approval.subject_id) then
      perform public.expire_approval_request(p_approval_id,
        'Credit note is no longer valid',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_full_credit_note(v_approval.subject_id,
      v_approval.metadata->>'method_code',
      coalesce(v_approval.metadata->>'reason','Approved credit note'),
      v_approval.metadata->>'stock_outcome');

  elsif v_approval.type='payment_reversal' then
    select status into v_payment_status from public.payments
      where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_payment_status is distinct from 'settled' or exists(select 1
      from public.ledger_journal_entries where company_id=v_company_id
        and source_type='PaymentReversal'
        and source_id=v_approval.subject_id::text||'-reversal') then
      perform public.expire_approval_request(p_approval_id,
        'Payment is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_payment_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved payment reversal'));

  elsif v_approval.type='customer_deposit_refund' then
    v_resource_id:=public.refund_customer_deposit(v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,
      coalesce(v_approval.metadata->>'reason','Approved customer deposit refund'),
      nullif(v_approval.metadata->>'method_code',''),nullif(v_approval.metadata->>'reference',''),
      nullif(v_approval.metadata->>'client_ref',''),
      nullif(v_approval.metadata->>'location_id','')::uuid);

  elsif v_approval.type='customer_receipt_reversal' then
    v_resource_id:=public.execute_customer_receipt_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved customer receipt reversal'));

  elsif v_approval.type='below_wholesale' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='draft'
      and jsonb_typeof(v_approval.metadata->'lines')='array'
      and jsonb_array_length(v_approval.metadata->'lines')>0
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'lines') requested
        left join public.order_lines l on l.order_id=v_order.id
          and l.variant_id=(requested->>'variant_id')::uuid
        left join public.product_variants pv on pv.id=l.variant_id and pv.company_id=v_company_id
        where l.id is null or l.custom_price is distinct from (requested->>'custom_price')::bigint
          or pv.wholesale_price is null
          or (requested->>'custom_price')::bigint>=pv.wholesale_price
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Draft pricing changed and must be reviewed again',false);return p_approval_id;
    end if;
    v_resource_id:=v_order.id;

  elsif v_approval.type='external_account_payment'
    and v_approval.subject_type='customer_receipt' then
    perform set_config('app.approved_customer_receipt_id',v_approval.subject_id::text,true);
    begin
      v_resource_id:=public.execute_customer_receipt(v_approval.subject_id);
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Customer receipt could not post: '||v_error,false);return p_approval_id;
    end;

  elsif v_approval.type='external_account_payment' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_approval.metadata->'tenders')='array'
      and jsonb_array_length(v_approval.metadata->'tenders')>0
      and ((not coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total)
        or (coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)
            +coalesce((v_approval.metadata->>'deposit_amount')::bigint,0)
            +coalesce((v_approval.metadata->>'credit_amount')::bigint,0)=v_order.total))
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'tenders') t
        left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t->>'method'
        left join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.location_id=v_order.location_id
        where coalesce((t->>'amount')::bigint,0)<=0 or pm.id is null or not pm.enabled
          or (lpm.id is not null and not lpm.enabled)
          or (coalesce(pm.reconciliation_type,'')='statement_match'
            and btrim(coalesce(t->>'reference',''))='')
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment is no longer valid',true);return p_approval_id;
    end if;
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='overdraft' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          if exists(select 1 from public.approvals a where a.company_id=v_company_id
            and a.subject_id=v_order.id and a.type='overdraft' and a.status='approved') then
            perform set_config('app.approved_credit_order_id',v_order.id::text,true);end if;
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,v_approval.metadata->'tenders',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft'
    and coalesce((v_approval.metadata->>'automatic_customer_account')::boolean,false) then
    select customer_id into v_customer_id from public.orders where id=v_approval.subject_id
      and company_id=v_company_id;
    if v_customer_id is not null then
      perform public.lock_customer_account(v_company_id,v_customer_id);end if;
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,'Credit sale is no longer valid',true);
      return p_approval_id;end if;
    v_available:=public.customer_deposit_available(v_customer.id);
    v_deposit_amount:=least(v_available,v_order.total);v_credit_amount:=v_order.total-v_deposit_amount;
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
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
    v_context:=public.order_posting_context(v_order.id,'approval');
    perform public.complete_order_with_prepayment_core(v_order.id,'[]'::jsonb,v_deposit_amount,
      v_credit_amount,nullif(v_approval.metadata->>'client_ref',''),v_context);
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,
        'Credit sale is no longer valid',true);return p_approval_id;
    end if;
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='external_account_payment' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          perform set_config('app.approved_credit_order_id',v_order.id::text,true);
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,'[]',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Credit sale could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='customer_credit' then
    select * into v_customer from public.customers where id=v_approval.subject_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_customer.id is null
      or v_customer.credit_limit is distinct from
        (v_approval.metadata->'previous'->>'credit_limit')::bigint
      or v_customer.is_credit_approved is distinct from
        (v_approval.metadata->'previous'->>'is_credit_approved')::boolean
      or coalesce(v_customer.credit_terms_days,0) is distinct from
        (v_approval.metadata->'previous'->>'credit_terms_days')::integer then
      perform public.expire_approval_request(p_approval_id,
        'Customer credit policy changed after this request',false);return p_approval_id;
    end if;
    perform public.update_customer_credit(v_customer.id,
      (v_approval.metadata->'proposed'->>'credit_limit')::bigint,
      (v_approval.metadata->'proposed'->>'is_credit_approved')::boolean,
      (v_approval.metadata->'proposed'->>'credit_terms_days')::integer);
    v_resource_id:=v_customer.id;
  end if;

  update public.approvals set status='approved',decided_by=auth.uid(),decided_at=now(),
    decision_reason=p_reason,result=case when v_resource_id is null then null
      else jsonb_build_object('resource_id',v_resource_id,'subject_id',v_approval.subject_id) end
  where id=p_approval_id;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$$;
commit;
