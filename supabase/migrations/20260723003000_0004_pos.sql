-- 0004_pos.sql
-- The heart: catalog, customers, orders (draft/parked/completed/voided),
-- FIFO inventory, journal tables, and the atomic sale functions.
--
-- Fidelity notes (vs backend/src/services/financial/ledger-posting.service.ts):
--   - Sale revenue posts GROSS (tax-inclusive) to SALES; no VAT split (as today).
--   - Credit sale = DR ACCOUNTS_RECEIVABLE / CR SALES (no CLEARING_CREDIT hop).
--   - COGS = DR COGS / CR INVENTORY with per-batch integer-rounded allocations.
--   - Reversal = one entry with per-account swapped totals of all lines of the order.
-- Improvements over the old implementation:
--   - order_id is a real column on journal lines (was meta jsonb digging).
--   - entry_date is Africa/Nairobi business date (was server UTC).
--   - insufficient stock REJECTS the sale atomically (was: silent COGS skip).
--   - integer-safe COGS (was: fractional-cent risk with fractional quantities).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- customers (suppliers are customers with is_supplier; supplier-credit
-- fields arrive with the credit phase)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  is_supplier boolean not null default false,
  -- customer credit
  credit_limit bigint not null default 0,
  credit_terms_days integer,
  is_credit_approved boolean not null default false,
  credit_approved_by uuid,
  last_repayment_date date,
  last_repayment_amount bigint,
  payment_terms text,
  notifications_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_idx on public.customers (company_id);

-- ---------------------------------------------------------------------------
-- products — one row per sellable SKU (Vendure options were a workaround).
-- price/wholesale_price are bigint cents, tax-inclusive.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  sku text not null,
  barcode text,
  price bigint not null check (price >= 0),
  wholesale_price bigint check (wholesale_price >= 0),
  allow_fractional boolean not null default false,
  track_inventory boolean not null default true,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

create index products_company_idx on public.products (company_id);
create index products_search_idx on public.products using gin (
  (name || ' ' || coalesce(barcode, '') || ' ' || sku) gin_trgm_ops
);
create unique index products_barcode_idx on public.products (company_id, barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------------
-- inventory_batches + movements (FIFO by purchased_at; stock is DERIVED
-- from sum(remaining), never stored)
-- ---------------------------------------------------------------------------
create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  stock_location_id uuid references public.stock_locations (id),
  supplier_id uuid references public.customers (id),
  quantity numeric(14,3) not null check (quantity > 0),
  remaining numeric(14,3) not null check (remaining >= 0),
  unit_cost bigint not null check (unit_cost >= 0), -- cents per unit
  purchased_at timestamptz not null default now(),
  expiry_date date,
  created_at timestamptz not null default now()
);

create index inventory_batches_fifo_idx
  on public.inventory_batches (company_id, product_id, purchased_at)
  where remaining > 0;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  batch_id uuid references public.inventory_batches (id),
  type text not null check (type in ('purchase', 'sale', 'adjustment', 'reversal')),
  quantity numeric(14,3) not null, -- signed: in positive, out negative
  unit_cost bigint,
  total_cost bigint,
  source_type text,
  source_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index inventory_movements_product_idx on public.inventory_movements (company_id, product_id);

-- ---------------------------------------------------------------------------
-- orders / order_lines / payments
-- ---------------------------------------------------------------------------
create sequence public.order_code_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers (id),
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'completed', 'voided')),
  total bigint not null default 0,
  is_credit_sale boolean not null default false,
  cashier_pending_at timestamptz,
  cashier_session_id uuid, -- FK added with the cashier phase
  created_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create index orders_company_status_idx on public.orders (company_id, status, created_at desc);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  custom_price bigint check (custom_price >= 0),
  price_override_reason text,
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index order_lines_order_idx on public.order_lines (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  method_code text not null,
  amount bigint not null check (amount > 0),
  reference text,
  mpesa_receipt text,
  status text not null default 'settled' check (status in ('settled', 'cancelled')),
  created_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);

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

-- ---------------------------------------------------------------------------
-- RLS + grants (writes via RPC only)
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payments enable row level security;
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

