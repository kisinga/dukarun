-- ===========================================================================
-- 20260723001000_0002_catalog.sql
-- ===========================================================================
-- Catalog: customers (counterparties), products, product_variants,
-- inventory batches/movements, FIFO, stock adjustments, product CRUD,
-- opening stock.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0004_pos (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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
-- price/wholesale_price are bigint shillings, tax-inclusive.
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
  unit_cost bigint not null check (unit_cost >= 0), -- shillings per unit
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
-- RLS + grants (writes via RPC only)
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;
alter publication supabase_realtime add table public.products;

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
revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text) from authenticated, anon, public;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- [squashed] 0011_supplier_credit (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
grant execute on function public.post_inventory_write_off(uuid, numeric, text) to authenticated;
grant execute on function public.post_inventory_adjustment(uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- [squashed] 0014_product_crud (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0014_product_crud.sql
-- Product management RPCs (writes are RPC-only; reads stay direct).

-- ---------------------------------------------------------------------------
-- create_product: sku optional (auto-generated from name + suffix when blank).
-- ---------------------------------------------------------------------------
create or replace function public.create_product(
  p_name text,
  p_price bigint,
  p_sku text default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default false,
  p_track_inventory boolean default true
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
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  v_sku := nullif(trim(coalesce(p_sku, '')), '');
  if v_sku is null then
    v_sku := left(upper(regexp_replace(p_name, '[^A-Za-z0-9]', '', 'g')), 6)
             || upper(substr(md5(v_company_id::text || p_name || now()::text), 1, 4));
  end if;

  insert into public.products (
    company_id, name, sku, barcode, price, wholesale_price,
    allow_fractional, track_inventory
  )
  values (
    v_company_id, trim(p_name), v_sku,
    nullif(trim(coalesce(p_barcode, '')), ''),
    p_price, p_wholesale_price, p_allow_fractional, p_track_inventory
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_product: partial updates; pass null to keep a field unchanged.
-- p_active deactivates/reactivates.
-- ---------------------------------------------------------------------------
create or replace function public.update_product(
  p_product_id uuid,
  p_name text default null,
  p_price bigint default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default null,
  p_track_inventory boolean default null,
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

  if p_price is not null and p_price < 0 then
    raise exception 'invalid_price';
  end if;

  update public.products
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      price = coalesce(p_price, price),
      barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
      wholesale_price = coalesce(p_wholesale_price, wholesale_price),
      allow_fractional = coalesce(p_allow_fractional, allow_fractional),
      track_inventory = coalesce(p_track_inventory, track_inventory),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  return p_product_id;
end;
$$;

revoke execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) from anon, public;
revoke execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) from anon, public;
grant execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) to authenticated;
grant execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock-per-product view for the management screen (derived from batches).
-- ---------------------------------------------------------------------------
create view public.product_stock
with (security_invoker = true) as
select
  p.company_id,
  p.id as product_id,
  coalesce(sum(b.remaining), 0) as stock,
  coalesce(sum(b.remaining * b.unit_cost), 0)::bigint as stock_value
from public.products p
left join public.inventory_batches b
  on b.product_id = p.id and b.remaining > 0
group by p.company_id, p.id;

grant select on public.product_stock to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0017_product_variants (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0019_product_with_variants (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0019_product_with_variants.sql
-- Coupled product creation: a product must be born with >= 1 variant
-- (v1's createProductWithVariants behavior). The family-only create_product
-- remains for tooling/ETL, but the app path goes through this RPC.

create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb, -- [{name?, price, sku?, barcode?, wholesale_price?, kind?, allow_fractional?, track_inventory?}]
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
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    -- Single variant with no label: 'Default' (hidden in the UI).
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0032_product_opening_stock (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0032_product_opening_stock.sql
-- Product creation with optional opening inventory. Product, variants, batches,
-- movements and the opening-value journal are one transaction.

alter table public.inventory_batches
  add column if not exists batch_number text;

-- A real opening balance is equity, not a supplier purchase or cash payment.
insert into public.ledger_accounts (company_id, code, name, type, is_system)
select c.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true
from public.companies c
on conflict (company_id, code) do nothing;

create or replace function public.ensure_opening_balance_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (company_id, code, name, type, is_system)
  values (new.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true)
  on conflict (company_id, code) do nothing;
  return new;
end;
$$;

create trigger companies_opening_balance_account
after insert on public.companies
for each row execute function public.ensure_opening_balance_account();

create or replace function public.create_catalog_product(
  p_name text,
  p_variants jsonb,
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
  v_product_id uuid;
  v_variant_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := coalesce((v_variant ->> 'allow_fractional')::boolean, false);
    v_quantity := coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0);

    if v_quantity < 0 then raise exception 'invalid_opening_quantity'; end if;
    if v_quantity > 0 and not v_track then
      raise exception 'opening_stock_requires_tracked_good';
    end if;
    if v_quantity > 0 and not v_fractional and v_quantity <> trunc(v_quantity) then
      raise exception 'fractional_opening_stock_not_allowed';
    end if;
    if v_quantity > 0 and nullif(v_variant ->> 'opening_unit_cost', '') is null then
      raise exception 'opening_unit_cost_required';
    end if;

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::bigint, 0);
    if v_unit_cost < 0 then raise exception 'invalid_opening_unit_cost'; end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    ) values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track
    ) returning id into v_variant_id;

    if v_quantity > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;

      v_location_id := nullif(v_variant ->> 'opening_location_id', '')::uuid;
      if v_location_id is null then
        select id into v_location_id from public.stock_locations
        where company_id = v_company_id and code = 'MAIN' limit 1;
      end if;
      if not exists (
        select 1 from public.stock_locations
        where id = v_location_id and company_id = v_company_id
      ) then raise exception 'invalid_stock_location'; end if;

      v_line_value := round(v_quantity * v_unit_cost);
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_product_id::text,
        jsonb_build_object('openingStock', true, 'productId', v_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_product_id::text,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id))
      )
    );
  end if;

  return v_product_id;
end;
$$;

revoke execute on function public.create_catalog_product(text, jsonb, text, text)
  from anon, public;
grant execute on function public.create_catalog_product(text, jsonb, text, text)
  to authenticated;


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0045_coupled_product_edit (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0045_coupled_product_edit.sql
-- Product family details and all submitted variants update in one transaction.
-- Existing variants are updated in place; rows without variant_id are created.

create or replace function public.update_catalog_product(
  p_product_id uuid,
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_variant jsonb;
  v_variant_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_active boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_opening_source_id text;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  update public.products
  set name = trim(p_name),
      barcode = nullif(trim(coalesce(p_barcode, '')), ''),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then raise exception 'product_not_found: %', p_product_id; end if;

  -- A product may gain opening-stock variants in more than one edit. Use a
  -- per-edit source id so post_journal_entry's idempotency key does not hide
  -- later opening-value journals behind the product's original one.
  v_opening_source_id := p_product_id::text || ':' || gen_random_uuid()::text;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_variant_id := nullif(v_variant ->> 'variant_id', '')::uuid;
    if v_variant_id is not null and v_variant_id = any(v_seen_ids) then
      raise exception 'duplicate_variant: %', v_variant_id;
    end if;
    if v_variant_id is not null then v_seen_ids := array_append(v_seen_ids, v_variant_id); end if;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    if (v_variant ->> 'price') is null or (v_variant ->> 'price')::bigint < 0 then
      raise exception 'invalid_price: every variant needs a valid price';
    end if;
    if (v_variant ->> 'wholesale_price') is not null
       and (v_variant ->> 'wholesale_price')::bigint < 0 then
      raise exception 'invalid_wholesale_price';
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := case when v_kind = 'service' then false
                         else coalesce((v_variant ->> 'allow_fractional')::boolean, false) end;
    v_active := coalesce((v_variant ->> 'active')::boolean, true);
    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');

    if v_variant_id is not null then
      if coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0) <> 0 then
        raise exception 'opening_stock_new_variants_only';
      end if;

      update public.product_variants
      set name = v_label,
          kind = v_kind,
          sku = coalesce(v_sku, sku),
          barcode = nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
          price = (v_variant ->> 'price')::bigint,
          wholesale_price = nullif(v_variant ->> 'wholesale_price', '')::bigint,
          allow_fractional = v_fractional,
          track_inventory = v_track,
          active = v_active,
          updated_at = now()
      where id = v_variant_id
        and product_id = p_product_id
        and company_id = v_company_id;

      if not found then raise exception 'variant_not_found: %', v_variant_id; end if;
      continue;
    end if;

    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || p_product_id::text || v_label), 1, 4));
    end if;

    v_quantity := coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0);
    if v_quantity < 0 then raise exception 'invalid_opening_quantity'; end if;
    if v_quantity > 0 and not v_track then
      raise exception 'opening_stock_requires_tracked_good';
    end if;
    if v_quantity > 0 and not v_fractional and v_quantity <> trunc(v_quantity) then
      raise exception 'fractional_opening_stock_not_allowed';
    end if;
    if v_quantity > 0 and nullif(v_variant ->> 'opening_unit_cost', '') is null then
      raise exception 'opening_unit_cost_required';
    end if;

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::bigint, 0);
    if v_unit_cost < 0 then raise exception 'invalid_opening_unit_cost'; end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory, active
    ) values (
      p_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track, v_active
    ) returning id into v_variant_id;

    if v_quantity > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;

      v_location_id := nullif(v_variant ->> 'opening_location_id', '')::uuid;
      if v_location_id is null then
        select id into v_location_id from public.stock_locations
        where company_id = v_company_id and code = 'MAIN' limit 1;
      end if;
      if not exists (
        select 1 from public.stock_locations
        where id = v_location_id and company_id = v_company_id
      ) then raise exception 'invalid_stock_location'; end if;

      v_line_value := round(v_quantity * v_unit_cost);
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_opening_source_id,
        jsonb_build_object('openingStock', true, 'productId', p_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_opening_source_id,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id))
      )
    );
  end if;

  return p_product_id;
