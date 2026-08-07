-- Canonical permission snapshot and approval-aware sale reversals.
-- This migration deliberately wraps the existing accounting functions instead
-- of maintaining a second copy of void/refund/reversal posting logic.

-- ---------------------------------------------------------------------------
-- Approval subjects, durable results, and lifecycle.
-- ---------------------------------------------------------------------------
alter table public.approvals
  add column if not exists subject_type text,
  add column if not exists subject_id uuid,
  add column if not exists result jsonb;

alter table public.approvals drop constraint if exists approvals_status_check;
alter table public.approvals add constraint approvals_status_check
  check (status in ('pending', 'approved', 'denied', 'expired', 'cancelled'));

alter table public.approvals drop constraint if exists approvals_type_check;
alter table public.approvals add constraint approvals_type_check
  check (type in (
    'overdraft', 'customer_credit', 'below_wholesale', 'order_reversal',
    'external_account_payment', 'sale_refund', 'payment_reversal'
  ));

create or replace function public.set_approval_subject()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.subject_type := coalesce(new.subject_type, case
    when new.type = 'payment_reversal' then 'payment'
    when new.type = 'customer_credit' then 'customer'
    else 'order'
  end);
  new.subject_id := coalesce(new.subject_id, case
    when new.type = 'payment_reversal' then nullif(new.metadata ->> 'payment_id', '')::uuid
    when new.type = 'customer_credit' then nullif(new.metadata ->> 'customer_id', '')::uuid
    else nullif(new.metadata ->> 'order_id', '')::uuid
  end);
  return new;
end;
$$;

drop trigger if exists approvals_set_subject on public.approvals;
create trigger approvals_set_subject
before insert or update of type, metadata, subject_type, subject_id on public.approvals
for each row execute function public.set_approval_subject();

update public.approvals set metadata = metadata where subject_id is null;

with ranked as (
  select id, row_number() over (
    partition by company_id, type, subject_id order by created_at, id
  ) as position
  from public.approvals
  where status = 'pending' and subject_id is not null
)
update public.approvals a
set status = 'cancelled', decided_at = now(),
    decision_reason = 'Superseded while normalizing duplicate approval requests'
from ranked r
where a.id = r.id and r.position > 1;

create unique index if not exists approvals_one_pending_subject_idx
  on public.approvals (company_id, type, subject_id)
  where status = 'pending' and subject_id is not null;

revoke execute on function public.set_approval_subject() from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- One server-derived access snapshot for Angular.
-- ---------------------------------------------------------------------------
create or replace function public.current_access_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_permissions text[] := '{}'::text[];
  v_mode text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce((select permissions from public.roles
    where company_id=v_company_id and name=public.current_role_name()),'{}')
  into v_permissions;
  v_mode := case
    when 'ReverseOrder'=any(v_permissions) then 'execute'
    when 'SettleOrder'=any(v_permissions) then 'request'
    else 'blocked'
  end;
  return jsonb_build_object(
    'company_id',v_company_id,'user_id',auth.uid(),'permissions',to_jsonb(v_permissions),
    'actions',jsonb_build_object(
      'sale.void',v_mode,'sale.refund',v_mode,'payment.reverse',v_mode));
end;
$$;

revoke execute on function public.current_access_snapshot() from anon, public;
grant execute on function public.current_access_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- Approval visibility. PostgreSQL remains the authority; the snapshot only
-- controls UI affordances.
-- ---------------------------------------------------------------------------
drop policy if exists "approvals readable by members" on public.approvals;
drop policy if exists "approvals readable by authorized users" on public.approvals;
create policy "approvals readable by authorized users"
on public.approvals for select
using (
  (company_id = (select public.current_company_id()) and (
    requested_by = (select auth.uid())
    or (
      type in ('order_reversal', 'sale_refund', 'payment_reversal')
      and (select public.current_user_has_permission('ManageApprovals'))
      and (select public.current_user_has_permission('ReverseOrder'))
    )
    or (type = 'external_account_payment'
        and (select public.current_user_has_permission('ViewFinancials')))
    or (type not in (
          'order_reversal', 'sale_refund', 'payment_reversal', 'external_account_payment'
        ) and (select public.current_user_has_permission('ManageApprovals')))
  ))
  or (select public.is_platform_admin())
);

