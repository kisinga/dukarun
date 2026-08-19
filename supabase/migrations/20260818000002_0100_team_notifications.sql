-- Durable team invitation notifications and primary-contact delivery preferences.

alter table public.team_invitations
  add column notification_version integer not null default 1 check (notification_version > 0),
  add column last_notified_at timestamptz,
  add column last_delivery_error text check (
    last_delivery_error is null or last_delivery_error in (
      'quota_exhausted','provider_not_configured','provider_rejected',
      'max_attempts_exceeded','template_unavailable','delivery_failed'
    )
  );

-- The preference JSON is written only through the validated ManageTeam RPC below.
revoke update(notification_category_preferences) on public.companies from authenticated;

alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_uidx
  on public.notifications(
    company_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_key
  )
  where dedupe_key is not null;

alter table public.outbox
  add column dedupe_key text,
  add column team_invitation_id uuid
    references public.team_invitations(id) on delete set null;

create unique index outbox_dedupe_uidx
  on public.outbox(company_id, channel, recipient, dedupe_key)
  where dedupe_key is not null;
create index outbox_team_invitation_idx
  on public.outbox(team_invitation_id, created_at desc)
  where team_invitation_id is not null;

alter table public.outbox drop constraint if exists outbox_source_check;
alter table public.outbox add constraint outbox_source_check check (
  source in (
    'direct','campaign','reminder','platform','manual_document',
    'manual_document_copy','manual_statement','cashier_session','team'
  )
);

alter table public.message_templates drop constraint if exists message_templates_context_check;
alter table public.message_templates add constraint message_templates_context_check
  check (context in ('platform', 'customer', 'reminder', 'team'));

insert into public.message_templates(
  template_key,name,context,sms_body,whatsapp_body,in_app_title,in_app_body,is_system
) values
  (
    'team-invitation','Team invitation','team',
    '{{inviter_name}} invited you to join {{company_name}} as {{role_name}}. Sign in with this phone at {{app_url}}/login before {{expires_at}}. Do not register a new company.',
    E'*You have been invited to {{company_name}}*\n\n{{inviter_name}} invited you to join as *{{role_name}}*.\n\nSign in with this phone at {{app_url}}/login before {{expires_at}}.\n\nDo not register a new company; signing in will add you automatically.',
    null,null,true
  ),
  (
    'team-invitation-primary','New team invitation','team',
    '{{inviter_name}} invited {{member_name}} ({{member_phone}}) to join {{company_name}} as {{role_name}}.',
    E'*New team invitation*\n\n{{inviter_name}} invited *{{member_name}}* ({{member_phone}}) to join {{company_name}} as *{{role_name}}*.',
    'Invitation sent to {{member_name}}',
    '{{inviter_name}} invited {{member_name}} to join as {{role_name}}.',true
  ),
  (
    'team-invitation-accepted-primary','Team invitation accepted','team',
    '{{member_name}} accepted the invitation to join {{company_name}} as {{role_name}}.',
    E'*Team member joined*\n\n{{member_name}} accepted the invitation to join {{company_name}} as *{{role_name}}*.',
    '{{member_name}} joined the team',
    'The invitation was accepted and {{member_name}} now has {{role_name}} access.',true
  ),
  (
    'team-invitation-accepted-member','Team invitation accepted','team',
    null,null,
    'Welcome to {{company_name}}',
    'You joined {{company_name}} as {{role_name}}.',true
  )
on conflict do nothing;

