-- Canonical catalogue categories. Existing collection metadata is intentionally discarded:
-- the product/variant catalogue remains intact, but category assignments start clean.

-- Avoid emitting one audit/cache row per discarded legacy assignment. A single
-- catalog reset is emitted after the canonical schema and RPCs are installed.
alter table public.collections disable trigger collections_audit;
alter table public.product_collections disable trigger product_collections_audit;
drop trigger collections_cache_change on public.collections;
drop trigger product_collections_cache_change on public.product_collections;

delete from public.product_collections;
delete from public.collections;

drop function if exists public.upsert_collection(text, text, text, uuid, boolean);
drop function if exists public.set_product_collections(uuid, uuid[]);
drop function if exists public.storefront_collections(text);
drop function if exists public.storefront_catalog(text, uuid);
drop function if exists public.storefront_catalog_page(text, text, uuid, integer, integer);
drop function if exists public.catalog_management_page(text, text, text, text, text, text, integer, integer, uuid);

alter table public.collections rename to categories;
alter table public.product_collections rename to product_categories;
alter table public.product_categories rename column collection_id to category_id;

alter table public.categories rename constraint collections_pkey to categories_pkey;
alter table public.categories rename constraint collections_company_id_fkey to categories_company_id_fkey;
alter table public.categories rename constraint collections_company_id_slug_key to categories_company_id_slug_key;
alter table public.product_categories rename constraint product_collections_pkey to product_categories_pkey;
alter table public.product_categories
  rename constraint product_collections_collection_id_fkey to product_categories_category_id_fkey;
alter table public.product_categories
  rename constraint product_collections_company_id_fkey to product_categories_company_id_fkey;
alter table public.product_categories
  rename constraint product_collections_product_id_fkey to product_categories_product_id_fkey;
alter index public.product_collections_collection_idx rename to product_categories_category_idx;

alter policy "collections readable by members" on public.categories
  rename to "categories readable by members";
alter policy "product collections readable by members" on public.product_categories
  rename to "product categories readable by members";
alter trigger collections_audit on public.categories rename to categories_audit;
alter trigger product_collections_audit on public.product_categories rename to product_categories_audit;
alter table public.categories enable trigger categories_audit;
alter table public.product_categories enable trigger product_categories_audit;

create trigger categories_cache_change after insert or update or delete on public.categories
for each row execute function public.cache_change_trigger('catalog','category','id');
create trigger product_categories_cache_change after insert or update or delete on public.product_categories
for each row execute function public.cache_change_trigger('catalog','product_category','product_id','','','upsert');

