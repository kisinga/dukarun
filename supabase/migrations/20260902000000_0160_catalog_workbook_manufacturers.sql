-- One catalog workbook can update variant prices/stock and product-level
-- manufacturers atomically. Product updates retain their own optimistic lock
-- because a manufacturer belongs to the product shared by every variant row.

create or replace function public.apply_catalog_workbook_updates(
  p_variant_changes jsonb default '[]'::jsonb,
  p_product_changes jsonb default '[]'::jsonb,
  p_disable_changes jsonb default '[]'::jsonb,
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
  v_variant_count integer;
  v_product_count integer;
  v_disable_count integer;
  v_target_count integer;
  v_manufacturer_changes integer := 0;
  v_disabled_variants integer := 0;
  v_disabled_products integer := 0;
  v_import_result jsonb;
  v_variant_result jsonb := jsonb_build_object(
    'updated_variants', 0,
    'retail_changes', 0,
    'wholesale_changes', 0,
    'stock_changes', 0
  );
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if jsonb_typeof(p_variant_changes) is distinct from 'array'
    or jsonb_typeof(p_product_changes) is distinct from 'array'
    or jsonb_typeof(p_disable_changes) is distinct from 'array' then
    raise exception 'catalog_changes_required';
  end if;

  v_variant_count := jsonb_array_length(p_variant_changes);
  v_product_count := jsonb_array_length(p_product_changes);
  v_disable_count := jsonb_array_length(p_disable_changes);
  if (v_variant_count + v_product_count + v_disable_count < 1 and p_import_id is null)
    or v_variant_count > 10000
    or v_product_count > 10000
    or v_disable_count > 10000 then
    raise exception 'invalid_catalog_change_count';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_product_changes) change
    where case
      when jsonb_typeof(change) <> 'object' then true
      when jsonb_typeof(change -> 'product_id') <> 'string' then true
      when coalesce(change ->> 'product_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'expected_updated_at') <> 'string' then true
      when nullif(btrim(change ->> 'expected_updated_at'), '') is null then true
      when not (change ? 'new_manufacturer_name') then true
      when jsonb_typeof(change -> 'new_manufacturer_name') = 'null' then false
      when jsonb_typeof(change -> 'new_manufacturer_name') <> 'string' then true
      else length(btrim(change ->> 'new_manufacturer_name')) not between 1 and 120
    end
  ) then raise exception 'invalid_product_change'; end if;

  if (
    select count(distinct (change ->> 'product_id')::uuid)
    from jsonb_array_elements(p_product_changes) change
  ) <> v_product_count then raise exception 'duplicate_product_id'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_disable_changes) change
    where case
      when jsonb_typeof(change) <> 'object' then true
      when jsonb_typeof(change -> 'variant_id') <> 'string' then true
      when coalesce(change ->> 'variant_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'product_id') <> 'string' then true
      when coalesce(change ->> 'product_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'expected_updated_at') <> 'string' then true
      when nullif(btrim(change ->> 'expected_updated_at'), '') is null then true
      when jsonb_typeof(change -> 'expected_product_updated_at') <> 'string' then true
      when nullif(btrim(change ->> 'expected_product_updated_at'), '') is null then true
      when jsonb_typeof(change -> 'disable_product') <> 'boolean' then true
      else false
    end
  ) then raise exception 'invalid_disable_change'; end if;

  if (
    select count(distinct (change ->> 'variant_id')::uuid)
    from jsonb_array_elements(p_disable_changes) change
  ) <> v_disable_count then raise exception 'duplicate_disable_variant_id'; end if;

  perform 1
  from jsonb_array_elements(p_product_changes) change
  join public.products product
    on product.id = (change ->> 'product_id')::uuid
   and product.company_id = v_company_id
  order by product.id
  for update of product;

  select count(*)
  into v_target_count
  from jsonb_array_elements(p_product_changes) change
  join public.products product
    on product.id = (change ->> 'product_id')::uuid
   and product.company_id = v_company_id;
  if v_target_count <> v_product_count then raise exception 'product_not_found'; end if;

  perform 1
  from jsonb_array_elements(p_disable_changes) change
  join public.products product
    on product.id = (change ->> 'product_id')::uuid
   and product.company_id = v_company_id
  order by product.id
  for update of product;

  perform 1
  from jsonb_array_elements(p_disable_changes) change
  join public.product_variants variant
    on variant.id = (change ->> 'variant_id')::uuid
   and variant.product_id = (change ->> 'product_id')::uuid
   and variant.company_id = v_company_id
  order by variant.id
  for update of variant;

  select count(*)
  into v_target_count
  from jsonb_array_elements(p_disable_changes) change
  join public.product_variants variant
    on variant.id = (change ->> 'variant_id')::uuid
   and variant.product_id = (change ->> 'product_id')::uuid
   and variant.company_id = v_company_id;
  if v_target_count <> v_disable_count then raise exception 'disable_variant_not_found'; end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_product_changes) change
      join public.products product
        on product.id = (change ->> 'product_id')::uuid
       and product.company_id = v_company_id
      where product.updated_at <> (change ->> 'expected_updated_at')::timestamptz
    ) then raise exception 'stale_catalog_product_export'; end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_product_change';
  end;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_disable_changes) change
      join public.product_variants variant
        on variant.id = (change ->> 'variant_id')::uuid
       and variant.company_id = v_company_id
      join public.products product
        on product.id = variant.product_id and product.company_id = variant.company_id
      where variant.updated_at <> (change ->> 'expected_updated_at')::timestamptz
         or product.updated_at <> (change ->> 'expected_product_updated_at')::timestamptz
    ) then raise exception 'stale_catalog_disable_export'; end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'invalid_disable_change';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_disable_changes) change
    join public.product_variants remaining
      on remaining.product_id = (change ->> 'product_id')::uuid
     and remaining.company_id = v_company_id
     and remaining.active
    where (change ->> 'disable_product')::boolean
      and not exists (
        select 1
        from jsonb_array_elements(p_disable_changes) sibling
        where (sibling ->> 'variant_id')::uuid = remaining.id
      )
  ) then raise exception 'cannot_disable_product_with_active_variants'; end if;

  if p_import_id is not null then
    v_import_result := public.finalize_catalog_import(p_import_id);
    if v_import_result ->> 'status' <> 'completed' then
      raise exception 'catalog_create_failed: %',
        coalesce(v_import_result ->> 'error', 'new products could not be created');
    end if;
  end if;

  if v_product_count > 0 then
    perform set_config('app.cache_change_suppressed', 'on', true);

    insert into public.manufacturers as manufacturer (company_id, name)
    select distinct v_company_id, btrim(change ->> 'new_manufacturer_name')
    from jsonb_array_elements(p_product_changes) change
    where jsonb_typeof(change -> 'new_manufacturer_name') = 'string'
    on conflict (company_id, normalized_name)
    do update set
      active = true,
      updated_at = case
        when not manufacturer.active then clock_timestamp()
        else manufacturer.updated_at
      end;

    with changes as (
      select
        (change ->> 'product_id')::uuid as product_id,
        case
          when jsonb_typeof(change -> 'new_manufacturer_name') = 'null' then null
          else lower(btrim(change ->> 'new_manufacturer_name'))
        end as normalized_manufacturer
      from jsonb_array_elements(p_product_changes) change
    ), resolved as (
      select changes.product_id, manufacturer.id as manufacturer_id
      from changes
      left join public.manufacturers manufacturer
        on manufacturer.company_id = v_company_id
       and manufacturer.normalized_name = changes.normalized_manufacturer
    )
    select count(*)
    into v_manufacturer_changes
    from resolved
    join public.products product
      on product.id = resolved.product_id and product.company_id = v_company_id
    where product.manufacturer_id is distinct from resolved.manufacturer_id;

    with changes as (
      select
        (change ->> 'product_id')::uuid as product_id,
        case
          when jsonb_typeof(change -> 'new_manufacturer_name') = 'null' then null
          else lower(btrim(change ->> 'new_manufacturer_name'))
        end as normalized_manufacturer
      from jsonb_array_elements(p_product_changes) change
    ), resolved as (
      select changes.product_id, manufacturer.id as manufacturer_id
      from changes
      left join public.manufacturers manufacturer
        on manufacturer.company_id = v_company_id
       and manufacturer.normalized_name = changes.normalized_manufacturer
    )
    update public.products product
    set manufacturer_id = resolved.manufacturer_id,
        updated_at = clock_timestamp()
    from resolved
    where product.id = resolved.product_id
      and product.company_id = v_company_id
      and product.manufacturer_id is distinct from resolved.manufacturer_id;
  end if;

  if v_disable_count > 0 then
    perform set_config('app.cache_change_suppressed', 'on', true);

    update public.product_variants variant
    set active = false, updated_at = clock_timestamp()
    from jsonb_array_elements(p_disable_changes) change
    where variant.id = (change ->> 'variant_id')::uuid
      and variant.company_id = v_company_id
      and variant.active;
    get diagnostics v_disabled_variants = row_count;

    update public.products product
    set active = false, updated_at = clock_timestamp()
    from jsonb_array_elements(p_disable_changes) change
    where product.id = (change ->> 'product_id')::uuid
      and product.company_id = v_company_id
      and (change ->> 'disable_product')::boolean
      and product.active;
    get diagnostics v_disabled_products = row_count;
  end if;

  if v_variant_count > 0 then
    v_variant_result := public.apply_catalog_price_updates(p_variant_changes);
  end if;

  -- apply_catalog_price_updates emits the consolidated reset when it writes a
  -- variant. A manufacturer-only workbook needs to emit that reset here.
  perform set_config('app.cache_change_suppressed', 'off', true);
  if (v_manufacturer_changes > 0 or v_disabled_variants > 0 or v_disabled_products > 0)
    and coalesce((v_variant_result ->> 'updated_variants')::integer, 0) = 0 then
    perform public.emit_cache_reset(v_company_id, 'catalog');
  end if;

  return v_variant_result || jsonb_build_object(
    'manufacturer_changes', v_manufacturer_changes,
    'created', coalesce((v_import_result ->> 'created')::integer, 0),
    'disabled_variants', v_disabled_variants,
    'disabled_products', v_disabled_products
  );
end;
$$;

revoke execute on function public.apply_catalog_workbook_updates(jsonb, jsonb, jsonb, uuid)
  from public, anon;
grant execute on function public.apply_catalog_workbook_updates(jsonb, jsonb, jsonb, uuid)
  to authenticated;

comment on function public.apply_catalog_workbook_updates(jsonb, jsonb, jsonb, uuid) is
  'Atomically creates products and applies optimistic manufacturer, price, stock, and disable changes from one catalog workbook.';
