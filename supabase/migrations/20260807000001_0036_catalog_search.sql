-- Tenant-scoped catalog search projection. Keeps combined product, variant,
-- manufacturer, SKU, and barcode search indexed without loading large catalogs.

create table public.catalog_search_documents (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku_normalized text not null,
  barcode_normalized text,
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('simple', search_text)) stored,
  updated_at timestamptz not null default now(),
  unique (company_id, variant_id)
);

create index catalog_search_documents_company_idx
  on public.catalog_search_documents (company_id, product_id);
create index catalog_search_documents_sku_idx
  on public.catalog_search_documents (company_id, sku_normalized);
create index catalog_search_documents_barcode_idx
  on public.catalog_search_documents (company_id, barcode_normalized)
  where barcode_normalized is not null;
create index catalog_search_documents_vector_idx
  on public.catalog_search_documents using gin (search_vector);
create index catalog_search_documents_trgm_idx
  on public.catalog_search_documents using gin (search_text gin_trgm_ops);

alter table public.catalog_search_documents enable row level security;
grant all on public.catalog_search_documents to service_role;

create or replace function public.refresh_catalog_search_variant(p_variant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.catalog_search_documents (
    variant_id, company_id, product_id, sku_normalized, barcode_normalized,
    search_text, updated_at
  )
  select
    v.id,
    v.company_id,
    p.id,
    lower(btrim(v.sku)),
    nullif(lower(btrim(coalesce(v.barcode, p.barcode))), ''),
    lower(concat_ws(' ', p.name, nullif(v.name, 'Default'), m.name, v.sku,
      coalesce(v.barcode, p.barcode))),
    now()
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  left join public.manufacturers m
    on m.id = p.manufacturer_id and m.company_id = p.company_id
  where v.id = p_variant_id
  on conflict (variant_id) do update set
    company_id = excluded.company_id,
    product_id = excluded.product_id,
    sku_normalized = excluded.sku_normalized,
    barcode_normalized = excluded.barcode_normalized,
    search_text = excluded.search_text,
    updated_at = excluded.updated_at;
$$;

create or replace function public.refresh_catalog_search_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant_id uuid;
begin
  for v_variant_id in
    select v.id from public.product_variants v where v.product_id = p_product_id
  loop
    perform public.refresh_catalog_search_variant(v_variant_id);
  end loop;
end;
$$;

create or replace function public.catalog_search_variant_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_catalog_search_variant(new.id);
  return new;
end;
$$;

create or replace function public.catalog_search_product_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_catalog_search_product(new.id);
  return new;
end;
$$;

create or replace function public.catalog_search_manufacturer_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select p.id from public.products p
    where p.company_id = new.company_id and p.manufacturer_id = new.id
  loop
    perform public.refresh_catalog_search_product(v_product_id);
  end loop;
  return new;
end;
$$;

create trigger catalog_search_variant_sync
  after insert or update of product_id, company_id, name, sku, barcode
  on public.product_variants
  for each row execute function public.catalog_search_variant_trigger();

create trigger catalog_search_product_sync
  after update of company_id, name, barcode, manufacturer_id
  on public.products
  for each row execute function public.catalog_search_product_trigger();

create trigger catalog_search_manufacturer_sync
  after update of name
  on public.manufacturers
  for each row execute function public.catalog_search_manufacturer_trigger();

insert into public.catalog_search_documents (
  variant_id, company_id, product_id, sku_normalized, barcode_normalized,
  search_text, updated_at
)
select
  v.id,
  v.company_id,
  p.id,
  lower(btrim(v.sku)),
  nullif(lower(btrim(coalesce(v.barcode, p.barcode))), ''),
  lower(concat_ws(' ', p.name, nullif(v.name, 'Default'), m.name, v.sku,
    coalesce(v.barcode, p.barcode))),
  now()
from public.product_variants v
join public.products p on p.id = v.product_id and p.company_id = v.company_id
left join public.manufacturers m
  on m.id = p.manufacturer_id and m.company_id = p.company_id;

revoke execute on function public.refresh_catalog_search_variant(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_catalog_search_product(uuid) from public, anon, authenticated;
revoke execute on function public.catalog_search_variant_trigger() from public, anon, authenticated;
revoke execute on function public.catalog_search_product_trigger() from public, anon, authenticated;
revoke execute on function public.catalog_search_manufacturer_trigger() from public, anon, authenticated;

create or replace function public.search_catalog_variants(
  p_query text,
  p_location_id uuid default null,
  p_limit integer default 20
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
  manufacturer_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_query text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_tokens text[];
  v_lexemes text[];
  v_tsquery tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if length(v_query) = 0 or length(v_query) > 120 then raise exception 'invalid_search_query'; end if;

  select array_agg(token order by ordinal)
  into v_tokens
  from (
    select token, ordinal
    from unnest(regexp_split_to_array(v_query, '\s+')) with ordinality as q(token, ordinal)
    where token <> ''
    order by ordinal
    limit 8
  ) tokens;

  select array_agg(lexeme order by token_ordinal, lexeme_ordinal)
  into v_lexemes
  from (
    select lexeme, token_ordinal, lexeme_ordinal
    from unnest(v_tokens) with ordinality as token(value, token_ordinal)
    cross join lateral unnest(regexp_split_to_array(token.value, '[^[:alnum:]]+'))
      with ordinality as part(lexeme, lexeme_ordinal)
    where lexeme <> ''
    order by token_ordinal, lexeme_ordinal
    limit 16
  ) lexemes;

  if coalesce(cardinality(v_lexemes), 0) = 0 then raise exception 'invalid_search_query'; end if;
  v_tsquery := to_tsquery('simple', array_to_string(
    array(select item.lexeme || ':*' from unnest(v_lexemes) as item(lexeme)), ' & '
  ));

  return query
  with candidates as (
    select
      d.variant_id,
      case
        when d.barcode_normalized = v_query then 0
        when d.sku_normalized = v_query then 1
        when lower(p.name) = v_query then 2
        when lower(coalesce(m.name, '')) = v_query then 3
        else 4
      end as match_priority,
      ts_rank_cd(d.search_vector, v_tsquery) as text_rank
    from public.catalog_search_documents d
    join public.product_variants v on v.id = d.variant_id and v.company_id = d.company_id
    join public.products p on p.id = d.product_id and p.company_id = d.company_id
    left join public.manufacturers m
      on m.id = p.manufacturer_id and m.company_id = p.company_id
    where d.company_id = v_company_id
      and v.active and p.active
      and (
        d.search_vector @@ v_tsquery
        or (
          cardinality(v_tokens) = 1
          and d.search_text ilike '%' || v_query || '%'
        )
      )
  )
  select
    v.id,
    v.company_id,
    p.id,
    p.name,
    v.name,
    v.kind,
    v.sku,
    coalesce(v.barcode, p.barcode),
    v.price,
    v.wholesale_price,
    v.allow_fractional,
    v.track_inventory,
    v.active,
    p.active,
    p.image_path,
    coalesce(stock.quantity, 0)::numeric,
    m.id,
    m.name
  from candidates c
  join public.product_variants v on v.id = c.variant_id
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  left join public.manufacturers m
    on m.id = p.manufacturer_id and m.company_id = p.company_id
  left join lateral (
    select sum(b.remaining)::numeric as quantity
    from public.inventory_batches b
    where b.company_id = v.company_id
      and b.variant_id = v.id
      and b.stock_location_id = v_location_id
      and b.remaining > 0
  ) stock on true
  order by c.match_priority, c.text_rank desc, p.name, v.name, v.id
  limit v_limit;
end;
$$;

revoke execute on function public.search_catalog_variants(text, uuid, integer)
  from public, anon;
grant execute on function public.search_catalog_variants(text, uuid, integer)
  to authenticated, service_role;