create or replace function public.upsert_category(
  p_name text,
  p_slug text default null,
  p_description text default null,
  p_category_id uuid default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_slug text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_name'; end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  end if;
  if v_slug = '' then raise exception 'invalid_slug'; end if;

  if p_category_id is not null then
    update public.categories
    set name = trim(p_name),
        slug = v_slug,
        description = coalesce(p_description, description),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_category_id and company_id = v_company_id
    returning id into v_id;
    if v_id is null then raise exception 'category_not_found: %', p_category_id; end if;
  else
    insert into public.categories (company_id, name, slug, description, active)
    values (v_company_id, trim(p_name), v_slug, p_description, coalesce(p_active, true))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_product_categories(
  p_product_id uuid,
  p_category_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_category_ids uuid[] := coalesce(p_category_ids, '{}'::uuid[]);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if not exists (
    select 1 from public.products where id = p_product_id and company_id = v_company_id
  ) then raise exception 'product_not_found: %', p_product_id; end if;
  if array_position(v_category_ids, null) is not null
     or cardinality(v_category_ids) <> (
       select count(distinct value)::integer from unnest(v_category_ids) value
     ) then raise exception 'invalid_category_ids'; end if;
  if (
    select count(*) from public.categories c
    where c.id = any(v_category_ids)
      and c.company_id = v_company_id
      and (
        c.active
        or exists (
          select 1 from public.product_categories existing
          where existing.product_id = p_product_id
            and existing.category_id = c.id
            and existing.company_id = v_company_id
        )
      )
  ) <> cardinality(v_category_ids) then raise exception 'category_not_found_or_inactive'; end if;

  delete from public.product_categories
  where product_id = p_product_id and company_id = v_company_id;

  insert into public.product_categories (product_id, category_id, company_id)
  select p_product_id, category_id, v_company_id from unnest(v_category_ids) category_id;
  return p_product_id;
end;
$$;

create or replace function public.patch_product_categories(
  p_product_ids uuid[],
  p_add_category_ids uuid[] default '{}'::uuid[],
  p_remove_category_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_ids uuid[] := coalesce(p_product_ids, '{}'::uuid[]);
  v_add_ids uuid[] := coalesce(p_add_category_ids, '{}'::uuid[]);
  v_remove_ids uuid[] := coalesce(p_remove_category_ids, '{}'::uuid[]);
  v_added integer := 0;
  v_removed integer := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if cardinality(v_product_ids) < 1 or cardinality(v_product_ids) > 100
     or array_position(v_product_ids, null) is not null
     or cardinality(v_product_ids) <> (
       select count(distinct value)::integer from unnest(v_product_ids) value
     ) then raise exception 'invalid_product_ids'; end if;
  if array_position(v_add_ids, null) is not null
     or cardinality(v_add_ids) <> (
       select count(distinct value)::integer from unnest(v_add_ids) value
     )
     or array_position(v_remove_ids, null) is not null
     or cardinality(v_remove_ids) <> (
       select count(distinct value)::integer from unnest(v_remove_ids) value
     ) then raise exception 'invalid_category_ids'; end if;
  if v_add_ids && v_remove_ids then raise exception 'category_change_overlap'; end if;
  if (
    select count(*) from public.products
    where id = any(v_product_ids) and company_id = v_company_id
  ) <> cardinality(v_product_ids) then raise exception 'product_not_found'; end if;
  if (
    select count(*) from public.categories
    where id = any(v_add_ids) and company_id = v_company_id and active
  ) <> cardinality(v_add_ids) then raise exception 'category_not_found_or_inactive'; end if;
  if (
    select count(*) from public.categories
    where id = any(v_remove_ids) and company_id = v_company_id
  ) <> cardinality(v_remove_ids) then raise exception 'category_not_found'; end if;

  delete from public.product_categories
  where company_id = v_company_id
    and product_id = any(v_product_ids)
    and category_id = any(v_remove_ids);
  get diagnostics v_removed = row_count;

  insert into public.product_categories (product_id, category_id, company_id)
  select product_id, category_id, v_company_id
  from unnest(v_product_ids) product_id
  cross join unnest(v_add_ids) category_id
  on conflict do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object(
    'product_count', cardinality(v_product_ids),
    'added_count', v_added,
    'removed_count', v_removed
  );
end;
$$;

revoke execute on function public.upsert_category(text, text, text, uuid, boolean) from anon, public;
revoke execute on function public.set_product_categories(uuid, uuid[]) from anon, public;
revoke execute on function public.patch_product_categories(uuid[], uuid[], uuid[]) from anon, public;
grant execute on function public.upsert_category(text, text, text, uuid, boolean) to authenticated;
grant execute on function public.set_product_categories(uuid, uuid[]) to authenticated;
grant execute on function public.patch_product_categories(uuid[], uuid[], uuid[]) to authenticated;

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
$$;

revoke execute on function public.storefront_categories(text) from public;
grant execute on function public.storefront_categories(text) to anon, authenticated;

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

revoke execute on function public.storefront_catalog_page(text, text, uuid, integer, integer)
  from public;
grant execute on function public.storefront_catalog_page(text, text, uuid, integer, integer)
  to anon, authenticated;

create or replace function public.catalog_management_page(
  p_status text default 'active',
  p_stock_status text default 'all',
  p_manufacturer text default 'all',
  p_category text default 'all',
  p_search text default null,
  p_sort text default 'name',
  p_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('all','active','inactive') then raise exception 'invalid_product_status'; end if;
  if p_stock_status not in ('all','in_stock','out_of_stock','not_tracked') then
    raise exception 'invalid_stock_status';
  end if;
  if p_category not in ('all','uncategorized') and p_category !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then raise exception 'invalid_category_filter'; end if;
  if p_sort not in ('name','manufacturer','stock','cost_value','wholesale_value','retail_value','variants')
     or p_direction not in ('asc','desc') then raise exception 'invalid_catalog_sort'; end if;
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then raise exception 'invalid_page'; end if;

  with variant_rows as (
    select v.*, coalesce(sum(b.remaining),0)::numeric as stock,
      coalesce(sum(b.remaining_cost),0)::bigint as stock_value
    from public.product_variants v
    left join public.inventory_batches b
      on b.variant_id=v.id and b.stock_location_id=v_location_id and b.remaining>0
    where v.company_id=v_company_id
    group by v.id
  ), matched as (
    select p.*, m.name as manufacturer_name,
      count(v.id)::integer as variant_count,
      coalesce(sum(v.stock),0)::numeric as total_stock,
      coalesce(sum(v.stock_value),0)::bigint as cost_value,
      coalesce(sum(v.stock*coalesce(v.wholesale_price,0)),0)::numeric as wholesale_value,
      coalesce(sum(v.stock*v.price),0)::numeric as retail_value,
      count(v.id) filter(where v.kind<>'service' and v.track_inventory)::integer as tracked_count,
      bool_or(v.kind<>'service' and v.track_inventory and v.stock>0) as any_in_stock,
      bool_or(v.kind<>'service' and v.track_inventory and v.stock<=0) as any_out_of_stock
    from public.products p
    left join public.manufacturers m on m.id=p.manufacturer_id
    left join variant_rows v on v.product_id=p.id
    where p.company_id=v_company_id
      and (p_status='all' or p.active=(p_status='active'))
      and (
        nullif(btrim(coalesce(p_search,'')),'') is null
        or p.name ilike '%'||btrim(p_search)||'%'
        or coalesce(p.barcode,'') ilike '%'||btrim(p_search)||'%'
        or coalesce(m.name,'') ilike '%'||btrim(p_search)||'%'
        or exists (
          select 1 from variant_rows sv where sv.product_id=p.id and (
            sv.name ilike '%'||btrim(p_search)||'%'
            or sv.sku ilike '%'||btrim(p_search)||'%'
            or coalesce(sv.barcode,'') ilike '%'||btrim(p_search)||'%'
          )
        )
      )
      and (p_manufacturer='all'
        or (p_manufacturer='unassigned' and p.manufacturer_id is null)
        or p.manufacturer_id::text=p_manufacturer)
      and (
        p_category='all'
        or (p_category='uncategorized' and not exists (
          select 1 from public.product_categories pc where pc.product_id=p.id
        ))
        or (p_category not in ('all','uncategorized') and exists (
          select 1 from public.product_categories pc
          where pc.product_id=p.id and pc.category_id::text=p_category
        ))
      )
    group by p.id,m.name
    having p_stock_status='all'
      or (p_stock_status='not_tracked' and count(v.id) filter(where v.kind<>'service' and v.track_inventory)=0)
      or (p_stock_status='in_stock' and bool_or(v.kind<>'service' and v.track_inventory and v.stock>0))
      or (p_stock_status='out_of_stock' and bool_or(v.kind<>'service' and v.track_inventory and v.stock<=0))
  ), page_rows as (
    select ranked.* from (
      select matched.*, row_number() over(order by
          case when p_direction='asc' and p_sort='name' then name end asc,
          case when p_direction='desc' and p_sort='name' then name end desc,
          case when p_direction='asc' and p_sort='manufacturer' then manufacturer_name end asc nulls last,
          case when p_direction='desc' and p_sort='manufacturer' then manufacturer_name end desc nulls last,
          case when p_direction='asc' and p_sort='stock' then total_stock end asc,
          case when p_direction='desc' and p_sort='stock' then total_stock end desc,
          case when p_direction='asc' and p_sort='cost_value' then cost_value end asc,
          case when p_direction='desc' and p_sort='cost_value' then cost_value end desc,
          case when p_direction='asc' and p_sort='wholesale_value' then wholesale_value end asc,
          case when p_direction='desc' and p_sort='wholesale_value' then wholesale_value end desc,
          case when p_direction='asc' and p_sort='retail_value' then retail_value end asc,
          case when p_direction='desc' and p_sort='retail_value' then retail_value end desc,
          case when p_direction='asc' and p_sort='variants' then variant_count end asc,
          case when p_direction='desc' and p_sort='variants' then variant_count end desc,
          name,id
        ) as page_position
      from matched
    ) ranked
    order by page_position
    offset (p_page-1)*p_page_size limit p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family', to_jsonb(pr) - 'manufacturer_name' - 'variant_count' - 'total_stock'
          - 'cost_value' - 'wholesale_value' - 'retail_value' - 'tracked_count'
          - 'any_in_stock' - 'any_out_of_stock' - 'page_position',
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'variant_id',v.id,'company_id',v.company_id,'product_id',v.product_id,
            'product_name',pr.name,'variant_name',v.name,'kind',v.kind,'sku',v.sku,
            'barcode',coalesce(v.barcode,pr.barcode),'price',v.price,
            'wholesale_price',v.wholesale_price,'allow_fractional',v.allow_fractional,
            'track_inventory',v.track_inventory,'variant_active',v.active,
            'product_active',pr.active,'image_path',pr.image_path,'stock',v.stock,
            'stock_value',v.stock_value,
            'manufacturer_id',pr.manufacturer_id,'manufacturer_name',pr.manufacturer_name
          ) order by v.name,v.id) from variant_rows v where v.product_id=pr.id
        ),'[]'::jsonb)
      ) order by pr.page_position) from page_rows pr
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.catalog_management_page(
  text,text,text,text,text,text,text,integer,integer,uuid
) from public, anon;
grant execute on function public.catalog_management_page(
  text,text,text,text,text,text,text,integer,integer,uuid
) to authenticated;

do $$
declare company record;
begin
  for company in select id from public.companies loop
    perform public.emit_cache_reset(company.id, 'catalog');
  end loop;
end;
$$;
