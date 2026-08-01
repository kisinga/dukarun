-- 0017_product_variants.sql
-- Product variants remodel: two-level catalog (product family + sellable
-- variants) replacing the flattened one-row-per-SKU model.
-- NOT rebuilding Vendure's option matrix: the variant name IS the option
-- label ('S', '1kg'). Everything sellable (order lines, batches, movements,
-- purchases) points at the variant. Dev-stage data is migrated 1:1
-- (each existing product becomes product + one 'Default' variant).

-- ---------------------------------------------------------------------------
-- 1. product_variants table
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null, -- the option label: 'Default', 'S', '1kg', ...
  kind text not null default 'good' check (kind in ('good', 'service')),
  sku text not null,
  barcode text, -- overrides the product-level family barcode when set
  price bigint not null check (price >= 0),
  wholesale_price bigint check (wholesale_price >= 0),
  allow_fractional boolean not null default false,
  track_inventory boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku),
  -- services are never stocked
  check (kind = 'good' or track_inventory = false)
);

create unique index product_variants_barcode_idx
  on public.product_variants (company_id, barcode) where barcode is not null;

create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_company_idx on public.product_variants (company_id);

alter table public.product_variants enable row level security;

create policy "variants readable by members"
  on public.product_variants for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.product_variants to authenticated;
grant all on public.product_variants to service_role;

create trigger product_variants_audit
  after insert or update or delete on public.product_variants
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 2. Backfill: one 'Default' variant per existing product
-- ---------------------------------------------------------------------------
insert into public.product_variants (
  product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
  allow_fractional, track_inventory, active
)
select id, company_id, 'Default',
       case when track_inventory then 'good' else 'service' end,
       sku, barcode, price, wholesale_price,
       allow_fractional, track_inventory, active
from public.products;

-- ---------------------------------------------------------------------------
-- 3. Repoint sellable references at variants
-- ---------------------------------------------------------------------------
-- product_stock (from 0014) depends on inventory_batches.product_id; it is
-- recreated per-variant in section 5 below.
drop view public.product_stock;

alter table public.order_lines add column variant_id uuid references public.product_variants (id);
update public.order_lines l set variant_id = v.id
from public.product_variants v where v.product_id = l.product_id;
alter table public.order_lines alter column variant_id set not null;
alter table public.order_lines drop column product_id;
create index order_lines_variant_idx on public.order_lines (variant_id);

alter table public.inventory_batches add column variant_id uuid references public.product_variants (id);
update public.inventory_batches b set variant_id = v.id
from public.product_variants v where v.product_id = b.product_id;
alter table public.inventory_batches alter column variant_id set not null;
alter table public.inventory_batches drop column product_id;
drop index if exists public.inventory_batches_fifo_idx;
create index inventory_batches_fifo_idx
  on public.inventory_batches (company_id, variant_id, purchased_at)
  where remaining > 0;

alter table public.inventory_movements add column variant_id uuid references public.product_variants (id);
update public.inventory_movements m set variant_id = v.id
from public.product_variants v where v.product_id = m.product_id;
alter table public.inventory_movements alter column variant_id set not null;
alter table public.inventory_movements drop column product_id;
drop index if exists public.inventory_movements_product_idx;
create index inventory_movements_variant_idx on public.inventory_movements (company_id, variant_id);

-- ---------------------------------------------------------------------------
-- 4. products becomes the family row (sellable fields move to variants)
-- ---------------------------------------------------------------------------
alter table public.products
  drop column sku,
  drop column price,
  drop column wholesale_price,
  drop column allow_fractional,
  drop column track_inventory;
-- products keeps: id, company_id, name, barcode (family), image_path, active, timestamps

drop index if exists public.products_search_idx;
drop index if exists public.products_barcode_idx;
drop index if exists public.products_company_idx;
create index products_company_idx on public.products (company_id);

-- ---------------------------------------------------------------------------
-- 5. Search/read view for POS + management screens
-- ---------------------------------------------------------------------------
create view public.variant_catalog
with (security_invoker = true) as
select
  v.id as variant_id,
  v.company_id,
  p.id as product_id,
  p.name as product_name,
  v.name as variant_name,
  v.kind,
  v.sku,
  coalesce(v.barcode, p.barcode) as barcode,
  v.price,
  v.wholesale_price,
  v.allow_fractional,
  v.track_inventory,
  v.active as variant_active,
  p.active as product_active,
  p.image_path,
  coalesce(s.stock, 0) as stock
from public.product_variants v
join public.products p on p.id = v.product_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id;

create index variant_catalog_trgm on public.product_variants using gin (
  (name || ' ' || coalesce(barcode, '') || ' ' || sku) gin_trgm_ops
);

grant select on public.variant_catalog to authenticated;

-- product_stock now per variant.
create view public.product_stock
with (security_invoker = true) as
select
  v.company_id,
  v.id as variant_id,
  coalesce(sum(b.remaining), 0) as stock,
  coalesce(sum(b.remaining * b.unit_cost), 0)::bigint as stock_value
from public.product_variants v
left join public.inventory_batches b
  on b.variant_id = v.id and b.remaining > 0
