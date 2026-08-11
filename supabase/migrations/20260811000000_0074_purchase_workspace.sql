-- Exact purchase totals, associated expenses, and residual-safe inventory valuation.

alter table public.purchases
  add column if not exists goods_subtotal bigint;
update public.purchases set goods_subtotal = total_cost where goods_subtotal is null;
alter table public.purchases alter column goods_subtotal set not null;
alter table public.purchases alter column goods_subtotal set default 0;

-- Legacy purchase RPCs and direct inserts only know about total_cost. Preserve their
-- historical meaning while newer callers provide the exact merchandise subtotal.
create or replace function public.maintain_purchase_goods_subtotal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.goods_subtotal = 0 then
    new.goods_subtotal := new.total_cost;
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_maintain_goods_subtotal on public.purchases;
create trigger purchases_maintain_goods_subtotal
before insert on public.purchases
for each row execute function public.maintain_purchase_goods_subtotal();

alter table public.purchase_lines
  add column if not exists value_source text not null default 'unit'
    check (value_source in ('unit', 'total'));

alter table public.purchase_drafts
  add column if not exists expenses jsonb not null default '[]'::jsonb,
  add column if not exists stock_location_id uuid references public.stock_locations(id),
  add column if not exists payment_mode text check (payment_mode in ('paid', 'partial', 'later')),
  add column if not exists payment_amount bigint,
  add column if not exists account_code text;

create table public.purchase_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  category text not null check (category in ('transport', 'loading', 'packaging', 'duty', 'other')),
  custom_label text,
  memo text,
  amount bigint not null check (amount > 0),
  settlement text not null check (settlement in ('supplier_bill', 'separate')),
  account_code text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (
    (settlement = 'supplier_bill' and account_code is null)
    or (settlement = 'separate' and account_code is not null)
  ),
  check (
    (category = 'other' and nullif(btrim(custom_label), '') is not null)
    or (category <> 'other' and custom_label is null)
  )
);
create index purchase_expenses_purchase_idx on public.purchase_expenses(purchase_id, created_at);
alter table public.purchase_expenses enable row level security;
create policy "purchase expenses readable by members" on public.purchase_expenses for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_expenses to authenticated;
grant all on public.purchase_expenses to service_role;

-- A rounded unit cost is useful to humans, but it cannot represent every invoice total.
-- These balances are the authoritative inventory asset value and guarantee that the final
-- depletion consumes every residual shilling.
alter table public.inventory_batches
  add column if not exists original_cost bigint,
  add column if not exists remaining_cost bigint;
update public.inventory_batches
set original_cost = round(quantity * unit_cost),
    remaining_cost = round(remaining * unit_cost)
where original_cost is null or remaining_cost is null;
alter table public.inventory_batches alter column original_cost set not null;
alter table public.inventory_batches alter column remaining_cost set not null;
alter table public.inventory_batches
  add constraint inventory_batches_cost_bounds
  check (original_cost >= 0 and remaining_cost >= 0 and remaining_cost <= original_cost);

create or replace function public.maintain_inventory_batch_costs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.original_cost := coalesce(new.original_cost, round(new.quantity * new.unit_cost));
    new.remaining_cost := coalesce(new.remaining_cost, round(new.remaining * new.unit_cost));
  elsif new.remaining < old.remaining
    and new.remaining_cost is not distinct from old.remaining_cost then
    if new.remaining = 0 then
      new.remaining_cost := 0;
    elsif old.remaining > 0 then
      new.remaining_cost := least(new.original_cost,
        round(new.remaining * old.remaining_cost / old.remaining));
    else
      new.remaining_cost := least(new.original_cost, round(new.remaining * new.unit_cost));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_batches_maintain_costs on public.inventory_batches;
create trigger inventory_batches_maintain_costs
before insert or update of quantity, remaining, unit_cost, original_cost, remaining_cost
on public.inventory_batches for each row execute function public.maintain_inventory_batch_costs();

-- Voids restore the precise allocation recorded by FIFO, including the final
-- rounding residual. The legacy void function restores quantity before writing
-- its reversal movement, so value is restored here from that authoritative row.
create or replace function public.restore_reversed_batch_cost()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.type='reversal' and new.batch_id is not null and new.total_cost>0 then
    update public.inventory_batches
    set remaining_cost=least(original_cost,remaining_cost+new.total_cost)
    where id=new.batch_id and company_id=new.company_id;
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_movements_restore_reversed_cost on public.inventory_movements;
create trigger inventory_movements_restore_reversed_cost
after insert on public.inventory_movements
for each row execute function public.restore_reversed_batch_cost();

