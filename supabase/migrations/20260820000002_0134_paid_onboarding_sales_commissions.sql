-- Atomic paid onboarding and platform salesperson commissions.
-- New companies receive no free access: one verified monthly payment grants
-- the configured 1-3 month testing period.

-- ---------------------------------------------------------------------------
-- Billing policy hard cutover.
-- ---------------------------------------------------------------------------
alter table public.platform_billing_settings
  add column new_customer_tier_id uuid references public.subscription_tiers(id),
  add column testing_access_months integer,
  add column sales_commissions_enabled boolean not null default false,
  add column sales_commission_rate_bps integer not null default 2000
    check (sales_commission_rate_bps between 1 and 10000);

update public.platform_billing_settings
set new_customer_tier_id = coalesce(
      case when intro_offer_enabled and exists(
        select 1 from public.subscription_tiers t
        where t.id=intro_offer_tier_id and t.is_active and t.price_monthly>0
      ) then intro_offer_tier_id end,
      case when exists(
        select 1 from public.subscription_tiers t
        where t.id=default_trial_tier_id and t.is_active and t.price_monthly>0
      ) then default_trial_tier_id end,
      (select t.id from public.subscription_tiers t
       where t.is_active and t.price_monthly>0 order by t.price_monthly,t.id limit 1)
    ),
    testing_access_months = case
      when intro_offer_enabled then least(
        3,
        greatest(1, coalesce(intro_offer_paid_months, 1) + coalesce(intro_offer_bonus_months, 0))
      )
      else 1
    end;

alter table public.platform_billing_settings
  alter column new_customer_tier_id set not null,
  alter column testing_access_months set not null,
  add constraint platform_billing_testing_access_months_check
    check (testing_access_months between 1 and 3);

-- Preserve the remaining access of the one legacy trial, then eliminate the
-- live trial state from the current schema.
update public.companies
set subscription_status = case
      when coalesce(trial_ends_at, subscription_expires_at) > now() then 'active'
      else 'expired'
    end,
    subscription_expires_at = coalesce(trial_ends_at, subscription_expires_at, now()),
    billing_cycle = coalesce(billing_cycle, 'monthly'),
    subscription_grace_period_end = null,
    updated_at = now()
where subscription_status = 'trial';

alter table public.companies drop constraint if exists companies_subscription_status_check;
alter table public.companies add constraint companies_subscription_status_check
  check (subscription_status in ('active', 'expired', 'cancelled'));

-- ---------------------------------------------------------------------------
-- Durable initial purchases and salesperson attribution.
-- ---------------------------------------------------------------------------
create table public.initial_subscription_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers(id),
  testing_access_months integer not null check (testing_access_months between 1 and 3),
  amount bigint not null check (amount > 0),
  payment_reference text not null unique,
  purchased_at timestamptz not null default now()
);

