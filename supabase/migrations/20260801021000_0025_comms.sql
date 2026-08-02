-- 0025_comms.sql
-- Phase 6 backend: in-app notifications (realtime) + external outbox with
-- quiet-hours, SMS metering, credit reminders with dedupe, batch messaging.

-- ---------------------------------------------------------------------------
-- In-app notifications (free, instant — the default channel).
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid, -- null = company-wide
  type text not null, -- 'credit_reminder' | 'subscription' | 'approval' | 'stock' | 'system'
  title text not null,
  body text,
  link text, -- app route, e.g. '/money/credit'
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_company_idx on public.notifications (company_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications readable by members"
  on public.notifications for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "members mark read"
  on public.notifications for update
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Outbox: external messages (sms/whatsapp/email) flushed by pg_cron ->
-- notification-flush edge function.
-- ---------------------------------------------------------------------------
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  scheduled_after timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index outbox_flush_idx on public.outbox (status, scheduled_after) where status = 'pending';

alter table public.outbox enable row level security;

create policy "outbox readable by members"
  on public.outbox for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.outbox to authenticated;
grant all on public.outbox to service_role;

-- ---------------------------------------------------------------------------
-- notify(): in-app notification helper.
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_company_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (company_id, user_id, type, title, body, link)
  values (p_company_id, p_user_id, p_type, p_title, p_body, p_link)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid) from authenticated, anon, public;
