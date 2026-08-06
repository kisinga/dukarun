-- ===========================================================================
-- 20260723003000_0004_ledger.sql
-- ===========================================================================
-- Ledger: journal tables, post_journal_entry, money operations
-- (expenses/transfers/reconciliation), cashier sessions, period closing,
-- variance review, cashier-session enforcement.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0004_pos (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- journal tables (verbatim port; order_id added as a real column)
-- ---------------------------------------------------------------------------
create table public.ledger_journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entry_date date not null,
  posted_at timestamptz not null default now(),
  source_type varchar(64) not null,
  source_id varchar(128) not null,
  reversal_of uuid references public.ledger_journal_entries (id),
  memo text,
  created_at timestamptz not null default now(),
  unique (company_id, source_type, source_id)
);

create table public.ledger_journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ledger_journal_entries (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null references public.ledger_accounts (id),
  order_id uuid references public.orders (id),
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  meta jsonb not null default '{}',
  check (debit = 0 or credit = 0)
);

create index journal_lines_entry_idx on public.ledger_journal_lines (entry_id);
create index journal_lines_account_idx on public.ledger_journal_lines (company_id, account_id);
create index journal_lines_order_idx on public.ledger_journal_lines (order_id) where order_id is not null;
create index journal_lines_meta_idx on public.ledger_journal_lines using gin (meta);
alter table public.ledger_journal_entries enable row level security;
alter table public.ledger_journal_lines enable row level security;

-- Template policies: members read their company's rows; platform admins read all.
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'products', 'inventory_batches', 'inventory_movements',
    'orders', 'order_lines', 'payments', 'ledger_journal_entries', 'ledger_journal_lines'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (
         company_id = (select public.current_company_id()) or (select public.is_platform_admin()))',
      t || ' readable by members', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- post_journal_entry: validated double-entry posting.
-- p_lines: jsonb array of {account_code, debit, credit, order_id?, meta?}
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

  insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
  values (
    p_company_id,
    coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date),
    p_source_type, p_source_id, p_memo
  )
  returning id into v_entry_id;

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

-- Internal helpers are not callable by clients.
revoke execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) from authenticated, anon, public;
grant execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) to service_role;

-- ---------------------------------------------------------------------------
-- [squashed] 0007_money_ops (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0007_money_ops.sql
-- Expenses, inter-account transfers, refunds, payment reversals, and manual
-- balance adjustments. Faithful to ledger-posting.service.ts except:
--   - source_type casing standardized to PascalCase (ETL maps legacy strings)
--   - refunds table added for tracking (was: journal entry only)
--   - transfers tag the open cashier session when one exists but do not
--     REQUIRE it yet (the session requirement lands with cashier sessions;
--     today transfers would be untestable without them)
-- money_event is deliberately omitted: dead code upstream (no readers/writers).

-- ---------------------------------------------------------------------------
-- refunds (tracking rows; journal via post_refund)
-- ---------------------------------------------------------------------------
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.orders (id),
  amount bigint not null check (amount > 0),
  method_code text not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index refunds_order_idx on public.refunds (order_id);

alter table public.refunds enable row level security;

create policy "refunds readable by members"
  on public.refunds for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.refunds to authenticated;
grant all on public.refunds to service_role;

-- ---------------------------------------------------------------------------
-- post_journal_entry: make posting idempotent on (company, source_type,
-- source_id) — matches the old PostingService.post contract. A duplicate
-- source returns the existing entry instead of raising unique_violation.
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

  begin
    insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
    values (
      p_company_id,
      coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date),
      p_source_type, p_source_id, p_memo
    )
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

-- ---------------------------------------------------------------------------
-- Account validation helper: asset, leaf (non-parent), active.
-- ---------------------------------------------------------------------------
create or replace function public.require_asset_leaf_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.ledger_accounts a
  where a.company_id = p_company_id
    and a.code = p_code
    and a.type = 'asset'
    and a.is_active
    and not a.is_parent;

  if v_id is null then
    raise exception 'invalid_source_account: %', p_code;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_expense: DR EXPENSES / CR source asset account.
