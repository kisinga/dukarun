-- Make M-PESA setup account-centric: provider connections post into the
-- specific M-PESA money account they belong to.

alter table public.payment_provider_accounts
  add column if not exists ledger_account_code varchar(64);

alter table public.mpesa_onboarding_requests
  add column if not exists ledger_account_code varchar(64);

alter table public.customer_receipts
  add column if not exists ledger_account_code varchar(64);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_provider_accounts_ledger_account_fkey'
  ) then
    alter table public.payment_provider_accounts
      add constraint payment_provider_accounts_ledger_account_fkey
      foreign key (company_id,ledger_account_code)
      references public.ledger_accounts(company_id,code);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'mpesa_onboarding_requests_ledger_account_fkey'
  ) then
    alter table public.mpesa_onboarding_requests
      add constraint mpesa_onboarding_requests_ledger_account_fkey
      foreign key (company_id,ledger_account_code)
      references public.ledger_accounts(company_id,code);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_receipts_ledger_account_fkey'
  ) then
    alter table public.customer_receipts
      add constraint customer_receipts_ledger_account_fkey
      foreign key (company_id,ledger_account_code)
      references public.ledger_accounts(company_id,code);
  end if;
end $$;

create index if not exists payment_provider_accounts_ledger_account_idx
  on public.payment_provider_accounts(company_id,ledger_account_code)
  where ledger_account_code is not null;

create index if not exists mpesa_onboarding_requests_ledger_account_idx
  on public.mpesa_onboarding_requests(company_id,ledger_account_code)
  where ledger_account_code is not null;

create or replace function public.ensure_mpesa_money_account(
  p_company_id uuid,p_name text default null
)
returns varchar language plpgsql security definer set search_path='' as $$
declare
  v_code varchar;v_parent uuid;v_id uuid:=gen_random_uuid();v_name varchar;
begin
  select a.code into v_code
  from public.ledger_accounts a
  where a.company_id=p_company_id and a.code='MPESA'
    and a.money_account_kind='mpesa' and a.is_active and not a.is_parent
  limit 1;
  if v_code is not null then return v_code; end if;

  select a.code into v_code
  from public.ledger_accounts a
  where a.company_id=p_company_id and a.money_account_kind='mpesa'
    and a.is_active and not a.is_parent and a.type='asset'
  order by a.is_system desc,a.created_at,a.code
  limit 1;
  if v_code is not null then return v_code; end if;

  select id into v_parent from public.ledger_accounts
  where company_id=p_company_id and code='CASH' and is_parent;
  v_name:=left(coalesce(nullif(btrim(p_name),''),'M-PESA Account'),100);
  if exists(select 1 from public.ledger_accounts a where a.company_id=p_company_id
    and a.money_account_kind='mpesa' and a.is_active and lower(a.name)=lower(v_name)) then
    v_name:=left(v_name,88)||' '||upper(substr(replace(v_id::text,'-',''),1,8));
  end if;
  v_code:='MPESA_'||replace(v_id::text,'-','');
  insert into public.ledger_accounts(
    id,company_id,code,name,type,parent_id,is_parent,is_system,is_active,
    allow_manual_posting,money_account_kind
  ) values(
    v_id,p_company_id,v_code,v_name,'asset',v_parent,false,false,true,true,'mpesa'
  );
  return v_code;
end;
$$;
revoke execute on function public.ensure_mpesa_money_account(uuid,text)
  from public,anon,authenticated;
grant execute on function public.ensure_mpesa_money_account(uuid,text) to service_role;

create or replace function public.require_mpesa_money_account(
  p_company_id uuid,p_account_code text
)
returns varchar language plpgsql stable security definer set search_path='' as $$
declare v_code varchar;
begin
  if nullif(btrim(coalesce(p_account_code,'')),'') is null then
    raise exception 'mpesa_money_account_required';
  end if;
  select a.code into v_code
  from public.ledger_accounts a
  where a.company_id=p_company_id
    and a.code=btrim(p_account_code)
    and a.money_account_kind='mpesa'
    and a.is_active
    and not a.is_parent
    and a.type='asset'
    and a.allow_manual_posting;
  if v_code is null then
    raise exception 'mpesa_money_account_not_available: %',p_account_code;
  end if;
  return v_code;
