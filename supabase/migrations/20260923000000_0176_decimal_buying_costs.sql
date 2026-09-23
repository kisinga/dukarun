-- Buying rates are decimal KES (up to two decimal places); posted values stay whole KES.
-- Representation change only: no existing quantity, price, valuation or journal is restated.
-- Batch original_cost / remaining_cost remain authoritative. FIFO keeps proportional
-- whole-shilling allocation and gives the final withdrawal the exact remaining value.
drop view public.supplier_variant_performance;
drop trigger inventory_batches_maintain_costs on public.inventory_batches;
alter table public.inventory_batches
  alter column unit_cost type numeric using unit_cost::numeric,
  add constraint inventory_batches_unit_cost_precision check (
    unit_cost >= 0 and unit_cost < 'Infinity'::numeric and unit_cost = round(unit_cost, 2)
  );
alter table public.inventory_movements
  alter column unit_cost type numeric using unit_cost::numeric,
  add constraint inventory_movements_unit_cost_precision check (
    unit_cost >= 0 and unit_cost < 'Infinity'::numeric and unit_cost = round(unit_cost, 2)
  );
alter table public.purchase_lines
  alter column unit_cost type numeric using unit_cost::numeric,
  add constraint purchase_lines_unit_cost_precision check (
    unit_cost >= 0 and unit_cost < 'Infinity'::numeric and unit_cost = round(unit_cost, 2)
  );
alter table public.stock_transfer_lines
  alter column unit_cost type numeric using unit_cost::numeric,
  add constraint stock_transfer_lines_unit_cost_precision check (
    unit_cost >= 0 and unit_cost < 'Infinity'::numeric and unit_cost = round(unit_cost, 2)
  );
comment on column public.inventory_batches.unit_cost is 'KES per base stock unit, up to two decimal places. Original/remaining cost are authoritative whole-KES values.';
create trigger inventory_batches_maintain_costs
before insert or update of quantity, remaining, unit_cost, original_cost, remaining_cost
on public.inventory_batches for each row execute function public.maintain_inventory_batch_costs();
-- Replace rather than overload RPCs, preserving JSON parameter names and defaults.
drop function public.post_stock_adjustment(uuid,numeric,numeric,text,bigint);
drop function public.post_stock_adjustment_at_location(uuid,uuid,numeric,numeric,text,bigint);

-- Decimal cost path: create_catalog_product (from 20260914000000_0163_product_packs.sql).
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
  v_unit_cost numeric;
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

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::numeric, 0);
    if v_unit_cost < 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'invalid_opening_unit_cost'; end if;

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
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;


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

      v_line_value := coalesce(nullif(v_variant->>'opening_total_cost','')::bigint,round(v_quantity * v_unit_cost));
      if v_line_value<0 then raise exception 'invalid_opening_cost'; end if;
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date,original_cost,remaining_cost
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date,v_line_value,v_line_value
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

-- Decimal cost path: update_catalog_product (from 20260914000000_0163_product_packs.sql).
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
  v_unit_cost numeric;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_opening_source_id text;
  v_count int := 0;
begin
  -- Preserve the catalog-first lock order introduced by migration 0171.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || public.current_company_id()::text, 0));
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

      -- Retire packs before the quantity-type guard runs, including when both
      -- changes are submitted in the same editor save.
      if (v_kind <> 'good' or v_fractional) and v_variant ? 'packs' then
        perform public.save_variant_packs(v_variant_id,
          coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
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
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;
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

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::numeric, 0);
    if v_unit_cost < 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'invalid_opening_unit_cost'; end if;

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
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;


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

      v_line_value := coalesce(nullif(v_variant->>'opening_total_cost','')::bigint,round(v_quantity * v_unit_cost));
      if v_line_value<0 then raise exception 'invalid_opening_cost'; end if;
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date,original_cost,remaining_cost
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date,v_line_value,v_line_value
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

-- Decimal cost path: post_stock_adjustment (from 20260723001000_0002_catalog.sql).
create or replace function public.post_stock_adjustment(
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost numeric default null
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
  v_unit_cost numeric;
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

  if v_unit_cost is null or v_unit_cost <= 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then
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

  -- The stock movement is still real when its posted whole-KES value is zero.
  if v_total_value = 0 then return null; end if;
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

-- Decimal cost path: post_stock_adjustment_at_location (from 20260723005000_0006_platform.sql).
create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost numeric;
  v_total bigint;
  v_batch_id uuid;
  v_entry_id uuid;
  v_source_id text;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    v_entry_id := public.post_inventory_write_off(
      p_variant_id, abs(v_change), trim(p_reason)
    );
    select e.source_id into v_source_id
    from public.ledger_journal_entries e where e.id = v_entry_id;
    update public.inventory_movements m
    set meta = coalesce(m.meta, '{}'::jsonb) || jsonb_build_object(
      'reason', trim(p_reason),
      'previousQuantity', v_current,
      'newQuantity', p_new_quantity,
      'locationId', v_location_id
    )
    where m.company_id = v_company_id
      and m.source_type = 'InventoryWriteOff'
      and m.source_id = v_source_id;
    return v_entry_id;
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  -- Do not invent a monetary value just to satisfy a nonzero journal entry.
  if v_total = 0 then return null; end if;
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

-- Decimal cost path: do_void (from 20260805000000_0007_security_hardening.sql).
create or replace function public.do_void(p_order_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
    and company_id = public.current_company_id()
  for update;

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

  -- A low-value sale may allocate zero whole shillings and therefore have no
  -- COGS journal. Its stock movements still need reversing. Existing monetary
  -- sales retain their authoritative journal allocations.
  for v_allocation in
    select a.value as allocation
    from public.ledger_journal_lines l,
         lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
    where l.entry_id = v_cogs_entry_id
    union all
    select jsonb_build_object('batch_id',m.batch_id,'quantity',abs(m.quantity),
      'unit_cost',m.unit_cost,'total_cost',m.total_cost)
    from public.inventory_movements m
    where v_cogs_entry_id is null and m.company_id=v_order.company_id
      and m.source_type='Sale' and m.source_id=p_order_id::text and m.quantity<0
  loop
    update public.inventory_batches
    set remaining = remaining + (v_allocation ->> 'quantity')::numeric
    where id = (v_allocation ->> 'batch_id')::uuid;

    insert into public.inventory_movements (
      company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    select b.company_id, b.variant_id, b.id, 'reversal',
           (v_allocation ->> 'quantity')::numeric,
           (v_allocation ->> 'unit_cost')::numeric,
           (v_allocation ->> 'total_cost')::bigint,
           'OrderReversal', p_order_id::text
    from public.inventory_batches b
    where b.id = (v_allocation ->> 'batch_id')::uuid;
  end loop;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$function$;

-- Decimal cost path: record_purchase (from 20260819000006_0126_purchase_input_vat_workflow.sql).
create or replace function public.record_purchase(
  p_supplier_id uuid,p_lines jsonb,p_is_credit boolean,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_line jsonb;v_total bigint:=0;
begin
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total:=v_total+round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::numeric);
  end loop;
  return public.record_purchase_complete(p_supplier_id,p_lines,'[]'::jsonb,
    case when p_is_credit then 0 else v_total end,p_reference,p_account_code,p_notes,
    p_purchase_date,p_stock_location_id);
end;
$$;

-- Decimal cost path: save_purchase_draft (from 20260723004000_0005_purchasing.sql).
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
    if nullif(v_line->>'unit_cost','')::numeric is null
        or (v_line->>'unit_cost')::numeric <= 0
        or (v_line->>'unit_cost')::numeric > 9007199254740991
        or (v_line->>'unit_cost')::numeric <> round((v_line->>'unit_cost')::numeric,2)
      then raise exception 'invalid_purchase_unit_cost'; end if;
    v_total := v_total + round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::numeric);
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

-- Decimal cost path: save_purchase_draft_complete (from 20260914000007_0170_pack_checkout_and_purchase_locking.sql).
CREATE OR REPLACE FUNCTION public.save_purchase_draft_complete(p_supplier_id uuid, p_lines jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_stock_location_id uuid DEFAULT NULL::uuid, p_payment_mode text DEFAULT NULL::text, p_payment_amount bigint DEFAULT NULL::bigint, p_account_code text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id(); v_line jsonb; v_total bigint:=0;
  v_qty numeric; v_id uuid; v_value_source text; v_line_total bigint; v_unit_cost numeric;
  v_variant public.product_variants%rowtype; v_amount bigint; v_category text;
  v_unit jsonb; v_resolved_lines jsonb:='[]'::jsonb;
  v_custom_label text; v_settlement text; v_expense_account text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id
    and is_supplier and supplier_active) then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;
  if p_stock_location_id is null or not exists(select 1 from public.stock_locations
    where id=p_stock_location_id and company_id=v_company_id and is_active)
    or not public.current_user_can_access_location(p_stock_location_id) then
    raise exception 'invalid_stock_location'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  -- One-step purchases save and finalize their draft in this transaction.
  -- All drafts must take the catalog lock before resolving any unit rows;
  -- finalization cannot safely acquire it after these FOR SHARE locks.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company_id::text,0));
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty:=nullif(v_line->>'quantity','')::numeric; v_value_source:=coalesce(v_line->>'value_source','unit');
    if v_qty is null or v_qty<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_qty<>trunc(v_qty) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    v_unit:=public.resolve_transaction_unit(v_variant.id,nullif(v_line->>'pack_id','')::uuid,v_qty,false);
    v_resolved_lines:=v_resolved_lines||jsonb_build_array(v_line||v_unit);
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::numeric;
      if v_unit_cost is null or v_unit_cost <= 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_qty*v_unit_cost);
    end if;
    v_total:=v_total+v_line_total;
  end loop;
  if p_draft_id is not null and exists(select 1 from public.purchase_drafts d
    cross join lateral jsonb_array_elements(d.lines) l
    where d.id=p_draft_id and d.company_id=v_company_id and nullif(l->>'pack_id','') is not null)
    and exists(select 1 from jsonb_array_elements(p_lines) l where not l?'units_per_unit') then
    raise exception 'pack_client_update_required: reopen the app before editing this purchase'; end if;
  p_lines:=v_resolved_lines;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=nullif(v_line->>'amount','')::bigint;
    v_category:=lower(nullif(trim(v_line->>'category'),''));
    v_custom_label:=nullif(trim(v_line->>'custom_label'),'');
    v_settlement:=nullif(v_line->>'settlement','');
    if v_amount is null or v_amount<=0 or v_category is null
      or v_category not in ('transport','loading','packaging','duty','other')
      or (v_category='other' and v_custom_label is null)
      or (v_category<>'other' and v_custom_label is not null)
      or v_settlement not in ('supplier_bill','separate') then
      raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then v_total:=v_total+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_line->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
    end if;
  end loop;
  if p_payment_mode not in ('paid','partial','later') then raise exception 'invalid_payment_mode'; end if;
  if p_payment_mode='paid' and p_payment_amount<>v_total then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='partial' and (p_payment_amount is null or p_payment_amount<=0 or p_payment_amount>=v_total)
    then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='later' and coalesce(p_payment_amount,0)<>0 then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode in ('partial','later')
    and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_mode in ('paid','partial') then
    perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,
      expenses,total_cost,stock_location_id,payment_mode,payment_amount,account_code,created_by)
    values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),
      p_purchase_date,p_lines,p_expenses,v_total,p_stock_location_id,p_payment_mode,p_payment_amount,p_account_code,auth.uid())
    returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=nullif(trim(coalesce(p_reference,'')),''),
      notes=nullif(trim(coalesce(p_notes,'')),''),purchase_date=p_purchase_date,lines=p_lines,expenses=p_expenses,
      total_cost=v_total,stock_location_id=p_stock_location_id,payment_mode=p_payment_mode,
      payment_amount=p_payment_amount,account_code=p_account_code,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$function$;

