-- PL/pgSQL table-return columns are variables. Qualify every catalog column so
-- resolver output names cannot collide with SQL column references.

create or replace function public.resolve_inclusive_tax(
  p_company_id uuid,p_product_id uuid,p_gross bigint,p_tax_point timestamptz
)
returns table(
  tax_profile_id uuid,tax_category_id uuid,tax_rate_version_id uuid,
  tax_category_code text,tax_classification text,tax_rate_bps integer,
  gross_total bigint,net_total bigint,tax_total bigint,vat_registered boolean
)
language plpgsql stable security definer set search_path='' as $$
declare
  v_tax_date date;v_timezone text;v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;v_rate public.tax_rate_versions%rowtype;v_override uuid;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_tax_date:=(p_tax_point at time zone v_timezone)::date;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id and cp.effective_from<=v_tax_date
    and (cp.effective_to is null or cp.effective_to>=v_tax_date)
  order by cp.effective_from desc limit 1;
  if v_profile.id is null or not v_profile.vat_registered then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;return;
  end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.company_id=p_company_id) then
    raise exception 'invalid_tax_product'; end if;
  select h.tax_category_id into v_override from public.product_tax_treatment_versions h
  where h.product_id=p_product_id and h.company_id=p_company_id and h.effective_from<=p_tax_point
    and (h.effective_to is null or h.effective_to>p_tax_point)
  order by h.effective_from desc limit 1;
  select tc.* into v_category from public.tax_categories tc
  where tc.id=coalesce(v_override,v_profile.default_tax_category_id)
    and tc.jurisdiction_id=v_profile.jurisdiction_id and tc.active;
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
  tax_total:=p_gross-net_total;vat_registered:=true;return next;
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
language plpgsql stable security definer set search_path='' as $$
declare
  v_timezone text;v_tax_date date;v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;v_rate public.tax_rate_versions%rowtype;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_tax_date:=(p_tax_point at time zone v_timezone)::date;
  select cp.* into v_profile from public.company_tax_profiles cp where cp.company_id=p_company_id
    and cp.effective_from<=v_tax_date and (cp.effective_to is null or cp.effective_to>=v_tax_date)
  order by cp.effective_from desc limit 1;
  if v_profile.id is null or not v_profile.vat_registered then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;return;
  end if;
  select tc.* into v_category from public.tax_categories tc
  where tc.id=coalesce(p_tax_category_id,v_profile.default_tax_category_id)
    and tc.jurisdiction_id=v_profile.jurisdiction_id and tc.active;
  if v_category.id is null then raise exception 'tax_category_not_configured'; end if;
  select tr.* into v_rate from public.tax_rate_versions tr where tr.tax_category_id=v_category.id
    and tr.effective_from<=v_tax_date and (tr.effective_to is null or tr.effective_to>=v_tax_date)
  order by tr.effective_from desc limit 1;
  if v_rate.id is null then raise exception 'tax_rate_not_configured: % on %',v_category.code,v_tax_date; end if;
  tax_profile_id:=v_profile.id;tax_category_id:=v_category.id;tax_rate_version_id:=v_rate.id;
  tax_category_code:=v_category.code;tax_classification:=v_category.classification;
  tax_rate_bps:=v_rate.rate_bps;gross_total:=p_gross;
  net_total:=round(p_gross::numeric*10000/(10000+v_rate.rate_bps))::bigint;
  tax_total:=p_gross-net_total;vat_registered:=true;return next;
end;
$$;
