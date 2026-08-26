-- Drive M-PESA checkout availability from Money location defaults.
-- The provider connection belongs to a M-PESA money account; a location can
-- use that connection when its M-PESA default points at the same account.

create or replace function public.mpesa_money_account_code_at_location(
  p_company_id uuid,p_location_id uuid
)
returns varchar language sql stable security definer set search_path='' as $$
  select coalesce(lpm.ledger_account_code,pm.ledger_account_code)::varchar
  from public.location_payment_methods lpm
  join public.payment_methods pm
    on pm.id=lpm.payment_method_id and pm.company_id=lpm.company_id
  join public.ledger_accounts a
    on a.company_id=lpm.company_id
   and a.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
  where lpm.company_id=p_company_id
    and lpm.location_id=p_location_id
    and lpm.enabled
    and pm.enabled
    and pm.code='mpesa'
    and a.money_account_kind='mpesa'
    and a.is_active
    and not a.is_parent
    and a.type='asset'
    and a.allow_manual_posting
  limit 1
$$;
revoke execute on function public.mpesa_money_account_code_at_location(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mpesa_money_account_code_at_location(uuid,uuid)
  to service_role;

create or replace function public.active_mpesa_provider_account_at_location(
  p_company_id uuid,p_location_id uuid
)
returns uuid language sql stable security definer set search_path='' as $$
  select ppa.id
  from public.payment_provider_accounts ppa
  join public.mpesa_platform_settings s on s.singleton
  where ppa.company_id=p_company_id
    and ppa.provider='mpesa'
    and ppa.status='active'
    and ppa.ledger_account_code=public.mpesa_money_account_code_at_location(
      p_company_id,p_location_id)
    and s.enabled
    and (s.pilot_company_id is null or s.pilot_company_id=p_company_id)
  order by ppa.activated_at desc nulls last,ppa.created_at desc
  limit 1
$$;
revoke execute on function public.active_mpesa_provider_account_at_location(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.active_mpesa_provider_account_at_location(uuid,uuid)
  to service_role;

drop function if exists public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text
);
drop function if exists public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text
);
drop function if exists public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text,text
);
create or replace function public.request_mpesa_onboarding(
  p_legal_name text,p_shortcode text,p_shortcode_type text,p_mpesa_username text,
  p_contact_name text,p_contact_phone text,p_contact_email text,
  p_notes text default null,p_existing_c2b_integration boolean default false,
  p_existing_c2b_notes text default null,p_ledger_account_code text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_id uuid;v_ledger_account_code varchar;
  v_location_ids uuid[];
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
  select coalesce(array_agg(lpm.location_id order by sl.name),'{}'::uuid[])
    into v_location_ids
  from public.location_payment_methods lpm
  join public.payment_methods pm
    on pm.id=lpm.payment_method_id and pm.company_id=lpm.company_id
  join public.stock_locations sl
    on sl.id=lpm.location_id and sl.company_id=lpm.company_id
  where lpm.company_id=v_company_id
    and lpm.enabled
    and pm.enabled
    and pm.code='mpesa'
    and coalesce(lpm.ledger_account_code,pm.ledger_account_code)=v_ledger_account_code;
  if exists(select 1 from public.mpesa_onboarding_requests r
    where r.company_id=v_company_id and r.shortcode=btrim(p_shortcode)
      and r.status not in('live','rejected','cancelled')) then
    raise exception 'mpesa_setup_already_open'; end if;
  if exists(select 1 from public.mpesa_onboarding_requests r
    where r.company_id=v_company_id and r.ledger_account_code=v_ledger_account_code
      and r.status not in('live','rejected','cancelled')) then
    raise exception 'mpesa_money_account_setup_already_open'; end if;
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,
    merchant_notes,existing_c2b_integration,existing_c2b_notes,ledger_account_code,requested_by)
  values(v_company_id,btrim(p_legal_name),btrim(p_shortcode),p_shortcode_type,
    btrim(p_mpesa_username),btrim(p_contact_name),btrim(p_contact_phone),lower(btrim(p_contact_email)),
    v_location_ids,nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_existing_c2b_integration,false),
    nullif(btrim(coalesce(p_existing_c2b_notes,'')),''),
    v_ledger_account_code,auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,text,boolean,text,text
) from public,anon;
grant execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,text,boolean,text,text
) to authenticated;

