-- Include an available public shop in the delivery caption and issued snapshot.
-- Existing documents and uncertain request retries retain their original links.
create or replace function public.request_sale_document(p_order_id uuid,p_request_key uuid,
  p_phone text default null,p_first_name text default null,p_last_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_order public.orders%rowtype;v_customer public.customers%rowtype;
  v_company public.companies%rowtype;v_existing public.outbox%rowtype;
  v_phone text;v_origin text;v_token text;v_url text;v_link uuid;v_outbox uuid;v_lines jsonb;
  v_snapshot jsonb;v_kind text;v_body text;v_store_url text;
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
  -- Use the same canonical target and visibility rules as public product sharing.
  select v_origin||'/'||s.slug into v_store_url from public.public_storefronts s
    where s.id=v_order.company_id and s.catalogue_visible and nullif(s.slug,'') is not null;
  select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item')
      ||public.transaction_unit_suffix(ol.unit_name,ol.units_per_unit,ol.stock_unit_name),
      'quantity',ol.quantity,'unit_price',case when ol.quantity=0 then 0 else ol.line_total/ol.quantity end,
      'line_total',ol.line_total) order by ol.created_at,ol.id),'[]'::jsonb) into v_lines
    from public.order_lines ol left join public.variant_catalog vc on vc.variant_id=ol.variant_id
    where ol.order_id=p_order_id and ol.company_id=v_order.company_id;
  v_snapshot:=jsonb_build_object('document_type',v_kind,'document_number',v_order.code,
    'company_name',v_company.name,'company_address',v_company.address,'company_whatsapp',v_company.public_whatsapp_number,
    'company_email',v_company.email,'company_website',v_company.website_url,'store_url',v_store_url,
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
  if v_store_url is not null then
    v_body:=v_body||E'\nShop online: '||v_store_url;
  end if;
  v_outbox:=public.queue_manual_document_message(v_order.company_id,'whatsapp',v_customer.phone_normalized,v_body,null,true);
  update public.outbox set source='manual_document',customer_id=v_customer.id,external_document_link_id=v_link,
    document_type=v_kind,document_subject_id=p_order_id,document_copy_role='primary',max_attempts=2,
    document_request_key=p_request_key,document_requested_by=auth.uid(),document_delivery_state='queued'
    where id=v_outbox;
  return jsonb_build_object('outbox_id',v_outbox,'state','queued');
end $$;