end;
$$;
revoke execute on function public.require_mpesa_money_account(uuid,text)
  from public,anon,authenticated;
grant execute on function public.require_mpesa_money_account(uuid,text) to service_role;

create or replace function public.enforce_mpesa_money_account_link()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.ledger_account_code is not null then
    new.ledger_account_code:=public.require_mpesa_money_account(
      new.company_id,new.ledger_account_code);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_mpesa_money_account_link()
  from public,anon,authenticated;

drop trigger if exists payment_provider_accounts_mpesa_money_link
  on public.payment_provider_accounts;
create trigger payment_provider_accounts_mpesa_money_link
before insert or update of company_id,provider,ledger_account_code
on public.payment_provider_accounts for each row
when (new.provider='mpesa' and new.ledger_account_code is not null)
execute function public.enforce_mpesa_money_account_link();

drop trigger if exists mpesa_onboarding_requests_money_link
  on public.mpesa_onboarding_requests;
create trigger mpesa_onboarding_requests_money_link
before insert or update of company_id,ledger_account_code
on public.mpesa_onboarding_requests for each row
when (new.ledger_account_code is not null)
execute function public.enforce_mpesa_money_account_link();

-- Backfill existing provider connections. Prefer the current location default
-- when unambiguous; otherwise create a shortcode/display-name account.
do $$
declare
  r record;v_code varchar;v_count integer;
begin
  for r in
    select a.id,a.company_id,a.display_name
    from public.payment_provider_accounts a
    where a.provider='mpesa' and a.ledger_account_code is null
  loop
    select min(code),count(*) into v_code,v_count
    from (
      select distinct coalesce(lpm.ledger_account_code,pm.ledger_account_code)::varchar code
      from public.location_payment_provider_accounts l
      join public.payment_methods pm on pm.company_id=l.company_id and pm.code='mpesa'
      join public.location_payment_methods lpm
        on lpm.payment_method_id=pm.id and lpm.location_id=l.location_id and lpm.enabled
      join public.ledger_accounts la
        on la.company_id=l.company_id and la.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
      where l.provider_account_id=r.id and la.money_account_kind='mpesa'
        and la.is_active and not la.is_parent
    ) options;
    if v_count<>1 then
      select a.code into v_code
      from public.ledger_accounts a
      where a.company_id=r.company_id and a.code='MPESA'
        and a.money_account_kind='mpesa' and a.is_active and not a.is_parent
      limit 1;
    end if;
    if v_code is null then
      v_code:=public.ensure_mpesa_money_account(r.company_id,r.display_name);
    end if;
    update public.payment_provider_accounts
    set ledger_account_code=v_code,updated_at=now()
    where id=r.id;
  end loop;

  update public.mpesa_onboarding_requests req
  set ledger_account_code=a.ledger_account_code
  from public.mpesa_connections c
  join public.payment_provider_accounts a on a.id=c.provider_account_id
  where req.id=c.onboarding_request_id and req.ledger_account_code is null;

  update public.mpesa_onboarding_requests req
  set ledger_account_code=public.ensure_mpesa_money_account(req.company_id,req.shortcode_type||' '||req.shortcode)
  where req.ledger_account_code is null
    and req.status not in('live','rejected','cancelled');
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_provider_accounts_mpesa_ledger_required'
  ) then
    alter table public.payment_provider_accounts
      add constraint payment_provider_accounts_mpesa_ledger_required
      check (provider <> 'mpesa' or ledger_account_code is not null);
  end if;
end $$;

