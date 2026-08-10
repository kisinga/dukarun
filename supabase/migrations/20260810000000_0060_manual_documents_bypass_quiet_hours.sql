-- A merchant may explicitly dispatch a transactional document immediately.
-- Quiet hours remain the default; quota reservation and controlled-delivery
-- policy apply in either mode.

drop function if exists public.queue_manual_document_message(uuid,text,text,text,text);
create or replace function public.queue_manual_document_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null,
  p_bypass_quiet_hours boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := public.queue_message(p_company_id,p_channel,p_recipient,p_body,p_subject);
  if p_bypass_quiet_hours then
    update public.outbox set scheduled_after=now() where id=v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.queue_manual_document_message(uuid,text,text,text,text,boolean)
  from public,anon,authenticated;
grant execute on function public.queue_manual_document_message(uuid,text,text,text,text,boolean)
  to service_role;

comment on function public.queue_manual_document_message(uuid,text,text,text,text,boolean) is
  'Queues a merchant-triggered document with an explicit quiet-hours override while retaining quota reservation.';

drop function public.send_external_document(text,uuid,text,boolean);
create function public.send_external_document(
  p_document_type text,p_subject_id uuid,p_channel text,p_include_company_copy boolean default false,
  p_bypass_quiet_hours boolean default false
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;v_token text;v_url text;v_origin text;v_link uuid;v_outbox uuid;v_copy_outbox uuid;
  v_message jsonb;v_copy jsonb;v_copy_error text;v_snapshot jsonb;
begin
  v_context:=public.external_document_context(p_document_type,p_subject_id,p_channel,p_include_company_copy);

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
  v_outbox:=public.queue_manual_document_message((v_context->>'company_id')::uuid,p_channel,
    v_context->>'recipient',v_message->>'body',null,p_bypass_quiet_hours);
  update public.outbox set source='manual_document',customer_id=(v_context->>'party_id')::uuid,
    template_key=v_message->>'template_key',template_version=(v_message->>'template_version')::integer,
    external_document_link_id=v_link,document_type=p_document_type,
    document_subject_id=p_subject_id,document_copy_role='primary',
    max_attempts=case when p_channel='whatsapp' then 2 else 5 end where id=v_outbox;
  if p_include_company_copy then
    begin
      v_copy:=public.render_external_document_message(v_context,v_url,true);
      v_copy_outbox:=public.queue_manual_document_message((v_context->>'company_id')::uuid,'whatsapp',
        v_context->>'company_copy_recipient',v_copy->>'body',null,p_bypass_quiet_hours);
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
revoke execute on function public.send_external_document(text,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.send_external_document(text,uuid,text,boolean,boolean) to authenticated;

comment on function public.send_external_document(text,uuid,text,boolean,boolean) is
  'Queues a fixed, record-derived business document with an explicit quiet-hours override and serialized duplicate protection.';