create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_batch record; v_remaining numeric := p_quantity; v_take numeric;
  v_cost bigint; v_total bigint := 0; v_allocations jsonb := '[]'::jsonb;
  v_available numeric; v_location_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid_quantity'; end if;
  if p_source_type = 'Sale' then
    select o.location_id into v_location_id from public.orders o
    where o.id = p_source_id::uuid and o.company_id = p_company_id;
  end if;
  if v_location_id is null then
    begin v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then v_location_id := null; end;
  end if;
  if v_location_id is null then
    select l.id into v_location_id from public.stock_locations l
    where l.company_id=p_company_id and l.is_active
    order by l.is_default desc,l.created_at limit 1;
  end if;
  if v_location_id is null then raise exception 'stock_location_not_found'; end if;

  perform 1 from public.inventory_batches b
  where b.company_id=p_company_id and b.variant_id=p_variant_id
    and b.stock_location_id=v_location_id and b.remaining>0
  order by b.purchased_at,b.created_at,b.id for update;
  select coalesce(sum(b.remaining),0) into v_available from public.inventory_batches b
  where b.company_id=p_company_id and b.variant_id=p_variant_id
    and b.stock_location_id=v_location_id and b.remaining>0;
  if v_available < p_quantity then
    raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
      p_variant_id,v_available,p_quantity;
  end if;

  for v_batch in
    select b.id,b.remaining,b.unit_cost,b.remaining_cost from public.inventory_batches b
    where b.company_id=p_company_id and b.variant_id=p_variant_id
      and b.stock_location_id=v_location_id and b.remaining>0
    order by b.purchased_at,b.created_at,b.id
  loop
    exit when v_remaining<=0;
    v_take := least(v_batch.remaining,v_remaining);
    v_cost := case when v_take=v_batch.remaining then v_batch.remaining_cost
      else round(v_take*v_batch.remaining_cost/v_batch.remaining) end;
    v_total := v_total+v_cost; v_remaining := v_remaining-v_take;
    update public.inventory_batches set remaining=remaining-v_take,
      remaining_cost=remaining_cost-v_cost where id=v_batch.id;
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,
      type,quantity,unit_cost,total_cost,source_type,source_id)
    values(p_company_id,p_variant_id,v_batch.id,v_location_id,p_movement_type,-v_take,
      v_batch.unit_cost,v_cost,p_source_type,p_source_id);
    v_allocations := v_allocations || jsonb_build_object('batch_id',v_batch.id,
      'quantity',v_take,'unit_cost',v_batch.unit_cost,'total_cost',v_cost,'location_id',v_location_id);
  end loop;
  if v_remaining<>0 then raise exception 'fifo_invariant_failed: % units remained unconsumed',v_remaining; end if;
  return jsonb_build_object('allocations',v_allocations,'total_cogs',v_total);
end;
$$;

