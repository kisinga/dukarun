-- ===========================================================================
-- 0103 VAT transactions and periods
-- Recoverable input VAT, full-sale credit notes, offline late-sale review,
-- daily operational sign-off, monthly rolling periods, and closing packs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Input VAT documents and purchase snapshots
-- ---------------------------------------------------------------------------
alter table public.purchases
  add column gross_total bigint not null default 0 check (gross_total>=0),
  add column net_total bigint not null default 0 check (net_total>=0),
  add column goods_net_total bigint not null default 0 check (goods_net_total>=0),
  add column input_tax_total bigint not null default 0 check (input_tax_total>=0),
  add column claim_input_vat boolean not null default false,
  add column supplier_tax_pin text,
  add column tax_invoice_number text,
  add column tax_invoice_date date,
  add column tax_profile_id uuid references public.company_tax_profiles(id) on delete restrict,
  add column tax_snapshot_status text not null default 'legacy_unclassified'
    check (tax_snapshot_status in ('legacy_unclassified','final'));

alter table public.purchase_lines
  add column tax_category_id uuid references public.tax_categories(id) on delete restrict,
  add column tax_rate_version_id uuid references public.tax_rate_versions(id) on delete restrict,
  add column tax_category_code text,
  add column tax_classification text,
  add column tax_rate_bps integer not null default 0,
  add column gross_total bigint not null default 0 check (gross_total>=0),
  add column net_total bigint not null default 0 check (net_total>=0),
  add column tax_total bigint not null default 0 check (tax_total>=0);

alter table public.purchase_expenses
  add column tax_category_id uuid references public.tax_categories(id) on delete restrict,
  add column tax_rate_version_id uuid references public.tax_rate_versions(id) on delete restrict,
  add column tax_category_code text,
  add column tax_classification text,
  add column tax_rate_bps integer not null default 0,
  add column gross_total bigint not null default 0 check (gross_total>=0),
  add column net_total bigint not null default 0 check (net_total>=0),
  add column tax_total bigint not null default 0 check (tax_total>=0);

-- Build table indexes before backfills queue deferred purchase-integrity
-- triggers; PostgreSQL rejects CREATE INDEX while those events are pending.
create unique index purchases_supplier_tax_invoice_idx
  on public.purchases(company_id,supplier_id,tax_invoice_number)
  where tax_invoice_number is not null and status='posted';

update public.purchases set gross_total=total_cost,net_total=total_cost,
  goods_net_total=goods_subtotal,input_tax_total=0;
update public.purchase_lines set gross_total=line_total,net_total=line_total,tax_total=0;
update public.purchase_expenses set gross_total=amount,net_total=amount,tax_total=0;