grant execute on function public.notify(uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_message(): outbox helper with WhatsApp quiet-hours (08:00-19:00 EAT)
-- and SMS period metering.
-- ---------------------------------------------------------------------------
create or replace function public.queue_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_scheduled timestamptz := now();
  v_eat_hour int;
  v_limit int;
  v_used int;
begin
  -- WhatsApp: outside 08:00-19:00 EAT, defer to next 08:00 EAT.
  if p_channel = 'whatsapp' then
    v_eat_hour := extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_eat_hour >= 19 or v_eat_hour < 8 then
      v_scheduled := ((v_scheduled at time zone 'Africa/Nairobi')::date
        + case when v_eat_hour >= 19 then interval '1 day' else interval '0' end
        + interval '8 hours') at time zone 'Africa/Nairobi';
    end if;
  end if;

  -- SMS metering: cap at the tier's smsPerPeriod.
  if p_channel = 'sms' then
    select (t.limits ->> 'smsPerPeriod')::int, c.sms_used_this_period
      into v_limit, v_used
    from public.companies c
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.id = p_company_id;

    if v_limit is not null and coalesce(v_used, 0) >= v_limit then
      raise exception 'sms_limit_reached: % of % used this period', v_used, v_limit;
    end if;
  end if;

  insert into public.outbox (company_id, channel, recipient, subject, body, scheduled_after)
  values (p_company_id, p_channel, p_recipient, p_subject, p_body, v_scheduled)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.queue_message(uuid, text, text, text, text) from authenticated, anon, public;
grant execute on function public.queue_message(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Credit reminder checkpoints (dedupe): one notification per customer per
-- bucket per 10 days.
-- ---------------------------------------------------------------------------
create table public.credit_notification_checkpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  bucket text not null,
  notified_at timestamptz not null default now(),
  unique (company_id, customer_id, bucket)
);

alter table public.credit_notification_checkpoints enable row level security;
grant all on public.credit_notification_checkpoints to service_role;
-- no client read needed; service role only

-- Daily scan: in-app notification + SMS for customers entering/overdue in a
-- bucket, deduped via checkpoints (10-day freeze per bucket).
create or replace function public.credit_reminder_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select a.company_id, a.customer_id, a.balance, a.days_outstanding, a.bucket,
           c.first_name, c.phone, c.notifications_enabled
    from public.customer_credit_aging a
    join public.customers c on c.id = a.customer_id
    where a.bucket in ('8-30', '31-60', '60+')
  loop
    -- dedupe: skip if this bucket was notified within 10 days
    if exists (
      select 1 from public.credit_notification_checkpoints cp
      where cp.company_id = v_row.company_id
        and cp.customer_id = v_row.customer_id
        and cp.bucket = v_row.bucket
        and cp.notified_at > now() - interval '10 days'
    ) then
      continue;
    end if;

    perform public.notify(
      v_row.company_id, 'credit_reminder',
      'Credit overdue: ' || v_row.first_name,
      format('Balance KES %s, %s days outstanding (%s).',
             (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding, v_row.bucket),
      '/money/credit'
    );

    if v_row.phone is not null and v_row.notifications_enabled then
      begin
        perform public.queue_message(
          v_row.company_id, 'sms', v_row.phone,
          format('Reminder: your balance of KES %s is %s days overdue. Please pay to keep your credit active.',
                 (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding)
        );
      exception when others then
        -- sms limit reached etc. — in-app notification already sent; continue
        null;
      end;
    end if;

    insert into public.credit_notification_checkpoints (company_id, customer_id, bucket)
    values (v_row.company_id, v_row.customer_id, v_row.bucket)
    on conflict (company_id, customer_id, bucket) do update set notified_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.credit_reminder_scan() from authenticated, anon, public;
grant execute on function public.credit_reminder_scan() to service_role;

select cron.schedule(
  'credit-reminder-scan',
  '22 3 * * *', -- 06:22 EAT daily
  $$select public.credit_reminder_scan()$$
);

-- Outbox flush every minute via pg_net -> notification-flush edge function.
-- Function URL + service key are read from Vault secrets set at deploy time
-- (NOTIFY_FLUSH_URL, set in CI/deploy). Skipped when the secret is absent
-- (local dev without functions serving).
create or replace function public.flush_outbox_trigger()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select max(case when name = 'NOTIFY_FLUSH_URL' then decrypted_secret end),
         max(case when name = 'SUPABASE_SERVICE_ROLE_KEY' then decrypted_secret end)
    into v_url, v_key
  from vault.decrypted_secrets
  where name in ('NOTIFY_FLUSH_URL', 'SUPABASE_SERVICE_ROLE_KEY');

  if v_url is null then
    return; -- not configured (local dev); nothing to call
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_key, '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.flush_outbox_trigger() from authenticated, anon, public;
grant execute on function public.flush_outbox_trigger() to service_role;

select cron.schedule(
  'outbox-flush',
  '* * * * *',
  $$select public.flush_outbox_trigger()$$
);

-- ---------------------------------------------------------------------------
-- increment_sms_usage: called by notification-flush per delivered SMS.
-- ---------------------------------------------------------------------------
create or replace function public.increment_sms_usage(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies
  set sms_used_this_period = sms_used_this_period + 1
  where id = p_company_id;
end;
$$;

revoke execute on function public.increment_sms_usage(uuid) from authenticated, anon, public;
grant execute on function public.increment_sms_usage(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_batch_message: staff-facing batch messaging (customer groups).
-- p_audience: 'all' | 'credit_overdue'
-- ---------------------------------------------------------------------------
create or replace function public.queue_batch_message(
  p_channel text,
  p_body text,
  p_audience text default 'all'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_customer record;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_channel not in ('sms', 'whatsapp') then
    raise exception 'invalid_channel: batch messaging supports sms/whatsapp';
  end if;

  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'invalid_body';
  end if;

  for v_customer in
    select c.phone from public.customers c
    where c.company_id = v_company_id
      and c.phone is not null
      and c.notifications_enabled
      and not c.is_supplier
      and (
        p_audience = 'all'
        or (p_audience = 'credit_overdue' and exists (
          select 1 from public.customer_credit_aging a
          where a.company_id = v_company_id and a.customer_id = c.id
        ))
      )
  loop
    begin
      perform public.queue_message(v_company_id, p_channel, v_customer.phone, p_body);
      v_count := v_count + 1;
    exception when others then
      -- sms limit mid-batch: stop expanding, report what was queued
      raise;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.queue_batch_message(text, text, text) from anon, public;
grant execute on function public.queue_batch_message(text, text, text) to authenticated;