create table public.initial_subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tier_id uuid not null references public.subscription_tiers(id),
  payment_reference text not null unique,
  amount bigint not null check (amount > 0),
  testing_access_months integer not null check (testing_access_months between 1 and 3),
  status text not null default 'pending' check (status in ('pending','failed','succeeded')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index initial_subscription_payment_one_pending_company_idx
  on public.initial_subscription_payment_attempts(company_id) where status='pending';
create index initial_subscription_payment_attempts_company_time_idx
  on public.initial_subscription_payment_attempts(company_id,created_at desc);

insert into public.initial_subscription_purchases(
  company_id, tier_id, testing_access_months, amount, payment_reference, purchased_at
)
select distinct on (r.company_id)
  r.company_id,
  r.tier_id,
  least(3, greatest(1, r.paid_months + r.bonus_months)),
  r.amount,
  r.payment_reference,
  r.redeemed_at
from public.subscription_intro_offer_redemptions r
order by r.company_id, r.redeemed_at, r.id;

alter table public.initial_subscription_purchases enable row level security;
alter table public.initial_subscription_payment_attempts enable row level security;
create policy "platform admins read initial subscription purchases"
  on public.initial_subscription_purchases for select to authenticated
  using ((select public.is_platform_admin()));
create policy "platform admins read initial subscription payment attempts"
  on public.initial_subscription_payment_attempts for select to authenticated
  using ((select public.is_platform_admin()));
grant select on public.initial_subscription_purchases to authenticated;
grant select on public.initial_subscription_payment_attempts to authenticated;
grant all on public.initial_subscription_purchases to service_role;
grant all on public.initial_subscription_payment_attempts to service_role;

create table public.platform_salespeople (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  phone text,
  invitation_code text not null unique
    check (invitation_code = upper(invitation_code))
    check (invitation_code ~ '^[A-Z0-9_-]{4,24}$'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_sales_attributions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.platform_salespeople(id) on delete restrict,
  invitation_code text not null,
  attributed_at timestamptz not null default now()
);
create index company_sales_attributions_salesperson_idx
  on public.company_sales_attributions(salesperson_id, attributed_at desc);

create table public.platform_sales_commissions (
  id uuid primary key default gen_random_uuid(),
  salesperson_id uuid not null references public.platform_salespeople(id) on delete restrict,
  company_id uuid not null unique references public.companies(id) on delete restrict,
  payment_reference text not null unique,
  collected_amount bigint not null check (collected_amount > 0),
  rate_bps integer not null check (rate_bps between 1 and 10000),
  commission_amount bigint not null check (commission_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'reversed')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  payout_reference text,
  reversed_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index platform_sales_commissions_salesperson_status_idx
  on public.platform_sales_commissions(salesperson_id, status, created_at desc);
create index platform_sales_commissions_created_idx
  on public.platform_sales_commissions(created_at desc,id desc);

create function public.enforce_salesperson_invitation_code_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.invitation_code is distinct from old.invitation_code then
    raise exception 'sales_invitation_code_immutable';
  end if;
  return new;
end;
$$;
create trigger platform_salespeople_code_immutable
before update of invitation_code on public.platform_salespeople
for each row execute function public.enforce_salesperson_invitation_code_immutable();

create function public.enforce_company_sales_attribution_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and not exists(
    select 1 from public.companies where id=old.company_id
  ) then return old; end if;
  raise exception 'company_sales_attribution_immutable';
end;
$$;
create trigger company_sales_attributions_immutable
before update or delete on public.company_sales_attributions
for each row execute function public.enforce_company_sales_attribution_immutable();

alter table public.platform_salespeople enable row level security;
alter table public.company_sales_attributions enable row level security;
alter table public.platform_sales_commissions enable row level security;

create policy "platform admins read salespeople" on public.platform_salespeople
  for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins read sales attributions" on public.company_sales_attributions
  for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins read sales commissions" on public.platform_sales_commissions
  for select to authenticated using ((select public.is_platform_admin()));

grant select on public.platform_salespeople to authenticated;
grant select on public.company_sales_attributions to authenticated;
grant select on public.platform_sales_commissions to authenticated;
grant all on public.platform_salespeople to service_role;
grant all on public.company_sales_attributions to service_role;
grant all on public.platform_sales_commissions to service_role;

create trigger platform_salespeople_audit
  after insert or update or delete on public.platform_salespeople
  for each row execute function public.audit_trigger();
create trigger company_sales_attributions_audit
  after insert or update or delete on public.company_sales_attributions
  for each row execute function public.audit_trigger();
create trigger platform_sales_commissions_audit
  after insert or update or delete on public.platform_sales_commissions
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Public billing and approval contracts.
-- ---------------------------------------------------------------------------
create or replace function public.public_billing_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'newCustomerTierCode', t.code,
    'newCustomerTierName', t.name,
    'initialPurchasePrice', t.price_monthly,
    'testingAccessMonths', s.testing_access_months
  )
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id = s.new_customer_tier_id
  where s.singleton
$$;
revoke execute on function public.public_billing_config() from public;
grant execute on function public.public_billing_config() to anon, authenticated;

create function public.platform_update_paid_onboarding_policy(
  p_new_customer_tier_id uuid,
  p_testing_access_months integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_testing_access_months not between 1 and 3 then
    raise exception 'invalid_testing_access_months';
  end if;
  if not exists (
    select 1 from public.subscription_tiers
    where id = p_new_customer_tier_id and is_active and price_monthly > 0
  ) then raise exception 'new_customer_tier_not_billable'; end if;

  update public.platform_billing_settings
  set new_customer_tier_id = p_new_customer_tier_id,
      testing_access_months = p_testing_access_months,
      updated_at = now()
  where singleton;
  return public.public_billing_config();
end;
$$;
revoke execute on function public.platform_update_paid_onboarding_policy(uuid,integer)
  from public, anon;
grant execute on function public.platform_update_paid_onboarding_policy(uuid,integer)
  to authenticated, service_role;

drop trigger if exists protect_default_trial_tier on public.subscription_tiers;
drop function if exists public.prevent_default_trial_tier_deactivation();

create function public.enforce_new_customer_tier_billable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.platform_billing_settings
    where singleton and new_customer_tier_id = old.id
  ) then
    if old.is_active and not new.is_active then
      raise exception 'cannot_deactivate_new_customer_tier';
    end if;
    if new.price_monthly <= 0 then
      raise exception 'new_customer_tier_must_remain_billable';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_new_customer_tier
before update of is_active,price_monthly on public.subscription_tiers
for each row execute function public.enforce_new_customer_tier_billable();

create or replace function public.approve_company_transition(p_company_id uuid,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company public.companies%rowtype;v_tier_id uuid;v_now timestamptz:=now();
begin
  if p_mode not in ('manual','automatic') then raise exception 'invalid_approval_mode'; end if;
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status='approved' then return p_company_id; end if;
  select new_customer_tier_id into v_tier_id
  from public.platform_billing_settings where singleton;
  if v_tier_id is null then raise exception 'paid_onboarding_not_configured'; end if;
  update public.companies set
    status='approved',subscription_tier_id=v_tier_id,subscription_status=null,
    subscription_started_at=null,subscription_expires_at=null,
    subscription_grace_period_end=null,billing_cycle=null,updated_at=v_now
  where id=p_company_id;
  insert into public.company_approval_events(company_id,approval_mode,approved_by,approved_at)
  values(p_company_id,p_mode,case when p_mode='manual' then auth.uid() end,v_now);
  return p_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioning: one atomic current contract, no trial-plan compatibility.
-- ---------------------------------------------------------------------------
drop function if exists public.provision_company_with_terms(text,text,text,text,text,text,text,text,text);
drop function if exists public.provision_company_registration(text,text,text,text,text,text,text,text,text,uuid);
drop function if exists public.provision_company_registration_core(text,text,text,text,text,text,text,text,text,uuid);
drop function if exists public.provision_company(text,text,text,text,text,text);

-- The mature provisioning base predates paid onboarding and inserted the old
-- trial columns. Keep all of its tenant bootstrap work while removing that
-- obsolete insert contract before the columns are dropped below.
create or replace function public.provision_company_base(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid:=auth.uid();v_company_id uuid;v_code text;v_role_id uuid;v_cash_parent uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_company_name is null or length(trim(p_company_name))<2 then raise exception 'invalid_company_name'; end if;
  if (select count(*) from public.company_memberships where user_id=v_user_id)>=5 then
    raise exception 'company_limit_reached';
  end if;
  v_code:=left(upper(regexp_replace(p_company_name,'[^A-Za-z0-9]','','g')),8)
    ||upper(substr(md5(v_user_id::text||gen_random_uuid()::text),1,4));
  insert into public.companies(code,name,currency,status,email,address,subscription_status)
  values(v_code,trim(p_company_name),p_currency,'unapproved',
    nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_address,'')),''),null)
  returning id into v_company_id;

  insert into public.roles(company_id,name,permissions) values(v_company_id,'Admin',array[
    'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
    'ManageCustomerCreditLimit','ManageCustomers','ManageCatalog','ManageCommunications',
    'ReverseOrder','OverrideCustomerBalance','SettleOrder',
    'ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
    'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
    'ViewStaffPerformance','ManageCommissions'
  ]) returning id into v_role_id;
  insert into public.roles(company_id,name,permissions)
  values(v_company_id,'Cashier',array['SettleOrder']);
  perform public.seed_default_company_roles(v_company_id);
  insert into public.company_memberships(company_id,user_id,role_id,authorization_status)
  values(v_company_id,v_user_id,v_role_id,'approved');
  insert into public.user_preferences(user_id,active_company_id)
  values(v_user_id,v_company_id) on conflict(user_id) do update
    set active_company_id=excluded.active_company_id,updated_at=now();
  insert into public.stock_locations(company_id,code,name)
  values(v_company_id,'MAIN',coalesce(nullif(trim(p_store_name),''),'Main Store'));
  insert into public.ledger_accounts(company_id,code,name,type,is_parent,is_system)
  values(v_company_id,'CASH','Cash','asset',true,true) returning id into v_cash_parent;
  insert into public.ledger_accounts(company_id,code,name,type,parent_id,is_system) values
    (v_company_id,'CASH_ON_HAND','Cash on Hand','asset',v_cash_parent,true),
    (v_company_id,'BANK_MAIN','Bank - Main','asset',v_cash_parent,true),
    (v_company_id,'MPESA','M-Pesa','asset',v_cash_parent,true),
    (v_company_id,'CLEARING_CREDIT','Clearing - Customer Credit','asset',null,true),
    (v_company_id,'CLEARING_GENERIC','Clearing - Generic','asset',null,true),
    (v_company_id,'ACCOUNTS_RECEIVABLE','Accounts Receivable','asset',null,true),
    (v_company_id,'INVENTORY','Inventory','asset',null,true),
    (v_company_id,'SALES','Sales Revenue','income',null,true),
    (v_company_id,'SALES_RETURNS','Sales Returns','income',null,true),
    (v_company_id,'ACCOUNTS_PAYABLE','Accounts Payable','liability',null,true),
    (v_company_id,'TAX_PAYABLE','Taxes Payable','liability',null,true),
    (v_company_id,'PURCHASES','Inventory Purchases','expense',null,true),
    (v_company_id,'EXPENSES','General Expenses','expense',null,true),
    (v_company_id,'PROCESSOR_FEES','Payment Processor Fees','expense',null,true),
    (v_company_id,'CASH_SHORT_OVER','Cash Short/Over','expense',null,true),
    (v_company_id,'COGS','Cost of Goods Sold','expense',null,true),
    (v_company_id,'INVENTORY_WRITE_OFF','Inventory Write-Off','expense',null,true),
    (v_company_id,'EXPIRY_LOSS','Expiry Loss','expense',null,true),
    (v_company_id,'INVENTORY_ADJUSTMENT','Inventory Adjustment','expense',null,true),
    (v_company_id,'BALANCE_ADJUSTMENT','Balance Adjustment','equity',null,true);
  update public.ledger_accounts set allow_manual_posting=true
  where company_id=v_company_id and code in('CASH_ON_HAND','BANK_MAIN','MPESA');
  insert into public.payment_methods(
    company_id,code,name,ledger_account_code,reconciliation_type,is_cashier_controlled
  ) values
    (v_company_id,'cash','Cash','CASH_ON_HAND','blind_count',true),
    (v_company_id,'mpesa','M-Pesa','MPESA','transaction_verification',true),
    (v_company_id,'bank','Bank Transfer','BANK_MAIN','statement_match',false),
    (v_company_id,'credit','Customer Credit','CLEARING_CREDIT','credit_ledger',false);
  return v_company_id;
end;
$$;
revoke execute on function public.provision_company_base(text,text,text,text,text)
  from anon,authenticated,public;

create function public.provision_company(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid;v_tier_id uuid;
begin
  select s.new_customer_tier_id into v_tier_id
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id=s.new_customer_tier_id
  where s.singleton and t.is_active and t.price_monthly>0;
  if v_tier_id is null then raise exception 'paid_onboarding_not_configured'; end if;
  v_company_id:=public.provision_company_base(
    p_company_name,p_store_name,p_currency,p_email,p_address
  );
  update public.companies set
    subscription_tier_id=v_tier_id,subscription_status=null,
    subscription_started_at=null,subscription_expires_at=null,
    subscription_grace_period_end=null,billing_cycle=null,updated_at=now()
  where id=v_company_id;
  return v_company_id;
end;
$$;
revoke execute on function public.provision_company(text,text,text,text,text) from anon,public;
grant execute on function public.provision_company(text,text,text,text,text)
  to service_role;

create function public.provision_company_registration(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null,
  p_terms_version text default null,
  p_terms_content_sha256 text default null,
  p_owner_name text default null,
  p_blog_ref uuid default null,
  p_sales_code text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid;v_document_id uuid;v_owner_name text:=nullif(trim(coalesce(p_owner_name,'')),'');
  v_auto boolean:=false;v_event public.blog_events%rowtype;v_salesperson_id uuid;
  v_sales_code text:=nullif(upper(trim(coalesce(p_sales_code,''))),'');
  v_first_company boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('company-registration:'||auth.uid()::text,0)
  );
  if p_owner_name is not null and (v_owner_name is null or length(v_owner_name)>120) then
    raise exception 'invalid_owner_name';
  end if;
  if v_sales_code is not null then
    select id into v_salesperson_id from public.platform_salespeople
    where invitation_code=v_sales_code and active for share;
    if v_salesperson_id is null then raise exception 'invalid_or_inactive_sales_code'; end if;
  end if;
  select not exists(
    select 1 from public.company_memberships where user_id=auth.uid()
  ) into v_first_company;
  select id into v_document_id from public.legal_document_versions
  where document_type='terms' and publication_state='published' and effective_at<=now()
    and version=p_terms_version and content_sha256=lower(p_terms_content_sha256);
  if v_document_id is null then raise exception 'legal_document_mismatch'; end if;

  v_company_id:=public.provision_company(
    p_company_name,p_store_name,p_currency,p_email,p_address
  );
  if v_owner_name is not null then
    insert into public.company_staff_profiles(company_id,user_id,display_name)
    values(v_company_id,auth.uid(),v_owner_name)
    on conflict(company_id,user_id) do update
      set display_name=excluded.display_name,updated_at=now();
  end if;
  insert into public.company_legal_acceptances(company_id,document_version_id,accepted_by,source)
  values(v_company_id,v_document_id,auth.uid(),'registration');
  if p_blog_ref is not null then
    select * into v_event from public.blog_events
    where id=p_blog_ref and event_type='cta_click' and occurred_at>=now()-interval '30 days';
    if v_event.id is not null then
      insert into public.company_registration_attributions(company_id,post_id,click_event_id)
      values(v_company_id,v_event.post_id,v_event.id) on conflict do nothing;
    end if;
  end if;
  if v_salesperson_id is not null and v_first_company then
    insert into public.company_sales_attributions(company_id,salesperson_id,invitation_code)
    values(v_company_id,v_salesperson_id,v_sales_code);
  end if;
  select automatic_company_approval_enabled into v_auto
  from public.platform_registration_settings where singleton for share;
  if coalesce(v_auto,false) then
    perform public.approve_company_transition(v_company_id,'automatic');
  end if;
  return jsonb_build_object(
    'company_id',v_company_id,
    'company_status',case when coalesce(v_auto,false) then 'approved' else 'unapproved' end,
    'approval_mode',case when coalesce(v_auto,false) then 'automatic' else 'manual' end,
    'sales_attributed',v_salesperson_id is not null and v_first_company
  );
end;
$$;
revoke execute on function public.provision_company_registration(
  text,text,text,text,text,text,text,text,uuid,text
) from public,anon;
grant execute on function public.provision_company_registration(
  text,text,text,text,text,text,text,text,uuid,text
) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Paid access boundaries and payment activation.
-- ---------------------------------------------------------------------------
create or replace function public.company_subscription_accessible(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.companies c
    where c.id=p_company_id and c.status='approved' and (
      c.subscription_exempt_until>now()
      or (c.subscription_status='active' and c.subscription_expires_at>now())
      or (c.subscription_status='expired' and c.subscription_grace_period_end>now())
    )
  )
$$;

create or replace function public.assert_entitled(p_company_id uuid,p_check text default null)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_company record;v_now timestamptz:=now();
begin
  if p_company_id is distinct from public.current_company_id()
     and not public.is_platform_admin() then raise exception 'not_authorized'; end if;
  select c.*,t.max_team_members,t.max_orders_per_month into v_company
  from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id
  where c.id=p_company_id;
  if v_company is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status<>'approved' then raise exception 'company_unavailable: %',v_company.status; end if;
  if v_company.subscription_exempt_until is not null
     and v_company.subscription_exempt_until>v_now then return; end if;
  if v_company.subscription_status='active'
     and v_company.subscription_expires_at is not null
     and v_company.subscription_expires_at>v_now then null;
  elsif v_company.subscription_status='expired'
     and v_company.subscription_grace_period_end is not null
     and v_company.subscription_grace_period_end>v_now then null;
  elsif v_company.subscription_status in('active','expired') then
    raise exception 'subscription_expired: renew to continue selling';
  else
    raise exception 'subscription_required: make the initial purchase to continue';
  end if;
  if p_check is null or p_check='product' then return; end if;
  if p_check='order' and v_company.max_orders_per_month is not null
     and (select count(*) from public.orders o where o.company_id=p_company_id
       and o.created_at>=date_trunc('month',v_now) and o.status<>'voided')
       >=v_company.max_orders_per_month then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',v_company.max_orders_per_month;
  end if;
  if p_check='team' and v_company.max_team_members is not null
     and (select count(*) from public.company_memberships m
       where m.company_id=p_company_id and m.authorization_status='approved')
       >=v_company.max_team_members then
    raise exception 'limit_reached: team member limit (%); upgrade your plan',v_company.max_team_members;
  end if;
end;
$$;

create or replace function public.subscription_expiry_scan()
returns int language plpgsql security definer set search_path='' as $$
declare v_updated int:=0;v_now timestamptz:=now();
begin
  with candidates as (
    select c.id company_id,c.primary_contact_user_id user_id,c.subscription_expires_at expires_at,
      coalesce(t.name,'Dukarun') tier_name
    from public.companies c left join public.subscription_tiers t on t.id=c.subscription_tier_id
    where c.status='approved' and c.subscription_status='active'
      and c.subscription_expires_at is not null
      and (c.subscription_exempt_until is null or c.subscription_exempt_until<=v_now)
  ), staged as (
    select candidates.*,
      ((expires_at at time zone 'Africa/Nairobi')::date-(v_now at time zone 'Africa/Nairobi')::date) days_remaining
    from candidates
  )
  insert into public.notifications(company_id,user_id,type,title,body,link,dedupe_key)
  select company_id,user_id,'subscription',
    case when days_remaining=1 then 'Subscription expires tomorrow' else 'Subscription expires in 7 days' end,
    'Your '||tier_name||' subscription expires on '
      ||to_char(expires_at at time zone 'Africa/Nairobi','DD Mon YYYY')
      ||'. Renew now to avoid interrupted access.',
    '/billing','subscription:'||company_id::text||':active:'
      ||to_char(expires_at at time zone 'UTC','YYYYMMDDHH24MISS.US')||':'||days_remaining::text
  from staged where days_remaining in(7,1) on conflict do nothing;
  update public.companies set subscription_status='expired',
    subscription_grace_period_end=subscription_expires_at+interval '3 days',updated_at=v_now
  where subscription_status='active' and subscription_expires_at is not null
    and subscription_expires_at<=v_now and subscription_grace_period_end is null;
  get diagnostics v_updated=row_count;
  return v_updated;
end;
$$;

create or replace function public.reset_communication_period_locked(p_company_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_end timestamptz;v_anchor timestamptz;v_next timestamptz;
begin
  select communication_period_end,coalesce(subscription_started_at,created_at)
  into v_end,v_anchor from public.companies where id=p_company_id for update;
  if not found then raise exception 'company_not_found: %',p_company_id; end if;
  if v_end is null or v_end<=now() then
    v_next:=public.next_monthly_anniversary(v_anchor,now());
    update public.companies set sms_used_this_period=0,sms_reserved_this_period=0,
      whatsapp_used_this_period=0,whatsapp_reserved_this_period=0,
      communication_period_end=v_next,sms_period_end=v_next where id=p_company_id;
  end if;
end;
$$;

create function public.reserve_initial_subscription_payment(
  p_company_id uuid,
  p_tier_id uuid,
  p_reference text,
  p_amount bigint,
  p_testing_access_months integer
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company public.companies%rowtype;
  v_expected_tier uuid;
  v_expected_amount bigint;
  v_expected_months integer;
  v_attempt_id uuid;
begin
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status<>'approved' then raise exception 'company_not_approved'; end if;
  if v_company.subscription_status is not null or v_company.last_payment_reference is not null
     or exists(select 1 from public.initial_subscription_purchases where company_id=p_company_id) then
    raise exception 'initial_purchase_not_eligible';
  end if;
  if exists(
    select 1 from public.initial_subscription_payment_attempts
    where company_id=p_company_id and status='pending'
  ) then raise exception 'initial_purchase_payment_pending'; end if;

  select s.new_customer_tier_id,t.price_monthly,s.testing_access_months
  into v_expected_tier,v_expected_amount,v_expected_months
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id=s.new_customer_tier_id
  where s.singleton and t.is_active and t.price_monthly>0;
  if v_expected_tier is null then raise exception 'paid_onboarding_not_configured'; end if;
  if p_tier_id is distinct from v_expected_tier
     or p_amount is distinct from v_expected_amount
     or p_testing_access_months is distinct from v_expected_months then
    raise exception 'initial_purchase_quote_changed';
  end if;
  if nullif(trim(coalesce(p_reference,'')),'') is null then
    raise exception 'initial_purchase_reference_required';
  end if;

  insert into public.initial_subscription_payment_attempts(
    company_id,tier_id,payment_reference,amount,testing_access_months
  ) values(p_company_id,p_tier_id,trim(p_reference),p_amount,p_testing_access_months)
  returning id into v_attempt_id;
  return v_attempt_id;
exception when unique_violation then
  raise exception 'initial_purchase_payment_pending';
end;
$$;
revoke execute on function public.reserve_initial_subscription_payment(uuid,uuid,text,bigint,integer)
  from public,anon,authenticated;
grant execute on function public.reserve_initial_subscription_payment(uuid,uuid,text,bigint,integer)
  to service_role;

create function public.activate_initial_subscription_purchase(
  p_company_id uuid,
  p_tier_id uuid,
  p_reference text,
  p_amount bigint,
  p_unit_price bigint,
  p_testing_access_months integer,
  p_paid_at timestamptz
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company public.companies%rowtype;v_settings public.platform_billing_settings%rowtype;
  v_existing public.initial_subscription_purchases%rowtype;v_now timestamptz:=now();
  v_attempt public.initial_subscription_payment_attempts%rowtype;
begin
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  select * into v_existing from public.initial_subscription_purchases
  where payment_reference=p_reference;
  if v_existing.id is not null then
    if v_existing.company_id=p_company_id
       and v_existing.tier_id=p_tier_id
       and v_existing.amount=p_amount
       and v_existing.testing_access_months=p_testing_access_months
       and v_existing.purchased_at=p_paid_at then
      return p_company_id;
    end if;
    raise exception 'initial_purchase_reference_conflict';
  end if;
  if exists(select 1 from public.initial_subscription_purchases where company_id=p_company_id) then
    raise exception 'initial_purchase_already_completed';
  end if;
  if v_company.status<>'approved' then raise exception 'company_not_approved'; end if;
  if v_company.subscription_status is not null or v_company.last_payment_reference is not null then
    raise exception 'initial_purchase_not_eligible';
  end if;
  select * into v_settings from public.platform_billing_settings where singleton;
  if not exists(select 1 from public.subscription_tiers where id=p_tier_id) then
    raise exception 'initial_purchase_tier_not_found';
  end if;
  if p_testing_access_months is null or p_testing_access_months not between 1 and 3 then
    raise exception 'initial_purchase_duration_invalid';
  end if;
  if p_paid_at is null then raise exception 'initial_purchase_paid_at_required'; end if;
  if nullif(trim(coalesce(p_reference,'')),'') is null
     or p_unit_price is null or p_amount is null
     or p_unit_price<=0 or p_amount<>p_unit_price then
    raise exception 'initial_purchase_amount_mismatch';
  end if;
  select * into v_attempt from public.initial_subscription_payment_attempts
  where payment_reference=p_reference;
  if v_attempt.id is null then
    raise exception 'initial_purchase_attempt_not_found';
  end if;
  if (
    v_attempt.company_id is distinct from p_company_id
    or v_attempt.tier_id is distinct from p_tier_id
    or v_attempt.amount is distinct from p_amount
    or v_attempt.testing_access_months is distinct from p_testing_access_months
  ) then raise exception 'initial_purchase_attempt_conflict'; end if;
  insert into public.initial_subscription_purchases(
    company_id,tier_id,testing_access_months,amount,payment_reference,purchased_at
  ) values(p_company_id,p_tier_id,p_testing_access_months,p_amount,p_reference,p_paid_at);
  update public.companies set subscription_tier_id=p_tier_id,subscription_status='active',
    subscription_started_at=p_paid_at,
    subscription_expires_at=p_paid_at+make_interval(months=>p_testing_access_months),
    subscription_grace_period_end=null,billing_cycle='monthly',last_payment_date=p_paid_at,
    last_payment_amount=p_amount,last_payment_reference=p_reference,updated_at=v_now
  where id=p_company_id;
  update public.initial_subscription_payment_attempts
  set status='succeeded',failure_reason=null,updated_at=v_now
  where payment_reference=p_reference;
  update public.initial_subscription_payment_attempts
  set status='failed',failure_reason='superseded_by_completed_purchase',updated_at=v_now
  where company_id=p_company_id and payment_reference<>p_reference and status='pending';
  if v_settings.sales_commissions_enabled then
    insert into public.platform_sales_commissions(
      salesperson_id,company_id,payment_reference,collected_amount,rate_bps,commission_amount
    )
    select a.salesperson_id,p_company_id,p_reference,p_amount,v_settings.sales_commission_rate_bps,
      round(p_amount::numeric*v_settings.sales_commission_rate_bps/10000)::bigint
    from public.company_sales_attributions a where a.company_id=p_company_id
    on conflict(company_id) do nothing;
  end if;
  return p_company_id;
end;
$$;
revoke execute on function public.activate_initial_subscription_purchase(uuid,uuid,text,bigint,bigint,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.activate_initial_subscription_purchase(uuid,uuid,text,bigint,bigint,integer,timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Platform salesperson administration.
-- ---------------------------------------------------------------------------
create function public.platform_create_salesperson(p_name text,p_phone text,p_invitation_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_code text:=upper(trim(coalesce(p_invitation_code,'')));
begin
  perform public.assert_platform_admin();
  if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'invalid_salesperson_name'; end if;
  if v_code !~ '^[A-Z0-9_-]{4,24}$' then raise exception 'invalid_sales_invitation_code'; end if;
  insert into public.platform_salespeople(name,phone,invitation_code,created_by)
  values(trim(p_name),nullif(trim(coalesce(p_phone,'')),''),v_code,auth.uid()) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'sales_invitation_code_exists';
end;
$$;

create function public.platform_set_salesperson_active(p_salesperson_id uuid,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.assert_platform_admin();
  update public.platform_salespeople set active=coalesce(p_active,false),updated_at=now()
  where id=p_salesperson_id returning id into v_id;
  if v_id is null then raise exception 'salesperson_not_found'; end if;
  return v_id;
end;
$$;

create function public.platform_update_sales_commission_settings(p_enabled boolean,p_rate_bps integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  if p_rate_bps not between 1 and 10000 then raise exception 'invalid_sales_commission_rate'; end if;
  update public.platform_billing_settings set sales_commissions_enabled=coalesce(p_enabled,false),
    sales_commission_rate_bps=p_rate_bps,updated_at=now() where singleton;
  return jsonb_build_object('enabled',coalesce(p_enabled,false),'rate_bps',p_rate_bps);
end;
$$;

create function public.platform_sales_snapshot(
  p_commission_limit integer default 100,
  p_commission_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  if p_commission_limit not between 1 and 200 or p_commission_offset < 0 then
    raise exception 'invalid_sales_snapshot_page';
  end if;

  with attribution_metrics as (
    select a.salesperson_id,
      count(*) as registrations,
      count(*) filter (where co.status='approved') as approvals,
      count(i.company_id) as first_payments,
      coalesce(sum(i.amount),0) as first_payment_revenue
    from public.company_sales_attributions a
    join public.companies co on co.id=a.company_id
    left join public.initial_subscription_purchases i on i.company_id=a.company_id
    group by a.salesperson_id
  ), commission_metrics as (
    select c.salesperson_id,
      coalesce(sum(c.commission_amount) filter (where c.status in('pending','approved')),0)
        as pending_commission,
      coalesce(sum(c.commission_amount) filter (where c.status='paid'),0) as paid_commission
    from public.platform_sales_commissions c
    group by c.salesperson_id
  ), salesperson_rows as (
    select p.id,p.name,p.phone,p.invitation_code,p.active,p.created_at,
      coalesce(a.registrations,0) registrations,
      coalesce(a.approvals,0) approvals,
      coalesce(a.first_payments,0) first_payments,
      coalesce(a.first_payment_revenue,0) first_payment_revenue,
      coalesce(c.pending_commission,0) pending_commission,
      coalesce(c.paid_commission,0) paid_commission
    from public.platform_salespeople p
    left join attribution_metrics a on a.salesperson_id=p.id
    left join commission_metrics c on c.salesperson_id=p.id
  ), totals as (
    select coalesce(sum(registrations),0) registrations,
      coalesce(sum(approvals),0) approvals,
      coalesce(sum(first_payments),0) first_payments,
      coalesce(sum(first_payment_revenue),0) first_payment_revenue,
      coalesce(sum(pending_commission),0) pending_commission,
      coalesce(sum(paid_commission),0) paid_commission
    from salesperson_rows
  ), commission_page as (
    select c.id,c.salesperson_id,p.name salesperson_name,c.company_id,co.name company_name,
      c.payment_reference,c.collected_amount,c.rate_bps,c.commission_amount,c.status,
      c.payout_reference,c.reversal_reason,c.created_at,c.approved_at,c.paid_at,c.reversed_at
    from public.platform_sales_commissions c
    join public.platform_salespeople p on p.id=c.salesperson_id
    join public.companies co on co.id=c.company_id
    order by c.created_at desc,c.id desc
    limit p_commission_limit offset p_commission_offset
  )
  select jsonb_build_object(
    'settings',jsonb_build_object(
      'enabled',s.sales_commissions_enabled,'rate_bps',s.sales_commission_rate_bps
    ),
    'totals',(select to_jsonb(t) from totals t),
    'salespeople',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'invitation_code',p.invitation_code,
      'active',p.active,'created_at',p.created_at,
      'registrations',p.registrations,'approvals',p.approvals,
      'first_payments',p.first_payments,'first_payment_revenue',p.first_payment_revenue,
      'pending_commission',p.pending_commission,'paid_commission',p.paid_commission
    ) order by p.created_at desc) from salesperson_rows p),'[]'::jsonb),
    'commission_total',(select count(*) from public.platform_sales_commissions),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'salesperson_id',c.salesperson_id,'salesperson_name',c.salesperson_name,
      'company_id',c.company_id,'company_name',c.company_name,'payment_reference',c.payment_reference,
      'collected_amount',c.collected_amount,'rate_bps',c.rate_bps,
      'commission_amount',c.commission_amount,'status',c.status,
      'payout_reference',c.payout_reference,'reversal_reason',c.reversal_reason,
      'created_at',c.created_at,'approved_at',c.approved_at,'paid_at',c.paid_at,'reversed_at',c.reversed_at
    ) order by c.created_at desc,c.id desc) from commission_page c),'[]'::jsonb)
  ) into v_result from public.platform_billing_settings s where s.singleton;
  return v_result;
end;
$$;

create function public.platform_review_sales_commission(
  p_commission_id uuid,p_status text,p_payout_reference text default null,p_reason text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_row public.platform_sales_commissions%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_row from public.platform_sales_commissions where id=p_commission_id for update;
  if v_row.id is null then raise exception 'sales_commission_not_found'; end if;
  if p_status='approved' and v_row.status='pending' then
    update public.platform_sales_commissions set status='approved',approved_by=auth.uid(),
      approved_at=now(),updated_at=now() where id=p_commission_id;
  elsif p_status='paid' and v_row.status='approved' then
    if nullif(trim(coalesce(p_payout_reference,'')),'') is null then
      raise exception 'payout_reference_required';
    end if;
    update public.platform_sales_commissions set status='paid',paid_by=auth.uid(),paid_at=now(),
      payout_reference=trim(p_payout_reference),updated_at=now() where id=p_commission_id;
  elsif p_status='reversed' and v_row.status in('pending','approved') then
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reversal_reason_required'; end if;
    update public.platform_sales_commissions set status='reversed',reversed_by=auth.uid(),
      reversed_at=now(),reversal_reason=trim(p_reason),updated_at=now() where id=p_commission_id;
  else
    raise exception 'invalid_sales_commission_transition: % to %',v_row.status,p_status;
  end if;
  return p_commission_id;
end;
$$;

revoke execute on function public.platform_create_salesperson(text,text,text) from public,anon;
revoke execute on function public.platform_set_salesperson_active(uuid,boolean) from public,anon;
revoke execute on function public.platform_update_sales_commission_settings(boolean,integer) from public,anon;
revoke execute on function public.platform_sales_snapshot(integer,integer) from public,anon;
revoke execute on function public.platform_review_sales_commission(uuid,text,text,text) from public,anon;
grant execute on function public.platform_create_salesperson(text,text,text) to authenticated,service_role;
grant execute on function public.platform_set_salesperson_active(uuid,boolean) to authenticated,service_role;
grant execute on function public.platform_update_sales_commission_settings(boolean,integer) to authenticated,service_role;
grant execute on function public.platform_sales_snapshot(integer,integer) to authenticated,service_role;
grant execute on function public.platform_review_sales_commission(uuid,text,text,text) to authenticated,service_role;

-- Remove old callable contracts before dropping their backing columns/tables.
drop function if exists public.activate_intro_offer(uuid,uuid,text,bigint,bigint,integer,integer);
drop function if exists public.platform_update_billing_policy(integer,uuid,boolean,uuid,integer,integer);
drop function if exists public.platform_update_billing_config(integer,uuid);
drop table public.subscription_intro_offer_redemptions;

alter table public.platform_billing_settings
  drop column intro_offer_enabled,
  drop column intro_offer_tier_id,
  drop column intro_offer_paid_months,
  drop column intro_offer_bonus_months,
  drop column trial_duration_days,
  drop column default_trial_tier_id;

alter table public.companies drop constraint if exists companies_trial_dates_consistent;
alter table public.companies
  drop column trial_started_at,
  drop column trial_ends_at;

-- Current platform statistics no longer expose a trial state.
create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_month_start timestamptz:=date_trunc('month',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'companies_total',(select count(*) from public.companies),
    'companies_approved',(select count(*) from public.companies where status='approved'),
    'companies_pending',(select count(*) from public.companies where status='unapproved'),
    'subscriptions_active',(select count(*) from public.companies
      where status='approved' and subscription_status='active'
        and (subscription_exempt_until>now() or subscription_expires_at>now())),
    'subscriptions_expired',(select count(*) from public.companies where subscription_status='expired'),
    'users_total',(select count(*) from auth.users),
    'monthly_active_users',(select count(*) from auth.users where last_sign_in_at>=v_month_start),
    'orders_today',(select count(*) from public.orders where (created_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date and status='completed'),
    'revenue_today',(select coalesce(sum(total),0) from public.orders where (created_at at time zone 'Africa/Nairobi')::date=(now() at time zone 'Africa/Nairobi')::date and status='completed'),
    'mrr_estimate',(select coalesce(sum(case when c.billing_cycle='yearly' then t.price_yearly/12 else t.price_monthly end),0)
      from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
      where c.status='approved' and c.subscription_status='active'
        and c.subscription_expires_at>now() and c.last_payment_reference is not null),
    'pos_devices_total',(select count(*) from public.pos_devices where retired_at is null),
    'pos_devices_recent_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '30 days'),
    'pos_devices_active_24h',(select count(*) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '24 hours'),
    'pos_devices_stale_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at<now()-interval '24 hours' and last_seen_at>=now()-interval '30 days'),
    'pos_devices_dormant_30d',(select count(*) from public.pos_devices where retired_at is null and last_seen_at<now()-interval '30 days'),
    'pos_devices_with_last_reported_pending',(select count(*) from public.pos_devices where retired_at is null and pending_count>0),
    'offline_sales_last_reported_pending',(select coalesce(sum(pending_count),0) from public.pos_devices where retired_at is null),
    'companies_with_active_pos_30d',(select count(distinct company_id) from public.pos_devices where retired_at is null and last_seen_at>=now()-interval '30 days')
  );
end;
$$;
