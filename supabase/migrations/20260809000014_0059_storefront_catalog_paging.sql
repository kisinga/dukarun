-- A public storefront is a paged catalogue, not an offline catalogue cache.
-- Keep the anonymous contract narrow: no wholesale prices or exact stock counts.

revoke execute on function public.storefront_catalog(text, uuid) from anon, authenticated;

create or replace function public.storefront_catalog_page(
  p_slug text,
  p_search text default null,
  p_collection_id uuid default null,
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
    select
      p.id,
      count(*) over () as matched_count
    from public.products p
    join public.companies c on c.id = p.company_id
    left join public.manufacturers m
      on m.id = p.manufacturer_id and m.company_id = p.company_id
    where c.public_slug = p_slug
      and public.storefront_catalogue_visible(c)
      and p.active
      and exists (
        select 1 from public.product_variants active_variant
        where active_variant.product_id = p.id and active_variant.active
      )
      and (
        p_collection_id is null
        or exists (
          select 1 from public.product_collections pc
          where pc.product_id = p.id and pc.collection_id = p_collection_id
        )
      )
      and (
        nullif(trim(p_search), '') is null
        or not exists (
          select 1
          from regexp_split_to_table(lower(trim(p_search)), '[[:space:]]+') token
          where strpos(
            lower(concat_ws(
              ' ',
              p.name,
              m.name,
              p.barcode,
              (
                select string_agg(concat_ws(' ', search_variant.name, search_variant.sku, search_variant.barcode), ' ')
                from public.product_variants search_variant
                where search_variant.product_id = p.id and search_variant.active
              )
            )),
            token
          ) = 0
        )
      )
    order by p.name, p.id
    limit p_limit
    offset p_offset
  )
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
    ) as available,
    matched.matched_count
  from matched
  join public.products p on p.id = matched.id
  join public.product_variants v on v.product_id = p.id and v.active
  left join public.manufacturers m
    on m.id = p.manufacturer_id and m.company_id = p.company_id
  order by p.name, p.id, v.name, v.id;
end;
$$;

revoke execute on function public.storefront_catalog_page(text, text, uuid, integer, integer)
  from public;
grant execute on function public.storefront_catalog_page(text, text, uuid, integer, integer)
  to anon, authenticated;

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
  order by v.name, v.id
$$;

revoke execute on function public.storefront_product(text, uuid) from public;
grant execute on function public.storefront_product(text, uuid) to anon, authenticated;
