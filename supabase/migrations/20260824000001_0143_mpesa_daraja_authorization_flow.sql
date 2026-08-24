-- Split tenant M-PESA commissioning into:
-- 1. tenant intake,
-- 2. Dukarun Daraja app preparation,
-- 3. tenant/Safaricom authorization,
-- 4. shortcode/passkey connection.

alter table public.mpesa_onboarding_requests
  add column if not exists existing_c2b_integration boolean not null default false,
  add column if not exists existing_c2b_notes text,
  add column if not exists prepared_daraja_app_id uuid references public.mpesa_daraja_apps(id) on delete set null,
  add column if not exists safaricom_authorization_verified_at timestamptz,
  add column if not exists safaricom_authorization_reference text;

create index if not exists mpesa_onboarding_prepared_app_idx
  on public.mpesa_onboarding_requests(prepared_daraja_app_id)
  where prepared_daraja_app_id is not null;

alter table public.mpesa_platform_settings
  add column if not exists safaricom_authorization_email text,
  add column if not exists dukarun_mpesa_contact_name text not null default 'Dukarun M-PESA Operations',
  add column if not exists dukarun_mpesa_contact_email text not null default 'hello@dukarun.com',
  add column if not exists dukarun_mpesa_contact_phone text,
  add column if not exists mpesa_callback_base_url text not null default 'https://supa.dukarun.com/functions/v1';

drop function if exists public.platform_set_mpesa_settings(boolean,boolean,uuid);
create or replace function public.platform_set_mpesa_settings(
  p_enabled boolean,p_manual_fallback_allowed boolean,p_pilot_company_id uuid default null,
  p_safaricom_authorization_email text default null,
  p_dukarun_mpesa_contact_name text default null,p_dukarun_mpesa_contact_email text default null,
  p_dukarun_mpesa_contact_phone text default null,p_mpesa_callback_base_url text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_safaricom_email text:=nullif(lower(btrim(coalesce(p_safaricom_authorization_email,''))),'');
  v_contact_name text:=nullif(btrim(coalesce(p_dukarun_mpesa_contact_name,'')),'');
  v_contact_email text:=nullif(lower(btrim(coalesce(p_dukarun_mpesa_contact_email,''))),'');
  v_contact_phone text:=nullif(btrim(coalesce(p_dukarun_mpesa_contact_phone,'')),'');
  v_callback_base text:=nullif(regexp_replace(btrim(coalesce(p_mpesa_callback_base_url,'')),'/+$',''),'');
begin
  perform public.assert_platform_admin();
  if p_pilot_company_id is not null and not exists(select 1 from public.companies
    where id=p_pilot_company_id) then raise exception 'company_not_found'; end if;
  if v_safaricom_email is not null and v_safaricom_email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_safaricom_authorization_email'; end if;
  if v_contact_email is not null and v_contact_email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_dukarun_mpesa_contact_email'; end if;
  if v_callback_base is not null and v_callback_base!~'^https://.+' then
    raise exception 'mpesa_callback_url_https_required'; end if;
  update public.mpesa_platform_settings set enabled=p_enabled,
    manual_fallback_allowed=p_manual_fallback_allowed,pilot_company_id=p_pilot_company_id,
    safaricom_authorization_email=v_safaricom_email,
    dukarun_mpesa_contact_name=coalesce(v_contact_name,dukarun_mpesa_contact_name),
    dukarun_mpesa_contact_email=coalesce(v_contact_email,dukarun_mpesa_contact_email),
    dukarun_mpesa_contact_phone=v_contact_phone,
    mpesa_callback_base_url=coalesce(v_callback_base,mpesa_callback_base_url),
    updated_by=auth.uid(),updated_at=now() where singleton;
end $$;
revoke execute on function public.platform_set_mpesa_settings(
  boolean,boolean,uuid,text,text,text,text,text
) from public,anon;
grant execute on function public.platform_set_mpesa_settings(
  boolean,boolean,uuid,text,text,text,text,text
) to authenticated;

create or replace function public.mpesa_private_connection(p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select jsonb_build_object('connection_id',a.id,'company_id',a.company_id,
    'environment',a.environment,'consumer_key',k.decrypted_secret,
    'consumer_secret',s.decrypted_secret,'passkey',p.decrypted_secret,
    'organization_shortcode',c.organization_shortcode,'business_shortcode',c.business_shortcode,
    'party_b',c.party_b,'shortcode_type',c.shortcode_type,
    'callback_base_url',settings.mpesa_callback_base_url)
  into v_result from public.payment_provider_accounts a
  join public.mpesa_connections c on c.provider_account_id=a.id
  join public.mpesa_daraja_apps d on d.id=c.daraja_app_id
  join public.mpesa_platform_settings settings on settings.singleton
  join vault.decrypted_secrets k on k.id=d.consumer_key_secret_id
  join vault.decrypted_secrets s on s.id=d.consumer_secret_secret_id
  join vault.decrypted_secrets p on p.id=c.passkey_secret_id
  where a.id=p_connection_id;
  return v_result;
end $$;
revoke execute on function public.mpesa_private_connection(uuid) from public,anon,authenticated;
grant execute on function public.mpesa_private_connection(uuid) to service_role;

drop function if exists public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text
);

create or replace function public.request_mpesa_onboarding(
  p_legal_name text,p_shortcode text,p_shortcode_type text,p_mpesa_username text,
  p_contact_name text,p_contact_phone text,p_contact_email text,p_location_ids uuid[],
  p_notes text default null,p_existing_c2b_integration boolean default false,
  p_existing_c2b_notes text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
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
  if exists(select 1 from public.mpesa_onboarding_requests r
    where r.company_id=v_company_id and r.shortcode=btrim(p_shortcode)
      and r.status not in('live','rejected','cancelled')) then
    raise exception 'mpesa_setup_already_open'; end if;
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,
    merchant_notes,existing_c2b_integration,existing_c2b_notes,requested_by)
  values(v_company_id,btrim(p_legal_name),btrim(p_shortcode),p_shortcode_type,
    btrim(p_mpesa_username),btrim(p_contact_name),btrim(p_contact_phone),lower(btrim(p_contact_email)),
    coalesce(p_location_ids,'{}'::uuid[]),nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_existing_c2b_integration,false),
    nullif(btrim(coalesce(p_existing_c2b_notes,'')),''),auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text
) from public,anon;
grant execute on function public.request_mpesa_onboarding(
  text,text,text,text,text,text,text,uuid[],text,boolean,text
) to authenticated;

