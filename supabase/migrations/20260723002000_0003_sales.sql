-- ===========================================================================
-- 20260723002000_0003_sales.sql
-- ===========================================================================
-- Sales: orders, order_lines, payments, drafts/proformas,
-- post_sale/complete_order, customer credit, approvals, voids, refunds,
-- staff sales performance, commissions, checkout flow.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0004_pos (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payments enable row level security;

-- Realtime for POS screens (replaces the SSE cache-sync plugin).
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.payments;

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
revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0005_customer_gaps (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0005_customer_gaps.sql
-- Fixes two gaps found during POS screen integration:
--   1. No client-reachable way to create customers (writes are RPC-only).
--   2. Credit sales were permitted without a customer — AR lines with no
--      debtor attached. Now enforced inside complete_order.

-- ---------------------------------------------------------------------------
-- create_customer RPC (minimal; credit fields managed separately in Phase 4)
-- ---------------------------------------------------------------------------
create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null
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

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text) from anon, public;
grant execute on function public.create_customer(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: enforce that credit sales have a customer.
-- (Full-body replace; only the marked block is new.)
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

  -- NEW: a credit sale without a debtor is meaningless AR.
  if v_is_credit and v_order.customer_id is null then
    raise exception 'credit_requires_customer';
  end if;

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

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0006_sale_idempotency (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0006_sale_idempotency.sql
-- Offline-queue support: client-generated idempotency refs on post_sale.
-- A queued offline sale carries a client_ref (uuid generated on the device);
-- replaying it after an ambiguous network failure returns the original order
-- instead of double-posting. Exactly-once without server sessions.

alter table public.orders add column client_ref text;

create unique index orders_client_ref_unique
  on public.orders (company_id, client_ref)
  where client_ref is not null;

-- post_sale gains p_client_ref. Postgres treats this as a new signature, so
-- the old 4-arg function is dropped to avoid PostgREST overload ambiguity.
drop function public.post_sale(uuid, jsonb, jsonb, boolean);

create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_existing uuid;
begin
  -- Idempotent replay: this client_ref already posted.
  if p_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = p_client_ref;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_client_ref is not null then
    begin
      update public.orders set client_ref = p_client_ref where id = v_order_id;
    exception when unique_violation then
      -- Concurrent post with the same ref won the race. Our row is a fresh
      -- draft with no stock/ledger side effects yet, so it is safe to drop.
      delete from public.orders where id = v_order_id;

      select id into v_existing
      from public.orders
      where company_id = v_company_id and client_ref = p_client_ref;

      return v_existing;
    end;
  end if;

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) from anon, public;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0007_money_ops (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- post_refund: DR SALES_RETURNS / CR clearing account. No tax/COGS/AR
-- interaction (faithful to the old postRefund).
-- ---------------------------------------------------------------------------
create or replace function public.post_refund(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_refund_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.refunds (company_id, order_id, amount, method_code, reason, created_by)
  values (v_company_id, p_order_id, p_amount, p_method_code, p_reason, auth.uid())
  returning id into v_refund_id;

  return public.post_journal_entry(
    v_company_id, 'Refund', v_refund_id::text,
    'Refund for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALES_RETURNS', 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      ),
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', p_method_code)
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_order: post ONE Payment entry per payment (source_id = payment id),
-- matching the old postPayment granularity (needed for payment-level reversal
-- and M-Pesa transaction verification). Full-body replace.
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
  v_payment_row record;
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

  -- A credit sale without a debtor is meaningless AR.
  if v_is_credit and v_order.customer_id is null then
    raise exception 'credit_requires_customer';
  end if;

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

  -- Revenue entries.
  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    -- One Payment entry per payment row (source_id = payment id).
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

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

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- [squashed] 0008_customer_credit (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0008_customer_credit.sql
-- Customer credit: AR repayment allocations with the per-order AR invariant,
-- plus credit validation at sale time (approved customer + credit limit).
-- Deviation from upstream (noted): over-limit / unapproved credit sales
-- hard-fail here; the approval-request workflow (overdraft approvals) is a
-- later phase, matching the plan's approvals table.

-- ---------------------------------------------------------------------------
-- post_payment_allocation: DR clearing / CR ACCOUNTS_RECEIVABLE with the
-- per-order invariant (at least one AR debit exists; credits <= debits).
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_allocation(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_payment_id uuid;
  v_ar_debits bigint;
  v_ar_credits bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.payments (company_id, order_id, method_code, amount, reference)
  values (v_company_id, p_order_id, p_method_code, p_amount, p_reference)
  returning id into v_payment_id;

  perform public.post_journal_entry(
    v_company_id, 'PaymentAllocation', v_payment_id::text,
    'Credit repayment for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code, 'reference', p_reference
        )
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECEIVABLE', 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      )
    )
  );

  -- Per-order AR invariant (same transaction, so this allocation is visible).
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    into v_ar_debits, v_ar_credits
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.order_id = p_order_id;

  if v_ar_debits = 0 then
    raise exception 'ar_allocation_without_debt: order % has no AR balance', p_order_id;
  end if;

  if v_ar_credits > v_ar_debits then
    raise exception 'ar_overpayment: order % AR credits % exceed debits %', p_order_id, v_ar_credits, v_ar_debits;
  end if;

  return v_payment_id;
end;
$$;

revoke execute on function public.post_payment_allocation(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_payment_allocation(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: credit-sale validation — approved customer, limit check
-- against current AR balance. Full-body replace (credit branch is new).
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
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
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

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    -- Current AR exposure for this customer (all orders).
    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_customer.credit_limit > 0
       and v_ar_balance + v_order.total > v_customer.credit_limit then
      raise exception 'credit_limit_exceeded: balance % + % > limit %',
        v_ar_balance, v_order.total, v_customer.credit_limit;
    end if;
  end if;

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

  -- Revenue entries.
  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

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

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0013_void_mixed_accounts (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0013_void_mixed_accounts.sql
-- Bug: void_sale aggregated an order's journal lines per account and emitted
-- ONE swapped line per account. When an account has BOTH debits and credits
-- on the order (e.g. credit sale + partial AR repayment, or cash sale + cash
-- refund), that line had debit>0 AND credit>0, violating
-- ledger_journal_lines_check (debit = 0 or credit = 0).
-- Fix: emit single-sided lines — a debit line for the account's credit total
-- and a credit line for its debit total. Gross totals unchanged (still a
-- perfect mirror); the entry stays balanced because the original was.

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

  -- Swapped per-account totals, emitted as single-sided lines.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit,
        'credit', 0,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0,
        'credit', v_account.total_debit,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
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

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0017_product_variants (statements belonging to this domain)
-- ---------------------------------------------------------------------------

alter table public.order_lines add column variant_id uuid references public.product_variants (id);
update public.order_lines l set variant_id = v.id
from public.product_variants v where v.product_id = l.product_id;
alter table public.order_lines alter column variant_id set not null;
alter table public.order_lines drop column product_id;
create index order_lines_variant_idx on public.order_lines (variant_id);

-- ---------------------------------------------------------------------------
-- 7. save_draft: lines carry variant_id; order_lines join via variants.
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb, -- [{variant_id, quantity, unit_price, custom_price?, override_reason?}]
  p_draft_id uuid default null
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

    -- fractional quantities only where the variant allows them
    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
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

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. complete_order: FIFO join via variants (product -> product_variants).
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
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
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

  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_customer.credit_limit > 0
       and v_ar_balance + v_order.total > v_customer.credit_limit then
      raise exception 'credit_limit_exceeded: balance % + % > limit %',
        v_ar_balance, v_order.total, v_customer.credit_limit;
    end if;
  end if;

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

  -- FIFO consumption + COGS per line (via variants).
  for v_line in
    select l.*, v.track_inventory
    from public.order_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

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

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 11. void_sale: reversal movements point at variants (body identical to the
-- 0013 version except product_id -> variant_id in the batch-restore insert).
-- ---------------------------------------------------------------------------
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

  -- Swapped per-account totals, emitted as single-sided lines.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit,
        'credit', 0,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0,
        'credit', v_account.total_debit,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
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
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.variant_id, b.id, 'reversal',
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

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- [squashed] 0020_approvals (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0020_approvals.sql
-- Approvals workflow (old: approval-request entity, 4 types).
-- Semantics per type:
--   below_wholesale  — save_draft records it when a custom price dips below
--                      wholesale; complete_order blocks until approved.
--   order_reversal   — callers with ReverseOrder but without ManageApprovals
--                      get a pending approval instead of an instant void;
--                      approval executes the void.
--   overdraft        — over-limit credit sale by an ApproveCustomerCredit
--                      holder succeeds and records an approved overdraft
--                      approval (audit of who authorized); others hard-fail.
--   customer_credit  — reserved (credit-limit raise requests); table support
--                      now, triggers when that flow lands.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in ('overdraft', 'customer_credit', 'below_wholesale', 'order_reversal')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  metadata jsonb not null default '{}',
  due_at timestamptz,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);

create index approvals_company_status_idx on public.approvals (company_id, status, created_at desc);

alter table public.approvals enable row level security;

create policy "approvals readable by members"
  on public.approvals for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.approvals to authenticated;
grant all on public.approvals to service_role;

create trigger approvals_audit
  after insert or update or delete on public.approvals
  for each row execute function public.audit_trigger();

alter publication supabase_realtime add table public.approvals;

-- ---------------------------------------------------------------------------
-- Internal: create an approval row (service-role/RPC use).
-- ---------------------------------------------------------------------------
create or replace function public.create_approval(
  p_company_id uuid,
  p_type text,
  p_metadata jsonb,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.approvals (company_id, type, metadata, due_at, requested_by)
  values (p_company_id, p_type, coalesce(p_metadata, '{}'), p_due_at, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_approval(uuid, text, jsonb, timestamptz) from authenticated, anon, public;
grant execute on function public.create_approval(uuid, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- save_draft: record below-wholesale approvals for overridden lines.
-- Full-body replace (adds the marked block at the end).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
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
  v_below jsonb := '[]'::jsonb;
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
    -- fresh draft: drop any stale below-wholesale requests for it
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
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

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    -- NEW: track below-wholesale custom prices for approval.
    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  -- NEW: one approval request per order covering all below-wholesale lines.
  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: block while a below-wholesale approval is pending.
-- Full-body replace (only the marked guard is new).
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
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
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

  -- NEW: below-wholesale gate.
  select a.id into v_pending_approval
  from public.approvals a
  where a.company_id = v_order.company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_ar_balance + v_order.total > v_customer.credit_limit
       and v_customer.credit_limit > 0 then
      -- NEW: overdraft — allowed with an audit trail when the actor holds
      -- ApproveCustomerCredit; hard fail otherwise.
      if public.current_user_has_permission('ApproveCustomerCredit') then
        insert into public.approvals (company_id, type, status, metadata, requested_by, decided_by, decided_at, decision_reason)
        values (
          v_order.company_id, 'overdraft', 'approved',
          jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ),
          auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  end if;

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

  for v_line in
    select l.*, v.track_inventory
    from public.order_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

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

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- do_void (internal): the void mechanics, no permission checks.
-- ---------------------------------------------------------------------------
create or replace function public.do_void(p_order_id uuid, p_reason text)
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
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit, 'credit', 0, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0, 'credit', v_account.total_debit, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

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
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.variant_id, b.id, 'reversal',
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

revoke execute on function public.do_void(uuid, text) from authenticated, anon, public;
grant execute on function public.do_void(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- void_sale: instant for ManageApprovals; approval request otherwise.
-- Returns a status object (NOT an exception for the approval path — raising
-- would roll back the approval insert itself).
--   {"status": "voided", "entry_id": "..."}
--   {"status": "approval_required", "approval_id": "..."}
-- ---------------------------------------------------------------------------
drop function public.void_sale(uuid, text);

create or replace function public.void_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  if public.current_user_has_permission('ManageApprovals') then
    v_entry_id := public.do_void(p_order_id, p_reason);
    return jsonb_build_object('status', 'voided', 'entry_id', v_entry_id);
  end if;

  -- Needs sign-off: create (or reuse) a pending approval request.
  select a.id into v_approval_id
  from public.approvals a
  where a.company_id = v_company_id
    and a.type = 'order_reversal'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_approval_id is null then
    v_approval_id := public.create_approval(
      v_company_id, 'order_reversal',
      jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
  end if;

  return jsonb_build_object('status', 'approval_required', 'approval_id', v_approval_id);
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_request / deny_request (ManageApprovals-gated).
-- Approval executes the gated action where applicable.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id and status = 'pending'
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  update public.approvals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  -- Execute the gated action.
  if v_approval.type = 'order_reversal' then
    perform public.do_void(
      (v_approval.metadata ->> 'order_id')::uuid,
      coalesce(v_approval.metadata ->> 'reason', 'approved reversal')
    );
  end if;
  -- below_wholesale: approval simply unblocks complete_order (no action here).
  -- overdraft: recorded pre-approved; nothing to execute.

  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid,
  p_reason text default null
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

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  update public.approvals
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id and company_id = v_company_id and status = 'pending';

  if not found then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid, text) from anon, public;
revoke execute on function public.deny_request(uuid, text) from anon, public;
grant execute on function public.approve_request(uuid, text) to authenticated;
grant execute on function public.deny_request(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0023_aging_settings (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- update_payment_method: enable/disable + reconciliation flag.
-- ---------------------------------------------------------------------------
create or replace function public.update_payment_method(
  p_code text,
  p_enabled boolean default null,
  p_requires_reconciliation boolean default null
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

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_payment_method(text, boolean, boolean) from anon, public;
grant execute on function public.update_payment_method(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- [squashed] 0033_customer_bulk_payment (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0033_customer_bulk_payment.sql
-- Allocate one received customer payment oldest-credit-order first. The
-- existing allocation RPC remains the source of payment + ledger truth.

create or replace function public.post_customer_payment(
  p_customer_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_remaining bigint := p_amount;
  v_due bigint;
  v_take bigint;
  v_total_due bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from public.customers where id = p_customer_id
      and company_id = v_company_id and not is_supplier
  ) then raise exception 'customer_not_found'; end if;

  select coalesce(sum(o.total - coalesce(p.paid, 0)), 0)::bigint into v_total_due
  from public.orders o
  left join (
    select order_id, sum(amount)::bigint paid from public.payments
    where company_id = v_company_id and status = 'settled' group by order_id
  ) p on p.order_id = o.id
  where o.company_id = v_company_id and o.customer_id = p_customer_id
    and o.is_credit_sale and o.status = 'completed';
  if p_amount > v_total_due then raise exception 'payment_exceeds_customer_balance'; end if;

  for v_order in
    select o.id, o.code, o.total - coalesce(p.paid, 0) as due
    from public.orders o
    left join (
      select order_id, sum(amount)::bigint paid from public.payments
      where company_id = v_company_id and status = 'settled' group by order_id
    ) p on p.order_id = o.id
    where o.company_id = v_company_id and o.customer_id = p_customer_id
      and o.is_credit_sale and o.status = 'completed'
      and o.total - coalesce(p.paid, 0) > 0
    order by o.created_at, o.id
    for update of o
  loop
    exit when v_remaining <= 0;
    v_due := v_order.due;
    v_take := least(v_remaining, v_due);
    perform public.post_payment_allocation(
      v_order.id, v_take, p_method_code,
      case when p_reference is null then null
           else p_reference || ' · ' || v_order.code end
    );
    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.id, 'order_code', v_order.code, 'amount', v_take
    );
    v_remaining := v_remaining - v_take;
  end loop;

  return jsonb_build_object('amount', p_amount, 'allocations', v_allocations);
end;
$$;

revoke execute on function public.post_customer_payment(uuid, bigint, text, text)
  from anon, public;
grant execute on function public.post_customer_payment(uuid, bigint, text, text)
  to authenticated;


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0037_delete_proforma (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Proformas are non-posting draft orders. Any active company member may remove one,
-- matching the existing save/edit behavior. Tenant scoping and the state check keep
-- posted and parked sales outside this destructive path.

create or replace function public.delete_proforma(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order.id is null then
    raise exception 'proforma_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'draft' then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and status = 'pending'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id and company_id = v_company_id and status = 'draft';

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0049_proforma_expiry (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Proformas are valid for a configurable number of days (30 by default).
-- Expiry is stamped when the proforma is created, so later setting changes
-- apply to new proformas without silently changing an issued document.

alter table public.companies
  add column proforma_validity_days integer not null default 30
  check (proforma_validity_days between 1 and 3650);

grant update (proforma_validity_days) on public.companies to authenticated;

alter table public.orders
  add column expires_at timestamptz;

update public.orders o
set expires_at = o.created_at + make_interval(days => c.proforma_validity_days)
from public.companies c
where c.id = o.company_id;

alter table public.orders
  alter column expires_at set not null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('draft', 'expired', 'pending_payment', 'completed', 'voided'));

create index orders_active_proformas_idx
  on public.orders (company_id, expires_at desc)
  where status = 'draft';

-- Stamp the validity window for all order creation paths. Orders begin as
-- drafts, including sales that are completed immediately by post_sale.
create or replace function public.set_order_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_validity_days integer;
begin
  if new.expires_at is null then
    select c.proforma_validity_days into v_validity_days
    from public.companies c
    where c.id = new.company_id;

    new.expires_at := coalesce(new.created_at, now())
      + make_interval(days => coalesce(v_validity_days, 30));
  end if;
  return new;
end;
$$;

create trigger orders_set_expiry
  before insert on public.orders
  for each row execute function public.set_order_expiry();

-- A conversion must not succeed merely because the expiry sweep has not run
-- yet. Raising from this trigger rolls the whole sale posting back atomically.
create or replace function public.enforce_proforma_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft'
     and new.status not in ('draft', 'expired')
     and old.expires_at <= now() then
    raise exception 'proforma_expired: % expired at %', old.id, old.expires_at;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_proforma_expiry
  before update of status on public.orders
  for each row execute function public.enforce_proforma_expiry();

-- Called opportunistically by the app before list/count reads. The time check
-- in queries and the conversion trigger remain authoritative between sweeps.
create or replace function public.expire_proformas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_expired integer;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.approvals a
  set status = 'denied',
      decided_at = now(),
      decision_reason = 'Proforma expired'
  where a.company_id = v_company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and exists (
      select 1
      from public.orders o
      where o.id::text = a.metadata ->> 'order_id'
        and o.company_id = v_company_id
        and o.status = 'draft'
        and o.expires_at <= now()
    );

  update public.orders
  set status = 'expired', updated_at = now()
  where company_id = v_company_id
    and status = 'draft'
    and expires_at <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

revoke execute on function public.expire_proformas() from public, anon;
grant execute on function public.expire_proformas() to authenticated, service_role;

-- Mark existing stale proformas immediately during deployment.
update public.approvals a
set status = 'denied',
    decided_at = now(),
    decision_reason = 'Proforma expired'
where a.type = 'below_wholesale'
  and a.status = 'pending'
  and exists (
    select 1
    from public.orders o
    where o.id::text = a.metadata ->> 'order_id'
      and o.company_id = a.company_id
      and o.status = 'draft'
      and o.expires_at <= now()
  );

update public.orders
set status = 'expired', updated_at = now()
where status = 'draft' and expires_at <= now();

-- Expired proformas remain removable from the history list.
create or replace function public.delete_proforma(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order.id is null then
    raise exception 'proforma_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'expired') then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id
    and company_id = v_company_id
    and status in ('draft', 'expired');

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0050_location_foundation (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- Location ownership for operational roots.
alter table public.orders
  add column if not exists location_id uuid references public.stock_locations(id),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

create or replace function public.post_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  return public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref);
end;
$$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- [squashed] 0050_staff_sales_performance (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0050_staff_sales_performance.sql
-- Durable staff identity, explicit sale-completion attribution, refund safety,
-- and server-side staff performance read models.

-- ---------------------------------------------------------------------------
-- Permissions. Staff sales figures are intentionally separate from the full
-- ledger permission; Admin and Manager receive the new permission by default.
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = permissions
    || array['ViewStaffPerformance', 'ManageCommissions']::text[],
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not (permissions @> array['ViewStaffPerformance', 'ManageCommissions']::text[]);

-- New companies must receive the same defaults. The stored provisioning
-- function uses a literal permission array, so patch that definition in place.
do $$
declare
  v_definition text;
  v_old text := '''ViewAuditTrail''';
  v_new text := '''ViewAuditTrail'', ''ViewStaffPerformance'', ''ManageCommissions''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text)'::regprocedure)
    into v_definition;

  if position('''ViewStaffPerformance''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add staff performance permissions to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durable staff directory. Memberships can be deleted; this identity record
-- remains so old sales and commission statements keep a useful label.
-- user_id deliberately has no auth.users FK for the same retention reason.
-- ---------------------------------------------------------------------------
create table public.company_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  last_role_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_staff_profiles_company_name_idx
  on public.company_staff_profiles (company_id, display_name);

alter table public.company_staff_profiles enable row level security;

create policy "staff profiles readable by permitted members"
  on public.company_staff_profiles for select
  using (
    company_id = (select public.current_company_id())
    and (
      user_id = auth.uid()
      or (select public.current_user_has_permission('ManageTeam'))
      or (select public.current_user_has_permission('ViewStaffPerformance'))
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

grant select on public.company_staff_profiles to authenticated;
grant all on public.company_staff_profiles to service_role;

create or replace function public.staff_fallback_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(concat_ws(' ',
      nullif(u.raw_user_meta_data ->> 'first_name', ''),
      nullif(u.raw_user_meta_data ->> 'last_name', '')
    )), ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    case
      when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
        then 'Staff ••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
      else null
    end,
    'Staff …' || right(p_user_id::text, 6)
  )
  from auth.users u
  where u.id = p_user_id
  union all
  select 'Staff …' || right(p_user_id::text, 6)
  where not exists (select 1 from auth.users u where u.id = p_user_id)
  limit 1
$$;

revoke execute on function public.staff_fallback_name(uuid) from authenticated, anon, public;
grant execute on function public.staff_fallback_name(uuid) to service_role;

insert into public.company_staff_profiles (company_id, user_id, display_name, last_role_name)
select
  m.company_id,
  m.user_id,
  public.staff_fallback_name(m.user_id),
  r.name
from public.company_memberships m
left join public.roles r on r.id = m.role_id
on conflict (company_id, user_id) do update
set last_role_name = excluded.last_role_name,
    updated_at = now();

create or replace function public.sync_staff_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  select r.name into v_role_name from public.roles r where r.id = new.role_id;

  insert into public.company_staff_profiles (
    company_id, user_id, display_name, last_role_name
  ) values (
    new.company_id,
    new.user_id,
    public.staff_fallback_name(new.user_id),
    v_role_name
  )
  on conflict (company_id, user_id) do update
  set last_role_name = excluded.last_role_name,
      updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_staff_profile_from_membership()
  from authenticated, anon, public;

create trigger company_memberships_staff_profile
  after insert or update of role_id on public.company_memberships
  for each row execute function public.sync_staff_profile_from_membership();

create trigger company_staff_profiles_audit
  after insert or update or delete on public.company_staff_profiles
  for each row execute function public.audit_trigger();

create or replace function public.update_staff_display_name(
  p_membership_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_profile_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then
    raise exception 'invalid_display_name';
  end if;

  select m.user_id into v_user_id
  from public.company_memberships m
  where m.id = p_membership_id and m.company_id = v_company_id;
  if v_user_id is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  insert into public.company_staff_profiles (company_id, user_id, display_name)
  values (v_company_id, v_user_id, trim(p_display_name))
  on conflict (company_id, user_id) do update
  set display_name = excluded.display_name,
      updated_at = now()
  returning id into v_profile_id;

  return v_profile_id;
end;
$$;

revoke execute on function public.update_staff_display_name(uuid, text) from anon, public;
grant execute on function public.update_staff_display_name(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Completion attribution. created_by remains the seller/originator;
-- completed_by captures the actor who finalized or settled the sale.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

update public.orders
set completed_at = created_at,
    completed_by = created_by
where status in ('completed', 'voided')
  and completed_at is null;

create index orders_company_completed_idx
  on public.orders (company_id, completed_at desc)
  where completed_at is not null;

create index orders_company_seller_completed_idx
  on public.orders (company_id, created_by, completed_at desc)
  where completed_at is not null;

create or replace function public.capture_order_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

create trigger orders_capture_completion
  before update on public.orders
  for each row execute function public.capture_order_completion();

-- ---------------------------------------------------------------------------
-- Refund hardening: completed sale only, and never more than cash collected
-- and not previously refunded. The order row lock serializes concurrent calls.
-- ---------------------------------------------------------------------------
create or replace function public.post_refund(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_refund_id uuid;
  v_collected bigint;
  v_refunded bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed sales can be refunded';
  end if;

  select coalesce(sum(p.amount), 0)::bigint into v_collected
  from public.payments p
  where p.company_id = v_company_id
    and p.order_id = p_order_id
    and p.status = 'settled';

  select coalesce(sum(r.amount), 0)::bigint into v_refunded
  from public.refunds r
  where r.company_id = v_company_id and r.order_id = p_order_id;

  if p_amount > v_collected - v_refunded then
    raise exception 'refund_exceeds_collected: refundable amount is %',
      greatest(v_collected - v_refunded, 0);
  end if;

  select pm.ledger_account_code into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code and pm.enabled;
  if v_account_code is null then raise exception 'payment_method_not_found: %', p_method_code; end if;

  insert into public.refunds (company_id, order_id, amount, method_code, reason, created_by)
  values (v_company_id, p_order_id, p_amount, p_method_code, p_reason, auth.uid())
  returning id into v_refund_id;

  return public.post_journal_entry(
    v_company_id, 'Refund', v_refund_id::text,
    'Refund for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALES_RETURNS', 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      ),
      jsonb_build_object(
        'account_code', v_account_code, 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code
        )
      )
    )
  );
end;
$$;

revoke execute on function public.post_refund(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_refund(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Immutable collection events used by both performance and commission reads.
-- Positive payments retain their original event even if later cancelled;

-- ---------------------------------------------------------------------------
-- Staff leaderboard. All aggregation happens in PostgreSQL so report totals
-- are not truncated by PostgREST row limits.
-- ---------------------------------------------------------------------------
create or replace function public.staff_sales_performance(
  p_from date,
  p_to date
)
returns table (
  staff_user_id uuid,
  display_name text,
  role_name text,
  authorization_status text,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  cogs bigint,
  margin bigint,
  collected bigint,
  credit_sales bigint,
  voids integer,
  average_sale bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with completed as (
    select
      o.created_by as user_id,
      count(*)::int as transactions,
      coalesce(sum(o.total), 0)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs,
      coalesce(sum(o.total) filter (where o.is_credit_sale), 0)::bigint as credit_sales
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.order_id = o.id
        and exists (
          select 1 from public.ledger_journal_entries e
          where e.id = l.entry_id and e.source_type = 'InventorySaleCogs'
        )
    ) cost on true
    where o.company_id = v_company_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), refunded as (
    select o.created_by as user_id, coalesce(sum(r.amount), 0)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id and o.company_id = r.company_id
    where r.company_id = v_company_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), voided as (
    select
      o.created_by as user_id,
      count(*)::int as voids,
      coalesce(sum(o.total), 0)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      join public.ledger_journal_entries ce on ce.id = l.entry_id
      where l.order_id = o.id and ce.source_type = 'InventorySaleCogs'
    ) cost on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), collection as (
    select c.staff_user_id as user_id, coalesce(sum(c.basis_amount), 0)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    group by c.staff_user_id
  ), people as (
    select p.user_id from public.company_staff_profiles p where p.company_id = v_company_id
    union select c.user_id from completed c
    union select r.user_id from refunded r
    union select v.user_id from voided v
    union select c.user_id from collection c
  )
  select
    people.user_id,
    coalesce(p.display_name, 'Unassigned'),
    coalesce(r.name, p.last_role_name),
    coalesce(m.authorization_status, 'removed'),
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(f.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))::bigint,
    (
      coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0)
      - (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))
    )::bigint,
    coalesce(col.collected, 0),
    coalesce(c.credit_sales, 0),
    coalesce(v.voids, 0),
    case when coalesce(c.transactions, 0) - coalesce(v.voids, 0) <= 0 then 0
      else round(
        (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::numeric
        / (c.transactions - coalesce(v.voids, 0))
      )::bigint
    end
  from people
  left join public.company_staff_profiles p
    on p.company_id = v_company_id and p.user_id is not distinct from people.user_id
  left join public.company_memberships m
    on m.company_id = v_company_id and m.user_id is not distinct from people.user_id
  left join public.roles r on r.id = m.role_id
  left join completed c on c.user_id is not distinct from people.user_id
  left join refunded f on f.user_id is not distinct from people.user_id
  left join voided v on v.user_id is not distinct from people.user_id
  left join collection col on col.user_id is not distinct from people.user_id
  order by 9 desc, 2;
end;
$$;

revoke execute on function public.staff_sales_performance(date, date) from anon, public;
grant execute on function public.staff_sales_performance(date, date) to authenticated;

create or replace function public.staff_sales_daily(
  p_from date,
  p_to date,
  p_staff_user_id uuid
)
returns table (
  day date,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  collected bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ), completed as (
    select
      (o.completed_at at time zone 'Africa/Nairobi')::date as day,
      count(*)::int as transactions,
      sum(o.total)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where o.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (o.completed_at at time zone 'Africa/Nairobi')::date
  ), refunded as (
    select (r.created_at at time zone 'Africa/Nairobi')::date as day,
      sum(r.amount)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id
    where r.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (r.created_at at time zone 'Africa/Nairobi')::date
  ), voided as (
    select (e.posted_at at time zone 'Africa/Nairobi')::date as day,
      sum(o.total)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and o.created_by is not distinct from p_staff_user_id
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (e.posted_at at time zone 'Africa/Nairobi')::date
  ), collection as (
    select c.occurred_on as day, sum(c.basis_amount)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    where c.staff_user_id is not distinct from p_staff_user_id
    group by c.occurred_on
  )
  select
    d.day,
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(r.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(r.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    coalesce(col.collected, 0)
  from days d
  left join completed c on c.day = d.day
  left join refunded r on r.day = d.day
  left join voided v on v.day = d.day
  left join collection col on col.day = d.day
  order by d.day;
end;
$$;

revoke execute on function public.staff_sales_daily(date, date, uuid) from anon, public;
grant execute on function public.staff_sales_daily(date, date, uuid) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0051_commissions (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0051_commissions.sql
-- Effective-dated commission plans and immutable, reviewable period statements.
-- V1 tracks approval/payment state but deliberately does not post payroll ledger entries.

create table public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (company_id, name)
);

create table public.commission_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.commission_plans (id),
  staff_user_id uuid not null,
  effective_from date not null,
  effective_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index commission_assignments_staff_dates_idx
  on public.commission_assignments (company_id, staff_user_id, effective_from, effective_to);

create table public.commission_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (company_id, start_date, end_date)
);

create table public.commission_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_id uuid not null references public.commission_periods (id) on delete cascade,
  plan_id uuid references public.commission_plans (id),
  staff_user_id uuid not null,
  staff_name text not null,
  event_key text not null,
  event_type text not null check (
    event_type in ('payment', 'payment_reversal', 'refund', 'void', 'adjustment')
  ),
  order_id uuid references public.orders (id),
  occurred_on date not null,
  basis_amount bigint not null,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  commission_amount bigint not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (period_id, staff_user_id, event_key)
);

create index commission_lines_staff_idx
  on public.commission_lines (company_id, staff_user_id, occurred_on desc);
create index commission_lines_period_idx
  on public.commission_lines (period_id, staff_user_id);

alter table public.commission_plans enable row level security;
alter table public.commission_assignments enable row level security;
alter table public.commission_periods enable row level security;
alter table public.commission_lines enable row level security;

grant select on public.commission_plans to authenticated;
grant select on public.commission_assignments to authenticated;
grant select on public.commission_periods to authenticated;
grant select on public.commission_lines to authenticated;
grant all on public.commission_plans to service_role;
grant all on public.commission_assignments to service_role;
grant all on public.commission_periods to service_role;
grant all on public.commission_lines to service_role;

create trigger commission_plans_audit
  after insert or update or delete on public.commission_plans
  for each row execute function public.audit_trigger();
create trigger commission_assignments_audit
  after insert or update or delete on public.commission_assignments
  for each row execute function public.audit_trigger();
create trigger commission_periods_audit
  after insert or update or delete on public.commission_periods
  for each row execute function public.audit_trigger();
create trigger commission_lines_audit
  after insert or update or delete on public.commission_lines
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Plan management.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_commission_plan(
  p_name text,
  p_rate_bps integer,
  p_effective_from date,
  p_effective_to date default null,
  p_active boolean default true,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_plan_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'invalid_plan_name';
  end if;
  if p_rate_bps is null or p_rate_bps < 0 or p_rate_bps > 10000 then
    raise exception 'invalid_commission_rate';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;

  if p_plan_id is null then
    insert into public.commission_plans (
      company_id, name, rate_bps, effective_from, effective_to, active, created_by
    ) values (
      v_company_id, trim(p_name), p_rate_bps, p_effective_from, p_effective_to,
      coalesce(p_active, true), auth.uid()
    ) returning id into v_plan_id;
  else
    update public.commission_plans
    set name = trim(p_name),
        rate_bps = p_rate_bps,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_plan_id and company_id = v_company_id
    returning id into v_plan_id;
    if v_plan_id is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  from anon, public;
grant execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  to authenticated;

create or replace function public.assign_commission_plan(
  p_plan_id uuid,
  p_staff_user_id uuid,
  p_effective_from date,
  p_effective_to date default null,
  p_assignment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_assignment_id uuid;
  v_plan record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;
  if not exists (
    select 1 from public.company_staff_profiles p
    where p.company_id = v_company_id and p.user_id = p_staff_user_id
  ) then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  select * into v_plan from public.commission_plans
  where id = p_plan_id and company_id = v_company_id;
  if v_plan is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  if not v_plan.active then raise exception 'commission_plan_inactive'; end if;

  if exists (
    select 1 from public.commission_assignments a
    where a.company_id = v_company_id
      and a.staff_user_id = p_staff_user_id
      and (p_assignment_id is null or a.id <> p_assignment_id)
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then raise exception 'commission_assignment_overlap'; end if;

  if p_assignment_id is null then
    insert into public.commission_assignments (
      company_id, plan_id, staff_user_id, effective_from, effective_to, created_by
    ) values (
      v_company_id, p_plan_id, p_staff_user_id, p_effective_from, p_effective_to, auth.uid()
    ) returning id into v_assignment_id;
  else
    update public.commission_assignments
    set plan_id = p_plan_id,
        staff_user_id = p_staff_user_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        updated_at = now()
    where id = p_assignment_id and company_id = v_company_id
    returning id into v_assignment_id;
    if v_assignment_id is null then
      raise exception 'commission_assignment_not_found: %', p_assignment_id;
    end if;
  end if;

  return v_assignment_id;
end;
$$;

revoke execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  from anon, public;
grant execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Generate/re-generate a draft statement from immutable collection events.
-- Approved/paid periods are locked and never recalculated.
-- ---------------------------------------------------------------------------
create or replace function public.generate_commission_period(
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_period_id uuid;
  v_status text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_date_range';
  end if;

  select id, status into v_period_id, v_status
  from public.commission_periods
  where company_id = v_company_id and start_date = p_start_date and end_date = p_end_date
  for update;

  if v_period_id is null then
    if exists (
      select 1 from public.commission_periods p
      where p.company_id = v_company_id
        and daterange(p.start_date, p.end_date, '[]')
            && daterange(p_start_date, p_end_date, '[]')
    ) then raise exception 'commission_period_overlap'; end if;

    insert into public.commission_periods (
      company_id, start_date, end_date, status, created_by
    ) values (
      v_company_id, p_start_date, p_end_date, 'draft', auth.uid()
    ) returning id into v_period_id;
  elsif v_status <> 'draft' then
    raise exception 'commission_period_locked: %', v_status;
  end if;

  -- Manual adjustments survive regeneration; only generated event lines are rebuilt.
  delete from public.commission_lines
  where period_id = v_period_id and event_type <> 'adjustment';

  insert into public.commission_lines (
    company_id, period_id, plan_id, staff_user_id, staff_name,
    event_key, event_type, order_id, occurred_on, basis_amount,
    rate_bps, commission_amount, created_by
  )
  select
    v_company_id,
    v_period_id,
    p.id,
    e.staff_user_id,
    coalesce(sp.display_name, 'Staff …' || right(e.staff_user_id::text, 6)),
    e.event_key,
    e.event_type,
    e.order_id,
    e.occurred_on,
    e.basis_amount,
    p.rate_bps,
    round(e.basis_amount::numeric * p.rate_bps / 10000)::bigint,
    auth.uid()
  from public.sales_collection_events(v_company_id, p_start_date, p_end_date) e
  join public.commission_assignments a
    on a.company_id = v_company_id
   and a.staff_user_id = e.staff_user_id
   and e.occurred_on between a.effective_from and coalesce(a.effective_to, 'infinity'::date)
  join public.commission_plans p
    on p.id = a.plan_id and p.company_id = v_company_id
   and e.occurred_on between p.effective_from and coalesce(p.effective_to, 'infinity'::date)
  left join public.company_staff_profiles sp
    on sp.company_id = v_company_id and sp.user_id = e.staff_user_id
  where e.staff_user_id is not null
    and e.basis_amount <> 0;

  update public.commission_periods set updated_at = now() where id = v_period_id;
  return v_period_id;
end;
$$;

revoke execute on function public.generate_commission_period(date, date) from anon, public;
grant execute on function public.generate_commission_period(date, date) to authenticated;

create or replace function public.add_commission_adjustment(
  p_period_id uuid,
  p_staff_user_id uuid,
  p_commission_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_line_id uuid;
  v_name text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_commission_amount is null or p_commission_amount = 0 then raise exception 'invalid_amount'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'adjustment_reason_required'; end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id and p.status = 'draft'
  ) then raise exception 'commission_period_not_editable'; end if;

  select display_name into v_name from public.company_staff_profiles
  where company_id = v_company_id and user_id = p_staff_user_id;
  if v_name is null then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  insert into public.commission_lines (
    company_id, period_id, staff_user_id, staff_name, event_key, event_type,
    occurred_on, basis_amount, rate_bps, commission_amount, reason, created_by
  ) values (
    v_company_id, p_period_id, p_staff_user_id, v_name,
    'adjustment:' || gen_random_uuid()::text, 'adjustment',
    (now() at time zone 'Africa/Nairobi')::date, 0, 0,
    p_commission_amount, trim(p_reason), auth.uid()
  ) returning id into v_line_id;

  return v_line_id;
end;
$$;

revoke execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  from anon, public;
grant execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  to authenticated;

create or replace function public.update_commission_period_status(
  p_period_id uuid,
  p_status text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_current text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_status not in ('approved', 'paid') then raise exception 'invalid_commission_status'; end if;

  select status into v_current from public.commission_periods
  where id = p_period_id and company_id = v_company_id for update;
  if v_current is null then raise exception 'commission_period_not_found: %', p_period_id; end if;
  if (v_current = 'draft' and p_status <> 'approved')
     or (v_current = 'approved' and p_status <> 'paid')
     or v_current = 'paid' then
    raise exception 'invalid_commission_transition: % to %', v_current, p_status;
  end if;

  update public.commission_periods
  set status = p_status,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      paid_by = case when p_status = 'paid' then auth.uid() else paid_by end,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_period_id;

  return p_period_id;
end;
$$;

revoke execute on function public.update_commission_period_status(uuid, text, text)
  from anon, public;
grant execute on function public.update_commission_period_status(uuid, text, text)
  to authenticated;

-- Compact read models for the Angular page.
create or replace function public.list_commission_periods()
returns table (
  id uuid,
  start_date date,
  end_date date,
  status text,
  staff_count integer,
  basis_total bigint,
  commission_total bigint,
  approved_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;

  return query
  select
    p.id, p.start_date, p.end_date, p.status,
    count(distinct l.staff_user_id)::int,
    coalesce(sum(l.basis_amount), 0)::bigint,
    coalesce(sum(l.commission_amount), 0)::bigint,
    p.approved_at, p.paid_at
  from public.commission_periods p
  left join public.commission_lines l on l.period_id = p.id
  where p.company_id = v_company_id
  group by p.id
  order by p.start_date desc;
end;
$$;

revoke execute on function public.list_commission_periods() from anon, public;
grant execute on function public.list_commission_periods() to authenticated;

create or replace function public.commission_period_statement(p_period_id uuid)
returns table (
  staff_user_id uuid,
  staff_name text,
  basis_total bigint,
  commission_total bigint,
  event_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id
  ) then raise exception 'commission_period_not_found: %', p_period_id; end if;

  return query
  select
    l.staff_user_id,
    max(l.staff_name),
    sum(l.basis_amount)::bigint,
    sum(l.commission_amount)::bigint,
    count(*)::int
  from public.commission_lines l
  where l.period_id = p_period_id and l.company_id = v_company_id
  group by l.staff_user_id
  order by 4 desc, 2;
end;
$$;

revoke execute on function public.commission_period_statement(uuid) from anon, public;
grant execute on function public.commission_period_statement(uuid) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0052_cashier_flow_modes (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- [squashed] 0054_checkout_rework (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0054_checkout_rework.sql
-- Checkout rework: external (non-cashier-controlled) payment accounts.
--
-- A tender whose effective is_cashier_controlled is false (location override
-- in location_payment_methods wins over the company default — same coalesce
-- as available_payment_methods) cannot be dropped into a cashier session:
--   walk-in sale (no customer)          -> hard error, sale is rejected
--   customer sale, no ViewFinancials    -> order held UNPAID (pending_payment,
--                                          the state the cashier queue settles
--                                          later) + pending approval + a
--                                          company-wide notification
--   ViewFinancials holder               -> completes normally
--
-- Approval metadata shape (always the same, single or multiple tenders):
--   {"order_id": "<uuid>",
--    "tenders": [{"method": "...", "amount": 0, "reference": "..."}, ...]}
--
-- approve_request / deny_request: 'external_account_payment' is a financial
-- decision gated by ViewFinancials — ManageApprovals alone is NOT sufficient.
-- Approval settles the held order through complete_order, the exact internal
-- logic settle_order uses (payments insert + status transition + ledger).
--
-- Changes:
--   1. update_payment_method gains p_is_cashier_controlled (null = keep the
--      current value, same convention as p_enabled / p_requires_reconciliation).
--   2. approvals.type CHECK gains 'external_account_payment'.
--   3. post_sale_at_location gates external tenders and now returns a jsonb
--      status object (void_sale precedent):
--        {"status": "completed" | "parked", "order_id": "..."}
--        {"status": "approval_required", "approval_id": "...", "order_id": "..."}
--   4. enforce_order_cashier_flow exempts the approval hold: the held order
--      must reach pending_payment even when the cashier queue is disabled.
--   5. approve_request / deny_request per-type permission gates.

-- ---------------------------------------------------------------------------
-- 1. update_payment_method: + p_is_cashier_controlled.
-- New signature, so the old 3-arg function is dropped to avoid PostgREST
-- overload ambiguity (0006_sale_idempotency precedent).
-- ---------------------------------------------------------------------------
drop function public.update_payment_method(text, boolean, boolean);

create or replace function public.update_payment_method(
  p_code text,
  p_enabled boolean default null,
  p_requires_reconciliation boolean default null,
  p_is_cashier_controlled boolean default null
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

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      is_cashier_controlled = coalesce(p_is_cashier_controlled, is_cashier_controlled),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_payment_method(text, boolean, boolean, boolean) from anon, public;
grant execute on function public.update_payment_method(text, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. approvals: new type.
-- ---------------------------------------------------------------------------
alter table public.approvals drop constraint approvals_type_check;
alter table public.approvals add constraint approvals_type_check
  check (type in ('overdraft', 'customer_credit', 'below_wholesale', 'order_reversal', 'external_account_payment'));

-- ---------------------------------------------------------------------------
-- 3. post_sale_at_location: external-tender gate + jsonb result.
-- ---------------------------------------------------------------------------
drop function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text);

create or replace function public.post_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_external_tenders jsonb;
  v_order_id uuid;
  v_approval_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);

  -- Parked sales take no payment, so only live tenders are gated. 'credit'
  -- is excluded: credit sales are handled by the credit-limit logic in
  -- complete_order, not by cashier control.
  if not p_park then
    select jsonb_agg(jsonb_build_object(
             'method', t.method, 'amount', t.amount, 'reference', t.reference
           ))
    into v_external_tenders
    from (
      select p ->> 'method' as method,
             (p ->> 'amount')::bigint as amount,
             p ->> 'reference' as reference
      from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) p
    ) t
    join public.payment_methods pm
      on pm.company_id = v_company_id and pm.code = t.method
    left join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
    where t.method <> 'credit'
      and not coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled);
  end if;

  if v_external_tenders is not null then
    if p_customer_id is null then
      raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts';
    end if;

    if not public.current_user_has_permission('ViewFinancials') then
      -- Hold the order unpaid for finance sign-off. The hold flag lets the
      -- order reach pending_payment even when the cashier queue is disabled
      -- (enforce_order_cashier_flow exemption below).
      perform set_config('app.external_payment_hold', 'on', true);
      v_order_id := public.post_sale(p_customer_id, p_lines, '[]'::jsonb, true, p_client_ref);

      -- Reuse an existing pending request (idempotent client_ref replay),
      -- same pattern as void_sale.
      select a.id into v_approval_id
      from public.approvals a
      where a.company_id = v_company_id
        and a.type = 'external_account_payment'
        and a.status = 'pending'
        and a.metadata ->> 'order_id' = v_order_id::text
      limit 1;

      if v_approval_id is null then
        v_approval_id := public.create_approval(
          v_company_id, 'external_account_payment',
          jsonb_build_object('order_id', v_order_id, 'tenders', v_external_tenders)
        );

        perform public.notify(
          v_company_id, 'approval',
          'External account payment needs approval',
          'A sale was tendered to a non-cashier-controlled account and is held pending settlement.',
          '/approvals', null
        );
      end if;

      return jsonb_build_object(
        'status', 'approval_required',
        'approval_id', v_approval_id,
        'order_id', v_order_id
      );
    end if;
  end if;

  v_order_id := public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref);

  return jsonb_build_object(
    'status', case when p_park then 'parked' else 'completed' end,
    'order_id', v_order_id
  );
end;
$$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. enforce_order_cashier_flow: let approval-held orders reach
-- pending_payment regardless of the cashier-flow mode (only the marked
-- exemption is new).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_cashier_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_payment')
     -- NEW: external-account approval hold parks the order unpaid even when
     -- the cashier queue is disabled.
     and coalesce(current_setting('app.external_payment_hold', true), '') <> 'on'
     and not coalesce((
       select c.cashier_flow_enabled from public.companies c where c.id = new.company_id
     ), false) then
    raise exception 'cashier_flow_disabled: take payment and complete this sale directly';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. approve_request / deny_request: 'external_account_payment' is gated by
-- ViewFinancials (ManageApprovals alone is denied). Approval settles the held
-- order with the stored tenders via complete_order — the exact internal logic
-- settle_order uses. Denial leaves the order pending_payment so the cashier
-- queue can still settle it through normal methods.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Fetch first (any status) so the gate can be type-aware: callers holding
  -- neither permission get ViewFinancials for external payments and
  -- ManageApprovals for everything else, even on stale approvals.
  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  if v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  update public.approvals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  -- Execute the gated action.
  if v_approval.type = 'order_reversal' then
    perform public.do_void(
      (v_approval.metadata ->> 'order_id')::uuid,
      coalesce(v_approval.metadata ->> 'reason', 'approved reversal')
    );
  elsif v_approval.type = 'external_account_payment' then
    perform public.complete_order(
      (v_approval.metadata ->> 'order_id')::uuid,
      v_approval.metadata -> 'tenders',
      auth.uid()
    );
  end if;
  -- below_wholesale: approval simply unblocks complete_order (no action here).
  -- overdraft: recorded pre-approved; nothing to execute.

  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  if v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  -- The held order stays pending_payment; only the request is denied.
  update public.approvals
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid, text) from anon, public;
revoke execute on function public.deny_request(uuid, text) from anon, public;
grant execute on function public.approve_request(uuid, text) to authenticated;
grant execute on function public.deny_request(uuid, text) to authenticated;
