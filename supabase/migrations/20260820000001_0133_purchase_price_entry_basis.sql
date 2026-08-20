-- Purchase-wide price entry is presentation state. Drafts retain what the user
-- entered, while the canonical purchase and ledger continue to use gross values.

alter table public.purchase_drafts
  add column if not exists price_entry_basis text not null default 'inclusive'
    check(price_entry_basis in ('inclusive','exclusive'));

alter table public.purchases
  add column if not exists price_entry_basis text not null default 'inclusive'
    check(price_entry_basis in ('inclusive','exclusive')),
  add column if not exists price_entry_payload jsonb;

-- Views expand p.* at creation time; rebuild after adding the entry snapshot.
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

create or replace function public.purchase_tax_context(
  p_variant_ids uuid[],p_tax_date date default current_date
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_timezone text;v_point timestamptz;
  v_profile public.company_tax_profiles%rowtype;v_default_category uuid;
  v_item record;v_variant record;v_tax record;v_lines jsonb:='[]'::jsonb;
  v_expense jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_tax_date is null then raise exception 'purchase_tax_date_required'; end if;
  if coalesce(cardinality(p_variant_ids),0)>500 then raise exception 'purchase_tax_context_too_large'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from<=p_tax_date
    and (cp.effective_to is null or cp.effective_to>=p_tax_date)
  order by cp.effective_from desc limit 1;
  v_point:=(p_tax_date::timestamp at time zone coalesce(v_profile.business_timezone,v_timezone));
  v_default_category:=v_profile.default_tax_category_id;

  for v_item in
    select id,ordinality from unnest(coalesce(p_variant_ids,'{}'::uuid[]))
      with ordinality as requested(id,ordinality)
  loop
    select v.id,v.product_id into v_variant from public.product_variants v
    where v.id=v_item.id and v.company_id=v_company_id and v.kind='good';
    if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
    select * into v_tax from public.resolve_purchase_invoice_tax(
      v_company_id,v_variant.product_id,0,v_point);
    v_lines:=v_lines||jsonb_build_object(
      'variant_id',v_variant.id,'tax_profile_id',v_tax.tax_profile_id,
      'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
      'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
      'tax_rate_bps',v_tax.tax_rate_bps);
  end loop;

  select * into v_tax from public.resolve_purchase_invoice_category_tax(
    v_company_id,v_default_category,0,v_point);
  v_expense:=jsonb_build_object(
    'tax_profile_id',v_tax.tax_profile_id,'tax_category_id',v_tax.tax_category_id,
    'tax_rate_version_id',v_tax.tax_rate_version_id,
    'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
    'tax_rate_bps',v_tax.tax_rate_bps);
  return jsonb_build_object(
    'status','context','tax_configured',v_profile.id is not null,
    'vat_registered',coalesce(v_profile.vat_registered,false),
    'tax_profile_id',v_profile.id,'tax_point_at',v_point,
    'lines',v_lines,'supplier_expense',v_expense);
end;
$$;
revoke execute on function public.purchase_tax_context(uuid[],date) from public,anon;
grant execute on function public.purchase_tax_context(uuid[],date) to authenticated;

-- Exclusive-price drafts carry both the original values and the canonical gross
-- values. Confirmation rechecks that normalization with the effective rates.
create or replace function public.validate_purchase_price_payload(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date,p_price_entry_basis text
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_estimate jsonb;v_item record;v_tax jsonb;v_quantity numeric;v_entered bigint;
  v_actual bigint;v_expected bigint;v_source text;v_rate integer;
begin
  if p_price_entry_basis not in ('inclusive','exclusive') then
    raise exception 'invalid_purchase_price_entry_basis'; end if;
  v_estimate:=public.calculate_purchase_invoice_tax(
    p_company_id,p_lines,p_expenses,p_tax_date);
  if p_price_entry_basis='inclusive' then return v_estimate; end if;
  if not coalesce((v_estimate->>'tax_configured')::boolean,false) then
    raise exception 'exclusive_purchase_prices_require_vat_configuration'; end if;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    if coalesce(v_item.value->>'price_entry_basis','')<>'exclusive' then
      raise exception 'mixed_purchase_price_entry_basis'; end if;
    v_quantity:=nullif(v_item.value->>'quantity','')::numeric;
    v_source:=coalesce(nullif(v_item.value->>'entered_value_source',''),'unit');
    if v_source='total' then
      v_entered:=nullif(v_item.value->>'entered_line_total','')::bigint;
    elsif v_source='unit' then
      v_entered:=round(v_quantity*nullif(v_item.value->>'entered_unit_cost','')::bigint);
    else raise exception 'invalid_entered_purchase_value_source'; end if;
    if v_entered is null or v_entered<=0 then raise exception 'invalid_entered_purchase_price'; end if;
    if coalesce(v_item.value->>'value_source','unit')='total' then
      v_actual:=nullif(v_item.value->>'line_total','')::bigint;
    else
      v_actual:=round(v_quantity*nullif(v_item.value->>'unit_cost','')::bigint);
    end if;
    v_tax:=v_estimate->'lines'->((v_item.ordinality-1)::integer);
    v_rate:=coalesce((v_tax->>'tax_rate_bps')::integer,0);
    v_expected:=round(v_actual::numeric*10000/(10000+v_rate))::bigint;
    if v_entered is distinct from v_expected then
      raise exception 'purchase_price_normalization_changed'; end if;
  end loop;

  for v_item in
    select value,ordinality from jsonb_array_elements(p_expenses) with ordinality
  loop
    if coalesce(v_item.value->>'price_entry_basis','')<>'exclusive' then
      raise exception 'mixed_purchase_price_entry_basis'; end if;
    v_entered:=nullif(v_item.value->>'entered_amount','')::bigint;
    v_actual:=nullif(v_item.value->>'amount','')::bigint;
    if v_entered is null or v_entered<=0 then raise exception 'invalid_entered_purchase_expense'; end if;
    if v_item.value->>'settlement'='supplier_bill' then
      v_tax:=v_estimate->'expenses'->((v_item.ordinality-1)::integer);
      v_rate:=coalesce((v_tax->>'tax_rate_bps')::integer,0);
      v_expected:=round(v_actual::numeric*10000/(10000+v_rate))::bigint;
    else v_expected:=v_actual; end if;
    if v_entered is distinct from v_expected then
      raise exception 'purchase_expense_normalization_changed'; end if;
  end loop;
  return v_estimate;
end;
$$;
revoke execute on function public.validate_purchase_price_payload(uuid,jsonb,jsonb,date,text)
  from public,anon,authenticated;
grant execute on function public.validate_purchase_price_payload(uuid,jsonb,jsonb,date,text)
  to service_role;

create or replace function public.save_purchase_workspace_draft(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_reference text default null,p_notes text default null,p_purchase_date date default current_date,
  p_stock_location_id uuid default null,p_payment_mode text default 'later',
  p_payment_amount bigint default 0,p_advance_amount bigint default 0,
  p_account_code text default null,p_client_ref text default null,p_draft_id uuid default null,
  p_claim_input_vat boolean default false,p_tax_invoice_date date default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_id uuid;
  v_existing public.purchase_drafts%rowtype;v_hash text;
  v_client_ref text:=coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text);
  v_stock_location_id uuid:=p_stock_location_id;v_price_entry_basis text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  v_price_entry_basis:=coalesce(nullif(p_lines->0->>'price_entry_basis',''),'inclusive');
  if v_price_entry_basis not in ('inclusive','exclusive') then
    raise exception 'invalid_purchase_price_entry_basis'; end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where coalesce(nullif(l->>'price_entry_basis',''),'inclusive')<>v_price_entry_basis)
    or exists(select 1 from jsonb_array_elements(p_expenses) e
      where coalesce(nullif(e->>'price_entry_basis',''),'inclusive')<>v_price_entry_basis) then
    raise exception 'mixed_purchase_price_entry_basis'; end if;
  if v_stock_location_id is null then
    select l.id into v_stock_location_id from public.stock_locations l
    where l.company_id=v_company_id and l.is_default order by l.created_at,l.id limit 1;
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
    tax_invoice_date=case when p_claim_input_vat then p_tax_invoice_date end,
    price_entry_basis=v_price_entry_basis,updated_at=now()
  where d.id=v_id and d.company_id=v_company_id;
  return v_id;
end;
$$;

create or replace function public.finalize_purchase_draft_core(
  p_draft_id uuid,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_draft public.purchase_drafts%rowtype;v_purchase_id uuid;v_outstanding bigint;
  v_tax_date date;v_estimate jsonb;
begin
  select * into v_draft from public.purchase_drafts d where d.id=p_draft_id
    and d.company_id=(p_context).company_id for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  if v_draft.status='confirmed' and v_draft.posted_purchase_id is not null then
    return v_draft.posted_purchase_id; end if;
  if v_draft.status<>'draft' then raise exception 'purchase_draft_not_editable'; end if;
  v_tax_date:=case when v_draft.claim_input_vat then v_draft.tax_invoice_date
    else v_draft.purchase_date end;
  v_estimate:=public.validate_purchase_price_payload(v_draft.company_id,v_draft.lines,
    v_draft.expenses,v_tax_date,v_draft.price_entry_basis);
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
  update public.purchases set price_entry_basis=v_draft.price_entry_basis,
    price_entry_payload=jsonb_build_object(
      'snapshot_version','purchase_price_entry_v1','basis',v_draft.price_entry_basis,
      'entered_lines',v_draft.lines,'entered_expenses',v_draft.expenses,
      'invoice_lines',v_estimate->'lines','invoice_expenses',v_estimate->'expenses',
      'invoice_net_total',(v_estimate->>'net_total')::bigint,
      'invoice_tax_total',(v_estimate->>'tax_total')::bigint,
      'tax_point_at',v_estimate->>'tax_point_at')
  where id=v_purchase_id and company_id=v_draft.company_id;
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
revoke execute on function public.finalize_purchase_draft_core(uuid,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.finalize_purchase_draft_core(uuid,public.posting_context)
  to service_role;

-- The canonical finalizer fills the entry evidence immediately after inserting
-- the purchase. After that one transition it is part of the immutable snapshot.
create or replace function public.prevent_final_purchase_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
declare
  v_finalizing_price_entry boolean:=false;
begin
  if tg_op='DELETE' then
    if old.tax_snapshot_status='final' then raise exception 'final_tax_snapshot_immutable'; end if;
    return old;
  end if;
  v_finalizing_price_entry:=old.tax_snapshot_status='final'
    and old.price_entry_payload is null and new.price_entry_payload is not null;
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
    or (not v_finalizing_price_entry and (
      new.price_entry_basis is distinct from old.price_entry_basis
      or new.price_entry_payload is distinct from old.price_entry_payload
    ))
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;
