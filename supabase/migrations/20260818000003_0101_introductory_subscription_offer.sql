-- Configurable new-company subscription offer.
--
-- When enabled, approved companies receive no uncommitted trial access. They
-- are assigned the configured tier and unlock it by paying for one or more
-- months. The platform grants the configured bonus months in the same atomic
-- activation. When disabled, the existing free-trial policy remains intact.

alter table public.platform_billing_settings
  add column intro_offer_enabled boolean not null default false,
  add column intro_offer_tier_id uuid references public.subscription_tiers(id),
  add column intro_offer_paid_months integer not null default 1
    check (intro_offer_paid_months between 1 and 12),
  add column intro_offer_bonus_months integer not null default 1
    check (intro_offer_bonus_months between 0 and 12);

update public.platform_billing_settings
set intro_offer_tier_id = default_trial_tier_id
where intro_offer_tier_id is null;

alter table public.platform_billing_settings
  alter column intro_offer_tier_id set not null;

create table public.subscription_intro_offer_redemptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers(id),
  paid_months integer not null check (paid_months between 1 and 12),
  bonus_months integer not null check (bonus_months between 0 and 12),
  bonus_applied boolean not null default false,
  amount bigint not null check (amount > 0),
  payment_reference text not null unique,
  redeemed_at timestamptz not null default now()
);

create unique index subscription_intro_offer_one_bonus_per_company
  on public.subscription_intro_offer_redemptions(company_id)
  where bonus_applied;

alter table public.subscription_intro_offer_redemptions enable row level security;
create policy "platform admins read introductory offer redemptions"
  on public.subscription_intro_offer_redemptions for select to authenticated
  using ((select public.is_platform_admin()));
grant select on public.subscription_intro_offer_redemptions to authenticated;
grant all on public.subscription_intro_offer_redemptions to service_role;

create or replace function public.public_billing_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'trialDays', s.trial_duration_days,
    'defaultTrialTierCode', trial_tier.code,
    'introOfferEnabled', s.intro_offer_enabled,
    'introOfferTierCode', offer_tier.code,
    'introOfferTierName', offer_tier.name,
    'introOfferPrice', offer_tier.price_monthly * s.intro_offer_paid_months,
    'introOfferPaidMonths', s.intro_offer_paid_months,
    'introOfferBonusMonths', s.intro_offer_bonus_months
  )
  from public.platform_billing_settings s
  join public.subscription_tiers trial_tier on trial_tier.id = s.default_trial_tier_id
  join public.subscription_tiers offer_tier on offer_tier.id = s.intro_offer_tier_id
  where s.singleton
$$;

revoke execute on function public.public_billing_config() from public;
grant execute on function public.public_billing_config() to anon, authenticated;

create function public.platform_update_billing_policy(
  p_trial_duration_days integer,
  p_default_trial_tier_id uuid,
  p_intro_offer_enabled boolean,
  p_intro_offer_tier_id uuid,
  p_intro_offer_paid_months integer,
  p_intro_offer_bonus_months integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  if p_trial_duration_days not between 1 and 365 then
    raise exception 'invalid_trial_duration: expected 1..365 days';
  end if;
  if p_intro_offer_paid_months not between 1 and 12 then
    raise exception 'invalid_intro_offer_paid_months';
  end if;
  if p_intro_offer_bonus_months not between 0 and 12 then
    raise exception 'invalid_intro_offer_bonus_months';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id = p_default_trial_tier_id and is_active
  ) then
    raise exception 'default_trial_tier_not_active';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id = p_intro_offer_tier_id and is_active
  ) then
    raise exception 'intro_offer_tier_not_active';
  end if;
  if p_intro_offer_enabled and not exists (
    select 1 from public.subscription_tiers
    where id = p_intro_offer_tier_id and is_active and price_monthly > 0
  ) then
    raise exception 'intro_offer_tier_not_billable';
  end if;

  insert into public.platform_billing_settings (
    singleton,
    trial_duration_days,
    default_trial_tier_id,
    intro_offer_enabled,
    intro_offer_tier_id,
    intro_offer_paid_months,
    intro_offer_bonus_months,
    updated_at
  )
  values (
    true,
    p_trial_duration_days,
    p_default_trial_tier_id,
    p_intro_offer_enabled,
    p_intro_offer_tier_id,
    p_intro_offer_paid_months,
    p_intro_offer_bonus_months,
    now()
  )
  on conflict(singleton) do update set
    trial_duration_days = excluded.trial_duration_days,
    default_trial_tier_id = excluded.default_trial_tier_id,
    intro_offer_enabled = excluded.intro_offer_enabled,
    intro_offer_tier_id = excluded.intro_offer_tier_id,
    intro_offer_paid_months = excluded.intro_offer_paid_months,
    intro_offer_bonus_months = excluded.intro_offer_bonus_months,
    updated_at = excluded.updated_at;

  return public.public_billing_config();
end;
$$;

revoke execute on function public.platform_update_billing_policy(integer,uuid,boolean,uuid,integer,integer)
  from public, anon;
grant execute on function public.platform_update_billing_policy(integer,uuid,boolean,uuid,integer,integer)
  to authenticated, service_role;

