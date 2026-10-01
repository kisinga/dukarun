-- Outbound message contract. Coordinated release with notification-flush,
-- sale-document-send, platform-message-test and platform-sales-invitation-send.
-- CUTOVER: pause dispatch (including direct document/test/referral sends), drain
-- in-flight requests, apply this migration and deploy the Edge functions, then
-- resume. Legacy pending messages are cancelled, never repaired or replayed.

alter table public.outbox add column company_name_snapshot text;
comment on column public.outbox.company_name_snapshot is
  'Business identity captured at generation; immutable across retries and SMS fallback. Null only on historical/email rows.';

-- Preserve provider-acceptance uncertainty and settle reservations exactly once.
do $$
declare v_row record;
begin
  for v_row in select * from public.outbox
    where status='pending' and channel in ('sms','whatsapp') for update
  loop
    perform public.finalize_message_quota(v_row.id,v_row.attempts>0);
    update public.outbox set
      status=case when v_row.document_delivery_state='sending' then 'failed' else 'cancelled' end,
      document_delivery_state=case when v_row.document_delivery_state='sending' then 'unknown'
        when v_row.document_delivery_state is not null then 'cancelled' end,
      error=case when v_row.attempts>0 then 'outbound_contract_cutover_delivery_uncertain'
        else 'outbound_contract_cutover' end
    where id=v_row.id;
    update public.campaign_recipients set status='cancelled'
    where id=v_row.campaign_recipient_id and status in ('eligible','queued');
  end loop;
  update public.message_campaigns c set
    status=case when exists(select 1 from public.campaign_recipients r
      where r.campaign_id=c.id and r.status='sent') then 'partial' else 'cancelled' end,
    skipped_count=(select count(*) from public.campaign_recipients r
      where r.campaign_id=c.id and r.status in ('skipped','cancelled'))
  where c.channel in ('sms','whatsapp') and c.status in ('queued','sending','paused')
    and exists(select 1 from public.campaign_recipients r join public.outbox o on o.id=r.outbox_id
      where r.campaign_id=c.id and o.error like 'outbound_contract_cutover%');
end $$;

