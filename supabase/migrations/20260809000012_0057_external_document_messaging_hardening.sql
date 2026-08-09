-- Follow-up hardening for controlled document delivery.
--
-- Repair the already-deployed WhatsApp templates and queued bodies, release
-- quota when policy blocks a claimed-but-unsent row, keep payment metadata out
-- of bearer-link snapshots, and serialize the duplicate-send cooldown check.

with fixed(template_key, whatsapp_body) as (
  values
    ('manual-receipt', E'*Receipt {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nView or print: {{document_url}}'),
    ('manual-invoice', E'*Invoice {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nBalance: KES {{balance}}\nView or print: {{document_url}}'),
    ('manual-proforma', E'*Proforma {{document_number}}*\n\n{{company_name}}\nTotal: KES {{total}}\nValid until: {{valid_until}}\nView or print: {{document_url}}'),
    ('manual-purchase-order', E'*Purchase order {{document_number}}*\n\nFrom: {{company_name}}\nTotal: KES {{total}}\nView or print: {{document_url}}'),
    ('manual-document-company-copy', E'*Company copy*\n\n{{document_label}} {{document_number}} was sent to {{party_name}}.\nView: {{document_url}}')
)
update public.message_templates mt
set whatsapp_body = fixed.whatsapp_body,
    version = mt.version + 1,
    updated_at = now()
from fixed
where mt.company_id is null
  and mt.template_key = fixed.template_key
  and mt.whatsapp_body is distinct from fixed.whatsapp_body;

-- Bodies are rendered when queued, so template repair alone does not fix
-- controlled WhatsApp deliveries that are already waiting in the outbox.
update public.outbox o
set body = pg_catalog.replace(o.body, E'\\n', E'\n'),
    template_version = mt.version
from public.message_templates mt
where o.status = 'pending'
  and o.channel = 'whatsapp'
  and o.source in ('manual_document', 'manual_document_copy')
  and mt.company_id is null
  and mt.template_key = o.template_key
  and position(E'\\n' in o.body) > 0;

-- Existing links must receive the same privacy repair as newly issued links.
update public.external_document_links
set snapshot = snapshot - 'payments'
where snapshot ? 'payments';

create or replace function public.prepare_controlled_outbox_delivery(p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_row public.outbox%rowtype;v_allowed boolean;
begin
  select * into v_row from public.outbox where id=p_outbox_id for update;
  if not found or v_row.status<>'pending' then return false; end if;
  if v_row.source not in ('reminder','manual_document','manual_document_copy') then return true; end if;
  v_allowed:=public.external_messaging_allowed(v_row.company_id,v_row.source='reminder');
  if v_allowed then return true; end if;
  -- This function runs before the provider call. A worker claim increments
  -- attempts, but it is not evidence that the current delivery was accepted.
  perform public.finalize_message_quota(v_row.id,false);
  update public.outbox set status='cancelled',error='external_messaging_disabled' where id=v_row.id;
  return false;
end;
$$;
revoke execute on function public.prepare_controlled_outbox_delivery(uuid) from public,anon,authenticated;
grant execute on function public.prepare_controlled_outbox_delivery(uuid) to service_role;

create or replace function public.send_external_document(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;v_token text;v_url text;v_origin text;v_link uuid;v_outbox uuid;v_copy_outbox uuid;
  v_message jsonb;v_copy jsonb;v_copy_error text;v_snapshot jsonb;
begin
  v_context:=public.external_document_context(p_document_type,p_subject_id,p_channel,p_include_company_copy);

  -- Serialize identical sends before checking the cooldown. Without this lock,
  -- concurrent requests can both observe no recent row and queue duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_context->>'company_id')||':'||p_document_type||':'||p_subject_id::text||':'||p_channel,0));
  if exists(select 1 from public.outbox o where o.company_id=(v_context->>'company_id')::uuid
    and o.document_type=p_document_type and o.document_subject_id=p_subject_id
    and o.document_copy_role='primary' and o.channel=p_channel and o.status in ('pending','sent')
    and o.created_at>now()-interval '1 minute') then raise exception 'document_send_cooldown'; end if;

  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
    from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then raise exception 'storefront_public_url_missing'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');v_url:=v_origin||'/document/'||v_token;
  v_snapshot:=v_context-array['company_id','party_id','recipient','company_copy_recipient',
    'channel','include_company_copy','subject_id','payments'];
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

comment on function public.send_external_document(text,uuid,text,boolean) is
  'Queues a fixed, record-derived business document with serialized duplicate protection. It accepts no recipient or message body.';