-- ---------------------------------------------------------------------------
create or replace function public.post_expense(
  p_amount bigint,
  p_source_account_code text,
  p_category text default 'other',
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_source_account_code);

  return public.post_journal_entry(
    v_company_id, 'Expense', 'expense-' || gen_random_uuid(),
    coalesce(p_memo, 'Expense (' || coalesce(p_category, 'other') || ')'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'EXPENSES', 'debit', p_amount,
        'meta', jsonb_build_object('sourceAccountCode', p_source_account_code, 'expenseCategory', coalesce(p_category, 'other'))
      ),
      jsonb_build_object('account_code', p_source_account_code, 'credit', p_amount, 'meta', '{}')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_transfer: inter-account transfer with optional processor fee.
-- p_transfer_id is the client idempotency key.
-- ---------------------------------------------------------------------------
create or replace function public.post_transfer(
  p_from_account_code text,
  p_to_account_code text,
  p_principal bigint,
  p_fee bigint default 0,
  p_transfer_id text default null,
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
  v_session_meta jsonb;
  v_transfer_id text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CreateInterAccountTransfer') then
    raise exception 'permission_denied: CreateInterAccountTransfer required';
  end if;

  if p_principal is null or p_principal <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_from_account_code = p_to_account_code then
    raise exception 'invalid_transfer: source and destination must differ';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_from_account_code);
  perform public.require_asset_leaf_account(v_company_id, p_to_account_code);

  v_transfer_id := nullif(trim(coalesce(p_transfer_id, '')), '');
  if v_transfer_id is null then
    raise exception 'transfer_id_required';
  end if;

  -- Tag the open cashier session if one exists (required once sessions land).
  v_session_meta := '{}'::jsonb;

  if coalesce(p_fee, 0) > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_to_account_code, 'debit', p_principal, 'meta', v_session_meta),
      jsonb_build_object('account_code', 'PROCESSOR_FEES', 'debit', p_fee,
        'meta', v_session_meta || jsonb_build_object('expenseTag', 'transaction_fee')),
      jsonb_build_object('account_code', p_from_account_code, 'credit', p_principal + p_fee, 'meta', v_session_meta)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_to_account_code, 'debit', p_principal, 'meta', v_session_meta),
      jsonb_build_object('account_code', p_from_account_code, 'credit', p_principal, 'meta', v_session_meta)
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InterAccountTransfer', v_transfer_id,
    coalesce(p_memo, 'Transfer ' || p_from_account_code || ' -> ' || p_to_account_code),
    v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_payment_reversal: mirror-image reversal of a Payment/PaymentAllocation
