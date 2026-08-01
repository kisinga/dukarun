-- 0010_period_closing.sql
-- Accounting periods + period locks, manual reconciliations, and period-end
-- closing. Faithful: NO closing entries (P&L never rolls to equity upstream);
-- the lock only blocks new entries with entry_date <= lock_end_date.

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, end_date)
);

create table public.period_locks (
  company_id uuid primary key references public.companies (id) on delete cascade,
  lock_end_date date not null,
  updated_at timestamptz not null default now()
);

alter table public.accounting_periods enable row level security;
alter table public.period_locks enable row level security;

create policy "periods readable by members"
  on public.accounting_periods for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "locks readable by members"
  on public.period_locks for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.accounting_periods to authenticated;
grant select on public.period_locks to authenticated;
grant all on public.accounting_periods to service_role;
grant all on public.period_locks to service_role;

-- ---------------------------------------------------------------------------
-- post_journal_entry: enforce the period lock. Full-body replace (only the
-- marked block is new; idempotency semantics preserved).
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_entry_date date;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0),
         coalesce(sum((l ->> 'credit')::bigint), 0)
    into v_debit_sum, v_credit_sum
  from jsonb_array_elements(p_lines) l;

  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  v_entry_date := coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date);

  -- NEW: period lock enforcement.
  if exists (
    select 1 from public.period_locks pl
    where pl.company_id = p_company_id and v_entry_date <= pl.lock_end_date
  ) then
    raise exception 'period_locked: entry date % is within a locked period', v_entry_date;
  end if;

  begin
    insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
    values (p_company_id, v_entry_date, p_source_type, p_source_id, p_memo)
    returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
    from public.ledger_journal_entries e
    where e.company_id = p_company_id
      and e.source_type = p_source_type
      and e.source_id = p_source_id;

    return v_entry_id; -- already posted; idempotent replay
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line ->> 'debit')::bigint, 0);
    v_credit := coalesce((v_line ->> 'credit')::bigint, 0);

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = p_company_id
      and a.code = v_line ->> 'account_code'
      and a.is_active
      and not a.is_parent;

    if v_account_id is null then
      raise exception 'unknown_account: %', v_line ->> 'account_code';
    end if;

    insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
    values (
      v_entry_id, p_company_id, v_account_id,
      nullif(v_line ->> 'order_id', '')::uuid,
      v_debit, v_credit,
      coalesce(v_line -> 'meta', '{}'::jsonb)
    );
  end loop;

  return v_entry_id;
end;
$$;

revoke execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) from authenticated, anon, public;
grant execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) to service_role;

-- ---------------------------------------------------------------------------
-- record_manual_reconciliation: the only reconciliation scope that POSTS —
-- one variance adjustment per account with non-zero declared - expected.
-- ---------------------------------------------------------------------------
create or replace function public.record_manual_reconciliation(
  p_declarations jsonb -- [{account_code, declared, reason?}]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'manual', 'manual-' || extract(epoch from now())::bigint, 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, 'manual', v_decl ->> 'account_code', v_declared,
      v_recon_id::text, coalesce(v_decl ->> 'reason', 'Manual reconciliation')
    );
  end loop;

  return v_recon_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_accounting_period: validations (upstream-shaped), upsert the lock,
-- record the period. No closing entries.
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_method record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;

  if p_end_date is null or p_end_date > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  select * into v_lock from public.period_locks where company_id = v_company_id;

  if v_lock is not null and p_end_date <= v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)', v_lock.lock_end_date;
  end if;

  -- No open cashier sessions.
  if exists (select 1 from public.cashier_sessions where company_id = v_company_id and status = 'open') then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  -- Every reconciliation-requiring payment method needs a verified
  -- reconciliation since the last lock.
  for v_method in
    select pm.code
    from public.payment_methods pm
    where pm.company_id = v_company_id and pm.requires_reconciliation and pm.enabled
    order by pm.code
  loop
    if not exists (
      select 1 from public.reconciliations r
      where r.company_id = v_company_id
        and r.status = 'verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period', v_method.code;
    end if;
  end loop;

  insert into public.period_locks (company_id, lock_end_date, updated_at)
  values (v_company_id, p_end_date, now())
  on conflict (company_id) do update set lock_end_date = p_end_date, updated_at = now();

  insert into public.accounting_periods (company_id, start_date, end_date, status, created_by)
  values (
    v_company_id,
    coalesce(v_lock.lock_end_date + 1, p_end_date),
    p_end_date,
    'closed',
    auth.uid()
  )
  returning id into v_period_id;

  return v_period_id;
end;
$$;

revoke execute on function public.record_manual_reconciliation(jsonb) from anon, public;
revoke execute on function public.close_accounting_period(date) from anon, public;
grant execute on function public.record_manual_reconciliation(jsonb) to authenticated;
grant execute on function public.close_accounting_period(date) to authenticated;