end;
$$;

revoke execute on function public.update_catalog_product(uuid, text, jsonb, text, boolean)
  from anon, public;
grant execute on function public.update_catalog_product(uuid, text, jsonb, text, boolean)
  to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0046_counted_stock_adjustment (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Replace the ambiguous ledger-only value adjustment with a quantity-count workflow.
-- The caller supplies the quantity they saw before counting and the quantity counted now.
-- Decreases consume FIFO batches; increases create a valued inventory batch.

drop function if exists public.post_inventory_adjustment(uuid, bigint, text);

create or replace function public.post_stock_adjustment(
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_adjustment_id uuid := gen_random_uuid();
  v_current_quantity numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_track_inventory boolean;
  v_kind text;
  v_unit_cost bigint;
  v_total_value bigint;
  v_batch_id uuid;
  v_location_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_expected_quantity is null or p_expected_quantity < 0 then
    raise exception 'invalid_expected_quantity';
  end if;

  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'new_quantity_must_be_zero_or_more';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'adjustment_reason_required';
  end if;

  select v.allow_fractional, v.track_inventory, v.kind
    into v_allow_fractional, v_track_inventory, v_kind
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
  for update;

  if not found then
    raise exception 'variant_not_found';
  end if;

  if not v_track_inventory or v_kind = 'service' then
    raise exception 'variant_does_not_track_inventory';
  end if;

  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  -- Serialize changes to the currently-known valuation layers before checking the count.
  perform 1
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
  order by b.id
  for update;

  select coalesce(sum(b.remaining), 0)
    into v_current_quantity
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id;

  if v_current_quantity <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current_quantity;
  end if;

  v_change := p_new_quantity - v_current_quantity;
  if v_change = 0 then
    return null;
  end if;

  if v_change < 0 then
    -- Existing write-off logic consumes FIFO and posts the correct loss account.
    return public.post_inventory_write_off(p_variant_id, abs(v_change), trim(p_reason));
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost
      into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc
    limit 1;
  end if;

  if v_unit_cost is null or v_unit_cost <= 0 then
    raise exception 'unit_cost_required_for_stock_increase';
  end if;

  select l.id
    into v_location_id
  from public.stock_locations l
  where l.company_id = v_company_id
  order by l.is_default desc, (l.code = 'MAIN') desc, l.created_at asc
  limit 1;

  if v_location_id is null then
    raise exception 'stock_location_required';
  end if;

  v_total_value := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches (
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  )
  returning id into v_batch_id;

  insert into public.inventory_movements (
    company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
    source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, 'adjustment', v_change, v_unit_cost,
    v_total_value, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object(
      'reason', trim(p_reason),
      'previousQuantity', v_current_quantity,
      'newQuantity', p_new_quantity
    )
  );

  return public.post_journal_entry(
    v_company_id,
    'StockAdjustment',
    v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'INVENTORY',
        'debit', v_total_value,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id,
          'variantId', p_variant_id,
          'batchId', v_batch_id,
          'reason', trim(p_reason),
          'previousQuantity', v_current_quantity,
          'newQuantity', p_new_quantity
        )
      ),
      jsonb_build_object(
        'account_code', 'INVENTORY_ADJUSTMENT',
        'credit', v_total_value,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id,
          'variantId', p_variant_id,
          'batchId', v_batch_id,
          'reason', trim(p_reason),
          'previousQuantity', v_current_quantity,
          'newQuantity', p_new_quantity
        )
      )
    )
  );
end;
$$;

revoke execute on function public.post_stock_adjustment(uuid, numeric, numeric, text, bigint)
  from anon, public;
grant execute on function public.post_stock_adjustment(uuid, numeric, numeric, text, bigint)
  to authenticated;

-- ----------------------------------------------------------------------------
