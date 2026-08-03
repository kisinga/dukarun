-- 0034_purchase_lifecycle.sql
-- Durable purchase detail, drafts, location-aware receiving and payment
-- against one selected purchase.

alter table public.purchases
  add column if not exists purchase_date date not null default current_date,
  add column if not exists notes text,
  add column if not exists stock_location_id uuid references public.stock_locations(id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  inventory_batch_id uuid references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  line_total bigint not null check (line_total >= 0),
  batch_number text,
  expiry_date date,
  created_at timestamptz not null default now()
);
create index purchase_lines_purchase_idx on public.purchase_lines(purchase_id);
alter table public.purchase_lines enable row level security;
create policy "purchase lines readable by members" on public.purchase_lines for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_lines to authenticated;
grant all on public.purchase_lines to service_role;

create table public.purchase_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  reference text,
  notes text,
  purchase_date date not null default current_date,
  lines jsonb not null,
  total_cost bigint not null check (total_cost > 0),
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  posted_purchase_id uuid references public.purchases(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_drafts enable row level security;
create policy "purchase drafts readable by members" on public.purchase_drafts for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_drafts to authenticated;
grant all on public.purchase_drafts to service_role;

create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record; v_purchase_id uuid; v_line jsonb; v_total bigint := 0;
  v_batch_count int := 0; v_ap_balance bigint; v_location_id uuid;
  v_variant_id uuid; v_quantity numeric(14,3); v_unit_cost bigint;
  v_line_total bigint; v_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  select * into v_supplier from public.customers where id = p_supplier_id
    and company_id = v_company_id and is_supplier;
  if v_supplier is null then raise exception 'supplier_not_found: %', p_supplier_id; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    then raise exception 'purchase_lines_required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
    v_unit_cost := nullif(v_line ->> 'unit_cost', '')::bigint;
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0
      then raise exception 'invalid_purchase_line'; end if;
    if not exists (select 1 from public.product_variants where id = v_variant_id
      and company_id = v_company_id and kind = 'good')
      then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round(v_quantity * v_unit_cost);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;
    if v_supplier.supplier_credit_limit > 0 and v_ap_balance + v_total > v_supplier.supplier_credit_limit
      then raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit; end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  v_location_id := p_stock_location_id;
  if v_location_id is null then select id into v_location_id from public.stock_locations
    where company_id = v_company_id and code = 'MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations where id = v_location_id and company_id = v_company_id)
    then raise exception 'invalid_stock_location'; end if;

  insert into public.purchases(company_id,supplier_id,reference,total_cost,is_credit,created_by,
    notes,purchase_date,stock_location_id)
  values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),v_total,p_is_credit,
    auth.uid(),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_purchase_date,current_date),v_location_id)
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_batch_count := v_batch_count + 1;
    v_variant_id := (v_line ->> 'variant_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_cost := (v_line ->> 'unit_cost')::bigint;
    v_line_total := round(v_quantity * v_unit_cost);
    insert into public.inventory_batches(company_id,variant_id,stock_location_id,supplier_id,
      quantity,remaining,unit_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_quantity,v_quantity,v_unit_cost,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date)
    returning id into v_batch_id;
    insert into public.purchase_lines(company_id,purchase_id,variant_id,inventory_batch_id,quantity,
      unit_cost,line_total,batch_number,expiry_date)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date);
    insert into public.inventory_movements(company_id,variant_id,batch_id,type,quantity,unit_cost,
      total_cost,source_type,source_id)
    values(v_company_id,v_variant_id,v_batch_id,'purchase',v_quantity,v_unit_cost,v_line_total,
      'InventoryPurchase',v_purchase_id::text);
  end loop;

  perform public.post_journal_entry(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase ' || coalesce(p_reference,v_purchase_id::text),jsonb_build_array(
      jsonb_build_object('account_code','INVENTORY','debit',v_total,'meta',jsonb_build_object(
        'purchaseId',v_purchase_id,'purchaseReference',p_reference,'supplierId',p_supplier_id,'batchCount',v_batch_count)),
      jsonb_build_object('account_code',case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit',v_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'purchaseReference',p_reference,
        'supplierId',p_supplier_id,'isCreditPurchase',p_is_credit))));
  return v_purchase_id;
end;
$$;

-- Remove the legacy signature to prevent PostgREST overload ambiguity.
drop function if exists public.record_purchase(uuid,jsonb,boolean,text,text);
revoke execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) from anon,public;
grant execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) to authenticated;

create or replace function public.save_purchase_draft(
  p_supplier_id uuid, p_lines jsonb, p_reference text default null,
  p_notes text default null, p_purchase_date date default current_date,
  p_draft_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_total bigint := 0;
  v_line jsonb; v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id and is_supplier)
    then raise exception 'supplier_not_found'; end if;
  if p_lines is null or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good') then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::bigint);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,total_cost,created_by)
    values(v_company_id,p_supplier_id,p_reference,p_notes,coalesce(p_purchase_date,current_date),p_lines,v_total,auth.uid()) returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=p_reference,notes=p_notes,
      purchase_date=coalesce(p_purchase_date,current_date),lines=p_lines,total_cost=v_total,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.cancel_purchase_draft(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_id uuid;
begin update public.purchase_drafts set status='cancelled',updated_at=now()
  where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
  if v_id is null then raise exception 'purchase_draft_not_found'; end if; return v_id; end;
$$;

create or replace function public.pay_purchase(p_purchase_id uuid,p_amount bigint,p_account_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_purchase public.purchases%rowtype;
  v_paid bigint; v_payment_id uuid;
begin
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_account_code);
  select * into v_purchase from public.purchases where id=p_purchase_id and company_id=v_company_id
    and is_credit for update;
  if v_purchase.id is null then raise exception 'credit_purchase_not_found'; end if;
  select coalesce(sum(amount),0) into v_paid from public.purchase_payments where purchase_id=p_purchase_id;
  if p_amount > v_purchase.total_cost-v_paid then raise exception 'ap_overpayment'; end if;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by)
  values(v_company_id,p_purchase_id,p_amount,p_account_code,auth.uid()) returning id into v_payment_id;
  perform public.post_journal_entry(v_company_id,'SupplierPayment',v_payment_id::text,
    'Supplier payment '||coalesce(v_purchase.reference,v_purchase.id::text),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id,'method',p_account_code))));
  return v_payment_id;
end;
$$;

revoke execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) from anon,public;
revoke execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) from anon,public;
revoke execute on function public.cancel_purchase_draft(uuid) from anon,public;
revoke execute on function public.pay_purchase(uuid,bigint,text) from anon,public;
grant execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) to authenticated;
grant execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) to authenticated;
grant execute on function public.cancel_purchase_draft(uuid) to authenticated;
grant execute on function public.pay_purchase(uuid,bigint,text) to authenticated;
