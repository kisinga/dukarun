-- Manual reconciliation must use the same accounting boundary as the account:
-- cashier-controlled money is location-scoped; bank-style money is company-wide.

alter table public.reconciliation_accounts
  add column if not exists balance_scope text;

update public.reconciliation_accounts ra
set balance_scope = case
  when r.scope = 'cash-session' then 'location'
  when r.scope = 'manual' and r.location_id is not null and exists(
    select 1
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id
    where pm.company_id = r.company_id
      and lpm.location_id = r.location_id
      and pm.enabled and lpm.enabled
      and coalesce(lpm.ledger_account_code, pm.ledger_account_code) = ra.account_code
      and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
  ) then 'location'
  else 'company'
end
from public.reconciliations r
where r.id = ra.reconciliation_id and ra.balance_scope is null;

alter table public.reconciliation_accounts
  drop constraint if exists reconciliation_accounts_balance_scope_check;
alter table public.reconciliation_accounts
  add constraint reconciliation_accounts_balance_scope_check
  check (balance_scope in ('company', 'location'));

create or replace function public.assign_reconciliation_balance_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_parent_scope text;
begin
  if new.balance_scope is not null then return new; end if;

  select r.scope into v_parent_scope
  from public.reconciliations r
  where r.id = new.reconciliation_id;

  if v_parent_scope is null then
    raise exception 'reconciliation_not_found: %', new.reconciliation_id;
  end if;
  new.balance_scope := case when v_parent_scope = 'cash-session' then 'location' else 'company' end;
  return new;
end;
$$;

drop trigger if exists reconciliation_accounts_assign_balance_scope
  on public.reconciliation_accounts;
create trigger reconciliation_accounts_assign_balance_scope
  before insert on public.reconciliation_accounts
  for each row execute function public.assign_reconciliation_balance_scope();

alter table public.reconciliation_accounts
  alter column balance_scope set not null;

revoke execute on function public.assign_reconciliation_balance_scope()
  from public, anon, authenticated;
grant execute on function public.assign_reconciliation_balance_scope() to service_role;

drop function if exists public.list_reconcilable_accounts();
drop function if exists public.list_reconcilable_accounts(uuid);

create function public.list_reconcilable_accounts(p_location_id uuid default null)
returns table(
  account_code varchar,
  account_name varchar,
  balance bigint,
  requires_reconciliation boolean,
  last_reconciled_at timestamptz,
  balance_scope text,
  location_id uuid,
  location_name text,
  can_adjust boolean,
  blocked_reason text
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  v_location_id := public.resolve_business_location(p_location_id);

  return query
  with scoped_accounts as (
    select
      a.code,
      a.name,
      exists(
        select 1
        from public.payment_methods pm
        join public.location_payment_methods lpm
          on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id
        where pm.company_id = v_company_id
          and pm.enabled and lpm.enabled
          and coalesce(lpm.ledger_account_code, pm.ledger_account_code) = a.code
          and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
      ) as is_location_scoped,
      exists(
        select 1
        from public.payment_methods pm
        join public.location_payment_methods lpm
          on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id
        where pm.company_id = v_company_id
          and pm.enabled and lpm.enabled
          and coalesce(lpm.ledger_account_code, pm.ledger_account_code) = a.code
          and coalesce(lpm.requires_reconciliation, pm.requires_reconciliation)
      ) as requires_reconciliation
    from public.ledger_accounts a
    where a.company_id = v_company_id
      and a.is_active
      and not a.is_parent
      and a.type = 'asset'
      and a.allow_manual_posting
  )
  select
    a.code,
    a.name,
    case
      when a.is_location_scoped then
        public.location_account_balance(v_company_id, v_location_id, a.code)
      else public.account_balance(v_company_id, a.code)
    end,
    a.requires_reconciliation,
    (
      select max(r.created_at)
      from public.reconciliation_accounts ra
      join public.reconciliations r on r.id = ra.reconciliation_id
      where r.company_id = v_company_id
        and ra.account_code = a.code
        and ra.balance_scope = case when a.is_location_scoped then 'location' else 'company' end
        and (not a.is_location_scoped or r.location_id = v_location_id)
    ),
    case when a.is_location_scoped then 'location' else 'company' end,
    case when a.is_location_scoped then v_location_id else null end,
    case when a.is_location_scoped then l.name else null end,
    not a.is_location_scoped or s.id is null,
    case
      when a.is_location_scoped and s.id is not null
        then 'Close the cashier session before adjusting this balance'
      else null
    end
  from scoped_accounts a
  join public.stock_locations l on l.id = v_location_id
  left join public.cashier_sessions s
    on s.company_id = v_company_id and s.location_id = v_location_id and s.status = 'open'
  order by a.name, a.code;
end;
$$;

revoke execute on function public.list_reconcilable_accounts(uuid) from public, anon;
grant execute on function public.list_reconcilable_accounts(uuid) to authenticated;

create or replace function public.post_manual_location_variance_adjustment(
  p_company_id uuid,
  p_location_id uuid,
  p_account_code text,
  p_declared bigint,
  p_reconciliation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected bigint;
  v_variance bigint;
  v_lines jsonb;
  v_meta jsonb;
begin
  v_expected := public.location_account_balance(p_company_id, p_location_id, p_account_code);
  v_variance := p_declared - v_expected;
  if v_variance = 0 then return null; end if;

  v_meta := jsonb_build_object(
    'locationId', p_location_id,
    'reconciliationScope', 'location',
    'varianceReason', p_reason
  );
  if v_variance < 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'debit', -v_variance, 'meta', v_meta),
      jsonb_build_object('account_code', p_account_code, 'credit', -v_variance, 'meta', v_meta)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_account_code, 'debit', v_variance, 'meta', v_meta),
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'credit', v_variance, 'meta', v_meta)
    );
  end if;

  return public.post_journal_entry(
    p_company_id,
    'VarianceAdjustment',
    'manual-location-' || p_account_code || '-' || p_reconciliation_id::text,
    p_reason,
    v_lines
  );
