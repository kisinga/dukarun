-- One stock identity, independently priced selling units, immutable transaction conversions.
-- Document quantity/price describe the selected unit; stock_quantity drives inventory
-- and quantity analytics. Monetary balances keep using the original document totals.
-- Exact batch original_cost/remaining_cost survive division into pieces; never rebuild
-- acquisition value by multiplying a rounded per-piece estimate.
-- Apply the pack migrations together before the web/storefront/API release. Existing
-- base-unit rows default to factor one; old clients cannot rewrite pack-bearing drafts.
alter table public.product_variants
  add column stock_unit text not null default 'item'
    check (length(btrim(stock_unit)) between 1 and 40),
  add constraint product_variants_company_id_id_key unique(company_id,id);

create table public.variant_packs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  variant_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 80),
  units_per_pack numeric(14,3) not null
    check(units_per_pack > 1 and units_per_pack < 100000000000
      and units_per_pack = trunc(units_per_pack)),
  sale_price bigint check(sale_price > 0),
  barcode text check(barcode is null or length(btrim(barcode)) between 1 and 64),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(company_id,variant_id) references public.product_variants(company_id,id),
  unique(company_id,variant_id,id),
  unique(company_id,barcode)
);
create index variant_packs_variant_idx on public.variant_packs(company_id,variant_id);
alter table public.variant_packs enable row level security;
create policy "packs readable by members" on public.variant_packs for select
  using(company_id=(select public.current_company_id()));
grant select on public.variant_packs to authenticated;
revoke insert,update,delete on public.variant_packs from authenticated,anon;

alter table public.order_lines
  add column pack_id uuid,
  add column unit_name text not null default 'item',
  add column stock_unit_name text not null default 'item',
  add column units_per_unit numeric(14,3) not null default 1 check(units_per_unit >= 1),
  add column stock_quantity numeric generated always as(quantity * units_per_unit) stored,
  add column price_source text not null default 'retail'
    check(price_source in ('retail','wholesale','pack')),
  add column price_floor bigint,
  add foreign key(company_id,variant_id,pack_id)
    references public.variant_packs(company_id,variant_id,id);
alter table public.purchase_lines
  add column pack_id uuid,
  add column unit_name text not null default 'item',
  add column stock_unit_name text not null default 'item',
  add column units_per_unit numeric(14,3) not null default 1 check(units_per_unit >= 1),
  add column stock_quantity numeric generated always as(quantity * units_per_unit) stored,
  add foreign key(company_id,variant_id,pack_id)
    references public.variant_packs(company_id,variant_id,id);
alter table public.tax_document_lines
  add column pack_id uuid,
  add column unit_name text not null default 'item',
  add column stock_unit_name text not null default 'item',
  add column units_per_unit numeric(14,3) not null default 1 check(units_per_unit >= 1),
  add column stock_quantity numeric generated always as(quantity * units_per_unit) stored;

create or replace function public.catalog_packs_json(p_variant_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'units_per_pack',p.units_per_pack,
    'sale_price',p.sale_price,'barcode',p.barcode,'active',p.active
  ) order by p.units_per_pack,p.name,p.id),'[]'::jsonb)
  from public.variant_packs p where p.variant_id=p_variant_id
$$;
revoke all on function public.catalog_packs_json(uuid) from public,anon,authenticated;

create or replace function public.catalog_pack_definitions(p_variant_ids uuid[])
returns table(variant_id uuid,stock_unit text,packs jsonb)
language sql stable security definer set search_path='' as $$
  select v.id,v.stock_unit,public.catalog_packs_json(v.id)
  from public.product_variants v where v.company_id=public.current_company_id()
    and v.id=any(p_variant_ids)
$$;
revoke all on function public.catalog_pack_definitions(uuid[]) from public,anon;
grant execute on function public.catalog_pack_definitions(uuid[]) to authenticated;

-- Called by every catalogue writer. Serializing per company covers all barcode sources.
create or replace function public.guard_pack_definition()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.product_variants%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||new.company_id::text,0));
  select * into v from public.product_variants
    where id=new.variant_id and company_id=new.company_id for update;
  if v.id is null or (new.active and (v.kind<>'good' or v.allow_fractional)) then
    raise exception 'packs_require_whole_quantity_goods'; end if;
  new.name:=btrim(new.name);new.barcode:=nullif(btrim(new.barcode),'');
  new.updated_at:=now();
  if tg_op='UPDATE' and (new.company_id,new.variant_id,new.units_per_pack)
    is distinct from (old.company_id,old.variant_id,old.units_per_pack) then
    -- Immutable from creation: cached offline definitions cannot be reinterpreted either.
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
create trigger variant_packs_guard before insert or update on public.variant_packs
for each row execute function public.guard_pack_definition();
revoke all on function public.guard_pack_definition() from public,anon,authenticated;

