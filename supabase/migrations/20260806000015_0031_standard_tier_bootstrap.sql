-- Standard is required platform reference data, not demo seed data. Keep this
-- insert-only so an existing tier managed by platform admins is never reset.

insert into public.subscription_tiers (
  code,
  name,
  price_monthly,
  price_yearly,
  multiple_locations_enabled,
  staff_performance_enabled,
  commissions_available,
  max_team_members,
  max_products,
  max_stock_locations,
  max_orders_per_month,
  sms_per_period
)
values (
  'standard',
  'Standard',
  1500,
  15000,
  true,
  true,
  true,
  5,
  5000,
  3,
  10000,
  500
)
on conflict (code) do nothing;
