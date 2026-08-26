-- Fulfillment is an operational capability layered over sales. Its tables are
-- RPC-only: callers receive projections, never broad access to recipient data.

alter table public.subscription_tiers
  add column fulfillment_available boolean not null default false;

update public.subscription_tiers
set fulfillment_available = true, updated_at = now()
where code = 'standard';

create or replace function public.feature_enabled(p_company_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_feature
    when 'multipleLocations' then t.multiple_locations_enabled
    when 'staffPerformance' then t.staff_performance_enabled
    when 'commissions' then t.commissions_available
    when 'storefront' then t.storefront_available
    when 'paymentReminders' then t.payment_reminders_available
    when 'fulfillment' then t.fulfillment_available
    else false
  end
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id
$$;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', jsonb_build_object(
      'multipleLocations', coalesce(t.multiple_locations_enabled, false),
      'staffPerformance', coalesce(t.staff_performance_enabled, false),
      'commissions', coalesce(t.commissions_available, false),
      'storefront', coalesce(t.storefront_available, false),
      'paymentReminders', coalesce(t.payment_reminders_available, false),
      'fulfillment', coalesce(t.fulfillment_available, false)
    ),
    'settings', jsonb_build_object(
      'commissionsEnabled', c.commissions_enabled,
      'paymentRemindersEnabled', c.payment_reminders_enabled,
      'paymentReminderChannel', c.payment_reminder_channel,
      'paymentReminderSmsFallback', c.payment_reminder_sms_fallback
    ),
    'limits', jsonb_strip_nulls(jsonb_build_object(
      'maxTeamMembers', t.max_team_members,
      'maxProducts', coalesce(t.max_products, 10000),
      'maxStockLocations', t.max_stock_locations,
      'maxOrdersPerMonth', t.max_orders_per_month,
      'smsPerPeriod', t.sms_per_period,
      'whatsappPerPeriod', t.whatsapp_per_period
    )),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l
        where l.company_id = c.id and l.is_active),
      'products', coalesce(u.active_variants, 0),
      'ordersThisMonth', (select count(*) from public.orders o
        where o.company_id = c.id and o.created_at >= date_trunc('month', now())
          and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m
        where m.company_id = c.id and m.authorization_status = 'approved'),
      'sms', jsonb_build_object(
        'used', c.sms_used_this_period,
        'reserved', c.sms_reserved_this_period,
        'remaining', case when t.sms_per_period is null then null else greatest(
          t.sms_per_period - c.sms_used_this_period - c.sms_reserved_this_period, 0) end
      ),
      'whatsapp', jsonb_build_object(
        'used', c.whatsapp_used_this_period,
        'reserved', c.whatsapp_reserved_this_period,
        'remaining', case when t.whatsapp_per_period is null then null else greatest(
          t.whatsapp_per_period - c.whatsapp_used_this_period - c.whatsapp_reserved_this_period, 0) end
      ),
      'periodEnd', c.communication_period_end
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  left join public.company_usage_counters u on u.company_id = c.id
  where c.id = v_company;
  return v_result;
end;
$$;

alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
  'ManageCustomerCreditLimit','ManageCustomers','ManageCatalog','ManageCommunications',
  'ManageMpesaIntegration','ManageCompanySettings','ReverseOrder','OverrideCustomerBalance',
  'SettleOrder','ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
  'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
  'ViewStaffPerformance','ManageCommissions','ProcessFulfillments','CompleteFulfillments',
  'ManageFulfillments'
]::text[]);

update public.roles
set permissions = permissions || array[
      'ProcessFulfillments','CompleteFulfillments','ManageFulfillments'
    ]::text[],
    updated_at = now()
where lower(name) in ('admin','manager')
  and not permissions @> array[
    'ProcessFulfillments','CompleteFulfillments','ManageFulfillments'
  ]::text[];

insert into public.roles(company_id,name,is_template,permissions)
select null,'Delivery person',true,array['CompleteFulfillments']::text[]
where not exists(
  select 1 from public.roles where is_template and name='Delivery person'
);

