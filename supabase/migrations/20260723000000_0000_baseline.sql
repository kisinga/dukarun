-- ============================================================================
-- 0000_baseline.sql — flattened from migrations 0001–0054 (squashed 2026-08-04;
-- no live data existed). Section headers mark the original files.
-- Money convention: integer shillings (bigint) everywhere.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [squashed] 20260723000000_0001_tenancy.sql
-- ----------------------------------------------------------------------------
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
  price_monthly bigint not null check (price_monthly >= 0), -- shillings
  price_yearly bigint not null check (price_yearly >= 0),   -- shillings
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
  variance_notification_threshold bigint not null default 100, -- shillings
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

-- ----------------------------------------------------------------------------
-- [squashed] 20260723001000_0002_auth_hooks.sql
-- ----------------------------------------------------------------------------
-- 0002_auth_hooks.sql
-- custom_access_token hook (company_id + role + platform-admin claims) and
-- send_sms hook (TextSMS via pg_net, async — immune to the 5s HTTP-hook timeout).
--
-- Both hooks are Postgres functions invoked by GoTrue (supabase_auth_admin role).
-- Constraints honoured here (see plan §5.2/§5.3):
--   - token hook runs on EVERY token issue/refresh with a 2s budget -> the
--     membership lookup is a single indexed read, nothing else.
--   - hook failure blocks auth -> the token hook never raises; it returns the
--     event unchanged on any unexpected state.
-- Wired in config.toml ([auth.hook.custom_access_token], [auth.hook.send_sms]).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- platform_admins: super-admin identities (email/password users).
-- Service-role only; read by the token hook.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security; -- no policies: service role + hook only

-- ---------------------------------------------------------------------------
-- custom_access_token_hook
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  -- Single indexed lookup. A user belongs to at most one company in the
  -- current model; earliest approved membership wins if data says otherwise.
  select m.company_id, r.name
    into v_company_id, v_role_name
  from public.company_memberships m
  left join public.roles r on r.id = m.role_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
  order by m.created_at asc
  limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role_name, '')));
  end if;

  select exists (
    select 1 from public.platform_admins p
    where p.user_id = (event ->> 'user_id')::uuid
  ) into v_is_platform_admin;

  if v_is_platform_admin then
    v_claims := jsonb_set(v_claims, '{is_platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- send_sms_hook
-- Payload: event->'user'->>'phone' (E.164), event->'sms'->>'otp'.
-- Delivery is fire-and-forget via pg_net; delivery failures land in
-- net._http_response for monitoring (OTP resend is user-driven).
-- Without configured secrets the hook is a no-op so local dev logins
-- still work (codes visible in the GoTrue logs / test_otp map).
-- ---------------------------------------------------------------------------
create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_phone text := event #>> '{user,phone}';
  v_otp text := event #>> '{sms,otp}';
  v_api_key text;
  v_partner_id text;
  v_shortcode text;
  v_mobile text;
begin
  select max(case when name = 'TEXTSMS_API_KEY' then decrypted_secret end),
         max(case when name = 'TEXTSMS_PARTNER_ID' then decrypted_secret end),
         max(case when name = 'TEXTSMS_SHORTCODE' then decrypted_secret end)
    into v_api_key, v_partner_id, v_shortcode
  from vault.decrypted_secrets
  where name in ('TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE');

  if v_api_key is null or v_partner_id is null or v_shortcode is null
     or v_api_key = 'dev-disabled' then
    raise notice 'send_sms_hook: TextSMS secrets not configured; OTP for % not delivered', v_phone;
    return event;
  end if;

  -- GoTrue sends E.164 (+2547...); TextSMS expects 2547... (no plus).
  v_mobile := ltrim(v_phone, '+');

  perform net.http_post(
    url := 'https://sms.textsms.co.ke/api/services/sendotp/',
    body := jsonb_build_object(
      'apikey', v_api_key,
      'partnerID', v_partner_id,
      'shortcode', v_shortcode,
      'mobile', v_mobile,
      'message', 'Your Dukahub verification code is: ' || v_otp
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hook permissions (per Supabase docs): only supabase_auth_admin may execute.
-- The token hook reads tenant tables, which are RLS-protected, so
-- supabase_auth_admin gets its own read policies.
-- ---------------------------------------------------------------------------
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
revoke execute on function public.send_sms_hook(jsonb) from authenticated, anon, public;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

grant select on public.company_memberships to supabase_auth_admin;
grant select on public.roles to supabase_auth_admin;
grant select on public.platform_admins to supabase_auth_admin;

create policy "auth admin reads memberships for token hook"
  on public.company_memberships for select
  to supabase_auth_admin
  using (true);

create policy "auth admin reads roles for token hook"
  on public.roles for select
  to supabase_auth_admin
  using (true);

create policy "auth admin reads platform admins for token hook"
  on public.platform_admins for select
  to supabase_auth_admin
  using (true);

-- ----------------------------------------------------------------------------
-- [squashed] 20260723002000_0003_provisioning.sql
-- ----------------------------------------------------------------------------
-- 0003_provisioning.sql
-- ledger_accounts (21 seeded per company), payment_methods config, stock_locations,
-- and the provision_company RPC that replaces the 6 Vendure provisioner services
-- (services/auth/provisioning/) with a single transaction.

-- ---------------------------------------------------------------------------
-- ledger_accounts — verbatim port of backend/src/ledger/account.entity.ts.
-- Money stays bigint shillings on journal lines (added with journal tables in the
-- POS phase); accounts carry no balances (derived).
-- ---------------------------------------------------------------------------
create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code varchar(64) not null,
  name varchar(256) not null,
  type varchar(16) not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id uuid references public.ledger_accounts (id),
  is_parent boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create index ledger_accounts_company_idx on public.ledger_accounts (company_id);

-- ---------------------------------------------------------------------------
-- payment_methods — per-company config (was Vendure PaymentMethod custom
-- fields + channel-suffixed codes like 'mpesa-2').
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (code in ('cash', 'mpesa', 'bank', 'credit')),
  name text not null,
  ledger_account_code varchar(64) not null,
  reconciliation_type text not null
    check (reconciliation_type in ('blind_count', 'transaction_verification', 'statement_match', 'credit_ledger')),
  is_cashier_controlled boolean not null default false,
  requires_reconciliation boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------------------------------------------------------------------------
-- stock_locations — one default store per company today.
-- ---------------------------------------------------------------------------
create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

alter table public.ledger_accounts enable row level security;
alter table public.payment_methods enable row level security;
alter table public.stock_locations enable row level security;

create policy "ledger accounts readable by members"
  on public.ledger_accounts for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "payment methods readable by members"
  on public.payment_methods for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "stock locations readable by members"
  on public.stock_locations for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.ledger_accounts to authenticated;
grant select on public.payment_methods to authenticated;
grant select on public.stock_locations to authenticated;
grant all on public.ledger_accounts to service_role;
grant all on public.payment_methods to service_role;
grant all on public.stock_locations to service_role;

-- ---------------------------------------------------------------------------
-- provision_company
-- Called via RPC by an authenticated user right after first OTP login.
-- One transaction: company + admin role (all 14 permissions) + membership +
-- default store + 21 ledger accounts + 4 payment methods.
-- security definer so it can write across RLS; hardened with search_path = ''.
-- ---------------------------------------------------------------------------
create or replace function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_code text;
  v_role_id uuid;
  v_cash_parent uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_company_name is null or length(trim(p_company_name)) < 2 then
    raise exception 'invalid_company_name';
  end if;

  -- One company per user in the current model (matches the token hook).
  if exists (select 1 from public.company_memberships where user_id = v_user_id) then
    raise exception 'already_provisioned';
  end if;

  -- Company code: 8 alphanumeric chars from the name + 4-char uniqueness suffix.
  v_code := left(upper(regexp_replace(p_company_name, '[^A-Za-z0-9]', '', 'g')), 8)
            || upper(substr(md5(v_user_id::text), 1, 4));

  insert into public.companies (
    code, name, currency, status,
    subscription_tier_id, subscription_status, trial_ends_at
  )
  values (
    v_code, trim(p_company_name), p_currency, 'unapproved',
    (select id from public.subscription_tiers where code = 'trial' limit 1),
    'trial',
    now() + interval '30 days' -- SUBSCRIPTION_TRIAL_DAYS default; platform-adjustable
  )
  returning id into v_company_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Admin', array[
    'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
    'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
    'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
    'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
    'CreateInterAccountTransfer'
  ])
  returning id into v_role_id;

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, v_role_id, 'approved');

  insert into public.stock_locations (company_id, code, name)
  values (v_company_id, 'MAIN', coalesce(nullif(trim(p_store_name), ''), 'Main Store'));

  -- Chart of accounts: 21 accounts (backend/src/ledger/account-codes.constants.ts).
  insert into public.ledger_accounts (company_id, code, name, type, is_parent, is_system)
  values (v_company_id, 'CASH', 'Cash', 'asset', true, true)
  returning id into v_cash_parent;

  insert into public.ledger_accounts (company_id, code, name, type, parent_id, is_system)
  values
    -- assets: cash-based sub-accounts under CASH
    (v_company_id, 'CASH_ON_HAND', 'Cash on Hand', 'asset', v_cash_parent, true),
    (v_company_id, 'BANK_MAIN', 'Bank - Main', 'asset', v_cash_parent, true),
    (v_company_id, 'MPESA', 'M-Pesa', 'asset', v_cash_parent, true),
    -- standalone assets
    (v_company_id, 'CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', null, true),
    (v_company_id, 'CLEARING_GENERIC', 'Clearing - Generic', 'asset', null, true),
    (v_company_id, 'ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', null, true),
    (v_company_id, 'INVENTORY', 'Inventory', 'asset', null, true),
    -- income (SALES_RETURNS is contra-revenue by design)
    (v_company_id, 'SALES', 'Sales Revenue', 'income', null, true),
    (v_company_id, 'SALES_RETURNS', 'Sales Returns', 'income', null, true),
    -- liabilities
    (v_company_id, 'ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', null, true),
    (v_company_id, 'TAX_PAYABLE', 'Taxes Payable', 'liability', null, true),
    -- expenses
    (v_company_id, 'PURCHASES', 'Inventory Purchases', 'expense', null, true),
    (v_company_id, 'EXPENSES', 'General Expenses', 'expense', null, true),
    (v_company_id, 'PROCESSOR_FEES', 'Payment Processor Fees', 'expense', null, true),
    (v_company_id, 'CASH_SHORT_OVER', 'Cash Short/Over', 'expense', null, true),
    (v_company_id, 'COGS', 'Cost of Goods Sold', 'expense', null, true),
    (v_company_id, 'INVENTORY_WRITE_OFF', 'Inventory Write-Off', 'expense', null, true),
    (v_company_id, 'EXPIRY_LOSS', 'Expiry Loss', 'expense', null, true),
    (v_company_id, 'INVENTORY_ADJUSTMENT', 'Inventory Adjustment', 'expense', null, true),
    -- equity
    (v_company_id, 'BALANCE_ADJUSTMENT', 'Balance Adjustment', 'equity', null, true);

  -- Real money accounts are manually transactable; everything else is
  -- system-only. (Column added in 0029; plpgsql resolves it at execution.)
  update public.ledger_accounts
  set allow_manual_posting = true
  where company_id = v_company_id and code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA');

  -- Payment methods (payment-provisioner.service.ts defaults).
  insert into public.payment_methods (
    company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled
  )
  values
    (v_company_id, 'cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true),
    (v_company_id, 'mpesa', 'M-Pesa', 'MPESA', 'transaction_verification', true),
    (v_company_id, 'bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false),
    (v_company_id, 'credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false);

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company(text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260723003000_0004_pos.sql
-- ----------------------------------------------------------------------------
-- 0004_pos.sql
-- The heart: catalog, customers, orders (draft/parked/completed/voided),
-- FIFO inventory, journal tables, and the atomic sale functions.
--
-- Fidelity notes (vs backend/src/services/financial/ledger-posting.service.ts):
--   - Sale revenue posts GROSS (tax-inclusive) to SALES; no VAT split (as today).
--   - Credit sale = DR ACCOUNTS_RECEIVABLE / CR SALES (no CLEARING_CREDIT hop).
--   - COGS = DR COGS / CR INVENTORY with per-batch integer-rounded allocations.
--   - Reversal = one entry with per-account swapped totals of all lines of the order.
-- Improvements over the old implementation:
--   - order_id is a real column on journal lines (was meta jsonb digging).
--   - entry_date is Africa/Nairobi business date (was server UTC).
--   - insufficient stock REJECTS the sale atomically (was: silent COGS skip).
--   - integer-safe COGS (was: fractional-cent risk with fractional quantities).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- customers (suppliers are customers with is_supplier; supplier-credit
-- fields arrive with the credit phase)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  is_supplier boolean not null default false,
  -- customer credit
  credit_limit bigint not null default 0,
  credit_terms_days integer,
  is_credit_approved boolean not null default false,
  credit_approved_by uuid,
  last_repayment_date date,
  last_repayment_amount bigint,
  payment_terms text,
  notifications_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_idx on public.customers (company_id);

-- ---------------------------------------------------------------------------
-- products — one row per sellable SKU (Vendure options were a workaround).
-- price/wholesale_price are bigint shillings, tax-inclusive.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  sku text not null,
  barcode text,
  price bigint not null check (price >= 0),
  wholesale_price bigint check (wholesale_price >= 0),
  allow_fractional boolean not null default false,
  track_inventory boolean not null default true,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

create index products_company_idx on public.products (company_id);
create index products_search_idx on public.products using gin (
  (name || ' ' || coalesce(barcode, '') || ' ' || sku) gin_trgm_ops
);
create unique index products_barcode_idx on public.products (company_id, barcode)
  where barcode is not null;

-- ---------------------------------------------------------------------------
-- inventory_batches + movements (FIFO by purchased_at; stock is DERIVED
-- from sum(remaining), never stored)
-- ---------------------------------------------------------------------------
create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  stock_location_id uuid references public.stock_locations (id),
  supplier_id uuid references public.customers (id),
  quantity numeric(14,3) not null check (quantity > 0),
  remaining numeric(14,3) not null check (remaining >= 0),
  unit_cost bigint not null check (unit_cost >= 0), -- shillings per unit
  purchased_at timestamptz not null default now(),
  expiry_date date,
  created_at timestamptz not null default now()
);

create index inventory_batches_fifo_idx
  on public.inventory_batches (company_id, product_id, purchased_at)
  where remaining > 0;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  batch_id uuid references public.inventory_batches (id),
  type text not null check (type in ('purchase', 'sale', 'adjustment', 'reversal')),
  quantity numeric(14,3) not null, -- signed: in positive, out negative
  unit_cost bigint,
  total_cost bigint,
  source_type text,
  source_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index inventory_movements_product_idx on public.inventory_movements (company_id, product_id);

-- ---------------------------------------------------------------------------
-- orders / order_lines / payments
-- ---------------------------------------------------------------------------
create sequence public.order_code_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers (id),
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'completed', 'voided')),
  total bigint not null default 0,
  is_credit_sale boolean not null default false,
  cashier_pending_at timestamptz,
  cashier_session_id uuid, -- FK added with the cashier phase
  created_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create index orders_company_status_idx on public.orders (company_id, status, created_at desc);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  custom_price bigint check (custom_price >= 0),
  price_override_reason text,
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index order_lines_order_idx on public.order_lines (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  method_code text not null,
  amount bigint not null check (amount > 0),
  reference text,
  mpesa_receipt text,
  status text not null default 'settled' check (status in ('settled', 'cancelled')),
  created_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);

-- ---------------------------------------------------------------------------
-- journal tables (verbatim port; order_id added as a real column)
-- ---------------------------------------------------------------------------
create table public.ledger_journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  entry_date date not null,
  posted_at timestamptz not null default now(),
  source_type varchar(64) not null,
  source_id varchar(128) not null,
  reversal_of uuid references public.ledger_journal_entries (id),
  memo text,
  created_at timestamptz not null default now(),
  unique (company_id, source_type, source_id)
);

create table public.ledger_journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ledger_journal_entries (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null references public.ledger_accounts (id),
  order_id uuid references public.orders (id),
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  meta jsonb not null default '{}',
  check (debit = 0 or credit = 0)
);

create index journal_lines_entry_idx on public.ledger_journal_lines (entry_id);
create index journal_lines_account_idx on public.ledger_journal_lines (company_id, account_id);
create index journal_lines_order_idx on public.ledger_journal_lines (order_id) where order_id is not null;
create index journal_lines_meta_idx on public.ledger_journal_lines using gin (meta);

-- ---------------------------------------------------------------------------
-- RLS + grants (writes via RPC only)
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_journal_entries enable row level security;
alter table public.ledger_journal_lines enable row level security;

-- Template policies: members read their company's rows; platform admins read all.
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'products', 'inventory_batches', 'inventory_movements',
    'orders', 'order_lines', 'payments', 'ledger_journal_entries', 'ledger_journal_lines'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (
         company_id = (select public.current_company_id()) or (select public.is_platform_admin()))',
      t || ' readable by members', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Realtime for POS screens (replaces the SSE cache-sync plugin).
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.products;

-- ---------------------------------------------------------------------------
-- Permission helper: checks the caller's role (from JWT claims) against the
-- company roles table. Used by RPCs for OverridePrice / ReverseOrder etc.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.roles r
    where r.company_id = (select public.current_company_id())
      and r.name = (select public.current_role_name())
      and p_permission = any (r.permissions)
  )
$$;

-- ---------------------------------------------------------------------------
-- post_journal_entry: validated double-entry posting.
-- p_lines: jsonb array of {account_code, debit, credit, order_id?, meta?}
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0),
         coalesce(sum((l ->> 'credit')::bigint), 0)
    into v_debit_sum, v_credit_sum
  from jsonb_array_elements(p_lines) l;

  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
  values (
    p_company_id,
    coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date),
    p_source_type, p_source_id, p_memo
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line ->> 'debit')::bigint, 0);
    v_credit := coalesce((v_line ->> 'credit')::bigint, 0);

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = p_company_id
      and a.code = v_line ->> 'account_code'
      and a.is_active
      and not a.is_parent;

    if v_account_id is null then
      raise exception 'unknown_account: %', v_line ->> 'account_code';
    end if;

    insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
    values (
      v_entry_id, p_company_id, v_account_id,
      nullif(v_line ->> 'order_id', '')::uuid,
      v_debit, v_credit,
      coalesce(v_line -> 'meta', '{}'::jsonb)
    );
  end loop;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- consume_fifo: oldest-batch-first consumption. Integer-safe per-batch
-- rounding (each allocation cost = round(qty * unit_cost); total = sum).
-- Returns {allocations: [...], total_cogs: int}. Raises insufficient_stock.
-- ---------------------------------------------------------------------------
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
begin
  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and product_id = p_product_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock: product % has % available, % requested',
      p_product_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and product_id = p_product_id and remaining > 0
    order by purchased_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;

    update public.inventory_batches
    set remaining = remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_movements (
      company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    values (
      p_company_id, p_product_id, v_batch.id, 'sale', -v_take, v_batch.unit_cost, v_cost,
      p_source_type, p_source_id
    );

    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost
    );
  end loop;

  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_order (internal): stock + payments + ledger for an order that is
-- being finalized (direct sale, draft conversion, or cashier settle).
-- p_payments: jsonb array of {method, amount, reference?}.
-- Credit sale: p_payments = '[]' or single entry with method 'credit'.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_journal_lines jsonb := '[]'::jsonb;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entry: DR per-method clearing (or AR for credit) / CR SALES, gross.
  if v_is_credit then
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
    );
  else
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
      from public.payment_methods pm
      where pm.company_id = v_order.company_id and pm.code = v_payment ->> 'method';

      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'),
        'debit', (v_payment ->> 'amount')::bigint, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', v_payment ->> 'method', 'reference', v_payment ->> 'reference'
        )
      );
    end loop;
  end if;

  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
    'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
  );

  perform public.post_journal_entry(
    v_order.company_id,
    case when v_is_credit then 'CreditSale' else 'Payment' end,
    p_order_id::text,
    case when v_is_credit then 'Credit sale ' else 'Sale ' end || v_order.code,
    v_journal_lines
  );

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

-- save_draft: proforma / parked cart. No stock, no ledger.
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb, -- [{product_id, quantity, unit_price, custom_price?, override_reason?}]
  p_draft_id uuid default null -- update an existing draft
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    insert into public.order_lines (
      order_id, company_id, product_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'product_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  return v_order_id;
end;
$$;

-- post_sale: create + complete in one call. p_payments '[]' => credit sale.
-- p_park = true => pending_payment (cashier queue); settle later.
create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

-- convert_draft: proforma -> completed sale.
create or replace function public.convert_draft(
  p_order_id uuid,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$$;

-- settle_order: cashier collects a parked order.
create or replace function public.settle_order(
  p_order_id uuid,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$$;

-- void_sale: reverse an order — swapped-totals journal reversal + batch restore.
create or replace function public.void_sale(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  -- Swapped per-account totals of all journal lines belonging to this order.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_debit = 0 and v_account.total_credit = 0 then
      continue;
    end if;

    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code',
      (select code from public.ledger_accounts where id = v_account.account_id),
      'debit', v_account.total_credit,
      'credit', v_account.total_debit,
      'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
    );
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  -- Restore FIFO batches from the recorded COGS allocations.
  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.product_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

-- RPC grants (security definer; authenticated callers only)
revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean) from anon, public;
revoke execute on function public.convert_draft(uuid, jsonb) from anon, public;
revoke execute on function public.settle_order(uuid, jsonb) from anon, public;
revoke execute on function public.void_sale(uuid, text) from anon, public;

grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.convert_draft(uuid, jsonb) to authenticated;
grant execute on function public.settle_order(uuid, jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- Internal helpers are not callable by clients.
revoke execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) from authenticated, anon, public;
revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text) from authenticated, anon, public;
revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) to service_role;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text) to service_role;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801000000_0005_customer_gaps.sql
-- ----------------------------------------------------------------------------
-- 0005_customer_gaps.sql
-- Fixes two gaps found during POS screen integration:
--   1. No client-reachable way to create customers (writes are RPC-only).
--   2. Credit sales were permitted without a customer — AR lines with no
--      debtor attached. Now enforced inside complete_order.

-- ---------------------------------------------------------------------------
-- create_customer RPC (minimal; credit fields managed separately in Phase 4)
-- ---------------------------------------------------------------------------
create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text) from anon, public;
grant execute on function public.create_customer(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: enforce that credit sales have a customer.
-- (Full-body replace; only the marked block is new.)
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_journal_lines jsonb := '[]'::jsonb;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  -- NEW: a credit sale without a debtor is meaningless AR.
  if v_is_credit and v_order.customer_id is null then
    raise exception 'credit_requires_customer';
  end if;

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entry: DR per-method clearing (or AR for credit) / CR SALES, gross.
  if v_is_credit then
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
    );
  else
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
      from public.payment_methods pm
      where pm.company_id = v_order.company_id and pm.code = v_payment ->> 'method';

      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'),
        'debit', (v_payment ->> 'amount')::bigint, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', v_payment ->> 'method', 'reference', v_payment ->> 'reference'
        )
      );
    end loop;
  end if;

  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
    'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
  );

  perform public.post_journal_entry(
    v_order.company_id,
    case when v_is_credit then 'CreditSale' else 'Payment' end,
    p_order_id::text,
    case when v_is_credit then 'Credit sale ' else 'Sale ' end || v_order.code,
    v_journal_lines
  );

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801001000_0006_sale_idempotency.sql
-- ----------------------------------------------------------------------------
-- 0006_sale_idempotency.sql
-- Offline-queue support: client-generated idempotency refs on post_sale.
-- A queued offline sale carries a client_ref (uuid generated on the device);
-- replaying it after an ambiguous network failure returns the original order
-- instead of double-posting. Exactly-once without server sessions.

alter table public.orders add column client_ref text;

create unique index orders_client_ref_unique
  on public.orders (company_id, client_ref)
  where client_ref is not null;

-- post_sale gains p_client_ref. Postgres treats this as a new signature, so
-- the old 4-arg function is dropped to avoid PostgREST overload ambiguity.
drop function public.post_sale(uuid, jsonb, jsonb, boolean);

create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_existing uuid;
begin
  -- Idempotent replay: this client_ref already posted.
  if p_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = p_client_ref;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_client_ref is not null then
    begin
      update public.orders set client_ref = p_client_ref where id = v_order_id;
    exception when unique_violation then
      -- Concurrent post with the same ref won the race. Our row is a fresh
      -- draft with no stock/ledger side effects yet, so it is safe to drop.
      delete from public.orders where id = v_order_id;

      select id into v_existing
      from public.orders
      where company_id = v_company_id and client_ref = p_client_ref;

      return v_existing;
    end;
  end if;

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) from anon, public;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801002000_0007_money_ops.sql
-- ----------------------------------------------------------------------------
-- 0007_money_ops.sql
-- Expenses, inter-account transfers, refunds, payment reversals, and manual
-- balance adjustments. Faithful to ledger-posting.service.ts except:
--   - source_type casing standardized to PascalCase (ETL maps legacy strings)
--   - refunds table added for tracking (was: journal entry only)
--   - transfers tag the open cashier session when one exists but do not
--     REQUIRE it yet (the session requirement lands with cashier sessions;
--     today transfers would be untestable without them)
-- money_event is deliberately omitted: dead code upstream (no readers/writers).

-- ---------------------------------------------------------------------------
-- refunds (tracking rows; journal via post_refund)
-- ---------------------------------------------------------------------------
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null references public.orders (id),
  amount bigint not null check (amount > 0),
  method_code text not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index refunds_order_idx on public.refunds (order_id);

alter table public.refunds enable row level security;

create policy "refunds readable by members"
  on public.refunds for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.refunds to authenticated;
grant all on public.refunds to service_role;

-- ---------------------------------------------------------------------------
-- post_journal_entry: make posting idempotent on (company, source_type,
-- source_id) — matches the old PostingService.post contract. A duplicate
-- source returns the existing entry instead of raising unique_violation.
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0),
         coalesce(sum((l ->> 'credit')::bigint), 0)
    into v_debit_sum, v_credit_sum
  from jsonb_array_elements(p_lines) l;

  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  begin
    insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
    values (
      p_company_id,
      coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date),
      p_source_type, p_source_id, p_memo
    )
    returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
    from public.ledger_journal_entries e
    where e.company_id = p_company_id
      and e.source_type = p_source_type
      and e.source_id = p_source_id;

    return v_entry_id; -- already posted; idempotent replay
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line ->> 'debit')::bigint, 0);
    v_credit := coalesce((v_line ->> 'credit')::bigint, 0);

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = p_company_id
      and a.code = v_line ->> 'account_code'
      and a.is_active
      and not a.is_parent;

    if v_account_id is null then
      raise exception 'unknown_account: %', v_line ->> 'account_code';
    end if;

    insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
    values (
      v_entry_id, p_company_id, v_account_id,
      nullif(v_line ->> 'order_id', '')::uuid,
      v_debit, v_credit,
      coalesce(v_line -> 'meta', '{}'::jsonb)
    );
  end loop;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account validation helper: asset, leaf (non-parent), active.
-- ---------------------------------------------------------------------------
create or replace function public.require_asset_leaf_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.ledger_accounts a
  where a.company_id = p_company_id
    and a.code = p_code
    and a.type = 'asset'
    and a.is_active
    and not a.is_parent;

  if v_id is null then
    raise exception 'invalid_source_account: %', p_code;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_expense: DR EXPENSES / CR source asset account.
-- ---------------------------------------------------------------------------
create or replace function public.post_expense(
  p_amount bigint,
  p_source_account_code text,
  p_category text default 'other',
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_source_account_code);

  return public.post_journal_entry(
    v_company_id, 'Expense', 'expense-' || gen_random_uuid(),
    coalesce(p_memo, 'Expense (' || coalesce(p_category, 'other') || ')'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'EXPENSES', 'debit', p_amount,
        'meta', jsonb_build_object('sourceAccountCode', p_source_account_code, 'expenseCategory', coalesce(p_category, 'other'))
      ),
      jsonb_build_object('account_code', p_source_account_code, 'credit', p_amount, 'meta', '{}')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_transfer: inter-account transfer with optional processor fee.
-- p_transfer_id is the client idempotency key.
-- ---------------------------------------------------------------------------
create or replace function public.post_transfer(
  p_from_account_code text,
  p_to_account_code text,
  p_principal bigint,
  p_fee bigint default 0,
  p_transfer_id text default null,
  p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
  v_session_meta jsonb;
  v_transfer_id text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CreateInterAccountTransfer') then
    raise exception 'permission_denied: CreateInterAccountTransfer required';
  end if;

  if p_principal is null or p_principal <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_from_account_code = p_to_account_code then
    raise exception 'invalid_transfer: source and destination must differ';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_from_account_code);
  perform public.require_asset_leaf_account(v_company_id, p_to_account_code);

  v_transfer_id := nullif(trim(coalesce(p_transfer_id, '')), '');
  if v_transfer_id is null then
    raise exception 'transfer_id_required';
  end if;

  -- Tag the open cashier session if one exists (required once sessions land).
  v_session_meta := '{}'::jsonb;

  if coalesce(p_fee, 0) > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_to_account_code, 'debit', p_principal, 'meta', v_session_meta),
      jsonb_build_object('account_code', 'PROCESSOR_FEES', 'debit', p_fee,
        'meta', v_session_meta || jsonb_build_object('expenseTag', 'transaction_fee')),
      jsonb_build_object('account_code', p_from_account_code, 'credit', p_principal + p_fee, 'meta', v_session_meta)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_to_account_code, 'debit', p_principal, 'meta', v_session_meta),
      jsonb_build_object('account_code', p_from_account_code, 'credit', p_principal, 'meta', v_session_meta)
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InterAccountTransfer', v_transfer_id,
    coalesce(p_memo, 'Transfer ' || p_from_account_code || ' -> ' || p_to_account_code),
    v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_refund: DR SALES_RETURNS / CR clearing account. No tax/COGS/AR
