-- VAT accounting is enabled by company declaration. A tax registration number
-- is optional profile metadata used by printed documents and integrations.

do $$
declare v_constraint name;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.company_tax_profiles'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%vat_registered%'
    and pg_get_constraintdef(c.oid) like '%tax_registration_number%'
  limit 1;

  if v_constraint is not null then
    execute format(
      'alter table public.company_tax_profiles drop constraint %I',
      v_constraint
    );
  end if;
end;
$$;

create or replace function public.schedule_company_tax_profile(
  p_jurisdiction_id uuid,p_vat_registered boolean,p_tax_registration_number text,
  p_effective_from date,p_default_tax_category_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_id uuid;v_company_timezone text;
  v_profile_timezone text;
  v_business_date date;v_next_start date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  select c.business_timezone into v_company_timezone from public.companies c where c.id=v_company_id;
  v_business_date:=(now() at time zone v_company_timezone)::date;
  if p_effective_from is null or p_effective_from<v_business_date then
    raise exception 'tax_profile_cannot_be_backdated'; end if;
  select j.default_timezone into v_profile_timezone from public.tax_jurisdictions j
  where j.id=p_jurisdiction_id and j.active;
  if v_profile_timezone is null then raise exception 'invalid_tax_jurisdiction'; end if;
  if not exists(
    select 1 from public.tax_categories tc
    where tc.id=p_default_tax_category_id and tc.jurisdiction_id=p_jurisdiction_id and tc.active
      and tc.effective_from<=p_effective_from
      and (tc.effective_to is null or tc.effective_to>=p_effective_from)
      and exists(select 1 from public.tax_rate_versions tr where tr.tax_category_id=tc.id
        and tr.effective_from<=p_effective_from
        and (tr.effective_to is null or tr.effective_to>=p_effective_from))
  ) then raise exception 'invalid_default_tax_category'; end if;

  if p_effective_from=v_business_date and (
    exists(select 1 from public.ledger_journal_entries e
      where e.company_id=v_company_id and e.finalized_at is not null
        and e.entry_date=v_business_date)
    or exists(select 1 from public.orders o where o.company_id=v_company_id
      and o.status in('completed','voided')
      and (coalesce(o.tax_point_at,o.completed_at,o.created_at) at time zone v_company_timezone)::date=v_business_date)
  ) then
    raise exception 'tax_profile_today_has_financial_activity';
  end if;

  if p_effective_from>v_business_date then
    delete from public.company_tax_profiles cp
    where cp.company_id=v_company_id and cp.effective_from=p_effective_from;
  elsif exists(select 1 from public.company_tax_profiles cp
    where cp.company_id=v_company_id and cp.effective_from=p_effective_from) then
    raise exception 'active_tax_profile_cannot_be_replaced';
  end if;

  select min(cp.effective_from) into v_next_start
  from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from>p_effective_from;
  update public.company_tax_profiles
  set effective_to=p_effective_from-1
  where company_id=v_company_id and effective_from<p_effective_from
    and (effective_to is null or effective_to>=p_effective_from);
  insert into public.company_tax_profiles(
    company_id,jurisdiction_id,vat_registered,tax_registration_number,
    default_tax_category_id,effective_from,effective_to,business_timezone,created_by
  ) values(
    v_company_id,p_jurisdiction_id,p_vat_registered,
    nullif(btrim(coalesce(p_tax_registration_number,'')),''),p_default_tax_category_id,
    p_effective_from,case when v_next_start is null then null else v_next_start-1 end,
    v_profile_timezone,auth.uid()
  ) returning id into v_id;
  update public.companies
  set show_vat_breakdown_on_prints=case when p_vat_registered then true else show_vat_breakdown_on_prints end,
      updated_at=now()
  where id=v_company_id;
  return v_id;
end;
$$;

create or replace function public.update_company_tax_registration_number(
  p_profile_id uuid,p_tax_registration_number text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  update public.company_tax_profiles
  set tax_registration_number=nullif(btrim(coalesce(p_tax_registration_number,'')),'')
  where id=p_profile_id and company_id=v_company_id and vat_registered
  returning id into v_id;
  if v_id is null then raise exception 'vat_tax_profile_not_found'; end if;
  return v_id;
end;
$$;

revoke execute on function public.update_company_tax_registration_number(uuid,text)
  from public,anon;
grant execute on function public.update_company_tax_registration_number(uuid,text)
  to authenticated,service_role;
