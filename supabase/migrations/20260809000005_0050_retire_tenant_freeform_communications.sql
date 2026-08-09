-- Retire tenant-authored outbound messaging. Customer communications are now
-- limited to platform-defined transactional flows such as payment reminders.
-- Platform-admin campaigns remain available through the platform_* RPCs.

-- Customer campaigns are no longer a sellable or configurable entitlement.
update public.subscription_tiers
set customer_campaigns_available = false
where customer_campaigns_available;

alter table public.subscription_tiers
  add constraint subscription_tiers_customer_campaigns_retired_check
  check (not customer_campaigns_available);

-- Stop tenant-authored deliveries that have not completed. Attempted sends
-- consume their reservation because provider acceptance is uncertain; untouched
-- sends release it.
do $$
declare v_outbox record;
begin
  for v_outbox in
    select id, attempts, campaign_recipient_id
    from public.outbox
    where status = 'pending' and source in ('campaign', 'direct')
    for update
  loop
    perform public.finalize_message_quota(v_outbox.id, v_outbox.attempts > 0);
    update public.outbox
    set status = 'cancelled', error = 'tenant_freeform_communications_retired'
    where id = v_outbox.id and status = 'pending';
    update public.campaign_recipients
    set status = 'cancelled'
    where id = v_outbox.campaign_recipient_id and status in ('eligible', 'queued');
  end loop;

  update public.message_campaigns
  set status = 'cancelled'
  where scope = 'company'
    and status in ('draft', 'queued', 'sending', 'paused', 'partial');
end $$;

-- Preserve tenant-authored templates for audit/history, but move their keys out
-- of the live namespace and make them inactive. Fixed reminder rules then fall
-- back to the platform-owned templates.
update public.message_templates
set template_key = 'retired-' || id::text || '-' || template_key,
    active = false,
    updated_at = now()
where company_id is not null
  and context in ('customer', 'reminder')
  and active;

update public.payment_reminder_rules
set template_key = case stage_days
  when 0 then 'payment-due'
  when 3 then 'payment-overdue-3'
  when 7 then 'payment-overdue-7'
  when 14 then 'payment-overdue-14'
end;

-- Free-form payment instructions appeared on Dukarun-hosted statement pages.
-- Clear them until structured, validated payment destination fields replace the
-- old text box.
update public.companies
set customer_payment_instructions = null
where customer_payment_instructions is not null;

-- Keep the compatibility signature used by deployed clients, but accept only
-- enablement/channel/stage choices. Template keys and payment text are derived
-- or ignored at the authority boundary.
create or replace function public.update_communication_settings(
  p_reminders_enabled boolean,
  p_channel text,
  p_sms_fallback boolean,
  p_payment_instructions text,
  p_rules jsonb default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_rule jsonb;
  v_stage integer;
  v_enabled boolean;
  v_template_key text;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommunications') then
    raise exception 'permission_denied: ManageCommunications required';
  end if;
  if p_channel not in ('sms', 'whatsapp') then raise exception 'invalid_channel'; end if;
  if p_reminders_enabled then perform public.assert_entitled(v_company, null); end if;
  if p_reminders_enabled and not exists(
    select 1
    from public.companies c
    join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.id = v_company and t.payment_reminders_available
  ) then
    raise exception 'feature_unavailable: payment reminders';
  end if;

  -- p_payment_instructions is retained only for rolling-client compatibility.
  perform p_payment_instructions;
  update public.companies
  set payment_reminders_enabled = p_reminders_enabled,
      payment_reminder_channel = p_channel,
      payment_reminder_sms_fallback = p_sms_fallback,
      customer_payment_instructions = null
  where id = v_company;

  if p_rules is not null then
    for v_rule in select * from jsonb_array_elements(p_rules)
    loop
      v_stage := (v_rule ->> 'stage_days')::integer;
      v_enabled := (v_rule ->> 'enabled')::boolean;
      v_template_key := case v_stage
        when 0 then 'payment-due'
        when 3 then 'payment-overdue-3'
        when 7 then 'payment-overdue-7'
        when 14 then 'payment-overdue-14'
        else null
      end;
      if v_template_key is null then
        raise exception 'invalid_reminder_stage: %', v_stage;
      end if;
      insert into public.payment_reminder_rules(company_id, stage_days, enabled, template_key)
      values(v_company, v_stage, v_enabled, v_template_key)
      on conflict(company_id, stage_days) do update
      set enabled = excluded.enabled, template_key = excluded.template_key;
    end loop;
  end if;
end;
$$;

revoke execute on function public.update_communication_settings(boolean,text,boolean,text,jsonb)
  from public, anon;
grant execute on function public.update_communication_settings(boolean,text,boolean,text,jsonb)
  to authenticated;

-- Tenants may read their archived template history and the fixed transactional
-- templates. Platform-only templates remain visible only to platform admins.
drop policy "company templates readable" on public.message_templates;
create policy "company templates readable"
  on public.message_templates for select
  using (
    (select public.is_platform_admin())
    or company_id = (select public.current_company_id())
    or (company_id is null and context in ('customer', 'reminder'))
  );

-- Remove every authenticated API that accepts tenant-supplied outbound text or
-- a raw recipient. Internal queue_message and platform-admin APIs remain.
drop function public.send_message_campaign(uuid);
drop function public.create_message_campaign(text,text,text,text,uuid[],uuid);
drop function public.campaign_preview(text,text,text,uuid[]);
drop function public.set_campaign_status(uuid,text);
drop function public.retry_failed_campaign_recipients(uuid);
drop function public.test_message_template(uuid,text,text);
drop function public.reset_message_template(text);
drop function public.upsert_message_template(text,text,text,text,text,uuid);
drop function public.queue_batch_message(text,text,text);

comment on column public.subscription_tiers.customer_campaigns_available is
  'Retired compatibility field. Always false; tenant free-form campaigns are unavailable.';