create function public.outbound_company_name_valid(p_company_name text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(nullif(btrim(p_company_name),'') is not null
    and p_company_name=btrim(p_company_name)
    and p_company_name !~ '[[:cntrl:]]|\{\{|\}\}',false)
$$;

create function public.outbound_message_prefix(p_channel text,p_company_name text,p_scope text default 'company')
returns text language plpgsql immutable set search_path='' as $$
begin
  if p_channel is null or p_channel not in ('sms','whatsapp')
    or p_scope is null or p_scope not in ('company','platform_account','platform') then
    raise exception 'message_contract: invalid_scope_or_channel'; end if;
  if p_scope='platform' then
    return case when p_channel='sms' then 'Dukarun: ' else E'Dukarun\n\n' end;
  end if;
  if not public.outbound_company_name_valid(p_company_name) then
    raise exception 'message_contract: invalid_company_name'; end if;
  if p_scope='platform_account' then
    return case when p_channel='sms' then 'Dukarun - '||p_company_name||': '
      else E'Dukarun\nAccount: '||p_company_name||E'\n\n' end;
  end if;
  return p_company_name||case when p_channel='sms' then ': ' else E'\n\n' end;
end $$;

create function public.outbound_message_valid(p_channel text,p_company_name text,p_body text,p_scope text default 'company')
returns boolean language plpgsql immutable set search_path='' as $$
declare v_prefix text;
begin
  v_prefix:=public.outbound_message_prefix(p_channel,p_company_name,p_scope);
  return coalesce(left(p_body,length(v_prefix))=v_prefix
    and length(btrim(substr(p_body,length(v_prefix)+1),E' \t\n'))>0
    -- app_url is the sole deferred variable, expanded and validated by the worker.
    and replace(p_body,'{{app_url}}','') !~ '\{\{|\}\}'
    and position(E'\\n' in p_body)=0
    and regexp_replace(p_body,E'[\n\t]','','g') !~ '[[:cntrl:]]',false);
exception when others then return false;
end $$;

create function public.format_outbound_message(p_channel text,p_company_name text,p_body text,p_scope text default 'company')
returns text language plpgsql immutable set search_path='' as $$
declare v_prefix text:=public.outbound_message_prefix(p_channel,p_company_name,p_scope);
  v_body text:=btrim(regexp_replace(p_body,E'\r\n?',E'\n','g'),E' \t\n');
begin
  if left(v_body,length(v_prefix)) is distinct from v_prefix then v_body:=v_prefix||v_body; end if;
  if not public.outbound_message_valid(p_channel,p_company_name,v_body,p_scope) then
    raise exception 'message_contract: invalid_body'; end if;
  return v_body;
end $$;

-- Constraints also protect direct inserts and fallback bodies assigned after enqueue.
alter table public.outbox add constraint outbox_pending_identity_check check (
  status<>'pending' or channel not in ('sms','whatsapp') or (
    company_name_snapshot is not null
    and public.outbound_message_valid(channel,company_name_snapshot,body,
      case when source='platform' then 'platform_account' else 'company' end)
    and (fallback_body is null or (fallback_channel is not distinct from 'sms' and
      public.outbound_message_valid('sms',company_name_snapshot,fallback_body,
        case when source='platform' then 'platform_account' else 'company' end)))
  )
);

-- Internal entry point for authoritative document snapshots and inherited fallback
-- identities. Public/customer RPCs never accept a caller-supplied company name.
create function public.queue_identified_message(
  p_company_id uuid,p_channel text,p_recipient text,p_body text,p_subject text,
  p_company_name text,p_source text default 'direct'
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_units integer;v_scheduled timestamptz:=now();v_hour integer;
  v_body text:=p_body;v_name text:=btrim(p_company_name);
begin
  if p_channel is null or p_channel not in ('sms','whatsapp','email') then raise exception 'invalid_channel'; end if;
  if p_channel in ('sms','whatsapp') then
    v_body:=public.format_outbound_message(p_channel,v_name,p_body,
      case when p_source='platform' then 'platform_account' else 'company' end);
  end if;
  v_units:=case when p_channel='sms' then public.sms_segment_count(v_body)
    when p_channel='whatsapp' then 1 else 0 end;
  if v_units>0 and p_source<>'platform' then
    perform public.reserve_message_quota(p_company_id,p_channel,v_units); end if;
  if p_channel='whatsapp' then
    v_hour:=extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_hour>=19 or v_hour<8 then v_scheduled:=((v_scheduled at time zone 'Africa/Nairobi')::date
      +case when v_hour>=19 then interval '1 day' else interval '0' end+interval '8 hours') at time zone 'Africa/Nairobi'; end if;
  end if;
  insert into public.outbox(company_id,company_name_snapshot,channel,recipient,subject,body,
    source,scheduled_after,quota_units,quota_state)
  values(p_company_id,case when p_channel<>'email' then v_name end,p_channel,p_recipient,p_subject,v_body,
    p_source,v_scheduled,v_units,case when v_units>0 and p_source<>'platform' then 'reserved' else 'released' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.queue_message(
  p_company_id uuid,p_channel text,p_recipient text,p_body text,p_subject text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
  select btrim(name) into v_name from public.companies where id=p_company_id;
  return public.queue_identified_message(p_company_id,p_channel,p_recipient,p_body,p_subject,v_name);
end $$;

revoke all on function public.outbound_company_name_valid(text),public.outbound_message_prefix(text,text,text),
  public.outbound_message_valid(text,text,text,text),public.format_outbound_message(text,text,text,text)
  from public,anon;
grant execute on function public.outbound_company_name_valid(text),public.outbound_message_prefix(text,text,text),
  public.outbound_message_valid(text,text,text,text),public.format_outbound_message(text,text,text,text)
  to authenticated,service_role,supabase_auth_admin;
revoke all on function public.queue_identified_message(uuid,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.queue_identified_message(uuid,text,text,text,text,text,text) to service_role;
-- Producer definitions. Existing public RPC signatures remain unchanged.

drop function public.queue_manual_document_message(uuid,text,text,text,text,boolean);

create or replace function public.queue_manual_document_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null,
  p_bypass_quiet_hours boolean default false,
  p_company_name_snapshot text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := public.queue_identified_message(p_company_id,p_channel,p_recipient,p_body,p_subject,
    coalesce(p_company_name_snapshot,(select btrim(name) from public.companies where id=p_company_id)));
  if p_bypass_quiet_hours then
    update public.outbox set scheduled_after=now() where id=v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.queue_manual_document_message(uuid,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.queue_manual_document_message(uuid,text,text,text,text,boolean,text) to service_role;

create or replace function public.queue_sms_fallback(p_outbox_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_source public.outbox%rowtype; v_id uuid;
begin
  select * into v_source from public.outbox where id = p_outbox_id for update;
  if not found then raise exception 'outbox_not_found'; end if;
  if v_source.error like 'message_contract:%' or v_source.error like 'outbound_contract_cutover%'
    or not public.outbound_message_valid(v_source.channel,v_source.company_name_snapshot,v_source.body,
      case when v_source.source='platform' then 'platform_account' else 'company' end) then return null; end if;
  if v_source.fallback_channel <> 'sms' or nullif(v_source.fallback_body,'') is null then
    return null;
  end if;
  select id into v_id from public.outbox where fallback_for_outbox_id = p_outbox_id;
  if v_id is not null then return v_id; end if;
  if v_source.customer_id is not null and not exists(
    select 1 from public.customers c
    where c.id = v_source.customer_id
      and c.company_id = v_source.company_id
      and c.notifications_enabled
      and c.sms_notifications_enabled
      and c.phone is not null
  ) then
    return null;
  end if;

  v_id := public.queue_identified_message(
    v_source.company_id,'sms',v_source.recipient,v_source.fallback_body,v_source.subject,
    v_source.company_name_snapshot,v_source.source
  );
  update public.outbox
  set source = v_source.source,
      customer_id = v_source.customer_id,
      template_key = v_source.template_key,
      template_version = v_source.template_version,
      max_attempts = 5,
      fallback_for_outbox_id = p_outbox_id,
      team_invitation_id = v_source.team_invitation_id,
      fulfillment_id = v_source.fulfillment_id,
      fulfillment_event_id = v_source.fulfillment_event_id,
      cashier_session_id = v_source.cashier_session_id,
      cashier_session_event = v_source.cashier_session_event,
      dedupe_key = v_source.dedupe_key
  where id = v_id;
  return v_id;
exception when unique_violation then
  select id into v_id from public.outbox where fallback_for_outbox_id = p_outbox_id;
  return v_id;
end;
$$;

create or replace function public.queue_team_outbox(
  p_company_id uuid,
  p_invitation_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text,
  p_template_key text,
  p_dedupe_key text,
  p_fallback_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select o.id into v_id
  from public.outbox o
  where o.company_id = p_company_id
    and o.channel = p_channel
    and o.recipient = p_recipient
    and o.dedupe_key = p_dedupe_key;
  if v_id is not null then return v_id; end if;

  v_id := public.queue_message(p_company_id,p_channel,p_recipient,p_body,p_subject);
  update public.outbox
  set source = 'team',
      team_invitation_id = p_invitation_id,
      template_key = p_template_key,
      template_version = (
        select mt.version from public.message_templates mt
        where mt.company_id is null and mt.template_key = p_template_key and mt.active
        limit 1
      ),
      dedupe_key = p_dedupe_key,
      scheduled_after = now(),
      fallback_channel = case when p_channel = 'whatsapp' and p_fallback_body is not null
        then 'sms' end,
      fallback_body = case when p_channel = 'whatsapp' and p_fallback_body is not null
        then public.format_outbound_message('sms',company_name_snapshot,p_fallback_body) end
  where id = v_id;
  return v_id;
exception when unique_violation then
  select o.id into v_id
  from public.outbox o
  where o.company_id = p_company_id
    and o.channel = p_channel
    and o.recipient = p_recipient
    and o.dedupe_key = p_dedupe_key;
  return v_id;
end;
$$;

create or replace function public.reconcile_runtime_sms_quota(
  p_outbox_id uuid,
  p_final_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.outbox%rowtype;
  v_required integer;
  v_delta integer;
begin
  select * into v_row from public.outbox where id = p_outbox_id for update;
  if not found then raise exception 'outbox_not_found'; end if;
  if v_row.channel <> 'sms' or v_row.status <> 'pending' then return v_row.quota_units; end if;

  if not public.outbound_message_valid('sms',v_row.company_name_snapshot,p_final_body,
    case when v_row.source='platform' then 'platform_account' else 'company' end)
    or p_final_body ~ '\{\{|\}\}' then raise exception 'message_contract: invalid_body'; end if;
  v_required := public.sms_segment_count(p_final_body);
  if v_row.source='platform' then
    update public.outbox set quota_units=v_required where id=p_outbox_id;
    return v_required;
  end if;
  v_delta := v_required - v_row.quota_units;
  if v_delta > 0 then
    perform public.reserve_message_quota(v_row.company_id,'sms',v_delta);
  elsif v_delta < 0 and v_row.quota_state = 'reserved' then
    perform public.reset_communication_period_locked(v_row.company_id);
    update public.companies
    set sms_reserved_this_period = greatest(0,sms_reserved_this_period + v_delta)
    where id = v_row.company_id;
  end if;

  update public.outbox
  set quota_units = v_required,
      quota_state = case when v_required > 0 then 'reserved' else 'released' end
  where id = p_outbox_id;
  return v_required;
end;
$$;

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
    when 'proforma' then 'Pro forma invoice' when 'invoice' then 'Invoice' else 'Receipt' end;
  v_values:=jsonb_build_object('company_name',p_context->>'company_name',
    'document_number',p_context->>'document_number','total',to_char((p_context->>'total')::bigint,'FM999G999G999'),
    'balance',to_char((p_context->>'balance')::bigint,'FM999G999G999'),
    'valid_until',coalesce(to_char(nullif(p_context->>'valid_until','')::date,'DD Mon YYYY'),''),
    'validity_line',case when nullif(p_context->>'valid_until','') is not null
      then case when p_context->>'channel'='whatsapp' then E'\n' else ' ' end
        ||'Valid until '||to_char((p_context->>'valid_until')::date,'DD Mon YYYY')||'.' else '' end,
    'document_url',p_url,'document_label',v_label,'party_name',p_context->>'party_name');
  v_body:=public.render_message_template(case when p_copy or p_context->>'channel'='whatsapp'
    then v_template.whatsapp_body else v_template.sms_body end,v_values);
  v_body:=public.format_outbound_message(case when p_copy then 'whatsapp' else p_context->>'channel' end,
    btrim(p_context->>'company_name'),v_body);
  return jsonb_build_object('body',v_body,'template_key',v_template.template_key,
    'template_version',v_template.version);
end;
$$;

create or replace function public.render_customer_statement_message(p_context jsonb,p_url text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_template public.message_templates%rowtype;v_body text;
begin
  select * into v_template from public.message_templates
  where company_id is null and template_key='manual-customer-statement' and active limit 1;
  if not found then raise exception 'statement_template_unavailable'; end if;
  v_body:=public.render_message_template(
    case when p_context->>'channel'='whatsapp' then v_template.whatsapp_body else v_template.sms_body end,
    jsonb_build_object('company_name',p_context->>'company_name','party_name',p_context->>'party_name',
      'account_summary',rtrim(p_context->>'account_summary','.')||'.','statement_url',p_url,
      'expires_at',to_char(coalesce((p_context->>'expires_at')::timestamptz,now()+interval '7 days')
        at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' EAT'));
  v_body:=public.format_outbound_message(p_context->>'channel',btrim(p_context->>'company_name'),v_body);
  return jsonb_build_object('body',v_body,'template_key',v_template.template_key,
    'template_version',v_template.version);
end; $$;

create or replace function public.send_customer_statement(
  p_customer_id uuid,p_channel text,p_bypass_quiet_hours boolean default false
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;v_message jsonb;v_token text;v_url text;v_origin text;
  v_link_id uuid;v_outbox_id uuid;v_expires_at timestamptz;
begin
  v_context:=public.customer_statement_message_context(p_customer_id,p_channel);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_context->>'company_id')||':manual_statement:'||p_customer_id::text,0));
  if exists(select 1 from public.outbox o
    where o.company_id=(v_context->>'company_id')::uuid and o.customer_id=p_customer_id
      and o.source='manual_statement' and o.status in ('pending','sent')
      and o.created_at>now()-interval '1 minute') then
    raise exception 'statement_send_cooldown';
  end if;
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  v_token:=public.issue_customer_statement_link(
    (v_context->>'company_id')::uuid,p_customer_id,'manual',auth.uid());
  v_url:=v_origin||'/statement/'||v_token;
  select id,expires_at into v_link_id,v_expires_at from public.customer_statement_links
  where company_id=(v_context->>'company_id')::uuid
    and token_hash=encode(extensions.digest(v_token,'sha256'),'hex');
  v_context:=v_context||jsonb_build_object('expires_at',v_expires_at);
  v_message:=public.render_customer_statement_message(v_context,v_url);
  v_outbox_id:=public.queue_manual_document_message(
    (v_context->>'company_id')::uuid,p_channel,v_context->>'recipient',v_message->>'body',
    null,p_bypass_quiet_hours,v_context->>'company_name');
  update public.outbox set source='manual_statement',customer_id=p_customer_id,
    template_key=v_message->>'template_key',template_version=(v_message->>'template_version')::integer,
    customer_statement_link_id=v_link_id,max_attempts=case when p_channel='whatsapp' then 2 else 5 end
  where id=v_outbox_id;
  return jsonb_build_object('queued',true,'outbox_id',v_outbox_id,'recipient',v_context->>'recipient',
    'body',v_message->>'body','expires_at',(select expires_at from public.customer_statement_links where id=v_link_id));
end; $$;

create or replace function public.send_external_document(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false,
  p_bypass_quiet_hours boolean default false
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb;v_token text;v_copy_token text;v_url text;v_copy_url text;v_origin text;
  v_link uuid;v_copy_link uuid;v_outbox uuid;v_copy_outbox uuid;
  v_message jsonb;v_copy jsonb;v_copy_error text;v_snapshot jsonb;
begin
  v_context:=public.external_document_context(p_document_type,p_subject_id,p_channel,p_include_company_copy);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_context->>'company_id')||':'||p_document_type||':'||p_subject_id::text||':'||p_channel,0));
  if exists(select 1 from public.outbox o where o.company_id=(v_context->>'company_id')::uuid
    and o.document_type=p_document_type and o.document_subject_id=p_subject_id
    and o.document_copy_role='primary' and o.channel=p_channel and o.status in ('pending','sent')
    and o.created_at>now()-interval '1 minute') then raise exception 'document_send_cooldown'; end if;
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin from vault.decrypted_secrets
    where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  v_snapshot:=v_context-array['company_id','party_id','recipient','company_copy_recipient','channel','include_company_copy','subject_id','payments'];
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_url:=v_origin||'/document/'||v_token;
  insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at,created_by,audience_role)
  values((v_context->>'company_id')::uuid,(v_context->>'party_id')::uuid,p_document_type,p_subject_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),v_snapshot,now()+interval '30 days',auth.uid(),'primary') returning id into v_link;
  v_message:=public.render_external_document_message(v_context,v_url,false);
  v_outbox:=public.queue_manual_document_message((v_context->>'company_id')::uuid,p_channel,
    v_context->>'recipient',v_message->>'body',null,p_bypass_quiet_hours,v_context->>'company_name');
  update public.outbox set source='manual_document',customer_id=(v_context->>'party_id')::uuid,
    template_key=v_message->>'template_key',template_version=(v_message->>'template_version')::integer,
    external_document_link_id=v_link,document_type=p_document_type,document_subject_id=p_subject_id,
    document_copy_role='primary',max_attempts=case when p_channel='whatsapp' then 2 else 5 end where id=v_outbox;
  if p_include_company_copy then
    begin
      v_copy_token:=encode(extensions.gen_random_bytes(32),'hex');v_copy_url:=v_origin||'/document/'||v_copy_token;
      insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at,created_by,audience_role)
      values((v_context->>'company_id')::uuid,(v_context->>'party_id')::uuid,p_document_type,p_subject_id,
        encode(extensions.digest(v_copy_token,'sha256'),'hex'),v_snapshot,now()+interval '30 days',auth.uid(),'company_copy') returning id into v_copy_link;
      v_copy:=public.render_external_document_message(v_context,v_copy_url,true);
      v_copy_outbox:=public.queue_manual_document_message((v_context->>'company_id')::uuid,'whatsapp',
        v_context->>'company_copy_recipient',v_copy->>'body',null,p_bypass_quiet_hours,v_context->>'company_name');
      update public.outbox set source='manual_document_copy',customer_id=(v_context->>'party_id')::uuid,
        template_key=v_copy->>'template_key',template_version=(v_copy->>'template_version')::integer,
        external_document_link_id=v_copy_link,document_type=p_document_type,document_subject_id=p_subject_id,
        document_copy_role='company',max_attempts=2 where id=v_copy_outbox;
    exception when others then v_copy_error:=sqlerrm;
    end;
  end if;
  return jsonb_build_object('queued',true,'outbox_id',v_outbox,'company_copy_outbox_id',v_copy_outbox,
    'company_copy_error',v_copy_error,'recipient',v_context->>'recipient','body',v_message->>'body');
end;
$$;

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
  v_body:=case when nullif(btrim(v_customer.first_name),'') is not null
      then 'Hi '||btrim(v_customer.first_name)||E',\n\n' else '' end
    ||'Your '||v_kind||' '||v_order.code||E' is attached.\n\nView your '||v_kind||E' online:\n'||v_url;
  if v_store_url is not null then
    v_body:=v_body||E'\n\nShop online:\n'||v_store_url;
  end if;
  v_outbox:=public.queue_manual_document_message(v_order.company_id,'whatsapp',v_customer.phone_normalized,v_body,null,true,v_company.name);
  update public.outbox set source='manual_document',customer_id=v_customer.id,external_document_link_id=v_link,
    document_type=v_kind,document_subject_id=p_order_id,document_copy_role='primary',max_attempts=2,
    document_request_key=p_request_key,document_requested_by=auth.uid(),document_delivery_state='queued'
    where id=v_outbox;
  return jsonb_build_object('outbox_id',v_outbox,'state','queued');
end $$;

create or replace function public.claim_sale_document_delivery(p_outbox_id uuid default null)
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
    'recipient',v_job.recipient,'caption',v_job.body,'company_name_snapshot',v_job.company_name_snapshot);
end $$;

-- Use the same identity eligibility for review and dispatch. A rejected company
-- must not become the sample or prevent other recipients from being queued.
create or replace function public.platform_campaign_preview(
  p_channel text,p_audience text default 'all',p_tier_id uuid default null,
  p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total int;v_eligible int;v_missing_primary int;v_missing_phone int;v_sample jsonb;
begin
  perform public.assert_platform_admin();
  if p_channel not in ('in_app','sms','whatsapp') then raise exception 'invalid_channel'; end if;
  with targets as (
    select c.id,c.name,t.name tier_name,c.subscription_status,c.subscription_expires_at,
      public.resolve_platform_campaign_recipient(c.id) admin
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id
    where c.status='approved' and (p_audience='all' or (p_audience='tier' and c.subscription_tier_id=p_tier_id)
      or (p_audience='subscription_status' and c.subscription_status=p_subscription_status)
      or (p_audience='selected' and c.id=any(p_company_ids)))
  ), classified as (
    select *,case when admin is null then 'missing_primary'
      when p_channel<>'in_app' and admin->>'phone' is null then 'missing_phone'
      when p_channel<>'in_app' and not public.outbound_company_name_valid(btrim(name))
        then 'invalid_company_name' end skip_reason
    from targets
  ) select count(*),count(*) filter(where skip_reason is null),
    count(*) filter(where skip_reason='missing_primary'),count(*) filter(where skip_reason='missing_phone'),
    (jsonb_agg(jsonb_build_object('merchant_name',name,'tier',coalesce(tier_name,'No tier'),
      'subscription_state',coalesce(subscription_status,'pending'),'subscription_end_date',
      coalesce(to_char(subscription_expires_at at time zone 'Africa/Nairobi','DD Mon YYYY'),'Not set')) order by name)
      filter(where skip_reason is null))->0
  into v_total,v_eligible,v_missing_primary,v_missing_phone,v_sample from classified;
  return jsonb_build_object('total',v_total,'eligible',v_eligible,'skipped',v_total-v_eligible,
    'missing_primary',v_missing_primary,'missing_phone',v_missing_phone,'sample',v_sample);
end;
$$;

create or replace function public.dispatch_platform_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.message_campaigns%rowtype;v_target record;v_recipient uuid;v_outbox uuid;
  v_count int:=0;v_skipped int:=0;v_scheduled timestamptz;v_values jsonb;v_title text;v_body text;
begin
  select * into v_campaign from public.message_campaigns where id=p_campaign_id and scope='platform' for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if v_campaign.status not in ('draft','scheduled') then return jsonb_build_object('campaign_id',v_campaign.id,'queued',v_campaign.recipient_count-v_campaign.skipped_count,'skipped',v_campaign.skipped_count); end if;
  if v_campaign.status='scheduled' and v_campaign.scheduled_for>now() then raise exception 'campaign_not_due'; end if;
  update public.message_campaigns set status='sending',sent_at=now(),updated_at=now() where id=v_campaign.id;
  for v_target in
    select c.id company_id,c.name,t.name tier_name,c.subscription_status,c.subscription_expires_at,
      public.resolve_platform_campaign_recipient(c.id) admin
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id where c.status='approved'
      and (v_campaign.audience='all' or (v_campaign.audience='tier' and c.subscription_tier_id=(v_campaign.audience_config->>'tier_id')::uuid)
        or (v_campaign.audience='subscription_status' and c.subscription_status=v_campaign.audience_config->>'subscription_status')
        or (v_campaign.audience='selected' and public.jsonb_uuid_array_contains(v_campaign.audience_config->'company_ids',c.id)))
  loop
    -- Reject invalid identity before rendering placeholders from company data.
    if v_campaign.channel in ('sms','whatsapp') and not public.outbound_company_name_valid(btrim(v_target.name)) then
      insert into public.campaign_recipients(campaign_id,company_id,user_id,rendered_title,rendered_body,status,skip_reason)
      values(v_campaign.id,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_campaign.title,v_campaign.body,'skipped',
        case when v_target.admin is null then 'missing_primary'
          when v_target.admin->>'phone' is null then 'missing_phone' else 'invalid_company_name' end);
      v_skipped:=v_skipped+1;
      continue;
    end if;
    v_values:=jsonb_build_object('merchant_name',v_target.name,'tier',coalesce(v_target.tier_name,'No tier'),
      'subscription_state',coalesce(v_target.subscription_status,'pending'),'subscription_end_date',
      coalesce(to_char(v_target.subscription_expires_at at time zone 'Africa/Nairobi','DD Mon YYYY'),'Not set'),'message',v_campaign.body);
    v_title:=public.render_message_template(v_campaign.title,v_values);v_body:=public.render_message_template(v_campaign.body,v_values);
    if v_campaign.channel in ('sms','whatsapp') then
      v_body:=public.format_outbound_message(v_campaign.channel,btrim(v_target.name),v_body,'platform_account');
    end if;
    if v_target.admin is null or (v_campaign.channel<>'in_app' and v_target.admin->>'phone' is null) then
      insert into public.campaign_recipients(campaign_id,company_id,user_id,rendered_title,rendered_body,status,skip_reason)
      values(v_campaign.id,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_title,v_body,'skipped',
        case when v_target.admin is null then 'missing_primary' else 'missing_phone' end);v_skipped:=v_skipped+1;
    else
      insert into public.campaign_recipients(campaign_id,company_id,user_id,recipient,rendered_title,rendered_body,status)
      values(v_campaign.id,v_target.company_id,(v_target.admin->>'user_id')::uuid,
        case when v_campaign.channel='in_app' then null else v_target.admin->>'phone' end,v_title,v_body,
        case when v_campaign.channel='in_app' then 'sent' else 'queued' end) returning id into v_recipient;
      if v_campaign.channel='in_app' then
        insert into public.notifications(company_id,user_id,type,title,body,link,action_label,campaign_id,campaign_recipient_id)
        values(v_target.company_id,(v_target.admin->>'user_id')::uuid,'system',v_title,v_body,
          coalesce(v_campaign.cta_link,'/notifications'),v_campaign.cta_label,v_campaign.id,v_recipient);
      else
        v_scheduled:=now();
        if v_campaign.channel='whatsapp' and extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int not between 8 and 18 then
          v_scheduled:=((v_scheduled at time zone 'Africa/Nairobi')::date+
            case when extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int>=19 then interval '1 day' else interval '0' end+interval '8 hours') at time zone 'Africa/Nairobi';
        end if;
        insert into public.outbox(company_id,company_name_snapshot,channel,recipient,subject,body,scheduled_after,campaign_id,campaign_recipient_id,source,quota_state)
        values(v_target.company_id,btrim(v_target.name),v_campaign.channel,v_target.admin->>'phone',v_title,v_body,v_scheduled,v_campaign.id,v_recipient,'platform','released') returning id into v_outbox;
        update public.campaign_recipients set outbox_id=v_outbox where id=v_recipient;
      end if;
      v_count:=v_count+1;
    end if;
  end loop;
  update public.message_campaigns set recipient_count=v_count+v_skipped,skipped_count=v_skipped,
    sent_count=case when channel='in_app' then v_count else 0 end,
    status=case when channel='in_app' then 'completed' when v_count=0 then 'failed' else 'queued' end,updated_at=now()
  where id=v_campaign.id;
  return jsonb_build_object('campaign_id',v_campaign.id,'queued',v_count,'skipped',v_skipped);
end;
$$;

create or replace function public.platform_review_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.message_campaigns%rowtype;v_company_ids uuid[];v_preview jsonb;v_values jsonb;v_body text;v_title text;
begin
  perform public.assert_platform_admin();
  select * into v_campaign from public.message_campaigns
  where id=p_campaign_id and scope='platform' and status='draft' for update;
  if not found then raise exception 'editable_draft_not_found'; end if;
  if jsonb_typeof(v_campaign.audience_config->'company_ids')='array' then
    select array_agg(value::uuid) into v_company_ids
    from jsonb_array_elements_text(v_campaign.audience_config->'company_ids') values_(value);
  end if;
  perform public.validate_platform_campaign(v_campaign.name,v_campaign.channel,v_campaign.title,v_campaign.body,
    v_campaign.audience,nullif(v_campaign.audience_config->>'tier_id','')::uuid,
    v_campaign.audience_config->>'subscription_status',v_company_ids,v_campaign.cta_label,v_campaign.cta_link);
  v_preview:=public.platform_campaign_preview(v_campaign.channel,v_campaign.audience,
    nullif(v_campaign.audience_config->>'tier_id','')::uuid,
    v_campaign.audience_config->>'subscription_status',v_company_ids);
  if v_preview->'sample' is not null and v_preview->'sample'<>'null'::jsonb then
    v_values:=(v_preview->'sample')||jsonb_build_object('message',v_campaign.body);
    v_title:=public.render_message_template(v_campaign.title,v_values);
    v_body:=public.render_message_template(v_campaign.body,v_values);
    if v_campaign.channel in ('sms','whatsapp') then
      v_body:=public.format_outbound_message(v_campaign.channel,btrim(v_values->>'merchant_name'),v_body,'platform_account');
    end if;
    v_preview:=v_preview||jsonb_build_object('rendered_title',v_title,'rendered_body',v_body,
      'sms_segments',case when v_campaign.channel='sms' then public.sms_segment_count(v_body) end);
  end if;
  update public.message_campaigns set reviewed_at=now() where id=v_campaign.id;
  return v_preview;
end;
$$;

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
      'tracking_url',coalesce(v_url,''),'pin',coalesce(p_pin,''),
      'ready_action',case when v_f.fulfillment_type='delivery' then 'dispatch' else 'collection' end,
      'pin_label',case when v_f.fulfillment_type='delivery' then 'Delivery PIN' else 'Collection PIN' end)
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
      then public.format_outbound_message('sms',company_name_snapshot,public.render_message_template(v_template.sms_body,jsonb_build_object(
        'company_name',v_company.name,'order_code',v_order.code,
        'tracking_url',coalesce(v_url,''),'pin',coalesce(p_pin,''),
      'ready_action',case when v_f.fulfillment_type='delivery' then 'dispatch' else 'collection' end,
      'pin_label',case when v_f.fulfillment_type='delivery' then 'Delivery PIN' else 'Collection PIN' end))) end
  where id=v_outbox_id;
  return v_outbox_id;
exception when unique_violation then return null;
end;
$$;

create or replace function public.credit_reminder_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row record;v_pending record;v_rule record;v_template record;v_token text;v_url text;
  v_body text;v_fallback_body text;v_outbox uuid;v_count int:=0;v_statement_origin text;
  v_missing_url_notified uuid[]:='{}';v_admin_user_id uuid;
begin
  select nullif(rtrim(decrypted_secret,'/'),'') into v_statement_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;

  -- A payment can settle the debt after a reminder was queued but before the
  -- worker sends it. Release that reservation and cancel the stale delivery.
  for v_pending in
    select o.id,o.attempts from public.outbox o
    where o.source='reminder' and o.status='pending'
      and not exists(
        select 1 from public.orders sale
        where sale.company_id=o.company_id and sale.customer_id=o.customer_id
          and sale.is_credit_sale and sale.status='completed'
          and public.order_open_balance_core(sale.id)>0
      )
    for update
  loop
    perform public.finalize_message_quota(v_pending.id,v_pending.attempts>0);
    update public.outbox set status='cancelled',
      error=case when v_pending.attempts>0 then 'balance_settled_after_attempt_delivery_uncertain' else 'balance_settled' end
    where id=v_pending.id and status='pending';
  end loop;

  for v_row in
    select c.id company_id,cu.id customer_id,cu.first_name,cu.phone,c.name store_name,
      cu.notifications_enabled,cu.sms_notifications_enabled,cu.whatsapp_notifications_enabled,
      c.payment_reminder_channel,c.payment_reminder_sms_fallback,sum(a.balance)::bigint balance,
      min(a.credit_due_at) earliest_due_date,
      max((now() at time zone 'Africa/Nairobi')::date-a.credit_due_at)::int days_overdue
    from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
    join public.customers cu on cu.company_id=c.id
    join (select o.company_id,o.customer_id,o.credit_due_at,
      public.order_open_balance_core(o.id) balance
      from public.orders o where o.is_credit_sale and o.status='completed') a
      on a.company_id=c.id and a.customer_id=cu.id
    where public.external_messaging_allowed(c.id,true) and c.payment_reminders_enabled and t.payment_reminders_available and a.balance>0
      and a.credit_due_at<=(now() at time zone 'Africa/Nairobi')::date
      and public.company_subscription_accessible(c.id)
    group by c.id,cu.id,cu.first_name,cu.phone,cu.notifications_enabled,cu.sms_notifications_enabled,
      cu.whatsapp_notifications_enabled,c.name,c.payment_reminder_channel,c.payment_reminder_sms_fallback
  loop
    select * into v_rule from public.payment_reminder_rules r where r.company_id=v_row.company_id
      and r.stage_days=v_row.days_overdue and r.enabled;
    if not found or exists(select 1 from public.credit_notification_checkpoints cp where cp.company_id=v_row.company_id
      and cp.customer_id=v_row.customer_id and cp.bucket='due_'||v_row.days_overdue) then continue; end if;
    if v_row.phone is null or not v_row.notifications_enabled
      or (v_row.payment_reminder_channel='sms' and not v_row.sms_notifications_enabled)
      or (v_row.payment_reminder_channel='whatsapp' and not v_row.whatsapp_notifications_enabled) then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        case when v_row.phone is null then 'Customer has no phone number.' else 'Customer has opted out of this channel.' end,
        '/customers/'||v_row.customer_id::text);
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      continue;
    end if;
    if v_statement_origin is null then
      if not (v_row.company_id=any(v_missing_url_notified)) then
        select coalesce(
          (select m.user_id from public.company_memberships m join public.roles role on role.id=m.role_id
           where m.company_id=v_row.company_id and m.authorization_status='approved'
             and 'ManageTeam'=any(role.permissions) order by m.created_at limit 1),
          (select m.user_id from public.company_memberships m where m.company_id=v_row.company_id
           and m.authorization_status='approved' order by m.created_at limit 1))
        into v_admin_user_id;
        perform public.notify(v_row.company_id,'credit_reminder','Payment reminders are not configured',
          'STOREFRONT_PUBLIC_URL is missing. No reminder was sent.','/settings',v_admin_user_id);
        v_missing_url_notified:=array_append(v_missing_url_notified,v_row.company_id);
      end if;
      continue;
    end if;
    v_token:=public.issue_customer_statement_link(v_row.company_id,v_row.customer_id);
    v_url:=v_statement_origin||'/statement/'||v_token;
    select mt.* into v_template
    from public.message_templates mt where mt.template_key=v_rule.template_key
      and (mt.company_id=v_row.company_id or mt.company_id is null)
    order by mt.company_id nulls last limit 1;
    if not found then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',
        'Reminder template is missing.','/messaging');
      continue;
    end if;
    v_body:=public.render_message_template(
      case when v_row.payment_reminder_channel='sms' then v_template.sms_body else v_template.whatsapp_body end,
      jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
        'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
        'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY')));
    v_fallback_body:=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then
      public.render_message_template(v_template.sms_body,
        jsonb_build_object('customer_first_name',v_row.first_name,'outstanding_balance',to_char(v_row.balance,'FM999G999G999'),
          'statement_url',v_url,'store_name',v_row.store_name,'days_overdue',v_row.days_overdue,
          'due_date',to_char(v_row.earliest_due_date,'DD Mon YYYY'))) end;
    begin
      v_outbox:=public.queue_message(v_row.company_id,v_row.payment_reminder_channel,v_row.phone,v_body);
      update public.outbox set source='reminder',customer_id=v_row.customer_id,template_key=v_rule.template_key,
        template_version=v_template.version,
        fallback_body=case when v_fallback_body is not null then
          public.format_outbound_message('sms',company_name_snapshot,v_fallback_body) end,
        fallback_channel=case when v_row.payment_reminder_channel='whatsapp' and v_row.payment_reminder_sms_fallback then 'sms' end,
        max_attempts=case when v_row.payment_reminder_channel='whatsapp' then 2 else 5 end where id=v_outbox;
      insert into public.credit_notification_checkpoints(company_id,customer_id,bucket)
      values(v_row.company_id,v_row.customer_id,'due_'||v_row.days_overdue) on conflict do nothing;
      v_count:=v_count+1;
    exception when others then
      perform public.notify(v_row.company_id,'credit_reminder','Reminder not sent',sqlerrm,'/messaging');
    end;
  end loop;
  return v_count;
