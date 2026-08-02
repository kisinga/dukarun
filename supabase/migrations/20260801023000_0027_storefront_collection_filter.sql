-- 0027_storefront_collection_filter.sql
-- storefront_catalog gains an optional collection filter so the public
-- storefront can filter by collection without exposing product_collections.

drop function public.storefront_catalog(text);

create or replace function public.storefront_catalog(
  p_slug text,
  p_collection_id uuid default null
)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
    and (
      p_collection_id is null
      or exists (
        select 1 from public.product_collections pc
        where pc.product_id = vc.product_id and pc.collection_id = p_collection_id
      )
    )
$$;

revoke execute on function public.storefront_catalog(text, uuid) from public;
grant execute on function public.storefront_catalog(text, uuid) to anon, authenticated;
