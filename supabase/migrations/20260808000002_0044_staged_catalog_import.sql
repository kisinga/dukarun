-- Bounded, resumable catalogue imports. Staging is cheap and idempotent;
-- finalization applies the complete set atomically and emits one cache reset.

create table public.catalog_import_chunks (
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  products jsonb not null check (jsonb_typeof(products) = 'array'),
  product_count integer not null check (product_count between 1 and 500),
  variant_count integer not null check (variant_count between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key(import_id, chunk_index)
);

create table public.catalog_import_staged_products (
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  chunk_index integer not null,
  product_index integer not null check (product_index > 0),
  product_id uuid,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key(import_id, chunk_index, product_index),
  foreign key(import_id, chunk_index)
    references public.catalog_import_chunks(import_id, chunk_index) on delete cascade
);

create unique index catalog_import_staged_product_id_idx
  on public.catalog_import_staged_products(import_id, product_id)
  where product_id is not null;

create table public.catalog_import_staged_variants (
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  chunk_index integer not null,
  product_index integer not null,
  variant_index integer not null check (variant_index > 0),
  product_id uuid,
  variant_id uuid,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key(import_id, chunk_index, product_index, variant_index),
  foreign key(import_id, chunk_index, product_index)
    references public.catalog_import_staged_products(import_id, chunk_index, product_index)
    on delete cascade
);

create unique index catalog_import_staged_variant_id_idx
  on public.catalog_import_staged_variants(import_id, variant_id)
  where variant_id is not null;

alter table public.catalog_import_chunks enable row level security;
alter table public.catalog_import_staged_products enable row level security;
alter table public.catalog_import_staged_variants enable row level security;

create policy "catalog import chunks readable by company"
  on public.catalog_import_chunks for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "staged catalog products readable by company"
  on public.catalog_import_staged_products for select to authenticated
  using (company_id = (select public.current_company_id()));
create policy "staged catalog variants readable by company"
  on public.catalog_import_staged_variants for select to authenticated
  using (company_id = (select public.current_company_id()));

grant select on public.catalog_import_chunks,
  public.catalog_import_staged_products,
  public.catalog_import_staged_variants to authenticated;
grant all on public.catalog_import_chunks,
  public.catalog_import_staged_products,
  public.catalog_import_staged_variants to service_role;

create or replace function public.begin_catalog_import(
  p_mode text default 'merge',
  p_idempotency_key uuid default gen_random_uuid(),
  p_source_export_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_import public.catalog_imports%rowtype;
  v_source_exported_at timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_mode not in ('merge', 'replace') then raise exception 'invalid_import_mode'; end if;

  if p_mode = 'replace' then
    select exported_at into v_source_exported_at
    from public.catalog_export_markers
    where id = p_source_export_id and company_id = v_company_id;
    if v_source_exported_at is null then raise exception 'replace_requires_full_export'; end if;
  end if;

  insert into public.catalog_imports(
    company_id, actor, mode, idempotency_key, source_export_id, source_exported_at
  ) values(
    v_company_id, auth.uid(), p_mode, p_idempotency_key,
    p_source_export_id, v_source_exported_at
  )
  on conflict(company_id, idempotency_key) do nothing
  returning * into v_import;

  if v_import.id is null then
    select * into v_import from public.catalog_imports
    where company_id = v_company_id and idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'import_id', v_import.id,
    'status', v_import.status,
    'mode', v_import.mode,
    'result', v_import.result
  );
end;
$$;

revoke execute on function public.begin_catalog_import(text,uuid,uuid) from public, anon;
grant execute on function public.begin_catalog_import(text,uuid,uuid) to authenticated;

create or replace function public.append_catalog_import_chunk(
  p_import_id uuid,
  p_chunk_index integer,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_import public.catalog_imports%rowtype;
  v_product_count integer;
  v_variant_count integer;
  v_staged_product_count bigint;
  v_staged_variant_count bigint;
  v_staged_payload_bytes bigint;
  v_existing jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;
  if p_chunk_index < 0 then raise exception 'invalid_chunk_index'; end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'products_required';
  end if;

  v_product_count := jsonb_array_length(p_products);
  if v_product_count < 1 or v_product_count > 500 then
    raise exception 'chunk_product_limit: each chunk must contain 1..500 products';
  end if;
  select coalesce(sum(jsonb_array_length(value -> 'variants')), 0)::integer
    into v_variant_count
  from jsonb_array_elements(p_products)
  where jsonb_typeof(value -> 'variants') = 'array';
  if exists (
    select 1 from jsonb_array_elements(p_products)
    where jsonb_typeof(value) <> 'object'
      or jsonb_typeof(value -> 'variants') <> 'array'
      or jsonb_array_length(value -> 'variants') = 0
      or nullif(btrim(coalesce(value ->> 'name', '')), '') is null
  ) then raise exception 'invalid_staged_product'; end if;
  if v_variant_count < 1 or v_variant_count > 2000 then
    raise exception 'chunk_variant_limit: each chunk must contain 1..2,000 variants';
  end if;

  select * into v_import
  from public.catalog_imports
  where id = p_import_id and company_id = v_company_id
  for update;
  if not found then raise exception 'catalog_import_not_found'; end if;
  if v_import.status <> 'processing' then raise exception 'catalog_import_not_open'; end if;

  select products into v_existing
  from public.catalog_import_chunks
  where import_id = p_import_id and chunk_index = p_chunk_index;
  if found then
    if v_existing <> p_products then raise exception 'chunk_conflict: %', p_chunk_index; end if;
    return jsonb_build_object(
      'import_id', p_import_id, 'chunk_index', p_chunk_index,
      'product_count', v_product_count, 'variant_count', v_variant_count,
      'idempotent', true
    );
  end if;

  -- The row lock above serializes appenders. Per-chunk limits alone are not a
  -- bound: enforce the browser contract across the complete staged import.
  select coalesce(sum(product_count), 0),
         coalesce(sum(variant_count), 0),
         coalesce(sum(pg_column_size(products)), 0)
    into v_staged_product_count, v_staged_variant_count, v_staged_payload_bytes
  from public.catalog_import_chunks
  where import_id = p_import_id;
  if v_staged_product_count + v_product_count > 10000 then
    raise exception 'import_product_limit: each import may contain at most 10,000 products';
  end if;
  if v_staged_variant_count + v_variant_count > 10000 then
    raise exception 'import_variant_limit: each import may contain at most 10,000 variants';
  end if;
  if v_staged_payload_bytes + pg_column_size(p_products) > 50 * 1024 * 1024 then
    raise exception 'import_payload_limit: staged data may not exceed 50 MiB';
  end if;

  insert into public.catalog_import_chunks(
    import_id, company_id, chunk_index, products, product_count, variant_count
  ) values(
    p_import_id, v_company_id, p_chunk_index, p_products, v_product_count, v_variant_count
  );

  insert into public.catalog_import_staged_products(
    import_id, company_id, chunk_index, product_index, product_id, data
  )
  select p_import_id, v_company_id, p_chunk_index, ordinality::integer,
    nullif(value ->> 'product_id', '')::uuid, value
  from jsonb_array_elements(p_products) with ordinality;

  insert into public.catalog_import_staged_variants(
    import_id, company_id, chunk_index, product_index, variant_index,
    product_id, variant_id, data
  )
  select p_import_id, v_company_id, p_chunk_index,
    p.ordinality::integer, v.ordinality::integer,
    nullif(p.value ->> 'product_id', '')::uuid,
    nullif(v.value ->> 'variant_id', '')::uuid,
    v.value
  from jsonb_array_elements(p_products) with ordinality p
  cross join lateral jsonb_array_elements(p.value -> 'variants') with ordinality v;

  if exists (
    select 1 from public.catalog_import_staged_variants
    where import_id = p_import_id and product_id is null and variant_id is not null
  ) then raise exception 'new_product_has_variant_id'; end if;

  return jsonb_build_object(
    'import_id', p_import_id, 'chunk_index', p_chunk_index,
    'product_count', v_product_count, 'variant_count', v_variant_count,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.append_catalog_import_chunk(uuid,integer,jsonb)
  from public, anon;
grant execute on function public.append_catalog_import_chunk(uuid,integer,jsonb)
  to authenticated;

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

create or replace function public.cleanup_abandoned_catalog_imports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with abandoned as (
    update public.catalog_imports
    set status = 'failed', completed_at = now(),
        result = jsonb_build_object('status','failed','import_id',id,'mode',mode,'error','import_abandoned')
    where status = 'processing' and created_at < now() - interval '24 hours'
    returning id
  ), removed as (
    delete from public.catalog_import_chunks c
    using abandoned a where c.import_id = a.id
    returning c.import_id
  )
  select count(*)::integer into v_count from abandoned;
  return v_count;
end;
$$;

revoke execute on function public.cleanup_abandoned_catalog_imports()
  from public, anon, authenticated;

select cron.schedule(
  'cleanup-abandoned-catalog-imports',
  '17 * * * *',
  $$select public.cleanup_abandoned_catalog_imports()$$
);

-- The browser must use bounded staging; retaining the unbounded entry point
-- would let older clients bypass chunk limits and set-wise validation.
drop function if exists public.import_catalog_products(jsonb,text,uuid,uuid);
