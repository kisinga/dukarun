-- One atomic workbook transaction, including pack definitions and ordinary stock/value edits.
create or replace function public.apply_catalog_workbook_units(
  p_variant_changes jsonb default '[]',p_product_changes jsonb default '[]',
  p_disable_changes jsonb default '[]',p_batch_changes jsonb default '[]',
  p_pack_changes jsonb default '[]',p_import_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();c jsonb;r jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if jsonb_array_length(p_pack_changes)>0 and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required'; end if;
  if jsonb_typeof(p_pack_changes) is distinct from 'array' or jsonb_array_length(p_pack_changes)>10000 then
    raise exception 'invalid_pack_changes'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  for c in select * from jsonb_array_elements(p_pack_changes) order by value->>'variant_id' loop
    perform 1 from public.product_variants where id=(c->>'variant_id')::uuid and company_id=v_company for update;
    if not found then raise exception 'invalid_variant'; end if;
    if public.catalog_packs_json((c->>'variant_id')::uuid) is distinct from c->'expected_packs' then
      raise exception 'stale_pack_export: pack definitions changed after export'; end if;
  end loop;
  if jsonb_array_length(p_variant_changes)+jsonb_array_length(p_product_changes)+jsonb_array_length(p_disable_changes)+jsonb_array_length(p_batch_changes)>0 or p_import_id is not null then
    r:=public.apply_catalog_workbook_updates(p_variant_changes,p_product_changes,p_disable_changes,p_batch_changes,p_import_id);
  else
    if jsonb_array_length(p_pack_changes)=0 then raise exception 'invalid_catalog_change_count'; end if;
    r:=jsonb_build_object('updated_variants',0,'retail_changes',0,'wholesale_changes',0,'stock_changes',0,
      'manufacturer_changes',0,'created',0,'disabled_variants',0,'disabled_products',0,'batch_changes',0,'batches_created',0,'batches_updated',0);
  end if;
  for c in select * from jsonb_array_elements(p_pack_changes) order by value->>'variant_id' loop
    perform public.save_variant_packs((c->>'variant_id')::uuid,c->>'stock_unit',c->'packs');
  end loop;
  return r||jsonb_build_object('pack_changes',jsonb_array_length(p_pack_changes));
end;
$$;
revoke all on function public.apply_catalog_workbook_units(jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.apply_catalog_workbook_units(jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to authenticated;

-- Exact remaining-value corrections preserve already consumed COGS.
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
  v_expected_unit_cost bigint;
  v_expected_remaining_cost bigint;
  v_expected_batch_number text;
  v_expected_expiry_date date;
  v_new_unit_cost bigint;
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
        or (change ->> 'expected_unit_cost')::numeric
          <> trunc((change ->> 'expected_unit_cost')::numeric)
        or (change ->> 'expected_remaining_cost')::numeric < 0
        or (change ->> 'expected_remaining_cost')::numeric > 9007199254740991
        or (change ->> 'expected_remaining_cost')::numeric
          <> trunc((change ->> 'expected_remaining_cost')::numeric)
        or (change ->> 'new_unit_cost')::numeric < 0
        or (change ->> 'new_unit_cost')::numeric > 9007199254740991
        or (change ->> 'new_unit_cost')::numeric <> trunc((change ->> 'new_unit_cost')::numeric)
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
      v_expected_unit_cost := (v_change ->> 'expected_unit_cost')::bigint;
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
    v_new_unit_cost := (v_change ->> 'new_unit_cost')::bigint;
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