create table public.expense_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_date date not null,
  category text not null,
  memo text,
  source_account_code text not null,
  gross_total bigint not null check (gross_total>0),
  net_total bigint not null check (net_total>=0),
  input_tax_total bigint not null check (input_tax_total>=0),
  claim_input_vat boolean not null default false,
  supplier_tax_pin text,
  tax_invoice_number text,
  tax_invoice_date date,
  tax_profile_id uuid references public.company_tax_profiles(id) on delete restrict,
  tax_category_id uuid references public.tax_categories(id) on delete restrict,
  tax_rate_version_id uuid references public.tax_rate_versions(id) on delete restrict,
  tax_category_code text not null,
  tax_classification text not null,
  tax_rate_bps integer not null default 0,
  journal_entry_id uuid references public.ledger_journal_entries(id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index expense_documents_tax_invoice_idx
  on public.expense_documents(company_id,supplier_tax_pin,tax_invoice_number)
  where tax_invoice_number is not null;

alter table public.expense_documents enable row level security;
create policy "expense documents readable" on public.expense_documents for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.expense_documents to authenticated;
grant all on public.expense_documents to service_role;
create trigger expense_documents_audit after insert or update or delete on public.expense_documents
for each row execute function public.audit_trigger();

create or replace function public.resolve_category_inclusive_tax(
  p_company_id uuid,p_tax_category_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language plpgsql stable security definer set search_path='' as $$
declare
  v_timezone text;v_tax_date date;v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;v_rate public.tax_rate_versions%rowtype;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select business_timezone into v_timezone from public.companies where id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_tax_date:=(p_tax_point at time zone v_timezone)::date;
  select * into v_profile from public.company_tax_profiles where company_id=p_company_id
    and effective_from<=v_tax_date and (effective_to is null or effective_to>=v_tax_date)
  order by effective_from desc limit 1;
  if v_profile.id is null or not v_profile.vat_registered then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;return;
  end if;
  select * into v_category from public.tax_categories
  where id=coalesce(p_tax_category_id,v_profile.default_tax_category_id)
    and jurisdiction_id=v_profile.jurisdiction_id and active;
  if v_category.id is null then raise exception 'tax_category_not_configured'; end if;
  select * into v_rate from public.tax_rate_versions where tax_category_id=v_category.id
    and effective_from<=v_tax_date and (effective_to is null or effective_to>=v_tax_date)
  order by effective_from desc limit 1;
  if v_rate.id is null then raise exception 'tax_rate_not_configured: % on %',v_category.code,v_tax_date; end if;
  tax_profile_id:=v_profile.id;tax_category_id:=v_category.id;tax_rate_version_id:=v_rate.id;
  tax_category_code:=v_category.code;tax_classification:=v_category.classification;
  tax_rate_bps:=v_rate.rate_bps;gross_total:=p_gross;
  net_total:=round(p_gross::numeric*10000/(10000+v_rate.rate_bps))::bigint;
  tax_total:=p_gross-net_total;vat_registered:=true;return next;
end;
$$;

create or replace function public.post_expense_with_tax(
  p_amount bigint,p_source_account_code text,p_category text default 'other',
  p_memo text default null,p_expense_date date default current_date,
  p_claim_input_vat boolean default false,p_supplier_tax_pin text default null,
  p_tax_invoice_number text default null,p_tax_invoice_date date default null,
  p_tax_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_tax record;v_point timestamptz;
  v_id uuid;v_entry_id uuid;v_lines jsonb;v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CreateInterAccountTransfer') then
    raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_source_account_code);
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  v_point:=(coalesce(p_tax_invoice_date,p_expense_date,current_date)::timestamp at time zone v_timezone);
  if p_claim_input_vat and (btrim(coalesce(p_supplier_tax_pin,''))=''
      or btrim(coalesce(p_tax_invoice_number,''))='' or p_tax_invoice_date is null) then
    raise exception 'input_vat_evidence_required'; end if;
  select * into v_tax from public.resolve_category_inclusive_tax(
    v_company_id,p_tax_category_id,p_amount,v_point);
  if p_claim_input_vat and not v_tax.vat_registered then raise exception 'input_vat_requires_registration'; end if;
  if not p_claim_input_vat then
    v_tax.net_total:=p_amount;v_tax.tax_total:=0;v_tax.tax_rate_bps:=0;
    v_tax.tax_category_code:='NOT_CLAIMED';v_tax.tax_classification:='not_claimed';
    v_tax.tax_category_id:=null;v_tax.tax_rate_version_id:=null;
  end if;
  insert into public.expense_documents(company_id,expense_date,category,memo,source_account_code,
    gross_total,net_total,input_tax_total,claim_input_vat,supplier_tax_pin,tax_invoice_number,
    tax_invoice_date,tax_profile_id,tax_category_id,tax_rate_version_id,tax_category_code,
    tax_classification,tax_rate_bps,created_by)
  values(v_company_id,coalesce(p_expense_date,current_date),coalesce(nullif(btrim(p_category),''),'other'),
    nullif(btrim(coalesce(p_memo,'')),''),p_source_account_code,p_amount,v_tax.net_total,
    v_tax.tax_total,p_claim_input_vat,nullif(btrim(coalesce(p_supplier_tax_pin,'')),''),
    nullif(btrim(coalesce(p_tax_invoice_number,'')),''),p_tax_invoice_date,v_tax.tax_profile_id,
    v_tax.tax_category_id,v_tax.tax_rate_version_id,v_tax.tax_category_code,
    v_tax.tax_classification,v_tax.tax_rate_bps,auth.uid()) returning id into v_id;
  v_lines:=jsonb_build_array(jsonb_build_object('account_code','EXPENSES','debit',v_tax.net_total,
    'meta',jsonb_build_object('expenseDocumentId',v_id,'expenseCategory',p_category)));
  if v_tax.tax_total>0 then v_lines:=v_lines||jsonb_build_object('account_code','TAX_PAYABLE',
    'debit',v_tax.tax_total,'meta',jsonb_build_object('expenseDocumentId',v_id,'inputVat',true)); end if;
  v_lines:=v_lines||jsonb_build_object('account_code',p_source_account_code,'credit',p_amount,
    'meta',jsonb_build_object('expenseDocumentId',v_id));
  v_entry_id:=public.post_journal_entry(v_company_id,'Expense',v_id::text,
    coalesce(p_memo,'Expense ('||coalesce(p_category,'other')||')'),v_lines,
    coalesce(p_expense_date,current_date));
  update public.expense_documents set journal_entry_id=v_entry_id where id=v_id;
  return v_id;
end;
$$;

create or replace function public.record_purchase_complete_with_tax(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_claim_input_vat boolean default false,p_supplier_tax_pin text default null,
  p_tax_invoice_number text default null,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_purchase_id uuid;v_line record;v_expense record;
  v_tax record;v_point timestamptz;v_timezone text;v_goods_tax bigint:=0;v_expense_tax bigint:=0;
  v_goods_net bigint:=0;v_profile_id uuid;v_default_category uuid;v_unit_cost bigint;
  v_journal_lines jsonb:='[]'::jsonb;
begin
  if p_claim_input_vat and (btrim(coalesce(p_supplier_tax_pin,''))=''
      or btrim(coalesce(p_tax_invoice_number,''))='' or p_tax_invoice_date is null) then
    raise exception 'input_vat_evidence_required'; end if;
  v_purchase_id:=public.record_purchase_complete(p_supplier_id,p_lines,p_expenses,p_payment_amount,
    p_reference,p_account_code,p_notes,p_purchase_date,p_stock_location_id);
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  v_point:=(coalesce(p_tax_invoice_date,p_purchase_date,current_date)::timestamp at time zone v_timezone);
  select default_tax_category_id into v_default_category from public.company_tax_profiles
    where company_id=v_company_id and effective_from<=coalesce(p_tax_invoice_date,p_purchase_date,current_date)
      and (effective_to is null or effective_to>=coalesce(p_tax_invoice_date,p_purchase_date,current_date))
    order by effective_from desc limit 1;
  for v_line in select pl.*,v.product_id,b.remaining,b.quantity batch_quantity
    from public.purchase_lines pl join public.product_variants v on v.id=pl.variant_id
    left join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase_id
  loop
    select * into v_tax from public.resolve_inclusive_tax(v_company_id,v_line.product_id,v_line.line_total,v_point);
    if p_claim_input_vat and not v_tax.vat_registered then raise exception 'input_vat_requires_registration'; end if;
    if not p_claim_input_vat then
      v_tax.net_total:=v_line.line_total;v_tax.tax_total:=0;v_tax.tax_rate_bps:=0;
      v_tax.tax_category_code:='NOT_CLAIMED';v_tax.tax_classification:='not_claimed';
      v_tax.tax_category_id:=null;v_tax.tax_rate_version_id:=null;
    end if;
    v_profile_id:=coalesce(v_profile_id,v_tax.tax_profile_id);
    v_goods_net:=v_goods_net+v_tax.net_total;v_goods_tax:=v_goods_tax+v_tax.tax_total;
    update public.purchase_lines set tax_category_id=v_tax.tax_category_id,
      tax_rate_version_id=v_tax.tax_rate_version_id,tax_category_code=v_tax.tax_category_code,
      tax_classification=v_tax.tax_classification,tax_rate_bps=v_tax.tax_rate_bps,
      gross_total=v_line.line_total,net_total=v_tax.net_total,tax_total=v_tax.tax_total
    where id=v_line.id;
    if v_line.inventory_batch_id is not null then
      v_unit_cost:=round(v_tax.net_total/v_line.quantity);
      update public.inventory_batches set unit_cost=v_unit_cost,original_cost=v_tax.net_total,
        remaining_cost=round(v_tax.net_total*(remaining/nullif(quantity,0)))
      where id=v_line.inventory_batch_id;
      update public.inventory_movements set unit_cost=v_unit_cost,total_cost=v_tax.net_total,
        meta=meta||jsonb_build_object('grossCost',v_line.line_total,'inputVat',v_tax.tax_total)
      where company_id=v_company_id and source_type='InventoryPurchase'
        and source_id=v_purchase_id::text and batch_id=v_line.inventory_batch_id;
    end if;
  end loop;
  for v_expense in select * from public.purchase_expenses
    where purchase_id=v_purchase_id order by created_at,id
  loop
    if p_claim_input_vat and v_expense.settlement='supplier_bill' then
      select * into v_tax from public.resolve_category_inclusive_tax(
        v_company_id,v_default_category,v_expense.amount,v_point);
    else
      select null::uuid tax_profile_id,null::uuid tax_category_id,null::uuid tax_rate_version_id,
        'NOT_CLAIMED'::text tax_category_code,'not_claimed'::text tax_classification,
        0::integer tax_rate_bps,v_expense.amount::bigint gross_total,v_expense.amount::bigint net_total,
        0::bigint tax_total,false vat_registered into v_tax;
    end if;
    if v_expense.settlement='supplier_bill' then v_expense_tax:=v_expense_tax+v_tax.tax_total; end if;
    update public.purchase_expenses set tax_category_id=v_tax.tax_category_id,
      tax_rate_version_id=v_tax.tax_rate_version_id,tax_category_code=v_tax.tax_category_code,
      tax_classification=v_tax.tax_classification,tax_rate_bps=v_tax.tax_rate_bps,
      gross_total=v_expense.amount,net_total=v_tax.net_total,tax_total=v_tax.tax_total
    where id=v_expense.id;
  end loop;
  update public.purchases set gross_total=total_cost,net_total=total_cost-v_goods_tax-v_expense_tax,
    goods_net_total=v_goods_net,input_tax_total=v_goods_tax+v_expense_tax,
    claim_input_vat=p_claim_input_vat,supplier_tax_pin=case when p_claim_input_vat
      then btrim(p_supplier_tax_pin) end,tax_invoice_number=case when p_claim_input_vat
      then btrim(p_tax_invoice_number) end,tax_invoice_date=case when p_claim_input_vat
      then p_tax_invoice_date end,tax_profile_id=v_profile_id,tax_snapshot_status='final'
  where id=v_purchase_id;
  if v_goods_tax+v_expense_tax>0 then
    v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','TAX_PAYABLE',
      'debit',v_goods_tax+v_expense_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id,'inputVat',true));
    if v_goods_tax>0 then v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','INVENTORY',
      'credit',v_goods_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id)); end if;
    if v_expense_tax>0 then v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','EXPENSES',
      'credit',v_expense_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id)); end if;
    perform public.post_journal_entry(v_company_id,'PurchaseVatReclass',v_purchase_id::text,
      'Input VAT extracted from purchase '||coalesce(p_reference,v_purchase_id::text),v_journal_lines,
      coalesce(p_purchase_date,current_date));
  end if;
  return v_purchase_id;