drop function if exists public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text
);
create or replace function public.request_mpesa_onboarding(
  p_legal_name text,p_shortcode text,p_shortcode_type text,p_mpesa_username text,
  p_contact_name text,p_contact_phone text,p_contact_email text,p_location_ids uuid[],
  p_notes text default null,p_existing_c2b_integration boolean default false,
  p_existing_c2b_notes text default null,p_ledger_account_code text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_id uuid;v_ledger_account_code varchar;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageMpesaIntegration') then
    raise exception 'permission_denied: ManageMpesaIntegration required'; end if;
  if btrim(coalesce(p_legal_name,''))='' or btrim(coalesce(p_shortcode,''))=''
    or btrim(coalesce(p_mpesa_username,''))='' or btrim(coalesce(p_contact_name,''))=''
    or btrim(coalesce(p_contact_phone,''))='' or btrim(coalesce(p_contact_email,''))='' then
    raise exception 'mpesa_setup_required_fields_missing'; end if;
  if p_shortcode_type not in('till','paybill') then raise exception 'invalid_shortcode_type'; end if;
  if btrim(p_shortcode)!~'^[0-9]{5,10}$' then raise exception 'invalid_shortcode'; end if;
  if p_ledger_account_code is not null then
    v_ledger_account_code:=public.require_mpesa_money_account(v_company_id,p_ledger_account_code);
  else
    v_ledger_account_code:=public.ensure_mpesa_money_account(v_company_id,'M-PESA');
  end if;
  if exists(select 1 from public.mpesa_onboarding_requests r
    where r.company_id=v_company_id and r.shortcode=btrim(p_shortcode)
      and r.status not in('live','rejected','cancelled')) then
    raise exception 'mpesa_setup_already_open'; end if;
  if v_ledger_account_code is not null and exists(select 1
    from public.mpesa_onboarding_requests r
    where r.company_id=v_company_id and r.ledger_account_code=v_ledger_account_code
      and r.status not in('live','rejected','cancelled')) then
    raise exception 'mpesa_money_account_setup_already_open'; end if;
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,
    merchant_notes,existing_c2b_integration,existing_c2b_notes,ledger_account_code,requested_by)
  values(v_company_id,btrim(p_legal_name),btrim(p_shortcode),p_shortcode_type,
    btrim(p_mpesa_username),btrim(p_contact_name),btrim(p_contact_phone),lower(btrim(p_contact_email)),
    coalesce(p_location_ids,'{}'::uuid[]),nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_existing_c2b_integration,false),
    nullif(btrim(coalesce(p_existing_c2b_notes,'')),''),
    v_ledger_account_code,auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text,text
) from public,anon;
grant execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text,text
) to authenticated;

drop function if exists public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid
);
create or replace function public.platform_configure_mpesa_connection(
  p_request_id uuid,p_app_name text,p_environment text,p_organization_shortcode text,
  p_business_shortcode text,p_party_b text,p_consumer_key text,p_consumer_secret text,
  p_passkey text,p_location_ids uuid[] default null,p_daraja_app_id uuid default null,
  p_ledger_account_code text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_request public.mpesa_onboarding_requests%rowtype;v_app_id uuid;v_account_id uuid;
  v_passkey_secret uuid;v_ledger_account_code varchar;v_method_id uuid;v_location_id uuid;
begin
  perform public.assert_platform_admin();
  if p_environment not in('sandbox','production') then raise exception 'invalid_environment'; end if;
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  if v_request.status<>'merchant_verification'
    or v_request.safaricom_authorization_verified_at is null then
    raise exception 'safaricom_authorization_required'; end if;
  if exists(select 1 from public.mpesa_connections c where c.onboarding_request_id=v_request.id) then
    raise exception 'onboarding_connection_already_exists'; end if;
  if exists(select 1 from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id)
    left join public.stock_locations l on l.id=x.id and l.company_id=v_request.company_id
    where l.id is null) then raise exception 'invalid_location'; end if;
  v_app_id:=coalesce(p_daraja_app_id,v_request.prepared_daraja_app_id);
  if v_request.prepared_daraja_app_id is null then raise exception 'prepared_daraja_app_required'; end if;
  if v_app_id is distinct from v_request.prepared_daraja_app_id then
    raise exception 'prepared_daraja_app_mismatch'; end if;
  if btrim(coalesce(p_passkey,''))='' then raise exception 'passkey_required'; end if;
  if btrim(coalesce(p_organization_shortcode,''))='' or btrim(coalesce(p_business_shortcode,''))=''
    or btrim(coalesce(p_party_b,''))='' then raise exception 'shortcode_configuration_required'; end if;
  if v_app_id is not null and not exists(select 1 from public.mpesa_daraja_apps
    where id=v_app_id and company_id=v_request.company_id and environment=p_environment)
    then raise exception 'daraja_app_not_found'; end if;
  if coalesce(p_ledger_account_code,v_request.ledger_account_code) is not null then
    v_ledger_account_code:=public.require_mpesa_money_account(
      v_request.company_id,coalesce(p_ledger_account_code,v_request.ledger_account_code));
  else
    v_ledger_account_code:=public.ensure_mpesa_money_account(
      v_request.company_id,v_request.shortcode_type||' '||v_request.shortcode);
  end if;
  v_account_id:=gen_random_uuid();
  v_passkey_secret:=vault.create_secret(p_passkey,'MPESA_PASSKEY_'||v_account_id::text,
    'Daraja STK passkey');
  insert into public.payment_provider_accounts(id,company_id,provider,environment,display_name,
    ledger_account_code,created_by,updated_by)
  values(v_account_id,v_request.company_id,'mpesa',p_environment,
    v_request.shortcode_type||' '||btrim(p_party_b),v_ledger_account_code,auth.uid(),auth.uid());
  insert into public.mpesa_connections(provider_account_id,company_id,onboarding_request_id,
    daraja_app_id,shortcode_type,organization_shortcode,business_shortcode,party_b,passkey_secret_id)
  values(v_account_id,v_request.company_id,v_request.id,v_app_id,v_request.shortcode_type,
    btrim(p_organization_shortcode),btrim(p_business_shortcode),btrim(p_party_b),v_passkey_secret);
  insert into public.location_payment_provider_accounts(location_id,company_id,provider,provider_account_id)
  select x.id,v_request.company_id,'mpesa',v_account_id
  from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id);
  select id into v_method_id from public.payment_methods
  where company_id=v_request.company_id and code='mpesa';
  if v_method_id is not null then
    for v_location_id in select x.id from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id)
    loop
      insert into public.location_payment_methods(
        company_id,location_id,payment_method_id,enabled,ledger_account_code
      ) values(v_request.company_id,v_location_id,v_method_id,true,v_ledger_account_code)
      on conflict(location_id,payment_method_id) do update
        set enabled=true,ledger_account_code=excluded.ledger_account_code,updated_at=now();
    end loop;
  end if;
  update public.mpesa_onboarding_requests set status='daraja_setup',
    prepared_daraja_app_id=coalesce(prepared_daraja_app_id,v_app_id),
    ledger_account_code=v_ledger_account_code,handled_by=auth.uid(),updated_at=now()
    where id=v_request.id;
  return v_account_id;