-- New companies and existing tenants receive the operational role, while
-- customized roles remain untouched.
create or replace function public.seed_default_company_roles(p_company_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.roles(company_id,name,permissions)
  select p_company_id,template.name,template.permissions
  from public.roles template
  where template.company_id is null and template.is_template
    and template.name in('Admin','Manager','Cashier','Stock Clerk','Delivery person')
  on conflict(company_id,name) do nothing
$$;
revoke execute on function public.seed_default_company_roles(uuid)
  from public,anon,authenticated;

select public.seed_default_company_roles(id) from public.companies;

-- Keep provisioning explicit so fulfillment does not depend on rewriting a
-- previous function's source text.
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
    'ManageCompanySettings','ReverseOrder','OverrideCustomerBalance','SettleOrder',
    'ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
    'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
    'ViewStaffPerformance','ManageCommissions','ProcessFulfillments','CompleteFulfillments',
    'ManageFulfillments'
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
    (v_company_id,'CASH_IN_CUSTODY','Cash in Custody','asset',v_cash_parent,true),
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

alter table public.orders
  add column receivable_kind text,
  add constraint orders_receivable_kind_check
    check (receivable_kind is null or receivable_kind in ('credit','cod'));

update public.orders set receivable_kind = 'credit'
where is_credit_sale and receivable_kind is null;

alter table public.customers
  add column phone_normalized text,
  add column customer_origin text not null default 'manual',
  add constraint customers_phone_normalized_check check (
    phone_normalized is null or phone_normalized ~ '^\+254[17][0-9]{8}$'
  ),
  add constraint customers_origin_check
    check (customer_origin in ('manual','checkout','import'));

create or replace function public.normalize_fulfillment_phone(p_phone text)
returns text language plpgsql immutable set search_path = '' as $$
declare v_digits text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if v_digits ~ '^0[17][0-9]{8}$' then return '+254' || substring(v_digits from 2); end if;
  if v_digits ~ '^254[17][0-9]{8}$' then return '+' || v_digits; end if;
  return null;
end;
$$;
revoke execute on function public.normalize_fulfillment_phone(text) from public,anon;
grant execute on function public.normalize_fulfillment_phone(text) to authenticated,service_role;

update public.customers
set phone_normalized = public.normalize_fulfillment_phone(phone)
where phone is not null;

create or replace function public.sync_customer_phone_normalized()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.phone_normalized:=public.normalize_fulfillment_phone(new.phone);
  return new;
end;
$$;
create trigger customers_sync_phone_normalized
before insert or update of phone on public.customers
for each row execute function public.sync_customer_phone_normalized();
revoke execute on function public.sync_customer_phone_normalized() from public,anon,authenticated;

create index customers_company_phone_normalized_idx
  on public.customers(company_id, phone_normalized)
  where phone_normalized is not null and deleted_at is null;

create table public.fulfillment_settings (
  location_id uuid primary key references public.stock_locations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  cod_enabled boolean not null default false,
  default_delivery_fee_variant_id uuid references public.product_variants(id) on delete set null,
  pickup_sla_minutes integer not null default 30 check (pickup_sla_minutes between 5 and 10080),
  delivery_sla_minutes integer not null default 60 check (delivery_sla_minutes between 5 and 10080),
  notification_channel text not null default 'whatsapp'
    check (notification_channel in ('sms','whatsapp')),
  sms_fallback boolean not null default true,
  notify_initial boolean not null default true,
  notify_ready boolean not null default true,
  notify_in_transit boolean not null default true,
  notify_failed boolean not null default true,
  notify_fulfilled boolean not null default false,
  tracking_token_ttl_days integer not null default 14
    check (tracking_token_ttl_days between 1 and 90),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, location_id)
);

