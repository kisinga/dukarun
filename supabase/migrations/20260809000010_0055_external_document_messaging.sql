-- Controlled external messaging and fixed business-document delivery.
-- Tenant APIs accept only a document kind, an authoritative business record,
-- and a channel. Recipients and message bodies are always derived server-side.

alter table public.companies
  add column automated_customer_notifications_enabled boolean not null default true,
  add column automated_customer_notifications_override boolean;

create table public.platform_communication_settings (
  singleton boolean primary key default true check (singleton),
  external_messaging_enabled boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.platform_communication_settings(singleton) values(true);

create table public.external_document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  party_id uuid not null references public.customers(id) on delete cascade,
  document_type text not null
    check (document_type in ('receipt','invoice','proforma','purchase_order')),
  subject_id uuid not null,
  token_hash text not null unique,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index external_document_links_subject_idx
  on public.external_document_links(company_id,document_type,subject_id,created_at desc);

alter table public.external_document_links enable row level security;
alter table public.platform_communication_settings enable row level security;
create policy "platform communication settings readable by platform admins"
  on public.platform_communication_settings for select using ((select public.is_platform_admin()));
grant select on public.platform_communication_settings to authenticated;
grant all on public.platform_communication_settings,public.external_document_links to service_role;

create trigger platform_communication_settings_audit after insert or update or delete
  on public.platform_communication_settings for each row execute function public.audit_trigger();

alter table public.outbox drop constraint if exists outbox_source_check;
alter table public.outbox add constraint outbox_source_check
  check (source in ('direct','campaign','reminder','platform','manual_document','manual_document_copy'));
alter table public.outbox
  add column external_document_link_id uuid references public.external_document_links(id) on delete set null,
  add column document_type text
    check (document_type is null or document_type in ('receipt','invoice','proforma','purchase_order')),
  add column document_subject_id uuid,
  add column document_copy_role text
    check (document_copy_role is null or document_copy_role in ('primary','company'));

insert into public.message_templates(template_key,name,context,sms_body,whatsapp_body,is_system)
values
  ('manual-receipt','Receipt delivery','customer',
   '{{company_name}} receipt {{document_number}} for KES {{total}}. View: {{document_url}}',
   '*Receipt {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nView or print: {{document_url}}',true),
  ('manual-invoice','Invoice delivery','customer',
   '{{company_name}} invoice {{document_number}}. Total KES {{total}}, balance KES {{balance}}. {{document_url}}',
   '*Invoice {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nBalance: KES {{balance}}\nView or print: {{document_url}}',true),
  ('manual-proforma','Proforma delivery','customer',
   '{{company_name}} proforma {{document_number}} for KES {{total}}, valid until {{valid_until}}. {{document_url}}',
   '*Proforma {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nValid until: {{valid_until}}\nView or print: {{document_url}}',true),
  ('manual-purchase-order','Purchase order delivery','customer',
   'Purchase order {{document_number}} from {{company_name}} for KES {{total}}. {{document_url}}',
   '*Purchase order {{document_number}}*\n\nFrom: {{company_name}}\nTotal: KES {{total}}\nView or print: {{document_url}}',true),
  ('manual-document-company-copy','Company document copy','customer',
   'Company copy: {{document_label}} {{document_number}} sent to {{party_name}}. {{document_url}}',
   '*Company copy*\n\n{{document_label}} {{document_number}} was sent to {{party_name}}.\nView: {{document_url}}',true)
on conflict do nothing;

create or replace function public.external_messaging_allowed(p_company_id uuid,p_automated boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.external_messaging_enabled
    from public.platform_communication_settings s where s.singleton),false)
  and (not p_automated or coalesce(
    (select c.automated_customer_notifications_override from public.companies c where c.id=p_company_id),
    (select c.automated_customer_notifications_enabled from public.companies c where c.id=p_company_id),
    false));
$$;
revoke execute on function public.external_messaging_allowed(uuid,boolean) from public,anon,authenticated;
grant execute on function public.external_messaging_allowed(uuid,boolean) to service_role;

