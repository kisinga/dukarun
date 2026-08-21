-- Forward repair for environments where 0113 was deployed before purchase
-- invoice tax resolution was added to that historical migration.

create or replace function public.resolve_configured_product_tax(
  p_company_id uuid,p_product_id uuid,p_gross bigint,p_tax_point timestamptz,
  p_require_registration boolean
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language plpgsql stable security definer set search_path='' as $$
declare
  v_tax_date date;v_company_timezone text;v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;v_rate public.tax_rate_versions%rowtype;v_override uuid;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select c.business_timezone into v_company_timezone from public.companies c where c.id=p_company_id;
  if v_company_timezone is null then raise exception 'company_not_found'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id
    and cp.effective_from<=(p_tax_point at time zone cp.business_timezone)::date
    and (cp.effective_to is null
      or cp.effective_to>=(p_tax_point at time zone cp.business_timezone)::date)
  order by cp.effective_from desc limit 1;
  v_tax_date:=(p_tax_point at time zone coalesce(v_profile.business_timezone,v_company_timezone))::date;
  if v_profile.id is null or (p_require_registration and not v_profile.vat_registered) then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;return;
  end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.company_id=p_company_id) then
    raise exception 'invalid_tax_product';
  end if;
  select h.tax_category_id into v_override from public.product_tax_treatment_versions h
  where h.product_id=p_product_id and h.company_id=p_company_id and h.effective_from<=p_tax_point
    and (h.effective_to is null or h.effective_to>p_tax_point)
  order by h.effective_from desc limit 1;
  select tc.* into v_category from public.tax_categories tc
  where tc.id=coalesce(v_override,v_profile.default_tax_category_id)
    and tc.jurisdiction_id=v_profile.jurisdiction_id
    and tc.effective_from<=v_tax_date
    and (tc.effective_to is null or tc.effective_to>=v_tax_date);
  if v_category.id is null then raise exception 'tax_category_not_configured'; end if;
  select tr.* into v_rate from public.tax_rate_versions tr
  where tr.tax_category_id=v_category.id and tr.effective_from<=v_tax_date
    and (tr.effective_to is null or tr.effective_to>=v_tax_date)
  order by tr.effective_from desc limit 1;
  if v_rate.id is null then raise exception 'tax_rate_not_configured: % on %',v_category.code,v_tax_date; end if;
  tax_profile_id:=v_profile.id;tax_category_id:=v_category.id;tax_rate_version_id:=v_rate.id;
  tax_category_code:=v_category.code;tax_classification:=v_category.classification;
  tax_rate_bps:=v_rate.rate_bps;gross_total:=p_gross;
  net_total:=round(p_gross::numeric*10000/(10000+v_rate.rate_bps))::bigint;
  tax_total:=p_gross-net_total;vat_registered:=coalesce(v_profile.vat_registered,false);return next;
end;
$$;

