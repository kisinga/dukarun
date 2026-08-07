-- Configurable company trials.
--
-- A trial is provisioned in a pending state and starts only when the company
-- is approved. Its tier and end timestamp are snapshotted onto the company,
-- so later platform-setting changes affect future trials only.

create table public.platform_billing_settings (
  singleton boolean primary key default true check (singleton),
  trial_duration_days integer not null default 30
    check (trial_duration_days between 1 and 365),
  default_trial_tier_id uuid not null references public.subscription_tiers (id),
  updated_at timestamptz not null default now()
);

insert into public.platform_billing_settings (singleton, trial_duration_days, default_trial_tier_id)
select true, 30, id
from public.subscription_tiers
where code = 'standard'
limit 1;

alter table public.platform_billing_settings enable row level security;
revoke all on public.platform_billing_settings from anon, authenticated, public;
grant all on public.platform_billing_settings to service_role;

alter table public.companies
  add column trial_started_at timestamptz,
  add constraint companies_trial_dates_consistent check (
    trial_started_at is null or trial_ends_at is null or trial_ends_at > trial_started_at
  );

-- Preserve the history of trials that were already running before this
-- migration. Pending companies get a fresh clock when approved.
update public.companies
set trial_started_at = case
  when trial_ends_at is not null then least(
    coalesce(subscription_started_at, trial_ends_at - interval '30 days'),
    trial_ends_at - interval '1 second'
  )
  else coalesce(subscription_started_at, created_at)
end
where status = 'approved'
  and subscription_status = 'trial'
  and trial_started_at is null;

update public.companies
set subscription_status = null,
    trial_started_at = null,
    trial_ends_at = null,
    subscription_expires_at = null,
    subscription_grace_period_end = null,
    updated_at = now()
where status = 'unapproved'
  and subscription_status = 'trial';

-- Keep the mature provisioning implementation intact and put the trial
-- policy in a small wrapper. The optional tier code is validated server-side.
alter function public.provision_company(text, text, text, text, text)
  rename to provision_company_base;

revoke execute on function public.provision_company_base(text, text, text, text, text)
  from anon, authenticated, public;

create function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null,
  p_trial_tier_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_trial_tier_id uuid;
begin
  if p_trial_tier_code is not null then
    select id into v_trial_tier_id
    from public.subscription_tiers
    where code = p_trial_tier_code and is_active;

    if v_trial_tier_id is null then
      raise exception 'trial_tier_not_found: %', p_trial_tier_code;
    end if;
  else
    select s.default_trial_tier_id into v_trial_tier_id
    from public.platform_billing_settings s
    join public.subscription_tiers t on t.id = s.default_trial_tier_id
    where s.singleton and t.is_active;
  end if;

  if v_trial_tier_id is null then
    raise exception 'default_trial_tier_not_configured';
  end if;

  v_company_id := public.provision_company_base(
    p_company_name, p_store_name, p_currency, p_email, p_address
  );

  update public.companies
  set subscription_tier_id = v_trial_tier_id,
      subscription_status = null,
      trial_started_at = null,
      trial_ends_at = null,
      subscription_expires_at = null,
      subscription_grace_period_end = null,
      updated_at = now()
  where id = v_company_id;

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company(text, text, text, text, text, text)
  from anon, public;
grant execute on function public.provision_company(text, text, text, text, text, text)
  to authenticated;

