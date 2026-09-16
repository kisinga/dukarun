-- The Products workbook has one fresh contract. Catalogue and inventory history
-- stay in the existing model; no spreadsheet vocabulary tables are introduced.
create or replace function public.product_workbook_snapshot(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_company uuid := public.current_company_id();
  v_financial boolean := public.current_user_has_permission('ViewFinancials');
  v_count integer;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if not exists(select 1 from public.stock_locations where id=p_location_id and company_id=v_company)
    or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  select (select count(*) from public.product_variants where company_id=v_company)
    + (select count(*) from public.variant_packs where company_id=v_company) into v_count;
  if v_count>10000 then raise exception 'workbook_row_limit: maximum 10000 selling-option rows including packs'; end if;
  return jsonb_build_object(
    'company_id',v_company,'company_name',(select name from public.companies where id=v_company),
    'exported_at',statement_timestamp(),
    'location',(select jsonb_build_object('id',id,'code',code,'name',name) from public.stock_locations where id=p_location_id),
    'capabilities',jsonb_build_object('stock',public.current_user_has_permission('ManageStockAdjustments'),'financial',v_financial),
    'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'barcode',p.barcode,
      'active',p.active,'manufacturer_id',p.manufacturer_id,'tax_category_id',p.tax_category_id,'updated_at',p.updated_at) order by p.id),'[]')
      from public.products p where p.company_id=v_company),
    'variants',(select coalesce(jsonb_agg(to_jsonb(v)-'company_id'-'created_at' order by v.id),'[]')
      from public.product_variants v where v.company_id=v_company),
    'packs',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'variant_id',p.variant_id,'name',p.name,
      'units_per_pack',p.units_per_pack,'sale_price',p.sale_price,'barcode',p.barcode,'active',p.active) order by p.units_per_pack,p.name,p.id),'[]')
      from public.variant_packs p where p.company_id=v_company),
    'manufacturers',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'active',m.active,'updated_at',m.updated_at) order by m.name,m.id),'[]')
      from public.manufacturers m where m.company_id=v_company),
    'taxes',coalesce(public.company_tax_settings()->'categories','[]'),
    'stock',(select coalesce(jsonb_agg(jsonb_build_object('variant_id',v.id,'quantity',coalesce(s.quantity,0),
      'batch',case when v_financial then b.data else null end)
      || case when v_financial then jsonb_build_object('value',coalesce(s.value,0)) else '{}'::jsonb end order by v.id),'[]')
      from public.product_variants v
      left join lateral(select sum(remaining) quantity,sum(remaining_cost) value from public.inventory_batches
        where variant_id=v.id and company_id=v_company and stock_location_id=p_location_id and remaining>0) s on true
      left join lateral(select jsonb_build_object('id',id,'remaining',remaining,'unit_cost',unit_cost,
        'remaining_cost',remaining_cost,'batch_number',batch_number,'expiry_date',expiry_date) data
        from public.inventory_batches where variant_id=v.id and company_id=v_company
          and stock_location_id=p_location_id and remaining>0 and v_financial
        order by purchased_at desc,created_at desc,id desc limit 1) b on true
      where v.company_id=v_company)
  );
end;
$$;
revoke all on function public.product_workbook_snapshot(uuid) from public,anon;
grant execute on function public.product_workbook_snapshot(uuid) to authenticated;

