-- 0014_product_crud.sql
-- Product management RPCs (writes are RPC-only; reads stay direct).

-- ---------------------------------------------------------------------------
-- create_product: sku optional (auto-generated from name + suffix when blank).
-- ---------------------------------------------------------------------------
create or replace function public.create_product(
  p_name text,
  p_price bigint,
  p_sku text default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default false,
  p_track_inventory boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_sku text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  v_sku := nullif(trim(coalesce(p_sku, '')), '');
  if v_sku is null then
    v_sku := left(upper(regexp_replace(p_name, '[^A-Za-z0-9]', '', 'g')), 6)
             || upper(substr(md5(v_company_id::text || p_name || now()::text), 1, 4));
  end if;

  insert into public.products (
    company_id, name, sku, barcode, price, wholesale_price,
    allow_fractional, track_inventory
  )
  values (
    v_company_id, trim(p_name), v_sku,
    nullif(trim(coalesce(p_barcode, '')), ''),
    p_price, p_wholesale_price, p_allow_fractional, p_track_inventory
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_product: partial updates; pass null to keep a field unchanged.
-- p_active deactivates/reactivates.
-- ---------------------------------------------------------------------------
create or replace function public.update_product(
  p_product_id uuid,
  p_name text default null,
  p_price bigint default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default null,
  p_track_inventory boolean default null,
  p_active boolean default null
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

  if p_price is not null and p_price < 0 then
    raise exception 'invalid_price';
  end if;

  update public.products
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      price = coalesce(p_price, price),
      barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
      wholesale_price = coalesce(p_wholesale_price, wholesale_price),
      allow_fractional = coalesce(p_allow_fractional, allow_fractional),
      track_inventory = coalesce(p_track_inventory, track_inventory),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  return p_product_id;
end;
$$;

revoke execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) from anon, public;
revoke execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) from anon, public;
grant execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) to authenticated;
grant execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock-per-product view for the management screen (derived from batches).
-- ---------------------------------------------------------------------------
create view public.product_stock
with (security_invoker = true) as
select
  p.company_id,
  p.id as product_id,
  coalesce(sum(b.remaining), 0) as stock,
  coalesce(sum(b.remaining * b.unit_cost), 0)::bigint as stock_value
from public.products p
left join public.inventory_batches b
  on b.product_id = p.id and b.remaining > 0
group by p.company_id, p.id;

grant select on public.product_stock to authenticated;