end;
$$;

create or replace function public.reverse_purchase_vat_on_status_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_goods_tax bigint;v_expense_tax bigint;v_lines jsonb:='[]'::jsonb;
begin
  if old.status='posted' and new.status<>'posted' and old.input_tax_total>0 then
    select coalesce(sum(tax_total),0) into v_goods_tax from public.purchase_lines where purchase_id=new.id;
    select coalesce(sum(tax_total),0) into v_expense_tax from public.purchase_expenses
      where purchase_id=new.id and settlement='supplier_bill';
    if v_goods_tax>0 then v_lines:=v_lines||jsonb_build_object('account_code','INVENTORY','debit',v_goods_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    if v_expense_tax>0 then v_lines:=v_lines||jsonb_build_object('account_code','EXPENSES','debit',v_expense_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    v_lines:=v_lines||jsonb_build_object('account_code','TAX_PAYABLE','credit',old.input_tax_total,
      'meta',jsonb_build_object('purchaseId',new.id,'inputVatReversal',true));
    perform public.post_journal_entry(new.company_id,'PurchaseVatReversal',new.id::text,
      'Input VAT reversal for purchase '||coalesce(new.reference,new.id::text),v_lines);
  end if;return new;
end;
$$;
create trigger purchases_reverse_vat after update of status on public.purchases
for each row execute function public.reverse_purchase_vat_on_status_change();

-- ---------------------------------------------------------------------------
-- Full-sale credit notes and optional stock return
-- ---------------------------------------------------------------------------
alter table public.refunds
  add column stock_outcome text not null default 'write_off'
    check (stock_outcome in ('return_to_stock','write_off')),
  add column gross_total bigint not null default 0 check (gross_total>=0),
  add column net_total bigint not null default 0 check (net_total>=0),
  add column tax_total bigint not null default 0 check (tax_total>=0),
  add column tax_document_id uuid references public.tax_documents(id) on delete restrict,
  add column original_tax_document_id uuid references public.tax_documents(id) on delete restrict;
update public.refunds set gross_total=amount,net_total=amount,tax_total=0;

create or replace function public.snapshot_refund_tax()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_order public.orders%rowtype;v_outcome text;v_document_id uuid;v_number text;
begin
  select * into v_order from public.orders where id=new.order_id and company_id=new.company_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  v_outcome:=nullif(current_setting('app.refund_stock_outcome',true),'');
  if v_outcome is null then
    select a.metadata->>'stock_outcome' into v_outcome from public.approvals a
    where a.company_id=new.company_id and a.type='sale_refund' and a.status='pending'
      and a.subject_id=new.order_id and (a.metadata->>'amount')::bigint=new.amount
    order by a.created_at desc limit 1;
  end if;
  new.stock_outcome:=coalesce(v_outcome,'write_off');
  if new.amount=v_order.gross_total then
    new.gross_total:=v_order.gross_total;new.net_total:=v_order.net_total;new.tax_total:=v_order.tax_total;
  else
    new.gross_total:=new.amount;
    new.tax_total:=round(v_order.tax_total::numeric*new.amount/nullif(v_order.gross_total,0))::bigint;
    new.net_total:=new.amount-new.tax_total;
  end if;
  new.original_tax_document_id:=v_order.tax_document_id;
  if v_order.tax_document_id is not null then
    v_number:=public.next_tax_document_number(new.company_id,'credit_note',now());
    insert into public.tax_documents(company_id,document_kind,document_number,source_order_id,
      original_document_id,tax_profile_id,tax_point_at,gross_total,net_total,tax_total,created_by)
    values(new.company_id,'credit_note',v_number,new.order_id,v_order.tax_document_id,
      v_order.tax_profile_id,now(),new.gross_total,new.net_total,new.tax_total,coalesce(new.created_by,auth.uid()))
    returning id into v_document_id;
    insert into public.tax_document_lines(company_id,tax_document_id,source_order_line_id,variant_id,
      description,quantity,tax_category_id,tax_rate_version_id,tax_category_code,
      tax_classification,tax_rate_bps,gross_total,net_total,tax_total)
    select l.company_id,v_document_id,l.id,l.variant_id,d.description,l.quantity,l.tax_category_id,
      l.tax_rate_version_id,l.tax_category_code,l.tax_classification,l.tax_rate_bps,
      l.gross_total,l.net_total,l.tax_total from public.order_lines l
    join public.tax_document_lines d on d.source_order_line_id=l.id
      and d.tax_document_id=v_order.tax_document_id where l.order_id=new.order_id;
    new.tax_document_id:=v_document_id;
  end if;
  return new;
end;
$$;
create trigger refunds_snapshot_tax before insert on public.refunds
for each row execute function public.snapshot_refund_tax();

create or replace function public.post_refund_tax_and_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_movement record;v_cogs bigint:=0;
begin
  if new.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatRefundReclass',new.id::text,
      'VAT credit note for sale refund',jsonb_build_array(
        jsonb_build_object('account_code','TAX_PAYABLE','debit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','SALES_RETURNS','credit',new.tax_total,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id,'taxDocumentId',new.tax_document_id))));
  end if;
  if new.stock_outcome='return_to_stock' then
    for v_movement in select * from public.inventory_movements where company_id=new.company_id
      and source_type='Sale' and source_id=new.order_id::text and quantity<0
    loop
      update public.inventory_batches set remaining=remaining+abs(v_movement.quantity),
        remaining_cost=remaining_cost+coalesce(v_movement.total_cost,0) where id=v_movement.batch_id;
      insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
        quantity,unit_cost,total_cost,source_type,source_id,meta)
      values(new.company_id,v_movement.variant_id,v_movement.batch_id,v_movement.stock_location_id,
        'reversal',abs(v_movement.quantity),v_movement.unit_cost,v_movement.total_cost,
        'RefundRestock',new.id::text,jsonb_build_object('orderId',new.order_id,'refundId',new.id));
      v_cogs:=v_cogs+coalesce(v_movement.total_cost,0);
    end loop;
    if v_cogs>0 then perform public.post_journal_entry(new.company_id,'RefundRestock',new.id::text,
      'Stock returned from refunded sale',jsonb_build_array(
        jsonb_build_object('account_code','INVENTORY','debit',v_cogs,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id)),
        jsonb_build_object('account_code','COGS','credit',v_cogs,'order_id',new.order_id,
          'meta',jsonb_build_object('refundId',new.id)))); end if;
  end if;
  return new;
