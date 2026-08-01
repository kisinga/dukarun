-- 0019_product_with_variants.sql
-- Coupled product creation: a product must be born with >= 1 variant
-- (v1's createProductWithVariants behavior). The family-only create_product
-- remains for tooling/ETL, but the app path goes through this RPC.

create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb, -- [{name?, price, sku?, barcode?, wholesale_price?, kind?, allow_fractional?, track_inventory?}]
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    -- Single variant with no label: 'Default' (hidden in the UI).
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;