end $$;
revoke execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid,text
) from public,anon;
grant execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid,text
) to authenticated;

create or replace function public.mpesa_setup_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageMpesaIntegration') then
    raise exception 'permission_denied: ManageMpesaIntegration required'; end if;
  select jsonb_build_object(
    'settings',(select jsonb_build_object(
      'safaricom_authorization_email',s.safaricom_authorization_email,
      'dukarun_mpesa_contact_name',s.dukarun_mpesa_contact_name,
      'dukarun_mpesa_contact_email',s.dukarun_mpesa_contact_email,
      'dukarun_mpesa_contact_phone',s.dukarun_mpesa_contact_phone,
      'mpesa_callback_base_url',s.mpesa_callback_base_url)
      from public.mpesa_platform_settings s where s.singleton),
    'onboarding_requests',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'legal_name',r.legal_name,'shortcode',r.shortcode,'shortcode_type',r.shortcode_type,
      'mpesa_username',r.mpesa_username,'contact_name',r.contact_name,
      'contact_phone',r.contact_phone,'contact_email',r.contact_email,
      'status',r.status,'merchant_notes',r.merchant_notes,'operator_notes',r.operator_notes,
      'existing_c2b_integration',r.existing_c2b_integration,
      'existing_c2b_notes',r.existing_c2b_notes,
      'ledger_account_code',r.ledger_account_code,'ledger_account_name',la.name,
      'prepared_daraja_app_id',r.prepared_daraja_app_id,
      'prepared_daraja_app_name',d.app_name,
      'prepared_daraja_app_environment',d.environment,
      'safaricom_authorization_verified_at',r.safaricom_authorization_verified_at,
      'created_at',r.created_at,'commissioning',public.mpesa_commissioning_state(r.id))
      order by r.created_at desc)
      from public.mpesa_onboarding_requests r
      left join public.mpesa_daraja_apps d on d.id=r.prepared_daraja_app_id
      left join public.ledger_accounts la
        on la.company_id=r.company_id and la.code=r.ledger_account_code
      where r.company_id=v_company_id),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'display_name',a.display_name,'environment',a.environment,'status',a.status,
      'manual_fallback_until',a.manual_fallback_until,'activated_at',a.activated_at,
      'ledger_account_code',a.ledger_account_code,'ledger_account_name',la.name,
      'shortcode_type',c.shortcode_type,'organization_shortcode',c.organization_shortcode,
      'business_shortcode',c.business_shortcode,'party_b',c.party_b,
      'oauth_verified',d.oauth_verified_at is not null,'c2b_registered',c.c2b_registered_at is not null,
      'stk_test_passed',c.stk_test_collection_id is not null,
      'c2b_test_passed',c.c2b_test_collection_id is not null,
      'location_ids',coalesce((select jsonb_agg(l.location_id)
        from public.location_payment_provider_accounts l where l.provider_account_id=a.id),'[]'::jsonb)
    ) order by a.created_at desc) from public.payment_provider_accounts a
      join public.mpesa_connections c on c.provider_account_id=a.id
      join public.mpesa_daraja_apps d on d.id=c.daraja_app_id
      left join public.ledger_accounts la
        on la.company_id=a.company_id and la.code=a.ledger_account_code
      where a.company_id=v_company_id),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
