-- Complete the two pre-existing approval workflows: below-wholesale drafts
-- and external-account tenders. Approval rows remain the source of truth;
-- held orders are operationally hidden from the cashier queue by keeping
-- cashier_pending_at null and are terminally voided on denial/expiry.

create or replace function public.notify_approval_approvers(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_title text;
  v_body text;
begin
  select * into v_approval from public.approvals where id = p_approval_id;
  if v_approval.id is null or v_approval.status <> 'pending' then return; end if;

  v_title := case v_approval.type
    when 'order_reversal' then 'Sale void needs approval'
    when 'sale_refund' then 'Sale refund needs approval'
    when 'payment_reversal' then 'Payment reversal needs approval'
    when 'below_wholesale' then 'Price exception needs approval'
    when 'external_account_payment' then 'Direct account payment needs approval'
    when 'overdraft' then 'Credit sale needs approval'
    when 'customer_credit' then 'Customer credit change needs approval'
    else 'Request needs approval'
  end;
  v_body := case v_approval.type
    when 'order_reversal' then 'A completed sale is waiting to be voided.'
    when 'sale_refund' then 'A completed sale is waiting for a refund.'
    when 'payment_reversal' then 'A settled payment is waiting to be reversed.'
    when 'below_wholesale' then 'A draft contains pricing below wholesale.'
    when 'external_account_payment' then 'A sale is held for direct account verification.'
    when 'overdraft' then 'A credit sale exceeds the customer credit limit.'
    when 'customer_credit' then 'A customer credit policy change is waiting for review.'
    else 'A controlled action is waiting for review.'
  end;

  insert into public.notifications (company_id,user_id,type,title,body,link)
  select v_approval.company_id,m.user_id,'approval',v_title,v_body,
    '/approvals?approval=' || v_approval.id::text
  from public.company_memberships m
  join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  where m.company_id=v_approval.company_id
    and m.authorization_status='approved'
    and m.user_id is distinct from v_approval.requested_by
    and (
      (v_approval.type in ('order_reversal','sale_refund','payment_reversal')
        and 'ManageApprovals'=any(r.permissions) and 'ReverseOrder'=any(r.permissions))
      or (v_approval.type='below_wholesale' and 'ManageApprovals'=any(r.permissions))
      or (v_approval.type='external_account_payment' and 'ViewFinancials'=any(r.permissions))
      or (v_approval.type='overdraft' and 'ManageApprovals'=any(r.permissions)
        and 'ApproveCustomerCredit'=any(r.permissions))
      or (v_approval.type='customer_credit' and 'ManageApprovals'=any(r.permissions)
        and 'ManageCustomerCreditLimit'=any(r.permissions))
    )
    and not exists(select 1 from public.notifications n
      where n.company_id=v_approval.company_id and n.user_id=m.user_id
        and n.type='approval' and n.link='/approvals?approval='||v_approval.id::text);
end;
$$;

revoke execute on function public.notify_approval_approvers(uuid) from authenticated,anon,public;
grant execute on function public.notify_approval_approvers(uuid) to service_role;

create or replace function public.on_approval_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='pending' then perform public.notify_approval_approvers(new.id); end if;
  return new;
end;
$$;

revoke execute on function public.on_approval_request_created() from authenticated,anon,public;
grant execute on function public.on_approval_request_created() to service_role;

drop trigger if exists approval_request_notify on public.approvals;
create trigger approval_request_notify
after insert on public.approvals
for each row execute function public.on_approval_request_created();

-- Legacy callers use the same insert trigger as every newer request path.
create or replace function public.create_approval(
  p_company_id uuid,p_type text,p_metadata jsonb,p_due_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.approvals(company_id,type,metadata,due_at,requested_by)
  values(p_company_id,p_type,coalesce(p_metadata,'{}'),p_due_at,auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_approval(uuid,text,jsonb,timestamptz)
  from authenticated,anon,public;
grant execute on function public.create_approval(uuid,text,jsonb,timestamptz) to service_role;

-- Sale reversal requests now rely on the insert trigger, avoiding a second
-- notification path and guaranteeing notifications only for newly inserted rows.
create or replace function public.request_sale_approval(
  p_company_id uuid,p_type text,p_subject_type text,p_subject_id uuid,p_metadata jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_existing_metadata jsonb;
begin
  if p_company_id is distinct from public.current_company_id() then
    raise exception 'permission_denied: company mismatch';
  end if;
  if p_type not in ('order_reversal','sale_refund','payment_reversal') then
    raise exception 'unsupported_approval_type: %',p_type;
  end if;

  insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
  values(p_company_id,p_type,p_subject_type,p_subject_id,coalesce(p_metadata,'{}'),auth.uid())
  on conflict(company_id,type,subject_id)
    where status='pending' and subject_id is not null
  do nothing returning id into v_id;

  if v_id is null then
    select id,metadata into v_id,v_existing_metadata from public.approvals
    where company_id=p_company_id and type=p_type and subject_id=p_subject_id and status='pending'
    order by created_at limit 1;
    if v_existing_metadata is distinct from coalesce(p_metadata,'{}') then
      raise exception 'approval_already_pending: %',v_id;
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.request_sale_approval(uuid,text,text,uuid,jsonb)
  from authenticated,anon,public;
grant execute on function public.request_sale_approval(uuid,text,text,uuid,jsonb) to service_role;

create or replace function public.notify_approval_requester(p_approval_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_order_id uuid;
  v_order_code text;
  v_action text;
  v_body text;
  v_link text;
begin
  select * into v_approval from public.approvals where id=p_approval_id;
  if v_approval.id is null or v_approval.requested_by is null or v_approval.status='pending' then
    return;
  end if;
  v_order_id := nullif(v_approval.metadata->>'order_id','')::uuid;
  if v_order_id is null and v_approval.subject_type='order' then v_order_id:=v_approval.subject_id; end if;
  if v_order_id is not null then
    select code into v_order_code from public.orders
    where id=v_order_id and company_id=v_approval.company_id;
  end if;
  v_action := case v_approval.type
    when 'order_reversal' then 'Void' when 'sale_refund' then 'Refund'
    when 'payment_reversal' then 'Payment reversal'
    when 'below_wholesale' then 'Price exception'
    when 'external_account_payment' then 'Direct account payment'
    when 'overdraft' then 'Credit sale'
    when 'customer_credit' then 'Customer credit' else 'Approval' end;
  v_body := concat_ws(' — ',
    case when v_order_code is not null then 'Sale '||v_order_code else null end,
    nullif(v_approval.decision_reason,''));
  v_link := case
    when v_approval.type='below_wholesale' and v_order_id is not null then
      '/pos/proformas?order='||v_order_id::text||'&approval='||v_approval.id::text
    when v_order_id is not null then
      '/sales?order='||v_order_id::text||'&approval='||v_approval.id::text
    when v_approval.subject_type='customer' then
      '/customers?customer='||v_approval.subject_id::text||'&approval='||v_approval.id::text
    else '/notifications' end;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  values(v_approval.company_id,v_approval.requested_by,'approval',
    v_action||' request '||v_approval.status,nullif(v_body,''),v_link);
end;
$$;

revoke execute on function public.notify_approval_requester(uuid) from authenticated,anon,public;
grant execute on function public.notify_approval_requester(uuid) to service_role;

create or replace function public.void_approval_held_order(p_order_id uuid,p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.orders set status='voided',voided_at=now(),voided_by=auth.uid(),
    void_reason=p_reason,cashier_pending_at=null,updated_at=now()
  where id=p_order_id and company_id=public.current_company_id() and status='pending_payment';
end;
$$;

revoke execute on function public.void_approval_held_order(uuid,text) from authenticated,anon,public;
grant execute on function public.void_approval_held_order(uuid,text) to service_role;

-- Recreate the location posting wrapper without the old company-wide notify.
drop function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid);
create function public.post_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_payments jsonb,
  p_park boolean default false,p_client_ref text default null,p_draft_id uuid default null
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
    select id into v_approval_id from public.approvals
    where company_id=v_company_id and type='external_account_payment' and status='pending'
      and metadata->>'order_id'=v_order_id::text limit 1;
    if v_approval_id is null then
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'external_account_payment','order',v_order_id,
        jsonb_build_object('order_id',v_order_id,'tenders',v_external_tenders),auth.uid())
      returning id into v_approval_id;
    end if;
    return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
      'order_id',v_order_id,'subject_id',v_order_id);
  end if;
  v_order_id:=public.post_sale(p_customer_id,p_lines,p_payments,p_park,p_client_ref,p_draft_id);
  return jsonb_build_object('status',case when p_park then 'parked' else 'completed' end,
    'order_id',v_order_id,'subject_id',v_order_id);
end;
$$;

revoke execute on function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid)
  from anon,public;
grant execute on function public.post_sale_at_location(uuid,uuid,jsonb,jsonb,boolean,text,uuid)
  to authenticated;

drop function public.settle_order(uuid,jsonb,text);
create function public.settle_order(p_order_id uuid,p_payments jsonb,p_client_ref text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if exists(select 1 from public.approvals where company_id=v_company_id
    and status='pending' and type in ('external_account_payment','overdraft')
    and metadata->>'order_id'=p_order_id::text) then
    raise exception 'approval_pending: order % is held for approval',p_order_id;
  end if;
  if p_client_ref is not null then
    begin
      update public.orders set client_ref=p_client_ref
      where id=p_order_id and company_id=v_company_id and client_ref is null;
    exception when unique_violation then raise exception 'client_ref_in_use: %',p_client_ref;
    end;
    if not found and exists(select 1 from public.orders where id=p_order_id
      and company_id=v_company_id and client_ref=p_client_ref) then return p_order_id; end if;
  end if;
  return public.complete_order(p_order_id,p_payments,auth.uid());
end;
$$;

revoke execute on function public.settle_order(uuid,jsonb,text) from anon,public;
grant execute on function public.settle_order(uuid,jsonb,text) to authenticated;
