-- 0022_media_collections.sql
-- Sprint 5: product images (Storage) + collections.

-- ---------------------------------------------------------------------------
-- Collections (storefront categories; old: Vendure collections/facets-lite)
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table public.product_collections (
  product_id uuid not null references public.products (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, collection_id)
);

create index product_collections_collection_idx on public.product_collections (collection_id);

alter table public.collections enable row level security;
alter table public.product_collections enable row level security;

create policy "collections readable by members"
  on public.collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "product collections readable by members"
  on public.product_collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.collections to authenticated;
grant select on public.product_collections to authenticated;
grant all on public.collections to service_role;
grant all on public.product_collections to service_role;

create trigger collections_audit
  after insert or update or delete on public.collections
  for each row execute function public.audit_trigger();

create trigger product_collections_audit
  after insert or update or delete on public.product_collections
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Collection RPCs (writes via RPC, as everywhere).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_collection(
  p_name text,
  p_slug text default null,
  p_description text default null,
  p_collection_id uuid default null,
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
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  end if;

  if p_collection_id is not null then
    update public.collections
    set name = trim(p_name), slug = v_slug,
        description = coalesce(p_description, description),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_collection_id and company_id = v_company_id
    returning id into v_id;

    if v_id is null then
      raise exception 'collection_not_found: %', p_collection_id;
    end if;
  else
    insert into public.collections (company_id, name, slug, description)
    values (v_company_id, trim(p_name), v_slug, p_description)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_product_collections(
  p_product_id uuid,
  p_collection_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and company_id = v_company_id) then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  delete from public.product_collections
  where product_id = p_product_id and company_id = v_company_id;

  insert into public.product_collections (product_id, collection_id, company_id)
  select p_product_id, c.id, v_company_id
  from public.collections c
  where c.id = any (p_collection_ids) and c.company_id = v_company_id;

  return p_product_id;
end;
$$;

revoke execute on function public.upsert_collection(text, text, text, uuid, boolean) from anon, public;
revoke execute on function public.set_product_collections(uuid, uuid[]) from anon, public;
grant execute on function public.upsert_collection(text, text, text, uuid, boolean) to authenticated;
grant execute on function public.set_product_collections(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product-images bucket (public), tenant-scoped by path prefix
-- (company_id/...). Members write their own company's prefix; the world reads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product images readable by everyone"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "members write their company image prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members update their company image prefix"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members delete their company image prefix"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );
