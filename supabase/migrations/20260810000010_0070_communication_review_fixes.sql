-- Follow-up fixes from communications review: durable review state, atomic
-- campaign finalization, tenant-safe statement attribution, and honest totals.

alter table public.message_campaigns add column reviewed_at timestamptz;

create or replace function public.platform_save_campaign_draft(
  p_name text,p_channel text,p_title text,p_body text,p_audience text default 'all',
  p_tier_id uuid default null,p_subscription_status text default null,p_company_ids uuid[] default null,
  p_cta_label text default null,p_cta_link text default null,p_campaign_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  perform public.validate_platform_campaign(p_name,p_channel,p_title,p_body,p_audience,p_tier_id,
    p_subscription_status,p_company_ids,p_cta_label,p_cta_link);
  if p_campaign_id is null then
    insert into public.message_campaigns(scope,name,audience,audience_config,channel,title,body,status,created_by,cta_label,cta_link)
    values('platform',trim(p_name),p_audience,jsonb_build_object('tier_id',p_tier_id,'subscription_status',p_subscription_status,'company_ids',p_company_ids),
      p_channel,trim(p_title),trim(p_body),'draft',auth.uid(),nullif(trim(coalesce(p_cta_label,'')),''),p_cta_link) returning id into v_id;
  else
    update public.message_campaigns set name=trim(p_name),audience=p_audience,
      audience_config=jsonb_build_object('tier_id',p_tier_id,'subscription_status',p_subscription_status,'company_ids',p_company_ids),
      channel=p_channel,title=trim(p_title),body=trim(p_body),cta_label=nullif(trim(coalesce(p_cta_label,'')),''),cta_link=p_cta_link,
      reviewed_at=null,updated_at=now()
    where id=p_campaign_id and scope='platform' and status='draft' returning id into v_id;
    if v_id is null then raise exception 'editable_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.platform_review_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.message_campaigns%rowtype;v_company_ids uuid[];v_preview jsonb;
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
  update public.message_campaigns set reviewed_at=now() where id=v_campaign.id;
  return v_preview;
end;
$$;
revoke execute on function public.platform_review_campaign(uuid) from public,anon;
grant execute on function public.platform_review_campaign(uuid) to authenticated,service_role;

create or replace function public.platform_launch_campaign(p_campaign_id uuid,p_scheduled_for timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.message_campaigns%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_campaign from public.message_campaigns
  where id=p_campaign_id and scope='platform' and status='draft' for update;
  if not found then raise exception 'editable_draft_not_found'; end if;
  if v_campaign.reviewed_at is null then raise exception 'campaign_review_required'; end if;
  if p_scheduled_for is not null and p_scheduled_for>now() then
    update public.message_campaigns set status='scheduled',scheduled_for=p_scheduled_for,updated_at=now()
    where id=v_campaign.id;
    return jsonb_build_object('campaign_id',v_campaign.id,'scheduled_for',p_scheduled_for);
  end if;
  return public.dispatch_platform_campaign(v_campaign.id);
end;
$$;

create or replace function public.platform_send_campaign(
  p_name text,p_channel text,p_title text,p_body text,p_audience text default 'all',
  p_tier_id uuid default null,p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  v_id:=public.platform_save_campaign_draft(p_name,p_channel,p_title,p_body,p_audience,p_tier_id,p_subscription_status,p_company_ids,null,null,null);
  perform public.platform_review_campaign(v_id);
  return public.platform_launch_campaign(v_id,null);
end;
$$;

create or replace function public.finalize_campaign_recipient(p_recipient_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare v_campaign_id uuid;v_sent int;v_failed int;v_pending boolean;
begin
  if p_status not in ('sent','failed') then raise exception 'invalid_recipient_status'; end if;
  update public.campaign_recipients set status=p_status where id=p_recipient_id
  returning campaign_id into v_campaign_id;
  if v_campaign_id is null then raise exception 'campaign_recipient_not_found'; end if;
  perform 1 from public.message_campaigns where id=v_campaign_id for update;
  select count(*) filter(where status='sent'),count(*) filter(where status='failed'),
    bool_or(status in ('queued','eligible')) into v_sent,v_failed,v_pending
  from public.campaign_recipients where campaign_id=v_campaign_id;
  update public.message_campaigns set sent_count=v_sent,failed_count=v_failed,
    status=case when coalesce(v_pending,false) then 'sending' when v_failed=0 then 'completed'
      when v_sent>0 then 'partial' else 'failed' end,updated_at=now()
  where id=v_campaign_id;
end;
$$;
revoke execute on function public.finalize_campaign_recipient(uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_campaign_recipient(uuid,text) to service_role;

create or replace function public.attach_statement_link_to_outbox()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_token text;
begin
  if new.source='reminder' and new.customer_statement_link_id is null then
    v_token:=substring(new.body from '/statement/([0-9a-fA-F]{64})');
    if v_token is not null then
      select id into new.customer_statement_link_id from public.customer_statement_links
      where company_id=new.company_id and token_hash=encode(extensions.digest(v_token,'sha256'),'hex') limit 1;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.platform_external_communication_metrics(p_since timestamptz default now()-interval '30 days')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  with deliveries as (
    select status,external_document_link_id,customer_statement_link_id
    from public.outbox where created_at>=p_since
  ), delivery_metrics as (
    select count(*) filter(where status='sent') provider_accepted,
      count(*) filter(where status='failed') failed,count(*) filter(where status='pending') pending
    from deliveries
  ), tracked_links as (
    select 'document' kind,l.id,l.open_count from public.external_document_links l
    where exists(select 1 from deliveries d where d.external_document_link_id=l.id)
    union all
    select 'statement',s.id,s.open_count from public.customer_statement_links s
    where exists(select 1 from deliveries d where d.customer_statement_link_id=s.id)
  ), link_metrics as (
    select count(*) filter(where open_count>0) documents_opened,coalesce(sum(open_count),0) link_opens
    from tracked_links
  )
  select jsonb_build_object('provider_accepted',d.provider_accepted,'failed',d.failed,'pending',d.pending,
    'documents_opened',l.documents_opened,'link_opens',l.link_opens) into v_result
  from delivery_metrics d cross join link_metrics l;
  return v_result;
end;
$$;
