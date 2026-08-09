-- Exact barcode resolution and safe bulk assignment for printable catalogue labels.

create or replace function public.resolve_catalog_barcode(
  p_barcode text,
  p_location_id uuid default null
)
returns table (
  variant_id uuid,
  company_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  kind text,
  sku text,
  barcode text,
  price bigint,
  wholesale_price bigint,
  allow_fractional boolean,
  track_inventory boolean,
  variant_active boolean,
  product_active boolean,
  image_path text,
  stock numeric,
  manufacturer_id uuid,
  manufacturer_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_barcode text := regexp_replace(
    coalesce(p_barcode, ''),
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  v_matches integer;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if v_barcode = '' then return; end if;

  select count(*)::integer into v_matches
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  where v.company_id = v_company_id
    and v.active and p.active
    and coalesce(v.barcode, p.barcode) = v_barcode;

  if v_matches > 1 then raise exception 'barcode_ambiguous: %', v_barcode; end if;
  if v_matches = 0 then return; end if;

  return query
  select
    v.id,
    v.company_id,
    p.id,
    p.name,
    v.name,
    v.kind,
    v.sku,
    coalesce(v.barcode, p.barcode),
    v.price,
    v.wholesale_price,
    v.allow_fractional,
    v.track_inventory,
    v.active,
    p.active,
    p.image_path,
    coalesce(stock.quantity, 0)::numeric,
    m.id,
    m.name
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  left join public.manufacturers m
    on m.id = p.manufacturer_id and m.company_id = p.company_id
  left join lateral (
    select sum(b.remaining)::numeric as quantity
    from public.inventory_batches b
    where b.company_id = v.company_id
      and b.variant_id = v.id
      and b.stock_location_id = v_location_id
      and b.remaining > 0
  ) stock on true
  where v.company_id = v_company_id
    and v.active and p.active
    and coalesce(v.barcode, p.barcode) = v_barcode;
end;
$$;

revoke execute on function public.resolve_catalog_barcode(text, uuid) from public, anon;
grant execute on function public.resolve_catalog_barcode(text, uuid) to authenticated;

create or replace function public.assign_missing_variant_barcodes(p_assignments jsonb)
returns table (variant_id uuid, barcode text, assigned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_requested integer;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'invalid_barcode_assignments';
  end if;

  v_requested := jsonb_array_length(p_assignments);
  if v_requested > 500 then raise exception 'too_many_barcode_assignments: maximum 500'; end if;
  if v_requested = 0 then return; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) item
    where nullif(btrim(coalesce(item ->> 'variant_id', '')), '') is null
       or nullif(regexp_replace(coalesce(item ->> 'barcode', ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '') is null
       or length(regexp_replace(item ->> 'barcode', '^[[:space:]]+|[[:space:]]+$', '', 'g')) > 64
       or regexp_replace(item ->> 'barcode', '^[[:space:]]+|[[:space:]]+$', '', 'g') ~ '[[:cntrl:]]'
  ) then raise exception 'invalid_barcode_assignment'; end if;

  if (
    select count(distinct (item ->> 'variant_id')::uuid)
    from jsonb_array_elements(p_assignments) item
  ) <> v_requested then raise exception 'duplicate_variant_assignment'; end if;

  if (
    select count(*)
    from public.product_variants v
    where v.company_id = v_company_id
      and v.id in (
        select (item ->> 'variant_id')::uuid
        from jsonb_array_elements(p_assignments) item
      )
  ) <> v_requested then raise exception 'invalid_variant: assignment outside this company'; end if;

  return query
  with parsed as (
    select
      (item ->> 'variant_id')::uuid as id,
      regexp_replace(item ->> 'barcode', '^[[:space:]]+|[[:space:]]+$', '', 'g') as value
    from jsonb_array_elements(p_assignments) item
  ),
  updated as (
    update public.product_variants v
    set barcode = parsed.value, updated_at = now()
    from parsed
    where v.id = parsed.id
      and v.company_id = v_company_id
      and v.barcode is null
    returning v.id, v.barcode
  )
  select parsed.id, coalesce(updated.barcode, existing.barcode), updated.id is not null
  from parsed
  join public.product_variants existing
    on existing.id = parsed.id and existing.company_id = v_company_id
  left join updated on updated.id = parsed.id
  order by parsed.id;
end;
$$;

revoke execute on function public.assign_missing_variant_barcodes(jsonb) from public, anon;
grant execute on function public.assign_missing_variant_barcodes(jsonb) to authenticated;
