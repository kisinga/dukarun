-- Per-document presentation only; omitted overrides inherit the shared print preference.
create or replace function public.save_document_design(p_document_type text, p_design jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required';
  end if;
  if p_document_type is null or p_document_type not in ('receipt','invoice','proforma','purchase-order','statement','cashier-slip') then
    raise exception 'invalid_document_type';
  end if;
  if p_design is null or jsonb_typeof(p_design) <> 'object'
    or not (p_design ?& array['version','layout','message','custom'])
    or p_design - array['version','layout','message','custom','showVatBreakdown'] <> '{}'::jsonb
    or (p_design ? 'showVatBreakdown' and jsonb_typeof(p_design->'showVatBreakdown') <> 'boolean')
    or p_design->'version' <> '1'::jsonb
    or p_design->>'layout' not in ('classic','compact','modern')
    or jsonb_typeof(p_design->'message') <> 'string' or length(p_design->>'message') > 1000
    or jsonb_typeof(p_design->'custom') <> 'object'
    or not ((p_design->'custom') ?& array['label','value','display'])
    or (p_design->'custom') - array['label','value','display','qr'] <> '{}'::jsonb
    or jsonb_typeof(p_design#>'{custom,label}') <> 'string' or length(p_design#>>'{custom,label}') > 60
    or jsonb_typeof(p_design#>'{custom,value}') <> 'string' or length(p_design#>>'{custom,value}') > 300
    or p_design#>>'{custom,display}' not in ('text','qr','both')
    or jsonb_typeof(p_design->'layout') <> 'string' or jsonb_typeof(p_design#>'{custom,display}') <> 'string'
  then raise exception 'invalid_document_design'; end if;
  if p_design#>>'{custom,display}' <> 'text' and length(btrim(p_design#>>'{custom,value}')) > 0 then
    if jsonb_typeof(p_design#>'{custom,qr}') is distinct from 'object'
      or jsonb_typeof(p_design#>'{custom,qr,size}') is distinct from 'number'
      or jsonb_typeof(p_design#>'{custom,qr,bits}') is distinct from 'string'
      then raise exception 'invalid_document_qr'; end if;
    if (p_design#>>'{custom,qr,size}')::numeric <> trunc((p_design#>>'{custom,qr,size}')::numeric)
      or (p_design#>>'{custom,qr,size}')::numeric not between 21 and 101 then raise exception 'invalid_document_qr'; end if;
    if ((p_design#>>'{custom,qr,size}')::integer - 21) % 4 <> 0
      or length(p_design#>>'{custom,qr,bits}') <> power((p_design#>>'{custom,qr,size}')::integer,2)
      or p_design#>>'{custom,qr,bits}' !~ '^[01]+$'
      or (p_design#>'{custom,qr}') - array['size','bits'] <> '{}'::jsonb then raise exception 'invalid_document_qr'; end if;
  elsif (p_design->'custom') ? 'qr' then
    raise exception 'unexpected_document_qr';
  end if;
  -- UPDATE locks the company row and evaluates jsonb_set against the latest committed row.
  update public.companies set document_designs = jsonb_set(document_designs,array[p_document_type],p_design,true)
    where id = public.current_company_id() returning document_designs->p_document_type into v_result;
  if not found then raise exception 'company_not_found'; end if;
  return v_result;
end; $$;


-- Public documents freeze display settings and historical fiscal identity at issue time.
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

