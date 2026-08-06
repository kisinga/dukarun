-- 0019_company_contact.sql
-- Company contact details collected at registration: email + physical address
-- (the address is printed on receipts/invoices). Owner name is NOT stored here —
-- it lives in company_staff_profiles via update_my_profile (0009).

alter table public.companies
  add column if not exists email text,
  add column if not exists address text;

-- Registration collects these now, so members may edit them client-side like
-- the other company profile fields (0001:227-241).
grant update (email, address) on public.companies to authenticated;

-- ---------------------------------------------------------------------------
-- provision_company gains optional contact params. The 3-arg signature is
-- dropped: create-or-replace would leave a stale overload behind.
-- ---------------------------------------------------------------------------
drop function if exists public.provision_company(text, text, text);

create function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null
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

  if (select count(*) from public.company_memberships where user_id = v_user_id) >= 5 then
    raise exception 'company_limit_reached';
  end if;

  -- Base the code suffix on the company name + a random component so a user's
  -- second company cannot collide with their first (md5 was user-stable).
  v_code := left(upper(regexp_replace(p_company_name, '[^A-Za-z0-9]', '', 'g')), 8)
            || upper(substr(md5(v_user_id::text || gen_random_uuid()::text), 1, 4));

  insert into public.companies (
    code, name, currency, status, email, address,
    subscription_tier_id, subscription_status, trial_ends_at, subscription_expires_at
  )
  values (
    v_code, trim(p_company_name), p_currency, 'unapproved',
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    (select id from public.subscription_tiers where code = 'trial' limit 1),
    'trial',
    now() + interval '30 days',
    now() + interval '30 days'  -- expiry scan enforces this; trial_ends_at is display
  )
  returning id into v_company_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Admin', array[
      'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
      'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
      'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
      'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
      'CreateInterAccountTransfer', 'ManageTeam', 'ViewAuditTrail',
      'ViewStaffPerformance', 'ManageCommissions'
    ])
  returning id into v_role_id;

  insert into public.roles (company_id, name, permissions)
  values (v_company_id, 'Cashier', array['SettleOrder']);

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, v_role_id, 'approved');

  -- The freshly provisioned company becomes active for the next token issue.
  insert into public.user_preferences (user_id, active_company_id)
  values (v_user_id, v_company_id)
  on conflict (user_id)
  do update set active_company_id = excluded.active_company_id, updated_at = now();

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

revoke execute on function public.provision_company(text, text, text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text, text, text) to authenticated;
