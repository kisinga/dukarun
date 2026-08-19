-- VAT transaction hardening: one authoritative tax point on input documents,
-- immutable finalized input snapshots, consistent offline journal dates, full
-- credit notes for credit sales, and strict device/idempotency handling.

alter table public.purchases
  add column tax_point_at timestamptz;

alter table public.expense_documents
  add column tax_point_at timestamptz;

update public.purchases p
set tax_point_at=(coalesce(p.tax_invoice_date,p.purchase_date)::timestamp
  at time zone coalesce(
    (select cp.business_timezone from public.company_tax_profiles cp where cp.id=p.tax_profile_id),
    (select c.business_timezone from public.companies c where c.id=p.company_id)
  ))
where p.tax_point_at is null;

update public.expense_documents d
set tax_point_at=(coalesce(d.tax_invoice_date,d.expense_date)::timestamp
  at time zone coalesce(
    (select cp.business_timezone from public.company_tax_profiles cp where cp.id=d.tax_profile_id),
    (select c.business_timezone from public.companies c where c.id=d.company_id)
  ))
where d.tax_point_at is null;

create or replace function public.prevent_final_purchase_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.tax_snapshot_status='final' then raise exception 'final_tax_snapshot_immutable'; end if;
    return old;
  end if;
  if old.tax_snapshot_status='final' and (
    new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.goods_net_total is distinct from old.goods_net_total
    or new.input_tax_total is distinct from old.input_tax_total
    or new.claim_input_vat is distinct from old.claim_input_vat
    or new.supplier_tax_pin is distinct from old.supplier_tax_pin
    or new.tax_invoice_number is distinct from old.tax_invoice_number
    or new.tax_invoice_date is distinct from old.tax_invoice_date
    or new.tax_point_at is distinct from old.tax_point_at
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_snapshot_status is distinct from old.tax_snapshot_status
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

create or replace function public.prevent_final_purchase_line_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.purchases p where p.id=old.purchase_id
    and p.tax_snapshot_status='final') and (
      tg_op='DELETE'
      or new.tax_category_id is distinct from old.tax_category_id
      or new.tax_rate_version_id is distinct from old.tax_rate_version_id
      or new.tax_category_code is distinct from old.tax_category_code
      or new.tax_classification is distinct from old.tax_classification
      or new.tax_rate_bps is distinct from old.tax_rate_bps
      or new.gross_total is distinct from old.gross_total
      or new.net_total is distinct from old.net_total
      or new.tax_total is distinct from old.tax_total
    ) then raise exception 'final_tax_snapshot_immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_final_expense_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.journal_entry_id is not null then raise exception 'final_tax_snapshot_immutable'; end if;
    return old;
  end if;
  if old.journal_entry_id is not null and (
    new.company_id is distinct from old.company_id
    or new.expense_date is distinct from old.expense_date
    or new.category is distinct from old.category
    or new.memo is distinct from old.memo
    or new.source_account_code is distinct from old.source_account_code
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.input_tax_total is distinct from old.input_tax_total
    or new.claim_input_vat is distinct from old.claim_input_vat
    or new.supplier_tax_pin is distinct from old.supplier_tax_pin
    or new.tax_invoice_number is distinct from old.tax_invoice_number
    or new.tax_invoice_date is distinct from old.tax_invoice_date
    or new.tax_point_at is distinct from old.tax_point_at
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_category_id is distinct from old.tax_category_id
    or new.tax_rate_version_id is distinct from old.tax_rate_version_id
    or new.tax_category_code is distinct from old.tax_category_code
    or new.tax_classification is distinct from old.tax_classification
    or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

drop trigger if exists purchases_final_tax_snapshot_immutable on public.purchases;
create trigger purchases_final_tax_snapshot_immutable
before update or delete on public.purchases
for each row execute function public.prevent_final_purchase_tax_mutation();

drop trigger if exists purchase_lines_final_tax_snapshot_immutable on public.purchase_lines;
create trigger purchase_lines_final_tax_snapshot_immutable
before update or delete on public.purchase_lines
for each row execute function public.prevent_final_purchase_line_tax_mutation();

drop trigger if exists purchase_expenses_final_tax_snapshot_immutable on public.purchase_expenses;
create trigger purchase_expenses_final_tax_snapshot_immutable
before update or delete on public.purchase_expenses
for each row execute function public.prevent_final_purchase_line_tax_mutation();

drop trigger if exists expense_documents_final_tax_snapshot_immutable on public.expense_documents;
create trigger expense_documents_final_tax_snapshot_immutable
before update or delete on public.expense_documents
for each row execute function public.prevent_final_expense_tax_mutation();

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
  v_tax_date date:=coalesce(p_tax_invoice_date,p_expense_date,current_date);
  v_id uuid;v_entry_id uuid;v_lines jsonb;v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CreateInterAccountTransfer') then
    raise exception 'permission_denied: CreateInterAccountTransfer required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_source_account_code);
  if p_claim_input_vat and (btrim(coalesce(p_supplier_tax_pin,''))=''
      or btrim(coalesce(p_tax_invoice_number,''))='' or p_tax_invoice_date is null) then
    raise exception 'input_vat_evidence_required'; end if;
  select cp.business_timezone into v_timezone from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from<=v_tax_date
    and (cp.effective_to is null or cp.effective_to>=v_tax_date)
  order by cp.effective_from desc limit 1;
  if v_timezone is null then
    select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  end if;
  v_point:=(v_tax_date::timestamp at time zone v_timezone);
  select * into v_tax from public.resolve_category_inclusive_tax(
    v_company_id,p_tax_category_id,p_amount,v_point);
  if p_claim_input_vat and not v_tax.vat_registered then raise exception 'input_vat_requires_registration'; end if;
  if not p_claim_input_vat then
    v_tax.net_total:=p_amount;v_tax.tax_total:=0;v_tax.tax_rate_bps:=0;
    v_tax.tax_category_code:='NOT_CLAIMED';v_tax.tax_classification:='not_claimed';
    v_tax.tax_category_id:=null;v_tax.tax_rate_version_id:=null;
  end if;
  insert into public.expense_documents(
    company_id,expense_date,category,memo,source_account_code,
    gross_total,net_total,input_tax_total,claim_input_vat,supplier_tax_pin,tax_invoice_number,
    tax_invoice_date,tax_point_at,tax_profile_id,tax_category_id,tax_rate_version_id,
    tax_category_code,tax_classification,tax_rate_bps,created_by
  ) values(
    v_company_id,coalesce(p_expense_date,current_date),coalesce(nullif(btrim(p_category),''),'other'),
    nullif(btrim(coalesce(p_memo,'')),''),p_source_account_code,p_amount,v_tax.net_total,
    v_tax.tax_total,p_claim_input_vat,
    case when p_claim_input_vat then nullif(btrim(coalesce(p_supplier_tax_pin,'')),'') end,
    case when p_claim_input_vat then nullif(btrim(coalesce(p_tax_invoice_number,'')),'') end,
    case when p_claim_input_vat then p_tax_invoice_date end,v_point,v_tax.tax_profile_id,
    v_tax.tax_category_id,v_tax.tax_rate_version_id,v_tax.tax_category_code,
    v_tax.tax_classification,v_tax.tax_rate_bps,auth.uid()
  ) returning id into v_id;
  v_lines:=jsonb_build_array(jsonb_build_object('account_code','EXPENSES','debit',v_tax.net_total,
    'meta',jsonb_build_object('expenseDocumentId',v_id,'expenseCategory',p_category)));
  if v_tax.tax_total>0 then v_lines:=v_lines||jsonb_build_object('account_code','TAX_PAYABLE',
    'debit',v_tax.tax_total,'meta',jsonb_build_object('expenseDocumentId',v_id,'inputVat',true)); end if;
  v_lines:=v_lines||jsonb_build_object('account_code',p_source_account_code,'credit',p_amount,
    'meta',jsonb_build_object('expenseDocumentId',v_id));
  v_entry_id:=public.post_journal_entry(v_company_id,'Expense',v_id::text,
    coalesce(p_memo,'Expense ('||coalesce(p_category,'other')||')'),v_lines,v_tax_date);
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
  v_tax record;v_point timestamptz;v_tax_date date:=coalesce(p_tax_invoice_date,p_purchase_date,current_date);
  v_timezone text;v_goods_tax bigint:=0;v_expense_tax bigint:=0;v_goods_net bigint:=0;
  v_profile_id uuid;v_default_category uuid;v_unit_cost bigint;v_journal_lines jsonb:='[]'::jsonb;
begin
  if p_claim_input_vat and (btrim(coalesce(p_supplier_tax_pin,''))=''
      or btrim(coalesce(p_tax_invoice_number,''))='' or p_tax_invoice_date is null) then
    raise exception 'input_vat_evidence_required'; end if;
  v_purchase_id:=public.record_purchase_complete(p_supplier_id,p_lines,p_expenses,p_payment_amount,
    p_reference,p_account_code,p_notes,p_purchase_date,p_stock_location_id);
  select cp.default_tax_category_id,cp.business_timezone
  into v_default_category,v_timezone
  from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from<=v_tax_date
    and (cp.effective_to is null or cp.effective_to>=v_tax_date)
  order by cp.effective_from desc limit 1;
  if v_timezone is null then
    select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  end if;
  v_point:=(v_tax_date::timestamp at time zone v_timezone);
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
      then p_tax_invoice_date end,tax_point_at=v_point,tax_profile_id=v_profile_id,
    tax_snapshot_status='final'
  where id=v_purchase_id;
  if v_goods_tax+v_expense_tax>0 then
    v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','TAX_PAYABLE',
      'debit',v_goods_tax+v_expense_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id,'inputVat',true));
    if v_goods_tax>0 then v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','INVENTORY',
      'credit',v_goods_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id)); end if;
    if v_expense_tax>0 then v_journal_lines:=v_journal_lines||jsonb_build_object('account_code','EXPENSES',
      'credit',v_expense_tax,'meta',jsonb_build_object('purchaseId',v_purchase_id)); end if;
    perform public.post_journal_entry(v_company_id,'PurchaseVatReclass',v_purchase_id::text,
      'Input VAT extracted from purchase '||coalesce(p_reference,v_purchase_id::text),
      v_journal_lines,v_tax_date);
  end if;
  return v_purchase_id;
