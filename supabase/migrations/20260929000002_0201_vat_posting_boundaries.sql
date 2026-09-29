-- VAT changes are effective at a server instant, including during a trading day.
-- Keep legacy business-date columns for older readers; resolution uses [from_at,to_at).
alter table public.company_tax_profiles
  add column effective_from_at timestamptz,
  add column effective_to_at timestamptz;

update public.company_tax_profiles
set effective_from_at = effective_from::timestamp at time zone business_timezone,
    effective_to_at = (effective_to + 1)::timestamp at time zone business_timezone;

alter table public.company_tax_profiles
  alter column effective_from_at set not null,
  drop constraint company_tax_profiles_company_id_effective_from_key,
  add constraint company_tax_profiles_instant_unique unique(company_id,effective_from_at),
  add constraint company_tax_profiles_instant_range
    check(effective_to_at is null or effective_to_at > effective_from_at);

create index company_tax_profiles_instant_resolution_idx
  on public.company_tax_profiles(company_id,effective_from_at desc);

-- Also supports legacy internal provisioning and fixture inserts. Clients have no write grant.
create function public.normalize_tax_profile_boundaries()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.effective_from_at is null then
    new.effective_from_at := new.effective_from::timestamp at time zone new.business_timezone;
  elsif tg_op='UPDATE' and new.effective_from is distinct from old.effective_from
    and new.effective_from_at is not distinct from old.effective_from_at then
    new.effective_from_at := new.effective_from::timestamp at time zone new.business_timezone;
  end if;
  if tg_op='INSERT' and new.effective_to_at is null then
    new.effective_to_at := (new.effective_to+1)::timestamp at time zone new.business_timezone;
  elsif tg_op='UPDATE' and new.effective_to is distinct from old.effective_to
    and new.effective_to_at is not distinct from old.effective_to_at then
    new.effective_to_at := (new.effective_to+1)::timestamp at time zone new.business_timezone;
  end if;
  return new;
end;
$$;
create trigger company_tax_profiles_boundaries before insert or update
  on public.company_tax_profiles for each row execute function public.normalize_tax_profile_boundaries();
revoke all on function public.normalize_tax_profile_boundaries() from public,anon,authenticated;