create or replace function public.platform_set_company_status(p_company_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_trial_days integer;
  v_now timestamptz := now();
begin
  perform public.assert_platform_admin();

  if p_status not in ('unapproved', 'approved', 'disabled', 'banned') then
    raise exception 'invalid_status';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id
  for update;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  if p_status = 'approved'
     and v_company.status <> 'approved'
     and v_company.subscription_status is null
     and v_company.trial_started_at is null then
    select trial_duration_days into v_trial_days
    from public.platform_billing_settings
    where singleton;

    if v_trial_days is null then
      raise exception 'trial_duration_not_configured';
    end if;

    update public.companies
    set status = p_status,
        subscription_status = 'trial',
        trial_started_at = v_now,
        trial_ends_at = v_now + make_interval(days => v_trial_days),
        subscription_expires_at = v_now + make_interval(days => v_trial_days),
        subscription_grace_period_end = null,
        updated_at = v_now
    where id = p_company_id;
  else
    update public.companies
    set status = p_status, updated_at = v_now
    where id = p_company_id;
  end if;

  return p_company_id;
end;
$$;

create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_now timestamptz := now();
begin
  if p_company_id is distinct from public.current_company_id()
     and not public.is_platform_admin() then raise exception 'not_authorized'; end if;

  select c.*, t.max_team_members, t.max_orders_per_month
    into v_company
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id;

  if v_company is null then raise exception 'company_not_found: %', p_company_id; end if;
  if v_company.status <> 'approved' then
    raise exception 'company_unavailable: %', v_company.status;
  end if;

  if v_company.subscription_exempt_until is not null
     and v_company.subscription_exempt_until > v_now then return; end if;

  -- Trial access ends at the recorded instant. Cron updates reporting state and
  -- reminders, but is not the access-control boundary.
  if v_company.subscription_status = 'trial'
     and (v_company.trial_ends_at is null or v_company.trial_ends_at <= v_now) then
    raise exception 'subscription_expired: trial ended; subscribe to continue';
  end if;

  if v_company.subscription_status not in ('trial', 'active') then
    if not (v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;

  if p_check is null or p_check = 'product' then return; end if;
  if p_check = 'order' and v_company.max_orders_per_month is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= v_company.max_orders_per_month then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_company.max_orders_per_month;
  end if;
  if p_check = 'team' and v_company.max_team_members is not null
     and (select count(*) from public.company_memberships m
       where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= v_company.max_team_members then
    raise exception 'limit_reached: team member limit (%); upgrade your plan',
      v_company.max_team_members;
  end if;
end;
$$;

-- Trial expiry is immediate and has no paid-style grace. Paid subscriptions
-- retain the existing three-day grace period.
create or replace function public.subscription_expiry_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int := 0;
  v_paid_updated int := 0;
  v_now timestamptz := now();
begin
  update public.companies
  set subscription_status = 'expired',
      subscription_grace_period_end = null,
      updated_at = v_now
  where subscription_status = 'trial'
    and trial_ends_at is not null
    and trial_ends_at <= v_now;
  get diagnostics v_updated = row_count;

  update public.companies
  set subscription_status = 'expired',
      subscription_grace_period_end = subscription_expires_at + interval '3 days',
      updated_at = v_now
  where subscription_status = 'active'
    and subscription_expires_at is not null
    and subscription_expires_at <= v_now
    and subscription_grace_period_end is null;
  get diagnostics v_paid_updated = row_count;

  return v_updated + v_paid_updated;
end;
$$;

create function public.public_billing_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trialDays', s.trial_duration_days,
    'defaultTrialTierCode', t.code
  )
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id = s.default_trial_tier_id
  where s.singleton
$$;

revoke execute on function public.public_billing_config() from public;
grant execute on function public.public_billing_config() to anon, authenticated;

create function public.platform_update_billing_config(
  p_trial_duration_days integer,
  p_default_trial_tier_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  if p_trial_duration_days < 1 or p_trial_duration_days > 365 then
    raise exception 'invalid_trial_duration: expected 1..365 days';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id = p_default_trial_tier_id and is_active
  ) then
    raise exception 'default_trial_tier_not_active';
  end if;

  update public.platform_billing_settings
  set trial_duration_days = p_trial_duration_days,
      default_trial_tier_id = p_default_trial_tier_id,
      updated_at = now()
  where singleton;

  return public.public_billing_config();
end;
$$;

revoke execute on function public.platform_update_billing_config(integer, uuid)
  from anon, authenticated, public;
grant execute on function public.platform_update_billing_config(integer, uuid)
  to service_role;

-- Platform admins invoke privileged RPCs through the authenticated role; the
-- function itself verifies the platform-admin claim.
grant execute on function public.platform_update_billing_config(integer, uuid)
  to authenticated;

create function public.prevent_default_trial_tier_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1
    from public.platform_billing_settings
    where singleton and default_trial_tier_id = old.id
  ) then
    raise exception 'cannot_deactivate_default_trial_tier';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_default_trial_tier_deactivation()
  from anon, authenticated, public;

create trigger protect_default_trial_tier
before update of is_active on public.subscription_tiers
for each row execute function public.prevent_default_trial_tier_deactivation();
