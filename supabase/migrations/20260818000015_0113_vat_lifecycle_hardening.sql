-- VAT lifecycle hardening: effective-dated catalog retirement, safe rate
-- supersession, profile-local tax timezones, immutable fiscal snapshots, and
-- visible future company tax profiles.

alter table public.tax_categories
  add column effective_from date not null default '-infinity'::date,
  add column effective_to date,
  add constraint tax_categories_effective_dates_check
    check (effective_to is null or effective_to >= effective_from);

alter table public.company_tax_profiles
  add column business_timezone text;

update public.company_tax_profiles cp
set business_timezone = j.default_timezone
from public.tax_jurisdictions j
where j.id = cp.jurisdiction_id
  and cp.business_timezone is null;

alter table public.company_tax_profiles
  alter column business_timezone set not null;

create or replace function public.initialize_company_vat_and_period()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_business_date date;
begin
  v_business_date:=(now() at time zone coalesce(new.business_timezone,'Africa/Nairobi'))::date;
  insert into public.company_tax_profiles(
    company_id,jurisdiction_id,vat_registered,tax_registration_number,
    default_tax_category_id,effective_from,business_timezone
  )
  select new.id,j.id,false,null,c.id,date '1900-01-01',j.default_timezone
  from public.tax_jurisdictions j
  join public.tax_categories c on c.jurisdiction_id=j.id and c.is_default and c.active
  where j.country_code='KE'
  on conflict do nothing;
  insert into public.accounting_periods(
    company_id,start_date,end_date,status,created_by
  ) values(
    new.id,date_trunc('month',v_business_date)::date,
    (date_trunc('month',v_business_date)+interval '1 month - 1 day')::date,
    'open',auth.uid()
  ) on conflict do nothing;
  return new;
end;
$$;

-- Final tax snapshots stay final after a completed order is voided.
create or replace function public.prevent_final_tax_snapshot_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.tax_snapshot_status in ('final','legacy_unclassified')
    and old.status in ('completed','voided') and (
      new.tax_point_at is distinct from old.tax_point_at
      or new.tax_profile_id is distinct from old.tax_profile_id
      or new.gross_total is distinct from old.gross_total
      or new.net_total is distinct from old.net_total
      or new.tax_total is distinct from old.tax_total
      or new.tax_document_id is distinct from old.tax_document_id
      or new.tax_snapshot_status is distinct from old.tax_snapshot_status
    ) then
    raise exception 'final_tax_snapshot_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_completed_order_line_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(
    select 1 from public.orders o
    where o.id = old.order_id
      and o.status in ('completed','voided')
      and o.tax_snapshot_status in ('final','legacy_unclassified')
  ) and (
    new.tax_category_id is distinct from old.tax_category_id
    or new.tax_rate_version_id is distinct from old.tax_rate_version_id
    or new.tax_category_code is distinct from old.tax_category_code
    or new.tax_classification is distinct from old.tax_classification
    or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.tax_total is distinct from old.tax_total
  ) then
    raise exception 'final_tax_snapshot_immutable';
  end if;
  return new;
end;
$$;

-- One boundary instant closes the old product treatment and starts the new one.
create or replace function public.track_product_tax_treatment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_changed_at timestamptz := clock_timestamp();
begin
  if tg_op='UPDATE' and new.tax_category_id is not distinct from old.tax_category_id then
    return new;
  end if;
  if tg_op='UPDATE' then
    update public.product_tax_treatment_versions
    set effective_to=v_changed_at,changed_by=auth.uid()
    where product_id=new.id and effective_to is null;
  end if;
  insert into public.product_tax_treatment_versions(
    company_id,product_id,tax_category_id,effective_from,changed_by
  ) values(new.company_id,new.id,new.tax_category_id,v_changed_at,auth.uid());
  return new;
end;
$$;

-- Statutory document snapshots are immutable; only future submission metadata
-- may change after issue.
create or replace function public.prevent_tax_document_fiscal_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception 'tax_document_immutable';
  end if;
  if new.company_id is distinct from old.company_id
    or new.document_kind is distinct from old.document_kind
    or new.document_number is distinct from old.document_number
    or new.source_order_id is distinct from old.source_order_id
    or new.original_document_id is distinct from old.original_document_id
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_point_at is distinct from old.tax_point_at
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.tax_total is distinct from old.tax_total
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'tax_document_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_tax_document_line_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'tax_document_line_immutable';
end;
$$;