create or replace function public.schedule_company_tax_profile(
  p_jurisdiction_id uuid,p_vat_registered boolean,p_tax_registration_number text,
  p_effective_from date default null,p_default_tax_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_id uuid;v_timezone text;
  v_now timestamptz;v_at timestamptz;v_today date;v_date date;v_next timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  select business_timezone into v_timezone from public.companies where id=v_company_id;
  v_now:=clock_timestamp();
  v_today:=(v_now at time zone v_timezone)::date;
  if p_effective_from < v_today then raise exception 'tax_profile_cannot_be_backdated'; end if;
  if p_vat_registered is null then raise exception 'vat_status_required'; end if;
  -- Null and today's date both mean immediately; future dates mean shop-local midnight.
  v_date:=coalesce(p_effective_from,v_today);
  v_at:=case when v_date=v_today then v_now else v_date::timestamp at time zone v_timezone end;
  if not exists(select 1 from public.tax_jurisdictions where id=p_jurisdiction_id
    and active and status='published') then raise exception 'invalid_tax_jurisdiction'; end if;
  if not exists(select 1 from public.tax_categories tc
    where tc.id=p_default_tax_category_id and tc.jurisdiction_id=p_jurisdiction_id and tc.active
      and tc.effective_from<=v_date and (tc.effective_to is null or tc.effective_to>=v_date)
      and exists(select 1 from public.tax_rate_versions tr where tr.tax_category_id=tc.id
        and tr.effective_from<=v_date and (tr.effective_to is null or tr.effective_to>=v_date)))
    then raise exception 'invalid_default_tax_category'; end if;

  if v_at>v_now then
    delete from public.company_tax_profiles where company_id=v_company_id and effective_from_at=v_at;
  end if;
  select min(effective_from_at) into v_next from public.company_tax_profiles
    where company_id=v_company_id and effective_from_at>v_at;
  update public.company_tax_profiles set effective_to_at=v_at,
    effective_to=greatest(effective_from,((v_at-interval '1 microsecond') at time zone business_timezone)::date)
  where company_id=v_company_id and effective_from_at<v_at
    and (effective_to_at is null or effective_to_at>v_at);
  insert into public.company_tax_profiles(company_id,jurisdiction_id,vat_registered,
    tax_registration_number,default_tax_category_id,effective_from,effective_to,
    effective_from_at,effective_to_at,business_timezone,created_by)
  values(v_company_id,p_jurisdiction_id,p_vat_registered,
    nullif(btrim(coalesce(p_tax_registration_number,'')),''),p_default_tax_category_id,v_date,
    case when v_next is null then null else ((v_next-interval '1 microsecond') at time zone v_timezone)::date end,
    v_at,v_next,v_timezone,auth.uid()) returning id into v_id;
  update public.companies set
    show_vat_breakdown_on_prints=case when p_vat_registered then true else show_vat_breakdown_on_prints end,
    updated_at=clock_timestamp() where id=v_company_id;
  return v_id;
end;
$$;

create or replace function public.cancel_scheduled_company_tax_profile(p_profile_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_profile public.company_tax_profiles%rowtype;
  v_previous uuid;v_next timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  select * into v_profile from public.company_tax_profiles
    where id=p_profile_id and company_id=v_company_id for update;
  if v_profile.id is null then raise exception 'scheduled_tax_profile_not_found'; end if;
  if v_profile.effective_from_at<=clock_timestamp() then
    raise exception 'active_tax_profile_cannot_be_cancelled'; end if;
  select id into v_previous from public.company_tax_profiles
    where company_id=v_company_id and effective_from_at<v_profile.effective_from_at
    order by effective_from_at desc limit 1 for update;
  select min(effective_from_at) into v_next from public.company_tax_profiles
    where company_id=v_company_id and effective_from_at>v_profile.effective_from_at;
  delete from public.company_tax_profiles where id=p_profile_id;
  update public.company_tax_profiles set effective_to_at=v_next,
    effective_to=case when v_next is null then null
      else ((v_next-interval '1 microsecond') at time zone business_timezone)::date end
    where id=v_previous;
  update public.companies set updated_at=clock_timestamp() where id=v_company_id;
  return p_profile_id;
end;
$$;

-- Capture and posting are distinct audit facts. Existing finalized rows keep their snapshots.
alter table public.orders add column captured_at timestamptz, add column posted_at timestamptz;
update public.orders set captured_at=coalesce(completed_at,created_at),posted_at=completed_at
  where status in('completed','voided');


-- Updated from 0139_purchase_tax_resolver_upgrade.sql
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
    and cp.effective_from_at<=p_tax_point
    and (cp.effective_to_at is null or cp.effective_to_at>p_tax_point)
  order by cp.effective_from_at desc limit 1;
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

-- Updated from 0139_purchase_tax_resolver_upgrade.sql
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
    and cp.effective_from_at<=p_tax_point
    and (cp.effective_to_at is null or cp.effective_to_at>p_tax_point)
  order by cp.effective_from_at desc limit 1;
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

-- Updated from 0113_vat_lifecycle_hardening.sql
create or replace function public.set_product_tax_category(
  p_product_id uuid,p_tax_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_profile public.company_tax_profiles%rowtype;v_today date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.company_id=v_company_id) then
    raise exception 'product_not_found'; end if;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=v_company_id
    and cp.effective_from_at<=statement_timestamp() and (cp.effective_to_at is null or cp.effective_to_at>statement_timestamp())
  order by cp.effective_from_at desc limit 1;
  v_today:=(now() at time zone coalesce(v_profile.business_timezone,'Africa/Nairobi'))::date;
  if p_tax_category_id is not null and not exists(
    select 1 from public.tax_categories tc where tc.id=p_tax_category_id
      and tc.jurisdiction_id=v_profile.jurisdiction_id and tc.active
      and tc.effective_from<=v_today and (tc.effective_to is null or tc.effective_to>=v_today)
      and exists(select 1 from public.tax_rate_versions tr where tr.tax_category_id=tc.id
        and tr.effective_from<=v_today and (tr.effective_to is null or tr.effective_to>=v_today))
  ) then raise exception 'invalid_tax_category'; end if;
  update public.products set tax_category_id=p_tax_category_id,updated_at=now()
  where id=p_product_id and company_id=v_company_id;
  return p_product_id;
end;
$$;

-- Updated from 0128_etims_integration_readiness.sql
create or replace function public.update_location_tax_branch_code(p_location_id uuid,p_branch_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_profile public.company_tax_profiles%rowtype;
  v_code text:=nullif(btrim(coalesce(p_branch_code,'')),'');
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: finance administration required'; end if;
  if v_code is null or length(v_code)>32 then raise exception 'invalid_tax_branch_code'; end if;
  select p.* into v_profile from public.company_tax_profiles p where p.company_id=v_company_id
    and p.vat_registered and p.effective_from_at<=statement_timestamp() and (p.effective_to_at is null or p.effective_to_at>statement_timestamp())
    order by p.effective_from_at desc limit 1;
  if v_profile.id is null then raise exception 'active_vat_profile_required'; end if;
  if not exists(select 1 from public.stock_locations l where l.id=p_location_id
    and l.company_id=v_company_id) then raise exception 'invalid_stock_location'; end if;
  insert into public.tax_integration_location_mappings(company_id,jurisdiction_id,location_id,
    provider_code,external_branch_code,created_by)
  values(v_company_id,v_profile.jurisdiction_id,p_location_id,'KRA_ETIMS',v_code,auth.uid())
  on conflict(company_id,jurisdiction_id,location_id,provider_code) do update set
    external_branch_code=excluded.external_branch_code,
    version=public.tax_integration_location_mappings.version+1,updated_at=now();
  return p_location_id;
end;
$$;

-- Updated from 0128_etims_integration_readiness.sql
create or replace function public.tax_integration_locations()
returns table(id uuid,code text,name text,tax_integration_branch_code text)
language sql stable security definer set search_path='' as $$
  select l.id,l.code,l.name,m.external_branch_code
  from public.stock_locations l
  left join lateral(select x.external_branch_code from public.tax_integration_location_mappings x
    join public.company_tax_profiles p on p.company_id=x.company_id
      and p.jurisdiction_id=x.jurisdiction_id
    where x.company_id=l.company_id and x.location_id=l.id and x.provider_code='KRA_ETIMS'
      and p.vat_registered and p.effective_from_at<=statement_timestamp() and (p.effective_to_at is null or p.effective_to_at>statement_timestamp())
    order by x.updated_at desc limit 1) m on true
  where l.company_id=public.current_company_id() and l.is_active
  order by l.name,l.id
$$;

-- Updated from 0106_product_import_tax_categories.sql
create or replace function public.finalize_catalog_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_import public.catalog_imports%rowtype;
  v_product record;
  v_variants jsonb;
  v_variant jsonb;
  v_product_id uuid;
  v_variant_label text;
  v_variant_position integer;
  v_manufacturer_id uuid;
  v_name text;
  v_created integer := 0;
  v_updated integer := 0;
  v_deactivated_products integer := 0;
  v_deactivated_variants integer := 0;
  v_result jsonb;
  v_error text;
  v_tax_category_id uuid;
  v_tax_category_code text;
  v_tax_jurisdiction_id uuid;
  v_has_tax_category boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;

  select * into v_import from public.catalog_imports
  where id = p_import_id and company_id = v_company_id
  for update;
  if not found then raise exception 'catalog_import_not_found'; end if;
  if v_import.status = 'completed' then return v_import.result; end if;
  if v_import.status <> 'processing' then raise exception 'catalog_import_not_open'; end if;
  if not exists (
    select 1 from public.catalog_import_staged_products where import_id = p_import_id
  ) then raise exception 'products_required'; end if;

  begin
    -- Set-wise ownership validation avoids repeatedly scanning growing UUID arrays.
    if exists (
      select 1
      from public.catalog_import_staged_products s
      left join public.products p
        on p.id = s.product_id and p.company_id = v_company_id
      where s.import_id = p_import_id and s.product_id is not null and p.id is null
    ) then raise exception 'staged_product_not_found'; end if;

    if exists (
      select 1
      from public.catalog_import_staged_variants s
      left join public.product_variants v
        on v.id = s.variant_id and v.product_id = s.product_id and v.company_id = v_company_id
      where s.import_id = p_import_id and s.variant_id is not null and v.id is null
    ) then raise exception 'staged_variant_not_found'; end if;

    if v_import.mode = 'replace' and (
      exists (
        select 1 from public.product_variants v
        where v.company_id = v_company_id
          and v.created_at <= v_import.source_exported_at
          and v.updated_at > v_import.source_exported_at
          and not exists (
            select 1 from public.catalog_import_staged_variants s
            where s.import_id = p_import_id and s.variant_id = v.id
          )
      ) or exists (
        select 1 from public.products p
        where p.company_id = v_company_id
          and p.created_at <= v_import.source_exported_at
          and p.updated_at > v_import.source_exported_at
          and not exists (
            select 1 from public.catalog_import_staged_products s
            where s.import_id = p_import_id and s.product_id = p.id
          )
      )
    ) then raise exception 'stale_export: omitted catalog items changed after export'; end if;

    perform set_config('app.cache_change_suppressed', 'on', true);

    for v_product in
      select * from public.catalog_import_staged_products
      where import_id = p_import_id
      order by chunk_index, product_index
    loop
      v_name := btrim(v_product.data ->> 'name');
      select jsonb_agg(data order by variant_index) into v_variants
      from public.catalog_import_staged_variants
      where import_id = p_import_id
        and chunk_index = v_product.chunk_index
        and product_index = v_product.product_index;

      v_manufacturer_id := null;
      if nullif(btrim(coalesce(v_product.data ->> 'manufacturer_name', '')), '') is not null then
        v_manufacturer_id := public.upsert_manufacturer(v_product.data ->> 'manufacturer_name');
      end if;

      v_has_tax_category := v_product.data ? 'tax_category_code';
      v_tax_category_code := upper(
        nullif(btrim(coalesce(v_product.data ->> 'tax_category_code', '')), '')
      );
      v_tax_category_id := null;
      if v_has_tax_category and v_tax_category_code is not null then
        select cp.jurisdiction_id into v_tax_jurisdiction_id
        from public.company_tax_profiles cp
        where cp.company_id = v_company_id
          and cp.effective_from_at<=statement_timestamp() and (cp.effective_to_at is null or cp.effective_to_at>statement_timestamp())
        order by cp.effective_from_at desc
        limit 1;

        select tc.id into v_tax_category_id
        from public.tax_categories tc
        join public.tax_jurisdictions tj on tj.id = tc.jurisdiction_id
        where tc.jurisdiction_id = v_tax_jurisdiction_id
          and tc.code = v_tax_category_code
          and tc.active
          and tj.status = 'published';
        if v_tax_category_id is null then
          raise exception 'invalid_tax_category_code: %', v_tax_category_code;
        end if;
      end if;

      v_product_id := v_product.product_id;
      if v_product_id is null then
        v_product_id := public.create_catalog_product_with_manufacturer(
          v_name, v_variants,
          nullif(btrim(coalesce(v_product.data ->> 'barcode', '')), ''),
          null, v_manufacturer_id
        );
        update public.products
        set active = coalesce((v_product.data ->> 'active')::boolean, true), updated_at = now()
        where id = v_product_id and company_id = v_company_id;

        v_variant_position := 0;
        for v_variant in select value from jsonb_array_elements(v_variants)
        loop
          v_variant_position := v_variant_position + 1;
          v_variant_label := nullif(btrim(coalesce(v_variant ->> 'name', '')), '');
          if v_variant_label is null then
            v_variant_label := case when jsonb_array_length(v_variants) = 1 then 'Default'
                                    else 'Variant ' || v_variant_position end;
          end if;
          update public.product_variants
          set active = coalesce((v_variant ->> 'active')::boolean, true), updated_at = now()
          where product_id = v_product_id and company_id = v_company_id
            and name = v_variant_label;
        end loop;
        v_created := v_created + 1;
      else
        perform public.update_catalog_product_with_manufacturer(
          v_product_id, v_name, v_variants,
          nullif(btrim(coalesce(v_product.data ->> 'barcode', '')), ''),
          coalesce((v_product.data ->> 'active')::boolean, true),
          v_manufacturer_id
        );
        v_updated := v_updated + 1;
      end if;

      if v_has_tax_category then
        update public.products
        set tax_category_id = v_tax_category_id, updated_at = now()
        where id = v_product_id and company_id = v_company_id;
      end if;
    end loop;

    if v_import.mode = 'replace' then
      update public.product_variants v
      set active = false, updated_at = now()
      where v.company_id = v_company_id and v.active
        and v.created_at <= v_import.source_exported_at
        and not exists (
          select 1 from public.catalog_import_staged_variants s
          where s.import_id = p_import_id and s.variant_id = v.id
        );
      get diagnostics v_deactivated_variants = row_count;

      update public.products p
      set active = false, updated_at = now()
      where p.company_id = v_company_id and p.active
        and p.created_at <= v_import.source_exported_at
        and not exists (
          select 1 from public.catalog_import_staged_products s
          where s.import_id = p_import_id and s.product_id = p.id
        );
      get diagnostics v_deactivated_products = row_count;
    end if;

    perform set_config('app.cache_change_suppressed', 'off', true);
    perform public.emit_cache_reset(v_company_id, 'catalog');

    v_result := jsonb_build_object(
      'status', 'completed', 'import_id', p_import_id, 'mode', v_import.mode,
      'created', v_created, 'updated', v_updated,
      'deactivated_products', v_deactivated_products,
      'deactivated_variants', v_deactivated_variants
    );
  exception when others then
    v_error := sqlerrm;
    v_result := jsonb_build_object(
      'status', 'failed', 'import_id', p_import_id,
      'mode', v_import.mode, 'error', v_error
    );
  end;

  update public.catalog_imports
  set status = v_result ->> 'status', result = v_result, completed_at = now()
  where id = p_import_id;
  delete from public.catalog_import_chunks where import_id = p_import_id;
  return v_result;
end;
$$;

-- Updated from 0113_vat_lifecycle_hardening.sql
create or replace function public.company_tax_settings()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'show_vat_breakdown_on_prints',c.show_vat_breakdown_on_prints,
    'business_timezone',c.business_timezone,
    'activation',jsonb_build_object(
      'business_date',(now() at time zone c.business_timezone)::date,
      'has_financial_activity_today',exists(select 1 from public.ledger_journal_entries e
        where e.company_id=c.id and e.finalized_at is not null
          and e.entry_date=(now() at time zone c.business_timezone)::date)
        or exists(select 1 from public.orders o where o.company_id=c.id
          and o.status in('completed','voided')
          and (coalesce(o.tax_point_at,o.completed_at,o.updated_at) at time zone c.business_timezone)::date
            =(now() at time zone c.business_timezone)::date),
      'earliest_effective_from',(statement_timestamp() at time zone c.business_timezone)::date,
      'immediate_available',true, 'server_time',statement_timestamp()),
    'active_profile',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'jurisdiction_id',p.jurisdiction_id,'country_code',j.country_code,
      'jurisdiction_name',j.name,'vat_registered',p.vat_registered,
      'tax_registration_number',p.tax_registration_number,
      'default_tax_category_id',p.default_tax_category_id,'effective_from',p.effective_from,
      'effective_to',p.effective_to,'effective_from_at',p.effective_from_at,'effective_to_at',p.effective_to_at,'business_timezone',p.business_timezone) end,
    'scheduled_profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sp.id,'jurisdiction_id',sp.jurisdiction_id,'country_code',sj.country_code,
      'jurisdiction_name',sj.name,'vat_registered',sp.vat_registered,
      'tax_registration_number',sp.tax_registration_number,
      'default_tax_category_id',sp.default_tax_category_id,'effective_from',sp.effective_from,
      'effective_to',sp.effective_to,'effective_from_at',sp.effective_from_at,'effective_to_at',sp.effective_to_at,'business_timezone',sp.business_timezone)
      order by sp.effective_from_at)
      from public.company_tax_profiles sp
      join public.tax_jurisdictions sj on sj.id=sp.jurisdiction_id
      where sp.company_id=c.id
        and sp.effective_from_at>statement_timestamp()),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tc.id,'code',tc.code,'name',tc.name,'classification',tc.classification,
      'is_default',tc.is_default,'rate_bps',rv.rate_bps,
      'rate_effective_from',rv.effective_from,'rate_effective_to',rv.effective_to)
      order by tc.is_default desc,tc.name)
      from public.tax_categories tc left join lateral(
        select r.* from public.tax_rate_versions r where r.tax_category_id=tc.id
          and r.effective_from<=(now() at time zone j.default_timezone)::date
          and (r.effective_to is null or r.effective_to>=(now() at time zone j.default_timezone)::date)
        order by r.effective_from desc limit 1) rv on true
      where tc.jurisdiction_id=p.jurisdiction_id and tc.active
        and tc.effective_from<=(now() at time zone j.default_timezone)::date
        and (tc.effective_to is null or tc.effective_to>=(now() at time zone j.default_timezone)::date)),
      '[]'::jsonb),
    'jurisdictions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tj.id,'country_code',tj.country_code,'name',tj.name,'currency_code',tj.currency_code,
      'default_timezone',tj.default_timezone,'status',tj.status) order by tj.name)
      from public.tax_jurisdictions tj where tj.status='published'),'[]'::jsonb)
  )
  from public.companies c
  left join lateral(select cp.* from public.company_tax_profiles cp where cp.company_id=c.id
    and cp.effective_from_at<=statement_timestamp() and (cp.effective_to_at is null or cp.effective_to_at>statement_timestamp())
    order by cp.effective_from_at desc limit 1) p on true
  left join public.tax_jurisdictions j on j.id=p.jurisdiction_id
  where c.id=public.current_company_id()