-- interaction (faithful to the old postRefund).
-- ---------------------------------------------------------------------------
create or replace function public.post_refund(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_refund_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.refunds (company_id, order_id, amount, method_code, reason, created_by)
  values (v_company_id, p_order_id, p_amount, p_method_code, p_reason, auth.uid())
  returning id into v_refund_id;

  return public.post_journal_entry(
    v_company_id, 'Refund', v_refund_id::text,
    'Refund for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALES_RETURNS', 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      ),
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', p_method_code)
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_payment_reversal: mirror-image reversal of a Payment/PaymentAllocation
-- entry, keyed by payment id. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_reversal(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_entry record;
  v_existing uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_existing
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';

  if v_existing is not null then
    return v_existing; -- idempotent
  end if;

  select * into v_entry
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;

  if v_entry is null then
    raise exception 'original_entry_not_found: %', p_payment_id;
  end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  -- post_journal_entry can't set reversal_of; insert entry directly via a
  -- wrapper below.
  return public.post_reversal_entry(
    v_company_id, 'PaymentReversal', p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text, v_reversal_lines, v_entry.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_order: post ONE Payment entry per payment (source_id = payment id),
-- matching the old postPayment granularity (needed for payment-level reversal
-- and M-Pesa transaction verification). Full-body replace.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_payment_row record;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_journal_lines jsonb := '[]'::jsonb;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  -- A credit sale without a debtor is meaningless AR.
  if v_is_credit and v_order.customer_id is null then
    raise exception 'credit_requires_customer';
  end if;

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entries.
  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    -- One Payment entry per payment row (source_id = payment id).
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- post_reversal_entry: post_journal_entry variant that records reversal_of.
-- ---------------------------------------------------------------------------
create or replace function public.post_reversal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_reversal_of uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  v_entry_id := public.post_journal_entry(p_company_id, p_source_type, p_source_id, p_memo, p_lines);

  update public.ledger_journal_entries
  set reversal_of = p_reversal_of
  where id = v_entry_id;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_balance_adjustment: manual customer AR correction.
-- p_amount signed: positive = customer owes more; negative = forgive.
-- ---------------------------------------------------------------------------
create or replace function public.post_balance_adjustment(
  p_customer_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('OverrideCustomerBalance') then
    raise exception 'permission_denied: OverrideCustomerBalance required';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'ACCOUNTS_RECEIVABLE', 'debit', p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'credit', p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'debit', -p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'ACCOUNTS_RECEIVABLE', 'credit', -p_amount,
        'meta', jsonb_build_object('customerId', p_customer_id, 'reason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'BalanceAdjustment', 'balance-adj-' || gen_random_uuid(),
    coalesce(p_reason, 'Customer balance adjustment'), v_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_supplier_balance_adjustment: manual AP correction.
-- p_amount signed: positive = we owe more; negative = reduce what we owe.
-- ---------------------------------------------------------------------------
create or replace function public.post_supplier_balance_adjustment(
  p_supplier_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;

  if p_amount > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'debit', p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'credit', p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'ACCOUNTS_PAYABLE', 'debit', -p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason)),
      jsonb_build_object('account_code', 'BALANCE_ADJUSTMENT', 'credit', -p_amount,
        'meta', jsonb_build_object('supplierId', p_supplier_id, 'reason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'SupplierBalanceAdjustment', 'supplier-balance-adj-' || gen_random_uuid(),
    coalesce(p_reason, 'Supplier balance adjustment'), v_lines
  );
end;
$$;

-- Grants
do $$
declare
  f text;
begin
  foreach f in array array[
    'post_expense(bigint, text, text, text)',
    'post_transfer(text, text, bigint, bigint, text, text)',
    'post_refund(uuid, bigint, text, text)',
    'post_payment_reversal(uuid)',
    'post_balance_adjustment(uuid, bigint, text)',
    'post_supplier_balance_adjustment(uuid, bigint, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke execute on function public.require_asset_leaf_account(uuid, text) from authenticated, anon, public;
revoke execute on function public.post_reversal_entry(uuid, text, text, text, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.require_asset_leaf_account(uuid, text) to service_role;
grant execute on function public.post_reversal_entry(uuid, text, text, text, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801003000_0008_customer_credit.sql
-- ----------------------------------------------------------------------------
-- 0008_customer_credit.sql
-- Customer credit: AR repayment allocations with the per-order AR invariant,
-- plus credit validation at sale time (approved customer + credit limit).
-- Deviation from upstream (noted): over-limit / unapproved credit sales
-- hard-fail here; the approval-request workflow (overdraft approvals) is a
-- later phase, matching the plan's approvals table.

-- ---------------------------------------------------------------------------
-- post_payment_allocation: DR clearing / CR ACCOUNTS_RECEIVABLE with the
-- per-order invariant (at least one AR debit exists; credits <= debits).
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_allocation(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_payment_id uuid;
  v_ar_debits bigint;
  v_ar_credits bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.payments (company_id, order_id, method_code, amount, reference)
  values (v_company_id, p_order_id, p_method_code, p_amount, p_reference)
  returning id into v_payment_id;

  perform public.post_journal_entry(
    v_company_id, 'PaymentAllocation', v_payment_id::text,
    'Credit repayment for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code, 'reference', p_reference
        )
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECEIVABLE', 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      )
    )
  );

  -- Per-order AR invariant (same transaction, so this allocation is visible).
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    into v_ar_debits, v_ar_credits
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.order_id = p_order_id;

  if v_ar_debits = 0 then
    raise exception 'ar_allocation_without_debt: order % has no AR balance', p_order_id;
  end if;

  if v_ar_credits > v_ar_debits then
    raise exception 'ar_overpayment: order % AR credits % exceed debits %', p_order_id, v_ar_credits, v_ar_debits;
  end if;

  return v_payment_id;
end;
$$;

revoke execute on function public.post_payment_allocation(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_payment_allocation(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: credit-sale validation — approved customer, limit check
-- against current AR balance. Full-body replace (credit branch is new).
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    -- Current AR exposure for this customer (all orders).
    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_customer.credit_limit > 0
       and v_ar_balance + v_order.total > v_customer.credit_limit then
      raise exception 'credit_limit_exceeded: balance % + % > limit %',
        v_ar_balance, v_order.total, v_customer.credit_limit;
    end if;
  end if;

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entries.
  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801004000_0009_cashier_sessions.sql
-- ----------------------------------------------------------------------------
-- 0009_cashier_sessions.sql
-- Cashier sessions with blind cash control: opening/closing declarations,
-- variance posting (declared - expected vs full-ledger balance), drawer
-- counts, reconciliation records, M-Pesa verification records.
--
-- Faithful choices (per spec): expected = FULL-LEDGER account balance (not
-- opening+sales-payouts); opening declares become ledger truth via variance
-- deltas; M-Pesa verification is record-only (no ledger effect).
-- Improvements: orders link to the session via cashier_session_id (set by
-- trigger on completion) instead of meta->>'openSessionId' digging.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  cashier_user_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_declared bigint,
  created_at timestamptz not null default now()
);

-- One open session per company.
create unique index cashier_sessions_one_open
  on public.cashier_sessions (company_id) where status = 'open';

create table public.cash_drawer_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cashier_sessions (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  count_type text not null check (count_type in ('opening', 'closing', 'mid_shift')),
  declared_cash bigint not null,
  expected_cash bigint not null,
  variance bigint not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  scope text not null check (scope in ('cash-session', 'manual', 'method')),
  scope_ref_id text not null,
  status text not null default 'verified' check (status in ('verified', 'recorded')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.reconciliation_accounts (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations (id) on delete cascade,
  account_code text not null,
  declared bigint not null,
  expected bigint not null,
  variance bigint not null
);

create table public.mpesa_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  session_id uuid references public.cashier_sessions (id),
  all_confirmed boolean not null default false,
  flagged_ids jsonb not null default '[]',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.cashier_sessions enable row level security;
alter table public.cash_drawer_counts enable row level security;
alter table public.reconciliations enable row level security;
alter table public.reconciliation_accounts enable row level security;
alter table public.mpesa_verifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['cashier_sessions', 'cash_drawer_counts', 'reconciliations', 'mpesa_verifications']
  loop
    execute format(
      'create policy %I on public.%I for select using (
         company_id = (select public.current_company_id()) or (select public.is_platform_admin()))',
      t || ' readable by members', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- reconciliation_accounts are company-scoped through their parent.
create policy "reconciliation accounts readable by members"
  on public.reconciliation_accounts for select
  using (exists (
    select 1 from public.reconciliations r
    where r.id = reconciliation_id
      and (r.company_id = (select public.current_company_id()) or (select public.is_platform_admin()))
  ));

grant select on public.reconciliation_accounts to authenticated;
grant all on public.reconciliation_accounts to service_role;

-- Link completed orders to the open session (replaces openSessionId meta).
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.cashier_session_id is null then
    new.cashier_session_id := (
      select s.id from public.cashier_sessions s
      where s.company_id = new.company_id and s.status = 'open'
      limit 1
    );
  end if;
  return new;
end;
$$;

create trigger orders_tag_session
  before update on public.orders
  for each row execute function public.tag_order_session();

-- ---------------------------------------------------------------------------
-- Account balance helper (leaf accounts; balance = debits - credits).
-- ---------------------------------------------------------------------------
create or replace function public.account_balance(p_company_id uuid, p_code text)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.debit) - sum(l.credit), 0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = p_company_id and a.code = p_code
$$;

-- ---------------------------------------------------------------------------
-- post_variance_adjustment (internal): variance = declared - expected.
-- Shortage: DR CASH_SHORT_OVER / CR account. Overage: reverse.
-- ---------------------------------------------------------------------------
create or replace function public.post_variance_adjustment(
  p_company_id uuid,
  p_session_id text,
  p_account_code text,
  p_declared bigint,
  p_count_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected bigint;
  v_variance bigint;
  v_lines jsonb;
begin
  v_expected := public.account_balance(p_company_id, p_account_code);
  v_variance := p_declared - v_expected;

  if v_variance = 0 then
    return null;
  end if;

  if v_variance < 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'debit', -v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason)),
      jsonb_build_object('account_code', p_account_code, 'credit', -v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_account_code, 'debit', v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason)),
      jsonb_build_object('account_code', 'CASH_SHORT_OVER', 'credit', v_variance,
        'meta', jsonb_build_object('openSessionId', p_session_id, 'varianceReason', p_reason))
    );
  end if;

  return public.post_journal_entry(
    p_company_id, 'VarianceAdjustment',
    p_session_id || '-' || p_account_code || '-' || p_count_id,
    coalesce(p_reason, 'Cash variance ' || p_account_code),
    v_lines
  );
end;
$$;

revoke execute on function public.post_variance_adjustment(uuid, text, text, bigint, text, text) from authenticated, anon, public;
grant execute on function public.post_variance_adjustment(uuid, text, text, bigint, text, text) to service_role;
grant execute on function public.account_balance(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- open_cashier_session: declarations for every cashier-controlled account;
-- opening reconciliation + variance deltas.
-- p_declarations: [{account_code, declared}]
-- ---------------------------------------------------------------------------
create or replace function public.open_cashier_session(
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.cashier_sessions where company_id = v_company_id and status = 'open') then
    raise exception 'session_already_open';
  end if;

  -- Every cashier-controlled account must be declared.
  for v_required in
    select pm.ledger_account_code
    from public.payment_methods pm
    where pm.company_id = v_company_id and pm.is_cashier_controlled and pm.enabled
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then
      raise exception 'missing_declaration: %', v_required.ledger_account_code;
    end if;
  end loop;

  insert into public.cashier_sessions (company_id, cashier_user_id)
  values (v_company_id, auth.uid())
  returning id into v_session_id;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'cash-session', v_session_id::text || ':opening', 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  -- Opening drawer count record (cash account).
  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(p_declarations) d
  where d ->> 'account_code' = 'CASH_ON_HAND';

  if v_declared is not null then
    insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by)
    values (
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'),
      auth.uid()
    );
  end if;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_cashier_session: blind count, closing reconciliation, variance.
-- p_declarations: [{account_code, declared}] (cashier-controlled accounts).
-- ---------------------------------------------------------------------------
create or replace function public.close_cashier_session(
  p_session_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session record;
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_session
  from public.cashier_sessions
  where id = p_session_id and company_id = v_company_id and status = 'open'
  for update;

  if v_session is null then
    raise exception 'session_not_open: %', p_session_id;
  end if;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'cash-session', p_session_id::text || ':closing', 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, p_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Closing count variance'
    );

    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by)
    values (p_session_id, v_company_id, 'closing', v_cash_declared, v_cash_expected, v_cash_declared - v_cash_expected, auth.uid());
  end if;

  update public.cashier_sessions
  set status = 'closed', closed_at = now(), closing_declared = v_cash_declared
  where id = p_session_id;

  return p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_mpesa_verification: record-only (no ledger effect, as upstream).
-- ---------------------------------------------------------------------------
create or replace function public.record_mpesa_verification(
  p_session_id uuid,
  p_all_confirmed boolean,
  p_flagged_ids jsonb default '[]',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.mpesa_verifications (company_id, session_id, all_confirmed, flagged_ids, notes, created_by)
  values (v_company_id, p_session_id, p_all_confirmed, coalesce(p_flagged_ids, '[]'), p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.open_cashier_session(jsonb) from anon, public;
revoke execute on function public.close_cashier_session(uuid, jsonb) from anon, public;
revoke execute on function public.record_mpesa_verification(uuid, boolean, jsonb, text) from anon, public;
grant execute on function public.open_cashier_session(jsonb) to authenticated;
grant execute on function public.close_cashier_session(uuid, jsonb) to authenticated;
grant execute on function public.record_mpesa_verification(uuid, boolean, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801005000_0010_period_closing.sql
-- ----------------------------------------------------------------------------
-- 0010_period_closing.sql
-- Accounting periods + period locks, manual reconciliations, and period-end
-- closing. Faithful: NO closing entries (P&L never rolls to equity upstream);
-- the lock only blocks new entries with entry_date <= lock_end_date.

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, end_date)
);

create table public.period_locks (
  company_id uuid primary key references public.companies (id) on delete cascade,
  lock_end_date date not null,
  updated_at timestamptz not null default now()
);

alter table public.accounting_periods enable row level security;
alter table public.period_locks enable row level security;

create policy "periods readable by members"
  on public.accounting_periods for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "locks readable by members"
  on public.period_locks for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.accounting_periods to authenticated;
grant select on public.period_locks to authenticated;
grant all on public.accounting_periods to service_role;
grant all on public.period_locks to service_role;

-- ---------------------------------------------------------------------------
-- post_journal_entry: enforce the period lock. Full-body replace (only the
-- marked block is new; idempotency semantics preserved).
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_entry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_entry_date date;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0),
         coalesce(sum((l ->> 'credit')::bigint), 0)
    into v_debit_sum, v_credit_sum
  from jsonb_array_elements(p_lines) l;

  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  v_entry_date := coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date);

  -- NEW: period lock enforcement.
  if exists (
    select 1 from public.period_locks pl
    where pl.company_id = p_company_id and v_entry_date <= pl.lock_end_date
  ) then
    raise exception 'period_locked: entry date % is within a locked period', v_entry_date;
  end if;

  begin
    insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
    values (p_company_id, v_entry_date, p_source_type, p_source_id, p_memo)
    returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
    from public.ledger_journal_entries e
    where e.company_id = p_company_id
      and e.source_type = p_source_type
      and e.source_id = p_source_id;

    return v_entry_id; -- already posted; idempotent replay
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line ->> 'debit')::bigint, 0);
    v_credit := coalesce((v_line ->> 'credit')::bigint, 0);

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = p_company_id
      and a.code = v_line ->> 'account_code'
      and a.is_active
      and not a.is_parent;

    if v_account_id is null then
      raise exception 'unknown_account: %', v_line ->> 'account_code';
    end if;

    insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
    values (
      v_entry_id, p_company_id, v_account_id,
      nullif(v_line ->> 'order_id', '')::uuid,
      v_debit, v_credit,
      coalesce(v_line -> 'meta', '{}'::jsonb)
    );
  end loop;

  return v_entry_id;
end;
$$;

revoke execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) from authenticated, anon, public;
grant execute on function public.post_journal_entry(uuid, text, text, text, jsonb, date) to service_role;

-- ---------------------------------------------------------------------------
-- record_manual_reconciliation: the only reconciliation scope that POSTS —
-- one variance adjustment per account with non-zero declared - expected.
-- ---------------------------------------------------------------------------
create or replace function public.record_manual_reconciliation(
  p_declarations jsonb -- [{account_code, declared, reason?}]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'manual', 'manual-' || extract(epoch from now())::bigint, 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, 'manual', v_decl ->> 'account_code', v_declared,
      v_recon_id::text, coalesce(v_decl ->> 'reason', 'Manual reconciliation')
    );
  end loop;

  return v_recon_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_accounting_period: validations (upstream-shaped), upsert the lock,
-- record the period. No closing entries.
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_method record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;

  if p_end_date is null or p_end_date > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  select * into v_lock from public.period_locks where company_id = v_company_id;

  if v_lock is not null and p_end_date <= v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)', v_lock.lock_end_date;
  end if;

  -- No open cashier sessions.
  if exists (select 1 from public.cashier_sessions where company_id = v_company_id and status = 'open') then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  -- Every reconciliation-requiring payment method needs a verified
  -- reconciliation since the last lock.
  for v_method in
    select pm.code
    from public.payment_methods pm
    where pm.company_id = v_company_id and pm.requires_reconciliation and pm.enabled
    order by pm.code
  loop
    if not exists (
      select 1 from public.reconciliations r
      where r.company_id = v_company_id
        and r.status = 'verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period', v_method.code;
    end if;
  end loop;

  insert into public.period_locks (company_id, lock_end_date, updated_at)
  values (v_company_id, p_end_date, now())
  on conflict (company_id) do update set lock_end_date = p_end_date, updated_at = now();

  insert into public.accounting_periods (company_id, start_date, end_date, status, created_by)
  values (
    v_company_id,
    coalesce(v_lock.lock_end_date + 1, p_end_date),
    p_end_date,
    'closed',
    auth.uid()
  )
  returning id into v_period_id;

  return v_period_id;
end;
$$;

revoke execute on function public.record_manual_reconciliation(jsonb) from anon, public;
revoke execute on function public.close_accounting_period(date) from anon, public;
grant execute on function public.record_manual_reconciliation(jsonb) to authenticated;
grant execute on function public.close_accounting_period(date) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801006000_0011_supplier_credit.sql
-- ----------------------------------------------------------------------------
-- 0011_supplier_credit.sql
-- Supplier purchasing + AP payments, supplier credit limits, inventory
-- write-offs and value adjustments.
-- Decision (from spec review): the old system double-posted purchases
-- (PURCHASES/AP via SupplierPurchase AND INVENTORY/AP via InventoryPurchase).
-- Only the perpetual-inventory path is implemented here:
--   DR INVENTORY / CR ACCOUNTS_PAYABLE|cash. PURCHASES stays for ETL legacy.

-- Supplier credit fields (customer is also the supplier, as upstream).
alter table public.customers
  add column supplier_credit_limit bigint not null default 0,
  add column supplier_credit_terms_days integer;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_id uuid not null references public.customers (id),
  reference text,
  total_cost bigint not null check (total_cost > 0),
  is_credit boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index purchases_supplier_idx on public.purchases (company_id, supplier_id, created_at);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id),
  amount bigint not null check (amount > 0),
  account_code text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index purchase_payments_purchase_idx on public.purchase_payments (purchase_id);

alter table public.purchases enable row level security;
alter table public.purchase_payments enable row level security;

create policy "purchases readable by members"
  on public.purchases for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "purchase payments readable by members"
  on public.purchase_payments for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.purchases to authenticated;
grant select on public.purchase_payments to authenticated;
grant all on public.purchases to service_role;
grant all on public.purchase_payments to service_role;

-- ---------------------------------------------------------------------------
-- consume_fifo: parameterize the movement type (write-offs consume FIFO too).
-- ---------------------------------------------------------------------------
drop function public.consume_fifo(uuid, uuid, numeric, text, text);

create or replace function public.consume_fifo(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
begin
  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and product_id = p_product_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock: product % has % available, % requested',
      p_product_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and product_id = p_product_id and remaining > 0
    order by purchased_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;

    update public.inventory_batches
    set remaining = remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_movements (
      company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    values (
      p_company_id, p_product_id, v_batch.id, p_movement_type, -v_take, v_batch.unit_cost, v_cost,
      p_source_type, p_source_id
    );

    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost
    );
  end loop;

  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) from authenticated, anon, public;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- record_purchase: batches + purchase row + DR INVENTORY / CR AP|cash.
-- p_lines: [{product_id, quantity, unit_cost, expiry_date?}]
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record;
  v_purchase_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_batch_count int := 0;
  v_ap_balance bigint;
  v_location_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_supplier
  from public.customers
  where id = p_supplier_id and company_id = v_company_id and is_supplier;

  if v_supplier is null then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  v_total := 0;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_total := v_total + round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint);
  end loop;

  if v_total <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required';
    end if;

    -- Supplier credit limit vs current AP exposure.
    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id
      and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;

    if v_supplier.supplier_credit_limit > 0
       and v_ap_balance + v_total > v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit;
    end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  select id into v_location_id
  from public.stock_locations
  where company_id = v_company_id and code = 'MAIN'
  limit 1;

  insert into public.purchases (company_id, supplier_id, reference, total_cost, is_credit, created_by)
  values (v_company_id, p_supplier_id, p_reference, v_total, p_is_credit, auth.uid())
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_batch_count := v_batch_count + 1;

    insert into public.inventory_batches (
      company_id, product_id, stock_location_id, supplier_id,
      quantity, remaining, unit_cost, expiry_date
    )
    values (
      v_company_id, (v_line ->> 'product_id')::uuid, v_location_id, p_supplier_id,
      (v_line ->> 'quantity')::numeric, (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_cost')::bigint,
      nullif(v_line ->> 'expiry_date', '')::date
    );

    insert into public.inventory_movements (
      company_id, product_id, type, quantity, unit_cost,
      total_cost, source_type, source_id
    )
    values (
      v_company_id, (v_line ->> 'product_id')::uuid, 'purchase',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::bigint,
      round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint),
      'InventoryPurchase', v_purchase_id::text
    );
  end loop;

  perform public.post_journal_entry(
    v_company_id, 'InventoryPurchase', v_purchase_id::text,
    'Purchase ' || coalesce(p_reference, v_purchase_id::text),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'batchCount', v_batch_count
        )
      ),
      jsonb_build_object(
        'account_code', case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'isCreditPurchase', p_is_credit
        )
      )
    )
  );

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pay_supplier: oldest-unpaid-first allocation; AP invariant (no overpay).
-- ---------------------------------------------------------------------------
create or replace function public.pay_supplier(
  p_supplier_id uuid,
  p_amount bigint,
  p_account_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase record;
  v_remaining bigint := p_amount;
  v_unpaid_total bigint := 0;
  v_alloc bigint;
  v_payment_id uuid;
  v_last_payment_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_account_code);

  -- Total unpaid across credit purchases.
  select coalesce(sum(p.total_cost - coalesce(paid.s, 0)), 0) into v_unpaid_total
  from public.purchases p
  left join lateral (
    select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
  ) paid on true
  where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit;

  if v_unpaid_total = 0 then
    raise exception 'no_outstanding_ap: supplier %', p_supplier_id;
  end if;

  if p_amount > v_unpaid_total then
    raise exception 'ap_overpayment: % exceeds outstanding %', p_amount, v_unpaid_total;
  end if;

  -- Oldest unpaid first.
  for v_purchase in
    select p.id, p.reference, p.total_cost - coalesce(paid.s, 0) as unpaid
    from public.purchases p
    left join lateral (
      select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
    ) paid on true
    where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit
      and p.total_cost - coalesce(paid.s, 0) > 0
    order by p.created_at asc
  loop
    exit when v_remaining <= 0;

    v_alloc := least(v_purchase.unpaid, v_remaining);
    v_remaining := v_remaining - v_alloc;

    insert into public.purchase_payments (company_id, purchase_id, amount, account_code, created_by)
    values (v_company_id, v_purchase.id, v_alloc, p_account_code, auth.uid())
    returning id into v_payment_id;

    v_last_payment_id := v_payment_id;

    perform public.post_journal_entry(
      v_company_id, 'SupplierPayment', v_payment_id::text,
      'Supplier payment ' || coalesce(v_purchase.reference, v_purchase.id::text),
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_PAYABLE', 'debit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference, 'supplierId', p_supplier_id
          )
        ),
        jsonb_build_object(
          'account_code', p_account_code, 'credit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference,
            'supplierId', p_supplier_id, 'method', p_account_code
          )
        )
      )
    );
  end loop;

  return v_last_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_inventory_write_off: FIFO consumption; EXPIRY_LOSS when the reason
-- mentions expiry, else INVENTORY_WRITE_OFF.
-- ---------------------------------------------------------------------------
create or replace function public.post_inventory_write_off(
  p_product_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_fifo jsonb;
  v_total bigint;
  v_account text;
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  v_fifo := public.consume_fifo(v_company_id, p_product_id, p_quantity, 'InventoryWriteOff', v_adjustment_id::text, 'adjustment');
  v_total := (v_fifo ->> 'total_cogs')::bigint;

  v_account := case when p_reason ilike '%expir%' then 'EXPIRY_LOSS' else 'INVENTORY_WRITE_OFF' end;

  return public.post_journal_entry(
    v_company_id, 'InventoryWriteOff', v_adjustment_id::text,
    coalesce(p_reason, 'Inventory write-off'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_account, 'debit', v_total,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id, 'reason', p_reason,
          'batchAllocations', v_fifo -> 'allocations'
        )
      ),
      jsonb_build_object(
        'account_code', 'INVENTORY', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason)
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_inventory_adjustment: value-level correction (no batch changes).
-- p_value_change signed: positive raises INVENTORY, negative lowers it.
-- ---------------------------------------------------------------------------
create or replace function public.post_inventory_adjustment(
  p_product_id uuid,
  p_value_change bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_value_change is null or p_value_change = 0 then
    return null; -- no-op, as upstream
  end if;

  if p_value_change > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id)),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'debit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id)),
      jsonb_build_object('account_code', 'INVENTORY', 'credit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'productId', p_product_id))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InventoryAdjustment', 'StockAdjustment:' || v_adjustment_id::text,
    coalesce(p_reason, 'Inventory adjustment'), v_lines
  );
