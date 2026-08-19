-- ===========================================================================
-- 0102 VAT foundation
-- Versioned platform tax catalog, company/product treatment history,
-- authoritative inclusive-tax calculation, immutable sale snapshots, and
-- VAT document numbering. Existing companies and historical sales remain
-- non-VAT/legacy until a finance administrator schedules registration.
-- ===========================================================================

alter table public.companies
  add column business_timezone text not null default 'Africa/Nairobi',
  add column show_vat_breakdown_on_prints boolean not null default false;

create type public.posting_context as (
  company_id uuid,
  location_id uuid,
  actor_id uuid,
  cashier_session_id uuid,
  occurred_at timestamptz,
  posting_date date,
  source text,
  late_reason text
);

create table public.tax_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique check (country_code ~ '^[A-Z]{2}$'),
  name text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  default_timezone text not null,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  active boolean generated always as (status = 'published') stored,
  published_at timestamptz,
  published_by uuid,
  retired_at timestamptz,
  retired_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tax_categories (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  classification text not null
    check (classification in ('standard','special','zero_rated','exempt')),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jurisdiction_id, code)
);

create unique index tax_categories_one_default_idx
  on public.tax_categories(jurisdiction_id) where is_default and active;

create table public.tax_rate_versions (
  id uuid primary key default gen_random_uuid(),
  tax_category_id uuid not null references public.tax_categories(id) on delete restrict,
  rate_bps integer not null check (rate_bps between 0 and 100000),
  effective_from date not null,
  effective_to date,
  notes text,
  published_at timestamptz not null default now(),
  published_by uuid,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (tax_category_id, effective_from)
);

create index tax_rate_versions_resolution_idx
  on public.tax_rate_versions(tax_category_id, effective_from desc);

create table public.company_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete restrict,
  vat_registered boolean not null default false,
  tax_registration_number text,
  default_tax_category_id uuid references public.tax_categories(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (not vat_registered or nullif(btrim(tax_registration_number), '') is not null),
  unique (company_id, effective_from)
);

create index company_tax_profiles_resolution_idx
  on public.company_tax_profiles(company_id, effective_from desc);

alter table public.products
  add column tax_category_id uuid references public.tax_categories(id) on delete restrict;

create table public.product_tax_treatment_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  tax_category_id uuid references public.tax_categories(id) on delete restrict,
  effective_from timestamptz not null,
  effective_to timestamptz,
  changed_by uuid,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index product_tax_treatment_current_idx
  on public.product_tax_treatment_versions(product_id) where effective_to is null;
create index product_tax_treatment_resolution_idx
  on public.product_tax_treatment_versions(product_id, effective_from desc);

alter table public.orders
  add column tax_point_at timestamptz,
  add column accounting_posting_date date,
  add column posting_source text,
  add column late_posting_reason text,
  add column tax_profile_id uuid references public.company_tax_profiles(id) on delete restrict,
  add column gross_total bigint not null default 0 check (gross_total >= 0),
  add column net_total bigint not null default 0 check (net_total >= 0),
  add column tax_total bigint not null default 0 check (tax_total >= 0),
  add column tax_snapshot_status text not null default 'pending'
    check (tax_snapshot_status in ('pending','final','legacy_unclassified'));

alter table public.ledger_journal_entries
  add column occurred_at timestamptz,
  add column posting_source text,
  add column posting_location_id uuid references public.stock_locations(id),
  add column cashier_session_id uuid references public.cashier_sessions(id),
  add column late_posting_reason text;