-- One atomic entry point for the redesigned editor. Legacy RPC signatures remain available
-- during rollout; the web app uses this contract whenever exact totals or expenses are present.
create or replace function public.record_purchase_complete(
  p_supplier_id uuid,
  p_lines jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id(); v_supplier record; v_purchase_id uuid;
  v_line jsonb; v_expense jsonb; v_variant_id uuid; v_quantity numeric(14,3);
  v_unit_cost bigint; v_line_total bigint; v_value_source text; v_goods bigint:=0;
  v_supplier_expenses bigint:=0; v_invoice_total bigint; v_ap_balance bigint;
  v_location_id uuid; v_batch_id uuid; v_journal_lines jsonb:='[]'::jsonb;
  v_expense_id uuid; v_category text; v_custom_label text; v_settlement text;
  v_amount bigint; v_expense_account text;
  v_is_credit boolean; v_variant public.product_variants%rowtype;
  v_wholesale bigint; v_retail bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  select * into v_supplier from public.customers where id=p_supplier_id
    and company_id=v_company_id and is_supplier and supplier_active;
  if v_supplier.id is null then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'purchase_lines_required';
  end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;

  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=nullif(v_line->>'variant_id','')::uuid;
    v_quantity:=nullif(v_line->>'quantity','')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    if v_quantity is null or v_quantity<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants where id=v_variant_id
      and company_id=v_company_id and kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_quantity<>trunc(v_quantity) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
      v_unit_cost:=round(v_line_total/v_quantity);
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::bigint;
      if v_unit_cost is null or v_unit_cost<=0 then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_quantity*v_unit_cost);
    end if;
    v_goods:=v_goods+v_line_total;
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      v_wholesale:=coalesce(nullif(v_line->>'new_wholesale_price','')::bigint,v_variant.wholesale_price,0);
      v_retail:=coalesce(nullif(v_line->>'new_retail_price','')::bigint,v_variant.price,0);
      if v_wholesale<0 or v_retail<v_wholesale then raise exception 'invalid_catalog_price'; end if;
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
      or v_settlement not in ('supplier_bill','separate') then raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then
      v_supplier_expenses:=v_supplier_expenses+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_expense->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
      perform public.require_open_cashier_session(v_company_id);
    end if;
  end loop;

  v_invoice_total:=v_goods+v_supplier_expenses;
  if p_payment_amount is null or p_payment_amount<0 or p_payment_amount>v_invoice_total then
    raise exception 'invalid_initial_payment'; end if;
  v_is_credit:=p_payment_amount<v_invoice_total;
  if v_is_credit and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_amount>0 then
    perform public.require_asset_leaf_account(v_company_id,p_account_code);
    perform public.require_open_cashier_session(v_company_id);
  end if;
  if v_is_credit then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=p_supplier_id::text;
    if v_supplier.supplier_credit_limit>0
      and v_ap_balance+v_invoice_total-p_payment_amount>v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded'; end if;
  end if;

  v_location_id:=p_stock_location_id;
  if v_location_id is null then select id into v_location_id from public.stock_locations
    where company_id=v_company_id and code='MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations where id=v_location_id and company_id=v_company_id)
    then raise exception 'invalid_stock_location'; end if;
  if not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied'; end if;

  insert into public.purchases(company_id,supplier_id,reference,total_cost,goods_subtotal,is_credit,
    created_by,notes,purchase_date,stock_location_id)
  values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),v_invoice_total,v_goods,
    v_is_credit,auth.uid(),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_purchase_date,current_date),v_location_id)
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=(v_line->>'variant_id')::uuid; v_quantity:=(v_line->>'quantity')::numeric;
    v_value_source:=coalesce(nullif(v_line->>'value_source',''),'unit');
    if v_value_source='total' then v_line_total:=(v_line->>'line_total')::bigint;
      v_unit_cost:=round(v_line_total/v_quantity);
    else v_unit_cost:=(v_line->>'unit_cost')::bigint; v_line_total:=round(v_quantity*v_unit_cost); end if;
    insert into public.inventory_batches(company_id,variant_id,stock_location_id,supplier_id,
      quantity,remaining,unit_cost,original_cost,remaining_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_quantity,v_quantity,v_unit_cost,
      v_line_total,v_line_total,nullif(trim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date) returning id into v_batch_id;
    insert into public.purchase_lines(company_id,purchase_id,variant_id,inventory_batch_id,quantity,
      unit_cost,line_total,value_source,batch_number,expiry_date)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      v_value_source,nullif(trim(coalesce(v_line->>'batch_number','')),''),nullif(v_line->>'expiry_date','')::date);
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
      quantity,unit_cost,total_cost,source_type,source_id)
    values(v_company_id,v_variant_id,v_batch_id,v_location_id,'purchase',v_quantity,v_unit_cost,
      v_line_total,'InventoryPurchase',v_purchase_id::text);
  end loop;

  v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','INVENTORY','debit',v_goods,
    'meta',jsonb_build_object('purchaseId',v_purchase_id,'supplierId',p_supplier_id));
  for v_expense in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=(v_expense->>'amount')::bigint; v_category:=lower(trim(v_expense->>'category'));
    v_custom_label:=nullif(trim(v_expense->>'custom_label'),'');
    v_settlement:=v_expense->>'settlement'; v_expense_account:=nullif(v_expense->>'account_code','');
    insert into public.purchase_expenses(company_id,purchase_id,category,custom_label,memo,amount,
      settlement,account_code,created_by) values(v_company_id,v_purchase_id,v_category,v_custom_label,
      nullif(trim(coalesce(v_expense->>'memo','')),''),v_amount,v_settlement,
      case when v_settlement='separate' then v_expense_account end,auth.uid()) returning id into v_expense_id;
    if v_settlement='supplier_bill' then
      v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','EXPENSES','debit',v_amount,
        'meta',jsonb_build_object('purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,
          'supplierId',p_supplier_id,'expenseCategory',v_category));
    else
      perform public.post_journal_entry(v_company_id,'PurchaseExpense',v_expense_id::text,
        'Purchase expense ('||v_category||')',jsonb_build_array(
          jsonb_build_object('account_code','EXPENSES','debit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id,'expenseCategory',v_category)),
          jsonb_build_object('account_code',v_expense_account,'credit',v_amount,'meta',jsonb_build_object(
            'purchaseId',v_purchase_id,'purchaseExpenseId',v_expense_id,'supplierId',p_supplier_id))));
    end if;
  end loop;
  v_journal_lines:=v_journal_lines||jsonb_build_object(
    'account_code',case when v_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
    'credit',v_invoice_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'supplierId',p_supplier_id,
      'purchaseReference',p_reference,'isCreditPurchase',v_is_credit,
      'projectedInitialPayment',case when v_is_credit then p_payment_amount else 0 end));
  perform public.post_journal_entry(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase '||coalesce(p_reference,v_purchase_id::text),v_journal_lines);
  if v_is_credit and p_payment_amount>0 then perform public.pay_purchase(v_purchase_id,p_payment_amount,p_account_code); end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line?'new_wholesale_price' or v_line?'new_retail_price' then
      update public.product_variants set
        wholesale_price=case when v_line?'new_wholesale_price' then (v_line->>'new_wholesale_price')::bigint else wholesale_price end,
        price=case when v_line?'new_retail_price' then (v_line->>'new_retail_price')::bigint else price end,
        updated_at=now()
      where id=(v_line->>'variant_id')::uuid and company_id=v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$$;
revoke execute on function public.record_purchase_complete(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid) from public,anon;
grant execute on function public.record_purchase_complete(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid) to authenticated;

create or replace function public.save_purchase_draft_complete(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,p_reference text default null,
  p_notes text default null,p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_payment_mode text default null,p_payment_amount bigint default null,p_account_code text default null,
  p_draft_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_line jsonb; v_total bigint:=0;
  v_qty numeric; v_id uuid; v_value_source text; v_line_total bigint; v_unit_cost bigint;
  v_variant public.product_variants%rowtype; v_amount bigint; v_category text;
  v_custom_label text; v_settlement text; v_expense_account text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id,'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id
    and is_supplier and supplier_active) then raise exception 'supplier_archived_or_not_found'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;
  if p_stock_location_id is null or not exists(select 1 from public.stock_locations
    where id=p_stock_location_id and company_id=v_company_id and is_active)
    or not public.current_user_can_access_location(p_stock_location_id) then
    raise exception 'invalid_stock_location'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where l?'new_wholesale_price' or l?'new_retail_price')
    and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty:=nullif(v_line->>'quantity','')::numeric; v_value_source:=coalesce(v_line->>'value_source','unit');
    if v_qty is null or v_qty<=0 or v_value_source not in ('unit','total') then
      raise exception 'invalid_purchase_line'; end if;
    select * into v_variant from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if not v_variant.allow_fractional and v_qty<>trunc(v_qty) then
      raise exception 'fractional_quantity_not_allowed'; end if;
    if v_value_source='total' then
      v_line_total:=nullif(v_line->>'line_total','')::bigint;
      if v_line_total is null or v_line_total<=0 then raise exception 'invalid_purchase_line_total'; end if;
    else
      v_unit_cost:=nullif(v_line->>'unit_cost','')::bigint;
      if v_unit_cost is null or v_unit_cost<=0 then raise exception 'invalid_purchase_unit_cost'; end if;
      v_line_total:=round(v_qty*v_unit_cost);
    end if;
    v_total:=v_total+v_line_total;
  end loop;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    v_amount:=nullif(v_line->>'amount','')::bigint;
    v_category:=lower(nullif(trim(v_line->>'category'),''));
    v_custom_label:=nullif(trim(v_line->>'custom_label'),'');
    v_settlement:=nullif(v_line->>'settlement','');
    if v_amount is null or v_amount<=0 or v_category is null
      or v_category not in ('transport','loading','packaging','duty','other')
      or (v_category='other' and v_custom_label is null)
      or (v_category<>'other' and v_custom_label is not null)
      or v_settlement not in ('supplier_bill','separate') then
      raise exception 'invalid_purchase_expense'; end if;
    if v_settlement='supplier_bill' then v_total:=v_total+v_amount;
    else
      if not public.current_user_has_permission('CreateInterAccountTransfer') then
        raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
      v_expense_account:=nullif(v_line->>'account_code','');
      perform public.require_asset_leaf_account(v_company_id,v_expense_account);
    end if;
  end loop;
  if p_payment_mode not in ('paid','partial','later') then raise exception 'invalid_payment_mode'; end if;
  if p_payment_mode='paid' and p_payment_amount<>v_total then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='partial' and (p_payment_amount is null or p_payment_amount<=0 or p_payment_amount>=v_total)
    then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode='later' and coalesce(p_payment_amount,0)<>0 then raise exception 'invalid_initial_payment'; end if;
  if p_payment_mode in ('partial','later')
    and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_payment_mode in ('paid','partial') then
    perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,
      expenses,total_cost,stock_location_id,payment_mode,payment_amount,account_code,created_by)
    values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),
      p_purchase_date,p_lines,p_expenses,v_total,p_stock_location_id,p_payment_mode,p_payment_amount,p_account_code,auth.uid())
    returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=nullif(trim(coalesce(p_reference,'')),''),
      notes=nullif(trim(coalesce(p_notes,'')),''),purchase_date=p_purchase_date,lines=p_lines,expenses=p_expenses,
      total_cost=v_total,stock_location_id=p_stock_location_id,payment_mode=p_payment_mode,
      payment_amount=p_payment_amount,account_code=p_account_code,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.save_purchase_draft_complete(uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,text,uuid) from public,anon;
