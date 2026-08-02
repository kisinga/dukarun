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
    (v_company_id, 'CLEARING_MPESA', 'Clearing - M-Pesa', 'asset', v_cash_parent, true),
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
