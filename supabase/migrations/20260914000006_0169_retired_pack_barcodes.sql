-- Retired pack identities remain historical; only active packs reserve barcodes.
alter table public.variant_packs drop constraint variant_packs_company_id_barcode_key;
create unique index variant_packs_active_barcode_idx
  on public.variant_packs(company_id,barcode) where active;

create or replace function public.save_variant_packs(p_variant_id uuid,p_stock_unit text,p_packs jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v public.product_variants%rowtype;
  p jsonb;v_id uuid;v_ids uuid[]:='{}';v_previous public.variant_packs%rowtype;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  select * into v from public.product_variants where id=p_variant_id and company_id=v_company for update;
  if v.id is null then raise exception 'variant_not_found'; end if;
  if jsonb_typeof(p_packs) is distinct from 'array' then raise exception 'invalid_packs'; end if;
  if p_stock_unit is null or length(btrim(p_stock_unit)) not between 1 and 40 then
    raise exception 'stock_unit_required'; end if;
  if v.stock_unit<>btrim(p_stock_unit) and v.stock_unit<>'item' and (
    exists(select 1 from public.inventory_batches where variant_id=v.id)
    or exists(select 1 from public.order_lines where variant_id=v.id)
  ) then raise exception 'stock_unit_in_use'; end if;
  update public.product_variants set stock_unit=btrim(p_stock_unit) where id=v.id;
  -- Release retired/omitted barcodes before inserting replacements, regardless
  -- of the order of rows supplied by the editor or workbook.
  update public.variant_packs existing set active=false
  where existing.variant_id=v.id and existing.active and not exists(
    select 1 from jsonb_array_elements(p_packs) incoming
    where nullif(incoming->>'id','')::uuid=existing.id
      and coalesce((incoming->>'active')::boolean,true)
  );
  for p in select * from jsonb_array_elements(p_packs) loop
    v_id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
    if v_id=any(v_ids) then raise exception 'duplicate_pack'; end if;
    v_ids:=array_append(v_ids,v_id);
    select * into v_previous from public.variant_packs where id=v_id;
    if v_previous.id is not null and (v_previous.company_id<>v_company or v_previous.variant_id<>v.id) then
      raise exception 'invalid_pack'; end if;
    insert into public.variant_packs(id,company_id,variant_id,name,units_per_pack,sale_price,barcode,active)
    values(v_id,v_company,v.id,p->>'name',(p->>'units_per_pack')::numeric,
      nullif(p->>'sale_price','')::bigint,nullif(p->>'barcode',''),coalesce((p->>'active')::boolean,true))
    on conflict(id) do update set name=excluded.name,units_per_pack=excluded.units_per_pack,
      sale_price=excluded.sale_price,barcode=excluded.barcode,active=excluded.active;
  end loop;
  -- Existing variant cache journal carries pack changes with the owning row.
  update public.product_variants set updated_at=now() where id=v.id;
end;
$$;
