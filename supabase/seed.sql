-- Local development seed (runs on `supabase db reset`). NOT for production.
-- Restores a fully walkable demo state after every reset:
--   test user 254700000001 / OTP 123456 (configured in config.toml test_otp)
--   → <tenant> Stores (fully-permitted Admin) on the Standard tier, with
--     three stock locations, products, distributed stock, a customer, and a supplier.

-- ---------------------------------------------------------------------------
-- Subscription tiers (production tiers are admin-created; dev convenience)
-- ---------------------------------------------------------------------------
insert into public.subscription_tiers (code, name, price_monthly, price_yearly, features, limits)
values
  ('trial', 'Trial', 0, 0, '{"multipleLocations": false, "staffPerformance": false, "commissions": false}', '{"maxAdmins": 1, "maxProducts": 100, "maxStockLocations": 1, "maxOrdersPerMonth": 500, "smsPerPeriod": 50}'),
  ('standard', 'Standard', 150000, 1500000, '{"multipleLocations": true, "staffPerformance": true, "commissions": true}', '{"maxAdmins": 5, "maxProducts": 5000, "maxStockLocations": 3, "maxOrdersPerMonth": 10000, "smsPerPeriod": 500}')
on conflict (code) do update
set name = excluded.name,
    price_monthly = excluded.price_monthly,
    price_yearly = excluded.price_yearly,
    features = excluded.features,
    limits = excluded.limits;

-- ---------------------------------------------------------------------------
-- Demo auth user (matches [auth.sms.test_otp] in config.toml)
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
  confirmation_token, recovery_token, email_change, email_change_token_current,
  email_change_token_new, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values (
  '5877ac73-ff8d-457c-afcd-791e66229d17',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@dukarun.local', '254700000001', now(), '',
  '', '', '', '', '', '', '', '',
  now(), now()
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

-- The demo exercises paid-plan and multi-location paths instead of being
-- constrained to the single-location trial fixture.
update public.companies c
set subscription_tier_id = t.id,
    subscription_status = 'active',
    subscription_started_at = coalesce(c.subscription_started_at, now()),
    subscription_expires_at = now() + interval '1 year',
    billing_cycle = 'yearly',
    commissions_enabled = true,
    status = 'approved',
    updated_at = now()
from public.subscription_tiers t
where c.name = '<tenant> Stores' and t.code = 'standard';

-- Keep the seeded founder as a fully-capable shop administrator even when this
-- seed is re-run against a database that already contained the membership.
update public.roles r
set permissions = array[
  'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
  'ManageCustomerCreditLimit','ReverseOrder','OverrideCustomerBalance','SettleOrder',
  'ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
  'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
  'ViewStaffPerformance','ManageCommissions'
]::text[]
from public.companies c
where r.company_id = c.id and c.name = '<tenant> Stores' and r.name = 'Admin';

update public.company_memberships m
set role_id = r.id, authorization_status = 'approved'
from public.roles r, public.companies c
where m.user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'
  and m.company_id = c.id and c.name = '<tenant> Stores'
  and r.company_id = c.id and r.name = 'Admin';

-- Provisioning creates MAIN/Kiosk 1. Add two non-default locations so purchase,
-- stock, and reporting screens can exercise real location selection.
insert into public.stock_locations (company_id, code, name, is_default)
select c.id, location.code, location.name, false
from public.companies c
cross join (
  values
    ('WAREHOUSE', 'Central Warehouse'),
    ('WESTLANDS', 'Westlands Branch')
) as location(code, name)
where c.name = '<tenant> Stores'
on conflict (company_id, code) do update
set name = excluded.name,
    updated_at = now();

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

-- Stock is spread across all three locations while preserving the original
-- company-wide quantities (50 Unga, 30 loose sugar, 40 packed sugar).
insert into public.inventory_batches (
  id, company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
)
select
  batch.id::uuid,
  c.id,
  batch.variant_id::uuid,
  l.id,
  batch.quantity,
  batch.quantity,
  batch.unit_cost,
  now() - interval '5 days'
from public.companies c
join (
  values
    ('e0000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'MAIN', 30::numeric, 15000::bigint),
    ('e0000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001', 'WAREHOUSE', 12::numeric, 15000::bigint),
    ('e0000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000001', 'WESTLANDS', 8::numeric, 15000::bigint),
    ('e0000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000002', 'MAIN', 20::numeric, 12000::bigint),
    ('e0000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000002', 'WAREHOUSE', 10::numeric, 12000::bigint),
    ('e0000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000003', 'MAIN', 25::numeric, 13000::bigint),
    ('e0000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000003', 'WESTLANDS', 15::numeric, 13000::bigint)
) as batch(id, variant_id, location_code, quantity, unit_cost) on true
join public.stock_locations l on l.company_id = c.id and l.code = batch.location_code
where c.name = '<tenant> Stores'
on conflict (id) do nothing;

-- Customer + supplier
insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit, credit_terms_days)
select 'dc000000-0000-0000-0000-000000000001', id, 'Jane Mwangi', '0712345678', true, 50000, 30
from public.companies where name = '<tenant> Stores'
on conflict do nothing;

insert into public.customers (id, company_id, first_name, phone, is_supplier, supplier_credit_limit, supplier_credit_terms_days)
select 'dc000000-0000-0000-0000-000000000002', id, 'Brookside Distributors', '0700111222', true, 200000, 30
from public.companies where name = '<tenant> Stores'
on conflict do nothing;