$$;

-- Updated from 0200_document_vat_presentation.sql
create or replace function public.snapshot_external_document_vat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_show boolean := false;
  v_registered boolean := false;
  v_pin text;
  v_document_number text;
  v_estimate jsonb;
  v_breakdown jsonb := '[]'::jsonb;
  v_gross bigint := 0;
  v_net bigint := 0;
  v_tax bigint := 0;
begin
  if new.document_type not in ('receipt', 'invoice', 'proforma') then
    return new;
  end if;
  select * into v_order
  from public.orders
  where id = new.subject_id and company_id = new.company_id;
  if v_order.id is null then
    return new;
  end if;

  select coalesce((document_designs->replace(new.document_type,'_','-')->>'showVatBreakdown')::boolean, show_vat_breakdown_on_prints) into v_show
  from public.companies where id = new.company_id;
  if v_order.tax_profile_id is not null then
    select vat_registered, tax_registration_number
    into v_registered, v_pin
    from public.company_tax_profiles
    where id = v_order.tax_profile_id;
  else
    select vat_registered, tax_registration_number
    into v_registered, v_pin
    from public.company_tax_profiles
    where company_id = new.company_id
      and effective_from_at <= statement_timestamp()
      and (effective_to_at is null or effective_to_at > statement_timestamp())
    order by effective_from_at desc
    limit 1;
  end if;

  -- Completed/voided legacy rows may be legacy_unclassified or even carry the
  -- old pending default when inserted directly. They are historical documents,
  -- never drafts to be recalculated with today's catalog.
  if v_order.status in ('completed', 'voided') then
    v_gross := coalesce(nullif(v_order.gross_total, 0), v_order.total);
    v_net := case
      when v_order.tax_snapshot_status = 'final' then v_order.net_total
      else v_gross
    end;
    v_tax := case
      when v_order.tax_snapshot_status = 'final' then v_order.tax_total
      else 0
    end;
    select td.document_number, td.issuer_tax_registration_number into v_document_number, v_pin
    from public.tax_documents td where td.id = v_order.tax_document_id;
    v_registered := v_document_number is not null;
    if v_order.tax_snapshot_status = 'final' then
      select coalesce(jsonb_agg(x order by x ->> 'code'), '[]'::jsonb)
      into v_breakdown
      from (
        select jsonb_build_object(
          'code', l.tax_category_code,
          'classification', l.tax_classification,
          'rate_bps', l.tax_rate_bps,
          'gross', sum(l.gross_total),
          'net', sum(l.net_total),
          'tax', sum(l.tax_total)
        ) x
        from public.order_lines l
        where l.order_id = v_order.id
        group by l.tax_category_code, l.tax_classification, l.tax_rate_bps
      ) q;
    end if;
  else
    v_estimate := public.estimate_order_tax(v_order.id);
    v_gross := coalesce((v_estimate ->> 'gross_total')::bigint, v_order.total);
    v_net := coalesce((v_estimate ->> 'net_total')::bigint, v_order.total);
    v_tax := coalesce((v_estimate ->> 'tax_total')::bigint, 0);
    select coalesce(jsonb_agg(x order by x ->> 'code'), '[]'::jsonb)
    into v_breakdown
    from (
      select jsonb_build_object(
        'code', line ->> 'tax_category_code',
        'classification', line ->> 'tax_classification',
        'rate_bps', (line ->> 'tax_rate_bps')::integer,
        'gross', sum((line ->> 'gross_total')::bigint),
        'net', sum((line ->> 'net_total')::bigint),
        'tax', sum((line ->> 'tax_total')::bigint)
      ) x
      from jsonb_array_elements(coalesce(v_estimate -> 'lines', '[]'::jsonb)) line
      group by line ->> 'tax_category_code', line ->> 'tax_classification',
        line ->> 'tax_rate_bps'
    ) q;
  end if;

  new.snapshot := coalesce(new.snapshot, '{}'::jsonb) || jsonb_build_object(
    'show_vat_breakdown', v_show,
    'vat_registered', coalesce(v_registered, false),
    'tax_registration_number', v_pin,
    'tax_document_number', v_document_number,
    'gross_total', v_gross,
    'net_total', v_net,
    'tax_total', v_tax,
    'tax_breakdown', v_breakdown
  );
  return new;
