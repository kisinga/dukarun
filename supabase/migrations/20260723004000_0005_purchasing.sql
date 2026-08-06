-- ===========================================================================
-- 20260723004000_0005_purchasing.sql
-- ===========================================================================
-- Purchasing: suppliers, purchases, purchase lines/drafts/payments,
-- supplier credit limits, pay_supplier/pay_purchase, purchase intelligence.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0011_supplier_credit (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
revoke execute on function public.pay_supplier(uuid, bigint, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;
grant execute on function public.pay_supplier(uuid, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0017_product_variants (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- [squashed] 0034_purchase_lifecycle (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0034_purchase_lifecycle.sql
-- Durable purchase detail, drafts, location-aware receiving and payment
-- against one selected purchase.

alter table public.purchases
  add column if not exists purchase_date date not null default current_date,
  add column if not exists notes text,
  add column if not exists stock_location_id uuid references public.stock_locations(id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  inventory_batch_id uuid references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  line_total bigint not null check (line_total >= 0),
  batch_number text,
  expiry_date date,
  created_at timestamptz not null default now()
);
create index purchase_lines_purchase_idx on public.purchase_lines(purchase_id);
alter table public.purchase_lines enable row level security;
create policy "purchase lines readable by members" on public.purchase_lines for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_lines to authenticated;
grant all on public.purchase_lines to service_role;

create table public.purchase_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  reference text,
  notes text,
  purchase_date date not null default current_date,
  lines jsonb not null,
  total_cost bigint not null check (total_cost > 0),
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  posted_purchase_id uuid references public.purchases(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_drafts enable row level security;
create policy "purchase drafts readable by members" on public.purchase_drafts for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_drafts to authenticated;
grant all on public.purchase_drafts to service_role;

create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record; v_purchase_id uuid; v_line jsonb; v_total bigint := 0;
  v_batch_count int := 0; v_ap_balance bigint; v_location_id uuid;
  v_variant_id uuid; v_quantity numeric(14,3); v_unit_cost bigint;
  v_line_total bigint; v_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  select * into v_supplier from public.customers where id = p_supplier_id
    and company_id = v_company_id and is_supplier;
  if v_supplier is null then raise exception 'supplier_not_found: %', p_supplier_id; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    then raise exception 'purchase_lines_required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
    v_unit_cost := nullif(v_line ->> 'unit_cost', '')::bigint;
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0
      then raise exception 'invalid_purchase_line'; end if;
    if not exists (select 1 from public.product_variants where id = v_variant_id
      and company_id = v_company_id and kind = 'good')
      then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round(v_quantity * v_unit_cost);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;
    if v_supplier.supplier_credit_limit > 0 and v_ap_balance + v_total > v_supplier.supplier_credit_limit
      then raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit; end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  v_location_id := p_stock_location_id;
  if v_location_id is null then select id into v_location_id from public.stock_locations
    where company_id = v_company_id and code = 'MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations where id = v_location_id and company_id = v_company_id)
    then raise exception 'invalid_stock_location'; end if;

  insert into public.purchases(company_id,supplier_id,reference,total_cost,is_credit,created_by,
    notes,purchase_date,stock_location_id)
  values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),v_total,p_is_credit,
    auth.uid(),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_purchase_date,current_date),v_location_id)
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_batch_count := v_batch_count + 1;
    v_variant_id := (v_line ->> 'variant_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_cost := (v_line ->> 'unit_cost')::bigint;
    v_line_total := round(v_quantity * v_unit_cost);
    insert into public.inventory_batches(company_id,variant_id,stock_location_id,supplier_id,
      quantity,remaining,unit_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_quantity,v_quantity,v_unit_cost,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date)
    returning id into v_batch_id;
    insert into public.purchase_lines(company_id,purchase_id,variant_id,inventory_batch_id,quantity,
      unit_cost,line_total,batch_number,expiry_date)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date);
    insert into public.inventory_movements(company_id,variant_id,batch_id,type,quantity,unit_cost,
      total_cost,source_type,source_id)
    values(v_company_id,v_variant_id,v_batch_id,'purchase',v_quantity,v_unit_cost,v_line_total,
      'InventoryPurchase',v_purchase_id::text);
  end loop;

  perform public.post_journal_entry(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase ' || coalesce(p_reference,v_purchase_id::text),jsonb_build_array(
      jsonb_build_object('account_code','INVENTORY','debit',v_total,'meta',jsonb_build_object(
        'purchaseId',v_purchase_id,'purchaseReference',p_reference,'supplierId',p_supplier_id,'batchCount',v_batch_count)),
      jsonb_build_object('account_code',case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit',v_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'purchaseReference',p_reference,
        'supplierId',p_supplier_id,'isCreditPurchase',p_is_credit))));
  return v_purchase_id;
end;
$$;

-- Remove the legacy signature to prevent PostgREST overload ambiguity.
drop function if exists public.record_purchase(uuid,jsonb,boolean,text,text);
revoke execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) from anon,public;
grant execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) to authenticated;

