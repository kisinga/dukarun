-- 0001_tenancy.sql
-- Tenancy foundation: subscription_tiers, companies, roles, company_memberships + RLS.
-- Reference: plan §4 (companies absorb the 28 Vendure channel custom fields as real columns).

-- pgtap is used by `supabase test db` (local + CI). Harmless on hosted projects.
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- JWT claim helpers (claims are injected by the custom_access_token hook, 0002).
-- Always use the `(select ...)` wrap in policies so Postgres caches per-statement.
-- ---------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(auth.jwt() ->> 'company_id', '')::uuid
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
parallel safe
as $$
  select nullif(auth.jwt() ->> 'user_role', '')
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
parallel safe
as $$
  select coalesce((auth.jwt() ->> 'is_platform_admin')::boolean, false)
$$;

-- ---------------------------------------------------------------------------
-- subscription_tiers (platform-global; companies.reference)
-- ---------------------------------------------------------------------------
create table public.subscription_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly bigint not null check (price_monthly >= 0), -- cents
  price_yearly bigint not null check (price_yearly >= 0),   -- cents
  features jsonb not null default '{}',
  -- limits keys: maxAdmins, maxProducts, maxStockLocations, maxOrdersPerMonth, smsPerPeriod
  limits jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- companies (was Vendure Channel; custom fields -> real columns)
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  currency text not null default 'KES',
  status text not null default 'unapproved'
    check (status in ('unapproved', 'approved', 'disabled', 'banned')),

  -- branding / storefront
  logo_path text,
  public_storefront_enabled boolean not null default false,
  public_slug text unique,
  public_whatsapp_number text,

  -- feature flags & preferences
  cashier_flow_enabled boolean not null default false,
  batch_expiry_enabled boolean not null default false,
  low_stock_threshold integer not null default 10,
  cash_control_enabled boolean not null default true,
  require_opening_count boolean not null default true,
  variance_notification_threshold bigint not null default 100, -- cents
  enable_printer boolean not null default true,
  notification_category_preferences jsonb,

  -- subscription / billing
  subscription_tier_id uuid references public.subscription_tiers (id),
  subscription_status text
    check (subscription_status in ('trial', 'active', 'expired', 'cancelled')),
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  paystack_customer_code text,
  paystack_subscription_code text,
  last_payment_date timestamptz,
  last_payment_amount bigint,
  subscription_expired_reminder_sent_at timestamptz,
  subscription_exempt_until timestamptz,
  subscription_exempt_reason text,
  subscription_grace_period_end timestamptz,

  -- SMS usage metering
  sms_used_this_period integer not null default 0,
  sms_period_end timestamptz,
  sms_usage_by_category jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- roles (per-company; permissions validated against the 14 custom permissions)
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  -- null company_id = platform role template (super-admin managed)
  is_template boolean not null default false,
  permissions text[] not null default '{}' check (permissions <@ array[
    'ManageApprovals',
    'OverridePrice',
    'ManageStockAdjustments',
    'ApproveCustomerCredit',
    'ManageCustomerCreditLimit',
    'ReverseOrder',
    'OverrideCustomerBalance',
    'SettleOrder',
    'ManageSupplierCreditPurchases',
    'ViewFinancials',
    'ManageReconciliation',
    'CloseAccountingPeriod',
    'CreateInterAccountTransfer'
  ]::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

-- ---------------------------------------------------------------------------
-- company_memberships (users <-> companies; read by the access-token hook,
-- so the (company_id, user_id) lookup must stay indexed and trivial)
-- ---------------------------------------------------------------------------
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid references public.roles (id) on delete set null,
  authorization_status text not null default 'pending'
    check (authorization_status in ('pending', 'approved', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_memberships_user_idx on public.company_memberships (user_id);
create index company_memberships_company_idx on public.company_memberships (company_id);
create index roles_company_idx on public.roles (company_id);

-- ---------------------------------------------------------------------------
-- RLS
-- Writes to these tables go through service-role RPC/edge functions only;
-- authenticated users get read (and limited company update) via policies.
-- ---------------------------------------------------------------------------
alter table public.subscription_tiers enable row level security;
alter table public.companies enable row level security;
alter table public.roles enable row level security;
alter table public.company_memberships enable row level security;

-- Tiers are public pricing data (needed pre-auth during registration).
create policy "tiers readable by everyone"
  on public.subscription_tiers for select
  using (true);

create policy "companies readable by members or platform admins"
  on public.companies for select
  using (id = (select public.current_company_id()) or (select public.is_platform_admin()));

-- Column-sensitive company writes (billing, status) stay in RPC functions;
-- this policy is the safety net for the limited profile edits allowed client-side.
create policy "companies updatable by members"
  on public.companies for update
  using (id = (select public.current_company_id()))
  with check (id = (select public.current_company_id()));

create policy "roles readable by members or platform admins"
  on public.roles for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );

create policy "memberships readable by members or platform admins"
  on public.company_memberships for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- Grants (explicit; the local stack no longer applies default public-schema
-- privileges). service_role bypasses RLS and needs full access for RPC/edge
-- functions. Company UPDATE is column-limited: billing/status/subscription
-- fields are writable only through service-role RPC functions.
-- ---------------------------------------------------------------------------
grant select on public.subscription_tiers to anon, authenticated;
-- anon SELECT on companies is needed for the public storefront; RLS currently
-- returns zero rows to anon (public-storefront policies arrive with apps/storefront).
grant select on public.companies to anon, authenticated;
grant select on public.roles to authenticated;
grant select on public.company_memberships to authenticated;

grant update (
  name,
  logo_path,
  public_storefront_enabled,
  public_slug,
  public_whatsapp_number,
  notification_category_preferences,
  enable_printer,
  low_stock_threshold,
  cashier_flow_enabled,
  batch_expiry_enabled,
  cash_control_enabled,
  require_opening_count,
  variance_notification_threshold
) on public.companies to authenticated;

grant all on public.subscription_tiers to service_role;
grant all on public.companies to service_role;
grant all on public.roles to service_role;
grant all on public.company_memberships to service_role;