-- Decimal cost path: record_purchase_complete_with_tax (from 20260819000006_0126_purchase_input_vat_workflow.sql).
create or replace function public.record_purchase_complete_with_tax(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_claim_input_vat boolean default false,p_supplier_tax_pin text default null,
  p_tax_invoice_number text default null,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_reference text;v_draft_id uuid;v_ref text:=gen_random_uuid()::text;
begin
  v_reference:=coalesce(nullif(btrim(p_reference),''),nullif(btrim(p_tax_invoice_number),''));
  v_draft_id:=public.save_purchase_workspace_draft(p_supplier_id,p_lines,p_expenses,v_reference,p_notes,
    p_purchase_date,p_stock_location_id,case when p_payment_amount=0 then 'later'
      when p_payment_amount=(select coalesce(sum(case when coalesce(x->>'value_source','unit')='total'
        then (x->>'line_total')::bigint else round((x->>'quantity')::numeric*(x->>'unit_cost')::numeric) end),0)
        from jsonb_array_elements(p_lines) x)+coalesce((select sum((x->>'amount')::bigint)
        from jsonb_array_elements(p_expenses) x where x->>'settlement'='supplier_bill'),0)
      then 'paid' else 'partial' end,p_payment_amount,0,p_account_code,v_ref,null,
    p_claim_input_vat,p_tax_invoice_date);
  return public.finalize_purchase_draft(v_draft_id);
end;
$$;

-- Decimal cost path: apply_catalog_price_updates (from 20260819000005_0125_catalog_price_update_locking.sql).
create or replace function public.apply_catalog_price_updates(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_count integer;
  v_target_count integer;
  v_updated integer := 0;
  v_retail_changes integer := 0;
  v_wholesale_changes integer := 0;
  v_stock_changes integer := 0;
  v_change jsonb;
begin
  -- Preserve the catalog-first lock order introduced by migration 0171.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || public.current_company_id()::text, 0));
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'price_changes_required';
  end if;

  v_count := jsonb_array_length(p_changes);
  if v_count < 1 or v_count > 10000 then raise exception 'invalid_price_change_count'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_changes) change
    where change ? 'new_stock_quantity'
  ) and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) change
    where case
      when jsonb_typeof(change) <> 'object' then true
      when jsonb_typeof(change -> 'variant_id') <> 'string' then true
      when coalesce(change ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'expected_updated_at') <> 'string' then true
      when nullif(btrim(change ->> 'expected_updated_at'), '') is null then true
      when not (
        change ? 'new_retail_price'
        or change ? 'new_wholesale_price'
        or change ? 'new_stock_quantity'
      ) then true
      else
        case when change ? 'new_retail_price' then case
          when jsonb_typeof(change -> 'new_retail_price') <> 'number' then true
          else (change ->> 'new_retail_price')::numeric < 0
            or (change ->> 'new_retail_price')::numeric <> trunc((change ->> 'new_retail_price')::numeric)
        end else false end
        or
        case when change ? 'new_wholesale_price' then case
          when jsonb_typeof(change -> 'new_wholesale_price') = 'null' then false
          when jsonb_typeof(change -> 'new_wholesale_price') <> 'number' then true
          else (change ->> 'new_wholesale_price')::numeric < 0
            or (change ->> 'new_wholesale_price')::numeric <> trunc((change ->> 'new_wholesale_price')::numeric)
        end else false end
        or
        case when change ? 'new_stock_quantity' then case
          when jsonb_typeof(change -> 'new_stock_quantity') is distinct from 'number' then true
          when jsonb_typeof(change -> 'expected_stock_quantity') is distinct from 'number' then true
          when jsonb_typeof(change -> 'stock_location_id') is distinct from 'string' then true
          when coalesce(change ->> 'stock_location_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
          else (change ->> 'new_stock_quantity')::numeric < 0
            or (change ->> 'expected_stock_quantity')::numeric < 0
            or scale((change ->> 'new_stock_quantity')::numeric) > 3
            or scale((change ->> 'expected_stock_quantity')::numeric) > 3
            or (change ->> 'new_stock_quantity')::numeric > 99999999999.999
            or (change ->> 'expected_stock_quantity')::numeric > 99999999999.999
        end else change ? 'stock_unit_cost' end
        or
        case when change ? 'stock_unit_cost' then case
          when jsonb_typeof(change -> 'stock_unit_cost') <> 'number' then true
          else (change ->> 'stock_unit_cost')::numeric <= 0
            or (change ->> 'stock_unit_cost')::numeric <> round((change ->> 'stock_unit_cost')::numeric,2)
        end else false end
    end
  ) then raise exception 'invalid_price_change'; end if;

  if (
    select count(distinct (change ->> 'variant_id')::uuid)
    from jsonb_array_elements(p_changes) change
  ) <> v_count then raise exception 'duplicate_variant_id'; end if;

  perform 1
  from jsonb_array_elements(p_changes) change
  join public.product_variants v
    on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id
  order by v.id
  for update of v;

  select count(*)
  into v_target_count
  from jsonb_array_elements(p_changes) change
  join public.product_variants v
    on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id;
  if v_target_count <> v_count then raise exception 'variant_not_found'; end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_changes) change
      join public.product_variants v
        on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id
      where (change ? 'new_retail_price' or change ? 'new_wholesale_price')
        and v.updated_at <> (change ->> 'expected_updated_at')::timestamptz
    ) then raise exception 'stale_catalog_price_export'; end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_price_change';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) change
    join public.product_variants v
      on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id
    where (change ? 'new_retail_price' or change ? 'new_wholesale_price')
      and case
      when change ? 'new_wholesale_price' then
        case when jsonb_typeof(change -> 'new_wholesale_price') = 'null'
          then null else (change ->> 'new_wholesale_price')::bigint end
      else v.wholesale_price
    end > case when change ? 'new_retail_price'
      then (change ->> 'new_retail_price')::bigint else v.price end
  ) then raise exception 'wholesale_price_above_retail'; end if;

  -- Even an exported no-op must verify the authoritative count. Otherwise a
  -- stale expected quantity equal to the requested quantity would pass.
  for v_change in
    select value from jsonb_array_elements(p_changes)
    where value ? 'new_stock_quantity'
      and (value ->> 'new_stock_quantity')::numeric
        is not distinct from (value ->> 'expected_stock_quantity')::numeric
    order by value ->> 'variant_id'
  loop
    perform public.post_stock_adjustment_at_location(
      (v_change ->> 'stock_location_id')::uuid,
      (v_change ->> 'variant_id')::uuid,
      (v_change ->> 'expected_stock_quantity')::numeric,
      (v_change ->> 'new_stock_quantity')::numeric,
      'Bulk product workbook',
      case when v_change ? 'stock_unit_cost'
        then (v_change ->> 'stock_unit_cost')::numeric else null end
    );
  end loop;

  select
    count(*) filter (
      where (
        change ? 'new_retail_price'
        and v.price is distinct from (change ->> 'new_retail_price')::bigint
      ) or (
        change ? 'new_wholesale_price'
        and v.wholesale_price is distinct from case
          when jsonb_typeof(change -> 'new_wholesale_price') = 'null' then null
          else (change ->> 'new_wholesale_price')::bigint
        end
      ) or (
        change ? 'new_stock_quantity'
        and (change ->> 'new_stock_quantity')::numeric
          is distinct from (change ->> 'expected_stock_quantity')::numeric
      )
    ),
    count(*) filter (
      where change ? 'new_retail_price'
        and v.price is distinct from (change ->> 'new_retail_price')::bigint
    ),
    count(*) filter (
      where change ? 'new_wholesale_price'
        and v.wholesale_price is distinct from case
          when jsonb_typeof(change -> 'new_wholesale_price') = 'null' then null
          else (change ->> 'new_wholesale_price')::bigint
        end
    ),
    count(*) filter (
      where change ? 'new_stock_quantity'
        and (change ->> 'new_stock_quantity')::numeric
          is distinct from (change ->> 'expected_stock_quantity')::numeric
    )
  into v_updated, v_retail_changes, v_wholesale_changes, v_stock_changes
  from jsonb_array_elements(p_changes) change
  join public.product_variants v
    on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id;

  if v_retail_changes + v_wholesale_changes + v_stock_changes > 0 then
    perform set_config('app.cache_change_suppressed', 'on', true);

    with changes as (
      select
        (change ->> 'variant_id')::uuid as variant_id,
        change ? 'new_retail_price' as set_retail,
        case when change ? 'new_retail_price'
          then (change ->> 'new_retail_price')::bigint else null end as retail_price,
        change ? 'new_wholesale_price' as set_wholesale,
        case
          when not (change ? 'new_wholesale_price') then null
          when jsonb_typeof(change -> 'new_wholesale_price') = 'null' then null
          else (change ->> 'new_wholesale_price')::bigint
        end as wholesale_price
      from jsonb_array_elements(p_changes) change
    )
    update public.product_variants v
    set price = case when changes.set_retail then changes.retail_price else v.price end,
        wholesale_price = case when changes.set_wholesale
          then changes.wholesale_price else v.wholesale_price end,
        updated_at = clock_timestamp()
    from changes
    where v.id = changes.variant_id and v.company_id = v_company_id
      and (
        (changes.set_retail and v.price is distinct from changes.retail_price)
        or (changes.set_wholesale and v.wholesale_price is distinct from changes.wholesale_price)
      );

    for v_change in
      select value from jsonb_array_elements(p_changes)
      where value ? 'new_stock_quantity'
        and (value ->> 'new_stock_quantity')::numeric
          is distinct from (value ->> 'expected_stock_quantity')::numeric
      order by value ->> 'variant_id'
    loop
      perform public.post_stock_adjustment_at_location(
        (v_change ->> 'stock_location_id')::uuid,
        (v_change ->> 'variant_id')::uuid,
        (v_change ->> 'expected_stock_quantity')::numeric,
        (v_change ->> 'new_stock_quantity')::numeric,
        'Bulk product workbook',
        case when v_change ? 'stock_unit_cost'
          then (v_change ->> 'stock_unit_cost')::numeric else null end
      );
    end loop;

    perform set_config('app.cache_change_suppressed', 'off', true);
    perform public.emit_cache_reset(v_company_id, 'catalog');
  end if;

  return jsonb_build_object(
    'updated_variants', v_updated,
    'retail_changes', v_retail_changes,
    'wholesale_changes', v_wholesale_changes,
    'stock_changes', v_stock_changes
  );
end;
$$;

