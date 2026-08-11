-- Prevent active catalogue rows from resolving the same effective barcode.

create or replace function public.assert_effective_barcode_available(
  p_company_id uuid,
  p_barcode text,
  p_exclude_variant_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_barcode text := nullif(btrim(coalesce(p_barcode, '')), '');
begin
  if v_barcode is null then return; end if;
  -- Split explicit and inherited matches so existing barcode indexes remain useful
  -- during large catalogue imports.
  if exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.company_id = v.company_id
    where v.company_id = p_company_id
      and v.active and p.active
      and v.id <> p_exclude_variant_id
      and v.barcode = v_barcode
  ) or exists (
    select 1
    from public.products p
    join public.product_variants v
      on v.product_id = p.id and v.company_id = p.company_id
    where p.company_id = p_company_id
      and p.active and v.active
      and v.id <> p_exclude_variant_id
      and v.barcode is null
      and p.barcode = v_barcode
  ) then
    raise exception 'barcode_conflict: %', v_barcode;
  end if;
end;
$$;

revoke all on function public.assert_effective_barcode_available(uuid,text,uuid)
  from public, anon, authenticated;

create or replace function public.enforce_variant_effective_barcode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_active boolean;
  v_effective_barcode text;
begin
  if not new.active then return new; end if;
  select p.active, coalesce(new.barcode, p.barcode)
  into v_product_active, v_effective_barcode
  from public.products p
  where p.id = new.product_id and p.company_id = new.company_id;
  if v_product_active then
    perform public.assert_effective_barcode_available(
      new.company_id, v_effective_barcode, new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.enforce_product_effective_barcodes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_variant record;
begin
  if not new.active then return new; end if;
  for v_variant in
    select v.id, coalesce(v.barcode, new.barcode) as barcode
    from public.product_variants v
    where v.company_id = new.company_id and v.product_id = new.id and v.active
  loop
    perform public.assert_effective_barcode_available(
      new.company_id, v_variant.barcode, v_variant.id
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_variant_effective_barcode()
  from public, anon, authenticated;
revoke all on function public.enforce_product_effective_barcodes()
  from public, anon, authenticated;

create trigger product_variants_effective_barcode_guard
after insert or update of barcode, active, product_id, company_id
on public.product_variants
for each row execute function public.enforce_variant_effective_barcode();

create trigger products_effective_barcode_guard
after insert or update of barcode, active, company_id
on public.products
for each row execute function public.enforce_product_effective_barcodes();
