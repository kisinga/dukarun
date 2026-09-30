-- Receipt contacts share customer identity; only PDF delivery metadata is durable.
alter table public.customers add column is_verified boolean not null default true;
alter table public.customers drop constraint customers_origin_check;
alter table public.customers add constraint customers_origin_check
  check (customer_origin in ('manual','checkout','import','receipt'));

-- Never merge existing accounts as a side effect of a schema upgrade.
do $$ begin
  if exists(select 1 from public.customers where deleted_at is null and not is_supplier
    and phone_normalized is not null group by company_id,phone_normalized having count(*)>1) then
    raise exception 'duplicate_customer_phones: resolve active customer phone conflicts before deploying';
  end if;
end $$;
create unique index customers_active_phone_unique on public.customers(company_id,phone_normalized)
  where deleted_at is null and not is_supplier and phone_normalized is not null;

alter table public.outbox
  add column document_request_key uuid,
  add column document_requested_by uuid,
  add column document_delivery_state text check (document_delivery_state in
    ('queued','preparing','sending','sent','failed','unknown','cancelled')),
  add column document_claim_token uuid,
  add column document_lease_until timestamptz,
  add column provider_message_id text;
create unique index outbox_document_request_unique on public.outbox(company_id,document_request_key)
  where document_request_key is not null;
create index outbox_pdf_pending on public.outbox(scheduled_after)
  where status='pending' and document_delivery_state is not null;

create function public.receipt_contact_json(p_customer public.customers)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_customer.id,'first_name',p_customer.first_name,
    'last_name',p_customer.last_name,'phone',p_customer.phone_normalized,
    'is_verified',p_customer.is_verified,'customer_origin',p_customer.customer_origin,
    'updated_at',p_customer.updated_at);
$$;
revoke all on function public.receipt_contact_json(public.customers) from public,anon,authenticated;

