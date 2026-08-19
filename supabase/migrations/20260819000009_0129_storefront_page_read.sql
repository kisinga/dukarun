-- Serve a storefront catalogue screen with one bounded read. The response
-- intentionally omits an exact total: the UI only needs to know whether a
-- next page exists.

create index if not exists products_storefront_page_idx
  on public.products(company_id, name, id)
  where active;

create index if not exists product_variants_active_product_idx
  on public.product_variants(product_id, name, id)
  where active;

create index if not exists inventory_batches_available_variant_idx
  on public.inventory_batches(company_id, variant_id)
  where remaining > 0;

create or replace function public.storefront_page(
  p_slug text,
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_storefront jsonb;
  v_search text := nullif(lower(regexp_replace(btrim(coalesce(p_search, '')), '\s+', ' ', 'g')), '');
  v_tsquery tsquery;
begin
  if p_limit is null or p_limit < 1 or p_limit > 48 then
    raise exception 'invalid_storefront_page_size';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid_storefront_offset';
  end if;
  if length(coalesce(v_search, '')) > 120 then raise exception 'invalid_search_query'; end if;

  select company.* into v_company
  from public.companies company
  where company.public_slug = p_slug
    and company.status = 'approved'
    and company.public_storefront_enabled;

  if v_company.id is null then
    return jsonb_build_object(
      'storefront', null,
      'categories', '[]'::jsonb,
      'rows', '[]'::jsonb,
      'offset', p_offset,
      'hasMore', false
    );
  end if;

  v_storefront := jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'slug', v_company.public_slug,
    'logo_path', v_company.logo_path,
    'public_whatsapp_number', v_company.public_whatsapp_number,
    'catalogue_visible', public.storefront_catalogue_visible(v_company)
  );

  if not public.storefront_catalogue_visible(v_company) then
    return jsonb_build_object(
      'storefront', v_storefront,
      'categories', '[]'::jsonb,
      'rows', '[]'::jsonb,
      'offset', p_offset,
      'hasMore', false
    );
  end if;

  if v_search is not null then
    select to_tsquery('simple', string_agg(part || ':*', ' & ' order by ordinal))
    into v_tsquery
    from (
      select part, ordinal
      from regexp_split_to_table(v_search, '[^[:alnum:]]+') with ordinality token(part, ordinal)
      where part <> ''
      order by ordinal
      limit 16
    ) query_parts;
    if v_tsquery is null then raise exception 'invalid_search_query'; end if;
  end if;

  return (
    with candidates as materialized (
      select product.id, product.name
      from public.products product
      where product.company_id = v_company.id
        and product.active
        and exists (
          select 1
          from public.product_variants variant
          where variant.product_id = product.id and variant.active
        )
        and (
          p_category_id is null
          or exists (
            select 1
            from public.product_categories assignment
            join public.categories category
              on category.id = assignment.category_id
             and category.company_id = product.company_id
             and category.active
            where assignment.company_id = product.company_id
              and assignment.product_id = product.id
              and assignment.category_id = p_category_id
          )
        )
        and (
          v_search is null
          or exists (
            select 1
            from public.catalog_search_documents document
            join public.product_variants search_variant
              on search_variant.id = document.variant_id and search_variant.active
            where document.company_id = product.company_id
              and document.product_id = product.id
              and document.search_vector @@ v_tsquery
          )
        )
      order by product.name, product.id
      limit p_limit + 1
      offset p_offset
    ), page_products as (
      select candidate.id, candidate.name
      from candidates candidate
      order by candidate.name, candidate.id
      limit p_limit
    ), catalog_rows as (
      select
        product.name as product_sort,
        product.id as product_sort_id,
        jsonb_build_object(
          'product_id', product.id,
          'product_name', product.name,
          'image_path', product.image_path,
          'manufacturer_id', manufacturer.id,
          'manufacturer_name', manufacturer.name,
          'min_price', variant_summary.min_price,
          'max_price', variant_summary.max_price,
          'variant_count', variant_summary.variant_count,
          'available', variant_summary.available
        ) as value
      from page_products page_product
      join public.products product on product.id = page_product.id
      left join public.manufacturers manufacturer
        on manufacturer.id = product.manufacturer_id
       and manufacturer.company_id = product.company_id
      join lateral (
        select
          min(variant.price) as min_price,
          max(variant.price) as max_price,
          count(*)::integer as variant_count,
          bool_or(
            variant.kind = 'service'
            or not variant.track_inventory
            or exists (
              select 1
              from public.inventory_batches stock
              where stock.company_id = product.company_id
                and stock.variant_id = variant.id
                and stock.remaining > 0
            )
          ) as available
        from public.product_variants variant
        where variant.product_id = product.id and variant.active
      ) variant_summary on variant_summary.variant_count > 0
    )
    select jsonb_build_object(
      'storefront', v_storefront,
      'categories', coalesce((
        select jsonb_agg(to_jsonb(category) order by category.name, category.id)
        from (
          select category.*
          from public.categories category
          where category.company_id = v_company.id and category.active
          order by category.name, category.id
          limit 500
        ) category
      ), '[]'::jsonb),
      'rows', coalesce((
        select jsonb_agg(row.value order by row.product_sort, row.product_sort_id)
        from catalog_rows row
      ), '[]'::jsonb),
      'offset', p_offset,
      'hasMore', (select count(*) > p_limit from candidates)
    )
  );
end;
$$;

revoke execute on function public.storefront_page(text,text,uuid,integer,integer)
  from public;
grant execute on function public.storefront_page(text,text,uuid,integer,integer)
  to anon, authenticated;
