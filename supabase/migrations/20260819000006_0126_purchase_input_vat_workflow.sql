-- Purchase input VAT workflow: supplier master evidence, draft-safe estimates,
-- and one canonical tax-aware inventory purchase journal.

alter table public.customers
  add column if not exists tax_registration_number text;

alter table public.purchase_drafts
  add column if not exists claim_input_vat boolean not null default false,
  add column if not exists tax_invoice_date date,
  add column if not exists request_hash text;

alter table public.purchases
  add column if not exists accounting_posting_date date,
  add column if not exists accounting_period_id uuid references public.accounting_periods(id),
  add column if not exists posting_classification text not null default 'normal'
    check(posting_classification in ('normal','prior_period')),
  add column if not exists posting_reason text,
  add column if not exists purchase_posting_version text not null default 'gross_reclassification_v1'
    check (purchase_posting_version in ('gross_reclassification_v1','inline_input_vat_v1','ap_invoice_v2')),
  add column if not exists is_late_tax_adjustment boolean not null default false,
  add column if not exists invoice_net_total bigint not null default 0 check(invoice_net_total>=0),
  add column if not exists invoice_tax_total bigint not null default 0 check(invoice_tax_total>=0);

alter table public.purchase_expenses
  add column if not exists status text not null default 'posted'
    check(status in ('posted','reversed')),
  add column if not exists reversal_entry_id uuid references public.ledger_journal_entries(id),
  add column if not exists reversed_at timestamptz;

create unique index if not exists purchases_supplier_tax_invoice_unique
  on public.purchases(company_id,supplier_id,lower(btrim(tax_invoice_number)))
  where claim_input_vat and tax_invoice_number is not null;

update public.purchases p
set accounting_posting_date=coalesce(
  (select e.entry_date from public.ledger_journal_entries e
    where e.company_id=p.company_id and e.source_type='InventoryPurchase'
      and e.source_id=p.id::text),
  p.purchase_date
)
where p.accounting_posting_date is null;

-- Existing documents keep their known snapshots. Do not infer unclaimed historical VAT.
update public.purchases
set invoice_net_total=case when claim_input_vat then net_total else gross_total end,
    invoice_tax_total=case when claim_input_vat then input_tax_total else 0 end;

-- Views expand p.* when they are created, so rebuild the purchase read model
-- after adding the immutable evidence and posting columns above.
drop view public.purchase_history cascade;
create view public.purchase_history with(security_invoker=true) as
select p.*,
  coalesce(x.expense_total,0)::bigint as expense_total,
  coalesce(x.separate_expense_total,0)::bigint as separate_expense_total,
  (p.total_cost+coalesce(x.separate_expense_total,0))::bigint as all_in_total,
  case when p.purchase_posting_version='ap_invoice_v2' then coalesce(sum(pp.amount),0)::bigint
    when not p.is_credit then p.total_cost else coalesce(sum(pp.amount),0)::bigint end as paid,
  case when (p.purchase_posting_version<>'ap_invoice_v2' and not p.is_credit)
      or coalesce(sum(pp.amount),0)>=p.total_cost then 'paid'
    when coalesce(sum(pp.amount),0)>0 then 'part_paid' else 'unpaid' end::text as payment_status
from public.purchases p
left join public.purchase_payments pp on pp.purchase_id=p.id and pp.status='settled'
left join lateral(select coalesce(sum(pe.amount),0) expense_total,
  coalesce(sum(pe.amount) filter(where pe.settlement='separate'),0) separate_expense_total
  from public.purchase_expenses pe where pe.purchase_id=p.id) x on true
where p.status='posted'
group by p.id,x.expense_total,x.separate_expense_total;
grant select on public.purchase_history to authenticated;

create view public.supplier_purchase_metrics with(security_invoker=true) as
select company_id,supplier_id,count(*)::bigint purchase_count,
  coalesce(avg(total_cost),0)::bigint average_order,
  count(*) filter(where payment_status<>'paid')::bigint open_purchase_count,
  coalesce(sum(greatest(total_cost-paid,0)),0)::bigint outstanding
from public.purchase_history group by company_id,supplier_id;
grant select on public.supplier_purchase_metrics to authenticated;

