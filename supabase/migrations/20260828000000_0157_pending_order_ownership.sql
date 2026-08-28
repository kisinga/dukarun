-- Pending payment is a shared lifecycle state, not a synonym for the cashier
-- queue. Record who owns the next action so internal posting, approvals, and
-- provider callbacks do not depend on the company's cashier-flow setting.

alter table public.orders
  add column pending_owner text,
  add column sale_request_fingerprint text;

alter table public.mpesa_payment_intents
  add column resume_order_status text,
  add column resume_order_pending_owner text,
  add column resume_cashier_pending_at timestamptz;

update public.orders o
set pending_owner = case
      when exists (
        select 1
        from public.mpesa_payment_intents i
        where i.company_id = o.company_id
          and i.subject_type = 'order'
          and i.subject_id = o.id
          and i.status not in ('completed', 'cancelled', 'expired', 'failed')
      ) then 'payment_provider'
      when exists (
        select 1
        from public.approvals a
        where a.company_id = o.company_id
          and a.status = 'pending'
          and a.type in ('external_account_payment', 'overdraft')
          and coalesce(a.subject_id, nullif(a.metadata ->> 'order_id', '')::uuid) = o.id
      ) then 'approval'
      else 'cashier'
    end,
    cashier_pending_at = case
      when exists (
        select 1
        from public.mpesa_payment_intents i
        where i.company_id = o.company_id
          and i.subject_type = 'order'
          and i.subject_id = o.id
          and i.status not in ('completed', 'cancelled', 'expired', 'failed')
      ) or exists (
        select 1
        from public.approvals a
        where a.company_id = o.company_id
          and a.status = 'pending'
          and a.type in ('external_account_payment', 'overdraft')
          and coalesce(a.subject_id, nullif(a.metadata ->> 'order_id', '')::uuid) = o.id
      ) then null
      else coalesce(o.cashier_pending_at, o.updated_at, o.created_at, now())
    end
where o.status = 'pending_payment';

update public.orders
set pending_owner = null,
    cashier_pending_at = null
where status <> 'pending_payment'
  and (pending_owner is not null or cashier_pending_at is not null);

-- Updating orders queues the deferred account-consistency trigger. PostgreSQL
-- will not alter the table while those events are pending, so run them before
-- adding and validating the ownership constraints.
set constraints public.orders_account_consistency immediate;

alter table public.orders
  add constraint orders_pending_owner_check
    check (pending_owner is null or pending_owner in ('cashier', 'approval', 'payment_provider'))
    not valid,
  add constraint orders_pending_state_owner_check
    check ((status = 'pending_payment') = (pending_owner is not null))
    not valid,
  add constraint orders_cashier_pending_projection_check
    check (coalesce(pending_owner = 'cashier', false) = (cashier_pending_at is not null))
    not valid;

alter table public.mpesa_payment_intents
  add constraint mpesa_intents_resume_order_status_check
    check (resume_order_status is null or resume_order_status in ('draft', 'pending_payment'))
    not valid,
  add constraint mpesa_intents_resume_order_owner_check
    check (
      resume_order_pending_owner is null
      or resume_order_pending_owner in ('cashier', 'approval', 'payment_provider')
    ) not valid;

alter table public.orders
  validate constraint orders_pending_owner_check,
  validate constraint orders_pending_state_owner_check,
  validate constraint orders_cashier_pending_projection_check;

alter table public.mpesa_payment_intents
  validate constraint mpesa_intents_resume_order_status_check,
  validate constraint mpesa_intents_resume_order_owner_check;

create index orders_company_pending_owner_idx
  on public.orders(company_id, pending_owner, updated_at desc)
  where status = 'pending_payment';

-- Normalize the projection fields and prevent the wrong workflow from
-- completing a held order.
create or replace function public.normalize_order_pending_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.status = 'pending_payment'
    and new.status = 'completed' then
    if old.pending_owner = 'cashier'
      and new.posting_source is distinct from 'interactive' then
      raise exception 'invalid_order_completion_owner: cashier';
    elsif old.pending_owner = 'approval'
      and new.posting_source is distinct from 'approval'
      and coalesce(current_setting('app.external_payment_hold', true), '') <> 'on' then
      raise exception 'invalid_order_completion_owner: approval';
    elsif old.pending_owner = 'payment_provider'
      and coalesce(new.posting_source, '') not in ('mpesa_provider', 'mpesa_reconciliation') then
      raise exception 'invalid_order_completion_owner: payment_provider';
    end if;
  end if;

  if new.status <> 'pending_payment' then
    new.pending_owner := null;
    new.cashier_pending_at := null;
  elsif new.pending_owner is null then
    raise exception 'pending_owner_required';
  elsif new.pending_owner = 'cashier' then
    new.cashier_pending_at := coalesce(new.cashier_pending_at, now());
  else
    new.cashier_pending_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.normalize_order_pending_owner()
  from public, anon, authenticated;
