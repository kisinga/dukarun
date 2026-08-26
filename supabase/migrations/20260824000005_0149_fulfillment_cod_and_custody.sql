-- Receivable classification is canonical on the order. Legacy
-- is_credit_sale remains true only for actual customer credit, never COD.
create or replace function public.customer_credit_exposure(
  p_company_id uuid,p_customer_id uuid
)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(l.debit)-sum(l.credit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  join public.orders o on o.id=l.order_id and o.company_id=l.company_id
  where l.company_id=p_company_id and o.customer_id=p_customer_id
    and o.receivable_kind='credit' and a.code='ACCOUNTS_RECEIVABLE'
$$;
revoke execute on function public.customer_credit_exposure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_credit_exposure(uuid,uuid) to service_role;

create or replace function public.customer_document_balance(
  p_company_id uuid,p_customer_id uuid
)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(o.total-coalesce(paid.amount,0)),0)::bigint
  from public.orders o
  left join lateral (
    select sum(p.amount)::bigint amount from public.payments p
    where p.order_id=o.id and p.status='settled'
  ) paid on true
  where o.company_id=p_company_id and o.customer_id=p_customer_id
    and o.receivable_kind in('credit','cod') and o.status='completed'
$$;
revoke execute on function public.customer_document_balance(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.customer_document_balance(uuid,uuid) to service_role;

create or replace function public.complete_order_core(
  p_order_id uuid,
  p_payments jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_receivable boolean;
  v_is_cod boolean;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_fifo jsonb;
  v_line_cogs bigint;
  v_persisted_line_cogs bigint;
  v_total_cogs bigint := 0;
  v_quantity_total numeric := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
  v_business_timezone text;
  v_entry_date date;
  v_actor uuid := (p_context).actor_id;
  v_posting_context public.posting_context;
begin
  if (p_context).company_id is null or (p_context).source not in (
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation',
    'fulfillment_dispatch'
  ) then raise exception 'invalid_posting_context'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = (p_context).company_id
  for update;
  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;
  if exists (
    select 1
    from public.order_lines line
    where line.order_id = p_order_id
    limit 1 offset 128
  ) then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  select company.business_timezone into v_business_timezone
  from public.companies company where company.id = v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch';
  end if;
  v_entry_date := coalesce(
    (p_context).posting_date,
    (coalesce((p_context).occurred_at, now()) at time zone v_business_timezone)::date
  );
  v_posting_context := row(
    (p_context).company_id, (p_context).location_id, (p_context).actor_id,
    (p_context).cashier_session_id, coalesce((p_context).occurred_at, now()),
    v_entry_date, (p_context).source, (p_context).late_reason
  )::public.posting_context;

  select approval.id into v_pending_approval
  from public.approvals approval
  where approval.company_id = v_order.company_id
    and approval.type = 'below_wholesale'
    and approval.status = 'pending'
    and approval.metadata ->> 'order_id' = p_order_id::text
  limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_receivable := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');
  v_is_cod := v_is_receivable and coalesce(v_order.receivable_kind = 'cod',false);
  v_is_credit := v_is_receivable and not coalesce(v_is_cod,false);
  update public.orders
  set receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end
  where id = p_order_id;
  if v_is_cod then
    if (p_context).source <> 'fulfillment_dispatch'
      or v_order.customer_id is null
      or not exists (
        select 1 from public.order_fulfillments fulfillment
        where fulfillment.order_id = p_order_id
          and fulfillment.company_id = v_order.company_id
          and fulfillment.collection_kind = 'cod'
          and fulfillment.fulfillment_type = 'delivery'
          and fulfillment.status = 'ready'
      )
    then raise exception 'invalid_cod_dispatch_context'; end if;
  elsif v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer
    from public.customers customer
    where customer.id = v_order.customer_id and customer.company_id = v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
        v_order.total) > 0
      and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    v_ar_balance := public.customer_credit_exposure(
      v_order.company_id, v_order.customer_id
    );

    if v_ar_balance + coalesce(
      nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
      v_order.total
    ) > v_customer.credit_limit and v_customer.credit_limit > 0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists (
          select 1
          from public.company_memberships membership
          join public.roles role
            on role.id = membership.role_id and role.company_id = membership.company_id
          where membership.company_id = v_order.company_id
            and membership.user_id = v_actor
            and membership.authorization_status = 'approved'
            and 'ApproveCustomerCredit' = any(role.permissions)
        )
        or coalesce(current_setting('app.approved_credit_order_id', true), '') = p_order_id::text
      then
        insert into public.approvals(
          company_id, type, status, metadata, requested_by, decided_by,
          decided_at, decision_reason
        ) values(
          v_order.company_id, 'overdraft', 'approved', jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ), auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_payments) payment
      where payment ->> 'method' = 'credit'
    ) then
      raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
    end if;

    with inserted as (
      insert into public.payments(
        company_id, order_id, method_code, amount, reference, mpesa_receipt,
        collection_allocation_id, location_id, cashier_session_id, ledger_account_code
      )
      select
        v_order.company_id, p_order_id, payment.method, payment.amount,
        payment.reference, payment.mpesa_receipt, payment.collection_allocation_id,
        v_order.location_id,
        coalesce((p_context).cashier_session_id, v_order.cashier_session_id),
        public.resolve_tender_account(
          v_order.company_id, v_order.location_id, payment.method, payment.account_code
        )
      from jsonb_to_recordset(p_payments) as payment(
        method text,
        amount bigint,
        reference text,
        mpesa_receipt text,
        collection_allocation_id uuid,
        account_code text
      )
      returning amount
    )
    select coalesce(sum(amount), 0)::bigint into v_paid from inserted;
    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select line.*, variant.track_inventory
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id
  loop
    v_quantity_total := v_quantity_total + v_line.quantity;
    v_line_cogs := 0;
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity,
        'Sale', p_order_id::text
      );
      v_line_cogs := (v_fifo ->> 'total_cogs')::bigint;
      v_total_cogs := v_total_cogs + v_line_cogs;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
    update public.order_lines
    set cogs_total = v_line_cogs
    where id = v_line.id and company_id = v_order.company_id;
  end loop;

  select coalesce(sum(line.cogs_total), 0)::bigint
  into v_persisted_line_cogs
  from public.order_lines line
  where line.order_id = p_order_id and line.company_id = v_order.company_id;
  if v_persisted_line_cogs <> v_total_cogs then
    raise exception 'order_line_cogs_mismatch: lines % <> order %',
      v_persisted_line_cogs, v_total_cogs;
  end if;

  if v_is_receivable then
    perform public.post_journal_entry_with_context(
      v_order.company_id, case when v_is_cod then 'CodReceivable' else 'CreditSale' end,
      p_order_id::text,
      case when v_is_cod then 'COD receivable ' else 'Credit sale ' end || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total,
          'order_id', p_order_id, 'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'method', case when v_is_cod then 'cod' else 'credit' end
          )
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  else
    for v_payment_row in select payment.* from public.payments payment
      where payment.order_id = p_order_id
    loop
      perform public.post_journal_entry_with_context(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount,
            'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        ), v_posting_context
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry_with_context(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end,
      cashier_pending_at = null,
      completed_at = coalesce((p_context).occurred_at, completed_at, now()),
      accounting_posting_date = v_entry_date,
      posting_source = (p_context).source,
      late_posting_reason = (p_context).late_reason,
      cashier_session_id = coalesce(cashier_session_id, (p_context).cashier_session_id),
      quantity_total = v_quantity_total,
      cogs_total = v_total_cogs,
      updated_at = now()
  where id = p_order_id;
  return p_order_id;
end;
$$;

revoke execute on function public.complete_order_core(uuid,jsonb,public.posting_context)
  from public, anon, authenticated;
grant execute on function public.complete_order_core(uuid,jsonb,public.posting_context)
 to service_role;

create or replace function public.enforce_credit_serialization()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_account_code text;v_source_type text;v_source_id text;v_party_id uuid;
  v_party record;v_balance bigint;v_order_balance bigint;
  v_order_debits bigint;v_order_credits bigint;v_residual bigint;
begin
  if current_setting('app.bypass_business_limits',true)='on' then return new; end if;
  select a.code into v_account_code from public.ledger_accounts a
  where a.id=new.account_id and a.company_id=new.company_id;
  if v_account_code not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then return new; end if;
  select e.source_type,e.source_id into v_source_type,v_source_id
  from public.ledger_journal_entries e where e.id=new.entry_id;

  if v_account_code='ACCOUNTS_RECEIVABLE' then
    v_party_id:=nullif(new.meta->>'customerId','')::uuid;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and not c.is_supplier for update;
    if v_party is null then raise exception 'customer_not_found'; end if;
    if v_source_type='CodReceivable' and new.debit>0 then
      if not exists(
        select 1 from public.orders o
        join public.order_fulfillments f on f.order_id=o.id and f.company_id=o.company_id
        where o.id=new.order_id and o.company_id=new.company_id
          and o.receivable_kind='cod' and f.collection_kind='cod'
          and f.status='ready' and v_source_id=o.id::text
      ) then raise exception 'invalid_cod_receivable_posting'; end if;
    elsif v_source_type='CreditSale' and new.debit>0 then
      if not exists(select 1 from public.orders o where o.id=new.order_id
        and o.company_id=new.company_id and o.receivable_kind='credit')
      then raise exception 'invalid_credit_receivable_posting'; end if;
      v_residual:=coalesce(nullif(current_setting('app.sale_residual_credit_amount',true),'')::bigint,
        new.debit);
      if v_residual>0 and not v_party.is_credit_approved then
        raise exception 'credit_not_approved: customer %',v_party_id; end if;
      v_balance:=public.customer_credit_exposure(new.company_id,v_party_id);
      if v_party.credit_limit>0 and v_balance+v_residual>v_party.credit_limit
        and not exists(select 1 from public.approvals ap where ap.company_id=new.company_id
          and ap.type='overdraft' and (ap.status='approved' or (ap.status='pending'
            and coalesce(current_setting('app.approved_credit_order_id',true),'')=v_source_id))
          and ap.metadata->>'order_id'=v_source_id) then
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_balance,new.debit,v_party.credit_limit;
      end if;
    elsif v_source_type in('PaymentAllocation','Payment') and new.credit>0 then
      select coalesce(sum(l.debit),0)::bigint,coalesce(sum(l.credit),0)::bigint
      into v_order_debits,v_order_credits from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=new.company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.order_id=new.order_id;
      v_order_balance:=v_order_debits-v_order_credits;
      if new.credit>v_order_balance then
        raise exception 'ar_overpayment: order % AR credits % exceed debits %',
          new.order_id,v_order_credits+new.credit,v_order_debits;
      end if;
    end if;
  else
    v_party_id:=nullif(new.meta->>'supplierId','')::uuid;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and c.is_supplier for update;
    if v_party is null then raise exception 'supplier_not_found'; end if;
    select coalesce(sum(l.credit)-sum(l.debit),0)::bigint into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=new.company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=v_party_id::text;
    if v_source_type='InventoryPurchase' and new.credit>0 then
      v_residual:=new.credit
        -coalesce(nullif(new.meta->>'projectedInitialPayment','')::bigint,0)
        -coalesce(nullif(new.meta->>'projectedAdvance','')::bigint,0);
      if v_party.supplier_credit_limit>0
        and v_balance+greatest(v_residual,0)>v_party.supplier_credit_limit then
        raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
          v_balance,greatest(v_residual,0),v_party.supplier_credit_limit;
      end if;
    elsif v_source_type='SupplierPayment' and new.debit>0 and new.debit>v_balance then
      raise exception 'ap_overpayment: supplier balance is %',v_balance;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_credit_serialization() from public,anon,authenticated;
grant execute on function public.enforce_credit_serialization() to service_role;

create or replace function public.snapshot_credit_due_date()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terms integer;
begin
  if new.is_credit_sale and new.status='completed' and new.receivable_kind is null then
    new.receivable_kind:='credit';
  end if;
  if new.is_credit_sale and new.status='completed' and new.receivable_kind='credit'
    and new.credit_due_at is null and new.customer_id is not null then
    select coalesce(credit_terms_days,7) into v_terms from public.customers
    where id=new.customer_id and company_id=new.company_id;
    new.credit_due_at:=(coalesce(new.completed_at,now()) at time zone 'Africa/Nairobi')::date
      +coalesce(v_terms,7);
  elsif new.receivable_kind='cod' then new.credit_due_at:=null;
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_credit_due_date() from public,anon,authenticated;

drop view if exists public.customer_credit_aging;
create view public.customer_credit_aging with (security_invoker=true) as
with per_order as (
  select l.company_id,l.meta->>'customerId' customer_id,l.order_id,
    sum(l.debit)-sum(l.credit) balance,min(e.entry_date) oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id
  join public.ledger_journal_entries e on e.id=l.entry_id
  left join public.orders o on o.id=l.order_id and o.company_id=l.company_id
  where a.code='ACCOUNTS_RECEIVABLE' and l.order_id is not null
    and o.receivable_kind='credit'
  group by l.company_id,l.meta->>'customerId',l.order_id
)
select company_id,customer_id::uuid customer_id,sum(balance)::bigint balance,
  min(oldest_date) oldest_unpaid_date,
  (now() at time zone 'Africa/Nairobi')::date-min(oldest_date) days_outstanding,
  case when (now() at time zone 'Africa/Nairobi')::date-min(oldest_date)<=7 then 'current'
    when (now() at time zone 'Africa/Nairobi')::date-min(oldest_date)<=30 then '8-30'
    when (now() at time zone 'Africa/Nairobi')::date-min(oldest_date)<=60 then '31-60'
    else '60+' end bucket
from per_order where balance>0 group by company_id,customer_id;
revoke all on public.customer_credit_aging from public,anon;
grant select on public.customer_credit_aging to authenticated,service_role;

create or replace function public.fulfillment_cod_balance(p_fulfillment_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_membership uuid;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id()
    or v_f.collection_kind<>'cod' then raise exception 'cod_fulfillment_not_found'; end if;
  v_membership:=public.current_fulfillment_membership_id(v_f.location_id);
  if not public.current_user_has_permission('ManageFulfillments')
    and (not public.fulfillment_has_capability('CompleteFulfillments')
      or v_f.assigned_membership_id is distinct from v_membership) then
    raise exception 'fulfillment_assignment_required'; end if;
  return coalesce(public.order_open_balance_core(v_f.order_id),0);
end;
$$;
revoke execute on function public.fulfillment_cod_balance(uuid) from public,anon;
grant execute on function public.fulfillment_cod_balance(uuid) to authenticated;

-- Dispatch recognizes revenue and COGS before a courier accepts money. Keep the
-- posting attributable to its fulfillment actor without manufacturing a till
-- session for that actor. Collected cash remains in custody until cashier handoff.
create or replace function public.enforce_journal_entry_cashier_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;v_cash_control_enabled boolean;v_session record;
begin
  if not public.cashier_session_required_for_source(new.source_type) then return new; end if;
  select c.cash_control_enabled into v_cash_control_enabled from public.companies c
    where c.id=new.company_id;
  if not coalesce(v_cash_control_enabled,false) then
    new.cashier_session_id:=null;return new;
  end if;
  if new.posting_source in('fulfillment_dispatch','fulfillment_collection') then
    if new.cashier_session_id is not null then
      select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
        where s.id=new.cashier_session_id for key share;
      if v_session.id is null or v_session.company_id<>new.company_id
        or v_session.location_id is distinct from new.posting_location_id then
        raise exception 'posting_context_cashier_session_mismatch';
      end if;
    end if;
    return new;
  end if;
  if new.posting_source in('mpesa_provider','mpesa_reconciliation','offline_review') then
    select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
      where s.id=new.cashier_session_id for key share;
    if v_session.id is null or v_session.company_id<>new.company_id
      or v_session.location_id is distinct from new.posting_location_id then
      raise exception 'posting_context_cashier_session_mismatch';
    end if;
    return new;
  end if;
  v_session_id:=case when new.posting_location_id is null
    then public.require_open_cashier_session(new.company_id)
    else public.require_open_cashier_session_at_location(new.company_id,new.posting_location_id)
  end;
  if new.cashier_session_id is not null and new.cashier_session_id<>v_session_id then
    raise exception 'cashier_session_mismatch: journal must use the open session';
  end if;
  new.cashier_session_id:=v_session_id;
  new.posting_source:=coalesce(new.posting_source,'interactive');
  return new;
end;
$$;

create or replace function public.tag_order_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;v_session record;
begin
  if new.status<>'completed' or old.status='completed' then return new; end if;
  if new.posting_source='fulfillment_dispatch' then
    if new.cashier_session_id is not null then
      select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
        where s.id=new.cashier_session_id for key share;
      if v_session.id is null or v_session.company_id<>new.company_id
        or v_session.location_id is distinct from new.location_id then
        raise exception 'posting_context_cashier_session_mismatch';
      end if;
    end if;
    return new;
  end if;
  if new.posting_source in('mpesa_provider','mpesa_reconciliation','offline_review') then
    if new.cashier_session_id is null then
      if exists(select 1 from public.companies c where c.id=new.company_id and c.cash_control_enabled)
        then raise exception 'posting_context_cashier_session_required'; end if;
      return new;
    end if;
    select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
      where s.id=new.cashier_session_id for key share;
    if v_session.id is null or v_session.company_id<>new.company_id
      or v_session.location_id is distinct from new.location_id then
      raise exception 'posting_context_cashier_session_mismatch'; end if;
    return new;
  end if;
  v_session_id:=public.require_open_cashier_session_at_location(new.company_id,new.location_id);
  if new.cashier_session_id is not null and new.cashier_session_id<>v_session_id then
    raise exception 'cashier_session_mismatch: completed order must use the open session'; end if;
  new.cashier_session_id:=v_session_id;
  return new;
end;
$$;

create or replace function public.tag_journal_line_cashier_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_session_id uuid;v_source_type text;v_posting_location_id uuid;v_posting_source text;
  v_requires_session boolean;
begin
  select e.cashier_session_id,e.source_type,e.posting_location_id,e.posting_source
    into v_session_id,v_source_type,v_posting_location_id,v_posting_source
  from public.ledger_journal_entries e
  where e.id=new.entry_id and e.company_id=new.company_id;
  if v_source_type is null then raise exception 'journal_entry_not_found: %',new.entry_id; end if;
  v_requires_session:=(public.cashier_session_required_for_source(v_source_type)
    or (v_source_type='InventoryPurchase' and new.meta?'isCreditPurchase'
      and (new.meta->>'isCreditPurchase')::boolean is false))
    and coalesce(v_posting_source not in('fulfillment_dispatch','fulfillment_collection'),true);
  if v_requires_session and v_session_id is null then
    v_session_id:=case when v_posting_location_id is null
      then public.require_open_cashier_session(new.company_id)
      else public.require_open_cashier_session_at_location(new.company_id,v_posting_location_id)
    end;
  end if;
  if v_requires_session and v_session_id is not null then
    new.meta:=coalesce(new.meta,'{}'::jsonb)||jsonb_build_object('openSessionId',v_session_id);
    if v_source_type='InventoryPurchase' and new.meta?'isCreditPurchase'
      and (new.meta->>'isCreditPurchase')::boolean is false then
      update public.ledger_journal_lines
      set meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('openSessionId',v_session_id)
      where entry_id=new.entry_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.dispatch_fulfillment(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_order public.orders%rowtype;
  v_company public.companies%rowtype;v_context public.posting_context;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if v_f.fulfillment_type<>'delivery' or v_f.status<>'ready' then
    raise exception 'delivery_not_ready_for_dispatch'; end if;
  if v_f.phone_normalized is null or nullif(btrim(coalesce(v_f.address_line,'')),'') is null
    or v_f.pin_hash is null then raise exception 'delivery_details_incomplete'; end if;
  select * into v_order from public.orders where id=v_f.order_id for update;
  if v_f.collection_kind='cod' then
    if v_order.customer_id is null or v_f.customer_id is null
      or v_order.customer_id is distinct from v_f.customer_id then
      raise exception 'cod_customer_required'; end if;
    if v_order.status in('draft','pending_payment') then
      update public.orders set receivable_kind='cod',updated_at=now() where id=v_order.id;
      select * into v_company from public.companies where id=v_order.company_id;
      v_context:=row(v_order.company_id,v_order.location_id,auth.uid(),null,now(),
        (now() at time zone v_company.business_timezone)::date,'fulfillment_dispatch',null)
        ::public.posting_context;
      perform public.complete_order_core(v_order.id,'[]'::jsonb,v_context);
    elsif v_order.status<>'completed' or v_order.receivable_kind<>'cod' then
      raise exception 'cod_order_not_dispatchable: %',v_order.status;
    end if;
  elsif v_order.status<>'completed' then
    raise exception 'order_not_completed';
  end if;
  return public.transition_fulfillment_core(v_f.id,'in_transit',p_expected_version,
    '{}'::jsonb,'staff',null);
end;
$$;
revoke execute on function public.dispatch_fulfillment(uuid,bigint) from public,anon;
grant execute on function public.dispatch_fulfillment(uuid,bigint) to authenticated;

create or replace function public.post_cod_payments_core(
  p_fulfillment_id uuid,p_payments jsonb,p_context public.posting_context
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_order public.orders%rowtype;v_payment jsonb;
  v_balance bigint;v_total bigint:=0;v_method text;v_amount bigint;v_account text;
  v_payment_id uuid;v_custodian uuid;v_method_count integer;v_cash_count integer;v_mpesa_count integer;
  v_provider_partial boolean:=false;
begin
  if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments) not between 1 and 2 then
    raise exception 'cod_payment_requires_one_or_two_tenders'; end if;
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  select * into v_order from public.orders where id=v_f.order_id and company_id=v_f.company_id for update;
  if v_f.id is null or v_f.collection_kind<>'cod' or v_f.status<>'in_transit'
    or v_order.status<>'completed' or v_order.receivable_kind<>'cod' then
    raise exception 'cod_not_collectable'; end if;
  if (p_context).company_id is distinct from v_f.company_id
    or (p_context).location_id is distinct from v_f.location_id then
    raise exception 'posting_context_mismatch'; end if;
  select count(*),count(*) filter(where value->>'method'='cash'),
    count(*) filter(where value->>'method'='mpesa'),
    coalesce(sum((value->>'amount')::bigint),0)
  into v_method_count,v_cash_count,v_mpesa_count,v_total
  from jsonb_array_elements(p_payments);
  if v_method_count<>v_cash_count+v_mpesa_count or v_cash_count>1 or v_mpesa_count>1
    or exists(select 1 from jsonb_array_elements(p_payments) p
      where coalesce((p->>'amount')::bigint,0)<=0) then
    raise exception 'cod_supports_exact_cash_mpesa_split_only'; end if;
  v_balance:=coalesce(public.order_open_balance_core(v_order.id),v_order.total);
  if v_balance=0 then return 0; end if;
  v_provider_partial:=(p_context).source='mpesa_provider' and v_method_count=1
    and v_mpesa_count=1 and v_total<v_balance;
  if v_total>v_balance or (not v_provider_partial and v_total<>v_balance) then
    raise exception 'cod_payment_mismatch: paid % balance %',v_total,v_balance; end if;
  select m.id into v_custodian from public.company_memberships m
  join public.company_membership_locations ml on ml.membership_id=m.id
  where m.company_id=v_f.company_id and m.user_id=(p_context).actor_id
    and m.authorization_status='approved' and ml.location_id=v_f.location_id limit 1;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method:=v_payment->>'method';v_amount:=(v_payment->>'amount')::bigint;
    if v_method='cash' then
      if v_custodian is null then raise exception 'cash_custodian_membership_required'; end if;
      v_account:='CASH_IN_CUSTODY';
    else
      if nullif(v_payment->>'collection_allocation_id','') is null
        or nullif(v_payment->>'mpesa_receipt','') is null then
        raise exception 'verified_mpesa_collection_required'; end if;
      v_account:=public.resolve_tender_account(v_f.company_id,v_f.location_id,'mpesa',
        v_payment->>'account_code');
    end if;
    insert into public.payments(
      company_id,order_id,method_code,amount,reference,mpesa_receipt,
      collection_allocation_id,location_id,cashier_session_id,ledger_account_code,
      cash_custodian_membership_id
    ) values(
      v_f.company_id,v_order.id,v_method,v_amount,
      coalesce(v_payment->>'reference',case when v_method='cash' then 'COD cash' end),
      v_payment->>'mpesa_receipt',nullif(v_payment->>'collection_allocation_id','')::uuid,
      v_f.location_id,null,v_account,case when v_method='cash' then v_custodian end
    ) returning id into v_payment_id;
    perform public.post_journal_entry_with_context(
      v_f.company_id,'Payment',v_payment_id::text,
      'COD collection for order '||v_order.code,
      jsonb_build_array(
        jsonb_build_object('account_code',v_account,'debit',v_amount,'order_id',v_order.id,
          'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id,
            'method',v_method,'fulfillmentId',v_f.id)),
        jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_amount,
          'order_id',v_order.id,'meta',jsonb_build_object('orderCode',v_order.code,
            'customerId',v_order.customer_id,'method',v_method,'fulfillmentId',v_f.id))
      ),p_context
    );
  end loop;
  perform public.append_fulfillment_event_core(v_f.id,'cod_collected',v_f.status,v_f.status,
    null,case when (p_context).source='mpesa_provider' then 'provider' else 'staff' end,
    case when (p_context).source='mpesa_provider' then
      coalesce((select value->>'mpesa_receipt' from jsonb_array_elements(p_payments)
        where value->>'method'='mpesa' limit 1),v_payment_id::text) end,
    jsonb_build_object('methods',(select jsonb_agg(value->>'method')
      from jsonb_array_elements(p_payments)),'amount',v_total));
  return v_balance-v_total;
end;
$$;
revoke execute on function public.post_cod_payments_core(uuid,jsonb,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.post_cod_payments_core(uuid,jsonb,public.posting_context)
  to service_role;

create or replace function public.collect_cod_cash(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_balance bigint;v_company public.companies%rowtype;
  v_context public.posting_context;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if exists(select 1 from public.mpesa_payment_intents i
    where i.company_id=v_f.company_id and i.workflow='cod_order'
      and i.subject_id=v_f.order_id and i.status='awaiting_cash') then
    raise exception 'cod_mpesa_cash_confirmation_required'; end if;
  v_balance:=public.fulfillment_cod_balance(v_f.id);
  if v_balance=0 then return jsonb_build_object('status','already_collected','balance',0); end if;
  select * into v_company from public.companies where id=v_f.company_id;
  v_context:=row(v_f.company_id,v_f.location_id,auth.uid(),null,now(),
    (now() at time zone v_company.business_timezone)::date,'fulfillment_collection',null)
    ::public.posting_context;
  perform public.post_cod_payments_core(v_f.id,
    jsonb_build_array(jsonb_build_object('method','cash','amount',v_balance)),v_context);
  return jsonb_build_object('status','collected','balance',0,'amount',v_balance);
end;
$$;
revoke execute on function public.collect_cod_cash(uuid,bigint) from public,anon;
grant execute on function public.collect_cod_cash(uuid,bigint) to authenticated;

create or replace function public.guard_cod_order_reversal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='voided' and old.status is distinct from 'voided'
    and old.receivable_kind='cod' and exists(select 1 from public.payments p
      where p.order_id=old.id and p.status='settled') then
    raise exception 'cod_payments_must_be_resolved_before_reversal';
  end if;
  return new;
end;
$$;
create trigger orders_guard_cod_reversal before update of status on public.orders
  for each row execute function public.guard_cod_order_reversal();
revoke execute on function public.guard_cod_order_reversal() from public,anon,authenticated;

create or replace function public.guard_cod_cash_custody_reversal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='settled' and new.status='cancelled'
    and old.cash_remittance_id is not null then
    raise exception 'cash_handoff_must_be_rejected_or_refunded';
  end if;
  return new;
end;
$$;
create trigger payments_guard_cod_cash_custody_reversal
  before update of status on public.payments
  for each row execute function public.guard_cod_cash_custody_reversal();
revoke execute on function public.guard_cod_cash_custody_reversal()
  from public,anon,authenticated;

create or replace function public.sync_cancelled_order_fulfillment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;
begin
  if new.status<>'voided' or old.status='voided' then return new; end if;
  select * into v_f from public.order_fulfillments where order_id=new.id for update;
  if v_f.id is not null and v_f.status not in('fulfilled','cancelled') then
    perform public.transition_fulfillment_core(v_f.id,'cancelled',v_f.state_version,
      jsonb_build_object('note',coalesce(nullif(new.void_reason,''),'Order voided')),
      'system',null);
  end if;
  return new;
end;
$$;
create trigger orders_sync_cancelled_fulfillment
  after update of status on public.orders
  for each row execute function public.sync_cancelled_order_fulfillment();
revoke execute on function public.sync_cancelled_order_fulfillment()
  from public,anon,authenticated;

-- An approval-held order carries its fulfillment intent on the
-- canonical approval. Materialize operational work only when that order is
-- accepted, so preparation and customer messaging cannot race the decision.
create or replace function public.activate_approved_order_fulfillment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb;
begin
  if new.status<>'completed' or old.status='completed'
    or exists(select 1 from public.order_fulfillments f where f.order_id=new.id) then
    return new;
  end if;
  select a.metadata->'fulfillment_request' into v_payload
  from public.approvals a
  where a.company_id=new.company_id and a.subject_id=new.id
    and a.status in('pending','approved')
    and jsonb_typeof(a.metadata->'fulfillment_request')='object'
  order by (a.status='pending') desc,a.created_at desc limit 1;
  if v_payload is not null then
    perform public.create_order_fulfillment_core(new.id,new.customer_id,v_payload);
  end if;
  return new;
end;
$$;
create trigger orders_activate_approved_order_fulfillment
  after update of status on public.orders
  for each row execute function public.activate_approved_order_fulfillment();
revoke execute on function public.activate_approved_order_fulfillment()
  from public,anon,authenticated;

create or replace function public.sync_refunded_order_fulfillment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_total bigint;v_refunded bigint;
begin
  select o.gross_total,coalesce(sum(r.amount),0)::bigint into v_total,v_refunded
  from public.orders o left join public.refunds r
    on r.order_id=o.id and r.company_id=o.company_id
  where o.id=new.order_id and o.company_id=new.company_id
  group by o.gross_total;
  if coalesce(v_refunded,0)<coalesce(v_total,0) then return new; end if;
  select * into v_f from public.order_fulfillments where order_id=new.order_id for update;
  if v_f.id is not null and v_f.status not in('fulfilled','cancelled') then
    perform public.transition_fulfillment_core(v_f.id,'cancelled',v_f.state_version,
      jsonb_build_object('note','Full credit note posted'),'system',null);
  end if;
  return new;
end;
$$;
create trigger refunds_sync_cancelled_fulfillment
  after insert on public.refunds
  for each row execute function public.sync_refunded_order_fulfillment();
revoke execute on function public.sync_refunded_order_fulfillment()
  from public,anon,authenticated;

create or replace function public.cancel_fulfillment(
  p_fulfillment_id uuid,p_expected_version bigint,p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_order public.orders%rowtype;v_result jsonb;
  v_collected bigint;v_refunded bigint;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'reason_required'; end if;
  if not public.current_user_has_permission('ManageFulfillments') then
    raise exception 'permission_denied: ManageFulfillments required'; end if;
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if v_f.status in('fulfilled','cancelled') then raise exception 'terminal_fulfillment'; end if;
  select * into v_order from public.orders where id=v_f.order_id for update;
  if v_order.status in('draft','pending_payment') then
    update public.orders set status='voided',receivable_kind=null,is_credit_sale=false,
      voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason),updated_at=now()
    where id=v_order.id;
    select * into v_f from public.order_fulfillments where id=v_f.id;
    return jsonb_build_object('status','cancelled','fulfillment_id',v_f.id,
      'fulfillment_status',v_f.status,'state_version',v_f.state_version);
  end if;
  if v_order.status<>'completed' then raise exception 'order_not_cancellable: %',v_order.status; end if;
  select coalesce(sum(p.amount),0)::bigint into v_collected from public.payments p
    where p.order_id=v_order.id and p.company_id=v_order.company_id and p.status='settled';
  select coalesce(sum(r.amount),0)::bigint into v_refunded from public.refunds r
    where r.order_id=v_order.id and r.company_id=v_order.company_id;
  if v_order.receivable_kind='cod' and v_collected>0 and v_refunded<v_order.gross_total then
    return jsonb_build_object('status','payment_resolution_required',
      'fulfillment_id',v_f.id,'fulfillment_status',v_f.status,
      'collected_amount',v_collected,'refunded_amount',v_refunded,
      'state_version',v_f.state_version);
  end if;
  if v_order.receivable_kind='cod' and v_refunded>=v_order.gross_total then
    return public.transition_fulfillment_core(v_f.id,'cancelled',p_expected_version,
      jsonb_build_object('note',btrim(p_reason)),'staff',null);
  end if;
  v_result:=public.void_sale(v_order.id,btrim(p_reason));
  select * into v_f from public.order_fulfillments where id=v_f.id;
  return v_result||jsonb_build_object('fulfillment_id',v_f.id,
    'fulfillment_status',v_f.status,'state_version',v_f.state_version);
end;
$$;
revoke execute on function public.cancel_fulfillment(uuid,bigint,text) from public,anon;
grant execute on function public.cancel_fulfillment(uuid,bigint,text) to authenticated;

alter table public.mpesa_payment_intents drop constraint if exists mpesa_payment_intents_workflow_check;
alter table public.mpesa_payment_intents add constraint mpesa_payment_intents_workflow_check
  check (workflow in('sale','order','customer_receipt','connection_test','cod_order'));
alter table public.mpesa_payment_intents
  add column fulfillment_request_fingerprint text,
  add column fulfillment_request jsonb,
  add column fulfillment_id uuid references public.order_fulfillments(id) on delete set null;

create or replace function public.prepare_mpesa_fulfillment_checkout(
  p_location_id uuid,p_customer jsonb,p_lines jsonb,p_fulfillment jsonb,
  p_phone text,p_amount bigint,p_cash_amount bigint,p_client_ref text,
  p_draft_id uuid default null,p_retry boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_customer_id uuid;v_checkout jsonb;
  v_intent public.mpesa_payment_intents%rowtype;v_fingerprint text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_fulfillment->>'collection_kind','none')<>'none' then
    raise exception 'use_cod_mpesa_checkout'; end if;
  if public.normalize_fulfillment_phone(p_fulfillment->>'phone') is null then
    raise exception 'mpesa_fulfillment_recipient_phone_required'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_customer_id:=public.resolve_checkout_customer_core(v_company_id,coalesce(p_customer,'{}'),false);
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'customer',p_customer,'fulfillment',p_fulfillment
  )::text,'sha256'),'hex');
  v_checkout:=public.prepare_mpesa_checkout('sale',p_location_id,p_phone,p_amount,
    p_cash_amount,p_client_ref,v_customer_id,p_lines,null,p_draft_id,p_retry);
  select * into v_intent from public.mpesa_payment_intents
    where id=(v_checkout->>'intent_id')::uuid for update;
  if v_intent.fulfillment_request_fingerprint is not null
    and v_intent.fulfillment_request_fingerprint<>v_fingerprint then
    raise exception 'idempotency_conflict: fulfillment intent changed'; end if;
  update public.mpesa_payment_intents
    set fulfillment_request_fingerprint=coalesce(fulfillment_request_fingerprint,v_fingerprint),
      fulfillment_request=coalesce(fulfillment_request,p_fulfillment)
    where id=v_intent.id;
  return v_checkout||jsonb_build_object(
    'customer_id',v_customer_id,'fulfillment_id',v_intent.fulfillment_id);
end;
$$;
revoke execute on function public.prepare_mpesa_fulfillment_checkout(
  uuid,jsonb,jsonb,jsonb,text,bigint,bigint,text,uuid,boolean) from public,anon;
grant execute on function public.prepare_mpesa_fulfillment_checkout(
  uuid,jsonb,jsonb,jsonb,text,bigint,bigint,text,uuid,boolean) to authenticated;

create or replace function public.mpesa_intent_status(p_intent_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object('id',i.id,'subject_id',i.subject_id,'status',i.status,
    'state_version',i.state_version,'result_code',i.result_code,
    'result_description',i.result_description,'cash_amount',i.cash_amount,
    'provider_receipt',c.provider_receipt,'amount',i.amount,
    'fulfillment_id',i.fulfillment_id,
    'retry_allowed',i.status in('cancelled','expired','failed') and i.fulfilled_collection_id is null)
  into v_result from public.mpesa_payment_intents i
  left join public.payment_collections c on c.id=i.fulfilled_collection_id
  where i.id=p_intent_id and i.company_id=v_company_id
    and (i.created_by=auth.uid() or public.current_user_has_permission('ManageReconciliation'));
  if v_result is null then raise exception 'mpesa_intent_not_found'; end if;
  return v_result;
end;
$$;
revoke execute on function public.mpesa_intent_status(uuid) from public,anon;
grant execute on function public.mpesa_intent_status(uuid) to authenticated;

create or replace function public.create_cod_mpesa_intent(
  p_fulfillment_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_f public.order_fulfillments%rowtype;
  v_order public.orders%rowtype;v_account_id uuid;v_fingerprint text;v_existing record;v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_f from public.order_fulfillments
  where id=p_fulfillment_id and company_id=v_company_id for update;
  if v_f.id is null or v_f.collection_kind<>'cod' or v_f.status<>'in_transit' then
    raise exception 'cod_not_collectable'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  select * into v_order from public.orders where id=v_f.order_id for update;
  if p_amount<=0 or coalesce(p_cash_amount,0)<0
    or p_amount+coalesce(p_cash_amount,0)<>public.fulfillment_cod_balance(v_f.id) then
    raise exception 'cod_payment_mismatch'; end if;
  if btrim(coalesce(p_phone,''))!~'^254[17][0-9]{8}$' then
    raise exception 'invalid_mpesa_phone'; end if;
  if btrim(coalesce(p_client_ref,''))='' then raise exception 'client_ref_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text||':mpesa-client:'||btrim(p_client_ref),0));
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'workflow','cod_order','fulfillment',v_f.id,'order',v_order.id,'location',v_f.location_id,
    'phone',p_phone,'amount',p_amount,'cash_amount',coalesce(p_cash_amount,0)
  )::text,'sha256'),'hex');
  select id,request_fingerprint into v_existing from public.mpesa_payment_intents
  where company_id=v_company_id and client_ref=btrim(p_client_ref);
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  select l.provider_account_id into v_account_id
  from public.location_payment_provider_accounts l
  join public.payment_provider_accounts a on a.id=l.provider_account_id
  join public.mpesa_platform_settings s on s.singleton
  where l.location_id=v_f.location_id and l.company_id=v_company_id and l.provider='mpesa'
    and a.status='active' and s.enabled
    and (s.pilot_company_id is null or s.pilot_company_id=v_company_id);
  if v_account_id is null then raise exception 'mpesa_not_available_at_location'; end if;
  insert into public.mpesa_payment_intents(
    company_id,provider_account_id,location_id,workflow,subject_type,subject_id,
    client_ref,request_fingerprint,payer_phone,amount,cash_amount,
    initiating_cashier_session_id,created_by,created_by_role
  ) values(
    v_company_id,v_account_id,v_f.location_id,'cod_order','order',v_order.id,
    btrim(p_client_ref),v_fingerprint,btrim(p_phone),p_amount,coalesce(p_cash_amount,0),
    null,auth.uid(),auth.jwt()->>'user_role'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_cod_mpesa_intent(uuid,text,bigint,bigint,text)
  from public,anon;
grant execute on function public.create_cod_mpesa_intent(uuid,text,bigint,bigint,text)
  to authenticated;

create or replace function public.prepare_cod_mpesa_checkout(
  p_fulfillment_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text,p_retry boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_intent_id uuid;v_intent public.mpesa_payment_intents%rowtype;v_action text;
begin
  v_intent_id:=public.create_cod_mpesa_intent(p_fulfillment_id,p_phone,p_amount,
    p_cash_amount,p_client_ref);
  select * into v_intent from public.mpesa_payment_intents where id=v_intent_id for update;
  if v_intent.status='completed' then v_action:='completed';
  elsif v_intent.status='awaiting_cash' then v_action:='await_cash';
  elsif v_intent.status in('manual_review','funds_received') then v_action:='review';
  elsif v_intent.status in('requesting','pending') then v_action:='poll';
  elsif v_intent.status='created' then
    if p_retry then raise exception 'retry_not_required'; end if;v_action:='send_prompt';
  elsif v_intent.status in('cancelled','expired','failed') then
    v_action:=case when p_retry then 'send_prompt' else 'retryable' end;
  else v_action:='review'; end if;
  return jsonb_build_object('intent_id',v_intent.id,'subject_id',v_intent.subject_id,
    'fulfillment_id',p_fulfillment_id,'state',v_intent.status,'action',v_action,
    'attempt_id',v_intent.current_attempt_id,'cash_amount',v_intent.cash_amount,
    'result_code',v_intent.result_code,'message',v_intent.result_description);
end;
$$;
revoke execute on function public.prepare_cod_mpesa_checkout(
  uuid,text,bigint,bigint,text,boolean) from public,anon;
grant execute on function public.prepare_cod_mpesa_checkout(
  uuid,text,bigint,bigint,text,boolean) to authenticated;

create or replace function public.create_mpesa_payment_attempt(
  p_intent_id uuid,p_callback_token_hash text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
  v_attempt_id uuid;v_number integer;v_fulfillment_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_callback_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_callback_token_hash'; end if;
  select * into v_intent from public.mpesa_payment_intents
    where id=p_intent_id and company_id=v_company_id for update;
  if v_intent.id is null then raise exception 'mpesa_intent_not_found'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    if v_intent.workflow<>'cod_order' then
      raise exception 'permission_denied: SettleOrder required'; end if;
    select f.id into v_fulfillment_id from public.order_fulfillments f
      where f.order_id=v_intent.subject_id and f.company_id=v_company_id;
    perform public.assert_fulfillment_execution_ready(v_fulfillment_id,'staff',null);
  end if;
  if v_intent.status not in('created','cancelled','expired','failed') then
    raise exception 'mpesa_intent_not_chargeable: %',v_intent.status; end if;
  if v_intent.status<>'created' and exists(select 1 from public.mpesa_payment_intents other
    where other.id<>v_intent.id and other.company_id=v_intent.company_id
      and other.provider_account_id=v_intent.provider_account_id
      and other.subject_type=v_intent.subject_type and other.subject_id=v_intent.subject_id
      and other.status not in('completed','cancelled','expired','failed')) then
    raise exception 'newer_mpesa_intent_exists'; end if;
  if v_intent.payer_phone is null then raise exception 'mpesa_phone_required_for_stk'; end if;
  if v_intent.fulfilled_collection_id is not null or exists(select 1 from public.payment_collections
    where mpesa_intent_id=v_intent.id and provider_status='received') then
    raise exception 'payment_already_received'; end if;
  v_number:=coalesce((select max(attempt_number) from public.mpesa_payment_attempts
    where intent_id=v_intent.id),0)+1;
  insert into public.mpesa_payment_attempts(intent_id,company_id,attempt_number)
    values(v_intent.id,v_company_id,v_number) returning id into v_attempt_id;
  insert into public.mpesa_callback_tokens(company_id,provider_account_id,attempt_id,kind,
    token_hash,status,activated_at,expires_at,created_by)
  values(v_company_id,v_intent.provider_account_id,v_attempt_id,'stk',p_callback_token_hash,
    'active',now(),now()+interval '24 hours 15 minutes',auth.uid());
  update public.mpesa_payment_intents set current_attempt_id=v_attempt_id,status='requesting',
    state_version=state_version+1,result_code=null,result_description=null,review_reason=null,
    expires_at=now()+interval '15 minutes',updated_at=now() where id=v_intent.id;
  return v_attempt_id;
end;
$$;
revoke execute on function public.create_mpesa_payment_attempt(uuid,text) from public,anon;
grant execute on function public.create_mpesa_payment_attempt(uuid,text) to authenticated;

create or replace function public.mpesa_post_reserved_allocation(
  p_collection_id uuid,p_allocation_id uuid,p_context public.posting_context,
  p_additional_payments jsonb default '[]'::jsonb
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_collection public.payment_collections%rowtype;
  v_allocation public.payment_collection_allocations%rowtype;v_order public.orders%rowtype;
  v_receipt public.customer_receipts%rowtype;v_payment jsonb;v_fulfillment_id uuid;
  v_intent public.mpesa_payment_intents%rowtype;v_fulfillment jsonb;
  v_session_closed boolean:=false;v_timezone text;v_original_date date;
begin
  if jsonb_typeof(p_additional_payments)<>'array' then
    raise exception 'additional_payments_must_be_array'; end if;
  select * into v_collection from public.payment_collections where id=p_collection_id for update;
  select * into v_allocation from public.payment_collection_allocations
    where id=p_allocation_id for update;
  if v_collection.id is null or v_allocation.id is null
    or v_collection.company_id is distinct from (p_context).company_id
    or v_allocation.company_id<>v_collection.company_id
    or v_allocation.collection_id<>v_collection.id or v_allocation.amount<>v_collection.amount
    or v_allocation.status<>'reserved' or v_collection.provider_status<>'received'
    or v_collection.verification_status='disputed' then
    raise exception 'mpesa_posting_evidence_mismatch'; end if;
  if (p_context).cashier_session_id is not null then
    select s.status<>'open' into v_session_closed from public.cashier_sessions s
      where s.id=(p_context).cashier_session_id and s.company_id=v_collection.company_id;
  end if;
  if v_allocation.order_id is not null then
    select * into v_order from public.orders where id=v_allocation.order_id
      and company_id=v_collection.company_id for update;
    if v_order.id is null or v_order.location_id is distinct from (p_context).location_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    v_payment:=jsonb_build_array(jsonb_build_object('method','mpesa','amount',v_collection.amount,
      'reference',v_collection.provider_receipt,'mpesa_receipt',v_collection.provider_receipt,
      'collection_allocation_id',v_allocation.id))||p_additional_payments;
    if v_order.receivable_kind='cod' and v_order.status='completed' then
      select f.id into v_fulfillment_id from public.order_fulfillments f
      where f.order_id=v_order.id and f.company_id=v_order.company_id;
      perform public.post_cod_payments_core(v_fulfillment_id,v_payment,p_context);
    else
      perform public.complete_order_core(v_order.id,v_payment,p_context);
      select * into v_intent from public.mpesa_payment_intents
      where id=v_collection.mpesa_intent_id for update;
      if v_intent.fulfillment_request is not null then
        v_fulfillment:=public.create_order_fulfillment_core(
          v_order.id,v_order.customer_id,v_intent.fulfillment_request);
        v_fulfillment_id:=(v_fulfillment->>'fulfillment_id')::uuid;
        update public.mpesa_payment_intents set fulfillment_id=v_fulfillment_id,updated_at=now()
        where id=v_intent.id and fulfillment_id is null;
      end if;
    end if;
  elsif v_allocation.customer_receipt_id is not null then
    select * into v_receipt from public.customer_receipts where id=v_allocation.customer_receipt_id
      and company_id=v_collection.company_id for update;
    if v_receipt.id is null or v_receipt.location_id is distinct from (p_context).location_id
      or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    update public.customer_receipts set reference=v_collection.provider_receipt,
      collection_allocation_id=v_allocation.id where id=v_receipt.id;
    perform public.execute_customer_receipt_core(v_receipt.id,p_context);
  else raise exception 'unsupported_mpesa_subject'; end if;
  update public.payment_collection_allocations set status='posted',posted_at=now(),
    cashier_session_id=(p_context).cashier_session_id,posting_date=(p_context).posting_date,
    posted_after_session_close=v_session_closed,updated_at=now() where id=v_allocation.id;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_session_closed then
    select c.business_timezone into v_timezone from public.companies c where c.id=v_collection.company_id;
    v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
    update public.daily_business_closes set status='invalidated',invalidated_at=now(),
      invalidation_reason='Provider payment settled after the initiating till closed'
    where company_id=v_collection.company_id and business_date=v_original_date
      and status='signed_off';
  end if;
end;
$$;
revoke execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) from public,anon,authenticated;
grant execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) to service_role;

create or replace function public.post_cod_mpesa_split_immediately()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_collection public.payment_collections%rowtype;v_allocation_id uuid;
  v_context public.posting_context;v_timezone text;
begin
  if new.workflow<>'cod_order' or new.status<>'awaiting_cash'
    or old.status='awaiting_cash' or new.cash_amount<=0 then return new; end if;
  select * into v_collection from public.payment_collections
    where id=new.fulfilled_collection_id and provider_status='received'
      and verification_status<>'disputed' for update;
  select id into v_allocation_id from public.payment_collection_allocations
    where collection_id=v_collection.id and order_id=new.subject_id and status='reserved' for update;
  if v_collection.id is null or v_allocation_id is null then
    raise exception 'verified_collection_reservation_required'; end if;
  select business_timezone into v_timezone from public.companies where id=new.company_id;
  v_context:=row(new.company_id,new.location_id,new.created_by,null,v_collection.occurred_at,
    (v_collection.occurred_at at time zone v_timezone)::date,'mpesa_provider',null)
    ::public.posting_context;
  perform public.mpesa_post_reserved_allocation(
    v_collection.id,v_allocation_id,v_context,'[]'::jsonb);
  return new;
end;
$$;
create trigger mpesa_intents_post_cod_split
  after update of status on public.mpesa_payment_intents
  for each row execute function public.post_cod_mpesa_split_immediately();
revoke execute on function public.post_cod_mpesa_split_immediately()
  from public,anon,authenticated;

create or replace function public.finalize_cod_mpesa_cash_split(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
  v_collection public.payment_collections%rowtype;v_allocation_id uuid;v_fulfillment_id uuid;
  v_context public.posting_context;v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_intent from public.mpesa_payment_intents
    where id=p_intent_id and company_id=v_company_id for update;
  if v_intent.id is null or v_intent.workflow<>'cod_order' then
    raise exception 'cod_mpesa_intent_not_found'; end if;
  select f.id into v_fulfillment_id from public.order_fulfillments f
    where f.order_id=v_intent.subject_id and f.company_id=v_company_id;
  perform public.assert_fulfillment_execution_ready(v_fulfillment_id,'staff',null);
  if v_intent.status='completed' then
    return jsonb_build_object('status','completed','fulfillment_id',v_fulfillment_id); end if;
  if v_intent.status<>'awaiting_cash' or v_intent.cash_amount<=0 then
    raise exception 'mpesa_split_not_ready'; end if;
  select * into v_collection from public.payment_collections
  where id=v_intent.fulfilled_collection_id and provider_status='received'
    and verification_status<>'disputed' for update;
  select id into v_allocation_id from public.payment_collection_allocations
  where collection_id=v_collection.id and order_id=v_intent.subject_id and status='posted' for update;
  if v_collection.id is null or v_allocation_id is null then
    raise exception 'verified_collection_reservation_required'; end if;
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  v_context:=row(v_company_id,v_intent.location_id,auth.uid(),null,now(),
    (now() at time zone v_timezone)::date,'fulfillment_collection',null)
    ::public.posting_context;
  perform public.post_cod_payments_core(v_fulfillment_id,
    jsonb_build_array(jsonb_build_object('method','cash','amount',v_intent.cash_amount)),v_context);
  perform public.mpesa_transition_intent(v_intent.id,v_intent.current_attempt_id,
    v_intent.state_version,array['awaiting_cash'],'completed','0',
    'M-PESA and exact COD cash posted',null,v_collection.id);
  return jsonb_build_object('status','completed','fulfillment_id',v_fulfillment_id,'balance',0);
end;
$$;
revoke execute on function public.finalize_cod_mpesa_cash_split(uuid) from public,anon;
grant execute on function public.finalize_cod_mpesa_cash_split(uuid) to authenticated;

create or replace function public.cod_pending_split(p_fulfillment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_f public.order_fulfillments%rowtype;v_intent public.mpesa_payment_intents%rowtype;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  select * into v_intent from public.mpesa_payment_intents i
    where i.company_id=v_f.company_id and i.workflow='cod_order'
      and i.subject_id=v_f.order_id and i.status='awaiting_cash'
    order by i.created_at desc limit 1;
  if v_intent.id is null then return null; end if;
  return jsonb_build_object('intent_id',v_intent.id,'mpesa_amount',v_intent.amount,
    'cash_amount',v_intent.cash_amount,'provider_receipt',(
      select c.provider_receipt from public.payment_collections c
      where c.id=v_intent.fulfilled_collection_id));
end;
$$;
revoke execute on function public.cod_pending_split(uuid) from public,anon;
grant execute on function public.cod_pending_split(uuid) to authenticated;

create or replace function public.cash_custody_holdings(p_location_id uuid)
returns table(
  payment_id uuid,fulfillment_id uuid,order_code text,amount bigint,collected_at timestamptz,
  custodian_membership_id uuid,custodian_name text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();v_membership uuid;v_manage boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  if not public.fulfillment_has_capability('CompleteFulfillments') then
    raise exception 'permission_denied: CompleteFulfillments required'; end if;
  v_membership:=public.current_fulfillment_membership_id(p_location_id);
  v_manage:=public.current_user_has_permission('ManageFulfillments');
  return query select p.id,f.id,o.code,p.amount,p.created_at,p.cash_custodian_membership_id,
    coalesce(sp.display_name,m.user_id::text)
  from public.payments p
  join public.orders o on o.id=p.order_id and o.receivable_kind='cod'
  join public.order_fulfillments f on f.order_id=o.id
  join public.company_memberships m on m.id=p.cash_custodian_membership_id
  left join public.company_staff_profiles sp on sp.company_id=m.company_id and sp.user_id=m.user_id
  where p.company_id=v_company_id and p.location_id=p_location_id and p.status='settled'
    and p.method_code='cash' and p.cash_remittance_id is null
    and (v_manage or p.cash_custodian_membership_id=v_membership)
  order by p.created_at,p.id;
end;
$$;
revoke execute on function public.cash_custody_holdings(uuid) from public,anon;
grant execute on function public.cash_custody_holdings(uuid) to authenticated;

create or replace function public.submit_cash_custody_remittance(
  p_location_id uuid,p_payment_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_membership uuid;v_count integer;
  v_expected bigint;v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  if not public.fulfillment_has_capability('CompleteFulfillments') then
    raise exception 'permission_denied: CompleteFulfillments required'; end if;
  v_membership:=public.current_fulfillment_membership_id(p_location_id);
  if coalesce(array_length(p_payment_ids,1),0) not between 1 and 200 then
    raise exception 'select_between_1_and_200_holdings'; end if;
  if (select count(distinct id) from unnest(p_payment_ids) id)
    <>array_length(p_payment_ids,1) then raise exception 'duplicate_payment_selection'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text||':cash-custody:'||v_membership::text,0));
  perform 1 from public.payments p where p.id=any(p_payment_ids) for update;
  select count(*),coalesce(sum(p.amount),0)::bigint into v_count,v_expected
  from public.payments p join public.orders o on o.id=p.order_id
  where p.id=any(p_payment_ids) and p.company_id=v_company_id
    and p.location_id=p_location_id and p.status='settled' and p.method_code='cash'
    and p.cash_custodian_membership_id=v_membership and p.cash_remittance_id is null
    and o.receivable_kind='cod';
  if v_count<>array_length(p_payment_ids,1) then
    raise exception 'cash_holding_selection_changed'; end if;
  insert into public.cash_custody_remittances(
    company_id,location_id,custodian_membership_id,expected_amount,submitted_by
  ) values(v_company_id,p_location_id,v_membership,v_expected,auth.uid()) returning id into v_id;
  update public.payments set cash_remittance_id=v_id where id=any(p_payment_ids);
  return jsonb_build_object('remittance_id',v_id,'status','submitted',
    'expected_amount',v_expected,'payment_count',v_count);
end;
$$;
revoke execute on function public.submit_cash_custody_remittance(uuid,uuid[]) from public,anon;
grant execute on function public.submit_cash_custody_remittance(uuid,uuid[]) to authenticated;

create or replace function public.cash_custody_remittances(
  p_location_id uuid,p_status text default null,p_limit integer default 100
)
returns table(
  id uuid,status text,expected_amount bigint,received_amount bigint,submitted_at timestamptz,
  accepted_at timestamptz,custodian_membership_id uuid,custodian_name text,
  payment_count bigint,variance_reason text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_membership uuid;v_view_all boolean;
begin
  if not (public.current_user_has_permission('SettleOrder')
    or public.fulfillment_has_capability('CompleteFulfillments')) then
    raise exception 'permission_denied: cash handoff capability required'; end if;
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  v_membership:=public.current_fulfillment_membership_id(p_location_id);
  v_view_all:=public.current_user_has_permission('SettleOrder')
    or public.current_user_has_permission('ManageFulfillments');
  return query select r.id,r.status,r.expected_amount,r.received_amount,r.submitted_at,
    r.accepted_at,r.custodian_membership_id,coalesce(sp.display_name,m.user_id::text),
    count(p.id),r.variance_reason
  from public.cash_custody_remittances r
  join public.company_memberships m on m.id=r.custodian_membership_id
  left join public.company_staff_profiles sp on sp.company_id=m.company_id and sp.user_id=m.user_id
  left join public.payments p on p.cash_remittance_id=r.id
  where r.company_id=v_company_id and r.location_id=p_location_id
    and (p_status is null or r.status=p_status)
    and (v_view_all or r.custodian_membership_id=v_membership)
  group by r.id,sp.display_name,m.user_id
  order by r.created_at desc limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;
revoke execute on function public.cash_custody_remittances(uuid,text,integer) from public,anon;
grant execute on function public.cash_custody_remittances(uuid,text,integer) to authenticated;

create or replace function public.accept_cash_custody_remittance(p_remittance_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_r public.cash_custody_remittances%rowtype;
  v_session_id uuid;v_custodian_user uuid;v_company public.companies%rowtype;
  v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_r from public.cash_custody_remittances
  where id=p_remittance_id and company_id=v_company_id for update;
  if v_r.id is null then raise exception 'cash_remittance_not_found'; end if;
  if v_r.status<>'submitted' then raise exception 'cash_remittance_already_decided'; end if;
  if not public.current_user_can_access_location(v_r.location_id) then
    raise exception 'location_access_denied'; end if;
  select user_id into v_custodian_user from public.company_memberships
    where id=v_r.custodian_membership_id;
  if v_custodian_user=auth.uid() then raise exception 'cash_handoff_requires_different_actor'; end if;
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_r.location_id);
  select * into v_company from public.companies where id=v_company_id;
  v_context:=row(v_company_id,v_r.location_id,auth.uid(),v_session_id,now(),
    (now() at time zone v_company.business_timezone)::date,'interactive',null)
    ::public.posting_context;
  perform public.post_journal_entry_with_context(v_company_id,'CashCustodyRemittance',v_r.id::text,
    'Cash custody handoff',jsonb_build_array(
      jsonb_build_object('account_code','CASH_ON_HAND','debit',v_r.expected_amount,
        'meta',jsonb_build_object('remittanceId',v_r.id)),
      jsonb_build_object('account_code','CASH_IN_CUSTODY','credit',v_r.expected_amount,
        'meta',jsonb_build_object('remittanceId',v_r.id))
    ),v_context);
  update public.cash_custody_remittances set status='accepted',received_amount=expected_amount,
    accepting_cashier_session_id=v_session_id,accepted_by=auth.uid(),accepted_at=now(),updated_at=now()
  where id=v_r.id;
  return jsonb_build_object('remittance_id',v_r.id,'status','accepted',
    'received_amount',v_r.expected_amount,'cashier_session_id',v_session_id);
end;
$$;
revoke execute on function public.accept_cash_custody_remittance(uuid) from public,anon;
grant execute on function public.accept_cash_custody_remittance(uuid) to authenticated;

create or replace function public.reject_cash_custody_remittance(
  p_remittance_id uuid,p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();v_r public.cash_custody_remittances%rowtype;
  v_custodian_user uuid;
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_r from public.cash_custody_remittances
  where id=p_remittance_id and company_id=v_company_id for update;
  if v_r.id is null or v_r.status<>'submitted' then raise exception 'cash_remittance_not_pending'; end if;
  if not public.current_user_can_access_location(v_r.location_id) then
    raise exception 'location_access_denied'; end if;
  select user_id into v_custodian_user from public.company_memberships
    where id=v_r.custodian_membership_id;
  if v_custodian_user=auth.uid() then raise exception 'cash_handoff_requires_different_actor'; end if;
  update public.payments set cash_remittance_id=null where cash_remittance_id=v_r.id;
  update public.cash_custody_remittances set status='rejected',rejected_at=now(),
    accepted_by=auth.uid(),variance_reason=btrim(p_reason),updated_at=now() where id=v_r.id;
  return jsonb_build_object('remittance_id',v_r.id,'status','rejected');
end;
$$;
revoke execute on function public.reject_cash_custody_remittance(uuid,text) from public,anon;
grant execute on function public.reject_cash_custody_remittance(uuid,text) to authenticated;

create or replace function public.resolve_cash_custody_shortage(
  p_remittance_id uuid,p_received_amount bigint,p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_r public.cash_custody_remittances%rowtype;
  v_session_id uuid;v_custodian_user uuid;v_shortage bigint;v_company public.companies%rowtype;
  v_context public.posting_context;v_lines jsonb;
begin
  if not public.current_user_has_permission('SettleOrder')
    or not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: SettleOrder and ManageReconciliation required'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'variance_reason_required'; end if;
  select * into v_r from public.cash_custody_remittances
  where id=p_remittance_id and company_id=v_company_id for update;
  if v_r.id is null or v_r.status<>'submitted' then raise exception 'cash_remittance_not_pending'; end if;
  if not public.current_user_can_access_location(v_r.location_id) then
    raise exception 'location_access_denied'; end if;
  if p_received_amount<0 or p_received_amount>=v_r.expected_amount then
    raise exception 'shortage_amount_must_be_below_expected'; end if;
  select user_id into v_custodian_user from public.company_memberships
    where id=v_r.custodian_membership_id;
  if v_custodian_user=auth.uid() then raise exception 'cash_handoff_requires_different_actor'; end if;
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_r.location_id);
  v_shortage:=v_r.expected_amount-p_received_amount;
  v_lines:=jsonb_build_array(
    jsonb_build_object('account_code','CASH_IN_CUSTODY','credit',v_r.expected_amount,
      'meta',jsonb_build_object('remittanceId',v_r.id)),
    jsonb_build_object('account_code','CASH_SHORT_OVER','debit',v_shortage,
      'meta',jsonb_build_object('remittanceId',v_r.id,'reason',btrim(p_reason)))
  );
  if p_received_amount>0 then v_lines:=v_lines||jsonb_build_array(
    jsonb_build_object('account_code','CASH_ON_HAND','debit',p_received_amount,
      'meta',jsonb_build_object('remittanceId',v_r.id))); end if;
  select * into v_company from public.companies where id=v_company_id;
  v_context:=row(v_company_id,v_r.location_id,auth.uid(),v_session_id,now(),
    (now() at time zone v_company.business_timezone)::date,'interactive',null)
    ::public.posting_context;
  perform public.post_journal_entry_with_context(v_company_id,'CashCustodyShortage',v_r.id::text,
    'Cash custody shortage',v_lines,v_context);
  update public.cash_custody_remittances set status='shortage_resolved',
    received_amount=p_received_amount,accepting_cashier_session_id=v_session_id,
    accepted_by=auth.uid(),accepted_at=now(),variance_reason=btrim(p_reason),updated_at=now()
  where id=v_r.id;
  return jsonb_build_object('remittance_id',v_r.id,'status','shortage_resolved',
    'received_amount',p_received_amount,'shortage',v_shortage);
end;
$$;
revoke execute on function public.resolve_cash_custody_shortage(uuid,bigint,text)
  from public,anon;
grant execute on function public.resolve_cash_custody_shortage(uuid,bigint,text)
  to authenticated;