revoke execute on function public.mpesa_setup_status() from public,anon;
grant execute on function public.mpesa_setup_status() to authenticated;

create or replace function public.money_payment_accounts_overview()
returns table(
  account_id uuid,
  account_code varchar,
  account_name varchar,
  money_account_kind text,
  is_active boolean,
  default_location_ids uuid[],
  default_location_names text[],
  mpesa_request jsonb,
  mpesa_connection jsonb
) language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not (
    public.current_user_has_permission('ViewFinancials')
    or public.current_user_has_permission('ManageReconciliation')
    or public.current_user_has_permission('ManageMpesaIntegration')
  ) then
    raise exception 'permission_denied: money account access required';
  end if;
  return query
  select a.id,a.code,a.name,a.money_account_kind,a.is_active,
    coalesce(d.location_ids,'{}'::uuid[]),
    coalesce(d.location_names,'{}'::text[]),
    req.request,
    conn.connection
  from public.ledger_accounts a
  left join lateral (
    select array_agg(sl.id order by sl.name) location_ids,
      array_agg(sl.name order by sl.name) location_names
    from public.location_payment_methods lpm
    join public.payment_methods pm on pm.id=lpm.payment_method_id
    join public.stock_locations sl on sl.id=lpm.location_id
    where lpm.company_id=a.company_id and lpm.ledger_account_code=a.code
      and pm.code=a.money_account_kind and lpm.enabled
  ) d on true
  left join lateral (
    select jsonb_build_object(
      'id',r.id,'status',r.status,'shortcode',r.shortcode,
      'shortcode_type',r.shortcode_type,'created_at',r.created_at,
      'commissioning',public.mpesa_commissioning_state(r.id)
    ) request
    from public.mpesa_onboarding_requests r
    where r.company_id=a.company_id and r.ledger_account_code=a.code
    order by r.created_at desc
    limit 1
  ) req on a.money_account_kind='mpesa'
  left join lateral (
    select jsonb_build_object(
      'id',ppa.id,'status',ppa.status,'environment',ppa.environment,
      'display_name',ppa.display_name,'manual_fallback_until',ppa.manual_fallback_until,
      'activated_at',ppa.activated_at,'shortcode_type',mc.shortcode_type,
      'organization_shortcode',mc.organization_shortcode,'party_b',mc.party_b
    ) connection
    from public.payment_provider_accounts ppa
    join public.mpesa_connections mc on mc.provider_account_id=ppa.id
    where ppa.company_id=a.company_id and ppa.ledger_account_code=a.code
      and ppa.provider='mpesa'
    order by ppa.created_at desc
    limit 1
  ) conn on a.money_account_kind='mpesa'
  where a.company_id=v_company_id and a.money_account_kind is not null
  order by a.money_account_kind,a.name;
end;
$$;
revoke execute on function public.money_payment_accounts_overview() from public,anon;
grant execute on function public.money_payment_accounts_overview() to authenticated;