grant execute on function public.normalize_order_pending_owner() to service_role;

drop trigger if exists orders_01_normalize_pending_owner on public.orders;
create trigger orders_01_normalize_pending_owner
before insert or update of status, pending_owner, cashier_pending_at, posting_source
on public.orders
for each row execute function public.normalize_order_pending_owner();

create or replace function public.enforce_order_cashier_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
    and new.pending_owner = 'cashier'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'pending_payment'
      or old.pending_owner is distinct from 'cashier'
    )
    and not coalesce((
      select c.cashier_flow_enabled
      from public.companies c
      where c.id = new.company_id
    ), false) then
    raise exception 'cashier_flow_disabled: take payment and complete this sale directly';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_cashier_flow on public.orders;
create trigger orders_enforce_cashier_flow
before insert or update of status, pending_owner on public.orders
for each row execute function public.enforce_order_cashier_flow();

-- Create the server-priced order without choosing its next workflow. This is
-- the common primitive for direct, offline, approval, and provider checkouts.
create or replace function public.prepare_sale_order_core(
  p_customer_id uuid,
  p_lines jsonb,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_client_ref text := nullif(btrim(p_client_ref), '');
  v_order_id uuid;
  v_existing public.orders%rowtype;
  v_fingerprint text;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'location_id', nullif(current_setting('app.business_location_id', true), '')::uuid,
    'customer_id', p_customer_id,
    'lines', coalesce(p_lines, '[]'::jsonb),
    'draft_id', p_draft_id
  )::text, 'sha256'), 'hex');

  if v_client_ref is not null then
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.id is not null then
      if v_existing.sale_request_fingerprint is not null
        and v_existing.sale_request_fingerprint <> v_fingerprint then
        raise exception 'idempotency_conflict: client_ref reused with different sale payload';
      end if;
      return v_existing.id;
    end if;
  end if;

  if p_draft_id is not null and not exists (
    select 1
    from public.orders o
    where o.id = p_draft_id
      and o.company_id = v_company_id
      and o.status = 'draft'
  ) then
    raise exception 'draft_not_found: %', p_draft_id;
  end if;

  perform set_config('app.cache_change_suppressed', 'on', true);
  v_order_id := public.save_draft(p_customer_id, p_lines);

  begin
    update public.orders
    set client_ref = v_client_ref,
        sale_request_fingerprint = v_fingerprint
    where id = v_order_id;
  exception when unique_violation then
    delete from public.orders where id = v_order_id;
    select * into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing.sale_request_fingerprint is not null
      and v_existing.sale_request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_conflict: client_ref reused with different sale payload';
    end if;
    perform set_config(
      'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
    );
    return v_existing.id;
  end;

  if p_draft_id is not null then
    delete from public.approvals
    where company_id = v_company_id
      and type = 'below_wholesale'
      and metadata ->> 'order_id' = p_draft_id::text;
    delete from public.orders
    where id = p_draft_id
      and company_id = v_company_id
      and status in ('draft', 'expired');
  end if;

  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  return v_order_id;
end;
$$;

revoke execute on function public.prepare_sale_order_core(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_sale_order_core(uuid, jsonb, text, uuid)
  to service_role;

create or replace function public.hold_sale_order_core(p_order_id uuid, p_owner text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
  v_changed boolean := false;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_owner is null or p_owner not in ('cashier', 'approval', 'payment_provider') then
    raise exception 'invalid_pending_owner: %', p_owner;
  end if;
  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;
  if v_order.id is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status = 'completed' then return v_order.id; end if;
  if v_order.status = 'pending_payment' and v_order.pending_owner = p_owner then
    return v_order.id;
  end if;
  if v_order.status <> 'draft'
    and not (
      v_order.status = 'pending_payment'
      and v_order.pending_owner = 'cashier'
      and p_owner = 'payment_provider'
    ) then
    raise exception 'invalid_order_state: % is %/%',
      p_order_id, v_order.status, coalesce(v_order.pending_owner, 'unowned');
  end if;

  update public.orders
  set status = 'pending_payment',
      pending_owner = p_owner,
      cashier_pending_at = case when p_owner = 'cashier' then now() else null end,
      updated_at = now()
  where id = p_order_id;
  v_changed := found;

  if v_changed then
    perform public.emit_cache_batch(v_company_id, 'sales', jsonb_build_array(
      jsonb_build_object(
        'entityType', 'order', 'entityId', p_order_id, 'operation', 'upsert',
        'locationId', v_order.location_id
      )
    ));
  end if;
  return p_order_id;
end;
$$;

revoke execute on function public.hold_sale_order_core(uuid, text)
  from public, anon, authenticated;
grant execute on function public.hold_sale_order_core(uuid, text) to service_role;

-- Compatibility wrapper: p_park remains an explicit cashier handoff. The
-- legacy approval GUC is translated to an approval owner while older callers
-- are moved to prepare_sale_order_core.
create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_client_ref text := nullif(btrim(p_client_ref), '');
  v_order_id uuid;
  v_existing uuid;
  v_owner text;
begin
  if v_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = v_client_ref;
    if v_existing is not null then
      perform public.prepare_sale_order_core(
        p_customer_id, p_lines, v_client_ref, p_draft_id
      );
      return v_existing;
    end if;
  end if;

  v_order_id := public.prepare_sale_order_core(
    p_customer_id, p_lines, v_client_ref, p_draft_id
  );
  if p_park then
    v_owner := case
      when coalesce(current_setting('app.external_payment_hold', true), '') = 'on'
        then 'approval'
      else 'cashier'
    end;
    return public.hold_sale_order_core(v_order_id, v_owner);
  end if;
  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text, uuid)
  from public, anon;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text, uuid)
  to authenticated;

