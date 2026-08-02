-- Local development seed (runs on `supabase db reset`). NOT for production.
-- Restores a fully walkable demo state after every reset:
--   test user 254700000001 / OTP 123456 (configured in config.toml test_otp)
--   → <tenant> Stores (Admin) with products, stock, a customer, and a supplier.

-- ---------------------------------------------------------------------------
-- Subscription tiers (production tiers are admin-created; dev convenience)
-- ---------------------------------------------------------------------------
insert into public.subscription_tiers (code, name, price_monthly, price_yearly, features, limits)
values
  ('trial', 'Trial', 0, 0, '{}', '{"maxAdmins": 1, "maxProducts": 100, "maxStockLocations": 1, "maxOrdersPerMonth": 500, "smsPerPeriod": 50}'),
  ('standard', 'Standard', 150000, 1500000, '{}', '{"maxAdmins": 5, "maxProducts": 5000, "maxStockLocations": 3, "maxOrdersPerMonth": 10000, "smsPerPeriod": 500}')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Demo auth user (matches [auth.sms.test_otp] in config.toml)
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, phone, phone_confirmed_at,
  encrypted_password, created_at, updated_at
)
values (
  '5877ac73-ff8d-457c-afcd-791e66229d17',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@dukarun.local', '254700000001', now(),
  '', now(), now()
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Demo company via the real provisioning path (claims drive auth.uid())
-- ---------------------------------------------------------------------------
set request.jwt.claims = '{"sub":"5877ac73-ff8d-457c-afcd-791e66229d17","role":"authenticated"}';

select public.provision_company('<tenant> Stores', 'Kiosk 1')
where not exists (
  select 1 from public.company_memberships
  where user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'
);

-- ---------------------------------------------------------------------------
-- Demo catalog: family + variants + stock
-- ---------------------------------------------------------------------------
insert into public.products (id, company_id, name, barcode)
select 'd0000000-0000-0000-0000-000000000001', id, 'Unga wa Dola 2kg', '6001234567890'
from public.companies where name = '<tenant> Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price, wholesale_price)
select 'dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', c.id, 'Default', 'UNGA2', 22000, 20000
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

insert into public.products (id, company_id, name)
select 'd0000000-0000-0000-0000-000000000002', id, 'Sugar'
from public.companies where name = '<tenant> Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price, allow_fractional)
select 'dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', c.id, 'Loose (per kg)', 'SUGL', 18000, true
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', c.id, '1kg Packed', 'SUG1', 20000
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

insert into public.products (id, company_id, name)
select 'd0000000-0000-0000-0000-000000000003', id, 'Delivery'
from public.companies where name = '<tenant> Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'dd000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', c.id, 'Default', 'service', 'DEL', 5000, false
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

-- Stock
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost, purchased_at)
select c.id, 'dd000000-0000-0000-0000-000000000001', 50, 50, 15000, now() - interval '5 days'
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost, purchased_at)
select c.id, 'dd000000-0000-0000-0000-000000000002', 30, 30, 12000, now() - interval '5 days'
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost, purchased_at)
select c.id, 'dd000000-0000-0000-0000-000000000003', 40, 40, 13000, now() - interval '5 days'
from public.companies c where c.name = '<tenant> Stores'
on conflict do nothing;

-- Customer + supplier
insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit)
select 'dc000000-0000-0000-0000-000000000001', id, 'Jane Mwangi', '0712345678', true, 50000
from public.companies where name = '<tenant> Stores'
on conflict do nothing;

insert into public.customers (id, company_id, first_name, phone, is_supplier)
select 'dc000000-0000-0000-0000-000000000002', id, 'Brookside Distributors', '0700111222', true
from public.companies where name = '<tenant> Stores'
on conflict do nothing;