end;
$$;

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
revoke execute on function public.pay_supplier(uuid, bigint, text) from anon, public;
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;
grant execute on function public.pay_supplier(uuid, bigint, text) to authenticated;
grant execute on function public.post_inventory_write_off(uuid, numeric, text) to authenticated;
grant execute on function public.post_inventory_adjustment(uuid, bigint, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801007000_0012_reporting_views.sql
-- ----------------------------------------------------------------------------
-- 0012_reporting_views.sql
-- Small additions to support the money screens: AR/AP balance views,
-- customer credit management RPC, supplier flag on create_customer.

-- ---------------------------------------------------------------------------
-- Balance views (RLS-scoped reads; balances derived from journal lines).
-- ---------------------------------------------------------------------------
create view public.customer_ar_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.company_id,
  coalesce(sum(l.debit) - sum(l.credit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE'
) l on l.company_id = c.company_id and l.meta ->> 'customerId' = c.id::text
group by c.id, c.company_id;

create view public.supplier_ap_balances
with (security_invoker = true) as
select
  c.id as supplier_id,
  c.company_id,
  coalesce(sum(l.credit) - sum(l.debit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_PAYABLE'
) l on l.company_id = c.company_id and l.meta ->> 'supplierId' = c.id::text
where c.is_supplier
group by c.id, c.company_id;

grant select on public.customer_ar_balances to authenticated;
grant select on public.supplier_ap_balances to authenticated;

-- ---------------------------------------------------------------------------
-- update_customer_credit: credit management (limit, approval, terms).
-- ---------------------------------------------------------------------------
create or replace function public.update_customer_credit(
  p_customer_id uuid,
  p_credit_limit bigint,
  p_is_approved boolean,
  p_terms_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageCustomerCreditLimit') then
    raise exception 'permission_denied: ManageCustomerCreditLimit required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_credit_limit';
  end if;

  update public.customers
  set credit_limit = p_credit_limit,
      is_credit_approved = p_is_approved,
      credit_approved_by = case when p_is_approved then auth.uid() else credit_approved_by end,
      credit_terms_days = coalesce(p_terms_days, credit_terms_days),
      updated_at = now()
  where id = p_customer_id and company_id = v_company_id;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

revoke execute on function public.update_customer_credit(uuid, bigint, boolean, integer) from anon, public;
grant execute on function public.update_customer_credit(uuid, bigint, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- create_customer: supplier flag. Drop first to avoid overload ambiguity.
-- ---------------------------------------------------------------------------
drop function public.create_customer(text, text, text, text);

create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_is_supplier boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email, is_supplier)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    p_is_supplier
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text, boolean) from anon, public;
grant execute on function public.create_customer(text, text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801008000_0013_void_mixed_accounts.sql
-- ----------------------------------------------------------------------------
-- 0013_void_mixed_accounts.sql
-- Bug: void_sale aggregated an order's journal lines per account and emitted
-- ONE swapped line per account. When an account has BOTH debits and credits
-- on the order (e.g. credit sale + partial AR repayment, or cash sale + cash
-- refund), that line had debit>0 AND credit>0, violating
-- ledger_journal_lines_check (debit = 0 or credit = 0).
-- Fix: emit single-sided lines — a debit line for the account's credit total
-- and a credit line for its debit total. Gross totals unchanged (still a
-- perfect mirror); the entry stays balanced because the original was.

create or replace function public.void_sale(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  -- Swapped per-account totals, emitted as single-sided lines.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit,
        'credit', 0,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0,
        'credit', v_account.total_debit,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  -- Restore FIFO batches from the recorded COGS allocations.
  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.product_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801009000_0014_product_crud.sql
-- ----------------------------------------------------------------------------
-- 0014_product_crud.sql
-- Product management RPCs (writes are RPC-only; reads stay direct).

-- ---------------------------------------------------------------------------
-- create_product: sku optional (auto-generated from name + suffix when blank).
-- ---------------------------------------------------------------------------
create or replace function public.create_product(
  p_name text,
  p_price bigint,
  p_sku text default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default false,
  p_track_inventory boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_sku text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  v_sku := nullif(trim(coalesce(p_sku, '')), '');
  if v_sku is null then
    v_sku := left(upper(regexp_replace(p_name, '[^A-Za-z0-9]', '', 'g')), 6)
             || upper(substr(md5(v_company_id::text || p_name || now()::text), 1, 4));
  end if;

  insert into public.products (
    company_id, name, sku, barcode, price, wholesale_price,
    allow_fractional, track_inventory
  )
  values (
    v_company_id, trim(p_name), v_sku,
    nullif(trim(coalesce(p_barcode, '')), ''),
    p_price, p_wholesale_price, p_allow_fractional, p_track_inventory
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_product: partial updates; pass null to keep a field unchanged.
-- p_active deactivates/reactivates.
-- ---------------------------------------------------------------------------
create or replace function public.update_product(
  p_product_id uuid,
  p_name text default null,
  p_price bigint default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default null,
  p_track_inventory boolean default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_price is not null and p_price < 0 then
    raise exception 'invalid_price';
  end if;

  update public.products
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      price = coalesce(p_price, price),
      barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
      wholesale_price = coalesce(p_wholesale_price, wholesale_price),
      allow_fractional = coalesce(p_allow_fractional, allow_fractional),
      track_inventory = coalesce(p_track_inventory, track_inventory),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  return p_product_id;
end;
$$;

revoke execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) from anon, public;
revoke execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) from anon, public;
grant execute on function public.create_product(text, bigint, text, text, bigint, boolean, boolean) to authenticated;
grant execute on function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Stock-per-product view for the management screen (derived from batches).
-- ---------------------------------------------------------------------------
create view public.product_stock
with (security_invoker = true) as
select
  p.company_id,
  p.id as product_id,
  coalesce(sum(b.remaining), 0) as stock,
  coalesce(sum(b.remaining * b.unit_cost), 0)::bigint as stock_value
from public.products p
left join public.inventory_batches b
  on b.product_id = p.id and b.remaining > 0
group by p.company_id, p.id;

grant select on public.product_stock to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801010000_0015_audit_log.sql
-- ----------------------------------------------------------------------------
-- 0015_audit_log.sql
-- Integral audit trail: a generic trigger captures every INSERT/UPDATE/DELETE
-- on mutable business tables, regardless of write path (RPC, edge function,
-- ETL, manual SQL). Actor comes from the JWT claims (works inside security
-- definer RPCs).
--
-- Deliberately NOT audited: ledger_journal_entries/lines (immutable — they
-- ARE the audit), inventory_movements (already an audit trail),
-- inventory_batches (covered by movements), audit_log itself.

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id text,
  actor uuid,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index audit_log_company_time_idx on public.audit_log (company_id, changed_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;

create policy "audit log readable by members"
  on public.audit_log for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

-- No write grants for anyone: rows come only from the trigger function.
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

-- ---------------------------------------------------------------------------
-- Generic audit trigger function.
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_company_id uuid;
  v_row_id text;
begin
  v_old := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) end;
  v_new := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) end;

  v_company_id := coalesce(
    nullif(coalesce(v_new, v_old) ->> 'company_id', '')::uuid,
    null
  );
  v_row_id := coalesce(v_new, v_old) ->> 'id';

  insert into public.audit_log (company_id, table_name, operation, row_id, actor, old_data, new_data)
  values (v_company_id, TG_TABLE_NAME, TG_OP, v_row_id, auth.uid(), v_old, v_new);

  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.audit_trigger() from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Attach to mutable business tables.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'roles', 'company_memberships', 'payment_methods', 'stock_locations',
    'customers', 'products', 'orders', 'order_lines', 'payments', 'refunds',
    'purchases', 'purchase_payments', 'cashier_sessions', 'cash_drawer_counts',
    'reconciliations', 'accounting_periods', 'subscription_tiers', 'platform_admins'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801011000_0016_team_customers.sql
-- ----------------------------------------------------------------------------
-- 0016_team_customers.sql
-- Team & roles management + customer update RPCs.
-- Adds a 'ManageTeam' permission (14th) to gate membership/role management.

-- Extend the permission set on roles.
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
  'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
  'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
  'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
  'CreateInterAccountTransfer', 'ManageTeam'
]::text[]);

-- provision_company: include ManageTeam in the Admin role. Full-body replace
-- (only the permissions array changes).
create or replace function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_code text;
  v_role_id uuid;
  v_cash_parent uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_company_name is null or length(trim(p_company_name)) < 2 then
    raise exception 'invalid_company_name';
  end if;

  if exists (select 1 from public.company_memberships where user_id = v_user_id) then
    raise exception 'already_provisioned';
  end if;

  v_code := left(upper(regexp_replace(p_company_name, '[^A-Za-z0-9]', '', 'g')), 8)
            || upper(substr(md5(v_user_id::text), 1, 4));

  insert into public.companies (
    code, name, currency, status,
    subscription_tier_id, subscription_status, trial_ends_at
  )
  values (
    v_code, trim(p_company_name), p_currency, 'unapproved',
    (select id from public.subscription_tiers where code = 'trial' limit 1),
    'trial',
    now() + interval '30 days'
  )
  returning id into v_company_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Admin', array[
    'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
    'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
    'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
    'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
    'CreateInterAccountTransfer', 'ManageTeam'
  ])
  returning id into v_role_id;

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, v_role_id, 'approved');

  insert into public.stock_locations (company_id, code, name)
  values (v_company_id, 'MAIN', coalesce(nullif(trim(p_store_name), ''), 'Main Store'));

  insert into public.ledger_accounts (company_id, code, name, type, is_parent, is_system)
  values (v_company_id, 'CASH', 'Cash', 'asset', true, true)
  returning id into v_cash_parent;

  insert into public.ledger_accounts (company_id, code, name, type, parent_id, is_system)
  values
    (v_company_id, 'CASH_ON_HAND', 'Cash on Hand', 'asset', v_cash_parent, true),
    (v_company_id, 'BANK_MAIN', 'Bank - Main', 'asset', v_cash_parent, true),
    (v_company_id, 'MPESA', 'M-Pesa', 'asset', v_cash_parent, true),
    (v_company_id, 'CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', null, true),
    (v_company_id, 'CLEARING_GENERIC', 'Clearing - Generic', 'asset', null, true),
    (v_company_id, 'ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', null, true),
    (v_company_id, 'INVENTORY', 'Inventory', 'asset', null, true),
    (v_company_id, 'SALES', 'Sales Revenue', 'income', null, true),
    (v_company_id, 'SALES_RETURNS', 'Sales Returns', 'income', null, true),
    (v_company_id, 'ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', null, true),
    (v_company_id, 'TAX_PAYABLE', 'Taxes Payable', 'liability', null, true),
    (v_company_id, 'PURCHASES', 'Inventory Purchases', 'expense', null, true),
    (v_company_id, 'EXPENSES', 'General Expenses', 'expense', null, true),
    (v_company_id, 'PROCESSOR_FEES', 'Payment Processor Fees', 'expense', null, true),
    (v_company_id, 'CASH_SHORT_OVER', 'Cash Short/Over', 'expense', null, true),
    (v_company_id, 'COGS', 'Cost of Goods Sold', 'expense', null, true),
    (v_company_id, 'INVENTORY_WRITE_OFF', 'Inventory Write-Off', 'expense', null, true),
    (v_company_id, 'EXPIRY_LOSS', 'Expiry Loss', 'expense', null, true),
    (v_company_id, 'INVENTORY_ADJUSTMENT', 'Inventory Adjustment', 'expense', null, true),
    (v_company_id, 'BALANCE_ADJUSTMENT', 'Balance Adjustment', 'equity', null, true);

  -- Real money accounts are manually transactable; everything else is
  -- system-only. (Column added in 0029; plpgsql resolves it at execution.)
  update public.ledger_accounts
  set allow_manual_posting = true
  where company_id = v_company_id and code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA');

  insert into public.payment_methods (
    company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled
  )
  values
    (v_company_id, 'cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true),
    (v_company_id, 'mpesa', 'M-Pesa', 'MPESA', 'transaction_verification', true),
    (v_company_id, 'bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false),
    (v_company_id, 'credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false);

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company(text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_customer: partial profile updates.
-- ---------------------------------------------------------------------------
create or replace function public.update_customer(
  p_customer_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.customers
  set first_name = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
      last_name = coalesce(nullif(trim(coalesce(p_last_name, '')), ''), last_name),
      phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_customer_id and company_id = v_company_id;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_role: create or update a role's permissions.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_role(
  p_name text,
  p_permissions text[],
  p_role_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_role_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_role_id is not null then
    update public.roles
    set name = trim(p_name), permissions = coalesce(p_permissions, permissions), updated_at = now()
    where id = p_role_id and company_id = v_company_id
    returning id into v_role_id;

    if v_role_id is null then
      raise exception 'role_not_found: %', p_role_id;
    end if;
  else
    insert into public.roles (company_id, name, permissions)
    values (v_company_id, trim(p_name), coalesce(p_permissions, '{}'))
    returning id into v_role_id;
  end if;

  return v_role_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_team_member: attach an EXISTING auth user (by phone) to the company.
-- The person must have logged in at least once (their auth user must exist).
-- ---------------------------------------------------------------------------
create or replace function public.add_team_member(
  p_phone text,
  p_role_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_membership_id uuid;
  v_phone text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  -- Normalize: accept 07.../254.../+254...
  v_phone := regexp_replace(p_phone, '[^\d]', '', 'g');
  v_phone := case
    when v_phone like '0%' then '254' || substr(v_phone, 2)
    else v_phone
  end;

  select u.id into v_user_id
  from auth.users u
  where u.phone = v_phone
  limit 1;

  if v_user_id is null then
    raise exception 'user_not_registered: % must log in once before being added', p_phone;
  end if;

  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, p_role_id, 'approved')
  on conflict (company_id, user_id) do update
    set role_id = p_role_id, authorization_status = 'approved', updated_at = now()
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_team_member / remove_team_member.
-- ---------------------------------------------------------------------------
create or replace function public.update_team_member(
  p_membership_id uuid,
  p_role_id uuid default null,
  p_authorization_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  if p_authorization_status is not null
     and p_authorization_status not in ('pending', 'approved', 'disabled') then
    raise exception 'invalid_status';
  end if;

  update public.company_memberships
  set role_id = coalesce(p_role_id, role_id),
      authorization_status = coalesce(p_authorization_status, authorization_status),
      updated_at = now()
  where id = p_membership_id and company_id = v_company_id;

  if not found then
    raise exception 'membership_not_found: %', p_membership_id;
  end if;

  return p_membership_id;
end;
$$;

create or replace function public.remove_team_member(p_membership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  if exists (
    select 1 from public.company_memberships
    where id = p_membership_id and company_id = v_company_id and user_id = auth.uid()
  ) then
    raise exception 'cannot_remove_self';
  end if;

  delete from public.company_memberships
  where id = p_membership_id and company_id = v_company_id;

  if not found then
    raise exception 'membership_not_found: %', p_membership_id;
  end if;

  return p_membership_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'update_customer(uuid, text, text, text, text, text)',
    'upsert_role(text, text[], uuid)',
    'add_team_member(text, uuid)',
    'update_team_member(uuid, uuid, text)',
    'remove_team_member(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801012000_0017_product_variants.sql
-- ----------------------------------------------------------------------------
-- 0017_product_variants.sql
-- Product variants remodel: two-level catalog (product family + sellable
-- variants) replacing the flattened one-row-per-SKU model.
-- NOT rebuilding Vendure's option matrix: the variant name IS the option
-- label ('S', '1kg'). Everything sellable (order lines, batches, movements,
-- purchases) points at the variant. Dev-stage data is migrated 1:1
-- (each existing product becomes product + one 'Default' variant).

-- ---------------------------------------------------------------------------
-- 1. product_variants table
-- ---------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null, -- the option label: 'Default', 'S', '1kg', ...
  kind text not null default 'good' check (kind in ('good', 'service')),
  sku text not null,
  barcode text, -- overrides the product-level family barcode when set
  price bigint not null check (price >= 0),
  wholesale_price bigint check (wholesale_price >= 0),
  allow_fractional boolean not null default false,
  track_inventory boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku),
  -- services are never stocked
  check (kind = 'good' or track_inventory = false)
);

create unique index product_variants_barcode_idx
  on public.product_variants (company_id, barcode) where barcode is not null;

create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_company_idx on public.product_variants (company_id);

alter table public.product_variants enable row level security;

create policy "variants readable by members"
  on public.product_variants for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.product_variants to authenticated;
grant all on public.product_variants to service_role;

create trigger product_variants_audit
  after insert or update or delete on public.product_variants
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 2. Backfill: one 'Default' variant per existing product
-- ---------------------------------------------------------------------------
insert into public.product_variants (
  product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
  allow_fractional, track_inventory, active
)
select id, company_id, 'Default',
       case when track_inventory then 'good' else 'service' end,
       sku, barcode, price, wholesale_price,
       allow_fractional, track_inventory, active
from public.products;

-- ---------------------------------------------------------------------------
-- 3. Repoint sellable references at variants
-- ---------------------------------------------------------------------------
-- product_stock (from 0014) depends on inventory_batches.product_id; it is
-- recreated per-variant in section 5 below.
drop view public.product_stock;

alter table public.order_lines add column variant_id uuid references public.product_variants (id);
update public.order_lines l set variant_id = v.id
from public.product_variants v where v.product_id = l.product_id;
alter table public.order_lines alter column variant_id set not null;
alter table public.order_lines drop column product_id;
create index order_lines_variant_idx on public.order_lines (variant_id);

alter table public.inventory_batches add column variant_id uuid references public.product_variants (id);
update public.inventory_batches b set variant_id = v.id
from public.product_variants v where v.product_id = b.product_id;
alter table public.inventory_batches alter column variant_id set not null;
alter table public.inventory_batches drop column product_id;
drop index if exists public.inventory_batches_fifo_idx;
create index inventory_batches_fifo_idx
  on public.inventory_batches (company_id, variant_id, purchased_at)
  where remaining > 0;

alter table public.inventory_movements add column variant_id uuid references public.product_variants (id);
update public.inventory_movements m set variant_id = v.id
from public.product_variants v where v.product_id = m.product_id;
alter table public.inventory_movements alter column variant_id set not null;
alter table public.inventory_movements drop column product_id;
drop index if exists public.inventory_movements_product_idx;
create index inventory_movements_variant_idx on public.inventory_movements (company_id, variant_id);

-- ---------------------------------------------------------------------------
-- 4. products becomes the family row (sellable fields move to variants)
-- ---------------------------------------------------------------------------
alter table public.products
  drop column sku,
  drop column price,
  drop column wholesale_price,
  drop column allow_fractional,
  drop column track_inventory;
-- products keeps: id, company_id, name, barcode (family), image_path, active, timestamps

drop index if exists public.products_search_idx;
drop index if exists public.products_barcode_idx;
drop index if exists public.products_company_idx;
create index products_company_idx on public.products (company_id);

-- ---------------------------------------------------------------------------
-- 5. Search/read view for POS + management screens
-- ---------------------------------------------------------------------------
create view public.variant_catalog
with (security_invoker = true) as
select
  v.id as variant_id,
  v.company_id,
  p.id as product_id,
  p.name as product_name,
  v.name as variant_name,
  v.kind,
  v.sku,
  coalesce(v.barcode, p.barcode) as barcode,
  v.price,
  v.wholesale_price,
  v.allow_fractional,
  v.track_inventory,
  v.active as variant_active,
  p.active as product_active,
  p.image_path,
  coalesce(s.stock, 0) as stock
from public.product_variants v
join public.products p on p.id = v.product_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id;

create index variant_catalog_trgm on public.product_variants using gin (
  (name || ' ' || coalesce(barcode, '') || ' ' || sku) gin_trgm_ops
);

grant select on public.variant_catalog to authenticated;

-- product_stock now per variant.
create view public.product_stock
with (security_invoker = true) as
select
  v.company_id,
  v.id as variant_id,
  coalesce(sum(b.remaining), 0) as stock,
  coalesce(sum(b.remaining * b.unit_cost), 0)::bigint as stock_value
from public.product_variants v
left join public.inventory_batches b
  on b.variant_id = v.id and b.remaining > 0
group by v.company_id, v.id;

grant select on public.product_stock to authenticated;

-- ---------------------------------------------------------------------------
-- 6. consume_fifo: variant-scoped (param renamed for clarity).
-- ---------------------------------------------------------------------------
drop function public.consume_fifo(uuid, uuid, numeric, text, text, text);

create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
begin
  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and variant_id = p_variant_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and variant_id = p_variant_id and remaining > 0
    order by purchased_at asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;

    update public.inventory_batches
    set remaining = remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_movements (
      company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
    )
    values (
      p_company_id, p_variant_id, v_batch.id, p_movement_type, -v_take, v_batch.unit_cost, v_cost,
      p_source_type, p_source_id
    );

    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost
    );
  end loop;

  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

revoke execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) from authenticated, anon, public;
grant execute on function public.consume_fifo(uuid, uuid, numeric, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. save_draft: lines carry variant_id; order_lines join via variants.
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb, -- [{variant_id, quantity, unit_price, custom_price?, override_reason?}]
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    -- fractional quantities only where the variant allows them
    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. complete_order: FIFO join via variants (product -> product_variants).
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_customer.credit_limit > 0
       and v_ar_balance + v_order.total > v_customer.credit_limit then
      raise exception 'credit_limit_exceeded: balance % + % > limit %',
        v_ar_balance, v_order.total, v_customer.credit_limit;
    end if;
  end if;

  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line (via variants).
  for v_line in
    select l.*, v.track_inventory
    from public.order_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. record_purchase / write-off / adjustment: variant-scoped.
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb, -- [{variant_id, quantity, unit_cost, expiry_date?}]
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record;
  v_purchase_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_batch_count int := 0;
  v_ap_balance bigint;
  v_location_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_supplier
  from public.customers
  where id = p_supplier_id and company_id = v_company_id and is_supplier;

  if v_supplier is null then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  v_total := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_total := v_total + round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint);
  end loop;

  if v_total <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required';
    end if;

    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id
      and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;

    if v_supplier.supplier_credit_limit > 0
       and v_ap_balance + v_total > v_supplier.supplier_credit_limit then
      raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit;
    end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  select id into v_location_id
  from public.stock_locations
  where company_id = v_company_id and code = 'MAIN'
  limit 1;

  insert into public.purchases (company_id, supplier_id, reference, total_cost, is_credit, created_by)
  values (v_company_id, p_supplier_id, p_reference, v_total, p_is_credit, auth.uid())
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_batch_count := v_batch_count + 1;

    -- services cannot be stocked
    if exists (
      select 1 from public.product_variants sv
      where sv.id = (v_line ->> 'variant_id')::uuid and sv.kind = 'service'
    ) then
      raise exception 'cannot_stock_service: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.inventory_batches (
      company_id, variant_id, stock_location_id, supplier_id,
      quantity, remaining, unit_cost, expiry_date
    )
    values (
      v_company_id, (v_line ->> 'variant_id')::uuid, v_location_id, p_supplier_id,
      (v_line ->> 'quantity')::numeric, (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_cost')::bigint,
      nullif(v_line ->> 'expiry_date', '')::date
    );

    insert into public.inventory_movements (
      company_id, variant_id, type, quantity, unit_cost,
      total_cost, source_type, source_id
    )
    values (
      v_company_id, (v_line ->> 'variant_id')::uuid, 'purchase',
      (v_line ->> 'quantity')::numeric, (v_line ->> 'unit_cost')::bigint,
      round((v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint),
      'InventoryPurchase', v_purchase_id::text
    );
  end loop;

  perform public.post_journal_entry(
    v_company_id, 'InventoryPurchase', v_purchase_id::text,
    'Purchase ' || coalesce(p_reference, v_purchase_id::text),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'batchCount', v_batch_count
        )
      ),
      jsonb_build_object(
        'account_code', case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit', v_total,
        'meta', jsonb_build_object(
          'purchaseId', v_purchase_id, 'purchaseReference', p_reference,
          'supplierId', p_supplier_id, 'isCreditPurchase', p_is_credit
        )
      )
    )
  );

  return v_purchase_id;
end;
$$;

-- param p_product_id is renamed to p_variant_id: drop first (PG cannot rename
-- input parameters via create or replace).
drop function public.post_inventory_write_off(uuid, numeric, text);
drop function public.post_inventory_adjustment(uuid, bigint, text);

create or replace function public.post_inventory_write_off(
  p_variant_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_fifo jsonb;
  v_total bigint;
  v_account text;
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  v_fifo := public.consume_fifo(v_company_id, p_variant_id, p_quantity, 'InventoryWriteOff', v_adjustment_id::text, 'adjustment');
  v_total := (v_fifo ->> 'total_cogs')::bigint;

  v_account := case when p_reason ilike '%expir%' then 'EXPIRY_LOSS' else 'INVENTORY_WRITE_OFF' end;

  return public.post_journal_entry(
    v_company_id, 'InventoryWriteOff', v_adjustment_id::text,
    coalesce(p_reason, 'Inventory write-off'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_account, 'debit', v_total,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id, 'reason', p_reason,
          'batchAllocations', v_fifo -> 'allocations'
        )
      ),
      jsonb_build_object(
        'account_code', 'INVENTORY', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason)
      )
    )
  );
end;
$$;

create or replace function public.post_inventory_adjustment(
  p_variant_id uuid,
  p_value_change bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_lines jsonb;
  v_adjustment_id uuid := gen_random_uuid();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_value_change is null or p_value_change = 0 then
    return null;
  end if;

  if p_value_change > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id)),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id))
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'debit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id)),
      jsonb_build_object('account_code', 'INVENTORY', 'credit', -p_value_change,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'reason', p_reason, 'variantId', p_variant_id))
    );
  end if;

  return public.post_journal_entry(
    v_company_id, 'InventoryAdjustment', 'StockAdjustment:' || v_adjustment_id::text,
    coalesce(p_reason, 'Inventory adjustment'), v_lines
  );
end;
$$;