drop trigger if exists tax_documents_fiscal_immutable on public.tax_documents;
create trigger tax_documents_fiscal_immutable
before update or delete on public.tax_documents
for each row execute function public.prevent_tax_document_fiscal_mutation();

drop trigger if exists tax_document_lines_immutable on public.tax_document_lines;
create trigger tax_document_lines_immutable
before update or delete on public.tax_document_lines
for each row execute function public.prevent_tax_document_line_mutation();

-- Published rates remain immutable except for a controlled, forward-only close
-- performed atomically while publishing their successor.
create or replace function public.prevent_published_tax_rate_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE'
    and current_setting('app.tax_rate_supersede',true)='on'
    and new.id=old.id
    and new.tax_category_id=old.tax_category_id
    and new.rate_bps=old.rate_bps
    and new.effective_from=old.effective_from
    and new.effective_to is not null
    and new.effective_to>=old.effective_from
    and (old.effective_to is null or new.effective_to<=old.effective_to)
    and new.notes is not distinct from old.notes
    and new.published_at=old.published_at
    and new.published_by is not distinct from old.published_by
    and new.created_at=old.created_at then
    return new;
  end if;
  raise exception 'published_tax_rate_immutable';
end;
$$;

create or replace function public.platform_publish_tax_rate_version(
  p_tax_category_id uuid,
  p_rate_bps integer,
  p_effective_from date,
  p_effective_to date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_predecessor public.tax_rate_versions%rowtype;
  v_next_start date;
  v_effective_to date := p_effective_to;
begin
  perform public.assert_platform_admin();
  if p_rate_bps is null or p_rate_bps<0 or p_effective_from is null
    or (p_effective_to is not null and p_effective_to<p_effective_from) then
    raise exception 'invalid_tax_rate_version';
  end if;
  if not exists(
    select 1 from public.tax_categories tc
    where tc.id=p_tax_category_id
      and tc.effective_from<=p_effective_from
      and (tc.effective_to is null or tc.effective_to>=p_effective_from)
  ) then
    raise exception 'tax_category_not_effective';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tax-rate:'||p_tax_category_id::text,0));

  if exists(
    select 1 from public.tax_rate_versions r
    where r.tax_category_id=p_tax_category_id and r.effective_from=p_effective_from
  ) then
    raise exception 'tax_rate_effective_date_exists';
  end if;

  select r.* into v_predecessor
  from public.tax_rate_versions r
  where r.tax_category_id=p_tax_category_id
    and r.effective_from<p_effective_from
    and (r.effective_to is null or r.effective_to>=p_effective_from)
  order by r.effective_from desc limit 1 for update;

  if v_predecessor.id is not null then
    if p_effective_from<=current_date then
      raise exception 'published_tax_rate_cannot_be_retroactively_superseded';
    end if;
    perform set_config('app.tax_rate_supersede','on',true);
    update public.tax_rate_versions
    set effective_to=p_effective_from-1
    where id=v_predecessor.id;
  end if;

  select min(r.effective_from) into v_next_start
  from public.tax_rate_versions r
  where r.tax_category_id=p_tax_category_id
    and r.effective_from>p_effective_from;
  if v_next_start is not null then
    if v_effective_to is null then
      v_effective_to:=v_next_start-1;
    elsif v_effective_to>=v_next_start then
      raise exception 'tax_rate_effective_dates_overlap';
    end if;
  end if;

  perform public.assert_tax_rate_window_available(
    p_tax_category_id,p_effective_from,v_effective_to
  );
  insert into public.tax_rate_versions(
    tax_category_id,rate_bps,effective_from,effective_to,notes,published_by
  ) values(
    p_tax_category_id,p_rate_bps,p_effective_from,v_effective_to,
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Catalog retirement is effective-dated. Retired categories remain resolvable
-- for historical tax points but cannot be assigned to new transactions.
create or replace function public.platform_upsert_tax_category(
  p_jurisdiction_id uuid,p_code text,p_name text,p_classification text,
  p_is_default boolean default false,p_active boolean default true
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_existing public.tax_categories%rowtype;
begin
  perform public.assert_platform_admin();
  if p_classification not in ('standard','special','zero_rated','exempt') then
    raise exception 'invalid_tax_classification';
  end if;
  if p_is_default and not p_active then
    raise exception 'default_tax_category_must_be_active';
  end if;

  select tc.* into v_existing from public.tax_categories tc
  where tc.jurisdiction_id=p_jurisdiction_id and tc.code=upper(btrim(p_code))
  for update;
  if v_existing.id is not null and not p_active and exists(
    select 1 from public.company_tax_profiles cp
      where cp.default_tax_category_id=v_existing.id
        and (cp.effective_to is null or cp.effective_to>=current_date)
    union all
    select 1 from public.products p where p.tax_category_id=v_existing.id limit 1
  ) then
    raise exception 'tax_category_in_use';
  end if;

  if p_is_default then
    update public.tax_categories set is_default=false,updated_at=now()
    where jurisdiction_id=p_jurisdiction_id and is_default;
  end if;
  insert into public.tax_categories(
    jurisdiction_id,code,name,classification,is_default,active,effective_to
  ) values(
    p_jurisdiction_id,upper(btrim(p_code)),btrim(p_name),p_classification,
    p_is_default,p_active,case when p_active then null else current_date-1 end
  )
  on conflict(jurisdiction_id,code) do update
  set name=excluded.name,
      classification=excluded.classification,
      is_default=excluded.is_default,
      active=excluded.active,
      effective_to=case when excluded.active then null else current_date-1 end,
      updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Resolve the company profile using the timezone captured on that profile, not
-- whichever timezone the company happens to use today.
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
  if v_profile.id is null or not v_profile.vat_registered then
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
  if v_profile.id is null or not v_profile.vat_registered then
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
  tax_total:=p_gross-net_total;vat_registered:=true;return next;
end;
$$;

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
    and cp.effective_from<=(now() at time zone cp.business_timezone)::date
    and (cp.effective_to is null or cp.effective_to>=(now() at time zone cp.business_timezone)::date)
  order by cp.effective_from desc limit 1;
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
  if p_vat_registered and btrim(coalesce(p_tax_registration_number,''))='' then
    raise exception 'tax_registration_number_required'; end if;
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

  -- A tax profile is selected by the transaction tax point, not by the ledger
  -- period. Starting today is safe only before any financial fact for today has
  -- been finalized; otherwise the first safe date is tomorrow.
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

  -- An unused future profile at the same date is replaceable. This keeps the
  -- onboarding flow forgiving without making an active snapshot mutable.
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

create or replace function public.cancel_scheduled_company_tax_profile(p_profile_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_profile public.company_tax_profiles%rowtype;
  v_business_date date;v_previous_id uuid;v_next_start date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  select cp.* into v_profile from public.company_tax_profiles cp
  where cp.id=p_profile_id and cp.company_id=v_company_id for update;
  if v_profile.id is null then raise exception 'scheduled_tax_profile_not_found'; end if;
  v_business_date:=(now() at time zone v_profile.business_timezone)::date;
  if v_profile.effective_from<=v_business_date then
    raise exception 'active_tax_profile_cannot_be_cancelled'; end if;
  select cp.id into v_previous_id from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from<v_profile.effective_from
  order by cp.effective_from desc limit 1 for update;
  select min(cp.effective_from) into v_next_start from public.company_tax_profiles cp
  where cp.company_id=v_company_id and cp.effective_from>v_profile.effective_from;
  delete from public.company_tax_profiles where id=v_profile.id;
  update public.company_tax_profiles
  set effective_to=case when v_next_start is null then null else v_next_start-1 end
  where id=v_previous_id;
  return v_profile.id;
end;
$$;

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
      'earliest_effective_from',case when exists(select 1 from public.ledger_journal_entries e
        where e.company_id=c.id and e.finalized_at is not null
          and e.entry_date=(now() at time zone c.business_timezone)::date)
        or exists(select 1 from public.orders o where o.company_id=c.id
          and o.status in('completed','voided')
          and (coalesce(o.tax_point_at,o.completed_at,o.updated_at) at time zone c.business_timezone)::date
            =(now() at time zone c.business_timezone)::date)
        then (now() at time zone c.business_timezone)::date+1
        else (now() at time zone c.business_timezone)::date end),
    'active_profile',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'jurisdiction_id',p.jurisdiction_id,'country_code',j.country_code,
      'jurisdiction_name',j.name,'vat_registered',p.vat_registered,
      'tax_registration_number',p.tax_registration_number,
      'default_tax_category_id',p.default_tax_category_id,'effective_from',p.effective_from,
      'effective_to',p.effective_to,'business_timezone',p.business_timezone) end,
    'scheduled_profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sp.id,'jurisdiction_id',sp.jurisdiction_id,'country_code',sj.country_code,
      'jurisdiction_name',sj.name,'vat_registered',sp.vat_registered,
      'tax_registration_number',sp.tax_registration_number,
      'default_tax_category_id',sp.default_tax_category_id,'effective_from',sp.effective_from,
      'effective_to',sp.effective_to,'business_timezone',sp.business_timezone)
      order by sp.effective_from)
      from public.company_tax_profiles sp
      join public.tax_jurisdictions sj on sj.id=sp.jurisdiction_id
      where sp.company_id=c.id
        and sp.effective_from>(now() at time zone sp.business_timezone)::date),'[]'::jsonb),
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
    and cp.effective_from<=(now() at time zone cp.business_timezone)::date
    and (cp.effective_to is null or cp.effective_to>=(now() at time zone cp.business_timezone)::date)
    order by cp.effective_from desc limit 1) p on true
  left join public.tax_jurisdictions j on j.id=p.jurisdiction_id
  where c.id=public.current_company_id()