group by v.company_id, v.id;

grant select on public.product_stock to authenticated;

-- ---------------------------------------------------------------------------
-- 6. consume_fifo: variant-scoped (param renamed for clarity).
-- ---------------------------------------------------------------------------
drop function public.consume_fifo(uuid, uuid, numeric, text, text, text);

create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
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
  where company_id = p_company_id and variant_id = p_variant_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and variant_id = p_variant_id and remaining > 0
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
      company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    values (
      p_company_id, p_variant_id, v_batch.id, p_movement_type, -v_take, v_batch.unit_cost, v_cost,
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
-- 9. record_purchase / write-off / adjustment: variant-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb, -- [{variant_id, quantity, unit_cost, expiry_date?}]
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

    -- services cannot be stocked
    if exists (
      select 1 from public.product_variants sv
      where sv.id = (v_line ->> 'variant_id')::uuid and sv.kind = 'service'
    ) then
      raise exception 'cannot_stock_service: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.inventory_batches (
      company_id, variant_id, stock_location_id, supplier_id,
      quantity, remaining, unit_cost, expiry_date
    )
    values (
      v_company_id, (v_line ->> 'variant_id')::uuid, v_location_id, p_supplier_id,
      (v_line ->> 'quantity')::numeric, (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_cost')::bigint,
      nullif(v_line ->> 'expiry_date', '')::date
    );

    insert into public.inventory_movements (
      company_id, variant_id, type, quantity, unit_cost,
      total_cost, source_type, source_id
    )
    values (
      v_company_id, (v_line ->> 'variant_id')::uuid, 'purchase',
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

-- param p_product_id is renamed to p_variant_id: drop first (PG cannot rename
-- input parameters via create or replace).
drop function public.post_inventory_write_off(uuid, numeric, text);
drop function public.post_inventory_adjustment(uuid, bigint, text);

create or replace function public.post_inventory_write_off(
  p_variant_id uuid,
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

  v_fifo := public.consume_fifo(v_company_id, p_variant_id, p_quantity, 'InventoryWriteOff', v_adjustment_id::text, 'adjustment');
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

create or replace function public.post_inventory_adjustment(
  p_variant_id uuid,
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
    return null;
  end if;

  if p_value_change > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id)),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'debit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id)),
      jsonb_build_object('account_code', 'INVENTORY', 'credit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InventoryAdjustment', 'StockAdjustment:' || v_adjustment_id::text,
    coalesce(p_reason, 'Inventory adjustment'), v_lines
  );
end;
$$;

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;
grant execute on function public.post_inventory_write_off(uuid, numeric, text) to authenticated;
grant execute on function public.post_inventory_adjustment(uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Catalog RPCs: product family + variants.
-- ---------------------------------------------------------------------------
drop function public.create_product(text, bigint, text, text, bigint, boolean, boolean);
drop function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean);

create or replace function public.create_product(
  p_name text,
  p_barcode text default null,
  p_image_path text default null
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

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_product(
  p_product_id uuid,
  p_name text default null,
  p_barcode text default null,
  p_image_path text default null,
  p_active boolean default null
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

  update public.products
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
      image_path = coalesce(p_image_path, image_path),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  return p_product_id;
end;
$$;

create or replace function public.upsert_variant(
  p_product_id uuid,
  p_name text,
  p_price bigint,
  p_variant_id uuid default null,
  p_sku text default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default null,
  p_track_inventory boolean default null,
  p_active boolean default null,
  p_kind text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_sku text;
  v_product_name text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_price is not null and p_price < 0 then
    raise exception 'invalid_price';
  end if;

  select name into v_product_name
  from public.products
  where id = p_product_id and company_id = v_company_id;

  if v_product_name is null then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  if p_variant_id is not null then
    update public.product_variants
    set name = trim(p_name),
        price = coalesce(p_price, price),
        barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
        wholesale_price = coalesce(p_wholesale_price, wholesale_price),
        allow_fractional = coalesce(p_allow_fractional, allow_fractional),
        track_inventory = case
          when coalesce(p_kind, kind) = 'service' then false
          else coalesce(p_track_inventory, track_inventory)
        end,
        kind = coalesce(p_kind, kind),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_variant_id and company_id = v_company_id and product_id = p_product_id
    returning id into v_id;

    if v_id is null then
      raise exception 'variant_not_found: %', p_variant_id;
    end if;
  else
    if p_price is null then
      raise exception 'invalid_price';
    end if;

    if p_kind is not null and p_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    v_sku := nullif(trim(coalesce(p_sku, '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(v_product_name || p_name, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || p_product_id::text || p_name), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      p_product_id, v_company_id, trim(p_name), coalesce(p_kind, 'good'), v_sku,
      nullif(trim(coalesce(p_barcode, '')), ''),
      p_price, p_wholesale_price,
      coalesce(p_allow_fractional, false),
      case when coalesce(p_kind, 'good') = 'service' then false else coalesce(p_track_inventory, true) end
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_product(text, text, text)',
    'update_product(uuid, text, text, text, boolean)',
    'upsert_variant(uuid, text, bigint, uuid, text, text, bigint, boolean, boolean, boolean, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

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