-- Backward-compatible trial-only setter retained for older admin clients and
-- operational repair. Existing introductory-offer values remain unchanged.
create or replace function public.platform_update_billing_config(
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
  if p_trial_duration_days not between 1 and 365 then
    raise exception 'invalid_trial_duration: expected 1..365 days';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id=p_default_trial_tier_id and is_active
  ) then
    raise exception 'default_trial_tier_not_active';
  end if;

  insert into public.platform_billing_settings(
    singleton,trial_duration_days,default_trial_tier_id,
    intro_offer_enabled,intro_offer_tier_id,intro_offer_paid_months,intro_offer_bonus_months,updated_at
  ) values(
    true,p_trial_duration_days,p_default_trial_tier_id,
    false,p_default_trial_tier_id,1,1,now()
  )
  on conflict(singleton) do update set
    trial_duration_days=excluded.trial_duration_days,
    default_trial_tier_id=excluded.default_trial_tier_id,
    updated_at=excluded.updated_at;
  return public.public_billing_config();
end;
$$;

revoke execute on function public.platform_update_billing_config(integer,uuid)
  from public, anon;
grant execute on function public.platform_update_billing_config(integer,uuid)
  to authenticated, service_role;

create or replace function public.prevent_default_trial_tier_deactivation()
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
  if old.is_active and not new.is_active and exists (
    select 1
    from public.platform_billing_settings
    where singleton and intro_offer_tier_id = old.id
  ) then
    raise exception 'cannot_deactivate_intro_offer_tier';
  end if;
  return new;
end;
$$;

-- Latest approval implementation, extended with paid-offer mode.
create or replace function public.approve_company_transition(p_company_id uuid,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company public.companies%rowtype;
  v_billing public.platform_billing_settings%rowtype;
  v_now timestamptz:=now();
begin
  if p_mode not in ('manual','automatic') then raise exception 'invalid_approval_mode'; end if;
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status='approved' then return p_company_id; end if;

  select * into v_billing from public.platform_billing_settings where singleton;
  if v_billing.singleton is null then raise exception 'billing_settings_not_configured'; end if;

  if v_company.subscription_status is null and v_company.trial_started_at is null then
    if v_billing.intro_offer_enabled then
      update public.companies set
        status='approved',
        subscription_tier_id=v_billing.intro_offer_tier_id,
        subscription_status=null,
        trial_started_at=null,
        trial_ends_at=null,
        subscription_expires_at=null,
        subscription_grace_period_end=null,
        updated_at=v_now
      where id=p_company_id;
    else
      update public.companies set status='approved',subscription_status='trial',
        trial_started_at=v_now,trial_ends_at=v_now+make_interval(days=>v_billing.trial_duration_days),
        subscription_expires_at=v_now+make_interval(days=>v_billing.trial_duration_days),
        subscription_grace_period_end=null,updated_at=v_now where id=p_company_id;
    end if;
  else
    update public.companies set status='approved',updated_at=v_now where id=p_company_id;
  end if;
  insert into public.company_approval_events(company_id,approval_mode,approved_by,approved_at)
  values(p_company_id,p_mode,case when p_mode='manual' then auth.uid() end,v_now);
  return p_company_id;
end;
$$;

create function public.activate_intro_offer(
  p_company_id uuid,
  p_tier_id uuid,
  p_reference text,
  p_amount bigint,
  p_unit_price bigint,
  p_paid_months integer,
  p_bonus_months integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_tier public.subscription_tiers%rowtype;
  v_now timestamptz := now();
  v_base timestamptz;
  v_first_redemption boolean;
  v_applied_bonus_months integer;
begin
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if exists (
    select 1 from public.subscription_intro_offer_redemptions
    where company_id=p_company_id and payment_reference=p_reference
  ) then return p_company_id; end if;
  if v_company.status<>'approved' then raise exception 'company_not_approved'; end if;
  if p_paid_months not between 1 and 12 or p_bonus_months not between 0 and 12 then
    raise exception 'invalid_intro_offer_duration';
  end if;

  select * into v_tier from public.subscription_tiers where id=p_tier_id and is_active;
  if v_tier.id is null then raise exception 'tier_not_found: %',p_tier_id; end if;
  if p_unit_price <= 0 or p_amount <> p_unit_price * p_paid_months then
    raise exception 'intro_offer_amount_mismatch';
  end if;

  select not exists (
    select 1 from public.subscription_intro_offer_redemptions where company_id=p_company_id
  ) into v_first_redemption;
  if v_first_redemption and (
    v_company.last_payment_reference is not null or v_company.subscription_status is not null
  ) then raise exception 'intro_offer_not_eligible'; end if;

  v_applied_bonus_months := case when v_first_redemption then p_bonus_months else 0 end;
  v_base := case
    when v_company.subscription_expires_at is not null
      and v_company.subscription_expires_at > v_now then v_company.subscription_expires_at
    else v_now
  end;

  insert into public.subscription_intro_offer_redemptions(
    company_id,tier_id,paid_months,bonus_months,bonus_applied,amount,payment_reference
  ) values(
    p_company_id,p_tier_id,p_paid_months,v_applied_bonus_months,
    v_first_redemption,p_amount,p_reference
  );

  update public.companies set
    subscription_tier_id=p_tier_id,
    subscription_status='active',
    subscription_started_at=coalesce(subscription_started_at,v_now),
    subscription_expires_at=v_base+make_interval(months=>p_paid_months+v_applied_bonus_months),
    subscription_grace_period_end=null,
    billing_cycle='monthly',
    last_payment_date=v_now,
    last_payment_amount=p_amount,
    last_payment_reference=p_reference,
    updated_at=v_now
  where id=p_company_id;

  return p_company_id;
end;
$$;

revoke execute on function public.activate_intro_offer(uuid,uuid,text,bigint,bigint,integer,integer)
  from public, anon, authenticated;
grant execute on function public.activate_intro_offer(uuid,uuid,text,bigint,bigint,integer,integer)
  to service_role;