-- Decimal cost path: record_purchase_complete_core (from 20260914000007_0170_pack_checkout_and_purchase_locking.sql).
CREATE OR REPLACE FUNCTION public.record_purchase_complete_core(p_supplier_id uuid, p_lines jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_payment_amount bigint DEFAULT 0, p_reference text DEFAULT NULL::text, p_account_code text DEFAULT 'CASH_ON_HAND'::text, p_notes text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_stock_location_id uuid DEFAULT NULL::uuid, p_claim_input_vat boolean DEFAULT false, p_tax_invoice_date date DEFAULT NULL::date, p_client_ref text DEFAULT NULL::text, p_context posting_context DEFAULT NULL::posting_context, p_advance_amount bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unit jsonb;v_stock_quantity numeric;
  v_company_id uuid:=public.current_company_id();v_supplier public.customers%rowtype;
  v_purchase_id uuid;v_line jsonb;v_expense jsonb;v_variant public.product_variants%rowtype;
  v_variant_id uuid;v_quantity numeric(14,3);v_unit_cost numeric;v_line_total bigint;
  v_value_source text;v_goods_gross bigint:=0;v_supplier_expenses bigint:=0;
  v_invoice_total bigint;v_ap_balance bigint;v_location_id uuid;v_batch_id uuid;
  v_journal_lines jsonb:='[]'::jsonb;v_expense_id uuid;v_category text;
  v_custom_label text;v_settlement text;v_amount bigint;v_expense_account text;
  v_is_credit boolean;v_wholesale bigint;v_retail bigint;v_estimate jsonb;
  v_tax jsonb;v_index integer:=0;v_tax_date date;v_tax_point timestamptz;
  v_profile_id uuid;v_posting_date date;v_tax_total bigint:=0;v_goods_net bigint:=0;
  v_invoice_net bigint:=0;v_invoice_basis_net bigint:=0;v_invoice_tax bigint:=0;
  v_cost_total bigint;v_supplier_pin text;v_tax_invoice_number text;
  v_resolution public.purchase_posting_resolution;v_context public.posting_context;
  v_timezone text;v_session_id uuid;v_outstanding bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  -- Every purchase emits catalog stock changes, even without a price edit.
  -- Take the catalog lock before unit rows, matching catalog editors that hold
  -- cache journal locks while updating those rows.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company_id::text,0));
  select * into v_supplier from public.customers c
  where c.id=p_supplier_id and c.company_id=v_company_id and c.is_supplier
    and c.supplier_active for share;
  if v_supplier.id is null then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'purchase_lines_required'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then
    raise exception 'invalid_purchase_expenses'; end if;
  if p_claim_input_vat then
    v_tax_invoice_number:=nullif(btrim(coalesce(p_reference,'')),'');
    v_supplier_pin:=nullif(btrim(coalesce(v_supplier.tax_registration_number,'')),'');
    if v_tax_invoice_number is null then raise exception 'tax_invoice_number_required'; end if;
    if p_tax_invoice_date is null then raise exception 'tax_invoice_date_required'; end if;
    if v_supplier_pin is null then raise exception 'supplier_tax_pin_required'; end if;
    if exists(select 1 from public.purchases p
      where p.company_id=v_company_id and p.supplier_id=p_supplier_id
        and p.claim_input_vat
        and lower(btrim(p.tax_invoice_number))=lower(v_tax_invoice_number)) then
      raise exception 'duplicate_supplier_tax_invoice';
    end if;
  end if;
  v_tax_date:=case when p_claim_input_vat then p_tax_invoice_date
    else coalesce(p_purchase_date,current_date) end;

  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  if exists(
    select 1 from (
      select l->>'variant_id' variant_id,
        nullif(l->>'new_wholesale_price','')::bigint new_wholesale_price,
        nullif(l->>'new_retail_price','')::bigint new_retail_price
      from jsonb_array_elements(p_lines) l
      where l?'new_wholesale_price' or l?'new_retail_price'
    ) prices group by variant_id
    having count(distinct new_wholesale_price)>1 or count(distinct new_retail_price)>1
  ) then raise exception 'conflicting_new_prices_for_variant'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=nullif(v_line->>'variant_id','')::uuid;
    v_quantity:=nullif(v_line->>'quantity','')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    if v_quantity is null or v_quantity<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants v
    where v.id=v_variant_id and v.company_id=v_company_id and v.kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_quantity<>trunc(v_quantity) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    v_unit:=public.resolve_transaction_unit(v_variant_id,nullif(v_line->>'pack_id','')::uuid,v_quantity,false);
    v_stock_quantity:=v_quantity*(v_unit->>'units_per_unit')::numeric;
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
      v_unit_cost:=round(v_line_total/v_quantity,2);
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::numeric;
      if v_unit_cost is null or v_unit_cost <= 0 or v_unit_cost > 9007199254740991 or v_unit_cost <> round(v_unit_cost,2) then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_quantity*v_unit_cost);
    end if;
    v_goods_gross:=v_goods_gross+v_line_total;
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      v_wholesale:=coalesce(nullif(v_line->>'new_wholesale_price','')::bigint,v_variant.wholesale_price,0);
      v_retail:=coalesce(nullif(v_line->>'new_retail_price','')::bigint,v_variant.price,0);
      if v_wholesale<0 or v_retail<0 then raise exception 'invalid_price'; end if;
      if v_retail<v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  for v_expense in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=nullif(v_expense->>'amount','')::bigint;
    v_category:=lower(nullif(trim(v_expense->>'category'),''));
    v_custom_label:=nullif(trim(v_expense->>'custom_label'),'');
    v_settlement:=nullif(v_expense->>'settlement','');
    if v_amount is null or v_amount<=0 or v_category is null
      or v_category not in ('transport','loading','packaging','duty','other')
      or (v_category='other' and v_custom_label is null)
      or (v_category<>'other' and v_custom_label is not null)
      or v_settlement not in ('supplier_bill','separate') then
      raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then
      v_supplier_expenses:=v_supplier_expenses+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_expense->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
    end if;
  end loop;

  v_invoice_total:=v_goods_gross+v_supplier_expenses;
  if p_payment_amount is null or p_payment_amount<0 or coalesce(p_advance_amount,0)<0 then
    raise exception 'invalid_initial_settlement'; end if;
  if p_payment_amount+coalesce(p_advance_amount,0)>v_invoice_total then
    raise exception 'ap_overpayment'; end if;
  v_outstanding:=v_invoice_total-p_payment_amount-coalesce(p_advance_amount,0);
  v_is_credit:=v_outstanding>0;
  if v_is_credit and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_amount>0 then perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
  if v_is_credit then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=p_supplier_id::text;
    if v_supplier.supplier_credit_limit>0 and
      v_ap_balance+v_outstanding>v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance,v_outstanding,
        v_supplier.supplier_credit_limit;
    end if;
  end if;

  v_location_id:=p_stock_location_id;
  if v_location_id is null then select l.id into v_location_id from public.stock_locations l
    where l.company_id=v_company_id and l.code='MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations l
    where l.id=v_location_id and l.company_id=v_company_id and l.is_active)
    then raise exception 'invalid_stock_location'; end if;
  if not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied'; end if;
  perform set_config('app.business_location_id',v_location_id::text,true);

  v_estimate:=public.calculate_purchase_invoice_tax(v_company_id,p_lines,p_expenses,v_tax_date);
  v_invoice_basis_net:=(v_estimate->>'net_total')::bigint;
  v_invoice_tax:=(v_estimate->>'tax_total')::bigint;
  v_profile_id:=nullif(v_estimate->>'tax_profile_id','')::uuid;
  v_tax_point:=(v_estimate->>'tax_point_at')::timestamptz;
  if p_claim_input_vat then
    if not coalesce((v_estimate->>'vat_registered')::boolean,false) then
      raise exception 'input_vat_requires_registration'; end if;
    v_tax_total:=(v_estimate->>'tax_total')::bigint;
    v_goods_net:=(v_estimate->>'goods_net_total')::bigint;
    v_invoice_net:=(v_estimate->>'net_total')::bigint;
  else
    v_tax_total:=0;v_goods_net:=v_goods_gross;v_invoice_net:=v_invoice_total;
  end if;
  v_resolution:=public.resolve_purchase_posting(
    v_company_id,coalesce(p_purchase_date,v_tax_date),v_tax_date);
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  if p_context is null then
    if p_payment_amount>0 or exists(select 1 from jsonb_array_elements(p_expenses) x
      where x->>'settlement'='separate') then
      v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_location_id);
    end if;
    v_context:=row(v_company_id,v_location_id,auth.uid(),v_session_id,
      (coalesce(p_purchase_date,v_tax_date)::timestamp at time zone v_timezone),
      (v_resolution).posting_date,'purchase',(v_resolution).reason)::public.posting_context;
  else
    v_context:=p_context;
    if (v_context).company_id is distinct from v_company_id
      or (v_context).location_id is distinct from v_location_id
      or (v_context).posting_date is distinct from (v_resolution).posting_date then
      raise exception 'invalid_purchase_posting_context'; end if;
  end if;
  v_posting_date:=(v_context).posting_date;

  insert into public.purchases(
    company_id,supplier_id,reference,total_cost,goods_subtotal,is_credit,created_by,notes,
    purchase_date,stock_location_id,client_ref,gross_total,net_total,goods_net_total,
    input_tax_total,invoice_net_total,invoice_tax_total,claim_input_vat,
    supplier_tax_pin,tax_invoice_number,tax_invoice_date,
    tax_point_at,tax_profile_id,tax_snapshot_status,accounting_posting_date,
    accounting_period_id,posting_classification,posting_reason,
    purchase_posting_version,is_late_tax_adjustment)
  values(
    v_company_id,p_supplier_id,nullif(btrim(coalesce(p_reference,'')),''),v_invoice_total,
    v_goods_gross,true,auth.uid(),nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_purchase_date,current_date),v_location_id,nullif(btrim(coalesce(p_client_ref,'')),''),
    v_invoice_total,v_invoice_net,v_goods_net,v_tax_total,v_invoice_basis_net,v_invoice_tax,
    p_claim_input_vat,
    case when p_claim_input_vat then v_supplier_pin end,
    case when p_claim_input_vat then v_tax_invoice_number end,
    case when p_claim_input_vat then p_tax_invoice_date end,v_tax_point,v_profile_id,'final',
    v_posting_date,(v_resolution).accounting_period_id,(v_resolution).classification,
    (v_resolution).reason,'ap_invoice_v2',(v_resolution).classification='prior_period')
  returning id into v_purchase_id;

  v_index:=0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=(v_line->>'variant_id')::uuid;v_quantity:=(v_line->>'quantity')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    v_unit:=public.resolve_transaction_unit(v_variant_id,nullif(v_line->>'pack_id','')::uuid,v_quantity,false);
    v_stock_quantity:=v_quantity*(v_unit->>'units_per_unit')::numeric;
    if v_value_source='total' then
      v_line_total:=(v_line->>'line_total')::bigint;v_unit_cost:=round(v_line_total/v_quantity,2);
    else
      v_unit_cost:=(v_line->>'unit_cost')::numeric;v_line_total:=round(v_quantity*v_unit_cost);
    end if;
    v_tax:=v_estimate->'lines'->v_index;
    v_cost_total:=case when p_claim_input_vat then (v_tax->>'net_total')::bigint
      else v_line_total end;
    insert into public.inventory_batches(
      company_id,variant_id,stock_location_id,supplier_id,quantity,remaining,unit_cost,
      original_cost,remaining_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_stock_quantity,v_stock_quantity,
      round(v_cost_total/v_stock_quantity,2),v_cost_total,
      v_cost_total,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date) returning id into v_batch_id;
    insert into public.purchase_lines(
      company_id,purchase_id,variant_id,inventory_batch_id,quantity,unit_cost,line_total,
      value_source,batch_number,expiry_date,tax_category_id,tax_rate_version_id,
      tax_category_code,tax_classification,tax_rate_bps,gross_total,net_total,tax_total,
      pack_id,unit_name,stock_unit_name,units_per_unit)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      v_value_source,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date,nullif(v_tax->>'tax_category_id','')::uuid,
      nullif(v_tax->>'tax_rate_version_id','')::uuid,v_tax->>'tax_category_code',
      v_tax->>'tax_classification',(v_tax->>'tax_rate_bps')::integer,
      (v_tax->>'gross_total')::bigint,(v_tax->>'net_total')::bigint,
      (v_tax->>'tax_total')::bigint,
      nullif(v_unit->>'pack_id','')::uuid,v_unit->>'unit_name',v_unit->>'stock_unit_name',(v_unit->>'units_per_unit')::numeric);
    insert into public.inventory_movements(
      company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
      source_type,source_id,meta)
    values(v_company_id,v_variant_id,v_batch_id,v_location_id,'purchase',v_stock_quantity,
      round(v_cost_total/v_stock_quantity,2),v_cost_total,
      'InventoryPurchase',v_purchase_id::text,jsonb_build_object(
        'grossCost',(v_tax->>'gross_total')::bigint,
        'invoiceVat',(v_tax->>'tax_total')::bigint,
        'inputVat',case when p_claim_input_vat then (v_tax->>'tax_total')::bigint else 0 end));
    v_index:=v_index+1;
  end loop;

  v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','INVENTORY',
    'debit',v_goods_net,'meta',jsonb_build_object('purchaseId',v_purchase_id,
      'supplierId',p_supplier_id,'grossAmount',v_goods_gross));
  v_index:=0;
  for v_expense in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=(v_expense->>'amount')::bigint;v_category:=lower(trim(v_expense->>'category'));
    v_custom_label:=nullif(trim(v_expense->>'custom_label'),'');
    v_settlement:=v_expense->>'settlement';v_expense_account:=nullif(v_expense->>'account_code','');
    v_tax:=v_estimate->'expenses'->v_index;
    insert into public.purchase_expenses(
      company_id,purchase_id,category,custom_label,memo,amount,settlement,account_code,
      created_by,tax_category_id,tax_rate_version_id,tax_category_code,tax_classification,
      tax_rate_bps,gross_total,net_total,tax_total)
    values(v_company_id,v_purchase_id,v_category,v_custom_label,
      nullif(btrim(coalesce(v_expense->>'memo','')),''),v_amount,v_settlement,
      case when v_settlement='separate' then v_expense_account end,auth.uid(),
      nullif(v_tax->>'tax_category_id','')::uuid,nullif(v_tax->>'tax_rate_version_id','')::uuid,
      v_tax->>'tax_category_code',v_tax->>'tax_classification',
      (v_tax->>'tax_rate_bps')::integer,(v_tax->>'gross_total')::bigint,
      (v_tax->>'net_total')::bigint,(v_tax->>'tax_total')::bigint)
    returning id into v_expense_id;
    if v_settlement='supplier_bill' then
      v_cost_total:=case when p_claim_input_vat then (v_tax->>'net_total')::bigint
        else v_amount end;
      v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','EXPENSES',
        'debit',v_cost_total,'meta',jsonb_build_object(
          'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id,
          'expenseCategory',v_category,'grossAmount',v_amount));
    else
      perform public.post_journal_entry_with_context(v_company_id,'PurchaseExpense',v_expense_id::text,
        'Purchase expense ('||v_category||')',jsonb_build_array(
          jsonb_build_object('account_code','EXPENSES','debit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id,
            'expenseCategory',v_category)),
          jsonb_build_object('account_code',v_expense_account,'credit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id))),
        v_context);
    end if;
    v_index:=v_index+1;
  end loop;
  if v_tax_total>0 then
    v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','TAX_PAYABLE',
      'debit',v_tax_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'inputVat',true));
  end if;
  v_journal_lines:=v_journal_lines||jsonb_build_object(
    'account_code','ACCOUNTS_PAYABLE',
    'credit',v_invoice_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,
      'supplierId',p_supplier_id,'purchaseReference',p_reference,'isCreditPurchase',v_is_credit,
      'projectedInitialPayment',p_payment_amount,'projectedAdvance',coalesce(p_advance_amount,0)));
  perform public.post_journal_entry_with_context(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase '||coalesce(p_reference,v_purchase_id::text),v_journal_lines,v_context);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      update public.product_variants set
        wholesale_price=case when v_line?'new_wholesale_price'
          then (v_line->>'new_wholesale_price')::bigint else wholesale_price end,
        price=case when v_line?'new_retail_price'
          then (v_line->>'new_retail_price')::bigint else price end,updated_at=now()
      where id=(v_line->>'variant_id')::uuid and company_id=v_company_id;
    end if;
  end loop;
  perform public.apply_purchase_pack_prices(p_lines);
  return v_purchase_id;
end;
$function$;

-- Decimal cost path: reverse_purchase (from 20260914000000_0163_product_packs.sql).
create or replace function public.reverse_purchase(p_purchase_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_purchase public.purchases%rowtype;
  v_entry public.ledger_journal_entries%rowtype;v_line record;v_purchase_line record;
  v_payment record;v_application record;v_expense record;v_expense_entry public.ledger_journal_entries%rowtype;
  v_lines jsonb:='[]'::jsonb;v_expense_lines jsonb;v_reversal_id uuid;v_expense_reversal uuid;
  v_net_unit_cost numeric;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    or not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: purchase reversal requires purchase and reversal access'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_purchase from public.purchases p where p.id=p_purchase_id
    and p.company_id=v_company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  if v_purchase.status='reversed' then
    select e.id into v_reversal_id from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.source_type='PurchaseReversal'
      and e.source_id=v_purchase.id::text||'-reversal';
    if v_reversal_id is null then raise exception 'purchase_reversal_journal_not_found'; end if;
    return v_reversal_id;
  end if;
  perform set_config('app.business_location_id',v_purchase.stock_location_id::text,true);
  perform public.require_open_cashier_session_at_location(v_company_id,v_purchase.stock_location_id);
  perform 1 from public.purchase_lines pl join public.inventory_batches b
    on b.id=pl.inventory_batch_id where pl.purchase_id=v_purchase.id order by b.id for update of b;
  if exists(select 1 from public.purchase_lines pl join public.inventory_batches b
      on b.id=pl.inventory_batch_id where pl.purchase_id=v_purchase.id
      and (b.remaining<>pl.stock_quantity or b.remaining_cost<>b.original_cost)) then
    raise exception 'purchase_stock_already_moved'; end if;
  for v_payment in select distinct s.id from public.supplier_payments s
    join public.purchase_payments pp on pp.supplier_payment_id=s.id
    where pp.purchase_id=v_purchase.id and pp.status='settled' and s.status='posted'
    order by s.id
  loop
    perform public.reverse_supplier_payment(v_payment.id,'Purchase reversal: '||btrim(p_reason));
  end loop;
  for v_application in select a.id from public.supplier_advance_applications a
    where a.purchase_id=v_purchase.id and a.status='active' order by a.id
  loop
    perform public.reverse_supplier_advance_application(v_application.id,
      'Purchase reversal: '||btrim(p_reason));
  end loop;
  for v_expense in select pe.* from public.purchase_expenses pe
    where pe.purchase_id=v_purchase.id and pe.settlement='separate' and pe.status='posted'
    order by pe.id for update
  loop
    select * into v_expense_entry from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.source_type='PurchaseExpense'
      and e.source_id=v_expense.id::text;
    if v_expense_entry.id is null then raise exception 'purchase_expense_journal_not_found'; end if;
    v_expense_lines:='[]'::jsonb;
    for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_expense_entry.id
    loop
      v_expense_lines:=v_expense_lines||jsonb_build_object('account_code',v_line.account_code,
        'debit',v_line.credit,'credit',v_line.debit,'meta',v_line.meta||jsonb_build_object(
          'reason',btrim(p_reason),'reversalOfPurchaseExpenseId',v_expense.id));
    end loop;
    v_expense_reversal:=public.post_reversal_entry(v_company_id,'PurchaseExpenseReversal',
      v_expense.id::text||'-reversal','Purchase expense reversed: '||btrim(p_reason),
      v_expense_lines,v_expense_entry.id);
    update public.purchase_expenses set status='reversed',reversal_entry_id=v_expense_reversal,
      reversed_at=now() where id=v_expense.id;
  end loop;
  select * into v_entry from public.ledger_journal_entries e where e.company_id=v_company_id
    and e.source_type='InventoryPurchase' and e.source_id=v_purchase.id::text;
  if v_entry.id is null then raise exception 'purchase_journal_not_found'; end if;
  for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,'meta',v_line.meta||jsonb_build_object(
        'reason',btrim(p_reason),'reversalOfPurchaseId',v_purchase.id,
        'locationId',v_purchase.stock_location_id));
  end loop;
  for v_purchase_line in select pl.*,b.stock_location_id,b.original_cost recognized_cost
    from public.purchase_lines pl
    join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id order by b.id
  loop
    v_net_unit_cost:=round(v_purchase_line.recognized_cost/v_purchase_line.stock_quantity,2);
    update public.inventory_batches set remaining=0,remaining_cost=0
    where id=v_purchase_line.inventory_batch_id;
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
      quantity,unit_cost,total_cost,source_type,source_id,meta)
    values(v_company_id,v_purchase_line.variant_id,v_purchase_line.inventory_batch_id,
      v_purchase_line.stock_location_id,'reversal',-v_purchase_line.stock_quantity,v_net_unit_cost,
      -v_purchase_line.recognized_cost,'PurchaseReversal',v_purchase.id::text,jsonb_build_object(
        'reason',btrim(p_reason),'grossCost',v_purchase_line.gross_total,
        'invoiceVat',v_purchase_line.tax_total,
        'inputVat',case when v_purchase.claim_input_vat then v_purchase_line.tax_total else 0 end));
  end loop;
  update public.purchases set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_purchase.id;
  v_reversal_id:=public.post_reversal_entry(v_company_id,'PurchaseReversal',
    v_purchase.id::text||'-reversal','Purchase reversed: '||btrim(p_reason),v_lines,v_entry.id);
  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  return v_reversal_id;