-- entry, keyed by payment id. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_reversal(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_entry record;
  v_existing uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_existing
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';

  if v_existing is not null then
    return v_existing; -- idempotent
  end if;

  select * into v_entry
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;

  if v_entry is null then
    raise exception 'original_entry_not_found: %', p_payment_id;
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
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  -- post_journal_entry can't set reversal_of; insert entry directly via a
  -- wrapper below.
  return public.post_reversal_entry(
    v_company_id, 'PaymentReversal', p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text, v_reversal_lines, v_entry.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_reversal_entry: post_journal_entry variant that records reversal_of.
-- ---------------------------------------------------------------------------
create or replace function public.post_reversal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_reversal_of uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  v_entry_id := public.post_journal_entry(p_company_id, p_source_type, p_source_id, p_memo, p_lines);

  update public.ledger_journal_entries
  set reversal_of = p_reversal_of
  where id = v_entry_id;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_balance_adjustment: manual customer AR correction.
-- p_amount signed: positive = customer owes more; negative = forgive.
-- ---------------------------------------------------------------------------
create or replace function public.post_balance_adjustment(
  p_customer_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('OverrideCustomerBalance') then
    raise exception 'permission_denied: OverrideCustomerBalance required';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'ACCOUNTS_RECEIVABLE', 'debit', p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'credit', p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'debit', -p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'ACCOUNTS_RECEIVABLE', 'credit', -p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'BalanceAdjustment', 'balance-adj-' || gen_random_uuid(),
    coalesce(p_reason, 'Customer balance adjustment'), v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_supplier_balance_adjustment: manual AP correction.
-- p_amount signed: positive = we owe more; negative = reduce what we owe.
-- ---------------------------------------------------------------------------
create or replace function public.post_supplier_balance_adjustment(
  p_supplier_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'debit', p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'credit', p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'debit', -p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'credit', -p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'SupplierBalanceAdjustment', 'supplier-balance-adj-' || gen_random_uuid(),
    coalesce(p_reason, 'Supplier balance adjustment'), v_lines
  );
end;
$$;

-- Grants
do $$
declare
  f text;
begin
  foreach f in array array[
    'post_expense(bigint, text, text, text)',
    'post_transfer(text, text, bigint, bigint, text, text)',
    'post_refund(uuid, bigint, text, text)',
    'post_payment_reversal(uuid)',
    'post_balance_adjustment(uuid, bigint, text)',
    'post_supplier_balance_adjustment(uuid, bigint, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke execute on function public.require_asset_leaf_account(uuid, text) from authenticated, anon, public;
revoke execute on function public.post_reversal_entry(uuid, text, text, text, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.require_asset_leaf_account(uuid, text) to service_role;
grant execute on function public.post_reversal_entry(uuid, text, text, text, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0009_cashier_sessions (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0010_period_closing (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0021_variance_review (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0021_variance_review.sql
-- Variance review: reconciliation account variances can be reviewed and
-- reverted (old system: variance action items; approve = reversal with
-- reversalOf set).

alter table public.reconciliation_accounts
  add column reviewed_at timestamptz,
  add column reviewed_by uuid;

-- ---------------------------------------------------------------------------
-- revert_variance: post a mirror reversal of the original variance entry and
-- mark the reconciliation line reviewed. Idempotent per recon account row.
-- ---------------------------------------------------------------------------
create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;

  if v_recon is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;

  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  if v_recon.variance = 0 then
    raise exception 'no_variance_to_revert';
  end if;

  if v_recon.reviewed_at is not null then
    raise exception 'already_reviewed';
  end if;

  -- Find the original variance entry: source_id = {session|manual}-{account}-{countId}.
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
      'meta', v_line.meta || jsonb_build_object('revertedAt', now()::text)
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id, 'VarianceAdjustmentReversal', v_entry.source_id || '-reversal',
    'Variance revert: ' || v_recon.account_code || coalesce(' — ' || p_reason, ''),
    v_reversal_lines, v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from anon, public;
grant execute on function public.revert_variance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0023_role_templates (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Alignment fix: ViewFinancials gates financial READS.
--    Journal tables: tighten the select policies.
-- ---------------------------------------------------------------------------
drop policy if exists "ledger_journal_entries readable by members" on public.ledger_journal_entries;
drop policy if exists "ledger_journal_lines readable by members" on public.ledger_journal_lines;

create policy "journal entries readable with ViewFinancials"
  on public.ledger_journal_entries for select
  using (
    (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

create policy "journal lines readable with ViewFinancials"
  on public.ledger_journal_lines for select
  using (
    (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- [squashed] 0029_manual_posting_accounts (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0029_manual_posting_accounts.sql
-- Marks which ledger accounts humans may transact from/to manually
-- (expense "Paid from", transfers, supplier payments) and renames the M-Pesa
-- account CLEARING_MPESA -> MPESA: it is a real money account, not a clearing
-- account. Payment-method code 'mpesa' is unchanged.
--
-- allow_manual_posting is true only for the real money accounts:
-- CASH_ON_HAND, BANK_MAIN, MPESA. Everything else (AR, INVENTORY, clearing
-- accounts, liabilities, income, expense) is system-only.
--
-- Seed blocks in 0003/0016/0023 already insert the renamed MPESA row; their
-- explicit column lists are unchanged, so the backfill below is also what
-- gives freshly provisioned companies the correct flags on a fresh DB.

alter table public.ledger_accounts
  add column if not exists allow_manual_posting boolean not null default false;

-- Rename for existing companies (no-op on fresh DBs whose seeds already
-- insert MPESA). Journal lines reference account UUIDs, so history is intact.
update public.ledger_accounts
set code = 'MPESA', name = 'M-Pesa', updated_at = now()
where code = 'CLEARING_MPESA';

update public.payment_methods
set ledger_account_code = 'MPESA', updated_at = now()
where ledger_account_code = 'CLEARING_MPESA';

-- Backfill flags for every company (existing and freshly seeded alike).
update public.ledger_accounts
set allow_manual_posting = (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA')),
    updated_at = now()
where allow_manual_posting <> (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA'));

-- ---------------------------------------------------------------------------
-- Tighten the shared account validator: user-chosen manual accounts (expense
-- source, transfer endpoints, supplier payment account) must be real money
-- accounts, not just any active asset leaf. All call sites
-- (post_expense, post_transfer, pay_supplier, record_purchase) route through
-- this function, so tightening it here covers every manual-posting RPC.
-- ---------------------------------------------------------------------------
create or replace function public.require_asset_leaf_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.ledger_accounts a
  where a.company_id = p_company_id
    and a.code = p_code
    and a.type = 'asset'
    and a.is_active
    and not a.is_parent
    and a.allow_manual_posting;

  if v_id is null then
    raise exception 'invalid_source_account: %', p_code;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0031_cashier_session_enforcement (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0031_cashier_session_enforcement.sql
-- Cashier sessions are an accounting boundary, not just a UI state.
-- Drafts and credit purchases remain available while the till is closed;
-- completed sales and any operation that moves money require an open session.

create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = p_company_id
    and s.status = 'open'
  limit 1
  for key share;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  return v_session_id;
end;
$$;

revoke execute on function public.require_open_cashier_session(uuid)
  from authenticated, anon, public;
grant execute on function public.require_open_cashier_session(uuid) to service_role;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_source_type = any (array[
    'Payment',
    'CreditSale',
    'PaymentAllocation',
    'Expense',
    'InterAccountTransfer',
    'SupplierPayment',
    'Refund',
    'PaymentReversal'
  ])
$$;

revoke execute on function public.cashier_session_required_for_source(text)
  from authenticated, anon, public;
grant execute on function public.cashier_session_required_for_source(text) to service_role;

-- AFTER INSERT preserves post_journal_entry's idempotent replay behaviour:
-- an already-posted entry is not a new financial action and needs no new session.
create or replace function public.enforce_journal_entry_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.cashier_session_required_for_source(new.source_type) then
    perform public.require_open_cashier_session(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_entries_require_cashier_session on public.ledger_journal_entries;
create trigger ledger_entries_require_cashier_session
  after insert on public.ledger_journal_entries
  for each row execute function public.enforce_journal_entry_cashier_session();

-- Stamp governed journal lines with the session that was open while they were
-- posted. Paid purchases share InventoryPurchase with credit purchases, so the
-- isCreditPurchase line metadata is the authoritative discriminator.
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
  where e.id = new.entry_id
    and e.company_id = new.company_id;

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
    new.meta := coalesce(new.meta, '{}'::jsonb)
      || jsonb_build_object('openSessionId', v_session_id);

    -- The paid/credit discriminator arrives on the second purchase line.
    -- Backfill the earlier inventory line so the whole entry is attributable.
    if v_source_type = 'InventoryPurchase'
       and new.meta ? 'isCreditPurchase'
       and (new.meta ->> 'isCreditPurchase')::boolean is false then
      update public.ledger_journal_lines
      set meta = meta || jsonb_build_object('openSessionId', v_session_id)
      where entry_id = new.entry_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_lines_tag_cashier_session on public.ledger_journal_lines;
create trigger ledger_lines_tag_cashier_session
  before insert on public.ledger_journal_lines
  for each row execute function public.tag_journal_line_cashier_session();

-- A completed order must belong to the open session. The database supplies the
-- session id so callers cannot attach a sale to a closed or foreign session.
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
    v_session_id := public.require_open_cashier_session(new.company_id);

    if new.cashier_session_id is not null and new.cashier_session_id <> v_session_id then
      raise exception 'cashier_session_mismatch: completed order must use the open session';
    end if;

    new.cashier_session_id := v_session_id;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0047_expire_variance_reverts (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0047_expire_variance_reverts.sql
-- A variance reversal is only valid until the next reconciliation boundary.
-- Opening/closing a cashier session and manual reconciliation all create a
-- reconciliation, so any of them permanently expires older variance actions.

create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;

  if v_recon is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;

  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  if v_recon.variance = 0 then
    raise exception 'no_variance_to_revert';
  end if;

  if v_recon.reviewed_at is not null then
    raise exception 'already_reviewed';
  end if;

  if exists (
    select 1
    from public.reconciliations r
    where r.company_id = v_company_id
      and r.created_at > v_recon_parent.created_at
  ) then
    raise exception 'variance_revert_expired: newer reconciliation activity exists';
  end if;

  -- Find the original variance entry: source_id = {session|manual}-{account}-{countId}.
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
      'meta', v_line.meta || jsonb_build_object('revertedAt', now()::text)
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id, 'VarianceAdjustmentReversal', v_entry.source_id || '-reversal',
    'Variance revert: ' || v_recon.account_code || coalesce(' — ' || p_reason, ''),
    v_reversal_lines, v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from anon, public;
grant execute on function public.revert_variance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0050_location_foundation (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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
  v_declared bigint;
  v_expected bigint;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_declarations) d
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

  for v_decl in select * from jsonb_array_elements(p_declarations)
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
  from jsonb_array_elements(p_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
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

revoke execute on function public.open_cashier_session_at_location(uuid, jsonb)
  from anon, public;
grant execute on function public.open_cashier_session_at_location(uuid, jsonb)
  to authenticated;

create or replace function public.close_cashier_session_at_location(
  p_location_id uuid,
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
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_result uuid;
begin
  if not exists (
    select 1 from public.cashier_sessions s
    where s.id = p_session_id and s.company_id = v_company_id
      and s.location_id = v_location_id and s.status = 'open'
  ) then raise exception 'session_not_open_at_location'; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_result := public.close_cashier_session(p_session_id, p_declarations);
  update public.reconciliations r set location_id = v_location_id
  where r.company_id = v_company_id and r.scope = 'cash-session'
    and r.scope_ref_id like p_session_id::text || ':%';
  return v_result;
end;
$$;

revoke execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  from anon, public;
grant execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  to authenticated;

-- Session tagging must never cross location boundaries.
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
      where s.company_id = new.company_id
        and s.location_id = new.location_id
        and s.status = 'open'
      limit 1
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- [squashed] 0050_staff_sales_performance (statements belonging to this domain)
-- ---------------------------------------------------------------------------

with posted_sales as (
  select
    l.order_id,
    min(e.posted_at) as completed_at
  from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where l.order_id is not null
    and e.source_type in ('Payment', 'CreditSale')
  group by l.order_id
)
update public.orders o
set completed_at = coalesce(s.completed_at, o.created_at),
    completed_by = o.created_by
from posted_sales s
where s.order_id = o.id
  and o.status in ('completed', 'voided');

-- ---------------------------------------------------------------------------
-- [squashed] 0052_cashier_flow_modes (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