create or replace function public.platform_prepare_mpesa_daraja_app(
  p_request_id uuid,p_app_name text,p_environment text,p_consumer_key text,p_consumer_secret text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request public.mpesa_onboarding_requests%rowtype;v_app_id uuid:=gen_random_uuid();
  v_key_secret uuid;v_secret_secret uuid;
begin
  perform public.assert_platform_admin();
  if p_environment not in('sandbox','production') then raise exception 'invalid_environment'; end if;
  if btrim(coalesce(p_app_name,''))='' or btrim(coalesce(p_consumer_key,''))=''
    or btrim(coalesce(p_consumer_secret,''))='' then raise exception 'daraja_app_credentials_required'; end if;
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  if v_request.status<>'reviewing' then raise exception 'business_review_required'; end if;
  if v_request.prepared_daraja_app_id is not null then raise exception 'daraja_app_already_prepared'; end if;
  v_key_secret:=vault.create_secret(p_consumer_key,'MPESA_CONSUMER_KEY_'||v_app_id::text,
    'Daraja consumer key');
  v_secret_secret:=vault.create_secret(p_consumer_secret,'MPESA_CONSUMER_SECRET_'||v_app_id::text,
    'Daraja consumer secret');
  insert into public.mpesa_daraja_apps(id,company_id,app_name,environment,
    consumer_key_secret_id,consumer_secret_secret_id,created_by,updated_by)
  values(v_app_id,v_request.company_id,btrim(p_app_name),p_environment,
    v_key_secret,v_secret_secret,auth.uid(),auth.uid());
  update public.mpesa_onboarding_requests set status='merchant_verification',
    prepared_daraja_app_id=v_app_id,handled_by=auth.uid(),updated_at=now()
    where id=v_request.id;
  return v_app_id;
end $$;
revoke execute on function public.platform_prepare_mpesa_daraja_app(uuid,text,text,text,text)
  from public,anon;
grant execute on function public.platform_prepare_mpesa_daraja_app(uuid,text,text,text,text)
  to authenticated;

create or replace function public.platform_advance_mpesa_request(
  p_request_id uuid,p_action text,p_notes text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.mpesa_onboarding_requests%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  if p_action='begin_review' and v_request.status='requested' then
    update public.mpesa_onboarding_requests set status='reviewing',handled_by=auth.uid(),
      operator_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_request_id;
  elsif p_action='authorization_verified' and v_request.status='merchant_verification' then
    if v_request.prepared_daraja_app_id is null then raise exception 'prepared_daraja_app_required'; end if;
    if btrim(coalesce(p_notes,''))='' then raise exception 'safaricom_authorization_reference_required'; end if;
    update public.mpesa_onboarding_requests set safaricom_authorization_verified_at=now(),
      safaricom_authorization_reference=btrim(p_notes),
      handled_by=auth.uid(),updated_at=now() where id=p_request_id;
  elsif p_action='merchant_verified' and v_request.status='merchant_verification' then
    if v_request.prepared_daraja_app_id is null then raise exception 'prepared_daraja_app_required'; end if;
    if btrim(coalesce(p_notes,''))='' then raise exception 'safaricom_authorization_reference_required'; end if;
    update public.mpesa_onboarding_requests set safaricom_authorization_verified_at=now(),
      safaricom_authorization_reference=btrim(p_notes),
      handled_by=auth.uid(),updated_at=now() where id=p_request_id;
  elsif p_action='reject' and v_request.status in(
    'requested','reviewing','merchant_verification','daraja_setup','testing') then
    if btrim(coalesce(p_notes,''))='' then raise exception 'operator_notes_required'; end if;
    update public.mpesa_onboarding_requests set status='rejected',handled_by=auth.uid(),
      operator_notes=btrim(p_notes),updated_at=now() where id=p_request_id;
  else raise exception 'invalid_commissioning_transition: % from %',p_action,v_request.status;
  end if;
end $$;
revoke execute on function public.platform_advance_mpesa_request(uuid,text,text) from public,anon;
grant execute on function public.platform_advance_mpesa_request(uuid,text,text) to authenticated;

create or replace function public.platform_configure_mpesa_connection(
  p_request_id uuid,p_app_name text,p_environment text,p_organization_shortcode text,
  p_business_shortcode text,p_party_b text,p_consumer_key text,p_consumer_secret text,
  p_passkey text,p_location_ids uuid[] default null,p_daraja_app_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request public.mpesa_onboarding_requests%rowtype;v_app_id uuid;v_account_id uuid;
  v_passkey_secret uuid;
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
  v_account_id:=gen_random_uuid();
  v_passkey_secret:=vault.create_secret(p_passkey,'MPESA_PASSKEY_'||v_account_id::text,
    'Daraja STK passkey');
  insert into public.payment_provider_accounts(id,company_id,provider,environment,display_name,
    created_by,updated_by)
  values(v_account_id,v_request.company_id,'mpesa',p_environment,
    v_request.shortcode_type||' '||btrim(p_party_b),auth.uid(),auth.uid());
  insert into public.mpesa_connections(provider_account_id,company_id,onboarding_request_id,
    daraja_app_id,shortcode_type,organization_shortcode,business_shortcode,party_b,passkey_secret_id)
  values(v_account_id,v_request.company_id,v_request.id,v_app_id,v_request.shortcode_type,
    btrim(p_organization_shortcode),btrim(p_business_shortcode),btrim(p_party_b),v_passkey_secret);
  insert into public.location_payment_provider_accounts(location_id,company_id,provider,provider_account_id)
  select x.id,v_request.company_id,'mpesa',v_account_id
  from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id);
  update public.mpesa_onboarding_requests set status='daraja_setup',
    prepared_daraja_app_id=coalesce(prepared_daraja_app_id,v_app_id),
    handled_by=auth.uid(),updated_at=now()
    where id=v_request.id;
  return v_account_id;
end $$;
revoke execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid
) from public,anon;
grant execute on function public.platform_configure_mpesa_connection(
  uuid,text,text,text,text,text,text,text,text,uuid[],uuid
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
      'prepared_daraja_app_id',r.prepared_daraja_app_id,
      'prepared_daraja_app_name',d.app_name,
      'prepared_daraja_app_environment',d.environment,
      'safaricom_authorization_verified_at',r.safaricom_authorization_verified_at,
      'created_at',r.created_at,'commissioning',public.mpesa_commissioning_state(r.id))
      order by r.created_at desc)
      from public.mpesa_onboarding_requests r
      left join public.mpesa_daraja_apps d on d.id=r.prepared_daraja_app_id
      where r.company_id=v_company_id),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'display_name',a.display_name,'environment',a.environment,'status',a.status,
      'manual_fallback_until',a.manual_fallback_until,'activated_at',a.activated_at,
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
      where a.company_id=v_company_id),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
