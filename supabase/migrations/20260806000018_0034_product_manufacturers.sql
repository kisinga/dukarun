-- Canonical, tenant-scoped manufacturers imported from Vendure facets and
-- reused by product autocomplete. Manufacturer remains optional on products.

create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(btrim(name))) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, normalized_name),
  unique (company_id, id)
);

create index manufacturers_company_name_idx
  on public.manufacturers (company_id, normalized_name);

alter table public.manufacturers enable row level security;

create policy "manufacturers readable by members"
  on public.manufacturers for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.manufacturers to authenticated;
grant all on public.manufacturers to service_role;

create trigger manufacturers_audit
  after insert or update or delete on public.manufacturers
  for each row execute function public.audit_trigger();

alter table public.products add column manufacturer_id uuid;
alter table public.products
  add constraint products_manufacturer_company_fkey
  foreign key (company_id, manufacturer_id)
  references public.manufacturers (company_id, id);
create index products_manufacturer_idx on public.products (company_id, manufacturer_id);

create or replace function public.upsert_manufacturer(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if length(v_name) = 0 or length(v_name) > 120 then
    raise exception 'invalid_manufacturer_name';
  end if;

  insert into public.manufacturers (company_id, name)
  values (v_company_id, v_name)
  on conflict (company_id, normalized_name)
  do update set active = true, updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.upsert_manufacturer(text) from public, anon;
grant execute on function public.upsert_manufacturer(text) to authenticated;

create or replace function public.create_catalog_product_with_manufacturer(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null,
  p_manufacturer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.manufacturers
    where id = p_manufacturer_id and company_id = v_company_id and active
  ) then raise exception 'manufacturer_not_found'; end if;

  v_product_id := public.create_catalog_product(p_name, p_variants, p_barcode, p_image_path);
  update public.products set manufacturer_id = p_manufacturer_id where id = v_product_id;
  return v_product_id;
end;
$$;

revoke execute on function public.create_catalog_product_with_manufacturer(text, jsonb, text, text, uuid)
  from public, anon;
grant execute on function public.create_catalog_product_with_manufacturer(text, jsonb, text, text, uuid)
  to authenticated;

create or replace function public.update_catalog_product_with_manufacturer(
  p_product_id uuid,
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_active boolean default null,
  p_manufacturer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_manufacturer_id is not null and not exists (
    select 1 from public.manufacturers
    where id = p_manufacturer_id and company_id = v_company_id and active
  ) then raise exception 'manufacturer_not_found'; end if;

  perform public.update_catalog_product(p_product_id, p_name, p_variants, p_barcode, p_active);
  update public.products
  set manufacturer_id = p_manufacturer_id, updated_at = now()
  where id = p_product_id and company_id = v_company_id;
  return p_product_id;
end;
$$;

revoke execute on function public.update_catalog_product_with_manufacturer(uuid, text, jsonb, text, boolean, uuid)
  from public, anon;
grant execute on function public.update_catalog_product_with_manufacturer(uuid, text, jsonb, text, boolean, uuid)
  to authenticated;

create or replace view public.variant_catalog
with (security_invoker = true) as
select
  v.id as variant_id,
  v.company_id,
  p.id as product_id,
  p.name as product_name,
  v.name as variant_name,
  v.kind,
  v.sku,
  coalesce(v.barcode, p.barcode) as barcode,
  v.price,
  v.wholesale_price,
  v.allow_fractional,
  v.track_inventory,
  v.active as variant_active,
  p.active as product_active,
  p.image_path,
  coalesce(s.stock, 0) as stock,
  m.id as manufacturer_id,
  m.name as manufacturer_name
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.manufacturers m on m.id = p.manufacturer_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id;

grant select on public.variant_catalog to authenticated;