-- Only cashier-owned work may use the generic cashier settlement command.
create or replace function public.settle_order(
  p_order_id uuid,
  p_payments jsonb,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;
  if v_order.id is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status = 'completed' then return v_order.id; end if;
  if v_order.status <> 'pending_payment' or v_order.pending_owner <> 'cashier' then
    raise exception 'order_not_owned_by_cashier: %',
      coalesce(v_order.pending_owner, v_order.status);
  end if;
  if exists (
    select 1
    from public.approvals a
    where a.company_id = v_company_id
      and a.status = 'pending'
      and a.type in ('external_account_payment', 'overdraft')
      and coalesce(a.subject_id, nullif(a.metadata ->> 'order_id', '')::uuid) = p_order_id
  ) then
    raise exception 'approval_pending: order % is held for approval', p_order_id;
  end if;
  if p_client_ref is not null then
    begin
      update public.orders set client_ref = p_client_ref
      where id = p_order_id and company_id = v_company_id and client_ref is null;
    exception when unique_violation then
      raise exception 'client_ref_in_use: %', p_client_ref;
    end;
    if not found and v_order.client_ref = p_client_ref then return p_order_id; end if;
  end if;
  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.settle_order(uuid, jsonb, text) from public, anon;
grant execute on function public.settle_order(uuid, jsonb, text) to authenticated;

-- Mixed settlement creates a draft first. It becomes approval-owned only when
-- an approval is actually required; otherwise it completes directly.
create or replace function public.complete_order_with_prepayment(
  p_order_id uuid,
  p_payments jsonb,
  p_deposit_amount bigint,
  p_credit_amount bigint,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context public.posting_context;
  v_source text := 'interactive';
  v_result uuid;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if nullif(current_setting('app.approved_prepayment_order_id', true), '')::uuid = p_order_id then
    v_source := 'approval';
  elsif not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  perform set_config('app.cache_change_suppressed', 'on', true);
  v_context := public.order_posting_context(p_order_id, v_source);
  v_result := public.complete_order_with_prepayment_core(
    p_order_id, p_payments, p_deposit_amount, p_credit_amount, p_client_ref, v_context
  );
  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  perform public.emit_sale_cache_batches(v_result);
  return v_result;
end;
$$;

revoke execute on function public.complete_order_with_prepayment(
  uuid, jsonb, bigint, bigint, text
) from public, anon, authenticated;
grant execute on function public.complete_order_with_prepayment(
  uuid, jsonb, bigint, bigint, text
) to service_role;

create or replace function public.post_sale_with_prepayment_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_deposit_amount bigint,
  p_credit_amount bigint,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_payment jsonb;
  v_tender_total bigint := 0;
  v_amount bigint;
  v_external_tenders jsonb;
  v_external_approval_id uuid;
  v_overdraft_approval_id uuid;
  v_ar_balance bigint;
  v_metadata jsonb;
  v_overdraft_metadata jsonb;
  v_needs_external boolean;
  v_needs_overdraft boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if p_customer_id is null then
    raise exception 'identified_customer_required_for_mixed_settlement';
  end if;
  if coalesce(p_deposit_amount, 0) < 0 or coalesce(p_credit_amount, 0) < 0 then
    raise exception 'invalid_settlement_amount';
  end if;
  v_location_id := public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_order_id := public.prepare_sale_order_core(
    p_customer_id, p_lines, p_client_ref, p_draft_id
  );
  select * into v_order
  from public.orders
  where id = v_order_id and company_id = v_company_id
  for update;
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
    );
  end if;
  if v_order.status not in ('draft', 'pending_payment')
    or (v_order.status = 'pending_payment' and v_order.pending_owner <> 'approval') then
    raise exception 'invalid_order_state: % is %/%',
      v_order_id, v_order.status, coalesce(v_order.pending_owner, 'unowned');
  end if;

  for v_payment in
    select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  loop
    if v_payment ->> 'method' = 'credit' then raise exception 'credit_is_not_a_tender'; end if;
    v_amount := coalesce((v_payment ->> 'amount')::bigint, 0);
    if v_amount <= 0 then raise exception 'invalid_tender_amount'; end if;
    v_tender_total := v_tender_total + v_amount;
    perform public.prepayment_tender_account(
      v_location_id, v_payment ->> 'method', v_payment ->> 'reference'
    );
  end loop;
  if v_tender_total + coalesce(p_deposit_amount, 0) + coalesce(p_credit_amount, 0)
    <> v_order.total then
    raise exception 'payment_mismatch: tender % + deposit % + credit % <> order total %',
      v_tender_total, p_deposit_amount, p_credit_amount, v_order.total;
  end if;
  if coalesce(p_deposit_amount, 0) > public.customer_deposit_available(p_customer_id) then
    raise exception 'insufficient_customer_deposit';
  end if;
  select * into v_customer
  from public.customers
  where id = p_customer_id
    and company_id = v_company_id
    and not is_supplier
    and deleted_at is null
  for update;
  if v_customer.id is null then raise exception 'customer_not_found'; end if;
  if coalesce(p_credit_amount, 0) > 0 and not v_customer.is_credit_approved then
    raise exception 'credit_not_approved: customer %', p_customer_id;
  end if;

  select jsonb_agg(t.value) into v_external_tenders
  from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) t(value)
  join public.available_payment_methods(v_location_id) m
    on m.code = t.value ->> 'method'
  where not m.is_cashier_controlled;
  v_needs_external := v_external_tenders is not null
    and not public.current_user_has_permission('ViewFinancials');

  select coalesce(sum(l.debit) - sum(l.credit), 0)::bigint into v_ar_balance
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.meta ->> 'customerId' = p_customer_id::text;
  v_needs_overdraft := coalesce(p_credit_amount, 0) > 0
    and v_customer.credit_limit > 0
    and v_ar_balance + p_credit_amount > v_customer.credit_limit
    and not public.current_user_has_permission('ApproveCustomerCredit');

  v_metadata := jsonb_build_object(
    'order_id', v_order_id,
    'tenders', coalesce(p_payments, '[]'::jsonb),
    'prepayment_settlement', true,
    'deposit_amount', coalesce(p_deposit_amount, 0),
    'credit_amount', coalesce(p_credit_amount, 0),
    'client_ref', p_client_ref
  );
  if v_needs_external then
    insert into public.approvals(
      company_id, type, subject_type, subject_id, metadata, requested_by
    ) values(
      v_company_id, 'external_account_payment', 'order', v_order_id, v_metadata, auth.uid()
    )
    on conflict(company_id, type, subject_id)
      where status = 'pending' and subject_id is not null
    do nothing
    returning id into v_external_approval_id;
    if v_external_approval_id is null then
      select id into v_external_approval_id
      from public.approvals
      where company_id = v_company_id
        and type = 'external_account_payment'
        and subject_id = v_order_id
        and status = 'pending';
    end if;
  end if;
  if v_needs_overdraft then
    v_overdraft_metadata := v_metadata || jsonb_build_object(
      'customer_id', p_customer_id,
      'ar_balance', v_ar_balance,
      'order_total', v_order.total,
      'credit_amount', p_credit_amount,
      'credit_limit', v_customer.credit_limit,
      'projected_balance', v_ar_balance + p_credit_amount,
      'reason', 'Residual credit exceeds customer limit'
    );
    insert into public.approvals(
      company_id, type, subject_type, subject_id, metadata, requested_by
    ) values(
      v_company_id, 'overdraft', 'order', v_order_id, v_overdraft_metadata, auth.uid()
    )
    on conflict(company_id, type, subject_id)
      where status = 'pending' and subject_id is not null
    do nothing
    returning id into v_overdraft_approval_id;
    if v_overdraft_approval_id is null then
      select id into v_overdraft_approval_id
      from public.approvals
      where company_id = v_company_id
        and type = 'overdraft'
        and subject_id = v_order_id
        and status = 'pending';
    end if;
  end if;

  if v_needs_external or v_needs_overdraft then
    perform public.hold_sale_order_core(v_order_id, 'approval');
    return jsonb_build_object(
      'status', 'approval_required',
      'approval_id', coalesce(v_external_approval_id, v_overdraft_approval_id),
      'approval_ids', to_jsonb(array_remove(
        array[v_external_approval_id, v_overdraft_approval_id], null
      )),
      'order_id', v_order_id,
      'subject_id', v_order_id
    );
  end if;
  if v_order.status <> 'draft'
    and not (
      v_order.status = 'pending_payment'
      and v_order.pending_owner = 'approval'
      and coalesce(current_setting('app.external_payment_hold', true), '') = 'on'
      and not exists (
        select 1
        from public.approvals a
        where a.company_id = v_company_id
          and a.subject_id = v_order_id
          and a.status = 'pending'
          and a.type in ('external_account_payment', 'overdraft')
      )
    ) then
    raise exception 'approval_pending: order % is held for approval', v_order_id;
  end if;
  perform public.complete_order_with_prepayment(
    v_order_id, p_payments, coalesce(p_deposit_amount, 0),
    coalesce(p_credit_amount, 0), p_client_ref
  );
  return jsonb_build_object(
    'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
  );
