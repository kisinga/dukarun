-- Provider-neutral fiscal facts and provider-specific export artifacts.
-- Dukarun does not transmit or claim eTIMS certification here. This boundary
-- preserves immutable transaction evidence while allowing mappings to be
-- completed before an export payload is frozen and queued.

alter table public.tax_documents
  add column if not exists integration_schema_version integer not null default 1,
  add column if not exists source_order_code text,
  add column if not exists source_location_id uuid references public.stock_locations(id) on delete restrict,
  add column if not exists source_location_code text,
  add column if not exists source_location_name text,
  add column if not exists issuer_name text,
  add column if not exists issuer_tax_registration_number text,
  add column if not exists issuer_address text,
  add column if not exists currency_code text,
  add column if not exists buyer_id uuid references public.customers(id) on delete restrict,
  add column if not exists buyer_name text,
  add column if not exists buyer_tax_registration_number text,
  add column if not exists buyer_phone text,
  add column if not exists payment_method_codes text[] not null default '{}'::text[],
  add column if not exists payment_breakdown jsonb not null default '[]'::jsonb
    check(jsonb_typeof(payment_breakdown)='array');

alter table public.tax_document_lines
  add column if not exists unit_price bigint check(unit_price>=0),
  add column if not exists barcode text;

alter table public.purchases
  add column if not exists external_tax_provider text,
  add column if not exists external_tax_invoice_id text,
  add column if not exists external_tax_status text not null default 'not_linked'
    check(external_tax_status in ('not_linked','matched','confirmed','rejected')),
  add column if not exists external_tax_payload jsonb;
create unique index if not exists purchases_external_tax_invoice_unique
  on public.purchases(company_id,external_tax_provider,external_tax_invoice_id)
  where external_tax_provider is not null and external_tax_invoice_id is not null;

create table public.tax_integration_reference_codes(
  provider_code text not null,
  code_type text not null,
  code text not null,
  label text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key(provider_code,code_type,code)
);

insert into public.tax_integration_reference_codes(provider_code,code_type,code,label)
values
  ('KRA_ETIMS','tax_type','A','Exempt'),
  ('KRA_ETIMS','tax_type','B','Standard rate'),
  ('KRA_ETIMS','tax_type','C','Zero rated'),
  ('KRA_ETIMS','tax_type','E','Special rate')
on conflict(provider_code,code_type,code) do nothing;

create table public.tax_integration_location_mappings(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete restrict,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  provider_code text not null,
  external_branch_code text not null,
  version integer not null default 1 check(version>0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,jurisdiction_id,location_id,provider_code)
);

create table public.tax_integration_item_mappings(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  provider_code text not null,
  external_item_code text,
  item_classification_code text,
  item_type_code text,
  origin_country_code text,
  packaging_unit_code text,
  quantity_unit_code text,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check(version>0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,jurisdiction_id,variant_id,provider_code)
);

create table public.tax_integration_rate_mappings(
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete cascade,
  tax_rate_version_id uuid not null references public.tax_rate_versions(id) on delete cascade,
  provider_code text not null,
  external_tax_code text not null,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tax_rate_version_id,provider_code)
);

create table public.tax_integration_tender_mappings(
  jurisdiction_id uuid not null references public.tax_jurisdictions(id) on delete cascade,
  provider_code text not null,
  internal_method_code text not null,
  external_payment_code text not null,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(jurisdiction_id,provider_code,internal_method_code)
);

insert into public.tax_integration_rate_mappings(
  jurisdiction_id,tax_rate_version_id,provider_code,external_tax_code)
select mapped.jurisdiction_id,mapped.tax_rate_version_id,'KRA_ETIMS',mapped.external_tax_code
from (
  select c.jurisdiction_id,r.id tax_rate_version_id,case
    when c.classification='exempt' then 'A'
    when c.classification='zero_rated' then 'C'
    when r.rate_bps=800 then 'E'
    when r.rate_bps=1600 then 'B'
    else null end external_tax_code
  from public.tax_rate_versions r
  join public.tax_categories c on c.id=r.tax_category_id
  join public.tax_jurisdictions j on j.id=c.jurisdiction_id and j.country_code='KE'
) mapped where mapped.external_tax_code is not null
on conflict(tax_rate_version_id,provider_code) do nothing;

create table public.tax_export_artifacts(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_document_id uuid not null references public.tax_documents(id) on delete restrict,
  provider_code text not null,
  artifact_version integer not null check(artifact_version>0),
  schema_version integer not null check(schema_version>0),
  mapping_snapshot jsonb not null check(jsonb_typeof(mapping_snapshot)='object'),
  request_payload jsonb not null check(jsonb_typeof(request_payload)='object'),
  request_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(tax_document_id,provider_code,artifact_version),
  unique(company_id,provider_code,request_hash)
);