end;
$$;
create trigger refunds_post_tax_inventory after insert on public.refunds
for each row execute function public.post_refund_tax_and_inventory();

create or replace function public.post_full_refund(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_collected bigint;v_refunded bigint;v_resource_id uuid;v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then raise exception 'stock_outcome_required'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  select * into v_order from public.orders where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then raise exception 'invalid_order_state: only completed sales can be refunded'; end if;
  select coalesce(sum(amount),0)::bigint into v_collected from public.payments
    where company_id=v_company_id and order_id=p_order_id and status='settled';
  select coalesce(sum(amount),0)::bigint into v_refunded from public.refunds
    where company_id=v_company_id and order_id=p_order_id;
  if v_refunded>0 then raise exception 'sale_already_refunded'; end if;
  if v_collected<v_order.total then raise exception 'full_refund_requires_fully_collected_sale'; end if;
  if not exists(select 1 from public.payment_methods where company_id=v_company_id
      and code=p_method_code and enabled) then raise exception 'payment_method_not_found: %',p_method_code; end if;
  if public.current_user_has_permission('ReverseOrder') then
    perform set_config('app.refund_stock_outcome',p_stock_outcome,true);
    v_resource_id:=public.execute_refund(p_order_id,v_order.total,p_method_code,btrim(p_reason));
    return jsonb_build_object('status','completed','resource_id',v_resource_id,'subject_id',p_order_id);
  end if;
  v_approval_id:=public.request_sale_approval(v_company_id,'sale_refund','order',p_order_id,
    jsonb_build_object('order_id',p_order_id,'amount',v_order.total,'method_code',p_method_code,
      'reason',btrim(p_reason),'stock_outcome',p_stock_outcome,'full_refund',true));
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,'subject_id',p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Offline devices and closed-period late-sale review
-- ---------------------------------------------------------------------------
create table public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  device_key text not null,
  location_id uuid references public.stock_locations(id) on delete set null,
  user_id uuid,
  pending_count integer not null default 0 check (pending_count>=0),
  last_seen_at timestamptz not null default now(),
  last_synced_at timestamptz,
  retired_at timestamptz,
  retired_by uuid,
  retirement_reason text,
  unique(company_id,device_key)
);