drop function if exists public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid
);
drop function if exists public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid,text
);
create or replace function public.platform_configure_mpesa_connection(
  p_request_id uuid,p_app_name text,p_environment text,p_organization_shortcode text,
  p_business_shortcode text,p_party_b text,p_consumer_key text,p_consumer_secret text,
  p_passkey text,p_daraja_app_id uuid default null,p_ledger_account_code text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_request public.mpesa_onboarding_requests%rowtype;v_app_id uuid;v_account_id uuid;
  v_passkey_secret uuid;v_ledger_account_code varchar;
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
  update public.mpesa_onboarding_requests set status='daraja_setup',
    prepared_daraja_app_id=coalesce(prepared_daraja_app_id,v_app_id),
    ledger_account_code=v_ledger_account_code,handled_by=auth.uid(),updated_at=now()
    where id=v_request.id;
  return v_account_id;
end $$;
revoke execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid,text
) from public,anon;
grant execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid,text
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
      'location_ids',coalesce((select jsonb_agg(lpm.location_id order by sl.name)
        from public.location_payment_methods lpm
        join public.payment_methods pm
          on pm.id=lpm.payment_method_id and pm.company_id=lpm.company_id
        join public.stock_locations sl
          on sl.id=lpm.location_id and sl.company_id=lpm.company_id
        where lpm.company_id=a.company_id
          and lpm.enabled
          and pm.enabled
          and pm.code='mpesa'
          and coalesce(lpm.ledger_account_code,pm.ledger_account_code)=a.ledger_account_code),
        '[]'::jsonb)
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

