-- 0032_product_opening_stock.sql
-- Product creation with optional opening inventory. Product, variants, batches,
-- movements and the opening-value journal are one transaction.

alter table public.inventory_batches
  add column if not exists batch_number text;

-- A real opening balance is equity, not a supplier purchase or cash payment.
insert into public.ledger_accounts (company_id, code, name, type, is_system)
select c.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true
from public.companies c
on conflict (company_id, code) do nothing;

create or replace function public.ensure_opening_balance_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (company_id, code, name, type, is_system)
  values (new.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true)
  on conflict (company_id, code) do nothing;
  return new;
end;
$$;

create trigger companies_opening_balance_account
after insert on public.companies
for each row execute function public.ensure_opening_balance_account();

create or replace function public.create_catalog_product(
  p_name text,
  p_variants jsonb,
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
  v_variant_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := coalesce((v_variant ->> 'allow_fractional')::boolean, false);
    v_quantity := coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0);

    if v_quantity < 0 then raise exception 'invalid_opening_quantity'; end if;
    if v_quantity > 0 and not v_track then
      raise exception 'opening_stock_requires_tracked_good';
    end if;
    if v_quantity > 0 and not v_fractional and v_quantity <> trunc(v_quantity) then
      raise exception 'fractional_opening_stock_not_allowed';
    end if;
    if v_quantity > 0 and nullif(v_variant ->> 'opening_unit_cost', '') is null then
      raise exception 'opening_unit_cost_required';
    end if;

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::bigint, 0);
    if v_unit_cost < 0 then raise exception 'invalid_opening_unit_cost'; end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    ) values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track
    ) returning id into v_variant_id;

    if v_quantity > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;

      v_location_id := nullif(v_variant ->> 'opening_location_id', '')::uuid;
      if v_location_id is null then
        select id into v_location_id from public.stock_locations
        where company_id = v_company_id and code = 'MAIN' limit 1;
      end if;
      if not exists (
        select 1 from public.stock_locations
        where id = v_location_id and company_id = v_company_id
      ) then raise exception 'invalid_stock_location'; end if;

      v_line_value := round(v_quantity * v_unit_cost);
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_product_id::text,
        jsonb_build_object('openingStock', true, 'productId', v_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_product_id::text,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id))
      )
    );
  end if;

  return v_product_id;
end;
$$;

revoke execute on function public.create_catalog_product(text, jsonb, text, text)
  from anon, public;
grant execute on function public.create_catalog_product(text, jsonb, text, text)
  to authenticated;