create table public.late_sale_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  location_id uuid not null references public.stock_locations(id) on delete restrict,
  client_ref text not null,
  occurred_at timestamptz not null,
  original_period_id uuid references public.accounting_periods(id) on delete restrict,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  posted_order_id uuid references public.orders(id) on delete restrict,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  unique(company_id,client_ref)
);

alter table public.pos_devices enable row level security;
alter table public.late_sale_reviews enable row level security;
create policy "pos devices readable" on public.pos_devices for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "late sales readable" on public.late_sale_reviews for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.pos_devices,public.late_sale_reviews to authenticated;
grant all on public.pos_devices,public.late_sale_reviews to service_role;
create trigger pos_devices_audit after insert or update or delete on public.pos_devices
for each row execute function public.audit_trigger();
create trigger late_sale_reviews_audit after insert or update or delete on public.late_sale_reviews
for each row execute function public.audit_trigger();

create or replace function public.pos_device_heartbeat(
  p_device_key text,p_location_id uuid,p_pending_count integer,p_synced boolean default false
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_device_key,''))='' or p_pending_count<0 then raise exception 'invalid_device_status'; end if;
  if not public.current_user_can_access_location(p_location_id) then raise exception 'location_access_denied'; end if;
  insert into public.pos_devices(company_id,device_key,location_id,user_id,pending_count,last_seen_at,last_synced_at)
  values(v_company_id,btrim(p_device_key),p_location_id,auth.uid(),p_pending_count,now(),
    case when p_synced then now() end)
  on conflict(company_id,device_key) do update set location_id=excluded.location_id,user_id=excluded.user_id,
    pending_count=excluded.pending_count,last_seen_at=now(),last_synced_at=case when p_synced
      then now() else public.pos_devices.last_synced_at end,retired_at=null,retired_by=null,retirement_reason=null
  returning id into v_id;return v_id;
end;
$$;

create or replace function public.apply_requested_sale_tax_point()
returns trigger language plpgsql set search_path='' as $$
declare v_requested text;
begin
  if old.status<>'completed' and new.status='completed' then
    v_requested:=nullif(current_setting('app.sale_tax_point',true),'');
    if v_requested is not null then new.completed_at:=v_requested::timestamptz; end if;
  end if;return new;
end;
$$;
create trigger orders_00_apply_requested_tax_point before update of status on public.orders
for each row execute function public.apply_requested_sale_tax_point();

