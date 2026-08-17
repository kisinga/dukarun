-- Account reconciliation is a privileged correction flow for real-money
-- accounts. Supplier/customer/control balances keep their dedicated subledgers.

alter table public.reconciliation_accounts
  add column if not exists reason text;

create or replace function public.list_reconcilable_accounts()
returns table(
  account_code varchar,
  account_name varchar,
  balance bigint,
  requires_reconciliation boolean,
  last_reconciled_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  return query
  select
    a.code,
    a.name,
    public.account_balance(v_company_id, a.code),
    exists(
      select 1
      from public.payment_methods pm
      where pm.company_id = v_company_id
        and pm.enabled
        and pm.requires_reconciliation
        and pm.ledger_account_code = a.code
    ),
    (
      select max(r.created_at)
      from public.reconciliation_accounts ra
      join public.reconciliations r on r.id = ra.reconciliation_id
      where r.company_id = v_company_id and ra.account_code = a.code
    )
  from public.ledger_accounts a
  where a.company_id = v_company_id
    and a.is_active
    and not a.is_parent
    and a.type = 'asset'
    and a.allow_manual_posting
  order by a.name, a.code;
end;
$$;

revoke execute on function public.list_reconcilable_accounts() from public, anon;
grant execute on function public.list_reconcilable_accounts() to authenticated;

drop function if exists public.record_manual_reconciliation(jsonb);
drop function if exists public.record_manual_reconciliation(jsonb, uuid);

create function public.record_manual_reconciliation(
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

  -- Journal inserts take the matching shared lock. Exclusive ownership keeps
  -- book balance, recorded variance, and final adjustment one atomic snapshot.
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  )
  values(
    v_company_id,
    v_location_id,
    'manual',
    'manual-' || gen_random_uuid(),
    'verified',
    auth.uid()
  )
  returning id into v_recon_id;

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

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = v_company_id
      and a.code = v_account_code
      and a.is_active
      and not a.is_parent
      and a.type = 'asset'
      and a.allow_manual_posting;
    if v_account_id is null then
      raise exception 'account_not_reconcilable: %', v_account_code;
    end if;

    v_expected := public.account_balance(v_company_id, v_account_code);
    if v_declared <> v_expected and v_reason is null then
      raise exception 'invalid_reason: reason required when balance changes';
    end if;

    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance, reason
    ) values(
      v_recon_id, v_account_code, v_declared, v_expected, v_declared - v_expected, v_reason
    );

    perform public.post_variance_adjustment(
      v_company_id,
      'manual',
      v_account_code,
      v_declared,
      v_recon_id::text,
      coalesce(v_reason, 'Balance verified')
    );
  end loop;

  return v_recon_id;
end;
$$;

revoke execute on function public.record_manual_reconciliation(jsonb, uuid) from public, anon;
grant execute on function public.record_manual_reconciliation(jsonb, uuid) to authenticated;

-- A different account no longer expires this account's review window.
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

-- System-controlled accounts such as customer credit cannot be manually
-- reconciled and therefore must not block period closing.
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
  v_method record;
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

  for v_method in
    select pm.code, pm.ledger_account_code
    from public.payment_methods pm
    join public.ledger_accounts a
      on a.company_id = pm.company_id and a.code = pm.ledger_account_code
    where pm.company_id = v_company_id
      and pm.requires_reconciliation
      and pm.enabled
      and a.is_active
      and not a.is_parent
      and a.type = 'asset'
      and a.allow_manual_posting
    order by pm.code
  loop
    if not exists(
      select 1
      from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id = r.id
      where r.company_id = v_company_id
        and r.status = 'verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
        and ra.account_code = v_method.ledger_account_code
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period',
        v_method.code;
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