-- Inserts one sale-action request and notifies only eligible approvers.
create or replace function public.request_sale_approval(
  p_company_id uuid,
  p_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing_metadata jsonb;
  v_created boolean := false;
  v_title text;
  v_body text;
begin
  if p_company_id is distinct from public.current_company_id() then
    raise exception 'permission_denied: company mismatch';
  end if;
  if p_type not in ('order_reversal', 'sale_refund', 'payment_reversal') then
    raise exception 'unsupported_approval_type: %', p_type;
  end if;

  insert into public.approvals (
    company_id, type, subject_type, subject_id, metadata, requested_by
  ) values (
    p_company_id, p_type, p_subject_type, p_subject_id, coalesce(p_metadata, '{}'), auth.uid()
  )
  on conflict (company_id, type, subject_id)
    where status = 'pending' and subject_id is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    v_created := true;
  else
    select id, metadata into v_id, v_existing_metadata from public.approvals
    where company_id = p_company_id and type = p_type
      and subject_id = p_subject_id and status = 'pending'
    order by created_at limit 1;
    if v_existing_metadata is distinct from coalesce(p_metadata, '{}') then
      raise exception 'approval_already_pending: %', v_id;
    end if;
  end if;

  if v_created then
    v_title := case p_type
      when 'order_reversal' then 'Sale void needs approval'
      when 'sale_refund' then 'Sale refund needs approval'
      else 'Payment reversal needs approval'
    end;
    v_body := case p_type
      when 'order_reversal' then 'A completed sale is waiting to be voided.'
      when 'sale_refund' then 'A completed sale is waiting for a refund.'
      else 'A settled payment is waiting to be reversed.'
    end;

    insert into public.notifications (company_id, user_id, type, title, body, link)
    select p_company_id, m.user_id, 'approval', v_title, v_body,
      '/approvals?approval=' || v_id::text
    from public.company_memberships m
    join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    where m.company_id = p_company_id
      and m.authorization_status = 'approved'
      and 'ManageApprovals' = any(r.permissions)
      and 'ReverseOrder' = any(r.permissions)
      and m.user_id <> auth.uid();
  end if;

  return v_id;
end;
$$;

revoke execute on function public.request_sale_approval(uuid,text,text,uuid,jsonb)
  from authenticated, anon, public;
grant execute on function public.request_sale_approval(uuid,text,text,uuid,jsonb) to service_role;

-- Close the requester loop after a decision. This runs inside the decision
-- transaction, so a notification can never disagree with approval state.
create or replace function public.notify_approval_requester(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals%rowtype;
  v_order_id uuid;
  v_order_code text;
  v_action text;
  v_title text;
  v_body text;
  v_link text;
begin
  select * into v_approval from public.approvals where id = p_approval_id;
  if v_approval.id is null or v_approval.requested_by is null
    or v_approval.status = 'pending' then
    return;
  end if;

  v_order_id := nullif(v_approval.metadata ->> 'order_id', '')::uuid;
  if v_order_id is null and v_approval.subject_type = 'order' then
    v_order_id := v_approval.subject_id;
  end if;
  if v_order_id is not null then
    select code into v_order_code from public.orders
    where id = v_order_id and company_id = v_approval.company_id;
  end if;

  v_action := case v_approval.type
    when 'order_reversal' then 'Void'
    when 'sale_refund' then 'Refund'
    when 'payment_reversal' then 'Payment reversal'
    when 'below_wholesale' then 'Price exception'
    when 'external_account_payment' then 'Direct account payment'
    when 'customer_credit' then 'Customer credit'
    else 'Approval'
  end;
  v_title := v_action || ' request ' || v_approval.status;
  v_body := concat_ws(' — ',
    case when v_order_code is not null then 'Sale ' || v_order_code else null end,
    nullif(v_approval.decision_reason, '')
  );
  v_link := case
    when v_order_id is not null then '/sales?order=' || v_order_id::text
      || '&approval=' || v_approval.id::text
    when v_approval.subject_type = 'customer' then '/customers?customer='
      || v_approval.subject_id::text || '&approval=' || v_approval.id::text
    else '/notifications'
  end;

  insert into public.notifications (company_id,user_id,type,title,body,link)
  values (v_approval.company_id,v_approval.requested_by,'approval',v_title,
    nullif(v_body,''),v_link);
end;
$$;

revoke execute on function public.notify_approval_requester(uuid)
  from authenticated, anon, public;
grant execute on function public.notify_approval_requester(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Preserve the proven posting functions as internal executors.
-- ---------------------------------------------------------------------------
alter function public.post_refund(uuid,bigint,text,text) rename to execute_refund;
revoke execute on function public.execute_refund(uuid,bigint,text,text)
  from authenticated, anon, public;
grant execute on function public.execute_refund(uuid,bigint,text,text) to service_role;

drop function public.post_payment_reversal(uuid);

-- Add reason recording while retaining the existing reversal algorithm.
create or replace function public.execute_payment_reversal(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_payment public.payments%rowtype;
  v_entry record;
  v_existing uuid;
  v_reversal_id uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_payment from public.payments
  where id = p_payment_id and company_id = v_company_id for update;
  if v_payment.id is null then raise exception 'payment_not_found: %', p_payment_id; end if;

  select id into v_existing from public.ledger_journal_entries
  where company_id = v_company_id and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';
  if v_existing is not null then
    update public.payments set status = 'cancelled'
    where id = p_payment_id and company_id = v_company_id;
    return v_existing;
  end if;
  if v_payment.status <> 'settled' then raise exception 'payment_not_settled'; end if;

  select * into v_entry from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;
  if v_entry is null then raise exception 'original_entry_not_found: %', p_payment_id; end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  v_reversal_id := public.post_reversal_entry(
    v_company_id, 'PaymentReversal', p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text || ': ' || p_reason,
    v_reversal_lines, v_entry.id
  );
  update public.payments set status = 'cancelled'
  where id = p_payment_id and company_id = v_company_id;
  return v_reversal_id;
end;
$$;

revoke execute on function public.execute_payment_reversal(uuid,text)
  from authenticated, anon, public;
grant execute on function public.execute_payment_reversal(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Public wrappers choose execute/request/blocked and return one contract.
-- ---------------------------------------------------------------------------
drop function public.void_sale(uuid,text);
create function public.void_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_status text;
  v_resource_id uuid;
  v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required';
  end if;
  select status into v_status from public.orders
  where id = p_order_id and company_id = v_company_id;
  if v_status is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_status;
  end if;

  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id := public.do_void(p_order_id, btrim(p_reason));
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'entry_id',v_resource_id,'subject_id',p_order_id);
  end if;
  v_approval_id := public.request_sale_approval(
    v_company_id, 'order_reversal', 'order', p_order_id,
    jsonb_build_object('order_id',p_order_id,'reason',btrim(p_reason))
  );
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_order_id);
end;
$$;

create function public.post_refund(
  p_order_id uuid, p_amount bigint, p_method_code text, p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_status text;
  v_collected bigint;
  v_refunded bigint;
  v_resource_id uuid;
  v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required';
  end if;

  select status into v_order_status from public.orders
  where id = p_order_id and company_id = v_company_id;
  if v_order_status is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order_status <> 'completed' then
    raise exception 'invalid_order_state: only completed sales can be refunded';
  end if;
  select coalesce(sum(amount),0)::bigint into v_collected from public.payments
  where company_id = v_company_id and order_id = p_order_id and status = 'settled';
  select coalesce(sum(amount),0)::bigint into v_refunded from public.refunds
  where company_id = v_company_id and order_id = p_order_id;
  if p_amount > v_collected - v_refunded then
    raise exception 'refund_exceeds_collected: refundable amount is %',
      greatest(v_collected-v_refunded,0);
  end if;
  if not exists (
    select 1 from public.payment_methods
    where company_id = v_company_id and code = p_method_code and enabled
  ) then raise exception 'payment_method_not_found: %', p_method_code; end if;

  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id := public.execute_refund(
      p_order_id,p_amount,p_method_code,btrim(p_reason)
    );
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_order_id);
  end if;
  v_approval_id := public.request_sale_approval(
    v_company_id, 'sale_refund', 'order', p_order_id,
    jsonb_build_object('order_id',p_order_id,'amount',p_amount,
      'method_code',p_method_code,'reason',btrim(p_reason))
  );
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_order_id);
end;
$$;

create function public.post_payment_reversal(
  p_payment_id uuid, p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_payment public.payments%rowtype;
  v_reason text := btrim(coalesce(p_reason, 'Legacy payment reversal'));
  v_resource_id uuid;
  v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required';
  end if;
  select * into v_payment from public.payments
  where id = p_payment_id and company_id = v_company_id;
  if v_payment.id is null then raise exception 'payment_not_found: %', p_payment_id; end if;

  select id into v_resource_id from public.ledger_journal_entries
  where company_id = v_company_id and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';
  if v_resource_id is not null then
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_payment_id);
  end if;
  if v_payment.status <> 'settled' then raise exception 'payment_not_settled'; end if;
  if not exists (
    select 1 from public.ledger_journal_entries
    where company_id = v_company_id
      and source_type in ('Payment','PaymentAllocation')
      and source_id = p_payment_id::text
  ) then raise exception 'original_entry_not_found: %', p_payment_id; end if;

  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id := public.execute_payment_reversal(p_payment_id,v_reason);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_payment_id);
  end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required'; end if;

  v_approval_id := public.request_sale_approval(
    v_company_id, 'payment_reversal', 'payment', p_payment_id,
    jsonb_build_object('payment_id',p_payment_id,'order_id',v_payment.order_id,
      'reason',btrim(p_reason))
  );
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_payment_id);
end;
$$;