create or replace function public.cancel_controlled_external_messages(
  p_company_id uuid,p_include_manual boolean,p_reason text
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_row record;v_count integer:=0;
begin
  for v_row in select o.id,o.attempts from public.outbox o
    where o.status='pending' and (p_company_id is null or o.company_id=p_company_id)
      and (o.source='reminder' or (p_include_manual and o.source in ('manual_document','manual_document_copy')))
    for update
  loop
    perform public.finalize_message_quota(v_row.id,v_row.attempts>0);
    update public.outbox set status='cancelled',error=p_reason where id=v_row.id and status='pending';
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.cancel_controlled_external_messages(uuid,boolean,text)
  from public,anon,authenticated;
grant execute on function public.cancel_controlled_external_messages(uuid,boolean,text) to service_role;

create or replace function public.prepare_controlled_outbox_delivery(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_row public.outbox%rowtype;v_allowed boolean;
begin
  select * into v_row from public.outbox where id=p_outbox_id for update;
  if not found or v_row.status<>'pending' then return false; end if;
  if v_row.source not in ('reminder','manual_document','manual_document_copy') then return true; end if;
  v_allowed:=public.external_messaging_allowed(v_row.company_id,v_row.source='reminder');
  if v_allowed then return true; end if;
  perform public.finalize_message_quota(v_row.id,v_row.attempts>0);
  update public.outbox set status='cancelled',error='external_messaging_disabled' where id=v_row.id;
  return false;
end;
$$;
revoke execute on function public.prepare_controlled_outbox_delivery(uuid) from public,anon,authenticated;
grant execute on function public.prepare_controlled_outbox_delivery(uuid) to service_role;

create or replace function public.set_automated_customer_notifications(p_enabled boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id();v_cancelled integer:=0;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required'; end if;
  update public.companies set automated_customer_notifications_enabled=p_enabled where id=v_company;
  if not p_enabled and not coalesce((select automated_customer_notifications_override
    from public.companies where id=v_company),false) then
    v_cancelled:=public.cancel_controlled_external_messages(v_company,false,'company_automation_disabled');
  end if;
  return v_cancelled;
end;
$$;
revoke execute on function public.set_automated_customer_notifications(boolean) from public,anon;
grant execute on function public.set_automated_customer_notifications(boolean) to authenticated;

create or replace function public.platform_set_external_messaging(p_enabled boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_cancelled integer:=0;
begin
  perform public.assert_platform_admin();
  update public.platform_communication_settings set external_messaging_enabled=p_enabled,
    updated_by=auth.uid(),updated_at=now() where singleton;
  if not p_enabled then
    v_cancelled:=public.cancel_controlled_external_messages(null,true,'platform_external_messaging_disabled');
  end if;
  return v_cancelled;
end;
$$;
revoke execute on function public.platform_set_external_messaging(boolean) from public,anon;
grant execute on function public.platform_set_external_messaging(boolean) to authenticated;

create or replace function public.platform_set_company_automation_override(
  p_company_id uuid,p_override boolean default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_cancelled integer:=0;
begin
  perform public.assert_platform_admin();
  update public.companies set automated_customer_notifications_override=p_override where id=p_company_id;
  if not found then raise exception 'company_not_found'; end if;
  if p_override=false then
    v_cancelled:=public.cancel_controlled_external_messages(p_company_id,false,'platform_company_automation_disabled');
  end if;
  return v_cancelled;
end;
$$;
revoke execute on function public.platform_set_company_automation_override(uuid,boolean) from public,anon;
grant execute on function public.platform_set_company_automation_override(uuid,boolean) to authenticated;

-- Build a fixed, tenant-scoped snapshot. No recipient or text enters through
-- the API boundary.
create or replace function public.external_document_context(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_company_id uuid:=public.current_company_id();v_company public.companies%rowtype;
  v_party public.customers%rowtype;v_order public.orders%rowtype;v_purchase public.purchases%rowtype;
  v_paid bigint:=0;v_balance bigint:=0;v_lines jsonb:='[]'::jsonb;v_payments jsonb:='[]'::jsonb;
  v_number text;v_issue_date date;v_valid_until date;v_total bigint;v_status text;v_notes text;
  v_copy_phone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required'; end if;
  if p_channel not in ('sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if p_document_type not in ('receipt','invoice','proforma','purchase_order') then
    raise exception 'invalid_document_type'; end if;
  if not public.external_messaging_allowed(v_company_id,false) then
    raise exception 'external_messaging_disabled'; end if;
  select * into v_company from public.companies where id=v_company_id;

  if p_document_type in ('receipt','invoice','proforma') then
    select * into v_order from public.orders where id=p_subject_id and company_id=v_company_id;
    if not found or v_order.customer_id is null then raise exception 'customer_order_required'; end if;
    select * into v_party from public.customers
      where id=v_order.customer_id and company_id=v_company_id and not is_supplier;
    if not found then raise exception 'customer_not_found'; end if;
    select coalesce(sum(p.amount),0)::bigint into v_paid from public.payments p
      where p.order_id=v_order.id and p.status='settled';
    v_balance:=greatest(v_order.total-v_paid,0);
    if p_document_type='receipt' and (v_order.status<>'completed' or v_balance>0) then
      raise exception 'fully_settled_sale_required';
    elsif p_document_type='invoice' and (v_order.status<>'completed' or not v_order.is_credit_sale) then
      raise exception 'completed_credit_sale_required';
    elsif p_document_type='proforma' and (v_order.status<>'draft' or v_order.expires_at<=now()) then
      raise exception 'active_proforma_required';
    end if;
    v_number:=v_order.code;v_total:=v_order.total;
    v_issue_date:=(v_order.created_at at time zone 'Africa/Nairobi')::date;
    v_valid_until:=case when p_document_type='proforma'
      then (v_order.expires_at at time zone 'Africa/Nairobi')::date else v_order.credit_due_at end;
    v_status:=case when p_document_type='proforma' then 'active'
      when v_balance=0 then 'paid' else 'outstanding' end;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item'),
      'quantity',ol.quantity,'unit_price',coalesce(ol.custom_price,ol.unit_price),'line_total',ol.line_total)
      order by ol.created_at),'[]'::jsonb) into v_lines
    from public.order_lines ol left join public.variant_catalog vc on vc.variant_id=ol.variant_id
    where ol.order_id=v_order.id and ol.company_id=v_company_id;
    select coalesce(jsonb_agg(jsonb_build_object('method',p.method_code,'amount',p.amount,
      'reference',p.reference,'date',p.created_at) order by p.created_at),'[]'::jsonb) into v_payments
    from public.payments p where p.order_id=v_order.id and p.status='settled';
  else
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required'; end if;
    select * into v_purchase from public.purchases where id=p_subject_id and company_id=v_company_id;
    if not found then raise exception 'purchase_not_found'; end if;
    select * into v_party from public.customers where id=v_purchase.supplier_id
      and company_id=v_company_id and is_supplier and supplier_active;
    if not found then raise exception 'active_supplier_required'; end if;
    v_number:=coalesce(nullif(trim(v_purchase.reference),''),'PO-'||upper(left(v_purchase.id::text,8)));
    v_total:=v_purchase.total_cost;v_balance:=0;v_paid:=0;v_status:='issued';v_notes:=v_purchase.notes;
    v_issue_date:=v_purchase.purchase_date;
    select coalesce(jsonb_agg(jsonb_build_object('description',coalesce(vc.product_name||
      case when nullif(vc.variant_name,'') is not null then ' — '||vc.variant_name else '' end,'Item'),
      'quantity',pl.quantity,'unit_price',pl.unit_cost,'line_total',pl.line_total)
      order by pl.created_at),'[]'::jsonb) into v_lines
    from public.purchase_lines pl left join public.variant_catalog vc on vc.variant_id=pl.variant_id
    where pl.purchase_id=v_purchase.id and pl.company_id=v_company_id;
  end if;

  if nullif(trim(v_party.phone),'') is null then raise exception 'recipient_has_no_phone'; end if;
  if not v_party.notifications_enabled
    or (p_channel='sms' and not v_party.sms_notifications_enabled)
    or (p_channel='whatsapp' and not v_party.whatsapp_notifications_enabled) then
    raise exception 'recipient_opted_out'; end if;
  if p_include_company_copy and p_document_type not in ('invoice','purchase_order') then
    raise exception 'company_copy_not_available'; end if;
  if p_include_company_copy then
    v_copy_phone:=nullif(trim(v_company.public_whatsapp_number),'');
    if v_copy_phone is null then raise exception 'company_whatsapp_not_configured'; end if;
    if regexp_replace(v_copy_phone,'\D','','g')=regexp_replace(v_party.phone,'\D','','g') then
      raise exception 'company_copy_matches_recipient'; end if;
  end if;

  return jsonb_build_object('company_id',v_company_id,'company_name',v_company.name,
    'company_address',v_company.address,'company_whatsapp',v_company.public_whatsapp_number,
    'company_logo_path',v_company.logo_path,'party_id',v_party.id,
    'party_name',trim(v_party.first_name||' '||coalesce(v_party.last_name,'')),
    'recipient',v_party.phone,'company_copy_recipient',v_copy_phone,
    'document_type',p_document_type,'document_number',v_number,'subject_id',p_subject_id,
    'issue_date',v_issue_date,'valid_until',v_valid_until,'total',v_total,'paid',v_paid,
    'balance',v_balance,'status',v_status,'notes',v_notes,'lines',v_lines,'payments',v_payments,
    'channel',p_channel,'include_company_copy',p_include_company_copy);
end;
$$;
revoke execute on function public.external_document_context(text,uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.external_document_context(text,uuid,text,boolean) to service_role;

create or replace function public.render_external_document_message(p_context jsonb,p_url text,p_copy boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_template public.message_templates%rowtype;v_key text;v_values jsonb;v_body text;v_label text;
begin
  v_key:=case when p_copy then 'manual-document-company-copy' else case p_context->>'document_type'
    when 'receipt' then 'manual-receipt' when 'invoice' then 'manual-invoice'
    when 'proforma' then 'manual-proforma' else 'manual-purchase-order' end end;
  select * into v_template from public.message_templates
    where company_id is null and template_key=v_key and active limit 1;
  if not found then raise exception 'document_template_unavailable'; end if;
  v_label:=case p_context->>'document_type' when 'purchase_order' then 'Purchase order'
    when 'proforma' then 'Proforma' when 'invoice' then 'Invoice' else 'Receipt' end;
  v_values:=jsonb_build_object('company_name',p_context->>'company_name',
    'document_number',p_context->>'document_number','total',to_char((p_context->>'total')::bigint,'FM999G999G999'),
    'balance',to_char((p_context->>'balance')::bigint,'FM999G999G999'),
    'valid_until',coalesce(to_char((p_context->>'valid_until')::date,'DD Mon YYYY'),'—'),
    'document_url',p_url,'document_label',v_label,'party_name',p_context->>'party_name');
  v_body:=public.render_message_template(case when p_copy or p_context->>'channel'='whatsapp'
    then v_template.whatsapp_body else v_template.sms_body end,v_values);
  return jsonb_build_object('body',v_body,'template_key',v_template.template_key,
    'template_version',v_template.version);
end;
$$;
revoke execute on function public.render_external_document_message(jsonb,text,boolean)
  from public,anon,authenticated;
grant execute on function public.render_external_document_message(jsonb,text,boolean) to service_role;

create or replace function public.preview_external_document(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb;v_message jsonb;v_copy jsonb;
begin
  v_context:=public.external_document_context(p_document_type,p_subject_id,p_channel,p_include_company_copy);
  v_message:=public.render_external_document_message(v_context,'[secure document link]',false);
  if p_include_company_copy then
    v_copy:=public.render_external_document_message(v_context,'[secure document link]',true);
  end if;
  return v_context||jsonb_build_object('body',v_message->>'body',
    'company_copy_body',v_copy->>'body');
end;
$$;
revoke execute on function public.preview_external_document(text,uuid,text,boolean) from public,anon;
grant execute on function public.preview_external_document(text,uuid,text,boolean) to authenticated;

create or replace function public.send_external_document(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;v_token text;v_url text;v_origin text;v_link uuid;v_outbox uuid;v_copy_outbox uuid;
  v_message jsonb;v_copy jsonb;v_copy_error text;v_snapshot jsonb;
begin
  v_context:=public.external_document_context(p_document_type,p_subject_id,p_channel,p_include_company_copy);
  if exists(select 1 from public.outbox o where o.company_id=(v_context->>'company_id')::uuid
    and o.document_type=p_document_type and o.document_subject_id=p_subject_id
    and o.document_copy_role='primary' and o.channel=p_channel and o.status in ('pending','sent')
    and o.created_at>now()-interval '1 minute') then raise exception 'document_send_cooldown'; end if;
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
    from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_url:=v_origin||'/document/'||v_token;
  v_snapshot:=v_context-array['company_id','party_id','recipient','company_copy_recipient',
    'channel','include_company_copy','subject_id'];
  insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,
    snapshot,expires_at,created_by) values((v_context->>'company_id')::uuid,
    (v_context->>'party_id')::uuid,p_document_type,p_subject_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),v_snapshot,now()+interval '30 days',auth.uid()) returning id into v_link;
  v_message:=public.render_external_document_message(v_context,v_url,false);
  v_outbox:=public.queue_message((v_context->>'company_id')::uuid,p_channel,
    v_context->>'recipient',v_message->>'body');
  update public.outbox set source='manual_document',customer_id=(v_context->>'party_id')::uuid,
    template_key=v_message->>'template_key',template_version=(v_message->>'template_version')::integer,
    external_document_link_id=v_link,document_type=p_document_type,
    document_subject_id=p_subject_id,document_copy_role='primary',
    max_attempts=case when p_channel='whatsapp' then 2 else 5 end where id=v_outbox;
  if p_include_company_copy then
    begin
      v_copy:=public.render_external_document_message(v_context,v_url,true);
      v_copy_outbox:=public.queue_message((v_context->>'company_id')::uuid,'whatsapp',
        v_context->>'company_copy_recipient',v_copy->>'body');
      update public.outbox set source='manual_document_copy',customer_id=(v_context->>'party_id')::uuid,
        template_key=v_copy->>'template_key',template_version=(v_copy->>'template_version')::integer,
        external_document_link_id=v_link,document_type=p_document_type,
        document_subject_id=p_subject_id,document_copy_role='company',max_attempts=2
      where id=v_copy_outbox;
    exception when others then v_copy_error:=sqlerrm;
    end;
  end if;
  return jsonb_build_object('queued',true,'outbox_id',v_outbox,'company_copy_outbox_id',v_copy_outbox,
    'company_copy_error',v_copy_error,'recipient',v_context->>'recipient','body',v_message->>'body');
end;
$$;
revoke execute on function public.send_external_document(text,uuid,text,boolean) from public,anon;
grant execute on function public.send_external_document(text,uuid,text,boolean) to authenticated;

create or replace function public.public_external_document(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_link public.external_document_links%rowtype;
begin
  select * into v_link from public.external_document_links
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
  if not found then return null; end if;
  return v_link.snapshot||jsonb_build_object('expires_at',v_link.expires_at);
end;
$$;
revoke execute on function public.public_external_document(text) from public;
grant execute on function public.public_external_document(text) to anon,authenticated;

-- Keep the existing reminder implementation, adding only the shared effective
-- automation predicate to its company scan.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.credit_reminder_scan()'::regprocedure) into v_definition;
  if position('external_messaging_allowed' in v_definition)=0 then
    v_definition:=replace(v_definition,
      'where c.payment_reminders_enabled and t.payment_reminders_available',
      'where public.external_messaging_allowed(c.id,true) and c.payment_reminders_enabled and t.payment_reminders_available');
    execute v_definition;
  end if;
end $$;

comment on function public.send_external_document(text,uuid,text,boolean) is
  'Queues a fixed, record-derived business document. It accepts no recipient or message body.';
