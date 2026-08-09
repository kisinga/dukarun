-- Platform dashboard user activity.
--
-- MAU is intentionally defined from the latest successful authentication:
-- a user is active when auth.users.last_sign_in_at falls within the current
-- Africa/Nairobi calendar month. This keeps the metric available even when
-- Postgres-backed Auth audit-log storage is disabled.

create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
begin
  perform public.assert_platform_admin();

  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_approved', (select count(*) from public.companies where status = 'approved'),
    'companies_pending', (select count(*) from public.companies where status = 'unapproved'),
    'subscriptions_active', (select count(*) from public.companies where subscription_status = 'active'),
    'subscriptions_trial', (select count(*) from public.companies where subscription_status = 'trial'),
    'subscriptions_expired', (select count(*) from public.companies where subscription_status = 'expired'),
    'users_total', (select count(*) from auth.users),
    'monthly_active_users', (
      select count(*)
      from auth.users
      where last_sign_in_at >= v_month_start
    ),
    'orders_today', (
      select count(*) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'mrr_estimate', (
      select coalesce(sum(case when c.billing_cycle = 'yearly' then t.price_yearly / 12 else t.price_monthly end), 0)
      from public.companies c join public.subscription_tiers t on t.id = c.subscription_tier_id
      where c.subscription_status = 'active'
    )
  );
end;
$$;