create or replace function public.mpesa_availability(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'active',coalesce(s.enabled and a.status='active'
      and (s.pilot_company_id is null or s.pilot_company_id=a.company_id),false),
    'manual_fallback',coalesce(s.manual_fallback_allowed
      and a.manual_fallback_until>now(),false),
    'status',a.status,
    'ledger_account_code',a.ledger_account_code,
    'ledger_account_name',la.name
  )
  from public.mpesa_platform_settings s
  left join public.location_payment_provider_accounts l
    on l.location_id=p_location_id and l.provider='mpesa'
    and l.company_id=public.current_company_id()
  left join public.payment_provider_accounts a on a.id=l.provider_account_id
  left join public.ledger_accounts la
    on la.company_id=a.company_id and la.code=a.ledger_account_code
  where s.singleton
$$;
revoke execute on function public.mpesa_availability(uuid) from public,anon;
grant execute on function public.mpesa_availability(uuid) to authenticated,service_role;

create or replace function public.available_tender_accounts(p_location_id uuid default null)
returns table(account_code varchar,account_name varchar,method_code text,is_default boolean)
language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  return query
  select a.code,a.name,pm.code,
    a.code=coalesce(mpesa_provider.ledger_account_code,lpm.ledger_account_code,pm.ledger_account_code)
  from public.ledger_accounts a
  join public.payment_methods pm
    on pm.company_id=a.company_id
   and pm.code=case a.money_account_kind when 'bank' then 'bank' when 'mpesa' then 'mpesa' end
  join public.location_payment_methods lpm
    on lpm.payment_method_id=pm.id and lpm.location_id=v_location_id and lpm.enabled
  left join lateral (
    select ppa.ledger_account_code
    from public.location_payment_provider_accounts lppa
    join public.payment_provider_accounts ppa on ppa.id=lppa.provider_account_id
    join public.mpesa_platform_settings s on s.singleton
    where pm.code='mpesa' and lppa.location_id=v_location_id
      and lppa.company_id=v_company_id and lppa.provider='mpesa'
      and ppa.status='active' and s.enabled
      and (s.pilot_company_id is null or s.pilot_company_id=v_company_id)
    limit 1
  ) mpesa_provider on true
  where a.company_id=v_company_id and a.money_account_kind is not null
    and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting
    and pm.enabled
  order by pm.code,4 desc,a.name,a.code;
end;
$$;
revoke execute on function public.available_tender_accounts(uuid)
  from public,anon;
grant execute on function public.available_tender_accounts(uuid) to authenticated;

