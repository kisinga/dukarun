-- 0011_supplier_credit.sql
-- Supplier purchasing + AP payments, supplier credit limits, inventory
-- write-offs and value adjustments.
-- Decision (from spec review): the old system double-posted purchases
-- (PURCHASES/AP via SupplierPurchase AND INVENTORY/AP via InventoryPurchase).
-- Only the perpetual-inventory path is implemented here:
--   DR INVENTORY / CR ACCOUNTS_PAYABLE|cash. PURCHASES stays for ETL legacy.

-- Supplier credit fields (customer is also the supplier, as upstream).
alter table public.customers
  add column supplier_credit_limit bigint not null default 0,
  add column supplier_credit_terms_days integer;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_id uuid not null references public.customers (id),
  reference text,
  total_cost bigint not null check (total_cost > 0),
  is_credit boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index purchases_supplier_idx on public.purchases (company_id, supplier_id, created_at);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id),
  amount bigint not null check (amount > 0),
  account_code text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index purchase_payments_purchase_idx on public.purchase_payments (purchase_id);

alter table public.purchases enable row level security;
alter table public.purchase_payments enable row level security;

create policy "purchases readable by members"
  on public.purchases for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "purchase payments readable by members"
  on public.purchase_payments for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.purchases to authenticated;
grant select on public.purchase_payments to authenticated;
grant all on public.purchases to service_role;
grant all on public.purchase_payments to service_role;

-- ---------------------------------------------------------------------------
-- consume_fifo: parameterize the movement type (write-offs consume FIFO too).
-- ---------------------------------------------------------------------------
drop function public.consume_fifo(uuid, uuid, numeric, text, text);

create or replace function public.consume_fifo(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
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
      p_company_id, p_product_id, v_batch.id, p_movement_type, -v_take, v_batch.unit_cost, v_cost,
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

revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) from authenticated, anon, public;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- record_purchase: batches + purchase row + DR INVENTORY / CR AP|cash.
-- p_lines: [{product_id, quantity, unit_cost, expiry_date?}]
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record;
  v_purchase_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_batch_count int := 0;
  v_ap_balance bigint;
  v_location_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_supplier
  from public.customers
  where id = p_supplier_id and company_id = v_company_id and is_supplier;

  if v_supplier is null then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  v_total := 0;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_total := v_total + round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint);
  end loop;

  if v_total <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required';
    end if;

    -- Supplier credit limit vs current AP exposure.
    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id
      and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;

    if v_supplier.supplier_credit_limit > 0
       and v_ap_balance + v_total > v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit;
    end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  select id into v_location_id
  from public.stock_locations
  where company_id = v_company_id and code = 'MAIN'
  limit 1;

  insert into public.purchases (company_id, supplier_id, reference, total_cost, is_credit, created_by)
  values (v_company_id, p_supplier_id, p_reference, v_total, p_is_credit, auth.uid())
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_batch_count := v_batch_count + 1;

    insert into public.inventory_batches (
      company_id, product_id, stock_location_id, supplier_id,
      quantity, remaining, unit_cost, expiry_date
    )
    values (
      v_company_id, (v_line ->> 'product_id')::uuid, v_location_id, p_supplier_id,
      (v_line ->> 'quantity')::numeric, (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_cost')::bigint,
      nullif(v_line ->> 'expiry_date', '')::date
    );

    insert into public.inventory_movements (
      company_id, product_id, type, quantity, unit_cost,
      total_cost, source_type, source_id
    )
    values (
      v_company_id, (v_line ->> 'product_id')::uuid, 'purchase',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::bigint,
      round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint),
      'InventoryPurchase', v_purchase_id::text
    );
  end loop;

  perform public.post_journal_entry(
    v_company_id, 'InventoryPurchase', v_purchase_id::text,
    'Purchase ' || coalesce(p_reference, v_purchase_id::text),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'batchCount', v_batch_count
        )
      ),
      jsonb_build_object(
        'account_code', case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'isCreditPurchase', p_is_credit
        )
      )
    )
  );

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pay_supplier: oldest-unpaid-first allocation; AP invariant (no overpay).
-- ---------------------------------------------------------------------------
create or replace function public.pay_supplier(
  p_supplier_id uuid,
  p_amount bigint,
  p_account_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase record;
  v_remaining bigint := p_amount;
  v_unpaid_total bigint := 0;
  v_alloc bigint;
  v_payment_id uuid;
  v_last_payment_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_account_code);

  -- Total unpaid across credit purchases.
  select coalesce(sum(p.total_cost - coalesce(paid.s, 0)), 0) into v_unpaid_total
  from public.purchases p
  left join lateral (
    select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
  ) paid on true
  where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit;

  if v_unpaid_total = 0 then
    raise exception 'no_outstanding_ap: supplier %', p_supplier_id;
  end if;

  if p_amount > v_unpaid_total then
    raise exception 'ap_overpayment: % exceeds outstanding %', p_amount, v_unpaid_total;
  end if;

  -- Oldest unpaid first.
  for v_purchase in
    select p.id, p.reference, p.total_cost - coalesce(paid.s, 0) as unpaid
    from public.purchases p
    left join lateral (
      select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
    ) paid on true
    where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit
      and p.total_cost - coalesce(paid.s, 0) > 0
    order by p.created_at asc
  loop
    exit when v_remaining <= 0;

    v_alloc := least(v_purchase.unpaid, v_remaining);
    v_remaining := v_remaining - v_alloc;

    insert into public.purchase_payments (company_id, purchase_id, amount, account_code, created_by)
    values (v_company_id, v_purchase.id, v_alloc, p_account_code, auth.uid())
    returning id into v_payment_id;

    v_last_payment_id := v_payment_id;

    perform public.post_journal_entry(
      v_company_id, 'SupplierPayment', v_payment_id::text,
      'Supplier payment ' || coalesce(v_purchase.reference, v_purchase.id::text),
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_PAYABLE', 'debit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference, 'supplierId', p_supplier_id
          )
        ),
        jsonb_build_object(
          'account_code', p_account_code, 'credit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference,
            'supplierId', p_supplier_id, 'method', p_account_code
          )
        )
      )
    );
  end loop;

  return v_last_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_inventory_write_off: FIFO consumption; EXPIRY_LOSS when the reason
