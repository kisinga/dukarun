-- Close legacy review bypasses, reject stale schedule times, repair campaign
-- bookkeeping after transient worker errors, and keep primary contacts valid.

revoke execute on function public.platform_send_campaign(text,text,text,text,text,uuid,text,uuid[])
  from public,anon,authenticated,service_role;
revoke execute on function public.platform_broadcast(text,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.platform_launch_campaign(p_campaign_id uuid,p_scheduled_for timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign public.message_campaigns%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_campaign from public.message_campaigns
  where id=p_campaign_id and scope='platform' and status='draft' for update;
  if not found then raise exception 'editable_draft_not_found'; end if;
  if v_campaign.reviewed_at is null then raise exception 'campaign_review_required'; end if;
  if p_scheduled_for is not null then
    if p_scheduled_for<=now() then raise exception 'scheduled_time_must_be_future'; end if;
    update public.message_campaigns set status='scheduled',scheduled_for=p_scheduled_for,updated_at=now()
    where id=v_campaign.id;
    return jsonb_build_object('campaign_id',v_campaign.id,'scheduled_for',p_scheduled_for);
  end if;
  return public.dispatch_platform_campaign(v_campaign.id);
end;
$$;

create or replace function public.reconcile_platform_campaign_deliveries()
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record;v_count integer:=0;
begin
  for v_row in
    select cr.id,o.status from public.campaign_recipients cr
    join public.message_campaigns mc on mc.id=cr.campaign_id and mc.scope='platform'
    join public.outbox o on o.id=cr.outbox_id
    where o.status in ('sent','failed') and cr.status is distinct from o.status
    order by cr.campaign_id,cr.id
  loop
    perform public.finalize_campaign_recipient(v_row.id,v_row.status);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.reconcile_platform_campaign_deliveries()
  from public,anon,authenticated;
grant execute on function public.reconcile_platform_campaign_deliveries() to service_role;
select cron.unschedule(jobid) from cron.job where jobname='platform-campaign-reconcile';
select cron.schedule('platform-campaign-reconcile','* * * * *',
  $$select public.reconcile_platform_campaign_deliveries()$$);

create or replace function public.clear_primary_contact_for_role_permissions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.permissions is distinct from new.permissions and not ('ManageTeam'=any(new.permissions)) then
    update public.companies c set primary_contact_user_id=null
    where c.id=new.company_id and exists(
      select 1 from public.company_memberships m
      where m.company_id=c.id and m.role_id=new.id and m.user_id=c.primary_contact_user_id
    );
  end if;
  return new;
end;
$$;
create trigger role_primary_contact_guard after update of permissions on public.roles
for each row execute function public.clear_primary_contact_for_role_permissions();