-- Extend the existing ledger seal to the durable posting evidence. Without
-- this override, the one-time reversal-link update could also alter the newly
-- added context columns while still passing the older narrow guard.
create or replace function public.guard_ledger_entries_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'ledger_immutable: posted journal entries cannot be deleted';
  end if;
  if new is not distinct from old then return new; end if;

  if old.finalized_at is null and new.finalized_at is not null
     and new.id=old.id and new.company_id=old.company_id
     and new.entry_date=old.entry_date and new.posted_at=old.posted_at
     and new.source_type=old.source_type and new.source_id=old.source_id
     and new.reversal_of is not distinct from old.reversal_of
     and new.memo is not distinct from old.memo
     and new.payload_hash is not distinct from old.payload_hash
     and new.created_at=old.created_at
     and new.occurred_at is not distinct from old.occurred_at
     and new.posting_source is not distinct from old.posting_source
     and new.posting_location_id is not distinct from old.posting_location_id
     and new.cashier_session_id is not distinct from old.cashier_session_id
     and new.late_posting_reason is not distinct from old.late_posting_reason then
    return new;
  end if;

  if old.finalized_at is not null
     and new.finalized_at=old.finalized_at
     and old.reversal_of is null and new.reversal_of is not null
     and new.id=old.id and new.company_id=old.company_id
     and new.entry_date=old.entry_date and new.posted_at=old.posted_at
     and new.source_type=old.source_type and new.source_id=old.source_id
     and new.memo is not distinct from old.memo
     and new.payload_hash is not distinct from old.payload_hash
     and new.created_at=old.created_at
     and new.occurred_at is not distinct from old.occurred_at
     and new.posting_source is not distinct from old.posting_source
     and new.posting_location_id is not distinct from old.posting_location_id
     and new.cashier_session_id is not distinct from old.cashier_session_id
     and new.late_posting_reason is not distinct from old.late_posting_reason then
    return new;
  end if;

  raise exception 'ledger_immutable: posted journal entries cannot be modified';
end;
$$;

alter table public.order_lines
  add column tax_category_id uuid references public.tax_categories(id) on delete restrict,
  add column tax_rate_version_id uuid references public.tax_rate_versions(id) on delete restrict,
  add column tax_category_code text,
  add column tax_classification text,
  add column tax_rate_bps integer not null default 0,
  add column gross_total bigint not null default 0 check (gross_total >= 0),
  add column net_total bigint not null default 0 check (net_total >= 0),
  add column tax_total bigint not null default 0 check (tax_total >= 0);

create table public.tax_document_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  document_kind text not null check (document_kind in ('invoice','credit_note')),
  sequence_year integer not null,
  last_value bigint not null default 0,
  primary key (company_id, document_kind, sequence_year)
);

create table public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_kind text not null check (document_kind in ('invoice','credit_note')),
  document_number text not null,
  source_order_id uuid references public.orders(id) on delete restrict,
  original_document_id uuid references public.tax_documents(id) on delete restrict,
  tax_profile_id uuid not null references public.company_tax_profiles(id) on delete restrict,
  tax_point_at timestamptz not null,
  gross_total bigint not null check (gross_total >= 0),
  net_total bigint not null check (net_total >= 0),
  tax_total bigint not null check (tax_total >= 0),
  external_reference text,
  external_status text not null default 'not_submitted'
    check (external_status in ('not_submitted','pending','submitted','accepted','rejected')),
  external_payload jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, document_number),
  unique nulls not distinct (company_id, document_kind, source_order_id)
);

