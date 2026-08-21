-- Forward repair for environments where 0126 was deployed before the
-- invoice-tax calculator was split from input-VAT claim eligibility.

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

create or replace function public.calculate_purchase_input_vat(
  p_company_id uuid,p_lines jsonb,p_expenses jsonb,p_tax_date date
)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.calculate_purchase_invoice_tax(p_company_id,p_lines,p_expenses,p_tax_date)
$$;
revoke execute on function public.calculate_purchase_input_vat(uuid,jsonb,jsonb,date)
  from public,anon,authenticated;
grant execute on function public.calculate_purchase_input_vat(uuid,jsonb,jsonb,date) to service_role;