create or replace function public.primary_contact_notification_preferences(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
  v_channel text;
  v_team boolean := true;
  v_cashier boolean := true;
begin
  select c.notification_category_preferences -> 'primaryContact'
  into v_raw
  from public.companies c
  where c.id = p_company_id;

  if jsonb_typeof(v_raw) = 'object' then
    v_channel := v_raw ->> 'channel';
    if jsonb_typeof(v_raw -> 'team') = 'boolean' then
      v_team := (v_raw ->> 'team')::boolean;
    end if;
    if jsonb_typeof(v_raw -> 'cashierSessions') = 'boolean' then
      v_cashier := (v_raw ->> 'cashierSessions')::boolean;
    end if;
  end if;

  if v_channel is null
     or v_channel not in ('whatsapp_sms_fallback','whatsapp','sms','none') then
    v_channel := 'whatsapp';
  end if;
  return jsonb_build_object(
    'channel', v_channel,
    'team', v_team,
    'cashierSessions', v_cashier
  );
end;
$$;

revoke execute on function public.primary_contact_notification_preferences(uuid)
  from public, anon, authenticated;
grant execute on function public.primary_contact_notification_preferences(uuid) to service_role;

create or replace function public.primary_contact_notification_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_name text;
  v_phone text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select c.primary_contact_user_id, p.display_name, u.phone
  into v_user_id, v_name, v_phone
  from public.companies c
  left join public.company_staff_profiles p
    on p.company_id = c.id and p.user_id = c.primary_contact_user_id
  left join auth.users u on u.id = c.primary_contact_user_id
  where c.id = v_company_id;

  return jsonb_build_object(
    'primary_contact_user_id', v_user_id,
    'primary_contact_name', v_name,
    'primary_contact_phone', case
      when length(coalesce(v_phone, '')) >= 6
        then left(v_phone, 3) || '••••••' || right(v_phone, 3)
      else null
    end,
    'preferences', public.primary_contact_notification_preferences(v_company_id)
  );
end;
$$;

revoke execute on function public.primary_contact_notification_settings() from public, anon;
grant execute on function public.primary_contact_notification_settings()
  to authenticated, service_role;

create or replace function public.set_primary_contact_notification_preferences(
  p_channel text,
  p_team_enabled boolean,
  p_cashier_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_preferences jsonb;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if p_channel not in ('whatsapp_sms_fallback','whatsapp','sms','none') then
    raise exception 'invalid_notification_channel';
  end if;
  if p_team_enabled is null or p_cashier_enabled is null then
    raise exception 'notification_preferences_required';
  end if;

  v_preferences := jsonb_build_object(
    'channel', p_channel,
    'team', p_team_enabled,
    'cashierSessions', p_cashier_enabled
  );
  update public.companies
  set notification_category_preferences = jsonb_set(
    coalesce(notification_category_preferences, '{}'::jsonb),
    '{primaryContact}',
    v_preferences,
    true
  )
  where id = v_company_id;
  return v_preferences;
end;
$$;

revoke execute on function public.set_primary_contact_notification_preferences(text,boolean,boolean)
  from public, anon;
grant execute on function public.set_primary_contact_notification_preferences(text,boolean,boolean)
  to authenticated, service_role;

create or replace function public.notify_once(
  p_company_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.notifications(company_id,user_id,type,title,body,link,dedupe_key)
  values(p_company_id,p_user_id,p_type,p_title,p_body,p_link,p_dedupe_key)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select n.id into v_id
    from public.notifications n
    where n.company_id = p_company_id
      and n.user_id is not distinct from p_user_id
      and n.dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.notify_once(uuid,uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.notify_once(uuid,uuid,text,text,text,text,text) to service_role;

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
      fallback_body = case when p_channel = 'whatsapp' then p_fallback_body end
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

revoke execute on function public.queue_team_outbox(uuid,uuid,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.queue_team_outbox(uuid,uuid,text,text,text,text,text,text,text)
  to service_role;

-- Preserve team/cashier linkage when a failed WhatsApp row creates its SMS fallback.
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

  v_id := public.queue_message(
    v_source.company_id,'sms',v_source.recipient,v_source.fallback_body,v_source.subject
  );
  update public.outbox
  set source = v_source.source,
      customer_id = v_source.customer_id,
      template_key = v_source.template_key,
      template_version = v_source.template_version,
      max_attempts = 5,
      fallback_for_outbox_id = p_outbox_id,
      team_invitation_id = v_source.team_invitation_id,
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

revoke execute on function public.queue_sms_fallback(uuid) from public, anon, authenticated;
grant execute on function public.queue_sms_fallback(uuid) to service_role;

-- Keep infrastructure/provider details out of tenant-facing invitation snapshots.
create or replace function public.team_delivery_error_code(p_error text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(p_error), '') is null then null
    when p_error like '%_limit_reached:%' or p_error = 'quota_exhausted'
      then 'quota_exhausted'
    when p_error like 'provider_not_configured:%' then 'provider_not_configured'
    when p_error like '%http 4%' or p_error like 'textsms code %'
      then 'provider_rejected'
    when p_error = 'max_attempts_exceeded' then 'max_attempts_exceeded'
    when p_error like '%template unavailable%' then 'template_unavailable'
    else 'delivery_failed'
  end
$$;

revoke execute on function public.team_delivery_error_code(text)
  from public, anon, authenticated;
grant execute on function public.team_delivery_error_code(text) to service_role;

-- Runtime placeholders are expanded by the worker. Reconcile SMS quota against
-- that final body before provider delivery so segment accounting stays exact.
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

  v_required := public.sms_segment_count(p_final_body);
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

revoke execute on function public.reconcile_runtime_sms_quota(uuid,text)
  from public, anon, authenticated;
grant execute on function public.reconcile_runtime_sms_quota(uuid,text) to service_role;

create or replace function public.team_invitation_delivery_status(
  p_invitation_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parent public.outbox%rowtype;
  v_fallback public.outbox%rowtype;
  v_key text := 'team:invitation:' || p_invitation_id::text || ':invitee:v' || p_version::text;
begin
  select * into v_parent
  from public.outbox o
  where o.team_invitation_id = p_invitation_id
    and o.dedupe_key = v_key
    and o.fallback_for_outbox_id is null
  order by o.created_at desc
  limit 1;
  if not found then
    return jsonb_build_object(
      'status','not_queued','channel',null,
      'error',(
        select i.last_delivery_error from public.team_invitations i
        where i.id = p_invitation_id
      )
    );
  end if;

  select * into v_fallback
  from public.outbox o
  where o.fallback_for_outbox_id = v_parent.id
  limit 1;
  if v_fallback.id is not null then
    if v_fallback.status = 'sent' then
      return jsonb_build_object('status','sms_fallback_sent','channel','sms','error',null);
    elsif v_fallback.status = 'pending' then
      return jsonb_build_object('status','queued','channel','sms','error',null);
    else
      return jsonb_build_object(
        'status','failed','channel','sms',
        'error',public.team_delivery_error_code(v_fallback.error)
      );
    end if;
  end if;
  if v_parent.status = 'sent' then
    return jsonb_build_object('status','whatsapp_sent','channel','whatsapp','error',null);
  elsif v_parent.status = 'pending' then
    return jsonb_build_object('status','queued','channel','whatsapp','error',null);
  end if;
  return jsonb_build_object(
    'status','failed','channel','whatsapp',
    'error',public.team_delivery_error_code(v_parent.error)
  );
end;
$$;

revoke execute on function public.team_invitation_delivery_status(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.team_invitation_delivery_status(uuid,integer) to service_role;

create or replace function public.emit_team_invitation_event(
  p_invitation_id uuid,
  p_event text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.team_invitations%rowtype;
  v_company_name text;
  v_role_name text;
  v_inviter_name text;
  v_target jsonb;
  v_preferences jsonb;
  v_template public.message_templates%rowtype;
  v_values jsonb;
  v_whatsapp text;
  v_sms text;
  v_title text;
  v_in_app text;
  v_channel text;
  v_key text;
  v_outbox uuid;
  v_invitee_status text := 'not_queued';
  v_invitee_error text;
begin
  if p_event not in ('invited','accepted') then raise exception 'invalid_team_event'; end if;
  select i.* into v_invitation
  from public.team_invitations i where i.id = p_invitation_id;
  if not found then return jsonb_build_object('status','not_queued','error','invitation_not_found'); end if;

  select c.name, r.name,
    coalesce(p.display_name, 'A company administrator')
  into v_company_name, v_role_name, v_inviter_name
  from public.companies c
  join public.roles r on r.id = v_invitation.role_id and r.company_id = c.id
  left join public.company_staff_profiles p
    on p.company_id = c.id and p.user_id = v_invitation.invited_by
  where c.id = v_invitation.company_id;

  v_values := jsonb_build_object(
    'company_name', v_company_name,
    'role_name', v_role_name,
    'inviter_name', v_inviter_name,
    'member_name', v_invitation.display_name,
    'member_phone', '+' || v_invitation.phone,
    'expires_at', to_char(
      v_invitation.expires_at at time zone 'Africa/Nairobi',
      'DD Mon YYYY HH24:MI'
    ) || ' EAT',
    'app_url', '__APP_URL__'
  );
  v_preferences := public.primary_contact_notification_preferences(v_invitation.company_id);
  v_target := public.resolve_platform_campaign_recipient(v_invitation.company_id);

  if p_event = 'invited' then
    select * into v_template from public.message_templates
    where company_id is null and template_key = 'team-invitation' and active limit 1;
    if found then
      v_whatsapp := replace(
        public.render_message_template(v_template.whatsapp_body,v_values),
        '__APP_URL__','{{app_url}}'
      );
      v_sms := replace(
        public.render_message_template(v_template.sms_body,v_values),
        '__APP_URL__','{{app_url}}'
      );
      v_key := 'team:invitation:' || p_invitation_id::text || ':invitee:v' || p_version::text;
      begin
        v_outbox := public.queue_team_outbox(
          v_invitation.company_id,p_invitation_id,'whatsapp','+' || v_invitation.phone,
          v_whatsapp,'Invitation to ' || v_company_name,v_template.template_key,v_key,v_sms
        );
        if v_outbox is not null then v_invitee_status := 'queued'; end if;
      exception when others then
        v_invitee_status := 'not_queued';
        v_invitee_error := sqlerrm;
      end;
    else
      v_invitee_error := 'team invitation template unavailable';
    end if;

    if v_target is not null
       and (v_target ->> 'user_id')::uuid is distinct from v_invitation.invited_by then
      select * into v_template from public.message_templates
      where company_id is null and template_key = 'team-invitation-primary' and active limit 1;
      if found then
        v_title := public.render_message_template(v_template.in_app_title,v_values);
        v_in_app := public.render_message_template(v_template.in_app_body,v_values);
        begin
          perform public.notify_once(
            v_invitation.company_id,(v_target ->> 'user_id')::uuid,'team',
            v_title,v_in_app,'/team',
            'team:invitation:' || p_invitation_id::text || ':primary:v' || p_version::text
          );
        exception when others then null;
        end;
        if coalesce((v_preferences ->> 'team')::boolean,true)
           and v_preferences ->> 'channel' <> 'none'
           and nullif(v_target ->> 'phone','') is not null then
          begin
            v_channel := case when v_preferences ->> 'channel' = 'sms' then 'sms' else 'whatsapp' end;
            v_whatsapp := public.render_message_template(v_template.whatsapp_body,v_values);
            v_sms := public.render_message_template(v_template.sms_body,v_values);
            perform public.queue_team_outbox(
              v_invitation.company_id,p_invitation_id,v_channel,v_target ->> 'phone',
              case when v_channel = 'sms' then v_sms else v_whatsapp end,
              'New team invitation',v_template.template_key,
              'team:invitation:' || p_invitation_id::text || ':primary:v' || p_version::text,
              case when v_preferences ->> 'channel' = 'whatsapp_sms_fallback' then v_sms end
            );
          exception when others then null;
          end;
        end if;
      end if;
    end if;
  else
    select * into v_template from public.message_templates
    where company_id is null and template_key = 'team-invitation-accepted-member' and active limit 1;
    if found and v_invitation.accepted_by is not null then
      begin
        perform public.notify_once(
          v_invitation.company_id,v_invitation.accepted_by,'team',
          public.render_message_template(v_template.in_app_title,v_values),
          public.render_message_template(v_template.in_app_body,v_values),
          '/dashboard','team:invitation:' || p_invitation_id::text || ':accepted:member'
        );
      exception when others then null;
      end;
    end if;

    if v_target is not null
       and (v_target ->> 'user_id')::uuid is distinct from v_invitation.accepted_by then
      select * into v_template from public.message_templates
      where company_id is null and template_key = 'team-invitation-accepted-primary' and active limit 1;
      if found then
        begin
          perform public.notify_once(
            v_invitation.company_id,(v_target ->> 'user_id')::uuid,'team',
            public.render_message_template(v_template.in_app_title,v_values),
            public.render_message_template(v_template.in_app_body,v_values),
            '/team','team:invitation:' || p_invitation_id::text || ':accepted:primary'
          );
        exception when others then null;
        end;
        if coalesce((v_preferences ->> 'team')::boolean,true)
           and v_preferences ->> 'channel' <> 'none'
           and nullif(v_target ->> 'phone','') is not null then
          begin
            v_channel := case when v_preferences ->> 'channel' = 'sms' then 'sms' else 'whatsapp' end;
            v_whatsapp := public.render_message_template(v_template.whatsapp_body,v_values);
            v_sms := public.render_message_template(v_template.sms_body,v_values);
            perform public.queue_team_outbox(
              v_invitation.company_id,p_invitation_id,v_channel,v_target ->> 'phone',
              case when v_channel = 'sms' then v_sms else v_whatsapp end,
              'Team member joined',v_template.template_key,
              'team:invitation:' || p_invitation_id::text || ':accepted:primary',
              case when v_preferences ->> 'channel' = 'whatsapp_sms_fallback' then v_sms end
            );
          exception when others then null;
          end;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status',v_invitee_status,
    'error',public.team_delivery_error_code(v_invitee_error)
  );
exception when others then
  return jsonb_build_object(
    'status','not_queued',
    'error',public.team_delivery_error_code(sqlerrm)
  );
end;
$$;

revoke execute on function public.emit_team_invitation_event(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.emit_team_invitation_event(uuid,text,integer) to service_role;

-- Delivery state changes refresh the invitation projection without exposing outbox bodies.
create or replace function public.team_outbox_cache_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.outbox%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.team_invitation_id is not null
     and exists(select 1 from public.companies c where c.id = v_row.company_id) then
    perform public.emit_cache_change(
      v_row.company_id,'team','invitation',v_row.team_invitation_id::text,
      case when tg_op = 'DELETE' then 'delete' else 'upsert' end,null,null
    );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.team_outbox_cache_change_trigger()
  from public, anon, authenticated;
create trigger team_outbox_cache_change
after insert or update or delete on public.outbox
for each row execute function public.team_outbox_cache_change_trigger();

create or replace function public.invite_team_member(
  p_phone text,
  p_role_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_phone text;
  v_name text := trim(coalesce(p_display_name, ''));
  v_user_id uuid;
  v_membership_id uuid;
  v_invitation public.team_invitations%rowtype;
  v_delivery jsonb;
  v_reactivated boolean := false;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);
  if length(v_name) not between 1 and 120 then raise exception 'invalid_display_name'; end if;
  if not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.company_id = v_company_id and not r.is_template
  ) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  v_phone := public.normalize_team_phone(p_phone);
  perform 1 from public.companies c where c.id = v_company_id for update;

  select u.id into v_user_id
  from auth.users u
  join public.company_memberships m
    on m.user_id = u.id and m.company_id = v_company_id
  where regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_phone
  limit 1;

  if v_user_id is not null then
    select m.id into v_membership_id
    from public.company_memberships m
    where m.company_id = v_company_id and m.user_id = v_user_id;
    if not exists (
      select 1 from public.company_memberships m
      where m.id = v_membership_id and m.authorization_status = 'approved'
    ) then
      perform public.assert_team_invitation_capacity(v_company_id, v_phone);
    end if;
    update public.company_memberships
    set role_id = p_role_id, authorization_status = 'approved', updated_at = now()
    where id = v_membership_id;
    update public.company_staff_profiles
    set display_name = v_name, updated_at = now()
    where company_id = v_company_id and user_id = v_user_id;
    update public.team_invitations
    set status = 'cancelled', updated_at = now()
    where company_id = v_company_id and phone = v_phone and status in ('pending','expired');
    return jsonb_build_object('status','updated','membership_id',v_membership_id);
  end if;

  select i.* into v_invitation
  from public.team_invitations i
  where i.company_id = v_company_id
    and i.phone = v_phone
    and i.status in ('pending','expired')
  order by case when i.status = 'pending' then 0 else 1 end, i.created_at desc
  limit 1
  for update;

  if v_invitation.id is null then
    perform public.assert_team_invitation_capacity(v_company_id, null);
    insert into public.team_invitations(
      company_id,phone,role_id,display_name,invited_by,notification_version,last_notified_at
    ) values(
      v_company_id,v_phone,p_role_id,v_name,auth.uid(),1,now()
    ) returning * into v_invitation;
    v_reactivated := true;
  elsif v_invitation.status = 'expired' or v_invitation.expires_at <= now() then
    perform public.assert_team_invitation_capacity(v_company_id, v_phone);
    update public.team_invitations
    set role_id = p_role_id,
        display_name = v_name,
        invited_by = auth.uid(),
        status = 'pending',
        expires_at = now() + interval '7 days',
        notification_version = notification_version + 1,
        last_notified_at = now(),
        last_delivery_error = null,
        updated_at = now()
    where id = v_invitation.id
    returning * into v_invitation;
    v_reactivated := true;
  else
    update public.team_invitations
    set role_id = p_role_id,
        display_name = v_name,
        invited_by = auth.uid(),
        updated_at = now()
    where id = v_invitation.id
    returning * into v_invitation;
  end if;

  if v_reactivated then
    v_delivery := public.emit_team_invitation_event(
      v_invitation.id,'invited',v_invitation.notification_version
    );
    update public.team_invitations
    set last_delivery_error = v_delivery ->> 'error'
    where id = v_invitation.id;
  else
    v_delivery := public.team_invitation_delivery_status(
      v_invitation.id,v_invitation.notification_version
    );
  end if;

  return jsonb_build_object(
    'status', case when v_reactivated then 'invited' else 'updated_invitation' end,
    'invitation_id', v_invitation.id,
    'expires_at', v_invitation.expires_at,
    'delivery_status', coalesce(v_delivery ->> 'status','not_queued'),
    'delivery_error', v_delivery ->> 'error'
  );
end;
$$;

revoke execute on function public.invite_team_member(text,uuid,text) from public, anon;
grant execute on function public.invite_team_member(text,uuid,text)
  to authenticated, service_role;

create or replace function public.resend_team_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_invitation public.team_invitations%rowtype;
  v_delivery jsonb;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);
  perform 1 from public.companies c where c.id = v_company_id for update;
  select i.* into v_invitation
  from public.team_invitations i
  where i.id = p_invitation_id
    and i.company_id = v_company_id
    and i.status in ('pending','expired')
  for update;
  if v_invitation.id is null then raise exception 'invitation_not_found: %', p_invitation_id; end if;
  if v_invitation.last_notified_at is not null
     and v_invitation.last_notified_at > now() - interval '5 minutes' then
    raise exception 'invitation_resend_too_soon: wait five minutes before resending';
  end if;
  if v_invitation.status = 'expired' or v_invitation.expires_at <= now() then
    perform public.assert_team_invitation_capacity(v_company_id, v_invitation.phone);
  end if;

  update public.team_invitations
  set invited_by = auth.uid(),
      status = 'pending',
      expires_at = now() + interval '7 days',
      notification_version = notification_version + 1,
      last_notified_at = now(),
      last_delivery_error = null,
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;
  v_delivery := public.emit_team_invitation_event(
    v_invitation.id,'invited',v_invitation.notification_version
  );
  update public.team_invitations
  set last_delivery_error = v_delivery ->> 'error'
  where id = v_invitation.id;
  return jsonb_build_object(
    'invitation_id',v_invitation.id,
    'expires_at',v_invitation.expires_at,
    'delivery_status',coalesce(v_delivery ->> 'status','not_queued'),
    'delivery_error',v_delivery ->> 'error',
    'can_resend_at',v_invitation.last_notified_at + interval '5 minutes'
  );
end;
$$;

revoke execute on function public.resend_team_invitation(uuid) from public, anon;
grant execute on function public.resend_team_invitation(uuid) to authenticated, service_role;

create or replace function public.cancel_team_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  update public.team_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id
    and company_id = v_company_id
    and status in ('pending','expired')
  returning id into v_id;
  if v_id is null then raise exception 'invitation_not_found: %', p_invitation_id; end if;
  return v_id;
end;
$$;

revoke execute on function public.cancel_team_invitation(uuid) from public, anon;
grant execute on function public.cancel_team_invitation(uuid) to authenticated, service_role;

create or replace function public.claim_team_invitations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_invitation record;
  v_first_company_id uuid;
  v_claimed integer := 0;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select public.normalize_team_phone(u.phone) into v_phone
  from auth.users u where u.id = v_user_id and u.phone_confirmed_at is not null;
  if v_phone is null then
    return jsonb_build_object('claimed_count',0,'company_id',null);
  end if;

  update public.team_invitations
  set status = 'expired', updated_at = now()
  where phone = v_phone and status = 'pending' and expires_at <= now();

  perform c.id
  from public.companies c
  where c.status = 'approved'
    and exists(
      select 1 from public.team_invitations i
      where i.company_id = c.id and i.phone = v_phone
        and i.status = 'pending' and i.expires_at > now()
    )
  order by c.id
  for update;

  for v_invitation in
    select i.*
    from public.team_invitations i
    join public.companies c on c.id = i.company_id and c.status = 'approved'
    where i.phone = v_phone and i.status = 'pending' and i.expires_at > now()
    order by i.created_at,i.id
    for update of i
  loop
    if not exists(
      select 1 from public.company_memberships m
      where m.company_id = v_invitation.company_id
        and m.user_id = v_user_id
        and m.authorization_status = 'approved'
    ) then
      perform public.assert_team_invitation_capacity(v_invitation.company_id,v_phone);
    end if;

    insert into public.company_memberships(company_id,user_id,role_id,authorization_status)
    values(v_invitation.company_id,v_user_id,v_invitation.role_id,'approved')
    on conflict(company_id,user_id) do update
    set role_id = excluded.role_id,
        authorization_status = 'approved',
        updated_at = now();
    insert into public.company_staff_profiles(company_id,user_id,display_name)
    values(v_invitation.company_id,v_user_id,v_invitation.display_name)
    on conflict(company_id,user_id) do update
    set display_name = excluded.display_name, updated_at = now();
    update public.team_invitations
    set status = 'accepted',accepted_by = v_user_id,accepted_at = now(),updated_at = now()
    where id = v_invitation.id;
    perform public.emit_team_invitation_event(v_invitation.id,'accepted',1);
    v_first_company_id := coalesce(v_first_company_id,v_invitation.company_id);
    v_claimed := v_claimed + 1;
  end loop;

  if v_first_company_id is not null and not exists(
    select 1
    from public.user_preferences p
    join public.company_memberships m
      on m.user_id = p.user_id and m.company_id = p.active_company_id
    join public.companies c on c.id = m.company_id
    where p.user_id = v_user_id
      and m.authorization_status = 'approved'
      and c.status = 'approved'
  ) then
    insert into public.user_preferences(user_id,active_company_id)
    values(v_user_id,v_first_company_id)
    on conflict(user_id) do update
    set active_company_id = excluded.active_company_id,updated_at = now();
  end if;
  return jsonb_build_object('claimed_count',v_claimed,'company_id',v_first_company_id);
end;
$$;

revoke execute on function public.claim_team_invitations() from public, anon;
grant execute on function public.claim_team_invitations() to authenticated, service_role;

create or replace function public.team_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_members jsonb;
  v_invitations jsonb;
  v_roles jsonb;
  v_locations jsonb;
  v_assignments jsonb;
  v_primary uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select primary_contact_user_id into v_primary
  from public.companies where id = v_company_id;
  select coalesce(
    jsonb_agg(member order by member->'staff_profile'->>'display_name',member->>'user_id'),'[]'
  ) into v_members from (
    select to_jsonb(m) || jsonb_build_object(
      'roles',case when r.id is null then null else
        jsonb_build_object('name',r.name,'permissions',r.permissions) end,
      'staff_profile',case when p.id is null then null else jsonb_build_object(
        'display_name',p.display_name,'last_role_name',p.last_role_name,'avatar_path',p.avatar_path
      ) end
    ) member
    from public.company_memberships m
    left join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    left join public.company_staff_profiles p
      on p.company_id = m.company_id and p.user_id = m.user_id
    where m.company_id = v_company_id
  ) rows;
  select coalesce(
    jsonb_agg(invitation order by invitation->>'display_name',invitation->>'created_at'),'[]'
  ) into v_invitations from (
    select jsonb_build_object(
      'id',i.id,
      'phone','+' || i.phone,
      'display_name',i.display_name,
      'role_id',i.role_id,
      'role_name',r.name,
      'created_at',i.created_at,
      'expires_at',i.expires_at,
      'status',case when i.expires_at <= now() then 'expired' else i.status end,
      'notification_version',i.notification_version,
      'can_resend_at',i.last_notified_at + interval '5 minutes',
      'delivery_status',delivery.value ->> 'status',
      'delivery_channel',delivery.value ->> 'channel',
      'delivery_error',delivery.value ->> 'error'
    ) invitation
    from public.team_invitations i
    join public.roles r on r.id = i.role_id and r.company_id = i.company_id
    cross join lateral (
      select public.team_invitation_delivery_status(i.id,i.notification_version) value
    ) delivery
    where i.company_id = v_company_id and i.status in ('pending','expired')
  ) rows;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name,r.id),'[]') into v_roles
  from public.roles r where r.company_id = v_company_id and not r.is_template;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.is_default desc,l.name,l.id),'[]')
  into v_locations
  from public.stock_locations l where l.company_id = v_company_id and l.is_active;
  select coalesce(
    jsonb_agg(to_jsonb(a) order by a.membership_id,a.is_primary desc,a.location_id),'[]'
  ) into v_assignments
  from public.company_membership_locations a where a.company_id = v_company_id;
  return jsonb_build_object(
    'company_id',v_company_id,
    'primary_contact_user_id',v_primary,
    'members',v_members,
    'invitations',v_invitations,
    'roles',v_roles,
    'locations',v_locations,
    'membership_locations',v_assignments,
    'generated_at',now()
  );
end;
$$;

-- Cashier alerts use the same primary-contact policy and always retain an in-app record.
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
    v_body := '🟢 *Day opened — ' || coalesce(v_store,'Store') || '*' || E'\n\n' ||
      '*Cashier:* ' || v_cashier || E'\n' ||
      '*Opened:* ' || to_char(v_session.opened_at at time zone 'Africa/Nairobi','HH24:MI') || E'\n\n' ||
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
    v_body := '🟢 *Day closed — ' || coalesce(v_store,'Store') || '*' || E'\n\n' ||
      '*Cashier:* ' || v_cashier || E'\n' ||
      '*Time:* ' || to_char(v_session.opened_at at time zone 'Africa/Nairobi','HH24:MI') ||
        ' – ' || to_char(v_session.closed_at at time zone 'Africa/Nairobi','HH24:MI') || E'\n' ||
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
    case when p_event = 'opened' then 'Day opened — ' else 'Day closed — ' end ||
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
    v_sms_body := regexp_replace(v_body,'[*]','','g');
    v_channel := case when v_preferences ->> 'channel' = 'sms' then 'sms' else 'whatsapp' end;
    v_outbox := public.queue_message(
      v_session.company_id,v_channel,v_target ->> 'phone',
      case when v_channel = 'sms' then v_sms_body else v_body end,
      case when p_event = 'opened' then 'Day opened' else 'Day closed' end
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
          then v_sms_body end
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

revoke execute on function public.queue_cashier_session_notification(uuid,text)
  from public, anon, authenticated;
grant execute on function public.queue_cashier_session_notification(uuid,text) to service_role;
