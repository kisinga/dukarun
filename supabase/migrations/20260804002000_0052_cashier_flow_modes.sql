-- Cashier workflow and till control are independent company choices.
-- Workflow controls whether orders may be handed to a cashier queue.
-- Cash control controls whether money-moving actions require an open till.

create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_location_id uuid := nullif(current_setting('app.business_location_id', true), '')::uuid;
  v_cash_control_enabled boolean;
begin
  select c.cash_control_enabled into v_cash_control_enabled
  from public.companies c
  where c.id = p_company_id;

  if not coalesce(v_cash_control_enabled, false) then
    return null;
  end if;

  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = p_company_id
    and s.status = 'open'
    and (v_location_id is null or s.location_id = v_location_id)
  limit 1
  for key share;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  return v_session_id;
end;
$$;

create or replace function public.tag_journal_line_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text;
  v_session_id uuid;
  v_requires_session boolean;
begin
  select e.source_type into v_source_type
  from public.ledger_journal_entries e
  where e.id = new.entry_id and e.company_id = new.company_id;

  if v_source_type is null then
    raise exception 'journal_entry_not_found: %', new.entry_id;
  end if;

  v_requires_session := public.cashier_session_required_for_source(v_source_type)
    or (
      v_source_type = 'InventoryPurchase'
      and new.meta ? 'isCreditPurchase'
      and (new.meta ->> 'isCreditPurchase')::boolean is false
    );

  if v_requires_session then
    v_session_id := public.require_open_cashier_session(new.company_id);
    if v_session_id is not null then
      new.meta := coalesce(new.meta, '{}'::jsonb)
        || jsonb_build_object('openSessionId', v_session_id);

      if v_source_type = 'InventoryPurchase'
         and new.meta ? 'isCreditPurchase'
         and (new.meta ->> 'isCreditPurchase')::boolean is false then
        update public.ledger_journal_lines
        set meta = meta || jsonb_build_object('openSessionId', v_session_id)
        where entry_id = new.entry_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    perform set_config('app.business_location_id', new.location_id::text, true);
    v_session_id := public.require_open_cashier_session(new.company_id);

    if v_session_id is null then
      new.cashier_session_id := null;
    else
      if new.cashier_session_id is not null and new.cashier_session_id <> v_session_id then
        raise exception 'cashier_session_mismatch: completed order must use the open session';
      end if;
      new.cashier_session_id := v_session_id;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_order_cashier_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_payment')
     and not coalesce((
       select c.cashier_flow_enabled from public.companies c where c.id = new.company_id
     ), false) then
    raise exception 'cashier_flow_disabled: take payment and complete this sale directly';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_cashier_flow on public.orders;
create trigger orders_enforce_cashier_flow
  before insert or update of status on public.orders
  for each row execute function public.enforce_order_cashier_flow();

revoke execute on function public.enforce_order_cashier_flow()
  from authenticated, anon, public;
grant execute on function public.enforce_order_cashier_flow() to service_role;

-- Expiry tracking off means new stock does not enter the expiry workflow.
-- Existing dates are retained, so turning the feature back on restores history.
create or replace function public.apply_batch_expiry_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select c.batch_expiry_enabled from public.companies c where c.id = new.company_id
  ), false) then
    new.expiry_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_batches_apply_expiry_preference on public.inventory_batches;
create trigger inventory_batches_apply_expiry_preference
  before insert or update of expiry_date on public.inventory_batches
  for each row execute function public.apply_batch_expiry_preference();

drop trigger if exists purchase_lines_apply_expiry_preference on public.purchase_lines;
create trigger purchase_lines_apply_expiry_preference
  before insert or update of expiry_date on public.purchase_lines
  for each row execute function public.apply_batch_expiry_preference();

create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declarations jsonb := coalesce(p_declarations, '[]'::jsonb);
  v_declared bigint;
  v_expected bigint;
  v_require_opening_count boolean;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  select c.require_opening_count into v_require_opening_count
  from public.companies c where c.id = v_company_id;

  if not coalesce(v_require_opening_count, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', method.ledger_account_code,
      'declared', public.account_balance(v_company_id, method.ledger_account_code)
    )), '[]'::jsonb)
    into v_declarations
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled;
  end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(v_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then raise exception 'missing_declaration: %', v_required.ledger_account_code; end if;
  end loop;

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  ) values(
    v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()
  ) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(v_declarations)
  loop
    if not exists (
      select 1 from public.available_payment_methods(v_location_id) method
      where method.is_cashier_controlled
        and method.ledger_account_code = v_decl ->> 'account_code'
    ) then raise exception 'payment_method_unavailable_at_location'; end if;
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance
    ) values(
      v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected
    );
    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(v_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
  if v_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'), auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;

create or replace function public.open_cashier_session(p_declarations jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.open_cashier_session_at_location(
    public.resolve_business_location(null), p_declarations
  );
end;
$$;

create or replace function public.notify_large_cashier_variance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reconciliation record;
  v_threshold bigint;
  v_location_name text;
begin
  select r.company_id, r.location_id, r.scope, r.scope_ref_id
  into v_reconciliation
  from public.reconciliations r
  where r.id = new.reconciliation_id;

  if v_reconciliation.scope <> 'cash-session'
     or not v_reconciliation.scope_ref_id like '%:closing'
     or new.variance = 0 then
    return new;
  end if;

  select c.variance_notification_threshold into v_threshold
  from public.companies c where c.id = v_reconciliation.company_id;

  if abs(new.variance) < coalesce(v_threshold, 0) then
    return new;
  end if;

  select l.name into v_location_name
  from public.stock_locations l where l.id = v_reconciliation.location_id;

  perform public.notify(
    v_reconciliation.company_id,
    'system',
    'Till variance needs review',
    format(
      '%s at %s recorded a %s of KES %s.',
      new.account_code,
      coalesce(v_location_name, 'the business'),
      case when new.variance < 0 then 'shortage' else 'overage' end,
      to_char(abs(new.variance) / 100.0, 'FM999,999,990.00')
    ),
    '/money/cashier'
  );

  return new;
end;
$$;

drop trigger if exists reconciliation_accounts_notify_large_variance
  on public.reconciliation_accounts;
create trigger reconciliation_accounts_notify_large_variance
  after insert on public.reconciliation_accounts
  for each row execute function public.notify_large_cashier_variance();
