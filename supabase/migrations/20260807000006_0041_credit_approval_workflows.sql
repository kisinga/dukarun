-- Add requestable over-limit credit sales and customer credit-policy changes.
-- Existing direct authorities continue to execute immediately.

create or replace function public.can_approve_request_type(p_type text)
returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when p_type in ('order_reversal','sale_refund','payment_reversal') then
      public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ReverseOrder')
    when p_type='external_account_payment' then
      public.current_user_has_permission('ViewFinancials')
    when p_type='overdraft' then
      public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ApproveCustomerCredit')
    when p_type='customer_credit' then
      public.current_user_has_permission('ManageApprovals')
      and public.current_user_has_permission('ManageCustomerCreditLimit')
    else public.current_user_has_permission('ManageApprovals')
  end
$$;

revoke execute on function public.can_approve_request_type(text) from anon,public;
grant execute on function public.can_approve_request_type(text) to authenticated,service_role;

create or replace function public.assert_approval_authority(p_type text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.can_approve_request_type(p_type) then return; end if;
  if p_type in ('order_reversal','sale_refund','payment_reversal') then
    raise exception 'permission_denied: ManageApprovals and ReverseOrder required';
  elsif p_type='external_account_payment' then
    raise exception 'permission_denied: ViewFinancials required';
  elsif p_type='overdraft' then
    raise exception 'permission_denied: ManageApprovals and ApproveCustomerCredit required';
  elsif p_type='customer_credit' then
    raise exception 'permission_denied: ManageApprovals and ManageCustomerCreditLimit required';
  else
    raise exception 'permission_denied: ManageApprovals required';
  end if;
end;
$$;

revoke execute on function public.assert_approval_authority(text) from authenticated,anon,public;
grant execute on function public.assert_approval_authority(text) to service_role;

drop policy if exists "approvals readable by authorized users" on public.approvals;
create policy "approvals readable by authorized users"
on public.approvals for select
using (
  (company_id=(select public.current_company_id()) and (
    requested_by=(select auth.uid()) or public.can_approve_request_type(type)
  )) or (select public.is_platform_admin())
);

create or replace function public.current_access_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_permissions text[]:='{}'::text[];
  v_reversal text;
  v_overdraft text;
  v_customer_credit text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce((select permissions from public.roles
    where company_id=v_company_id and name=public.current_role_name()),'{}')
  into v_permissions;
  v_reversal:=case when 'ReverseOrder'=any(v_permissions) then 'execute'
    when 'SettleOrder'=any(v_permissions) then 'request' else 'blocked' end;
  v_overdraft:=case when 'ApproveCustomerCredit'=any(v_permissions) then 'execute'
    when 'SettleOrder'=any(v_permissions) then 'request' else 'blocked' end;
  v_customer_credit:=case when 'ManageCustomerCreditLimit'=any(v_permissions) then 'execute'
    when 'ManageCustomers'=any(v_permissions) then 'request' else 'blocked' end;
  return jsonb_build_object('company_id',v_company_id,'user_id',auth.uid(),
    'permissions',to_jsonb(v_permissions),'actions',jsonb_build_object(
      'sale.void',v_reversal,'sale.refund',v_reversal,'payment.reverse',v_reversal,
      'sale.credit_over_limit',v_overdraft,'customer.credit.update',v_customer_credit));
end;
$$;

revoke execute on function public.current_access_snapshot() from anon,public;
grant execute on function public.current_access_snapshot() to authenticated;

-- Preserve the established posting function and add one narrow internal
-- approval context. The anchor makes migration failure explicit if the
-- upstream credit-limit branch ever changes.
do $migration$
declare
  v_definition text;
  v_anchor text := 'if public.current_user_has_permission(''ApproveCustomerCredit'') then';
  v_replacement text := $$if public.current_user_has_permission('ApproveCustomerCredit')
        or exists(select 1 from public.company_memberships actor_membership
          join public.roles actor_role on actor_role.id=actor_membership.role_id
            and actor_role.company_id=actor_membership.company_id
          where actor_membership.company_id=v_order.company_id
            and actor_membership.user_id=p_actor
            and actor_membership.authorization_status='approved'
            and 'ApproveCustomerCredit'=any(actor_role.permissions))
        or coalesce(current_setting('app.approved_credit_order_id',true),'')=p_order_id::text then$$;
begin
  select pg_get_functiondef('public.complete_order(uuid,jsonb,uuid)'::regprocedure)
    into v_definition;
  if position('app.approved_credit_order_id' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      raise exception 'Could not add approved credit-order context to complete_order';
    end if;
    execute replace(v_definition,v_anchor,v_replacement);
  end if;
end;
$migration$;

-- The serialized AR guard runs while the request is still pending. Recognize
-- only the request for the order currently being executed by approve_request;
-- the request is marked approved after every inventory and ledger write lands.
do $migration$
declare
  v_definition text;
  v_anchor text := $$and ap.status = 'approved'
             and ap.metadata ->> 'order_id' = v_source_id$$;
  v_replacement text := $$and (
               ap.status = 'approved'
               or (ap.status = 'pending'
                 and coalesce(current_setting('app.approved_credit_order_id',true),'') = v_source_id)
             )
             and ap.metadata ->> 'order_id' = v_source_id$$;
begin
  select pg_get_functiondef('public.enforce_credit_serialization()'::regprocedure)
    into v_definition;
  if position('app.approved_credit_order_id' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      raise exception 'Could not add approved credit-order context to AR guard';
    end if;
    execute replace(v_definition,v_anchor,v_replacement);
  end if;
end;
$migration$;

-- complete_order records an approved overdraft audit for direct execution.
-- When an existing pending request is being approved, suppress that second row;
-- the pending request itself becomes the audit record after completion.
create or replace function public.suppress_duplicate_overdraft_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.type='overdraft' and new.status='approved'
    and exists(select 1 from public.approvals a
      where a.company_id=new.company_id and a.type='overdraft'
        and a.metadata->>'order_id'=new.metadata->>'order_id'
        and a.status in ('pending','approved')) then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function public.suppress_duplicate_overdraft_audit() from authenticated,anon,public;
grant execute on function public.suppress_duplicate_overdraft_audit() to service_role;
drop trigger if exists approvals_suppress_duplicate_overdraft on public.approvals;
create trigger approvals_suppress_duplicate_overdraft
before insert on public.approvals
for each row execute function public.suppress_duplicate_overdraft_audit();

-- Add the optional request reason while preserving old named/positional calls.
drop function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid);
create function public.post_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_payments jsonb,
  p_park boolean default false,p_client_ref text default null,p_draft_id uuid default null,
  p_approval_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
  v_external_tenders jsonb;
  v_order_id uuid;
  v_approval_id uuid;
  v_existing_approval public.approvals%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_ar_balance bigint;
  v_valid boolean;
  v_is_credit boolean:=not p_park and (
    jsonb_array_length(coalesce(p_payments,'[]'))=0 or
    (jsonb_array_length(coalesce(p_payments,'[]'))=1 and p_payments->0->>'method'='credit'));
  v_reason text:=coalesce(nullif(btrim(p_approval_reason),''),
    'Credit limit exceeded during legacy checkout');
begin
  perform set_config('app.business_location_id',v_location_id::text,true);

  if not p_park then
    select jsonb_agg(jsonb_build_object('method',t.method,'amount',t.amount,'reference',t.reference))
    into v_external_tenders
    from (select p->>'method' method,(p->>'amount')::bigint amount,p->>'reference' reference
      from jsonb_array_elements(coalesce(p_payments,'[]')) p) t
    left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t.method
    left join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.location_id=v_location_id
    where t.method<>'credit' and (pm.id is null
      or not coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled));
  end if;

  if v_external_tenders is not null and p_customer_id is null then
    raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts';
  end if;
  if v_external_tenders is not null and not public.current_user_has_permission('ViewFinancials') then
    perform set_config('app.external_payment_hold','on',true);
    v_order_id:=public.post_sale(p_customer_id,p_lines,'[]',true,p_client_ref,p_draft_id);
    update public.orders set cashier_pending_at=null where id=v_order_id and company_id=v_company_id;
    select * into v_order from public.orders where id=v_order_id and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_external_tenders)='array'
      and jsonb_array_length(v_external_tenders)>0
      and (select coalesce(sum((t->>'amount')::bigint),0)
        from jsonb_array_elements(v_external_tenders) t)=v_order.total
      and not exists(
        select 1 from jsonb_array_elements(v_external_tenders) t
        left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t->>'method'
        left join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.location_id=v_order.location_id
        where coalesce((t->>'amount')::bigint,0)<=0 or pm.id is null or not pm.enabled
          or (lpm.id is not null and not lpm.enabled)
          or (coalesce(pm.reconciliation_type,'')='statement_match'
            and btrim(coalesce(t->>'reference',''))='')
      ) into v_valid;
    if not coalesce(v_valid,false) then raise exception 'invalid_external_tenders'; end if;
    select * into v_existing_approval from public.approvals where company_id=v_company_id
      and type='external_account_payment' and status='pending'
      and metadata->>'order_id'=v_order_id::text
    order by created_at desc limit 1;
    if v_existing_approval.id is null then
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'external_account_payment','order',v_order_id,
        jsonb_build_object('order_id',v_order_id,'tenders',v_external_tenders),auth.uid())
      returning id into v_approval_id;
    else v_approval_id:=v_existing_approval.id; end if;
    return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
      'order_id',v_order_id,'subject_id',v_order_id);
  end if;

  -- A non-authorizing cashier's credit sale is parked first so all prices and
  -- totals come from the server. It completes immediately when still in limit.
  if v_is_credit and not public.current_user_has_permission('ApproveCustomerCredit') then
    if not public.current_user_has_permission('SettleOrder') then
      raise exception 'permission_denied: SettleOrder required';
    end if;
    perform set_config('app.external_payment_hold','on',true);
    v_order_id:=public.post_sale(p_customer_id,p_lines,'[]',true,p_client_ref,p_draft_id);
    update public.orders set cashier_pending_at=null where id=v_order_id and company_id=v_company_id;
    select * into v_order from public.orders where id=v_order_id and company_id=v_company_id for update;
    if v_order.status='completed' then
      return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
    end if;
    if v_order.status<>'pending_payment' then
      raise exception 'invalid_order_state: % is %',v_order_id,v_order.status;
    end if;
    select * into v_existing_approval from public.approvals where company_id=v_company_id
      and type='overdraft' and status='pending' and metadata->>'order_id'=v_order_id::text
    order by created_at desc limit 1;
    if v_existing_approval.id is not null then
      return jsonb_build_object('status','approval_required','approval_id',v_existing_approval.id,
        'order_id',v_order_id,'subject_id',v_order_id);
    end if;
    if exists(select 1 from public.approvals where company_id=v_company_id
      and type='below_wholesale' and status='pending' and metadata->>'order_id'=v_order_id::text) then
      raise exception 'approval_conflict: resolve the price exception before requesting credit';
    end if;
    select * into v_customer from public.customers
      where id=v_order.customer_id and company_id=v_company_id for update;
    if v_customer.id is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %',v_order.customer_id;
    end if;
    select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_ar_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
      and l.meta->>'customerId'=v_customer.id::text;
    if v_customer.credit_limit>0 and v_ar_balance+v_order.total>v_customer.credit_limit then
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'overdraft','order',v_order_id,jsonb_build_object(
        'order_id',v_order_id,'customer_id',v_customer.id,'ar_balance',v_ar_balance,
        'order_total',v_order.total,'credit_limit',v_customer.credit_limit,
        'projected_balance',v_ar_balance+v_order.total,'reason',v_reason),auth.uid())
      on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
      do nothing returning id into v_approval_id;
      if v_approval_id is null then select id into v_approval_id from public.approvals
        where company_id=v_company_id and type='overdraft' and subject_id=v_order_id
          and status='pending'; end if;
      return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
        'order_id',v_order_id,'subject_id',v_order_id);
    end if;
    perform public.complete_order(v_order_id,'[]',auth.uid());
    return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
  end if;

  v_order_id:=public.post_sale(p_customer_id,p_lines,p_payments,p_park,p_client_ref,p_draft_id);
  return jsonb_build_object('status',case when p_park then 'parked' else 'completed' end,
    'order_id',v_order_id,'subject_id',v_order_id);