create function public.lookup_receipt_contact(p_phone text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_customer public.customers%rowtype;v_phone text:=public.normalize_fulfillment_phone(p_phone);
begin
  if not (public.current_user_has_permission('SettleOrder') or
    public.current_user_has_permission('ManageCommunications') or
    public.current_user_has_permission('ManageCustomers')) then raise exception 'permission_denied'; end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  select * into v_customer from public.customers where company_id=public.current_company_id()
    and not is_supplier and deleted_at is null and phone_normalized=v_phone;
  return case when v_customer.id is null then null else public.receipt_contact_json(v_customer) end;
end $$;

create function public.sale_document_context(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.orders%rowtype;v_customer public.customers%rowtype;
  v_balance bigint;v_paid bigint;v_delivery jsonb;
begin
  if not (public.current_user_has_permission('SettleOrder') or
    public.current_user_has_permission('ManageCommunications') or
    public.current_user_can_access_scope('data.sales')) then raise exception 'permission_denied'; end if;
  select * into v_order from public.orders where id=p_order_id and company_id=public.current_company_id();
  if not found then raise exception 'order_not_found'; end if;
  if not public.current_user_can_access_location(v_order.location_id) then raise exception 'location_access_denied'; end if;
  v_balance:=public.order_open_balance_core(v_order.id);
  if v_order.is_credit_sale then
    v_paid:=public.order_receivable_settlements_core(p_order_id);
  else
    select coalesce(sum(amount),0) into v_paid from public.payments where order_id=p_order_id and status='settled';
  end if;
  select * into v_customer from public.customers where id=v_order.customer_id
    and company_id=v_order.company_id and not is_supplier and deleted_at is null;
  select jsonb_build_object('id',id,'state',case when status='cancelled' then 'cancelled'
      else document_delivery_state end,'recipient',recipient,'sent_at',sent_at,'error',error)
    into v_delivery from public.outbox where company_id=v_order.company_id and document_subject_id=p_order_id
      and document_delivery_state is not null order by created_at desc limit 1;
  return jsonb_build_object('order_id',v_order.id,'document_number',v_order.code,'total',v_order.total,
    'paid',v_paid,'balance',v_balance,'document_type',case when v_balance>0 then 'invoice' else 'receipt' end,
    'eligible',v_order.status='completed' and (v_balance=0 or v_order.is_credit_sale),
    'customer',case when v_customer.id is null then null else public.receipt_contact_json(v_customer) end,
    'has_customer',v_order.customer_id is not null,'delivery',v_delivery,
    'can_correct_number',public.current_user_has_permission('ManageCustomers'));
end $$;

create function public.request_sale_document(p_order_id uuid,p_request_key uuid,
  p_phone text default null,p_first_name text default null,p_last_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_order public.orders%rowtype;v_customer public.customers%rowtype;
  v_company public.companies%rowtype;v_existing public.outbox%rowtype;
  v_phone text;v_origin text;v_token text;v_url text;v_link uuid;v_outbox uuid;v_lines jsonb;
  v_snapshot jsonb;v_kind text;v_body text;
begin
  if not (public.current_user_has_permission('SettleOrder') or public.current_user_has_permission('ManageCommunications'))
    then raise exception 'permission_denied'; end if;
  v_context:=public.sale_document_context(p_order_id);
  if not (v_context->>'eligible')::boolean then raise exception 'completed_sale_required'; end if;
  if p_request_key is null then raise exception 'request_key_required'; end if;
  if not public.external_messaging_allowed(public.current_company_id(),false) then
    raise exception 'external_messaging_disabled'; end if;
  -- Serialise both retries of one request and different requests for the same order.
  perform pg_advisory_xact_lock(hashtextextended(public.current_company_id()::text||p_request_key::text,29));
  perform public.lock_receivable_order_customer(p_order_id);
  select * into v_order from public.orders where id=p_order_id and company_id=public.current_company_id() for update;
  select * into v_existing from public.outbox where company_id=v_order.company_id and document_request_key=p_request_key;
  if found then
    if v_existing.document_subject_id<>p_order_id then raise exception 'request_key_conflict'; end if;
    return jsonb_build_object('outbox_id',v_existing.id,'state',v_existing.document_delivery_state);
  end if;
  if exists(select 1 from public.outbox where company_id=v_order.company_id and document_subject_id=p_order_id
    and document_delivery_state in ('queued','preparing','sending') and status='pending') then
    raise exception 'document_send_pending'; end if;
  if v_order.customer_id is null then
    v_phone:=public.normalize_fulfillment_phone(p_phone);
    if v_phone is null then raise exception 'invalid_phone'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_order.company_id::text||v_phone,30));
    select * into v_customer from public.customers where company_id=v_order.company_id
      and phone_normalized=v_phone and not is_supplier and deleted_at is null for update;
    if not found then
      if nullif(btrim(p_first_name),'') is null or length(btrim(p_first_name))>100
        or length(coalesce(p_last_name,''))>100 then raise exception 'invalid_name'; end if;
      insert into public.customers(company_id,first_name,last_name,phone,customer_origin,is_verified,
        notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled)
      values(v_order.company_id,btrim(p_first_name),nullif(btrim(p_last_name),''),v_phone,'receipt',false,false,false,false)
      returning * into v_customer;
    end if;
    update public.orders set customer_id=v_customer.id where id=p_order_id;
  else
    select * into v_customer from public.customers where id=v_order.customer_id and company_id=v_order.company_id
      and deleted_at is null and not is_supplier for update;
    if not found then raise exception 'customer_not_found'; end if;
    if p_phone is not null and public.normalize_fulfillment_phone(p_phone) is distinct from v_customer.phone_normalized
      then raise exception 'saved_recipient_required'; end if;
  end if;
  if v_customer.phone_normalized is null then raise exception 'recipient_has_no_phone'; end if;
  -- Refresh eligibility/balance after taking the order lock.
  v_context:=public.sale_document_context(p_order_id);
  if not (v_context->>'eligible')::boolean then raise exception 'completed_sale_required'; end if;
  v_kind:=v_context->>'document_type';
  select * into v_company from public.companies where id=v_order.company_id;
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin from vault.decrypted_secrets
    where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')
      ||public.transaction_unit_suffix(ol.unit_name,ol.units_per_unit,ol.stock_unit_name),
      'quantity',ol.quantity,'unit_price',case when ol.quantity=0 then 0 else ol.line_total/ol.quantity end,
      'line_total',ol.line_total) order by ol.created_at,ol.id),'[]'::jsonb) into v_lines
    from public.order_lines ol left join public.variant_catalog vc on vc.variant_id=ol.variant_id
    where ol.order_id=p_order_id and ol.company_id=v_order.company_id;
  v_snapshot:=jsonb_build_object('document_type',v_kind,'document_number',v_order.code,
    'company_name',v_company.name,'company_address',v_company.address,'company_whatsapp',v_company.public_whatsapp_number,
    'company_email',v_company.email,'company_website',v_company.website_url,
    'company_logo_path',v_company.logo_path,'business_timezone',v_company.business_timezone,
    'party_name',trim(concat_ws(' ',v_customer.first_name,v_customer.last_name)),
    'issue_date',(v_order.created_at at time zone v_company.business_timezone)::date,
    'valid_until',v_order.credit_due_at,'total',v_order.total,'paid',v_context->'paid','balance',v_context->'balance',
    'status',case when (v_context->>'balance')::bigint=0 then 'Paid'
      when (v_context->>'paid')::bigint>0 then 'Partially paid' else 'Unpaid' end,
    'notes',null,'lines',v_lines,'paper_format','a4','pdf_renderer_version',1);
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_url:=v_origin||'/document/'||v_token;
  insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at,created_by,audience_role)
    values(v_order.company_id,v_customer.id,v_kind,p_order_id,encode(extensions.digest(v_token,'sha256'),'hex'),
      v_snapshot,now()+interval '30 days',auth.uid(),'primary') returning id into v_link;
  -- Freeze the version-one default too; future defaults must not change an issued document.
  update public.external_document_links set snapshot=jsonb_set(snapshot,'{document_design}',
    coalesce(nullif(snapshot->'document_design','null'::jsonb),jsonb_build_object(
      'version',1,'layout','classic','message',case when v_kind='receipt' then 'Thank you for your business!' else '' end,
      'custom',jsonb_build_object('label','','value','','display','text')))) where id=v_link;
  v_body:='Hi '||v_customer.first_name||E',\nYour '||v_kind||' '||v_order.code||' from '||left(v_company.name,150)
    ||E' is attached.\nView online: '||v_url;
  v_outbox:=public.queue_manual_document_message(v_order.company_id,'whatsapp',v_customer.phone_normalized,v_body,null,true);
  update public.outbox set source='manual_document',customer_id=v_customer.id,external_document_link_id=v_link,
    document_type=v_kind,document_subject_id=p_order_id,document_copy_role='primary',max_attempts=2,
    document_request_key=p_request_key,document_requested_by=auth.uid(),document_delivery_state='queued'
    where id=v_outbox;
  return jsonb_build_object('outbox_id',v_outbox,'state','queued');