create table public.tax_submission_jobs(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  artifact_id uuid not null unique references public.tax_export_artifacts(id) on delete restrict,
  status text not null default 'queued'
    check(status in ('queued','processing','retryable','accepted','rejected','cancelled')),
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tax_submission_jobs_work_idx
  on public.tax_submission_jobs(status,next_attempt_at,created_at)
  where status in ('queued','retryable');

create table public.tax_submission_attempts(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.tax_submission_jobs(id) on delete restrict,
  attempt_number integer not null check(attempt_number>0),
  outcome text not null check(outcome in ('retryable','accepted','rejected')),
  external_reference text,
  response_payload jsonb,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  unique(job_id,attempt_number)
);

create table public.tax_submission_receipts(
  job_id uuid primary key references public.tax_submission_jobs(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  external_reference text not null,
  response_payload jsonb,
  accepted_at timestamptz not null default now()
);

alter table public.tax_integration_reference_codes enable row level security;
alter table public.tax_integration_location_mappings enable row level security;
alter table public.tax_integration_item_mappings enable row level security;
alter table public.tax_integration_rate_mappings enable row level security;
alter table public.tax_integration_tender_mappings enable row level security;
alter table public.tax_export_artifacts enable row level security;
alter table public.tax_submission_jobs enable row level security;
alter table public.tax_submission_attempts enable row level security;
alter table public.tax_submission_receipts enable row level security;

create policy "tax reference codes readable" on public.tax_integration_reference_codes
for select using(true);
create policy "tax location mappings readable" on public.tax_integration_location_mappings
for select using(company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "tax item mappings readable" on public.tax_integration_item_mappings
for select using(company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "tax rate mappings readable" on public.tax_integration_rate_mappings
for select using((select public.is_platform_admin()) or exists(select 1 from public.company_tax_profiles p
  where p.company_id=(select public.current_company_id())
    and p.jurisdiction_id=tax_integration_rate_mappings.jurisdiction_id));
create policy "tax tender mappings readable" on public.tax_integration_tender_mappings
for select using((select public.is_platform_admin()) or exists(select 1 from public.company_tax_profiles p
  where p.company_id=(select public.current_company_id())
    and p.jurisdiction_id=tax_integration_tender_mappings.jurisdiction_id));
create policy "tax artifacts readable" on public.tax_export_artifacts for select using(
  company_id=(select public.current_company_id()) and (
    public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('CloseAccountingPeriod')));
create policy "tax jobs readable" on public.tax_submission_jobs for select using(
  company_id=(select public.current_company_id()) and (
    public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('CloseAccountingPeriod')));
create policy "tax attempts readable" on public.tax_submission_attempts for select using(
  company_id=(select public.current_company_id()) and (
    public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('CloseAccountingPeriod')));
create policy "tax receipts readable" on public.tax_submission_receipts for select using(
  company_id=(select public.current_company_id()) and (
    public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('CloseAccountingPeriod')));

grant select on public.tax_integration_reference_codes,public.tax_integration_location_mappings,
  public.tax_integration_item_mappings,public.tax_integration_rate_mappings,
  public.tax_integration_tender_mappings,public.tax_export_artifacts,public.tax_submission_jobs,
  public.tax_submission_attempts,public.tax_submission_receipts to authenticated;
grant all on public.tax_integration_reference_codes,public.tax_integration_location_mappings,
  public.tax_integration_item_mappings,public.tax_integration_rate_mappings,
  public.tax_integration_tender_mappings,public.tax_export_artifacts,public.tax_submission_jobs,
  public.tax_submission_attempts,public.tax_submission_receipts to service_role;

create or replace function public.upsert_tax_integration_item_mapping(
  p_variant_id uuid,p_jurisdiction_id uuid,p_provider_code text,
  p_external_item_code text default null,p_item_classification_code text default null,
  p_item_type_code text default null,p_origin_country_code text default null,
  p_packaging_unit_code text default null,p_quantity_unit_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;v_provider text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if not exists(select 1 from public.product_variants v where v.id=p_variant_id
    and v.company_id=v_company_id) then raise exception 'catalog_variant_not_found'; end if;
  v_provider:=upper(nullif(btrim(coalesce(p_provider_code,'')),''));
  if v_provider is null then raise exception 'tax_integration_provider_required'; end if;
  insert into public.tax_integration_item_mappings(company_id,jurisdiction_id,variant_id,
    provider_code,external_item_code,item_classification_code,item_type_code,origin_country_code,
    packaging_unit_code,quantity_unit_code,metadata,created_by)
  values(v_company_id,p_jurisdiction_id,p_variant_id,v_provider,
    nullif(btrim(coalesce(p_external_item_code,'')),''),
    nullif(btrim(coalesce(p_item_classification_code,'')),''),
    nullif(btrim(coalesce(p_item_type_code,'')),''),
    upper(nullif(btrim(coalesce(p_origin_country_code,'')),'')),
    upper(nullif(btrim(coalesce(p_packaging_unit_code,'')),'')),
    upper(nullif(btrim(coalesce(p_quantity_unit_code,'')),'')),coalesce(p_metadata,'{}'::jsonb),auth.uid())
  on conflict(company_id,jurisdiction_id,variant_id,provider_code) do update set
    external_item_code=excluded.external_item_code,
    item_classification_code=excluded.item_classification_code,item_type_code=excluded.item_type_code,
    origin_country_code=excluded.origin_country_code,packaging_unit_code=excluded.packaging_unit_code,
    quantity_unit_code=excluded.quantity_unit_code,metadata=excluded.metadata,
    version=public.tax_integration_item_mappings.version+1,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

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
    and p.vat_registered and p.effective_from<=current_date
    and (p.effective_to is null or p.effective_to>=current_date)
    order by p.effective_from desc limit 1;
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

create or replace function public.tax_integration_locations()
returns table(id uuid,code text,name text,tax_integration_branch_code text)
language sql stable security definer set search_path='' as $$
  select l.id,l.code,l.name,m.external_branch_code
  from public.stock_locations l
  left join lateral(select x.external_branch_code from public.tax_integration_location_mappings x
    join public.company_tax_profiles p on p.company_id=x.company_id
      and p.jurisdiction_id=x.jurisdiction_id
    where x.company_id=l.company_id and x.location_id=l.id and x.provider_code='KRA_ETIMS'
      and p.vat_registered and p.effective_from<=current_date
      and (p.effective_to is null or p.effective_to>=current_date)
    order by x.updated_at desc limit 1) m on true
  where l.company_id=public.current_company_id() and l.is_active
  order by l.name,l.id
$$;

create or replace function public.upsert_tax_integration_reference_code(
  p_provider_code text,p_code_type text,p_code text,p_label text,p_active boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns text language plpgsql security definer set search_path='' as $$
declare v_provider text:=upper(nullif(btrim(coalesce(p_provider_code,'')),''));
  v_type text:=lower(nullif(btrim(coalesce(p_code_type,'')),''));v_code text:=nullif(btrim(coalesce(p_code,'')),'');
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  if v_provider is null or v_type is null or v_code is null or nullif(btrim(coalesce(p_label,'')),'') is null then
    raise exception 'invalid_tax_reference_code'; end if;
  insert into public.tax_integration_reference_codes(provider_code,code_type,code,label,active,metadata,synced_at)
  values(v_provider,v_type,v_code,btrim(p_label),coalesce(p_active,true),coalesce(p_metadata,'{}'::jsonb),now())
  on conflict(provider_code,code_type,code) do update set label=excluded.label,
    active=excluded.active,metadata=excluded.metadata,synced_at=now();
  return v_code;
end;
$$;

create or replace function public.upsert_tax_integration_rate_mapping(
  p_tax_rate_version_id uuid,p_provider_code text,p_external_tax_code text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_jurisdiction_id uuid;v_provider text:=upper(nullif(btrim(coalesce(p_provider_code,'')),''));
  v_code text:=nullif(btrim(coalesce(p_external_tax_code,'')),'');
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  select c.jurisdiction_id into v_jurisdiction_id from public.tax_rate_versions r
  join public.tax_categories c on c.id=r.tax_category_id where r.id=p_tax_rate_version_id;
  if v_jurisdiction_id is null then raise exception 'tax_rate_version_not_found'; end if;
  if not exists(select 1 from public.tax_integration_reference_codes x
    where x.provider_code=v_provider and x.code_type='tax_type' and x.code=v_code and x.active) then
    raise exception 'invalid_provider_tax_code'; end if;
  insert into public.tax_integration_rate_mappings(jurisdiction_id,tax_rate_version_id,
    provider_code,external_tax_code) values(v_jurisdiction_id,p_tax_rate_version_id,v_provider,v_code)
  on conflict(tax_rate_version_id,provider_code) do update set external_tax_code=excluded.external_tax_code,
    version=public.tax_integration_rate_mappings.version+1,updated_at=now();
  return p_tax_rate_version_id;
end;
$$;

create or replace function public.upsert_tax_integration_tender_mapping(
  p_jurisdiction_id uuid,p_provider_code text,p_internal_method_code text,p_external_payment_code text
)
returns text language plpgsql security definer set search_path='' as $$
declare v_provider text:=upper(nullif(btrim(coalesce(p_provider_code,'')),''));
  v_internal text:=lower(nullif(btrim(coalesce(p_internal_method_code,'')),''));
  v_external text:=nullif(btrim(coalesce(p_external_payment_code,'')),'');
begin
  if not public.is_platform_admin() then raise exception 'platform_admin_required'; end if;
  if not exists(select 1 from public.tax_jurisdictions j where j.id=p_jurisdiction_id) then
    raise exception 'tax_jurisdiction_not_found'; end if;
  if not exists(select 1 from public.tax_integration_reference_codes x
    where x.provider_code=v_provider and x.code_type='payment_type'
      and x.code=v_external and x.active) then raise exception 'invalid_provider_payment_code'; end if;
  insert into public.tax_integration_tender_mappings(jurisdiction_id,provider_code,
    internal_method_code,external_payment_code)
  values(p_jurisdiction_id,v_provider,v_internal,v_external)
  on conflict(jurisdiction_id,provider_code,internal_method_code) do update set
    external_payment_code=excluded.external_payment_code,
    version=public.tax_integration_tender_mappings.version+1,updated_at=now();
  return v_internal;
end;
$$;

create or replace function public.update_customer_tax_registration(
  p_customer_id uuid,p_tax_registration_number text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  update public.customers set
    tax_registration_number=nullif(btrim(coalesce(p_tax_registration_number,'')),''),updated_at=now()
  where id=p_customer_id and company_id=v_company_id and not is_supplier;
  if not found then raise exception 'customer_not_found'; end if;
  return p_customer_id;
end;
$$;

create or replace function public.snapshot_tax_document_integration_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_company public.companies%rowtype;
  v_profile public.company_tax_profiles%rowtype;v_location public.stock_locations%rowtype;
  v_buyer public.customers%rowtype;v_original public.tax_documents%rowtype;
  v_methods text[];v_payment_breakdown jsonb;
begin
  if new.original_document_id is not null then
    select * into v_original from public.tax_documents d where d.id=new.original_document_id;
  end if;
  if v_original.id is not null then
    new.integration_schema_version:=v_original.integration_schema_version;
    new.source_order_code:=v_original.source_order_code;
    new.source_location_id:=v_original.source_location_id;
    new.source_location_code:=v_original.source_location_code;
    new.source_location_name:=v_original.source_location_name;
    new.issuer_name:=v_original.issuer_name;
    new.issuer_tax_registration_number:=v_original.issuer_tax_registration_number;
    new.issuer_address:=v_original.issuer_address;new.currency_code:=v_original.currency_code;
    new.buyer_id:=v_original.buyer_id;new.buyer_name:=v_original.buyer_name;
    new.buyer_tax_registration_number:=v_original.buyer_tax_registration_number;
    new.buyer_phone:=v_original.buyer_phone;new.payment_method_codes:=v_original.payment_method_codes;
    new.payment_breakdown:=v_original.payment_breakdown;return new;
  end if;
  select * into v_company from public.companies c where c.id=new.company_id;
  select * into v_profile from public.company_tax_profiles p where p.id=new.tax_profile_id;
  new.issuer_name:=v_company.name;new.issuer_tax_registration_number:=v_profile.tax_registration_number;
  new.issuer_address:=v_company.address;new.currency_code:=v_company.currency;
  if new.source_order_id is not null then
    select * into v_order from public.orders o where o.id=new.source_order_id;
    select * into v_location from public.stock_locations l where l.id=v_order.location_id;
    select * into v_buyer from public.customers c where c.id=v_order.customer_id;
    select coalesce(array_agg(p.method_code order by p.method_code),array['credit']::text[]),
      coalesce(jsonb_agg(jsonb_build_object('method_code',p.method_code,'amount',p.amount)
        order by p.method_code),jsonb_build_array(jsonb_build_object('method_code','credit','amount',new.gross_total)))
    into v_methods,v_payment_breakdown from(select payment.method_code,sum(payment.amount)::bigint amount
      from public.payments payment where payment.order_id=v_order.id and payment.status='settled'
      group by payment.method_code) p;
    new.source_order_code:=v_order.code;new.source_location_id:=v_location.id;
    new.source_location_code:=v_location.code;new.source_location_name:=v_location.name;
    new.buyer_id:=v_buyer.id;new.buyer_name:=nullif(concat_ws(' ',
      nullif(v_buyer.first_name,''),nullif(v_buyer.last_name,'')),'');
    new.buyer_tax_registration_number:=v_buyer.tax_registration_number;
    new.buyer_phone:=v_buyer.phone;new.payment_method_codes:=v_methods;
    new.payment_breakdown:=v_payment_breakdown;
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_tax_document_line_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_original public.tax_document_lines%rowtype;v_order_line public.order_lines%rowtype;
  v_variant public.product_variants%rowtype;v_document public.tax_documents%rowtype;
begin
  select * into v_document from public.tax_documents d where d.id=new.tax_document_id;
  if v_document.original_document_id is not null then
    select * into v_original from public.tax_document_lines l
    where l.tax_document_id=v_document.original_document_id
      and l.source_order_line_id=new.source_order_line_id;
  end if;
  if v_original.id is not null then
    new.unit_price:=v_original.unit_price;new.barcode:=v_original.barcode;return new;
  end if;
  select * into v_order_line from public.order_lines l where l.id=new.source_order_line_id;
  select * into v_variant from public.product_variants v where v.id=new.variant_id;
  new.unit_price:=coalesce(v_order_line.custom_price,v_order_line.unit_price,
    round(new.gross_total/nullif(new.quantity,0))::bigint);
  new.barcode:=v_variant.barcode;return new;
end;
$$;

drop trigger if exists tax_documents_snapshot_integration_identity on public.tax_documents;
create trigger tax_documents_snapshot_integration_identity before insert on public.tax_documents
for each row execute function public.snapshot_tax_document_integration_identity();
drop trigger if exists tax_document_lines_snapshot_integration_fields on public.tax_document_lines;
create trigger tax_document_lines_snapshot_integration_fields before insert on public.tax_document_lines
for each row execute function public.snapshot_tax_document_line_identity();

create or replace function public.prevent_tax_document_fiscal_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'tax_document_immutable'; end if;
  if new.company_id is distinct from old.company_id or new.document_kind is distinct from old.document_kind
    or new.document_number is distinct from old.document_number or new.source_order_id is distinct from old.source_order_id
    or new.original_document_id is distinct from old.original_document_id or new.tax_profile_id is distinct from old.tax_profile_id
    or new.tax_point_at is distinct from old.tax_point_at or new.gross_total is distinct from old.gross_total
    or new.net_total is distinct from old.net_total or new.tax_total is distinct from old.tax_total
    or new.integration_schema_version is distinct from old.integration_schema_version
    or new.source_order_code is distinct from old.source_order_code
    or new.source_location_id is distinct from old.source_location_id
    or new.source_location_code is distinct from old.source_location_code
    or new.source_location_name is distinct from old.source_location_name
    or new.issuer_name is distinct from old.issuer_name
    or new.issuer_tax_registration_number is distinct from old.issuer_tax_registration_number
    or new.issuer_address is distinct from old.issuer_address or new.currency_code is distinct from old.currency_code
    or new.buyer_id is distinct from old.buyer_id or new.buyer_name is distinct from old.buyer_name
    or new.buyer_tax_registration_number is distinct from old.buyer_tax_registration_number
    or new.buyer_phone is distinct from old.buyer_phone
    or new.payment_method_codes is distinct from old.payment_method_codes
    or new.payment_breakdown is distinct from old.payment_breakdown
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'tax_document_immutable'; end if;
  return new;
end;
$$;

create or replace function public.tax_document_integration_envelope(
  p_tax_document_id uuid,p_provider_code text default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_document public.tax_documents%rowtype;
  v_profile public.company_tax_profiles%rowtype;v_provider text;v_branch text;v_branch_version integer;
  v_original_number text;v_lines jsonb;v_payments jsonb;v_blockers jsonb:='[]'::jsonb;
  v_mapping_snapshot jsonb;
begin
  if v_company_id is null and auth.role()='service_role' then
    select d.company_id into v_company_id from public.tax_documents d where d.id=p_tax_document_id;
  end if;
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if auth.role()<>'service_role' and not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  select * into v_document from public.tax_documents d
  where d.id=p_tax_document_id and d.company_id=v_company_id;
  if v_document.id is null then raise exception 'tax_document_not_found'; end if;
  select * into v_profile from public.company_tax_profiles p where p.id=v_document.tax_profile_id;
  v_provider:=upper(coalesce(nullif(btrim(p_provider_code),''),case when exists(
    select 1 from public.tax_jurisdictions j where j.id=v_profile.jurisdiction_id
      and j.country_code='KE') then 'KRA_ETIMS' end));
  if v_provider is null then v_blockers:=v_blockers||jsonb_build_array('provider_mapping'); end if;
  select m.external_branch_code,m.version into v_branch,v_branch_version
  from public.tax_integration_location_mappings m where m.company_id=v_company_id
    and m.jurisdiction_id=v_profile.jurisdiction_id and m.location_id=v_document.source_location_id
    and m.provider_code=v_provider;
  if v_branch is null then v_blockers:=v_blockers||jsonb_build_array('location_mapping'); end if;
  if nullif(btrim(coalesce(v_document.issuer_tax_registration_number,'')),'') is null then
    v_blockers:=v_blockers||jsonb_build_array('issuer_tax_registration_number'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',x.sequence,'description',x.description,'quantity',x.quantity,
    'unit_price',x.unit_price,'barcode',x.barcode,'gross_total',x.gross_total,
    'net_total',x.net_total,'tax_total',x.tax_total,'tax_rate_bps',x.tax_rate_bps,
    'tax_category_code',x.tax_category_code,'tax_classification',x.tax_classification,
    'external_tax_code',x.external_tax_code,'external_item_code',x.external_item_code,
    'item_classification_code',x.item_classification_code,'item_type_code',x.item_type_code,
    'origin_country_code',x.origin_country_code,'packaging_unit_code',x.packaging_unit_code,
    'quantity_unit_code',x.quantity_unit_code) order by x.sequence),'[]'::jsonb)
  into v_lines from(
    select row_number() over(order by l.created_at,l.id) sequence,l.*,
      rm.external_tax_code,im.external_item_code,im.item_classification_code,im.item_type_code,
      im.origin_country_code,im.packaging_unit_code,im.quantity_unit_code,
      im.id item_mapping_id,im.version item_mapping_version,rm.version rate_mapping_version,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='tax_type' and r.code=rm.external_tax_code and r.active) tax_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='item_classification' and r.code=im.item_classification_code and r.active) class_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='item_type' and r.code=im.item_type_code and r.active) item_type_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='country' and r.code=im.origin_country_code and r.active) country_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='packaging_unit' and r.code=im.packaging_unit_code and r.active) package_valid,
      exists(select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='quantity_unit' and r.code=im.quantity_unit_code and r.active) quantity_valid
    from public.tax_document_lines l
    left join public.tax_integration_item_mappings im on im.company_id=l.company_id
      and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
      and im.provider_code=v_provider
    left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
      and rm.provider_code=v_provider where l.tax_document_id=v_document.id
  ) x;
  if exists(select 1 from public.tax_document_lines l
    left join public.tax_integration_item_mappings im on im.company_id=l.company_id
      and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
      and im.provider_code=v_provider
    where l.tax_document_id=v_document.id and (im.id is null
      or nullif(btrim(im.external_item_code),'') is null
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='item_classification'
          and r.code=im.item_classification_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='item_type' and r.code=im.item_type_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='country' and r.code=im.origin_country_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='packaging_unit'
          and r.code=im.packaging_unit_code and r.active)
      or not exists(select 1 from public.tax_integration_reference_codes r
        where r.provider_code=v_provider and r.code_type='quantity_unit'
          and r.code=im.quantity_unit_code and r.active))) then
    v_blockers:=v_blockers||jsonb_build_array('item_mapping'); end if;
  if exists(select 1 from public.tax_document_lines l
    left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
      and rm.provider_code=v_provider
    where l.tax_document_id=v_document.id and not exists(
      select 1 from public.tax_integration_reference_codes r where r.provider_code=v_provider
        and r.code_type='tax_type' and r.code=rm.external_tax_code and r.active)) then
    v_blockers:=v_blockers||jsonb_build_array('tax_code_mapping'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('internal_method_code',p.method_code,
    'external_payment_code',tm.external_payment_code,'amount',p.amount) order by p.method_code),'[]'::jsonb)
  into v_payments from jsonb_to_recordset(v_document.payment_breakdown)
    as p(method_code text,amount bigint)
  left join public.tax_integration_tender_mappings tm on tm.jurisdiction_id=v_profile.jurisdiction_id
    and tm.provider_code=v_provider and tm.internal_method_code=p.method_code;
  if exists(select 1
    from unnest(coalesce(v_document.payment_method_codes,'{}'::text[])) as methods(method_code)
    left join public.tax_integration_tender_mappings tm
      on tm.jurisdiction_id=v_profile.jurisdiction_id and tm.provider_code=v_provider
      and tm.internal_method_code=lower(methods.method_code)
    left join public.tax_integration_reference_codes r on r.provider_code=tm.provider_code
      and r.code_type='payment_type' and r.code=tm.external_payment_code and r.active
    where tm.internal_method_code is null or r.code is null) then
    v_blockers:=v_blockers||jsonb_build_array('payment_mapping'); end if;
  select jsonb_build_object('location',jsonb_build_object('id',m.id,'version',m.version),
    'items',coalesce(jsonb_agg(distinct jsonb_build_object('id',im.id,'version',im.version))
      filter(where im.id is not null),'[]'::jsonb),
    'rates',coalesce(jsonb_agg(distinct jsonb_build_object('rate_version_id',rm.tax_rate_version_id,
      'version',rm.version)) filter(where rm.tax_rate_version_id is not null),'[]'::jsonb))
  into v_mapping_snapshot from public.tax_integration_location_mappings m
  left join public.tax_document_lines l on l.tax_document_id=v_document.id
  left join public.tax_integration_item_mappings im on im.company_id=v_document.company_id
    and im.jurisdiction_id=v_profile.jurisdiction_id and im.variant_id=l.variant_id
    and im.provider_code=v_provider
  left join public.tax_integration_rate_mappings rm on rm.tax_rate_version_id=l.tax_rate_version_id
    and rm.provider_code=v_provider
  where m.company_id=v_document.company_id and m.jurisdiction_id=v_profile.jurisdiction_id
    and m.location_id=v_document.source_location_id and m.provider_code=v_provider
  group by m.id,m.version;
  select d.document_number into v_original_number from public.tax_documents d
    where d.id=v_document.original_document_id;
  return jsonb_build_object('schema_version',v_document.integration_schema_version,
    'provider_hint',v_provider,'ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,
    'mapping_snapshot',coalesce(v_mapping_snapshot,'{}'::jsonb),
    'document',jsonb_build_object('id',v_document.id,'number',v_document.document_number,
      'kind',v_document.document_kind,'original_document_number',v_original_number,
      'tax_point_at',v_document.tax_point_at,'source_order_code',v_document.source_order_code),
    'issuer',jsonb_build_object('name',v_document.issuer_name,
      'tax_registration_number',v_document.issuer_tax_registration_number,'address',v_document.issuer_address),
    'buyer',jsonb_build_object('id',v_document.buyer_id,'name',v_document.buyer_name,
      'tax_registration_number',v_document.buyer_tax_registration_number,'phone',v_document.buyer_phone),
    'location',jsonb_build_object('id',v_document.source_location_id,
      'code',v_document.source_location_code,'name',v_document.source_location_name,
      'branch_code',v_branch,'mapping_version',v_branch_version),
    'payments',v_payments,'currency_code',v_document.currency_code,
    'totals',jsonb_build_object('gross',v_document.gross_total,'net',v_document.net_total,
      'tax',v_document.tax_total),'lines',v_lines);