end;
$$;

-- Decimal cost path: validate_purchase_price_payload (from 20260820000001_0133_purchase_price_entry_basis.sql).
create or replace function public.validate_purchase_price_payload(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date,p_price_entry_basis text
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_estimate jsonb;v_item record;v_tax jsonb;v_quantity numeric;v_entered bigint;
  v_actual bigint;v_expected bigint;v_source text;v_rate integer;
begin
  if p_price_entry_basis not in ('inclusive','exclusive') then
    raise exception 'invalid_purchase_price_entry_basis'; end if;
  v_estimate:=public.calculate_purchase_invoice_tax(
    p_company_id,p_lines,p_expenses,p_tax_date);
  if p_price_entry_basis='inclusive' then return v_estimate; end if;
  if not coalesce((v_estimate->>'tax_configured')::boolean,false) then
    raise exception 'exclusive_purchase_prices_require_vat_configuration'; end if;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    if coalesce(v_item.value->>'price_entry_basis','')<>'exclusive' then
      raise exception 'mixed_purchase_price_entry_basis'; end if;
    v_quantity:=nullif(v_item.value->>'quantity','')::numeric;
    v_source:=coalesce(nullif(v_item.value->>'entered_value_source',''),'unit');
    if v_source='total' then
      v_entered:=nullif(v_item.value->>'entered_line_total','')::bigint;
    elsif v_source='unit' then
      if nullif(v_item.value->>'entered_unit_cost','')::numeric is null
        or (v_item.value->>'entered_unit_cost')::numeric <= 0
        or (v_item.value->>'entered_unit_cost')::numeric > 9007199254740991
        or (v_item.value->>'entered_unit_cost')::numeric <> round((v_item.value->>'entered_unit_cost')::numeric,2)
      then raise exception 'invalid_entered_purchase_price'; end if;
      v_entered:=round(v_quantity*nullif(v_item.value->>'entered_unit_cost','')::numeric);
    else raise exception 'invalid_entered_purchase_value_source'; end if;
    if v_entered is null or v_entered<=0 then raise exception 'invalid_entered_purchase_price'; end if;
    if coalesce(v_item.value->>'value_source','unit')='total' then
      v_actual:=nullif(v_item.value->>'line_total','')::bigint;
    else
      v_actual:=round(v_quantity*nullif(v_item.value->>'unit_cost','')::numeric);
    end if;
    v_tax:=v_estimate->'lines'->((v_item.ordinality-1)::integer);
    v_rate:=coalesce((v_tax->>'tax_rate_bps')::integer,0);
    v_expected:=round(v_actual::numeric*10000/(10000+v_rate))::bigint;
    if v_entered is distinct from v_expected then
      raise exception 'purchase_price_normalization_changed'; end if;
  end loop;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_expenses) with ordinality
  loop
    if coalesce(v_item.value->>'price_entry_basis','')<>'exclusive' then
      raise exception 'mixed_purchase_price_entry_basis'; end if;
    v_entered:=nullif(v_item.value->>'entered_amount','')::bigint;
    v_actual:=nullif(v_item.value->>'amount','')::bigint;
    if v_entered is null or v_entered<=0 then raise exception 'invalid_entered_purchase_expense'; end if;
    if v_item.value->>'settlement'='supplier_bill' then
      v_tax:=v_estimate->'expenses'->((v_item.ordinality-1)::integer);
      v_rate:=coalesce((v_tax->>'tax_rate_bps')::integer,0);
      v_expected:=round(v_actual::numeric*10000/(10000+v_rate))::bigint;
    else v_expected:=v_actual; end if;
    if v_entered is distinct from v_expected then
      raise exception 'purchase_expense_normalization_changed'; end if;
  end loop;
  return v_estimate;
end;
$$;

-- Decimal cost path: calculate_purchase_invoice_tax (from 20260821000004_0140_purchase_invoice_tax_calculator_upgrade.sql).
create or replace function public.calculate_purchase_invoice_tax(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_timezone text;v_point timestamptz;v_profile public.company_tax_profiles%rowtype;
  v_item record;v_variant record;v_tax record;v_default_category uuid;
  v_lines jsonb:='[]'::jsonb;v_expenses jsonb:='[]'::jsonb;
  v_goods_gross bigint:=0;v_goods_net bigint:=0;v_goods_tax bigint:=0;
  v_expense_gross bigint:=0;v_expense_net bigint:=0;v_expense_tax bigint:=0;
  v_separate_expenses bigint:=0;v_gross bigint;v_amount bigint;v_today date;
begin
  if p_tax_date is null then raise exception 'tax_invoice_date_required'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'invalid_purchase_lines'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  if p_tax_date>v_today then raise exception 'future_tax_invoice_date_not_allowed'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id and cp.effective_from<=p_tax_date
    and (cp.effective_to is null or cp.effective_to>=p_tax_date)
  order by cp.effective_from desc limit 1;
  v_point:=(p_tax_date::timestamp at time zone coalesce(v_profile.business_timezone,v_timezone));
  v_default_category:=v_profile.default_tax_category_id;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    select v.id,v.product_id into v_variant from public.product_variants v
    where v.id=nullif(v_item.value->>'variant_id','')::uuid and v.company_id=p_company_id;
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if coalesce(v_item.value->>'value_source','unit')='total' then
      v_gross:=nullif(v_item.value->>'line_total','')::bigint;
    else
      if nullif(v_item.value->>'unit_cost','')::numeric is null
        or (v_item.value->>'unit_cost')::numeric <= 0
        or (v_item.value->>'unit_cost')::numeric > 9007199254740991
        or (v_item.value->>'unit_cost')::numeric <> round((v_item.value->>'unit_cost')::numeric,2)
      then raise exception 'invalid_purchase_unit_cost'; end if;
      v_gross:=round(nullif(v_item.value->>'quantity','')::numeric
        *nullif(v_item.value->>'unit_cost','')::numeric);
    end if;
    if v_gross is null or v_gross<=0 then raise exception 'invalid_purchase_line_total'; end if;
    select * into v_tax from public.resolve_purchase_invoice_tax(
      p_company_id,v_variant.product_id,v_gross,v_point);
    v_goods_gross:=v_goods_gross+v_tax.gross_total;
    v_goods_net:=v_goods_net+v_tax.net_total;
    v_goods_tax:=v_goods_tax+v_tax.tax_total;
    v_lines:=v_lines||jsonb_build_object(
      'line_index',v_item.ordinality-1,'tax_profile_id',v_tax.tax_profile_id,
      'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
      'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
      'tax_rate_bps',v_tax.tax_rate_bps,'gross_total',v_tax.gross_total,
      'net_total',v_tax.net_total,'tax_total',v_tax.tax_total);
  end loop;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_expenses) with ordinality
  loop
    v_amount:=nullif(v_item.value->>'amount','')::bigint;
    if v_amount is null or v_amount<=0 then raise exception 'invalid_purchase_expense'; end if;
    if v_item.value->>'settlement'='supplier_bill' then
      select * into v_tax from public.resolve_purchase_invoice_category_tax(
        p_company_id,v_default_category,v_amount,v_point);
      v_expense_gross:=v_expense_gross+v_tax.gross_total;
      v_expense_net:=v_expense_net+v_tax.net_total;
      v_expense_tax:=v_expense_tax+v_tax.tax_total;
      v_expenses:=v_expenses||jsonb_build_object(
        'expense_index',v_item.ordinality-1,'tax_profile_id',v_tax.tax_profile_id,
        'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
        'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
        'tax_rate_bps',v_tax.tax_rate_bps,'gross_total',v_tax.gross_total,
        'net_total',v_tax.net_total,'tax_total',v_tax.tax_total);
    else
      v_separate_expenses:=v_separate_expenses+v_amount;
      v_expenses:=v_expenses||jsonb_build_object(
        'expense_index',v_item.ordinality-1,'tax_profile_id',null,
        'tax_category_id',null,'tax_rate_version_id',null,
        'tax_category_code','NOT_CLAIMED','tax_classification','not_claimed',
        'tax_rate_bps',0,'gross_total',v_amount,'net_total',v_amount,'tax_total',0);
    end if;
  end loop;

  return jsonb_build_object(
    'status','estimate','tax_configured',v_profile.id is not null,
    'vat_registered',coalesce(v_profile.vat_registered,false),
    'tax_profile_id',v_profile.id,'tax_point_at',v_point,
    'gross_total',v_goods_gross+v_expense_gross,
    'net_total',v_goods_net+v_expense_net,
    'tax_total',v_goods_tax+v_expense_tax,
    'goods_gross_total',v_goods_gross,'goods_net_total',v_goods_net,
    'goods_tax_total',v_goods_tax,'expense_gross_total',v_expense_gross,
    'expense_net_total',v_expense_net,'expense_tax_total',v_expense_tax,
    'separate_expense_total',v_separate_expenses,'lines',v_lines,'expenses',v_expenses);
