-- Send lightweight in-app reminders from the existing daily expiry scan.
-- Expiry enforcement remains timestamp-based; reminder stages use Nairobi dates.

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
  with candidates as (
    select
      c.id as company_id,
      c.primary_contact_user_id as user_id,
      c.subscription_status as subscription_kind,
      case
        when c.subscription_status = 'trial' then c.trial_ends_at
        else c.subscription_expires_at
      end as expires_at,
      coalesce(t.name, 'Dukarun') as tier_name
    from public.companies c
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.status = 'approved'
      and c.subscription_status in ('trial', 'active')
      and (
        (c.subscription_status = 'trial' and c.trial_ends_at is not null)
        or
        (c.subscription_status = 'active' and c.subscription_expires_at is not null)
      )
      and (c.subscription_exempt_until is null or c.subscription_exempt_until <= v_now)
  ), staged as (
    select
      candidates.*,
      ((expires_at at time zone 'Africa/Nairobi')::date
        - (v_now at time zone 'Africa/Nairobi')::date) as days_remaining
    from candidates
  )
  insert into public.notifications(
    company_id,
    user_id,
    type,
    title,
    body,
    link,
    dedupe_key
  )
  select
    company_id,
    user_id,
    'subscription',
    case
      when subscription_kind = 'trial' and days_remaining = 1 then 'Trial ends tomorrow'
      when subscription_kind = 'trial' then 'Trial ends in 7 days'
      when days_remaining = 1 then 'Subscription expires tomorrow'
      else 'Subscription expires in 7 days'
    end,
    case
      when subscription_kind = 'trial' then
        'Your ' || tier_name || ' trial ends on '
          || to_char(expires_at at time zone 'Africa/Nairobi', 'DD Mon YYYY')
          || '. Choose a plan to keep your workspace active.'
      else
        'Your ' || tier_name || ' subscription expires on '
          || to_char(expires_at at time zone 'Africa/Nairobi', 'DD Mon YYYY')
          || '. Renew now to avoid interrupted access.'
    end,
    '/billing',
    'subscription:' || company_id::text
      || ':' || subscription_kind
      || ':' || to_char(expires_at at time zone 'UTC', 'YYYYMMDDHH24MISS.US')
      || ':' || days_remaining::text
  from staged
  where days_remaining in (7, 1)
  on conflict do nothing;

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

revoke execute on function public.subscription_expiry_scan() from authenticated, anon, public;
grant execute on function public.subscription_expiry_scan() to service_role;
