-- ===========================================================================
-- 20260723000000_0001_tenancy.sql
-- ===========================================================================
-- Tenancy: companies, memberships, roles/permissions, auth hooks,
-- provision_company, ledger account chart, payment methods, stock locations,
-- audit infrastructure, team management and entitlement limits.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0001_tenancy (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0002_auth_hooks (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0003_provisioning (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0004_pos (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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
-- [squashed] 0015_audit_log (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0016_team_customers (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0023_role_templates (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0024_billing (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0024_billing.sql
-- Phase 5 backend: subscription activation (Paystack-confirmed), entitlement
-- enforcement in write RPCs, daily expiry scanner via pg_cron.
-- Model faithful to the old system: one-off charges (no Paystack plans),
-- locally-managed expiry, grace period, exemption fields.

-- Idempotency marker for webhook replays.
alter table public.companies add column last_payment_reference text;

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
-- [squashed] 0028_search_path_hardening (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0040_team_entitlement_limit (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0041_team_reactivation_limit (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- [squashed] 0048_tenant_audit_trail (statements belonging to this domain)
-- ---------------------------------------------------------------------------
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
