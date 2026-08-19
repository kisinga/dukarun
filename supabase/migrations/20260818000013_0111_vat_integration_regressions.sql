-- Integrate VAT v1 with company provisioning, shared legacy documents,
-- platform RPC security, and the rolling-period close wrapper.

create or replace function public.initialize_company_vat_and_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_date date;
begin
  v_business_date := (now() at time zone coalesce(new.business_timezone, 'Africa/Nairobi'))::date;

  insert into public.company_tax_profiles(
    company_id, jurisdiction_id, vat_registered, tax_registration_number,
    default_tax_category_id, effective_from
  )
  select new.id, j.id, false, null, c.id, date '1900-01-01'
  from public.tax_jurisdictions j
  join public.tax_categories c on c.jurisdiction_id = j.id and c.is_default
  where j.country_code = 'KE'
  on conflict do nothing;

  insert into public.accounting_periods(
    company_id, start_date, end_date, status, created_by
  ) values (
    new.id,
    date_trunc('month', v_business_date)::date,
    (date_trunc('month', v_business_date) + interval '1 month - 1 day')::date,
    'open',
    auth.uid()
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists companies_initialize_vat_and_period on public.companies;
create trigger companies_initialize_vat_and_period
after insert on public.companies
for each row execute function public.initialize_company_vat_and_period();

insert into public.company_tax_profiles(
  company_id, jurisdiction_id, vat_registered, tax_registration_number,
  default_tax_category_id, effective_from
)
select co.id, j.id, false, null, c.id, date '1900-01-01'
from public.companies co
join public.tax_jurisdictions j on j.country_code = 'KE'
join public.tax_categories c on c.jurisdiction_id = j.id and c.is_default
where not exists (
  select 1 from public.company_tax_profiles cp where cp.company_id = co.id
);

insert into public.accounting_periods(company_id, start_date, end_date, status)
select c.id,
  coalesce(l.lock_end_date + 1, date_trunc('month', current_date)::date),
  (
    date_trunc('month', coalesce(l.lock_end_date + 1, current_date))
    + interval '1 month - 1 day'
  )::date,
  'open'
from public.companies c
left join public.period_locks l on l.company_id = c.id
where not exists (
  select 1 from public.accounting_periods p
  where p.company_id = c.id and p.status = 'open'
);

revoke execute on function public.initialize_company_vat_and_period()
from public, anon, authenticated;

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

  select show_vat_breakdown_on_prints into v_show
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
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
    order by effective_from desc
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
    select td.document_number into v_document_number
    from public.tax_documents td where td.id = v_order.tax_document_id;
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

create or replace function public.platform_tax_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', j.id, 'country_code', j.country_code, 'name', j.name,
      'currency_code', j.currency_code, 'default_timezone', j.default_timezone,
      'active', j.active, 'categories', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'code', c.code, 'name', c.name,
          'classification', c.classification, 'is_default', c.is_default,
          'active', c.active, 'rates', coalesce((
            select jsonb_agg(to_jsonb(r) order by r.effective_from desc)
            from public.tax_rate_versions r where r.tax_category_id = c.id
          ), '[]'::jsonb)
        ) order by c.name)
        from public.tax_categories c where c.jurisdiction_id = j.id
      ), '[]'::jsonb)
    ) order by j.name)
    from public.tax_jurisdictions j
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_upsert_tax_jurisdiction(
  p_country_code text,
  p_name text,
  p_currency_code text,
  p_default_timezone text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  insert into public.tax_jurisdictions(
    country_code, name, currency_code, default_timezone, active
  ) values (
    upper(btrim(p_country_code)), btrim(p_name), upper(btrim(p_currency_code)),
    btrim(p_default_timezone), p_active
  )
  on conflict(country_code) do update
  set name = excluded.name,
      currency_code = excluded.currency_code,
      default_timezone = excluded.default_timezone,
      active = excluded.active,
      updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_upsert_tax_category(
  p_jurisdiction_id uuid,
  p_code text,
  p_name text,
  p_classification text,
  p_is_default boolean default false,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  if p_classification not in ('standard', 'special', 'zero_rated', 'exempt') then
    raise exception 'invalid_tax_classification';
  end if;
  if p_is_default then
    update public.tax_categories
    set is_default = false, updated_at = now()
    where jurisdiction_id = p_jurisdiction_id and is_default;
  end if;
  insert into public.tax_categories(
    jurisdiction_id, code, name, classification, is_default, active
  ) values (
    p_jurisdiction_id, upper(btrim(p_code)), btrim(p_name), p_classification,
    p_is_default, p_active
  )
  on conflict(jurisdiction_id, code) do update
  set name = excluded.name,
      classification = excluded.classification,
      is_default = excluded.is_default,
      active = excluded.active,
      updated_at = now()
  returning id into v_id;
  return v_id;
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
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  if p_rate_bps is null or p_rate_bps < 0 or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_tax_rate_version';
  end if;
  perform public.assert_tax_rate_window_available(
    p_tax_category_id, p_effective_from, p_effective_to
  );
  insert into public.tax_rate_versions(
    tax_category_id, rate_bps, effective_from, effective_to, notes, published_by
  ) values (
    p_tax_category_id, p_rate_bps, p_effective_from, p_effective_to,
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.platform_tax_catalog(),
  public.platform_upsert_tax_jurisdiction(text, text, text, text, boolean),
  public.platform_upsert_tax_category(uuid, text, text, text, boolean, boolean),
  public.platform_publish_tax_rate_version(uuid, integer, date, date, text)
from public, anon;
grant execute on function public.platform_tax_catalog(),
  public.platform_upsert_tax_jurisdiction(text, text, text, text, boolean),
  public.platform_upsert_tax_category(uuid, text, text, text, boolean, boolean),
  public.platform_publish_tax_rate_version(uuid, integer, date, date, text)
to authenticated;

create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period public.accounting_periods%rowtype;
  v_readiness jsonb;
  v_period_id uuid;
  v_pack jsonb;
  v_next_start date;
  v_next_end date;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_lock
  from public.period_locks
  where company_id = v_company_id
  for update;
  select * into v_period
  from public.accounting_periods
  where company_id = v_company_id and status = 'open'
  for update;
  if v_period.id is null then
    raise exception 'open_period_not_found';
  end if;

  -- Compute all new v1 checks while the explicit open period still exists,
  -- but let the mature legacy closer surface its precise reconciliation and
  -- session errors before the generic readiness error.
  v_readiness := public.period_close_readiness(p_end_date);
  delete from public.accounting_periods where id = v_period.id;
  v_period_id := public.close_accounting_period_legacy(p_end_date);
  if exists (
    select 1 from jsonb_object_keys(coalesce(v_readiness -> 'blockers', '{}'::jsonb))
  ) then
    raise exception 'period_not_ready: %', v_readiness -> 'blockers';
  end if;

  update public.accounting_periods
  set start_date = v_period.start_date,
      closed_at = now(),
      closed_by = auth.uid()
  where id = v_period_id;
  v_pack := public.build_period_closing_pack(
    v_period_id, v_period.start_date, p_end_date
  );
  insert into public.period_closing_packs(
    company_id, accounting_period_id, snapshot, created_by
  ) values (
    v_company_id, v_period_id, v_pack, auth.uid()
  );

  v_next_start := p_end_date + 1;
  v_next_end := (
    date_trunc('month', v_next_start) + interval '1 month - 1 day'
  )::date;
  insert into public.accounting_periods(
    company_id, start_date, end_date, status, created_by
  ) values (
    v_company_id, v_next_start, v_next_end, 'open', auth.uid()
  );
  return v_period_id;
end;
$$;