-- Acquire the same lock before modifying either existing barcode source.
create or replace function public.guard_catalog_pack_compatibility()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_barcode text;
begin
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||new.company_id::text,0));
  if tg_table_name='product_variants' then
    if (new.kind<>'good' or new.allow_fractional) and exists(
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
create trigger products_pack_barcode_guard before insert or update on public.products
for each row execute function public.guard_catalog_pack_compatibility();
create trigger variants_pack_barcode_guard before insert or update on public.product_variants
for each row execute function public.guard_catalog_pack_compatibility();
revoke all on function public.guard_catalog_pack_compatibility() from public,anon,authenticated;

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
  update public.variant_packs set active=false where variant_id=v.id and not(id=any(v_ids));
  -- Existing variant cache journal carries pack changes with the owning row.
  update public.product_variants set updated_at=now() where id=v.id;
end;
$$;
revoke all on function public.save_variant_packs(uuid,text,jsonb) from public,anon,authenticated;

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
  if p.id is null or v.kind<>'good' or v.allow_fractional
    or (p_selling and p.sale_price is null) then raise exception 'pack_not_available'; end if;
  if p_quantity<>trunc(p_quantity) then raise exception 'whole_packs_required'; end if;
  if p_quantity*p.units_per_pack>=1000000000 then raise exception 'invalid_quantity'; end if;
  return jsonb_build_object('pack_id',p.id,'unit_name',p.name,'stock_unit_name',v.stock_unit,
    'units_per_unit',p.units_per_pack,'resolved_price',p.sale_price,'price_floor',p.sale_price);
end;
$$;
revoke all on function public.resolve_transaction_unit(uuid,uuid,numeric,boolean) from public,anon,authenticated;

create or replace function public.resolve_sale_units(p_lines jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb;u jsonb;result jsonb:='[]';v_source text;v_price bigint;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 0 and 128 then
    raise exception 'invalid_sale_lines'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    u:=public.resolve_transaction_unit((l->>'variant_id')::uuid,nullif(l->>'pack_id','')::uuid,
      (l->>'quantity')::numeric,true);
    v_source:=case when u->>'pack_id' is not null then 'pack'
      else coalesce(l->>'price_source','retail') end;
    if v_source not in ('retail','wholesale','pack') or
      (v_source='pack' and u->>'pack_id' is null) then raise exception 'invalid_price_source'; end if;
    v_price:=(u->>'resolved_price')::bigint;
    if v_source='wholesale' then
      if not public.current_user_has_permission('OverridePrice') then raise exception 'permission_denied: OverridePrice required'; end if;
      v_price:=(u->>'price_floor')::bigint;
      if v_price is null then raise exception 'wholesale_not_available'; end if;
    end if;
    if l?'expected_unit_price' and (l->>'expected_unit_price')::bigint is distinct from v_price then
      raise exception 'selling_price_changed: refresh this line before posting'; end if;
    if l?'units_per_unit' and (l->>'units_per_unit')::numeric is distinct from (u->>'units_per_unit')::numeric then
      raise exception 'pack_contents_changed'; end if;
    result:=result||jsonb_build_array(l||u||jsonb_build_object('resolved_price',v_price,'price_source',v_source));
  end loop;
  return result;
end;
$$;
revoke all on function public.resolve_sale_units(jsonb) from public,anon,authenticated;

-- Fiscal documents copy the unit from their source line, including credit notes.
create or replace function public.snapshot_tax_document_unit()
returns trigger language plpgsql security definer set search_path='' as $$
declare l public.order_lines%rowtype;
begin
  if new.source_order_line_id is not null then
    select * into l from public.order_lines where id=new.source_order_line_id and company_id=new.company_id;
    if l.id is not null then
      new.pack_id:=l.pack_id;new.unit_name:=l.unit_name;new.stock_unit_name:=l.stock_unit_name;
      new.units_per_unit:=l.units_per_unit;
      if l.pack_id is not null then new.description:=new.description||' — '||l.unit_name||' ('||l.units_per_unit||' '||l.stock_unit_name||')'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger tax_document_unit_snapshot before insert on public.tax_document_lines
for each row execute function public.snapshot_tax_document_unit();
revoke all on function public.snapshot_tax_document_unit() from public,anon,authenticated;


create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_input_count integer;
  v_resolved_count integer;
  v_total bigint := 0;
  v_quantity_total numeric := 0;
  v_has_override boolean := false;
  v_invalid_fractional uuid;
  v_lines jsonb;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_sale_lines';
  end if;
  -- Checkout work is deliberately bounded. A larger basket must become a
  -- second order; silently splitting one order would change its payment,
  -- receipt, stock and accounting meaning.
  if jsonb_array_length(p_lines) > 128 then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  perform public.assert_entitled(v_company_id, 'order');
  v_lines := public.resolve_sale_units(p_lines);

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = v_company_id
  ) then
    raise exception 'invalid_customer: %', p_customer_id;
  end if;

  with input_lines as (
    select *
    from jsonb_to_recordset(v_lines) as line(
      variant_id uuid,
      quantity numeric,
      custom_price bigint,
      override_reason text, resolved_price bigint, price_floor bigint, pack_id uuid,
      unit_name text, stock_unit_name text, units_per_unit numeric, price_source text
    )
  ), resolved as (
    select line.*, variant.id as resolved_id, line.resolved_price as price,
      variant.wholesale_price, variant.allow_fractional
    from input_lines line
    left join public.product_variants variant
      on variant.id = line.variant_id and variant.company_id = v_company_id
  )
  select
    count(*)::integer,
    count(resolved_id)::integer,
    coalesce(bool_or(custom_price is not null and custom_price <> price), false),
    (min(variant_id::text) filter (
      where quantity <> trunc(quantity) and not coalesce(allow_fractional, false)
    ))::uuid
  into v_input_count, v_resolved_count, v_has_override, v_invalid_fractional
  from resolved;

  if v_resolved_count <> v_input_count then
    raise exception 'invalid_variant: line references a variant outside this company';
  end if;
  if v_invalid_fractional is not null then
    raise exception 'fractional_not_allowed: variant %', v_invalid_fractional;
  end if;
  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null and exists(select 1 from public.order_lines where order_id=p_draft_id
    and company_id=v_company_id and pack_id is not null) and exists(
    select 1 from jsonb_array_elements(p_lines) l where not l?'units_per_unit') then
    raise exception 'pack_client_update_required: reopen the app before editing this sale';
  end if;
  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;
    if v_order_id is null then raise exception 'draft_not_found: %', p_draft_id; end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders(company_id, code, customer_id, status, created_by)
    values(
      v_company_id, 'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  insert into public.order_lines(
    order_id, company_id, variant_id, quantity, unit_price,
    custom_price, price_override_reason, line_total,
    pack_id,unit_name,stock_unit_name,units_per_unit,price_source,price_floor
  )
  select
    v_order_id, v_company_id, line.variant_id, line.quantity, line.resolved_price,
    line.custom_price, line.override_reason,
    round(line.quantity * coalesce(line.custom_price, line.resolved_price)),
    line.pack_id,line.unit_name,line.stock_unit_name,line.units_per_unit,line.price_source,line.price_floor
  from jsonb_to_recordset(v_lines) as line(
    variant_id uuid,
    quantity numeric,
    custom_price bigint,
    override_reason text, resolved_price bigint, price_floor bigint, pack_id uuid,
      unit_name text, stock_unit_name text, units_per_unit numeric, price_source text
  )
  join public.product_variants variant
    on variant.id = line.variant_id and variant.company_id = v_company_id;

  select coalesce(sum(line_total), 0)::bigint, coalesce(sum(stock_quantity), 0)
  into v_total, v_quantity_total
  from public.order_lines
  where order_id = v_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'variant_id', line.variant_id, 'order_line_id',line.id,
    'pack_id',line.pack_id,'unit_name',line.unit_name,'units_per_unit',line.units_per_unit,
    'quantity',line.quantity,'price_floor',line.price_floor,
    'custom_price', line.custom_price,
    'reason', line.price_override_reason
  ) order by line.id), '[]'::jsonb)
  into v_below
  from public.order_lines line
  join public.product_variants variant
    on variant.id = line.variant_id and variant.company_id = line.company_id
  where line.order_id = v_order_id
    and line.custom_price is not null
    and line.price_floor is not null
    and line.custom_price < line.price_floor;

  update public.orders
  set total = v_total, quantity_total = v_quantity_total, updated_at = now()
  where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;


