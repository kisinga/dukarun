-- Restrict link metrics, reject non-admin campaign recipients, and support
-- explicit document-link revocation.

drop policy "company document link metrics readable" on public.external_document_links;
create policy "company document link metrics readable"
  on public.external_document_links for select
  using (
    (select public.is_platform_admin())
    or (
      company_id = (select public.current_company_id())
      and (
        (select public.current_user_has_permission('ViewFinancials'))
        or (select public.current_user_has_permission('ManageCommunications'))
      )
    )
  );

drop policy "company statement link metrics readable" on public.customer_statement_links;
create policy "company statement link metrics readable"
  on public.customer_statement_links for select
  using (
    (select public.is_platform_admin())
    or (
      company_id = (select public.current_company_id())
      and (
        (select public.current_user_has_permission('ViewFinancials'))
        or (select public.current_user_has_permission('ManageCommunications'))
      )
    )
  );

alter table public.external_document_links add column revoked_at timestamptz;

create or replace function public.public_external_document(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_link public.external_document_links%rowtype;
begin
  update public.external_document_links set open_count=open_count+1,
    first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now()
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and revoked_at is null and expires_at>now()
  returning * into v_link;
  if not found then return null; end if;
  return v_link.snapshot||jsonb_build_object('expires_at',v_link.expires_at);
end;
$$;

create or replace function public.resolve_platform_campaign_recipient(p_company_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('user_id',u.id,'phone',u.phone)
  from public.companies c
  join public.company_memberships m on m.company_id=c.id
  join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  join auth.users u on u.id=m.user_id
  where c.id=p_company_id and m.authorization_status='approved'
    and 'ManageTeam'=any(r.permissions)
  order by (m.user_id=c.primary_contact_user_id) desc,m.created_at
  limit 1;
$$;
revoke execute on function public.resolve_platform_campaign_recipient(uuid)
  from public,anon,authenticated;
grant execute on function public.resolve_platform_campaign_recipient(uuid) to service_role;

create or replace function public.platform_campaign_preview(
  p_channel text,p_audience text default 'all',p_tier_id uuid default null,
  p_subscription_status text default null,p_company_ids uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total int;v_eligible int;v_missing_admin int;v_missing_phone int;v_sample jsonb;
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
revoke execute on function public.platform_campaign_preview(text,text,uuid,text,uuid[]) from public,anon;
grant execute on function public.platform_campaign_preview(text,text,uuid,text,uuid[]) to authenticated,service_role;

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