end;
$function$;

create or replace function public.dispatch_credit_band_notifications(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record;v_origin text;v_token text;v_url text;v_body text;v_outbox uuid;v_count integer:=0;
begin
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then return 0; end if;
  for v_row in
    select q.*,cu.first_name,cu.phone,cu.notifications_enabled,cu.sms_notifications_enabled,
      cu.whatsapp_notifications_enabled,cu.credit_score_notifications_enabled,
      c.name company_name,c.credit_score_notifications_enabled company_enabled,c.payment_reminder_channel channel,
      mt.sms_body,mt.whatsapp_body,mt.version
    from public.credit_band_notification_queue q
    join public.customers cu on cu.id=q.customer_id and cu.company_id=q.company_id
    join public.companies c on c.id=q.company_id
    join public.subscription_tiers t on t.id=c.subscription_tier_id
    left join public.message_templates mt on mt.template_key='credit-score-band-change' and mt.company_id is null
    where q.sent_at is null and q.send_after<=now() and c.credit_score_notifications_enabled
      and cu.credit_score_notifications_enabled and cu.notifications_enabled and cu.phone is not null
      and public.company_subscription_accessible(c.id)
      and case when c.payment_reminder_channel='sms' then cu.sms_notifications_enabled
        else cu.whatsapp_notifications_enabled end
    order by q.send_after limit least(greatest(p_limit,1),500) for update of q skip locked
  loop
    begin
      v_token:=public.issue_customer_statement_link(v_row.company_id,v_row.customer_id);
      v_url:=v_origin||'/statement/'||v_token;
      v_body:=public.render_message_template(
        case when v_row.channel='sms' then v_row.sms_body else v_row.whatsapp_body end,
        jsonb_build_object('company_name',v_row.company_name,'customer_first_name',v_row.first_name,'score',coalesce(v_row.score::text,'unrated'),
          'band',case v_row.to_band when 'high_risk' then 'High risk' else initcap(v_row.to_band) end,
          'reason',case v_row.reason_code
            when 'over_limit' then 'Your outstanding balance exceeds your credit limit.'
            when 'overdue_60_plus' then 'Your oldest unpaid amount is more than 60 days overdue.'
            when 'overdue_31_60' then 'Your oldest unpaid amount is between 31 and 60 days overdue.'
            when 'overdue_8_30' then 'Your oldest unpaid amount is between 8 and 30 days overdue.'
            when 'overdue_1_7' then 'Your oldest unpaid amount is between 1 and 7 days overdue.'
            when 'frequently_late' then 'Your payment history includes frequent late payments.'
            when 'no_current_risk' then 'Your account currently has no flagged credit issues.'
            else 'Your credit profile has been updated following account activity.' end,
          'consequence',case v_row.to_band when 'watch' then 'Please contact the company before requesting a higher credit limit.'
            when 'restricted' then 'Please contact the company to discuss a review of your credit account.'
            when 'high_risk' then 'Please contact the company to discuss your balance before requesting more credit.' else 'Continue making payments by their due dates.' end,
          'statement_url',v_url));
      v_outbox:=public.queue_message(v_row.company_id,v_row.channel,v_row.phone,v_body);
      update public.outbox set source='reminder',customer_id=v_row.customer_id,
        template_key='credit-score-band-change',template_version=v_row.version where id=v_outbox;
      update public.credit_band_notification_queue set sent_at=now(),last_error=null
      where company_id=v_row.company_id and customer_id=v_row.customer_id;
      v_count:=v_count+1;
    exception when others then
      update public.credit_band_notification_queue set last_error=sqlerrm,send_after=now()+interval '1 hour'
      where company_id=v_row.company_id and customer_id=v_row.customer_id;
    end;
  end loop;
  return v_count;
end;
$$;

create or replace function public.queue_cashier_session_notification(
  p_session_id uuid,
  p_event text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cashier_sessions%rowtype;
  v_target jsonb;
  v_preferences jsonb;
  v_store text;
  v_cashier text;
  v_balances text;
  v_collections text;
  v_total_sales bigint := 0;
  v_credit_sales bigint := 0;
  v_variance bigint := 0;
  v_duration integer := 0;
  v_body text;
  v_sms_body text;
  v_channel text;
  v_outbox uuid;
  v_key text;
begin
  if p_event not in ('opened','closed') then raise exception 'invalid_cashier_session_event'; end if;
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if not found then return null; end if;
  if p_event = 'closed' and v_session.status <> 'closed' then return null; end if;

  v_target := public.resolve_platform_campaign_recipient(v_session.company_id);
  if v_target is null then return null; end if;
  v_preferences := public.primary_contact_notification_preferences(v_session.company_id);
  v_key := 'cashier:' || p_session_id::text || ':' || p_event || ':primary';

  select l.name into v_store from public.stock_locations l
  where l.id = v_session.location_id and l.company_id = v_session.company_id;
  select p.display_name into v_cashier from public.company_staff_profiles p
  where p.company_id = v_session.company_id and p.user_id = v_session.cashier_user_id;
  v_cashier := coalesce(v_cashier,'Staff …' || right(v_session.cashier_user_id::text,6));

  select coalesce(string_agg(
      '• ' || initcap(replace(a.account_code,'_',' ')) || ': ' || public.cashier_kes(a.declared),
      E'\n' order by a.account_code
    ),'• No controlled balances'),coalesce(sum(a.variance),0)::bigint
  into v_balances,v_variance
  from public.reconciliation_accounts a
  join public.reconciliations r on r.id = a.reconciliation_id
  where r.company_id = v_session.company_id and r.scope = 'cash-session'
    and r.scope_ref_id = p_session_id::text ||
      case when p_event = 'opened' then ':opening' else ':closing' end;

  if p_event = 'opened' then
    v_body := '*Cashier session opened — ' || coalesce(v_store,'Store') || '*' || E'\n\n' ||
      '*Cashier:* ' || v_cashier || E'\n' ||
      '*Opened:* ' || to_char(v_session.opened_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI') || E'\n\n' ||
      '*Opening balances*' || E'\n' || v_balances || E'\n\n' ||
      '*Opening variance:* ' || case when v_variance = 0 then 'None'
        else public.cashier_kes(abs(v_variance)) ||
          case when v_variance < 0 then ' short' else ' over' end end;
  else
    select coalesce(sum(o.total),0)::bigint,
      coalesce(sum(o.total) filter(where o.is_credit_sale),0)::bigint
    into v_total_sales,v_credit_sales
    from public.orders o where o.company_id = v_session.company_id
      and o.cashier_session_id = p_session_id and o.status = 'completed';
    select coalesce(string_agg(
      '• ' || initcap(replace(rows.method_code,'_',' ')) || ': ' || public.cashier_kes(rows.amount),
      E'\n' order by rows.method_code
    ),'• None') into v_collections
    from (
      select p.method_code,sum(p.amount)::bigint amount
      from public.payments p join public.orders o on o.id = p.order_id
      where o.company_id = v_session.company_id and o.cashier_session_id = p_session_id
        and o.status = 'completed' and p.status = 'settled'
      group by p.method_code
    ) rows;
    v_duration := greatest(0,round(extract(epoch from
      (coalesce(v_session.closed_at,now()) - v_session.opened_at))/60)::integer);
    v_body := '*Cashier session closed — ' || coalesce(v_store,'Store') || '*' || E'\n\n' ||
      '*Cashier:* ' || v_cashier || E'\n' ||
      '*Time:* ' || to_char(v_session.opened_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI') ||
        ' – ' || to_char(v_session.closed_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI') || E'\n' ||
      '*Duration:* ' || (v_duration/60)::text || 'h ' || (v_duration%60)::text || 'm' || E'\n\n' ||
      '*Sales:* ' || public.cashier_kes(v_total_sales) || E'\n' ||
      '• Credit sales: ' || public.cashier_kes(v_credit_sales) || E'\n\n' ||
      '*Collections*' || E'\n' || v_collections || E'\n\n' ||
      '*Closing balances*' || E'\n' || v_balances || E'\n\n' ||
      '*Variance:* ' || case when v_variance = 0 then 'None'
        else public.cashier_kes(abs(v_variance)) ||
          case when v_variance < 0 then ' short' else ' over' end end;
  end if;

  perform public.notify_once(
    v_session.company_id,(v_target ->> 'user_id')::uuid,'cashier_session',
    case when p_event = 'opened' then 'Cashier session opened — ' else 'Cashier session closed — ' end ||
      coalesce(v_store,'Store'),
    case when p_event = 'opened'
      then v_cashier || ' opened the cashier session.'
      else v_cashier || ' closed the cashier session.' end,
    '/money/cashier',v_key
  );

  select o.id into v_outbox
  from public.outbox o
  where o.cashier_session_id = p_session_id
    and o.cashier_session_event = p_event
    and o.fallback_for_outbox_id is null
  order by o.created_at
  limit 1;
  if v_outbox is not null then return v_outbox; end if;
  if not coalesce((v_preferences ->> 'cashierSessions')::boolean,true)
     or v_preferences ->> 'channel' = 'none'
     or nullif(v_target ->> 'phone','') is null then
    return null;
  end if;

  begin
    v_sms_body := 'Cashier session '||p_event||' at '||coalesce(v_store,'branch')||'. Cashier: '||v_cashier||'. '
      ||case when p_event='opened' then
        'Opened: '||to_char(v_session.opened_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' EAT. '
        ||'Opening balances: '||replace(replace(v_balances,'• ',''),E'\n','; ')||'. '
      else 'Closed: '||to_char(v_session.closed_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' EAT. '
        ||'Sales: '||public.cashier_kes(v_total_sales)||'; credit sales: '||public.cashier_kes(v_credit_sales)||'. '
      end
      ||'Variance: '||case when v_variance=0 then 'none.' else public.cashier_kes(abs(v_variance))
        ||case when v_variance<0 then ' short.' else ' over.' end end;
    v_channel := case when v_preferences ->> 'channel' = 'sms' then 'sms' else 'whatsapp' end;
    v_outbox := public.queue_message(
      v_session.company_id,v_channel,v_target ->> 'phone',
      case when v_channel = 'sms' then v_sms_body else v_body end,
      case when p_event = 'opened' then 'Cashier session opened' else 'Cashier session closed' end
    );
    update public.outbox
    set source = 'cashier_session',
        cashier_session_id = p_session_id,
        cashier_session_event = p_event,
        scheduled_after = now(),
        template_key = 'cashier-session-' || p_event,
        dedupe_key = v_key,
        fallback_channel = case when v_preferences ->> 'channel' = 'whatsapp_sms_fallback'
          then 'sms' end,
        fallback_body = case when v_preferences ->> 'channel' = 'whatsapp_sms_fallback'
          then public.format_outbound_message('sms',company_name_snapshot,v_sms_body) end
    where id = v_outbox;
    return v_outbox;
  exception
    when unique_violation then
      select id into v_outbox from public.outbox
      where cashier_session_id = p_session_id and cashier_session_event = p_event
        and fallback_for_outbox_id is null
      order by created_at limit 1;
      return v_outbox;
    when others then
      return null;
  end;
exception
  when others then
    return null;
end;
$$;

create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := event #>> '{user,phone}';
  v_otp text := event #>> '{sms,otp}';
  v_mobile text;
  v_sms_key text;
  v_partner text;
  v_shortcode text;
  v_wa_url text;
  v_wa_key text;
  v_wa_session text;
  v_sms_request bigint;
  v_wa_request bigint;
begin
  select
    max(case when name = 'TEXTSMS_API_KEY' then decrypted_secret end),
    max(case when name = 'TEXTSMS_PARTNER_ID' then decrypted_secret end),
    max(case when name = 'TEXTSMS_SHORTCODE' then decrypted_secret end),
    max(case when name = 'OPENWA_BASE_URL' then decrypted_secret end),
    max(case when name = 'OPENWA_API_KEY' then decrypted_secret end),
    max(case when name = 'OPENWA_SESSION' then decrypted_secret end)
  into v_sms_key, v_partner, v_shortcode, v_wa_url, v_wa_key, v_wa_session
  from vault.decrypted_secrets
  where name in (
    'TEXTSMS_API_KEY',
    'TEXTSMS_PARTNER_ID',
    'TEXTSMS_SHORTCODE',
    'OPENWA_BASE_URL',
    'OPENWA_API_KEY',
    'OPENWA_SESSION'
  );

  v_mobile := ltrim(v_phone, '+');

  if v_sms_key is not null
     and v_sms_key <> 'dev-disabled'
     and v_partner is not null
     and v_shortcode is not null then
    begin
      select net.http_post(
        url := 'https://sms.textsms.co.ke/api/services/sendotp/',
        body := jsonb_build_object(
          'apikey', v_sms_key,
          'partnerID', v_partner,
          'shortcode', v_shortcode,
          'mobile', v_mobile,
          'message', public.format_outbound_message('sms',null,'Your verification code is '||v_otp||'. Do not share this code.','platform')
        ),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      ) into v_sms_request;
    exception when others then
      v_sms_request := null;
    end;
  end if;

  if v_wa_url is not null and v_wa_key is not null then
    begin
      select net.http_post(
        url := rtrim(v_wa_url, '/') || '/api/sessions/'
          || coalesce(nullif(v_wa_session, ''), 'default') || '/messages/send-text',
        body := jsonb_build_object(
          'chatId', v_mobile || '@c.us',
          'text', public.format_outbound_message('whatsapp',null,'Your verification code is '||v_otp||'. Do not share this code.','platform')
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-API-Key', v_wa_key
        ),
        timeout_milliseconds := 5000
      ) into v_wa_request;
    exception when others then
      v_wa_request := null;
    end;
  end if;

  perform public.record_auth_otp_delivery_request(
    encode(extensions.digest(v_phone, 'sha256'), 'hex'),
    right(v_mobile, 4),
    v_sms_request,
    v_wa_request,
    case when v_sms_request is not null then 'queued' else 'failed' end,
    case when v_wa_request is not null then 'queued' else 'failed' end
  );
  return event;
exception when others then
  return event;
end;
$$;

-- Fixed transactional copy; identity is added independently of template content.
with revised(template_key,sms_body,whatsapp_body) as (values
  (E'credit-score-band-change',
    E'Your credit score with {{company_name}} is now {{score}}/10 ({{band}}). {{reason}} {{consequence}} View your account statement: {{statement_url}}',
    E'*Credit profile update*\n\nYour credit score with {{company_name}} is now *{{score}}/10 ({{band}})*.\n\n*Reason*\n{{reason}}\n\n*Next step*\n{{consequence}}\n\nView your account statement:\n{{statement_url}}'),
  (E'payment-due',
    E'Amount currently due: KES {{outstanding_balance}}. Oldest unpaid due date: {{due_date}}. Please arrange payment by the due date. If you have already paid or need help, please contact {{store_name}}. View your account statement: {{statement_url}}',
    E'*Payment reminder*\n\nAmount currently due: *KES {{outstanding_balance}}*.\nOldest unpaid due date: {{due_date}}.\n\nPlease arrange payment by the due date. If you have already paid or need help, please contact {{store_name}}.\n\nView your account statement:\n{{statement_url}}'),
  (E'payment-overdue-3',
    E'Amount currently due: KES {{outstanding_balance}}. Oldest unpaid due date: {{due_date}}. If you have already paid, please contact {{store_name}} so your account can be updated. View your account statement: {{statement_url}}',
    E'*Payment reminder*\n\nAmount currently due: *KES {{outstanding_balance}}*.\nOldest unpaid due date: {{due_date}}.\n\nIf you have already paid, please contact {{store_name}} so your account can be updated.\n\nView your account statement:\n{{statement_url}}'),
  (E'payment-overdue-7',
    E'Amount currently due: KES {{outstanding_balance}}. Oldest unpaid due date: {{due_date}}. Please arrange payment or contact {{store_name}} if you need help. View your account statement: {{statement_url}}',
    E'*Payment reminder*\n\nAmount currently due: *KES {{outstanding_balance}}*.\nOldest unpaid due date: {{due_date}}.\n\nPlease arrange payment or contact {{store_name}} if you need help.\n\nView your account statement:\n{{statement_url}}'),
  (E'payment-overdue-14',
    E'Amount currently due: KES {{outstanding_balance}}. Oldest unpaid due date: {{due_date}}. Please contact {{store_name}} to confirm payment or discuss the next step. View your account statement: {{statement_url}}',
    E'*Payment reminder*\n\nAmount currently due: *KES {{outstanding_balance}}*.\nOldest unpaid due date: {{due_date}}.\n\nPlease contact {{store_name}} to confirm payment or discuss the next step.\n\nView your account statement:\n{{statement_url}}'),
  (E'manual-receipt',
    E'Receipt {{document_number}}. Total: KES {{total}}. View your receipt: {{document_url}}',
    E'*Receipt {{document_number}}*\n\nTotal: *KES {{total}}*.\n\nView or print your receipt:\n{{document_url}}'),
  (E'manual-invoice',
    E'Invoice {{document_number}}. Total: KES {{total}}. Balance due: KES {{balance}}. View your invoice: {{document_url}}',
    E'*Invoice {{document_number}}*\n\nTotal: *KES {{total}}*.\nBalance due: *KES {{balance}}*.\n\nView or print your invoice:\n{{document_url}}'),
  (E'manual-proforma',
    E'Pro forma invoice {{document_number}}. Total: KES {{total}}.{{validity_line}} View your pro forma invoice: {{document_url}}',
    E'*Pro forma invoice {{document_number}}*\n\nTotal: *KES {{total}}*.{{validity_line}}\n\nView or print your pro forma invoice:\n{{document_url}}'),
  (E'manual-purchase-order',
    E'Purchase order {{document_number}}. Total: KES {{total}}. View your purchase order: {{document_url}}',
    E'*Purchase order {{document_number}}*\n\nTotal: *KES {{total}}*.\n\nView or print your purchase order:\n{{document_url}}'),
  (E'manual-document-company-copy',
    E'Company copy of {{document_label}} {{document_number}} for {{party_name}}. View document: {{document_url}}',
    E'*Company copy*\n\nCompany copy of {{document_label}} {{document_number}} for {{party_name}}.\n\nView document:\n{{document_url}}'),
  (E'manual-customer-statement',
    E'Account statement for {{party_name}}. {{account_summary}} View your statement: {{statement_url}} Link expires on {{expires_at}}.',
    E'*Your account statement*\n\nAccount: {{party_name}}\n{{account_summary}}\n\nView your statement:\n{{statement_url}}\n\nThis secure link expires on {{expires_at}}.'),
  (E'team-invitation',
    E'{{inviter_name}} has invited you to join {{company_name}}. Your role: {{role_name}}. Sign in using this phone number at {{app_url}}/login by {{expires_at}}. Do not register a new company.',
    E'*Team invitation*\n\n{{inviter_name}} has invited you to join {{company_name}}.\nYour role: *{{role_name}}*.\n\nSign in using this phone number by {{expires_at}}:\n{{app_url}}/login\n\nDo not register a new company; your access will be added automatically.'),
  (E'team-invitation-primary',
    E'{{inviter_name}} has invited {{member_name}} ({{member_phone}}) to join the team. Role: {{role_name}}.',
    E'*Team invitation created*\n\n{{inviter_name}} has invited {{member_name}} ({{member_phone}}) to join the team.\nRole: *{{role_name}}*.'),
  (E'team-invitation-accepted-primary',
    E'{{member_name}} has accepted the invitation and joined the team. Role: {{role_name}}.',
    E'*Team member joined*\n\n{{member_name}} has accepted the invitation and joined the team.\nRole: *{{role_name}}*.'),
  (E'fulfillment-initial',
    E'We have received order {{order_code}} and are preparing it. Track your order: {{tracking_url}} {{pin_label}}: {{pin}}.',
    E'*Order {{order_code}} received*\n\nWe have received your order and are preparing it.\n\nTrack your order:\n{{tracking_url}}\n\n{{pin_label}}: *{{pin}}*'),
  (E'fulfillment-ready',
    E'Order {{order_code}} is ready for {{ready_action}}.',
    E'*Order {{order_code}} ready*\n\nYour order is ready for {{ready_action}}.'),
  (E'fulfillment-in-transit',
    E'Your order {{order_code}} is on the way.',
    E'*Order {{order_code}} on the way*\n\nYour order is on the way.'),
  (E'fulfillment-failed',
    E'We could not complete fulfillment of order {{order_code}}. Please contact {{company_name}} to discuss the next step.',
    E'*Order {{order_code}} needs attention*\n\nWe could not complete fulfillment of your order. Please contact {{company_name}} to discuss the next step.'),
  (E'fulfillment-fulfilled',
    E'Order {{order_code}} is complete. Thank you for shopping with us.',
    E'*Order {{order_code}} complete*\n\nYour order is complete. Thank you for shopping with us.'),
  (E'platform-update',
    E'Here is an update about your {{tier}} account.',
    E'*Account update*\n\nHere is an update about your {{tier}} account.')
)
update public.message_templates mt set sms_body=r.sms_body,whatsapp_body=r.whatsapp_body,
  version=mt.version+1,updated_at=now()
from revised r where mt.company_id is null and mt.is_system and mt.template_key=r.template_key
  and (mt.template_key<>'platform-update' or mt.sms_body='Hi {{merchant_name}}, here is an update about your {{tier}} Dukarun account.');