create or replace function public.update_supplier_tax_registration(
  p_supplier_id uuid,p_tax_registration_number text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  update public.customers
  set tax_registration_number=nullif(btrim(coalesce(p_tax_registration_number,'')),''),updated_at=now()
  where id=p_supplier_id and company_id=v_company_id and is_supplier;
  if not found then raise exception 'supplier_not_found'; end if;
  return p_supplier_id;
end;
$$;
revoke execute on function public.update_supplier_tax_registration(uuid,text) from public,anon;
grant execute on function public.update_supplier_tax_registration(uuid,text) to authenticated;

create type public.purchase_posting_resolution as (
  requested_date date,
  posting_date date,
  accounting_period_id uuid,
  classification text,
  reason text
);

create or replace function public.resolve_purchase_posting(
  p_company_id uuid,p_requested_date date,p_tax_date date
)
returns public.purchase_posting_resolution
language plpgsql security definer set search_path='' as $$
declare v_period public.accounting_periods%rowtype;v_timezone text;v_today date;
  v_posting_date date;v_classification text;v_reason text;
begin
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  if p_requested_date is null then p_requested_date:=v_today; end if;
  if p_tax_date is null then p_tax_date:=p_requested_date; end if;
  if p_requested_date>v_today then raise exception 'future_purchase_date_not_allowed'; end if;
  if p_tax_date>v_today then raise exception 'future_tax_invoice_date_not_allowed'; end if;
  select ap.* into v_period from public.accounting_periods ap
  where ap.company_id=p_company_id and ap.status='open' for share;
  if v_period.id is null then raise exception 'open_period_not_found'; end if;
  if p_requested_date between v_period.start_date and v_period.end_date then
    v_posting_date:=p_requested_date;
  elsif v_today between v_period.start_date and v_period.end_date then
    v_posting_date:=v_today;
  else
    v_posting_date:=v_period.start_date;
  end if;
  if p_tax_date between v_period.start_date and v_period.end_date then
    v_classification:='normal';v_reason:=null;
  else
    v_classification:='prior_period';v_reason:='tax_point_outside_open_period';
  end if;
  return row(p_requested_date,v_posting_date,v_period.id,v_classification,v_reason)
    ::public.purchase_posting_resolution;
end;
$$;
revoke execute on function public.resolve_purchase_posting(uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.resolve_purchase_posting(uuid,date,date) to service_role;

create or replace function public.purchase_accounting_posting_date(
  p_company_id uuid,p_requested_date date
)
returns date language sql security definer set search_path='' as $$
  select (public.resolve_purchase_posting(p_company_id,p_requested_date,p_requested_date)).posting_date
$$;
revoke execute on function public.purchase_accounting_posting_date(uuid,date)
  from public,anon,authenticated;
grant execute on function public.purchase_accounting_posting_date(uuid,date) to service_role;

create or replace function public.calculate_purchase_invoice_tax(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_timezone text;v_point timestamptz;v_profile public.company_tax_profiles%rowtype;
  v_item record;v_variant record;v_tax record;v_default_category uuid;
  v_lines jsonb:='[]'::jsonb;v_expenses jsonb:='[]'::jsonb;
  v_goods_gross bigint:=0;v_goods_net bigint:=0;v_goods_tax bigint:=0;
  v_expense_gross bigint:=0;v_expense_net bigint:=0;v_expense_tax bigint:=0;
  v_separate_expenses bigint:=0;v_gross bigint;v_amount bigint;v_today date;
begin
  if p_tax_date is null then raise exception 'tax_invoice_date_required'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'invalid_purchase_lines'; end if;
  if p_expenses is null or jsonb_typeof(p_expenses)<>'array' then raise exception 'invalid_purchase_expenses'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  if p_tax_date>v_today then raise exception 'future_tax_invoice_date_not_allowed'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id and cp.effective_from<=p_tax_date
    and (cp.effective_to is null or cp.effective_to>=p_tax_date)
  order by cp.effective_from desc limit 1;
  v_point:=(p_tax_date::timestamp at time zone coalesce(v_profile.business_timezone,v_timezone));
  v_default_category:=v_profile.default_tax_category_id;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    select v.id,v.product_id into v_variant from public.product_variants v
    where v.id=nullif(v_item.value->>'variant_id','')::uuid and v.company_id=p_company_id;
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    if coalesce(v_item.value->>'value_source','unit')='total' then
      v_gross:=nullif(v_item.value->>'line_total','')::bigint;
    else
      v_gross:=round(nullif(v_item.value->>'quantity','')::numeric
        *nullif(v_item.value->>'unit_cost','')::bigint);
    end if;
    if v_gross is null or v_gross<=0 then raise exception 'invalid_purchase_line_total'; end if;
    select * into v_tax from public.resolve_purchase_invoice_tax(
      p_company_id,v_variant.product_id,v_gross,v_point);
    v_goods_gross:=v_goods_gross+v_tax.gross_total;
    v_goods_net:=v_goods_net+v_tax.net_total;
    v_goods_tax:=v_goods_tax+v_tax.tax_total;
    v_lines:=v_lines||jsonb_build_object(
      'line_index',v_item.ordinality-1,'tax_profile_id',v_tax.tax_profile_id,
      'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
      'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
      'tax_rate_bps',v_tax.tax_rate_bps,'gross_total',v_tax.gross_total,
      'net_total',v_tax.net_total,'tax_total',v_tax.tax_total);
  end loop;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_expenses) with ordinality
  loop
    v_amount:=nullif(v_item.value->>'amount','')::bigint;
    if v_amount is null or v_amount<=0 then raise exception 'invalid_purchase_expense'; end if;
    if v_item.value->>'settlement'='supplier_bill' then
      select * into v_tax from public.resolve_purchase_invoice_category_tax(
        p_company_id,v_default_category,v_amount,v_point);
      v_expense_gross:=v_expense_gross+v_tax.gross_total;
      v_expense_net:=v_expense_net+v_tax.net_total;
      v_expense_tax:=v_expense_tax+v_tax.tax_total;
      v_expenses:=v_expenses||jsonb_build_object(
        'expense_index',v_item.ordinality-1,'tax_profile_id',v_tax.tax_profile_id,
        'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
        'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
        'tax_rate_bps',v_tax.tax_rate_bps,'gross_total',v_tax.gross_total,
        'net_total',v_tax.net_total,'tax_total',v_tax.tax_total);
    else
      v_separate_expenses:=v_separate_expenses+v_amount;
      v_expenses:=v_expenses||jsonb_build_object(
        'expense_index',v_item.ordinality-1,'tax_profile_id',null,
        'tax_category_id',null,'tax_rate_version_id',null,
        'tax_category_code','NOT_CLAIMED','tax_classification','not_claimed',
        'tax_rate_bps',0,'gross_total',v_amount,'net_total',v_amount,'tax_total',0);
    end if;
  end loop;

  return jsonb_build_object(
    'status','estimate','tax_configured',v_profile.id is not null,
    'vat_registered',coalesce(v_profile.vat_registered,false),
    'tax_profile_id',v_profile.id,'tax_point_at',v_point,
    'gross_total',v_goods_gross+v_expense_gross,
    'net_total',v_goods_net+v_expense_net,
    'tax_total',v_goods_tax+v_expense_tax,
    'goods_gross_total',v_goods_gross,'goods_net_total',v_goods_net,
    'goods_tax_total',v_goods_tax,'expense_gross_total',v_expense_gross,
    'expense_net_total',v_expense_net,'expense_tax_total',v_expense_tax,
    'separate_expense_total',v_separate_expenses,'lines',v_lines,'expenses',v_expenses);
end;
$$;
revoke execute on function public.calculate_purchase_invoice_tax(uuid,jsonb,jsonb,date)
  from public,anon,authenticated;
grant execute on function public.calculate_purchase_invoice_tax(uuid,jsonb,jsonb,date) to service_role;

-- Compatibility name for claim previews. Invoice tax exists independently of recoverability.
create or replace function public.calculate_purchase_input_vat(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date
)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.calculate_purchase_invoice_tax(p_company_id,p_lines,p_expenses,p_tax_date)
$$;
revoke execute on function public.calculate_purchase_input_vat(uuid,jsonb,jsonb,date)
  from public,anon,authenticated;
grant execute on function public.calculate_purchase_input_vat(uuid,jsonb,jsonb,date) to service_role;

create or replace function public.estimate_purchase_input_vat(
  p_lines jsonb,p_expenses jsonb default '[]'::jsonb,p_tax_invoice_date date default current_date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  return public.calculate_purchase_input_vat(v_company_id,p_lines,p_expenses,p_tax_invoice_date);
end;
$$;
revoke execute on function public.estimate_purchase_input_vat(jsonb,jsonb,date) from public,anon;
grant execute on function public.estimate_purchase_input_vat(jsonb,jsonb,date) to authenticated;

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
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_quantity,v_quantity,
      round(v_cost_total/v_quantity),v_cost_total,
      v_cost_total,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date) returning id into v_batch_id;
    insert into public.purchase_lines(
      company_id,purchase_id,variant_id,inventory_batch_id,quantity,unit_cost,line_total,
      value_source,batch_number,expiry_date,tax_category_id,tax_rate_version_id,
      tax_category_code,tax_classification,tax_rate_bps,gross_total,net_total,tax_total)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      v_value_source,nullif(btrim(coalesce(v_line->>'batch_number','')),''),
      nullif(v_line->>'expiry_date','')::date,nullif(v_tax->>'tax_category_id','')::uuid,
      nullif(v_tax->>'tax_rate_version_id','')::uuid,v_tax->>'tax_category_code',
      v_tax->>'tax_classification',(v_tax->>'tax_rate_bps')::integer,
      (v_tax->>'gross_total')::bigint,(v_tax->>'net_total')::bigint,
      (v_tax->>'tax_total')::bigint);
    insert into public.inventory_movements(
      company_id,variant_id,batch_id,stock_location_id,type,quantity,unit_cost,total_cost,
      source_type,source_id,meta)
    values(v_company_id,v_variant_id,v_batch_id,v_location_id,'purchase',v_quantity,
      round(v_cost_total/v_quantity),v_cost_total,
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
revoke execute on function public.record_purchase_complete_core(
  uuid,jsonb,jsonb,bigint,text,text,text,date,uuid,boolean,date,text,public.posting_context,bigint)
  from public,anon,authenticated;
grant execute on function public.record_purchase_complete_core(
  uuid,jsonb,jsonb,bigint,text,text,text,date,uuid,boolean,date,text,public.posting_context,bigint)
  to service_role;

-- Every workspace path persists the same durable draft. The draft row is the
-- idempotency boundary; confirmation locks and posts it exactly once.
create or replace function public.purchase_draft_payload_hash(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb,p_reference text,p_notes text,
  p_purchase_date date,p_stock_location_id uuid,p_payment_mode text,p_payment_amount bigint,
  p_advance_amount bigint,p_account_code text,p_claim_input_vat boolean,p_tax_invoice_date date
)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'supplier_id',p_supplier_id,'lines',coalesce(p_lines,'[]'::jsonb),
    'expenses',coalesce(p_expenses,'[]'::jsonb),'reference',nullif(btrim(coalesce(p_reference,'')),''),
    'notes',nullif(btrim(coalesce(p_notes,'')),''),'purchase_date',p_purchase_date,
    'stock_location_id',p_stock_location_id,'payment_mode',p_payment_mode,
    'payment_amount',coalesce(p_payment_amount,0),'advance_amount',coalesce(p_advance_amount,0),
    'account_code',nullif(btrim(coalesce(p_account_code,'')),''),
    'claim_input_vat',coalesce(p_claim_input_vat,false),
    'tax_invoice_date',case when p_claim_input_vat then p_tax_invoice_date end
  )::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function public.save_purchase_workspace_draft(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_reference text default null,p_notes text default null,p_purchase_date date default current_date,
  p_stock_location_id uuid default null,p_payment_mode text default 'later',
  p_payment_amount bigint default 0,p_advance_amount bigint default 0,
  p_account_code text default null,p_client_ref text default null,p_draft_id uuid default null,
  p_claim_input_vat boolean default false,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;v_existing public.purchase_drafts%rowtype;
  v_hash text;v_client_ref text:=coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text);
  v_stock_location_id uuid:=p_stock_location_id;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if v_stock_location_id is null then
    select l.id into v_stock_location_id from public.stock_locations l
    where l.company_id=v_company_id and l.is_default
    order by l.created_at,l.id limit 1;
  end if;
  if v_stock_location_id is null then raise exception 'invalid_stock_location'; end if;
  v_hash:=public.purchase_draft_payload_hash(p_supplier_id,p_lines,p_expenses,p_reference,p_notes,
    p_purchase_date,v_stock_location_id,p_payment_mode,p_payment_amount,p_advance_amount,
    p_account_code,p_claim_input_vat,p_tax_invoice_date);
  perform pg_advisory_xact_lock(hashtextextended(
    'purchase-draft:'||v_company_id::text||':'||coalesce(p_draft_id::text,v_client_ref),0));
  if p_draft_id is not null then
    select * into v_existing from public.purchase_drafts d
    where d.id=p_draft_id and d.company_id=v_company_id for update;
  else
    select * into v_existing from public.purchase_drafts d
    where d.company_id=v_company_id and d.client_ref=v_client_ref for update;
  end if;
  if v_existing.id is not null and v_existing.status='confirmed' then
    if v_existing.request_hash is distinct from v_hash then
      raise exception 'purchase_draft_idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  if v_existing.id is not null and v_existing.status<>'draft' then
    raise exception 'purchase_draft_not_editable'; end if;
  begin
    if coalesce(p_advance_amount,0)>0 then
      v_id:=public.save_purchase_draft_with_advance(
        p_supplier_id,p_lines,p_expenses,p_reference,p_notes,p_purchase_date,v_stock_location_id,
        p_payment_amount,p_advance_amount,p_account_code,v_client_ref,v_existing.id);
    else
      v_id:=public.save_purchase_draft_complete(
        p_supplier_id,p_lines,p_expenses,p_reference,p_notes,p_purchase_date,v_stock_location_id,
        p_payment_mode,p_payment_amount,p_account_code,v_existing.id);
    end if;
  exception when raise_exception then
    if sqlerrm='invalid_initial_payment' then raise exception 'ap_overpayment'; end if;
    raise;
  end;
  update public.purchase_drafts d set client_ref=v_client_ref,request_hash=v_hash,
    advance_amount=coalesce(p_advance_amount,0),claim_input_vat=coalesce(p_claim_input_vat,false),
    tax_invoice_date=case when p_claim_input_vat then p_tax_invoice_date end,updated_at=now()
  where d.id=v_id and d.company_id=v_company_id;
  return v_id;
end;
$$;

create or replace function public.settle_purchase_account_core(
  p_purchase_id uuid,p_amount bigint,p_account_code text,p_client_ref text,
  p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_purchase public.purchases%rowtype;v_payment_id uuid;v_existing public.supplier_payments%rowtype;
begin
  if coalesce(p_amount,0)<=0 then return null; end if;
  select * into v_purchase from public.purchases p where p.id=p_purchase_id
    and p.company_id=(p_context).company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  if (p_context).cashier_session_id is null then raise exception 'cashier_session_required'; end if;
  perform public.require_asset_leaf_account(v_purchase.company_id,p_account_code);
  select * into v_existing from public.supplier_payments s
  where s.company_id=v_purchase.company_id and s.client_ref=p_client_ref;
  if v_existing.id is not null then
    if v_existing.purchase_id is distinct from p_purchase_id
      or v_existing.amount is distinct from p_amount
      or v_existing.account_code is distinct from p_account_code then
      raise exception 'supplier_payment_idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  insert into public.supplier_payments(company_id,supplier_id,purchase_id,amount,account_code,
    location_id,cashier_session_id,client_ref,created_by)
  values(v_purchase.company_id,v_purchase.supplier_id,v_purchase.id,p_amount,p_account_code,
    (p_context).location_id,(p_context).cashier_session_id,p_client_ref,(p_context).actor_id)
  returning id into v_payment_id;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
    supplier_payment_id,status,settlement_kind)
  values(v_purchase.company_id,v_purchase.id,p_amount,p_account_code,(p_context).actor_id,
    v_payment_id,'settled','account');
  perform public.post_journal_entry_with_context(v_purchase.company_id,'SupplierPayment',
    v_payment_id::text,'Initial supplier invoice settlement',jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object(
        'supplierId',v_purchase.supplier_id,'purchaseId',v_purchase.id,'supplierPaymentId',v_payment_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,'meta',jsonb_build_object(
        'supplierId',v_purchase.supplier_id,'purchaseId',v_purchase.id,'supplierPaymentId',v_payment_id))),
    p_context);
  return v_payment_id;
