-- Reversal movements already restore exact cost via restore_reversed_batch_cost.
-- Restore quantity here only, including multiple sale lines sharing a batch.
create or replace function public.protect_transaction_unit_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='order_lines' then
    if exists(select 1 from public.orders where id=old.order_id and status in ('draft','pending_payment')) then return new; end if;
  end if;
  if (new.pack_id,new.unit_name,new.stock_unit_name,new.units_per_unit,new.quantity)
    is distinct from (old.pack_id,old.unit_name,old.stock_unit_name,old.units_per_unit,old.quantity) then
    raise exception 'transaction_unit_snapshot_immutable'; end if;
  return new;
end;
$$;
revoke all on function public.protect_transaction_unit_snapshot() from public,anon,authenticated;
create or replace trigger order_lines_unit_immutable before update on public.order_lines
for each row execute function public.protect_transaction_unit_snapshot();
create or replace trigger purchase_lines_unit_immutable before update on public.purchase_lines
for each row execute function public.protect_transaction_unit_snapshot();
create or replace function public.apply_purchase_pack_prices(p_lines jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare l jsonb;v_company uuid:=public.current_company_id();
begin
  if not exists(select 1 from jsonb_array_elements(p_lines) x where x?'new_pack_sale_price') then return; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) x where x?'new_pack_sale_price'
    group by x->>'pack_id' having count(distinct x->>'new_pack_sale_price')>1) then
    raise exception 'conflicting_pack_prices'; end if;
  for l in select * from jsonb_array_elements(p_lines) x where x?'new_pack_sale_price' order by x->>'pack_id' loop
    if jsonb_typeof(l->'new_pack_sale_price') is distinct from 'number'
      or (l->>'new_pack_sale_price')::numeric<=0
      or (l->>'new_pack_sale_price')::numeric<>trunc((l->>'new_pack_sale_price')::numeric) then
      raise exception 'invalid_pack_price'; end if;
    update public.variant_packs set sale_price=(l->>'new_pack_sale_price')::bigint
      where id=nullif(l->>'pack_id','')::uuid and company_id=v_company
        and variant_id=(l->>'variant_id')::uuid and active;
    if not found then raise exception 'pack_unavailable'; end if;
    update public.product_variants set updated_at=now() where id=(l->>'variant_id')::uuid and company_id=v_company;
  end loop;
end;
$$;
revoke all on function public.apply_purchase_pack_prices(jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.post_refund_tax_and_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_movement record;v_cogs bigint:=0;v_timezone text;v_entry_date date;
begin
  select c.business_timezone into v_timezone from public.companies c where c.id=new.company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  if new.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatRefundReclass',new.id::text,
      'VAT credit note for sale refund',jsonb_build_array(
        jsonb_build_object('account_code','TAX_PAYABLE','debit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','SALES_RETURNS','credit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id))
      ),v_entry_date);
  end if;
  if new.stock_outcome='return_to_stock' then
    for v_movement in select * from public.inventory_movements im
      where im.company_id=new.company_id and im.source_type='Sale'
        and im.source_id=new.order_id::text and im.quantity<0
    loop
      update public.inventory_batches set remaining=remaining+abs(v_movement.quantity)
      where id=v_movement.batch_id;
      insert into public.inventory_movements(
        company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
        source_type,source_id,meta
      ) values(
        new.company_id,v_movement.variant_id,v_movement.batch_id,v_movement.stock_location_id,
        'reversal',abs(v_movement.quantity),v_movement.unit_cost,v_movement.total_cost,
        'RefundRestock',new.id::text,jsonb_build_object('orderId',new.order_id,'refundId',new.id)
      );
      v_cogs:=v_cogs+coalesce(v_movement.total_cost,0);
    end loop;
    if v_cogs>0 then
      perform public.post_journal_entry(new.company_id,'RefundRestock',new.id::text,
        'Stock returned from refunded sale',jsonb_build_array(
          jsonb_build_object('account_code','INVENTORY','debit',v_cogs,'order_id',new.order_id,
            'meta',jsonb_build_object('refundId',new.id)),
          jsonb_build_object('account_code','COGS','credit',v_cogs,'order_id',new.order_id,
            'meta',jsonb_build_object('refundId',new.id))
        ),v_entry_date);
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_purchase_complete_core(p_supplier_id uuid, p_lines jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_payment_amount bigint DEFAULT 0, p_reference text DEFAULT NULL::text, p_account_code text DEFAULT 'CASH_ON_HAND'::text, p_notes text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_stock_location_id uuid DEFAULT NULL::uuid, p_claim_input_vat boolean DEFAULT false, p_tax_invoice_date date DEFAULT NULL::date, p_client_ref text DEFAULT NULL::text, p_context posting_context DEFAULT NULL::posting_context, p_advance_amount bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
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
  perform public.apply_purchase_pack_prices(p_lines);
  return v_purchase_id;
end;
$function$
;


-- A lost save response must not let orphan cleanup delete the now-attached photo.
drop policy if exists "members delete their company image prefix" on storage.objects;
create policy "members delete their company image prefix" on storage.objects for delete using (
  bucket_id='product-images'
  and (storage.foldername(name))[1]=(select public.current_company_id()::text)
  and (select public.current_user_has_permission('ManageStockAdjustments'))
  and not exists(select 1 from public.products p where p.company_id=public.current_company_id()
    and p.image_path=storage.objects.name)
);
