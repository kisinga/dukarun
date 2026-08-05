-- 0018_multi_company.sql
-- One user may own / belong to multiple companies.
--
-- Model: company_memberships was already many-to-many; the missing pieces were
--   1. which company is ACTIVE for the session (user_preferences.active_company_id)
--   2. the token hook, which hard-coded "earliest approved membership wins"
--   3. provision_company's already_provisioned guard
-- Everything downstream (RLS via current_company_id(), security definer RPCs,
-- storage policies, the offline scope keys) reads the single JWT company_id
-- claim and needs no change — switching companies means a new claim on refresh.

-- ---------------------------------------------------------------------------
-- user_preferences: per-user active company. Written by the client before a
-- session refresh; read by the token hook on every token issue.
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_company_id uuid references public.companies (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

grant select, insert, update on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;

-- Membership validation for the policies below must bypass RLS:
-- company_memberships only exposes rows of the CURRENTLY active company
-- (0001:207-212), so a plain exists() would reject switching to another
-- company the user belongs to.
create or replace function public.is_approved_member(p_company_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and m.authorization_status = 'approved'
  );
$$;

revoke execute on function public.is_approved_member(uuid, uuid) from anon, public;
grant execute on function public.is_approved_member(uuid, uuid) to authenticated;

-- Users manage only their own row, and may only activate a company they hold
-- an approved membership in (the hook re-validates regardless).
create policy "users read own preferences"
  on public.user_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users insert own preferences"
  on public.user_preferences for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      active_company_id is null
      or public.is_approved_member(active_company_id, (select auth.uid()))
    )
  );

create policy "users update own preferences"
  on public.user_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      active_company_id is null
      or public.is_approved_member(active_company_id, (select auth.uid()))
    )
  );

-- The token hook runs as supabase_auth_admin (security invoker), so it needs
-- the same grant + policy pattern as the other tables it reads (0001:389-406).
grant select on public.user_preferences to supabase_auth_admin;

create policy "auth admin reads preferences for token hook"
  on public.user_preferences for select
  to supabase_auth_admin
  using (true);

-- ---------------------------------------------------------------------------
-- my_companies: the client's company-switcher source. RLS on companies only
-- exposes the ACTIVE company, so listing all memberships needs a definer RPC.
-- is_active reflects the stored preference; the JWT claim is the live truth.
-- ---------------------------------------------------------------------------
create or replace function public.my_companies()
returns table (company_id uuid, name text, code text, role_name text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.code,
    coalesce(r.name, ''),
    up.active_company_id = c.id
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up on up.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.authorization_status = 'approved'
  order by c.name;
$$;

revoke execute on function public.my_companies() from anon, public;
grant execute on function public.my_companies() to authenticated;

-- ---------------------------------------------------------------------------
-- Token hook: resolve claims from the ACTIVE company (user_preferences),
-- falling back to the earliest approved membership when unset or stale. Role
-- comes from the membership of the selected company, so per-company roles
-- (Admin in A, Cashier in B) resolve correctly. Keeps the never-raise +
-- clear-stale-claims properties and the single indexed-lookup budget.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  -- Clear first: a disabled membership or removed platform admin must not
  -- retain claims carried in the event payload.
  v_claims := v_claims - 'company_id' - 'user_role' - 'is_platform_admin';

  -- Preferred (active) company wins when it still maps to an approved
  -- membership; otherwise earliest approved membership, as before.
  select m.company_id, r.name
    into v_company_id, v_role_name
  from public.company_memberships m
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up
    on up.user_id = m.user_id and up.active_company_id = m.company_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
  order by (up.user_id is not null) desc, m.created_at asc
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
$function$;

-- ---------------------------------------------------------------------------
-- provision_company: drop the single-company guard (replaced by a per-user
-- cap against abuse) and make the new company the active one — the client
-- refreshes the session right after provisioning.
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

  if (select count(*) from public.company_memberships where user_id = v_user_id) >= 5 then
    raise exception 'company_limit_reached';
  end if;

  -- Base the code suffix on the company name + a random component so a user's
  -- second company cannot collide with their first (md5 was user-stable).
  v_code := left(upper(regexp_replace(p_company_name, '[^A-Za-z0-9]', '', 'g')), 8)
            || upper(substr(md5(v_user_id::text || gen_random_uuid()::text), 1, 4));

  insert into public.companies (
    code, name, currency, status,
    subscription_tier_id, subscription_status, trial_ends_at, subscription_expires_at
  )
  values (
    v_code, trim(p_company_name), p_currency, 'unapproved',
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

revoke execute on function public.provision_company(text, text, text) from anon, public;
grant execute on function public.provision_company(text, text, text) to authenticated;