create or replace function public.apply_product_workbook(p_request_id uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '120s' as $$
declare
  v_company uuid := public.current_company_id();
  v_location uuid;
  v_stock_permission boolean := public.current_user_has_permission('ManageStockAdjustments');
  v_financial boolean := public.current_user_has_permission('ViewFinancials');
  v_hash text;
  v_import public.catalog_imports%rowtype;
  v_maker public.manufacturers%rowtype;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  m jsonb; p jsonb; v jsonb; x jsonb; fields jsonb;
  v_makers jsonb := '{}';
  v_product_id uuid; v_maker_id uuid; v_current_packs jsonb;
  v_variants jsonb; v_variant_payload jsonb; v_inventory jsonb;
  v_seen_products text[] := '{}'; v_seen_variants text[] := '{}'; v_seen_makers text[] := '{}';
  v_products_created integer := 0; v_products_updated integer := 0;
  v_variants_created integer := 0; v_variants_updated integer := 0;
  v_makers_changed integer := 0; v_packs_changed integer := 0; v_opening_batches integer := 0;
  v_metadata_changed boolean; v_packs_changed_here boolean;
  v_result jsonb;
  v_row_count integer := 0;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then raise exception 'permission_denied: ManageCatalog required'; end if;
  if p_request_id is null or jsonb_typeof(p_changes) is distinct from 'object'
    or p_changes->>'format' is distinct from 'dukarun-products-1'
    or p_changes->>'company_id' is distinct from v_company::text then raise exception 'invalid_product_workbook'; end if;
  v_location := (p_changes->>'location_id')::uuid;
  if not exists(select 1 from public.stock_locations where id=v_location and company_id=v_company)
    or not public.current_user_can_access_location(v_location) then raise exception 'location_access_denied'; end if;
  foreach v_hash in array array['manufacturers','products','stock','batches'] loop
    if jsonb_typeof(p_changes->v_hash) is distinct from 'array'
      or jsonb_array_length(p_changes->v_hash)>10000 then raise exception 'invalid_workbook_changes'; end if;
  end loop;
  if jsonb_array_length(p_changes->'products')+jsonb_array_length(p_changes->'manufacturers')
    +jsonb_array_length(p_changes->'stock')+jsonb_array_length(p_changes->'batches')=0 then raise exception 'workbook_has_no_changes'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  v_hash := encode(extensions.digest(p_changes::text,'sha256'),'hex');
  select * into v_import from public.catalog_imports where company_id=v_company and idempotency_key=p_request_id for update;
  if found then
    if v_import.status<>'completed' or v_import.result->>'product_workbook_hash' is distinct from v_hash then
      raise exception 'product_workbook_retry_mismatch'; end if;
    return v_import.result->'product_workbook_result';
  end if;

  -- Validate all exported versions and relationships before any domain writes.
  for m in select value from jsonb_array_elements(p_changes->'manufacturers') order by value->>'key' loop
    if nullif(m->>'key','') is null or m->>'key'=any(v_seen_makers) then raise exception 'duplicate_manufacturer_key'; end if;
    v_seen_makers:=array_append(v_seen_makers,m->>'key');
    if jsonb_typeof(m->'name') is distinct from 'string' or length(btrim(m->>'name')) not between 1 and 120
      or jsonb_typeof(m->'active') is distinct from 'boolean' then raise exception 'invalid_manufacturer'; end if;
    if nullif(m->>'id','') is not null then
      if m->>'key' is distinct from m->>'id' then raise exception 'invalid_manufacturer_key'; end if;
      select * into v_maker from public.manufacturers where id=(m->>'id')::uuid and company_id=v_company for update;
      if not found or v_maker.updated_at is distinct from (m->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_manufacturer'; end if;
    end if;
  end loop;
  for p in select value from jsonb_array_elements(p_changes->'products') order by value->>'key' loop
    if nullif(p->>'key','') is null or p->>'key'=any(v_seen_products) then raise exception 'duplicate_product_key'; end if;
    v_seen_products:=array_append(v_seen_products,p->>'key');
    fields:=p->'values';
    if jsonb_typeof(fields) is distinct from 'object' or jsonb_typeof(fields->'name') is distinct from 'string'
      or length(btrim(fields->>'name')) not between 1 and 200
      or jsonb_typeof(fields->'active') is distinct from 'boolean'
      or length(coalesce(fields->>'barcode',''))>64
      or jsonb_typeof(p->'variants') is distinct from 'array' then raise exception 'invalid_workbook_product'; end if;
    if nullif(p->>'id','') is not null then
      if p->>'key' is distinct from p->>'id' then raise exception 'invalid_product_key'; end if;
      select * into v_product from public.products where id=(p->>'id')::uuid and company_id=v_company for update;
      if not found or v_product.updated_at is distinct from (p->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_product'; end if;
    elsif not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required';
    elsif jsonb_array_length(p->'variants')=0 then raise exception 'variants_required'; end if;
    for v in select value from jsonb_array_elements(p->'variants') order by value->>'key' loop
      if nullif(v->>'key','') is null or v->>'key'=any(v_seen_variants) then raise exception 'duplicate_variant_key'; end if;
      v_seen_variants:=array_append(v_seen_variants,v->>'key');
      fields:=v->'values';
      if jsonb_typeof(fields) is distinct from 'object' or jsonb_typeof(fields->'name') is distinct from 'string'
        or length(btrim(fields->>'name')) not between 1 and 200
        or fields->>'kind' not in ('good','service') or fields->>'kind' is null
        or length(btrim(coalesce(fields->>'stock_unit',''))) not between 1 and 40
        or length(coalesce(fields->>'sku',''))>64 or length(coalesce(fields->>'barcode',''))>64
        or jsonb_typeof(fields->'active') is distinct from 'boolean'
        or jsonb_typeof(fields->'track_inventory') is distinct from 'boolean'
        or jsonb_typeof(fields->'allow_fractional') is distinct from 'boolean'
        or jsonb_typeof(v->'packs') is distinct from 'array'
        or jsonb_typeof(v->'expected_packs') is distinct from 'array' then raise exception 'invalid_workbook_variant'; end if;
      v_row_count:=v_row_count+1+jsonb_array_length(v->'packs');
      if v_row_count>10000 then raise exception 'workbook_row_limit'; end if;
      foreach v_hash in array array['price','wholesale_price'] loop
        if v_hash='wholesale_price' and jsonb_typeof(fields->v_hash)='null' then continue; end if;
        if jsonb_typeof(fields->v_hash) is distinct from 'number' or (fields->>v_hash)::numeric<0
          or (fields->>v_hash)::numeric>9007199254740991 or (fields->>v_hash)::numeric<>trunc((fields->>v_hash)::numeric)
          then raise exception 'invalid_workbook_price'; end if;
      end loop;
      if fields->>'kind'='service' and ((fields->>'track_inventory')::boolean or (fields->>'allow_fractional')::boolean) then raise exception 'invalid_service_stock_flags'; end if;
      if nullif(v->>'id','') is not null then
        if v->>'key' is distinct from v->>'id' then raise exception 'invalid_variant_key'; end if;
        select * into v_variant from public.product_variants where id=(v->>'id')::uuid
          and product_id=(p->>'id')::uuid and company_id=v_company for update;
        if not found or v_variant.updated_at is distinct from (v->>'expected_updated_at')::timestamptz then raise exception 'stale_workbook_variant'; end if;
        if fields->>'stock_unit' is distinct from v_variant.stock_unit then raise exception 'existing_stock_unit_immutable_in_workbook'; end if;
        v_current_packs:=public.catalog_packs_json(v_variant.id);
        if not (v_current_packs @> (v->'expected_packs') and (v->'expected_packs') @> v_current_packs)
          or jsonb_array_length(v_current_packs)<>jsonb_array_length(v->'expected_packs') then raise exception 'stale_workbook_packs'; end if;
        if exists(select 1 from jsonb_array_elements(v_current_packs) old where not exists(
          select 1 from jsonb_array_elements(v->'packs') new where new->>'id'=old->>'id')) then raise exception 'workbook_pack_omission: use active=false to retire a pack'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)<>0 then raise exception 'opening_stock_new_variants_only'; end if;
      else
        if not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
        if jsonb_array_length(v->'expected_packs')<>0 then raise exception 'invalid_new_variant_baseline'; end if;
        if nullif(p->>'id','') is not null and exists(select 1 from public.product_variants
          where product_id=(p->>'id')::uuid and company_id=v_company and lower(btrim(name))=lower(btrim(fields->>'name'))) then raise exception 'variant_name_already_exists'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)<0 or coalesce((v->>'opening_quantity')::numeric,0)>99999999999.999
          or scale(coalesce((v->>'opening_quantity')::numeric,0))>3
          or not (fields->>'allow_fractional')::boolean and coalesce((v->>'opening_quantity')::numeric,0)<>trunc(coalesce((v->>'opening_quantity')::numeric,0)) then raise exception 'invalid_opening_quantity'; end if;
        if coalesce((v->>'opening_quantity')::numeric,0)>0 then
          if not v_financial then raise exception 'permission_denied: ViewFinancials required'; end if;
          if jsonb_typeof(v->'opening_unit_cost') is distinct from 'number' or (v->>'opening_unit_cost')::numeric<0
            or (v->>'opening_unit_cost')::numeric>9007199254740991 or (v->>'opening_unit_cost')::numeric<>trunc((v->>'opening_unit_cost')::numeric) then raise exception 'invalid_opening_cost'; end if;
          v_opening_batches:=v_opening_batches+1;
        end if;
      end if;
      for x in select value from jsonb_array_elements(v->'packs') loop
        if jsonb_typeof(x->'units_per_pack') is distinct from 'number' or (x->>'units_per_pack')::numeric<=1
          or (x->>'units_per_pack')::numeric<>trunc((x->>'units_per_pack')::numeric)
          or (jsonb_typeof(x->'sale_price') is distinct from 'null' and (jsonb_typeof(x->'sale_price') is distinct from 'number'
            or (x->>'sale_price')::numeric<=0 or (x->>'sale_price')::numeric>9007199254740991
            or (x->>'sale_price')::numeric<>trunc((x->>'sale_price')::numeric))) then raise exception 'invalid_workbook_pack'; end if;
      end loop;
    end loop;
  end loop;
  -- Inventory rows must refer to reviewed variants at this workbook's location.
  for x in select value from jsonb_array_elements((p_changes->'stock')||(p_changes->'batches')) loop
    if x->>'stock_location_id' is distinct from v_location::text or not exists(
      select 1 from jsonb_array_elements(p_changes->'products') requested_product,
        lateral jsonb_array_elements(requested_product->'variants') requested_variant
      where requested_variant->>'id'=x->>'variant_id') then raise exception 'invalid_workbook_stock_identity'; end if;
  end loop;

  for m in select value from jsonb_array_elements(p_changes->'manufacturers') loop
    if nullif(m->>'id','') is null then
      insert into public.manufacturers(company_id,name,active) values(v_company,btrim(m->>'name'),(m->>'active')::boolean) returning id into v_maker_id;
    else
      v_maker_id:=(m->>'id')::uuid;
      update public.manufacturers set name=btrim(m->>'name'),active=(m->>'active')::boolean,updated_at=clock_timestamp()
        where id=v_maker_id and company_id=v_company;
    end if;
    v_makers:=v_makers||jsonb_build_object(m->>'key',v_maker_id);
    v_makers_changed:=v_makers_changed+1;
  end loop;
  for p in select value from jsonb_array_elements(p_changes->'products') loop
    fields:=p->'values';
    v_product_id:=nullif(p->>'id','')::uuid;
    v_maker_id:=null;
    if nullif(fields->>'manufacturer_key','') is not null then
      v_maker_id:=coalesce(v_makers->>(fields->>'manufacturer_key'),fields->>'manufacturer_key')::uuid;
      if not exists(select 1 from public.manufacturers where id=v_maker_id and company_id=v_company
        and (active or exists(select 1 from public.products where id=v_product_id and manufacturer_id=v_maker_id))) then raise exception 'invalid_workbook_manufacturer'; end if;
    end if;
    v_variants:='[]';
    for v in select value from jsonb_array_elements(p->'variants') loop
      v_variant_payload:=v->'values';
      if nullif(v->>'id','') is not null then
        select * into v_variant from public.product_variants where id=(v->>'id')::uuid and company_id=v_company;
        v_packs_changed_here:=not ((v->'packs') @> (v->'expected_packs') and (v->'expected_packs') @> (v->'packs'));
        v_metadata_changed:= (to_jsonb(v_variant)-'id'-'company_id'-'product_id'-'created_at'-'updated_at'-'price'-'wholesale_price'-'active')
          is distinct from (v_variant_payload-'price'-'wholesale_price'-'active');
        if (v_metadata_changed or v_packs_changed_here) and not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
        if (to_jsonb(v_variant)-'id'-'company_id'-'product_id'-'created_at'-'updated_at')=v_variant_payload and not v_packs_changed_here then continue; end if;
        v_variant_payload:=v_variant_payload||jsonb_build_object('variant_id',v_variant.id);
        if v_packs_changed_here then
          v_variant_payload:=v_variant_payload||jsonb_build_object('packs',v->'packs');
          select v_packs_changed+count(*) into v_packs_changed
            from jsonb_array_elements(v->'packs') proposed
            where not exists(select 1 from jsonb_array_elements(v->'expected_packs') original where original=proposed);
        end if;
        v_variants_updated:=v_variants_updated+1;
      else
        v_variant_payload:=v_variant_payload||jsonb_build_object('packs',v->'packs','opening_quantity',coalesce((v->>'opening_quantity')::numeric,0),
          'opening_unit_cost',(v->>'opening_unit_cost')::bigint,'opening_location_id',v_location,'batch_number',v->>'batch_number','expiry_date',v->>'expiry_date');
        v_variants_created:=v_variants_created+1;
        v_packs_changed:=v_packs_changed+jsonb_array_length(v->'packs');
      end if;
      v_variants:=v_variants||jsonb_build_array(v_variant_payload);
    end loop;
    if v_product_id is null then
      v_product_id:=public.create_catalog_product_with_manufacturer(fields->>'name',v_variants,fields->>'barcode',null,v_maker_id);
      update public.products set active=(fields->>'active')::boolean where id=v_product_id;
      v_products_created:=v_products_created+1;
    else
      select * into v_product from public.products where id=v_product_id and company_id=v_company;
      if (v_product.name is distinct from fields->>'name' or v_product.barcode is distinct from nullif(fields->>'barcode','')) and not v_stock_permission then raise exception 'permission_denied: ManageStockAdjustments required'; end if;
      if jsonb_array_length(v_variants)>0 then
        perform public.update_catalog_product(v_product_id,fields->>'name',v_variants,fields->>'barcode',(fields->>'active')::boolean);
      end if;
      if v_product.name is distinct from fields->>'name' or v_product.barcode is distinct from nullif(fields->>'barcode','')
        or v_product.active is distinct from (fields->>'active')::boolean or v_product.manufacturer_id is distinct from v_maker_id then
        update public.products set name=fields->>'name',barcode=nullif(fields->>'barcode',''),active=(fields->>'active')::boolean,
          manufacturer_id=v_maker_id,updated_at=clock_timestamp() where id=v_product_id and company_id=v_company;
      end if;
      v_products_updated:=v_products_updated+1;
    end if;
    if (select tax_category_id from public.products where id=v_product_id) is distinct from nullif(fields->>'tax_category_id','')::uuid then
      perform public.set_product_tax_category(v_product_id,nullif(fields->>'tax_category_id','')::uuid);
    end if;
  end loop;
  v_inventory:=public.apply_catalog_workbook_inventory_changes(p_changes->'stock',p_changes->'batches');
  perform public.emit_cache_reset(v_company,'catalog');
  v_result:=jsonb_build_object('products_created',v_products_created,'products_updated',v_products_updated,
    'variants_created',v_variants_created,'variants_updated',v_variants_updated,'manufacturers_changed',v_makers_changed,
    'packs_changed',v_packs_changed,'stock_changes',coalesce((v_inventory->>'stock_changes')::integer,0),
    'batch_changes',coalesce((v_inventory->>'batch_changes')::integer,0)+v_opening_batches);
  insert into public.catalog_imports(company_id,actor,mode,idempotency_key,status,result,completed_at)
    values(v_company,auth.uid(),'merge',p_request_id,'completed',jsonb_build_object(
      'product_workbook_hash',encode(extensions.digest(p_changes::text,'sha256'),'hex'),'product_workbook_result',v_result),clock_timestamp());
  return v_result;
end;
$$;
revoke all on function public.apply_product_workbook(uuid,jsonb) from public,anon;
grant execute on function public.apply_product_workbook(uuid,jsonb) to authenticated;
