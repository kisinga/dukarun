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