end;
$$;

create or replace function public.freeze_tax_export_artifact(
  p_tax_document_id uuid,p_provider_code text,p_schema_version integer default 1
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_document public.tax_documents%rowtype;v_envelope jsonb;v_hash text;v_id uuid;v_version integer;
begin
  select * into v_document from public.tax_documents d where d.id=p_tax_document_id;
  if v_document.id is null then raise exception 'tax_document_not_found'; end if;
  v_envelope:=public.tax_document_integration_envelope(p_tax_document_id,p_provider_code);
  if not coalesce((v_envelope->>'ready')::boolean,false) then
    raise exception 'tax_export_not_ready: %',v_envelope->'blockers'; end if;
  v_hash:=encode(extensions.digest(convert_to(v_envelope::text,'UTF8'),'sha256'),'hex');
  select a.id into v_id from public.tax_export_artifacts a where a.company_id=v_document.company_id
    and a.provider_code=upper(p_provider_code) and a.request_hash=v_hash;
  if v_id is not null then return v_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'tax-export:'||p_tax_document_id::text||':'||upper(p_provider_code),0));
  select coalesce(max(a.artifact_version),0)+1 into v_version from public.tax_export_artifacts a
    where a.tax_document_id=p_tax_document_id and a.provider_code=upper(p_provider_code);
  insert into public.tax_export_artifacts(company_id,tax_document_id,provider_code,artifact_version,
    schema_version,mapping_snapshot,request_payload,request_hash,created_by)
  values(v_document.company_id,p_tax_document_id,upper(p_provider_code),v_version,p_schema_version,
    v_envelope->'mapping_snapshot',v_envelope,v_hash,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prevent_tax_export_artifact_mutation()
returns trigger language plpgsql set search_path='' as $$ begin
  raise exception 'tax_export_artifact_immutable';
end $$;
create trigger tax_export_artifacts_immutable before update or delete on public.tax_export_artifacts
for each row execute function public.prevent_tax_export_artifact_mutation();
create trigger tax_submission_attempts_immutable before update or delete on public.tax_submission_attempts
for each row execute function public.prevent_tax_export_artifact_mutation();
create trigger tax_submission_receipts_immutable before update or delete on public.tax_submission_receipts
for each row execute function public.prevent_tax_export_artifact_mutation();

create or replace function public.enforce_tax_submission_job_transition()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'tax_submission_job_immutable'; end if;
  if new.company_id is distinct from old.company_id or new.artifact_id is distinct from old.artifact_id
    or new.created_at is distinct from old.created_at then raise exception 'tax_submission_job_source_immutable'; end if;
  if new.status is distinct from old.status and not ((old.status='queued' and new.status in ('processing','cancelled'))
    or (old.status='processing' and new.status in ('retryable','accepted','rejected'))
    or (old.status='retryable' and new.status in ('processing','cancelled'))) then
    raise exception 'invalid_tax_submission_transition: % -> %',old.status,new.status; end if;
  new.updated_at:=now();return new;
end;
$$;
create trigger tax_submission_jobs_transition before update or delete on public.tax_submission_jobs
for each row execute function public.enforce_tax_submission_job_transition();

create or replace function public.queue_tax_export_artifact(p_artifact_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_artifact public.tax_export_artifacts%rowtype;v_id uuid;
begin
  select * into v_artifact from public.tax_export_artifacts a where a.id=p_artifact_id;
  if v_artifact.id is null then raise exception 'tax_export_artifact_not_found'; end if;
  insert into public.tax_submission_jobs(company_id,artifact_id)
  values(v_artifact.company_id,v_artifact.id) on conflict(artifact_id) do nothing returning id into v_id;
  if v_id is null then select j.id into v_id from public.tax_submission_jobs j
    where j.artifact_id=v_artifact.id; end if;
  return v_id;
end;
$$;

create or replace function public.start_tax_submission_job(p_job_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  update public.tax_submission_jobs set status='processing',next_attempt_at=null
  where id=p_job_id and status in ('queued','retryable');
  if not found then raise exception 'tax_submission_job_not_runnable'; end if;
  return p_job_id;
end;
$$;

create or replace function public.record_tax_submission_attempt(
  p_job_id uuid,p_outcome text,p_external_reference text default null,
  p_response_payload jsonb default null,p_error_code text default null,
  p_error_message text default null,p_next_attempt_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_job public.tax_submission_jobs%rowtype;v_attempt_id uuid;v_attempt_number integer;
begin
  if p_outcome not in ('retryable','accepted','rejected') then raise exception 'invalid_submission_outcome'; end if;
  select * into v_job from public.tax_submission_jobs j where j.id=p_job_id for update;
  if v_job.id is null or v_job.status<>'processing' then raise exception 'tax_submission_job_not_processing'; end if;
  select coalesce(max(a.attempt_number),0)+1 into v_attempt_number
  from public.tax_submission_attempts a where a.job_id=v_job.id;
  insert into public.tax_submission_attempts(company_id,job_id,attempt_number,outcome,
    external_reference,response_payload,error_code,error_message)
  values(v_job.company_id,v_job.id,v_attempt_number,p_outcome,nullif(btrim(p_external_reference),''),
    p_response_payload,p_error_code,p_error_message) returning id into v_attempt_id;
  update public.tax_submission_jobs set status=p_outcome,next_attempt_at=case
      when p_outcome='retryable' then p_next_attempt_at end,last_error_code=case
      when p_outcome='retryable' then p_error_code end,last_error_message=case
      when p_outcome='retryable' then p_error_message end where id=v_job.id;
  if p_outcome='accepted' then
    if nullif(btrim(coalesce(p_external_reference,'')),'') is null then
      raise exception 'accepted_submission_reference_required'; end if;
    insert into public.tax_submission_receipts(job_id,company_id,external_reference,response_payload)
    values(v_job.id,v_job.company_id,btrim(p_external_reference),p_response_payload);
  end if;
  return v_attempt_id;
end;
$$;

-- Compatibility entry point: a future adapter may supply its already frozen
-- payload. Replays return the same artifact/job; hash conflicts remain explicit.
create or replace function public.queue_tax_document_submission(
  p_tax_document_id uuid,p_provider_code text,p_payload_version integer,p_request_payload jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_document public.tax_documents%rowtype;v_hash text;v_artifact_id uuid;v_existing public.tax_export_artifacts%rowtype;
begin
  select * into v_document from public.tax_documents d where d.id=p_tax_document_id;
  if v_document.id is null then raise exception 'tax_document_not_found'; end if;
  if p_request_payload is null or jsonb_typeof(p_request_payload)<>'object' then
    raise exception 'invalid_submission_payload'; end if;
  v_hash:=encode(extensions.digest(convert_to(p_request_payload::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.tax_export_artifacts a where a.tax_document_id=p_tax_document_id
    and a.provider_code=upper(p_provider_code) and a.artifact_version=p_payload_version;
  if v_existing.id is not null and v_existing.request_hash is distinct from v_hash then
    raise exception 'tax_export_artifact_conflict'; end if;
  if v_existing.id is null then
    insert into public.tax_export_artifacts(company_id,tax_document_id,provider_code,artifact_version,
      schema_version,mapping_snapshot,request_payload,request_hash,created_by)
    values(v_document.company_id,v_document.id,upper(p_provider_code),p_payload_version,p_payload_version,
      coalesce(p_request_payload->'mapping_snapshot','{}'::jsonb),p_request_payload,v_hash,auth.uid())
    returning id into v_artifact_id;
  else v_artifact_id:=v_existing.id;end if;
  return public.queue_tax_export_artifact(v_artifact_id);
end;
$$;

revoke execute on function public.freeze_tax_export_artifact(uuid,text,integer),
  public.queue_tax_export_artifact(uuid),public.start_tax_submission_job(uuid),
  public.record_tax_submission_attempt(uuid,text,text,jsonb,text,text,timestamptz),
  public.queue_tax_document_submission(uuid,text,integer,jsonb),
  public.prevent_tax_export_artifact_mutation(),public.enforce_tax_submission_job_transition()
  from public,anon,authenticated;
grant execute on function public.freeze_tax_export_artifact(uuid,text,integer),
  public.queue_tax_export_artifact(uuid),public.start_tax_submission_job(uuid),
  public.record_tax_submission_attempt(uuid,text,text,jsonb,text,text,timestamptz),
  public.queue_tax_document_submission(uuid,text,integer,jsonb),
  public.prevent_tax_export_artifact_mutation(),public.enforce_tax_submission_job_transition()
  to service_role;
revoke execute on function public.upsert_tax_integration_item_mapping(
  uuid,uuid,text,text,text,text,text,text,text,jsonb),
  public.update_location_tax_branch_code(uuid,text),public.tax_integration_locations(),
  public.upsert_tax_integration_reference_code(text,text,text,text,boolean,jsonb),
  public.upsert_tax_integration_rate_mapping(uuid,text,text),
  public.upsert_tax_integration_tender_mapping(uuid,text,text,text),
  public.update_customer_tax_registration(uuid,text),
  public.tax_document_integration_envelope(uuid,text) from public,anon;
grant execute on function public.upsert_tax_integration_item_mapping(
  uuid,uuid,text,text,text,text,text,text,text,jsonb),
  public.update_location_tax_branch_code(uuid,text),public.tax_integration_locations(),
  public.upsert_tax_integration_reference_code(text,text,text,text,boolean,jsonb),
  public.upsert_tax_integration_rate_mapping(uuid,text,text),
  public.upsert_tax_integration_tender_mapping(uuid,text,text,text),
  public.update_customer_tax_registration(uuid,text),
  public.tax_document_integration_envelope(uuid,text) to authenticated;

revoke execute on function public.snapshot_tax_document_integration_identity(),
  public.snapshot_tax_document_line_identity(),public.prevent_tax_document_fiscal_mutation()
  from public,anon,authenticated;
grant execute on function public.snapshot_tax_document_integration_identity(),
  public.snapshot_tax_document_line_identity(),public.prevent_tax_document_fiscal_mutation()
  to service_role;