end;
$$;

create or replace function public.apply_supplier_advance_core(
  p_purchase_id uuid,p_amount bigint,p_client_ref text,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_purchase public.purchases%rowtype;v_id uuid;v_remaining bigint:=p_amount;
  v_available bigint;v_take bigint;v_source record;
begin
  if coalesce(p_amount,0)<=0 then return null; end if;
  select * into v_purchase from public.purchases p where p.id=p_purchase_id
    and p.company_id=(p_context).company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  select id into v_id from public.supplier_advance_applications a
  where a.company_id=v_purchase.company_id and a.client_ref=p_client_ref;
  if v_id is not null then return v_id; end if;
  perform 1 from public.supplier_advances a where a.company_id=v_purchase.company_id
    and a.supplier_id=v_purchase.supplier_id and a.status='active'
    order by a.created_at,a.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.supplier_advance_source_balances b where b.company_id=v_purchase.company_id
    and b.supplier_id=v_purchase.supplier_id;
  if p_amount>v_available then raise exception 'insufficient_supplier_advance'; end if;
  insert into public.supplier_advance_applications(company_id,supplier_id,purchase_id,amount,client_ref,created_by)
  values(v_purchase.company_id,v_purchase.supplier_id,v_purchase.id,p_amount,p_client_ref,(p_context).actor_id)
  returning id into v_id;
  for v_source in select b.* from public.supplier_advance_source_balances b
    where b.company_id=v_purchase.company_id and b.supplier_id=v_purchase.supplier_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_source.available);v_remaining:=v_remaining-v_take;
    insert into public.supplier_advance_allocations(company_id,application_id,advance_id,amount)
    values(v_purchase.company_id,v_id,v_source.id,v_take);
  end loop;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
    settlement_kind,supplier_advance_application_id,status)
  values(v_purchase.company_id,v_purchase.id,p_amount,'SUPPLIER_ADVANCES',(p_context).actor_id,
    'supplier_advance',v_id,'settled');
  perform public.post_journal_entry_with_context(v_purchase.company_id,'SupplierAdvanceApplication',
    v_id::text,'Apply supplier advance to invoice',jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object(
        'supplierId',v_purchase.supplier_id,'purchaseId',v_purchase.id,'applicationId',v_id)),
      jsonb_build_object('account_code','SUPPLIER_ADVANCES','credit',p_amount,'meta',jsonb_build_object(
        'supplierId',v_purchase.supplier_id,'purchaseId',v_purchase.id,'applicationId',v_id))),p_context);
  return v_id;
