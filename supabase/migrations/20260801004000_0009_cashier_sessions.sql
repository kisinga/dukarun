-- 0009_cashier_sessions.sql
-- Cashier sessions with blind cash control: opening/closing declarations,
-- variance posting (declared - expected vs full-ledger balance), drawer
-- counts, reconciliation records, M-Pesa verification records.
--
-- Faithful choices (per spec): expected = FULL-LEDGER account balance (not
-- opening+sales-payouts); opening declares become ledger truth via variance
-- deltas; M-Pesa verification is record-only (no ledger effect).
-- Improvements: orders link to the session via cashier_session_id (set by
-- trigger on completion) instead of meta->>'openSessionId' digging.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  cashier_user_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_declared bigint,
  created_at timestamptz not null default now()
);

-- One open session per company.
create unique index cashier_sessions_one_open
  on public.cashier_sessions (company_id) where status = 'open';

create table public.cash_drawer_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cashier_sessions (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  count_type text not null check (count_type in ('opening', 'closing', 'mid_shift')),
  declared_cash bigint not null,
  expected_cash bigint not null,
  variance bigint not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  scope text not null check (scope in ('cash-session', 'manual', 'method')),
  scope_ref_id text not null,
  status text not null default 'verified' check (status in ('verified', 'recorded')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.reconciliation_accounts (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations (id) on delete cascade,
  account_code text not null,
  declared bigint not null,
  expected bigint not null,
  variance bigint not null
);

create table public.mpesa_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  session_id uuid references public.cashier_sessions (id),
  all_confirmed boolean not null default false,
  flagged_ids jsonb not null default '[]',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.cashier_sessions enable row level security;
alter table public.cash_drawer_counts enable row level security;
alter table public.reconciliations enable row level security;
alter table public.reconciliation_accounts enable row level security;
alter table public.mpesa_verifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cashier_sessions', 'cash_drawer_counts', 'reconciliations', 'mpesa_verifications']
  loop
    execute format(
      'create policy %I on public.%I for select using (
         company_id = (select public.current_company_id()) or (select public.is_platform_admin()))',
      t || ' readable by members', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- reconciliation_accounts are company-scoped through their parent.
create policy "reconciliation accounts readable by members"
  on public.reconciliation_accounts for select
  using (exists (
    select 1 from public.reconciliations r
    where r.id = reconciliation_id
      and (r.company_id = (select public.current_company_id()) or (select public.is_platform_admin()))
  ));

grant select on public.reconciliation_accounts to authenticated;
grant all on public.reconciliation_accounts to service_role;

-- Link completed orders to the open session (replaces openSessionId meta).
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.cashier_session_id is null then
    new.cashier_session_id := (
      select s.id from public.cashier_sessions s
      where s.company_id = new.company_id and s.status = 'open'
      limit 1
    );
  end if;
  return new;
end;
$$;

create trigger orders_tag_session
  before update on public.orders
  for each row execute function public.tag_order_session();

-- ---------------------------------------------------------------------------
-- Account balance helper (leaf accounts; balance = debits - credits).
-- ---------------------------------------------------------------------------
create or replace function public.account_balance(p_company_id uuid, p_code text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.debit) - sum(l.credit), 0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = p_company_id and a.code = p_code
$$;

-- ---------------------------------------------------------------------------
-- post_variance_adjustment (internal): variance = declared - expected.
-- Shortage: DR CASH_SHORT_OVER / CR account. Overage: reverse.
-- ---------------------------------------------------------------------------
create or replace function public.post_variance_adjustment(
  p_company_id uuid,
  p_session_id text,
  p_account_code text,
  p_declared bigint,
  p_count_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected bigint;
  v_variance bigint;
  v_lines jsonb;
begin
  v_expected := public.account_balance(p_company_id, p_account_code);
  v_variance := p_declared - v_expected;

  if v_variance = 0 then
    return null;
  end if;

  if v_variance < 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'debit', -v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason)),
      jsonb_build_object('account_code', p_account_code, 'credit', -v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_account_code, 'debit', v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason)),
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'credit', v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    p_company_id, 'VarianceAdjustment',
    p_session_id || '-' || p_account_code || '-' || p_count_id,
    coalesce(p_reason, 'Cash variance ' || p_account_code),
    v_lines
  );
end;
$$;

revoke execute on function public.post_variance_adjustment(uuid, text, text, bigint, text, text) from authenticated, anon, public;
grant execute on function public.post_variance_adjustment(uuid, text, text, bigint, text, text) to service_role;
grant execute on function public.account_balance(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- open_cashier_session: declarations for every cashier-controlled account;
-- opening reconciliation + variance deltas.
-- p_declarations: [{account_code, declared}]
-- ---------------------------------------------------------------------------
create or replace function public.open_cashier_session(
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.cashier_sessions where company_id = v_company_id and status = 'open') then
    raise exception 'session_already_open';
  end if;

  -- Every cashier-controlled account must be declared.
  for v_required in
    select pm.ledger_account_code
    from public.payment_methods pm
    where pm.company_id = v_company_id and pm.is_cashier_controlled and pm.enabled
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then
      raise exception 'missing_declaration: %', v_required.ledger_account_code;
    end if;
  end loop;

  insert into public.cashier_sessions (company_id, cashier_user_id)
  values (v_company_id, auth.uid())
  returning id into v_session_id;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'cash-session', v_session_id::text || ':opening', 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  -- Opening drawer count record (cash account).
  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(p_declarations) d
  where d ->> 'account_code' = 'CASH_ON_HAND';

  if v_declared is not null then
    insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by)
    values (
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'),
      auth.uid()
    );
  end if;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_cashier_session: blind count, closing reconciliation, variance.
-- p_declarations: [{account_code, declared}] (cashier-controlled accounts).
-- ---------------------------------------------------------------------------
create or replace function public.close_cashier_session(
  p_session_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session record;
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_session
  from public.cashier_sessions
  where id = p_session_id and company_id = v_company_id and status = 'open'
  for update;

  if v_session is null then
    raise exception 'session_not_open: %', p_session_id;
  end if;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'cash-session', p_session_id::text || ':closing', 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, p_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Closing count variance'
    );

    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by)
    values (p_session_id, v_company_id, 'closing', v_cash_declared, v_cash_expected, v_cash_declared - v_cash_expected, auth.uid());
  end if;

  update public.cashier_sessions
  set status = 'closed', closed_at = now(), closing_declared = v_cash_declared
  where id = p_session_id;

  return p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_mpesa_verification: record-only (no ledger effect, as upstream).
-- ---------------------------------------------------------------------------
create or replace function public.record_mpesa_verification(
  p_session_id uuid,
  p_all_confirmed boolean,
  p_flagged_ids jsonb default '[]',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.mpesa_verifications (company_id, session_id, all_confirmed, flagged_ids, notes, created_by)
  values (v_company_id, p_session_id, p_all_confirmed, coalesce(p_flagged_ids, '[]'), p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.open_cashier_session(jsonb) from anon, public;
revoke execute on function public.close_cashier_session(uuid, jsonb) from anon, public;
revoke execute on function public.record_mpesa_verification(uuid, boolean, jsonb, text) from anon, public;
grant execute on function public.open_cashier_session(jsonb) to authenticated;
grant execute on function public.close_cashier_session(uuid, jsonb) to authenticated;
grant execute on function public.record_mpesa_verification(uuid, boolean, jsonb, text) to authenticated;