revoke execute on function public.mpesa_setup_status() from public,anon;
grant execute on function public.mpesa_setup_status() to authenticated;

create or replace function public.mpesa_commissioning_state(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_request public.mpesa_onboarding_requests%rowtype;v_account public.payment_provider_accounts%rowtype;
  v_connection public.mpesa_connections%rowtype;v_app public.mpesa_daraja_apps%rowtype;
  v_stage text;v_actions jsonb:='[]'::jsonb;v_blockers jsonb:='[]'::jsonb;
  v_oauth boolean:=false;v_callbacks boolean:=false;v_stk boolean:=false;v_c2b boolean:=false;
begin
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  select a.* into v_account from public.payment_provider_accounts a
    join public.mpesa_connections c on c.provider_account_id=a.id
    where c.onboarding_request_id=v_request.id;
  if v_account.id is not null then
    select * into v_connection from public.mpesa_connections where provider_account_id=v_account.id;
    select * into v_app from public.mpesa_daraja_apps where id=v_connection.daraja_app_id;
    v_oauth:=v_app.oauth_verified_at is not null;
    v_callbacks:=v_connection.c2b_registered_at is not null;
    v_stk:=v_connection.stk_test_collection_id is not null;
    v_c2b:=v_connection.c2b_test_collection_id is not null;
  else
    select * into v_app from public.mpesa_daraja_apps where id=v_request.prepared_daraja_app_id;
  end if;
  if v_request.status='requested' then v_stage:='business_review';v_actions:='["begin_review","reject"]';
  elsif v_request.status='reviewing' then
    v_stage:='daraja_app_preparation';v_actions:='["prepare_daraja_app","reject"]';
  elsif v_request.status='merchant_verification'
    and v_request.safaricom_authorization_verified_at is null then
    v_stage:='safaricom_authorization';v_actions:='["authorization_verified","reject"]';
  elsif v_request.status='merchant_verification' then
    v_stage:='daraja_connection';v_actions:='["configure_connection","reject"]';
  elsif v_request.status='daraja_setup' and not v_oauth then
    v_stage:='credential_verification';v_actions:='["verify_credentials","reject"]';
  elsif v_request.status='daraja_setup' and not v_callbacks then
    v_stage:='callback_registration';v_actions:='["register_callbacks","reject"]';
  elsif v_request.status='daraja_setup' then
    v_stage:='ready_for_testing';v_actions:='["start_testing","reject"]';
  elsif v_request.status='testing' then
    v_stage:=case when v_stk and v_c2b then 'activation_review' else 'payment_testing' end;
    if not v_stk then v_actions:=v_actions||'"run_stk_test"'::jsonb; end if;
    if not v_c2b then v_actions:=v_actions||'"verify_direct_test"'::jsonb; end if;
    if v_stk and v_c2b and v_account.environment='production' then
      v_actions:=v_actions||'"activate"'::jsonb;
    end if;
    v_actions:=v_actions||'"reject"'::jsonb;
  elsif v_request.status='live' then
    v_stage:='live';v_actions:='["set_fallback","disable"]';
  else v_stage:=v_request.status;end if;
  if v_request.existing_c2b_integration and v_request.status in('requested','reviewing','merchant_verification') then
    v_blockers:=v_blockers||'"existing_c2b_integration_must_be_reviewed"'::jsonb; end if;
  if v_account.id is null and v_request.status not in(
    'requested','reviewing','merchant_verification','rejected','cancelled') then
    v_blockers:=v_blockers||'"connection_missing"'::jsonb; end if;
  if v_request.status in('merchant_verification','daraja_setup','testing')
    and v_request.prepared_daraja_app_id is null and v_account.id is null then
    v_blockers:=v_blockers||'"prepared_daraja_app_required"'::jsonb; end if;
  if v_account.id is not null and v_account.environment<>'production' then
    v_blockers:=v_blockers||'"production_connection_required_for_activation"'::jsonb; end if;
  if v_request.status='testing' and not v_stk then
    v_blockers:=v_blockers||'"kes_1_stk_test_required"'::jsonb; end if;
  if v_request.status='testing' and not v_c2b then
    v_blockers:=v_blockers||'"kes_1_direct_payment_test_required"'::jsonb; end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'stage',v_stage,'connection_id',v_account.id,'allowed_actions',v_actions,'blockers',v_blockers,
    'checks',jsonb_build_object('business_details',true,
      'daraja_app_prepared',v_request.prepared_daraja_app_id is not null or v_app.id is not null,
      'safaricom_authorized',v_request.safaricom_authorization_verified_at is not null,
      'merchant_verified',v_request.safaricom_authorization_verified_at is not null,
      'connection_configured',v_account.id is not null,'production',v_account.environment='production',
      'credentials_verified',v_oauth,'callbacks_registered',v_callbacks,
      'stk_test_passed',v_stk,'direct_payment_test_passed',v_c2b,
      'active',v_account.status='active'));
end $$;
revoke execute on function public.mpesa_commissioning_state(uuid) from public,anon,authenticated;
grant execute on function public.mpesa_commissioning_state(uuid) to service_role;