end;
$$;

revoke execute on function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid,text)
  from anon,public;
grant execute on function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid,text)
  to authenticated;

create or replace function public.convert_draft(p_order_id uuid,p_payments jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if exists(select 1 from public.approvals where company_id=public.current_company_id()
    and status='pending' and type in ('external_account_payment','overdraft')
    and subject_id=p_order_id) then
    raise exception 'approval_pending: order % is held for approval',p_order_id;
  end if;
  return public.complete_order(p_order_id,p_payments,auth.uid());
end;
$$;

revoke execute on function public.convert_draft(uuid,jsonb) from anon,public;
grant execute on function public.convert_draft(uuid,jsonb) to authenticated;

create or replace function public.change_customer_credit(
  p_customer_id uuid,p_credit_limit bigint,p_is_approved boolean,p_terms_days integer,p_reason text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_customer public.customers%rowtype;
  v_id uuid;
  v_existing jsonb;
  v_proposed jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_credit_limit is null or p_credit_limit<0 then raise exception 'invalid_credit_limit'; end if;
  if p_terms_days is null or p_terms_days<0 then raise exception 'invalid_credit_terms'; end if;
  select * into v_customer from public.customers
    where id=p_customer_id and company_id=v_company_id and deleted_at is null for update;
  if v_customer.id is null then raise exception 'customer_not_found: %',p_customer_id; end if;

  if public.current_user_has_permission('ManageCustomerCreditLimit') then
    perform public.update_customer_credit(p_customer_id,p_credit_limit,p_is_approved,p_terms_days);
    return jsonb_build_object('status','completed','resource_id',p_customer_id,
      'subject_id',p_customer_id);
  end if;
  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers or ManageCustomerCreditLimit required';
  end if;
  v_proposed:=jsonb_build_object('credit_limit',p_credit_limit,
    'is_credit_approved',p_is_approved,'credit_terms_days',p_terms_days);
  insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
  values(v_company_id,'customer_credit','customer',p_customer_id,jsonb_build_object(
    'customer_id',p_customer_id,'previous',jsonb_build_object(
      'credit_limit',v_customer.credit_limit,'is_credit_approved',v_customer.is_credit_approved,
      'credit_terms_days',coalesce(v_customer.credit_terms_days,0)),
    'proposed',v_proposed,'reason',btrim(p_reason)),auth.uid())
  on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
  do nothing returning id into v_id;
  if v_id is null then
    select id,metadata->'proposed' into v_id,v_existing from public.approvals
    where company_id=v_company_id and type='customer_credit' and subject_id=p_customer_id
      and status='pending';
    if v_existing is distinct from v_proposed then raise exception 'approval_already_pending: %',v_id; end if;
  end if;
  return jsonb_build_object('status','approval_required','approval_id',v_id,
    'subject_id',p_customer_id);
end;
$$;

revoke execute on function public.change_customer_credit(uuid,bigint,boolean,integer,text)
  from anon,public;
grant execute on function public.change_customer_credit(uuid,bigint,boolean,integer,text)
  to authenticated;

create or replace function public.expire_approval_request(
  p_approval_id uuid,p_reason text,p_void_held_order boolean default false
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_order_id uuid;
begin
  update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
    decision_reason=p_reason
  where id=p_approval_id and company_id=public.current_company_id() and status='pending'
  returning coalesce(subject_id,nullif(metadata->>'order_id','')::uuid) into v_order_id;
  if found then
    if p_void_held_order and v_order_id is not null then
      perform public.void_approval_held_order(v_order_id,p_reason);
    end if;
    perform public.notify_approval_requester(p_approval_id);
  end if;
end;
$$;

revoke execute on function public.expire_approval_request(uuid,text,boolean)
  from authenticated,anon,public;
grant execute on function public.expire_approval_request(uuid,text,boolean) to service_role;

create or replace function public.approve_request(p_approval_id uuid,p_reason text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_approval public.approvals%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_payment_status text;
  v_collected bigint;
  v_refunded bigint;
  v_resource_id uuid;
  v_error text;
  v_valid boolean;
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
        'Sale is no longer eligible for reversal',false); return p_approval_id;
    end if;
    v_resource_id:=public.do_void(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved reversal'));

  elsif v_approval.type='sale_refund' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select coalesce(sum(amount),0)::bigint into v_collected from public.payments
      where company_id=v_company_id and order_id=v_approval.subject_id and status='settled';
    select coalesce(sum(amount),0)::bigint into v_refunded from public.refunds
      where company_id=v_company_id and order_id=v_approval.subject_id;
    if v_order.status is distinct from 'completed'
      or (v_approval.metadata->>'amount')::bigint>v_collected-v_refunded
      or not exists(select 1 from public.payment_methods where company_id=v_company_id
        and code=v_approval.metadata->>'method_code' and enabled) then
      perform public.expire_approval_request(p_approval_id,'Refund is no longer valid',false);
      return p_approval_id;
    end if;
    v_resource_id:=public.execute_refund(v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,v_approval.metadata->>'method_code',
      coalesce(v_approval.metadata->>'reason','Approved refund'));

  elsif v_approval.type='payment_reversal' then
    select status into v_payment_status from public.payments
      where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_payment_status is distinct from 'settled' or exists(select 1
      from public.ledger_journal_entries where company_id=v_company_id
        and source_type='PaymentReversal'
        and source_id=v_approval.subject_id::text||'-reversal') then
      perform public.expire_approval_request(p_approval_id,
        'Payment is no longer eligible for reversal',false); return p_approval_id;
    end if;
    v_resource_id:=public.execute_payment_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved payment reversal'));

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
        'Draft pricing changed and must be reviewed again',false); return p_approval_id;
    end if;
    v_resource_id:=v_order.id;

  elsif v_approval.type='external_account_payment' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_approval.metadata->'tenders')='array'
      and jsonb_array_length(v_approval.metadata->'tenders')>0
      and (select coalesce(sum((t->>'amount')::bigint),0)
        from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total
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
        'Direct account payment is no longer valid',true); return p_approval_id;
    end if;
    perform set_config('app.business_location_id',v_order.location_id::text,true);
    begin
      perform public.complete_order(v_order.id,v_approval.metadata->'tenders',auth.uid());
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment could not complete: '||v_error,true); return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,
        'Credit sale is no longer valid',true); return p_approval_id;
    end if;
    perform set_config('app.business_location_id',v_order.location_id::text,true);
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    begin
      perform public.complete_order(v_order.id,'[]',auth.uid());
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Credit sale could not complete: '||v_error,true); return p_approval_id;
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
        'Customer credit policy changed after this request',false); return p_approval_id;
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

create or replace function public.deny_request(p_approval_id uuid,p_reason text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_approval public.approvals%rowtype;
  v_order_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  select * into v_approval from public.approvals
    where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;
  perform public.assert_approval_authority(v_approval.type);
  if v_approval.status<>'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;
  if v_approval.requested_by=auth.uid() then raise exception 'self_approval_denied'; end if;
  update public.approvals set status='denied',decided_by=auth.uid(),decided_at=now(),
    decision_reason=btrim(p_reason) where id=p_approval_id;
  if v_approval.type in ('external_account_payment','overdraft') then
    v_order_id:=coalesce(v_approval.subject_id,
      nullif(v_approval.metadata->>'order_id','')::uuid);
    perform public.void_approval_held_order(v_order_id,'Approval denied: '||btrim(p_reason));
  end if;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid,text) from anon,public;
revoke execute on function public.deny_request(uuid,text) from anon,public;
grant execute on function public.approve_request(uuid,text) to authenticated;
grant execute on function public.deny_request(uuid,text) to authenticated;
