-- 0003_provisioning.sql
-- ledger_accounts (21 seeded per company), payment_methods config, stock_locations,
-- and the provision_company RPC that replaces the 6 Vendure provisioner services
-- (services/auth/provisioning/) with a single transaction.

-- ---------------------------------------------------------------------------
-- ledger_accounts — verbatim port of backend/src/ledger/account.entity.ts.
-- Money stays bigint cents on journal lines (added with journal tables in the
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
    (v_company_id, 'CLEARING_MPESA', 'Clearing - M-Pesa', 'asset', v_cash_parent, true),
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

  -- Payment methods (payment-provisioner.service.ts defaults).
  insert into public.payment_methods (
    company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled
  )
  values
    (v_company_id, 'cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true),
    (v_company_id, 'mpesa', 'M-Pesa', 'CLEARING_MPESA', 'transaction_verification', true),
    (v_company_id, 'bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false),
    (v_company_id, 'credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false);

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company(text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text) to authenticated;