end;
$$;

-- Decimal cost path: apply_catalog_workbook_updates (from 20260903000000_0162_catalog_workbook_batch_costs.sql).
create or replace function public.apply_catalog_workbook_updates(
  p_variant_changes jsonb default '[]'::jsonb,
  p_product_changes jsonb default '[]'::jsonb,
  p_disable_changes jsonb default '[]'::jsonb,
  p_batch_changes jsonb default '[]'::jsonb,
  p_import_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb := jsonb_build_object(
    'updated_variants', 0, 'retail_changes', 0, 'wholesale_changes', 0,
    'stock_changes', 0, 'manufacturer_changes', 0, 'created', 0,
    'disabled_variants', 0, 'disabled_products', 0, 'batch_changes', 0,
    'batches_created', 0, 'batches_updated', 0
  );
  v_inventory_result jsonb;
  v_core_variant_changes jsonb;
  v_core_change_count integer;
  v_variant_count integer;
  v_import_batches_created integer := 0;
begin
  -- Preserve the catalog-first lock order introduced by migration 0171.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || public.current_company_id()::text, 0));
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if jsonb_typeof(p_variant_changes) is distinct from 'array'
    or jsonb_typeof(p_product_changes) is distinct from 'array'
    or jsonb_typeof(p_disable_changes) is distinct from 'array'
    or jsonb_typeof(p_batch_changes) is distinct from 'array' then
    raise exception 'catalog_changes_required';
  end if;

  v_variant_count := jsonb_array_length(p_variant_changes);
  if v_variant_count + jsonb_array_length(p_product_changes)
      + jsonb_array_length(p_disable_changes) + jsonb_array_length(p_batch_changes) = 0
    and p_import_id is null then
    raise exception 'invalid_catalog_change_count';
  end if;

  -- Workbook manufacturer values are references, never an implicit create API.
  if exists (
    select 1 from jsonb_array_elements(p_product_changes) change
    where jsonb_typeof(change -> 'new_manufacturer_name') = 'string'
      and not exists (
        select 1 from public.manufacturers manufacturer
        where manufacturer.company_id = v_company_id
          and manufacturer.active
          and manufacturer.normalized_name = lower(btrim(change ->> 'new_manufacturer_name'))
      )
  ) then raise exception 'invalid_workbook_manufacturer'; end if;

  if p_import_id is not null then
    if exists (
      select 1 from public.catalog_import_staged_products staged
      where staged.import_id = p_import_id and staged.company_id = v_company_id
        and nullif(btrim(coalesce(staged.data ->> 'manufacturer_name', '')), '') is not null
        and not exists (
          select 1 from public.manufacturers manufacturer
          where manufacturer.company_id = v_company_id and manufacturer.active
            and manufacturer.normalized_name = lower(btrim(staged.data ->> 'manufacturer_name'))
        )
    ) then raise exception 'invalid_workbook_manufacturer'; end if;

    if exists (
      select 1 from public.catalog_import_staged_variants staged
      where staged.import_id = p_import_id and staged.company_id = v_company_id
        and coalesce(nullif(staged.data ->> 'opening_quantity', '')::numeric, 0) > 0
        and coalesce(nullif(staged.data ->> 'opening_unit_cost', '')::numeric, 0) <= 0
    ) then raise exception 'opening_unit_cost_must_be_positive'; end if;

    select count(*) into v_import_batches_created
    from public.catalog_import_staged_variants staged
    where staged.import_id = p_import_id and staged.company_id = v_company_id
      and coalesce(nullif(staged.data ->> 'opening_quantity', '')::numeric, 0) > 0;
    if v_import_batches_created > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;
      if not public.current_user_has_permission('ViewFinancials') then
        raise exception 'permission_denied: ViewFinancials required';
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(
    change - 'expected_stock_quantity' - 'stock_location_id' - 'new_stock_quantity'
  ), '[]'::jsonb)
  into v_core_variant_changes
  from jsonb_array_elements(p_variant_changes) change
  where change ? 'new_retail_price' or change ? 'new_wholesale_price';

  v_core_change_count := jsonb_array_length(v_core_variant_changes)
    + jsonb_array_length(p_product_changes) + jsonb_array_length(p_disable_changes);
  if v_core_change_count > 0 or p_import_id is not null then
    v_result := public.apply_catalog_workbook_core(
      v_core_variant_changes, p_product_changes, p_disable_changes, p_import_id
    );
  end if;

  v_inventory_result := public.apply_catalog_workbook_inventory_changes(
    p_variant_changes, p_batch_changes
  );
  v_inventory_result := v_inventory_result || jsonb_build_object(
    'batch_changes', coalesce((v_inventory_result ->> 'batch_changes')::integer, 0)
      + v_import_batches_created,
    'batches_created', coalesce((v_inventory_result ->> 'batches_created')::integer, 0)
      + v_import_batches_created
  );

  if coalesce((v_inventory_result ->> 'stock_changes')::integer, 0) > 0
    or coalesce((v_inventory_result ->> 'batch_changes')::integer, 0) > 0 then
    perform public.emit_cache_reset(v_company_id, 'catalog');
  end if;

  return v_result || v_inventory_result || jsonb_build_object(
    'updated_variants', v_variant_count
  );
end;
$$;

