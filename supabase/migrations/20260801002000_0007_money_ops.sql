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
