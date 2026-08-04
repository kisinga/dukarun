-- Readable, location-scoped stock-adjustment history. FIFO write-offs may
-- create several movements, so the feed groups them into one user action.

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
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
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
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
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
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

create or replace function public.stock_adjustment_history(
  p_location_id uuid,
  p_variant_id uuid default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  adjustment_id text,
  adjusted_at timestamptz,
  variant_id uuid,
  product_name text,
  variant_name text,
  sku text,
  location_id uuid,
  location_name text,
  quantity_change numeric,
  quantity_before numeric,
  quantity_after numeric,
  stock_value bigint,
  reason text,
  actor_id uuid,
  actor_name text,
  batch_movements integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  return query
  with grouped as (
    select
      m.source_id as adjustment_id,
      max(m.created_at) as adjusted_at,
      m.variant_id,
      p.name::text as product_name,
      v.name::text as variant_name,
      v.sku::text,
      m.stock_location_id as location_id,
      l.name::text as location_name,
      sum(m.quantity)::numeric as quantity_change,
      max(nullif(m.meta ->> 'previousQuantity', '')::numeric) as quantity_before,
      max(nullif(m.meta ->> 'newQuantity', '')::numeric) as quantity_after,
      coalesce(sum(m.total_cost), 0)::bigint as stock_value,
      coalesce(
        max(nullif(m.meta ->> 'reason', '')),
        regexp_replace(max(e.memo), '^Stock adjustment · ', '')
      )::text as reason,
      max(m.actor::text)::uuid as actor_id,
      coalesce(
        max(sp.display_name),
        case when max(m.actor::text) is not null then 'User …' || right(max(m.actor::text), 6) end,
        'System'
      )::text as actor_name,
      count(*)::integer as batch_movements
    from public.inventory_movements m
    join public.product_variants v on v.id = m.variant_id and v.company_id = m.company_id
    join public.products p on p.id = v.product_id and p.company_id = m.company_id
    join public.stock_locations l on l.id = m.stock_location_id
    left join public.ledger_journal_entries e
      on e.company_id = m.company_id and e.source_id = m.source_id
      and e.source_type in ('StockAdjustment', 'InventoryWriteOff')
    left join public.company_staff_profiles sp
      on sp.company_id = m.company_id and sp.user_id = m.actor
    where m.company_id = v_company_id
      and m.stock_location_id = v_location_id
      and m.source_type in ('StockAdjustment', 'InventoryWriteOff')
      and (p_variant_id is null or m.variant_id = p_variant_id)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', p.name, v.name, v.sku, m.meta ->> 'reason', e.memo)
          ilike '%' || trim(p_search) || '%'
      )
    group by m.source_id, m.variant_id, p.name, v.name, v.sku,
      m.stock_location_id, l.name
  )
  select g.*, count(*) over()::bigint as total_count
  from grouped g
  order by g.adjusted_at desc, g.adjustment_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  from anon, public;
grant execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  to authenticated;