-- Realtime for POS screens (replaces the SSE cache-sync plugin).
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.products;

-- ---------------------------------------------------------------------------
-- Permission helper: checks the caller's role (from JWT claims) against the
-- company roles table. Used by RPCs for OverridePrice / ReverseOrder etc.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.roles r
    where r.company_id = (select public.current_company_id())
      and r.name = (select public.current_role_name())
      and p_permission = any (r.permissions)
  )
$$;

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

-- ---------------------------------------------------------------------------
-- consume_fifo: oldest-batch-first consumption. Integer-safe per-batch
-- rounding (each allocation cost = round(qty * unit_cost); total = sum).
-- Returns {allocations: [...], total_cogs: int}. Raises insufficient_stock.
-- ---------------------------------------------------------------------------
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
begin
  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and product_id = p_product_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock: product % has % available, % requested',
      p_product_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and product_id = p_product_id and remaining > 0
    order by purchased_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;

    update public.inventory_batches
    set remaining = remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_movements (
      company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    values (
      p_company_id, p_product_id, v_batch.id, 'sale', -v_take, v_batch.unit_cost, v_cost,
      p_source_type, p_source_id
    );

    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost
    );
  end loop;

  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_order (internal): stock + payments + ledger for an order that is
-- being finalized (direct sale, draft conversion, or cashier settle).
-- p_payments: jsonb array of {method, amount, reference?}.
-- Credit sale: p_payments = '[]' or single entry with method 'credit'.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_journal_lines jsonb := '[]'::jsonb;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entry: DR per-method clearing (or AR for credit) / CR SALES, gross.
  if v_is_credit then
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
    );
  else
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
      from public.payment_methods pm
      where pm.company_id = v_order.company_id and pm.code = v_payment ->> 'method';

      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'),
        'debit', (v_payment ->> 'amount')::bigint, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', v_payment ->> 'method', 'reference', v_payment ->> 'reference'
        )
      );
    end loop;
  end if;

  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
    'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
  );

  perform public.post_journal_entry(
    v_order.company_id,
    case when v_is_credit then 'CreditSale' else 'Payment' end,
    p_order_id::text,
    case when v_is_credit then 'Credit sale ' else 'Sale ' end || v_order.code,
    v_journal_lines
  );

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- save_draft: proforma / parked cart. No stock, no ledger.
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb, -- [{product_id, quantity, unit_price, custom_price?, override_reason?}]
  p_draft_id uuid default null -- update an existing draft
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    insert into public.order_lines (
      order_id, company_id, product_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'product_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  return v_order_id;
end;
$$;

-- post_sale: create + complete in one call. p_payments '[]' => credit sale.
-- p_park = true => pending_payment (cashier queue); settle later.
create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

-- convert_draft: proforma -> completed sale.
create or replace function public.convert_draft(
  p_order_id uuid,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$$;

-- settle_order: cashier collects a parked order.
create or replace function public.settle_order(
  p_order_id uuid,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$$;

-- void_sale: reverse an order — swapped-totals journal reversal + batch restore.
create or replace function public.void_sale(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  -- Swapped per-account totals of all journal lines belonging to this order.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_debit = 0 and v_account.total_credit = 0 then
      continue;
    end if;

    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code',
      (select code from public.ledger_accounts where id = v_account.account_id),
      'debit', v_account.total_credit,
      'credit', v_account.total_debit,
      'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
    );
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  -- Restore FIFO batches from the recorded COGS allocations.
  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.product_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

-- RPC grants (security definer; authenticated callers only)
revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean) from anon, public;
revoke execute on function public.convert_draft(uuid, jsonb) from anon, public;
revoke execute on function public.settle_order(uuid, jsonb) from anon, public;
revoke execute on function public.void_sale(uuid, text) from anon, public;

grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.convert_draft(uuid, jsonb) to authenticated;
grant execute on function public.settle_order(uuid, jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- Internal helpers are not callable by clients.
revoke execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) from authenticated, anon, public;
revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text) from authenticated, anon, public;
revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) to service_role;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text) to service_role;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;