create or replace function public.post_order_vat_reclassification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_entry_date date;v_timezone text;
begin
  if old.status<>'completed' and new.status='completed' and new.tax_total>0 then
    select business_timezone into v_timezone from public.companies where id=new.company_id;
    v_entry_date:=case when current_setting('app.late_sale_posting',true)='on'
      then (now() at time zone v_timezone)::date else (new.tax_point_at at time zone v_timezone)::date end;
    perform public.post_journal_entry(new.company_id,'VatSaleReclass',new.id::text,
      'VAT extracted from inclusive sale '||new.code,jsonb_build_array(
        jsonb_build_object('account_code','SALES','debit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','TAX_PAYABLE','credit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id))),v_entry_date);
  elsif old.status='completed' and new.status='voided' and old.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatSaleVoid',new.id::text,
      'VAT reversal for voided sale '||new.code,jsonb_build_array(
        jsonb_build_object('account_code','TAX_PAYABLE','debit',old.tax_total,'order_id',new.id),
        jsonb_build_object('account_code','SALES','credit',old.tax_total,'order_id',new.id)));
  end if;return new;
end;
$$;

create or replace function public.post_offline_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_payments jsonb,p_client_ref text,
  p_occurred_at timestamptz,p_device_key text,p_pending_count integer default 1,
  p_draft_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_lock_end date;v_timezone text;v_tax_date date;
  v_review_id uuid;v_device_id uuid;v_period_id uuid;v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_occurred_at is null or btrim(coalesce(p_client_ref,''))='' then raise exception 'invalid_offline_sale'; end if;
  v_device_id:=public.pos_device_heartbeat(p_device_key,p_location_id,greatest(p_pending_count,1),false);
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  v_tax_date:=(p_occurred_at at time zone v_timezone)::date;
  select lock_end_date into v_lock_end from public.period_locks where company_id=v_company_id;
  if v_lock_end is not null and v_tax_date<=v_lock_end then
    select id into v_period_id from public.accounting_periods where company_id=v_company_id
      and status='closed' and v_tax_date between start_date and end_date order by end_date desc limit 1;
    insert into public.late_sale_reviews(company_id,device_id,location_id,client_ref,occurred_at,
      original_period_id,payload)
    values(v_company_id,v_device_id,p_location_id,p_client_ref,p_occurred_at,v_period_id,
      jsonb_build_object('customer_id',p_customer_id,'lines',p_lines,'payments',p_payments,
        'draft_id',p_draft_id))
    on conflict(company_id,client_ref) do update set device_id=excluded.device_id
    returning id into v_review_id;
    return jsonb_build_object('status','late_review_required','review_id',v_review_id,
      'subject_id',v_review_id);
  end if;
  perform set_config('app.sale_tax_point',p_occurred_at::text,true);
  v_result:=public.post_sale_at_location(p_location_id,p_customer_id,p_lines,p_payments,false,
    p_client_ref,p_draft_id,null);
  perform public.pos_device_heartbeat(p_device_key,p_location_id,greatest(p_pending_count-1,0),true);
  return v_result;
end;
$$;

create or replace function public.review_late_sale(
  p_review_id uuid,p_approve boolean,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_review public.late_sale_reviews%rowtype;v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageApprovals')
    or not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ManageApprovals and SettleOrder required'; end if;
  select * into v_review from public.late_sale_reviews where id=p_review_id
    and company_id=v_company_id for update;
  if v_review.id is null then raise exception 'late_sale_not_found'; end if;
  if v_review.status<>'pending' then raise exception 'late_sale_already_reviewed'; end if;
  if not p_approve then
    if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
    update public.late_sale_reviews set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),
      review_reason=btrim(p_reason) where id=p_review_id;
    return jsonb_build_object('status','rejected','review_id',p_review_id);
  end if;
  perform set_config('app.sale_tax_point',v_review.occurred_at::text,true);
  perform set_config('app.late_sale_posting','on',true);
  v_result:=public.post_sale_at_location(v_review.location_id,
    nullif(v_review.payload->>'customer_id','')::uuid,v_review.payload->'lines',
    v_review.payload->'payments',false,v_review.client_ref,
    nullif(v_review.payload->>'draft_id','')::uuid,null);
  update public.late_sale_reviews set status='approved',posted_order_id=(v_result->>'order_id')::uuid,
    reviewed_by=auth.uid(),reviewed_at=now(),review_reason=nullif(btrim(coalesce(p_reason,'')),'')
  where id=p_review_id;
  return v_result||jsonb_build_object('late_review_id',p_review_id,'status','completed');
end;
$$;

create or replace function public.retire_pos_device(p_device_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  update public.pos_devices set retired_at=now(),retired_by=auth.uid(),retirement_reason=btrim(p_reason),
    pending_count=0 where id=p_device_id and company_id=v_company_id;
  if not found then raise exception 'device_not_found'; end if;return p_device_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily preparation, rolling monthly periods, VAT reports, closing packs
-- ---------------------------------------------------------------------------
alter table public.accounting_periods
  add column closed_at timestamptz,
  add column closed_by uuid;
update public.accounting_periods set closed_at=coalesce(closed_at,created_at),closed_by=created_by
where status='closed';
create unique index accounting_periods_one_open_idx
  on public.accounting_periods(company_id) where status='open';

insert into public.accounting_periods(company_id,start_date,end_date,status)
select c.id,coalesce(l.lock_end_date+1,date_trunc('month',current_date)::date),
  (date_trunc('month',coalesce(l.lock_end_date+1,current_date))+interval '1 month - 1 day')::date,'open'
from public.companies c left join public.period_locks l on l.company_id=c.id
where not exists(select 1 from public.accounting_periods p where p.company_id=c.id and p.status='open');

create table public.daily_business_closes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  business_date date not null,
  status text not null default 'signed_off' check (status in ('signed_off','invalidated')),
  summary jsonb not null,
  signed_off_by uuid not null,
  signed_off_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text,
  unique(company_id,business_date)
);

create table public.period_closing_packs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  accounting_period_id uuid not null unique references public.accounting_periods(id) on delete restrict,
  snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.daily_business_closes enable row level security;
alter table public.period_closing_packs enable row level security;
create policy "daily closes readable" on public.daily_business_closes for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "closing packs readable" on public.period_closing_packs for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.daily_business_closes,public.period_closing_packs to authenticated;
grant all on public.daily_business_closes,public.period_closing_packs to service_role;
create trigger daily_business_closes_audit after insert or update or delete on public.daily_business_closes
for each row execute function public.audit_trigger();
create trigger period_closing_packs_audit after insert or update or delete on public.period_closing_packs
for each row execute function public.audit_trigger();

create or replace function public.invalidate_daily_close_on_journal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.daily_business_closes set status='invalidated',invalidated_at=now(),
    invalidation_reason='A new finalized journal entry posted for this business date'
  where company_id=new.company_id and business_date=new.entry_date and status='signed_off';
  return new;
end;
$$;
create trigger ledger_invalidates_daily_close after insert on public.ledger_journal_entries
for each row execute function public.invalidate_daily_close_on_journal();

create or replace function public.daily_close_status(p_business_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object('business_date',p_business_date,
    'sales',jsonb_build_object('count',count(distinct o.id),'gross',coalesce(sum(o.gross_total),0),
      'net',coalesce(sum(o.net_total),0),'vat',coalesce(sum(o.tax_total),0)),
    'payments',coalesce((select jsonb_agg(x order by x->>'method') from (
      select jsonb_build_object('method',p.method_code,'amount',sum(p.amount)) x
      from public.payments p join public.orders po on po.id=p.order_id
      where p.company_id=v_company_id and p.status='settled'
        and (po.completed_at at time zone c.business_timezone)::date=p_business_date group by p.method_code) q),'[]'::jsonb),
    'open_sessions',(select count(*) from public.cashier_sessions s where s.company_id=v_company_id and s.status='open'),
    'pending_offline',(select coalesce(sum(d.pending_count),0) from public.pos_devices d
      where d.company_id=v_company_id and d.retired_at is null),
    'pending_late_sales',(select count(*) from public.late_sale_reviews l
      where l.company_id=v_company_id and l.status='pending'),
    'signoff',(select to_jsonb(dc) from public.daily_business_closes dc
      where dc.company_id=v_company_id and dc.business_date=p_business_date)) into v_result
  from public.companies c left join public.orders o on o.company_id=c.id and o.status='completed'
    and (o.completed_at at time zone c.business_timezone)::date=p_business_date
  where c.id=v_company_id group by c.id,c.business_timezone;
  return v_result;
end;
$$;

create or replace function public.sign_off_business_day(p_business_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_summary jsonb;v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ManageReconciliation or CloseAccountingPeriod required'; end if;
  if p_business_date>current_date then raise exception 'invalid_business_date'; end if;
  if exists(select 1 from public.cashier_sessions where company_id=v_company_id and status='open') then
    raise exception 'open_sessions_exist'; end if;
  if exists(select 1 from public.pos_devices where company_id=v_company_id and retired_at is null
      and pending_count>0) then raise exception 'offline_sales_pending'; end if;
  if exists(select 1 from public.late_sale_reviews where company_id=v_company_id and status='pending') then
    raise exception 'late_sales_pending'; end if;
  v_summary:=public.daily_close_status(p_business_date);
  insert into public.daily_business_closes(company_id,business_date,status,summary,signed_off_by,
    signed_off_at,invalidated_at,invalidation_reason)
  values(v_company_id,p_business_date,'signed_off',v_summary,auth.uid(),now(),null,null)
  on conflict(company_id,business_date) do update set status='signed_off',summary=excluded.summary,
    signed_off_by=excluded.signed_off_by,signed_off_at=now(),invalidated_at=null,invalidation_reason=null
  returning id into v_id;return v_id;
end;
$$;

create or replace function public.vat_report(p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  return jsonb_build_object('start_date',p_start_date,'end_date',p_end_date,
    'sales',jsonb_build_object(
      'gross',coalesce((select sum(gross_total) from public.orders where company_id=v_company_id
        and status='completed' and (tax_point_at at time zone v_timezone)::date between p_start_date and p_end_date),0),
      'net',coalesce((select sum(net_total) from public.orders where company_id=v_company_id
        and status='completed' and (tax_point_at at time zone v_timezone)::date between p_start_date and p_end_date),0),
      'output_vat',coalesce((select sum(tax_total) from public.orders where company_id=v_company_id
        and status='completed' and (tax_point_at at time zone v_timezone)::date between p_start_date and p_end_date),0)),
    'by_category',coalesce((select jsonb_agg(x order by x->>'code') from (
      select jsonb_build_object('code',l.tax_category_code,'classification',l.tax_classification,
        'rate_bps',l.tax_rate_bps,'gross',sum(l.gross_total),'net',sum(l.net_total),'tax',sum(l.tax_total)) x
      from public.order_lines l join public.orders o on o.id=l.order_id where o.company_id=v_company_id
        and o.status='completed' and (o.tax_point_at at time zone v_timezone)::date between p_start_date and p_end_date
      group by l.tax_category_code,l.tax_classification,l.tax_rate_bps) q),'[]'::jsonb),
    'input_vat',coalesce((select sum(input_tax_total) from public.purchases where company_id=v_company_id
      and status='posted' and purchase_date between p_start_date and p_end_date),0)
      +coalesce((select sum(input_tax_total) from public.expense_documents where company_id=v_company_id
        and expense_date between p_start_date and p_end_date),0),
    'credit_note_vat',coalesce((select sum(tax_total) from public.refunds where company_id=v_company_id
      and (created_at at time zone v_timezone)::date between p_start_date and p_end_date),0),
    'late_transactions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'occurred_at',occurred_at,
      'posted_order_id',posted_order_id,'status',status) order by occurred_at) from public.late_sale_reviews
      where company_id=v_company_id and (occurred_at at time zone v_timezone)::date between p_start_date and p_end_date),'[]'::jsonb),
    'net_vat_payable',
      coalesce((select sum(tax_total) from public.orders where company_id=v_company_id and status='completed'
        and (tax_point_at at time zone v_timezone)::date between p_start_date and p_end_date),0)
      -coalesce((select sum(tax_total) from public.refunds where company_id=v_company_id
        and (created_at at time zone v_timezone)::date between p_start_date and p_end_date),0)
      -coalesce((select sum(input_tax_total) from public.purchases where company_id=v_company_id
        and status='posted' and purchase_date between p_start_date and p_end_date),0)
      -coalesce((select sum(input_tax_total) from public.expense_documents where company_id=v_company_id
        and expense_date between p_start_date and p_end_date),0));
end;
$$;

create or replace function public.period_close_readiness(p_end_date date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_period public.accounting_periods%rowtype;v_end date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  select * into v_period from public.accounting_periods where company_id=v_company_id and status='open';
  if v_period.id is null then raise exception 'open_period_not_found'; end if;
  v_end:=coalesce(p_end_date,v_period.end_date);
  if v_end<v_period.start_date or v_end>v_period.end_date or v_end>current_date then
    raise exception 'invalid_period_end'; end if;
  return jsonb_build_object('period_id',v_period.id,'start_date',v_period.start_date,'end_date',v_end,
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'open_sessions',(select nullif(count(*),0) from public.cashier_sessions where company_id=v_company_id and status='open'),
      'pending_offline',(select nullif(coalesce(sum(pending_count),0),0) from public.pos_devices
        where company_id=v_company_id and retired_at is null),
      'stale_devices',(select nullif(count(*),0) from public.pos_devices where company_id=v_company_id
        and retired_at is null and last_seen_at<now()-interval '24 hours'),
      'pending_late_sales',(select nullif(count(*),0) from public.late_sale_reviews
        where company_id=v_company_id and status='pending'),
      'unsigned_active_days',(select nullif(count(*),0) from (select distinct e.entry_date
        from public.ledger_journal_entries e where e.company_id=v_company_id and e.finalized_at is not null
          and e.entry_date between v_period.start_date and v_end except select d.business_date
        from public.daily_business_closes d where d.company_id=v_company_id and d.status='signed_off') q))),
    'warnings',jsonb_build_object('unposted_purchase_drafts',(select count(*) from public.purchase_drafts
      where company_id=v_company_id and status='draft')),
    'vat',public.vat_report(v_period.start_date,v_end));
