-- Platform campaign lifecycle, first-party engagement metrics, and secure-link opens.

alter table public.message_campaigns
  add column scheduled_for timestamptz,
  add column updated_at timestamptz not null default now(),
  add column cta_label text,
  add column cta_link text;
alter table public.message_campaigns drop constraint message_campaigns_status_check;
alter table public.message_campaigns add constraint message_campaigns_status_check
  check (status in ('draft','scheduled','queued','sending','paused','completed','partial','failed','cancelled'));
alter table public.message_campaigns add constraint message_campaigns_content_check
  check (char_length(name) between 1 and 120 and char_length(body) between 1 and 2000
    and (title is null or char_length(title) between 1 and 120)
    and (cta_label is null or char_length(cta_label) between 1 and 40));

alter table public.campaign_recipients add column rendered_title text;
alter table public.notifications
  add column campaign_id uuid references public.message_campaigns(id) on delete set null,
  add column campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  add column action_label text,
  add column clicked_at timestamptz;
create index notifications_campaign_idx on public.notifications(campaign_id) where campaign_id is not null;

alter table public.external_document_links
  add column open_count integer not null default 0 check (open_count >= 0),
  add column first_opened_at timestamptz,
  add column last_opened_at timestamptz,
  add column audience_role text not null default 'primary'
    check (audience_role in ('primary','company_copy','legacy_shared'));
alter table public.customer_statement_links
  add column open_count integer not null default 0 check (open_count >= 0),
  add column first_opened_at timestamptz,
  add column last_opened_at timestamptz;

update public.external_document_links l set audience_role='legacy_shared'
where exists(select 1 from public.outbox o where o.external_document_link_id=l.id and o.document_copy_role='company');