-- Decimal cost path: apply_catalog_workbook_inventory_changes (from 20260914000003_0166_pack_workbook.sql).
create or replace function public.apply_catalog_workbook_inventory_changes(
  p_variant_changes jsonb default '[]'::jsonb,
  p_batch_changes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_change jsonb;
  v_variant_id uuid;
  v_location_id uuid;
  v_batch_id uuid;
  v_latest_batch_id uuid;
  v_action text;
  v_variant_count integer := jsonb_array_length(p_variant_changes);
  v_batch_count integer := jsonb_array_length(p_batch_changes);
  v_requested_variant_count integer;
  v_target_count integer;
  v_stock_changes integer := 0;
  v_batch_changes integer := 0;
  v_batches_created integer := 0;
  v_batches_updated integer := 0;
  v_expected_stock numeric;
  v_new_stock numeric;
  v_current_stock numeric;
  v_quantity_added numeric;
  v_expected_remaining numeric;
  v_expected_unit_cost numeric;
  v_expected_remaining_cost bigint;
  v_expected_batch_number text;
  v_expected_expiry_date date;
  v_new_unit_cost numeric;
  v_new_batch_number text;
  v_new_expiry_date date;
  v_corrected_remaining_cost bigint;
  v_new_remaining_cost bigint;
  v_new_original_cost bigint;
  v_added_cost bigint;
  v_value_difference bigint;
  v_consumed_cost bigint;
  v_adjustment_id uuid;
  v_correction_id uuid;
  v_lines jsonb;
  v_batch public.inventory_batches%rowtype;
  v_updated_batch public.inventory_batches%rowtype;
begin
  -- Preserve the catalog-first lock order introduced by migration 0171.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || public.current_company_id()::text, 0));
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_variant_changes) is distinct from 'array'
    or jsonb_typeof(p_batch_changes) is distinct from 'array' then
    raise exception 'catalog_changes_required';
  end if;
  if v_variant_count > 10000 or v_batch_count > 10000 then
    raise exception 'invalid_catalog_change_count';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_variant_changes) change
    where case
      when jsonb_typeof(change) is distinct from 'object' then true
      when jsonb_typeof(change -> 'variant_id') is distinct from 'string' then true
      when coalesce(change ->> 'variant_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when not (change ? 'new_stock_quantity') then
        change ? 'expected_stock_quantity' or change ? 'stock_location_id'
      when jsonb_typeof(change -> 'new_stock_quantity') is distinct from 'number' then true
      when jsonb_typeof(change -> 'expected_stock_quantity') is distinct from 'number' then true
      when jsonb_typeof(change -> 'stock_location_id') is distinct from 'string' then true
      when coalesce(change ->> 'stock_location_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      else (change ->> 'new_stock_quantity')::numeric < 0
        or (change ->> 'expected_stock_quantity')::numeric < 0
        or (change ->> 'new_stock_quantity')::numeric > 99999999999.999
        or (change ->> 'expected_stock_quantity')::numeric > 99999999999.999
        or scale((change ->> 'new_stock_quantity')::numeric) > 3
        or scale((change ->> 'expected_stock_quantity')::numeric) > 3
    end
  ) then raise exception 'invalid_price_change'; end if;

  if (
    select count(distinct (change ->> 'variant_id')::uuid)
    from jsonb_array_elements(p_variant_changes) change
  ) <> v_variant_count then raise exception 'duplicate_variant_id'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_batch_changes) change
    where case
      when jsonb_typeof(change) is distinct from 'object' then true
      when jsonb_typeof(change -> 'action') is distinct from 'string' then true
      when change ->> 'action' not in ('update', 'create') then true
      when jsonb_typeof(change -> 'variant_id') is distinct from 'string' then true
      when coalesce(change ->> 'variant_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'stock_location_id') is distinct from 'string' then true
      when coalesce(change ->> 'stock_location_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'latest') is distinct from 'boolean' then true
      when jsonb_typeof(change -> 'expected_remaining') is distinct from 'number' then true
      when jsonb_typeof(change -> 'expected_unit_cost') is distinct from 'number' then true
      when jsonb_typeof(change -> 'expected_remaining_cost') is distinct from 'number' then true
      when coalesce(jsonb_typeof(change -> 'expected_batch_number'), 'missing')
        not in ('string', 'null') then true
      when coalesce(jsonb_typeof(change -> 'expected_expiry_date'), 'missing')
        not in ('string', 'null') then true
      when jsonb_typeof(change -> 'new_unit_cost') is distinct from 'number' then true
      when coalesce(jsonb_typeof(change -> 'new_batch_number'), 'missing')
        not in ('string', 'null') then true
      when coalesce(jsonb_typeof(change -> 'new_expiry_date'), 'missing')
        not in ('string', 'null') then true
      when jsonb_typeof(change -> 'quantity_added') is distinct from 'number' then true
      when change ->> 'action' = 'update' and (
        jsonb_typeof(change -> 'batch_id') is distinct from 'string'
        or coalesce(change ->> 'batch_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) then true
      when change ->> 'action' = 'create' and change ? 'batch_id' then true
      else (change ->> 'expected_remaining')::numeric < 0
        or (change ->> 'expected_remaining')::numeric > 99999999999.999
        or scale((change ->> 'expected_remaining')::numeric) > 3
        or (change ->> 'expected_unit_cost')::numeric < 0
        or (change ->> 'expected_unit_cost')::numeric > 9007199254740991
        or (change ->> 'expected_unit_cost')::numeric <> round((change ->> 'expected_unit_cost')::numeric,2)
        or (change ->> 'expected_remaining_cost')::numeric < 0
        or (change ->> 'expected_remaining_cost')::numeric > 9007199254740991
        or (change ->> 'expected_remaining_cost')::numeric
          <> trunc((change ->> 'expected_remaining_cost')::numeric)
        or (change ->> 'new_unit_cost')::numeric < 0
        or (change ->> 'new_unit_cost')::numeric > 9007199254740991
        or (change ->> 'new_unit_cost')::numeric <> round((change ->> 'new_unit_cost')::numeric,2)
        or (change ->> 'quantity_added')::numeric < 0
        or (change ->> 'quantity_added')::numeric > 99999999999.999
        or scale((change ->> 'quantity_added')::numeric) > 3
        or round(
          (change ->> 'expected_remaining')::numeric
            * (change ->> 'new_unit_cost')::numeric
        ) > 9223372036854775807
        or round(
          (change ->> 'quantity_added')::numeric
            * (change ->> 'new_unit_cost')::numeric
        ) > 9223372036854775807
        or length(btrim(coalesce(change ->> 'expected_batch_number', ''))) > 120
        or length(btrim(coalesce(change ->> 'new_batch_number', ''))) > 120
        or (jsonb_typeof(change -> 'expected_expiry_date') = 'string'
          and (change ->> 'expected_expiry_date') !~ '^\d{4}-\d{2}-\d{2}$')
        or (jsonb_typeof(change -> 'new_expiry_date') = 'string'
          and (change ->> 'new_expiry_date') !~ '^\d{4}-\d{2}-\d{2}$')
        or (change ->> 'action' = 'create' and (
          not (change ->> 'latest')::boolean
          or (change ->> 'expected_remaining')::numeric <> 0
          or (change ->> 'expected_unit_cost')::numeric <> 0
          or (change ->> 'expected_remaining_cost')::numeric <> 0
          or (change ->> 'quantity_added')::numeric <= 0
          or (change ->> 'new_unit_cost')::numeric <= 0
        ))
        or ((change ->> 'quantity_added')::numeric > 0 and (
          not (change ->> 'latest')::boolean
          or (change ->> 'new_unit_cost')::numeric <= 0
        ))
        or ((change ->> 'new_unit_cost')::numeric = 0
          and (change ->> 'expected_unit_cost')::numeric <> 0)
    end
  ) then raise exception 'invalid_batch_change'; end if;

  if exists(select 1 from jsonb_array_elements(p_batch_changes) change where change?'new_remaining_cost' and (
    jsonb_typeof(change->'new_remaining_cost') is distinct from 'number'
    or (change->>'new_remaining_cost')::numeric<0
    or (change->>'new_remaining_cost')::numeric>9007199254740991
    or (change->>'new_remaining_cost')::numeric<>trunc((change->>'new_remaining_cost')::numeric)
    or change->>'action'<>'update')) then raise exception 'invalid_remaining_cost'; end if;

  if (
    select count(distinct change ->> 'batch_id')
    from jsonb_array_elements(p_batch_changes) change
    where change ->> 'action' = 'update'
  ) <> (
    select count(*) from jsonb_array_elements(p_batch_changes) change
    where change ->> 'action' = 'update'
  ) then raise exception 'duplicate_batch_id'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_batch_changes) change
    where change ->> 'action' = 'create'
    group by change ->> 'variant_id', change ->> 'stock_location_id'
    having count(*) > 1
  ) then raise exception 'duplicate_created_batch'; end if;

  if v_batch_count > 0 then
    if not public.current_user_has_permission('ManageStockAdjustments') then
      raise exception 'permission_denied: ManageStockAdjustments required';
    end if;
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variant_changes) change
    where change ? 'new_stock_quantity'
  ) and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  with requested as (
    select (change ->> 'variant_id')::uuid id
    from jsonb_array_elements(p_variant_changes) change
    where change ? 'new_stock_quantity'
    union
    select (change ->> 'variant_id')::uuid
    from jsonb_array_elements(p_batch_changes) change
  )
  select count(*) into v_requested_variant_count from requested;

  perform 1
  from public.product_variants variant
  where variant.company_id = v_company_id
    and variant.id in (
      select (change ->> 'variant_id')::uuid
      from jsonb_array_elements(p_variant_changes) change
      where change ? 'new_stock_quantity'
      union
      select (change ->> 'variant_id')::uuid
      from jsonb_array_elements(p_batch_changes) change
    )
  order by variant.id
  for update of variant;

  select count(*) into v_target_count
  from public.product_variants variant
  where variant.company_id = v_company_id
    and variant.id in (
      select (change ->> 'variant_id')::uuid
      from jsonb_array_elements(p_variant_changes) change
      where change ? 'new_stock_quantity'
      union
      select (change ->> 'variant_id')::uuid
      from jsonb_array_elements(p_batch_changes) change
    );
  if v_target_count <> v_requested_variant_count then raise exception 'variant_not_found'; end if;

  if exists (
    select 1
    from (
      select (change ->> 'variant_id')::uuid variant_id,
        (change ->> 'stock_location_id')::uuid stock_location_id
      from jsonb_array_elements(p_variant_changes) change
      where change ? 'new_stock_quantity'
      union
      select (change ->> 'variant_id')::uuid,
        (change ->> 'stock_location_id')::uuid
      from jsonb_array_elements(p_batch_changes) change
    ) requested
    left join public.stock_locations location
      on location.id = requested.stock_location_id
     and location.company_id = v_company_id
    where location.id is null
      or not public.current_user_can_access_location(requested.stock_location_id)
  ) then raise exception 'location_access_denied'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_variant_changes) change
    join public.product_variants variant
      on variant.id = (change ->> 'variant_id')::uuid
     and variant.company_id = v_company_id
    where change ? 'new_stock_quantity'
      and (not variant.track_inventory or variant.kind = 'service')
  ) then raise exception 'variant_does_not_track_stock'; end if;

  perform 1
  from public.inventory_batches batch
  where batch.company_id = v_company_id
    and (
      exists (
        select 1 from jsonb_array_elements(p_variant_changes) change
        where change ? 'new_stock_quantity'
          and (change ->> 'variant_id')::uuid = batch.variant_id
          and (change ->> 'stock_location_id')::uuid = batch.stock_location_id
      )
      or exists (
        select 1 from jsonb_array_elements(p_batch_changes) change
        where change ->> 'action' = 'update'
          and (change ->> 'batch_id')::uuid = batch.id
      )
    )
  order by batch.id
  for update of batch;

  for v_change in
    select value from jsonb_array_elements(p_variant_changes)
    where value ? 'new_stock_quantity'
    order by value ->> 'variant_id'
  loop
    v_variant_id := (v_change ->> 'variant_id')::uuid;
    v_location_id := (v_change ->> 'stock_location_id')::uuid;
    v_expected_stock := (v_change ->> 'expected_stock_quantity')::numeric;
    v_new_stock := (v_change ->> 'new_stock_quantity')::numeric;
    select coalesce(sum(batch.remaining), 0) into v_current_stock
    from public.inventory_batches batch
    where batch.company_id = v_company_id
      and batch.variant_id = v_variant_id
      and batch.stock_location_id = v_location_id;
    if v_current_stock <> v_expected_stock then
      raise exception 'stock_changed: expected %, current %; refresh and recount',
        v_expected_stock, v_current_stock;
    end if;
    if v_new_stock > v_expected_stock then
      if (
        select count(*) from jsonb_array_elements(p_batch_changes) batch_change
        where (batch_change ->> 'variant_id')::uuid = v_variant_id
          and (batch_change ->> 'stock_location_id')::uuid = v_location_id
          and (batch_change ->> 'latest')::boolean
          and (batch_change ->> 'quantity_added')::numeric = v_new_stock - v_expected_stock
      ) <> 1 then raise exception 'stock_increase_requires_latest_batch'; end if;
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_batch_changes) batch_change
    where (batch_change ->> 'quantity_added')::numeric > 0
      and not exists (
        select 1 from jsonb_array_elements(p_variant_changes) variant_change
        where variant_change ? 'new_stock_quantity'
          and variant_change ->> 'variant_id' = batch_change ->> 'variant_id'
          and variant_change ->> 'stock_location_id' = batch_change ->> 'stock_location_id'
          and (variant_change ->> 'new_stock_quantity')::numeric
            - (variant_change ->> 'expected_stock_quantity')::numeric
              = (batch_change ->> 'quantity_added')::numeric
      )
  ) then raise exception 'batch_quantity_does_not_match_stock_increase'; end if;

  begin
    for v_change in select value from jsonb_array_elements(p_batch_changes)
    loop
      v_action := v_change ->> 'action';
      v_variant_id := (v_change ->> 'variant_id')::uuid;
      v_location_id := (v_change ->> 'stock_location_id')::uuid;
      v_quantity_added := (v_change ->> 'quantity_added')::numeric;
      if v_action = 'create' then
        if exists (
          select 1 from public.inventory_batches batch
          where batch.company_id = v_company_id
            and batch.variant_id = v_variant_id
            and batch.stock_location_id = v_location_id
            and batch.remaining > 0
        ) then raise exception 'stale_catalog_batch_export'; end if;
        continue;
      end if;

      v_batch_id := (v_change ->> 'batch_id')::uuid;
      select * into v_batch from public.inventory_batches batch
      where batch.id = v_batch_id
        and batch.company_id = v_company_id
        and batch.variant_id = v_variant_id
        and batch.stock_location_id = v_location_id;
      if not found or v_batch.remaining <= 0 then
        raise exception 'stale_catalog_batch_export';
      end if;
      v_expected_remaining := (v_change ->> 'expected_remaining')::numeric;
      v_expected_unit_cost := (v_change ->> 'expected_unit_cost')::numeric;
      v_expected_remaining_cost := (v_change ->> 'expected_remaining_cost')::bigint;
      v_expected_batch_number := nullif(btrim(v_change ->> 'expected_batch_number'), '');
      v_expected_expiry_date := nullif(v_change ->> 'expected_expiry_date', '')::date;
      if v_batch.remaining <> v_expected_remaining
        or v_batch.unit_cost <> v_expected_unit_cost
        or v_batch.remaining_cost <> v_expected_remaining_cost
        or nullif(btrim(v_batch.batch_number), '') is distinct from v_expected_batch_number
        or v_batch.expiry_date is distinct from v_expected_expiry_date then
        raise exception 'stale_catalog_batch_export';
      end if;
      select batch.id into v_latest_batch_id
      from public.inventory_batches batch
      where batch.company_id = v_company_id
        and batch.variant_id = v_variant_id
        and batch.stock_location_id = v_location_id
        and batch.remaining > 0
      order by batch.purchased_at desc, batch.created_at desc, batch.id desc
      limit 1;
      if (v_change ->> 'latest')::boolean then
        if v_latest_batch_id is distinct from v_batch_id then
          raise exception 'stale_catalog_batch_export';
        end if;
      elsif v_latest_batch_id = v_batch_id then
        raise exception 'stale_catalog_batch_export';
      elsif v_quantity_added > 0 then
        raise exception 'stock_increase_requires_latest_batch';
      end if;
    end loop;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_batch_change';
  end;

  perform set_config('app.cache_change_suppressed', 'on', true);

  for v_change in
    select value from jsonb_array_elements(p_batch_changes)
    order by coalesce(value ->> 'batch_id', value ->> 'variant_id')
  loop
    v_action := v_change ->> 'action';
    v_variant_id := (v_change ->> 'variant_id')::uuid;
    v_location_id := (v_change ->> 'stock_location_id')::uuid;
    v_quantity_added := (v_change ->> 'quantity_added')::numeric;
    v_new_unit_cost := (v_change ->> 'new_unit_cost')::numeric;
    v_new_batch_number := nullif(btrim(v_change ->> 'new_batch_number'), '');
    v_new_expiry_date := nullif(v_change ->> 'new_expiry_date', '')::date;

    if v_action = 'create' then
      v_added_cost := round(v_quantity_added * v_new_unit_cost)::bigint;
      insert into public.inventory_batches(
        company_id, variant_id, stock_location_id, quantity, remaining,
        unit_cost, original_cost, remaining_cost, batch_number, expiry_date, purchased_at
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity_added, v_quantity_added,
        v_new_unit_cost, v_added_cost, v_added_cost, v_new_batch_number, v_new_expiry_date,
        clock_timestamp()
      ) returning * into v_updated_batch;
      v_batch_id := v_updated_batch.id;
      v_batches_created := v_batches_created + 1;
    else
      v_batch_id := (v_change ->> 'batch_id')::uuid;
      select * into v_batch from public.inventory_batches batch
      where batch.id = v_batch_id and batch.company_id = v_company_id;
      v_consumed_cost := v_batch.original_cost - v_batch.remaining_cost;
      v_corrected_remaining_cost := case
        when v_change?'new_remaining_cost' then (v_change->>'new_remaining_cost')::bigint
        when v_new_unit_cost = v_batch.unit_cost then v_batch.remaining_cost
        else round(v_batch.remaining * v_new_unit_cost)::bigint
      end;
      v_added_cost := round(v_quantity_added * v_new_unit_cost)::bigint;
      if v_consumed_cost::numeric + v_corrected_remaining_cost::numeric + v_added_cost::numeric
        > 9223372036854775807 then
        raise exception 'invalid_batch_change';
      end if;
      v_new_remaining_cost := v_corrected_remaining_cost + v_added_cost;
      v_new_original_cost := v_consumed_cost + v_new_remaining_cost;
      v_value_difference := v_corrected_remaining_cost - v_batch.remaining_cost;
      if v_new_expiry_date is distinct from v_batch.expiry_date then
        update public.inventory_batches batch
        set quantity = batch.quantity + v_quantity_added,
            remaining = batch.remaining + v_quantity_added,
            unit_cost = v_new_unit_cost,
            original_cost = v_new_original_cost,
            remaining_cost = v_new_remaining_cost,
            batch_number = v_new_batch_number,
            expiry_date = v_new_expiry_date
        where batch.id = v_batch_id and batch.company_id = v_company_id
        returning * into v_updated_batch;
      else
        -- Omitting expiry_date preserves retained history when expiry tracking is off.
        update public.inventory_batches batch
        set quantity = batch.quantity + v_quantity_added,
            remaining = batch.remaining + v_quantity_added,
            unit_cost = v_new_unit_cost,
            original_cost = v_new_original_cost,
            remaining_cost = v_new_remaining_cost,
            batch_number = v_new_batch_number
        where batch.id = v_batch_id and batch.company_id = v_company_id
        returning * into v_updated_batch;
      end if;
      v_batches_updated := v_batches_updated + 1;

      if v_value_difference <> 0 then
        v_correction_id := gen_random_uuid();
        if v_value_difference > 0 then
          v_lines := jsonb_build_array(
            jsonb_build_object('account_code', 'INVENTORY', 'debit', v_value_difference,
              'meta', jsonb_build_object('batchId', v_batch_id, 'variantId', v_variant_id,
                'stockLocationId', v_location_id, 'oldUnitCost', v_batch.unit_cost,
                'newUnitCost', v_new_unit_cost, 'remainingQuantity', v_batch.remaining)),
            jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT',
              'credit', v_value_difference,
              'meta', jsonb_build_object('batchId', v_batch_id,
                'reason', 'Batch cost correction'))
          );
        else
          v_lines := jsonb_build_array(
            jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT',
              'debit', -v_value_difference,
              'meta', jsonb_build_object('batchId', v_batch_id,
                'reason', 'Batch cost correction')),
            jsonb_build_object('account_code', 'INVENTORY', 'credit', -v_value_difference,
              'meta', jsonb_build_object('batchId', v_batch_id, 'variantId', v_variant_id,
                'stockLocationId', v_location_id, 'oldUnitCost', v_batch.unit_cost,
                'newUnitCost', v_new_unit_cost, 'remainingQuantity', v_batch.remaining))
          );
        end if;
        perform public.post_journal_entry(
          v_company_id, 'InventoryBatchCostCorrection',
          'BatchCostCorrection:' || v_correction_id::text,
          'Correct remaining inventory batch value', v_lines
        );
      end if;
    end if;

    if v_quantity_added > 0 then
      select
        (variant_change ->> 'expected_stock_quantity')::numeric,
        (variant_change ->> 'new_stock_quantity')::numeric
      into v_expected_stock, v_new_stock
      from jsonb_array_elements(p_variant_changes) variant_change
      where variant_change ? 'new_stock_quantity'
        and (variant_change ->> 'variant_id')::uuid = v_variant_id
        and (variant_change ->> 'stock_location_id')::uuid = v_location_id;
      v_adjustment_id := gen_random_uuid();
      insert into public.inventory_movements(
        company_id, variant_id, batch_id, stock_location_id, type, quantity,
        unit_cost, total_cost, source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, v_location_id, 'adjustment',
        v_quantity_added, v_new_unit_cost, v_added_cost, 'StockAdjustment',
        v_adjustment_id::text,
        jsonb_build_object('reason', 'Bulk product workbook',
          'previousQuantity', v_expected_stock, 'newQuantity', v_new_stock,
          'locationId', v_location_id)
      );
      if v_added_cost > 0 then
        perform public.post_journal_entry(
          v_company_id, 'StockAdjustment', v_adjustment_id::text,
          'Stock adjustment · Bulk product workbook',
          jsonb_build_array(
            jsonb_build_object('account_code', 'INVENTORY', 'debit', v_added_cost,
              'meta', jsonb_build_object('adjustmentId', v_adjustment_id,
                'variantId', v_variant_id, 'batchId', v_batch_id,
                'locationId', v_location_id, 'reason', 'Bulk product workbook')),
            jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_added_cost,
              'meta', jsonb_build_object('adjustmentId', v_adjustment_id,
                'variantId', v_variant_id, 'batchId', v_batch_id,
                'locationId', v_location_id, 'reason', 'Bulk product workbook'))
          )
        );
      end if;
    end if;

    insert into public.audit_log(
      company_id, table_name, operation, row_id, actor, old_data, new_data
    ) values (
      v_company_id, 'inventory_batches',
      case when v_action = 'create' then 'INSERT' else 'UPDATE' end,
      v_batch_id::text, auth.uid(),
      case when v_action = 'create' then null else to_jsonb(v_batch) end,
      to_jsonb(v_updated_batch)
    );
    v_batch_changes := v_batch_changes + 1;
  end loop;

  -- Reductions retain FIFO. Positive deltas were applied above to the link.
  for v_change in
    select value from jsonb_array_elements(p_variant_changes)
    where value ? 'new_stock_quantity'
      and (value ->> 'new_stock_quantity')::numeric
        <= (value ->> 'expected_stock_quantity')::numeric
    order by value ->> 'variant_id'
  loop
    perform public.post_stock_adjustment_at_location(
      (v_change ->> 'stock_location_id')::uuid,
      (v_change ->> 'variant_id')::uuid,
      (v_change ->> 'expected_stock_quantity')::numeric,
      (v_change ->> 'new_stock_quantity')::numeric,
      'Bulk product workbook', null
    );
  end loop;

  select count(*) into v_stock_changes
  from jsonb_array_elements(p_variant_changes) change
  where change ? 'new_stock_quantity'
    and (change ->> 'new_stock_quantity')::numeric
      is distinct from (change ->> 'expected_stock_quantity')::numeric;

  perform set_config('app.cache_change_suppressed', 'off', true);
  return jsonb_build_object(
    'stock_changes', v_stock_changes,
    'batch_changes', v_batch_changes,
    'batches_created', v_batches_created,
    'batches_updated', v_batches_updated
  );