end;
$$;

create or replace function public.build_period_closing_pack(
  p_period_id uuid,p_start_date date,p_end_date date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  return jsonb_build_object('period_id',p_period_id,'start_date',p_start_date,'end_date',p_end_date,
    'trial_balance',coalesce((select jsonb_agg(jsonb_build_object('code',a.code,'name',a.name,
      'type',a.type,'debit',x.debit,'credit',x.credit,'balance',x.debit-x.credit) order by a.code)
      from (select l.account_id,sum(l.debit)::bigint debit,sum(l.credit)::bigint credit
        from public.ledger_journal_lines l join public.ledger_journal_entries e on e.id=l.entry_id
        where l.company_id=v_company_id and e.finalized_at is not null and e.entry_date<=p_end_date
        group by l.account_id) x join public.ledger_accounts a on a.id=x.account_id),'[]'::jsonb),
    'profit_and_loss',jsonb_build_object(
      'income',coalesce((select sum(l.credit-l.debit) from public.ledger_journal_lines l
        join public.ledger_journal_entries e on e.id=l.entry_id join public.ledger_accounts a on a.id=l.account_id
        where l.company_id=v_company_id and e.entry_date between p_start_date and p_end_date and a.type='income'),0),
      'expenses',coalesce((select sum(l.debit-l.credit) from public.ledger_journal_lines l
        join public.ledger_journal_entries e on e.id=l.entry_id join public.ledger_accounts a on a.id=l.account_id
        where l.company_id=v_company_id and e.entry_date between p_start_date and p_end_date and a.type='expense'),0)),
    'balance_summary',coalesce((select jsonb_object_agg(type,balance) from (select a.type,
      sum(case when a.type in ('asset','expense') then l.debit-l.credit else l.credit-l.debit end)::bigint balance
      from public.ledger_journal_lines l join public.ledger_journal_entries e on e.id=l.entry_id
      join public.ledger_accounts a on a.id=l.account_id where l.company_id=v_company_id
        and e.entry_date<=p_end_date group by a.type) b),'{}'::jsonb),
    'receivables',coalesce((select sum(l.debit-l.credit) from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id join public.ledger_journal_entries e on e.id=l.entry_id
      where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE' and e.entry_date<=p_end_date),0),
    'payables',coalesce((select sum(l.credit-l.debit) from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id join public.ledger_journal_entries e on e.id=l.entry_id
      where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE' and e.entry_date<=p_end_date),0),
    'inventory',jsonb_build_object('quantity',coalesce((select sum(remaining) from public.inventory_batches
      where company_id=v_company_id),0),'value',coalesce((select sum(remaining_cost) from public.inventory_batches
      where company_id=v_company_id),0)),
    'vat',public.vat_report(p_start_date,p_end_date),
    'reconciliations',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reconciliations r
      where r.company_id=v_company_id and (r.created_at at time zone 'Africa/Nairobi')::date
        between p_start_date and p_end_date),'[]'::jsonb),
    'daily_closes',coalesce((select jsonb_agg(to_jsonb(d) order by d.business_date) from public.daily_business_closes d
      where d.company_id=v_company_id and d.business_date between p_start_date and p_end_date),'[]'::jsonb));
end;
$$;

alter function public.close_accounting_period(date) rename to close_accounting_period_legacy;
revoke execute on function public.close_accounting_period_legacy(date) from public,anon,authenticated;

create or replace function public.close_accounting_period(p_end_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_period public.accounting_periods%rowtype;
  v_readiness jsonb;v_period_id uuid;v_pack jsonb;v_next_start date;v_next_end date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,0));
  select * into v_period from public.accounting_periods where company_id=v_company_id and status='open' for update;
  if v_period.id is null then raise exception 'open_period_not_found'; end if;
  v_readiness:=public.period_close_readiness(p_end_date);
  if coalesce(jsonb_object_length(v_readiness->'blockers'),0)>0 then
    raise exception 'period_not_ready: %',v_readiness->'blockers'; end if;
  delete from public.accounting_periods where id=v_period.id;
  v_period_id:=public.close_accounting_period_legacy(p_end_date);
  update public.accounting_periods set closed_at=now(),closed_by=auth.uid() where id=v_period_id;
  v_pack:=public.build_period_closing_pack(v_period_id,v_period.start_date,p_end_date);
  insert into public.period_closing_packs(company_id,accounting_period_id,snapshot,created_by)
  values(v_company_id,v_period_id,v_pack,auth.uid());
  v_next_start:=p_end_date+1;
  v_next_end:=(date_trunc('month',v_next_start)+interval '1 month - 1 day')::date;
  insert into public.accounting_periods(company_id,start_date,end_date,status,created_by)
  values(v_company_id,v_next_start,v_next_end,'open',auth.uid());
  return v_period_id;
end;
$$;

create or replace function public.closed_period_pack(p_period_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select p.snapshot from public.period_closing_packs p where p.accounting_period_id=p_period_id
    and p.company_id=public.current_company_id()
$$;

grant execute on function public.post_expense_with_tax(bigint,text,text,text,date,boolean,text,text,date,uuid),
  public.record_purchase_complete_with_tax(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid,boolean,text,text,date),
  public.post_full_refund(uuid,text,text,text),public.pos_device_heartbeat(text,uuid,integer,boolean),
  public.post_offline_sale_at_location(uuid,uuid,jsonb,jsonb,text,timestamptz,text,integer,uuid),
  public.review_late_sale(uuid,boolean,text),public.retire_pos_device(uuid,text),
  public.daily_close_status(date),public.sign_off_business_day(date),public.vat_report(date,date),
  public.period_close_readiness(date),public.closed_period_pack(uuid) to authenticated;
grant execute on function public.resolve_category_inclusive_tax(uuid,uuid,bigint,timestamptz),
  public.build_period_closing_pack(uuid,date,date),public.close_accounting_period_legacy(date) to service_role;
revoke execute on function public.resolve_category_inclusive_tax(uuid,uuid,bigint,timestamptz),
  public.build_period_closing_pack(uuid,date,date) from public,anon,authenticated;