end;
$$;

-- Updated from 0139_purchase_tax_resolver_upgrade.sql
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
  -- Date-only supplier evidence uses the final configuration on its business date.
  -- Cap today's date at the server instant; never resolve a future activation.
  -- Finalized purchase snapshots retain the selected treatment.
  v_point:=case when p_tax_date=(statement_timestamp() at time zone v_timezone)::date
    then statement_timestamp()
    else ((p_tax_date+1)::timestamp at time zone v_timezone)-interval '1 microsecond' end;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from_at<=v_point
    and (cp.effective_to_at is null or cp.effective_to_at>v_point)
  order by cp.effective_from_at desc limit 1;
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

-- Updated from 0176_decimal_buying_costs.sql
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
  -- Date-only supplier evidence uses the final configuration on its business date.
  -- Cap today's date at the server instant; never resolve a future activation.
  -- Finalized purchase snapshots retain the selected treatment.
  v_point:=case when p_tax_date=(statement_timestamp() at time zone v_timezone)::date
    then statement_timestamp()
    else ((p_tax_date+1)::timestamp at time zone v_timezone)-interval '1 microsecond' end;
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.company_id=p_company_id and cp.effective_from_at<=v_point
    and (cp.effective_to_at is null or cp.effective_to_at>v_point)
  order by cp.effective_from_at desc limit 1;
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
      if nullif(v_item.value->>'unit_cost','')::numeric is null
        or (v_item.value->>'unit_cost')::numeric <= 0
        or (v_item.value->>'unit_cost')::numeric > 9007199254740991
        or (v_item.value->>'unit_cost')::numeric <> round((v_item.value->>'unit_cost')::numeric,2)
      then raise exception 'invalid_purchase_unit_cost'; end if;
      v_gross:=round(nullif(v_item.value->>'quantity','')::numeric
        *nullif(v_item.value->>'unit_cost','')::numeric);
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

