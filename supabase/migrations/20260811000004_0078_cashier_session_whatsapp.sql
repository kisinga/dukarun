-- Restore operational WhatsApp reports for cashier-session open/close events.
-- Primary contact is the sole company communications target. Session operations
-- remain authoritative even when an alert cannot be queued.

alter table public.outbox drop constraint if exists outbox_source_check;
alter table public.outbox add constraint outbox_source_check check (
  source in (
    'direct','campaign','reminder','platform','manual_document',
    'manual_document_copy','cashier_session'
  )
);

alter table public.outbox
  add column cashier_session_id uuid references public.cashier_sessions(id) on delete set null,
  add column cashier_session_event text
    check (cashier_session_event is null or cashier_session_event in ('opened','closed'));

create unique index outbox_cashier_session_event_uidx
  on public.outbox(cashier_session_id,cashier_session_event,channel)
  where cashier_session_id is not null and cashier_session_event is not null;

-- Platform campaigns and operational alerts share one exact recipient rule:
-- the explicitly selected, approved primary contact must still be an admin.
create or replace function public.resolve_platform_campaign_recipient(p_company_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('user_id',u.id,'phone',u.phone)
  from public.companies c
  join public.company_memberships m
    on m.company_id=c.id and m.user_id=c.primary_contact_user_id
  join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  join auth.users u on u.id=m.user_id
  where c.id=p_company_id and m.authorization_status='approved'
    and 'ManageTeam'=any(r.permissions)
  limit 1;
$$;
revoke execute on function public.resolve_platform_campaign_recipient(uuid)
  from public,anon,authenticated;
grant execute on function public.resolve_platform_campaign_recipient(uuid) to service_role;

-- Cover companies provisioned after the original primary-contact migration but
-- before this feature ships. Production is also repaired explicitly before deploy;
-- this keeps fresh/staged environments deterministic.
update public.companies c set primary_contact_user_id=(
  select m.user_id from public.company_memberships m
  join public.roles r on r.id=m.role_id and r.company_id=m.company_id
  where m.company_id=c.id and m.authorization_status='approved'
    and 'ManageTeam'=any(r.permissions)
  order by m.created_at
  limit 1
)
where c.primary_contact_user_id is null;

-- Keep newly provisioned companies usable: their first approved admin becomes
-- primary. Later changes remain explicit through the Team-page selector.
create or replace function public.assign_initial_company_primary_contact()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.authorization_status='approved' and exists(
    select 1 from public.roles r where r.id=new.role_id and r.company_id=new.company_id
      and 'ManageTeam'=any(r.permissions)
  ) then
    update public.companies set primary_contact_user_id=new.user_id
    where id=new.company_id and primary_contact_user_id is null;
  end if;
  return new;
end;
$$;
create trigger company_membership_initial_primary_contact
after insert on public.company_memberships
for each row execute function public.assign_initial_company_primary_contact();

-- Expose the strict-primary distinction in campaign review/dispatch results.
do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'public.platform_campaign_preview(text,text,uuid,text,uuid[])'::regprocedure
  ) into v_definition;
  v_definition:=replace(v_definition,'missing_admin','missing_primary');
  execute v_definition;

  select pg_get_functiondef('public.dispatch_platform_campaign(uuid)'::regprocedure)
    into v_definition;
  v_definition:=replace(v_definition,'''missing_admin''','''missing_primary''');
  execute v_definition;
end;
$$;

create or replace function public.cashier_kes(p_amount bigint)
returns text language sql immutable set search_path='' as $$
  select 'KES ' || to_char(coalesce(p_amount,0),'FM999,999,999,999,990')
$$;
revoke execute on function public.cashier_kes(bigint) from public,anon,authenticated;
grant execute on function public.cashier_kes(bigint) to service_role;