end $$;

-- One guard covers RPCs, imports, restoration and any future profile write paths.
create function public.guard_receipt_customer_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_job record;v_phone text:=public.normalize_fulfillment_phone(new.phone);
begin
  if not new.is_supplier and new.deleted_at is null and nullif(btrim(new.phone),'') is not null
    and v_phone is null and (tg_op='INSERT' or new.phone is distinct from old.phone) then
    raise exception 'invalid_phone'; end if;
  if tg_op='UPDATE' then
    if old.customer_origin='receipt' then new.customer_origin:='receipt'; end if;
    if new.phone is distinct from old.phone or new.deleted_at is distinct from old.deleted_at then
      if exists(select 1 from public.outbox where customer_id=old.id and status='pending'
        and document_delivery_state='sending') then raise exception 'document_send_in_progress'; end if;
      for v_job in select id,external_document_link_id from public.outbox where customer_id=old.id
        and status='pending' and document_delivery_state in ('queued','preparing') for update loop
        perform public.finalize_message_quota(v_job.id,false);
        update public.outbox set status='cancelled',document_delivery_state='cancelled',error='customer_details_changed'
          where id=v_job.id;
        update public.external_document_links set expires_at=least(expires_at,now()) where id=v_job.external_document_link_id;
      end loop;
    end if;
  end if;
  return new;
