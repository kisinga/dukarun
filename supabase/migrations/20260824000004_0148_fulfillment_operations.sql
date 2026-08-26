-- Fulfillment settings, checkout creation, permission-specific reads, and the
-- optimistic-concurrency state machine.

create or replace function public.normalize_fulfillment_phone(p_phone text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_digits text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if v_digits ~ '^0[17][0-9]{8}$' then return '+254' || substring(v_digits from 2); end if;
  if v_digits ~ '^254[17][0-9]{8}$' then return '+' || v_digits; end if;
  return null;
end;
$$;
revoke execute on function public.normalize_fulfillment_phone(text) from public,anon;
grant execute on function public.normalize_fulfillment_phone(text) to authenticated,service_role;

create or replace function public.generate_fulfillment_pin()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v_bytes bytea:=extensions.gen_random_bytes(4);v_value bigint;
begin
  v_value:=(get_byte(v_bytes,0)::bigint<<24)
    +(get_byte(v_bytes,1)::bigint<<16)
    +(get_byte(v_bytes,2)::bigint<<8)
    +get_byte(v_bytes,3);
  return lpad((v_value%1000000)::text,6,'0');
end;
$$;
revoke execute on function public.generate_fulfillment_pin() from public,anon,authenticated;
grant execute on function public.generate_fulfillment_pin() to service_role;

create or replace function public.current_fulfillment_membership_id(p_location_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.company_memberships m
  join public.company_membership_locations ml
    on ml.membership_id=m.id and ml.company_id=m.company_id
  join public.stock_locations l
    on l.id=ml.location_id and l.company_id=m.company_id and l.is_active
  where m.company_id=public.current_company_id() and m.user_id=auth.uid()
    and m.authorization_status='approved' and ml.location_id=p_location_id
  limit 1
$$;
revoke execute on function public.current_fulfillment_membership_id(uuid) from public,anon;
grant execute on function public.current_fulfillment_membership_id(uuid) to authenticated,service_role;

create or replace function public.fulfillment_has_capability(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_permission='ManageFulfillments' then
      public.current_user_has_permission('ManageFulfillments')
    when p_permission='ProcessFulfillments' then
      public.current_user_has_permission('ManageFulfillments')
      or public.current_user_has_permission('ProcessFulfillments')
    when p_permission='CompleteFulfillments' then
      public.current_user_has_permission('ManageFulfillments')
      or public.current_user_has_permission('CompleteFulfillments')
    else false end
$$;
revoke execute on function public.fulfillment_has_capability(text) from public,anon;
grant execute on function public.fulfillment_has_capability(text) to authenticated,service_role;

create or replace function public.assert_fulfillment_location_ready(
  p_company_id uuid,p_location_id uuid
)
returns public.fulfillment_settings
language plpgsql stable security definer set search_path = '' as $$
declare v_settings public.fulfillment_settings%rowtype;
begin
  if p_company_id is null or p_company_id is distinct from public.current_company_id() then
    raise exception 'not_authenticated';
  end if;
  perform public.assert_entitled(p_company_id,null);
  if not coalesce(public.feature_enabled(p_company_id,'fulfillment'),false) then
    raise exception 'feature_unavailable: fulfillment';
  end if;
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  select * into v_settings from public.fulfillment_settings s
  where s.company_id=p_company_id and s.location_id=p_location_id and s.enabled;
  if v_settings.location_id is null then raise exception 'fulfillment_not_enabled_at_location'; end if;
  return v_settings;
end;
$$;
revoke execute on function public.assert_fulfillment_location_ready(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.assert_fulfillment_location_ready(uuid,uuid) to service_role;

create or replace function public.fulfillment_settings_at_location(p_location_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  select to_jsonb(s)||jsonb_build_object(
    'feature_available',coalesce(public.feature_enabled(v_company_id,'fulfillment'),false),
    'delivery_fee_variant',case when v.id is null then null else jsonb_build_object(
      'id',v.id,'name',p.name||case when v.name='Default' then '' else ' - '||v.name end,
      'price',v.price,'active',v.active) end
  ) into v_result
  from public.fulfillment_settings s
  left join public.product_variants v on v.id=s.default_delivery_fee_variant_id
  left join public.products p on p.id=v.product_id
  where s.company_id=v_company_id and s.location_id=p_location_id;
  return coalesce(v_result,jsonb_build_object(
    'company_id',v_company_id,'location_id',p_location_id,'enabled',false,
    'pickup_enabled',true,'delivery_enabled',true,'cod_enabled',false,
    'pickup_sla_minutes',30,'delivery_sla_minutes',60,
    'notification_channel','whatsapp','sms_fallback',true,
    'notify_initial',true,'notify_ready',true,'notify_in_transit',true,
    'notify_failed',true,'notify_fulfilled',false,'tracking_token_ttl_days',14,
    'feature_available',coalesce(public.feature_enabled(v_company_id,'fulfillment'),false)
  ));
end;
$$;
revoke execute on function public.fulfillment_settings_at_location(uuid) from public,anon;
grant execute on function public.fulfillment_settings_at_location(uuid) to authenticated;

create or replace function public.update_fulfillment_settings(
  p_location_id uuid,p_settings jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_existing public.fulfillment_settings%rowtype;
  v_variant public.product_variants%rowtype;v_notification_changed boolean:=false;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required'; end if;
  if not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' then
    raise exception 'invalid_fulfillment_settings'; end if;
  if coalesce((p_settings->>'enabled')::boolean,false) then
    perform public.assert_entitled(v_company_id,null);
    if not coalesce(public.feature_enabled(v_company_id,'fulfillment'),false) then
      raise exception 'feature_unavailable: fulfillment'; end if;
  end if;
  select * into v_existing from public.fulfillment_settings
  where company_id=v_company_id and location_id=p_location_id for update;
  v_notification_changed:=p_settings ?| array[
    'notification_channel','sms_fallback','notify_ready',
    'notify_in_transit','notify_failed','notify_fulfilled'
  ];
  if v_notification_changed and not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required for notifications'; end if;
  if nullif(p_settings->>'default_delivery_fee_variant_id','') is not null then
    select * into v_variant from public.product_variants
    where id=(p_settings->>'default_delivery_fee_variant_id')::uuid
      and company_id=v_company_id;
    if v_variant.id is null or not v_variant.active or v_variant.kind<>'service'
      or v_variant.track_inventory then
      raise exception 'delivery_fee_requires_active_non_stock_service_variant'; end if;
  end if;
  insert into public.fulfillment_settings(
    company_id,location_id,enabled,pickup_enabled,delivery_enabled,cod_enabled,
    default_delivery_fee_variant_id,pickup_sla_minutes,delivery_sla_minutes,
    notification_channel,sms_fallback,notify_initial,notify_ready,notify_in_transit,
    notify_failed,notify_fulfilled,tracking_token_ttl_days
  ) values(
    v_company_id,p_location_id,
    coalesce((p_settings->>'enabled')::boolean,v_existing.enabled,false),
    coalesce((p_settings->>'pickup_enabled')::boolean,v_existing.pickup_enabled,true),
    coalesce((p_settings->>'delivery_enabled')::boolean,v_existing.delivery_enabled,true),
    coalesce((p_settings->>'cod_enabled')::boolean,v_existing.cod_enabled,false),
    case when p_settings ? 'default_delivery_fee_variant_id'
      then nullif(p_settings->>'default_delivery_fee_variant_id','')::uuid
      else v_existing.default_delivery_fee_variant_id end,
    coalesce((p_settings->>'pickup_sla_minutes')::integer,v_existing.pickup_sla_minutes,30),
    coalesce((p_settings->>'delivery_sla_minutes')::integer,v_existing.delivery_sla_minutes,60),
    coalesce(nullif(p_settings->>'notification_channel',''),v_existing.notification_channel,'whatsapp'),
    coalesce((p_settings->>'sms_fallback')::boolean,v_existing.sms_fallback,true),
    true,
    coalesce((p_settings->>'notify_ready')::boolean,v_existing.notify_ready,true),
    coalesce((p_settings->>'notify_in_transit')::boolean,v_existing.notify_in_transit,true),
    coalesce((p_settings->>'notify_failed')::boolean,v_existing.notify_failed,true),
    coalesce((p_settings->>'notify_fulfilled')::boolean,v_existing.notify_fulfilled,false),
    coalesce((p_settings->>'tracking_token_ttl_days')::integer,v_existing.tracking_token_ttl_days,14)
  ) on conflict(location_id) do update set
    enabled=excluded.enabled,pickup_enabled=excluded.pickup_enabled,
    delivery_enabled=excluded.delivery_enabled,cod_enabled=excluded.cod_enabled,
    default_delivery_fee_variant_id=excluded.default_delivery_fee_variant_id,
    pickup_sla_minutes=excluded.pickup_sla_minutes,
    delivery_sla_minutes=excluded.delivery_sla_minutes,
    notification_channel=excluded.notification_channel,sms_fallback=excluded.sms_fallback,
    notify_initial=true,notify_ready=excluded.notify_ready,
    notify_in_transit=excluded.notify_in_transit,notify_failed=excluded.notify_failed,
    notify_fulfilled=excluded.notify_fulfilled,
    tracking_token_ttl_days=excluded.tracking_token_ttl_days,updated_at=now();
  return public.fulfillment_settings_at_location(p_location_id);
end;
$$;
revoke execute on function public.update_fulfillment_settings(uuid,jsonb) from public,anon;
grant execute on function public.update_fulfillment_settings(uuid,jsonb) to authenticated;

create or replace function public.match_checkout_customers(p_phone text)
returns table(id uuid,display_name text,phone text,phone_normalized text)
language plpgsql stable security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();v_phone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  v_phone:=public.normalize_fulfillment_phone(p_phone);
  if v_phone is null then return; end if;
  return query select c.id,btrim(c.first_name||' '||coalesce(c.last_name,'')),c.phone,c.phone_normalized
  from public.customers c where c.company_id=v_company_id and c.deleted_at is null
    and c.phone_normalized=v_phone order by c.created_at desc limit 10;
end;
$$;
revoke execute on function public.match_checkout_customers(text) from public,anon;
grant execute on function public.match_checkout_customers(text) to authenticated;

create or replace function public.resolve_checkout_customer_core(
  p_company_id uuid,p_customer jsonb,p_require_customer boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid:=nullif(p_customer->>'customer_id','')::uuid;
  v_name text:=btrim(coalesce(p_customer->>'name',''));
  v_phone text:=public.normalize_fulfillment_phone(p_customer->>'phone');
  v_save boolean:=coalesce((p_customer->>'save_as_customer')::boolean,true);
  v_match_count integer;v_first text;v_last text;
begin
  if v_customer_id is not null then
    if not exists(select 1 from public.customers c where c.id=v_customer_id
      and c.company_id=p_company_id and c.deleted_at is null) then
      raise exception 'customer_not_found'; end if;
    return v_customer_id;
  end if;
  if p_require_customer then v_save:=true; end if;
  if not v_save then return null; end if;
  if v_name='' then raise exception 'customer_name_required'; end if;
  if v_phone is not null then
    select count(*),min(c.id::text)::uuid into v_match_count,v_customer_id
    from public.customers c where c.company_id=p_company_id and c.deleted_at is null
      and c.phone_normalized=v_phone;
    if v_match_count>1 then raise exception 'multiple_phone_matches: select a customer'; end if;
    if v_match_count=1 then return v_customer_id; end if;
  end if;
  v_first:=split_part(v_name,' ',1);
  v_last:=nullif(btrim(substring(v_name from length(v_first)+1)),'');
  insert into public.customers(
    company_id,first_name,last_name,phone,phone_normalized,customer_origin,
    notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled
  ) values(
    p_company_id,v_first,v_last,v_phone,v_phone,'checkout',false,false,false
  ) returning id into v_customer_id;
  return v_customer_id;
end;
$$;
revoke execute on function public.resolve_checkout_customer_core(uuid,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.resolve_checkout_customer_core(uuid,jsonb,boolean) to service_role;

create or replace function public.append_fulfillment_event_core(
  p_fulfillment_id uuid,p_event_kind text,p_from_status text,p_to_status text,
  p_note text default null,p_source_kind text default 'staff',
  p_source_reference text default null,p_metadata jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_fulfillment public.order_fulfillments%rowtype;v_membership uuid;v_id uuid;
begin
  select * into v_fulfillment from public.order_fulfillments where id=p_fulfillment_id;
  if v_fulfillment.id is null then raise exception 'fulfillment_not_found'; end if;
  if p_source_kind='staff' then
    v_membership:=public.current_fulfillment_membership_id(v_fulfillment.location_id);
  end if;
  insert into public.fulfillment_events(
    company_id,fulfillment_id,actor_user_id,actor_membership_id,from_status,to_status,
    event_kind,note,source_kind,source_reference,metadata
  ) values(
    v_fulfillment.company_id,v_fulfillment.id,
    case when p_source_kind='staff' then auth.uid() end,v_membership,p_from_status,p_to_status,
    p_event_kind,nullif(btrim(coalesce(p_note,'')),''),p_source_kind,
    nullif(btrim(coalesce(p_source_reference,'')),''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.append_fulfillment_event_core(
  uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.append_fulfillment_event_core(
  uuid,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.queue_fulfillment_message_core(
  p_fulfillment_id uuid,p_event_id uuid,p_milestone text,
  p_tracking_token text default null,p_pin text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_s public.fulfillment_settings%rowtype;
  v_order public.orders%rowtype;v_company public.companies%rowtype;v_template record;
  v_enabled boolean;v_body text;v_url text;v_origin text;v_outbox_id uuid;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.phone_normalized is null
    or (p_milestone<>'initial' and not v_f.transactional_message_consent) then
    return null; end if;
  select * into v_s from public.fulfillment_settings where location_id=v_f.location_id;
  v_enabled:=case p_milestone when 'initial' then true
    when 'ready' then v_s.notify_ready when 'in_transit' then v_s.notify_in_transit
    when 'failed' then v_s.notify_failed when 'fulfilled' then v_s.notify_fulfilled
    else false end;
  if not coalesce(v_enabled,false) then return null; end if;
  select * into v_order from public.orders where id=v_f.order_id;
  select * into v_company from public.companies where id=v_f.company_id;
  select t.* into v_template from public.message_templates t
  where t.template_key='fulfillment-'||replace(p_milestone,'_','-') and t.active
    and (t.company_id=v_f.company_id or t.company_id is null)
  order by (t.company_id is not null) desc limit 1;
  if v_template.id is null then return null; end if;
  if p_tracking_token is not null then
    select decrypted_secret into v_origin from vault.decrypted_secrets
    where name='STOREFRONT_PUBLIC_URL' limit 1;
    v_url:=rtrim(coalesce(v_origin,''),'/')||'/track/'||p_tracking_token;
  end if;
  v_body:=public.render_message_template(
    case when v_s.notification_channel='whatsapp' then v_template.whatsapp_body
      else v_template.sms_body end,
    jsonb_build_object('company_name',v_company.name,'order_code',v_order.code,
      'tracking_url',coalesce(v_url,''),'pin',coalesce(p_pin,''))
  );
  v_outbox_id:=public.queue_message(
    v_f.company_id,v_s.notification_channel,v_f.phone_normalized,v_body,null
  );
  update public.outbox set source='fulfillment',fulfillment_id=v_f.id,
    fulfillment_event_id=p_event_id,template_key=v_template.template_key,
    template_version=v_template.version,
    fallback_channel=case when v_s.notification_channel='whatsapp' and v_s.sms_fallback
      then 'sms' end,
    fallback_body=case when v_s.notification_channel='whatsapp' and v_s.sms_fallback
      then public.render_message_template(v_template.sms_body,jsonb_build_object(
        'company_name',v_company.name,'order_code',v_order.code,
        'tracking_url',coalesce(v_url,''),'pin',coalesce(p_pin,''))) end
  where id=v_outbox_id;
  return v_outbox_id;
exception when unique_violation then return null;
end;
$$;
revoke execute on function public.queue_fulfillment_message_core(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.queue_fulfillment_message_core(uuid,uuid,text,text,text)
  to service_role;

create or replace function public.assert_order_fulfillment_request(
  p_order_id uuid,p_customer_id uuid,p_payload jsonb
)
returns public.fulfillment_settings language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;v_settings public.fulfillment_settings%rowtype;
  v_type text:=p_payload->>'type';
  v_collection_kind text:=coalesce(p_payload->>'collection_kind','none');
  v_phone text:=public.normalize_fulfillment_phone(p_payload->>'phone');
  v_name text:=btrim(coalesce(p_payload->>'recipient_name',''));
begin
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if auth.role()='service_role' then
    select * into v_settings from public.fulfillment_settings s
    where s.company_id=v_order.company_id and s.location_id=v_order.location_id and s.enabled;
    if v_settings.location_id is null
      or not coalesce(public.feature_enabled(v_order.company_id,'fulfillment'),false) then
      raise exception 'fulfillment_not_enabled_at_location'; end if;
  else
    v_settings:=public.assert_fulfillment_location_ready(v_order.company_id,v_order.location_id);
  end if;
  if v_type not in('pickup','delivery') then raise exception 'invalid_fulfillment_type'; end if;
  if v_collection_kind not in('none','cod') then raise exception 'invalid_collection_kind'; end if;
  if v_type='pickup' and not v_settings.pickup_enabled then raise exception 'pickup_not_enabled'; end if;
  if v_type='delivery' and not v_settings.delivery_enabled then raise exception 'delivery_not_enabled'; end if;
  if v_collection_kind='cod' and not v_settings.cod_enabled then raise exception 'cod_not_enabled'; end if;
  if v_collection_kind='cod' and (v_type<>'delivery' or p_customer_id is null) then
    raise exception 'cod_requires_delivery_customer'; end if;
  if v_name='' or length(v_name)>120 then raise exception 'recipient_name_required'; end if;
  if v_type='delivery' and (v_phone is null
    or nullif(btrim(coalesce(p_payload->>'address','')),'') is null) then
    raise exception 'delivery_contact_and_address_required'; end if;
  if v_type='delivery' and v_settings.default_delivery_fee_variant_id is null then
    raise exception 'delivery_fee_not_configured'; end if;
  if v_type='delivery' and not exists(select 1 from public.order_lines l
    where l.order_id=v_order.id and l.variant_id=v_settings.default_delivery_fee_variant_id) then
    raise exception 'delivery_fee_line_required'; end if;
  return v_settings;
end;
$$;
revoke execute on function public.assert_order_fulfillment_request(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.assert_order_fulfillment_request(uuid,uuid,jsonb)
  to service_role;

create or replace function public.create_order_fulfillment_core(
  p_order_id uuid,p_customer_id uuid,p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;v_settings public.fulfillment_settings%rowtype;
  v_existing public.order_fulfillments%rowtype;v_id uuid;v_event_id uuid;
  v_type text:=p_payload->>'type';v_collection_kind text:=coalesce(p_payload->>'collection_kind','none');
  v_phone text:=public.normalize_fulfillment_phone(p_payload->>'phone');
  v_name text:=btrim(coalesce(p_payload->>'recipient_name',''));
  v_token text;v_pin text;v_fingerprint text;v_promised timestamptz;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  v_settings:=public.assert_order_fulfillment_request(p_order_id,p_customer_id,p_payload);
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'order',p_order_id,'customer',p_customer_id,'payload',p_payload
  )::text,'sha256'),'hex');
  select * into v_existing from public.order_fulfillments
  where company_id=v_order.company_id and order_id=v_order.id;
  if v_existing.id is not null then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'idempotency_conflict: fulfillment payload changed'; end if;
    return jsonb_build_object('fulfillment_id',v_existing.id,'status',v_existing.status,
      'state_version',v_existing.state_version,'tracking_token',null,'pin',null);
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_pin:=public.generate_fulfillment_pin();
  v_promised:=coalesce(nullif(p_payload->>'promised_at','')::timestamptz,
    now()+make_interval(mins=>case when v_type='pickup' then v_settings.pickup_sla_minutes
      else v_settings.delivery_sla_minutes end));
  insert into public.order_fulfillments(
    company_id,location_id,order_id,fulfillment_type,collection_kind,customer_id,
    recipient_name,phone_normalized,address_line,landmark,map_link,preparation_notes,
    handoff_notes,promised_at,transactional_message_consent,tracking_token_hash,
    tracking_expires_at,pin_hash,request_fingerprint,created_by
  ) values(
    v_order.company_id,v_order.location_id,v_order.id,v_type,v_collection_kind,p_customer_id,
    v_name,v_phone,nullif(btrim(coalesce(p_payload->>'address','')),''),
    nullif(btrim(coalesce(p_payload->>'landmark','')),''),
    nullif(btrim(coalesce(p_payload->>'map_link','')),''),
    nullif(btrim(coalesce(p_payload->>'preparation_notes','')),''),
    nullif(btrim(coalesce(p_payload->>'handoff_notes','')),''),v_promised,
    coalesce((p_payload->>'transactional_message_consent')::boolean,false),
    encode(extensions.digest(v_token,'sha256'),'hex'),
    now()+make_interval(days=>v_settings.tracking_token_ttl_days),
    extensions.crypt(v_pin,extensions.gen_salt('bf',10)),v_fingerprint,auth.uid()
  ) returning id into v_id;
  v_event_id:=public.append_fulfillment_event_core(
    v_id,'created',null,'pending',null,
    case when auth.uid() is null then 'system' else 'staff' end,null,
    jsonb_build_object('type',v_type,'collection_kind',v_collection_kind));
  begin
    perform public.queue_fulfillment_message_core(v_id,v_event_id,'initial',v_token,v_pin);
  exception when others then
    perform public.append_fulfillment_event_core(v_id,'message_failed',null,null,sqlerrm,
      'system',null,jsonb_build_object('milestone','initial'));
  end;
  return jsonb_build_object('fulfillment_id',v_id,'status','pending','state_version',1,
    'tracking_token',v_token,'pin',v_pin);
end;
$$;
revoke execute on function public.create_order_fulfillment_core(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.create_order_fulfillment_core(uuid,uuid,jsonb) to service_role;

create or replace function public.attach_order_fulfillment_core(
  p_sale jsonb,p_customer_id uuid,p_payload jsonb,p_allow_pending boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid:=(p_sale->>'order_id')::uuid;v_status text:=p_sale->>'status';
  v_approval public.approvals%rowtype;v_fingerprint text;
begin
  if v_status='completed' or p_allow_pending then
    return public.create_order_fulfillment_core(v_order_id,p_customer_id,p_payload);
  end if;
  if v_status<>'approval_required' then
    raise exception 'fulfillment_sale_not_accepted: %',coalesce(v_status,'unknown'); end if;
  perform public.assert_order_fulfillment_request(v_order_id,p_customer_id,p_payload);
  if public.normalize_fulfillment_phone(p_payload->>'phone') is null then
    raise exception 'approval_held_fulfillment_phone_required'; end if;
  v_fingerprint:=encode(extensions.digest(coalesce(p_payload,'{}'::jsonb)::text,
    'sha256'),'hex');
  select * into v_approval from public.approvals
  where id=(p_sale->>'approval_id')::uuid and subject_id=v_order_id for update;
  if v_approval.id is null or v_approval.status<>'pending' then
    raise exception 'fulfillment_approval_not_found'; end if;
  if v_approval.metadata->>'fulfillment_request_fingerprint' is not null
    and v_approval.metadata->>'fulfillment_request_fingerprint'<>v_fingerprint then
    raise exception 'idempotency_conflict: fulfillment intent changed'; end if;
  update public.approvals set metadata=metadata||jsonb_build_object(
    'fulfillment_request',p_payload,
    'fulfillment_request_fingerprint',v_fingerprint
  ) where id=v_approval.id;
  return jsonb_build_object(
    'fulfillment_id',null,'tracking_token',null,'pin',null,'state_version',null
  );
end;
$$;
revoke execute on function public.attach_order_fulfillment_core(jsonb,uuid,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.attach_order_fulfillment_core(jsonb,uuid,jsonb,boolean)
  to service_role;

create or replace function public.post_fulfillment_sale_at_location(
  p_location_id uuid,p_customer jsonb,p_lines jsonb,p_payments jsonb,
  p_fulfillment jsonb,p_client_ref text,p_draft_id uuid default null,
  p_approval_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_customer_id uuid;v_sale jsonb;
  v_fulfillment jsonb;v_cod boolean:=coalesce(p_fulfillment->>'collection_kind','none')='cod';
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_customer_id:=public.resolve_checkout_customer_core(v_company_id,coalesce(p_customer,'{}'),v_cod);
  if v_cod and jsonb_array_length(coalesce(p_payments,'[]'))<>0 then
    raise exception 'cod_checkout_cannot_take_tender'; end if;
  v_sale:=public.post_sale_at_location(
    p_location_id,v_customer_id,p_lines,case when v_cod then '[]'::jsonb else p_payments end,
    v_cod,p_client_ref,p_draft_id,p_approval_reason
  );
  v_fulfillment:=public.attach_order_fulfillment_core(
    v_sale,v_customer_id,p_fulfillment,v_cod
  );
  return v_sale||v_fulfillment||jsonb_build_object('customer_id',v_customer_id,
    'status',case when v_cod then 'pending' else v_sale->>'status' end);
end;
$$;
revoke execute on function public.post_fulfillment_sale_at_location(
  uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text) from public,anon;
grant execute on function public.post_fulfillment_sale_at_location(
  uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,text) to authenticated;

create or replace function public.post_fulfillment_credit_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_fulfillment jsonb,
  p_client_ref text,p_draft_id uuid default null,p_approval_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_sale jsonb;v_fulfillment jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if coalesce(p_fulfillment->>'collection_kind','none')<>'none' then
    raise exception 'credit_sale_cannot_collect_cod'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_sale:=public.post_credit_sale_at_location(
    p_location_id,p_customer_id,p_lines,p_client_ref,p_draft_id,p_approval_reason
  );
  v_fulfillment:=public.attach_order_fulfillment_core(
    v_sale,p_customer_id,p_fulfillment,false
  );
  return v_sale||v_fulfillment||jsonb_build_object('customer_id',p_customer_id,
    'status',v_sale->>'status');
end;
$$;
revoke execute on function public.post_fulfillment_credit_sale_at_location(
  uuid,uuid,jsonb,jsonb,text,uuid,text) from public,anon;
grant execute on function public.post_fulfillment_credit_sale_at_location(
  uuid,uuid,jsonb,jsonb,text,uuid,text) to authenticated;

create or replace function public.post_offline_fulfillment_sale_at_location(
  p_location_id uuid,p_customer jsonb,p_lines jsonb,p_payments jsonb,p_fulfillment jsonb,
  p_client_ref text,p_occurred_at timestamptz,p_device_key text,p_pending_count integer default 1,
  p_draft_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();v_customer_id uuid;v_sale jsonb;v_f jsonb;
begin
  if coalesce(p_fulfillment->>'collection_kind','none')='cod' then
    raise exception 'offline_cod_checkout_not_supported'; end if;
  if public.normalize_fulfillment_phone(p_fulfillment->>'phone') is null then
    raise exception 'offline_fulfillment_recipient_phone_required'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_customer_id:=public.resolve_checkout_customer_core(v_company_id,coalesce(p_customer,'{}'),false);
  v_sale:=public.post_offline_sale_at_location(p_location_id,v_customer_id,p_lines,p_payments,
    p_client_ref,p_occurred_at,p_device_key,p_pending_count,p_draft_id);
  if v_sale->>'status'<>'completed' then
    raise exception 'offline_fulfillment_requires_immediate_replay'; end if;
  v_f:=public.create_order_fulfillment_core((v_sale->>'order_id')::uuid,v_customer_id,p_fulfillment);
  return v_sale||v_f||jsonb_build_object('customer_id',v_customer_id);
end;
$$;
revoke execute on function public.post_offline_fulfillment_sale_at_location(
  uuid,jsonb,jsonb,jsonb,jsonb,text,timestamptz,text,integer,uuid) from public,anon;
grant execute on function public.post_offline_fulfillment_sale_at_location(
  uuid,jsonb,jsonb,jsonb,jsonb,text,timestamptz,text,integer,uuid) to authenticated;

create or replace function public.assert_fulfillment_execution_ready(
  p_fulfillment_id uuid,p_source_kind text default 'staff',p_source_reference text default null
)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_membership uuid;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null then raise exception 'fulfillment_not_found'; end if;
  if p_source_kind='provider' then
    if auth.role()<>'service_role' or nullif(btrim(coalesce(p_source_reference,'')),'') is null then
      raise exception 'provider_execution_context_required'; end if;
    return null;
  end if;
  if p_source_kind<>'staff' then raise exception 'invalid_fulfillment_source'; end if;
  if v_f.company_id is distinct from public.current_company_id() then raise exception 'not_authorized'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if not public.fulfillment_has_capability('CompleteFulfillments') then
    raise exception 'permission_denied: CompleteFulfillments required'; end if;
  v_membership:=public.current_fulfillment_membership_id(v_f.location_id);
  if v_membership is null then raise exception 'location_access_denied'; end if;
  if not public.current_user_has_permission('ManageFulfillments')
    and v_f.assigned_membership_id is distinct from v_membership then
    raise exception 'fulfillment_assignment_required'; end if;
  return v_membership;
end;
$$;
revoke execute on function public.assert_fulfillment_execution_ready(uuid,text,text)
  from public,anon;
grant execute on function public.assert_fulfillment_execution_ready(uuid,text,text)
  to authenticated,service_role;

create or replace function public.fulfillment_board(
  p_location_id uuid,p_statuses text[] default null,p_mine boolean default false,
  p_cursor timestamptz default null,p_limit integer default 100
)
returns table(
  id uuid,order_id uuid,order_code text,fulfillment_type text,status text,collection_kind text,
  promised_at timestamptz,updated_at timestamptz,state_version bigint,
  assigned_membership_id uuid,assigned_name text,recipient_name text,phone_normalized text,
  address_line text,landmark text,map_link text,preparation_notes text,handoff_notes text,
  order_status text,cod_balance bigint,items jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_membership uuid;
  v_manage boolean;v_process boolean;v_complete boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_manage:=public.current_user_has_permission('ManageFulfillments');
  v_process:=public.fulfillment_has_capability('ProcessFulfillments');
  v_complete:=public.fulfillment_has_capability('CompleteFulfillments');
  if not (v_manage or v_process or v_complete) then
    raise exception 'permission_denied: fulfillment capability required'; end if;
  v_membership:=public.current_fulfillment_membership_id(p_location_id);
  return query
  select f.id,f.order_id,o.code,f.fulfillment_type,f.status,f.collection_kind,f.promised_at,
    f.updated_at,f.state_version,f.assigned_membership_id,
    coalesce(sp.display_name,am.user_id::text),
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.recipient_name end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.phone_normalized end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.address_line end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.landmark end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.map_link end,
    case when v_manage or v_process then f.preparation_notes end,
    case when v_manage or (v_complete and f.assigned_membership_id=v_membership)
      then f.handoff_notes end,
    o.status,
    case when f.collection_kind='cod'
      and (v_manage or (v_complete and f.assigned_membership_id=v_membership)) then
      public.order_open_balance_core(o.id) end,
    coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end,
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb)
  from public.order_fulfillments f
  join public.orders o on o.id=f.order_id and o.company_id=f.company_id
  left join public.company_memberships am on am.id=f.assigned_membership_id
  left join public.company_staff_profiles sp on sp.company_id=am.company_id and sp.user_id=am.user_id
  where f.company_id=v_company_id and f.location_id=p_location_id
    and (f.collection_kind='cod' or o.status='completed')
    and (p_statuses is null or f.status=any(p_statuses))
    and (p_cursor is null or f.updated_at<p_cursor)
    and (not p_mine or f.assigned_membership_id=v_membership)
    and (v_manage or v_process or f.assigned_membership_id=v_membership
      or (v_complete and f.assigned_membership_id is null and f.status in('ready','failed')))
  order by f.updated_at desc,f.id desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$$;
revoke execute on function public.fulfillment_board(uuid,text[],boolean,timestamptz,integer)
  from public,anon;
grant execute on function public.fulfillment_board(uuid,text[],boolean,timestamptz,integer)
  to authenticated;

create or replace function public.fulfillment_detail(p_fulfillment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_f public.order_fulfillments%rowtype;v_membership uuid;v_manage boolean;
  v_process boolean;v_complete boolean;v_sensitive boolean;v_claimable boolean;v_result jsonb;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  v_membership:=public.current_fulfillment_membership_id(v_f.location_id);
  v_manage:=public.current_user_has_permission('ManageFulfillments');
  v_process:=public.fulfillment_has_capability('ProcessFulfillments');
  v_complete:=public.fulfillment_has_capability('CompleteFulfillments');
  v_sensitive:=v_manage or (v_complete and v_f.assigned_membership_id=v_membership);
  v_claimable:=v_complete and v_f.assigned_membership_id is null
    and v_f.status in('ready','failed');
  if not (v_manage or v_process or v_sensitive or v_claimable) then
    raise exception 'permission_denied: fulfillment not assigned'; end if;
  select jsonb_build_object(
    'id',f.id,'order_id',o.id,'order_code',o.code,'order_status',o.status,
    'fulfillment_type',f.fulfillment_type,'status',f.status,'collection_kind',f.collection_kind,
    'promised_at',f.promised_at,'updated_at',f.updated_at,'state_version',f.state_version,
    'assigned_membership_id',f.assigned_membership_id,
    'recipient_name',case when v_sensitive then f.recipient_name end,
    'phone_normalized',case when v_sensitive then f.phone_normalized end,
    'address_line',case when v_sensitive then f.address_line end,
    'landmark',case when v_sensitive then f.landmark end,
    'map_link',case when v_sensitive then f.map_link end,
    'preparation_notes',case when v_manage or v_process then f.preparation_notes end,
    'handoff_notes',case when v_sensitive then f.handoff_notes end,
    'cod_balance',case when f.collection_kind='cod' and v_sensitive then
      public.order_open_balance_core(o.id) end,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end,
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_kind',e.event_kind,'from_status',e.from_status,
      'to_status',e.to_status,'note',case when v_sensitive then e.note end,
      'source_kind',e.source_kind,
      'created_at',e.created_at) order by e.created_at,e.id)
      from public.fulfillment_events e where e.fulfillment_id=f.id),'[]'::jsonb)
  ) into v_result
  from public.order_fulfillments f join public.orders o on o.id=f.order_id
  where f.id=v_f.id;
  return v_result;
end;
$$;
revoke execute on function public.fulfillment_detail(uuid) from public,anon;
grant execute on function public.fulfillment_detail(uuid) to authenticated;

create or replace function public.fulfillment_assignees(p_location_id uuid)
returns table(membership_id uuid,display_name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if not public.current_user_has_permission('ManageFulfillments') then
    raise exception 'permission_denied: ManageFulfillments required'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  return query select m.id,coalesce(sp.display_name,m.user_id::text)
  from public.company_memberships m
  join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  join public.company_membership_locations ml on ml.membership_id=m.id
  left join public.company_staff_profiles sp on sp.company_id=m.company_id and sp.user_id=m.user_id
  where m.company_id=v_company_id and m.authorization_status='approved'
    and ml.location_id=p_location_id
    and ('CompleteFulfillments'=any(r.permissions) or 'ManageFulfillments'=any(r.permissions))
  order by coalesce(sp.display_name,m.user_id::text);
end;
$$;
revoke execute on function public.fulfillment_assignees(uuid) from public,anon;
grant execute on function public.fulfillment_assignees(uuid) to authenticated;

create or replace function public.claim_fulfillment(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_membership uuid;v_event uuid;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if not public.fulfillment_has_capability('CompleteFulfillments') then
    raise exception 'permission_denied: CompleteFulfillments required'; end if;
  v_membership:=public.current_fulfillment_membership_id(v_f.location_id);
  if v_membership is null then raise exception 'location_access_denied'; end if;
  if v_f.state_version<>p_expected_version then
    raise exception 'stale_fulfillment_version: expected %, current %',p_expected_version,v_f.state_version;
  end if;
  if v_f.status not in('ready','failed') then raise exception 'fulfillment_not_claimable'; end if;
  if v_f.assigned_membership_id is not null and v_f.assigned_membership_id<>v_membership then
    raise exception 'fulfillment_already_assigned'; end if;
  update public.order_fulfillments set assigned_membership_id=v_membership,
    claimed_at=coalesce(claimed_at,now()),state_version=state_version+1,updated_at=now()
  where id=v_f.id;
  v_event:=public.append_fulfillment_event_core(v_f.id,'claimed',v_f.status,v_f.status);
  return jsonb_build_object('fulfillment_id',v_f.id,'state_version',v_f.state_version+1,
    'assigned_membership_id',v_membership,'event_id',v_event);
end;
$$;
revoke execute on function public.claim_fulfillment(uuid,bigint) from public,anon;
grant execute on function public.claim_fulfillment(uuid,bigint) to authenticated;

create or replace function public.assign_fulfillment(
  p_fulfillment_id uuid,p_membership_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_event uuid;
begin
  if not public.current_user_has_permission('ManageFulfillments') then
    raise exception 'permission_denied: ManageFulfillments required'; end if;
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if v_f.status in('fulfilled','cancelled') then raise exception 'terminal_fulfillment'; end if;
  if not exists(select 1 from public.company_memberships m
    join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    join public.company_membership_locations ml on ml.membership_id=m.id
    where m.id=p_membership_id and m.company_id=v_f.company_id
      and m.authorization_status='approved' and ml.location_id=v_f.location_id
      and ('CompleteFulfillments'=any(r.permissions) or 'ManageFulfillments'=any(r.permissions))) then
    raise exception 'assignee_not_eligible'; end if;
  update public.order_fulfillments set assigned_membership_id=p_membership_id,
    claimed_at=now(),state_version=state_version+1,updated_at=now() where id=v_f.id;
  v_event:=public.append_fulfillment_event_core(v_f.id,'assigned',v_f.status,v_f.status,null,
    'staff',null,jsonb_build_object('membership_id',p_membership_id));
  return jsonb_build_object('fulfillment_id',v_f.id,'state_version',v_f.state_version+1,
    'assigned_membership_id',p_membership_id,'event_id',v_event);
end;
$$;
revoke execute on function public.assign_fulfillment(uuid,uuid,bigint) from public,anon;
grant execute on function public.assign_fulfillment(uuid,uuid,bigint) to authenticated;

create or replace function public.transition_fulfillment_core(
  p_fulfillment_id uuid,p_target text,p_expected_version bigint,p_payload jsonb default '{}'::jsonb,
  p_source_kind text default 'staff',p_source_reference text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_allowed boolean:=false;v_event uuid;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null then raise exception 'fulfillment_not_found'; end if;
  if v_f.state_version<>p_expected_version then
    raise exception 'stale_fulfillment_version: expected %, current %',p_expected_version,v_f.state_version;
  end if;
  v_allowed:=case
    when v_f.status='pending' and p_target='processing' then true
    when v_f.status='processing' and p_target='ready' then true
    when v_f.status='ready' and v_f.fulfillment_type='delivery' and p_target='in_transit' then true
    when v_f.status='ready' and v_f.fulfillment_type='pickup' and p_target='fulfilled' then true
    when v_f.status='in_transit' and p_target in('fulfilled','failed') then true
    when v_f.status='failed' and p_target='ready' then true
    when v_f.status not in('fulfilled','cancelled') and p_target='cancelled' then true
    else false end;
  if not v_allowed then raise exception 'invalid_fulfillment_transition: % to %',v_f.status,p_target; end if;
  update public.order_fulfillments set status=p_target,state_version=state_version+1,
    updated_at=now(),fulfilled_at=case when p_target='fulfilled' then now() else fulfilled_at end,
    cancelled_at=case when p_target='cancelled' then now() else cancelled_at end
  where id=v_f.id;
  v_event:=public.append_fulfillment_event_core(v_f.id,'status_changed',v_f.status,p_target,
    p_payload->>'note',p_source_kind,p_source_reference,
    coalesce(p_payload-'note','{}'::jsonb));
  if p_target in('ready','in_transit','failed','fulfilled') then
    begin
      perform public.queue_fulfillment_message_core(v_f.id,v_event,p_target,null,null);
    exception when others then
      perform public.append_fulfillment_event_core(v_f.id,'message_failed',null,null,sqlerrm,
        'system',null,jsonb_build_object('milestone',p_target));
    end;
  end if;
  return jsonb_build_object('fulfillment_id',v_f.id,'status',p_target,
    'state_version',v_f.state_version+1,'event_id',v_event);
end;
$$;
revoke execute on function public.transition_fulfillment_core(
  uuid,text,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.transition_fulfillment_core(
  uuid,text,bigint,jsonb,text,text) to service_role;

create or replace function public.assert_fulfillment_preparation_ready(p_fulfillment_id uuid)
returns public.order_fulfillments language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_order_status text;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if not public.fulfillment_has_capability('ProcessFulfillments') then
    raise exception 'permission_denied: ProcessFulfillments required'; end if;
  select status into v_order_status from public.orders where id=v_f.order_id;
  if v_f.collection_kind='none' and v_order_status<>'completed' then
    raise exception 'order_not_completed'; end if;
  return v_f;
end;
$$;
revoke execute on function public.assert_fulfillment_preparation_ready(uuid)
  from public,anon,authenticated;
grant execute on function public.assert_fulfillment_preparation_ready(uuid) to service_role;

create or replace function public.start_fulfillment_preparation(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_fulfillment_preparation_ready(p_fulfillment_id);
  return public.transition_fulfillment_core(p_fulfillment_id,'processing',p_expected_version,
    '{}'::jsonb,'staff',null);
end;
$$;
revoke execute on function public.start_fulfillment_preparation(uuid,bigint) from public,anon;
grant execute on function public.start_fulfillment_preparation(uuid,bigint) to authenticated;

create or replace function public.mark_fulfillment_ready(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_fulfillment_preparation_ready(p_fulfillment_id);
  return public.transition_fulfillment_core(p_fulfillment_id,'ready',p_expected_version,
    '{}'::jsonb,'staff',null);
end;
$$;
revoke execute on function public.mark_fulfillment_ready(uuid,bigint) from public,anon;
grant execute on function public.mark_fulfillment_ready(uuid,bigint) to authenticated;

create or replace function public.report_fulfillment_failure(
  p_fulfillment_id uuid,p_expected_version bigint,p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'reason_required'; end if;
  perform public.assert_fulfillment_execution_ready(p_fulfillment_id,'staff',null);
  return public.transition_fulfillment_core(p_fulfillment_id,'failed',p_expected_version,
    jsonb_build_object('note',btrim(p_reason)),'staff',null);
end;
$$;
revoke execute on function public.report_fulfillment_failure(uuid,bigint,text) from public,anon;
grant execute on function public.report_fulfillment_failure(uuid,bigint,text) to authenticated;

create or replace function public.retry_fulfillment(
  p_fulfillment_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_fulfillment_execution_ready(p_fulfillment_id,'staff',null);
  return public.transition_fulfillment_core(p_fulfillment_id,'ready',p_expected_version,
    '{}'::jsonb,'staff',null);
end;
$$;
revoke execute on function public.retry_fulfillment(uuid,bigint) from public,anon;
grant execute on function public.retry_fulfillment(uuid,bigint) to authenticated;

create or replace function public.complete_fulfillment(
  p_fulfillment_id uuid,p_pin text,p_expected_version bigint,p_override_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_order public.orders%rowtype;v_balance bigint;
  v_override boolean:=nullif(btrim(coalesce(p_override_reason,'')),'') is not null;
begin
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_execution_ready(v_f.id,'staff',null);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if not ((v_f.fulfillment_type='pickup' and v_f.status='ready')
    or (v_f.fulfillment_type='delivery' and v_f.status='in_transit')) then
    raise exception 'fulfillment_not_completable'; end if;
  if v_override then
    if not public.current_user_has_permission('ManageFulfillments')
      or not public.current_user_has_permission('ManageApprovals') then
      raise exception 'permission_denied: ManageFulfillments and ManageApprovals required'; end if;
  elsif v_f.pin_locked_until is not null and v_f.pin_locked_until>now() then
    return jsonb_build_object('status','pin_locked','locked_until',v_f.pin_locked_until,
      'state_version',v_f.state_version);
  elsif p_pin is null or p_pin!~'^[0-9]{6}$'
    or extensions.crypt(p_pin,v_f.pin_hash)<>v_f.pin_hash then
    update public.order_fulfillments set pin_failed_attempts=least(pin_failed_attempts+1,20),
      pin_locked_until=case when pin_failed_attempts+1>=5 then now()+interval '15 minutes'
        else pin_locked_until end,updated_at=now() where id=v_f.id;
    return jsonb_build_object('status','invalid_pin',
      'attempts_remaining',greatest(5-(v_f.pin_failed_attempts+1),0),
      'locked_until',case when v_f.pin_failed_attempts+1>=5 then now()+interval '15 minutes'
        else v_f.pin_locked_until end,'state_version',v_f.state_version);
  end if;
  select * into v_order from public.orders where id=v_f.order_id for update;
  if v_order.status<>'completed' then raise exception 'order_not_completed'; end if;
  if v_f.collection_kind='cod' then
    v_balance:=public.order_open_balance_core(v_order.id);
    if coalesce(v_balance,v_order.total)<>0 then
      raise exception 'cod_balance_due: %',coalesce(v_balance,v_order.total); end if;
  end if;
  update public.order_fulfillments set pin_failed_attempts=0,pin_locked_until=null
  where id=v_f.id;
  return public.transition_fulfillment_core(v_f.id,'fulfilled',p_expected_version,
    jsonb_strip_nulls(jsonb_build_object('pin_override_reason',nullif(btrim(coalesce(p_override_reason,'')),''))),
    'staff',null);
end;
$$;
revoke execute on function public.complete_fulfillment(uuid,text,bigint,text) from public,anon;
grant execute on function public.complete_fulfillment(uuid,text,bigint,text) to authenticated;

create or replace function public.regenerate_fulfillment_access(
  p_fulfillment_id uuid,p_expected_version bigint,p_regenerate_pin boolean default true
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f public.order_fulfillments%rowtype;v_s public.fulfillment_settings%rowtype;
  v_token text;v_pin text;v_event uuid;
begin
  if not public.current_user_has_permission('ManageFulfillments') then
    raise exception 'permission_denied: ManageFulfillments required'; end if;
  select * into v_f from public.order_fulfillments where id=p_fulfillment_id for update;
  if v_f.id is null or v_f.company_id is distinct from public.current_company_id() then
    raise exception 'fulfillment_not_found'; end if;
  perform public.assert_fulfillment_location_ready(v_f.company_id,v_f.location_id);
  if v_f.state_version<>p_expected_version then raise exception 'stale_fulfillment_version'; end if;
  if v_f.status in('fulfilled','cancelled') then raise exception 'terminal_fulfillment'; end if;
  select * into v_s from public.fulfillment_settings where location_id=v_f.location_id;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  if p_regenerate_pin then
    v_pin:=public.generate_fulfillment_pin();
  end if;
  update public.order_fulfillments set
    tracking_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
    tracking_expires_at=now()+make_interval(days=>v_s.tracking_token_ttl_days),
    pin_hash=case when p_regenerate_pin then extensions.crypt(v_pin,extensions.gen_salt('bf',10))
      else pin_hash end,
    pin_generated_at=case when p_regenerate_pin then now() else pin_generated_at end,
    pin_failed_attempts=case when p_regenerate_pin then 0 else pin_failed_attempts end,
    pin_locked_until=case when p_regenerate_pin then null else pin_locked_until end,
    state_version=state_version+1,updated_at=now()
  where id=v_f.id;
  v_event:=public.append_fulfillment_event_core(v_f.id,'access_regenerated',v_f.status,v_f.status,
    null,'staff',null,jsonb_build_object('pin_regenerated',p_regenerate_pin));
  begin
    perform public.queue_fulfillment_message_core(v_f.id,v_event,'initial',v_token,v_pin);
  exception when others then
    perform public.append_fulfillment_event_core(v_f.id,'message_failed',null,null,sqlerrm,
      'system',null,jsonb_build_object('milestone','initial'));
  end;
  return jsonb_build_object('fulfillment_id',v_f.id,'tracking_token',v_token,'pin',v_pin,
    'state_version',v_f.state_version+1);
end;
$$;
revoke execute on function public.regenerate_fulfillment_access(uuid,bigint,boolean)
  from public,anon;
grant execute on function public.regenerate_fulfillment_access(uuid,bigint,boolean)
  to authenticated;

create or replace function public.public_fulfillment_tracking(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_token is null or p_token!~'^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object(
    'merchant_name',c.name,'merchant_phone',c.public_whatsapp_number,
    'order_code',o.code,'fulfillment_type',f.fulfillment_type,'status',f.status,
    'promised_at',f.promised_at,'updated_at',f.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'name',product.name||case when variant.name='Default' then '' else ' - '||variant.name end,
      'quantity',line.quantity) order by line.created_at,line.id)
      from public.order_lines line
      join public.product_variants variant on variant.id=line.variant_id
      join public.products product on product.id=variant.product_id
      where line.order_id=o.id),'[]'::jsonb),
    'milestones',coalesce((select jsonb_agg(jsonb_build_object(
      'status',e.to_status,'at',e.created_at) order by e.created_at,e.id)
      from public.fulfillment_events e where e.fulfillment_id=f.id
        and e.to_status is not null),'[]'::jsonb)
  ) into v_result
  from public.order_fulfillments f
  join public.orders o on o.id=f.order_id
  join public.companies c on c.id=f.company_id
  where f.tracking_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and f.tracking_expires_at>now();
  return v_result;
end;
$$;
revoke execute on function public.public_fulfillment_tracking(text) from public,authenticated;
grant execute on function public.public_fulfillment_tracking(text) to anon,service_role;

create or replace function public.order_fulfillment_summaries(p_order_ids uuid[])
returns table(
  order_id uuid,fulfillment_id uuid,fulfillment_type text,fulfillment_status text,
  collection_kind text,cod_balance bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if coalesce(array_length(p_order_ids,1),0)>100 then raise exception 'too_many_orders'; end if;
  return query
  select f.order_id,f.id,f.fulfillment_type,f.status,f.collection_kind,
    case when f.collection_kind='cod' and (
      public.current_user_has_permission('SettleOrder')
      or public.current_user_has_permission('ManageFulfillments')
      or (public.fulfillment_has_capability('CompleteFulfillments')
        and f.assigned_membership_id=public.current_fulfillment_membership_id(f.location_id))
    ) then public.order_open_balance_core(o.id) end
  from public.order_fulfillments f
  join public.orders o on o.id=f.order_id and o.company_id=f.company_id
  where f.company_id=v_company_id and f.order_id=any(coalesce(p_order_ids,'{}'::uuid[]))
    and public.current_user_can_access_location(f.location_id);
end;
$$;
revoke execute on function public.order_fulfillment_summaries(uuid[]) from public,anon;
grant execute on function public.order_fulfillment_summaries(uuid[]) to authenticated;
