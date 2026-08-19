-- Extend the staged catalog importer without changing its public contract.
-- Legacy workbooks omit tax_category_code and keep the current treatment;
-- new workbooks may use a jurisdiction-published code or null for shop default.

create or replace function public.finalize_catalog_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_import public.catalog_imports%rowtype;
  v_product record;
  v_variants jsonb;
  v_variant jsonb;
  v_product_id uuid;
  v_variant_label text;
  v_variant_position integer;
  v_manufacturer_id uuid;
  v_name text;
  v_created integer := 0;
  v_updated integer := 0;
  v_deactivated_products integer := 0;
  v_deactivated_variants integer := 0;
  v_result jsonb;
  v_error text;
  v_tax_category_id uuid;
  v_tax_category_code text;
  v_tax_jurisdiction_id uuid;
  v_has_tax_category boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;

  select * into v_import from public.catalog_imports
  where id = p_import_id and company_id = v_company_id
  for update;
  if not found then raise exception 'catalog_import_not_found'; end if;
  if v_import.status = 'completed' then return v_import.result; end if;
  if v_import.status <> 'processing' then raise exception 'catalog_import_not_open'; end if;
  if not exists (
    select 1 from public.catalog_import_staged_products where import_id = p_import_id
  ) then raise exception 'products_required'; end if;

  begin
    -- Set-wise ownership validation avoids repeatedly scanning growing UUID arrays.
    if exists (
      select 1
      from public.catalog_import_staged_products s
      left join public.products p
        on p.id = s.product_id and p.company_id = v_company_id
      where s.import_id = p_import_id and s.product_id is not null and p.id is null
    ) then raise exception 'staged_product_not_found'; end if;

    if exists (
      select 1
      from public.catalog_import_staged_variants s
      left join public.product_variants v
        on v.id = s.variant_id and v.product_id = s.product_id and v.company_id = v_company_id
      where s.import_id = p_import_id and s.variant_id is not null and v.id is null
    ) then raise exception 'staged_variant_not_found'; end if;

    if v_import.mode = 'replace' and (
      exists (
        select 1 from public.product_variants v
        where v.company_id = v_company_id
          and v.created_at <= v_import.source_exported_at
          and v.updated_at > v_import.source_exported_at
          and not exists (
            select 1 from public.catalog_import_staged_variants s
            where s.import_id = p_import_id and s.variant_id = v.id
          )
      ) or exists (
        select 1 from public.products p
        where p.company_id = v_company_id
          and p.created_at <= v_import.source_exported_at
          and p.updated_at > v_import.source_exported_at
          and not exists (
            select 1 from public.catalog_import_staged_products s
            where s.import_id = p_import_id and s.product_id = p.id
          )
      )
    ) then raise exception 'stale_export: omitted catalog items changed after export'; end if;

    perform set_config('app.cache_change_suppressed', 'on', true);

    for v_product in
      select * from public.catalog_import_staged_products
      where import_id = p_import_id
      order by chunk_index, product_index
    loop
      v_name := btrim(v_product.data ->> 'name');
      select jsonb_agg(data order by variant_index) into v_variants
      from public.catalog_import_staged_variants
      where import_id = p_import_id
        and chunk_index = v_product.chunk_index
        and product_index = v_product.product_index;

      v_manufacturer_id := null;
      if nullif(btrim(coalesce(v_product.data ->> 'manufacturer_name', '')), '') is not null then
        v_manufacturer_id := public.upsert_manufacturer(v_product.data ->> 'manufacturer_name');
      end if;

      v_has_tax_category := v_product.data ? 'tax_category_code';
      v_tax_category_code := upper(
        nullif(btrim(coalesce(v_product.data ->> 'tax_category_code', '')), '')
      );
      v_tax_category_id := null;
      if v_has_tax_category and v_tax_category_code is not null then
        select cp.jurisdiction_id into v_tax_jurisdiction_id
        from public.company_tax_profiles cp
        where cp.company_id = v_company_id
          and cp.effective_from <= current_date
          and (cp.effective_to is null or cp.effective_to >= current_date)
        order by cp.effective_from desc
        limit 1;

        select tc.id into v_tax_category_id
        from public.tax_categories tc
        join public.tax_jurisdictions tj on tj.id = tc.jurisdiction_id
        where tc.jurisdiction_id = v_tax_jurisdiction_id
          and tc.code = v_tax_category_code
          and tc.active
          and tj.status = 'published';
        if v_tax_category_id is null then
          raise exception 'invalid_tax_category_code: %', v_tax_category_code;
        end if;
      end if;

      v_product_id := v_product.product_id;
      if v_product_id is null then
        v_product_id := public.create_catalog_product_with_manufacturer(
          v_name, v_variants,
          nullif(btrim(coalesce(v_product.data ->> 'barcode', '')), ''),
          null, v_manufacturer_id
        );
        update public.products
        set active = coalesce((v_product.data ->> 'active')::boolean, true), updated_at = now()
        where id = v_product_id and company_id = v_company_id;

        v_variant_position := 0;
        for v_variant in select value from jsonb_array_elements(v_variants)
        loop
          v_variant_position := v_variant_position + 1;
          v_variant_label := nullif(btrim(coalesce(v_variant ->> 'name', '')), '');
          if v_variant_label is null then
            v_variant_label := case when jsonb_array_length(v_variants) = 1 then 'Default'
                                    else 'Variant ' || v_variant_position end;
          end if;
          update public.product_variants
          set active = coalesce((v_variant ->> 'active')::boolean, true), updated_at = now()
          where product_id = v_product_id and company_id = v_company_id
            and name = v_variant_label;
        end loop;
        v_created := v_created + 1;
      else
        perform public.update_catalog_product_with_manufacturer(
          v_product_id, v_name, v_variants,
          nullif(btrim(coalesce(v_product.data ->> 'barcode', '')), ''),
          coalesce((v_product.data ->> 'active')::boolean, true),
          v_manufacturer_id
        );
        v_updated := v_updated + 1;
      end if;

      if v_has_tax_category then
        update public.products
        set tax_category_id = v_tax_category_id, updated_at = now()
        where id = v_product_id and company_id = v_company_id;
      end if;
    end loop;

    if v_import.mode = 'replace' then
      update public.product_variants v
      set active = false, updated_at = now()
      where v.company_id = v_company_id and v.active
        and v.created_at <= v_import.source_exported_at
        and not exists (
          select 1 from public.catalog_import_staged_variants s
          where s.import_id = p_import_id and s.variant_id = v.id
        );
      get diagnostics v_deactivated_variants = row_count;

      update public.products p
      set active = false, updated_at = now()
      where p.company_id = v_company_id and p.active
        and p.created_at <= v_import.source_exported_at
        and not exists (
          select 1 from public.catalog_import_staged_products s
          where s.import_id = p_import_id and s.product_id = p.id
        );
      get diagnostics v_deactivated_products = row_count;
    end if;

    perform set_config('app.cache_change_suppressed', 'off', true);
    perform public.emit_cache_reset(v_company_id, 'catalog');

    v_result := jsonb_build_object(
      'status', 'completed', 'import_id', p_import_id, 'mode', v_import.mode,
      'created', v_created, 'updated', v_updated,
      'deactivated_products', v_deactivated_products,
      'deactivated_variants', v_deactivated_variants
    );
  exception when others then
    v_error := sqlerrm;
    v_result := jsonb_build_object(
      'status', 'failed', 'import_id', p_import_id,
      'mode', v_import.mode, 'error', v_error
    );
  end;

  update public.catalog_imports
  set status = v_result ->> 'status', result = v_result, completed_at = now()
  where id = p_import_id;
  delete from public.catalog_import_chunks where import_id = p_import_id;
  return v_result;
end;
$$;

revoke execute on function public.finalize_catalog_import(uuid) from public, anon;
grant execute on function public.finalize_catalog_import(uuid) to authenticated;