end;
$$;

-- Journal posting context is durable. Interactive callers still use the
-- existing journal wrapper; trusted asynchronous finalizers use this core so
-- a captured cashier session can remain attributable after the till closes.
drop trigger if exists orders_00_apply_requested_tax_point on public.orders;
drop function if exists public.apply_requested_sale_tax_point();

create or replace function public.require_open_cashier_session_at_location(
  p_company_id uuid,p_location_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;v_cash_control_enabled boolean;
begin
  select c.cash_control_enabled into v_cash_control_enabled
  from public.companies c where c.id=p_company_id;
  if not coalesce(v_cash_control_enabled,false) then return null; end if;
  if p_location_id is null then raise exception 'business_location_required'; end if;
  select s.id into v_session_id from public.cashier_sessions s
  where s.company_id=p_company_id and s.location_id=p_location_id and s.status='open'
  for key share;
  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;
  return v_session_id;
end;
$$;
revoke execute on function public.require_open_cashier_session_at_location(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.require_open_cashier_session_at_location(uuid,uuid)
  to service_role;

create or replace function public.order_posting_context(
  p_order_id uuid,p_source text default 'interactive'
)
returns public.posting_context language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order record;v_session_id uuid;
  v_timezone text;v_posting_date date;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_source not in('interactive','approval') then raise exception 'invalid_posting_source'; end if;
  select o.location_id,o.cashier_session_id into v_order from public.orders o
  where o.id=p_order_id and o.company_id=v_company_id;
  if v_order.location_id is null then raise exception 'order_not_found: %',p_order_id; end if;
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_order.location_id);
  if v_order.cashier_session_id is not null and v_order.cashier_session_id<>v_session_id then
    raise exception 'cashier_session_mismatch: order belongs to another session'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_posting_date:=(now() at time zone v_timezone)::date;
  return row(v_company_id,v_order.location_id,auth.uid(),v_session_id,now(),v_posting_date,
    p_source,null)::public.posting_context;
end;
$$;
revoke execute on function public.order_posting_context(uuid,text)
  from public,anon,authenticated;
grant execute on function public.order_posting_context(uuid,text) to service_role;

create or replace function public.enforce_journal_entry_cashier_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;v_cash_control_enabled boolean;v_session record;
begin
  if not public.cashier_session_required_for_source(new.source_type) then return new; end if;
  select c.cash_control_enabled into v_cash_control_enabled from public.companies c
    where c.id=new.company_id;
  if not coalesce(v_cash_control_enabled,false) then
    new.cashier_session_id:=null;return new;
  end if;
  if new.posting_source in('mpesa_provider','mpesa_reconciliation','offline_review') then
    select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
      where s.id=new.cashier_session_id for key share;
    if v_session.id is null or v_session.company_id<>new.company_id
      or v_session.location_id is distinct from new.posting_location_id then
      raise exception 'posting_context_cashier_session_mismatch';
    end if;
    return new;
  end if;
  v_session_id:=case when new.posting_location_id is null
    then public.require_open_cashier_session(new.company_id)
    else public.require_open_cashier_session_at_location(new.company_id,new.posting_location_id)
  end;
  if new.cashier_session_id is not null and new.cashier_session_id<>v_session_id then
    raise exception 'cashier_session_mismatch: journal must use the open session';
  end if;
  new.cashier_session_id:=v_session_id;
  new.posting_source:=coalesce(new.posting_source,'interactive');
  return new;
end;
$$;

drop trigger if exists ledger_entries_require_cashier_session on public.ledger_journal_entries;
create trigger ledger_entries_require_cashier_session
  before insert on public.ledger_journal_entries
  for each row execute function public.enforce_journal_entry_cashier_session();

create or replace function public.tag_order_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_session_id uuid;v_session record;
begin
  if new.status<>'completed' or old.status='completed' then return new; end if;
  if new.posting_source in('mpesa_provider','mpesa_reconciliation','offline_review') then
    if new.cashier_session_id is null then
      if exists(select 1 from public.companies c where c.id=new.company_id and c.cash_control_enabled)
        then raise exception 'posting_context_cashier_session_required'; end if;
      return new;
    end if;
    select s.id,s.company_id,s.location_id into v_session from public.cashier_sessions s
      where s.id=new.cashier_session_id for key share;
    if v_session.id is null or v_session.company_id<>new.company_id
      or v_session.location_id is distinct from new.location_id then
      raise exception 'posting_context_cashier_session_mismatch'; end if;
    return new;
  end if;
  v_session_id:=public.require_open_cashier_session_at_location(new.company_id,new.location_id);
  if new.cashier_session_id is not null and new.cashier_session_id<>v_session_id then
    raise exception 'cashier_session_mismatch: completed order must use the open session'; end if;
  new.cashier_session_id:=v_session_id;
  return new;
end;
$$;

create or replace function public.tag_journal_line_cashier_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_session_id uuid;v_source_type text;v_posting_location_id uuid;
  v_requires_session boolean;
begin
  select e.cashier_session_id,e.source_type,e.posting_location_id
    into v_session_id,v_source_type,v_posting_location_id
  from public.ledger_journal_entries e
    where e.id=new.entry_id and e.company_id=new.company_id;
  if v_source_type is null then raise exception 'journal_entry_not_found: %',new.entry_id; end if;
  v_requires_session:=public.cashier_session_required_for_source(v_source_type)
    or (v_source_type='InventoryPurchase' and new.meta?'isCreditPurchase'
      and (new.meta->>'isCreditPurchase')::boolean is false);
  if v_requires_session and v_session_id is null then
    v_session_id:=case when v_posting_location_id is null
      then public.require_open_cashier_session(new.company_id)
      else public.require_open_cashier_session_at_location(new.company_id,v_posting_location_id)
    end;
  end if;
  if v_requires_session and v_session_id is not null then
    new.meta:=coalesce(new.meta,'{}'::jsonb)||jsonb_build_object('openSessionId',v_session_id);
    if v_source_type='InventoryPurchase' and new.meta?'isCreditPurchase'
      and (new.meta->>'isCreditPurchase')::boolean is false then
      update public.ledger_journal_lines
      set meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('openSessionId',v_session_id)
      where entry_id=new.entry_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.post_journal_entry_with_context(
  p_company_id uuid,p_source_type text,p_source_id text,p_memo text,p_lines jsonb,
  p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_entry_id uuid;v_entry_date date;v_payload_hash text;v_existing record;
  v_debit_sum bigint;v_credit_sum bigint;v_line jsonb;v_account_id uuid;
  v_debit bigint;v_credit bigint;
begin
  if (p_context).company_id is distinct from p_company_id
    or (p_context).occurred_at is null or (p_context).posting_date is null
    or (p_context).source is null then raise exception 'invalid_posting_context'; end if;
  if not exists(select 1 from public.stock_locations l
    where l.id=(p_context).location_id and l.company_id=p_company_id) then
    raise exception 'posting_context_location_mismatch'; end if;
  select coalesce(sum((l->>'debit')::bigint),0),coalesce(sum((l->>'credit')::bigint),0)
    into v_debit_sum,v_credit_sum from jsonb_array_elements(p_lines) l;
  if v_debit_sum<>v_credit_sum or v_debit_sum=0 then
    raise exception 'unbalanced_entry: debits % <> credits %',v_debit_sum,v_credit_sum; end if;
  v_entry_date:=(p_context).posting_date;
  v_payload_hash:=public.journal_payload_hash(v_entry_date,p_memo,p_lines);
  perform pg_advisory_xact_lock(hashtextextended(
    'journal-source:'||p_company_id::text||':'||p_source_type||':'||p_source_id,0));
  select e.* into v_existing from public.ledger_journal_entries e
    where e.company_id=p_company_id and e.source_type=p_source_type and e.source_id=p_source_id;
  if v_existing.id is not null then
    if v_existing.finalized_at is null then raise exception 'journal_unfinalized'; end if;
    if v_existing.payload_hash is distinct from v_payload_hash
      or v_existing.occurred_at is distinct from (p_context).occurred_at
      or v_existing.posting_source is distinct from (p_context).source
      or v_existing.posting_location_id is distinct from (p_context).location_id
      or v_existing.cashier_session_id is distinct from (p_context).cashier_session_id
      or v_existing.late_posting_reason is distinct from (p_context).late_reason then
      raise exception 'journal_idempotency_conflict: source %/% has different posting evidence',
        p_source_type,p_source_id;
    end if;
    return v_existing.id;
  end if;
  insert into public.ledger_journal_entries(
    company_id,entry_date,source_type,source_id,memo,payload_hash,finalized_at,
    occurred_at,posting_source,posting_location_id,cashier_session_id,late_posting_reason
  ) values(
    p_company_id,v_entry_date,p_source_type,p_source_id,p_memo,v_payload_hash,null,
    (p_context).occurred_at,(p_context).source,(p_context).location_id,
    (p_context).cashier_session_id,(p_context).late_reason
  ) returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit:=coalesce((v_line->>'debit')::bigint,0);
    v_credit:=coalesce((v_line->>'credit')::bigint,0);
    select a.id into v_account_id from public.ledger_accounts a
      where a.company_id=p_company_id and a.code=v_line->>'account_code'
        and a.is_active and not a.is_parent;
    if v_account_id is null then raise exception 'unknown_account: %',v_line->>'account_code'; end if;
    insert into public.ledger_journal_lines(entry_id,company_id,account_id,order_id,debit,credit,meta)
    values(v_entry_id,p_company_id,v_account_id,nullif(v_line->>'order_id','')::uuid,
      v_debit,v_credit,coalesce(v_line->'meta','{}'::jsonb));
  end loop;
  update public.ledger_journal_entries set finalized_at=now()
    where id=v_entry_id and finalized_at is null;
  if not found then raise exception 'journal_finalize_failed: %',v_entry_id; end if;
  return v_entry_id;
end;
$$;
revoke execute on function public.post_journal_entry_with_context(
  uuid,text,text,text,jsonb,public.posting_context) from public,anon,authenticated;
grant execute on function public.post_journal_entry_with_context(
  uuid,text,text,text,jsonb,public.posting_context) to service_role;

-- Every journal emitted while completing a sale uses the same authoritative
-- tax time, posting date, location, source and initiating cashier session.
create or replace function public.complete_order_core(
  p_order_id uuid,p_payments jsonb,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_order record;v_line record;v_payment jsonb;v_payment_row record;v_customer record;
  v_ar_balance bigint;v_is_credit boolean;v_paid bigint:=0;v_fifo jsonb;
  v_total_cogs bigint:=0;v_all_allocations jsonb:='[]'::jsonb;v_pending_approval uuid;
  v_business_timezone text;v_entry_date date;v_actor uuid:=(p_context).actor_id;
  v_posting_context public.posting_context;
begin
  if (p_context).company_id is null or (p_context).source not in(
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation'
  ) then raise exception 'invalid_posting_context'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=(p_context).company_id for update;
  if v_order is null then raise exception 'order_not_found: %',p_order_id; end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %',p_order_id,v_order.status; end if;
  select c.business_timezone into v_business_timezone from public.companies c
  where c.id=v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch'; end if;
  v_entry_date:=coalesce((p_context).posting_date,
    (coalesce((p_context).occurred_at,now()) at time zone v_business_timezone)::date);
  v_posting_context:=row((p_context).company_id,(p_context).location_id,(p_context).actor_id,
    (p_context).cashier_session_id,coalesce((p_context).occurred_at,now()),v_entry_date,
    (p_context).source,(p_context).late_reason)::public.posting_context;

  select a.id into v_pending_approval from public.approvals a
  where a.company_id=v_order.company_id and a.type='below_wholesale' and a.status='pending'
    and a.metadata->>'order_id'=p_order_id::text limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %',v_pending_approval; end if;

  v_is_credit:=jsonb_array_length(p_payments)=0
    or (jsonb_array_length(p_payments)=1 and p_payments->0->>'method'='credit');
  if v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer from public.customers
    where id=v_order.customer_id and company_id=v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount',true),'')::bigint,
        v_order.total)>0 and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %',v_order.customer_id; end if;
    select coalesce(sum(l.debit)-sum(l.credit),0) into v_ar_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_order.company_id and a.code='ACCOUNTS_RECEIVABLE'
      and l.meta->>'customerId'=v_order.customer_id::text;
    if v_ar_balance+coalesce(
      nullif(current_setting('app.sale_residual_credit_amount',true),'')::bigint,
      v_order.total
    )>v_customer.credit_limit and v_customer.credit_limit>0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists(select 1 from public.company_memberships actor_membership
          join public.roles actor_role on actor_role.id=actor_membership.role_id
            and actor_role.company_id=actor_membership.company_id
          where actor_membership.company_id=v_order.company_id
            and actor_membership.user_id=v_actor
            and actor_membership.authorization_status='approved'
            and 'ApproveCustomerCredit'=any(actor_role.permissions))
        or coalesce(current_setting('app.approved_credit_order_id',true),'')=p_order_id::text then
        insert into public.approvals(
          company_id,type,status,metadata,requested_by,decided_by,decided_at,decision_reason
        ) values(
          v_order.company_id,'overdraft','approved',jsonb_build_object(
            'order_id',p_order_id,'customerId',v_order.customer_id,'ar_balance',v_ar_balance,
            'order_total',v_order.total,'credit_limit',v_customer.credit_limit),
          auth.uid(),auth.uid(),now(),'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance,v_order.total,v_customer.credit_limit;
      end if;
    end if;
  else
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment->>'method'='credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods'; end if;
      insert into public.payments(
        company_id,order_id,method_code,amount,reference,mpesa_receipt,
        collection_allocation_id,location_id,cashier_session_id,ledger_account_code
      )
      values(v_order.company_id,p_order_id,v_payment->>'method',(v_payment->>'amount')::bigint,
        v_payment->>'reference',v_payment->>'mpesa_receipt',
        nullif(v_payment->>'collection_allocation_id','')::uuid,v_order.location_id,
        coalesce((p_context).cashier_session_id,v_order.cashier_session_id),
        public.resolve_tender_account(v_order.company_id,v_order.location_id,
          v_payment->>'method',v_payment->>'account_code'));
      v_paid:=v_paid+(v_payment->>'amount')::bigint;
    end loop;
    if v_paid<>v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %',v_paid,v_order.total; end if;
  end if;

  for v_line in select l.*,v.track_inventory from public.order_lines l
    join public.product_variants v on v.id=l.variant_id where l.order_id=p_order_id
  loop
    if v_line.track_inventory then
      v_fifo:=public.consume_fifo(v_order.company_id,v_line.variant_id,v_line.quantity,
        'Sale',p_order_id::text);
      v_total_cogs:=v_total_cogs+(v_fifo->>'total_cogs')::bigint;
      v_all_allocations:=v_all_allocations||(v_fifo->'allocations');
    end if;
  end loop;

  if v_is_credit then
    perform public.post_journal_entry_with_context(v_order.company_id,'CreditSale',p_order_id::text,
      'Credit sale '||v_order.code,jsonb_build_array(
        jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',v_order.total,
          'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
            'customerId',v_order.customer_id,'method','credit')),
        jsonb_build_object('account_code','SALES','credit',v_order.total,'order_id',p_order_id,
          'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id))
      ),v_posting_context);
  else
    for v_payment_row in select p.* from public.payments p where p.order_id=p_order_id
    loop
      perform public.post_journal_entry_with_context(v_order.company_id,'Payment',v_payment_row.id::text,
        'Sale '||v_order.code||' ('||v_payment_row.method_code||')',jsonb_build_array(
          jsonb_build_object('account_code',coalesce(v_payment_row.ledger_account_code,'CLEARING_GENERIC'),
            'debit',v_payment_row.amount,'order_id',p_order_id,'meta',jsonb_build_object(
              'orderCode',v_order.code,'customerId',v_order.customer_id,
              'method',v_payment_row.method_code,'reference',v_payment_row.reference)),
          jsonb_build_object('account_code','SALES','credit',v_payment_row.amount,
            'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
              'customerId',v_order.customer_id))
        ),v_posting_context);
    end loop;
  end if;

  if v_total_cogs>0 then
    perform public.post_journal_entry_with_context(v_order.company_id,'InventorySaleCogs',p_order_id::text,
      'COGS for order '||v_order.code,jsonb_build_array(
        jsonb_build_object('account_code','COGS','debit',v_total_cogs,'order_id',p_order_id,
          'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id,
            'cogsAllocations',v_all_allocations)),
        jsonb_build_object('account_code','INVENTORY','credit',v_total_cogs,'order_id',p_order_id,
          'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id))
      ),v_posting_context);
  end if;
  update public.orders set status='completed',is_credit_sale=v_is_credit,cashier_pending_at=null,
    completed_at=coalesce((p_context).occurred_at,completed_at,now()),
    accounting_posting_date=v_entry_date,
    posting_source=(p_context).source,late_posting_reason=(p_context).late_reason,
    cashier_session_id=coalesce(cashier_session_id,(p_context).cashier_session_id),
    updated_at=now() where id=p_order_id;
  return p_order_id;
end;
$$;

revoke execute on function public.complete_order_core(uuid,jsonb,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.complete_order_core(uuid,jsonb,public.posting_context) to service_role;

create or replace function public.complete_order(p_order_id uuid,p_payments jsonb,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_context public.posting_context;
begin
  if p_actor is distinct from auth.uid() then raise exception 'posting_actor_mismatch'; end if;
  v_context:=public.order_posting_context(p_order_id,'interactive');
  return public.complete_order_core(p_order_id,p_payments,v_context);
end;
$$;

create or replace function public.execute_full_credit_note(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_account_code text;v_refund_id uuid;v_collected bigint;v_cash_refund bigint;
  v_receivable_credit bigint;v_lines jsonb;v_timezone text;v_entry_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then
    raise exception 'stock_outcome_required'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then
    raise exception 'invalid_order_state: only completed sales can be credited'; end if;
  if exists(select 1 from public.refunds r where r.company_id=v_company_id and r.order_id=p_order_id) then
    raise exception 'sale_already_refunded'; end if;
  select coalesce(sum(p.amount),0)::bigint into v_collected from public.payments p
  where p.company_id=v_company_id and p.order_id=p_order_id and p.status='settled';
  v_cash_refund:=least(v_order.gross_total,v_collected);
  v_receivable_credit:=v_order.gross_total-v_cash_refund;
  if v_cash_refund>0 then
    select pm.ledger_account_code into v_account_code from public.payment_methods pm
    where pm.company_id=v_company_id and pm.code=p_method_code and pm.enabled;
    if v_account_code is null then raise exception 'payment_method_not_found: %',p_method_code; end if;
  end if;
  perform set_config('app.refund_stock_outcome',p_stock_outcome,true);
  insert into public.refunds(company_id,order_id,amount,method_code,reason,created_by)
  values(v_company_id,p_order_id,v_order.gross_total,p_method_code,btrim(p_reason),auth.uid())
  returning id into v_refund_id;

  v_lines:=jsonb_build_array(jsonb_build_object(
    'account_code','SALES_RETURNS','debit',v_order.gross_total,'order_id',p_order_id,
    'meta',jsonb_build_object('orderCode',v_order.code,'customerId',v_order.customer_id,
      'refundId',v_refund_id)));
  if v_cash_refund>0 then
    v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'credit',v_cash_refund,
      'order_id',p_order_id,'meta',jsonb_build_object('orderCode',v_order.code,
        'customerId',v_order.customer_id,'method',p_method_code,'refundId',v_refund_id));
  end if;
  if v_receivable_credit>0 then
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE',
      'credit',v_receivable_credit,'order_id',p_order_id,'meta',jsonb_build_object(
        'orderCode',v_order.code,'customerId',v_order.customer_id,'refundId',v_refund_id));
  end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  perform public.post_journal_entry(v_company_id,'Refund',v_refund_id::text,
    'Full credit note for order '||v_order.code,v_lines,v_entry_date);
  return v_refund_id;
end;
$$;

create or replace function public.post_full_refund(
  p_order_id uuid,p_method_code text,p_reason text,p_stock_outcome text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_order public.orders%rowtype;
  v_resource_id uuid;v_approval_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
  if p_stock_outcome not in ('return_to_stock','write_off') then
    raise exception 'stock_outcome_required'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status<>'completed' then
    raise exception 'invalid_order_state: only completed sales can be credited'; end if;
  if exists(select 1 from public.refunds r where r.company_id=v_company_id and r.order_id=p_order_id) then
    raise exception 'sale_already_refunded'; end if;
  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id:=public.execute_full_credit_note(
      p_order_id,p_method_code,btrim(p_reason),p_stock_outcome);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_order_id);
  end if;
  v_approval_id:=public.request_sale_approval(v_company_id,'sale_refund','order',p_order_id,
    jsonb_build_object('order_id',p_order_id,'amount',v_order.gross_total,
      'method_code',p_method_code,'reason',btrim(p_reason),'stock_outcome',p_stock_outcome,
      'full_refund',true));
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_order_id);
end;
$$;

revoke execute on function public.execute_full_credit_note(uuid,text,text,text)
from public,anon,authenticated;
grant execute on function public.execute_full_credit_note(uuid,text,text,text) to service_role;

-- Approval execution must use the same full-credit-note path, including for
-- unpaid credit sales. Pending legacy partial-refund approvals expire safely.
create or replace function public.approve_request(p_approval_id uuid,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_approval public.approvals%rowtype;
  v_order public.orders%rowtype;v_customer public.customers%rowtype;v_payment_status text;
  v_resource_id uuid;v_error text;v_valid boolean;v_available bigint;v_deposit_amount bigint;
  v_credit_amount bigint;v_current_ar bigint;v_customer_id uuid;v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_approval from public.approvals
  where id=p_approval_id and company_id=v_company_id for update;
  if v_approval.id is null then raise exception 'approval_not_found: %',p_approval_id; end if;
  perform public.assert_approval_authority(v_approval.type);
  if v_approval.status<>'pending' then raise exception 'approval_not_found: %',p_approval_id; end if;
  if v_approval.requested_by=auth.uid() then raise exception 'self_approval_denied'; end if;
  if v_approval.due_at is not null and v_approval.due_at<=now() then
    perform public.expire_approval_request(p_approval_id,'Approval request expired',
      v_approval.type in ('external_account_payment','overdraft'));
    return p_approval_id;
  end if;

  if v_approval.type='order_reversal' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed' then
      perform public.expire_approval_request(p_approval_id,
        'Sale is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.do_void(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved reversal'));

  elsif v_approval.type='sale_refund' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    if v_order.status is distinct from 'completed'
      or coalesce((v_approval.metadata->>'full_refund')::boolean,false) is not true
      or (v_approval.metadata->>'amount')::bigint is distinct from v_order.gross_total
      or exists(select 1 from public.refunds r where r.company_id=v_company_id
        and r.order_id=v_approval.subject_id) then
      perform public.expire_approval_request(p_approval_id,
        'Credit note is no longer valid',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_full_credit_note(v_approval.subject_id,
      v_approval.metadata->>'method_code',
      coalesce(v_approval.metadata->>'reason','Approved credit note'),
      v_approval.metadata->>'stock_outcome');

  elsif v_approval.type='payment_reversal' then
    select status into v_payment_status from public.payments
      where id=v_approval.subject_id and company_id=v_company_id for update;
    if v_payment_status is distinct from 'settled' or exists(select 1
      from public.ledger_journal_entries where company_id=v_company_id
        and source_type='PaymentReversal'
        and source_id=v_approval.subject_id::text||'-reversal') then
      perform public.expire_approval_request(p_approval_id,
        'Payment is no longer eligible for reversal',false);return p_approval_id;
    end if;
    v_resource_id:=public.execute_payment_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved payment reversal'));

  elsif v_approval.type='customer_deposit_refund' then
    v_resource_id:=public.refund_customer_deposit(v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,
      coalesce(v_approval.metadata->>'reason','Approved customer deposit refund'),
      nullif(v_approval.metadata->>'method_code',''),nullif(v_approval.metadata->>'reference',''),
      nullif(v_approval.metadata->>'client_ref',''),
      nullif(v_approval.metadata->>'location_id','')::uuid);

  elsif v_approval.type='customer_receipt_reversal' then
    v_resource_id:=public.execute_customer_receipt_reversal(v_approval.subject_id,
      coalesce(v_approval.metadata->>'reason','Approved customer receipt reversal'));

  elsif v_approval.type='below_wholesale' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='draft'
      and jsonb_typeof(v_approval.metadata->'lines')='array'
      and jsonb_array_length(v_approval.metadata->'lines')>0
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'lines') requested
        left join public.order_lines l on l.order_id=v_order.id
          and l.variant_id=(requested->>'variant_id')::uuid
        left join public.product_variants pv on pv.id=l.variant_id and pv.company_id=v_company_id
        where l.id is null or l.custom_price is distinct from (requested->>'custom_price')::bigint
          or pv.wholesale_price is null
          or (requested->>'custom_price')::bigint>=pv.wholesale_price
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Draft pricing changed and must be reviewed again',false);return p_approval_id;
    end if;
    v_resource_id:=v_order.id;

  elsif v_approval.type='external_account_payment'
    and v_approval.subject_type='customer_receipt' then
    perform set_config('app.approved_customer_receipt_id',v_approval.subject_id::text,true);
    begin
      v_resource_id:=public.execute_customer_receipt(v_approval.subject_id);
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Customer receipt could not post: '||v_error,false);return p_approval_id;
    end;

  elsif v_approval.type='external_account_payment' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select v_order.status='pending_payment' and v_order.customer_id is not null
      and jsonb_typeof(v_approval.metadata->'tenders')='array'
      and jsonb_array_length(v_approval.metadata->'tenders')>0
      and ((not coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total)
        or (coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)
            +coalesce((v_approval.metadata->>'deposit_amount')::bigint,0)
            +coalesce((v_approval.metadata->>'credit_amount')::bigint,0)=v_order.total))
      and not exists(
        select 1 from jsonb_array_elements(v_approval.metadata->'tenders') t
        left join public.payment_methods pm on pm.company_id=v_company_id and pm.code=t->>'method'
        left join public.location_payment_methods lpm
          on lpm.payment_method_id=pm.id and lpm.location_id=v_order.location_id
        where coalesce((t->>'amount')::bigint,0)<=0 or pm.id is null or not pm.enabled
          or (lpm.id is not null and not lpm.enabled)
          or (coalesce(pm.reconciliation_type,'')='statement_match'
            and btrim(coalesce(t->>'reference',''))='')
      ) into v_valid;
    if not coalesce(v_valid,false) then
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment is no longer valid',true);return p_approval_id;
    end if;
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='overdraft' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          if exists(select 1 from public.approvals a where a.company_id=v_company_id
            and a.subject_id=v_order.id and a.type='overdraft' and a.status='approved') then
            perform set_config('app.approved_credit_order_id',v_order.id::text,true);end if;
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,v_approval.metadata->'tenders',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Direct account payment could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft'
    and coalesce((v_approval.metadata->>'automatic_customer_account')::boolean,false) then
    select customer_id into v_customer_id from public.orders where id=v_approval.subject_id
      and company_id=v_company_id;
    if v_customer_id is not null then
      perform public.lock_customer_account(v_company_id,v_customer_id);end if;
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,'Credit sale is no longer valid',true);
      return p_approval_id;end if;
    v_available:=public.customer_deposit_available(v_customer.id);
    v_deposit_amount:=least(v_available,v_order.total);v_credit_amount:=v_order.total-v_deposit_amount;
    if v_credit_amount>coalesce((v_approval.metadata->>'reviewed_credit_amount')::bigint,0) then
      select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_current_ar
      from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.meta->>'customerId'=v_customer.id::text;
      update public.approvals set status='expired',decided_at=now(),decided_by=auth.uid(),
        decision_reason='Downpayment availability changed; credit exposure must be reviewed again'
      where id=p_approval_id;
      perform public.notify_approval_requester(p_approval_id);
      insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
      values(v_company_id,'overdraft','order',v_order.id,v_approval.metadata||jsonb_build_object(
        'deposit_amount',v_deposit_amount,'credit_amount',v_credit_amount,
        'reviewed_deposit_amount',v_deposit_amount,'reviewed_credit_amount',v_credit_amount,
        'ar_balance',v_current_ar,'projected_balance',v_current_ar+v_credit_amount,
        'reason','Downpayment changed; review the updated residual credit'),v_approval.requested_by);
      return p_approval_id;
    end if;
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
    v_context:=public.order_posting_context(v_order.id,'approval');
    perform public.complete_order_with_prepayment_core(v_order.id,'[]'::jsonb,v_deposit_amount,
      v_credit_amount,nullif(v_approval.metadata->>'client_ref',''),v_context);
    v_resource_id:=v_order.id;

  elsif v_approval.type='overdraft' then
    select * into v_order from public.orders where id=v_approval.subject_id
      and company_id=v_company_id for update;
    select * into v_customer from public.customers where id=v_order.customer_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_order.status is distinct from 'pending_payment' or v_customer.id is null
      or not v_customer.is_credit_approved then
      perform public.expire_approval_request(p_approval_id,
        'Credit sale is no longer valid',true);return p_approval_id;
    end if;
    perform set_config('app.approved_credit_order_id',v_order.id::text,true);
    begin
      if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='external_account_payment' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          perform set_config('app.approved_credit_order_id',v_order.id::text,true);
          v_context:=public.order_posting_context(v_order.id,'approval');
          perform public.complete_order_with_prepayment_core(v_order.id,v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''),v_context);
        end if;
      else
        v_context:=public.order_posting_context(v_order.id,'approval');
        perform public.complete_order_core(v_order.id,'[]',v_context);
      end if;
    exception when raise_exception then
      get stacked diagnostics v_error=message_text;
      perform public.expire_approval_request(p_approval_id,
        'Credit sale could not complete: '||v_error,true);return p_approval_id;
    end;
    v_resource_id:=v_order.id;

  elsif v_approval.type='customer_credit' then
    select * into v_customer from public.customers where id=v_approval.subject_id
      and company_id=v_company_id and deleted_at is null for update;
    if v_customer.id is null
      or v_customer.credit_limit is distinct from
        (v_approval.metadata->'previous'->>'credit_limit')::bigint
      or v_customer.is_credit_approved is distinct from
        (v_approval.metadata->'previous'->>'is_credit_approved')::boolean
      or coalesce(v_customer.credit_terms_days,0) is distinct from
        (v_approval.metadata->'previous'->>'credit_terms_days')::integer then
      perform public.expire_approval_request(p_approval_id,
        'Customer credit policy changed after this request',false);return p_approval_id;
    end if;
    perform public.update_customer_credit(v_customer.id,
      (v_approval.metadata->'proposed'->>'credit_limit')::bigint,
      (v_approval.metadata->'proposed'->>'is_credit_approved')::boolean,
      (v_approval.metadata->'proposed'->>'credit_terms_days')::integer);
    v_resource_id:=v_customer.id;
  end if;

  update public.approvals set status='approved',decided_by=auth.uid(),decided_at=now(),
    decision_reason=p_reason,result=case when v_resource_id is null then null
      else jsonb_build_object('resource_id',v_resource_id,'subject_id',v_approval.subject_id) end
  where id=p_approval_id;
  perform public.notify_approval_requester(p_approval_id);
  return p_approval_id;