create or replace function public.queue_cashier_session_notification(
  p_session_id uuid,p_event text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_session public.cashier_sessions%rowtype;
  v_target jsonb;
  v_store text;
  v_cashier text;
  v_balances text;
  v_collections text;
  v_total_sales bigint:=0;
  v_credit_sales bigint:=0;
  v_variance bigint:=0;
  v_duration integer:=0;
  v_body text;
  v_outbox uuid;
begin
  if p_event not in ('opened','closed') then raise exception 'invalid_cashier_session_event'; end if;

  select * into v_session from public.cashier_sessions where id=p_session_id;
  if not found then return null; end if;
  if p_event='closed' and v_session.status<>'closed' then return null; end if;

  v_target:=public.resolve_platform_campaign_recipient(v_session.company_id);
  if v_target is null or nullif(v_target->>'phone','') is null then return null; end if;

  select l.name into v_store from public.stock_locations l
  where l.id=v_session.location_id and l.company_id=v_session.company_id;
  select p.display_name into v_cashier from public.company_staff_profiles p
  where p.company_id=v_session.company_id and p.user_id=v_session.cashier_user_id;
  v_cashier:=coalesce(v_cashier,'Staff …'||right(v_session.cashier_user_id::text,6));

  select coalesce(string_agg(
      '• '||initcap(replace(a.account_code,'_',' '))||': '||public.cashier_kes(a.declared),
      E'\n' order by a.account_code
    ),'• No controlled balances'),coalesce(sum(a.variance),0)::bigint
  into v_balances,v_variance
  from public.reconciliation_accounts a
  join public.reconciliations r on r.id=a.reconciliation_id
  where r.company_id=v_session.company_id and r.scope='cash-session'
    and r.scope_ref_id=p_session_id::text||case when p_event='opened' then ':opening' else ':closing' end;

  if p_event='opened' then
    v_body:='🟢 *Day opened — '||coalesce(v_store,'Store')||'*'||E'\n\n'||
      '*Cashier:* '||v_cashier||E'\n'||
      '*Opened:* '||to_char(v_session.opened_at at time zone 'Africa/Nairobi','HH24:MI')||E'\n\n'||
      '*Opening balances*'||E'\n'||v_balances||E'\n\n'||
      '*Opening variance:* '||case when v_variance=0 then 'None'
        else public.cashier_kes(abs(v_variance))||case when v_variance<0 then ' short' else ' over' end end;
  else
    select coalesce(sum(o.total),0)::bigint,
      coalesce(sum(o.total) filter(where o.is_credit_sale),0)::bigint
    into v_total_sales,v_credit_sales
    from public.orders o where o.company_id=v_session.company_id
      and o.cashier_session_id=p_session_id and o.status='completed';

    select coalesce(string_agg(
      '• '||initcap(replace(rows.method_code,'_',' '))||': '||public.cashier_kes(rows.amount),
      E'\n' order by rows.method_code
    ),'• None') into v_collections
    from (
      select p.method_code,sum(p.amount)::bigint amount
      from public.payments p join public.orders o on o.id=p.order_id
      where o.company_id=v_session.company_id and o.cashier_session_id=p_session_id
        and o.status='completed' and p.status='settled'
      group by p.method_code
    ) rows;

    v_duration:=greatest(0,round(extract(epoch from
      (coalesce(v_session.closed_at,now())-v_session.opened_at))/60)::integer);
    v_body:='🟢 *Day closed — '||coalesce(v_store,'Store')||'*'||E'\n\n'||
      '*Cashier:* '||v_cashier||E'\n'||
      '*Time:* '||to_char(v_session.opened_at at time zone 'Africa/Nairobi','HH24:MI')||
        ' – '||to_char(v_session.closed_at at time zone 'Africa/Nairobi','HH24:MI')||E'\n'||
      '*Duration:* '||(v_duration/60)::text||'h '||(v_duration%60)::text||'m'||E'\n\n'||
      '*Sales:* '||public.cashier_kes(v_total_sales)||E'\n'||
      '• Credit sales: '||public.cashier_kes(v_credit_sales)||E'\n\n'||
      '*Collections*'||E'\n'||v_collections||E'\n\n'||
      '*Closing balances*'||E'\n'||v_balances||E'\n\n'||
      '*Variance:* '||case when v_variance=0 then 'None'
        else public.cashier_kes(abs(v_variance))||case when v_variance<0 then ' short' else ' over' end end;
  end if;

  v_outbox:=public.queue_message(
    v_session.company_id,'whatsapp',v_target->>'phone',v_body,
    case when p_event='opened' then 'Day opened' else 'Day closed' end
  );
  update public.outbox set source='cashier_session',cashier_session_id=p_session_id,
    cashier_session_event=p_event,scheduled_after=now(),template_key='cashier-session-'||p_event
  where id=v_outbox;
  return v_outbox;
exception
  when unique_violation then
    select id into v_outbox from public.outbox where cashier_session_id=p_session_id
      and cashier_session_event=p_event and channel='whatsapp';
    return v_outbox;
  when others then
    -- Alert delivery is secondary; never roll back an accounting boundary.
    return null;
end;
$$;
revoke execute on function public.queue_cashier_session_notification(uuid,text)
  from public,anon,authenticated;
grant execute on function public.queue_cashier_session_notification(uuid,text) to service_role;

create or replace function public.cashier_session_notification_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and new.status='open' then
    perform public.queue_cashier_session_notification(new.id,'opened');
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='closed' then
    perform public.queue_cashier_session_notification(new.id,'closed');
  end if;
  return new;
end;
$$;

create constraint trigger cashier_session_notifications
after insert or update on public.cashier_sessions
deferrable initially deferred
for each row execute function public.cashier_session_notification_trigger();
