-- Price workbooks use the journal-backed catalog cache. Keep the atomic apply
-- RPC from 0122, retire its direct-export RPC, and carry the optimistic version
-- through both full cache hydration and incremental cache patches.

drop function if exists public.catalog_price_export_page(uuid, integer);

drop function public.catalog_cache_page(uuid, integer);

create function public.catalog_cache_page(
  p_after_variant_id uuid default null,
  p_limit integer default 1000
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
  manufacturer_name text,
  variant_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'invalid_catalog_page_size'; end if;
  return query
  select v.id, v.company_id, p.id, p.name, v.name, v.kind, v.sku,
    coalesce(v.barcode, p.barcode), v.price, v.wholesale_price,
    v.allow_fractional, v.track_inventory, v.active, p.active, p.image_path,
    0::numeric, m.id, m.name, v.updated_at
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  left join public.manufacturers m on m.id = p.manufacturer_id
  where v.company_id = v_company_id and v.active and p.active
    and (p_after_variant_id is null or v.id > p_after_variant_id)
  order by v.id
  limit p_limit;
end;
$$;

revoke execute on function public.catalog_cache_page(uuid,integer) from public, anon;
grant execute on function public.catalog_cache_page(uuid,integer) to authenticated;

create or replace function public.catalog_cache_entities(
  p_variant_ids uuid[] default '{}'::uuid[],
  p_product_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if coalesce(cardinality(p_variant_ids), 0) + coalesce(cardinality(p_product_ids), 0) > 512 then
    raise exception 'invalid_catalog_patch_size';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'variant_id',v.id,'company_id',v.company_id,'product_id',p.id,
      'product_name',p.name,'variant_name',v.name,'kind',v.kind,'sku',v.sku,
      'barcode',coalesce(v.barcode,p.barcode),'price',v.price,
      'wholesale_price',v.wholesale_price,'allow_fractional',v.allow_fractional,
      'track_inventory',v.track_inventory,'variant_active',v.active,
      'product_active',p.active,'image_path',p.image_path,'stock',0,
      'manufacturer_id',m.id,'manufacturer_name',m.name,
      'variant_updated_at',v.updated_at
    ) order by v.id)
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.company_id = v.company_id
    left join public.manufacturers m on m.id = p.manufacturer_id
    where v.company_id = v_company_id and v.active and p.active
      and (v.id = any(p_variant_ids) or p.id = any(p_product_ids))
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.catalog_cache_entities(uuid[],uuid[]) from public, anon;
grant execute on function public.catalog_cache_entities(uuid[],uuid[]) to authenticated;

do $$
declare v_company_id uuid;
begin
  for v_company_id in select id from public.companies loop
    perform public.emit_cache_reset(v_company_id, 'catalog');
  end loop;
end;
$$;
