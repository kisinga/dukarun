-- Remove the retired customer-campaign flag from the tenant entitlement read
-- model. The physical tier column remains false-only for rolling compatibility
-- with older platform-admin clients.
create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', jsonb_build_object(
      'multipleLocations', coalesce(t.multiple_locations_enabled, false),
      'staffPerformance', coalesce(t.staff_performance_enabled, false),
      'commissions', coalesce(t.commissions_available, false),
      'storefront', coalesce(t.storefront_available, false),
      'paymentReminders', coalesce(t.payment_reminders_available, false)
    ),
    'settings', jsonb_build_object(
      'commissionsEnabled', c.commissions_enabled,
      'paymentRemindersEnabled', c.payment_reminders_enabled,
      'paymentReminderChannel', c.payment_reminder_channel,
      'paymentReminderSmsFallback', c.payment_reminder_sms_fallback
    ),
    'limits', jsonb_strip_nulls(jsonb_build_object(
      'maxTeamMembers', t.max_team_members,
      'maxProducts', coalesce(t.max_products, 10000),
      'maxStockLocations', t.max_stock_locations,
      'maxOrdersPerMonth', t.max_orders_per_month,
      'smsPerPeriod', t.sms_per_period,
      'whatsappPerPeriod', t.whatsapp_per_period
    )),
    'usage', jsonb_build_object(
      'stockLocations', (
        select count(*) from public.stock_locations l
        where l.company_id = c.id and l.is_active
      ),
      'products', coalesce(u.active_variants, 0),
      'ordersThisMonth', (
        select count(*) from public.orders o
        where o.company_id = c.id
          and o.created_at >= date_trunc('month', now())
          and o.status <> 'voided'
      ),
      'teamMembers', (
        select count(*) from public.company_memberships m
        where m.company_id = c.id and m.authorization_status = 'approved'
      ),
      'sms', jsonb_build_object(
        'used', c.sms_used_this_period,
        'reserved', c.sms_reserved_this_period,
        'remaining', case when t.sms_per_period is null then null
          else greatest(t.sms_per_period - c.sms_used_this_period - c.sms_reserved_this_period, 0)
        end
      ),
      'whatsapp', jsonb_build_object(
        'used', c.whatsapp_used_this_period,
        'reserved', c.whatsapp_reserved_this_period,
        'remaining', case when t.whatsapp_per_period is null then null
          else greatest(t.whatsapp_per_period - c.whatsapp_used_this_period - c.whatsapp_reserved_this_period, 0)
        end
      ),
      'periodEnd', c.communication_period_end
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  left join public.company_usage_counters u on u.company_id = c.id
  where c.id = v_company;
  return v_result;
end;
$$;

comment on function public.current_entitlements() is
  'Current tenant plan/settings/usage contract; retired customer campaigns are omitted.';