create table public.order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id),
  order_id uuid not null references public.orders(id) on delete restrict,
  fulfillment_type text not null check (fulfillment_type in ('pickup','delivery')),
  status text not null default 'pending' check (status in (
    'pending','processing','ready','in_transit','fulfilled','failed','cancelled'
  )),
  -- Fulfillment owns only handoff collection. Sale payment and customer credit
  -- remain canonical on orders, payments, and the ledger.
  collection_kind text not null default 'none' check (collection_kind in ('none','cod')),
  customer_id uuid references public.customers(id) on delete set null,
  recipient_name text not null,
  phone_normalized text,
  address_line text,
  landmark text,
  map_link text,
  preparation_notes text,
  handoff_notes text,
  promised_at timestamptz,
  assigned_membership_id uuid references public.company_memberships(id) on delete set null,
  claimed_at timestamptz,
  transactional_message_consent boolean not null default false,
  state_version bigint not null default 1 check (state_version > 0),
  tracking_token_hash text not null unique check (tracking_token_hash ~ '^[0-9a-f]{64}$'),
  tracking_expires_at timestamptz not null,
  pin_hash text not null,
  pin_failed_attempts integer not null default 0 check (pin_failed_attempts between 0 and 20),
  pin_locked_until timestamptz,
  pin_generated_at timestamptz not null default now(),
  request_fingerprint text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  unique(company_id, order_id),
  check (phone_normalized is null or phone_normalized ~ '^\+254[17][0-9]{8}$'),
  check (fulfillment_type = 'pickup' or (
    phone_normalized is not null and nullif(btrim(address_line),'') is not null
  )),
  check (collection_kind <> 'cod' or fulfillment_type = 'delivery')
);

create index order_fulfillments_board_idx
  on public.order_fulfillments(company_id, location_id, status, updated_at desc, id desc);
create index order_fulfillments_assignment_idx
  on public.order_fulfillments(company_id, assigned_membership_id, status, updated_at desc)
  where assigned_membership_id is not null;

create table public.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fulfillment_id uuid not null references public.order_fulfillments(id) on delete cascade,
  actor_user_id uuid,
  actor_membership_id uuid references public.company_memberships(id) on delete set null,
  from_status text,
  to_status text,
  event_kind text not null,
  note text,
  source_kind text not null default 'staff'
    check (source_kind in ('staff','system','provider')),
  source_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index fulfillment_events_timeline_idx
  on public.fulfillment_events(fulfillment_id, created_at, id);
create unique index fulfillment_events_provider_dedupe_idx
  on public.fulfillment_events(company_id, source_kind, source_reference)
  where source_kind = 'provider' and source_reference is not null;

create or replace function public.order_open_balance_core(p_order_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(
    coalesce(o.total,0)-coalesce((select sum(p.amount)::bigint from public.payments p
      where p.order_id=o.id and p.company_id=o.company_id and p.status='settled'),0),0
  )::bigint
  from public.orders o
  where o.id=p_order_id
$$;
revoke execute on function public.order_open_balance_core(uuid)
  from public,anon,authenticated;
grant execute on function public.order_open_balance_core(uuid) to service_role;

create table public.cash_custody_remittances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id),
  custodian_membership_id uuid not null references public.company_memberships(id),
  expected_amount bigint not null check (expected_amount > 0),
  received_amount bigint check (received_amount is null or received_amount >= 0),
  status text not null default 'submitted'
    check (status in ('submitted','accepted','rejected','shortage_resolved')),
  accepting_cashier_session_id uuid references public.cashier_sessions(id),
  submitted_by uuid not null,
  accepted_by uuid,
  submitted_at timestamptz not null default now(),
  accepted_at timestamptz,
  rejected_at timestamptz,
  variance_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cash_custody_remittances_location_idx
  on public.cash_custody_remittances(company_id, location_id, status, created_at desc);

alter table public.payments
  add column cash_custodian_membership_id uuid references public.company_memberships(id),
  add column cash_remittance_id uuid references public.cash_custody_remittances(id) on delete set null;
create index payments_cash_custody_holding_idx
  on public.payments(company_id, location_id, cash_custodian_membership_id, created_at)
  where cash_custodian_membership_id is not null and cash_remittance_id is null
    and status = 'settled';

