-- Local development seed (runs on `supabase db reset`). NOT for production.
-- Production tiers are created by platform admins at runtime; this is a dev convenience.

insert into public.subscription_tiers (code, name, price_monthly, price_yearly, features, limits)
values
  ('trial', 'Trial', 0, 0, '{}', '{"maxAdmins": 1, "maxProducts": 100, "maxStockLocations": 1, "maxOrdersPerMonth": 500, "smsPerPeriod": 50}'),
  ('standard', 'Standard', 150000, 1500000, '{}', '{"maxAdmins": 5, "maxProducts": 5000, "maxStockLocations": 3, "maxOrdersPerMonth": 10000, "smsPerPeriod": 500}');