create or replace function public.update_money_account(
  p_account_id uuid,p_name text default null,p_is_active boolean default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_account public.ledger_accounts%rowtype;
  v_name text:=nullif(btrim(coalesce(p_name,'')),'');
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;
  select * into v_account from public.ledger_accounts
  where id=p_account_id and company_id=v_company_id and money_account_kind is not null for update;
  if v_account.id is null then raise exception 'money_account_not_found'; end if;
  if p_name is not null and (v_name is null or length(v_name)<2 or length(v_name)>100) then
    raise exception 'invalid_money_account_name: use 2 to 100 characters';
  end if;
  if coalesce(p_is_active,v_account.is_active) and exists(
    select 1 from public.ledger_accounts a
    where a.company_id=v_company_id and a.money_account_kind=v_account.money_account_kind
      and a.id<>v_account.id and a.is_active
      and lower(a.name)=lower(coalesce(v_name,v_account.name))
  ) then raise exception 'money_account_name_exists'; end if;
  if coalesce(p_is_active,v_account.is_active)=false and exists(
    select 1 from public.location_payment_methods lpm
    join public.payment_methods pm on pm.id=lpm.payment_method_id
    where lpm.company_id=v_company_id and lpm.ledger_account_code=v_account.code
      and pm.code in ('bank','mpesa')
  ) then raise exception 'money_account_is_location_default'; end if;
  if coalesce(p_is_active,v_account.is_active)=false and exists(
    select 1 from public.payment_provider_accounts ppa
    where ppa.company_id=v_company_id and ppa.ledger_account_code=v_account.code
      and ppa.provider='mpesa' and ppa.status in('configuring','testing','active')
  ) then raise exception 'money_account_has_active_mpesa_connection'; end if;
  update public.ledger_accounts
  set name=coalesce(v_name,name),is_active=coalesce(p_is_active,is_active),updated_at=now()
  where id=v_account.id;
  return v_account.id;
end;
$$;
revoke execute on function public.update_money_account(uuid,text,boolean)
  from public,anon;
grant execute on function public.update_money_account(uuid,text,boolean)
  to authenticated;

create or replace function public.execute_customer_receipt_core(
  p_receipt_id uuid,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_receipt public.customer_receipts%rowtype;v_order record;v_remaining bigint;v_take bigint;
  v_applied bigint:=0;v_deposit_id uuid;v_payment_id uuid;v_account_code text;
  v_lines jsonb:='[]'::jsonb;
begin
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  perform public.lock_customer_account(v_receipt.company_id,v_receipt.customer_id);
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id for update;
  if v_receipt.status='posted' then return v_receipt.id; end if;
  if v_receipt.status<>'pending_approval' then
    raise exception 'customer_receipt_not_postable: %',v_receipt.status; end if;
  if v_receipt.location_id is distinct from (p_context).location_id
    or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
    raise exception 'posting_context_receipt_mismatch'; end if;
  v_account_code:=public.resolve_tender_account(
    v_receipt.company_id,v_receipt.location_id,v_receipt.method_code,v_receipt.ledger_account_code);
  v_remaining:=v_receipt.amount;
  v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'debit',v_receipt.amount,
    'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
      'locationId',v_receipt.location_id,'method',v_receipt.method_code,
      'reference',v_receipt.reference));
  perform 1 from public.orders o where o.company_id=v_receipt.company_id
    and o.customer_id=v_receipt.customer_id and o.is_credit_sale and o.status='completed'
    order by o.created_at,o.id for update;
  for v_order in
    select o.id,o.code,o.created_at,
      greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)::bigint due
    from public.orders o left join public.payments p
      on p.order_id=o.id and p.company_id=o.company_id
    where o.company_id=v_receipt.company_id and o.customer_id=v_receipt.customer_id
      and o.is_credit_sale and o.status='completed'
    group by o.id
    having greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)>0
    order by o.created_at,o.id
  loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_order.due);
    insert into public.payments(company_id,order_id,method_code,amount,reference,status,
      location_id,settlement_kind,customer_receipt_id,cashier_session_id,ledger_account_code)
    values(v_receipt.company_id,v_order.id,v_receipt.method_code,v_take,v_receipt.reference,'settled',
      v_receipt.location_id,'tender',v_receipt.id,(p_context).cashier_session_id,v_account_code)
    returning id into v_payment_id;
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_take,
      'order_id',v_order.id,'meta',jsonb_build_object('customerId',v_receipt.customer_id,
        'receiptId',v_receipt.id,'paymentId',v_payment_id,'orderCode',v_order.code));
    v_applied:=v_applied+v_take;v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining>0 then
    insert into public.customer_deposits(company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,customer_receipt_id,created_by)
    values(v_receipt.company_id,v_receipt.customer_id,v_remaining,v_receipt.method_code,
      v_receipt.reference,v_receipt.location_id,(p_context).cashier_session_id,
      v_receipt.client_ref||':downpayment',v_receipt.id,v_receipt.created_by)
    returning id into v_deposit_id;
    v_lines:=v_lines||jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_remaining,
      'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
        'depositId',v_deposit_id,'locationId',v_receipt.location_id));
  end if;
  perform public.post_journal_entry_with_context(v_receipt.company_id,'CustomerReceipt',
    v_receipt.id::text,'Customer receipt',v_lines,p_context);
  update public.customer_receipts set status='posted',applied_amount=v_applied,
    downpayment_amount=v_remaining,posted_at=now(),ledger_account_code=v_account_code
  where id=v_receipt.id;
  return v_receipt.id;
end $$;
revoke execute on function public.execute_customer_receipt_core(uuid,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.execute_customer_receipt_core(uuid,public.posting_context)
  to service_role;

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
  update public.payment_collection_allocations set status='posted',posted_at=now(),
    cashier_session_id=(p_context).cashier_session_id,posting_date=(p_context).posting_date,
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
revoke execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) from public,anon,authenticated;
grant execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) to service_role;