create or replace function public.record_purchase_complete_core(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_claim_input_vat boolean default false,p_tax_invoice_date date default null,
  p_client_ref text default null,p_context public.posting_context default null,
  p_advance_amount bigint default 0
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_unit jsonb;v_stock_quantity numeric;
  v_company_id uuid:=public.current_company_id();v_supplier public.customers%rowtype;
  v_purchase_id uuid;v_line jsonb;v_expense jsonb;v_variant public.product_variants%rowtype;
  v_variant_id uuid;v_quantity numeric(14,3);v_unit_cost bigint;v_line_total bigint;
  v_value_source text;v_goods_gross bigint:=0;v_supplier_expenses bigint:=0;
  v_invoice_total bigint;v_ap_balance bigint;v_location_id uuid;v_batch_id uuid;
  v_journal_lines jsonb:='[]'::jsonb;v_expense_id uuid;v_category text;
  v_custom_label text;v_settlement text;v_amount bigint;v_expense_account text;
  v_is_credit boolean;v_wholesale bigint;v_retail bigint;v_estimate jsonb;
  v_tax jsonb;v_index integer:=0;v_tax_date date;v_tax_point timestamptz;
  v_profile_id uuid;v_posting_date date;v_tax_total bigint:=0;v_goods_net bigint:=0;
  v_invoice_net bigint:=0;v_invoice_basis_net bigint:=0;v_invoice_tax bigint:=0;
  v_cost_total bigint;v_supplier_pin text;v_tax_invoice_number text;
  v_resolution public.purchase_posting_resolution;v_context public.posting_context;
  v_timezone text;v_session_id uuid;v_outstanding bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  select * into v_supplier from public.customers c
  where c.id=p_supplier_id and c.company_id=v_company_id and c.is_supplier
    and c.supplier_active for share;
  if v_supplier.id is null then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then
    raise exception 'purchase_lines_required'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then
    raise exception 'invalid_purchase_expenses'; end if;
  if p_claim_input_vat then
    v_tax_invoice_number:=nullif(btrim(coalesce(p_reference,'')),'');
    v_supplier_pin:=nullif(btrim(coalesce(v_supplier.tax_registration_number,'')),'');
    if v_tax_invoice_number is null then raise exception 'tax_invoice_number_required'; end if;
    if p_tax_invoice_date is null then raise exception 'tax_invoice_date_required'; end if;
    if v_supplier_pin is null then raise exception 'supplier_tax_pin_required'; end if;
    if exists(select 1 from public.purchases p
      where p.company_id=v_company_id and p.supplier_id=p_supplier_id
        and p.claim_input_vat
        and lower(btrim(p.tax_invoice_number))=lower(v_tax_invoice_number)) then
      raise exception 'duplicate_supplier_tax_invoice';
    end if;
  end if;
  v_tax_date:=case when p_claim_input_vat then p_tax_invoice_date
    else coalesce(p_purchase_date,current_date) end;

  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  if exists(
    select 1 from (
      select l->>'variant_id' variant_id,
        nullif(l->>'new_wholesale_price','')::bigint new_wholesale_price,
        nullif(l->>'new_retail_price','')::bigint new_retail_price
      from jsonb_array_elements(p_lines) l
      where l?'new_wholesale_price' or l?'new_retail_price'
    ) prices group by variant_id
    having count(distinct new_wholesale_price)>1 or count(distinct new_retail_price)>1
  ) then raise exception 'conflicting_new_prices_for_variant'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=nullif(v_line->>'variant_id','')::uuid;
    v_quantity:=nullif(v_line->>'quantity','')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    if v_quantity is null or v_quantity<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants v
    where v.id=v_variant_id and v.company_id=v_company_id and v.kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_quantity<>trunc(v_quantity) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    v_unit:=public.resolve_transaction_unit(v_variant_id,nullif(v_line->>'pack_id','')::uuid,v_quantity,false);
    v_stock_quantity:=v_quantity*(v_unit->>'units_per_unit')::numeric;
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
      v_unit_cost:=round(v_line_total/v_quantity);
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::bigint;
      if v_unit_cost is null or v_unit_cost<=0 then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_quantity*v_unit_cost);
    end if;
    v_goods_gross:=v_goods_gross+v_line_total;
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      v_wholesale:=coalesce(nullif(v_line->>'new_wholesale_price','')::bigint,v_variant.wholesale_price,0);
      v_retail:=coalesce(nullif(v_line->>'new_retail_price','')::bigint,v_variant.price,0);
      if v_wholesale<0 or v_retail<0 then raise exception 'invalid_price'; end if;
      if v_retail<v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  for v_expense in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=nullif(v_expense->>'amount','')::bigint;
    v_category:=lower(nullif(trim(v_expense->>'category'),''));
    v_custom_label:=nullif(trim(v_expense->>'custom_label'),'');
    v_settlement:=nullif(v_expense->>'settlement','');
    if v_amount is null or v_amount<=0 or v_category is null
      or v_category not in ('transport','loading','packaging','duty','other')
      or (v_category='other' and v_custom_label is null)
      or (v_category<>'other' and v_custom_label is not null)
      or v_settlement not in ('supplier_bill','separate') then
      raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then
      v_supplier_expenses:=v_supplier_expenses+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_expense->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
    end if;
  end loop;

  v_invoice_total:=v_goods_gross+v_supplier_expenses;
  if p_payment_amount is null or p_payment_amount<0 or coalesce(p_advance_amount,0)<0 then
    raise exception 'invalid_initial_settlement'; end if;
  if p_payment_amount+coalesce(p_advance_amount,0)>v_invoice_total then
    raise exception 'ap_overpayment'; end if;
  v_outstanding:=v_invoice_total-p_payment_amount-coalesce(p_advance_amount,0);
  v_is_credit:=v_outstanding>0;
  if v_is_credit and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_amount>0 then perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
  if v_is_credit then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=p_supplier_id::text;
    if v_supplier.supplier_credit_limit>0 and
      v_ap_balance+v_outstanding>v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance,v_outstanding,
        v_supplier.supplier_credit_limit;
    end if;
  end if;

  v_location_id:=p_stock_location_id;
  if v_location_id is null then select l.id into v_location_id from public.stock_locations l
    where l.company_id=v_company_id and l.code='MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations l
    where l.id=v_location_id and l.company_id=v_company_id and l.is_active)
    then raise exception 'invalid_stock_location'; end if;
  if not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied'; end if;
  perform set_config('app.business_location_id',v_location_id::text,true);

  v_estimate:=public.calculate_purchase_invoice_tax(v_company_id,p_lines,p_expenses,v_tax_date);
  v_invoice_basis_net:=(v_estimate->>'net_total')::bigint;
  v_invoice_tax:=(v_estimate->>'tax_total')::bigint;
  v_profile_id:=nullif(v_estimate->>'tax_profile_id','')::uuid;
  v_tax_point:=(v_estimate->>'tax_point_at')::timestamptz;
  if p_claim_input_vat then
    if not coalesce((v_estimate->>'vat_registered')::boolean,false) then
      raise exception 'input_vat_requires_registration'; end if;
    v_tax_total:=(v_estimate->>'tax_total')::bigint;
    v_goods_net:=(v_estimate->>'goods_net_total')::bigint;
    v_invoice_net:=(v_estimate->>'net_total')::bigint;
  else
    v_tax_total:=0;v_goods_net:=v_goods_gross;v_invoice_net:=v_invoice_total;
  end if;
  v_resolution:=public.resolve_purchase_posting(
    v_company_id,coalesce(p_purchase_date,v_tax_date),v_tax_date);
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  if p_context is null then
    if p_payment_amount>0 or exists(select 1 from jsonb_array_elements(p_expenses) x
      where x->>'settlement'='separate') then
      v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_location_id);
    end if;
    v_context:=row(v_company_id,v_location_id,auth.uid(),v_session_id,
      (coalesce(p_purchase_date,v_tax_date)::timestamp at time zone v_timezone),
      (v_resolution).posting_date,'purchase',(v_resolution).reason)::public.posting_context;
  else
    v_context:=p_context;
    if (v_context).company_id is distinct from v_company_id
      or (v_context).location_id is distinct from v_location_id
      or (v_context).posting_date is distinct from (v_resolution).posting_date then
      raise exception 'invalid_purchase_posting_context'; end if;
  end if;
  v_posting_date:=(v_context).posting_date;

  insert into public.purchases(
    company_id,supplier_id,reference,total_cost,goods_subtotal,is_credit,created_by,notes,
    purchase_date,stock_location_id,client_ref,gross_total,net_total,goods_net_total,
    input_tax_total,invoice_net_total,invoice_tax_total,claim_input_vat,
    supplier_tax_pin,tax_invoice_number,tax_invoice_date,
    tax_point_at,tax_profile_id,tax_snapshot_status,accounting_posting_date,
    accounting_period_id,posting_classification,posting_reason,
    purchase_posting_version,is_late_tax_adjustment)
  values(
    v_company_id,p_supplier_id,nullif(btrim(coalesce(p_reference,'')),''),v_invoice_total,
    v_goods_gross,true,auth.uid(),nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_purchase_date,current_date),v_location_id,nullif(btrim(coalesce(p_client_ref,'')),''),
    v_invoice_total,v_invoice_net,v_goods_net,v_tax_total,v_invoice_basis_net,v_invoice_tax,
    p_claim_input_vat,
    case when p_claim_input_vat then v_supplier_pin end,
    case when p_claim_input_vat then v_tax_invoice_number end,
    case when p_claim_input_vat then p_tax_invoice_date end,v_tax_point,v_profile_id,'final',
    v_posting_date,(v_resolution).accounting_period_id,(v_resolution).classification,
    (v_resolution).reason,'ap_invoice_v2',(v_resolution).classification='prior_period')
  returning id into v_purchase_id;

  v_index:=0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=(v_line->>'variant_id')::uuid;v_quantity:=(v_line->>'quantity')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    v_unit:=public.resolve_transaction_unit(v_variant_id,nullif(v_line->>'pack_id','')::uuid,v_quantity,false);
    v_stock_quantity:=v_quantity*(v_unit->>'units_per_unit')::numeric;
    if v_value_source='total' then
      v_line_total:=(v_line->>'line_total')::bigint;v_unit_cost:=round(v_line_total/v_quantity);
    else
      v_unit_cost:=(v_line->>'unit_cost')::bigint;v_line_total:=round(v_quantity*v_unit_cost);
    end if;
    v_tax:=v_estimate->'lines'->v_index;
    v_cost_total:=case when p_claim_input_vat then (v_tax->>'net_total')::bigint
      else v_line_total end;
    insert into public.inventory_batches(
      company_id,variant_id,stock_location_id,supplier_id,quantity,remaining,unit_cost,
      original_cost,remaining_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_stock_quantity,v_stock_quantity,
      round(v_cost_total/v_stock_quantity),v_cost_total,
      v_cost_total,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date) returning id into v_batch_id;
    insert into public.purchase_lines(
      company_id,purchase_id,variant_id,inventory_batch_id,quantity,unit_cost,line_total,
      value_source,batch_number,expiry_date,tax_category_id,tax_rate_version_id,
      tax_category_code,tax_classification,tax_rate_bps,gross_total,net_total,tax_total,
      pack_id,unit_name,stock_unit_name,units_per_unit)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      v_value_source,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date,nullif(v_tax->>'tax_category_id','')::uuid,
      nullif(v_tax->>'tax_rate_version_id','')::uuid,v_tax->>'tax_category_code',
      v_tax->>'tax_classification',(v_tax->>'tax_rate_bps')::integer,
      (v_tax->>'gross_total')::bigint,(v_tax->>'net_total')::bigint,
      (v_tax->>'tax_total')::bigint,
      nullif(v_unit->>'pack_id','')::uuid,v_unit->>'unit_name',v_unit->>'stock_unit_name',(v_unit->>'units_per_unit')::numeric);
    insert into public.inventory_movements(
      company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
      source_type,source_id,meta)
    values(v_company_id,v_variant_id,v_batch_id,v_location_id,'purchase',v_stock_quantity,
      round(v_cost_total/v_stock_quantity),v_cost_total,
      'InventoryPurchase',v_purchase_id::text,jsonb_build_object(
        'grossCost',(v_tax->>'gross_total')::bigint,
        'invoiceVat',(v_tax->>'tax_total')::bigint,
        'inputVat',case when p_claim_input_vat then (v_tax->>'tax_total')::bigint else 0 end));
    v_index:=v_index+1;
  end loop;

  v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','INVENTORY',
    'debit',v_goods_net,'meta',jsonb_build_object('purchaseId',v_purchase_id,
      'supplierId',p_supplier_id,'grossAmount',v_goods_gross));
  v_index:=0;
  for v_expense in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=(v_expense->>'amount')::bigint;v_category:=lower(trim(v_expense->>'category'));
    v_custom_label:=nullif(trim(v_expense->>'custom_label'),'');
    v_settlement:=v_expense->>'settlement';v_expense_account:=nullif(v_expense->>'account_code','');
    v_tax:=v_estimate->'expenses'->v_index;
    insert into public.purchase_expenses(
      company_id,purchase_id,category,custom_label,memo,amount,settlement,account_code,
      created_by,tax_category_id,tax_rate_version_id,tax_category_code,tax_classification,
      tax_rate_bps,gross_total,net_total,tax_total)
    values(v_company_id,v_purchase_id,v_category,v_custom_label,
      nullif(btrim(coalesce(v_expense->>'memo','')),''),v_amount,v_settlement,
      case when v_settlement='separate' then v_expense_account end,auth.uid(),
      nullif(v_tax->>'tax_category_id','')::uuid,nullif(v_tax->>'tax_rate_version_id','')::uuid,
      v_tax->>'tax_category_code',v_tax->>'tax_classification',
      (v_tax->>'tax_rate_bps')::integer,(v_tax->>'gross_total')::bigint,
      (v_tax->>'net_total')::bigint,(v_tax->>'tax_total')::bigint)
    returning id into v_expense_id;
    if v_settlement='supplier_bill' then
      v_cost_total:=case when p_claim_input_vat then (v_tax->>'net_total')::bigint
        else v_amount end;
      v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','EXPENSES',
        'debit',v_cost_total,'meta',jsonb_build_object(
          'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id,
          'expenseCategory',v_category,'grossAmount',v_amount));
    else
      perform public.post_journal_entry_with_context(v_company_id,'PurchaseExpense',v_expense_id::text,
        'Purchase expense ('||v_category||')',jsonb_build_array(
          jsonb_build_object('account_code','EXPENSES','debit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id,
            'expenseCategory',v_category)),
          jsonb_build_object('account_code',v_expense_account,'credit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id))),
        v_context);
    end if;
    v_index:=v_index+1;
  end loop;
  if v_tax_total>0 then
    v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','TAX_PAYABLE',
      'debit',v_tax_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'inputVat',true));
  end if;
  v_journal_lines:=v_journal_lines||jsonb_build_object(
    'account_code','ACCOUNTS_PAYABLE',
    'credit',v_invoice_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,
      'supplierId',p_supplier_id,'purchaseReference',p_reference,'isCreditPurchase',v_is_credit,
      'projectedInitialPayment',p_payment_amount,'projectedAdvance',coalesce(p_advance_amount,0)));
  perform public.post_journal_entry_with_context(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase '||coalesce(p_reference,v_purchase_id::text),v_journal_lines,v_context);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      update public.product_variants set
        wholesale_price=case when v_line?'new_wholesale_price'
          then (v_line->>'new_wholesale_price')::bigint else wholesale_price end,
        price=case when v_line?'new_retail_price'
          then (v_line->>'new_retail_price')::bigint else price end,updated_at=now()
      where id=(v_line->>'variant_id')::uuid and company_id=v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$$;


create or replace function public.complete_order_core(
  p_order_id uuid,
  p_payments jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_receivable boolean;
  v_is_cod boolean;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_fifo jsonb;
  v_line_cogs bigint;
  v_persisted_line_cogs bigint;
  v_total_cogs bigint := 0;
  v_quantity_total numeric := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
  v_business_timezone text;
  v_entry_date date;
  v_actor uuid := (p_context).actor_id;
  v_posting_context public.posting_context;
begin
  if (p_context).company_id is null or (p_context).source not in (
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation',
    'fulfillment_dispatch'
  ) then raise exception 'invalid_posting_context'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = (p_context).company_id
  for update;
  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;
  if exists (
    select 1
    from public.order_lines line
    where line.order_id = p_order_id
    limit 1 offset 128
  ) then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  select company.business_timezone into v_business_timezone
  from public.companies company where company.id = v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch';
  end if;
  v_entry_date := coalesce(
    (p_context).posting_date,
    (coalesce((p_context).occurred_at, now()) at time zone v_business_timezone)::date
  );
  v_posting_context := row(
    (p_context).company_id, (p_context).location_id, (p_context).actor_id,
    (p_context).cashier_session_id, coalesce((p_context).occurred_at, now()),
    v_entry_date, (p_context).source, (p_context).late_reason
  )::public.posting_context;

  select approval.id into v_pending_approval
  from public.approvals approval
  where approval.company_id = v_order.company_id
    and approval.type = 'below_wholesale'
    and approval.status = 'pending'
    and approval.metadata ->> 'order_id' = p_order_id::text
  limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_receivable := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');
  v_is_cod := v_is_receivable and coalesce(v_order.receivable_kind = 'cod',false);
  v_is_credit := v_is_receivable and not coalesce(v_is_cod,false);
  update public.orders
  set receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end
  where id = p_order_id;
  if v_is_cod then
    if (p_context).source <> 'fulfillment_dispatch'
      or v_order.customer_id is null
      or not exists (
        select 1 from public.order_fulfillments fulfillment
        where fulfillment.order_id = p_order_id
          and fulfillment.company_id = v_order.company_id
          and fulfillment.collection_kind = 'cod'
          and fulfillment.fulfillment_type = 'delivery'
          and fulfillment.status = 'ready'
      )
    then raise exception 'invalid_cod_dispatch_context'; end if;
  elsif v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer
    from public.customers customer
    where customer.id = v_order.customer_id and customer.company_id = v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
        v_order.total) > 0
      and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    v_ar_balance := public.customer_credit_exposure(
      v_order.company_id, v_order.customer_id
    );

    if v_ar_balance + coalesce(
      nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
      v_order.total
    ) > v_customer.credit_limit and v_customer.credit_limit > 0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists (
          select 1
          from public.company_memberships membership
          join public.roles role
            on role.id = membership.role_id and role.company_id = membership.company_id
          where membership.company_id = v_order.company_id
            and membership.user_id = v_actor
            and membership.authorization_status = 'approved'
            and 'ApproveCustomerCredit' = any(role.permissions)
        )
        or coalesce(current_setting('app.approved_credit_order_id', true), '') = p_order_id::text
      then
        insert into public.approvals(
          company_id, type, status, metadata, requested_by, decided_by,
          decided_at, decision_reason
        ) values(
          v_order.company_id, 'overdraft', 'approved', jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ), auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_payments) payment
      where payment ->> 'method' = 'credit'
    ) then
      raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
    end if;

    with inserted as (
      insert into public.payments(
        company_id, order_id, method_code, amount, reference, mpesa_receipt,
        collection_allocation_id, location_id, cashier_session_id, ledger_account_code
      )
      select
        v_order.company_id, p_order_id, payment.method, payment.amount,
        payment.reference, payment.mpesa_receipt, payment.collection_allocation_id,
        v_order.location_id,
        coalesce((p_context).cashier_session_id, v_order.cashier_session_id),
        public.resolve_tender_account(
          v_order.company_id, v_order.location_id, payment.method, payment.account_code
        )
      from jsonb_to_recordset(p_payments) as payment(
        method text,
        amount bigint,
        reference text,
        mpesa_receipt text,
        collection_allocation_id uuid,
        account_code text
      )
      returning amount
    )
    select coalesce(sum(amount), 0)::bigint into v_paid from inserted;
    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select line.*, variant.track_inventory
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id
    order by line.variant_id,line.id
  loop
    v_quantity_total := v_quantity_total + v_line.stock_quantity;
    v_line_cogs := 0;
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.stock_quantity,
        'Sale', p_order_id::text
      );
      v_line_cogs := (v_fifo ->> 'total_cogs')::bigint;
      v_total_cogs := v_total_cogs + v_line_cogs;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
    update public.order_lines
    set cogs_total = v_line_cogs
    where id = v_line.id and company_id = v_order.company_id;
  end loop;

  select coalesce(sum(line.cogs_total), 0)::bigint
  into v_persisted_line_cogs
  from public.order_lines line
  where line.order_id = p_order_id and line.company_id = v_order.company_id;
  if v_persisted_line_cogs <> v_total_cogs then
    raise exception 'order_line_cogs_mismatch: lines % <> order %',
      v_persisted_line_cogs, v_total_cogs;
  end if;

  if v_is_receivable then
    perform public.post_journal_entry_with_context(
      v_order.company_id, case when v_is_cod then 'CodReceivable' else 'CreditSale' end,
      p_order_id::text,
      case when v_is_cod then 'COD receivable ' else 'Credit sale ' end || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total,
          'order_id', p_order_id, 'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'method', case when v_is_cod then 'cod' else 'credit' end
          )
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  else
    for v_payment_row in select payment.* from public.payments payment
      where payment.order_id = p_order_id
    loop
      perform public.post_journal_entry_with_context(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount,
            'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        ), v_posting_context
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry_with_context(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end,
      cashier_pending_at = null,
      completed_at = coalesce((p_context).occurred_at, completed_at, now()),
      accounting_posting_date = v_entry_date,
      posting_source = (p_context).source,
      late_posting_reason = (p_context).late_reason,
      cashier_session_id = coalesce(cashier_session_id, (p_context).cashier_session_id),
      quantity_total = v_quantity_total,
      cogs_total = v_total_cogs,
      updated_at = now()
  where id = p_order_id;
  return p_order_id;
end;
$$;


create or replace function public.reverse_purchase(p_purchase_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_purchase public.purchases%rowtype;
  v_entry public.ledger_journal_entries%rowtype;v_line record;v_purchase_line record;
  v_payment record;v_application record;v_expense record;v_expense_entry public.ledger_journal_entries%rowtype;
  v_lines jsonb:='[]'::jsonb;v_expense_lines jsonb;v_reversal_id uuid;v_expense_reversal uuid;
  v_net_unit_cost bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    or not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: purchase reversal requires purchase and reversal access'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_purchase from public.purchases p where p.id=p_purchase_id
    and p.company_id=v_company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  if v_purchase.status='reversed' then
    select e.id into v_reversal_id from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.source_type='PurchaseReversal'
      and e.source_id=v_purchase.id::text||'-reversal';
    if v_reversal_id is null then raise exception 'purchase_reversal_journal_not_found'; end if;
    return v_reversal_id;
  end if;
  perform set_config('app.business_location_id',v_purchase.stock_location_id::text,true);
  perform public.require_open_cashier_session_at_location(v_company_id,v_purchase.stock_location_id);
  perform 1 from public.purchase_lines pl join public.inventory_batches b
    on b.id=pl.inventory_batch_id where pl.purchase_id=v_purchase.id order by b.id for update of b;
  if exists(select 1 from public.purchase_lines pl join public.inventory_batches b
      on b.id=pl.inventory_batch_id where pl.purchase_id=v_purchase.id
      and (b.remaining<>pl.stock_quantity or b.remaining_cost<>b.original_cost)) then
    raise exception 'purchase_stock_already_moved'; end if;
  for v_payment in select distinct s.id from public.supplier_payments s
    join public.purchase_payments pp on pp.supplier_payment_id=s.id
    where pp.purchase_id=v_purchase.id and pp.status='settled' and s.status='posted'
    order by s.id
  loop
    perform public.reverse_supplier_payment(v_payment.id,'Purchase reversal: '||btrim(p_reason));
  end loop;
  for v_application in select a.id from public.supplier_advance_applications a
    where a.purchase_id=v_purchase.id and a.status='active' order by a.id
  loop
    perform public.reverse_supplier_advance_application(v_application.id,
      'Purchase reversal: '||btrim(p_reason));
  end loop;
  for v_expense in select pe.* from public.purchase_expenses pe
    where pe.purchase_id=v_purchase.id and pe.settlement='separate' and pe.status='posted'
    order by pe.id for update
  loop
    select * into v_expense_entry from public.ledger_journal_entries e
    where e.company_id=v_company_id and e.source_type='PurchaseExpense'
      and e.source_id=v_expense.id::text;
    if v_expense_entry.id is null then raise exception 'purchase_expense_journal_not_found'; end if;
    v_expense_lines:='[]'::jsonb;
    for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_expense_entry.id
    loop
      v_expense_lines:=v_expense_lines||jsonb_build_object('account_code',v_line.account_code,
        'debit',v_line.credit,'credit',v_line.debit,'meta',v_line.meta||jsonb_build_object(
          'reason',btrim(p_reason),'reversalOfPurchaseExpenseId',v_expense.id));
    end loop;
    v_expense_reversal:=public.post_reversal_entry(v_company_id,'PurchaseExpenseReversal',
      v_expense.id::text||'-reversal','Purchase expense reversed: '||btrim(p_reason),
      v_expense_lines,v_expense_entry.id);
    update public.purchase_expenses set status='reversed',reversal_entry_id=v_expense_reversal,
      reversed_at=now() where id=v_expense.id;
  end loop;
  select * into v_entry from public.ledger_journal_entries e where e.company_id=v_company_id
    and e.source_type='InventoryPurchase' and e.source_id=v_purchase.id::text;
  if v_entry.id is null then raise exception 'purchase_journal_not_found'; end if;
  for v_line in select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,'meta',v_line.meta||jsonb_build_object(
        'reason',btrim(p_reason),'reversalOfPurchaseId',v_purchase.id,
        'locationId',v_purchase.stock_location_id));
  end loop;
  for v_purchase_line in select pl.*,b.stock_location_id,b.original_cost recognized_cost
    from public.purchase_lines pl
    join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id order by b.id
  loop
    v_net_unit_cost:=round(v_purchase_line.recognized_cost/v_purchase_line.stock_quantity);
    update public.inventory_batches set remaining=0,remaining_cost=0
    where id=v_purchase_line.inventory_batch_id;
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
      quantity,unit_cost,total_cost,source_type,source_id,meta)
    values(v_company_id,v_purchase_line.variant_id,v_purchase_line.inventory_batch_id,
      v_purchase_line.stock_location_id,'reversal',-v_purchase_line.stock_quantity,v_net_unit_cost,
      -v_purchase_line.recognized_cost,'PurchaseReversal',v_purchase.id::text,jsonb_build_object(
        'reason',btrim(p_reason),'grossCost',v_purchase_line.gross_total,
        'invoiceVat',v_purchase_line.tax_total,
        'inputVat',case when v_purchase.claim_input_vat then v_purchase_line.tax_total else 0 end));
  end loop;
  update public.purchases set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_purchase.id;
  v_reversal_id:=public.post_reversal_entry(v_company_id,'PurchaseReversal',
    v_purchase.id::text||'-reversal','Purchase reversed: '||btrim(p_reason),v_lines,v_entry.id);
  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  return v_reversal_id;
end;
$$;


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
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;


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

      v_line_value := coalesce(nullif(v_variant->>'opening_total_cost','')::bigint,round(v_quantity * v_unit_cost));
      if v_line_value<0 then raise exception 'invalid_opening_cost'; end if;
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date,original_cost,remaining_cost
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date,v_line_value,v_line_value
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


create or replace function public.update_catalog_product(
  p_product_id uuid,
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_variant jsonb;
  v_variant_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_active boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_opening_source_id text;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  update public.products
  set name = trim(p_name),
      barcode = nullif(trim(coalesce(p_barcode, '')), ''),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then raise exception 'product_not_found: %', p_product_id; end if;

  -- A product may gain opening-stock variants in more than one edit. Use a
  -- per-edit source id so post_journal_entry's idempotency key does not hide
  -- later opening-value journals behind the product's original one.
  v_opening_source_id := p_product_id::text || ':' || gen_random_uuid()::text;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_variant_id := nullif(v_variant ->> 'variant_id', '')::uuid;
    if v_variant_id is not null and v_variant_id = any(v_seen_ids) then
      raise exception 'duplicate_variant: %', v_variant_id;
    end if;
    if v_variant_id is not null then v_seen_ids := array_append(v_seen_ids, v_variant_id); end if;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    if (v_variant ->> 'price') is null or (v_variant ->> 'price')::bigint < 0 then
      raise exception 'invalid_price: every variant needs a valid price';
    end if;
    if (v_variant ->> 'wholesale_price') is not null
       and (v_variant ->> 'wholesale_price')::bigint < 0 then
      raise exception 'invalid_wholesale_price';
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := case when v_kind = 'service' then false
                         else coalesce((v_variant ->> 'allow_fractional')::boolean, false) end;
    v_active := coalesce((v_variant ->> 'active')::boolean, true);
    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');

    if v_variant_id is not null then
      if coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0) <> 0 then
        raise exception 'opening_stock_new_variants_only';
      end if;

      -- Retire packs before the quantity-type guard runs, including when both
      -- changes are submitted in the same editor save.
      if (v_kind <> 'good' or v_fractional) and v_variant ? 'packs' then
        perform public.save_variant_packs(v_variant_id,
          coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
      end if;

      update public.product_variants
      set name = v_label,
          kind = v_kind,
          sku = coalesce(v_sku, sku),
          barcode = nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
          price = (v_variant ->> 'price')::bigint,
          wholesale_price = nullif(v_variant ->> 'wholesale_price', '')::bigint,
          allow_fractional = v_fractional,
          track_inventory = v_track,
          active = v_active,
          updated_at = now()
      where id = v_variant_id
        and product_id = p_product_id
        and company_id = v_company_id;

      if not found then raise exception 'variant_not_found: %', v_variant_id; end if;
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;
      continue;
    end if;

    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || p_product_id::text || v_label), 1, 4));
    end if;

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

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory, active
    ) values (
      p_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track, v_active
    ) returning id into v_variant_id;
    if v_variant ? 'packs' then
      perform public.save_variant_packs(v_variant_id,coalesce(v_variant->>'stock_unit','item'),v_variant->'packs');
    end if;


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

      v_line_value := coalesce(nullif(v_variant->>'opening_total_cost','')::bigint,round(v_quantity * v_unit_cost));
      if v_line_value<0 then raise exception 'invalid_opening_cost'; end if;
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date,original_cost,remaining_cost
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date,v_line_value,v_line_value
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_opening_source_id,
        jsonb_build_object('openingStock', true, 'productId', p_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_opening_source_id,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id))
      )
    );
  end if;

  return p_product_id;