alter table public.outbox
  add column fulfillment_id uuid references public.order_fulfillments(id) on delete set null,
  add column fulfillment_event_id uuid references public.fulfillment_events(id) on delete set null;
alter table public.outbox drop constraint if exists outbox_source_check;
alter table public.outbox add constraint outbox_source_check check (source in (
  'direct','campaign','reminder','platform','manual_document','manual_document_copy',
  'manual_statement','cashier_session','team','fulfillment'
));
create unique index outbox_fulfillment_event_channel_uidx
  on public.outbox(fulfillment_event_id, channel)
  where fulfillment_event_id is not null;

alter table public.message_templates drop constraint if exists message_templates_context_check;
alter table public.message_templates add constraint message_templates_context_check
  check (context in ('platform','customer','reminder','team','fulfillment'));

insert into public.message_templates(
  company_id,template_key,name,context,sms_body,whatsapp_body,is_system
)
select null, template_key, name, 'fulfillment', sms_body, whatsapp_body, true
from (values
  ('fulfillment-initial','Order received',
   '{{company_name}} order {{order_code}} is being prepared. Track: {{tracking_url}} PIN: {{pin}}',
   E'*{{company_name}} order {{order_code}}*\n\nWe are preparing it. Track: {{tracking_url}}\nPIN: *{{pin}}*'),
  ('fulfillment-ready','Order ready',
   '{{company_name}} order {{order_code}} is ready.',
   E'*{{company_name}} order {{order_code}}* is ready.'),
  ('fulfillment-in-transit','Order in transit',
   '{{company_name}} order {{order_code}} is on the way.',
   E'*{{company_name}} order {{order_code}}* is on the way.'),
  ('fulfillment-failed','Delivery needs attention',
   '{{company_name}} could not complete order {{order_code}}. We will contact you.',
   E'We could not complete *{{company_name}} order {{order_code}}*. We will contact you.'),
  ('fulfillment-fulfilled','Order complete',
   '{{company_name}} order {{order_code}} is complete. Thank you.',
   E'*{{company_name}} order {{order_code}}* is complete. Thank you.')
) as seed(template_key,name,sms_body,whatsapp_body)
where not exists (
  select 1 from public.message_templates existing
  where existing.company_id is null and existing.template_key = seed.template_key
);

-- No client receives table access. Security-definer RPCs below are the only API.
alter table public.fulfillment_settings enable row level security;
alter table public.order_fulfillments enable row level security;
alter table public.fulfillment_events enable row level security;
alter table public.cash_custody_remittances enable row level security;
revoke all on public.fulfillment_settings from public, anon, authenticated;
revoke all on public.order_fulfillments from public, anon, authenticated;
revoke all on public.fulfillment_events from public, anon, authenticated;
revoke all on public.cash_custody_remittances from public, anon, authenticated;
grant all on public.fulfillment_settings to service_role;
grant all on public.order_fulfillments to service_role;
grant all on public.fulfillment_events to service_role;
grant all on public.cash_custody_remittances to service_role;

create or replace function public.reject_fulfillment_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'fulfillment_events_are_append_only';
end;
$$;
create trigger fulfillment_events_append_only
  before update or delete on public.fulfillment_events
  for each row execute function public.reject_fulfillment_event_mutation();
revoke execute on function public.reject_fulfillment_event_mutation()
  from public, anon, authenticated;

insert into public.ledger_accounts(
  company_id,code,name,type,parent_id,is_system,is_active,allow_manual_posting
)
select c.id,'CASH_IN_CUSTODY','Cash in Custody','asset',cash_parent.id,true,true,false
from public.companies c
left join public.ledger_accounts cash_parent
  on cash_parent.company_id = c.id and cash_parent.code = 'CASH'
on conflict(company_id,code) do nothing;

comment on table public.order_fulfillments is
  'One operational fulfillment per order. Recipient fields are immutable checkout snapshots.';
comment on table public.fulfillment_events is
  'Append-only operational history for staff, system, and future provider events.';
