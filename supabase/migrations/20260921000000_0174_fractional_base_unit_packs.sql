-- Pack quantities remain whole. A good's base unit may independently allow fractions,
-- e.g. selling one 90-metre roll and 0.5 loose metres from the same inventory.
-- No existing catalogue flags, quantities, prices or transaction snapshots change.
create or replace function public.guard_pack_definition()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.product_variants%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||new.company_id::text,0));
  select * into v from public.product_variants
    where id=new.variant_id and company_id=new.company_id for update;
  if v.id is null or (new.active and v.kind<>'good') then
    raise exception 'packs_require_goods'; end if;
  new.name:=btrim(new.name);new.barcode:=nullif(btrim(new.barcode),'');
  new.updated_at:=now();
  if tg_op='UPDATE' and (new.company_id,new.variant_id,new.units_per_pack)
    is distinct from (old.company_id,old.variant_id,old.units_per_pack) then
    raise exception 'pack_contents_immutable: retire this pack and create a replacement';
  end if;
  if new.active and new.barcode is not null and exists(
    select 1 from public.product_variants pv join public.products pr
      on pr.id=pv.product_id and pr.company_id=pv.company_id
    where pv.company_id=new.company_id and pv.active and pr.active
      and coalesce(pv.barcode,pr.barcode)=new.barcode
  ) then raise exception 'barcode_conflict: %',new.barcode; end if;
  return new;
end;
$$;
revoke all on function public.guard_pack_definition() from public,anon,authenticated;

create or replace function public.guard_catalog_pack_compatibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_barcode text;
begin
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||new.company_id::text,0));
  if tg_table_name='product_variants' then
    if new.kind<>'good' and exists(
      select 1 from public.variant_packs where variant_id=new.id and active
    ) then raise exception 'retire_packs_before_changing_quantity_type'; end if;
    select coalesce(new.barcode,p.barcode) into v_barcode from public.products p where p.id=new.product_id;
  else
    v_barcode:=new.barcode;
  end if;
  if new.active and v_barcode is not null and exists(
    select 1 from public.variant_packs where company_id=new.company_id and active and barcode=v_barcode
  ) then raise exception 'barcode_conflict: %',v_barcode; end if;
  return new;
end;
$$;
revoke all on function public.guard_catalog_pack_compatibility() from public,anon,authenticated;

create or replace function public.resolve_transaction_unit(p_variant_id uuid,p_pack_id uuid,p_quantity numeric,p_selling boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.product_variants%rowtype;p public.variant_packs%rowtype;
begin
  select * into v from public.product_variants where id=p_variant_id
    and company_id=public.current_company_id() and active for share;
  if v.id is null or not exists(select 1 from public.products where id=v.product_id and active) then
    raise exception 'invalid_variant: line references a variant outside this company'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity>=1000000000 or p_quantity<>round(p_quantity,3) then
    raise exception 'invalid_quantity'; end if;
  if p_pack_id is null then
    if not v.allow_fractional and p_quantity<>trunc(p_quantity) then
      raise exception 'fractional_not_allowed: variant %',p_variant_id; end if;
    return jsonb_build_object('pack_id',null,'unit_name',v.stock_unit,'stock_unit_name',v.stock_unit,
      'units_per_unit',1,'resolved_price',v.price,'price_floor',v.wholesale_price);
  end if;
  select * into p from public.variant_packs where id=p_pack_id
    and variant_id=v.id and company_id=v.company_id and active for share;
  if p.id is null or v.kind<>'good'
    or (p_selling and p.sale_price is null) then raise exception 'pack_not_available'; end if;
  if p_quantity<>trunc(p_quantity) then raise exception 'whole_packs_required'; end if;
  if p_quantity*p.units_per_pack>=1000000000 then raise exception 'invalid_quantity'; end if;
  return jsonb_build_object('pack_id',p.id,'unit_name',p.name,'stock_unit_name',v.stock_unit,
    'units_per_unit',p.units_per_pack,'resolved_price',p.sale_price,'price_floor',p.sale_price);
end;
$$;
revoke all on function public.resolve_transaction_unit(uuid,uuid,numeric,boolean) from public,anon,authenticated;