end;
$$;

create table public.catalog_save_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  client_ref uuid not null,
  payload jsonb not null,
  product_id uuid not null references public.products(id),
  primary key(company_id,client_ref)
);
alter table public.catalog_save_requests enable row level security;
revoke all on public.catalog_save_requests from public,anon,authenticated;

create or replace function public.save_catalog_product_units(p_product jsonb,p_variants jsonb,p_client_ref uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_id uuid;v_payload jsonb;
  v_previous public.catalog_save_requests%rowtype;v_categories uuid[];
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_client_ref is null then raise exception 'client_ref_required'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-units:'||v_company::text,0));
  v_payload:=jsonb_build_object('product',p_product,'variants',p_variants);
  select * into v_previous from public.catalog_save_requests
    where company_id=v_company and client_ref=p_client_ref;
  if v_previous.product_id is not null then
    if v_previous.payload<>v_payload then raise exception 'idempotency_conflict'; end if;
    return v_previous.product_id;
  end if;
  v_id:=nullif(p_product->>'product_id','')::uuid;
  if v_id is null then
    v_id:=public.create_catalog_product_with_manufacturer(
      p_name=>p_product->>'name',p_variants=>p_variants,
      p_barcode=>nullif(p_product->>'barcode',''),p_image_path=>nullif(p_product->>'image_path',''),
      p_manufacturer_id=>nullif(p_product->>'manufacturer_id','')::uuid);
  else
    perform public.update_catalog_product_with_manufacturer(
      p_product_id=>v_id,p_name=>p_product->>'name',p_variants=>p_variants,
      p_barcode=>p_product->>'barcode',p_active=>coalesce((p_product->>'active')::boolean,true),
      p_manufacturer_id=>nullif(p_product->>'manufacturer_id','')::uuid,
      p_image_changed=>coalesce((p_product->>'image_changed')::boolean,false),
      p_image_path=>nullif(p_product->>'image_path',''),
      p_expected_image_path=>nullif(p_product->>'expected_image_path',''));
  end if;
  if p_product ? 'category_ids' then
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_categories
      from jsonb_array_elements_text(p_product->'category_ids');
    perform public.set_product_categories(v_id,v_categories);
  end if;
  if p_product ? 'tax_category_id' then
    perform public.set_product_tax_category(v_id,nullif(p_product->>'tax_category_id','')::uuid);
  end if;
  insert into public.catalog_save_requests values(v_company,p_client_ref,v_payload,v_id);
  return v_id;
end;
$$;
revoke all on function public.save_catalog_product_units(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_catalog_product_units(jsonb,jsonb,uuid) to authenticated;

-- Pack lookups return an explicit selling-unit identity. Legacy barcode RPC remains base-only.
create or replace function public.resolve_catalog_selling_unit(p_barcode text,p_location_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.variant_packs%rowtype;v jsonb;v_company uuid:=public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  select * into p from public.variant_packs where company_id=v_company and active and barcode=btrim(p_barcode);
  if p.id is not null then
    if p.sale_price is null then raise exception 'pack_not_sellable'; end if;
    select to_jsonb(c) into v from public.variant_catalog c
      where c.variant_id=p.variant_id and c.product_active and c.variant_active;
    if v is null then return null; end if;
    if p_location_id is not null then
      if not public.current_user_can_access_location(p_location_id) then raise exception 'location_access_denied'; end if;
      v:=v||jsonb_build_object('stock',(select coalesce(sum(remaining),0) from public.inventory_batches
        where company_id=v_company and variant_id=p.variant_id and stock_location_id=p_location_id));
    end if;
    v:=v||jsonb_build_object('stock_unit',(select stock_unit from public.product_variants where id=p.variant_id),
      'packs',public.catalog_packs_json(p.variant_id),'selected_pack_id',p.id);
    return v;
  end if;
  select to_jsonb(c) into v from public.resolve_catalog_barcode(p_barcode,p_location_id) c limit 1;
  if v is not null then
    v:=v||jsonb_build_object('stock_unit',(select stock_unit from public.product_variants where id=(v->>'variant_id')::uuid),
      'packs',public.catalog_packs_json((v->>'variant_id')::uuid),'selected_pack_id',null);
  end if;
  return v;
end;
$$;
revoke all on function public.resolve_catalog_selling_unit(text,uuid) from public,anon;
grant execute on function public.resolve_catalog_selling_unit(text,uuid) to authenticated;
