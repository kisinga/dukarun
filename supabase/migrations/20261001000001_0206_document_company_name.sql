-- One shared preference. Resolved designs carry it into all existing print and
-- snapshot paths, so already-issued documents retain their captured identity.
alter table public.companies
  add column show_company_name_on_documents boolean not null default true;

create function public.save_document_company_name(p_show_company_name boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company public.companies%rowtype;
  v_designs jsonb;
  v_kind text;
begin
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required';
  end if;
  if p_show_company_name is null then raise exception 'invalid_company_name_visibility'; end if;
  select * into v_company from public.companies
    where id = public.current_company_id() for update;
  if not found then raise exception 'company_not_found'; end if;
  v_designs := v_company.document_designs;
  foreach v_kind in array array['receipt','invoice','proforma','purchase-order','statement','cashier-slip'] loop
    v_designs := jsonb_set(v_designs, array[v_kind],
      coalesce(nullif(v_designs->v_kind, 'null'::jsonb), jsonb_build_object(
        'version',1,'layout','classic',
        'message',case when v_kind = 'receipt' then 'Thank you for your business!' else '' end,
        'custom',jsonb_build_object('label','','value','','display','text')))
      || jsonb_build_object('showCompanyName',p_show_company_name), true);
  end loop;
  update public.companies
    set show_company_name_on_documents = p_show_company_name, document_designs = v_designs
    where id = v_company.id;
  return jsonb_build_object('show_company_name_on_documents',p_show_company_name,
    'document_designs',v_designs);
end; $$;

revoke all on function public.save_document_company_name(boolean) from public, anon;
grant execute on function public.save_document_company_name(boolean) to authenticated;

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
    or p_design - array['version','layout','message','custom','showVatBreakdown','showCompanyName'] <> '{}'::jsonb
    or (p_design ? 'showCompanyName' and jsonb_typeof(p_design->'showCompanyName') <> 'boolean')
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
  -- Individual saves always use the latest shared preference, including stale drafts.
  update public.companies set document_designs = jsonb_set(document_designs,array[p_document_type],
      p_design || jsonb_build_object('showCompanyName',show_company_name_on_documents),true)
    where id = public.current_company_id() returning document_designs->p_document_type into v_result;
  if not found then raise exception 'company_not_found'; end if;
  return v_result;
end; $$;