create or replace function public.save_purchase_draft(
  p_supplier_id uuid, p_lines jsonb, p_reference text default null,
  p_notes text default null, p_purchase_date date default current_date,
  p_draft_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_total bigint := 0;
  v_line jsonb; v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id and is_supplier)
    then raise exception 'supplier_not_found'; end if;
  if p_lines is null or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good') then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::bigint);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,total_cost,created_by)
    values(v_company_id,p_supplier_id,p_reference,p_notes,coalesce(p_purchase_date,current_date),p_lines,v_total,auth.uid()) returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=p_reference,notes=p_notes,
      purchase_date=coalesce(p_purchase_date,current_date),lines=p_lines,total_cost=v_total,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.cancel_purchase_draft(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_id uuid;
begin update public.purchase_drafts set status='cancelled',updated_at=now()
  where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
  if v_id is null then raise exception 'purchase_draft_not_found'; end if; return v_id; end;
$$;

create or replace function public.pay_purchase(p_purchase_id uuid,p_amount bigint,p_account_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_purchase public.purchases%rowtype;
  v_paid bigint; v_payment_id uuid;
begin
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_account_code);
  select * into v_purchase from public.purchases where id=p_purchase_id and company_id=v_company_id
    and is_credit for update;
  if v_purchase.id is null then raise exception 'credit_purchase_not_found'; end if;
  select coalesce(sum(amount),0) into v_paid from public.purchase_payments where purchase_id=p_purchase_id;
  if p_amount > v_purchase.total_cost-v_paid then raise exception 'ap_overpayment'; end if;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by)
  values(v_company_id,p_purchase_id,p_amount,p_account_code,auth.uid()) returning id into v_payment_id;
  perform public.post_journal_entry(v_company_id,'SupplierPayment',v_payment_id::text,
    'Supplier payment '||coalesce(v_purchase.reference,v_purchase.id::text),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id,'method',p_account_code))));
  return v_payment_id;
end;
$$;

