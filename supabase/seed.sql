-- Local development seed (runs on `supabase db reset`). NOT for production.
-- Restores a fully walkable demo state after every reset:
--   test user 254700000001 / OTP 123456 (configured in config.toml test_otp)
--   → Mama Mboga Stores (fully-permitted Admin, ACTIVE) on the Standard tier,
--     with three stock locations, products, distributed stock, a customer,
--     and a supplier — plus a second company, Jiko Electronics, to exercise
--     multi-company switching (0018).

-- ---------------------------------------------------------------------------
-- Subscription tiers (production tiers are admin-created; dev convenience)
-- ---------------------------------------------------------------------------
insert into public.subscription_tiers (
  code, name, price_monthly, price_yearly,
  multiple_locations_enabled, staff_performance_enabled, commissions_available,
  max_team_members, max_products, max_stock_locations, max_orders_per_month, sms_per_period
)
values
  ('standard', 'Standard', 1500, 15000, true, true, true, 5, 5000, 3, 10000, 500)
on conflict (code) do update
set name = excluded.name,
    price_monthly = excluded.price_monthly,
    price_yearly = excluded.price_yearly,
    multiple_locations_enabled = excluded.multiple_locations_enabled,
    staff_performance_enabled = excluded.staff_performance_enabled,
    commissions_available = excluded.commissions_available,
    max_team_members = excluded.max_team_members,
    max_products = excluded.max_products,
    max_stock_locations = excluded.max_stock_locations,
    max_orders_per_month = excluded.max_orders_per_month,
    sms_per_period = excluded.sms_per_period;

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

select public.provision_company('Mama Mboga Stores', 'Kiosk 1')
where not exists (
  select 1 from public.company_memberships
  where user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'
);

-- The demo exercises active paid-subscription paths instead of trial status.
update public.companies c
set subscription_tier_id = t.id,
    subscription_status = 'active',
    subscription_started_at = coalesce(c.subscription_started_at, now()),
    subscription_expires_at = now() + interval '1 year',
    billing_cycle = 'yearly',
    commissions_enabled = true,
    status = 'approved',
    email = 'info@mamamboga.co.ke',
    address = 'Kiosk 1, Tom Mboya Street, Nairobi',
    updated_at = now()
from public.subscription_tiers t
where c.name = 'Mama Mboga Stores' and t.code = 'standard';

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
where r.company_id = c.id and c.name = 'Mama Mboga Stores' and r.name = 'Admin';

update public.company_memberships m
set role_id = r.id, authorization_status = 'approved'
from public.roles r, public.companies c
where m.user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'
  and m.company_id = c.id and c.name = 'Mama Mboga Stores'
  and r.company_id = c.id and r.name = 'Admin';

-- ---------------------------------------------------------------------------
-- Test personas: Cashier + Manager sharing the demo company.
-- Phones 254700000002/3 with OTP 123456 (config.toml test_otp). Used by the
-- dev-only persona switcher in apps/web.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
  confirmation_token, recovery_token, email_change, email_change_token_current,
  email_change_token_new, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values (
  '5877ac73-ff8d-457c-afcd-791e66229d02',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'cashier@dukarun.local', '254700000002', now(), '',
  '', '', '', '', '', '', '', '',
  now(), now()
)
on conflict (id) do nothing;