end;
$$;

create or replace function public.finalize_purchase_draft_core(
  p_draft_id uuid,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_draft public.purchase_drafts%rowtype;v_purchase_id uuid;v_outstanding bigint;
begin
  select * into v_draft from public.purchase_drafts d where d.id=p_draft_id
    and d.company_id=(p_context).company_id for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  if v_draft.status='confirmed' and v_draft.posted_purchase_id is not null then
    return v_draft.posted_purchase_id; end if;
  if v_draft.status<>'draft' then raise exception 'purchase_draft_not_editable'; end if;
  v_outstanding:=v_draft.total_cost-coalesce(v_draft.payment_amount,0)-coalesce(v_draft.advance_amount,0);
  if v_outstanding<0 then raise exception 'purchase_settlement_exceeds_total'; end if;
  if (v_outstanding>0 or coalesce(v_draft.advance_amount,0)>0)
    and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  v_purchase_id:=public.record_purchase_complete_core(
    v_draft.supplier_id,v_draft.lines,v_draft.expenses,coalesce(v_draft.payment_amount,0),
    v_draft.reference,coalesce(v_draft.account_code,'CASH_ON_HAND'),v_draft.notes,
    v_draft.purchase_date,v_draft.stock_location_id,v_draft.claim_input_vat,
    v_draft.tax_invoice_date,v_draft.client_ref,p_context,coalesce(v_draft.advance_amount,0));
  if coalesce(v_draft.payment_amount,0)>0 then
    perform public.settle_purchase_account_core(v_purchase_id,v_draft.payment_amount,
      v_draft.account_code,v_draft.client_ref||':account',p_context); end if;
  if coalesce(v_draft.advance_amount,0)>0 then
    perform public.apply_supplier_advance_core(v_purchase_id,v_draft.advance_amount,
      v_draft.client_ref||':advance',p_context); end if;
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
  where id=v_draft.id;
  perform public.assert_supplier_account_consistent(v_draft.company_id,v_draft.supplier_id);
  return v_purchase_id;
end;
$$;

create or replace function public.finalize_purchase_draft(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_draft public.purchase_drafts%rowtype;
  v_resolution public.purchase_posting_resolution;v_context public.posting_context;
  v_timezone text;v_session_id uuid;v_tax_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_draft from public.purchase_drafts d where d.id=p_draft_id
    and d.company_id=v_company_id for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  if v_draft.status='confirmed' and v_draft.posted_purchase_id is not null then
    return v_draft.posted_purchase_id; end if;
  v_tax_date:=case when v_draft.claim_input_vat then v_draft.tax_invoice_date else v_draft.purchase_date end;
  v_resolution:=public.resolve_purchase_posting(v_company_id,v_draft.purchase_date,v_tax_date);
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  if coalesce(v_draft.payment_amount,0)>0 or exists(
    select 1 from jsonb_array_elements(v_draft.expenses) x where x->>'settlement'='separate') then
    v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_draft.stock_location_id);
  end if;
  v_context:=row(v_company_id,v_draft.stock_location_id,auth.uid(),v_session_id,
    (v_draft.purchase_date::timestamp at time zone v_timezone),(v_resolution).posting_date,
    'purchase',(v_resolution).reason)::public.posting_context;
  return public.finalize_purchase_draft_core(v_draft.id,v_context);
end;
$$;

revoke execute on function public.purchase_draft_payload_hash(
  uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,bigint,text,boolean,date),
  public.settle_purchase_account_core(uuid,bigint,text,text,public.posting_context),
  public.apply_supplier_advance_core(uuid,bigint,text,public.posting_context),
  public.finalize_purchase_draft_core(uuid,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.purchase_draft_payload_hash(
  uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,bigint,text,boolean,date),
  public.settle_purchase_account_core(uuid,bigint,text,text,public.posting_context),
  public.apply_supplier_advance_core(uuid,bigint,text,public.posting_context),
  public.finalize_purchase_draft_core(uuid,public.posting_context) to service_role;
revoke execute on function public.save_purchase_workspace_draft(
  uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,bigint,text,text,uuid,boolean,date),
  public.finalize_purchase_draft(uuid) from public,anon;
grant execute on function public.save_purchase_workspace_draft(
  uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,bigint,text,text,uuid,boolean,date),
  public.finalize_purchase_draft(uuid) to authenticated;

-- Supplier-credit exposure is a property of the completed invoice plan. Read
-- both initial settlement amounts from the trusted recognition line instead
-- of an ambient session variable, while retaining the existing AR guards.
create or replace function public.enforce_credit_serialization()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_account_code text;v_source_type text;v_source_id text;v_party_id uuid;
  v_party record;v_balance bigint;v_order_balance bigint;
  v_order_debits bigint;v_order_credits bigint;v_residual bigint;
begin
  if current_setting('app.bypass_business_limits',true)='on' then return new; end if;
  select a.code into v_account_code from public.ledger_accounts a
  where a.id=new.account_id and a.company_id=new.company_id;
  if v_account_code not in ('ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE') then return new; end if;
  select e.source_type,e.source_id into v_source_type,v_source_id
  from public.ledger_journal_entries e where e.id=new.entry_id;

  if v_account_code='ACCOUNTS_RECEIVABLE' then
    v_party_id:=nullif(new.meta->>'customerId','')::uuid;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and not c.is_supplier for update;
    if v_party is null then raise exception 'customer_not_found'; end if;
    if v_source_type='CreditSale' and new.debit>0 then
      v_residual:=coalesce(nullif(current_setting('app.sale_residual_credit_amount',true),'')::bigint,
        new.debit);
      if v_residual>0 and not v_party.is_credit_approved then
        raise exception 'credit_not_approved: customer %',v_party_id; end if;
      select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_balance
      from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=new.company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.meta->>'customerId'=v_party_id::text;
      if v_party.credit_limit>0 and v_balance+v_residual>v_party.credit_limit
        and not exists(select 1 from public.approvals ap where ap.company_id=new.company_id
          and ap.type='overdraft' and (ap.status='approved' or (ap.status='pending'
            and coalesce(current_setting('app.approved_credit_order_id',true),'')=v_source_id))
          and ap.metadata->>'order_id'=v_source_id) then
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_balance,new.debit,v_party.credit_limit;
      end if;
    elsif v_source_type='PaymentAllocation' and new.credit>0 then
      select coalesce(sum(l.debit),0)::bigint,coalesce(sum(l.credit),0)::bigint
      into v_order_debits,v_order_credits from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id=l.account_id
      where l.company_id=new.company_id and a.code='ACCOUNTS_RECEIVABLE'
        and l.order_id=new.order_id;
      v_order_balance:=v_order_debits-v_order_credits;
      if new.credit>v_order_balance then
        raise exception 'ar_overpayment: order % AR credits % exceed debits %',
          new.order_id,v_order_credits+new.credit,v_order_debits;
      end if;
    end if;
  else
    v_party_id:=nullif(new.meta->>'supplierId','')::uuid;
    if v_party_id is null then return new; end if;
    select * into v_party from public.customers c where c.id=v_party_id
      and c.company_id=new.company_id and c.is_supplier for update;
    if v_party is null then raise exception 'supplier_not_found'; end if;
    select coalesce(sum(l.credit)-sum(l.debit),0)::bigint into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=new.company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta->>'supplierId'=v_party_id::text;
    if v_source_type='InventoryPurchase' and new.credit>0 then
      v_residual:=new.credit
        -coalesce(nullif(new.meta->>'projectedInitialPayment','')::bigint,0)
        -coalesce(nullif(new.meta->>'projectedAdvance','')::bigint,0);
      if v_party.supplier_credit_limit>0
        and v_balance+greatest(v_residual,0)>v_party.supplier_credit_limit then
        raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
          v_balance,greatest(v_residual,0),v_party.supplier_credit_limit;
      end if;
    elsif v_source_type='SupplierPayment' and new.debit>0 and new.debit>v_balance then
      raise exception 'ap_overpayment: supplier balance is %',v_balance;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_credit_serialization() from public,anon,authenticated;
grant execute on function public.enforce_credit_serialization() to service_role;

-- Compatibility RPCs translate old requests into the same draft aggregate.
create or replace function public.record_purchase_complete_with_tax(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_claim_input_vat boolean default false,p_supplier_tax_pin text default null,
  p_tax_invoice_number text default null,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_reference text;v_draft_id uuid;v_ref text:=gen_random_uuid()::text;
begin
  v_reference:=coalesce(nullif(btrim(p_reference),''),nullif(btrim(p_tax_invoice_number),''));
  v_draft_id:=public.save_purchase_workspace_draft(p_supplier_id,p_lines,p_expenses,v_reference,p_notes,
    p_purchase_date,p_stock_location_id,case when p_payment_amount=0 then 'later'
      when p_payment_amount=(select coalesce(sum(case when coalesce(x->>'value_source','unit')='total'
        then (x->>'line_total')::bigint else round((x->>'quantity')::numeric*(x->>'unit_cost')::bigint) end),0)
        from jsonb_array_elements(p_lines) x)+coalesce((select sum((x->>'amount')::bigint)
        from jsonb_array_elements(p_expenses) x where x->>'settlement'='supplier_bill'),0)
      then 'paid' else 'partial' end,p_payment_amount,0,p_account_code,v_ref,null,
    p_claim_input_vat,p_tax_invoice_date);
  return public.finalize_purchase_draft(v_draft_id);
end;
$$;

drop function if exists public.record_purchase_with_advance(
  uuid,jsonb,jsonb,bigint,bigint,bigint,text,text,text,date,uuid,text);
create or replace function public.record_purchase_with_advance(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_advance_amount bigint default 0,
  p_credit_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null,
  p_client_ref text default null,p_claim_input_vat boolean default false,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_draft_id uuid;v_mode text;
begin
  v_mode:=case when p_credit_amount>0 then case when p_payment_amount+p_advance_amount>0 then 'partial' else 'later' end
    else 'paid' end;
  v_draft_id:=public.save_purchase_workspace_draft(p_supplier_id,p_lines,p_expenses,p_reference,p_notes,
    p_purchase_date,p_stock_location_id,v_mode,p_payment_amount,p_advance_amount,p_account_code,
    coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text),null,p_claim_input_vat,p_tax_invoice_date);
  if p_payment_amount+p_advance_amount+p_credit_amount<>(select total_cost from public.purchase_drafts where id=v_draft_id) then
    raise exception 'payment_mismatch'; end if;
  return public.finalize_purchase_draft(v_draft_id);
end;
$$;

create or replace function public.confirm_purchase_draft_complete(p_draft_id uuid)
returns uuid language sql security definer set search_path='' as $$
  select public.finalize_purchase_draft(p_draft_id)
$$;
create or replace function public.confirm_purchase_draft_with_advance(p_draft_id uuid)
returns uuid language sql security definer set search_path='' as $$
  select public.finalize_purchase_draft(p_draft_id)
$$;

create or replace function public.record_purchase_complete(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null
)
returns uuid language sql security definer set search_path='' as $$
  select public.record_purchase_complete_with_tax(p_supplier_id,p_lines,p_expenses,p_payment_amount,
    p_reference,p_account_code,p_notes,p_purchase_date,p_stock_location_id,false,null,null,null)
$$;

create or replace function public.record_purchase(
  p_supplier_id uuid,p_lines jsonb,p_is_credit boolean,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_line jsonb;v_total bigint:=0;
begin
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_total:=v_total+round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::bigint);
  end loop;
  return public.record_purchase_complete(p_supplier_id,p_lines,'[]'::jsonb,
    case when p_is_credit then 0 else v_total end,p_reference,p_account_code,p_notes,
    p_purchase_date,p_stock_location_id);
end;
$$;

create or replace function public.record_purchase_with_prices(
  p_supplier_id uuid,p_lines jsonb,p_is_credit boolean,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null
)
returns uuid language sql security definer set search_path='' as $$
  select public.record_purchase(p_supplier_id,p_lines,p_is_credit,p_reference,p_account_code,
    p_notes,p_purchase_date,p_stock_location_id)
$$;

create or replace function public.record_purchase_with_payment(
  p_supplier_id uuid,p_lines jsonb,p_payment_amount bigint,p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',p_notes text default null,
  p_purchase_date date default current_date,p_stock_location_id uuid default null
)
returns uuid language sql security definer set search_path='' as $$
  select public.record_purchase_complete(p_supplier_id,p_lines,'[]'::jsonb,p_payment_amount,
    p_reference,p_account_code,p_notes,p_purchase_date,p_stock_location_id)
$$;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid,p_is_credit boolean,p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  update public.purchase_drafts d set payment_mode=case when p_is_credit then 'later' else 'paid' end,
    payment_amount=case when p_is_credit then 0 else d.total_cost end,
    account_code=case when p_is_credit then null else p_account_code end,
    stock_location_id=coalesce(p_stock_location_id,d.stock_location_id),updated_at=now()
  where d.id=p_draft_id and d.company_id=public.current_company_id() and d.status='draft';
  return public.finalize_purchase_draft(p_draft_id);
end;
$$;

create or replace function public.confirm_purchase_draft_with_payment(
  p_draft_id uuid,p_payment_amount bigint,p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  update public.purchase_drafts d set payment_mode=case when p_payment_amount>=d.total_cost then 'paid'
      when p_payment_amount>0 then 'partial' else 'later' end,payment_amount=p_payment_amount,
    account_code=case when p_payment_amount>0 then p_account_code end,
    stock_location_id=coalesce(p_stock_location_id,d.stock_location_id),updated_at=now()
  where d.id=p_draft_id and d.company_id=public.current_company_id() and d.status='draft';
  return public.finalize_purchase_draft(p_draft_id);
end;
$$;

create or replace function public.save_purchase_draft_complete_with_tax(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_reference text default null,p_notes text default null,p_purchase_date date default current_date,
  p_stock_location_id uuid default null,p_payment_mode text default null,
  p_payment_amount bigint default null,p_account_code text default null,p_draft_id uuid default null,
  p_claim_input_vat boolean default false,p_tax_invoice_date date default null
)
returns uuid language sql security definer set search_path='' as $$
  select public.save_purchase_workspace_draft(p_supplier_id,p_lines,p_expenses,p_reference,p_notes,
    p_purchase_date,p_stock_location_id,p_payment_mode,coalesce(p_payment_amount,0),0,p_account_code,
    coalesce((select d.client_ref from public.purchase_drafts d
      where d.id=p_draft_id and d.company_id=public.current_company_id()),gen_random_uuid()::text),
    p_draft_id,p_claim_input_vat,p_tax_invoice_date)
$$;

create or replace function public.save_purchase_draft_with_advance_tax(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_reference text default null,p_notes text default null,p_purchase_date date default current_date,
  p_stock_location_id uuid default null,p_payment_amount bigint default 0,
  p_advance_amount bigint default 0,p_account_code text default null,p_client_ref text default null,
  p_draft_id uuid default null,p_claim_input_vat boolean default false,p_tax_invoice_date date default null
)
returns uuid language sql security definer set search_path='' as $$
  select public.save_purchase_workspace_draft(p_supplier_id,p_lines,p_expenses,p_reference,p_notes,
    p_purchase_date,p_stock_location_id,case
      when coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0)=0 then 'later'
      else 'partial' end,p_payment_amount,p_advance_amount,p_account_code,
    coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text),p_draft_id,
    p_claim_input_vat,p_tax_invoice_date)
$$;

revoke execute on function public.record_purchase_complete_with_tax(
  uuid,jsonb,jsonb,bigint,text,text,text,date,uuid,boolean,text,text,date),
  public.record_purchase_with_advance(
    uuid,jsonb,jsonb,bigint,bigint,bigint,text,text,text,date,uuid,text,boolean,date),
  public.record_purchase_complete(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid),
  public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid),
  public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid),
  public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid),
  public.confirm_purchase_draft(uuid,boolean,text,uuid),
  public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid),
  public.save_purchase_draft_complete_with_tax(
    uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,text,uuid,boolean,date),
  public.save_purchase_draft_with_advance_tax(
    uuid,jsonb,jsonb,text,text,date,uuid,bigint,bigint,text,text,uuid,boolean,date),
  public.confirm_purchase_draft_complete(uuid),public.confirm_purchase_draft_with_advance(uuid)
  from public,anon;