create or replace function public.mpesa_availability(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with target as (
    select public.resolve_business_location(p_location_id) location_id
  )
  select jsonb_build_object(
    'active',a.id is not null,
    'manual_fallback',coalesce(s.manual_fallback_allowed
      and a.manual_fallback_until>now(),false),
    'status',a.status,
    'ledger_account_code',a.ledger_account_code,
    'ledger_account_name',la.name
  )
  from public.mpesa_platform_settings s
  cross join target t
  left join public.payment_provider_accounts a
    on a.id=public.active_mpesa_provider_account_at_location(
      public.current_company_id(),t.location_id)
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
    a.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
  from public.ledger_accounts a
  join public.payment_methods pm
    on pm.company_id=a.company_id
   and pm.code=case a.money_account_kind when 'bank' then 'bank' when 'mpesa' then 'mpesa' end
  join public.location_payment_methods lpm
    on lpm.payment_method_id=pm.id and lpm.location_id=v_location_id and lpm.enabled
  where a.company_id=v_company_id and a.money_account_kind is not null
    and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting
    and pm.enabled
  order by pm.code,4 desc,a.name,a.code;
end;
$$;
revoke execute on function public.available_tender_accounts(uuid)
  from public,anon;
grant execute on function public.available_tender_accounts(uuid) to authenticated;

create or replace function public.mpesa_accounting_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_integrated boolean;v_valid boolean;
begin
  if new.method_code<>'mpesa' or new.status<>'settled' then return new; end if;
  v_integrated:=public.active_mpesa_provider_account_at_location(
    new.company_id,new.location_id) is not null;
  if not v_integrated then return new; end if;
  if new.customer_receipt_id is not null then
    select exists(select 1 from public.customer_receipts r
      join public.payment_collection_allocations a on a.id=r.collection_allocation_id
      join public.payment_collections c on c.id=a.collection_id
      where r.id=new.customer_receipt_id and r.company_id=new.company_id
        and a.status in('reserved','posted') and c.provider_status='received'
        and c.verification_status<>'disputed') into v_valid;
  else
    select exists(select 1 from public.payment_collection_allocations a
      join public.payment_collections c on c.id=a.collection_id
      where a.id=new.collection_allocation_id and a.company_id=new.company_id
        and a.order_id=new.order_id and a.amount=new.amount and a.status='reserved'
        and c.provider_status='received' and c.verification_status<>'disputed'
        and c.provider_receipt=coalesce(new.mpesa_receipt,new.reference)) into v_valid;
  end if;
  if not coalesce(v_valid,false) then
    raise exception 'verified_mpesa_collection_required';
  end if;
  return new;
end $$;
revoke execute on function public.mpesa_accounting_evidence_guard()
  from public,anon,authenticated;

create or replace function public.mpesa_customer_receipt_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.method_code='mpesa' and new.status='posted'
    and old.status is distinct from new.status
    and public.active_mpesa_provider_account_at_location(
      new.company_id,new.location_id) is not null
    and not exists(select 1 from public.payment_collection_allocations a
      join public.payment_collections c on c.id=a.collection_id
      where a.id=new.collection_allocation_id and a.customer_receipt_id=new.id
        and a.amount=new.amount and a.status='reserved' and c.provider_status='received'
        and c.verification_status<>'disputed'
        and c.provider_receipt=new.reference) then
    raise exception 'verified_mpesa_collection_required';
  end if;
  return new;
end $$;
revoke execute on function public.mpesa_customer_receipt_evidence_guard()
  from public,anon,authenticated;

create or replace function public.create_mpesa_payment_intent(
  p_workflow text,p_location_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text,p_customer_id uuid default null,p_lines jsonb default null,
  p_order_id uuid default null,p_draft_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_location_id uuid;v_account_id uuid;
  v_subject_id uuid;v_order public.orders%rowtype;v_receipt_id uuid;v_session_id uuid;
  v_fingerprint text;v_existing record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_workflow not in('sale','order','customer_receipt') then raise exception 'invalid_mpesa_workflow'; end if;
  if p_amount<=0 or coalesce(p_cash_amount,0)<0 then raise exception 'invalid_payment_amount'; end if;
  if p_workflow='customer_receipt' and coalesce(p_cash_amount,0)<>0 then
    raise exception 'customer_receipt_split_not_supported'; end if;
  if p_phone is not null and btrim(p_phone)!~'^254[17][0-9]{8}$' then
    raise exception 'invalid_mpesa_phone'; end if;
  if btrim(coalesce(p_client_ref,''))='' then raise exception 'client_ref_required'; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text||':mpesa-client:'||btrim(p_client_ref),0));
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('workflow',p_workflow,'location',v_location_id,
    'phone',p_phone,'amount',p_amount,'cash_amount',coalesce(p_cash_amount,0),
    'customer',p_customer_id,'lines',p_lines,'order',p_order_id,'draft',p_draft_id)::text,'sha256'),'hex');
  select id,request_fingerprint into v_existing from public.mpesa_payment_intents
    where company_id=v_company_id and client_ref=btrim(p_client_ref);
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  v_account_id:=public.active_mpesa_provider_account_at_location(v_company_id,v_location_id);
  if v_account_id is null then raise exception 'mpesa_not_available_at_location'; end if;
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_location_id);
  if p_workflow='sale' then
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'sale_lines_required'; end if;
    v_subject_id:=(public.post_sale_at_location(v_location_id,p_customer_id,p_lines,'[]'::jsonb,
      true,btrim(p_client_ref)||':order',p_draft_id,null)->>'order_id')::uuid;
  elsif p_workflow='order' then
    select * into v_order from public.orders where id=p_order_id and company_id=v_company_id for update;
    if v_order.id is null then raise exception 'order_not_found'; end if;
    if v_order.location_id<>v_location_id then raise exception 'order_location_mismatch'; end if;
    if v_order.status not in('draft','pending_payment') then raise exception 'order_not_payable'; end if;
    v_subject_id=v_order.id;
  else
    if not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company_id)
      then raise exception 'customer_not_found'; end if;
    v_receipt_id:=gen_random_uuid();v_subject_id:=v_receipt_id;
    insert into public.customer_receipts(id,company_id,customer_id,amount,method_code,location_id,
      cashier_session_id,client_ref,request_fingerprint,status,created_by)
    values(v_receipt_id,v_company_id,p_customer_id,p_amount,'mpesa',v_location_id,v_session_id,
      btrim(p_client_ref)||':receipt',v_fingerprint,'pending_approval',auth.uid());
  end if;
  select * into v_order from public.orders where id=v_subject_id and company_id=v_company_id;
  if p_workflow in('sale','order') and (v_order.id is null or v_order.total<>p_amount+coalesce(p_cash_amount,0))
    then raise exception 'payment_mismatch'; end if;
  if p_workflow in('sale','order') and v_session_id is not null then
    if v_order.cashier_session_id is not null and v_order.cashier_session_id<>v_session_id then
      raise exception 'cashier_session_mismatch'; end if;
    update public.orders set cashier_session_id=v_session_id,updated_at=now()
      where id=v_order.id and cashier_session_id is null;
  end if;
  insert into public.mpesa_payment_intents(company_id,provider_account_id,location_id,workflow,
    subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,cash_amount,
    initiating_cashier_session_id,created_by,created_by_role)
  values(v_company_id,v_account_id,v_location_id,p_workflow,
    case when p_workflow='customer_receipt' then 'customer_receipt' else 'order' end,
    v_subject_id,btrim(p_client_ref),v_fingerprint,btrim(p_phone),p_amount,coalesce(p_cash_amount,0),
    v_session_id,auth.uid(),auth.jwt()->>'user_role') returning id into v_subject_id;
  return v_subject_id;
