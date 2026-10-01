-- Publication affects public catalogue reads only. Existing/new products remain published.
alter table public.products
  add column storefront_published boolean not null default true;

create or replace function public.set_product_storefront_published(
  p_product_id uuid,
  p_published boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_published boolean;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_product_id is null or p_published is null then
    raise exception 'invalid_storefront_publication';
  end if;

  -- Follow the catalogue lock order before retaining/updating any product row.
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:' || v_company_id::text, 0));
  select storefront_published into v_published
  from public.products
  where id = p_product_id and company_id = v_company_id
  for update;
  if not found then raise exception 'product_not_found'; end if;

  if v_published is distinct from p_published then
    update public.products
    set storefront_published = p_published, updated_at = now()
    where id = p_product_id and company_id = v_company_id;
  end if;
  return p_published;
end;
$$;
revoke all on function public.set_product_storefront_published(uuid,boolean) from public,anon;
grant execute on function public.set_product_storefront_published(uuid,boolean) to authenticated;

create or replace function public.storefront_categories(p_slug text)
returns setof public.categories
language sql
stable
security definer
set search_path = ''
as $$
  select category.*
  from public.categories category
  join public.companies company on company.id = category.company_id
  where company.public_slug = p_slug
    and public.storefront_catalogue_visible(company)
    and category.active
    and exists (
      select 1
      from public.product_categories assignment
      join public.products product
        on product.id = assignment.product_id and product.company_id = category.company_id
      where assignment.category_id = category.id and assignment.company_id = category.company_id
        and product.active and product.storefront_published
        and exists (
          select 1 from public.product_variants variant
          where variant.product_id = product.id and variant.active
        )
    )
$$;

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
        and product.storefront_published
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
          from public.storefront_categories(p_slug) category
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

create or replace function public.storefront_catalog_page(
  p_slug text,
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  product_name text,
  image_path text,
  manufacturer_id uuid,
  manufacturer_name text,
  variant_id uuid,
  variant_name text,
  kind text,
  sku text,
  price bigint,
  available boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 48 then
    raise exception 'invalid_storefront_page_size';
  end if;
  if p_offset is null or p_offset < 0 then raise exception 'invalid_storefront_offset'; end if;

  return query
  with matched as (
    select p.id, count(*) over () as matched_count
    from public.products p
    join public.companies c on c.id = p.company_id
    left join public.manufacturers m on m.id = p.manufacturer_id and m.company_id = p.company_id
    where c.public_slug = p_slug
      and public.storefront_catalogue_visible(c)
      and p.active
      and p.storefront_published
      and exists (
        select 1 from public.product_variants active_variant
        where active_variant.product_id = p.id and active_variant.active
      )
      and (
        p_category_id is null
        or exists (
          select 1 from public.product_categories pc
          join public.categories category
            on category.id = pc.category_id
            and category.company_id = p.company_id
            and category.active
          where pc.product_id = p.id
            and pc.company_id = p.company_id
            and pc.category_id = p_category_id
        )
      )
      and (
        nullif(trim(p_search), '') is null
        or not exists (
          select 1 from regexp_split_to_table(lower(trim(p_search)), '[[:space:]]+') token
          where strpos(
            lower(concat_ws(
              ' ', p.name, m.name, p.barcode,
              (
                select string_agg(
                  concat_ws(' ', search_variant.name, search_variant.sku, search_variant.barcode), ' '
                )
                from public.product_variants search_variant
                where search_variant.product_id = p.id and search_variant.active
              )
            )), token
          ) = 0
        )
      )
    order by p.name, p.id
    limit p_limit offset p_offset
  )
  select p.id, p.name, p.image_path, m.id, m.name, v.id, v.name, v.kind, v.sku, v.price,
    (
      v.kind = 'service' or not v.track_inventory or exists (
        select 1 from public.inventory_batches stock
        where stock.variant_id = v.id and stock.remaining > 0
      )
    ) as available,
    matched.matched_count
  from matched
  join public.products p on p.id = matched.id
  join public.product_variants v on v.product_id = p.id and v.active
  left join public.manufacturers m on m.id = p.manufacturer_id and m.company_id = p.company_id
  order by p.name, p.id, v.name, v.id;
end;
$$;

create or replace function public.storefront_product(p_slug text, p_product_id uuid)
returns table (
  product_id uuid,
  product_name text,
  image_path text,
  manufacturer_id uuid,
  manufacturer_name text,
  variant_id uuid,
  variant_name text,
  kind text,
  sku text,
  price bigint,
  available boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.image_path,
    m.id,
    m.name,
    v.id,
    v.name,
    v.kind,
    v.sku,
    v.price,
    (
      v.kind = 'service'
      or not v.track_inventory
      or exists (
        select 1 from public.inventory_batches stock
        where stock.variant_id = v.id and stock.remaining > 0
      )
    ),
    1::bigint
  from public.products p
  join public.companies c on c.id = p.company_id
  join public.product_variants v on v.product_id = p.id and v.active
  left join public.manufacturers m
    on m.id = p.manufacturer_id and m.company_id = p.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and p.id = p_product_id
    and p.active
    and p.storefront_published
  order by v.name, v.id
$$;

create or replace function public.public_storefront_sitemap()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',q.slug,'product_id',q.product_id,'updated_at',q.updated_at
  ) order by q.slug,q.product_id),'[]'::jsonb)
  from (
    select c.public_slug slug,p.id product_id,p.updated_at
    from public.companies c
    left join public.products p
      on p.company_id=c.id and p.active and p.storefront_published and public.storefront_catalogue_visible(c)
      and exists(select 1 from public.product_variants v where v.product_id=p.id and v.active)
    where c.status='approved' and c.public_storefront_enabled and c.public_slug is not null
      and public.storefront_catalogue_visible(c)
  ) q;
$$;

-- Hydrate retained product-family snapshots with the new publication field.
do $$
declare company record;
begin
  for company in select id from public.companies loop
    perform public.emit_cache_reset(company.id, 'catalog');
  end loop;
end;
$$;

select pg_notify('pgrst','reload schema');