-- mentions expiry, else INVENTORY_WRITE_OFF.
-- ---------------------------------------------------------------------------
create or replace function public.post_inventory_write_off(
  p_product_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_fifo jsonb;
  v_total bigint;
  v_account text;
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  v_fifo := public.consume_fifo(v_company_id, p_product_id, p_quantity, 'InventoryWriteOff', v_adjustment_id::text, 'adjustment');
  v_total := (v_fifo ->> 'total_cogs')::bigint;

  v_account := case when p_reason ilike '%expir%' then 'EXPIRY_LOSS' else 'INVENTORY_WRITE_OFF' end;

  return public.post_journal_entry(
    v_company_id, 'InventoryWriteOff', v_adjustment_id::text,
    coalesce(p_reason, 'Inventory write-off'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_account, 'debit', v_total,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id, 'reason', p_reason,
          'batchAllocations', v_fifo -> 'allocations'
        )
      ),
      jsonb_build_object(
        'account_code', 'INVENTORY', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason)
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_inventory_adjustment: value-level correction (no batch changes).
-- p_value_change signed: positive raises INVENTORY, negative lowers it.
-- ---------------------------------------------------------------------------
create or replace function public.post_inventory_adjustment(
  p_product_id uuid,
  p_value_change bigint,
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
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_value_change is null or p_value_change = 0 then
    return null; -- no-op, as upstream
  end if;

  if p_value_change > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id)),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'debit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id)),
      jsonb_build_object('account_code', 'INVENTORY', 'credit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InventoryAdjustment', 'StockAdjustment:' || v_adjustment_id::text,
    coalesce(p_reason, 'Inventory adjustment'), v_lines
  );
end;
$$;

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
revoke execute on function public.pay_supplier(uuid, bigint, text) from anon, public;
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;
grant execute on function public.pay_supplier(uuid, bigint, text) to authenticated;
grant execute on function public.post_inventory_write_off(uuid, numeric, text) to authenticated;
grant execute on function public.post_inventory_adjustment(uuid, bigint, text) to authenticated;
