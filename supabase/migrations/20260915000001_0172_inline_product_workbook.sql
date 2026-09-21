-- Inline workbook rows reuse the catalogue aggregate. New variants on existing
-- products carry a product version; the completed staged import retains the full
-- workbook result so a retry cannot repeat its stock or pack edits.
create or replace function public.apply_catalog_workbook_units(
  p_variant_changes jsonb default '[]',p_product_changes jsonb default '[]',
  p_disable_changes jsonb default '[]',p_batch_changes jsonb default '[]',
  p_pack_changes jsonb default '[]',p_import_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company uuid := public.current_company_id();
  c jsonb;
  r jsonb;
  v_import public.catalog_imports%rowtype;
  v_request_hash text;
  v_created_variants integer := 0;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if jsonb_array_length(p_pack_changes)>0 and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required'; end if;
  if jsonb_typeof(p_pack_changes) is distinct from 'array' or jsonb_array_length(p_pack_changes)>10000 then
    raise exception 'invalid_pack_changes'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  if p_import_id is not null then
    select * into v_import from public.catalog_imports
    where id=p_import_id and company_id=v_company for update;
    if not found then raise exception 'catalog_import_not_found'; end if;
    -- Import history is readable by catalogue managers without financial access.
    -- Retain a fingerprint for retries, not the request's batch costs/stock values.
    v_request_hash := encode(extensions.digest(jsonb_build_object(
      'variants',p_variant_changes,'products',p_product_changes,
      'disables',p_disable_changes,'batches',p_batch_changes,'packs',p_pack_changes
    )::text,'sha256'),'hex');
    if v_import.status='completed' then
      if v_import.result->>'workbook_request_hash' is distinct from v_request_hash
        or not (v_import.result ? 'workbook_result') then
        raise exception 'catalog_workbook_retry_mismatch';
      end if;
      return v_import.result->'workbook_result';
    end if;
    if v_import.status<>'processing' then raise exception 'catalog_import_not_open'; end if;
    if exists(select 1 from public.catalog_import_staged_variants
      where import_id=p_import_id and variant_id is not null) then
      raise exception 'workbook_creation_requires_new_variants';
    end if;
    -- Existing parents must still match the workbook, even when only a new
    -- child variant is being added. Lock before finalization writes anything.
    for c in select data from public.catalog_import_staged_products
      where import_id=p_import_id and product_id is not null order by product_id
    loop
      perform 1 from public.products where id=(c->>'product_id')::uuid
        and company_id=v_company for update;
      if not found then raise exception 'product_not_found'; end if;
      if nullif(c->>'expected_product_updated_at','') is null then
        raise exception 'expected_product_version_required';
      end if;
      if not exists(select 1 from public.products where id=(c->>'product_id')::uuid
        and company_id=v_company and updated_at=(c->>'expected_product_updated_at')::timestamptz) then
        raise exception 'stale_catalog_product_export';
      end if;
      if exists(select 1 from jsonb_array_elements(p_disable_changes) d
        where d->>'product_id'=c->>'product_id' and (d->>'disable_product')::boolean) then
        raise exception 'cannot_add_variant_to_disabled_product';
      end if;
      if exists(select 1 from public.catalog_import_staged_variants s
        join public.product_variants v on v.company_id=v_company and v.product_id=s.product_id
          and lower(btrim(v.name))=lower(coalesce(nullif(btrim(s.data->>'name'),''),'Default'))
        where s.import_id=p_import_id and s.product_id=(c->>'product_id')::uuid) then
        raise exception 'variant_name_already_exists';
      end if;
    end loop;
    select count(*)::integer into v_created_variants
    from public.catalog_import_staged_variants where import_id=p_import_id;
  end if;
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
  r := r||jsonb_build_object('pack_changes',jsonb_array_length(p_pack_changes),
    'created_variants',v_created_variants);
  if p_import_id is not null then
    update public.catalog_imports set result=result||jsonb_build_object(
      'workbook_request_hash',v_request_hash,'workbook_result',r)
    where id=p_import_id and company_id=v_company;
  end if;
  return r;
end;
$$;
revoke all on function public.apply_catalog_workbook_units(jsonb,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.apply_catalog_workbook_units(jsonb,jsonb,jsonb,jsonb,jsonb,uuid) to authenticated;