insert into auth.users (
  id, instance_id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
  confirmation_token, recovery_token, email_change, email_change_token_current,
  email_change_token_new, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values (
  '5877ac73-ff8d-457c-afcd-791e66229d03',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'manager@dukarun.local', '254700000003', now(), '',
  '', '', '', '', '', '', '', '',
  now(), now()
)
on conflict (id) do nothing;

-- Provisioning seeds Admin + Cashier roles; add the Manager role with the
-- platform template permission set (no CloseAccountingPeriod/ViewAuditTrail/
-- ManageCommissions). Cashier keeps its template role (SettleOrder only).
insert into public.roles (company_id, name, permissions)
select c.id, 'Manager', array[
  'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
  'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
  'SettleOrder', 'ManageSupplierCreditPurchases',
  'ViewFinancials', 'ManageReconciliation',
  'CreateInterAccountTransfer', 'ManageTeam'
]::text[]
from public.companies c
where c.name = 'Mama Mboga Stores'
on conflict (company_id, name) do update
set permissions = excluded.permissions, updated_at = now();

insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
select c.id, persona.user_id::uuid, r.id, 'approved'
from public.companies c
cross join (
  values
    ('5877ac73-ff8d-457c-afcd-791e66229d02', 'Cashier'),
    ('5877ac73-ff8d-457c-afcd-791e66229d03', 'Manager')
) as persona(user_id, role_name)
join public.roles r on r.company_id = c.id and r.name = persona.role_name
where c.name = 'Mama Mboga Stores'
on conflict (company_id, user_id) do update
set role_id = excluded.role_id,
    authorization_status = excluded.authorization_status,
    updated_at = now();

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
where c.name = 'Mama Mboga Stores'
on conflict (company_id, code) do update
set name = excluded.name,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Demo catalog: family + variants + stock
-- ---------------------------------------------------------------------------
insert into public.products (id, company_id, name, barcode)
select 'd0000000-0000-0000-0000-000000000001', id, 'Unga wa Dola 2kg', '6001234567890'
from public.companies where name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price, wholesale_price)
select 'dd000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', c.id, 'Default', 'UNGA2', 220, 200
from public.companies c where c.name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.products (id, company_id, name)
select 'd0000000-0000-0000-0000-000000000002', id, 'Sugar'
from public.companies where name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price, allow_fractional)
select 'dd000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', c.id, 'Loose (per kg)', 'SUGL', 180, true
from public.companies c where c.name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'dd000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', c.id, '1kg Packed', 'SUG1', 200
from public.companies c where c.name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.products (id, company_id, name)
select 'd0000000-0000-0000-0000-000000000003', id, 'Delivery'
from public.companies where name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'dd000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', c.id, 'Default', 'service', 'DEL', 50, false
from public.companies c where c.name = 'Mama Mboga Stores'
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
    ('e0000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'MAIN', 30::numeric, 150::bigint),
    ('e0000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001', 'WAREHOUSE', 12::numeric, 150::bigint),
    ('e0000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000001', 'WESTLANDS', 8::numeric, 150::bigint),
    ('e0000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000002', 'MAIN', 20::numeric, 120::bigint),
    ('e0000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000002', 'WAREHOUSE', 10::numeric, 120::bigint),
    ('e0000000-0000-0000-0000-000000000006', 'dd000000-0000-0000-0000-000000000003', 'MAIN', 25::numeric, 130::bigint),
    ('e0000000-0000-0000-0000-000000000007', 'dd000000-0000-0000-0000-000000000003', 'WESTLANDS', 15::numeric, 130::bigint)
) as batch(id, variant_id, location_code, quantity, unit_cost) on true
join public.stock_locations l on l.company_id = c.id and l.code = batch.location_code
where c.name = 'Mama Mboga Stores'
on conflict (id) do nothing;

-- Customer + supplier
insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit, credit_terms_days)
select 'dc000000-0000-0000-0000-000000000001', id, 'Jane Mwangi', '0712345678', true, 50000, 30
from public.companies where name = 'Mama Mboga Stores'
on conflict do nothing;

insert into public.customers (id, company_id, first_name, phone, is_supplier, supplier_credit_limit, supplier_credit_terms_days)
select 'dc000000-0000-0000-0000-000000000002', id, 'Brookside Distributors', '0700111222', true, 200000, 30
from public.companies where name = 'Mama Mboga Stores'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Second company for the demo user (multi-company switching, 0018).
-- Jiko Electronics is a distinct catalog so switching is visibly different.
-- Mama Mboga Stores stays the ACTIVE company (login lands there).
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.company_memberships
      where user_id = '5877ac73-ff8d-457c-afcd-791e66229d17') < 2 then
    perform public.provision_company('Jiko Electronics', 'CBD Shop');
  end if;
end $$;

update public.companies c
set subscription_tier_id = t.id,
    subscription_status = 'active',
    subscription_started_at = coalesce(c.subscription_started_at, now()),
    subscription_expires_at = now() + interval '1 year',
    billing_cycle = 'yearly',
    status = 'approved',
    email = 'sales@jikoelectronics.co.ke',
    address = 'Shop 4, Kimathi House, Kimathi Street, Nairobi',
    updated_at = now()
from public.subscription_tiers t
where c.name = 'Jiko Electronics' and t.code = 'standard';

insert into public.products (id, company_id, name, barcode)
select 'd0000000-0000-0000-0000-000000000011', id, 'Jiko Energy Saver Stove', '6001234567906'
from public.companies where name = 'Jiko Electronics'
on conflict do nothing;

insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'dd000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000011', c.id, 'Default', 'JIKO1', 3500
from public.companies c where c.name = 'Jiko Electronics'
on conflict do nothing;

insert into public.inventory_batches (
  id, company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
)
select
  'e0000000-0000-0000-0000-000000000011',
  c.id,
  'dd000000-0000-0000-0000-000000000011',
  l.id,
  15,
  15,
  2800,
  now() - interval '5 days'
from public.companies c
join public.stock_locations l on l.company_id = c.id and l.code = 'MAIN'
where c.name = 'Jiko Electronics'
on conflict (id) do nothing;

-- provision_company activates the newest company; pin the demo back to
-- Mama Mboga Stores so existing walkthroughs are unchanged.
insert into public.user_preferences (user_id, active_company_id)
select '5877ac73-ff8d-457c-afcd-791e66229d17', c.id
from public.companies c
where c.name = 'Mama Mboga Stores'
on conflict (user_id) do update
set active_company_id = excluded.active_company_id,
    updated_at = now();