grant execute on function public.save_purchase_draft_complete(uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,text,uuid) to authenticated;

create or replace function public.confirm_purchase_draft_complete(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_draft public.purchase_drafts%rowtype; v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id and company_id=v_company_id
    and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id:=public.record_purchase_complete(v_draft.supplier_id,v_draft.lines,v_draft.expenses,
    coalesce(v_draft.payment_amount,0),v_draft.reference,coalesce(v_draft.account_code,'CASH_ON_HAND'),
    v_draft.notes,v_draft.purchase_date,v_draft.stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
  where id=p_draft_id;
  return v_purchase_id;
end;
$$;
revoke execute on function public.confirm_purchase_draft_complete(uuid) from public,anon;
grant execute on function public.confirm_purchase_draft_complete(uuid) to authenticated;

-- The AP serialization trigger owns the concurrency lock. Teach it that an
-- initial payment in this same purchase transaction reduces projected credit
-- exposure; otherwise it would reject the gross invoice before pay_purchase runs.
do $migration$
declare
  v_previous text;
  v_replacement text;
begin
  v_previous:=pg_get_functiondef('public.enforce_credit_serialization()'::regprocedure);
  v_replacement:=replace(v_previous,
    'and v_balance + new.credit > v_party.supplier_credit_limit then',
    'and v_balance + new.credit - coalesce(nullif(new.meta ->> ''projectedInitialPayment'', '''')::bigint, 0) > v_party.supplier_credit_limit then');
  if v_replacement=v_previous then
    raise exception 'supplier credit serialization expression not found';
  end if;
  execute v_replacement;
end;
$migration$;

-- Associated expense payments are money movement and participate in cashier attribution.
create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean language sql immutable set search_path='' as $$
  select p_source_type=any(array['Payment','CreditSale','PaymentAllocation','Expense',
    'PurchaseExpense','InterAccountTransfer','SupplierPayment','Refund','PaymentReversal'])
$$;

drop view public.purchase_history cascade;
create view public.purchase_history with (security_invoker=true) as
select p.*,
  coalesce(x.expense_total,0)::bigint as expense_total,
  coalesce(x.separate_expense_total,0)::bigint as separate_expense_total,
  (p.total_cost+coalesce(x.separate_expense_total,0))::bigint as all_in_total,
  case when not p.is_credit then p.total_cost else coalesce(sum(pp.amount),0)::bigint end as paid,
  case when not p.is_credit or coalesce(sum(pp.amount),0)>=p.total_cost then 'paid'
    when coalesce(sum(pp.amount),0)>0 then 'part_paid' else 'unpaid' end::text as payment_status
from public.purchases p
left join public.purchase_payments pp on pp.purchase_id=p.id
left join lateral (select coalesce(sum(pe.amount),0) expense_total,
  coalesce(sum(pe.amount) filter(where pe.settlement='separate'),0) separate_expense_total
  from public.purchase_expenses pe where pe.purchase_id=p.id) x on true
group by p.id,x.expense_total,x.separate_expense_total;
grant select on public.purchase_history to authenticated;

create view public.supplier_purchase_metrics with (security_invoker=true) as
select company_id,supplier_id,count(*)::bigint as purchase_count,
  coalesce(avg(total_cost),0)::bigint as average_order,
  count(*) filter(where payment_status<>'paid')::bigint as open_purchase_count,
  coalesce(sum(greatest(total_cost-paid,0)),0)::bigint as outstanding
from public.purchase_history group by company_id,supplier_id;
grant select on public.supplier_purchase_metrics to authenticated;

create or replace function public.location_stock_for_variants(p_location_id uuid,p_variant_ids uuid[])
returns table(variant_id uuid,stock numeric,stock_value bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  if coalesce(cardinality(p_variant_ids),0)>1000 then raise exception 'invalid_stock_patch_size'; end if;
  return query select v.id,coalesce(sum(b.remaining),0)::numeric,coalesce(sum(b.remaining_cost),0)::bigint
  from public.product_variants v left join public.inventory_batches b
    on b.variant_id=v.id and b.stock_location_id=v_location_id and b.remaining>0
  where v.company_id=v_company_id and v.id=any(p_variant_ids) group by v.id;
end;
$$;
revoke execute on function public.location_stock_for_variants(uuid,uuid[]) from public,anon;
grant execute on function public.location_stock_for_variants(uuid,uuid[]) to authenticated;

create or replace function public.location_stock_snapshot(p_location_id uuid default null)
returns table(variant_id uuid,stock numeric,stock_value bigint)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  return query select v.id,coalesce(sum(b.remaining),0)::numeric,
    coalesce(sum(b.remaining_cost),0)::bigint
  from public.product_variants v left join public.inventory_batches b
    on b.variant_id=v.id and b.stock_location_id=v_location_id and b.remaining>0
  where v.company_id=v_company_id group by v.id;
end;
$$;
revoke execute on function public.location_stock_snapshot(uuid) from anon,public;
grant execute on function public.location_stock_snapshot(uuid) to authenticated,service_role;

create or replace view public.product_stock with (security_invoker=true) as
select v.company_id,v.id as variant_id,coalesce(sum(b.remaining),0) as stock,
  coalesce(sum(b.remaining_cost),0)::bigint as stock_value
from public.product_variants v left join public.inventory_batches b
  on b.variant_id=v.id and b.remaining>0
group by v.company_id,v.id;
grant select on public.product_stock to authenticated;

-- Keep the established management paging/filtering contract, replacing only
-- its valuation expression so cost sorting and totals use the exact batch pool.
do $migration$
declare
  v_previous text;
  v_replacement text;
begin
  v_previous:=pg_get_functiondef(
    'public.catalog_management_page(text,text,text,text,text,text,integer,integer,uuid)'::regprocedure
  );
  v_replacement:=regexp_replace(v_previous,
    'sum\s*\(\s*b\.remaining\s*\*\s*b\.unit_cost\s*\)',
    'sum(b.remaining_cost)','gi');
  if v_replacement=v_previous then
    raise exception 'catalog_management_page valuation expression not found';
  end if;
  execute v_replacement;
end;
$migration$;

alter table public.stock_transfer_lines add column if not exists total_cost bigint;
update public.stock_transfer_lines set total_cost=round(quantity*unit_cost) where total_cost is null;
alter table public.stock_transfer_lines alter column total_cost set not null;

-- Transfers move an exact slice of the source value layer. The destination
-- batch and both movements receive that same cost; company inventory is unchanged.
create or replace function public.transfer_stock(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_transfer_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_requested numeric;
  v_remaining numeric;
  v_available numeric;
  v_take numeric;
  v_cost bigint;
  v_source record;
  v_destination_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id,'multipleLocations'),false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;
  if p_from_location_id=p_to_location_id then raise exception 'transfer_locations_must_differ'; end if;
  if not public.current_user_can_access_location(p_from_location_id)
    or not public.current_user_can_access_location(p_to_location_id) then
    raise exception 'location_access_denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'transfer_lines_required';
  end if;

  insert into public.stock_transfers(company_id,from_location_id,to_location_id,notes,created_by)
  values(v_company_id,p_from_location_id,p_to_location_id,
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_transfer_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id:=nullif(v_line->>'variant_id','')::uuid;
    v_requested:=nullif(v_line->>'quantity','')::numeric;
    if v_variant_id is null or v_requested is null or v_requested<=0 then
      raise exception 'invalid_transfer_line';
    end if;
    if not exists(select 1 from public.product_variants v where v.id=v_variant_id
      and v.company_id=v_company_id and v.track_inventory) then
      raise exception 'invalid_transfer_variant';
    end if;

    perform 1 from public.inventory_batches b
    where b.company_id=v_company_id and b.variant_id=v_variant_id
      and b.stock_location_id=p_from_location_id and b.remaining>0
    order by b.purchased_at,b.created_at,b.id for update;
    select coalesce(sum(b.remaining),0) into v_available from public.inventory_batches b
    where b.company_id=v_company_id and b.variant_id=v_variant_id
      and b.stock_location_id=p_from_location_id and b.remaining>0;
    if v_available<v_requested then
      raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
        v_variant_id,v_available,v_requested;
    end if;

    v_remaining:=v_requested;
    for v_source in
      select b.* from public.inventory_batches b
      where b.company_id=v_company_id and b.variant_id=v_variant_id
        and b.stock_location_id=p_from_location_id and b.remaining>0
      order by b.purchased_at,b.created_at,b.id for update
    loop
      exit when v_remaining<=0;
      v_take:=least(v_source.remaining,v_remaining);
      v_cost:=case when v_take=v_source.remaining then v_source.remaining_cost
        else round(v_take*v_source.remaining_cost/v_source.remaining) end;
      update public.inventory_batches
      set remaining=remaining-v_take,remaining_cost=remaining_cost-v_cost
      where id=v_source.id;

      insert into public.inventory_batches(company_id,variant_id,stock_location_id,supplier_id,
        quantity,remaining,unit_cost,original_cost,remaining_cost,purchased_at,expiry_date,batch_number)
      values(v_company_id,v_variant_id,p_to_location_id,v_source.supplier_id,v_take,v_take,
        v_source.unit_cost,v_cost,v_cost,v_source.purchased_at,v_source.expiry_date,v_source.batch_number)
      returning id into v_destination_batch_id;

      insert into public.stock_transfer_lines(company_id,transfer_id,variant_id,source_batch_id,
        destination_batch_id,quantity,unit_cost,total_cost)
      values(v_company_id,v_transfer_id,v_variant_id,v_source.id,v_destination_batch_id,
        v_take,v_source.unit_cost,v_cost);

      insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
        quantity,unit_cost,total_cost,source_type,source_id,meta)
      values
        (v_company_id,v_variant_id,v_source.id,p_from_location_id,'transfer_out',-v_take,
          v_source.unit_cost,v_cost,'StockTransfer',v_transfer_id::text,
          jsonb_build_object('toLocationId',p_to_location_id)),
        (v_company_id,v_variant_id,v_destination_batch_id,p_to_location_id,'transfer_in',v_take,
          v_source.unit_cost,v_cost,'StockTransfer',v_transfer_id::text,
          jsonb_build_object('fromLocationId',p_from_location_id));
      v_remaining:=v_remaining-v_take;
    end loop;
  end loop;
  return v_transfer_id;
end;
$$;
revoke execute on function public.transfer_stock(uuid,uuid,jsonb,text) from anon,public;
grant execute on function public.transfer_stock(uuid,uuid,jsonb,text) to authenticated;

select pg_notify('pgrst','reload schema');