create policy "company document link metrics readable" on public.external_document_links for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
create policy "company statement link metrics readable" on public.customer_statement_links for select
  using (company_id=(select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.external_document_links,public.customer_statement_links to authenticated;

create or replace function public.validate_platform_campaign(
  p_name text,p_channel text,p_title text,p_body text,p_audience text,
  p_tier_id uuid,p_subscription_status text,p_company_ids uuid[],p_cta_label text,p_cta_link text
) returns void language plpgsql immutable set search_path='' as $$
begin
  if char_length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_campaign_name'; end if;
  if p_channel not in ('in_app','sms','whatsapp') then raise exception 'invalid_channel'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'invalid_title'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'invalid_body'; end if;
  if p_audience not in ('all','tier','subscription_status','selected') then raise exception 'invalid_audience'; end if;
  if p_audience='tier' and p_tier_id is null then raise exception 'tier_required'; end if;
  if p_audience='subscription_status' and coalesce(p_subscription_status,'') not in ('trial','active','expired','cancelled') then raise exception 'subscription_status_required'; end if;
  if p_audience='selected' and coalesce(cardinality(p_company_ids),0)=0 then raise exception 'companies_required'; end if;
  if p_channel<>'in_app' and (p_cta_label is not null or p_cta_link is not null) then raise exception 'cta_in_app_only'; end if;
  if (p_cta_label is null)<>(p_cta_link is null) then raise exception 'cta_label_and_link_required'; end if;
  if p_cta_label is not null and char_length(trim(p_cta_label)) not between 1 and 40 then raise exception 'invalid_cta_label'; end if;
  if p_cta_link is not null and (char_length(p_cta_link)>500 or p_cta_link!~'^/[^/]' or p_cta_link~E'[\\\\[:cntrl:]]' or p_cta_link~'^[a-zA-Z][a-zA-Z0-9+.-]*:') then
    raise exception 'invalid_cta_link';
  end if;
end;
$$;
revoke execute on function public.validate_platform_campaign(text,text,text,text,text,uuid,text,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.validate_platform_campaign(text,text,text,text,text,uuid,text,uuid[],text,text) to service_role;

create or replace function public.platform_campaign_preview(
  p_channel text,p_audience text default 'all',p_tier_id uuid default null,
  p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total int;v_eligible int;v_missing_admin int;v_missing_phone int;v_sample jsonb;
begin
  perform public.assert_platform_admin();
  if p_channel not in ('in_app','sms','whatsapp') then raise exception 'invalid_channel'; end if;
  with targets as (
    select c.id,c.name,t.name tier_name,c.subscription_status,c.subscription_expires_at,coalesce(
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join public.roles r on r.id=m.role_id
       join auth.users u on u.id=m.user_id where m.company_id=c.id and m.authorization_status='approved'
       and 'ManageTeam'=any(r.permissions) order by m.created_at limit 1),
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join auth.users u on u.id=m.user_id
       where m.company_id=c.id and m.authorization_status='approved' order by m.created_at limit 1)) admin
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id
    where c.status='approved' and (p_audience='all' or (p_audience='tier' and c.subscription_tier_id=p_tier_id)
      or (p_audience='subscription_status' and c.subscription_status=p_subscription_status)
      or (p_audience='selected' and c.id=any(p_company_ids)))
  ) select count(*),count(*) filter(where admin is not null and (p_channel='in_app' or admin->>'phone' is not null)),
    count(*) filter(where admin is null),count(*) filter(where admin is not null and p_channel<>'in_app' and admin->>'phone' is null),
    (jsonb_agg(jsonb_build_object('merchant_name',name,'tier',coalesce(tier_name,'No tier'),
      'subscription_state',coalesce(subscription_status,'pending'),'subscription_end_date',
      coalesce(to_char(subscription_expires_at at time zone 'Africa/Nairobi','DD Mon YYYY'),'Not set')) order by name)
      filter(where admin is not null and (p_channel='in_app' or admin->>'phone' is not null)))->0
  into v_total,v_eligible,v_missing_admin,v_missing_phone,v_sample from targets;
  return jsonb_build_object('total',v_total,'eligible',v_eligible,'skipped',v_total-v_eligible,
    'missing_admin',v_missing_admin,'missing_phone',v_missing_phone,'sample',v_sample);
end;
$$;

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
      channel=p_channel,title=trim(p_title),body=trim(p_body),cta_label=nullif(trim(coalesce(p_cta_label,'')),''),cta_link=p_cta_link,updated_at=now()
    where id=p_campaign_id and scope='platform' and status='draft' returning id into v_id;
    if v_id is null then raise exception 'editable_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.platform_save_campaign_draft(text,text,text,text,text,uuid,text,uuid[],text,text,uuid) from public,anon;
grant execute on function public.platform_save_campaign_draft(text,text,text,text,text,uuid,text,uuid[],text,text,uuid) to authenticated,service_role;

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
    select c.id company_id,c.name,t.name tier_name,c.subscription_status,c.subscription_expires_at,coalesce(
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join public.roles r on r.id=m.role_id
       join auth.users u on u.id=m.user_id where m.company_id=c.id and m.authorization_status='approved'
       and 'ManageTeam'=any(r.permissions) order by m.created_at limit 1),
      (select jsonb_build_object('user_id',u.id,'phone',u.phone) from public.company_memberships m join auth.users u on u.id=m.user_id
       where m.company_id=c.id and m.authorization_status='approved' order by m.created_at limit 1)) admin
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id where c.status='approved'
      and (v_campaign.audience='all' or (v_campaign.audience='tier' and c.subscription_tier_id=(v_campaign.audience_config->>'tier_id')::uuid)
        or (v_campaign.audience='subscription_status' and c.subscription_status=v_campaign.audience_config->>'subscription_status')
        or (v_campaign.audience='selected' and c.id=any(array(select jsonb_array_elements_text(v_campaign.audience_config->'company_ids'))::uuid[])))
  loop
    v_values:=jsonb_build_object('merchant_name',v_target.name,'tier',coalesce(v_target.tier_name,'No tier'),
      'subscription_state',coalesce(v_target.subscription_status,'pending'),'subscription_end_date',
      coalesce(to_char(v_target.subscription_expires_at at time zone 'Africa/Nairobi','DD Mon YYYY'),'Not set'),'message',v_campaign.body);
    v_title:=public.render_message_template(v_campaign.title,v_values);v_body:=public.render_message_template(v_campaign.body,v_values);
    if v_target.admin is null or (v_campaign.channel<>'in_app' and v_target.admin->>'phone' is null) then
      insert into public.campaign_recipients(campaign_id,company_id,user_id,rendered_title,rendered_body,status,skip_reason)
      values(v_campaign.id,v_target.company_id,(v_target.admin->>'user_id')::uuid,v_title,v_body,'skipped',
        case when v_target.admin is null then 'missing_admin' else 'missing_phone' end);v_skipped:=v_skipped+1;
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
        insert into public.outbox(company_id,channel,recipient,subject,body,scheduled_after,campaign_id,campaign_recipient_id,source,quota_state)
        values(v_target.company_id,v_campaign.channel,v_target.admin->>'phone',v_title,v_body,v_scheduled,v_campaign.id,v_recipient,'platform','released') returning id into v_outbox;
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
revoke execute on function public.dispatch_platform_campaign(uuid) from public,anon,authenticated;
grant execute on function public.dispatch_platform_campaign(uuid) to service_role;

create or replace function public.platform_launch_campaign(p_campaign_id uuid,p_scheduled_for timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  if p_scheduled_for is not null and p_scheduled_for>now() then
    update public.message_campaigns set status='scheduled',scheduled_for=p_scheduled_for,updated_at=now()
    where id=p_campaign_id and scope='platform' and status='draft';
    if not found then raise exception 'editable_draft_not_found'; end if;
    return jsonb_build_object('campaign_id',p_campaign_id,'scheduled_for',p_scheduled_for);
  end if;
  return public.dispatch_platform_campaign(p_campaign_id);
end;
$$;
revoke execute on function public.platform_launch_campaign(uuid,timestamptz) from public,anon;
grant execute on function public.platform_launch_campaign(uuid,timestamptz) to authenticated,service_role;

create or replace function public.dispatch_due_platform_campaigns()
returns integer language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_count integer:=0;
begin
  for v_id in select id from public.message_campaigns where scope='platform' and status='scheduled' and scheduled_for<=now() order by scheduled_for for update skip locked
  loop perform public.dispatch_platform_campaign(v_id);v_count:=v_count+1;end loop;
  return v_count;
end;
$$;
revoke execute on function public.dispatch_due_platform_campaigns() from public,anon,authenticated;
grant execute on function public.dispatch_due_platform_campaigns() to service_role;
select cron.schedule('platform-campaign-dispatch','* * * * *',$$select public.dispatch_due_platform_campaigns()$$);

create or replace function public.platform_cancel_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.message_campaigns set status='cancelled',updated_at=now()
  where id=p_campaign_id and scope='platform' and status in ('draft','scheduled');
  return found;
end;
$$;
revoke execute on function public.platform_cancel_campaign(uuid) from public,anon;
grant execute on function public.platform_cancel_campaign(uuid) to authenticated,service_role;

create or replace function public.platform_duplicate_campaign(p_campaign_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  insert into public.message_campaigns(scope,name,audience,audience_config,channel,title,body,status,created_by,cta_label,cta_link)
  select 'platform',left(name||' copy',120),audience,audience_config,channel,title,body,'draft',auth.uid(),cta_label,cta_link
  from public.message_campaigns where id=p_campaign_id and scope='platform' returning id into v_id;
  if v_id is null then raise exception 'campaign_not_found'; end if;return v_id;
end;
$$;
revoke execute on function public.platform_duplicate_campaign(uuid) from public,anon;
grant execute on function public.platform_duplicate_campaign(uuid) to authenticated,service_role;

create or replace function public.platform_campaign_metrics(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object('targeted',mc.recipient_count,'skipped',mc.skipped_count,'queued',count(*) filter(where cr.status='queued'),
    'provider_accepted',count(*) filter(where cr.status='sent' and mc.channel<>'in_app'),'failed',count(*) filter(where cr.status='failed'),
    'read',count(*) filter(where n.read_at is not null),'clicked',count(*) filter(where n.clicked_at is not null))
  into v_result from public.message_campaigns mc left join public.campaign_recipients cr on cr.campaign_id=mc.id
  left join public.notifications n on n.campaign_recipient_id=cr.id where mc.id=p_campaign_id and mc.scope='platform' group by mc.id;
  if v_result is null then raise exception 'campaign_not_found'; end if;return v_result;
end;
$$;
revoke execute on function public.platform_campaign_metrics(uuid) from public,anon;
grant execute on function public.platform_campaign_metrics(uuid) to authenticated,service_role;

create or replace function public.record_notification_click(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.notifications set clicked_at=coalesce(clicked_at,now()),read_at=coalesce(read_at,now())
  where id=p_notification_id and link is not null and (user_id=auth.uid() or (user_id is null and company_id=public.current_company_id()));
  return found;
end;
$$;
revoke execute on function public.record_notification_click(uuid) from public,anon;
grant execute on function public.record_notification_click(uuid) to authenticated;

-- Compatibility: immediate send now uses draft + launch lifecycle.
create or replace function public.platform_send_campaign(
  p_name text,p_channel text,p_title text,p_body text,p_audience text default 'all',
  p_tier_id uuid default null,p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  v_id:=public.platform_save_campaign_draft(p_name,p_channel,p_title,p_body,p_audience,p_tier_id,p_subscription_status,p_company_ids,null,null,null);
  return public.platform_launch_campaign(v_id,null);
end;
$$;

create or replace function public.public_external_document(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_link public.external_document_links%rowtype;
begin
  update public.external_document_links set open_count=open_count+1,
    first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now()
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now()
  returning * into v_link;
  if not found then return null; end if;
  return v_link.snapshot||jsonb_build_object('expires_at',v_link.expires_at);
end;
$$;

create or replace function public.public_customer_statement(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_link record;v_result jsonb;v_id uuid;
begin
  update public.customer_statement_links set open_count=open_count+1,
    first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now()
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now()
  returning id into v_id;
  if v_id is null then return null; end if;
  select l.*,c.first_name,co.name store_name,co.logo_path,co.public_whatsapp_number,co.customer_payment_instructions
  into v_link from public.customer_statement_links l join public.customers c on c.id=l.customer_id
  join public.companies co on co.id=l.company_id where l.id=v_id;
  with balances as (
    select o.code,(o.completed_at at time zone 'Africa/Nairobi')::date sale_date,o.credit_due_at,
      greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='settled'),0),0)::bigint balance
    from public.orders o where o.company_id=v_link.company_id and o.customer_id=v_link.customer_id and o.is_credit_sale and o.status='completed'
  ) select jsonb_build_object('store_name',v_link.store_name,'logo_path',v_link.logo_path,'whatsapp_number',v_link.public_whatsapp_number,
    'payment_instructions',v_link.customer_payment_instructions,'customer_first_name',v_link.first_name,'expires_at',v_link.expires_at,
    'outstanding_total',coalesce(sum(balance),0),'orders',coalesce(jsonb_agg(jsonb_build_object('code',code,'sale_date',sale_date,
      'due_date',credit_due_at,'balance',balance) order by credit_due_at) filter(where balance>0),'[]'::jsonb))
  into v_result from balances where balance>0;return v_result;
end;
$$;

create or replace function public.platform_external_communication_metrics(p_since timestamptz default now()-interval '30 days')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object('provider_accepted',count(*) filter(where o.status='sent'),'failed',count(*) filter(where o.status='failed'),
    'pending',count(*) filter(where o.status='pending'),'documents_opened',count(*) filter(where l.open_count>0),
    'document_opens',coalesce(sum(l.open_count),0)) into v_result
  from public.outbox o left join public.external_document_links l on l.id=o.external_document_link_id
  where o.created_at>=p_since and o.source in ('platform','reminder','manual_document');return v_result;
end;
$$;
revoke execute on function public.platform_external_communication_metrics(timestamptz) from public,anon;
grant execute on function public.platform_external_communication_metrics(timestamptz) to authenticated,service_role;

-- New document sends use a distinct secure link for a company copy, preventing
-- staff opens from inflating primary-recipient engagement.
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
    v_context->>'recipient',v_message->>'body',null,p_bypass_quiet_hours);
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
        v_context->>'company_copy_recipient',v_copy->>'body',null,p_bypass_quiet_hours);
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