create table public.tax_document_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_document_id uuid not null references public.tax_documents(id) on delete cascade,
  source_order_line_id uuid references public.order_lines(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null,
  tax_category_id uuid references public.tax_categories(id) on delete restrict,
  tax_rate_version_id uuid references public.tax_rate_versions(id) on delete restrict,
  tax_category_code text not null,
  tax_classification text not null,
  tax_rate_bps integer not null,
  gross_total bigint not null,
  net_total bigint not null,
  tax_total bigint not null,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column tax_document_id uuid references public.tax_documents(id) on delete restrict;

-- Seed the current supported jurisdiction. Effective dating includes Kenya's
-- temporary 8% petroleum order (15 Jul 2026 through 14 Oct 2026).
insert into public.tax_jurisdictions(country_code,name,currency_code,default_timezone)
values ('KE','Kenya','KES','Africa/Nairobi');

update public.tax_jurisdictions
set status='published',published_at=now()
where country_code='KE';

with j as (select id from public.tax_jurisdictions where country_code='KE')
insert into public.tax_categories(jurisdiction_id,code,name,classification,is_default)
select id,'STANDARD','Standard rate','standard',true from j union all
select id,'ZERO','Zero-rated','zero_rated',false from j union all
select id,'EXEMPT','Exempt','exempt',false from j union all
select id,'PETROLEUM','Petroleum products','special',false from j;

insert into public.tax_rate_versions(tax_category_id,rate_bps,effective_from,effective_to,notes)
select c.id,1600,date '2013-09-02',null::date,'Kenya general VAT rate'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='STANDARD'
union all
select c.id,0,date '2013-09-02',null::date,'Kenya zero rate'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='ZERO'
union all
select c.id,0,date '2013-09-02',null::date,'Kenya exempt supplies'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='EXEMPT'
union all
select c.id,1600,date '2023-07-01',date '2026-07-14','Petroleum general rate before temporary order'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='PETROLEUM'
union all
select c.id,800,date '2026-07-15',date '2026-10-14','Temporary Legal Notice No. 128 of 2026'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='PETROLEUM'
union all
select c.id,1600,date '2026-10-15',null::date,'Petroleum rate after temporary order'
from public.tax_categories c join public.tax_jurisdictions j on j.id=c.jurisdiction_id
where j.country_code='KE' and c.code='PETROLEUM';

insert into public.company_tax_profiles(
  company_id,jurisdiction_id,vat_registered,tax_registration_number,
  default_tax_category_id,effective_from
)
select co.id,j.id,false,null,c.id,date '1900-01-01'
from public.companies co
join public.tax_jurisdictions j on j.country_code='KE'
join public.tax_categories c on c.jurisdiction_id=j.id and c.is_default;

insert into public.product_tax_treatment_versions(
  company_id,product_id,tax_category_id,effective_from
)
select company_id,id,null,created_at from public.products;

update public.orders set
  gross_total=total,
  net_total=total,
  tax_total=0,
  tax_snapshot_status=case when status='completed' then 'legacy_unclassified' else 'pending' end,
  tax_point_at=case when status='completed' then coalesce(completed_at,updated_at,created_at) end;

update public.order_lines set gross_total=line_total,net_total=line_total,tax_total=0;

create or replace function public.prevent_published_tax_rate_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'published_tax_rate_immutable';
end;
$$;

create trigger tax_rate_versions_immutable
before update or delete on public.tax_rate_versions
for each row execute function public.prevent_published_tax_rate_mutation();

create or replace function public.prevent_final_tax_snapshot_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='completed' and (
    new.tax_point_at is distinct from old.tax_point_at
    or new.tax_profile_id is distinct from old.tax_profile_id
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.tax_total is distinct from old.tax_total
    or new.tax_document_id is distinct from old.tax_document_id
    or new.tax_snapshot_status is distinct from old.tax_snapshot_status
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

create trigger orders_final_tax_snapshot_immutable
before update on public.orders
for each row execute function public.prevent_final_tax_snapshot_mutation();

create or replace function public.prevent_completed_order_line_tax_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.orders where id=old.order_id and status='completed') and (
    new.tax_category_id is distinct from old.tax_category_id
    or new.tax_rate_version_id is distinct from old.tax_rate_version_id
    or new.tax_category_code is distinct from old.tax_category_code
    or new.tax_classification is distinct from old.tax_classification
    or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total
    or new.tax_total is distinct from old.tax_total
  ) then raise exception 'final_tax_snapshot_immutable'; end if;
  return new;
end;
$$;

create trigger order_lines_final_tax_snapshot_immutable
before update on public.order_lines
for each row execute function public.prevent_completed_order_line_tax_mutation();

create or replace function public.track_product_tax_treatment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.tax_category_id is not distinct from old.tax_category_id then
    return new;
  end if;
  if tg_op='UPDATE' then
    update public.product_tax_treatment_versions
    set effective_to=clock_timestamp(),changed_by=auth.uid()
    where product_id=new.id and effective_to is null;
  end if;
  insert into public.product_tax_treatment_versions(
    company_id,product_id,tax_category_id,effective_from,changed_by
  ) values(new.company_id,new.id,new.tax_category_id,clock_timestamp(),auth.uid());
  return new;
end;
$$;

create trigger products_tax_treatment_history
after insert or update of tax_category_id on public.products
for each row execute function public.track_product_tax_treatment();

create or replace function public.assert_tax_rate_window_available(
  p_tax_category_id uuid,p_effective_from date,p_effective_to date,p_exclude_id uuid default null
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(
    select 1 from public.tax_rate_versions r
    where r.tax_category_id=p_tax_category_id
      and r.id is distinct from p_exclude_id
      and daterange(r.effective_from,coalesce(r.effective_to,'infinity'::date),'[]')
        && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')
  ) then raise exception 'tax_rate_effective_dates_overlap'; end if;
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
language plpgsql stable security definer set search_path='' as $$
declare
  v_tax_date date;
  v_timezone text;
  v_profile public.company_tax_profiles%rowtype;
  v_category public.tax_categories%rowtype;
  v_rate public.tax_rate_versions%rowtype;
  v_override uuid;
begin
  if p_gross is null or p_gross<0 then raise exception 'invalid_gross_amount'; end if;
  select business_timezone into v_timezone from public.companies where id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_tax_date:=(p_tax_point at time zone v_timezone)::date;
  select * into v_profile from public.company_tax_profiles
  where company_id=p_company_id and effective_from<=v_tax_date
    and (effective_to is null or effective_to>=v_tax_date)
  order by effective_from desc limit 1;
  if v_profile.id is null or not v_profile.vat_registered then
    return query select v_profile.id,null::uuid,null::uuid,'NOT_REGISTERED'::text,
      'not_registered'::text,0,p_gross,p_gross,0::bigint,false;
    return;
  end if;
  if not exists(select 1 from public.products where id=p_product_id and company_id=p_company_id) then
    raise exception 'invalid_tax_product';
  end if;
  select h.tax_category_id into v_override
  from public.product_tax_treatment_versions h
  where h.product_id=p_product_id and h.company_id=p_company_id
    and h.effective_from<=p_tax_point
    and (h.effective_to is null or h.effective_to>p_tax_point)
  order by h.effective_from desc limit 1;
  select * into v_category from public.tax_categories
  where id=coalesce(v_override,v_profile.default_tax_category_id)
    and jurisdiction_id=v_profile.jurisdiction_id and active;
  if v_category.id is null then raise exception 'tax_category_not_configured'; end if;
  select * into v_rate from public.tax_rate_versions
  where tax_category_id=v_category.id and effective_from<=v_tax_date
    and (effective_to is null or effective_to>=v_tax_date)
  order by effective_from desc limit 1;
  if v_rate.id is null then raise exception 'tax_rate_not_configured: % on %',v_category.code,v_tax_date; end if;
  tax_profile_id:=v_profile.id;
  tax_category_id:=v_category.id;
  tax_rate_version_id:=v_rate.id;
  tax_category_code:=v_category.code;
  tax_classification:=v_category.classification;
  tax_rate_bps:=v_rate.rate_bps;
  gross_total:=p_gross;
  net_total:=round(p_gross::numeric*10000/(10000+v_rate.rate_bps))::bigint;
  tax_total:=p_gross-net_total;
  vat_registered:=true;
  return next;
end;
$$;

create or replace function public.next_tax_document_number(
  p_company_id uuid,p_document_kind text,p_tax_point timestamptz
)
returns text language plpgsql security definer set search_path='' as $$
declare v_year integer;v_value bigint;v_prefix text;v_timezone text;
begin
  if p_document_kind not in ('invoice','credit_note') then raise exception 'invalid_tax_document_kind'; end if;
  select business_timezone into v_timezone from public.companies where id=p_company_id;
  v_year:=extract(year from p_tax_point at time zone coalesce(v_timezone,'Africa/Nairobi'))::integer;
  insert into public.tax_document_sequences(company_id,document_kind,sequence_year,last_value)
  values(p_company_id,p_document_kind,v_year,1)
  on conflict(company_id,document_kind,sequence_year) do update
    set last_value=public.tax_document_sequences.last_value+1
  returning last_value into v_value;
  v_prefix:=case when p_document_kind='invoice' then 'VAT' else 'CN' end;
  return v_prefix||'-'||v_year::text||'-'||lpad(v_value::text,6,'0');
end;
$$;

create or replace function public.finalize_order_tax_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_line record;v_tax record;v_product_id uuid;v_registered boolean:=false;
  v_gross bigint:=0;v_net bigint:=0;v_tax_total bigint:=0;
  v_document_id uuid;v_document_number text;
begin
  if old.status='completed' or new.status<>'completed' then return new; end if;
  new.tax_point_at:=coalesce(new.completed_at,now());
  new.completed_at:=coalesce(new.completed_at,new.tax_point_at);
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

create trigger orders_finalize_tax_snapshot
before update of status on public.orders
for each row execute function public.finalize_order_tax_snapshot();

create or replace function public.post_order_vat_reclassification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status<>'completed' and new.status='completed' and new.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatSaleReclass',new.id::text,
      'VAT extracted from inclusive sale '||new.code,jsonb_build_array(
        jsonb_build_object('account_code','SALES','debit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id)),
        jsonb_build_object('account_code','TAX_PAYABLE','credit',new.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',new.tax_document_id))
      ),(new.tax_point_at at time zone (select business_timezone from public.companies where id=new.company_id))::date);
  elsif old.status='completed' and new.status='voided' and old.tax_total>0 then
    perform public.post_journal_entry(new.company_id,'VatSaleVoid',new.id::text,
      'VAT reversal for voided sale '||new.code,jsonb_build_array(
        jsonb_build_object('account_code','TAX_PAYABLE','debit',old.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',old.tax_document_id)),
        jsonb_build_object('account_code','SALES','credit',old.tax_total,'order_id',new.id,
          'meta',jsonb_build_object('orderCode',new.code,'taxDocumentId',old.tax_document_id))
      ));
  end if;
  return new;
end;
$$;

create trigger orders_post_vat_reclassification
after update of status on public.orders
for each row execute function public.post_order_vat_reclassification();

create or replace function public.set_product_tax_category(
  p_product_id uuid,p_tax_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_jurisdiction_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if not exists(select 1 from public.products where id=p_product_id and company_id=v_company_id) then
    raise exception 'product_not_found'; end if;
  if p_tax_category_id is not null then
    select jurisdiction_id into v_jurisdiction_id from public.company_tax_profiles
    where company_id=v_company_id and effective_from<=current_date
      and (effective_to is null or effective_to>=current_date)
    order by effective_from desc limit 1;
    if not exists(select 1 from public.tax_categories where id=p_tax_category_id
      and jurisdiction_id=v_jurisdiction_id and active) then raise exception 'invalid_tax_category'; end if;
  end if;
  update public.products set tax_category_id=p_tax_category_id,updated_at=now()
  where id=p_product_id and company_id=v_company_id;
  return p_product_id;
end;
$$;

create or replace function public.company_tax_settings()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'show_vat_breakdown_on_prints',c.show_vat_breakdown_on_prints,
    'business_timezone',c.business_timezone,
    'active_profile',case when p.id is null then null else jsonb_build_object(
      'id',p.id,'jurisdiction_id',p.jurisdiction_id,'country_code',j.country_code,
      'jurisdiction_name',j.name,'vat_registered',p.vat_registered,
      'tax_registration_number',p.tax_registration_number,
      'default_tax_category_id',p.default_tax_category_id,'effective_from',p.effective_from,
      'effective_to',p.effective_to) end,
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tc.id,'code',tc.code,'name',tc.name,'classification',tc.classification,
      'is_default',tc.is_default,'rate_bps',rv.rate_bps,'rate_effective_from',rv.effective_from,
      'rate_effective_to',rv.effective_to) order by tc.is_default desc,tc.name)
      from public.tax_categories tc left join lateral(
        select r.* from public.tax_rate_versions r where r.tax_category_id=tc.id
          and r.effective_from<=current_date and (r.effective_to is null or r.effective_to>=current_date)
        order by r.effective_from desc limit 1) rv on true
      where tc.jurisdiction_id=p.jurisdiction_id and tc.active),'[]'::jsonb),
    'jurisdictions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',tj.id,'country_code',tj.country_code,'name',tj.name,'currency_code',tj.currency_code,
      'default_timezone',tj.default_timezone) order by tj.name)
      from public.tax_jurisdictions tj where tj.active),'[]'::jsonb)
  )
  from public.companies c
  left join lateral(select cp.* from public.company_tax_profiles cp where cp.company_id=c.id
    and cp.effective_from<=current_date and (cp.effective_to is null or cp.effective_to>=current_date)
    order by cp.effective_from desc limit 1) p on true
  left join public.tax_jurisdictions j on j.id=p.jurisdiction_id
  where c.id=public.current_company_id()
