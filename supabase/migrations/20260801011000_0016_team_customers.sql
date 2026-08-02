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
