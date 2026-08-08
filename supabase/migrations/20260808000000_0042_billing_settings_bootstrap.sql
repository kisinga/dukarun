-- Repair billing settings on databases that had no `standard` tier when the
-- configurable-trials migration ran. An INSERT ... SELECT with no matching
-- tier succeeded but created no singleton, leaving public_billing_config()
-- returning null and default-tier provisioning unavailable.

insert into public.platform_billing_settings (
  singleton,
  trial_duration_days,
  default_trial_tier_id
)
select
  true,
  30,
  t.id
from public.subscription_tiers t
where t.is_active
order by
  case when lower(t.code) = 'standard' then 0 else 1 end,
  t.price_monthly,
  t.id
limit 1
on conflict (singleton) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.platform_billing_settings
    where singleton
  ) then
    raise exception 'billing_settings_bootstrap_failed: no active subscription tier';
  end if;
end;
$$;

-- Keep the platform repairable even if the singleton is ever removed: saving
-- trial policy recreates it instead of silently updating zero rows.
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

  if p_trial_duration_days < 1 or p_trial_duration_days > 365 then
    raise exception 'invalid_trial_duration: expected 1..365 days';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id = p_default_trial_tier_id and is_active
  ) then
    raise exception 'default_trial_tier_not_active';
  end if;

  insert into public.platform_billing_settings (
    singleton,
    trial_duration_days,
    default_trial_tier_id,
    updated_at
  )
  values (true, p_trial_duration_days, p_default_trial_tier_id, now())
  on conflict (singleton) do update
  set trial_duration_days = excluded.trial_duration_days,
      default_trial_tier_id = excluded.default_trial_tier_id,
      updated_at = excluded.updated_at;

  return public.public_billing_config();
end;
$$;

revoke execute on function public.platform_update_billing_config(integer, uuid)
  from anon, authenticated, public;
grant execute on function public.platform_update_billing_config(integer, uuid)
  to service_role, authenticated;