-- Updated from 0114_vat_transaction_hardening.sql
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
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  -- Match the date-only supplier invoice policy used by purchases.
  v_point:=case when v_tax_date=(statement_timestamp() at time zone v_timezone)::date
    then statement_timestamp()
    else ((v_tax_date+1)::timestamp at time zone v_timezone)-interval '1 microsecond' end;
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

-- Updated from 0155_optional_vat_registration_number.sql
create or replace function public.update_company_tax_registration_number(
  p_profile_id uuid,p_tax_registration_number text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  update public.company_tax_profiles
  set tax_registration_number=nullif(btrim(coalesce(p_tax_registration_number,'')),'')
  where id=p_profile_id and company_id=v_company_id and vat_registered
  returning id into v_id;
  if v_id is null then raise exception 'vat_tax_profile_not_found'; end if;
  update public.companies set updated_at=clock_timestamp() where id=v_company_id;
  return v_id;
end;
$$;

-- Updated from 0163_product_packs.sql
create or replace function public.complete_order_core(
  p_order_id uuid,
  p_payments jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_receivable boolean;
  v_is_cod boolean;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_fifo jsonb;
  v_line_cogs bigint;
  v_persisted_line_cogs bigint;
  v_total_cogs bigint := 0;
  v_quantity_total numeric := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
  v_business_timezone text;
  v_entry_date date;
  v_actor uuid := (p_context).actor_id;
  v_posting_context public.posting_context;
  v_posted_at timestamptz;
begin
  if (p_context).company_id is null or (p_context).source not in (
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation',
    'fulfillment_dispatch'
  ) then raise exception 'invalid_posting_context'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = (p_context).company_id
  for update;
  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;
  if exists (
    select 1
    from public.order_lines line
    where line.order_id = p_order_id
    limit 1 offset 128
  ) then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  select company.business_timezone into v_business_timezone
  from public.companies company where company.id = v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch';
  end if;
  select approval.id into v_pending_approval
  from public.approvals approval
  where approval.company_id = v_order.company_id
    and approval.type = 'below_wholesale'
    and approval.status = 'pending'
    and approval.metadata ->> 'order_id' = p_order_id::text
  limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_receivable := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');
  v_is_cod := v_is_receivable and coalesce(v_order.receivable_kind = 'cod',false);
  v_is_credit := v_is_receivable and not coalesce(v_is_cod,false);
  update public.orders
  set receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end
  where id = p_order_id;
  if v_is_cod then
    if (p_context).source <> 'fulfillment_dispatch'
      or v_order.customer_id is null
      or not exists (
        select 1 from public.order_fulfillments fulfillment
        where fulfillment.order_id = p_order_id
          and fulfillment.company_id = v_order.company_id
          and fulfillment.collection_kind = 'cod'
          and fulfillment.fulfillment_type = 'delivery'
          and fulfillment.status = 'ready'
      )
    then raise exception 'invalid_cod_dispatch_context'; end if;
  elsif v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer
    from public.customers customer
    where customer.id = v_order.customer_id and customer.company_id = v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
        v_order.total) > 0
      and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    v_ar_balance := public.customer_credit_exposure(
      v_order.company_id, v_order.customer_id
    );

    if v_ar_balance + coalesce(
      nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
      v_order.total
    ) > v_customer.credit_limit and v_customer.credit_limit > 0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists (
          select 1
          from public.company_memberships membership
          join public.roles role
            on role.id = membership.role_id and role.company_id = membership.company_id
          where membership.company_id = v_order.company_id
            and membership.user_id = v_actor
            and membership.authorization_status = 'approved'
            and 'ApproveCustomerCredit' = any(role.permissions)
        )
        or coalesce(current_setting('app.approved_credit_order_id', true), '') = p_order_id::text
      then
        insert into public.approvals(
          company_id, type, status, metadata, requested_by, decided_by,
          decided_at, decision_reason
        ) values(
          v_order.company_id, 'overdraft', 'approved', jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ), auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_payments) payment
      where payment ->> 'method' = 'credit'
    ) then
      raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
    end if;

    with inserted as (
      insert into public.payments(
        company_id, order_id, method_code, amount, reference, mpesa_receipt,
        collection_allocation_id, location_id, cashier_session_id, ledger_account_code
      )
      select
        v_order.company_id, p_order_id, payment.method, payment.amount,
        payment.reference, payment.mpesa_receipt, payment.collection_allocation_id,
        v_order.location_id,
        coalesce((p_context).cashier_session_id, v_order.cashier_session_id),
        public.resolve_tender_account(
          v_order.company_id, v_order.location_id, payment.method, payment.account_code
        )
      from jsonb_to_recordset(p_payments) as payment(
        method text,
        amount bigint,
        reference text,
        mpesa_receipt text,
        collection_allocation_id uuid,
        account_code text
      )
      returning amount
    )
    select coalesce(sum(amount), 0)::bigint into v_paid from inserted;
    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select line.*, variant.track_inventory
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id
    order by line.variant_id,line.id
  loop
    v_quantity_total := v_quantity_total + v_line.stock_quantity;
    v_line_cogs := 0;
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.stock_quantity,
        'Sale', p_order_id::text
      );
      v_line_cogs := (v_fifo ->> 'total_cogs')::bigint;
      v_total_cogs := v_total_cogs + v_line_cogs;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
    update public.order_lines
    set cogs_total = v_line_cogs
    where id = v_line.id and company_id = v_order.company_id;
  end loop;

  select coalesce(sum(line.cogs_total), 0)::bigint
  into v_persisted_line_cogs
  from public.order_lines line
  where line.order_id = p_order_id and line.company_id = v_order.company_id;
  if v_persisted_line_cogs <> v_total_cogs then
    raise exception 'order_line_cogs_mismatch: lines % <> order %',
      v_persisted_line_cogs, v_total_cogs;
  end if;

  -- Stock and order locks are held. Serialize with VAT edits and choose one posting
  -- instant after any wait; an offline capture or provider receipt cannot backdate VAT.
  perform pg_advisory_xact_lock(hashtextextended(v_order.company_id::text,41));
  v_posted_at := clock_timestamp();
  v_entry_date := (v_posted_at at time zone v_business_timezone)::date;
  v_posting_context := row(
    (p_context).company_id, (p_context).location_id, (p_context).actor_id,
    (p_context).cashier_session_id, coalesce((p_context).occurred_at, v_posted_at),
    v_entry_date, (p_context).source, (p_context).late_reason
  )::public.posting_context;

  if v_is_receivable then
    perform public.post_journal_entry_with_context(
      v_order.company_id, case when v_is_cod then 'CodReceivable' else 'CreditSale' end,
      p_order_id::text,
      case when v_is_cod then 'COD receivable ' else 'Credit sale ' end || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total,
          'order_id', p_order_id, 'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'method', case when v_is_cod then 'cod' else 'credit' end
          )
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  else
    for v_payment_row in select payment.* from public.payments payment
      where payment.order_id = p_order_id
    loop
      perform public.post_journal_entry_with_context(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount,
            'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        ), v_posting_context
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry_with_context(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      receivable_kind = case when v_is_cod then 'cod' when v_is_credit then 'credit' end,
      cashier_pending_at = null,
      completed_at = v_posted_at,
      posted_at = v_posted_at,
      captured_at = coalesce(captured_at, (p_context).occurred_at, created_at),
      accounting_posting_date = v_entry_date,
      posting_source = (p_context).source,
      late_posting_reason = (p_context).late_reason,
      cashier_session_id = coalesce(cashier_session_id, (p_context).cashier_session_id),
      quantity_total = v_quantity_total,
      cogs_total = v_total_cogs,
      updated_at = now()
  where id = p_order_id;
  return p_order_id;
end;
$$;

-- Updated from 0102_vat_foundation.sql
create or replace function public.finalize_order_tax_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_line record;v_tax record;v_product_id uuid;v_registered boolean:=false;
  v_gross bigint:=0;v_net bigint:=0;v_tax_total bigint:=0;
  v_document_id uuid;v_document_number text;
begin
  if old.status='completed' or new.status<>'completed' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,41));
  new.posted_at:=coalesce(new.posted_at,clock_timestamp());
  new.captured_at:=coalesce(new.captured_at,new.completed_at,new.created_at);
  new.tax_point_at:=new.posted_at;
  new.completed_at:=new.posted_at;
  new.tax_profile_id:=null;
  for v_line in select l.*,v.product_id,v.name variant_name,p.name product_name
    from public.order_lines l join public.product_variants v on v.id=l.variant_id
    join public.products p on p.id=v.product_id where l.order_id=new.id order by l.created_at,l.id
  loop
    select * into v_tax from public.resolve_inclusive_tax(
      new.company_id,v_line.product_id,v_line.line_total,new.tax_point_at
    );
    update public.order_lines set
      tax_category_id=v_tax.tax_category_id,tax_rate_version_id=v_tax.tax_rate_version_id,
      tax_category_code=v_tax.tax_category_code,tax_classification=v_tax.tax_classification,
      tax_rate_bps=v_tax.tax_rate_bps,gross_total=v_tax.gross_total,
      net_total=v_tax.net_total,tax_total=v_tax.tax_total
    where id=v_line.id;
    new.tax_profile_id:=coalesce(new.tax_profile_id,v_tax.tax_profile_id);
    v_registered:=v_registered or v_tax.vat_registered;
    v_gross:=v_gross+v_tax.gross_total;v_net:=v_net+v_tax.net_total;
    v_tax_total:=v_tax_total+v_tax.tax_total;
  end loop;
  if v_gross<>new.total then raise exception 'tax_snapshot_total_mismatch'; end if;
  new.gross_total:=v_gross;new.net_total:=v_net;new.tax_total:=v_tax_total;
  new.tax_snapshot_status:='final';
  if v_registered then
    v_document_number:=public.next_tax_document_number(new.company_id,'invoice',new.tax_point_at);
    insert into public.tax_documents(company_id,document_kind,document_number,source_order_id,
      tax_profile_id,tax_point_at,gross_total,net_total,tax_total,created_by)
    values(new.company_id,'invoice',v_document_number,new.id,new.tax_profile_id,new.tax_point_at,
      v_gross,v_net,v_tax_total,coalesce(new.completed_by,auth.uid())) returning id into v_document_id;
    insert into public.tax_document_lines(company_id,tax_document_id,source_order_line_id,variant_id,
      description,quantity,tax_category_id,tax_rate_version_id,tax_category_code,
      tax_classification,tax_rate_bps,gross_total,net_total,tax_total)
    select l.company_id,v_document_id,l.id,l.variant_id,
      case when v.name='Default' then p.name else p.name||' — '||v.name end,l.quantity,
      l.tax_category_id,l.tax_rate_version_id,l.tax_category_code,l.tax_classification,
      l.tax_rate_bps,l.gross_total,l.net_total,l.tax_total
    from public.order_lines l join public.product_variants v on v.id=l.variant_id
    join public.products p on p.id=v.product_id where l.order_id=new.id;
    new.tax_document_id:=v_document_id;
  end if;
  return new;