end $$;
revoke execute on function public.create_mpesa_payment_intent(
  text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid) from public,anon;
grant execute on function public.create_mpesa_payment_intent(
  text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid) to authenticated;

create or replace function public.create_cod_mpesa_intent(
  p_fulfillment_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_f public.order_fulfillments%rowtype;
  v_order public.orders%rowtype;v_account_id uuid;v_fingerprint text;v_existing record;v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select * into v_f from public.order_fulfillments
  where id=p_fulfillment_id and company_id=v_company_id for update;
  if v_f.id is null or v_f.collection_kind<>'cod' or v_f.status<>'in_transit' then
    raise exception 'cod_not_collectable'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  select * into v_order from public.orders where id=v_f.order_id for update;
  if p_amount<=0 or coalesce(p_cash_amount,0)<0
    or p_amount+coalesce(p_cash_amount,0)<>public.fulfillment_cod_balance(v_f.id) then
    raise exception 'cod_payment_mismatch'; end if;
  if btrim(coalesce(p_phone,''))!~'^254[17][0-9]{8}$' then
    raise exception 'invalid_mpesa_phone'; end if;
  if btrim(coalesce(p_client_ref,''))='' then raise exception 'client_ref_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text||':mpesa-client:'||btrim(p_client_ref),0));
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'workflow','cod_order','fulfillment',v_f.id,'order',v_order.id,'location',v_f.location_id,
    'phone',p_phone,'amount',p_amount,'cash_amount',coalesce(p_cash_amount,0)
  )::text,'sha256'),'hex');
  select id,request_fingerprint into v_existing from public.mpesa_payment_intents
  where company_id=v_company_id and client_ref=btrim(p_client_ref);
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  v_account_id:=public.active_mpesa_provider_account_at_location(v_company_id,v_f.location_id);
  if v_account_id is null then raise exception 'mpesa_not_available_at_location'; end if;
  insert into public.mpesa_payment_intents(
    company_id,provider_account_id,location_id,workflow,subject_type,subject_id,
    client_ref,request_fingerprint,payer_phone,amount,cash_amount,
    initiating_cashier_session_id,created_by,created_by_role
  ) values(
    v_company_id,v_account_id,v_f.location_id,'cod_order','order',v_order.id,
    btrim(p_client_ref),v_fingerprint,btrim(p_phone),p_amount,coalesce(p_cash_amount,0),
    null,auth.uid(),auth.jwt()->>'user_role'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_cod_mpesa_intent(uuid,text,bigint,bigint,text)
  from public,anon;
grant execute on function public.create_cod_mpesa_intent(uuid,text,bigint,bigint,text)
  to authenticated;

create or replace function public.allocate_mpesa_collection(
  p_collection_id uuid,p_order_id uuid default null,p_customer_id uuid default null,
  p_location_id uuid default null,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_collection public.payment_collections%rowtype;
  v_order public.orders%rowtype;v_allocation_id uuid;v_receipt_id uuid;v_session_id uuid;
  v_location_id uuid;v_review_id uuid;v_timezone text;v_posting_date date;
  v_original_date date;v_lock_end date;v_collection_account_code varchar;
  v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  if (p_order_id is not null)::int+(p_customer_id is not null)::int<>1 then
    raise exception 'choose_exactly_one_allocation_target'; end if;
  select * into v_collection from public.payment_collections
    where id=p_collection_id and company_id=v_company_id for update;
  if v_collection.id is null or v_collection.provider_status<>'received'
    or v_collection.verification_status='disputed' or v_collection.allocation_status<>'unallocated'
    or coalesce(v_collection.classification,'surplus')<>'surplus'
    then raise exception 'collection_not_allocatable'; end if;
  select ppa.ledger_account_code into v_collection_account_code
  from public.payment_provider_accounts ppa
  where ppa.id=v_collection.provider_account_id
    and ppa.company_id=v_company_id
    and ppa.provider='mpesa';
  if v_collection_account_code is null then raise exception 'mpesa_provider_account_not_found'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
  select pl.lock_end_date into v_lock_end from public.period_locks pl
    where pl.company_id=v_company_id;
  if p_order_id is not null then
    select * into v_order from public.orders where id=p_order_id and company_id=v_company_id for update;
    if v_order.id is null or v_order.status not in('draft','pending_payment')
      or v_order.total<>v_collection.amount then raise exception 'order_must_exactly_match_collection'; end if;
    if v_collection_account_code is distinct from
      public.mpesa_money_account_code_at_location(v_company_id,v_order.location_id) then
      raise exception 'collection_location_mismatch'; end if;
    v_location_id:=v_order.location_id;
    v_session_id:=public.require_open_cashier_session_at_location(
      v_company_id,v_order.location_id);
    insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id,
      status,allocated_by,cashier_session_id,notes)
    values(v_collection.id,v_company_id,v_collection.amount,v_order.id,'reserved',auth.uid(),
      v_session_id,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_allocation_id;
  else
    if not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company_id)
      then raise exception 'customer_not_found'; end if;
    if p_location_id is null then raise exception 'collection_location_required'; end if;
    v_location_id:=public.resolve_business_location(p_location_id);
    if v_collection_account_code is distinct from
      public.mpesa_money_account_code_at_location(v_company_id,v_location_id) then
      raise exception 'collection_location_mismatch'; end if;
    v_session_id:=public.require_open_cashier_session_at_location(v_company_id,v_location_id);
    v_receipt_id:=gen_random_uuid();
    insert into public.customer_receipts(id,company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,request_fingerprint,status,created_by)
    select v_receipt_id,v_company_id,p_customer_id,v_collection.amount,'mpesa',
      v_collection.provider_receipt,v_location_id,v_session_id,
      'mpesa-allocation:'||v_collection.id::text||':'||v_receipt_id::text,
      encode(extensions.digest(v_collection.id::text||':'||p_customer_id::text,'sha256'),'hex'),
      'pending_approval',auth.uid();
    insert into public.payment_collection_allocations(collection_id,company_id,amount,
      customer_receipt_id,status,allocated_by,cashier_session_id,notes)
    values(v_collection.id,v_company_id,v_collection.amount,v_receipt_id,'reserved',auth.uid(),
      v_session_id,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_allocation_id;
    update public.customer_receipts set collection_allocation_id=v_allocation_id where id=v_receipt_id;
  end if;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_lock_end is not null and v_original_date<=v_lock_end then
    insert into public.mpesa_late_posting_reviews(company_id,intent_id,collection_id,allocation_id,
      original_business_date,reason)
    values(v_company_id,null,v_collection.id,v_allocation_id,v_original_date,
      'reconciled_collection_from_locked_period')
    on conflict(collection_id,allocation_id) do update set reason=excluded.reason
    returning id into v_review_id;
    return jsonb_build_object('status','late_review','review_id',v_review_id,
      'collection_id',v_collection.id,'allocation_id',v_allocation_id,'order_id',p_order_id,
      'customer_receipt_id',v_receipt_id);
  end if;
  v_posting_date:=v_original_date;
  v_context:=row(v_company_id,v_location_id,auth.uid(),v_session_id,v_collection.occurred_at,
    v_posting_date,'mpesa_reconciliation',null)::public.posting_context;
  perform public.mpesa_post_reserved_allocation(v_collection.id,v_allocation_id,v_context);
  update public.payment_collections set classification=null,updated_at=now()
    where id=v_collection.id and classification='surplus';
  update public.mpesa_payment_intents set status='completed',state_version=state_version+1,
    completed_at=now(),review_reason=null,result_description='Payment allocated in reconciliation',updated_at=now()
    where id=v_collection.mpesa_intent_id and status='manual_review'
      and fulfilled_collection_id=v_collection.id;
  return jsonb_build_object('status','completed','collection_id',v_collection.id,
    'allocation_id',v_allocation_id,'order_id',p_order_id,'customer_receipt_id',v_receipt_id);
end $$;
revoke execute on function public.allocate_mpesa_collection(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.allocate_mpesa_collection(uuid,uuid,uuid,uuid,text) to authenticated;

create or replace function public.platform_create_mpesa_test_attempt(
  p_connection_id uuid,p_phone text,p_amount bigint,p_callback_token_hash text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_account public.payment_provider_accounts%rowtype;v_location_id uuid;
  v_intent_id uuid;v_attempt_id uuid;
begin
  perform public.assert_platform_admin();
  if btrim(coalesce(p_phone,''))!~'^254[17][0-9]{8}$' or p_amount<>1
    then raise exception 'kes_1_test_required'; end if;
  if p_callback_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_callback_token_hash'; end if;
  select * into v_account from public.payment_provider_accounts
    where id=p_connection_id and provider='mpesa' for update;
  if v_account.id is null then raise exception 'mpesa_connection_not_found'; end if;
  if v_account.status<>'testing' then raise exception 'connection_not_in_testing'; end if;
  select sl.id into v_location_id
  from public.stock_locations sl
  join public.location_payment_methods lpm
    on lpm.location_id=sl.id and lpm.company_id=sl.company_id and lpm.enabled
  join public.payment_methods pm
    on pm.id=lpm.payment_method_id and pm.company_id=lpm.company_id
  where sl.company_id=v_account.company_id
    and sl.is_active
    and pm.enabled
    and pm.code='mpesa'
    and coalesce(lpm.ledger_account_code,pm.ledger_account_code)=v_account.ledger_account_code
  order by sl.is_default desc,sl.name
  limit 1;
  if v_location_id is null then
    select sl.id into v_location_id
    from public.stock_locations sl
    where sl.company_id=v_account.company_id and sl.is_active
    order by sl.is_default desc,sl.name
    limit 1;
  end if;
  if v_location_id is null then raise exception 'connection_has_no_location'; end if;
  v_intent_id:=gen_random_uuid();v_attempt_id:=gen_random_uuid();
  insert into public.mpesa_payment_intents(id,company_id,provider_account_id,location_id,workflow,
    subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,status,
    created_by,created_by_role)
  values(v_intent_id,v_account.company_id,v_account.id,v_location_id,'connection_test',
    'connection_test',gen_random_uuid(),'mpesa-test:'||v_intent_id::text,
    encode(extensions.digest(v_intent_id::text,'sha256'),'hex'),btrim(p_phone),1,'requesting',
    auth.uid(),'platform_admin');
  insert into public.mpesa_payment_attempts(id,intent_id,company_id,attempt_number)
    values(v_attempt_id,v_intent_id,v_account.company_id,1);
  update public.mpesa_payment_intents set current_attempt_id=v_attempt_id where id=v_intent_id;
  insert into public.mpesa_callback_tokens(company_id,provider_account_id,attempt_id,kind,
    token_hash,status,activated_at,expires_at,created_by)
  values(v_account.company_id,v_account.id,v_attempt_id,'stk',p_callback_token_hash,'active',now(),
    now()+interval '24 hours',auth.uid());
  update public.payment_provider_accounts set status='testing',updated_by=auth.uid(),updated_at=now()
    where id=v_account.id and status<>'active';
  return v_attempt_id;
end $$;
revoke execute on function public.platform_create_mpesa_test_attempt(uuid,text,bigint,text)
  from public,anon;
grant execute on function public.platform_create_mpesa_test_attempt(uuid,text,bigint,text)
  to authenticated;