end;
$$;

revoke execute on function public.post_sale_with_prepayment_at_location(
  uuid, uuid, jsonb, jsonb, bigint, bigint, text, uuid
) from public, anon;
grant execute on function public.post_sale_with_prepayment_at_location(
  uuid, uuid, jsonb, jsonb, bigint, bigint, text, uuid
) to authenticated;

-- Offline replay prepares and completes in one posting path. It never enters
-- the cashier queue, so cashier_flow_enabled has no bearing on synchronization.
create or replace function public.post_offline_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_client_ref text,
  p_occurred_at timestamptz,
  p_device_key text,
  p_pending_count integer default 1,
  p_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock_end date;
  v_timezone text;
  v_tax_date date;
  v_review_id uuid;
  v_device_id uuid;
  v_period_id uuid;
  v_payload jsonb;
  v_existing public.late_sale_reviews%rowtype;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_session_id uuid;
  v_context public.posting_context;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_occurred_at is null or btrim(coalesce(p_client_ref, '')) = '' then
    raise exception 'invalid_offline_sale';
  end if;
  v_device_id := public.pos_device_heartbeat(
    p_device_key, p_location_id, greatest(coalesce(p_pending_count, 1), 1), false
  );
  select c.business_timezone into v_timezone
  from public.companies c
  where c.id = v_company_id;
  v_tax_date := (p_occurred_at at time zone v_timezone)::date;
  select pl.lock_end_date into v_lock_end
  from public.period_locks pl
  where pl.company_id = v_company_id;

  if v_lock_end is not null and v_tax_date <= v_lock_end then
    v_payload := jsonb_build_object(
      'customer_id', p_customer_id,
      'lines', p_lines,
      'payments', p_payments,
      'draft_id', p_draft_id
    );
    perform pg_advisory_xact_lock(hashtextextended(
      'late-sale:' || v_company_id::text || ':' || btrim(p_client_ref), 0
    ));
    select l.* into v_existing
    from public.late_sale_reviews l
    where l.company_id = v_company_id and l.client_ref = btrim(p_client_ref)
    for update;
    if v_existing.id is not null then
      if v_existing.location_id is distinct from p_location_id
        or v_existing.occurred_at is distinct from p_occurred_at
        or v_existing.payload is distinct from v_payload then
        raise exception 'idempotency_conflict: client_ref reused with different late-sale payload';
      end if;
      return case v_existing.status
        when 'approved' then jsonb_build_object(
          'status', 'completed', 'review_id', v_existing.id,
          'order_id', v_existing.posted_order_id, 'subject_id', v_existing.posted_order_id
        )
        when 'rejected' then jsonb_build_object(
          'status', 'rejected', 'review_id', v_existing.id, 'subject_id', v_existing.id
        )
        else jsonb_build_object(
          'status', 'late_review_required', 'review_id', v_existing.id,
          'subject_id', v_existing.id
        )
      end;
    end if;
    select ap.id into v_period_id
    from public.accounting_periods ap
    where ap.company_id = v_company_id
      and ap.status = 'closed'
      and v_tax_date between ap.start_date and ap.end_date
    order by ap.end_date desc
    limit 1;
    insert into public.late_sale_reviews(
      company_id, device_id, location_id, client_ref, occurred_at,
      original_period_id, payload
    ) values(
      v_company_id, v_device_id, p_location_id, btrim(p_client_ref), p_occurred_at,
      v_period_id, v_payload
    ) returning id into v_review_id;
    return jsonb_build_object(
      'status', 'late_review_required', 'review_id', v_review_id, 'subject_id', v_review_id
    );
  end if;

  perform set_config('app.business_location_id', p_location_id::text, true);
  v_session_id := public.require_open_cashier_session_at_location(
    v_company_id, p_location_id
  );
  v_order_id := public.prepare_sale_order_core(
    p_customer_id, p_lines, btrim(p_client_ref), p_draft_id
  );
  select * into v_order
  from public.orders
  where id = v_order_id and company_id = v_company_id
  for update;
  if v_order.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
    );
  end if;
  if v_order.status <> 'draft' then
    raise exception 'invalid_order_state: offline replay found %/%',
      v_order.status, coalesce(v_order.pending_owner, 'unowned');
  end if;
  v_context := row(
    v_company_id, p_location_id, auth.uid(), v_session_id, p_occurred_at,
    v_tax_date, 'offline', null
  )::public.posting_context;
  perform set_config('app.cache_change_suppressed', 'on', true);
  perform public.complete_order_core(v_order_id, p_payments, v_context);
  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  perform public.emit_sale_cache_batches(v_order_id);
  perform public.pos_device_heartbeat(
    p_device_key, p_location_id, greatest(coalesce(p_pending_count, 1) - 1, 0), true
  );
  return jsonb_build_object(
    'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id
  );