end;
$$;

-- Decimal cost path: apply_product_workbook (from 20260916000000_0173_product_workbook.sql).
create or replace function public.apply_product_workbook(p_request_id uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '120s' as $$
declare
  v_company uuid := public.current_company_id();
  v_location uuid;
  v_stock_permission boolean := public.current_user_has_permission('ManageStockAdjustments');
  v_financial boolean := public.current_user_has_permission('ViewFinancials');
  v_hash text;
  v_import public.catalog_imports%rowtype;
  v_maker public.manufacturers%rowtype;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  m jsonb; p jsonb; v jsonb; x jsonb; fields jsonb;
  v_makers jsonb := '{}';
  v_product_id uuid; v_maker_id uuid; v_current_packs jsonb;
  v_variants jsonb; v_variant_payload jsonb; v_inventory jsonb;
  v_seen_products text[] := '{}'; v_seen_variants text[] := '{}'; v_seen_makers text[] := '{}';
  v_products_created integer := 0; v_products_updated integer := 0;
  v_variants_created integer := 0; v_variants_updated integer := 0;
  v_makers_changed integer := 0; v_packs_changed integer := 0; v_opening_batches integer := 0;
  v_metadata_changed boolean; v_packs_changed_here boolean;
  v_result jsonb;
  v_row_count integer := 0;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then raise exception 'permission_denied: ManageCatalog required'; end if;
  if p_request_id is null or jsonb_typeof(p_changes) is distinct from 'object'
    or p_changes->>'format' is distinct from 'dukarun-products-1'
    or p_changes->>'company_id' is distinct from v_company::text then raise exception 'invalid_product_workbook'; end if;
  v_location := (p_changes->>'location_id')::uuid;
  if not exists(select 1 from public.stock_locations where id=v_location and company_id=v_company)
    or not public.current_user_can_access_location(v_location) then raise exception 'location_access_denied'; end if;
  foreach v_hash in array array['manufacturers','products','stock','batches'] loop
    if jsonb_typeof(p_changes->v_hash) is distinct from 'array'
      or jsonb_array_length(p_changes->v_hash)>10000 then raise exception 'invalid_workbook_changes'; end if;
  end loop;
  if jsonb_array_length(p_changes->'products')+jsonb_array_length(p_changes->'manufacturers')
    +jsonb_array_length(p_changes->'stock')+jsonb_array_length(p_changes->'batches')=0 then raise exception 'workbook_has_no_changes'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  v_hash := encode(extensions.digest(p_changes::text,'sha256'),'hex');
  select * into v_import from public.catalog_imports where company_id=v_company and idempotency_key=p_request_id for update;
  if found then
    if v_import.status<>'completed' or v_import.result->>'product_workbook_hash' is distinct from v_hash then
      raise exception 'product_workbook_retry_mismatch'; end if;
    return v_import.result->'product_workbook_result';
  end if;

  -- Validate all exported versions and relationships before any domain writes.
  for m in select value from jsonb_array_elements(p_changes->'manufacturers') order by value->>'key' loop
    if nullif(m->>'key','') is null or m->>'key'=any(v_seen_makers) then raise exception 'duplicate_manufacturer_key'; end if;
    v_seen_makers:=array_append(v_seen_makers,m->>'key');
    if jsonb_typeof(m->'name') is distinct from 'string' or length(btrim(m->>'name')) not between 1 and 120
      or jsonb_typeof(m->'active') is distinct from 'boolean' then raise exception 'invalid_manufacturer'; end if;
    if nullif(m->>'id','') is not null then
      if m->>'key' is distinct from m->>'id' then raise exception 'invalid_manufacturer_key'; end if;
      select * into v_maker from public.manufacturers where id=(m->>'id')::uuid and company_id=v_company for update;
      if not found or v_maker.updated_at is distinct from (m->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_manufacturer'; end if;
    end if;
  end loop;
  for p in select value from jsonb_array_elements(p_changes->'products') order by value->>'key' loop
    if nullif(p->>'key','') is null or p->>'key'=any(v_seen_products) then raise exception 'duplicate_product_key'; end if;
    v_seen_products:=array_append(v_seen_products,p->>'key');
    fields:=p->'values';
    if jsonb_typeof(fields) is distinct from 'object' or jsonb_typeof(fields->'name') is distinct from 'string'
      or length(btrim(fields->>'name')) not between 1 and 200
      or jsonb_typeof(fields->'active') is distinct from 'boolean'
      or length(coalesce(fields->>'barcode',''))>64
      or jsonb_typeof(p->'variants') is distinct from 'array' then raise exception 'invalid_workbook_product'; end if;
    if nullif(p->>'id','') is not null then
      if p->>'key' is distinct from p->>'id' then raise exception 'invalid_product_key'; end if;
      select * into v_product from public.products where id=(p->>'id')::uuid and company_id=v_company for update;
      if not found or v_product.updated_at is distinct from (p->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_product'; end if;
    elsif not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required';
    elsif jsonb_array_length(p->'variants')=0 then raise exception 'variants_required'; end if;
    for v in select value from jsonb_array_elements(p->'variants') order by value->>'key' loop
      if nullif(v->>'key','') is null or v->>'key'=any(v_seen_variants) then raise exception 'duplicate_variant_key'; end if;
      v_seen_variants:=array_append(v_seen_variants,v->>'key');
      fields:=v->'values';
      if jsonb_typeof(fields) is distinct from 'object' or jsonb_typeof(fields->'name') is distinct from 'string'
        or length(btrim(fields->>'name')) not between 1 and 200
        or fields->>'kind' not in ('good','service') or fields->>'kind' is null
        or length(btrim(coalesce(fields->>'stock_unit',''))) not between 1 and 40
        or length(coalesce(fields->>'sku',''))>64 or length(coalesce(fields->>'barcode',''))>64
        or jsonb_typeof(fields->'active') is distinct from 'boolean'
        or jsonb_typeof(fields->'track_inventory') is distinct from 'boolean'
        or jsonb_typeof(fields->'allow_fractional') is distinct from 'boolean'
        or jsonb_typeof(v->'packs') is distinct from 'array'
        or jsonb_typeof(v->'expected_packs') is distinct from 'array' then raise exception 'invalid_workbook_variant'; end if;
      v_row_count:=v_row_count+1+jsonb_array_length(v->'packs');
      if v_row_count>10000 then raise exception 'workbook_row_limit'; end if;
      foreach v_hash in array array['price','wholesale_price'] loop
        if v_hash='wholesale_price' and jsonb_typeof(fields->v_hash)='null' then continue; end if;
        if jsonb_typeof(fields->v_hash) is distinct from 'number' or (fields->>v_hash)::numeric<0
          or (fields->>v_hash)::numeric>9007199254740991 or (fields->>v_hash)::numeric<>trunc((fields->>v_hash)::numeric)
          then raise exception 'invalid_workbook_price'; end if;
      end loop;
      if fields->>'kind'='service' and ((fields->>'track_inventory')::boolean or (fields->>'allow_fractional')::boolean) then raise exception 'invalid_service_stock_flags'; end if;
      if nullif(v->>'id','') is not null then
        if v->>'key' is distinct from v->>'id' then raise exception 'invalid_variant_key'; end if;
        select * into v_variant from public.product_variants where id=(v->>'id')::uuid
          and product_id=(p->>'id')::uuid and company_id=v_company for update;
        if not found or v_variant.updated_at is distinct from (v->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_variant'; end if;
        if fields->>'stock_unit' is distinct from v_variant.stock_unit then raise exception 'existing_stock_unit_immutable_in_workbook'; end if;
        v_current_packs:=public.catalog_packs_json(v_variant.id);
        if not (v_current_packs @> (v->'expected_packs') and (v->'expected_packs') @> v_current_packs)
          or jsonb_array_length(v_current_packs)<>jsonb_array_length(v->'expected_packs') then raise exception 'stale_workbook_packs'; end if;
        if exists(select 1 from jsonb_array_elements(v_current_packs) old where not exists(
          select 1 from jsonb_array_elements(v->'packs') new where new->>'id'=old->>'id')) then raise exception 'workbook_pack_omission: use active=false to retire a pack'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)<>0 then raise exception 'opening_stock_new_variants_only'; end if;
      else
        if not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
        if jsonb_array_length(v->'expected_packs')<>0 then raise exception 'invalid_new_variant_baseline'; end if;
        if nullif(p->>'id','') is not null and exists(select 1 from public.product_variants
          where product_id=(p->>'id')::uuid and company_id=v_company and lower(btrim(name))=lower(btrim(fields->>'name'))) then raise exception 'variant_name_already_exists'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)<0 or coalesce((v->>'opening_quantity')::numeric,0)>99999999999.999
          or scale(coalesce((v->>'opening_quantity')::numeric,0))>3
          or not (fields->>'allow_fractional')::boolean and coalesce((v->>'opening_quantity')::numeric,0)<>trunc(coalesce((v->>'opening_quantity')::numeric,0)) then raise exception 'invalid_opening_quantity'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)>0 then
          if not v_financial then raise exception 'permission_denied: ViewFinancials required'; end if;
          if jsonb_typeof(v->'opening_unit_cost') is distinct from 'number' or (v->>'opening_unit_cost')::numeric<0
            or (v->>'opening_unit_cost')::numeric>9007199254740991 or (v->>'opening_unit_cost')::numeric<>round((v->>'opening_unit_cost')::numeric,2) then raise exception 'invalid_opening_cost'; end if;
          v_opening_batches:=v_opening_batches+1;
        end if;
      end if;
      for x in select value from jsonb_array_elements(v->'packs') loop
        if jsonb_typeof(x->'units_per_pack') is distinct from 'number' or (x->>'units_per_pack')::numeric<=1
          or (x->>'units_per_pack')::numeric<>trunc((x->>'units_per_pack')::numeric)
          or (jsonb_typeof(x->'sale_price') is distinct from 'null' and (jsonb_typeof(x->'sale_price') is distinct from 'number'
            or (x->>'sale_price')::numeric<=0 or (x->>'sale_price')::numeric>9007199254740991
            or (x->>'sale_price')::numeric<>trunc((x->>'sale_price')::numeric))) then raise exception 'invalid_workbook_pack'; end if;
      end loop;
    end loop;
  end loop;
  -- Inventory rows must refer to reviewed variants at this workbook's location.
  for x in select value from jsonb_array_elements((p_changes->'stock')||(p_changes->'batches')) loop
    if x->>'stock_location_id' is distinct from v_location::text or not exists(
      select 1 from jsonb_array_elements(p_changes->'products') requested_product,
        lateral jsonb_array_elements(requested_product->'variants') requested_variant
      where requested_variant->>'id'=x->>'variant_id') then raise exception 'invalid_workbook_stock_identity'; end if;
  end loop;

  for m in select value from jsonb_array_elements(p_changes->'manufacturers') loop
    if nullif(m->>'id','') is null then
      insert into public.manufacturers(company_id,name,active) values(v_company,btrim(m->>'name'),(m->>'active')::boolean) returning id into v_maker_id;
    else
      v_maker_id:=(m->>'id')::uuid;
      update public.manufacturers set name=btrim(m->>'name'),active=(m->>'active')::boolean,updated_at=clock_timestamp()
        where id=v_maker_id and company_id=v_company;
    end if;
    v_makers:=v_makers||jsonb_build_object(m->>'key',v_maker_id);
    v_makers_changed:=v_makers_changed+1;
  end loop;
  for p in select value from jsonb_array_elements(p_changes->'products') loop
    fields:=p->'values';
    v_product_id:=nullif(p->>'id','')::uuid;
    v_maker_id:=null;
    if nullif(fields->>'manufacturer_key','') is not null then
      v_maker_id:=coalesce(v_makers->>(fields->>'manufacturer_key'),fields->>'manufacturer_key')::uuid;
      if not exists(select 1 from public.manufacturers where id=v_maker_id and company_id=v_company
        and (active or exists(select 1 from public.products where id=v_product_id and manufacturer_id=v_maker_id))) then raise exception 'invalid_workbook_manufacturer'; end if;
    end if;
    v_variants:='[]';
    for v in select value from jsonb_array_elements(p->'variants') loop
      v_variant_payload:=v->'values';
      if nullif(v->>'id','') is not null then
        select * into v_variant from public.product_variants where id=(v->>'id')::uuid and company_id=v_company;
        v_packs_changed_here:=not ((v->'packs') @> (v->'expected_packs') and (v->'expected_packs') @> (v->'packs'));
        v_metadata_changed:= (to_jsonb(v_variant)-'id'-'company_id'-'product_id'-'created_at'-'updated_at'-'price'-'wholesale_price'-'active')
          is distinct from (v_variant_payload-'price'-'wholesale_price'-'active');
        if (v_metadata_changed or v_packs_changed_here) and not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
        if (to_jsonb(v_variant)-'id'-'company_id'-'product_id'-'created_at'-'updated_at')=v_variant_payload and not v_packs_changed_here then continue; end if;
        v_variant_payload:=v_variant_payload||jsonb_build_object('variant_id',v_variant.id);
        if v_packs_changed_here then
          v_variant_payload:=v_variant_payload||jsonb_build_object('packs',v->'packs');
          select v_packs_changed+count(*) into v_packs_changed
            from jsonb_array_elements(v->'packs') proposed
            where not exists(select 1 from jsonb_array_elements(v->'expected_packs') original where original=proposed);
        end if;
        v_variants_updated:=v_variants_updated+1;
      else
        v_variant_payload:=v_variant_payload||jsonb_build_object('packs',v->'packs','opening_quantity',coalesce((v->>'opening_quantity')::numeric,0),
          'opening_unit_cost',(v->>'opening_unit_cost')::numeric,'opening_location_id',v_location,'batch_number',v->>'batch_number','expiry_date',v->>'expiry_date');
        v_variants_created:=v_variants_created+1;
        v_packs_changed:=v_packs_changed+jsonb_array_length(v->'packs');
      end if;
      v_variants:=v_variants||jsonb_build_array(v_variant_payload);
    end loop;
    if v_product_id is null then
      v_product_id:=public.create_catalog_product_with_manufacturer(fields->>'name',v_variants,fields->>'barcode',null,v_maker_id);
      update public.products set active=(fields->>'active')::boolean where id=v_product_id;
      v_products_created:=v_products_created+1;
    else
      select * into v_product from public.products where id=v_product_id and company_id=v_company;
      if (v_product.name is distinct from fields->>'name' or v_product.barcode is distinct from nullif(fields->>'barcode','')) and not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
      if jsonb_array_length(v_variants)>0 then
        perform public.update_catalog_product(v_product_id,fields->>'name',v_variants,fields->>'barcode',(fields->>'active')::boolean);
      end if;
      if v_product.name is distinct from fields->>'name' or v_product.barcode is distinct from nullif(fields->>'barcode','')
        or v_product.active is distinct from (fields->>'active')::boolean or v_product.manufacturer_id is distinct from v_maker_id then
        update public.products set name=fields->>'name',barcode=nullif(fields->>'barcode',''),active=(fields->>'active')::boolean,
          manufacturer_id=v_maker_id,updated_at=clock_timestamp() where id=v_product_id and company_id=v_company;
      end if;
      v_products_updated:=v_products_updated+1;
    end if;
    if (select tax_category_id from public.products where id=v_product_id) is distinct from nullif(fields->>'tax_category_id','')::uuid then
      perform public.set_product_tax_category(v_product_id,nullif(fields->>'tax_category_id','')::uuid);
    end if;
  end loop;
  v_inventory:=public.apply_catalog_workbook_inventory_changes(p_changes->'stock',p_changes->'batches');
  perform public.emit_cache_reset(v_company,'catalog');
  v_result:=jsonb_build_object('products_created',v_products_created,'products_updated',v_products_updated,
    'variants_created',v_variants_created,'variants_updated',v_variants_updated,'manufacturers_changed',v_makers_changed,
    'packs_changed',v_packs_changed,'stock_changes',coalesce((v_inventory->>'stock_changes')::integer,0),
    'batch_changes',coalesce((v_inventory->>'batch_changes')::integer,0)+v_opening_batches);
  insert into public.catalog_imports(company_id,actor,mode,idempotency_key,status,result,completed_at)
    values(v_company,auth.uid(),'merge',p_request_id,'completed',jsonb_build_object(
      'product_workbook_hash',encode(extensions.digest(p_changes::text,'sha256'),'hex'),'product_workbook_result',v_result),clock_timestamp());
  return v_result;
end;
$$;

revoke all on function public.post_stock_adjustment(uuid,numeric,numeric,text,numeric) from public,anon;
revoke all on function public.post_stock_adjustment_at_location(uuid,uuid,numeric,numeric,text,numeric) from public,anon;
grant execute on function public.post_stock_adjustment(uuid,numeric,numeric,text,numeric) to authenticated;
grant execute on function public.post_stock_adjustment_at_location(uuid,uuid,numeric,numeric,text,numeric) to authenticated;
-- Supplier comparisons are per base stock unit, not per purchased pack.
create view public.supplier_variant_performance with (security_invoker=true) as
select pl.company_id,p.supplier_id,pl.variant_id,
  count(distinct pl.purchase_id) as purchase_count,
  sum(pl.stock_quantity) as total_quantity,
  sum(pl.line_total)::bigint as total_spend,
  round(sum(pl.line_total)/nullif(sum(pl.stock_quantity),0),2) as average_unit_cost,
  min(round(pl.line_total/nullif(pl.stock_quantity,0),2)) as lowest_unit_cost,
  max(round(pl.line_total/nullif(pl.stock_quantity,0),2)) as highest_unit_cost,
  (array_agg(round(pl.line_total/nullif(pl.stock_quantity,0),2)
    order by p.purchase_date desc,p.created_at desc,pl.created_at desc))[1] as last_unit_cost,
  max(p.purchase_date) as last_purchase_date
from public.purchase_lines pl
join public.purchases p on p.id=pl.purchase_id and p.company_id=pl.company_id
where p.status='posted'
group by pl.company_id,p.supplier_id,pl.variant_id;
grant select on public.supplier_variant_performance to authenticated;
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

  -- Fractional buying rates can give a real stock movement a zero whole-KES value.
  -- Preserve its reason even when there is no monetary journal to link back to.
  if v_total = 0 then
    update public.inventory_movements set meta = coalesce(meta,'{}'::jsonb)
      || jsonb_build_object('reason',p_reason)
    where company_id=v_company_id and source_type='InventoryWriteOff'
      and source_id=v_adjustment_id::text;
    return null;
  end if;

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

notify pgrst, 'reload schema';