end;
$$;

create or replace function public.pos_device_heartbeat(
  p_device_key text,p_location_id uuid,p_pending_count integer,p_synced boolean default false
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if btrim(coalesce(p_device_key,''))='' or p_pending_count is null or p_pending_count<0 then
    raise exception 'invalid_device_status'; end if;
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  insert into public.pos_devices(
    company_id,device_key,location_id,user_id,pending_count,last_seen_at,last_synced_at
  ) values(
    v_company_id,btrim(p_device_key),p_location_id,auth.uid(),p_pending_count,now(),
    case when p_synced then now() end
  )
  on conflict(company_id,device_key) do update
  set location_id=excluded.location_id,user_id=excluded.user_id,
      pending_count=excluded.pending_count,last_seen_at=now(),
      last_synced_at=case when p_synced then now() else public.pos_devices.last_synced_at end
  where public.pos_devices.retired_at is null
  returning id into v_id;
  if v_id is null then raise exception 'device_retired'; end if;
  return v_id;
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
  v_review_id uuid;v_device_id uuid;v_period_id uuid;v_result jsonb;v_payload jsonb;
  v_existing public.late_sale_reviews%rowtype;v_order_id uuid;v_session_id uuid;
  v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_occurred_at is null or btrim(coalesce(p_client_ref,''))='' then
    raise exception 'invalid_offline_sale'; end if;
  v_device_id:=public.pos_device_heartbeat(p_device_key,p_location_id,
    greatest(coalesce(p_pending_count,1),1),false);
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_tax_date:=(p_occurred_at at time zone v_timezone)::date;
  select pl.lock_end_date into v_lock_end from public.period_locks pl where pl.company_id=v_company_id;
  if v_lock_end is not null and v_tax_date<=v_lock_end then
    v_payload:=jsonb_build_object('customer_id',p_customer_id,'lines',p_lines,
      'payments',p_payments,'draft_id',p_draft_id);
    perform pg_advisory_xact_lock(hashtextextended(
      'late-sale:'||v_company_id::text||':'||btrim(p_client_ref),0));
    select l.* into v_existing from public.late_sale_reviews l
    where l.company_id=v_company_id and l.client_ref=btrim(p_client_ref) for update;
    if v_existing.id is not null then
      if v_existing.location_id is distinct from p_location_id
        or v_existing.occurred_at is distinct from p_occurred_at
        or v_existing.payload is distinct from v_payload then
        raise exception 'idempotency_conflict: client_ref reused with different late-sale payload';
      end if;
      return case v_existing.status
        when 'approved' then jsonb_build_object('status','completed','review_id',v_existing.id,
          'order_id',v_existing.posted_order_id,'subject_id',v_existing.posted_order_id)
        when 'rejected' then jsonb_build_object('status','rejected','review_id',v_existing.id,
          'subject_id',v_existing.id)
        else jsonb_build_object('status','late_review_required','review_id',v_existing.id,
          'subject_id',v_existing.id)
      end;
    end if;
    select ap.id into v_period_id from public.accounting_periods ap
    where ap.company_id=v_company_id and ap.status='closed'
      and v_tax_date between ap.start_date and ap.end_date
    order by ap.end_date desc limit 1;
    insert into public.late_sale_reviews(
      company_id,device_id,location_id,client_ref,occurred_at,original_period_id,payload
    ) values(
      v_company_id,v_device_id,p_location_id,btrim(p_client_ref),p_occurred_at,v_period_id,v_payload
    ) returning id into v_review_id;
    return jsonb_build_object('status','late_review_required','review_id',v_review_id,
      'subject_id',v_review_id);
  end if;
  perform set_config('app.business_location_id',p_location_id::text,true);
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,p_location_id);
  v_result:=public.post_sale_at_location(p_location_id,p_customer_id,p_lines,'[]'::jsonb,true,
    btrim(p_client_ref),p_draft_id,null);
  v_order_id:=(v_result->>'order_id')::uuid;
  if exists(select 1 from public.orders o where o.id=v_order_id and o.status='completed') then
    return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
  end if;
  v_context:=row(v_company_id,p_location_id,auth.uid(),v_session_id,p_occurred_at,
    v_tax_date,'offline',null)::public.posting_context;
  perform public.complete_order_core(v_order_id,p_payments,v_context);
  perform public.pos_device_heartbeat(p_device_key,p_location_id,
    greatest(coalesce(p_pending_count,1)-1,0),true);
  return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