revoke execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) from anon,public;
revoke execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) from anon,public;
revoke execute on function public.cancel_purchase_draft(uuid) from anon,public;
revoke execute on function public.pay_purchase(uuid,bigint,text) from anon,public;
grant execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) to authenticated;
grant execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) to authenticated;
grant execute on function public.cancel_purchase_draft(uuid) to authenticated;
grant execute on function public.pay_purchase(uuid,bigint,text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0042_purchase_intelligence (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Purchase decision support and reversible supplier lifecycle.

alter table public.customers
  add column if not exists supplier_active boolean not null default true;

create or replace view public.supplier_variant_performance
with (security_invoker = true) as
select
  pl.company_id,
  p.supplier_id,
  pl.variant_id,
  count(distinct pl.purchase_id)::bigint as purchase_count,
  sum(pl.quantity)::numeric as total_quantity,
  sum(pl.line_total)::bigint as total_spend,
  round(sum(pl.line_total)::numeric / nullif(sum(pl.quantity), 0))::bigint as average_unit_cost,
  min(pl.unit_cost)::bigint as lowest_unit_cost,
  max(pl.unit_cost)::bigint as highest_unit_cost,
  (array_agg(pl.unit_cost order by p.purchase_date desc, p.created_at desc, pl.created_at desc))[1]::bigint
    as last_unit_cost,
  max(p.purchase_date) as last_purchase_date
from public.purchase_lines pl
join public.purchases p on p.id = pl.purchase_id and p.company_id = pl.company_id
group by pl.company_id, p.supplier_id, pl.variant_id;

grant select on public.supplier_variant_performance to authenticated;

create or replace function public.require_active_purchase_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.supplier_id and company_id = new.company_id
      and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;
  return new;
end;
$$;

create trigger purchases_active_supplier
before insert or update of supplier_id on public.purchases
for each row execute function public.require_active_purchase_supplier();

create trigger purchase_drafts_active_supplier
before insert or update of supplier_id on public.purchase_drafts
for each row execute function public.require_active_purchase_supplier();

create or replace function public.record_purchase_with_prices(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase_id uuid;
  v_line jsonb;
  v_variant public.product_variants%rowtype;
  v_wholesale bigint;
  v_retail bigint;
begin
  if not exists (
    select 1 from public.customers
    where id = p_supplier_id and company_id = v_company_id and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;

  -- Validate all requested catalog updates before creating any purchase state.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      select * into v_variant from public.product_variants
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
      if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
      v_wholesale := coalesce(nullif(v_line ->> 'new_wholesale_price', '')::bigint,
        v_variant.wholesale_price, 0);
      v_retail := coalesce(nullif(v_line ->> 'new_retail_price', '')::bigint, v_variant.price);
      if v_wholesale < 0 or v_retail < 0 then raise exception 'invalid_price'; end if;
      if v_retail < v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  v_purchase_id := public.record_purchase(p_supplier_id, p_lines, p_is_credit, p_reference,
    p_account_code, p_notes, p_purchase_date, p_stock_location_id);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      update public.product_variants set
        wholesale_price = case when v_line ? 'new_wholesale_price'
          then (v_line ->> 'new_wholesale_price')::bigint else wholesale_price end,
        price = case when v_line ? 'new_retail_price'
          then (v_line ->> 'new_retail_price')::bigint else price end,
        updated_at = now()
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  to authenticated;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase_with_prices(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.set_supplier_active(p_supplier_id uuid, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_id uuid; v_balance bigint;
begin
  if not p_active then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId'=p_supplier_id::text;
    if v_balance <> 0 then raise exception 'supplier_has_outstanding_balance'; end if;
    if exists(select 1 from public.purchase_drafts where company_id=v_company_id
      and supplier_id=p_supplier_id and status='draft')
      then raise exception 'supplier_has_open_drafts'; end if;
  end if;
  update public.customers set supplier_active=p_active,updated_at=now()
  where id=p_supplier_id and company_id=v_company_id and is_supplier returning id into v_id;
  if v_id is null then raise exception 'supplier_not_found'; end if;
  return v_id;
end;
$$;

revoke execute on function public.set_supplier_active(uuid,boolean) from anon, public;
grant execute on function public.set_supplier_active(uuid,boolean) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0043_credit_limits (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Permission-gated supplier credit policy management.

alter table public.customers
  add constraint customers_credit_limits_nonnegative
    check (credit_limit >= 0 and supplier_credit_limit >= 0),
  add constraint customers_credit_terms_nonnegative
    check ((credit_terms_days is null or credit_terms_days >= 0)
      and (supplier_credit_terms_days is null or supplier_credit_terms_days >= 0));

create or replace function public.update_supplier_credit(
  p_supplier_id uuid,
  p_credit_limit bigint,
  p_terms_days integer default null
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

  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_supplier_credit_limit';
  end if;

  if p_terms_days is not null and p_terms_days < 0 then
    raise exception 'invalid_supplier_credit_terms';
  end if;

  update public.customers
  set supplier_credit_limit = p_credit_limit,
      supplier_credit_terms_days = p_terms_days,
      updated_at = now()
  where id = p_supplier_id
    and company_id = v_company_id
    and is_supplier;

  if not found then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  return p_supplier_id;
end;
$$;

revoke execute on function public.update_supplier_credit(uuid, bigint, integer) from anon, public;
grant execute on function public.update_supplier_credit(uuid, bigint, integer) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0044_partial_purchase_payment (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Record an optional initial supplier payment in the same transaction as receiving stock.
-- A zero payment is a credit purchase, a full payment is paid now, and anything
-- between those values is a part-paid credit purchase.

create or replace function public.record_purchase_with_payment(
  p_supplier_id uuid,
  p_lines jsonb,
  p_payment_amount bigint,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_total bigint := 0;
  v_purchase_id uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase_lines_required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if nullif(v_line ->> 'quantity', '')::numeric is null
      or (v_line ->> 'quantity')::numeric <= 0
      or nullif(v_line ->> 'unit_cost', '')::bigint is null
      or (v_line ->> 'unit_cost')::bigint < 0 then
      raise exception 'invalid_purchase_line';
    end if;
    v_total := v_total + round(
      (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint
    );
  end loop;

  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'invalid_initial_payment';
  end if;
  if p_payment_amount > v_total then raise exception 'ap_overpayment'; end if;

  if p_payment_amount = v_total then
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, false, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
  else
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, true, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
    if p_payment_amount > 0 then
      perform public.pay_purchase(v_purchase_id, p_payment_amount, p_account_code);
    end if;
  end if;

  return v_purchase_id;
end;
$$;

create or replace function public.confirm_purchase_draft_with_payment(
  p_draft_id uuid,
  p_payment_amount bigint,
  p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft
  from public.purchase_drafts
  where id = p_draft_id and company_id = v_company_id and status = 'draft'
  for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;

  v_purchase_id := public.record_purchase_with_payment(
    v_draft.supplier_id, v_draft.lines, p_payment_amount, v_draft.reference,
    p_account_code, v_draft.notes, v_draft.purchase_date, p_stock_location_id
  );
  update public.purchase_drafts
  set status = 'confirmed', posted_purchase_id = v_purchase_id, updated_at = now()
  where id = p_draft_id;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  to authenticated;
revoke execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  from anon, public;
grant execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0052_cashier_flow_modes (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- Expiry tracking off means new stock does not enter the expiry workflow.
-- Existing dates are retained, so turning the feature back on restores history.
create or replace function public.apply_batch_expiry_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select c.batch_expiry_enabled from public.companies c where c.id = new.company_id
  ), false) then
    new.expiry_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_batches_apply_expiry_preference on public.inventory_batches;
create trigger inventory_batches_apply_expiry_preference
  before insert or update of expiry_date on public.inventory_batches
  for each row execute function public.apply_batch_expiry_preference();

drop trigger if exists purchase_lines_apply_expiry_preference on public.purchase_lines;
create trigger purchase_lines_apply_expiry_preference
  before insert or update of expiry_date on public.purchase_lines
  for each row execute function public.apply_batch_expiry_preference();