$$;

revoke execute on function public.prevent_tax_document_fiscal_mutation(),
  public.prevent_tax_document_line_mutation() from public,anon,authenticated;
grant execute on function public.prevent_tax_document_fiscal_mutation(),
  public.prevent_tax_document_line_mutation() to service_role;

-- ---------------------------------------------------------------------------
-- Country-package commissioning. A draft package is editable but invisible to
-- companies; publication is one validated state transition.
-- ---------------------------------------------------------------------------
create or replace function public.platform_upsert_tax_jurisdiction(
  p_country_code text,p_name text,p_currency_code text,p_default_timezone text,
  p_active boolean default false
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing public.tax_jurisdictions%rowtype;v_id uuid;
begin
  perform public.assert_platform_admin();
  if coalesce(p_active,false) then
    raise exception 'tax_package_must_be_published_after_readiness';
  end if;
  if upper(btrim(coalesce(p_country_code,'')))!~'^[A-Z]{2}$'
    or upper(btrim(coalesce(p_currency_code,'')))!~'^[A-Z]{3}$'
    or btrim(coalesce(p_name,''))='' or btrim(coalesce(p_default_timezone,''))='' then
    raise exception 'invalid_tax_jurisdiction';
  end if;
  select j.* into v_existing from public.tax_jurisdictions j
  where j.country_code=upper(btrim(p_country_code)) for update;
  if v_existing.id is null then
    insert into public.tax_jurisdictions(country_code,name,currency_code,default_timezone,status)
    values(upper(btrim(p_country_code)),btrim(p_name),upper(btrim(p_currency_code)),
      btrim(p_default_timezone),'draft') returning id into v_id;
    return v_id;
  end if;
  if v_existing.status<>'draft' then raise exception 'published_tax_jurisdiction_immutable'; end if;
  update public.tax_jurisdictions set name=btrim(p_name),
    currency_code=upper(btrim(p_currency_code)),default_timezone=btrim(p_default_timezone),
    updated_at=now() where id=v_existing.id returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_upsert_tax_category(
  p_jurisdiction_id uuid,p_code text,p_name text,p_classification text,
  p_is_default boolean default false,p_active boolean default true
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_jurisdiction public.tax_jurisdictions%rowtype;
  v_existing public.tax_categories%rowtype;v_id uuid;v_category_active boolean;
begin
  perform public.assert_platform_admin();
  if p_classification not in('standard','special','zero_rated','exempt')
    or upper(btrim(coalesce(p_code,'')))!~'^[A-Z][A-Z0-9_]*$'
    or btrim(coalesce(p_name,''))='' then raise exception 'invalid_tax_category'; end if;
  select j.* into v_jurisdiction from public.tax_jurisdictions j
    where j.id=p_jurisdiction_id for update;
  if v_jurisdiction.id is null or v_jurisdiction.status='retired' then
    raise exception 'tax_jurisdiction_not_editable'; end if;
  select c.* into v_existing from public.tax_categories c
  where c.jurisdiction_id=p_jurisdiction_id and c.code=upper(btrim(p_code)) for update;
  if v_existing.id is not null and v_jurisdiction.status='published' then
    if v_existing.classification<>p_classification
      or v_existing.is_default<>p_is_default or not p_active then
      raise exception 'published_tax_category_meaning_immutable';
    end if;
    update public.tax_categories set name=btrim(p_name),updated_at=now()
      where id=v_existing.id returning id into v_id;
    return v_id;
  end if;
  if p_is_default and p_active then
    update public.tax_categories set is_default=false,updated_at=now()
      where jurisdiction_id=p_jurisdiction_id and is_default and active;
  end if;
  v_category_active:=case when v_jurisdiction.status='draft' then p_active else false end;
  insert into public.tax_categories(
    jurisdiction_id,code,name,classification,is_default,active,effective_to
  ) values(
    p_jurisdiction_id,upper(btrim(p_code)),btrim(p_name),p_classification,
    p_is_default,v_category_active,null
  ) on conflict(jurisdiction_id,code) do update set
    name=excluded.name,classification=excluded.classification,
    is_default=excluded.is_default,active=excluded.active,effective_to=null,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_tax_package_readiness(p_jurisdiction_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_jurisdiction public.tax_jurisdictions%rowtype;v_blockers jsonb;v_today date:=current_date;
begin
  perform public.assert_platform_admin();
  select j.* into v_jurisdiction from public.tax_jurisdictions j where j.id=p_jurisdiction_id;
  if v_jurisdiction.id is null then raise exception 'tax_jurisdiction_not_found'; end if;
  select coalesce(jsonb_agg(problem order by problem),'[]'::jsonb) into v_blockers
  from (
    select 'Choose exactly one active shop-default category.' problem
    where (select count(*) from public.tax_categories c
      where c.jurisdiction_id=p_jurisdiction_id and c.active and c.is_default)<>1
    union all
    select 'Add an active standard-rate category.' where not exists(select 1
      from public.tax_categories c where c.jurisdiction_id=p_jurisdiction_id
        and c.active and c.classification='standard')
    union all
    select 'Add an active zero-rated category.' where not exists(select 1
      from public.tax_categories c where c.jurisdiction_id=p_jurisdiction_id
        and c.active and c.classification='zero_rated')
    union all
    select 'Add an active exempt category.' where not exists(select 1
      from public.tax_categories c where c.jurisdiction_id=p_jurisdiction_id
        and c.active and c.classification='exempt')
    union all
    select 'Every active category needs a rate effective today.' where exists(
      select 1 from public.tax_categories c where c.jurisdiction_id=p_jurisdiction_id and c.active
        and not exists(select 1 from public.tax_rate_versions r where r.tax_category_id=c.id
          and r.effective_from<=v_today and (r.effective_to is null or r.effective_to>=v_today)))
    union all
    select 'Zero-rated and exempt categories must resolve to 0%.' where exists(
      select 1 from public.tax_categories c join public.tax_rate_versions r on r.tax_category_id=c.id
      where c.jurisdiction_id=p_jurisdiction_id and c.active
        and c.classification in('zero_rated','exempt') and r.effective_from<=v_today
        and (r.effective_to is null or r.effective_to>=v_today) and r.rate_bps<>0)
  ) checks;
  return jsonb_build_object('jurisdiction_id',p_jurisdiction_id,
    'status',v_jurisdiction.status,'ready',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,'checked_for',v_today);
end;
$$;

create or replace function public.platform_publish_tax_package(p_jurisdiction_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_readiness jsonb;
begin
  perform public.assert_platform_admin();
  perform pg_advisory_xact_lock(hashtextextended('tax-package:'||p_jurisdiction_id::text,0));
  v_readiness:=public.platform_tax_package_readiness(p_jurisdiction_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then
    raise exception 'tax_package_not_ready: %',v_readiness->'blockers'; end if;
  update public.tax_jurisdictions set status='published',published_at=coalesce(published_at,now()),
    published_by=coalesce(published_by,auth.uid()),retired_at=null,retired_by=null,updated_at=now()
  where id=p_jurisdiction_id and status='draft';
  if not found then raise exception 'draft_tax_package_not_found'; end if;
  return public.platform_tax_package_readiness(p_jurisdiction_id);
end;
$$;

create or replace function public.platform_retire_tax_jurisdiction(p_jurisdiction_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.tax_jurisdictions set status='retired',retired_at=now(),retired_by=auth.uid(),
    updated_at=now() where id=p_jurisdiction_id and status='published';
  if not found then raise exception 'published_tax_package_not_found'; end if;
  return p_jurisdiction_id;
end;
$$;

create or replace function public.platform_publish_tax_category(
  p_tax_category_id uuid,p_effective_from date
)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  if p_effective_from is null or p_effective_from<current_date then
    raise exception 'tax_category_cannot_be_backdated'; end if;
  if not exists(select 1 from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where c.id=p_tax_category_id and not c.active
      and j.status='published' and exists(select 1 from public.tax_rate_versions r
        where r.tax_category_id=c.id and r.effective_from<=p_effective_from
          and (r.effective_to is null or r.effective_to>=p_effective_from))) then
    raise exception 'tax_category_not_ready'; end if;
  update public.tax_categories set active=true,effective_from=p_effective_from,updated_at=now()
    where id=p_tax_category_id;
  return p_tax_category_id;
end;
$$;

create or replace function public.platform_retire_tax_category(
  p_tax_category_id uuid,p_effective_to date
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_category public.tax_categories%rowtype;
begin
  perform public.assert_platform_admin();
  select c.* into v_category from public.tax_categories c where c.id=p_tax_category_id for update;
  if v_category.id is null or not v_category.active then raise exception 'tax_category_not_found'; end if;
  if v_category.is_default then raise exception 'default_tax_category_cannot_be_retired'; end if;
  if p_effective_to is null or p_effective_to<current_date then
    raise exception 'tax_category_retirement_cannot_be_backdated'; end if;
  if exists(select 1 from public.products p where p.tax_category_id=v_category.id) then
    raise exception 'tax_category_in_use'; end if;
  update public.tax_categories set effective_to=p_effective_to,updated_at=now()
    where id=v_category.id;
  return v_category.id;
end;
$$;

create or replace function public.platform_tax_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'country_code',j.country_code,'name',j.name,'currency_code',j.currency_code,
    'default_timezone',j.default_timezone,'status',j.status,'active',j.active,
    'published_at',j.published_at,'retired_at',j.retired_at,
    'readiness',public.platform_tax_package_readiness(j.id),
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'name',c.name,'classification',c.classification,
      'is_default',c.is_default,'active',c.active,'effective_from',c.effective_from,
      'effective_to',c.effective_to,'rates',coalesce((select jsonb_agg(to_jsonb(r)
        order by r.effective_from desc) from public.tax_rate_versions r
        where r.tax_category_id=c.id),'[]'::jsonb)) order by c.is_default desc,c.name)
      from public.tax_categories c where c.jurisdiction_id=j.id),'[]'::jsonb)
  ) order by case j.status when 'draft' then 0 when 'published' then 1 else 2 end,j.name),'[]'::jsonb)
  into v_result from public.tax_jurisdictions j;
  return v_result;
end;
$$;

revoke execute on function public.cancel_scheduled_company_tax_profile(uuid),
  public.platform_tax_package_readiness(uuid),public.platform_publish_tax_package(uuid),
  public.platform_retire_tax_jurisdiction(uuid),public.platform_publish_tax_category(uuid,date),
  public.platform_retire_tax_category(uuid,date) from public,anon;
grant execute on function public.cancel_scheduled_company_tax_profile(uuid) to authenticated;
grant execute on function public.platform_tax_package_readiness(uuid),
  public.platform_publish_tax_package(uuid),public.platform_retire_tax_jurisdiction(uuid),
  public.platform_publish_tax_category(uuid,date),public.platform_retire_tax_category(uuid,date)
  to authenticated;