revoke execute on function public.record_purchase(uuid, jsonb, boolean, text, text) from anon, public;
revoke execute on function public.post_inventory_write_off(uuid, numeric, text) from anon, public;
revoke execute on function public.post_inventory_adjustment(uuid, bigint, text) from anon, public;
grant execute on function public.record_purchase(uuid, jsonb, boolean, text, text) to authenticated;
grant execute on function public.post_inventory_write_off(uuid, numeric, text) to authenticated;
grant execute on function public.post_inventory_adjustment(uuid, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Catalog RPCs: product family + variants.
-- ---------------------------------------------------------------------------
drop function public.create_product(text, bigint, text, text, bigint, boolean, boolean);
drop function public.update_product(uuid, text, bigint, text, bigint, boolean, boolean, boolean);

create or replace function public.create_product(
  p_name text,
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_product(
  p_product_id uuid,
  p_name text default null,
  p_barcode text default null,
  p_image_path text default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.products
  set name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
      barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
      image_path = coalesce(p_image_path, image_path),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  return p_product_id;
end;
$$;

create or replace function public.upsert_variant(
  p_product_id uuid,
  p_name text,
  p_price bigint,
  p_variant_id uuid default null,
  p_sku text default null,
  p_barcode text default null,
  p_wholesale_price bigint default null,
  p_allow_fractional boolean default null,
  p_track_inventory boolean default null,
  p_active boolean default null,
  p_kind text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_sku text;
  v_product_name text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_price is not null and p_price < 0 then
    raise exception 'invalid_price';
  end if;

  select name into v_product_name
  from public.products
  where id = p_product_id and company_id = v_company_id;

  if v_product_name is null then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  if p_variant_id is not null then
    update public.product_variants
    set name = trim(p_name),
        price = coalesce(p_price, price),
        barcode = coalesce(nullif(trim(coalesce(p_barcode, '')), ''), barcode),
        wholesale_price = coalesce(p_wholesale_price, wholesale_price),
        allow_fractional = coalesce(p_allow_fractional, allow_fractional),
        track_inventory = case
          when coalesce(p_kind, kind) = 'service' then false
          else coalesce(p_track_inventory, track_inventory)
        end,
        kind = coalesce(p_kind, kind),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_variant_id and company_id = v_company_id and product_id = p_product_id
    returning id into v_id;

    if v_id is null then
      raise exception 'variant_not_found: %', p_variant_id;
    end if;
  else
    if p_price is null then
      raise exception 'invalid_price';
    end if;

    if p_kind is not null and p_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    v_sku := nullif(trim(coalesce(p_sku, '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(v_product_name || p_name, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || p_product_id::text || p_name), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      p_product_id, v_company_id, trim(p_name), coalesce(p_kind, 'good'), v_sku,
      nullif(trim(coalesce(p_barcode, '')), ''),
      p_price, p_wholesale_price,
      coalesce(p_allow_fractional, false),
      case when coalesce(p_kind, 'good') = 'service' then false else coalesce(p_track_inventory, true) end
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_product(text, text, text)',
    'update_product(uuid, text, text, text, boolean)',
    'upsert_variant(uuid, text, bigint, uuid, text, text, bigint, boolean, boolean, boolean, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. void_sale: reversal movements point at variants (body identical to the
-- 0013 version except product_id -> variant_id in the batch-restore insert).
-- ---------------------------------------------------------------------------
create or replace function public.void_sale(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  -- Swapped per-account totals, emitted as single-sided lines.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit,
        'credit', 0,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0,
        'credit', v_account.total_debit,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  -- Restore FIFO batches from the recorded COGS allocations.
  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.variant_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801013000_0018_analytics.sql
-- ----------------------------------------------------------------------------
-- 0018_analytics.sql
-- Analytics: 4 materialized views (recreated over the new flat schema),
-- hourly refresh via pg_cron, plus low-stock and expiring-batch views for
-- the dashboard. Old system: 4 MVs refreshed hourly by a worker task.

create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- mv_daily_sales_summary: per company/day — orders, revenue, COGS, margin.
-- Revenue from completed orders (gross, as posted); COGS from COGS journal
-- lines tagged with the order.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_sales_summary as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(c.cogs), 0)::bigint as cogs,
  (coalesce(sum(o.total), 0) - coalesce(sum(c.cogs), 0))::bigint as margin
from public.orders o
left join lateral (
  select sum(l.debit) as cogs
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'COGS' and l.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date;

create unique index mv_daily_sales_summary_idx on public.mv_daily_sales_summary (company_id, day);

-- ---------------------------------------------------------------------------
-- mv_daily_product_sales: per company/day/variant — qty, revenue, COGS share.
-- COGS allocated per line proportionally to the order's line totals.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_product_sales as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  l.variant_id,
  coalesce(sum(l.quantity), 0) as quantity,
  coalesce(sum(l.line_total), 0)::bigint as revenue,
  coalesce(sum(round(c.cogs * l.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
from public.orders o
join public.order_lines l on l.order_id = o.id
left join lateral (
  select sum(jl.debit) as cogs
  from public.ledger_journal_lines jl
  join public.ledger_accounts a on a.id = jl.account_id
  where a.code = 'COGS' and jl.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, l.variant_id;

create unique index mv_daily_product_sales_idx
  on public.mv_daily_product_sales (company_id, day, variant_id);

-- ---------------------------------------------------------------------------
-- mv_daily_customer_stats: per company/day/customer — orders, spend, AR delta.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_customer_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.customer_id,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(ar.delta), 0)::bigint as ar_delta
from public.orders o
left join lateral (
  select sum(l.debit) - sum(l.credit) as delta
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id = o.id
) ar on true
where o.status = 'completed' and o.customer_id is not null
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.customer_id;

create unique index mv_daily_customer_stats_idx
  on public.mv_daily_customer_stats (company_id, day, customer_id);

-- ---------------------------------------------------------------------------
-- mv_daily_order_stats: per company/day — by status and payment method.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_order_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.status,
  p.method_code,
  count(distinct o.id)::int as orders,
  coalesce(sum(o.total), 0)::bigint as total,
  coalesce(sum(p.amount), 0)::bigint as method_total
from public.orders o
left join public.payments p on p.order_id = o.id and p.status = 'settled'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.status, p.method_code;

create unique index mv_daily_order_stats_idx
  on public.mv_daily_order_stats (company_id, day, status, method_code);

-- ---------------------------------------------------------------------------
-- Tenant isolation: MVs cannot have RLS, so clients never read them directly.
-- These security_invoker views filter by the JWT company claim (platform
-- admins see everything) and are the only granted read surface.
-- ---------------------------------------------------------------------------
create view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_customer_stats as
select * from public.mv_daily_customer_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_order_stats as
select * from public.mv_daily_order_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

grant select on public.rpt_daily_sales_summary to authenticated;
grant select on public.rpt_daily_product_sales to authenticated;
grant select on public.rpt_daily_customer_stats to authenticated;
grant select on public.rpt_daily_order_stats to authenticated;
revoke all on public.mv_daily_sales_summary from authenticated, anon;
revoke all on public.mv_daily_product_sales from authenticated, anon;
revoke all on public.mv_daily_customer_stats from authenticated, anon;
revoke all on public.mv_daily_order_stats from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dashboard helpers: low stock + expiring batches (plain views, always fresh).
-- ---------------------------------------------------------------------------
create view public.low_stock_variants
with (security_invoker = true) as
select
  v.company_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(s.stock, 0) as stock,
  c.low_stock_threshold
from public.product_variants v
join public.products p on p.id = v.product_id
join public.companies c on c.id = v.company_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id
where v.track_inventory and v.active and p.active
  and coalesce(s.stock, 0) <= c.low_stock_threshold;

create view public.expiring_batches
with (security_invoker = true) as
select
  b.company_id,
  b.id as batch_id,
  b.variant_id,
  p.name as product_name,
  v.name as variant_name,
  b.remaining,
  b.expiry_date
from public.inventory_batches b
join public.product_variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.companies c on c.id = b.company_id
where b.remaining > 0
  and b.expiry_date is not null
  and b.expiry_date <= (now() at time zone 'Africa/Nairobi')::date + 30
  and c.batch_expiry_enabled
order by b.expiry_date asc;

grant select on public.low_stock_variants to authenticated;
grant select on public.expiring_batches to authenticated;

-- ---------------------------------------------------------------------------
-- Refresh function + hourly cron (was a worker task in the old stack).
-- ---------------------------------------------------------------------------
create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_daily_sales_summary;
  refresh materialized view concurrently public.mv_daily_product_sales;
  refresh materialized view concurrently public.mv_daily_customer_stats;
  refresh materialized view concurrently public.mv_daily_order_stats;
end;
$$;

revoke execute on function public.refresh_analytics() from authenticated, anon, public;
grant execute on function public.refresh_analytics() to service_role;

select cron.schedule(
  'refresh-analytics',
  '7 * * * *',
  $$select public.refresh_analytics()$$
);

-- ----------------------------------------------------------------------------
-- [squashed] 20260801014000_0019_product_with_variants.sql
-- ----------------------------------------------------------------------------
-- 0019_product_with_variants.sql
-- Coupled product creation: a product must be born with >= 1 variant
-- (v1's createProductWithVariants behavior). The family-only create_product
-- remains for tooling/ETL, but the app path goes through this RPC.

create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb, -- [{name?, price, sku?, barcode?, wholesale_price?, kind?, allow_fractional?, track_inventory?}]
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    -- Single variant with no label: 'Default' (hidden in the UI).
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801015000_0020_approvals.sql
-- ----------------------------------------------------------------------------
-- 0020_approvals.sql
-- Approvals workflow (old: approval-request entity, 4 types).
-- Semantics per type:
--   below_wholesale  — save_draft records it when a custom price dips below
--                      wholesale; complete_order blocks until approved.
--   order_reversal   — callers with ReverseOrder but without ManageApprovals
--                      get a pending approval instead of an instant void;
--                      approval executes the void.
--   overdraft        — over-limit credit sale by an ApproveCustomerCredit
--                      holder succeeds and records an approved overdraft
--                      approval (audit of who authorized); others hard-fail.
--   customer_credit  — reserved (credit-limit raise requests); table support
--                      now, triggers when that flow lands.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in ('overdraft', 'customer_credit', 'below_wholesale', 'order_reversal')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  metadata jsonb not null default '{}',
  due_at timestamptz,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);

create index approvals_company_status_idx on public.approvals (company_id, status, created_at desc);

alter table public.approvals enable row level security;

create policy "approvals readable by members"
  on public.approvals for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.approvals to authenticated;
grant all on public.approvals to service_role;

create trigger approvals_audit
  after insert or update or delete on public.approvals
  for each row execute function public.audit_trigger();

alter publication supabase_realtime add table public.approvals;

-- ---------------------------------------------------------------------------
-- Internal: create an approval row (service-role/RPC use).
-- ---------------------------------------------------------------------------
create or replace function public.create_approval(
  p_company_id uuid,
  p_type text,
  p_metadata jsonb,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.approvals (company_id, type, metadata, due_at, requested_by)
  values (p_company_id, p_type, coalesce(p_metadata, '{}'), p_due_at, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_approval(uuid, text, jsonb, timestamptz) from authenticated, anon, public;
grant execute on function public.create_approval(uuid, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- save_draft: record below-wholesale approvals for overridden lines.
-- Full-body replace (adds the marked block at the end).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
    -- fresh draft: drop any stale below-wholesale requests for it
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    -- NEW: track below-wholesale custom prices for approval.
    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  -- NEW: one approval request per order covering all below-wholesale lines.
  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: block while a below-wholesale approval is pending.
-- Full-body replace (only the marked guard is new).
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- NEW: below-wholesale gate.
  select a.id into v_pending_approval
  from public.approvals a
  where a.company_id = v_order.company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_ar_balance + v_order.total > v_customer.credit_limit
       and v_customer.credit_limit > 0 then
      -- NEW: overdraft — allowed with an audit trail when the actor holds
      -- ApproveCustomerCredit; hard fail otherwise.
      if public.current_user_has_permission('ApproveCustomerCredit') then
        insert into public.approvals (company_id, type, status, metadata, requested_by, decided_by, decided_at, decision_reason)
        values (
          v_order.company_id, 'overdraft', 'approved',
          jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ),
          auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  end if;

  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select l.*, v.track_inventory
    from public.order_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- do_void (internal): the void mechanics, no permission checks.
-- ---------------------------------------------------------------------------
create or replace function public.do_void(p_order_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit, 'credit', 0, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0, 'credit', v_account.total_debit, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.variant_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.do_void(uuid, text) from authenticated, anon, public;
grant execute on function public.do_void(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- void_sale: instant for ManageApprovals; approval request otherwise.
-- Returns a status object (NOT an exception for the approval path — raising
-- would roll back the approval insert itself).
--   {"status": "voided", "entry_id": "..."}
--   {"status": "approval_required", "approval_id": "..."}
-- ---------------------------------------------------------------------------
drop function public.void_sale(uuid, text);

create or replace function public.void_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  if public.current_user_has_permission('ManageApprovals') then
    v_entry_id := public.do_void(p_order_id, p_reason);
    return jsonb_build_object('status', 'voided', 'entry_id', v_entry_id);
  end if;

  -- Needs sign-off: create (or reuse) a pending approval request.
  select a.id into v_approval_id
  from public.approvals a
  where a.company_id = v_company_id
    and a.type = 'order_reversal'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_approval_id is null then
    v_approval_id := public.create_approval(
      v_company_id, 'order_reversal',
      jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
  end if;

  return jsonb_build_object('status', 'approval_required', 'approval_id', v_approval_id);
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_request / deny_request (ManageApprovals-gated).
-- Approval executes the gated action where applicable.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id and status = 'pending'
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  update public.approvals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  -- Execute the gated action.
  if v_approval.type = 'order_reversal' then
    perform public.do_void(
      (v_approval.metadata ->> 'order_id')::uuid,
      coalesce(v_approval.metadata ->> 'reason', 'approved reversal')
    );
  end if;
  -- below_wholesale: approval simply unblocks complete_order (no action here).
  -- overdraft: recorded pre-approved; nothing to execute.

  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  update public.approvals
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id and company_id = v_company_id and status = 'pending';

  if not found then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid, text) from anon, public;
revoke execute on function public.deny_request(uuid, text) from anon, public;
grant execute on function public.approve_request(uuid, text) to authenticated;
grant execute on function public.deny_request(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801016000_0021_variance_review.sql
-- ----------------------------------------------------------------------------
-- 0021_variance_review.sql
-- Variance review: reconciliation account variances can be reviewed and
-- reverted (old system: variance action items; approve = reversal with
-- reversalOf set).

alter table public.reconciliation_accounts
  add column reviewed_at timestamptz,
  add column reviewed_by uuid;

-- ---------------------------------------------------------------------------
-- revert_variance: post a mirror reversal of the original variance entry and
-- mark the reconciliation line reviewed. Idempotent per recon account row.
-- ---------------------------------------------------------------------------
create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon record;
  v_recon_parent record;
  v_entry record;
  v_line record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_entry_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;

  if v_recon is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;

  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  if v_recon.variance = 0 then
    raise exception 'no_variance_to_revert';
  end if;

  if v_recon.reviewed_at is not null then
    raise exception 'already_reviewed';
  end if;

  -- Find the original variance entry: source_id = {session|manual}-{account}-{countId}.
  select * into v_entry
  from public.ledger_journal_entries e
  where e.company_id = v_company_id
    and e.source_type = 'VarianceAdjustment'
    and e.source_id like '%-' || v_recon.account_code || '-' || v_recon_parent.id::text
  limit 1;

  if v_entry is null then
    raise exception 'variance_entry_not_found for account %', v_recon.account_code;
  end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'meta', v_line.meta || jsonb_build_object('revertedAt', now()::text)
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id, 'VarianceAdjustmentReversal', v_entry.source_id || '-reversal',
    'Variance revert: ' || v_recon.account_code || coalesce(' — ' || p_reason, ''),
    v_reversal_lines, v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from anon, public;
grant execute on function public.revert_variance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801017000_0022_media_collections.sql
-- ----------------------------------------------------------------------------
-- 0022_media_collections.sql
-- Sprint 5: product images (Storage) + collections.

-- ---------------------------------------------------------------------------
-- Collections (storefront categories; old: Vendure collections/facets-lite)
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table public.product_collections (
  product_id uuid not null references public.products (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, collection_id)
);

create index product_collections_collection_idx on public.product_collections (collection_id);

alter table public.collections enable row level security;
alter table public.product_collections enable row level security;

create policy "collections readable by members"
  on public.collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "product collections readable by members"
  on public.product_collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.collections to authenticated;
grant select on public.product_collections to authenticated;
grant all on public.collections to service_role;
grant all on public.product_collections to service_role;

create trigger collections_audit
  after insert or update or delete on public.collections
  for each row execute function public.audit_trigger();

create trigger product_collections_audit
  after insert or update or delete on public.product_collections
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Collection RPCs (writes via RPC, as everywhere).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_collection(
  p_name text,
  p_slug text default null,
  p_description text default null,
  p_collection_id uuid default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_slug text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  end if;

  if p_collection_id is not null then
    update public.collections
    set name = trim(p_name), slug = v_slug,
        description = coalesce(p_description, description),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_collection_id and company_id = v_company_id
    returning id into v_id;

    if v_id is null then
      raise exception 'collection_not_found: %', p_collection_id;
    end if;
  else
    insert into public.collections (company_id, name, slug, description)
    values (v_company_id, trim(p_name), v_slug, p_description)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_product_collections(
  p_product_id uuid,
  p_collection_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and company_id = v_company_id) then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  delete from public.product_collections
  where product_id = p_product_id and company_id = v_company_id;

  insert into public.product_collections (product_id, collection_id, company_id)
  select p_product_id, c.id, v_company_id
  from public.collections c
  where c.id = any (p_collection_ids) and c.company_id = v_company_id;

  return p_product_id;
end;
$$;

revoke execute on function public.upsert_collection(text, text, text, uuid, boolean) from anon, public;
revoke execute on function public.set_product_collections(uuid, uuid[]) from anon, public;
grant execute on function public.upsert_collection(text, text, text, uuid, boolean) to authenticated;
grant execute on function public.set_product_collections(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product-images bucket (public), tenant-scoped by path prefix
-- (company_id/...). Members write their own company's prefix; the world reads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product images readable by everyone"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "members write their company image prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members update their company image prefix"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members delete their company image prefix"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

-- ----------------------------------------------------------------------------
-- [squashed] 20260801018000_0023_aging_settings.sql
-- ----------------------------------------------------------------------------
-- 0023_aging_settings.sql
-- Sprint 6: credit aging views (customer AR + supplier AP) and the
-- payment-method settings RPC.

-- ---------------------------------------------------------------------------
-- customer_credit_aging: per customer — balance, oldest unpaid credit order,
-- days outstanding, bucket. Per-order AR balances from journal lines
-- (order_id column), oldest by entry_date.
-- ---------------------------------------------------------------------------
create view public.customer_credit_aging
with (security_invoker = true) as
with per_order as (
  select
    l.company_id,
    l.meta ->> 'customerId' as customer_id,
    l.order_id,
    sum(l.debit) - sum(l.credit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id is not null
  group by l.company_id, l.meta ->> 'customerId', l.order_id
)
select
  company_id,
  customer_id::uuid as customer_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_order
where balance > 0
group by company_id, customer_id;

-- ---------------------------------------------------------------------------
-- supplier_ap_aging: mirror for AP (per purchase, meta purchaseId).
-- ---------------------------------------------------------------------------
create view public.supplier_ap_aging
with (security_invoker = true) as
with per_purchase as (
  select
    l.company_id,
    l.meta ->> 'supplierId' as supplier_id,
    l.meta ->> 'purchaseId' as purchase_id,
    sum(l.credit) - sum(l.debit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_PAYABLE'
    and l.meta ? 'purchaseId'
  group by l.company_id, l.meta ->> 'supplierId', l.meta ->> 'purchaseId'
)
select
  company_id,
  supplier_id::uuid as supplier_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_purchase
where balance > 0
group by company_id, supplier_id;

grant select on public.customer_credit_aging to authenticated;
grant select on public.supplier_ap_aging to authenticated;

-- ---------------------------------------------------------------------------
-- update_payment_method: enable/disable + reconciliation flag.
-- ---------------------------------------------------------------------------
create or replace function public.update_payment_method(
  p_code text,
  p_enabled boolean default null,
  p_requires_reconciliation boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_payment_method(text, boolean, boolean) from anon, public;
grant execute on function public.update_payment_method(text, boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801019000_0023_role_templates.sql
-- ----------------------------------------------------------------------------
-- 0023_role_templates.sql
-- Role templates: platform-seeded starter roles + apply RPC + provisioning
-- creates Admin AND Cashier by default. Plus the alignment fix:
-- ViewFinancials now actually gates financial reads (journal tables + rpt_
-- report views).

-- ---------------------------------------------------------------------------
-- 1. Platform role templates (company_id null = platform template).
--    Permission sets aligned to what the RPCs actually enforce:
--      OverridePrice          -> save_draft custom prices
--      SettleOrder            -> settle_order, post_payment_allocation
--      ReverseOrder           -> void_sale (request), post_refund
--      ManageApprovals        -> approve/deny, instant void
--      ApproveCustomerCredit  -> overdraft authorization
--      ManageCustomerCreditLimit -> update_customer_credit
--      OverrideCustomerBalance-> post_balance_adjustment
--      ManageSupplierCreditPurchases -> credit record_purchase
--      ManageStockAdjustments -> write-offs, value adjustments
--      ManageReconciliation   -> manual reconciliation, variance revert
--      CloseAccountingPeriod  -> close_accounting_period
--      CreateInterAccountTransfer -> post_transfer
--      ManageTeam             -> team/role management
--      ViewFinancials         -> journal/report READS (gated below)
-- ---------------------------------------------------------------------------
insert into public.roles (company_id, name, is_template, permissions)
values
  (null, 'Admin', true, array[
    'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
    'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
    'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
    'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
    'CreateInterAccountTransfer', 'ManageTeam'
  ]),
  (null, 'Manager', true, array[
    'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
    'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
    'SettleOrder', 'ManageSupplierCreditPurchases',
    'ViewFinancials', 'ManageReconciliation',
    'CreateInterAccountTransfer', 'ManageTeam'
  ]),
  (null, 'Cashier', true, array['SettleOrder']),
  (null, 'Stock Clerk', true, array['ManageStockAdjustments', 'ManageSupplierCreditPurchases'])
on conflict (company_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. apply_role_template: instantiate a template as a company role.
-- ---------------------------------------------------------------------------
create or replace function public.apply_role_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_template record;
  v_role_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select * into v_template
  from public.roles
  where id = p_template_id and is_template;

  if v_template is null then
    raise exception 'template_not_found: %', p_template_id;
  end if;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, v_template.name, v_template.permissions)
  on conflict (company_id, name) do update
    set permissions = excluded.permissions, updated_at = now()
  returning id into v_role_id;

  return v_role_id;
end;
$$;

revoke execute on function public.apply_role_template(uuid) from anon, public;
grant execute on function public.apply_role_template(uuid) to authenticated;

-- Templates must be readable by members (to apply them). Replaces the
-- company-scoped policy from 0001 with the full read rule.
drop policy if exists "roles readable by members or platform admins" on public.roles;

create policy "roles and templates readable by members"
  on public.roles for select
  using (is_template or company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- 3. Provisioning seeds Admin + Cashier (the two every shop needs day one).
--    Full-body replace; only the roles insert changes.
-- ---------------------------------------------------------------------------
create or replace function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_code text;
  v_role_id uuid;
  v_cash_parent uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_company_name is null or length(trim(p_company_name)) < 2 then
    raise exception 'invalid_company_name';
  end if;

  if exists (select 1 from public.company_memberships where user_id = v_user_id) then
    raise exception 'already_provisioned';
  end if;

  v_code := left(upper(regexp_replace(p_company_name, '[^A-Za-z0-9]', '', 'g')), 8)
            || upper(substr(md5(v_user_id::text), 1, 4));

  insert into public.companies (
    code, name, currency, status,
    subscription_tier_id, subscription_status, trial_ends_at
  )
  values (
    v_code, trim(p_company_name), p_currency, 'unapproved',
    (select id from public.subscription_tiers where code = 'trial' limit 1),
    'trial',
    now() + interval '30 days'
  )
  returning id into v_company_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Admin', array[
      'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
      'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
      'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
      'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
      'CreateInterAccountTransfer', 'ManageTeam'
    ])
  returning id into v_role_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Cashier', array['SettleOrder']);

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, v_role_id, 'approved');

  insert into public.stock_locations (company_id, code, name)
  values (v_company_id, 'MAIN', coalesce(nullif(trim(p_store_name), ''), 'Main Store'));

  insert into public.ledger_accounts (company_id, code, name, type, is_parent, is_system)
  values (v_company_id, 'CASH', 'Cash', 'asset', true, true)
  returning id into v_cash_parent;

  insert into public.ledger_accounts (company_id, code, name, type, parent_id, is_system)
  values
    (v_company_id, 'CASH_ON_HAND', 'Cash on Hand', 'asset', v_cash_parent, true),
    (v_company_id, 'BANK_MAIN', 'Bank - Main', 'asset', v_cash_parent, true),
    (v_company_id, 'MPESA', 'M-Pesa', 'asset', v_cash_parent, true),
    (v_company_id, 'CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', null, true),
    (v_company_id, 'CLEARING_GENERIC', 'Clearing - Generic', 'asset', null, true),
    (v_company_id, 'ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', null, true),
    (v_company_id, 'INVENTORY', 'Inventory', 'asset', null, true),
    (v_company_id, 'SALES', 'Sales Revenue', 'income', null, true),
    (v_company_id, 'SALES_RETURNS', 'Sales Returns', 'income', null, true),
    (v_company_id, 'ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', null, true),
    (v_company_id, 'TAX_PAYABLE', 'Taxes Payable', 'liability', null, true),
    (v_company_id, 'PURCHASES', 'Inventory Purchases', 'expense', null, true),
    (v_company_id, 'EXPENSES', 'General Expenses', 'expense', null, true),
    (v_company_id, 'PROCESSOR_FEES', 'Payment Processor Fees', 'expense', null, true),
    (v_company_id, 'CASH_SHORT_OVER', 'Cash Short/Over', 'expense', null, true),
    (v_company_id, 'COGS', 'Cost of Goods Sold', 'expense', null, true),
    (v_company_id, 'INVENTORY_WRITE_OFF', 'Inventory Write-Off', 'expense', null, true),
    (v_company_id, 'EXPIRY_LOSS', 'Expiry Loss', 'expense', null, true),
    (v_company_id, 'INVENTORY_ADJUSTMENT', 'Inventory Adjustment', 'expense', null, true),
    (v_company_id, 'BALANCE_ADJUSTMENT', 'Balance Adjustment', 'equity', null, true);

  -- Real money accounts are manually transactable; everything else is
  -- system-only. (Column added in 0029; plpgsql resolves it at execution.)
  update public.ledger_accounts
  set allow_manual_posting = true
  where company_id = v_company_id and code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA');

  insert into public.payment_methods (
    company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled
  )
  values
    (v_company_id, 'cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true),
    (v_company_id, 'mpesa', 'M-Pesa', 'MPESA', 'transaction_verification', true),
    (v_company_id, 'bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false),
    (v_company_id, 'credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false);

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company(text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Alignment fix: ViewFinancials gates financial READS.
--    Journal tables: tighten the select policies.
-- ---------------------------------------------------------------------------
drop policy if exists "ledger_journal_entries readable by members" on public.ledger_journal_entries;
drop policy if exists "ledger_journal_lines readable by members" on public.ledger_journal_lines;

create policy "journal entries readable with ViewFinancials"
  on public.ledger_journal_entries for select
  using (
    (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

create policy "journal lines readable with ViewFinancials"
  on public.ledger_journal_lines for select
  using (
    (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

-- Report wrapper views: add the ViewFinancials check (they are definer views
-- over RLS-less MVs, so the check lives in the view itself).
create or replace view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_customer_stats as
select * from public.mv_daily_customer_stats
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_order_stats as
select * from public.mv_daily_order_stats
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- [squashed] 20260801020000_0024_billing.sql
-- ----------------------------------------------------------------------------
-- 0024_billing.sql
-- Phase 5 backend: subscription activation (Paystack-confirmed), entitlement
-- enforcement in write RPCs, daily expiry scanner via pg_cron.
-- Model faithful to the old system: one-off charges (no Paystack plans),
-- locally-managed expiry, grace period, exemption fields.

-- Idempotency marker for webhook replays.
alter table public.companies add column last_payment_reference text;

-- ---------------------------------------------------------------------------
-- activate_subscription: called by the paystack-webhook edge function after a
-- verified charge.success. Idempotent on the Paystack reference.
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription(
  p_company_id uuid,
  p_tier_id uuid,
  p_billing_cycle text,
  p_reference text,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_now timestamptz := now();
  v_base timestamptz;
begin
  select * into v_company from public.companies where id = p_company_id for update;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  -- Webhook replay: same reference = already processed.
  if v_company.last_payment_reference = p_reference then
    return p_company_id;
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_cycle';
  end if;

  if not exists (select 1 from public.subscription_tiers where id = p_tier_id and is_active) then
    raise exception 'tier_not_found: %', p_tier_id;
  end if;

  -- Extend from current expiry when still active, else from now.
  v_base := case
    when v_company.subscription_expires_at is not null and v_company.subscription_expires_at > v_now
      then v_company.subscription_expires_at
    else v_now
  end;

  update public.companies
  set subscription_tier_id = p_tier_id,
      subscription_status = 'active',
      subscription_started_at = coalesce(subscription_started_at, v_now),
      subscription_expires_at = v_base + (case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end),
      subscription_grace_period_end = null,
      billing_cycle = p_billing_cycle,
      last_payment_date = v_now,
      last_payment_amount = p_amount,
      last_payment_reference = p_reference,
      updated_at = now()
  where id = p_company_id;

  return p_company_id;
end;
$$;

revoke execute on function public.activate_subscription(uuid, uuid, text, text, bigint) from authenticated, anon, public;
grant execute on function public.activate_subscription(uuid, uuid, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- assert_entitled: subscription gate for write RPCs.
-- Entitled = trial/active, OR expired-but-in-grace, OR manually exempt.
-- p_check = 'order' | 'product' also enforces tier limits.
-- ---------------------------------------------------------------------------
create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  select * into v_company from public.companies where id = p_company_id;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  -- Manual exemption always wins (platform support tool).
  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > v_now then
    return;
  end if;

  if v_company.subscription_status not in ('trial', 'active') then
    if not (
      v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now
    ) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;

  if p_check is null then
    return;
  end if;

  select t.limits into v_limits
  from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;

  if v_limits is null then
    return;
  end if;

  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null then
    if (select count(*) from public.orders o
        where o.company_id = p_company_id
          and o.created_at >= date_trunc('month', v_now)
          and o.status <> 'voided') >= (v_limits ->> 'maxOrdersPerMonth')::int then
      raise exception 'limit_reached: monthly order limit (%); upgrade your plan', v_limits ->> 'maxOrdersPerMonth';
    end if;
  end if;

  if p_check = 'product' and (v_limits ->> 'maxProducts') is not null then
    if (select count(*) from public.product_variants v where v.company_id = p_company_id and v.active)
       >= (v_limits ->> 'maxProducts')::int then
      raise exception 'limit_reached: product limit (%); upgrade your plan', v_limits ->> 'maxProducts';
    end if;
  end if;
end;
$$;

revoke execute on function public.assert_entitled(uuid, text) from authenticated, anon, public;
grant execute on function public.assert_entitled(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enforce in the creation RPCs (order creation + product creation points).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_entitled(v_company_id, 'order');

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- create_product_with_variants: product limit gate.
create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- subscription_expiry_scan: daily. trial/active past expiry -> expired + 3-day
-- grace; grace passed -> suspension is enforced by assert_entitled (grace end).
-- Reminder flags set for Phase 6 delivery.
-- ---------------------------------------------------------------------------
create or replace function public.subscription_expiry_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int := 0;
  v_now timestamptz := now();
begin
  -- Flip to expired + set grace (3 days) once.
  update public.companies
  set subscription_status = 'expired',
      subscription_grace_period_end = subscription_expires_at + interval '3 days',
      updated_at = v_now
  where subscription_status in ('trial', 'active')
    and subscription_expires_at is not null
    and subscription_expires_at < v_now
    and subscription_grace_period_end is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.subscription_expiry_scan() from authenticated, anon, public;
grant execute on function public.subscription_expiry_scan() to service_role;

select cron.schedule(
  'subscription-expiry-scan',
  '13 3 * * *', -- 06:13 EAT daily
  $$select public.subscription_expiry_scan()$$
);

-- ----------------------------------------------------------------------------
-- [squashed] 20260801021000_0025_comms.sql
-- ----------------------------------------------------------------------------
-- 0025_comms.sql
-- Phase 6 backend: in-app notifications (realtime) + external outbox with
-- quiet-hours, SMS metering, credit reminders with dedupe, batch messaging.

-- ---------------------------------------------------------------------------
-- In-app notifications (free, instant — the default channel).
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid, -- null = company-wide
  type text not null, -- 'credit_reminder' | 'subscription' | 'approval' | 'stock' | 'system'
  title text not null,
  body text,
  link text, -- app route, e.g. '/money/credit'
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_company_idx on public.notifications (company_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications readable by members"
  on public.notifications for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "members mark read"
  on public.notifications for update
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Outbox: external messages (sms/whatsapp/email) flushed by pg_cron ->
-- notification-flush edge function.
-- ---------------------------------------------------------------------------
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  scheduled_after timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index outbox_flush_idx on public.outbox (status, scheduled_after) where status = 'pending';

alter table public.outbox enable row level security;

create policy "outbox readable by members"
  on public.outbox for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.outbox to authenticated;
grant all on public.outbox to service_role;

-- ---------------------------------------------------------------------------
-- notify(): in-app notification helper.
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_company_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (company_id, user_id, type, title, body, link)
  values (p_company_id, p_user_id, p_type, p_title, p_body, p_link)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid) from authenticated, anon, public;
grant execute on function public.notify(uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_message(): outbox helper with WhatsApp quiet-hours (08:00-19:00 EAT)
-- and SMS period metering.
-- ---------------------------------------------------------------------------
create or replace function public.queue_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_scheduled timestamptz := now();
  v_eat_hour int;
  v_limit int;
  v_used int;
begin
  -- WhatsApp: outside 08:00-19:00 EAT, defer to next 08:00 EAT.
  if p_channel = 'whatsapp' then
    v_eat_hour := extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_eat_hour >= 19 or v_eat_hour < 8 then
      v_scheduled := ((v_scheduled at time zone 'Africa/Nairobi')::date
        + case when v_eat_hour >= 19 then interval '1 day' else interval '0' end
        + interval '8 hours') at time zone 'Africa/Nairobi';
    end if;
  end if;

  -- SMS metering: cap at the tier's smsPerPeriod.
  if p_channel = 'sms' then
    select (t.limits ->> 'smsPerPeriod')::int, c.sms_used_this_period
      into v_limit, v_used
    from public.companies c
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.id = p_company_id;

    if v_limit is not null and coalesce(v_used, 0) >= v_limit then
      raise exception 'sms_limit_reached: % of % used this period', v_used, v_limit;
    end if;
  end if;

  insert into public.outbox (company_id, channel, recipient, subject, body, scheduled_after)
  values (p_company_id, p_channel, p_recipient, p_subject, p_body, v_scheduled)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.queue_message(uuid, text, text, text, text) from authenticated, anon, public;
grant execute on function public.queue_message(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Credit reminder checkpoints (dedupe): one notification per customer per
-- bucket per 10 days.
-- ---------------------------------------------------------------------------
create table public.credit_notification_checkpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  bucket text not null,
  notified_at timestamptz not null default now(),
  unique (company_id, customer_id, bucket)
);

alter table public.credit_notification_checkpoints enable row level security;
grant all on public.credit_notification_checkpoints to service_role;
-- no client read needed; service role only

-- Daily scan: in-app notification + SMS for customers entering/overdue in a
-- bucket, deduped via checkpoints (10-day freeze per bucket).
create or replace function public.credit_reminder_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select a.company_id, a.customer_id, a.balance, a.days_outstanding, a.bucket,
           c.first_name, c.phone, c.notifications_enabled
    from public.customer_credit_aging a
    join public.customers c on c.id = a.customer_id
    where a.bucket in ('8-30', '31-60', '60+')
  loop
    -- dedupe: skip if this bucket was notified within 10 days
    if exists (
      select 1 from public.credit_notification_checkpoints cp
      where cp.company_id = v_row.company_id
        and cp.customer_id = v_row.customer_id
        and cp.bucket = v_row.bucket
        and cp.notified_at > now() - interval '10 days'
    ) then
      continue;
    end if;

    perform public.notify(
      v_row.company_id, 'credit_reminder',
      'Credit overdue: ' || v_row.first_name,
      format('Balance KES %s, %s days outstanding (%s).',
             (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding, v_row.bucket),
      '/money/credit'
    );

    if v_row.phone is not null and v_row.notifications_enabled then
      begin
        perform public.queue_message(
          v_row.company_id, 'sms', v_row.phone,
          format('Reminder: your balance of KES %s is %s days overdue. Please pay to keep your credit active.',
                 (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding)
        );
      exception when others then
        -- sms limit reached etc. — in-app notification already sent; continue
        null;
      end;
    end if;

    insert into public.credit_notification_checkpoints (company_id, customer_id, bucket)
    values (v_row.company_id, v_row.customer_id, v_row.bucket)
    on conflict (company_id, customer_id, bucket) do update set notified_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.credit_reminder_scan() from authenticated, anon, public;
grant execute on function public.credit_reminder_scan() to service_role;

select cron.schedule(
  'credit-reminder-scan',
  '22 3 * * *', -- 06:22 EAT daily
  $$select public.credit_reminder_scan()$$
);

-- Outbox flush every minute via pg_net -> notification-flush edge function.
-- Function URL + service key are read from Vault secrets set at deploy time
-- (NOTIFY_FLUSH_URL, set in CI/deploy). Skipped when the secret is absent
-- (local dev without functions serving).
create or replace function public.flush_outbox_trigger()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select max(case when name = 'NOTIFY_FLUSH_URL' then decrypted_secret end),
         max(case when name = 'SUPABASE_SERVICE_ROLE_KEY' then decrypted_secret end)
    into v_url, v_key
  from vault.decrypted_secrets
  where name in ('NOTIFY_FLUSH_URL', 'SUPABASE_SERVICE_ROLE_KEY');

  if v_url is null then
    return; -- not configured (local dev); nothing to call
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_key, '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.flush_outbox_trigger() from authenticated, anon, public;
grant execute on function public.flush_outbox_trigger() to service_role;

select cron.schedule(
  'outbox-flush',
  '* * * * *',
  $$select public.flush_outbox_trigger()$$
);

-- ---------------------------------------------------------------------------
-- increment_sms_usage: called by notification-flush per delivered SMS.
-- ---------------------------------------------------------------------------
create or replace function public.increment_sms_usage(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies
  set sms_used_this_period = sms_used_this_period + 1
  where id = p_company_id;
end;
$$;

revoke execute on function public.increment_sms_usage(uuid) from authenticated, anon, public;
grant execute on function public.increment_sms_usage(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_batch_message: staff-facing batch messaging (customer groups).
-- p_audience: 'all' | 'credit_overdue'
-- ---------------------------------------------------------------------------
create or replace function public.queue_batch_message(
  p_channel text,
  p_body text,
  p_audience text default 'all'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_customer record;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_channel not in ('sms', 'whatsapp') then
    raise exception 'invalid_channel: batch messaging supports sms/whatsapp';
  end if;

  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'invalid_body';
  end if;

  for v_customer in
    select c.phone from public.customers c
    where c.company_id = v_company_id
      and c.phone is not null
      and c.notifications_enabled
      and not c.is_supplier
      and (
        p_audience = 'all'
        or (p_audience = 'credit_overdue' and exists (
          select 1 from public.customer_credit_aging a
          where a.company_id = v_company_id and a.customer_id = c.id
        ))
      )
  loop
    begin
      perform public.queue_message(v_company_id, p_channel, v_customer.phone, p_body);
      v_count := v_count + 1;
    exception when others then
      -- sms limit mid-batch: stop expanding, report what was queued
      raise;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.queue_batch_message(text, text, text) from anon, public;
grant execute on function public.queue_batch_message(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801022000_0026_storefront_platform.sql
-- ----------------------------------------------------------------------------
-- 0026_storefront_platform.sql
-- Phase 7 backend: public storefront read surface (anon) + platform
-- (super-admin) RPCs.

-- ---------------------------------------------------------------------------
-- Storefront visibility rule (old storefront-public.resolver.ts):
-- public when approved + opted in; CATALOGUE only while subscription is
-- active/trial/in-grace/exempt (identity stays visible when lapsed).
-- ---------------------------------------------------------------------------
create or replace function public.storefront_catalogue_visible(c public.companies)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'approved'
    and c.public_storefront_enabled
    and (
      c.subscription_status in ('trial', 'active')
      or (c.subscription_status = 'expired'
          and c.subscription_grace_period_end is not null
          and c.subscription_grace_period_end > now())
      or (c.subscription_exempt_until is not null and c.subscription_exempt_until > now())
    )
$$;

-- Public storefront directory (anon).
create view public.public_storefronts as
select
  id,
  name,
  public_slug as slug,
  logo_path,
  public_whatsapp_number,
  public.storefront_catalogue_visible(c) as catalogue_visible
from public.companies c
where c.status = 'approved' and c.public_storefront_enabled;

grant select on public.public_storefronts to anon, authenticated;

-- Public catalog for a slug (anon). Products only when catalogue_visible.
create or replace function public.storefront_catalog(p_slug text)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
$$;

revoke execute on function public.storefront_catalog(text) from public;
grant execute on function public.storefront_catalog(text) to anon, authenticated;

-- Public collections for a slug.
create or replace function public.storefront_collections(p_slug text)
returns setof public.collections
language sql
stable
security definer
set search_path = ''
as $$
  select col.*
  from public.collections col
  join public.companies c on c.id = col.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and col.active
$$;

revoke execute on function public.storefront_collections(text) from public;
grant execute on function public.storefront_collections(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform (super-admin) RPCs. All gated on is_platform_admin().
-- ---------------------------------------------------------------------------
create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;
end;
$$;

revoke execute on function public.assert_platform_admin() from authenticated, anon, public;
grant execute on function public.assert_platform_admin() to authenticated, service_role;

-- Company lifecycle: approve / disable / ban.
create or replace function public.platform_set_company_status(p_company_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  if p_status not in ('unapproved', 'approved', 'disabled', 'banned') then
    raise exception 'invalid_status';
  end if;

  update public.companies
  set status = p_status, updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Subscription override: tier, exemption, grace extension.
create or replace function public.platform_update_subscription(
  p_company_id uuid,
  p_tier_id uuid default null,
  p_subscription_status text default null,
  p_exempt_until timestamptz default null,
  p_exempt_reason text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  update public.companies
  set subscription_tier_id = coalesce(p_tier_id, subscription_tier_id),
      subscription_status = coalesce(p_subscription_status, subscription_status),
      subscription_exempt_until = coalesce(p_exempt_until, subscription_exempt_until),
      subscription_exempt_reason = coalesce(p_exempt_reason, subscription_exempt_reason),
      subscription_expires_at = coalesce(p_expires_at, subscription_expires_at),
      updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Tier management.
create or replace function public.platform_upsert_tier(
  p_code text,
  p_name text,
  p_price_monthly bigint,
  p_price_yearly bigint,
  p_limits jsonb default '{}',
  p_features jsonb default '{}',
  p_tier_id uuid default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.assert_platform_admin();

  if p_tier_id is not null then
    update public.subscription_tiers
    set code = coalesce(p_code, code),
        name = coalesce(p_name, name),
        price_monthly = coalesce(p_price_monthly, price_monthly),
        price_yearly = coalesce(p_price_yearly, price_yearly),
        limits = coalesce(p_limits, limits),
        features = coalesce(p_features, features),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_tier_id
    returning id into v_id;

    if v_id is null then
      raise exception 'tier_not_found: %', p_tier_id;
    end if;
  else
    insert into public.subscription_tiers (code, name, price_monthly, price_yearly, limits, features)
    values (p_code, p_name, p_price_monthly, p_price_yearly, coalesce(p_limits, '{}'), coalesce(p_features, '{}'))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Platform stats (dashboard).
create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_approved', (select count(*) from public.companies where status = 'approved'),
    'companies_pending', (select count(*) from public.companies where status = 'unapproved'),
    'subscriptions_active', (select count(*) from public.companies where subscription_status = 'active'),
    'subscriptions_trial', (select count(*) from public.companies where subscription_status = 'trial'),
    'subscriptions_expired', (select count(*) from public.companies where subscription_status = 'expired'),
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

do $$
declare
  f text;
begin
  foreach f in array array[
    'platform_set_company_status(uuid, text)',
    'platform_update_subscription(uuid, uuid, text, timestamptz, text, timestamptz)',
    'platform_upsert_tier(text, text, bigint, bigint, jsonb, jsonb, uuid, boolean)',
    'platform_stats()'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801023000_0027_storefront_collection_filter.sql
-- ----------------------------------------------------------------------------
-- 0027_storefront_collection_filter.sql
-- storefront_catalog gains an optional collection filter so the public
-- storefront can filter by collection without exposing product_collections.

drop function public.storefront_catalog(text);

create or replace function public.storefront_catalog(
  p_slug text,
  p_collection_id uuid default null
)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
    and (
      p_collection_id is null
      or exists (
        select 1 from public.product_collections pc
        where pc.product_id = vc.product_id and pc.collection_id = p_collection_id
      )
    )
$$;

revoke execute on function public.storefront_catalog(text, uuid) from public;
grant execute on function public.storefront_catalog(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801024000_0028_search_path_hardening.sql
-- ----------------------------------------------------------------------------
-- 0028_search_path_hardening.sql
-- Lint fix (function_search_path_mutable): pin search_path on the three
-- JWT claim helpers (0001 predates the convention).

create or replace function public.current_company_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'company_id', '')::uuid
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'user_role', '')
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_platform_admin')::boolean, false)
$$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260801025000_0029_manual_posting_accounts.sql
-- ----------------------------------------------------------------------------
-- 0029_manual_posting_accounts.sql
-- Marks which ledger accounts humans may transact from/to manually
-- (expense "Paid from", transfers, supplier payments) and renames the M-Pesa
-- account CLEARING_MPESA -> MPESA: it is a real money account, not a clearing
-- account. Payment-method code 'mpesa' is unchanged.
--
-- allow_manual_posting is true only for the real money accounts:
-- CASH_ON_HAND, BANK_MAIN, MPESA. Everything else (AR, INVENTORY, clearing
-- accounts, liabilities, income, expense) is system-only.
--
-- Seed blocks in 0003/0016/0023 already insert the renamed MPESA row; their
-- explicit column lists are unchanged, so the backfill below is also what
-- gives freshly provisioned companies the correct flags on a fresh DB.

alter table public.ledger_accounts
  add column if not exists allow_manual_posting boolean not null default false;

-- Rename for existing companies (no-op on fresh DBs whose seeds already
-- insert MPESA). Journal lines reference account UUIDs, so history is intact.
update public.ledger_accounts
set code = 'MPESA', name = 'M-Pesa', updated_at = now()
where code = 'CLEARING_MPESA';

update public.payment_methods
set ledger_account_code = 'MPESA', updated_at = now()
where ledger_account_code = 'CLEARING_MPESA';

-- Backfill flags for every company (existing and freshly seeded alike).
update public.ledger_accounts
set allow_manual_posting = (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA')),
    updated_at = now()
where allow_manual_posting <> (code in ('CASH_ON_HAND', 'BANK_MAIN', 'MPESA'));

-- ---------------------------------------------------------------------------
-- Tighten the shared account validator: user-chosen manual accounts (expense
-- source, transfer endpoints, supplier payment account) must be real money
-- accounts, not just any active asset leaf. All call sites
-- (post_expense, post_transfer, pay_supplier, record_purchase) route through
-- this function, so tightening it here covers every manual-posting RPC.
-- ---------------------------------------------------------------------------
create or replace function public.require_asset_leaf_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id
  from public.ledger_accounts a
  where a.company_id = p_company_id
    and a.code = p_code
    and a.type = 'asset'
    and a.is_active
    and not a.is_parent
    and a.allow_manual_posting;

  if v_id is null then
    raise exception 'invalid_source_account: %', p_code;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803000000_0030_live_dashboard.sql
-- ----------------------------------------------------------------------------
-- 0030_live_dashboard.sql
-- The reporting MVs remain the source for heavier report screens and refresh
-- hourly. The operational dashboard needs read-after-write consistency, so it
-- gets a small, tenant-scoped live snapshot built from the source tables.

create or replace function public.dashboard_sales_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_result jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  with completed_orders as (
    select
      o.id,
      o.company_id,
      (o.created_at at time zone 'Africa/Nairobi')::date as day,
      o.total
    from public.orders o
    where o.company_id = v_company_id
      and o.status = 'completed'
      and (o.created_at at time zone 'Africa/Nairobi')::date >= v_since
  ),
  order_costs as (
    select
      o.id,
      o.company_id,
      o.day,
      o.total,
      coalesce(sum(l.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs
    from completed_orders o
    left join public.ledger_journal_lines l
      on l.company_id = o.company_id and l.order_id = o.id
    left join public.ledger_accounts a
      on a.id = l.account_id and a.company_id = o.company_id
    group by o.id, o.company_id, o.day, o.total
  ),
  summary as (
    select
      company_id,
      day,
      count(*)::int as orders,
      coalesce(sum(total), 0)::bigint as revenue,
      coalesce(sum(cogs), 0)::bigint as cogs,
      (coalesce(sum(total), 0) - coalesce(sum(cogs), 0))::bigint as margin
    from order_costs
    group by company_id, day
  ),
  product_sales as (
    select
      o.company_id,
      o.day,
      l.variant_id,
      coalesce(sum(l.quantity), 0) as quantity,
      coalesce(sum(l.line_total), 0)::bigint as revenue,
      coalesce(
        sum(round(o.cogs * l.line_total::numeric / nullif(o.total, 0))),
        0
      )::bigint as cogs
    from order_costs o
    join public.order_lines l on l.order_id = o.id and l.company_id = o.company_id
    group by o.company_id, o.day, l.variant_id
  )
  select jsonb_build_object(
    'summary', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.day) from summary s),
      '[]'::jsonb
    ),
    'productSales', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_sales_snapshot(date) from anon, public;
grant execute on function public.dashboard_sales_snapshot(date) to authenticated;

-- Keep supplier screens in sync across tabs/users. Local writes already reload
-- after their RPC completes; these publications cover external changes too.
alter publication supabase_realtime add table public.purchases;
alter publication supabase_realtime add table public.purchase_payments;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803001000_0031_cashier_session_enforcement.sql
-- ----------------------------------------------------------------------------
-- 0031_cashier_session_enforcement.sql
-- Cashier sessions are an accounting boundary, not just a UI state.
-- Drafts and credit purchases remain available while the till is closed;
-- completed sales and any operation that moves money require an open session.

create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = p_company_id
    and s.status = 'open'
  limit 1
  for key share;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  return v_session_id;
end;
$$;

revoke execute on function public.require_open_cashier_session(uuid)
  from authenticated, anon, public;
grant execute on function public.require_open_cashier_session(uuid) to service_role;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_source_type = any (array[
    'Payment',
    'CreditSale',
    'PaymentAllocation',
    'Expense',
    'InterAccountTransfer',
    'SupplierPayment',
    'Refund',
    'PaymentReversal'
  ])
$$;

revoke execute on function public.cashier_session_required_for_source(text)
  from authenticated, anon, public;
grant execute on function public.cashier_session_required_for_source(text) to service_role;

-- AFTER INSERT preserves post_journal_entry's idempotent replay behaviour:
-- an already-posted entry is not a new financial action and needs no new session.
create or replace function public.enforce_journal_entry_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.cashier_session_required_for_source(new.source_type) then
    perform public.require_open_cashier_session(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_entries_require_cashier_session on public.ledger_journal_entries;
create trigger ledger_entries_require_cashier_session
  after insert on public.ledger_journal_entries
  for each row execute function public.enforce_journal_entry_cashier_session();

-- Stamp governed journal lines with the session that was open while they were
-- posted. Paid purchases share InventoryPurchase with credit purchases, so the
-- isCreditPurchase line metadata is the authoritative discriminator.
create or replace function public.tag_journal_line_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text;
  v_session_id uuid;
  v_requires_session boolean;
begin
  select e.source_type into v_source_type
  from public.ledger_journal_entries e
  where e.id = new.entry_id
    and e.company_id = new.company_id;

  if v_source_type is null then
    raise exception 'journal_entry_not_found: %', new.entry_id;
  end if;

  v_requires_session := public.cashier_session_required_for_source(v_source_type)
    or (
      v_source_type = 'InventoryPurchase'
      and new.meta ? 'isCreditPurchase'
      and (new.meta ->> 'isCreditPurchase')::boolean is false
    );

  if v_requires_session then
    v_session_id := public.require_open_cashier_session(new.company_id);
    new.meta := coalesce(new.meta, '{}'::jsonb)
      || jsonb_build_object('openSessionId', v_session_id);

    -- The paid/credit discriminator arrives on the second purchase line.
    -- Backfill the earlier inventory line so the whole entry is attributable.
    if v_source_type = 'InventoryPurchase'
       and new.meta ? 'isCreditPurchase'
       and (new.meta ->> 'isCreditPurchase')::boolean is false then
      update public.ledger_journal_lines
      set meta = meta || jsonb_build_object('openSessionId', v_session_id)
      where entry_id = new.entry_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_lines_tag_cashier_session on public.ledger_journal_lines;
create trigger ledger_lines_tag_cashier_session
  before insert on public.ledger_journal_lines
  for each row execute function public.tag_journal_line_cashier_session();

-- A completed order must belong to the open session. The database supplies the
-- session id so callers cannot attach a sale to a closed or foreign session.
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    v_session_id := public.require_open_cashier_session(new.company_id);

    if new.cashier_session_id is not null and new.cashier_session_id <> v_session_id then
      raise exception 'cashier_session_mismatch: completed order must use the open session';
    end if;

    new.cashier_session_id := v_session_id;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803002000_0032_product_opening_stock.sql
-- ----------------------------------------------------------------------------
-- 0032_product_opening_stock.sql
-- Product creation with optional opening inventory. Product, variants, batches,
-- movements and the opening-value journal are one transaction.

alter table public.inventory_batches
  add column if not exists batch_number text;

-- A real opening balance is equity, not a supplier purchase or cash payment.
insert into public.ledger_accounts (company_id, code, name, type, is_system)
select c.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true
from public.companies c
on conflict (company_id, code) do nothing;

create or replace function public.ensure_opening_balance_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_accounts (company_id, code, name, type, is_system)
  values (new.id, 'OPENING_BALANCE_EQUITY', 'Opening Balance Equity', 'equity', true)
  on conflict (company_id, code) do nothing;
  return new;
end;
$$;

create trigger companies_opening_balance_account
after insert on public.companies
for each row execute function public.ensure_opening_balance_account();

create or replace function public.create_catalog_product(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := coalesce((v_variant ->> 'allow_fractional')::boolean, false);
    v_quantity := coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0);

    if v_quantity < 0 then raise exception 'invalid_opening_quantity'; end if;
    if v_quantity > 0 and not v_track then
      raise exception 'opening_stock_requires_tracked_good';
    end if;
    if v_quantity > 0 and not v_fractional and v_quantity <> trunc(v_quantity) then
      raise exception 'fractional_opening_stock_not_allowed';
    end if;
    if v_quantity > 0 and nullif(v_variant ->> 'opening_unit_cost', '') is null then
      raise exception 'opening_unit_cost_required';
    end if;

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::bigint, 0);
    if v_unit_cost < 0 then raise exception 'invalid_opening_unit_cost'; end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    ) values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track
    ) returning id into v_variant_id;

    if v_quantity > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;

      v_location_id := nullif(v_variant ->> 'opening_location_id', '')::uuid;
      if v_location_id is null then
        select id into v_location_id from public.stock_locations
        where company_id = v_company_id and code = 'MAIN' limit 1;
      end if;
      if not exists (
        select 1 from public.stock_locations
        where id = v_location_id and company_id = v_company_id
      ) then raise exception 'invalid_stock_location'; end if;

      v_line_value := round(v_quantity * v_unit_cost);
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_product_id::text,
        jsonb_build_object('openingStock', true, 'productId', v_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_product_id::text,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', v_product_id))
      )
    );
  end if;

  return v_product_id;
end;
$$;

revoke execute on function public.create_catalog_product(text, jsonb, text, text)
  from anon, public;
grant execute on function public.create_catalog_product(text, jsonb, text, text)
  to authenticated;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803003000_0033_customer_bulk_payment.sql
-- ----------------------------------------------------------------------------
-- 0033_customer_bulk_payment.sql
-- Allocate one received customer payment oldest-credit-order first. The
-- existing allocation RPC remains the source of payment + ledger truth.

create or replace function public.post_customer_payment(
  p_customer_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_remaining bigint := p_amount;
  v_due bigint;
  v_take bigint;
  v_total_due bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from public.customers where id = p_customer_id
      and company_id = v_company_id and not is_supplier
  ) then raise exception 'customer_not_found'; end if;

  select coalesce(sum(o.total - coalesce(p.paid, 0)), 0)::bigint into v_total_due
  from public.orders o
  left join (
    select order_id, sum(amount)::bigint paid from public.payments
    where company_id = v_company_id and status = 'settled' group by order_id
  ) p on p.order_id = o.id
  where o.company_id = v_company_id and o.customer_id = p_customer_id
    and o.is_credit_sale and o.status = 'completed';
  if p_amount > v_total_due then raise exception 'payment_exceeds_customer_balance'; end if;

  for v_order in
    select o.id, o.code, o.total - coalesce(p.paid, 0) as due
    from public.orders o
    left join (
      select order_id, sum(amount)::bigint paid from public.payments
      where company_id = v_company_id and status = 'settled' group by order_id
    ) p on p.order_id = o.id
    where o.company_id = v_company_id and o.customer_id = p_customer_id
      and o.is_credit_sale and o.status = 'completed'
      and o.total - coalesce(p.paid, 0) > 0
    order by o.created_at, o.id
    for update of o
  loop
    exit when v_remaining <= 0;
    v_due := v_order.due;
    v_take := least(v_remaining, v_due);
    perform public.post_payment_allocation(
      v_order.id, v_take, p_method_code,
      case when p_reference is null then null
           else p_reference || ' · ' || v_order.code end
    );
    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.id, 'order_code', v_order.code, 'amount', v_take
    );
    v_remaining := v_remaining - v_take;
  end loop;

  return jsonb_build_object('amount', p_amount, 'allocations', v_allocations);
end;
$$;

revoke execute on function public.post_customer_payment(uuid, bigint, text, text)
  from anon, public;
grant execute on function public.post_customer_payment(uuid, bigint, text, text)
  to authenticated;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803004000_0034_purchase_lifecycle.sql
-- ----------------------------------------------------------------------------
-- 0034_purchase_lifecycle.sql
-- Durable purchase detail, drafts, location-aware receiving and payment
-- against one selected purchase.

alter table public.purchases
  add column if not exists purchase_date date not null default current_date,
  add column if not exists notes text,
  add column if not exists stock_location_id uuid references public.stock_locations(id);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  inventory_batch_id uuid references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  line_total bigint not null check (line_total >= 0),
  batch_number text,
  expiry_date date,
  created_at timestamptz not null default now()
);
create index purchase_lines_purchase_idx on public.purchase_lines(purchase_id);
alter table public.purchase_lines enable row level security;
create policy "purchase lines readable by members" on public.purchase_lines for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_lines to authenticated;
grant all on public.purchase_lines to service_role;

create table public.purchase_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  reference text,
  notes text,
  purchase_date date not null default current_date,
  lines jsonb not null,
  total_cost bigint not null check (total_cost > 0),
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  posted_purchase_id uuid references public.purchases(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchase_drafts enable row level security;
create policy "purchase drafts readable by members" on public.purchase_drafts for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));
grant select on public.purchase_drafts to authenticated;
grant all on public.purchase_drafts to service_role;

create or replace function public.record_purchase(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_supplier record; v_purchase_id uuid; v_line jsonb; v_total bigint := 0;
  v_batch_count int := 0; v_ap_balance bigint; v_location_id uuid;
  v_variant_id uuid; v_quantity numeric(14,3); v_unit_cost bigint;
  v_line_total bigint; v_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  select * into v_supplier from public.customers where id = p_supplier_id
    and company_id = v_company_id and is_supplier;
  if v_supplier is null then raise exception 'supplier_not_found: %', p_supplier_id; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    then raise exception 'purchase_lines_required'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_quantity := nullif(v_line ->> 'quantity', '')::numeric;
    v_unit_cost := nullif(v_line ->> 'unit_cost', '')::bigint;
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0
      then raise exception 'invalid_purchase_line'; end if;
    if not exists (select 1 from public.product_variants where id = v_variant_id
      and company_id = v_company_id and kind = 'good')
      then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round(v_quantity * v_unit_cost);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;

  if p_is_credit then
    if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
      raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
    select coalesce(sum(l.credit) - sum(l.debit), 0) into v_ap_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_company_id and a.code = 'ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId' = p_supplier_id::text;
    if v_supplier.supplier_credit_limit > 0 and v_ap_balance + v_total > v_supplier.supplier_credit_limit
      then raise exception 'supplier_credit_limit_exceeded: balance % + % > limit %',
        v_ap_balance, v_total, v_supplier.supplier_credit_limit; end if;
  else
    perform public.require_asset_leaf_account(v_company_id, p_account_code);
  end if;

  v_location_id := p_stock_location_id;
  if v_location_id is null then select id into v_location_id from public.stock_locations
    where company_id = v_company_id and code = 'MAIN' limit 1; end if;
  if not exists(select 1 from public.stock_locations where id = v_location_id and company_id = v_company_id)
    then raise exception 'invalid_stock_location'; end if;

  insert into public.purchases(company_id,supplier_id,reference,total_cost,is_credit,created_by,
    notes,purchase_date,stock_location_id)
  values(v_company_id,p_supplier_id,nullif(trim(coalesce(p_reference,'')),''),v_total,p_is_credit,
    auth.uid(),nullif(trim(coalesce(p_notes,'')),''),coalesce(p_purchase_date,current_date),v_location_id)
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_batch_count := v_batch_count + 1;
    v_variant_id := (v_line ->> 'variant_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_cost := (v_line ->> 'unit_cost')::bigint;
    v_line_total := round(v_quantity * v_unit_cost);
    insert into public.inventory_batches(company_id,variant_id,stock_location_id,supplier_id,
      quantity,remaining,unit_cost,batch_number,expiry_date)
    values(v_company_id,v_variant_id,v_location_id,p_supplier_id,v_quantity,v_quantity,v_unit_cost,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date)
    returning id into v_batch_id;
    insert into public.purchase_lines(company_id,purchase_id,variant_id,inventory_batch_id,quantity,
      unit_cost,line_total,batch_number,expiry_date)
    values(v_company_id,v_purchase_id,v_variant_id,v_batch_id,v_quantity,v_unit_cost,v_line_total,
      nullif(trim(coalesce(v_line ->> 'batch_number','')),''),nullif(v_line ->> 'expiry_date','')::date);
    insert into public.inventory_movements(company_id,variant_id,batch_id,type,quantity,unit_cost,
      total_cost,source_type,source_id)
    values(v_company_id,v_variant_id,v_batch_id,'purchase',v_quantity,v_unit_cost,v_line_total,
      'InventoryPurchase',v_purchase_id::text);
  end loop;

  perform public.post_journal_entry(v_company_id,'InventoryPurchase',v_purchase_id::text,
    'Purchase ' || coalesce(p_reference,v_purchase_id::text),jsonb_build_array(
      jsonb_build_object('account_code','INVENTORY','debit',v_total,'meta',jsonb_build_object(
        'purchaseId',v_purchase_id,'purchaseReference',p_reference,'supplierId',p_supplier_id,'batchCount',v_batch_count)),
      jsonb_build_object('account_code',case when p_is_credit then 'ACCOUNTS_PAYABLE' else p_account_code end,
        'credit',v_total,'meta',jsonb_build_object('purchaseId',v_purchase_id,'purchaseReference',p_reference,
        'supplierId',p_supplier_id,'isCreditPurchase',p_is_credit))));
  return v_purchase_id;
end;
$$;

-- Remove the legacy signature to prevent PostgREST overload ambiguity.
drop function if exists public.record_purchase(uuid,jsonb,boolean,text,text);
revoke execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) from anon,public;
grant execute on function public.record_purchase(uuid,jsonb,boolean,text,text,text,date,uuid) to authenticated;

create or replace function public.save_purchase_draft(
  p_supplier_id uuid, p_lines jsonb, p_reference text default null,
  p_notes text default null, p_purchase_date date default current_date,
  p_draft_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_total bigint := 0;
  v_line jsonb; v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_entitled(v_company_id, 'product');
  if not exists(select 1 from public.customers where id=p_supplier_id and company_id=v_company_id and is_supplier)
    then raise exception 'supplier_not_found'; end if;
  if p_lines is null or jsonb_array_length(p_lines)=0 then raise exception 'purchase_lines_required'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if not exists(select 1 from public.product_variants where id=(v_line->>'variant_id')::uuid
      and company_id=v_company_id and kind='good') then raise exception 'invalid_purchase_variant'; end if;
    v_total := v_total + round((v_line->>'quantity')::numeric*(v_line->>'unit_cost')::bigint);
  end loop;
  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_draft_id is null then
    insert into public.purchase_drafts(company_id,supplier_id,reference,notes,purchase_date,lines,total_cost,created_by)
    values(v_company_id,p_supplier_id,p_reference,p_notes,coalesce(p_purchase_date,current_date),p_lines,v_total,auth.uid()) returning id into v_id;
  else
    update public.purchase_drafts set supplier_id=p_supplier_id,reference=p_reference,notes=p_notes,
      purchase_date=coalesce(p_purchase_date,current_date),lines=p_lines,total_cost=v_total,updated_at=now()
    where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
    if v_id is null then raise exception 'purchase_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.cancel_purchase_draft(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_id uuid;
begin update public.purchase_drafts set status='cancelled',updated_at=now()
  where id=p_draft_id and company_id=v_company_id and status='draft' returning id into v_id;
  if v_id is null then raise exception 'purchase_draft_not_found'; end if; return v_id; end;
$$;

create or replace function public.pay_purchase(p_purchase_id uuid,p_amount bigint,p_account_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid:=public.current_company_id(); v_purchase public.purchases%rowtype;
  v_paid bigint; v_payment_id uuid;
begin
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_account_code);
  select * into v_purchase from public.purchases where id=p_purchase_id and company_id=v_company_id
    and is_credit for update;
  if v_purchase.id is null then raise exception 'credit_purchase_not_found'; end if;
  select coalesce(sum(amount),0) into v_paid from public.purchase_payments where purchase_id=p_purchase_id;
  if p_amount > v_purchase.total_cost-v_paid then raise exception 'ap_overpayment'; end if;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by)
  values(v_company_id,p_purchase_id,p_amount,p_account_code,auth.uid()) returning id into v_payment_id;
  perform public.post_journal_entry(v_company_id,'SupplierPayment',v_payment_id::text,
    'Supplier payment '||coalesce(v_purchase.reference,v_purchase.id::text),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id,'method',p_account_code))));
  return v_payment_id;
end;
$$;

revoke execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) from anon,public;
revoke execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) from anon,public;
revoke execute on function public.cancel_purchase_draft(uuid) from anon,public;
revoke execute on function public.pay_purchase(uuid,bigint,text) from anon,public;
grant execute on function public.save_purchase_draft(uuid,jsonb,text,text,date,uuid) to authenticated;
grant execute on function public.confirm_purchase_draft(uuid,boolean,text,uuid) to authenticated;
grant execute on function public.cancel_purchase_draft(uuid) to authenticated;
grant execute on function public.pay_purchase(uuid,bigint,text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803005000_0035_platform_operations.sql
-- ----------------------------------------------------------------------------
-- 0035_platform_operations.sql
-- Focused production diagnostics and an audited in-app platform broadcast.

create or replace function public.platform_operations_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unbalanced bigint; v_failed bigint; v_pending bigint; v_members bigint;
begin
  perform public.assert_platform_admin();
  select count(*) into v_pending from public.companies where status='unapproved';
  select count(*) into v_failed from public.outbox where status='failed';
  select count(*) into v_members from public.company_memberships where authorization_status='approved';
  select count(*) into v_unbalanced from (
    select entry_id from public.ledger_journal_lines group by entry_id
    having sum(debit) <> sum(credit)
  ) broken;
  return jsonb_build_object('pending_companies',v_pending,'failed_outbox',v_failed,
    'active_memberships',v_members,'unbalanced_journals',v_unbalanced);
end;
$$;

create or replace function public.platform_broadcast(p_title text,p_body text,p_link text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
  perform public.assert_platform_admin();
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_body,'')))=0
    then raise exception 'title_and_body_required'; end if;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  select distinct m.company_id,null::uuid,'system',trim(p_title),trim(p_body),nullif(trim(coalesce(p_link,'')),'')
  from public.company_memberships m join public.companies c on c.id=m.company_id
  where m.authorization_status='approved' and c.status='approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.platform_operations_snapshot() from anon,public;
revoke execute on function public.platform_broadcast(text,text,text) from anon,public;
grant execute on function public.platform_operations_snapshot() to authenticated;
grant execute on function public.platform_broadcast(text,text,text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803006000_0036_platform_broadcast_type.sql
-- ----------------------------------------------------------------------------
-- Keep the company-wide recipient explicitly typed for plpgsql_check and PG.
create or replace function public.platform_broadcast(p_title text,p_body text,p_link text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
  perform public.assert_platform_admin();
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_body,'')))=0
    then raise exception 'title_and_body_required'; end if;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  select distinct m.company_id,null::uuid,'system',trim(p_title),trim(p_body),
    nullif(trim(coalesce(p_link,'')),'')
  from public.company_memberships m join public.companies c on c.id=m.company_id
  where m.authorization_status='approved' and c.status='approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803007000_0037_delete_proforma.sql
-- ----------------------------------------------------------------------------
-- Proformas are non-posting draft orders. Any active company member may remove one,
-- matching the existing save/edit behavior. Tenant scoping and the state check keep
-- posted and parked sales outside this destructive path.

create or replace function public.delete_proforma(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order.id is null then
    raise exception 'proforma_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'draft' then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and status = 'pending'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id and company_id = v_company_id and status = 'draft';

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803008000_0038_location_entitlements.sql
-- ----------------------------------------------------------------------------
-- Central entitlement read model plus gated stock-location management.

alter table public.stock_locations
  add column if not exists is_default boolean not null default false;

with ranked as (
  select id, row_number() over (partition by company_id order by created_at, id) as position
  from public.stock_locations
)
update public.stock_locations l
set is_default = true
from ranked r
where r.id = l.id and r.position = 1
  and not exists (
    select 1 from public.stock_locations existing
    where existing.company_id = l.company_id and existing.is_default
  );

create unique index if not exists stock_locations_one_default_idx
  on public.stock_locations (company_id) where is_default;

update public.subscription_tiers
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'multipleLocations', case
    when features ? 'multipleLocations' then (features ->> 'multipleLocations')::boolean
    else coalesce((limits ->> 'maxStockLocations')::int, 1) > 1
  end
);

create or replace function public.feature_enabled(p_company_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.features ? p_feature then coalesce((t.features ->> p_feature)::boolean, false)
    when p_feature = 'multipleLocations'
      then coalesce((t.limits ->> 'maxStockLocations')::int, 1) > 1
    else false
  end
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id
$$;

revoke execute on function public.feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.feature_enabled(uuid, text) to service_role;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', coalesce(t.features, '{}'::jsonb),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;

  return v_result;
end;
$$;

revoke execute on function public.current_entitlements() from public, anon;
grant execute on function public.current_entitlements() to authenticated, service_role;

create or replace function public.create_stock_location(
  p_code text,
  p_name text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_count int;
  v_limit int;
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;

  perform 1 from public.companies where id = v_company_id for update;
  select count(*) into v_count from public.stock_locations where company_id = v_company_id;

  if v_count > 0 and not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;

  select nullif(t.limits ->> 'maxStockLocations', '')::int into v_limit
  from public.companies c left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'limit_reached: stock location limit (%); upgrade your plan', v_limit;
  end if;

  if p_is_default or v_count = 0 then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;

  insert into public.stock_locations (company_id, code, name, is_default)
  values (v_company_id, v_code, trim(p_name), p_is_default or v_count = 0)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

create or replace function public.update_stock_location(
  p_location_id uuid,
  p_code text,
  p_name text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = v_company_id)
    then raise exception 'stock_location_not_found: %', p_location_id; end if;

  if p_is_default then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;
  update public.stock_locations
  set code = v_code, name = trim(p_name), is_default = is_default or p_is_default, updated_at = now()
  where id = p_location_id and company_id = v_company_id;
  return p_location_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

create or replace function public.delete_stock_location(p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location public.stock_locations%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  select * into v_location from public.stock_locations
  where id = p_location_id and company_id = v_company_id for update;
  if v_location.id is null then raise exception 'stock_location_not_found: %', p_location_id; end if;
  if v_location.is_default then raise exception 'default_location_cannot_be_deleted'; end if;
  if exists (select 1 from public.inventory_batches where stock_location_id = p_location_id)
     or exists (select 1 from public.purchases where stock_location_id = p_location_id) then
    raise exception 'location_in_use: move or retain its stock history';
  end if;

  delete from public.stock_locations where id = p_location_id and company_id = v_company_id;
  return p_location_id;
end;
$$;

revoke execute on function public.create_stock_location(text, text, boolean) from public, anon;
revoke execute on function public.update_stock_location(uuid, text, text, boolean) from public, anon;
revoke execute on function public.delete_stock_location(uuid) from public, anon;
grant execute on function public.create_stock_location(text, text, boolean) to authenticated, service_role;
grant execute on function public.update_stock_location(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.delete_stock_location(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803009000_0039_location_default_invariant.sql
-- ----------------------------------------------------------------------------
-- Every creation path, including company provisioning, makes the first location default.
create or replace function public.ensure_first_stock_location_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.stock_locations where company_id = new.company_id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_locations_first_default on public.stock_locations;
create trigger stock_locations_first_default
  before insert on public.stock_locations
  for each row execute function public.ensure_first_stock_location_default();


-- ----------------------------------------------------------------------------
-- [squashed] 20260803010000_0040_team_entitlement_limit.sql
-- ----------------------------------------------------------------------------
-- Complete the existing tier-limit coverage by enforcing maxAdmins on team additions.

create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  select * into v_company from public.companies where id = p_company_id;
  if v_company is null then raise exception 'company_not_found: %', p_company_id; end if;

  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > v_now then
    return;
  end if;
  if v_company.subscription_status not in ('trial', 'active') then
    if not (v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;
  if p_check is null then return; end if;

  select t.limits into v_limits from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;
  if v_limits is null then return; end if;

  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= (v_limits ->> 'maxOrdersPerMonth')::int then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_limits ->> 'maxOrdersPerMonth';
  end if;

  if p_check = 'product' and (v_limits ->> 'maxProducts') is not null
     and (select count(*) from public.product_variants v
       where v.company_id = p_company_id and v.active) >= (v_limits ->> 'maxProducts')::int then
    raise exception 'limit_reached: product limit (%); upgrade your plan', v_limits ->> 'maxProducts';
  end if;

  if p_check = 'team' and (v_limits ->> 'maxAdmins') is not null
     and (select count(*) from public.company_memberships m
       where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= (v_limits ->> 'maxAdmins')::int then
    raise exception 'limit_reached: team member limit (%); upgrade your plan', v_limits ->> 'maxAdmins';
  end if;
end;
$$;

create or replace function public.add_team_member(p_phone text, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_membership_id uuid;
  v_phone text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  v_phone := regexp_replace(p_phone, '[^\d]', '', 'g');
  v_phone := case when v_phone like '0%' then '254' || substr(v_phone, 2) else v_phone end;
  select u.id into v_user_id from auth.users u where u.phone = v_phone limit 1;
  if v_user_id is null then
    raise exception 'user_not_registered: % must log in once before being added', p_phone;
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  if not exists (
    select 1 from public.company_memberships
    where company_id = v_company_id and user_id = v_user_id and authorization_status = 'approved'
  ) then
    perform public.assert_entitled(v_company_id, 'team');
  end if;

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, p_role_id, 'approved')
  on conflict (company_id, user_id) do update
    set role_id = p_role_id, authorization_status = 'approved', updated_at = now()
  returning id into v_membership_id;
  return v_membership_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803011000_0041_team_reactivation_limit.sql
-- ----------------------------------------------------------------------------
-- Re-enabling a disabled membership consumes the same tier capacity as adding one.
create or replace function public.update_team_member(
  p_membership_id uuid,
  p_role_id uuid default null,
  p_authorization_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_current_status text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  if p_authorization_status is not null
     and p_authorization_status not in ('pending', 'approved', 'disabled') then
    raise exception 'invalid_status';
  end if;
  if p_role_id is not null and not exists (
    select 1 from public.roles where id = p_role_id and company_id = v_company_id
  ) then raise exception 'role_not_found: %', p_role_id; end if;

  select authorization_status into v_current_status
  from public.company_memberships
  where id = p_membership_id and company_id = v_company_id for update;
  if v_current_status is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  if p_authorization_status = 'approved' and v_current_status <> 'approved' then
    perform public.assert_entitled(v_company_id, 'team');
  end if;

  update public.company_memberships
  set role_id = coalesce(p_role_id, role_id),
      authorization_status = coalesce(p_authorization_status, authorization_status),
      updated_at = now()
  where id = p_membership_id and company_id = v_company_id;
  return p_membership_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- [squashed] 20260803012000_0042_purchase_intelligence.sql
-- ----------------------------------------------------------------------------
-- Purchase decision support and reversible supplier lifecycle.

alter table public.customers
  add column if not exists supplier_active boolean not null default true;

create or replace view public.supplier_variant_performance
with (security_invoker = true) as
select
  pl.company_id,
  p.supplier_id,
  pl.variant_id,
  count(distinct pl.purchase_id)::bigint as purchase_count,
  sum(pl.quantity)::numeric as total_quantity,
  sum(pl.line_total)::bigint as total_spend,
  round(sum(pl.line_total)::numeric / nullif(sum(pl.quantity), 0))::bigint as average_unit_cost,
  min(pl.unit_cost)::bigint as lowest_unit_cost,
  max(pl.unit_cost)::bigint as highest_unit_cost,
  (array_agg(pl.unit_cost order by p.purchase_date desc, p.created_at desc, pl.created_at desc))[1]::bigint
    as last_unit_cost,
  max(p.purchase_date) as last_purchase_date
from public.purchase_lines pl
join public.purchases p on p.id = pl.purchase_id and p.company_id = pl.company_id
group by pl.company_id, p.supplier_id, pl.variant_id;

grant select on public.supplier_variant_performance to authenticated;

create or replace function public.require_active_purchase_supplier()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.supplier_id and company_id = new.company_id
      and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;
  return new;
end;
$$;

create trigger purchases_active_supplier
before insert or update of supplier_id on public.purchases
for each row execute function public.require_active_purchase_supplier();

create trigger purchase_drafts_active_supplier
before insert or update of supplier_id on public.purchase_drafts
for each row execute function public.require_active_purchase_supplier();

create or replace function public.record_purchase_with_prices(
  p_supplier_id uuid,
  p_lines jsonb,
  p_is_credit boolean,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase_id uuid;
  v_line jsonb;
  v_variant public.product_variants%rowtype;
  v_wholesale bigint;
  v_retail bigint;
begin
  if not exists (
    select 1 from public.customers
    where id = p_supplier_id and company_id = v_company_id and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;

  -- Validate all requested catalog updates before creating any purchase state.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      select * into v_variant from public.product_variants
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
      if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
      v_wholesale := coalesce(nullif(v_line ->> 'new_wholesale_price', '')::bigint,
        v_variant.wholesale_price, 0);
      v_retail := coalesce(nullif(v_line ->> 'new_retail_price', '')::bigint, v_variant.price);
      if v_wholesale < 0 or v_retail < 0 then raise exception 'invalid_price'; end if;
      if v_retail < v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  v_purchase_id := public.record_purchase(p_supplier_id, p_lines, p_is_credit, p_reference,
    p_account_code, p_notes, p_purchase_date, p_stock_location_id);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      update public.product_variants set
        wholesale_price = case when v_line ? 'new_wholesale_price'
          then (v_line ->> 'new_wholesale_price')::bigint else wholesale_price end,
        price = case when v_line ? 'new_retail_price'
          then (v_line ->> 'new_retail_price')::bigint else price end,
        updated_at = now()
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_prices(uuid,jsonb,boolean,text,text,text,date,uuid)
  to authenticated;

create or replace function public.confirm_purchase_draft(
  p_draft_id uuid, p_is_credit boolean, p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts where id=p_draft_id
    and company_id=v_company_id and status='draft' for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id := public.record_purchase_with_prices(v_draft.supplier_id,v_draft.lines,p_is_credit,
    v_draft.reference,p_account_code,v_draft.notes,v_draft.purchase_date,p_stock_location_id);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
    where id=p_draft_id;
  return v_purchase_id;
end;
$$;

create or replace function public.set_supplier_active(p_supplier_id uuid, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := public.current_company_id(); v_id uuid; v_balance bigint;
begin
  if not p_active then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId'=p_supplier_id::text;
    if v_balance <> 0 then raise exception 'supplier_has_outstanding_balance'; end if;
    if exists(select 1 from public.purchase_drafts where company_id=v_company_id
      and supplier_id=p_supplier_id and status='draft')
      then raise exception 'supplier_has_open_drafts'; end if;
  end if;
  update public.customers set supplier_active=p_active,updated_at=now()
  where id=p_supplier_id and company_id=v_company_id and is_supplier returning id into v_id;
  if v_id is null then raise exception 'supplier_not_found'; end if;
  return v_id;
end;
$$;

revoke execute on function public.set_supplier_active(uuid,boolean) from anon, public;
grant execute on function public.set_supplier_active(uuid,boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803013000_0043_credit_limits.sql
-- ----------------------------------------------------------------------------
-- Permission-gated supplier credit policy management.

alter table public.customers
  add constraint customers_credit_limits_nonnegative
    check (credit_limit >= 0 and supplier_credit_limit >= 0),
  add constraint customers_credit_terms_nonnegative
    check ((credit_terms_days is null or credit_terms_days >= 0)
      and (supplier_credit_terms_days is null or supplier_credit_terms_days >= 0));

create or replace function public.update_supplier_credit(
  p_supplier_id uuid,
  p_credit_limit bigint,
  p_terms_days integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_supplier_credit_limit';
  end if;

  if p_terms_days is not null and p_terms_days < 0 then
    raise exception 'invalid_supplier_credit_terms';
  end if;

  update public.customers
  set supplier_credit_limit = p_credit_limit,
      supplier_credit_terms_days = p_terms_days,
      updated_at = now()
  where id = p_supplier_id
    and company_id = v_company_id
    and is_supplier;

  if not found then
    raise exception 'supplier_not_found: %', p_supplier_id;
  end if;

  return p_supplier_id;
end;
$$;

revoke execute on function public.update_supplier_credit(uuid, bigint, integer) from anon, public;
grant execute on function public.update_supplier_credit(uuid, bigint, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803014000_0044_partial_purchase_payment.sql
-- ----------------------------------------------------------------------------
-- Record an optional initial supplier payment in the same transaction as receiving stock.
-- A zero payment is a credit purchase, a full payment is paid now, and anything
-- between those values is a part-paid credit purchase.

create or replace function public.record_purchase_with_payment(
  p_supplier_id uuid,
  p_lines jsonb,
  p_payment_amount bigint,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_total bigint := 0;
  v_purchase_id uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'purchase_lines_required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if nullif(v_line ->> 'quantity', '')::numeric is null
      or (v_line ->> 'quantity')::numeric <= 0
      or nullif(v_line ->> 'unit_cost', '')::bigint is null
      or (v_line ->> 'unit_cost')::bigint < 0 then
      raise exception 'invalid_purchase_line';
    end if;
    v_total := v_total + round(
      (v_line ->> 'quantity')::numeric * (v_line ->> 'unit_cost')::bigint
    );
  end loop;

  if v_total <= 0 then raise exception 'invalid_amount'; end if;
  if p_payment_amount is null or p_payment_amount < 0 then
    raise exception 'invalid_initial_payment';
  end if;
  if p_payment_amount > v_total then raise exception 'ap_overpayment'; end if;

  if p_payment_amount = v_total then
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, false, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
  else
    v_purchase_id := public.record_purchase_with_prices(
      p_supplier_id, p_lines, true, p_reference, p_account_code, p_notes,
      p_purchase_date, p_stock_location_id
    );
    if p_payment_amount > 0 then
      perform public.pay_purchase(v_purchase_id, p_payment_amount, p_account_code);
    end if;
  end if;

  return v_purchase_id;
end;
$$;

create or replace function public.confirm_purchase_draft_with_payment(
  p_draft_id uuid,
  p_payment_amount bigint,
  p_account_code text default 'CASH_ON_HAND',
  p_stock_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_draft public.purchase_drafts%rowtype;
  v_purchase_id uuid;
begin
  select * into v_draft
  from public.purchase_drafts
  where id = p_draft_id and company_id = v_company_id and status = 'draft'
  for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;

  v_purchase_id := public.record_purchase_with_payment(
    v_draft.supplier_id, v_draft.lines, p_payment_amount, v_draft.reference,
    p_account_code, v_draft.notes, v_draft.purchase_date, p_stock_location_id
  );
  update public.purchase_drafts
  set status = 'confirmed', posted_purchase_id = v_purchase_id, updated_at = now()
  where id = p_draft_id;
  return v_purchase_id;
end;
$$;

revoke execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  from anon, public;
grant execute on function public.record_purchase_with_payment(uuid,jsonb,bigint,text,text,text,date,uuid)
  to authenticated;
revoke execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  from anon, public;
grant execute on function public.confirm_purchase_draft_with_payment(uuid,bigint,text,uuid)
  to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803015000_0045_coupled_product_edit.sql
-- ----------------------------------------------------------------------------
-- 0045_coupled_product_edit.sql
-- Product family details and all submitted variants update in one transaction.
-- Existing variants are updated in place; rows without variant_id are created.

create or replace function public.update_catalog_product(
  p_product_id uuid,
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_variant jsonb;
  v_variant_id uuid;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_label text;
  v_kind text;
  v_sku text;
  v_track boolean;
  v_fractional boolean;
  v_active boolean;
  v_quantity numeric(14,3);
  v_unit_cost bigint;
  v_line_value bigint;
  v_total_value bigint := 0;
  v_location_id uuid;
  v_batch_id uuid;
  v_opening_source_id text;
  v_count int := 0;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'invalid_name'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  update public.products
  set name = trim(p_name),
      barcode = nullif(trim(coalesce(p_barcode, '')), ''),
      active = coalesce(p_active, active),
      updated_at = now()
  where id = p_product_id and company_id = v_company_id;

  if not found then raise exception 'product_not_found: %', p_product_id; end if;

  -- A product may gain opening-stock variants in more than one edit. Use a
  -- per-edit source id so post_journal_entry's idempotency key does not hide
  -- later opening-value journals behind the product's original one.
  v_opening_source_id := p_product_id::text || ':' || gen_random_uuid()::text;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;
    v_variant_id := nullif(v_variant ->> 'variant_id', '')::uuid;
    if v_variant_id is not null and v_variant_id = any(v_seen_ids) then
      raise exception 'duplicate_variant: %', v_variant_id;
    end if;
    if v_variant_id is not null then v_seen_ids := array_append(v_seen_ids, v_variant_id); end if;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    if (v_variant ->> 'price') is null or (v_variant ->> 'price')::bigint < 0 then
      raise exception 'invalid_price: every variant needs a valid price';
    end if;
    if (v_variant ->> 'wholesale_price') is not null
       and (v_variant ->> 'wholesale_price')::bigint < 0 then
      raise exception 'invalid_wholesale_price';
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then raise exception 'invalid_kind'; end if;
    v_track := case when v_kind = 'service' then false
                    else coalesce((v_variant ->> 'track_inventory')::boolean, true) end;
    v_fractional := case when v_kind = 'service' then false
                         else coalesce((v_variant ->> 'allow_fractional')::boolean, false) end;
    v_active := coalesce((v_variant ->> 'active')::boolean, true);
    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');

    if v_variant_id is not null then
      if coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0) <> 0 then
        raise exception 'opening_stock_new_variants_only';
      end if;

      update public.product_variants
      set name = v_label,
          kind = v_kind,
          sku = coalesce(v_sku, sku),
          barcode = nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
          price = (v_variant ->> 'price')::bigint,
          wholesale_price = nullif(v_variant ->> 'wholesale_price', '')::bigint,
          allow_fractional = v_fractional,
          track_inventory = v_track,
          active = v_active,
          updated_at = now()
      where id = v_variant_id
        and product_id = p_product_id
        and company_id = v_company_id;

      if not found then raise exception 'variant_not_found: %', v_variant_id; end if;
      continue;
    end if;

    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || p_product_id::text || v_label), 1, 4));
    end if;

    v_quantity := coalesce(nullif(v_variant ->> 'opening_quantity', '')::numeric, 0);
    if v_quantity < 0 then raise exception 'invalid_opening_quantity'; end if;
    if v_quantity > 0 and not v_track then
      raise exception 'opening_stock_requires_tracked_good';
    end if;
    if v_quantity > 0 and not v_fractional and v_quantity <> trunc(v_quantity) then
      raise exception 'fractional_opening_stock_not_allowed';
    end if;
    if v_quantity > 0 and nullif(v_variant ->> 'opening_unit_cost', '') is null then
      raise exception 'opening_unit_cost_required';
    end if;

    v_unit_cost := coalesce(nullif(v_variant ->> 'opening_unit_cost', '')::bigint, 0);
    if v_unit_cost < 0 then raise exception 'invalid_opening_unit_cost'; end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory, active
    ) values (
      p_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      v_fractional, v_track, v_active
    ) returning id into v_variant_id;

    if v_quantity > 0 then
      if not public.current_user_has_permission('ManageStockAdjustments') then
        raise exception 'permission_denied: ManageStockAdjustments required';
      end if;

      v_location_id := nullif(v_variant ->> 'opening_location_id', '')::uuid;
      if v_location_id is null then
        select id into v_location_id from public.stock_locations
        where company_id = v_company_id and code = 'MAIN' limit 1;
      end if;
      if not exists (
        select 1 from public.stock_locations
        where id = v_location_id and company_id = v_company_id
      ) then raise exception 'invalid_stock_location'; end if;

      v_line_value := round(v_quantity * v_unit_cost);
      insert into public.inventory_batches (
        company_id, variant_id, stock_location_id, quantity, remaining, unit_cost,
        batch_number, expiry_date
      ) values (
        v_company_id, v_variant_id, v_location_id, v_quantity, v_quantity, v_unit_cost,
        nullif(trim(coalesce(v_variant ->> 'batch_number', '')), ''),
        nullif(v_variant ->> 'expiry_date', '')::date
      ) returning id into v_batch_id;

      insert into public.inventory_movements (
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
        source_type, source_id, meta
      ) values (
        v_company_id, v_variant_id, v_batch_id, 'adjustment', v_quantity,
        v_unit_cost, v_line_value, 'ProductOpeningStock', v_opening_source_id,
        jsonb_build_object('openingStock', true, 'productId', p_product_id)
      );
      v_total_value := v_total_value + v_line_value;
    end if;
  end loop;

  if v_total_value > 0 then
    perform public.post_journal_entry(
      v_company_id, 'ProductOpeningStock', v_opening_source_id,
      'Opening stock · ' || trim(p_name),
      jsonb_build_array(
        jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id)),
        jsonb_build_object('account_code', 'OPENING_BALANCE_EQUITY', 'credit', v_total_value,
          'meta', jsonb_build_object('productId', p_product_id))
      )
    );
  end if;

  return p_product_id;
end;
$$;

revoke execute on function public.update_catalog_product(uuid, text, jsonb, text, boolean)
  from anon, public;
grant execute on function public.update_catalog_product(uuid, text, jsonb, text, boolean)
  to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803016000_0046_counted_stock_adjustment.sql
-- ----------------------------------------------------------------------------
-- Replace the ambiguous ledger-only value adjustment with a quantity-count workflow.
-- The caller supplies the quantity they saw before counting and the quantity counted now.
-- Decreases consume FIFO batches; increases create a valued inventory batch.

drop function if exists public.post_inventory_adjustment(uuid, bigint, text);

create or replace function public.post_stock_adjustment(
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_adjustment_id uuid := gen_random_uuid();
  v_current_quantity numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_track_inventory boolean;
  v_kind text;
  v_unit_cost bigint;
  v_total_value bigint;
  v_batch_id uuid;
  v_location_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  if p_expected_quantity is null or p_expected_quantity < 0 then
    raise exception 'invalid_expected_quantity';
  end if;

  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'new_quantity_must_be_zero_or_more';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'adjustment_reason_required';
  end if;

  select v.allow_fractional, v.track_inventory, v.kind
    into v_allow_fractional, v_track_inventory, v_kind
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
  for update;

  if not found then
    raise exception 'variant_not_found';
  end if;

  if not v_track_inventory or v_kind = 'service' then
    raise exception 'variant_does_not_track_inventory';
  end if;

  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  -- Serialize changes to the currently-known valuation layers before checking the count.
  perform 1
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
  order by b.id
  for update;

  select coalesce(sum(b.remaining), 0)
    into v_current_quantity
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id;

  if v_current_quantity <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current_quantity;
  end if;

  v_change := p_new_quantity - v_current_quantity;
  if v_change = 0 then
    return null;
  end if;

  if v_change < 0 then
    -- Existing write-off logic consumes FIFO and posts the correct loss account.
    return public.post_inventory_write_off(p_variant_id, abs(v_change), trim(p_reason));
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost
      into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc
    limit 1;
  end if;

  if v_unit_cost is null or v_unit_cost <= 0 then
    raise exception 'unit_cost_required_for_stock_increase';
  end if;

  select l.id
    into v_location_id
  from public.stock_locations l
  where l.company_id = v_company_id
  order by l.is_default desc, (l.code = 'MAIN') desc, l.created_at asc
  limit 1;

  if v_location_id is null then
    raise exception 'stock_location_required';
  end if;

  v_total_value := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches (
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  )
  returning id into v_batch_id;

  insert into public.inventory_movements (
    company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost,
    source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, 'adjustment', v_change, v_unit_cost,
    v_total_value, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object(
      'reason', trim(p_reason),
      'previousQuantity', v_current_quantity,
      'newQuantity', p_new_quantity
    )
  );

  return public.post_journal_entry(
    v_company_id,
    'StockAdjustment',
    v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'INVENTORY',
        'debit', v_total_value,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id,
          'variantId', p_variant_id,
          'batchId', v_batch_id,
          'reason', trim(p_reason),
          'previousQuantity', v_current_quantity,
          'newQuantity', p_new_quantity
        )
      ),
      jsonb_build_object(
        'account_code', 'INVENTORY_ADJUSTMENT',
        'credit', v_total_value,
        'meta', jsonb_build_object(
          'adjustmentId', v_adjustment_id,
          'variantId', p_variant_id,
          'batchId', v_batch_id,
          'reason', trim(p_reason),
          'previousQuantity', v_current_quantity,
          'newQuantity', p_new_quantity
        )
      )
    )
  );
end;
$$;

revoke execute on function public.post_stock_adjustment(uuid, numeric, numeric, text, bigint)
  from anon, public;
grant execute on function public.post_stock_adjustment(uuid, numeric, numeric, text, bigint)
  to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803017000_0047_expire_variance_reverts.sql
-- ----------------------------------------------------------------------------
-- 0047_expire_variance_reverts.sql
-- A variance reversal is only valid until the next reconciliation boundary.
-- Opening/closing a cashier session and manual reconciliation all create a
-- reconciliation, so any of them permanently expires older variance actions.

create or replace function public.revert_variance(
  p_recon_account_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_recon record;
  v_recon_parent record;
  v_entry record;
  v_line record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_entry_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select * into v_recon
  from public.reconciliation_accounts
  where id = p_recon_account_id
  for update;

  if v_recon is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  select * into v_recon_parent
  from public.reconciliations
  where id = v_recon.reconciliation_id and company_id = v_company_id;

  if v_recon_parent is null then
    raise exception 'recon_account_not_found: %', p_recon_account_id;
  end if;

  if v_recon.variance = 0 then
    raise exception 'no_variance_to_revert';
  end if;

  if v_recon.reviewed_at is not null then
    raise exception 'already_reviewed';
  end if;

  if exists (
    select 1
    from public.reconciliations r
    where r.company_id = v_company_id
      and r.created_at > v_recon_parent.created_at
  ) then
    raise exception 'variance_revert_expired: newer reconciliation activity exists';
  end if;

  -- Find the original variance entry: source_id = {session|manual}-{account}-{countId}.
  select * into v_entry
  from public.ledger_journal_entries e
  where e.company_id = v_company_id
    and e.source_type = 'VarianceAdjustment'
    and e.source_id like '%-' || v_recon.account_code || '-' || v_recon_parent.id::text
  limit 1;

  if v_entry is null then
    raise exception 'variance_entry_not_found for account %', v_recon.account_code;
  end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'meta', v_line.meta || jsonb_build_object('revertedAt', now()::text)
    );
  end loop;

  v_entry_id := public.post_reversal_entry(
    v_company_id, 'VarianceAdjustmentReversal', v_entry.source_id || '-reversal',
    'Variance revert: ' || v_recon.account_code || coalesce(' — ' || p_reason, ''),
    v_reversal_lines, v_entry.id
  );

  update public.reconciliation_accounts
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_recon_account_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.revert_variance(uuid, text) from anon, public;
grant execute on function public.revert_variance(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803018000_0048_tenant_audit_trail.sql
-- ----------------------------------------------------------------------------
-- 0048_tenant_audit_trail.sql
-- A permission-gated, tenant-facing activity feed over the generic audit log
-- and the immutable inventory movement trail.

-- ---------------------------------------------------------------------------
-- 1. Dedicated permission. Admin and Manager roles get it by default, while
--    custom roles can be granted or denied access independently.
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
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
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail'
]::text[]);

update public.roles
set permissions = array_append(permissions, 'ViewAuditTrail'),
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ViewAuditTrail' = any(permissions));

-- provision_company was defined earlier with a literal Admin permission list.
-- Patch that stored function body so companies provisioned after this migration
-- receive the same secure default without duplicating the entire function here.
do $$
declare
  v_definition text;
  v_old text := '''CreateInterAccountTransfer'', ''ManageTeam''';
  v_new text := '''CreateInterAccountTransfer'', ''ManageTeam'', ''ViewAuditTrail''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text)'::regprocedure)
    into v_definition;

  if position('''ViewAuditTrail''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add ViewAuditTrail to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- Raw audit rows are no longer readable by every company member. Platform
-- administrators retain their existing cross-company support access.
drop policy if exists "audit log readable by members" on public.audit_log;
drop policy if exists "audit log readable with permission" on public.audit_log;
create policy "audit log readable with permission"
  on public.audit_log for select
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_has_permission('ViewAuditTrail'))
      and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

-- Capture the responsible user for new immutable stock movements. Existing
-- rows remain valid and appear as system activity when no actor was recorded.
alter table public.inventory_movements
  add column actor uuid default auth.uid();

-- ---------------------------------------------------------------------------
-- 2. Safe tenant read model. This deliberately returns a curated payload,
--    strips infrastructure/billing identifiers, and never exposes auth.users
--    directly to the browser.
-- ---------------------------------------------------------------------------
create or replace function public.list_audit_events(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_action text default null,
  p_area text default null,
  p_actor uuid default null,
  p_from timestamptz default null
)
returns table (
  event_id text,
  event_source text,
  occurred_at timestamptz,
  area text,
  entity_type text,
  entity_id text,
  operation text,
  actor_id uuid,
  actor_phone text,
  actor_role text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_can_view_financials boolean := public.current_user_has_permission('ViewFinancials');
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ViewAuditTrail') then
    raise exception 'permission_denied: ViewAuditTrail required';
  end if;

  return query
  with events as (
    select
      'audit:' || a.id::text as event_id,
      'audit'::text as event_source,
      a.changed_at as occurred_at,
      case
        when a.table_name in ('orders', 'order_lines', 'payments', 'refunds', 'approvals') then 'sales'
        when a.table_name in ('products', 'product_variants', 'purchases', 'purchase_payments', 'stock_locations') then 'inventory'
        when a.table_name in ('cashier_sessions', 'cash_drawer_counts', 'reconciliations', 'accounting_periods') then 'cash'
        when a.table_name in ('customers') then 'people'
        when a.table_name in ('roles', 'company_memberships') then 'team'
        else 'settings'
      end as area,
      a.table_name as entity_type,
      a.row_id as entity_id,
      a.operation,
      a.actor as actor_id,
      coalesce(a.old_data, '{}'::jsonb) - array[
        'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'decided_by',
        'voided_by', 'paystack_customer_code', 'paystack_subscription_code',
        'sms_usage_by_category'
      ]::text[] - (case when v_can_view_financials then array[]::text[] else array[
        'amount', 'total', 'paid', 'balance', 'credit_limit', 'supplier_credit_limit',
        'price', 'wholesale_price', 'custom_price', 'unit_cost', 'total_cost',
        'declared_cash', 'expected_cash', 'variance', 'last_payment_amount'
      ]::text[] end) as before_data,
      coalesce(a.new_data, '{}'::jsonb) - array[
        'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'decided_by',
        'voided_by', 'paystack_customer_code', 'paystack_subscription_code',
        'sms_usage_by_category'
      ]::text[] - (case when v_can_view_financials then array[]::text[] else array[
        'amount', 'total', 'paid', 'balance', 'credit_limit', 'supplier_credit_limit',
        'price', 'wholesale_price', 'custom_price', 'unit_cost', 'total_cost',
        'declared_cash', 'expected_cash', 'variance', 'last_payment_amount'
      ]::text[] end) as after_data,
      coalesce(
        a.new_data ->> 'decision_reason', a.new_data ->> 'void_reason',
        a.new_data ->> 'reason', a.new_data ->> 'notes', a.new_data ->> 'memo',
        a.old_data ->> 'decision_reason', a.old_data ->> 'void_reason',
        a.old_data ->> 'reason', a.old_data ->> 'notes', a.old_data ->> 'memo'
      ) as reason
    from public.audit_log a
    where a.company_id = v_company_id
      -- Line-level sale writes are implementation detail; the parent sale and
      -- payment events carry the useful business history without the noise.
      and a.table_name <> 'order_lines'
      and (
        a.operation <> 'UPDATE'
        or (a.old_data - 'updated_at') is distinct from (a.new_data - 'updated_at')
      )

    union all

    select
      'inventory:' || m.id::text,
      'inventory'::text,
      m.created_at,
      'inventory'::text,
      'inventory_movements'::text,
      coalesce(m.source_id, m.id::text),
      upper(m.type),
      m.actor,
      '{}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'product', p.name,
        'variant', v.name,
        'sku', v.sku,
        'quantity', m.quantity,
        'unit_cost', case when v_can_view_financials then m.unit_cost end,
        'total_cost', case when v_can_view_financials then m.total_cost end,
        'movement_type', m.type,
        'source_type', m.source_type,
        'previous_quantity', m.meta -> 'previousQuantity',
        'new_quantity', m.meta -> 'newQuantity'
      )),
      coalesce(m.meta ->> 'reason', m.meta ->> 'notes')
    from public.inventory_movements m
    left join public.product_variants v on v.id = m.variant_id
    left join public.products p on p.id = v.product_id
    where m.company_id = v_company_id
      and m.type in ('adjustment', 'reversal')
  ),
  enriched as (
    select
      e.*,
      case
        when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
          then '••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
        else nullif(u.phone, '')
      end as actor_phone,
      r.name as actor_role
    from events e
    left join auth.users u on u.id = e.actor_id
    left join public.company_memberships cm
      on cm.company_id = v_company_id and cm.user_id = e.actor_id
    left join public.roles r on r.id = cm.role_id
  ),
  filtered as (
    select e.*
    from enriched e
    where (p_from is null or e.occurred_at >= p_from)
      and (p_actor is null or e.actor_id = p_actor)
      and (
        p_action is null
        or (p_action = 'created' and e.operation = 'INSERT')
        or (p_action = 'updated' and e.operation = 'UPDATE')
        or (p_action = 'deleted' and e.operation = 'DELETE')
        or (p_action = 'stock' and e.event_source = 'inventory')
      )
      and (p_area is null or e.area = p_area)
      and (
        v_search is null
        or concat_ws(' ', e.entity_type, e.operation, e.actor_phone, e.actor_role,
          e.reason, e.before_data::text, e.after_data::text) ilike '%' || v_search || '%'
      )
  )
  select
    e.event_id, e.event_source, e.occurred_at, e.area, e.entity_type,
    e.entity_id, e.operation, e.actor_id, e.actor_phone, e.actor_role,
    e.before_data, e.after_data, e.reason,
    count(*) over() as total_count
  from filtered e
  order by e.occurred_at desc, e.event_id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.list_audit_events(integer, integer, text, text, text, uuid, timestamptz)
  from anon, public;
grant execute on function public.list_audit_events(integer, integer, text, text, text, uuid, timestamptz)
  to authenticated;

create or replace function public.list_audit_actors()
returns table (user_id uuid, phone text, role_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ViewAuditTrail') then
    raise exception 'permission_denied: ViewAuditTrail required';
  end if;

  return query
  select
    m.user_id,
    case
      when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
        then '••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
      else nullif(u.phone, '')
    end,
    r.name
  from public.company_memberships m
  left join auth.users u on u.id = m.user_id
  left join public.roles r on r.id = m.role_id
  where m.company_id = v_company_id
  order by r.name nulls last, u.phone nulls last, m.user_id;
end;
$$;

revoke execute on function public.list_audit_actors() from anon, public;
grant execute on function public.list_audit_actors() to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803019000_0049_proforma_expiry.sql
-- ----------------------------------------------------------------------------
-- Proformas are valid for a configurable number of days (30 by default).
-- Expiry is stamped when the proforma is created, so later setting changes
-- apply to new proformas without silently changing an issued document.

alter table public.companies
  add column proforma_validity_days integer not null default 30
  check (proforma_validity_days between 1 and 3650);

grant update (proforma_validity_days) on public.companies to authenticated;

alter table public.orders
  add column expires_at timestamptz;

update public.orders o
set expires_at = o.created_at + make_interval(days => c.proforma_validity_days)
from public.companies c
where c.id = o.company_id;

alter table public.orders
  alter column expires_at set not null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('draft', 'expired', 'pending_payment', 'completed', 'voided'));

create index orders_active_proformas_idx
  on public.orders (company_id, expires_at desc)
  where status = 'draft';

-- Stamp the validity window for all order creation paths. Orders begin as
-- drafts, including sales that are completed immediately by post_sale.
create or replace function public.set_order_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_validity_days integer;
begin
  if new.expires_at is null then
    select c.proforma_validity_days into v_validity_days
    from public.companies c
    where c.id = new.company_id;

    new.expires_at := coalesce(new.created_at, now())
      + make_interval(days => coalesce(v_validity_days, 30));
  end if;
  return new;
end;
$$;

create trigger orders_set_expiry
  before insert on public.orders
  for each row execute function public.set_order_expiry();

-- A conversion must not succeed merely because the expiry sweep has not run
-- yet. Raising from this trigger rolls the whole sale posting back atomically.
create or replace function public.enforce_proforma_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft'
     and new.status not in ('draft', 'expired')
     and old.expires_at <= now() then
    raise exception 'proforma_expired: % expired at %', old.id, old.expires_at;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_proforma_expiry
  before update of status on public.orders
  for each row execute function public.enforce_proforma_expiry();

-- Called opportunistically by the app before list/count reads. The time check
-- in queries and the conversion trigger remain authoritative between sweeps.
create or replace function public.expire_proformas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_expired integer;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.approvals a
  set status = 'denied',
      decided_at = now(),
      decision_reason = 'Proforma expired'
  where a.company_id = v_company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and exists (
      select 1
      from public.orders o
      where o.id::text = a.metadata ->> 'order_id'
        and o.company_id = v_company_id
        and o.status = 'draft'
        and o.expires_at <= now()
    );

  update public.orders
  set status = 'expired', updated_at = now()
  where company_id = v_company_id
    and status = 'draft'
    and expires_at <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

revoke execute on function public.expire_proformas() from public, anon;
grant execute on function public.expire_proformas() to authenticated, service_role;

-- Mark existing stale proformas immediately during deployment.
update public.approvals a
set status = 'denied',
    decided_at = now(),
    decision_reason = 'Proforma expired'
where a.type = 'below_wholesale'
  and a.status = 'pending'
  and exists (
    select 1
    from public.orders o
    where o.id::text = a.metadata ->> 'order_id'
      and o.company_id = a.company_id
      and o.status = 'draft'
      and o.expires_at <= now()
  );

update public.orders
set status = 'expired', updated_at = now()
where status = 'draft' and expires_at <= now();

-- Expired proformas remain removable from the history list.
create or replace function public.delete_proforma(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order.id is null then
    raise exception 'proforma_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'expired') then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id
    and company_id = v_company_id
    and status in ('draft', 'expired');

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [squashed] 20260803190000_0050_location_foundation.sql
-- ----------------------------------------------------------------------------
-- Business-location foundation. Single-location companies remain automatic;
-- multi-location companies get explicit staff scope and operational ownership.

-- Use insertion time for records that can be created repeatedly inside one
-- transaction. This keeps "latest" ordering deterministic.
alter table public.reconciliations
  alter column created_at set default clock_timestamp();

alter table public.inventory_batches
  alter column created_at set default clock_timestamp();

alter table public.companies
  add column if not exists commissions_enabled boolean not null default false;

grant update (commissions_enabled) on public.companies to authenticated;

comment on table public.stock_locations is
  'Business locations. A location may be a selling site, kiosk, warehouse, or office.';

alter table public.stock_locations
  add column if not exists is_active boolean not null default true;

-- Staff may work in one or many locations. Existing memberships keep their
-- current company-wide behaviour through an explicit assignment backfill.
create table public.company_membership_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (membership_id, location_id)
);

create index company_membership_locations_location_idx
  on public.company_membership_locations(company_id, location_id, membership_id);
create unique index company_membership_locations_one_primary_idx
  on public.company_membership_locations(membership_id) where is_primary;

alter table public.company_membership_locations enable row level security;
create policy "location assignments readable by company members"
  on public.company_membership_locations for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );
grant select on public.company_membership_locations to authenticated;
grant all on public.company_membership_locations to service_role;

insert into public.company_membership_locations (
  company_id, membership_id, location_id, is_primary
)
select
  m.company_id,
  m.id,
  l.id,
  l.is_default
from public.company_memberships m
join public.stock_locations l on l.company_id = m.company_id
where m.authorization_status = 'approved'
on conflict (membership_id, location_id) do nothing;

create or replace function public.current_user_can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.company_memberships m
      join public.company_membership_locations ml on ml.membership_id = m.id
      join public.stock_locations l on l.id = ml.location_id
      where m.company_id = public.current_company_id()
        and m.user_id = auth.uid()
        and m.authorization_status = 'approved'
        and ml.location_id = p_location_id
        and ml.company_id = m.company_id
        and l.company_id = m.company_id
        and l.is_active
    )
$$;

revoke execute on function public.current_user_can_access_location(uuid) from anon, public;
grant execute on function public.current_user_can_access_location(uuid) to authenticated, service_role;

create or replace function public.resolve_business_location(p_location_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  if p_location_id is not null then
    select l.id into v_location_id
    from public.stock_locations l
    where l.id = p_location_id and l.company_id = v_company_id and l.is_active;
    if v_location_id is null or not public.current_user_can_access_location(v_location_id) then
      raise exception 'location_access_denied';
    end if;
    return v_location_id;
  end if;

  -- Compatibility path for single-location clients and old queued sales.
  -- New multi-location UI always sends an explicit location.
  select l.id into v_location_id
  from public.stock_locations l
  join public.company_memberships m
    on m.company_id = l.company_id and m.user_id = auth.uid()
  join public.company_membership_locations ml
    on ml.membership_id = m.id and ml.location_id = l.id
  where l.company_id = v_company_id and l.is_active
    and m.authorization_status = 'approved'
  order by ml.is_primary desc, l.is_default desc, l.created_at
  limit 1;

  if v_location_id is null then raise exception 'business_location_required'; end if;
  return v_location_id;
end;
$$;

revoke execute on function public.resolve_business_location(uuid) from anon, public;
grant execute on function public.resolve_business_location(uuid) to authenticated, service_role;

create or replace function public.accessible_business_locations()
returns table (
  id uuid,
  code text,
  name text,
  is_default boolean,
  is_primary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.code, l.name, l.is_default, ml.is_primary
  from public.company_memberships m
  join public.company_membership_locations ml on ml.membership_id = m.id
  join public.stock_locations l on l.id = ml.location_id and l.company_id = m.company_id
  where m.company_id = public.current_company_id()
    and m.user_id = auth.uid()
    and m.authorization_status = 'approved'
    and l.is_active
  order by ml.is_primary desc, l.is_default desc, l.name
$$;

revoke execute on function public.accessible_business_locations() from anon, public;
grant execute on function public.accessible_business_locations() to authenticated, service_role;

create or replace function public.set_membership_locations(
  p_membership_id uuid,
  p_location_ids uuid[],
  p_primary_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.id = p_membership_id and m.company_id = v_company_id
  ) then raise exception 'membership_not_found'; end if;
  if coalesce(cardinality(p_location_ids), 0) = 0 then
    raise exception 'at_least_one_location_required';
  end if;
  if p_primary_location_id is null or not (p_primary_location_id = any(p_location_ids)) then
    raise exception 'primary_location_must_be_selected';
  end if;
  if exists (
    select 1 from unnest(p_location_ids) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  delete from public.company_membership_locations where membership_id = p_membership_id;
  insert into public.company_membership_locations(
    company_id, membership_id, location_id, is_primary
  )
  select v_company_id, p_membership_id, x.id, x.id = p_primary_location_id
  from unnest(p_location_ids) x(id);
  return p_membership_id;
end;
$$;

revoke execute on function public.set_membership_locations(uuid, uuid[], uuid) from anon, public;
grant execute on function public.set_membership_locations(uuid, uuid[], uuid) to authenticated;

-- Company-level definitions, location-level availability and optional overrides.
alter table public.payment_methods
  add column if not exists availability_scope text not null default 'all_locations'
    check (availability_scope in ('all_locations', 'selected_locations'));

create table public.location_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  enabled boolean not null default true,
  ledger_account_code varchar(64),
  is_cashier_controlled boolean,
  requires_reconciliation boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, payment_method_id)
);

create index location_payment_methods_company_location_idx
  on public.location_payment_methods(company_id, location_id);
alter table public.location_payment_methods enable row level security;
create policy "location payment methods readable by company members"
  on public.location_payment_methods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(location_id))
    or (select public.is_platform_admin())
  );
grant select on public.location_payment_methods to authenticated;
grant all on public.location_payment_methods to service_role;

insert into public.location_payment_methods(company_id, location_id, payment_method_id)
select l.company_id, l.id, pm.id
from public.stock_locations l
join public.payment_methods pm on pm.company_id = l.company_id
on conflict (location_id, payment_method_id) do nothing;

create or replace function public.available_payment_methods(p_location_id uuid default null)
returns table (
  code text,
  name text,
  ledger_account_code varchar,
  is_cashier_controlled boolean,
  requires_reconciliation boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select
    pm.code,
    pm.name,
    coalesce(lpm.ledger_account_code, pm.ledger_account_code),
    coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled),
    coalesce(lpm.requires_reconciliation, pm.requires_reconciliation)
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
  where pm.company_id = v_company_id and pm.enabled and lpm.enabled
  order by pm.name;
end;
$$;

revoke execute on function public.available_payment_methods(uuid) from anon, public;
grant execute on function public.available_payment_methods(uuid) to authenticated, service_role;

create or replace function public.set_payment_method_locations(
  p_code text,
  p_location_ids uuid[],
  p_all_locations boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_method_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select id into v_method_id from public.payment_methods
  where company_id = v_company_id and code = p_code for update;
  if v_method_id is null then raise exception 'payment_method_not_found: %', p_code; end if;

  if exists (
    select 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  update public.payment_methods
  set availability_scope = case when p_all_locations then 'all_locations' else 'selected_locations' end,
      updated_at = now()
  where id = v_method_id;

  delete from public.location_payment_methods where payment_method_id = v_method_id;
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select v_company_id, l.id, v_method_id
  from public.stock_locations l
  where l.company_id = v_company_id and l.is_active
    and (p_all_locations or l.id = any(coalesce(p_location_ids, '{}'::uuid[])));

  return v_method_id;
end;
$$;

revoke execute on function public.set_payment_method_locations(text, uuid[], boolean)
  from anon, public;
grant execute on function public.set_payment_method_locations(text, uuid[], boolean)
  to authenticated;

-- New locations inherit company-wide methods and are assigned to existing
-- approved staff. Managers can narrow assignments later without changing data ownership.
create or replace function public.bootstrap_business_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select new.company_id, new.id, pm.id
  from public.payment_methods pm
  where pm.company_id = new.company_id and pm.availability_scope = 'all_locations'
  on conflict (location_id, payment_method_id) do nothing;

  insert into public.company_membership_locations(company_id, membership_id, location_id, is_primary)
  select new.company_id, m.id, new.id, false
  from public.company_memberships m
  where m.company_id = new.company_id and m.authorization_status = 'approved'
  on conflict (membership_id, location_id) do nothing;
  return new;
end;
$$;

create trigger stock_locations_bootstrap_business_location
  after insert on public.stock_locations
  for each row execute function public.bootstrap_business_location();

create or replace function public.bootstrap_membership_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
begin
  if new.authorization_status <> 'approved' then return new; end if;
  select l.id into v_location_id
  from public.stock_locations l
  where l.company_id = new.company_id and l.is_active
  order by l.is_default desc, l.created_at
  limit 1;
  if v_location_id is not null then
    insert into public.company_membership_locations(
      company_id, membership_id, location_id, is_primary
    ) values (new.company_id, new.id, v_location_id, true)
    on conflict (membership_id, location_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

create trigger company_memberships_bootstrap_location
  after insert or update of authorization_status on public.company_memberships
  for each row execute function public.bootstrap_membership_location();

create or replace function public.bootstrap_payment_method_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.availability_scope = 'all_locations' then
    insert into public.location_payment_methods(company_id, location_id, payment_method_id)
    select new.company_id, l.id, new.id
    from public.stock_locations l
    where l.company_id = new.company_id and l.is_active
    on conflict (location_id, payment_method_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger payment_methods_bootstrap_locations
  after insert on public.payment_methods
  for each row execute function public.bootstrap_payment_method_locations();

-- Location ownership for operational roots.
alter table public.orders
  add column if not exists location_id uuid references public.stock_locations(id),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;
alter table public.payments add column if not exists location_id uuid references public.stock_locations(id);
alter table public.refunds add column if not exists location_id uuid references public.stock_locations(id);
alter table public.cashier_sessions add column if not exists location_id uuid references public.stock_locations(id);
alter table public.reconciliations add column if not exists location_id uuid references public.stock_locations(id);
alter table public.mpesa_verifications add column if not exists location_id uuid references public.stock_locations(id);
alter table public.inventory_movements add column if not exists stock_location_id uuid references public.stock_locations(id);

update public.orders o
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = o.company_id order by l.is_default desc, l.created_at limit 1
)
where o.location_id is null;
update public.payments p set location_id = o.location_id
from public.orders o where o.id = p.order_id and p.location_id is null;
update public.refunds r set location_id = o.location_id
from public.orders o where o.id = r.order_id and r.location_id is null;
update public.cashier_sessions s
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = s.company_id order by l.is_default desc, l.created_at limit 1
)
where s.location_id is null;
update public.reconciliations r set location_id = s.location_id
from public.cashier_sessions s
where r.scope = 'cash-session' and split_part(r.scope_ref_id, ':', 1) = s.id::text
  and r.location_id is null;
update public.mpesa_verifications m set location_id = s.location_id
from public.cashier_sessions s where s.id = m.session_id and m.location_id is null;
update public.inventory_movements m set stock_location_id = b.stock_location_id
from public.inventory_batches b where b.id = m.batch_id and m.stock_location_id is null;
update public.purchases p
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = p.company_id order by l.is_default desc, l.created_at limit 1
)
where p.stock_location_id is null;
update public.inventory_batches b
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = b.company_id order by l.is_default desc, l.created_at limit 1
)
where b.stock_location_id is null;

alter table public.orders alter column location_id set not null;
alter table public.payments alter column location_id set not null;
alter table public.refunds alter column location_id set not null;
alter table public.cashier_sessions alter column location_id set not null;
alter table public.purchases alter column stock_location_id set not null;
alter table public.inventory_batches alter column stock_location_id set not null;

create index orders_company_location_completed_idx
  on public.orders(company_id, location_id, completed_at desc);
create index cashier_sessions_company_location_idx
  on public.cashier_sessions(company_id, location_id, status);
create index inventory_batches_location_variant_idx
  on public.inventory_batches(company_id, stock_location_id, variant_id, purchased_at)
  where remaining > 0;

drop index if exists public.cashier_sessions_one_open;
create unique index cashier_sessions_one_open_per_location
  on public.cashier_sessions(company_id, location_id) where status = 'open';

create or replace function public.assign_operational_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if tg_table_name = 'payments' or tg_table_name = 'refunds' then
    select o.location_id into new.location_id
    from public.orders o where o.id = new.order_id and o.company_id = new.company_id;
  elsif tg_table_name = 'inventory_movements' then
    if nullif(to_jsonb(new) ->> 'batch_id', '') is not null then
      select b.stock_location_id into new.stock_location_id
      from public.inventory_batches b
      where b.id = (to_jsonb(new) ->> 'batch_id')::uuid and b.company_id = new.company_id;
    end if;
  elsif tg_table_name = 'purchases' then
    if new.stock_location_id is null then
      new.stock_location_id := public.resolve_business_location(null);
    elsif not public.current_user_can_access_location(new.stock_location_id) then
      raise exception 'location_access_denied';
    end if;
  else
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    new.location_id := public.resolve_business_location(coalesce(new.location_id, v_requested));
  end if;
  return new;
end;
$$;

create trigger orders_assign_operational_location
  before insert on public.orders
  for each row execute function public.assign_operational_location();
create trigger payments_assign_operational_location
  before insert on public.payments
  for each row execute function public.assign_operational_location();
create trigger refunds_assign_operational_location
  before insert on public.refunds
  for each row execute function public.assign_operational_location();
create trigger cashier_sessions_assign_operational_location
  before insert on public.cashier_sessions
  for each row execute function public.assign_operational_location();
create trigger purchases_assign_operational_location
  before insert on public.purchases
  for each row execute function public.assign_operational_location();
create trigger inventory_movements_assign_operational_location
  before insert on public.inventory_movements
  for each row execute function public.assign_operational_location();

-- Legacy imports/tests may insert valuation layers directly. They still land
-- in a real location: explicit context first, then company default.
create or replace function public.assign_inventory_batch_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if new.stock_location_id is null then
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    if v_requested is not null and exists (
      select 1 from public.stock_locations l
      where l.id = v_requested and l.company_id = new.company_id and l.is_active
    ) then
      new.stock_location_id := v_requested;
    else
      select l.id into new.stock_location_id
      from public.stock_locations l
      where l.company_id = new.company_id and l.is_active
      order by l.is_default desc, l.created_at
      limit 1;
    end if;
  elsif not exists (
    select 1 from public.stock_locations l
    where l.id = new.stock_location_id and l.company_id = new.company_id and l.is_active
  ) then
    raise exception 'invalid_business_location';
  end if;
  if new.stock_location_id is null then raise exception 'business_location_required'; end if;
  return new;
end;
$$;

create trigger inventory_batches_assign_location
  before insert on public.inventory_batches
  for each row execute function public.assign_inventory_batch_location();

create or replace function public.post_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  return public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref);
end;
$$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  to authenticated;

create or replace function public.save_draft_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_order_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_order_id := public.save_draft(p_customer_id, p_lines, p_draft_id);
  if not exists (
    select 1 from public.orders o where o.id = v_order_id and o.location_id = v_location_id
  ) then raise exception 'draft_belongs_to_another_location'; end if;
  return v_order_id;
end;
$$;

revoke execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  from anon, public;
grant execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  to authenticated;

create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then raise exception 'missing_declaration: %', v_required.ledger_account_code; end if;
  end loop;

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  ) values(
    v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()
  ) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    if not exists (
      select 1 from public.available_payment_methods(v_location_id) method
      where method.is_cashier_controlled
        and method.ledger_account_code = v_decl ->> 'account_code'
    ) then raise exception 'payment_method_unavailable_at_location'; end if;
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance
    ) values(
      v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected
    );
    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(p_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
  if v_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'), auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;

revoke execute on function public.open_cashier_session_at_location(uuid, jsonb)
  from anon, public;
grant execute on function public.open_cashier_session_at_location(uuid, jsonb)
  to authenticated;

create or replace function public.close_cashier_session_at_location(
  p_location_id uuid,
  p_session_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_result uuid;
begin
  if not exists (
    select 1 from public.cashier_sessions s
    where s.id = p_session_id and s.company_id = v_company_id
      and s.location_id = v_location_id and s.status = 'open'
  ) then raise exception 'session_not_open_at_location'; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_result := public.close_cashier_session(p_session_id, p_declarations);
  update public.reconciliations r set location_id = v_location_id
  where r.company_id = v_company_id and r.scope = 'cash-session'
    and r.scope_ref_id like p_session_id::text || ':%';
  return v_result;
end;
$$;

revoke execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  from anon, public;
grant execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  to authenticated;

-- Session tagging must never cross location boundaries.
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.cashier_session_id is null then
    new.cashier_session_id := (
      select s.id from public.cashier_sessions s
      where s.company_id = new.company_id
        and s.location_id = new.location_id
        and s.status = 'open'
      limit 1
    );
  end if;
  return new;
end;
$$;

-- Location-aware FIFO while preserving the established internal signature.
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
  v_location_id uuid;
begin
  if p_source_type = 'Sale' then
    select o.location_id into v_location_id
    from public.orders o
    where o.id = p_source_id::uuid and o.company_id = p_company_id;
  end if;
  if v_location_id is null then
    begin
      v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_location_id := null;
    end;
  end if;
  if v_location_id is null then
    select l.id into v_location_id from public.stock_locations l
    where l.company_id = p_company_id and l.is_active
    order by l.is_default desc, l.created_at limit 1;
  end if;

  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and variant_id = p_variant_id
    and stock_location_id = v_location_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and variant_id = p_variant_id
      and stock_location_id = v_location_id and remaining > 0
    order by purchased_at, created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;
    update public.inventory_batches set remaining = remaining - v_take where id = v_batch.id;
    insert into public.inventory_movements (
      company_id, variant_id, batch_id, stock_location_id, type, quantity,
      unit_cost, total_cost, source_type, source_id
    ) values (
      p_company_id, p_variant_id, v_batch.id, v_location_id, p_movement_type,
      -v_take, v_batch.unit_cost, v_cost, p_source_type, p_source_id
    );
    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost,
      'location_id', v_location_id
    );
  end loop;
  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- Validate sale payment availability at the order's location.
create or replace function public.validate_payment_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = new.location_id
    where pm.company_id = new.company_id and pm.code = new.method_code
      and pm.enabled and lpm.enabled
  ) then
    raise exception 'payment_method_unavailable_at_location: %', new.method_code;
  end if;
  return new;
end;
$$;

create trigger payments_validate_location
  before insert on public.payments
  for each row execute function public.validate_payment_location();

-- Feature preferences. Tier capability and company opt-in stay separate.
create or replace function public.set_commissions_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if p_enabled and not coalesce(public.feature_enabled(v_company_id, 'commissions'), false) then
    raise exception 'feature_unavailable: commissions; upgrade your plan';
  end if;
  update public.companies set commissions_enabled = p_enabled, updated_at = now()
  where id = v_company_id;
  return p_enabled;
end;
$$;

revoke execute on function public.set_commissions_enabled(boolean) from anon, public;
grant execute on function public.set_commissions_enabled(boolean) to authenticated;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', coalesce(t.features, '{}'::jsonb),
    'settings', jsonb_build_object('commissionsEnabled', c.commissions_enabled),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id and l.is_active),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  return v_result;
end;
$$;

-- Live dashboard: same detail data plus location comparison and prior-period totals.
create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_location_id uuid := p_location_id;
  v_days int;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if v_location_id is not null and not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied';
  end if;
  v_days := greatest(((now() at time zone 'Africa/Nairobi')::date - v_since) + 1, 1);

  with accessible as (
    select id from public.accessible_business_locations()
  ), scoped_orders as (
    select o.*, (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date as day
    from public.orders o
    where o.company_id = v_company_id and o.status = 'completed'
      and o.location_id in (select id from accessible)
      and (v_location_id is null or o.location_id = v_location_id)
      and (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date >= v_since - v_days
  ), order_costs as (
    select o.id, o.location_id, o.day, o.total,
      coalesce(sum(jl.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs,
      coalesce((select sum(ol.quantity) from public.order_lines ol where ol.order_id = o.id), 0) as quantity
    from scoped_orders o
    left join public.ledger_journal_lines jl on jl.order_id = o.id and jl.company_id = o.company_id
    left join public.ledger_accounts a on a.id = jl.account_id
    group by o.id, o.location_id, o.day, o.total
  ), current_orders as (
    select * from order_costs where day >= v_since
  ), summary as (
    select day, count(*)::int as orders, sum(total)::bigint as revenue,
      sum(cogs)::bigint as cogs, (sum(total) - sum(cogs))::bigint as margin
    from current_orders group by day
  ), product_sales as (
    select o.day, ol.variant_id, sum(ol.quantity) as quantity,
      sum(ol.line_total)::bigint as revenue,
      coalesce(sum(round(o.cogs * ol.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
    from current_orders o join public.order_lines ol on ol.order_id = o.id
    group by o.day, ol.variant_id
  ), locations as (
    select l.id as location_id, l.name as location_name,
      count(o.id)::int as orders,
      coalesce(sum(o.total), 0)::bigint as revenue,
      coalesce(sum(o.quantity), 0) as quantity,
      coalesce(sum(o.cogs), 0)::bigint as cogs,
      (coalesce(sum(o.total), 0) - coalesce(sum(o.cogs), 0))::bigint as margin
    from public.stock_locations l
    join accessible x on x.id = l.id
    left join current_orders o on o.location_id = l.id
    where l.company_id = v_company_id and l.is_active
    group by l.id, l.name
  ), comparison as (
    select
      coalesce(sum(total) filter (where day >= v_since), 0)::bigint as current_revenue,
      coalesce(sum(quantity) filter (where day >= v_since), 0) as current_quantity,
      count(*) filter (where day >= v_since)::int as current_orders,
      coalesce(sum(total) filter (where day < v_since), 0)::bigint as previous_revenue,
      coalesce(sum(quantity) filter (where day < v_since), 0) as previous_quantity,
      count(*) filter (where day < v_since)::int as previous_orders
    from order_costs
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from summary s), '[]'::jsonb),
    'productSales', coalesce((select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.revenue desc, l.location_name) from locations l), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(c) from comparison c), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date, uuid) from anon, public;
grant execute on function public.dashboard_location_snapshot(date, uuid) to authenticated;

create or replace function public.location_stock_snapshot(p_location_id uuid default null)
returns table (variant_id uuid, stock numeric, stock_value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select v.id,
    coalesce(sum(b.remaining), 0)::numeric,
    coalesce(sum(b.remaining * b.unit_cost), 0)::bigint
  from public.product_variants v
  left join public.inventory_batches b
    on b.variant_id = v.id and b.stock_location_id = v_location_id and b.remaining > 0
  where v.company_id = v_company_id
  group by v.id;
end;
$$;

revoke execute on function public.location_stock_snapshot(uuid) from anon, public;
grant execute on function public.location_stock_snapshot(uuid) to authenticated, service_role;

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
  v_total bigint;
  v_batch_id uuid;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    return public.post_inventory_write_off(p_variant_id, abs(v_change), trim(p_reason));
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

revoke execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  from anon, public;
grant execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  to authenticated;

-- Stock transfers preserve valuation layers and never post a ledger entry:
-- company inventory value is unchanged; only physical custody moves.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_type_check
  check (type in ('purchase', 'sale', 'adjustment', 'reversal', 'transfer_out', 'transfer_in'));

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_location_id uuid not null references public.stock_locations(id),
  to_location_id uuid not null references public.stock_locations(id),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  source_batch_id uuid not null references public.inventory_batches(id),
  destination_batch_id uuid not null references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index stock_transfers_company_created_idx
  on public.stock_transfers(company_id, created_at desc);
create index stock_transfer_lines_transfer_idx
  on public.stock_transfer_lines(transfer_id, variant_id);

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;
create policy "stock transfers readable in assigned locations"
  on public.stock_transfers for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(from_location_id))
    and (select public.current_user_can_access_location(to_location_id))
    or (select public.is_platform_admin())
  );
create policy "stock transfer lines readable with transfer"
  on public.stock_transfer_lines for select
  using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = stock_transfer_lines.transfer_id
        and t.company_id = stock_transfer_lines.company_id
    )
    or (select public.is_platform_admin())
  );
grant select on public.stock_transfers, public.stock_transfer_lines to authenticated;
grant all on public.stock_transfers, public.stock_transfer_lines to service_role;

create trigger stock_transfers_audit
  after insert or update or delete on public.stock_transfers
  for each row execute function public.audit_trigger();

create or replace function public.transfer_stock(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_transfer_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_requested numeric;
  v_remaining numeric;
  v_available numeric;
  v_take numeric;
  v_cost bigint;
  v_source record;
  v_destination_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;
  if p_from_location_id = p_to_location_id then raise exception 'transfer_locations_must_differ'; end if;
  if not public.current_user_can_access_location(p_from_location_id)
    or not public.current_user_can_access_location(p_to_location_id) then
    raise exception 'location_access_denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_lines_required';
  end if;

  insert into public.stock_transfers(
    company_id, from_location_id, to_location_id, notes, created_by
  ) values (
    v_company_id, p_from_location_id, p_to_location_id,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_transfer_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_requested := nullif(v_line ->> 'quantity', '')::numeric;
    if v_variant_id is null or v_requested is null or v_requested <= 0 then
      raise exception 'invalid_transfer_line';
    end if;
    if not exists (
      select 1 from public.product_variants v
      where v.id = v_variant_id and v.company_id = v_company_id and v.track_inventory
    ) then raise exception 'invalid_transfer_variant'; end if;

    perform 1 from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0
    order by b.purchased_at, b.created_at for update;

    select coalesce(sum(b.remaining), 0) into v_available
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0;
    if v_available < v_requested then
      raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
        v_variant_id, v_available, v_requested;
    end if;

    v_remaining := v_requested;
    for v_source in
      select b.* from public.inventory_batches b
      where b.company_id = v_company_id and b.variant_id = v_variant_id
        and b.stock_location_id = p_from_location_id and b.remaining > 0
      order by b.purchased_at, b.created_at
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_source.remaining, v_remaining);
      v_cost := round(v_take * v_source.unit_cost);
      update public.inventory_batches set remaining = remaining - v_take where id = v_source.id;

      insert into public.inventory_batches(
        company_id, variant_id, stock_location_id, supplier_id, quantity, remaining,
        unit_cost, purchased_at, expiry_date, batch_number
      ) values (
        v_company_id, v_variant_id, p_to_location_id, v_source.supplier_id, v_take, v_take,
        v_source.unit_cost, v_source.purchased_at, v_source.expiry_date, v_source.batch_number
      ) returning id into v_destination_batch_id;

      insert into public.stock_transfer_lines(
        company_id, transfer_id, variant_id, source_batch_id,
        destination_batch_id, quantity, unit_cost
      ) values (
        v_company_id, v_transfer_id, v_variant_id, v_source.id,
        v_destination_batch_id, v_take, v_source.unit_cost
      );

      insert into public.inventory_movements(
        company_id, variant_id, batch_id, stock_location_id, type, quantity,
        unit_cost, total_cost, source_type, source_id, meta
      ) values
        (v_company_id, v_variant_id, v_source.id, p_from_location_id, 'transfer_out',
         -v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('toLocationId', p_to_location_id)),
        (v_company_id, v_variant_id, v_destination_batch_id, p_to_location_id, 'transfer_in',
         v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('fromLocationId', p_from_location_id));
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;
  return v_transfer_id;
end;
$$;

revoke execute on function public.transfer_stock(uuid, uuid, jsonb, text) from anon, public;
grant execute on function public.transfer_stock(uuid, uuid, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260804000000_0050_staff_sales_performance.sql
-- ----------------------------------------------------------------------------
-- 0050_staff_sales_performance.sql
-- Durable staff identity, explicit sale-completion attribution, refund safety,
-- and server-side staff performance read models.

-- ---------------------------------------------------------------------------
-- Permissions. Staff sales figures are intentionally separate from the full
-- ledger permission; Admin and Manager receive the new permission by default.
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
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
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = permissions
    || array['ViewStaffPerformance', 'ManageCommissions']::text[],
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not (permissions @> array['ViewStaffPerformance', 'ManageCommissions']::text[]);

-- New companies must receive the same defaults. The stored provisioning
-- function uses a literal permission array, so patch that definition in place.
do $$
declare
  v_definition text;
  v_old text := '''ViewAuditTrail''';
  v_new text := '''ViewAuditTrail'', ''ViewStaffPerformance'', ''ManageCommissions''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text)'::regprocedure)
    into v_definition;

  if position('''ViewStaffPerformance''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add staff performance permissions to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durable staff directory. Memberships can be deleted; this identity record
-- remains so old sales and commission statements keep a useful label.
-- user_id deliberately has no auth.users FK for the same retention reason.
-- ---------------------------------------------------------------------------
create table public.company_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  last_role_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_staff_profiles_company_name_idx
  on public.company_staff_profiles (company_id, display_name);

alter table public.company_staff_profiles enable row level security;

create policy "staff profiles readable by permitted members"
  on public.company_staff_profiles for select
  using (
    company_id = (select public.current_company_id())
    and (
      user_id = auth.uid()
      or (select public.current_user_has_permission('ManageTeam'))
      or (select public.current_user_has_permission('ViewStaffPerformance'))
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

grant select on public.company_staff_profiles to authenticated;
grant all on public.company_staff_profiles to service_role;

create or replace function public.staff_fallback_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(concat_ws(' ',
      nullif(u.raw_user_meta_data ->> 'first_name', ''),
      nullif(u.raw_user_meta_data ->> 'last_name', '')
    )), ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    case
      when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
        then 'Staff ••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
      else null
    end,
    'Staff …' || right(p_user_id::text, 6)
  )
  from auth.users u
  where u.id = p_user_id
  union all
  select 'Staff …' || right(p_user_id::text, 6)
  where not exists (select 1 from auth.users u where u.id = p_user_id)
  limit 1
$$;

revoke execute on function public.staff_fallback_name(uuid) from authenticated, anon, public;
grant execute on function public.staff_fallback_name(uuid) to service_role;

insert into public.company_staff_profiles (company_id, user_id, display_name, last_role_name)
select
  m.company_id,
  m.user_id,
  public.staff_fallback_name(m.user_id),
  r.name
from public.company_memberships m
left join public.roles r on r.id = m.role_id
on conflict (company_id, user_id) do update
set last_role_name = excluded.last_role_name,
    updated_at = now();

create or replace function public.sync_staff_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  select r.name into v_role_name from public.roles r where r.id = new.role_id;

  insert into public.company_staff_profiles (
    company_id, user_id, display_name, last_role_name
  ) values (
    new.company_id,
    new.user_id,
    public.staff_fallback_name(new.user_id),
    v_role_name
  )
  on conflict (company_id, user_id) do update
  set last_role_name = excluded.last_role_name,
      updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_staff_profile_from_membership()
  from authenticated, anon, public;

create trigger company_memberships_staff_profile
  after insert or update of role_id on public.company_memberships
  for each row execute function public.sync_staff_profile_from_membership();

create trigger company_staff_profiles_audit
  after insert or update or delete on public.company_staff_profiles
  for each row execute function public.audit_trigger();

create or replace function public.update_staff_display_name(
  p_membership_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_profile_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then
    raise exception 'invalid_display_name';
  end if;

  select m.user_id into v_user_id
  from public.company_memberships m
  where m.id = p_membership_id and m.company_id = v_company_id;
  if v_user_id is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  insert into public.company_staff_profiles (company_id, user_id, display_name)
  values (v_company_id, v_user_id, trim(p_display_name))
  on conflict (company_id, user_id) do update
  set display_name = excluded.display_name,
      updated_at = now()
  returning id into v_profile_id;

  return v_profile_id;
end;
$$;

revoke execute on function public.update_staff_display_name(uuid, text) from anon, public;
grant execute on function public.update_staff_display_name(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Completion attribution. created_by remains the seller/originator;
-- completed_by captures the actor who finalized or settled the sale.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

with posted_sales as (
  select
    l.order_id,
    min(e.posted_at) as completed_at
  from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where l.order_id is not null
    and e.source_type in ('Payment', 'CreditSale')
  group by l.order_id
)
update public.orders o
set completed_at = coalesce(s.completed_at, o.created_at),
    completed_by = o.created_by
from posted_sales s
where s.order_id = o.id
  and o.status in ('completed', 'voided');

update public.orders
set completed_at = created_at,
    completed_by = created_by
where status in ('completed', 'voided')
  and completed_at is null;

create index orders_company_completed_idx
  on public.orders (company_id, completed_at desc)
  where completed_at is not null;

create index orders_company_seller_completed_idx
  on public.orders (company_id, created_by, completed_at desc)
  where completed_at is not null;

create or replace function public.capture_order_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

create trigger orders_capture_completion
  before update on public.orders
  for each row execute function public.capture_order_completion();

-- ---------------------------------------------------------------------------
-- Refund hardening: completed sale only, and never more than cash collected
-- and not previously refunded. The order row lock serializes concurrent calls.
-- ---------------------------------------------------------------------------
create or replace function public.post_refund(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_refund_id uuid;
  v_collected bigint;
  v_refunded bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed sales can be refunded';
  end if;

  select coalesce(sum(p.amount), 0)::bigint into v_collected
  from public.payments p
  where p.company_id = v_company_id
    and p.order_id = p_order_id
    and p.status = 'settled';

  select coalesce(sum(r.amount), 0)::bigint into v_refunded
  from public.refunds r
  where r.company_id = v_company_id and r.order_id = p_order_id;

  if p_amount > v_collected - v_refunded then
    raise exception 'refund_exceeds_collected: refundable amount is %',
      greatest(v_collected - v_refunded, 0);
  end if;

  select pm.ledger_account_code into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code and pm.enabled;
  if v_account_code is null then raise exception 'payment_method_not_found: %', p_method_code; end if;

  insert into public.refunds (company_id, order_id, amount, method_code, reason, created_by)
  values (v_company_id, p_order_id, p_amount, p_method_code, p_reason, auth.uid())
  returning id into v_refund_id;

  return public.post_journal_entry(
    v_company_id, 'Refund', v_refund_id::text,
    'Refund for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALES_RETURNS', 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      ),
      jsonb_build_object(
        'account_code', v_account_code, 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code
        )
      )
    )
  );
end;
$$;

revoke execute on function public.post_refund(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_refund(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Immutable collection events used by both performance and commission reads.
-- Positive payments retain their original event even if later cancelled;
-- reversals, refunds and voids become dated negative events.
-- ---------------------------------------------------------------------------
create or replace function public.sales_collection_events(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  event_key text,
  event_type text,
  occurred_on date,
  staff_user_id uuid,
  order_id uuid,
  basis_amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'payment:' || p.id::text,
    'payment'::text,
    (p.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    p.amount::bigint
  from public.payments p
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where p.company_id = p_company_id
    and (p.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'payment_reversal:' || p.id::text,
    'payment_reversal'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -p.amount::bigint
  from public.ledger_journal_entries e
  join public.payments p on e.source_id = p.id::text || '-reversal'
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where e.company_id = p_company_id
    and e.source_type = 'PaymentReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'refund:' || r.id::text,
    'refund'::text,
    (r.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -r.amount::bigint
  from public.refunds r
  join public.orders o on o.id = r.order_id and o.company_id = r.company_id
  where r.company_id = p_company_id
    and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'void:' || o.id::text,
    'void'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -greatest(
      coalesce((
        select sum(p.amount)
        from public.payments p
        where p.order_id = o.id
          and not exists (
            select 1 from public.ledger_journal_entries pr
            where pr.company_id = o.company_id
              and pr.source_type = 'PaymentReversal'
              and pr.source_id = p.id::text || '-reversal'
          )
      ), 0)
      - coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
      0
    )::bigint
  from public.ledger_journal_entries e
  join public.orders o
    on e.company_id = o.company_id
   and e.source_id = o.id::text || '-reversal'
  where e.company_id = p_company_id
    and e.source_type = 'OrderReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
$$;

revoke execute on function public.sales_collection_events(uuid, date, date)
  from authenticated, anon, public;
grant execute on function public.sales_collection_events(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Staff leaderboard. All aggregation happens in PostgreSQL so report totals
-- are not truncated by PostgREST row limits.
-- ---------------------------------------------------------------------------
create or replace function public.staff_sales_performance(
  p_from date,
  p_to date
)
returns table (
  staff_user_id uuid,
  display_name text,
  role_name text,
  authorization_status text,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  cogs bigint,
  margin bigint,
  collected bigint,
  credit_sales bigint,
  voids integer,
  average_sale bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with completed as (
    select
      o.created_by as user_id,
      count(*)::int as transactions,
      coalesce(sum(o.total), 0)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs,
      coalesce(sum(o.total) filter (where o.is_credit_sale), 0)::bigint as credit_sales
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.order_id = o.id
        and exists (
          select 1 from public.ledger_journal_entries e
          where e.id = l.entry_id and e.source_type = 'InventorySaleCogs'
        )
    ) cost on true
    where o.company_id = v_company_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), refunded as (
    select o.created_by as user_id, coalesce(sum(r.amount), 0)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id and o.company_id = r.company_id
    where r.company_id = v_company_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), voided as (
    select
      o.created_by as user_id,
      count(*)::int as voids,
      coalesce(sum(o.total), 0)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      join public.ledger_journal_entries ce on ce.id = l.entry_id
      where l.order_id = o.id and ce.source_type = 'InventorySaleCogs'
    ) cost on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), collection as (
    select c.staff_user_id as user_id, coalesce(sum(c.basis_amount), 0)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    group by c.staff_user_id
  ), people as (
    select p.user_id from public.company_staff_profiles p where p.company_id = v_company_id
    union select c.user_id from completed c
    union select r.user_id from refunded r
    union select v.user_id from voided v
    union select c.user_id from collection c
  )
  select
    people.user_id,
    coalesce(p.display_name, 'Unassigned'),
    coalesce(r.name, p.last_role_name),
    coalesce(m.authorization_status, 'removed'),
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(f.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))::bigint,
    (
      coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0)
      - (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))
    )::bigint,
    coalesce(col.collected, 0),
    coalesce(c.credit_sales, 0),
    coalesce(v.voids, 0),
    case when coalesce(c.transactions, 0) - coalesce(v.voids, 0) <= 0 then 0
      else round(
        (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::numeric
        / (c.transactions - coalesce(v.voids, 0))
      )::bigint
    end
  from people
  left join public.company_staff_profiles p
    on p.company_id = v_company_id and p.user_id is not distinct from people.user_id
  left join public.company_memberships m
    on m.company_id = v_company_id and m.user_id is not distinct from people.user_id
  left join public.roles r on r.id = m.role_id
  left join completed c on c.user_id is not distinct from people.user_id
  left join refunded f on f.user_id is not distinct from people.user_id
  left join voided v on v.user_id is not distinct from people.user_id
  left join collection col on col.user_id is not distinct from people.user_id
  order by 9 desc, 2;
end;
$$;

revoke execute on function public.staff_sales_performance(date, date) from anon, public;
grant execute on function public.staff_sales_performance(date, date) to authenticated;

create or replace function public.staff_sales_daily(
  p_from date,
  p_to date,
  p_staff_user_id uuid
)
returns table (
  day date,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  collected bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ), completed as (
    select
      (o.completed_at at time zone 'Africa/Nairobi')::date as day,
      count(*)::int as transactions,
      sum(o.total)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where o.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (o.completed_at at time zone 'Africa/Nairobi')::date
  ), refunded as (
    select (r.created_at at time zone 'Africa/Nairobi')::date as day,
      sum(r.amount)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id
    where r.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (r.created_at at time zone 'Africa/Nairobi')::date
  ), voided as (
    select (e.posted_at at time zone 'Africa/Nairobi')::date as day,
      sum(o.total)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and o.created_by is not distinct from p_staff_user_id
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (e.posted_at at time zone 'Africa/Nairobi')::date
  ), collection as (
    select c.occurred_on as day, sum(c.basis_amount)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    where c.staff_user_id is not distinct from p_staff_user_id
    group by c.occurred_on
  )
  select
    d.day,
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(r.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(r.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    coalesce(col.collected, 0)
  from days d
  left join completed c on c.day = d.day
  left join refunded r on r.day = d.day
  left join voided v on v.day = d.day
  left join collection col on col.day = d.day
  order by d.day;
end;
$$;

revoke execute on function public.staff_sales_daily(date, date, uuid) from anon, public;
grant execute on function public.staff_sales_daily(date, date, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260804001000_0051_commissions.sql
-- ----------------------------------------------------------------------------
-- 0051_commissions.sql
-- Effective-dated commission plans and immutable, reviewable period statements.
-- V1 tracks approval/payment state but deliberately does not post payroll ledger entries.

create table public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (company_id, name)
);

create table public.commission_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.commission_plans (id),
  staff_user_id uuid not null,
  effective_from date not null,
  effective_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index commission_assignments_staff_dates_idx
  on public.commission_assignments (company_id, staff_user_id, effective_from, effective_to);

create table public.commission_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (company_id, start_date, end_date)
);

create table public.commission_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_id uuid not null references public.commission_periods (id) on delete cascade,
  plan_id uuid references public.commission_plans (id),
  staff_user_id uuid not null,
  staff_name text not null,
  event_key text not null,
  event_type text not null check (
    event_type in ('payment', 'payment_reversal', 'refund', 'void', 'adjustment')
  ),
  order_id uuid references public.orders (id),
  occurred_on date not null,
  basis_amount bigint not null,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  commission_amount bigint not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (period_id, staff_user_id, event_key)
);

create index commission_lines_staff_idx
  on public.commission_lines (company_id, staff_user_id, occurred_on desc);
create index commission_lines_period_idx
  on public.commission_lines (period_id, staff_user_id);

alter table public.commission_plans enable row level security;
alter table public.commission_assignments enable row level security;
alter table public.commission_periods enable row level security;
alter table public.commission_lines enable row level security;

create or replace function public.commissions_available(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.feature_enabled(p_company_id, 'commissions'), false)
    and coalesce((select c.commissions_enabled from public.companies c where c.id = p_company_id), false)
$$;

revoke execute on function public.commissions_available(uuid) from anon, public;
grant execute on function public.commissions_available(uuid) to authenticated, service_role;

create policy "commission plans readable by managers or assignees"
  on public.commission_plans for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_assignments a
        where a.plan_id = commission_plans.id and a.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission assignments readable by managers or assignee"
  on public.commission_assignments for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

create policy "commission periods readable by managers or included staff"
  on public.commission_periods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_lines l
        where l.period_id = commission_periods.id and l.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission lines readable by managers or recipient"
  on public.commission_lines for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

grant select on public.commission_plans to authenticated;
grant select on public.commission_assignments to authenticated;
grant select on public.commission_periods to authenticated;
grant select on public.commission_lines to authenticated;
grant all on public.commission_plans to service_role;
grant all on public.commission_assignments to service_role;
grant all on public.commission_periods to service_role;
grant all on public.commission_lines to service_role;

create trigger commission_plans_audit
  after insert or update or delete on public.commission_plans
  for each row execute function public.audit_trigger();
create trigger commission_assignments_audit
  after insert or update or delete on public.commission_assignments
  for each row execute function public.audit_trigger();
create trigger commission_periods_audit
  after insert or update or delete on public.commission_periods
  for each row execute function public.audit_trigger();
create trigger commission_lines_audit
  after insert or update or delete on public.commission_lines
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Plan management.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_commission_plan(
  p_name text,
  p_rate_bps integer,
  p_effective_from date,
  p_effective_to date default null,
  p_active boolean default true,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_plan_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'invalid_plan_name';
  end if;
  if p_rate_bps is null or p_rate_bps < 0 or p_rate_bps > 10000 then
    raise exception 'invalid_commission_rate';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;

  if p_plan_id is null then
    insert into public.commission_plans (
      company_id, name, rate_bps, effective_from, effective_to, active, created_by
    ) values (
      v_company_id, trim(p_name), p_rate_bps, p_effective_from, p_effective_to,
      coalesce(p_active, true), auth.uid()
    ) returning id into v_plan_id;
  else
    update public.commission_plans
    set name = trim(p_name),
        rate_bps = p_rate_bps,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_plan_id and company_id = v_company_id
    returning id into v_plan_id;
    if v_plan_id is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  from anon, public;
grant execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  to authenticated;

create or replace function public.assign_commission_plan(
  p_plan_id uuid,
  p_staff_user_id uuid,
  p_effective_from date,
  p_effective_to date default null,
  p_assignment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_assignment_id uuid;
  v_plan record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;
  if not exists (
    select 1 from public.company_staff_profiles p
    where p.company_id = v_company_id and p.user_id = p_staff_user_id
  ) then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  select * into v_plan from public.commission_plans
  where id = p_plan_id and company_id = v_company_id;
  if v_plan is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  if not v_plan.active then raise exception 'commission_plan_inactive'; end if;

  if exists (
    select 1 from public.commission_assignments a
    where a.company_id = v_company_id
      and a.staff_user_id = p_staff_user_id
      and (p_assignment_id is null or a.id <> p_assignment_id)
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then raise exception 'commission_assignment_overlap'; end if;

  if p_assignment_id is null then
    insert into public.commission_assignments (
      company_id, plan_id, staff_user_id, effective_from, effective_to, created_by
    ) values (
      v_company_id, p_plan_id, p_staff_user_id, p_effective_from, p_effective_to, auth.uid()
    ) returning id into v_assignment_id;
  else
    update public.commission_assignments
    set plan_id = p_plan_id,
        staff_user_id = p_staff_user_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        updated_at = now()
    where id = p_assignment_id and company_id = v_company_id
    returning id into v_assignment_id;
    if v_assignment_id is null then
      raise exception 'commission_assignment_not_found: %', p_assignment_id;
    end if;
  end if;

  return v_assignment_id;
end;
$$;

revoke execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  from anon, public;
grant execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Generate/re-generate a draft statement from immutable collection events.
-- Approved/paid periods are locked and never recalculated.
-- ---------------------------------------------------------------------------
create or replace function public.generate_commission_period(
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_period_id uuid;
  v_status text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_date_range';
  end if;

  select id, status into v_period_id, v_status
  from public.commission_periods
  where company_id = v_company_id and start_date = p_start_date and end_date = p_end_date
  for update;

  if v_period_id is null then
    if exists (
      select 1 from public.commission_periods p
      where p.company_id = v_company_id
        and daterange(p.start_date, p.end_date, '[]')
            && daterange(p_start_date, p_end_date, '[]')
    ) then raise exception 'commission_period_overlap'; end if;

    insert into public.commission_periods (
      company_id, start_date, end_date, status, created_by
    ) values (
      v_company_id, p_start_date, p_end_date, 'draft', auth.uid()
    ) returning id into v_period_id;
  elsif v_status <> 'draft' then
    raise exception 'commission_period_locked: %', v_status;
  end if;

  -- Manual adjustments survive regeneration; only generated event lines are rebuilt.
  delete from public.commission_lines
  where period_id = v_period_id and event_type <> 'adjustment';

  insert into public.commission_lines (
    company_id, period_id, plan_id, staff_user_id, staff_name,
    event_key, event_type, order_id, occurred_on, basis_amount,
    rate_bps, commission_amount, created_by
  )
  select
    v_company_id,
    v_period_id,
    p.id,
    e.staff_user_id,
    coalesce(sp.display_name, 'Staff …' || right(e.staff_user_id::text, 6)),
    e.event_key,
    e.event_type,
    e.order_id,
    e.occurred_on,
    e.basis_amount,
    p.rate_bps,
    round(e.basis_amount::numeric * p.rate_bps / 10000)::bigint,
    auth.uid()
  from public.sales_collection_events(v_company_id, p_start_date, p_end_date) e
  join public.commission_assignments a
    on a.company_id = v_company_id
   and a.staff_user_id = e.staff_user_id
   and e.occurred_on between a.effective_from and coalesce(a.effective_to, 'infinity'::date)
  join public.commission_plans p
    on p.id = a.plan_id and p.company_id = v_company_id
   and e.occurred_on between p.effective_from and coalesce(p.effective_to, 'infinity'::date)
  left join public.company_staff_profiles sp
    on sp.company_id = v_company_id and sp.user_id = e.staff_user_id
  where e.staff_user_id is not null
    and e.basis_amount <> 0;

  update public.commission_periods set updated_at = now() where id = v_period_id;
  return v_period_id;
end;
$$;

revoke execute on function public.generate_commission_period(date, date) from anon, public;
grant execute on function public.generate_commission_period(date, date) to authenticated;

create or replace function public.add_commission_adjustment(
  p_period_id uuid,
  p_staff_user_id uuid,
  p_commission_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_line_id uuid;
  v_name text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_commission_amount is null or p_commission_amount = 0 then raise exception 'invalid_amount'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'adjustment_reason_required'; end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id and p.status = 'draft'
  ) then raise exception 'commission_period_not_editable'; end if;

  select display_name into v_name from public.company_staff_profiles
  where company_id = v_company_id and user_id = p_staff_user_id;
  if v_name is null then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  insert into public.commission_lines (
    company_id, period_id, staff_user_id, staff_name, event_key, event_type,
    occurred_on, basis_amount, rate_bps, commission_amount, reason, created_by
  ) values (
    v_company_id, p_period_id, p_staff_user_id, v_name,
    'adjustment:' || gen_random_uuid()::text, 'adjustment',
    (now() at time zone 'Africa/Nairobi')::date, 0, 0,
    p_commission_amount, trim(p_reason), auth.uid()
  ) returning id into v_line_id;

  return v_line_id;
end;
$$;

revoke execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  from anon, public;
grant execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  to authenticated;

create or replace function public.update_commission_period_status(
  p_period_id uuid,
  p_status text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_current text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_status not in ('approved', 'paid') then raise exception 'invalid_commission_status'; end if;

  select status into v_current from public.commission_periods
  where id = p_period_id and company_id = v_company_id for update;
  if v_current is null then raise exception 'commission_period_not_found: %', p_period_id; end if;
  if (v_current = 'draft' and p_status <> 'approved')
     or (v_current = 'approved' and p_status <> 'paid')
     or v_current = 'paid' then
    raise exception 'invalid_commission_transition: % to %', v_current, p_status;
  end if;

  update public.commission_periods
  set status = p_status,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      paid_by = case when p_status = 'paid' then auth.uid() else paid_by end,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_period_id;

  return p_period_id;
end;
$$;

revoke execute on function public.update_commission_period_status(uuid, text, text)
  from anon, public;
grant execute on function public.update_commission_period_status(uuid, text, text)
  to authenticated;

-- Compact read models for the Angular page.
create or replace function public.list_commission_periods()
returns table (
  id uuid,
  start_date date,
  end_date date,
  status text,
  staff_count integer,
  basis_total bigint,
  commission_total bigint,
  approved_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;

  return query
  select
    p.id, p.start_date, p.end_date, p.status,
    count(distinct l.staff_user_id)::int,
    coalesce(sum(l.basis_amount), 0)::bigint,
    coalesce(sum(l.commission_amount), 0)::bigint,
    p.approved_at, p.paid_at
  from public.commission_periods p
  left join public.commission_lines l on l.period_id = p.id
  where p.company_id = v_company_id
  group by p.id
  order by p.start_date desc;
end;
$$;

revoke execute on function public.list_commission_periods() from anon, public;
grant execute on function public.list_commission_periods() to authenticated;

create or replace function public.commission_period_statement(p_period_id uuid)
returns table (
  staff_user_id uuid,
  staff_name text,
  basis_total bigint,
  commission_total bigint,
  event_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id
  ) then raise exception 'commission_period_not_found: %', p_period_id; end if;

  return query
  select
    l.staff_user_id,
    max(l.staff_name),
    sum(l.basis_amount)::bigint,
    sum(l.commission_amount)::bigint,
    count(*)::int
  from public.commission_lines l
  where l.period_id = p_period_id and l.company_id = v_company_id
  group by l.staff_user_id
  order by 4 desc, 2;
end;
$$;

revoke execute on function public.commission_period_statement(uuid) from anon, public;
grant execute on function public.commission_period_statement(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260804002000_0052_cashier_flow_modes.sql
-- ----------------------------------------------------------------------------
-- Cashier workflow and till control are independent company choices.
-- Workflow controls whether orders may be handed to a cashier queue.
-- Cash control controls whether money-moving actions require an open till.

create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_location_id uuid := nullif(current_setting('app.business_location_id', true), '')::uuid;
  v_cash_control_enabled boolean;
begin
  select c.cash_control_enabled into v_cash_control_enabled
  from public.companies c
  where c.id = p_company_id;

  if not coalesce(v_cash_control_enabled, false) then
    return null;
  end if;

  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = p_company_id
    and s.status = 'open'
    and (v_location_id is null or s.location_id = v_location_id)
  limit 1
  for key share;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  return v_session_id;
end;
$$;

create or replace function public.tag_journal_line_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text;
  v_session_id uuid;
  v_requires_session boolean;
begin
  select e.source_type into v_source_type
  from public.ledger_journal_entries e
  where e.id = new.entry_id and e.company_id = new.company_id;

  if v_source_type is null then
    raise exception 'journal_entry_not_found: %', new.entry_id;
  end if;

  v_requires_session := public.cashier_session_required_for_source(v_source_type)
    or (
      v_source_type = 'InventoryPurchase'
      and new.meta ? 'isCreditPurchase'
      and (new.meta ->> 'isCreditPurchase')::boolean is false
    );

  if v_requires_session then
    v_session_id := public.require_open_cashier_session(new.company_id);
    if v_session_id is not null then
      new.meta := coalesce(new.meta, '{}'::jsonb)
        || jsonb_build_object('openSessionId', v_session_id);

      if v_source_type = 'InventoryPurchase'
         and new.meta ? 'isCreditPurchase'
         and (new.meta ->> 'isCreditPurchase')::boolean is false then
        update public.ledger_journal_lines
        set meta = meta || jsonb_build_object('openSessionId', v_session_id)
        where entry_id = new.entry_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    perform set_config('app.business_location_id', new.location_id::text, true);
    v_session_id := public.require_open_cashier_session(new.company_id);

    if v_session_id is null then
      new.cashier_session_id := null;
    else
      if new.cashier_session_id is not null and new.cashier_session_id <> v_session_id then
        raise exception 'cashier_session_mismatch: completed order must use the open session';
      end if;
      new.cashier_session_id := v_session_id;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_order_cashier_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_payment')
     and not coalesce((
       select c.cashier_flow_enabled from public.companies c where c.id = new.company_id
     ), false) then
    raise exception 'cashier_flow_disabled: take payment and complete this sale directly';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_enforce_cashier_flow on public.orders;
create trigger orders_enforce_cashier_flow
  before insert or update of status on public.orders
  for each row execute function public.enforce_order_cashier_flow();

revoke execute on function public.enforce_order_cashier_flow()
  from authenticated, anon, public;
grant execute on function public.enforce_order_cashier_flow() to service_role;

-- Expiry tracking off means new stock does not enter the expiry workflow.
-- Existing dates are retained, so turning the feature back on restores history.
create or replace function public.apply_batch_expiry_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select c.batch_expiry_enabled from public.companies c where c.id = new.company_id
  ), false) then
    new.expiry_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_batches_apply_expiry_preference on public.inventory_batches;
create trigger inventory_batches_apply_expiry_preference
  before insert or update of expiry_date on public.inventory_batches
  for each row execute function public.apply_batch_expiry_preference();

drop trigger if exists purchase_lines_apply_expiry_preference on public.purchase_lines;
create trigger purchase_lines_apply_expiry_preference
  before insert or update of expiry_date on public.purchase_lines
  for each row execute function public.apply_batch_expiry_preference();

create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declarations jsonb := coalesce(p_declarations, '[]'::jsonb);
  v_declared bigint;
  v_expected bigint;
  v_require_opening_count boolean;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  select c.require_opening_count into v_require_opening_count
  from public.companies c where c.id = v_company_id;

  if not coalesce(v_require_opening_count, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', method.ledger_account_code,
      'declared', public.account_balance(v_company_id, method.ledger_account_code)
    )), '[]'::jsonb)
    into v_declarations
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled;
  end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(v_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then raise exception 'missing_declaration: %', v_required.ledger_account_code; end if;
  end loop;

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  ) values(
    v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()
  ) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(v_declarations)
  loop
    if not exists (
      select 1 from public.available_payment_methods(v_location_id) method
      where method.is_cashier_controlled
        and method.ledger_account_code = v_decl ->> 'account_code'
    ) then raise exception 'payment_method_unavailable_at_location'; end if;
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance
    ) values(
      v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected
    );
    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(v_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
  if v_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'), auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;

create or replace function public.open_cashier_session(p_declarations jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.open_cashier_session_at_location(
    public.resolve_business_location(null), p_declarations
  );
end;
$$;

create or replace function public.notify_large_cashier_variance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reconciliation record;
  v_threshold bigint;
  v_location_name text;
begin
  select r.company_id, r.location_id, r.scope, r.scope_ref_id
  into v_reconciliation
  from public.reconciliations r
  where r.id = new.reconciliation_id;

  if v_reconciliation.scope <> 'cash-session'
     or not v_reconciliation.scope_ref_id like '%:closing'
     or new.variance = 0 then
    return new;
  end if;

  select c.variance_notification_threshold into v_threshold
  from public.companies c where c.id = v_reconciliation.company_id;

  if abs(new.variance) < coalesce(v_threshold, 0) then
    return new;
  end if;

  select l.name into v_location_name
  from public.stock_locations l where l.id = v_reconciliation.location_id;

  perform public.notify(
    v_reconciliation.company_id,
    'system',
    'Till variance needs review',
    format(
      '%s at %s recorded a %s of KES %s.',
      new.account_code,
      coalesce(v_location_name, 'the business'),
      case when new.variance < 0 then 'shortage' else 'overage' end,
      to_char(abs(new.variance) / 100.0, 'FM999,999,990.00')
    ),
    '/money/cashier'
  );

  return new;
end;
$$;

drop trigger if exists reconciliation_accounts_notify_large_variance
  on public.reconciliation_accounts;
create trigger reconciliation_accounts_notify_large_variance
  after insert on public.reconciliation_accounts
  for each row execute function public.notify_large_cashier_variance();

-- ----------------------------------------------------------------------------
-- [squashed] 20260804003000_0053_stock_adjustment_history.sql
-- ----------------------------------------------------------------------------
-- Readable, location-scoped stock-adjustment history. FIFO write-offs may
-- create several movements, so the feed groups them into one user action.

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
  v_total bigint;
  v_batch_id uuid;
  v_entry_id uuid;
  v_source_id text;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    v_entry_id := public.post_inventory_write_off(
      p_variant_id, abs(v_change), trim(p_reason)
    );
    select e.source_id into v_source_id
    from public.ledger_journal_entries e where e.id = v_entry_id;
    update public.inventory_movements m
    set meta = coalesce(m.meta, '{}'::jsonb) || jsonb_build_object(
      'reason', trim(p_reason),
      'previousQuantity', v_current,
      'newQuantity', p_new_quantity,
      'locationId', v_location_id
    )
    where m.company_id = v_company_id
      and m.source_type = 'InventoryWriteOff'
      and m.source_id = v_source_id;
    return v_entry_id;
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

create or replace function public.stock_adjustment_history(
  p_location_id uuid,
  p_variant_id uuid default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  adjustment_id text,
  adjusted_at timestamptz,
  variant_id uuid,
  product_name text,
  variant_name text,
  sku text,
  location_id uuid,
  location_name text,
  quantity_change numeric,
  quantity_before numeric,
  quantity_after numeric,
  stock_value bigint,
  reason text,
  actor_id uuid,
  actor_name text,
  batch_movements integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  return query
  with grouped as (
    select
      m.source_id as adjustment_id,
      max(m.created_at) as adjusted_at,
      m.variant_id,
      p.name::text as product_name,
      v.name::text as variant_name,
      v.sku::text,
      m.stock_location_id as location_id,
      l.name::text as location_name,
      sum(m.quantity)::numeric as quantity_change,
      max(nullif(m.meta ->> 'previousQuantity', '')::numeric) as quantity_before,
      max(nullif(m.meta ->> 'newQuantity', '')::numeric) as quantity_after,
      coalesce(sum(m.total_cost), 0)::bigint as stock_value,
      coalesce(
        max(nullif(m.meta ->> 'reason', '')),
        regexp_replace(max(e.memo), '^Stock adjustment · ', '')
      )::text as reason,
      max(m.actor::text)::uuid as actor_id,
      coalesce(
        max(sp.display_name),
        case when max(m.actor::text) is not null then 'User …' || right(max(m.actor::text), 6) end,
        'System'
      )::text as actor_name,
      count(*)::integer as batch_movements
    from public.inventory_movements m
    join public.product_variants v on v.id = m.variant_id and v.company_id = m.company_id
    join public.products p on p.id = v.product_id and p.company_id = m.company_id
    join public.stock_locations l on l.id = m.stock_location_id
    left join public.ledger_journal_entries e
      on e.company_id = m.company_id and e.source_id = m.source_id
      and e.source_type in ('StockAdjustment', 'InventoryWriteOff')
    left join public.company_staff_profiles sp
      on sp.company_id = m.company_id and sp.user_id = m.actor
    where m.company_id = v_company_id
      and m.stock_location_id = v_location_id
      and m.source_type in ('StockAdjustment', 'InventoryWriteOff')
      and (p_variant_id is null or m.variant_id = p_variant_id)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', p.name, v.name, v.sku, m.meta ->> 'reason', e.memo)
          ilike '%' || trim(p_search) || '%'
      )
    group by m.source_id, m.variant_id, p.name, v.name, v.sku,
      m.stock_location_id, l.name
  )
  select g.*, count(*) over()::bigint as total_count
  from grouped g
  order by g.adjusted_at desc, g.adjustment_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  from anon, public;
grant execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
-- [squashed] 20260804040000_0054_checkout_rework.sql
-- ----------------------------------------------------------------------------
-- 0054_checkout_rework.sql
-- Checkout rework: external (non-cashier-controlled) payment accounts.
--
-- A tender whose effective is_cashier_controlled is false (location override
-- in location_payment_methods wins over the company default — same coalesce
-- as available_payment_methods) cannot be dropped into a cashier session:
--   walk-in sale (no customer)          -> hard error, sale is rejected
--   customer sale, no ViewFinancials    -> order held UNPAID (pending_payment,
--                                          the state the cashier queue settles
--                                          later) + pending approval + a
--                                          company-wide notification
--   ViewFinancials holder               -> completes normally
--
-- Approval metadata shape (always the same, single or multiple tenders):
--   {"order_id": "<uuid>",
--    "tenders": [{"method": "...", "amount": 0, "reference": "..."}, ...]}
--
-- approve_request / deny_request: 'external_account_payment' is a financial
-- decision gated by ViewFinancials — ManageApprovals alone is NOT sufficient.
-- Approval settles the held order through complete_order, the exact internal
-- logic settle_order uses (payments insert + status transition + ledger).
--
-- Changes:
--   1. update_payment_method gains p_is_cashier_controlled (null = keep the
--      current value, same convention as p_enabled / p_requires_reconciliation).
--   2. approvals.type CHECK gains 'external_account_payment'.
--   3. post_sale_at_location gates external tenders and now returns a jsonb
--      status object (void_sale precedent):
--        {"status": "completed" | "parked", "order_id": "..."}
--        {"status": "approval_required", "approval_id": "...", "order_id": "..."}
--   4. enforce_order_cashier_flow exempts the approval hold: the held order
--      must reach pending_payment even when the cashier queue is disabled.
--   5. approve_request / deny_request per-type permission gates.

-- ---------------------------------------------------------------------------
-- 1. update_payment_method: + p_is_cashier_controlled.
-- New signature, so the old 3-arg function is dropped to avoid PostgREST
-- overload ambiguity (0006_sale_idempotency precedent).
-- ---------------------------------------------------------------------------
drop function public.update_payment_method(text, boolean, boolean);

create or replace function public.update_payment_method(
  p_code text,
  p_enabled boolean default null,
  p_requires_reconciliation boolean default null,
  p_is_cashier_controlled boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      is_cashier_controlled = coalesce(p_is_cashier_controlled, is_cashier_controlled),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.update_payment_method(text, boolean, boolean, boolean) from anon, public;
grant execute on function public.update_payment_method(text, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. approvals: new type.
-- ---------------------------------------------------------------------------
alter table public.approvals drop constraint approvals_type_check;
alter table public.approvals add constraint approvals_type_check
  check (type in ('overdraft', 'customer_credit', 'below_wholesale', 'order_reversal', 'external_account_payment'));

-- ---------------------------------------------------------------------------
-- 3. post_sale_at_location: external-tender gate + jsonb result.
-- ---------------------------------------------------------------------------
drop function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text);

create or replace function public.post_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_external_tenders jsonb;
  v_order_id uuid;
  v_approval_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);

  -- Parked sales take no payment, so only live tenders are gated. 'credit'
  -- is excluded: credit sales are handled by the credit-limit logic in
  -- complete_order, not by cashier control.
  if not p_park then
    select jsonb_agg(jsonb_build_object(
             'method', t.method, 'amount', t.amount, 'reference', t.reference
           ))
    into v_external_tenders
    from (
      select p ->> 'method' as method,
             (p ->> 'amount')::bigint as amount,
             p ->> 'reference' as reference
      from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) p
    ) t
    join public.payment_methods pm
      on pm.company_id = v_company_id and pm.code = t.method
    left join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
    where t.method <> 'credit'
      and not coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled);
  end if;

  if v_external_tenders is not null then
    if p_customer_id is null then
      raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts';
    end if;

    if not public.current_user_has_permission('ViewFinancials') then
      -- Hold the order unpaid for finance sign-off. The hold flag lets the
      -- order reach pending_payment even when the cashier queue is disabled
      -- (enforce_order_cashier_flow exemption below).
      perform set_config('app.external_payment_hold', 'on', true);
      v_order_id := public.post_sale(p_customer_id, p_lines, '[]'::jsonb, true, p_client_ref);

      -- Reuse an existing pending request (idempotent client_ref replay),
      -- same pattern as void_sale.
      select a.id into v_approval_id
      from public.approvals a
      where a.company_id = v_company_id
        and a.type = 'external_account_payment'
        and a.status = 'pending'
        and a.metadata ->> 'order_id' = v_order_id::text
      limit 1;

      if v_approval_id is null then
        v_approval_id := public.create_approval(
          v_company_id, 'external_account_payment',
          jsonb_build_object('order_id', v_order_id, 'tenders', v_external_tenders)
        );

        perform public.notify(
          v_company_id, 'approval',
          'External account payment needs approval',
          'A sale was tendered to a non-cashier-controlled account and is held pending settlement.',
          '/approvals', null
        );
      end if;

      return jsonb_build_object(
        'status', 'approval_required',
        'approval_id', v_approval_id,
        'order_id', v_order_id
      );
    end if;
  end if;

  v_order_id := public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref);

  return jsonb_build_object(
    'status', case when p_park then 'parked' else 'completed' end,
    'order_id', v_order_id
  );
end;
$$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. enforce_order_cashier_flow: let approval-held orders reach
-- pending_payment regardless of the cashier-flow mode (only the marked
-- exemption is new).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_cashier_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_payment'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_payment')
     -- NEW: external-account approval hold parks the order unpaid even when
     -- the cashier queue is disabled.
     and coalesce(current_setting('app.external_payment_hold', true), '') <> 'on'
     and not coalesce((
       select c.cashier_flow_enabled from public.companies c where c.id = new.company_id
     ), false) then
    raise exception 'cashier_flow_disabled: take payment and complete this sale directly';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. approve_request / deny_request: 'external_account_payment' is gated by
-- ViewFinancials (ManageApprovals alone is denied). Approval settles the held
-- order with the stored tenders via complete_order — the exact internal logic
-- settle_order uses. Denial leaves the order pending_payment so the cashier
-- queue can still settle it through normal methods.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Fetch first (any status) so the gate can be type-aware: callers holding
  -- neither permission get ViewFinancials for external payments and
  -- ManageApprovals for everything else, even on stale approvals.
  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  if v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  update public.approvals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  -- Execute the gated action.
  if v_approval.type = 'order_reversal' then
    perform public.do_void(
      (v_approval.metadata ->> 'order_id')::uuid,
      coalesce(v_approval.metadata ->> 'reason', 'approved reversal')
    );
  elsif v_approval.type = 'external_account_payment' then
    perform public.complete_order(
      (v_approval.metadata ->> 'order_id')::uuid,
      v_approval.metadata -> 'tenders',
      auth.uid()
    );
  end if;
  -- below_wholesale: approval simply unblocks complete_order (no action here).
  -- overdraft: recorded pre-approved; nothing to execute.

  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  if v_approval.type = 'external_account_payment' then
    if not public.current_user_has_permission('ViewFinancials') then
      raise exception 'permission_denied: ViewFinancials required';
    end if;
  elsif not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  -- The held order stays pending_payment; only the request is denied.
  update public.approvals
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid, text) from anon, public;
revoke execute on function public.deny_request(uuid, text) from anon, public;
grant execute on function public.approve_request(uuid, text) to authenticated;
grant execute on function public.deny_request(uuid, text) to authenticated;