end;
$$;

create or replace function public.review_late_sale(
  p_review_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_review public.late_sale_reviews%rowtype;
  v_timezone text;
  v_entry_date date;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_session_id uuid;
  v_context public.posting_context;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageApprovals')
    or not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ManageApprovals and SettleOrder required';
  end if;
  select * into v_review
  from public.late_sale_reviews
  where id = p_review_id and company_id = v_company_id
  for update;
  if v_review.id is null then raise exception 'late_sale_not_found'; end if;
  if v_review.status <> 'pending' then raise exception 'late_sale_already_reviewed'; end if;
  if not p_approve then
    if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required'; end if;
    update public.late_sale_reviews
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_reason = btrim(p_reason)
    where id = p_review_id;
    return jsonb_build_object('status', 'rejected', 'review_id', p_review_id);
  end if;

  select c.business_timezone into v_timezone
  from public.companies c
  where c.id = v_company_id;
  v_entry_date := (now() at time zone v_timezone)::date;
  perform set_config('app.business_location_id', v_review.location_id::text, true);
  v_session_id := public.require_open_cashier_session_at_location(
    v_company_id, v_review.location_id
  );
  v_order_id := public.prepare_sale_order_core(
    nullif(v_review.payload ->> 'customer_id', '')::uuid,
    v_review.payload -> 'lines',
    v_review.client_ref,
    nullif(v_review.payload ->> 'draft_id', '')::uuid
  );
  select * into v_order
  from public.orders
  where id = v_order_id and company_id = v_company_id
  for update;
  if v_order.status <> 'draft' then
    raise exception 'invalid_order_state: late replay found %/%',
      v_order.status, coalesce(v_order.pending_owner, 'unowned');
  end if;
  v_context := row(
    v_company_id, v_review.location_id, auth.uid(), v_session_id,
    v_review.occurred_at, v_entry_date, 'offline_review', 'closed_period_offline_sale'
  )::public.posting_context;
  perform set_config('app.cache_change_suppressed', 'on', true);
  perform public.complete_order_core(v_order_id, v_review.payload -> 'payments', v_context);
  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  perform public.emit_sale_cache_batches(v_order_id);
  update public.late_sale_reviews
  set status = 'approved',
      posted_order_id = v_order_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_review_id;
  return jsonb_build_object(
    'status', 'completed', 'order_id', v_order_id, 'subject_id', v_order_id,
    'late_review_id', p_review_id
  );
end;
$$;

-- A failed or expired provider request returns the order to the state from
-- which checkout started. Successful completion has already moved the order
-- out of pending_payment, so this trigger becomes a no-op in that case.
create or replace function public.release_terminal_mpesa_order_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_owner text;
  v_cashier_pending_at timestamptz;
begin
  if new.subject_type <> 'order'
    or new.status not in ('cancelled', 'expired', 'failed')
    or old.status in ('cancelled', 'expired', 'failed') then
    return new;
  end if;
  if exists (
    select 1
    from public.mpesa_payment_intents i
    where i.company_id = new.company_id
      and i.subject_type = 'order'
      and i.subject_id = new.subject_id
      and i.id <> new.id
      and i.status not in ('completed', 'cancelled', 'expired', 'failed')
  ) then
    return new;
  end if;

  v_status := coalesce(new.resume_order_status, 'draft');
  v_owner := new.resume_order_pending_owner;
  v_cashier_pending_at := new.resume_cashier_pending_at;
  if v_status = 'pending_payment' and v_owner = 'cashier'
    and not coalesce((
      select c.cashier_flow_enabled
      from public.companies c
      where c.id = new.company_id
    ), false) then
    v_status := 'draft';
    v_owner := null;
    v_cashier_pending_at := null;
  elsif v_status <> 'pending_payment' or v_owner is null then
    v_status := 'draft';
    v_owner := null;
    v_cashier_pending_at := null;
  elsif v_owner = 'cashier' then
    v_cashier_pending_at := coalesce(v_cashier_pending_at, now());
  else
    v_cashier_pending_at := null;
  end if;

  update public.orders
  set status = v_status,
      pending_owner = v_owner,
      cashier_pending_at = v_cashier_pending_at,
      updated_at = now()
  where id = new.subject_id
    and company_id = new.company_id
    and status = 'pending_payment'
    and pending_owner = 'payment_provider';
  return new;
end;
$$;

create or replace function public.reacquire_retried_mpesa_order_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if new.subject_type <> 'order'
    or old.status not in ('cancelled', 'expired', 'failed')
    or new.status <> 'requesting' then
    return new;
  end if;
  select * into v_order
  from public.orders
  where id = new.subject_id and company_id = new.company_id
  for update;
  if v_order.id is null or v_order.status not in ('draft', 'pending_payment') then
    raise exception 'order_not_payable';
  end if;
  if v_order.status = 'pending_payment' and v_order.pending_owner <> 'cashier' then
    raise exception 'order_not_payable: owned by %', v_order.pending_owner;
  end if;
  new.resume_order_status := v_order.status;
  new.resume_order_pending_owner := v_order.pending_owner;
  new.resume_cashier_pending_at := v_order.cashier_pending_at;
  update public.orders
  set status = 'pending_payment',
      pending_owner = 'payment_provider',
      cashier_pending_at = null,
      updated_at = now()
  where id = v_order.id;
  return new;
end;
$$;

revoke execute on function public.reacquire_retried_mpesa_order_hold()
  from public, anon, authenticated;
grant execute on function public.reacquire_retried_mpesa_order_hold() to service_role;

drop trigger if exists mpesa_intents_00_reacquire_order_hold
  on public.mpesa_payment_intents;
create trigger mpesa_intents_00_reacquire_order_hold
before update of status on public.mpesa_payment_intents
for each row execute function public.reacquire_retried_mpesa_order_hold();

revoke execute on function public.release_terminal_mpesa_order_hold()
  from public, anon, authenticated;
grant execute on function public.release_terminal_mpesa_order_hold() to service_role;

drop trigger if exists mpesa_intents_release_terminal_order_hold
  on public.mpesa_payment_intents;
create trigger mpesa_intents_release_terminal_order_hold
after update of status on public.mpesa_payment_intents
for each row execute function public.release_terminal_mpesa_order_hold();

create or replace function public.create_mpesa_payment_intent(
  p_workflow text,
  p_location_id uuid,
  p_phone text,
  p_amount bigint,
  p_cash_amount bigint,
  p_client_ref text,
  p_customer_id uuid default null,
  p_lines jsonb default null,
  p_order_id uuid default null,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
  v_account_id uuid;
  v_subject_id uuid;
  v_intent_id uuid;
  v_order public.orders%rowtype;
  v_receipt_id uuid;
  v_session_id uuid;
  v_fingerprint text;
  v_existing record;
  v_resume_status text;
  v_resume_owner text;
  v_resume_cashier_pending_at timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if p_workflow not in ('sale', 'order', 'customer_receipt') then
    raise exception 'invalid_mpesa_workflow';
  end if;
  if p_amount <= 0 or coalesce(p_cash_amount, 0) < 0 then
    raise exception 'invalid_payment_amount';
  end if;
  if p_workflow = 'customer_receipt' and coalesce(p_cash_amount, 0) <> 0 then
    raise exception 'customer_receipt_split_not_supported';
  end if;
  if p_phone is not null and btrim(p_phone) !~ '^254[17][0-9]{8}$' then
    raise exception 'invalid_mpesa_phone';
  end if;
  if btrim(coalesce(p_client_ref, '')) = '' then raise exception 'client_ref_required'; end if;

  v_location_id := public.resolve_business_location(p_location_id);
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text || ':mpesa-client:' || btrim(p_client_ref), 0
  ));
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'workflow', p_workflow,
    'location', v_location_id,
    'phone', p_phone,
    'amount', p_amount,
    'cash_amount', coalesce(p_cash_amount, 0),
    'customer', p_customer_id,
    'lines', p_lines,
    'order', p_order_id,
    'draft', p_draft_id
  )::text, 'sha256'), 'hex');
  select id, request_fingerprint into v_existing
  from public.mpesa_payment_intents
  where company_id = v_company_id and client_ref = btrim(p_client_ref);
  if v_existing.id is not null then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_conflict';
    end if;
    return v_existing.id;
  end if;

  v_account_id := public.active_mpesa_provider_account_at_location(
    v_company_id, v_location_id
  );
  if v_account_id is null then raise exception 'mpesa_not_available_at_location'; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_session_id := public.require_open_cashier_session_at_location(
    v_company_id, v_location_id
  );

  if p_workflow = 'sale' then
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'sale_lines_required';
    end if;
    v_subject_id := public.prepare_sale_order_core(
      p_customer_id, p_lines, btrim(p_client_ref) || ':order', p_draft_id
    );
    select * into v_order
    from public.orders
    where id = v_subject_id and company_id = v_company_id
    for update;
  elsif p_workflow = 'order' then
    select * into v_order
    from public.orders
    where id = p_order_id and company_id = v_company_id
    for update;
    if v_order.id is null then raise exception 'order_not_found'; end if;
    if v_order.location_id <> v_location_id then raise exception 'order_location_mismatch'; end if;
    if v_order.status not in ('draft', 'pending_payment') then
      raise exception 'order_not_payable';
    end if;
    v_subject_id := v_order.id;
  else
    if not exists (
      select 1 from public.customers
      where id = p_customer_id and company_id = v_company_id
    ) then
      raise exception 'customer_not_found';
    end if;
    v_receipt_id := gen_random_uuid();
    v_subject_id := v_receipt_id;
    insert into public.customer_receipts(
      id, company_id, customer_id, amount, method_code, location_id,
      cashier_session_id, client_ref, request_fingerprint, status, created_by
    ) values(
      v_receipt_id, v_company_id, p_customer_id, p_amount, 'mpesa', v_location_id,
      v_session_id, btrim(p_client_ref) || ':receipt', v_fingerprint,
      'pending_approval', auth.uid()
    );
  end if;

  if p_workflow in ('sale', 'order') then
    if v_order.id is null
      or v_order.total <> p_amount + coalesce(p_cash_amount, 0) then
      raise exception 'payment_mismatch';
    end if;
    if v_order.status not in ('draft', 'pending_payment') then
      raise exception 'order_not_payable';
    end if;
    if v_order.status = 'pending_payment'
      and v_order.pending_owner not in ('cashier', 'payment_provider') then
      raise exception 'order_not_payable: owned by %', v_order.pending_owner;
    end if;
    if exists (
      select 1
      from public.approvals a
      where a.company_id = v_company_id
        and a.subject_id = v_order.id
        and a.status = 'pending'
        and a.type = 'below_wholesale'
    ) then
      raise exception 'approval_conflict: resolve the price exception before requesting payment';
    end if;
    if exists (
      select 1
      from public.mpesa_payment_intents i
      where i.company_id = v_company_id
        and i.subject_type = 'order'
        and i.subject_id = v_order.id
        and i.status not in ('completed', 'cancelled', 'expired', 'failed')
    ) then
      raise exception 'mpesa_payment_already_in_progress';
    end if;
    v_resume_status := v_order.status;
    v_resume_owner := v_order.pending_owner;
    v_resume_cashier_pending_at := v_order.cashier_pending_at;
    perform public.hold_sale_order_core(v_order.id, 'payment_provider');
    if v_session_id is not null then
      if v_order.cashier_session_id is not null
        and v_order.cashier_session_id <> v_session_id then
        raise exception 'cashier_session_mismatch';
      end if;
      update public.orders
      set cashier_session_id = v_session_id, updated_at = now()
      where id = v_order.id and cashier_session_id is null;
    end if;
  end if;

  insert into public.mpesa_payment_intents(
    company_id, provider_account_id, location_id, workflow, subject_type, subject_id,
    client_ref, request_fingerprint, payer_phone, amount, cash_amount,
    initiating_cashier_session_id, created_by, created_by_role,
    resume_order_status, resume_order_pending_owner, resume_cashier_pending_at
  ) values(
    v_company_id, v_account_id, v_location_id, p_workflow,
    case when p_workflow = 'customer_receipt' then 'customer_receipt' else 'order' end,
    v_subject_id, btrim(p_client_ref), v_fingerprint, btrim(p_phone), p_amount,
    coalesce(p_cash_amount, 0), v_session_id, auth.uid(), auth.jwt() ->> 'user_role',
    v_resume_status, v_resume_owner, v_resume_cashier_pending_at
  ) returning id into v_intent_id;
  return v_intent_id;
end;
$$;

revoke execute on function public.create_mpesa_payment_intent(
  text, uuid, text, bigint, bigint, text, uuid, jsonb, uuid, uuid
) from public, anon;
grant execute on function public.create_mpesa_payment_intent(
  text, uuid, text, bigint, bigint, text, uuid, jsonb, uuid, uuid
) to authenticated;
