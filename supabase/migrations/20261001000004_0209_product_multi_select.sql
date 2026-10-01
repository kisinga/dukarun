-- Current-page product actions. Each batch is validated and committed atomically.

create or replace function public.set_products_storefront_published(p_product_ids uuid[], p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_count integer;
  v_changed_count integer;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_published is null then raise exception 'invalid_target_state'; end if;
  if p_product_ids is null or cardinality(p_product_ids) not between 1 and 100
     or array_ndims(p_product_ids) <> 1
     or exists (select 1 from unnest(p_product_ids) id where id is null)
     or (select count(distinct id) from unnest(p_product_ids) id) <> cardinality(p_product_ids) then
    raise exception 'invalid_product_ids';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || v_company_id::text, 0));
  perform id from public.products
  where company_id = v_company_id and id = any(p_product_ids)
  order by id for update;
  get diagnostics v_product_count = row_count;
  if v_product_count <> cardinality(p_product_ids) then raise exception 'product_not_found'; end if;

  update public.products
  set storefront_published = p_published, updated_at = now()
  where company_id = v_company_id and id = any(p_product_ids)
    and storefront_published is distinct from p_published;
  get diagnostics v_changed_count = row_count;
  return jsonb_build_object('product_count', v_product_count, 'changed_count', v_changed_count);
end;
$$;
revoke all on function public.set_products_storefront_published(uuid[],boolean) from public,anon;
grant execute on function public.set_products_storefront_published(uuid[],boolean) to authenticated;

create or replace function public.set_products_active(p_product_ids uuid[], p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_count integer;
  v_changed_count integer;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_active is null then raise exception 'invalid_target_state'; end if;
  if p_product_ids is null or cardinality(p_product_ids) not between 1 and 100
     or array_ndims(p_product_ids) <> 1
     or exists (select 1 from unnest(p_product_ids) id where id is null)
     or (select count(distinct id) from unnest(p_product_ids) id) <> cardinality(p_product_ids) then
    raise exception 'invalid_product_ids';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || v_company_id::text, 0));
  perform id from public.products
  where company_id = v_company_id and id = any(p_product_ids)
  order by id for update;
  get diagnostics v_product_count = row_count;
  if v_product_count <> cardinality(p_product_ids) then raise exception 'product_not_found'; end if;

  update public.products
  set active = p_active, updated_at = now()
  where company_id = v_company_id and id = any(p_product_ids)
    and active is distinct from p_active;
  get diagnostics v_changed_count = row_count;
  return jsonb_build_object('product_count', v_product_count, 'changed_count', v_changed_count);
end;
$$;
revoke all on function public.set_products_active(uuid[],boolean) from public,anon;
grant execute on function public.set_products_active(uuid[],boolean) to authenticated;