grant execute on function public.record_purchase_complete_with_tax(
  uuid,jsonb,jsonb,bigint,text,text,text,date,uuid,boolean,text,text,date),
  public.record_purchase_with_advance(
    uuid,jsonb,jsonb,bigint,bigint,bigint,text,text,text,date,uuid,text,boolean,date),
  public.record_purchase_complete(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid),
  public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid),
  public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid),
  public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid),
  public.confirm_purchase_draft(uuid,boolean,text,uuid),
  public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid),
  public.save_purchase_draft_complete_with_tax(
    uuid,jsonb,jsonb,text,text,date,uuid,text,bigint,text,uuid,boolean,date),
  public.save_purchase_draft_with_advance_tax(
    uuid,jsonb,jsonb,text,text,date,uuid,bigint,bigint,text,text,uuid,boolean,date),
  public.confirm_purchase_draft_complete(uuid),public.confirm_purchase_draft_with_advance(uuid)
  to authenticated;

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
      and (b.remaining<>pl.quantity or b.remaining_cost<>b.original_cost)) then
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
    v_net_unit_cost:=round(v_purchase_line.recognized_cost/v_purchase_line.quantity);
    update public.inventory_batches set remaining=0,remaining_cost=0
    where id=v_purchase_line.inventory_batch_id;
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
      quantity,unit_cost,total_cost,source_type,source_id,meta)
    values(v_company_id,v_purchase_line.variant_id,v_purchase_line.inventory_batch_id,
      v_purchase_line.stock_location_id,'reversal',-v_purchase_line.quantity,v_net_unit_cost,
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

create or replace function public.reverse_credit_purchase(p_purchase_id uuid,p_reason text)
returns uuid language sql security definer set search_path='' as $$
  select public.reverse_purchase(p_purchase_id,p_reason)
$$;
revoke execute on function public.reverse_purchase(uuid,text),
  public.reverse_credit_purchase(uuid,text) from public,anon;
grant execute on function public.reverse_purchase(uuid,text),
  public.reverse_credit_purchase(uuid,text) to authenticated;

-- New purchases reverse their one consolidated recognition journal. Historical
-- gross + PurchaseVatReclass documents retain the legacy VAT reversal trigger.
create or replace function public.reverse_purchase_vat_on_status_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_goods_tax bigint;v_expense_tax bigint;v_lines jsonb:='[]'::jsonb;
  v_timezone text;v_entry_date date;
begin
  if old.status='posted' and new.status<>'posted' and old.input_tax_total>0
    and old.purchase_posting_version='gross_reclassification_v1' then
    select coalesce(sum(pl.tax_total),0) into v_goods_tax
    from public.purchase_lines pl where pl.purchase_id=new.id;
    select coalesce(sum(pe.tax_total),0) into v_expense_tax
    from public.purchase_expenses pe
    where pe.purchase_id=new.id and pe.settlement='supplier_bill';
    if v_goods_tax>0 then v_lines:=v_lines||jsonb_build_object(
      'account_code','INVENTORY','debit',v_goods_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    if v_expense_tax>0 then v_lines:=v_lines||jsonb_build_object(
      'account_code','EXPENSES','debit',v_expense_tax,
      'meta',jsonb_build_object('purchaseId',new.id)); end if;
    v_lines:=v_lines||jsonb_build_object('account_code','TAX_PAYABLE','credit',
      old.input_tax_total,'meta',jsonb_build_object('purchaseId',new.id,'inputVatReversal',true));
    select c.business_timezone into v_timezone from public.companies c where c.id=new.company_id;
    v_entry_date:=(now() at time zone v_timezone)::date;
    perform public.post_journal_entry(new.company_id,'PurchaseVatReversal',new.id::text,
      'Input VAT reversal for purchase '||coalesce(new.reference,new.id::text),v_lines,v_entry_date);
  end if;
  return new;
end;
$$;

create table if not exists public.purchase_input_vat_reversals(
  purchase_id uuid primary key references public.purchases(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  journal_entry_id uuid not null unique references public.ledger_journal_entries(id),
  posting_date date not null,input_tax_total bigint not null check(input_tax_total>=0),
  created_at timestamptz not null default now()
);
alter table public.purchase_input_vat_reversals enable row level security;
drop policy if exists "purchase input VAT reversals readable" on public.purchase_input_vat_reversals;
create policy "purchase input VAT reversals readable" on public.purchase_input_vat_reversals
for select using(company_id=(select public.current_company_id())
  and (public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('CloseAccountingPeriod')));
grant select on public.purchase_input_vat_reversals to authenticated;
grant all on public.purchase_input_vat_reversals to service_role;

create or replace function public.capture_inline_purchase_vat_reversal()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_purchase_id uuid;v_purchase public.purchases%rowtype;
begin
  if new.source_type<>'PurchaseReversal'
    or new.source_id !~ '^[0-9a-f-]{36}-reversal$' then return new; end if;
  v_purchase_id:=left(new.source_id,length(new.source_id)-9)::uuid;
  select * into v_purchase from public.purchases p where p.id=v_purchase_id;
  if v_purchase.purchase_posting_version in ('inline_input_vat_v1','ap_invoice_v2')
    and v_purchase.input_tax_total>0 then
    insert into public.purchase_input_vat_reversals(
      purchase_id,company_id,journal_entry_id,posting_date,input_tax_total)
    values(v_purchase.id,v_purchase.company_id,new.id,new.entry_date,v_purchase.input_tax_total)
    on conflict(purchase_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists ledger_capture_inline_purchase_vat_reversal
  on public.ledger_journal_entries;
create trigger ledger_capture_inline_purchase_vat_reversal
after insert on public.ledger_journal_entries for each row
execute function public.capture_inline_purchase_vat_reversal();

-- Final purchase evidence and posting metadata are immutable. Status, reversal
-- audit fields and settlement state remain mutable through their secured flows.
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
    or new.invoice_net_total is distinct from old.invoice_net_total
    or new.invoice_tax_total is distinct from old.invoice_tax_total
    or new.claim_input_vat is distinct from old.claim_input_vat
    or new.supplier_tax_pin is distinct from old.supplier_tax_pin
    or new.tax_invoice_number is distinct from old.tax_invoice_number
    or new.tax_invoice_date is distinct from old.tax_invoice_date
    or new.tax_point_at is distinct from old.tax_point_at
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_snapshot_status is distinct from old.tax_snapshot_status
    or new.accounting_posting_date is distinct from old.accounting_posting_date
    or new.accounting_period_id is distinct from old.accounting_period_id
    or new.posting_classification is distinct from old.posting_classification
    or new.posting_reason is distinct from old.posting_reason
    or new.purchase_posting_version is distinct from old.purchase_posting_version
    or new.is_late_tax_adjustment is distinct from old.is_late_tax_adjustment
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

-- VAT remains tax-point based. When the tax point is outside the open ledger
-- period, surface the purchase as a correction without mutating the old period.
create or replace function public.vat_late_transaction_schedule(
  p_company_id uuid,p_start_date date,p_end_date date,p_timezone text
)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at,x.id),'[]'::jsonb)
  from (
    select l.id,'offline'::text source,l.occurred_at,
      (l.occurred_at at time zone p_timezone)::date original_business_date,
      o.accounting_posting_date posting_date,l.reviewed_at,l.posted_order_id,
      null::uuid customer_receipt_id,l.status,o.gross_total,o.net_total,o.tax_total,
      l.status='approved' prior_period_correction
    from public.late_sale_reviews l
    left join public.orders o on o.id=l.posted_order_id and o.company_id=l.company_id
    where l.company_id=p_company_id and (
      (l.status='approved' and coalesce(o.accounting_posting_date,
        (l.reviewed_at at time zone p_timezone)::date) between p_start_date and p_end_date)
      or (l.status='pending' and (l.occurred_at at time zone p_timezone)::date
        between p_start_date and p_end_date)
    )
    union all
    select r.id,'mpesa'::text source,c.occurred_at,r.original_business_date,
      a.posting_date,r.reviewed_at,a.order_id posted_order_id,a.customer_receipt_id,
      r.status,coalesce(o.gross_total,cr.amount,c.amount) gross_total,
      coalesce(o.net_total,cr.amount,c.amount) net_total,coalesce(o.tax_total,0) tax_total,
      r.status='approved' prior_period_correction
    from public.mpesa_late_posting_reviews r
    join public.payment_collections c on c.id=r.collection_id
    left join public.payment_collection_allocations a on a.id=r.allocation_id
    left join public.orders o on o.id=a.order_id and o.company_id=r.company_id
    left join public.customer_receipts cr on cr.id=a.customer_receipt_id
      and cr.company_id=r.company_id
    where r.company_id=p_company_id and (
      (r.status='approved' and coalesce(a.posting_date,
        (r.reviewed_at at time zone p_timezone)::date) between p_start_date and p_end_date)
      or (r.status='pending' and r.original_business_date between p_start_date and p_end_date)
    )
    union all
    select p.id,'purchase_input_vat'::text source,p.tax_point_at occurred_at,
      (p.tax_point_at at time zone coalesce(cp.business_timezone,c.business_timezone))::date
        original_business_date,
      p.accounting_posting_date posting_date,p.created_at reviewed_at,
      null::uuid posted_order_id,null::uuid customer_receipt_id,'posted'::text status,
      p.gross_total,p.net_total,p.input_tax_total tax_total,true prior_period_correction
    from public.purchases p
    join public.companies c on c.id=p.company_id
    left join public.company_tax_profiles cp on cp.id=p.tax_profile_id
    where p.company_id=p_company_id and p.claim_input_vat
      and p.posting_classification='prior_period'
      and p.accounting_posting_date between p_start_date and p_end_date
  ) x
$$;
revoke execute on function public.vat_late_transaction_schedule(uuid,date,date,text)
  from public,anon,authenticated;

create or replace function public.vat_report(p_start_date date,p_end_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_timezone text;
  v_sales_gross bigint:=0;v_sales_net bigint:=0;v_output_vat bigint:=0;
  v_credit_note_vat bigint:=0;v_void_vat bigint:=0;
  v_purchase_input bigint:=0;v_expense_input bigint:=0;v_input_reversals bigint:=0;
  v_by_category jsonb:='[]'::jsonb;v_late_transactions jsonb:='[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'invalid_report_range'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;

  select coalesce(sum(o.gross_total),0),coalesce(sum(o.net_total),0),coalesce(sum(o.tax_total),0)
  into v_sales_gross,v_sales_net,v_output_vat
  from public.orders o
  where o.company_id=v_company_id and o.status in ('completed','voided')
    and o.tax_snapshot_status in ('final','legacy_unclassified')
    and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
      between p_start_date and p_end_date;

  select coalesce(sum(r.tax_total),0) into v_credit_note_vat
  from public.refunds r where r.company_id=v_company_id
    and (r.created_at at time zone v_timezone)::date between p_start_date and p_end_date;

  select coalesce(sum(o.tax_total),0) into v_void_vat
  from public.ledger_journal_entries e join public.orders o
    on o.id=e.source_id::uuid and o.company_id=e.company_id
  where e.company_id=v_company_id and e.source_type='VatSaleVoid'
    and e.entry_date between p_start_date and p_end_date;

  select coalesce(sum(p.input_tax_total),0) into v_purchase_input
  from public.purchases p
  join public.companies c on c.id=p.company_id
  left join public.company_tax_profiles cp on cp.id=p.tax_profile_id
  where p.company_id=v_company_id and p.tax_snapshot_status='final'
    and (p.tax_point_at at time zone coalesce(cp.business_timezone,c.business_timezone))::date
      between p_start_date and p_end_date;

  select coalesce(sum(d.input_tax_total),0) into v_expense_input
  from public.expense_documents d
  join public.companies c on c.id=d.company_id
  left join public.company_tax_profiles cp on cp.id=d.tax_profile_id
  where d.company_id=v_company_id
    and (d.tax_point_at at time zone coalesce(cp.business_timezone,c.business_timezone))::date
      between p_start_date and p_end_date;

  select coalesce(sum(x.input_tax_total),0) into v_input_reversals
  from (
    select p.input_tax_total
    from public.ledger_journal_entries e join public.purchases p
      on p.id=e.source_id::uuid and p.company_id=e.company_id
    where e.company_id=v_company_id and e.source_type='PurchaseVatReversal'
      and e.entry_date between p_start_date and p_end_date
    union all
    select r.input_tax_total from public.purchase_input_vat_reversals r
    where r.company_id=v_company_id
      and r.posting_date between p_start_date and p_end_date
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'classification',x.classification,'rate_bps',x.rate_bps,
    'gross',x.gross,'net',x.net,'tax',x.tax
  ) order by x.code,x.rate_bps),'[]'::jsonb) into v_by_category
  from (
    select a.code,a.classification,a.rate_bps,sum(a.gross)::bigint gross,
      sum(a.net)::bigint net,sum(a.tax)::bigint tax
    from (
      select l.tax_category_code code,l.tax_classification classification,l.tax_rate_bps rate_bps,
        l.gross_total gross,l.net_total net,l.tax_total tax
      from public.order_lines l join public.orders o on o.id=l.order_id
      where o.company_id=v_company_id and o.status in ('completed','voided')
        and o.tax_snapshot_status in ('final','legacy_unclassified')
        and l.tax_category_code is not null
        and public.order_vat_reporting_date(o.id,o.tax_point_at,v_timezone)
          between p_start_date and p_end_date
      union all
      select dl.tax_category_code,dl.tax_classification,dl.tax_rate_bps,
        -dl.gross_total,-dl.net_total,-dl.tax_total
      from public.refunds r join public.tax_document_lines dl on dl.tax_document_id=r.tax_document_id
      where r.company_id=v_company_id
        and (r.created_at at time zone v_timezone)::date between p_start_date and p_end_date
      union all
      select l.tax_category_code,l.tax_classification,l.tax_rate_bps,
        -l.gross_total,-l.net_total,-l.tax_total
      from public.ledger_journal_entries e join public.orders o
        on o.id=e.source_id::uuid and o.company_id=e.company_id
      join public.order_lines l on l.order_id=o.id
      where e.company_id=v_company_id and e.source_type='VatSaleVoid'
        and e.entry_date between p_start_date and p_end_date
    ) a group by a.code,a.classification,a.rate_bps
  ) x;

  v_late_transactions:=public.vat_late_transaction_schedule(
    v_company_id,p_start_date,p_end_date,v_timezone);
  return jsonb_build_object(
    'start_date',p_start_date,'end_date',p_end_date,
    'sales',jsonb_build_object('gross',v_sales_gross,'net',v_sales_net,
      'output_vat',v_output_vat,'output_vat_net',v_output_vat-v_credit_note_vat-v_void_vat),
    'by_category',v_by_category,
    'input_vat',v_purchase_input+v_expense_input-v_input_reversals,
    'input_vat_claimed',v_purchase_input+v_expense_input,
    'input_vat_reversals',v_input_reversals,
    'credit_note_vat',v_credit_note_vat,'void_vat',v_void_vat,
    'late_transactions',v_late_transactions,
    'net_vat_payable',v_output_vat-v_credit_note_vat-v_void_vat
      -(v_purchase_input+v_expense_input-v_input_reversals));
end;
$$;

-- Period rows are transaction identities, not disposable workflow scaffolding.
-- Close the existing row in place so journals and purchase posting snapshots
-- continue to reference the same period captured at finalization.
create or replace function public.close_accounting_period(p_end_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_timezone text;v_lock public.period_locks%rowtype;
  v_period public.accounting_periods%rowtype;v_requirement record;
  v_readiness jsonb;v_pack jsonb;v_next_start date;v_next_end date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  if p_end_date is null or p_end_date>(now() at time zone v_timezone)::date then
    raise exception 'invalid_period_end: cannot close a future period'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_lock from public.period_locks l
  where l.company_id=v_company_id for update;
  select * into v_period from public.accounting_periods p
  where p.company_id=v_company_id and p.status='open' for update;
  if v_period.id is null then raise exception 'open_period_not_found'; end if;
  if p_end_date<v_period.start_date or p_end_date>v_period.end_date then
    raise exception 'invalid_period_end: must fall within the open period (% to %)',
      v_period.start_date,v_period.end_date; end if;
  if v_lock.company_id is not null and p_end_date<=v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)',v_lock.lock_end_date;
  end if;

  v_readiness:=public.period_close_readiness(p_end_date);
  if exists(select 1 from public.cashier_sessions s
    where s.company_id=v_company_id and s.status='open') then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period'; end if;
  for v_requirement in
    select distinct pm.code,
      coalesce(lpm.ledger_account_code,pm.ledger_account_code) account_code,
      case when coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled)
        then lpm.location_id end required_location_id,
      case when coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled)
        then 'location' else 'company' end balance_scope,
      case when coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled)
        then l.name end location_name
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.company_id=pm.company_id
    join public.stock_locations l on l.id=lpm.location_id and l.is_active
    join public.ledger_accounts a on a.company_id=pm.company_id
      and a.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
    where pm.company_id=v_company_id and pm.enabled and lpm.enabled
      and coalesce(lpm.requires_reconciliation,pm.requires_reconciliation)
      and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting
    order by pm.code,account_code,required_location_id
  loop
    if not exists(select 1 from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id=r.id
      where r.company_id=v_company_id and r.status='verified'
        and r.created_at>coalesce(v_lock.updated_at,'-infinity'::timestamptz)
        and ra.account_code=v_requirement.account_code
        and ra.balance_scope=v_requirement.balance_scope
        and (v_requirement.required_location_id is null
          or r.location_id=v_requirement.required_location_id)) then
      if v_requirement.required_location_id is null then
        raise exception 'reconciliation_required: method % has no verified reconciliation this period',
          v_requirement.code;
      else
        raise exception 'reconciliation_required: method % at % has no verified reconciliation this period',
          v_requirement.code,v_requirement.location_name;
      end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(coalesce(v_readiness->'blockers','{}'::jsonb))) then
    raise exception 'period_not_ready: %',v_readiness->'blockers'; end if;

  insert into public.period_locks(company_id,lock_end_date,updated_at)
  values(v_company_id,p_end_date,now()) on conflict(company_id) do update
    set lock_end_date=excluded.lock_end_date,updated_at=excluded.updated_at;
  update public.accounting_periods set end_date=p_end_date,status='closed',
    closed_at=now(),closed_by=auth.uid() where id=v_period.id;
  v_pack:=public.build_period_closing_pack(v_period.id,v_period.start_date,p_end_date);
  insert into public.period_closing_packs(company_id,accounting_period_id,snapshot,created_by)
  values(v_company_id,v_period.id,v_pack,auth.uid());
  v_next_start:=p_end_date+1;
  v_next_end:=(date_trunc('month',v_next_start)+interval '1 month - 1 day')::date;
  insert into public.accounting_periods(company_id,start_date,end_date,status,created_by)
  values(v_company_id,v_next_start,v_next_end,'open',auth.uid());
  return v_period.id;
end;
$$;