end;
$$;


-- Provider allocations share the date/instant selected by sale completion.
create or replace function public.mpesa_post_reserved_allocation(
  p_collection_id uuid,p_allocation_id uuid,p_context public.posting_context,
  p_additional_payments jsonb default '[]'::jsonb
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_collection public.payment_collections%rowtype;
  v_allocation public.payment_collection_allocations%rowtype;v_order public.orders%rowtype;
  v_receipt public.customer_receipts%rowtype;v_payment jsonb;v_fulfillment_id uuid;
  v_intent public.mpesa_payment_intents%rowtype;v_fulfillment jsonb;v_account_code text;
  v_session_closed boolean:=false;v_timezone text;v_original_date date;
  v_posting_date date:=(p_context).posting_date;v_posted_at timestamptz;
begin
  if jsonb_typeof(p_additional_payments)<>'array' then
    raise exception 'additional_payments_must_be_array'; end if;
  select * into v_collection from public.payment_collections where id=p_collection_id for update;
  select * into v_allocation from public.payment_collection_allocations
    where id=p_allocation_id for update;
  if v_collection.id is null or v_allocation.id is null
    or v_collection.company_id is distinct from (p_context).company_id
    or v_allocation.company_id<>v_collection.company_id
    or v_allocation.collection_id<>v_collection.id or v_allocation.amount<>v_collection.amount
    or v_allocation.status<>'reserved' or v_collection.provider_status<>'received'
    or v_collection.verification_status='disputed' then
    raise exception 'mpesa_posting_evidence_mismatch'; end if;
  select ppa.ledger_account_code into v_account_code
  from public.payment_provider_accounts ppa
  where ppa.id=v_collection.provider_account_id and ppa.company_id=v_collection.company_id;
  if v_account_code is not null then
    v_account_code:=public.require_mpesa_money_account(v_collection.company_id,v_account_code);
  end if;
  if (p_context).cashier_session_id is not null then
    select s.status<>'open' into v_session_closed from public.cashier_sessions s
      where s.id=(p_context).cashier_session_id and s.company_id=v_collection.company_id;
  end if;
  if v_allocation.order_id is not null then
    select * into v_order from public.orders where id=v_allocation.order_id
      and company_id=v_collection.company_id for update;
    if v_order.id is null or v_order.location_id is distinct from (p_context).location_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    v_payment:=jsonb_build_array(jsonb_build_object('method','mpesa','amount',v_collection.amount,
      'reference',v_collection.provider_receipt,'mpesa_receipt',v_collection.provider_receipt,
      'collection_allocation_id',v_allocation.id,
      'account_code',coalesce(v_account_code,'')))||p_additional_payments;
    if v_order.receivable_kind='cod' and v_order.status='completed' then
      select f.id into v_fulfillment_id from public.order_fulfillments f
      where f.order_id=v_order.id and f.company_id=v_order.company_id;
      perform public.post_cod_payments_core(v_fulfillment_id,v_payment,p_context);
    else
      perform public.complete_order_core(v_order.id,v_payment,p_context);
      -- Completion chooses the authoritative posting instant after locking. The
      -- provider's occurrence date remains on the collection, not the allocation.
      select accounting_posting_date,posted_at into v_posting_date,v_posted_at
      from public.orders where id=v_order.id;
      select * into v_intent from public.mpesa_payment_intents
      where id=v_collection.mpesa_intent_id for update;
      if v_intent.fulfillment_request is not null then
        v_fulfillment:=public.create_order_fulfillment_core(
          v_order.id,v_order.customer_id,v_intent.fulfillment_request);
        v_fulfillment_id:=(v_fulfillment->>'fulfillment_id')::uuid;
        update public.mpesa_payment_intents set fulfillment_id=v_fulfillment_id,updated_at=now()
        where id=v_intent.id and fulfillment_id is null;
      end if;
    end if;
  elsif v_allocation.customer_receipt_id is not null then
    select * into v_receipt from public.customer_receipts where id=v_allocation.customer_receipt_id
      and company_id=v_collection.company_id for update;
    if v_receipt.id is null or v_receipt.location_id is distinct from (p_context).location_id
      or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    update public.customer_receipts set reference=v_collection.provider_receipt,
      collection_allocation_id=v_allocation.id,
      ledger_account_code=coalesce(v_account_code,ledger_account_code)
    where id=v_receipt.id;
    perform public.execute_customer_receipt_core(v_receipt.id,p_context);
  else raise exception 'unsupported_mpesa_subject'; end if;
  update public.payment_collection_allocations set status='posted',posted_at=coalesce(v_posted_at,clock_timestamp()),
    cashier_session_id=(p_context).cashier_session_id,posting_date=v_posting_date,
    posted_after_session_close=v_session_closed,updated_at=now() where id=v_allocation.id;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_session_closed then
    select c.business_timezone into v_timezone from public.companies c where c.id=v_collection.company_id;
    v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
    update public.daily_business_closes set status='invalidated',invalidated_at=now(),
      invalidation_reason='Provider payment settled after the initiating till closed'
    where company_id=v_collection.company_id and business_date=v_original_date
      and status='signed_off';
  end if;
end $$;