end $$;
create trigger customers_receipt_identity before insert or update on public.customers
  for each row execute function public.guard_receipt_customer_identity();
revoke all on function public.guard_receipt_customer_identity() from public,anon,authenticated;

create function public.correct_receipt_customer_phone(p_customer_id uuid,p_phone text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_customer public.customers%rowtype;v_phone text:=public.normalize_fulfillment_phone(p_phone);
begin
  if not public.current_user_has_permission('ManageCustomers') then raise exception 'permission_denied'; end if;
  if v_phone is null then raise exception 'invalid_phone'; end if;
  select * into v_customer from public.customers where id=p_customer_id and company_id=public.current_company_id()
    and deleted_at is null and not is_supplier for update;
  if not found then raise exception 'customer_not_found'; end if;
  if v_customer.updated_at is distinct from p_expected_updated_at then raise exception 'customer_changed_reload'; end if;
  update public.customers set phone=v_phone,updated_at=clock_timestamp() where id=v_customer.id returning * into v_customer;
  return public.receipt_contact_json(v_customer);
exception when unique_violation then raise exception 'phone_belongs_to_another_customer';
end $$;

create function public.complete_receipt_customer_profile(p_customer_id uuid,p_profile jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  v_id:=public.save_customer_profile(p_profile,p_customer_id);
  update public.customers set is_verified=true where id=v_id and company_id=public.current_company_id();
  return v_id;
end $$;

revoke all on function public.lookup_receipt_contact(text),public.sale_document_context(uuid),
  public.request_sale_document(uuid,uuid,text,text,text),public.correct_receipt_customer_phone(uuid,text,timestamptz),
  public.complete_receipt_customer_profile(uuid,jsonb) from public,anon;
grant execute on function public.lookup_receipt_contact(text),public.sale_document_context(uuid),
  public.request_sale_document(uuid,uuid,text,text,text),public.correct_receipt_customer_phone(uuid,text,timestamptz),
  public.complete_receipt_customer_profile(uuid,jsonb) to authenticated;

-- Service-only state machine. A crash after dispatch starts is never an automatic resend.
create function public.claim_sale_document_delivery(p_outbox_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.outbox%rowtype;v_token uuid:=gen_random_uuid();v_link public.external_document_links%rowtype;
begin
  for v_job in select * from public.outbox where status='pending' and document_delivery_state='sending'
    and document_lease_until<now() for update skip locked loop
    perform public.finalize_message_quota(v_job.id,true);
    update public.outbox set status='failed',document_delivery_state='unknown',error='provider_acceptance_unknown'
      where id=v_job.id;
  end loop;
  select * into v_job from public.outbox where status='pending'
    and document_delivery_state in ('queued','preparing') and scheduled_after<=now()
    and (document_lease_until is null or document_lease_until<now())
    and (p_outbox_id is null or id=p_outbox_id)
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  if not public.prepare_controlled_outbox_delivery(v_job.id) then return null; end if;
  if v_job.attempts>=v_job.max_attempts then
    perform public.finalize_message_quota(v_job.id,false);
    update public.outbox set status='failed',document_delivery_state='failed',error='attempts_exhausted' where id=v_job.id;
    return null;
  end if;
  select * into v_link from public.external_document_links where id=v_job.external_document_link_id
    and company_id=v_job.company_id and revoked_at is null and expires_at>now();
  if not found then
    perform public.finalize_message_quota(v_job.id,false);
    update public.outbox set status='failed',document_delivery_state='failed',error='document_link_expired' where id=v_job.id;
    return null;
  end if;
  update public.outbox set document_delivery_state='preparing',document_claim_token=v_token,
    document_lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=v_job.id;
  return jsonb_build_object('id',v_job.id,'claim_token',v_token,'snapshot',v_link.snapshot,
    'recipient',v_job.recipient,'caption',v_job.body);
end $$;

create function public.begin_sale_document_dispatch(p_outbox_id uuid,p_claim_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_job public.outbox%rowtype;v_customer public.customers%rowtype;v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.outbox where id=p_outbox_id;
  -- Same customer -> outbox lock order as number correction.
  select * into v_customer from public.customers where id=v_customer_id for update;
  select * into v_job from public.outbox where id=p_outbox_id and document_claim_token=p_claim_token
    and document_delivery_state='preparing' and status='pending' and document_lease_until>now() for update;
  if not found then return false; end if;
  if not public.prepare_controlled_outbox_delivery(v_job.id) then return false; end if;
  if v_customer.deleted_at is not null or v_customer.is_supplier or v_customer.company_id<>v_job.company_id
    or v_customer.phone_normalized is distinct from public.normalize_fulfillment_phone(v_job.recipient) then
    perform public.finalize_message_quota(v_job.id,false);
    update public.outbox set status='cancelled',document_delivery_state='cancelled',error='customer_details_changed'
      where id=v_job.id;return false;
  end if;
  if not exists(select 1 from public.external_document_links where id=v_job.external_document_link_id
    and company_id=v_job.company_id and revoked_at is null and expires_at>now()) then
    perform public.finalize_message_quota(v_job.id,false);
    update public.outbox set status='cancelled',document_delivery_state='cancelled',error='document_link_expired'
      where id=v_job.id;return false;
  end if;
  update public.outbox set document_delivery_state='sending',document_lease_until=now()+interval '2 minutes' where id=v_job.id;
  return true;
end $$;

create function public.finish_sale_document_delivery(p_outbox_id uuid,p_claim_token uuid,p_outcome text,
  p_provider_message_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_job public.outbox%rowtype;v_retry boolean;
begin
  if p_outcome not in ('sent','retry','failed','unknown') then raise exception 'invalid_delivery_outcome'; end if;
  select * into v_job from public.outbox where id=p_outbox_id and document_claim_token=p_claim_token
    and status='pending' and document_delivery_state in ('preparing','sending') for update;
  if not found then return; end if;
  v_retry:=p_outcome='retry' and v_job.attempts<v_job.max_attempts;
  if not v_retry then perform public.finalize_message_quota(v_job.id,p_outcome in ('sent','unknown')); end if;
  update public.outbox set status=case when v_retry then 'pending' when p_outcome='sent' then 'sent' else 'failed' end,
    document_delivery_state=case when v_retry then 'queued' when p_outcome='retry' then 'failed' else p_outcome end,
    sent_at=case when p_outcome='sent' then now() else sent_at end,provider_message_id=p_provider_message_id,
    error=left(p_error,300),document_claim_token=null,document_lease_until=null,
    scheduled_after=case when v_retry then now()+interval '1 minute' else scheduled_after end where id=v_job.id;
  insert into public.delivery_attempts(outbox_id,provider,attempt_number,accepted,error)
    values(v_job.id,'whatsapp',v_job.attempts,p_outcome in ('sent','unknown'),left(p_error,300));
end $$;
revoke all on function public.claim_sale_document_delivery(uuid),public.begin_sale_document_dispatch(uuid,uuid),
  public.finish_sale_document_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_sale_document_delivery(uuid),public.begin_sale_document_dispatch(uuid,uuid),
  public.finish_sale_document_delivery(uuid,uuid,text,text,text) to service_role;

-- Checkout and receipt capture share one phone identity and concurrency lock.
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
      and c.company_id=p_company_id and c.deleted_at is null and not c.is_supplier) then
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
    perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||v_phone,30));
    select count(*),min(c.id::text)::uuid into v_match_count,v_customer_id
    from public.customers c where c.company_id=p_company_id and c.deleted_at is null
      and not c.is_supplier and c.phone_normalized=v_phone;
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