revoke execute on function public.void_sale(uuid,text) from anon,public;
revoke execute on function public.post_refund(uuid,bigint,text,text) from anon,public;
revoke execute on function public.post_payment_reversal(uuid,text) from anon,public;
grant execute on function public.void_sale(uuid,text) to authenticated;
grant execute on function public.post_refund(uuid,bigint,text,text) to authenticated;
grant execute on function public.post_payment_reversal(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Type-aware decisions. The row lock, recheck, execution, and result update
-- share one transaction. Existing UUID return values remain compatible.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid, p_reason text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval public.approvals%rowtype;
  v_resource_id uuid;
  v_status text;
  v_payment_status text;
  v_collected bigint;
  v_refunded bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_approval from public.approvals
  where id = p_approval_id and company_id = v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;

  if v_approval.type in ('order_reversal','sale_refund','payment_reversal') then
    if not public.current_user_has_permission('ManageApprovals')
      or not public.current_user_has_permission('ReverseOrder') then
      raise exception 'permission_denied: ManageApprovals and ReverseOrder required';
    end if;
  elsif v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  if v_approval.requested_by = auth.uid() then raise exception 'self_approval_denied'; end if;
  if v_approval.status <> 'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;

  if v_approval.due_at is not null and v_approval.due_at <= now() then
    update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
      decision_reason='Approval request expired' where id=p_approval_id;
    perform public.notify_approval_requester(p_approval_id);
    return p_approval_id;
  end if;

  if v_approval.type = 'order_reversal' then
    select status into v_status from public.orders
    where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_status is distinct from 'completed' then
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Sale is no longer eligible for reversal' where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      return p_approval_id;
    end if;
    v_resource_id := public.do_void(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved reversal'));
  elsif v_approval.type = 'sale_refund' then
    select status into v_status from public.orders
    where id=v_approval.subject_id and company_id=v_company_id for update;
    select coalesce(sum(amount),0)::bigint into v_collected from public.payments
    where company_id=v_company_id and order_id=v_approval.subject_id and status='settled';
    select coalesce(sum(amount),0)::bigint into v_refunded from public.refunds
    where company_id=v_company_id and order_id=v_approval.subject_id;
    if v_status is distinct from 'completed'
      or (v_approval.metadata->>'amount')::bigint > v_collected-v_refunded
      or not exists (select 1 from public.payment_methods
        where company_id=v_company_id and code=v_approval.metadata->>'method_code' and enabled)
    then
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Refund is no longer valid' where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      return p_approval_id;
    end if;
    v_resource_id := public.execute_refund(v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,v_approval.metadata->>'method_code',
      coalesce(v_approval.metadata->>'reason','Approved refund'));
  elsif v_approval.type = 'payment_reversal' then
    select status into v_payment_status from public.payments
    where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_payment_status is distinct from 'settled'
      or exists (select 1 from public.ledger_journal_entries
        where company_id=v_company_id and source_type='PaymentReversal'
          and source_id=v_approval.subject_id::text||'-reversal')
    then
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Payment is no longer eligible for reversal' where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      return p_approval_id;
    end if;
    v_resource_id := public.execute_payment_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved payment reversal'));
  elsif v_approval.type = 'external_account_payment' then
    perform public.complete_order((v_approval.metadata->>'order_id')::uuid,
      v_approval.metadata->'tenders',auth.uid());
  end if;

  update public.approvals set status='approved',decided_by=auth.uid(),decided_at=now(),
    decision_reason=p_reason,
    result=case when v_resource_id is null then null else jsonb_build_object(
      'resource_id',v_resource_id,'subject_id',v_approval.subject_id) end
  where id=p_approval_id;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid, p_reason text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval public.approvals%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required'; end if;
  select * into v_approval from public.approvals
  where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;

  if v_approval.type in ('order_reversal','sale_refund','payment_reversal') then
    if not public.current_user_has_permission('ManageApprovals')
      or not public.current_user_has_permission('ReverseOrder') then
      raise exception 'permission_denied: ManageApprovals and ReverseOrder required';
    end if;
  elsif v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;
  if v_approval.status <> 'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;

  update public.approvals set status='denied',decided_by=auth.uid(),decided_at=now(),
    decision_reason=btrim(p_reason) where id=p_approval_id;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid,text) from anon,public;
revoke execute on function public.deny_request(uuid,text) from anon,public;
grant execute on function public.approve_request(uuid,text) to authenticated;
grant execute on function public.deny_request(uuid,text) to authenticated;