end;
$$;

revoke execute on function public.post_manual_location_variance_adjustment(
  uuid, uuid, text, bigint, uuid, text
) from public, anon, authenticated;
grant execute on function public.post_manual_location_variance_adjustment(
  uuid, uuid, text, bigint, uuid, text
) to service_role;

create or replace function public.record_manual_reconciliation(
  p_declarations jsonb,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
  v_recon_id uuid;
  v_decl jsonb;
  v_account_id uuid;
  v_account_code text;
  v_reason text;
  v_declared bigint;
  v_expected bigint;
  v_is_location_scoped boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  v_location_id := public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id', v_location_id::text, true);
  if p_declarations is null
    or jsonb_typeof(p_declarations) <> 'array'
    or jsonb_array_length(p_declarations) = 0 then
    raise exception 'invalid_declarations: at least one account is required';
  end if;
  if jsonb_array_length(p_declarations) > 50 then
    raise exception 'invalid_declarations: too many accounts';
  end if;
  if (
    select count(*) <> count(distinct nullif(btrim(value->>'account_code'), ''))
    from jsonb_array_elements(p_declarations)
  ) then
    raise exception 'invalid_declarations: duplicate or missing account';
  end if;

  -- Serialize against journal posting and session opening. An in-flight close
  -- remains visible as open until it commits, so adjustments fail safely.
  perform pg_advisory_xact_lock(
    hashtextextended('cashier-session:' || v_company_id::text, 0)
  );
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  ) values(
    v_company_id, v_location_id, 'manual', 'manual-' || gen_random_uuid(), 'verified', auth.uid()
  ) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_account_code := btrim(v_decl->>'account_code');
    v_reason := nullif(btrim(v_decl->>'reason'), '');

    begin
      v_declared := (v_decl->>'declared')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid_balance: %', v_account_code;
    end;
    if v_declared is null or v_declared < 0 then
      raise exception 'invalid_balance: %', v_account_code;
    end if;
    if v_reason is not null and length(v_reason) > 500 then
      raise exception 'invalid_reason: maximum length is 500 characters';
    end if;

    select
      a.id,
      exists(
        select 1
        from public.payment_methods pm
        join public.location_payment_methods lpm
          on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id
        where pm.company_id = v_company_id
          and pm.enabled and lpm.enabled
          and coalesce(lpm.ledger_account_code, pm.ledger_account_code) = a.code
          and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
      )
    into v_account_id, v_is_location_scoped
    from public.ledger_accounts a
    where a.company_id = v_company_id
      and a.code = v_account_code
      and a.is_active and not a.is_parent
      and a.type = 'asset' and a.allow_manual_posting;
    if v_account_id is null then
      raise exception 'account_not_reconcilable: %', v_account_code;
    end if;

    if v_is_location_scoped and exists(
      select 1 from public.cashier_sessions s
      where s.company_id = v_company_id
        and s.location_id = v_location_id
        and s.status = 'open'
    ) then
      raise exception 'cashier_session_open: close the session before adjusting %', v_account_code;
    end if;

    v_expected := case
      when v_is_location_scoped then
        public.location_account_balance(v_company_id, v_location_id, v_account_code)
      else public.account_balance(v_company_id, v_account_code)
    end;
    if v_declared <> v_expected and v_reason is null then
      raise exception 'invalid_reason: reason required when balance changes';
    end if;

    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance, reason, balance_scope
    ) values(
      v_recon_id, v_account_code, v_declared, v_expected, v_declared - v_expected,
      v_reason, case when v_is_location_scoped then 'location' else 'company' end
    );

    if v_is_location_scoped then
      perform public.post_manual_location_variance_adjustment(
        v_company_id, v_location_id, v_account_code, v_declared, v_recon_id,
        coalesce(v_reason, 'Balance verified')
      );
    else
      perform public.post_variance_adjustment(
        v_company_id, 'manual', v_account_code, v_declared, v_recon_id::text,
        coalesce(v_reason, 'Balance verified')
      );
    end if;
  end loop;

  return v_recon_id;