end;
$$;

create or replace function public.review_late_sale(
  p_review_id uuid,p_approve boolean,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_review public.late_sale_reviews%rowtype;
  v_result jsonb;v_timezone text;v_entry_date date;v_order_id uuid;v_session_id uuid;
  v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageApprovals')
    or not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ManageApprovals and SettleOrder required'; end if;
  select * into v_review from public.late_sale_reviews
  where id=p_review_id and company_id=v_company_id for update;
  if v_review.id is null then raise exception 'late_sale_not_found'; end if;
  if v_review.status<>'pending' then raise exception 'late_sale_already_reviewed'; end if;
  if not p_approve then
    if btrim(coalesce(p_reason,''))='' then raise exception 'reason_required'; end if;
    update public.late_sale_reviews set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),
      review_reason=btrim(p_reason) where id=p_review_id;
    return jsonb_build_object('status','rejected','review_id',p_review_id);
  end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_entry_date:=(now() at time zone v_timezone)::date;
  perform set_config('app.business_location_id',v_review.location_id::text,true);
  v_session_id:=public.require_open_cashier_session_at_location(
    v_company_id,v_review.location_id);
  v_result:=public.post_sale_at_location(v_review.location_id,
    nullif(v_review.payload->>'customer_id','')::uuid,v_review.payload->'lines',
    '[]'::jsonb,true,v_review.client_ref,
    nullif(v_review.payload->>'draft_id','')::uuid,null);
  v_order_id:=(v_result->>'order_id')::uuid;
  v_context:=row(v_company_id,v_review.location_id,auth.uid(),v_session_id,
    v_review.occurred_at,v_entry_date,'offline_review','closed_period_offline_sale')
    ::public.posting_context;
  perform public.complete_order_core(v_order_id,v_review.payload->'payments',v_context);
  update public.late_sale_reviews set status='approved',posted_order_id=(v_result->>'order_id')::uuid,
    reviewed_by=auth.uid(),reviewed_at=now(),review_reason=nullif(btrim(coalesce(p_reason,'')),'')
  where id=p_review_id;
  return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id,
    'late_review_id',p_review_id);
end;
$$;

revoke execute on function public.prevent_final_purchase_tax_mutation(),
  public.prevent_final_purchase_line_tax_mutation(),public.prevent_final_expense_tax_mutation()
from public,anon,authenticated;
grant execute on function public.prevent_final_purchase_tax_mutation(),
  public.prevent_final_purchase_line_tax_mutation(),public.prevent_final_expense_tax_mutation()
to service_role;