$$;

create or replace function public.schedule_company_tax_profile(
  p_jurisdiction_id uuid,p_vat_registered boolean,p_tax_registration_number text,
  p_effective_from date,p_default_tax_category_id uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;v_lock_end date;v_timezone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  if p_effective_from is null or p_effective_from<current_date then raise exception 'tax_profile_cannot_be_backdated'; end if;
  if p_vat_registered and btrim(coalesce(p_tax_registration_number,''))='' then
    raise exception 'tax_registration_number_required'; end if;
  if not exists(select 1 from public.tax_categories where id=p_default_tax_category_id
    and jurisdiction_id=p_jurisdiction_id and active) then raise exception 'invalid_default_tax_category'; end if;
  select lock_end_date into v_lock_end from public.period_locks where company_id=v_company_id;
  if exists(select 1 from public.ledger_journal_entries where company_id=v_company_id
      and finalized_at is not null and entry_date>=coalesce(v_lock_end+1,date '1900-01-01')
      and entry_date<p_effective_from)
    and coalesce(v_lock_end,date '1899-12-31')<>p_effective_from-1 then
    raise exception 'close_period_through_day_before_tax_change';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text,41));
  update public.company_tax_profiles set effective_to=p_effective_from-1
  where company_id=v_company_id and effective_from<p_effective_from
    and (effective_to is null or effective_to>=p_effective_from);
  insert into public.company_tax_profiles(company_id,jurisdiction_id,vat_registered,
    tax_registration_number,default_tax_category_id,effective_from,created_by)
  values(v_company_id,p_jurisdiction_id,p_vat_registered,
    nullif(btrim(coalesce(p_tax_registration_number,'')),''),p_default_tax_category_id,
    p_effective_from,auth.uid()) returning id into v_id;
  select default_timezone into v_timezone from public.tax_jurisdictions where id=p_jurisdiction_id;
  update public.companies set business_timezone=v_timezone,
    show_vat_breakdown_on_prints=case when p_vat_registered then true else show_vat_breakdown_on_prints end,
    updated_at=now() where id=v_company_id;
  return v_id;
