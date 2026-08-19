-- Lock and recount every requested variant before validating or writing so a
-- concurrent delete cannot turn an all-or-nothing import into a partial one.

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
begin
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
    select 1
    from jsonb_array_elements(p_changes) change
    where case
      when jsonb_typeof(change) <> 'object' then true
      when jsonb_typeof(change -> 'variant_id') <> 'string' then true
      when coalesce(change ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
      when jsonb_typeof(change -> 'expected_updated_at') <> 'string' then true
      when nullif(btrim(change ->> 'expected_updated_at'), '') is null then true
      when not (change ? 'new_retail_price' or change ? 'new_wholesale_price') then true
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
      where v.updated_at <> (change ->> 'expected_updated_at')::timestamptz
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
    where case
      when change ? 'new_wholesale_price' then
        case when jsonb_typeof(change -> 'new_wholesale_price') = 'null'
          then null else (change ->> 'new_wholesale_price')::bigint end
      else v.wholesale_price
    end > case when change ? 'new_retail_price'
      then (change ->> 'new_retail_price')::bigint else v.price end
  ) then raise exception 'wholesale_price_above_retail'; end if;

  select
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
    )
  into v_retail_changes, v_wholesale_changes
  from jsonb_array_elements(p_changes) change
  join public.product_variants v
    on v.id = (change ->> 'variant_id')::uuid and v.company_id = v_company_id;

  if v_retail_changes + v_wholesale_changes > 0 then
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
    get diagnostics v_updated = row_count;

    perform set_config('app.cache_change_suppressed', 'off', true);
    perform public.emit_cache_reset(v_company_id, 'catalog');
  end if;

  return jsonb_build_object(
    'updated_variants', v_updated,
    'retail_changes', v_retail_changes,
    'wholesale_changes', v_wholesale_changes
  );
end;
$$;

revoke execute on function public.apply_catalog_price_updates(jsonb) from public, anon;
grant execute on function public.apply_catalog_price_updates(jsonb) to authenticated;
