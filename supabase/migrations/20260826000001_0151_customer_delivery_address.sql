-- Customer delivery defaults remain reusable profile data. Fulfillment rows keep the
-- immutable address used by each individual order.
alter table public.customers
  add column delivery_address text,
  add constraint customers_delivery_address_check check (
    delivery_address is null or (
      delivery_address = btrim(delivery_address)
      and char_length(delivery_address) between 1 and 500
    )
  );

drop function public.create_customer(text,text,text,text,boolean);
create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_is_supplier boolean default false,
  p_delivery_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_delivery_address text := nullif(btrim(coalesce(p_delivery_address,'')),'');
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_is_supplier then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required';
    end if;
  elsif not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  if char_length(coalesce(v_delivery_address,'')) > 500 then
    raise exception 'delivery_address_too_long';
  end if;

  insert into public.customers(
    company_id,first_name,last_name,phone,email,is_supplier,delivery_address
  ) values(
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_email,'')),''),
    p_is_supplier,
    v_delivery_address
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_customer(text,text,text,text,boolean,text)
  from anon,public;
grant execute on function public.create_customer(text,text,text,text,boolean,text)
  to authenticated;

drop function public.update_customer(uuid,text,text,text,text,text);
create or replace function public.update_customer(
  p_customer_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_notes text default null,
  p_delivery_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_is_supplier boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select c.is_supplier into v_is_supplier from public.customers c
  where c.id=p_customer_id and c.company_id=v_company_id;
  if not found then raise exception 'customer_not_found: %',p_customer_id; end if;
  if v_is_supplier then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required';
    end if;
  elsif not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;
  if p_delivery_address is not null and char_length(btrim(p_delivery_address)) > 500 then
    raise exception 'delivery_address_too_long';
  end if;

  update public.customers
  set first_name=coalesce(nullif(trim(coalesce(p_first_name,'')),''),first_name),
      last_name=coalesce(nullif(trim(coalesce(p_last_name,'')),''),last_name),
      phone=coalesce(nullif(trim(coalesce(p_phone,'')),''),phone),
      email=coalesce(nullif(trim(coalesce(p_email,'')),''),email),
      notes=coalesce(nullif(trim(coalesce(p_notes,'')),''),notes),
      delivery_address=case when p_delivery_address is null then delivery_address
        else nullif(btrim(p_delivery_address),'') end,
      updated_at=now()
  where id=p_customer_id and company_id=v_company_id;
  if not found then raise exception 'customer_not_found: %',p_customer_id; end if;
  return p_customer_id;
end;
$$;
revoke execute on function public.update_customer(uuid,text,text,text,text,text,text)
  from anon,public;
grant execute on function public.update_customer(uuid,text,text,text,text,text,text)
  to authenticated;

-- Customer forms submit one complete profile command. This keeps the visible single
-- save action aligned with one database transaction and gives empty optional values
-- explicit clear semantics.
create or replace function public.save_customer_profile(
  p_profile jsonb,p_customer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_id uuid:=p_customer_id;
  v_customer public.customers%rowtype;
  v_first_name text:=btrim(coalesce(p_profile->>'first_name',''));
  v_address text:=nullif(btrim(coalesce(p_profile->>'delivery_address','')),'');
  v_notifications boolean;
  v_sms boolean;
  v_whatsapp boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;
  if jsonb_typeof(coalesce(p_profile,'null'::jsonb))<>'object' then
    raise exception 'customer_profile_must_be_object';
  end if;
  if v_first_name='' then raise exception 'invalid_name'; end if;
  if char_length(coalesce(v_address,''))>500 then
    raise exception 'delivery_address_too_long';
  end if;

  if v_id is null then
    insert into public.customers(
      company_id,first_name,last_name,phone,email,notes,delivery_address,
      tax_registration_number,is_supplier
    ) values(
      v_company_id,v_first_name,
      nullif(btrim(coalesce(p_profile->>'last_name','')),''),
      nullif(btrim(coalesce(p_profile->>'phone','')),''),
      nullif(btrim(coalesce(p_profile->>'email','')),''),
      nullif(btrim(coalesce(p_profile->>'notes','')),''),v_address,
      nullif(btrim(coalesce(p_profile->>'tax_registration_number','')),''),false
    ) returning * into v_customer;
    v_id:=v_customer.id;
  else
    select * into v_customer from public.customers c
    where c.id=v_id and c.company_id=v_company_id and not c.is_supplier
      and c.deleted_at is null for update;
    if v_customer.id is null then raise exception 'customer_not_found'; end if;
    update public.customers set
      first_name=v_first_name,
      last_name=case when p_profile?'last_name'
        then nullif(btrim(coalesce(p_profile->>'last_name','')),'') else last_name end,
      phone=case when p_profile?'phone'
        then nullif(btrim(coalesce(p_profile->>'phone','')),'') else phone end,
      email=case when p_profile?'email'
        then nullif(btrim(coalesce(p_profile->>'email','')),'') else email end,
      notes=case when p_profile?'notes'
        then nullif(btrim(coalesce(p_profile->>'notes','')),'') else notes end,
      delivery_address=case when p_profile?'delivery_address' then v_address
        else delivery_address end,
      tax_registration_number=case when p_profile?'tax_registration_number'
        then nullif(btrim(coalesce(p_profile->>'tax_registration_number','')),'')
        else tax_registration_number end,
      updated_at=now()
    where id=v_id returning * into v_customer;
  end if;

  v_notifications:=case when p_profile?'notifications_enabled'
    then (p_profile->>'notifications_enabled')::boolean
    else v_customer.notifications_enabled end;
  v_sms:=case when p_profile?'sms_notifications_enabled'
    then (p_profile->>'sms_notifications_enabled')::boolean
    else v_customer.sms_notifications_enabled end;
  v_whatsapp:=case when p_profile?'whatsapp_notifications_enabled'
    then (p_profile->>'whatsapp_notifications_enabled')::boolean
    else v_customer.whatsapp_notifications_enabled end;
  perform public.update_customer_communication_preferences(
    v_id,v_notifications,v_sms,v_whatsapp
  );
  return v_id;
end;
$$;
revoke execute on function public.save_customer_profile(jsonb,uuid) from anon,public;
grant execute on function public.save_customer_profile(jsonb,uuid) to authenticated;

create or replace function public.update_customer_tax_registration(
  p_customer_id uuid,p_tax_registration_number text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;
  update public.customers set
    tax_registration_number=nullif(btrim(coalesce(p_tax_registration_number,'')),''),
    updated_at=now()
  where id=p_customer_id and company_id=v_company_id and not is_supplier;
  if not found then raise exception 'customer_not_found'; end if;
  return p_customer_id;
end;
$$;
revoke execute on function public.update_customer_tax_registration(uuid,text)
  from anon,public;
grant execute on function public.update_customer_tax_registration(uuid,text)
  to authenticated;

create or replace function public.apply_checkout_customer_address_core(
  p_company_id uuid,p_customer_id uuid,p_customer jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_address text:=nullif(btrim(coalesce(p_customer->>'delivery_address','')),'');
begin
  if not coalesce((p_customer->>'save_delivery_address')::boolean,false)
    or v_address is null then return; end if;
  if char_length(v_address)>500 then raise exception 'delivery_address_too_long'; end if;
  update public.customers set delivery_address=v_address,updated_at=now()
  where id=p_customer_id and company_id=p_company_id;
  if not found then raise exception 'customer_not_found'; end if;
end;
$$;
revoke execute on function public.apply_checkout_customer_address_core(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.apply_checkout_customer_address_core(uuid,uuid,jsonb)
  to service_role;

drop function public.resolve_checkout_customer_core(uuid,jsonb,boolean);
create or replace function public.resolve_checkout_customer_core(
  p_company_id uuid,p_customer jsonb,p_require_customer boolean default false,
  p_apply_address boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid:=nullif(p_customer->>'customer_id','')::uuid;
  v_name text:=btrim(coalesce(p_customer->>'name',''));
  v_phone text:=public.normalize_fulfillment_phone(p_customer->>'phone');
  v_save boolean:=coalesce((p_customer->>'save_as_customer')::boolean,true);
  v_save_address boolean:=coalesce((p_customer->>'save_delivery_address')::boolean,false);
  v_address text:=nullif(btrim(coalesce(p_customer->>'delivery_address','')),'');
  v_match_count integer;v_first text;v_last text;
begin
  if char_length(coalesce(v_address,''))>500 then raise exception 'delivery_address_too_long'; end if;
  if p_require_customer then v_save:=true;v_save_address:=true; end if;
  if v_customer_id is not null then
    if not exists(select 1 from public.customers c where c.id=v_customer_id
      and c.company_id=p_company_id and c.deleted_at is null) then
      raise exception 'customer_not_found'; end if;
    if p_apply_address and v_save_address then
      perform public.apply_checkout_customer_address_core(
        p_company_id,v_customer_id,p_customer||jsonb_build_object('save_delivery_address',true));
    end if;
    return v_customer_id;
  end if;
  if not v_save then return null; end if;
  if v_name='' then raise exception 'customer_name_required'; end if;
  if v_phone is not null then
    select count(*),min(c.id::text)::uuid into v_match_count,v_customer_id
    from public.customers c where c.company_id=p_company_id and c.deleted_at is null
      and c.phone_normalized=v_phone;
    if v_match_count>1 then raise exception 'multiple_phone_matches: select a customer'; end if;
    if v_match_count=1 then
      if p_apply_address and v_save_address then
        perform public.apply_checkout_customer_address_core(
          p_company_id,v_customer_id,p_customer||jsonb_build_object('save_delivery_address',true));
      end if;
      return v_customer_id;
    end if;
  end if;
  v_first:=split_part(v_name,' ',1);
  v_last:=nullif(btrim(substring(v_name from length(v_first)+1)),'');
  insert into public.customers(
    company_id,first_name,last_name,phone,phone_normalized,customer_origin,
    notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled,
    delivery_address
  ) values(
    p_company_id,v_first,v_last,v_phone,v_phone,'checkout',false,false,false,
    case when p_apply_address and v_save_address then v_address end
  ) returning id into v_customer_id;
  return v_customer_id;
end;
$$;
revoke execute on function public.resolve_checkout_customer_core(uuid,jsonb,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.resolve_checkout_customer_core(uuid,jsonb,boolean,boolean)
  to service_role;

-- Preserve customer address intent until provider-confirmed M-PESA checkout posts.
alter table public.mpesa_payment_intents add column checkout_customer_request jsonb;

drop function public.post_fulfillment_credit_sale_at_location(uuid,uuid,jsonb,jsonb,text,uuid,text);
create or replace function public.post_fulfillment_credit_sale_at_location(
  p_location_id uuid,p_customer_id uuid,p_lines jsonb,p_fulfillment jsonb,
  p_client_ref text,p_draft_id uuid default null,p_approval_reason text default null,
  p_customer jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_customer_id uuid:=p_customer_id;
  v_sale jsonb;v_fulfillment jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if coalesce(p_fulfillment->>'collection_kind','none')<>'none' then
    raise exception 'credit_sale_cannot_collect_cod'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  if p_customer is not null then
    v_customer_id:=public.resolve_checkout_customer_core(v_company_id,p_customer,false,true);
    if v_customer_id is distinct from p_customer_id then
      raise exception 'checkout_customer_mismatch'; end if;
  end if;
  v_sale:=public.post_credit_sale_at_location(
    p_location_id,v_customer_id,p_lines,p_client_ref,p_draft_id,p_approval_reason
  );
  v_fulfillment:=public.attach_order_fulfillment_core(
    v_sale,v_customer_id,p_fulfillment,false
  );
  return v_sale||v_fulfillment||jsonb_build_object('customer_id',v_customer_id,
    'status',v_sale->>'status');
end;
$$;
revoke execute on function public.post_fulfillment_credit_sale_at_location(
  uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb) from public,anon;
grant execute on function public.post_fulfillment_credit_sale_at_location(
  uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb) to authenticated;

create or replace function public.prepare_mpesa_fulfillment_checkout(
  p_location_id uuid,p_customer jsonb,p_lines jsonb,p_fulfillment jsonb,
  p_phone text,p_amount bigint,p_cash_amount bigint,p_client_ref text,
  p_draft_id uuid default null,p_retry boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_customer_id uuid;v_checkout jsonb;
  v_intent public.mpesa_payment_intents%rowtype;v_fingerprint text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_fulfillment->>'collection_kind','none')<>'none' then
    raise exception 'use_cod_mpesa_checkout'; end if;
  if public.normalize_fulfillment_phone(p_fulfillment->>'phone') is null then
    raise exception 'mpesa_fulfillment_recipient_phone_required'; end if;
  perform public.assert_fulfillment_location_ready(v_company_id,p_location_id);
  v_customer_id:=public.resolve_checkout_customer_core(
    v_company_id,coalesce(p_customer,'{}'),false,false);
  v_fingerprint:=encode(extensions.digest(jsonb_build_object(
    'customer',p_customer,'fulfillment',p_fulfillment
  )::text,'sha256'),'hex');
  v_checkout:=public.prepare_mpesa_checkout('sale',p_location_id,p_phone,p_amount,
    p_cash_amount,p_client_ref,v_customer_id,p_lines,null,p_draft_id,p_retry);
  select * into v_intent from public.mpesa_payment_intents
    where id=(v_checkout->>'intent_id')::uuid for update;
  if v_intent.fulfillment_request_fingerprint is not null
    and v_intent.fulfillment_request_fingerprint<>v_fingerprint then
    raise exception 'idempotency_conflict: fulfillment intent changed'; end if;
  update public.mpesa_payment_intents
  set fulfillment_request_fingerprint=coalesce(fulfillment_request_fingerprint,v_fingerprint),
      fulfillment_request=coalesce(fulfillment_request,p_fulfillment),
      checkout_customer_request=coalesce(checkout_customer_request,p_customer)
  where id=v_intent.id;
  return v_checkout||jsonb_build_object(
    'customer_id',v_customer_id,'fulfillment_id',v_intent.fulfillment_id);
end;
$$;
revoke execute on function public.prepare_mpesa_fulfillment_checkout(
  uuid,jsonb,jsonb,jsonb,text,bigint,bigint,text,uuid,boolean) from public,anon;
grant execute on function public.prepare_mpesa_fulfillment_checkout(
  uuid,jsonb,jsonb,jsonb,text,bigint,bigint,text,uuid,boolean) to authenticated;

-- Customer eligibility is normally rechecked when a draft becomes financial.
-- A provider-confirmed M-PESA allocation is the narrow exception: the payment
-- was already accepted against this exact order and must finish atomically.
create or replace function public.reject_deleted_order_customer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_confirmed_mpesa_allocation boolean:=false;
begin
  if new.customer_id is not null
     and (
       tg_op = 'INSERT'
       or new.customer_id is distinct from old.customer_id
       or (
         new.status in ('pending_payment', 'completed')
         and new.status is distinct from old.status
       )
     )
     and exists (
       select 1
       from public.customers c
       where c.id = new.customer_id
         and c.company_id = new.company_id
         and c.deleted_at is not null
     ) then
    if tg_op = 'UPDATE'
       and new.customer_id is not distinct from old.customer_id
       and new.status = 'completed'
       and new.status is distinct from old.status then
      select exists (
        select 1
        from public.payment_collection_allocations a
        join public.payment_collections c on c.id=a.collection_id
        where a.company_id=new.company_id
          and a.order_id=new.id
          and a.status='reserved'
          and c.provider='mpesa'
          and c.provider_status='received'
          and c.verification_status<>'disputed'
      ) into v_confirmed_mpesa_allocation;
    end if;
    if not v_confirmed_mpesa_allocation then
      raise exception 'customer_deleted: %', new.customer_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger orders_reject_deleted_customer on public.orders;
create trigger orders_reject_deleted_customer
before insert or update of customer_id,status on public.orders
for each row execute function public.reject_deleted_order_customer();

create or replace function public.apply_confirmed_mpesa_customer_address()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_customer_request jsonb;
begin
  select i.checkout_customer_request into v_customer_request
  from public.mpesa_payment_intents i
  join public.payment_collections c on c.mpesa_intent_id=i.id
    and c.provider_status='received' and c.verification_status<>'disputed'
  join public.payment_collection_allocations a on a.collection_id=c.id
    and a.order_id=new.order_id and a.status='reserved'
  where i.company_id=new.company_id and i.subject_id=new.order_id
    and i.checkout_customer_request is not null
  order by i.created_at desc limit 1;
  if v_customer_request is not null and new.customer_id is not null then
    perform public.apply_checkout_customer_address_core(
      new.company_id,new.customer_id,v_customer_request);
  end if;
  return new;
end;
$$;
revoke execute on function public.apply_confirmed_mpesa_customer_address()
  from public,anon,authenticated;

create trigger order_fulfillments_apply_mpesa_customer_address
after insert on public.order_fulfillments
for each row execute function public.apply_confirmed_mpesa_customer_address();