end;
$$;

revoke execute on function public.record_manual_reconciliation(jsonb, uuid) from public, anon;
grant execute on function public.record_manual_reconciliation(jsonb, uuid) to authenticated;

create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon record;
  v_recon_parent record;
  v_entry record;
  v_line record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_entry_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('cashier-session:' || v_company_id::text, 0)
  );
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;
  if v_recon is null then raise exception 'recon_account_not_found: %', p_recon_account_id; end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;
  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;
  if v_recon.variance = 0 then raise exception 'no_variance_to_revert'; end if;
  if v_recon.reviewed_at is not null then raise exception 'already_reviewed'; end if;

  if exists(
    select 1
    from public.reconciliation_accounts newer_account
    join public.reconciliations newer on newer.id = newer_account.reconciliation_id
    where newer.company_id = v_company_id
      and newer_account.account_code = v_recon.account_code
      and newer_account.balance_scope = v_recon.balance_scope
      and (
        v_recon.balance_scope = 'company'
        or newer.location_id = v_recon_parent.location_id
      )
      and (newer.created_at, newer.id) > (v_recon_parent.created_at, v_recon_parent.id)
  ) then
    raise exception 'variance_revert_expired: newer reconciliation activity exists';
  end if;

  select * into v_entry
  from public.ledger_journal_entries e
  where e.company_id = v_company_id
    and e.source_type = 'VarianceAdjustment'
    and e.source_id like '%-' || v_recon.account_code || '-' || v_recon_parent.id::text
  limit 1;
  if v_entry is null then
    raise exception 'variance_entry_not_found for account %', v_recon.account_code;
  end if;

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
      'meta', v_line.meta || jsonb_build_object(
        'reversalReason', coalesce(nullif(btrim(p_reason), ''), 'Variance reverted')
      )
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id,
    'VarianceReversal',
    p_recon_account_id::text,
    coalesce(nullif(btrim(p_reason), ''), 'Variance adjustment reverted'),
    v_reversal_lines,
    v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id and reviewed_at is null;
  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from public, anon;
grant execute on function public.revert_variance(uuid, text) to authenticated;

create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_requirement record;
  v_first_entry_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;
  if p_end_date is null or p_end_date > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_lock
  from public.period_locks
  where company_id = v_company_id
  for update;
  if v_lock is not null and p_end_date <= v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)', v_lock.lock_end_date;
  end if;
  if exists(
    select 1 from public.cashier_sessions
    where company_id = v_company_id and status = 'open'
  ) then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  for v_requirement in
    select distinct
      pm.code,
      coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code,
      case
        when coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
          then lpm.location_id
        else null
      end as required_location_id,
      case
        when coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
          then 'location'
        else 'company'
      end as balance_scope,
      case
        when coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled) then l.name
        else null
      end as location_name
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.company_id = pm.company_id
    join public.stock_locations l on l.id = lpm.location_id and l.is_active
    join public.ledger_accounts a
      on a.company_id = pm.company_id
     and a.code = coalesce(lpm.ledger_account_code, pm.ledger_account_code)
    where pm.company_id = v_company_id
      and pm.enabled and lpm.enabled
      and coalesce(lpm.requires_reconciliation, pm.requires_reconciliation)
      and a.is_active and not a.is_parent
      and a.type = 'asset' and a.allow_manual_posting
    order by pm.code, account_code, required_location_id
  loop
    if not exists(
      select 1
      from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id = r.id
      where r.company_id = v_company_id
        and r.status = 'verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
        and ra.account_code = v_requirement.account_code
        and ra.balance_scope = v_requirement.balance_scope
        and (
          v_requirement.required_location_id is null
          or r.location_id = v_requirement.required_location_id
        )
    ) then
      if v_requirement.required_location_id is null then
        raise exception 'reconciliation_required: method % has no verified reconciliation this period',
          v_requirement.code;
      else
        raise exception 'reconciliation_required: method % at % has no verified reconciliation this period',
          v_requirement.code, v_requirement.location_name;
      end if;
    end if;
  end loop;

  if v_lock is null then
    select min(e.entry_date) into v_first_entry_date
    from public.ledger_journal_entries e
    where e.company_id = v_company_id
      and e.finalized_at is not null
      and e.entry_date <= p_end_date;
  end if;

  insert into public.period_locks(company_id, lock_end_date, updated_at)
  values(v_company_id, p_end_date, now())
  on conflict(company_id) do update
    set lock_end_date = excluded.lock_end_date, updated_at = excluded.updated_at;
  insert into public.accounting_periods(company_id, start_date, end_date, status, created_by)
  values(
    v_company_id,
    coalesce(v_lock.lock_end_date + 1, v_first_entry_date, p_end_date),
    p_end_date,
    'closed',
    auth.uid()
  ) returning id into v_period_id;
  return v_period_id;
end;
$$;

revoke execute on function public.close_accounting_period(date) from public, anon;
grant execute on function public.close_accounting_period(date) to authenticated;