create or replace function public.resolve_inclusive_tax(
  p_company_id uuid,p_product_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language sql stable security definer set search_path='' as $$
  select * from public.resolve_configured_product_tax(
    p_company_id,p_product_id,p_gross,p_tax_point,true)
$$;

create or replace function public.resolve_purchase_invoice_tax(
  p_company_id uuid,p_product_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language sql stable security definer set search_path='' as $$
  select * from public.resolve_configured_product_tax(
    p_company_id,p_product_id,p_gross,p_tax_point,false)
$$;

create or replace function public.resolve_configured_category_tax(
  p_company_id uuid,p_tax_category_id uuid,p_gross bigint,p_tax_point timestamptz,
  p_require_registration boolean
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language plpgsql stable security definer set search_path='' as $$
declare
  v_tax_date date;v_company_timezone text;v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;v_rate public.tax_rate_versions%rowtype;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select c.business_timezone into v_company_timezone from public.companies c where c.id=p_company_id;
  if v_company_timezone is null then raise exception 'company_not_found'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id
    and cp.effective_from<=(p_tax_point at time zone cp.business_timezone)::date
    and (cp.effective_to is null
      or cp.effective_to>=(p_tax_point at time zone cp.business_timezone)::date)
  order by cp.effective_from desc limit 1;
  v_tax_date:=(p_tax_point at time zone coalesce(v_profile.business_timezone,v_company_timezone))::date;
  if v_profile.id is null or (p_require_registration and not v_profile.vat_registered) then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;return;
  end if;
  select tc.* into v_category from public.tax_categories tc
  where tc.id=coalesce(p_tax_category_id,v_profile.default_tax_category_id)
    and tc.jurisdiction_id=v_profile.jurisdiction_id
    and tc.effective_from<=v_tax_date
    and (tc.effective_to is null or tc.effective_to>=v_tax_date);
  if v_category.id is null then raise exception 'tax_category_not_configured'; end if;
  select tr.* into v_rate from public.tax_rate_versions tr
  where tr.tax_category_id=v_category.id and tr.effective_from<=v_tax_date
    and (tr.effective_to is null or tr.effective_to>=v_tax_date)
  order by tr.effective_from desc limit 1;
  if v_rate.id is null then raise exception 'tax_rate_not_configured: % on %',v_category.code,v_tax_date; end if;
  tax_profile_id:=v_profile.id;tax_category_id:=v_category.id;tax_rate_version_id:=v_rate.id;
  tax_category_code:=v_category.code;tax_classification:=v_category.classification;
  tax_rate_bps:=v_rate.rate_bps;gross_total:=p_gross;
  net_total:=round(p_gross::numeric*10000/(10000+v_rate.rate_bps))::bigint;
  tax_total:=p_gross-net_total;vat_registered:=coalesce(v_profile.vat_registered,false);return next;
end;
$$;

create or replace function public.resolve_category_inclusive_tax(
  p_company_id uuid,p_tax_category_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language sql stable security definer set search_path='' as $$
  select * from public.resolve_configured_category_tax(
    p_company_id,p_tax_category_id,p_gross,p_tax_point,true)
$$;

create or replace function public.resolve_purchase_invoice_category_tax(
  p_company_id uuid,p_tax_category_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language sql stable security definer set search_path='' as $$
  select * from public.resolve_configured_category_tax(
    p_company_id,p_tax_category_id,p_gross,p_tax_point,false)
$$;

revoke execute on function public.resolve_configured_product_tax(
    uuid,uuid,bigint,timestamptz,boolean),
  public.resolve_purchase_invoice_tax(uuid,uuid,bigint,timestamptz),
  public.resolve_configured_category_tax(uuid,uuid,bigint,timestamptz,boolean),
  public.resolve_purchase_invoice_category_tax(uuid,uuid,bigint,timestamptz)
  from public,anon,authenticated;
grant execute on function public.resolve_configured_product_tax(
    uuid,uuid,bigint,timestamptz,boolean),
  public.resolve_purchase_invoice_tax(uuid,uuid,bigint,timestamptz),
  public.resolve_configured_category_tax(uuid,uuid,bigint,timestamptz,boolean),
  public.resolve_purchase_invoice_category_tax(uuid,uuid,bigint,timestamptz)
  to service_role;

-- Replace the already-deployed editor RPC so integer literals cannot select a
-- non-existent overload of the bigint tax resolvers at execution time.
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
      v_company_id,v_variant.product_id,0::bigint,v_point);
    v_lines:=v_lines||jsonb_build_object(
      'variant_id',v_variant.id,'tax_profile_id',v_tax.tax_profile_id,
      'tax_category_id',v_tax.tax_category_id,'tax_rate_version_id',v_tax.tax_rate_version_id,
      'tax_category_code',v_tax.tax_category_code,'tax_classification',v_tax.tax_classification,
      'tax_rate_bps',v_tax.tax_rate_bps);
  end loop;

  select * into v_tax from public.resolve_purchase_invoice_category_tax(
    v_company_id,v_default_category,0::bigint,v_point);
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