end;
$$;

create or replace function public.update_tax_print_settings(p_show_vat_breakdown boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required'; end if;
  update public.companies set show_vat_breakdown_on_prints=coalesce(p_show_vat_breakdown,false),
    updated_at=now() where id=v_company_id;
  return coalesce(p_show_vat_breakdown,false);
end;
$$;

create or replace function public.platform_tax_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',j.id,'country_code',j.country_code,'name',j.name,'currency_code',j.currency_code,
    'default_timezone',j.default_timezone,'active',j.active,'categories',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,
        'classification',c.classification,'is_default',c.is_default,'active',c.active,
        'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_from desc)
          from public.tax_rate_versions r where r.tax_category_id=c.id),'[]'::jsonb)) order by c.name)
      from public.tax_categories c where c.jurisdiction_id=j.id),'[]'::jsonb)) order by j.name)
    from public.tax_jurisdictions j),'[]'::jsonb);
end;
$$;

create or replace function public.platform_upsert_tax_jurisdiction(
  p_country_code text,p_name text,p_currency_code text,p_default_timezone text,p_active boolean default true
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  insert into public.tax_jurisdictions(country_code,name,currency_code,default_timezone,active)
  values(upper(btrim(p_country_code)),btrim(p_name),upper(btrim(p_currency_code)),btrim(p_default_timezone),p_active)
  on conflict(country_code) do update set name=excluded.name,currency_code=excluded.currency_code,
    default_timezone=excluded.default_timezone,active=excluded.active,updated_at=now()
  returning id into v_id;return v_id;
end;
$$;

create or replace function public.platform_upsert_tax_category(
  p_jurisdiction_id uuid,p_code text,p_name text,p_classification text,
  p_is_default boolean default false,p_active boolean default true
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  if p_classification not in ('standard','special','zero_rated','exempt') then
    raise exception 'invalid_tax_classification'; end if;
  if p_is_default then update public.tax_categories set is_default=false,updated_at=now()
    where jurisdiction_id=p_jurisdiction_id and is_default; end if;
  insert into public.tax_categories(jurisdiction_id,code,name,classification,is_default,active)
  values(p_jurisdiction_id,upper(btrim(p_code)),btrim(p_name),p_classification,p_is_default,p_active)
  on conflict(jurisdiction_id,code) do update set name=excluded.name,
    classification=excluded.classification,is_default=excluded.is_default,
    active=excluded.active,updated_at=now() returning id into v_id;return v_id;
end;
$$;

create or replace function public.platform_publish_tax_rate_version(
  p_tax_category_id uuid,p_rate_bps integer,p_effective_from date,
  p_effective_to date default null,p_notes text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  if p_rate_bps is null or p_rate_bps<0 or p_effective_from is null
    or (p_effective_to is not null and p_effective_to<p_effective_from) then
    raise exception 'invalid_tax_rate_version'; end if;
  perform public.assert_tax_rate_window_available(p_tax_category_id,p_effective_from,p_effective_to);
  insert into public.tax_rate_versions(tax_category_id,rate_bps,effective_from,effective_to,notes,published_by)
  values(p_tax_category_id,p_rate_bps,p_effective_from,p_effective_to,
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_id;return v_id;
end;
$$;

alter table public.tax_jurisdictions enable row level security;
alter table public.tax_categories enable row level security;
alter table public.tax_rate_versions enable row level security;
alter table public.company_tax_profiles enable row level security;
alter table public.product_tax_treatment_versions enable row level security;
alter table public.tax_document_sequences enable row level security;
alter table public.tax_documents enable row level security;
alter table public.tax_document_lines enable row level security;

create policy "tax jurisdictions readable" on public.tax_jurisdictions for select
  using (active or (select public.is_platform_admin()));
create policy "tax categories readable" on public.tax_categories for select
  using (active or (select public.is_platform_admin()));
create policy "tax rates readable" on public.tax_rate_versions for select using (true);
create policy "company tax profiles readable" on public.company_tax_profiles for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "product tax history readable" on public.product_tax_treatment_versions for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "tax documents readable" on public.tax_documents for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "tax document lines readable" on public.tax_document_lines for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.tax_jurisdictions,public.tax_categories,public.tax_rate_versions,
  public.company_tax_profiles,public.product_tax_treatment_versions,
  public.tax_documents,public.tax_document_lines to authenticated;
grant all on public.tax_jurisdictions,public.tax_categories,public.tax_rate_versions,
  public.company_tax_profiles,public.product_tax_treatment_versions,public.tax_document_sequences,
  public.tax_documents,public.tax_document_lines to service_role;

revoke execute on function public.resolve_inclusive_tax(uuid,uuid,bigint,timestamptz),
  public.next_tax_document_number(uuid,text,timestamptz),
  public.assert_tax_rate_window_available(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.company_tax_settings(),
  public.schedule_company_tax_profile(uuid,boolean,text,date,uuid),
  public.update_tax_print_settings(boolean),public.set_product_tax_category(uuid,uuid)
  to authenticated;
grant execute on function public.platform_tax_catalog(),
  public.platform_upsert_tax_jurisdiction(text,text,text,text,boolean),
  public.platform_upsert_tax_category(uuid,text,text,text,boolean,boolean),
  public.platform_publish_tax_rate_version(uuid,integer,date,date,text)
  to authenticated;
grant execute on function public.resolve_inclusive_tax(uuid,uuid,bigint,timestamptz),
  public.next_tax_document_number(uuid,text,timestamptz),
  public.assert_tax_rate_window_available(uuid,date,date,uuid) to service_role;

create trigger tax_jurisdictions_audit after insert or update or delete on public.tax_jurisdictions
for each row execute function public.audit_trigger();
create trigger tax_categories_audit after insert or update or delete on public.tax_categories
for each row execute function public.audit_trigger();
create trigger tax_rate_versions_audit after insert or update or delete on public.tax_rate_versions
for each row execute function public.audit_trigger();
create trigger company_tax_profiles_audit after insert or update or delete on public.company_tax_profiles
for each row execute function public.audit_trigger();
create trigger tax_documents_audit after insert or update or delete on public.tax_documents
for each row execute function public.audit_trigger();
