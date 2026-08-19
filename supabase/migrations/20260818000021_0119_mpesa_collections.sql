-- Direct merchant M-PESA integration.
-- Payment intents request money; payment_collections record money that exists;
-- payment_collection_allocations are the only bridge into accounting.

-- ---------------------------------------------------------------------------
-- Permission and explicit service execution context
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
  'ManageCustomerCreditLimit','ManageCustomers','ManageCatalog','ManageCommunications',
  'ManageMpesaIntegration','ReverseOrder','OverrideCustomerBalance','SettleOrder',
  'ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
  'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
  'ViewStaffPerformance','ManageCommissions'
]::text[]);

update public.roles
set permissions=array_append(permissions,'ManageMpesaIntegration'),updated_at=now()
where lower(name)='admin' and not ('ManageMpesaIntegration'=any(permissions));

create or replace function public.apply_mpesa_admin_permission_default()
returns trigger language plpgsql set search_path='' as $$
begin
  if lower(new.name)='admin' and not ('ManageMpesaIntegration'=any(new.permissions)) then
    new.permissions:=array_append(new.permissions,'ManageMpesaIntegration');
  end if;
  return new;
end $$;
create trigger roles_apply_mpesa_admin_permission_default
  before insert on public.roles for each row execute function public.apply_mpesa_admin_permission_default();
revoke execute on function public.apply_mpesa_admin_permission_default()
  from public,anon,authenticated;

-- Trusted internal finalizers receive the posting_context created by the VAT
-- foundation. Provider processors reconstruct it from locked domain records.

-- ---------------------------------------------------------------------------
-- Provider-neutral collection core and M-PESA configuration
-- ---------------------------------------------------------------------------
create table public.mpesa_platform_settings(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  manual_fallback_allowed boolean not null default true,
  pilot_company_id uuid references public.companies(id) on delete set null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.mpesa_platform_settings(singleton) values(true);

create table public.mpesa_onboarding_requests(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legal_name text not null,
  shortcode text not null,
  shortcode_type text not null check(shortcode_type in('till','paybill')),
  mpesa_username text not null,
  contact_name text not null,
  contact_phone text not null,
  contact_email text not null,
  requested_location_ids uuid[] not null default '{}',
  status text not null default 'requested' check(status in(
    'requested','reviewing','merchant_verification','daraja_setup','testing','live','rejected','cancelled')),
  merchant_notes text,
  operator_notes text,
  requested_by uuid not null,
  handled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mpesa_onboarding_company_idx
  on public.mpesa_onboarding_requests(company_id,created_at desc);
create unique index mpesa_onboarding_open_shortcode_unique
  on public.mpesa_onboarding_requests(company_id,shortcode)
  where status not in('live','rejected','cancelled');

create table public.mpesa_daraja_apps(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  app_name text not null,
  environment text not null check(environment in('sandbox','production')),
  consumer_key_secret_id uuid not null,
  consumer_secret_secret_id uuid not null,
  oauth_verified_at timestamptz,
  status text not null default 'configuring' check(status in('configuring','verified','disabled','error')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,environment,app_name)
);

create table public.payment_provider_accounts(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check(provider in('mpesa')),
  environment text not null check(environment in('sandbox','production')),
  display_name text not null,
  method_code text not null default 'mpesa',
  status text not null default 'configuring' check(status in('configuring','testing','active','disabled','error')),
  manual_fallback_until timestamptz,
  activated_at timestamptz,
  disabled_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_provider_accounts_company_idx
  on public.payment_provider_accounts(company_id,provider,status);

create table public.mpesa_connections(
  provider_account_id uuid primary key references public.payment_provider_accounts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  onboarding_request_id uuid references public.mpesa_onboarding_requests(id) on delete set null,
  daraja_app_id uuid not null references public.mpesa_daraja_apps(id),
  shortcode_type text not null check(shortcode_type in('till','paybill')),
  organization_shortcode text not null,
  business_shortcode text not null,
  party_b text not null,
  passkey_secret_id uuid not null,
  c2b_registered_at timestamptz,
  c2b_callback_seen_at timestamptz,
  stk_test_collection_id uuid,
  c2b_test_collection_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,organization_shortcode,party_b)
);
create unique index mpesa_connection_onboarding_request_unique
  on public.mpesa_connections(onboarding_request_id) where onboarding_request_id is not null;

create table public.location_payment_provider_accounts(
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check(provider in('mpesa')),
  provider_account_id uuid not null references public.payment_provider_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(location_id,provider),
  unique(company_id,provider,location_id)
);
create index location_provider_account_idx
  on public.location_payment_provider_accounts(provider_account_id);

create table public.payment_collections(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id),
  provider text not null check(provider in('mpesa')),
  environment text not null check(environment in('sandbox','production')),
  provider_receipt text not null,
  amount bigint not null check(amount>0),
  currency text not null default 'KES' check(currency='KES'),
  occurred_at timestamptz not null,
  payer_phone text,
  payer_name text,
  account_reference text,
  source text not null check(source in('stk','c2b','manual')),
  verification_status text not null check(verification_status in(
    'declared','provider_notified','provider_verified','disputed')),
  provider_status text not null default 'received' check(provider_status in(
    'received','reversal_pending','reversed')),
  allocation_status text not null default 'unallocated' check(allocation_status in(
    'unallocated','reserved','allocated','reversed')),
  classification text check(classification in('test','surplus','non_business','refunded')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,environment,provider_receipt)
);
create index payment_collections_company_queue_idx
  on public.payment_collections(company_id,allocation_status,created_at desc);

create table public.payment_collection_allocations(
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.payment_collections(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount bigint not null check(amount>0),
  order_id uuid references public.orders(id) on delete set null,
  customer_receipt_id uuid references public.customer_receipts(id) on delete set null,
  status text not null default 'reserved' check(status in('reserved','posted','released','reversed')),
  allocated_by uuid,
  posted_at timestamptz,
  released_at timestamptz,
  reversed_at timestamptz,
  cashier_session_id uuid references public.cashier_sessions(id),
  posting_date date,
  posted_after_session_close boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((order_id is not null)::int+(customer_receipt_id is not null)::int=1)
);
create unique index payment_collection_active_order_unique
  on public.payment_collection_allocations(collection_id,order_id)
  where order_id is not null and status in('reserved','posted');
create unique index payment_collection_active_receipt_unique
  on public.payment_collection_allocations(collection_id,customer_receipt_id)
  where customer_receipt_id is not null and status in('reserved','posted');

create table public.mpesa_payment_intents(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id),
  location_id uuid not null references public.stock_locations(id),
  workflow text not null check(workflow in('sale','order','customer_receipt','connection_test')),
  subject_type text not null check(subject_type in('order','customer_receipt','connection_test')),
  subject_id uuid not null,
  client_ref text not null,
  request_fingerprint text not null,
  payer_phone text,
  amount bigint not null check(amount>0),
  cash_amount bigint not null default 0 check(cash_amount>=0),
  status text not null default 'created' check(status in(
    'created','requesting','pending','funds_received','awaiting_cash','completed',
    'cancelled','expired','failed','manual_review')),
  state_version bigint not null default 1,
  current_attempt_id uuid,
  initiating_cashier_session_id uuid references public.cashier_sessions(id),
  fulfilled_collection_id uuid references public.payment_collections(id),
  result_code text,
  result_description text,
  review_reason text,
  created_by uuid not null,
  created_by_role text,
  completed_at timestamptz,
  expires_at timestamptz not null default now()+interval '15 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,client_ref)
);
create index mpesa_intents_company_status_idx
  on public.mpesa_payment_intents(company_id,status,created_at desc);
create unique index mpesa_intent_one_unresolved_subject
  on public.mpesa_payment_intents(company_id,provider_account_id,subject_type,subject_id)
  where status not in('completed','cancelled','expired','failed');

create table public.mpesa_payment_attempts(
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.mpesa_payment_intents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  attempt_number integer not null check(attempt_number>0),
  status text not null default 'requesting' check(status in(
    'requesting','prompt_sent','query_pending','request_unknown','paid','cancelled','expired','failed','manual_review')),
  merchant_request_id text,
  checkout_request_id text,
  response_code text,
  response_description text,
  customer_message text,
  result_code text,
  result_description text,
  query_attempts integer not null default 0,
  next_query_at timestamptz,
  query_lease_until timestamptz,
  last_queried_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(intent_id,attempt_number)
);
create unique index mpesa_attempt_checkout_unique
  on public.mpesa_payment_attempts(checkout_request_id) where checkout_request_id is not null;
alter table public.mpesa_payment_intents add constraint mpesa_intent_current_attempt_fk
  foreign key(current_attempt_id) references public.mpesa_payment_attempts(id);

create table public.mpesa_callback_tokens(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id) on delete cascade,
  attempt_id uuid references public.mpesa_payment_attempts(id) on delete cascade,
  kind text not null check(kind in('stk','c2b')),
  token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
  status text not null default 'pending' check(status in('pending','active','retiring','consumed','retired')),
  activated_at timestamptz,
  retire_after timestamptz,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  check((kind='stk' and attempt_id is not null) or (kind='c2b' and attempt_id is null))
);
create unique index mpesa_one_pending_c2b_token
  on public.mpesa_callback_tokens(provider_account_id)
  where kind='c2b' and status='pending';

create table public.mpesa_provider_events(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_account_id uuid not null references public.payment_provider_accounts(id),
  callback_token_id uuid not null references public.mpesa_callback_tokens(id),
  attempt_id uuid references public.mpesa_payment_attempts(id),
  collection_id uuid references public.payment_collections(id),
  event_type text not null check(event_type in('stk_callback','c2b_validation','c2b_confirmation')),
  provider_event_key text not null,
  payload jsonb,
  payload_sha256 text not null,
  status text not null default 'queued' check(status in(
    'queued','processing','retry','processed','manual_review','dismissed')),
  processing_attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  result_code text,
  error text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_purged_at timestamptz,
  unique(provider_account_id,event_type,provider_event_key)
);
create index mpesa_provider_events_work_idx
  on public.mpesa_provider_events(status,next_attempt_at,received_at)
  where status in('queued','retry','processing');

alter table public.payment_collections add column mpesa_intent_id uuid
  references public.mpesa_payment_intents(id) on delete set null;
alter table public.mpesa_connections add constraint mpesa_stk_test_collection_fk
  foreign key(stk_test_collection_id) references public.payment_collections(id);
alter table public.mpesa_connections add constraint mpesa_c2b_test_collection_fk
  foreign key(c2b_test_collection_id) references public.payment_collections(id);

create table public.payment_collection_reversals(
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.payment_collections(id),
  allocation_id uuid references public.payment_collection_allocations(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_reference text not null,
  provider_reversed_at timestamptz not null,
  reason text not null,
  status text not null default 'recorded' check(status in('recorded','accounting_pending','completed')),
  accounting_resource_id uuid,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(collection_id,provider_reference)
);

create table public.mpesa_late_posting_reviews(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  intent_id uuid references public.mpesa_payment_intents(id),
  collection_id uuid not null references public.payment_collections(id),
  allocation_id uuid not null references public.payment_collection_allocations(id),
  original_business_date date not null,
  status text not null default 'pending' check(status in('pending','approved','rejected')),
  reason text not null default 'provider_payment_for_locked_period',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  unique(collection_id,allocation_id)
);

-- Extend the VAT correction schedule without making VAT reporting depend on
-- M-PESA tables before this provider module exists.
create or replace function public.vat_late_transaction_schedule(
  p_company_id uuid,p_start_date date,p_end_date date,p_timezone text
)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at,x.id),'[]'::jsonb)
  from (
    select l.id,'offline'::text source,l.occurred_at,
      (l.occurred_at at time zone p_timezone)::date original_business_date,
      o.accounting_posting_date posting_date,l.reviewed_at,l.posted_order_id,
      null::uuid customer_receipt_id,l.status,o.gross_total,o.net_total,o.tax_total,
      l.status='approved' prior_period_correction
    from public.late_sale_reviews l
    left join public.orders o on o.id=l.posted_order_id and o.company_id=l.company_id
    where l.company_id=p_company_id and (
      (l.status='approved' and coalesce(o.accounting_posting_date,
        (l.reviewed_at at time zone p_timezone)::date) between p_start_date and p_end_date)
      or (l.status='pending' and (l.occurred_at at time zone p_timezone)::date
        between p_start_date and p_end_date)
    )
    union all
    select r.id,'mpesa'::text source,c.occurred_at,r.original_business_date,
      a.posting_date,r.reviewed_at,a.order_id posted_order_id,a.customer_receipt_id,
      r.status,coalesce(o.gross_total,cr.amount,c.amount) gross_total,
      coalesce(o.net_total,cr.amount,c.amount) net_total,coalesce(o.tax_total,0) tax_total,
      r.status='approved' prior_period_correction
    from public.mpesa_late_posting_reviews r
    join public.payment_collections c on c.id=r.collection_id
    left join public.payment_collection_allocations a on a.id=r.allocation_id
    left join public.orders o on o.id=a.order_id and o.company_id=r.company_id
    left join public.customer_receipts cr on cr.id=a.customer_receipt_id
      and cr.company_id=r.company_id
    where r.company_id=p_company_id and (
      (r.status='approved' and coalesce(a.posting_date,
        (r.reviewed_at at time zone p_timezone)::date) between p_start_date and p_end_date)
      or (r.status='pending' and r.original_business_date between p_start_date and p_end_date)
    )
  ) x
$$;

alter table public.payments add column collection_allocation_id uuid
  references public.payment_collection_allocations(id);
create unique index payments_collection_allocation_unique
  on public.payments(collection_allocation_id) where collection_allocation_id is not null;
alter table public.customer_receipts add column collection_allocation_id uuid
  references public.payment_collection_allocations(id);
create unique index customer_receipts_collection_allocation_unique
  on public.customer_receipts(collection_allocation_id) where collection_allocation_id is not null;

-- complete_order_core already carries collection_allocation_id explicitly.

-- ---------------------------------------------------------------------------
-- RLS, grants and accounting evidence guards
-- ---------------------------------------------------------------------------
alter table public.mpesa_platform_settings enable row level security;
alter table public.mpesa_onboarding_requests enable row level security;
alter table public.mpesa_daraja_apps enable row level security;
alter table public.payment_provider_accounts enable row level security;
alter table public.mpesa_connections enable row level security;
alter table public.location_payment_provider_accounts enable row level security;
alter table public.payment_collections enable row level security;
alter table public.payment_collection_allocations enable row level security;
alter table public.mpesa_payment_intents enable row level security;
alter table public.mpesa_payment_attempts enable row level security;
alter table public.mpesa_callback_tokens enable row level security;
alter table public.mpesa_provider_events enable row level security;
alter table public.payment_collection_reversals enable row level security;
alter table public.mpesa_late_posting_reviews enable row level security;

create policy "mpesa platform setting readable" on public.mpesa_platform_settings
  for select to authenticated using(true);
grant select on public.mpesa_platform_settings to authenticated;

grant all on public.mpesa_platform_settings,public.mpesa_onboarding_requests,
  public.mpesa_daraja_apps,public.payment_provider_accounts,public.mpesa_connections,
  public.location_payment_provider_accounts,public.payment_collections,
  public.payment_collection_allocations,public.mpesa_payment_intents,
  public.mpesa_payment_attempts,public.mpesa_callback_tokens,
  public.mpesa_provider_events,public.payment_collection_reversals to service_role;
grant all on public.mpesa_late_posting_reviews to service_role;

create trigger mpesa_onboarding_audit after insert or update or delete
  on public.mpesa_onboarding_requests for each row execute function public.audit_trigger();
create trigger mpesa_apps_audit after insert or update or delete
  on public.mpesa_daraja_apps for each row execute function public.audit_trigger();
create trigger provider_accounts_audit after insert or update or delete
  on public.payment_provider_accounts for each row execute function public.audit_trigger();
create trigger mpesa_connections_audit after insert or update or delete
  on public.mpesa_connections for each row execute function public.audit_trigger();
create trigger payment_collections_audit after insert or update or delete
  on public.payment_collections for each row execute function public.audit_trigger();
create trigger collection_allocations_audit after insert or update or delete
  on public.payment_collection_allocations for each row execute function public.audit_trigger();
create trigger mpesa_intents_audit after insert or update or delete
  on public.mpesa_payment_intents for each row execute function public.audit_trigger();
create trigger collection_reversals_audit after insert or update or delete
  on public.payment_collection_reversals for each row execute function public.audit_trigger();
create trigger mpesa_late_posting_reviews_audit after insert or update or delete
  on public.mpesa_late_posting_reviews for each row execute function public.audit_trigger();

create or replace function public.refresh_payment_collection_status(p_collection_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_received bigint;v_reserved bigint;v_posted bigint;
begin
  select c.amount,
    coalesce(sum(a.amount) filter(where a.status='reserved'),0),
    coalesce(sum(a.amount) filter(where a.status='posted'),0)
  into v_received,v_reserved,v_posted
  from public.payment_collections c left join public.payment_collection_allocations a
    on a.collection_id=c.id
  where c.id=p_collection_id group by c.amount;
  if v_received is null then raise exception 'payment_collection_not_found'; end if;
  if v_reserved+v_posted>v_received then raise exception 'collection_overallocated'; end if;
  update public.payment_collections set allocation_status=case
      when provider_status='reversed' then 'reversed'
      when v_posted=v_received then 'allocated'
      when v_reserved+v_posted>0 then 'reserved'
      else 'unallocated' end,
    updated_at=now() where id=p_collection_id;
end $$;
revoke execute on function public.refresh_payment_collection_status(uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_payment_collection_status(uuid) to service_role;

create or replace function public.enforce_collection_allocation_total()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_total bigint;v_amount bigint;
begin
  perform 1 from public.payment_collections where id=new.collection_id for update;
  select amount into v_amount from public.payment_collections where id=new.collection_id;
  select coalesce(sum(amount),0) into v_total
  from public.payment_collection_allocations
  where collection_id=new.collection_id and status in('reserved','posted')
    and id<>coalesce(new.id,gen_random_uuid());
  if new.status in('reserved','posted') then v_total:=v_total+new.amount; end if;
  if v_total>v_amount then raise exception 'collection_overallocated'; end if;
  return new;
end $$;
create trigger collection_allocation_total_guard before insert or update
  on public.payment_collection_allocations for each row
  execute function public.enforce_collection_allocation_total();
revoke execute on function public.enforce_collection_allocation_total()
  from public,anon,authenticated;

create or replace function public.mpesa_accounting_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_integrated boolean;v_valid boolean;
begin
  if new.method_code<>'mpesa' or new.status<>'settled' then return new; end if;
  select exists(select 1 from public.payment_provider_accounts a
    join public.location_payment_provider_accounts l on l.provider_account_id=a.id
    where a.company_id=new.company_id and a.provider='mpesa' and a.status='active'
      and l.location_id=new.location_id)
    into v_integrated;
  if not v_integrated then return new; end if;
  if new.customer_receipt_id is not null then
    select exists(select 1 from public.customer_receipts r
      join public.payment_collection_allocations a on a.id=r.collection_allocation_id
      join public.payment_collections c on c.id=a.collection_id
      where r.id=new.customer_receipt_id and r.company_id=new.company_id
        and a.status in('reserved','posted') and c.provider_status='received'
        and c.verification_status<>'disputed') into v_valid;
  else
    select exists(select 1 from public.payment_collection_allocations a
      join public.payment_collections c on c.id=a.collection_id
      where a.id=new.collection_allocation_id and a.company_id=new.company_id
        and a.order_id=new.order_id and a.amount=new.amount and a.status='reserved'
        and c.provider_status='received' and c.verification_status<>'disputed'
        and c.provider_receipt=coalesce(new.mpesa_receipt,new.reference)) into v_valid;
  end if;
  if not coalesce(v_valid,false) then
    raise exception 'verified_mpesa_collection_required';
  end if;
  return new;
end $$;
create trigger payments_mpesa_collection_guard before insert or update
  on public.payments for each row execute function public.mpesa_accounting_evidence_guard();
revoke execute on function public.mpesa_accounting_evidence_guard()
  from public,anon,authenticated;

create or replace function public.mpesa_customer_receipt_evidence_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.method_code='mpesa' and new.status='posted'
    and old.status is distinct from new.status
    and exists(select 1 from public.payment_provider_accounts a
      join public.location_payment_provider_accounts l on l.provider_account_id=a.id
      where a.company_id=new.company_id and a.provider='mpesa' and a.status='active'
        and l.location_id=new.location_id)
    and not exists(select 1 from public.payment_collection_allocations a
      join public.payment_collections c on c.id=a.collection_id
      where a.id=new.collection_allocation_id and a.customer_receipt_id=new.id
        and a.amount=new.amount and a.status='reserved' and c.provider_status='received'
        and c.verification_status<>'disputed'
        and c.provider_receipt=new.reference) then
    raise exception 'verified_mpesa_collection_required';
  end if;
  return new;
end $$;
create trigger customer_receipt_mpesa_collection_guard before update
  on public.customer_receipts for each row execute function public.mpesa_customer_receipt_evidence_guard();
revoke execute on function public.mpesa_customer_receipt_evidence_guard()
  from public,anon,authenticated;

create or replace function public.sync_reversed_collection_allocation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_allocation_id uuid;v_collection_id uuid;v_has_provider_reversal boolean;
begin
  if tg_table_name='payments' then
    if old.status<>'settled' or new.status<>'cancelled' then return new; end if;
    v_allocation_id:=new.collection_allocation_id;
  else
    if old.status<>'posted' or new.status<>'reversed' then return new; end if;
    v_allocation_id:=new.collection_allocation_id;
  end if;
  if v_allocation_id is null then return new; end if;
  select exists(select 1 from public.payment_collection_reversals
    where allocation_id=v_allocation_id) into v_has_provider_reversal;
  update public.payment_collection_allocations set
    status=case when v_has_provider_reversal then 'reversed' else 'released' end,
    reversed_at=case when v_has_provider_reversal then now() else reversed_at end,
    released_at=case when not v_has_provider_reversal then now() else released_at end,updated_at=now()
    where id=v_allocation_id returning collection_id into v_collection_id;
  if v_has_provider_reversal then
    update public.payment_collections set provider_status='reversed',allocation_status='reversed',
      classification='refunded',updated_at=now() where id=v_collection_id;
    update public.payment_collection_reversals set status='completed',completed_at=now()
      where allocation_id=v_allocation_id;
  else
    perform public.refresh_payment_collection_status(v_collection_id);
  end if;
  return new;
end $$;
create trigger payment_collection_reversal_sync after update on public.payments
  for each row execute function public.sync_reversed_collection_allocation();
create trigger receipt_collection_reversal_sync after update on public.customer_receipts
  for each row execute function public.sync_reversed_collection_allocation();
revoke execute on function public.sync_reversed_collection_allocation()
  from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Merchant onboarding and safe read models
-- ---------------------------------------------------------------------------
create or replace function public.request_mpesa_onboarding(
  p_legal_name text,p_shortcode text,p_shortcode_type text,p_mpesa_username text,
  p_contact_name text,p_contact_phone text,p_contact_email text,
  p_location_ids uuid[] default null,p_notes text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageMpesaIntegration') then
    raise exception 'permission_denied: ManageMpesaIntegration required'; end if;
  if p_shortcode_type not in('till','paybill') then raise exception 'invalid_shortcode_type'; end if;
  if btrim(coalesce(p_legal_name,''))='' or btrim(coalesce(p_shortcode,''))=''
    or btrim(coalesce(p_mpesa_username,''))='' or btrim(coalesce(p_contact_name,''))=''
    or btrim(coalesce(p_contact_phone,''))='' or btrim(coalesce(p_contact_email,''))='' then
    raise exception 'required_onboarding_details_missing';
  end if;
  if coalesce(cardinality(p_location_ids),0)=0 then raise exception 'onboarding_location_required'; end if;
  if exists(select 1 from unnest(coalesce(p_location_ids,'{}'::uuid[])) x(id)
    left join public.stock_locations l on l.id=x.id and l.company_id=v_company_id
    where l.id is null) then raise exception 'invalid_location'; end if;
  insert into public.mpesa_onboarding_requests(company_id,legal_name,shortcode,shortcode_type,
    mpesa_username,contact_name,contact_phone,contact_email,requested_location_ids,
    merchant_notes,requested_by)
  values(v_company_id,btrim(p_legal_name),btrim(p_shortcode),p_shortcode_type,
    btrim(p_mpesa_username),btrim(p_contact_name),btrim(p_contact_phone),lower(btrim(p_contact_email)),
    coalesce(p_location_ids,'{}'::uuid[]),nullif(btrim(coalesce(p_notes,'')),''),auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.request_mpesa_onboarding(text,text,text,text,text,text,text,uuid[],text)
  from public,anon;
grant execute on function public.request_mpesa_onboarding(text,text,text,text,text,text,text,uuid[],text)
  to authenticated;

create or replace function public.mpesa_availability(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'active',coalesce(s.enabled and a.status='active'
      and (s.pilot_company_id is null or s.pilot_company_id=a.company_id),false),
    'manual_fallback',coalesce(s.manual_fallback_allowed
      and a.manual_fallback_until>now(),false),
    'status',a.status
  )
  from public.mpesa_platform_settings s
  left join public.location_payment_provider_accounts l
    on l.location_id=p_location_id and l.provider='mpesa'
    and l.company_id=public.current_company_id()
  left join public.payment_provider_accounts a on a.id=l.provider_account_id
  where s.singleton
$$;
revoke execute on function public.mpesa_availability(uuid) from public,anon;
grant execute on function public.mpesa_availability(uuid) to authenticated,service_role;

create or replace function public.mpesa_setup_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageMpesaIntegration') then
    raise exception 'permission_denied: ManageMpesaIntegration required'; end if;
  select jsonb_build_object(
    'onboarding_requests',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'legal_name',r.legal_name,'shortcode',r.shortcode,'shortcode_type',r.shortcode_type,
      'status',r.status,'merchant_notes',r.merchant_notes,'operator_notes',r.operator_notes,
      'created_at',r.created_at,'commissioning',public.mpesa_commissioning_state(r.id))
      order by r.created_at desc)
      from public.mpesa_onboarding_requests r where r.company_id=v_company_id),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'display_name',a.display_name,'environment',a.environment,'status',a.status,
      'manual_fallback_until',a.manual_fallback_until,'activated_at',a.activated_at,
      'shortcode_type',c.shortcode_type,'organization_shortcode',c.organization_shortcode,
      'business_shortcode',c.business_shortcode,'party_b',c.party_b,
      'oauth_verified',d.oauth_verified_at is not null,'c2b_registered',c.c2b_registered_at is not null,
      'stk_test_passed',c.stk_test_collection_id is not null,
      'c2b_test_passed',c.c2b_test_collection_id is not null,
      'location_ids',coalesce((select jsonb_agg(l.location_id)
        from public.location_payment_provider_accounts l where l.provider_account_id=a.id),'[]'::jsonb)
    ) order by a.created_at desc) from public.payment_provider_accounts a
      join public.mpesa_connections c on c.provider_account_id=a.id
      join public.mpesa_daraja_apps d on d.id=c.daraja_app_id
      where a.company_id=v_company_id),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
revoke execute on function public.mpesa_setup_status() from public,anon;
grant execute on function public.mpesa_setup_status() to authenticated;

create or replace function public.platform_set_mpesa_settings(
  p_enabled boolean,p_manual_fallback_allowed boolean,p_pilot_company_id uuid default null
)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  if p_pilot_company_id is not null and not exists(select 1 from public.companies
    where id=p_pilot_company_id) then raise exception 'company_not_found'; end if;
  update public.mpesa_platform_settings set enabled=p_enabled,
    manual_fallback_allowed=p_manual_fallback_allowed,pilot_company_id=p_pilot_company_id,
    updated_by=auth.uid(),updated_at=now() where singleton;
end $$;
revoke execute on function public.platform_set_mpesa_settings(boolean,boolean,uuid) from public,anon;
grant execute on function public.platform_set_mpesa_settings(boolean,boolean,uuid) to authenticated;

create or replace function public.platform_advance_mpesa_request(
  p_request_id uuid,p_action text,p_notes text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.mpesa_onboarding_requests%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  if p_action='begin_review' and v_request.status='requested' then
    update public.mpesa_onboarding_requests set status='reviewing',handled_by=auth.uid(),
      operator_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_request_id;
  elsif p_action='merchant_verified' and v_request.status='reviewing' then
    update public.mpesa_onboarding_requests set status='merchant_verification',handled_by=auth.uid(),
      operator_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_request_id;
  elsif p_action='reject' and v_request.status in(
    'requested','reviewing','merchant_verification','daraja_setup','testing') then
    if btrim(coalesce(p_notes,''))='' then raise exception 'operator_notes_required'; end if;
    update public.mpesa_onboarding_requests set status='rejected',handled_by=auth.uid(),
      operator_notes=btrim(p_notes),updated_at=now() where id=p_request_id;
  else raise exception 'invalid_commissioning_transition: % from %',p_action,v_request.status;
  end if;
end $$;
revoke execute on function public.platform_advance_mpesa_request(uuid,text,text) from public,anon;
grant execute on function public.platform_advance_mpesa_request(uuid,text,text) to authenticated;

create or replace function public.platform_configure_mpesa_connection(
  p_request_id uuid,p_app_name text,p_environment text,p_organization_shortcode text,
  p_business_shortcode text,p_party_b text,p_consumer_key text,p_consumer_secret text,
  p_passkey text,p_location_ids uuid[] default null,p_daraja_app_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request public.mpesa_onboarding_requests%rowtype;v_app_id uuid;v_account_id uuid;
  v_key_secret uuid;v_secret_secret uuid;v_passkey_secret uuid;
begin
  perform public.assert_platform_admin();
  if p_environment not in('sandbox','production') then raise exception 'invalid_environment'; end if;
  if btrim(coalesce(p_passkey,''))='' or (p_daraja_app_id is null and
    (btrim(coalesce(p_consumer_key,''))='' or btrim(coalesce(p_consumer_secret,''))=''))
    then raise exception 'credentials_required'; end if;
  if btrim(coalesce(p_app_name,''))='' or btrim(coalesce(p_organization_shortcode,''))=''
    or btrim(coalesce(p_business_shortcode,''))='' or btrim(coalesce(p_party_b,''))=''
    then raise exception 'shortcode_configuration_required'; end if;
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  if v_request.status<>'merchant_verification' then
    raise exception 'merchant_verification_required'; end if;
  if exists(select 1 from public.mpesa_connections c where c.onboarding_request_id=v_request.id) then
    raise exception 'onboarding_connection_already_exists'; end if;
  if exists(select 1 from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id)
    left join public.stock_locations l on l.id=x.id and l.company_id=v_request.company_id
    where l.id is null) then raise exception 'invalid_location'; end if;
  v_app_id:=coalesce(p_daraja_app_id,gen_random_uuid());v_account_id:=gen_random_uuid();
  if p_daraja_app_id is not null and not exists(select 1 from public.mpesa_daraja_apps
    where id=p_daraja_app_id and company_id=v_request.company_id and environment=p_environment)
    then raise exception 'daraja_app_not_found'; end if;
  if p_daraja_app_id is null then
    v_key_secret:=vault.create_secret(p_consumer_key,'MPESA_CONSUMER_KEY_'||v_app_id::text,
      'Daraja consumer key');
    v_secret_secret:=vault.create_secret(p_consumer_secret,'MPESA_CONSUMER_SECRET_'||v_app_id::text,
      'Daraja consumer secret');
  end if;
  v_passkey_secret:=vault.create_secret(p_passkey,'MPESA_PASSKEY_'||v_account_id::text,
    'Daraja STK passkey');
  if p_daraja_app_id is null then
    insert into public.mpesa_daraja_apps(id,company_id,app_name,environment,
      consumer_key_secret_id,consumer_secret_secret_id,created_by,updated_by)
    values(v_app_id,v_request.company_id,btrim(p_app_name),p_environment,
      v_key_secret,v_secret_secret,auth.uid(),auth.uid());
  end if;
  insert into public.payment_provider_accounts(id,company_id,provider,environment,display_name,
    created_by,updated_by)
  values(v_account_id,v_request.company_id,'mpesa',p_environment,
    v_request.shortcode_type||' '||btrim(p_party_b),auth.uid(),auth.uid());
  insert into public.mpesa_connections(provider_account_id,company_id,onboarding_request_id,
    daraja_app_id,shortcode_type,organization_shortcode,business_shortcode,party_b,passkey_secret_id)
  values(v_account_id,v_request.company_id,v_request.id,v_app_id,v_request.shortcode_type,
    btrim(p_organization_shortcode),btrim(p_business_shortcode),btrim(p_party_b),v_passkey_secret);
  insert into public.location_payment_provider_accounts(location_id,company_id,provider,provider_account_id)
  select x.id,v_request.company_id,'mpesa',v_account_id
  from unnest(coalesce(p_location_ids,v_request.requested_location_ids)) x(id);
  update public.mpesa_onboarding_requests set status='daraja_setup',handled_by=auth.uid(),updated_at=now()
    where id=v_request.id;
  return v_account_id;
end $$;
revoke execute on function public.platform_configure_mpesa_connection(uuid,text,text,text,text,text,text,text,text,uuid[],uuid)
  from public,anon;
grant execute on function public.platform_configure_mpesa_connection(uuid,text,text,text,text,text,text,text,text,uuid[],uuid)
  to authenticated;

create or replace function public.mpesa_private_connection(p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select jsonb_build_object('connection_id',a.id,'company_id',a.company_id,
    'environment',a.environment,'consumer_key',k.decrypted_secret,
    'consumer_secret',s.decrypted_secret,'passkey',p.decrypted_secret,
    'organization_shortcode',c.organization_shortcode,'business_shortcode',c.business_shortcode,
    'party_b',c.party_b,'shortcode_type',c.shortcode_type)
  into v_result from public.payment_provider_accounts a
  join public.mpesa_connections c on c.provider_account_id=a.id
  join public.mpesa_daraja_apps d on d.id=c.daraja_app_id
  join vault.decrypted_secrets k on k.id=d.consumer_key_secret_id
  join vault.decrypted_secrets s on s.id=d.consumer_secret_secret_id
  join vault.decrypted_secrets p on p.id=c.passkey_secret_id
  where a.id=p_connection_id;
  return v_result;
end $$;
revoke execute on function public.mpesa_private_connection(uuid) from public,anon,authenticated;
grant execute on function public.mpesa_private_connection(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Locked payment intent and STK attempt state machine
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_transition_intent(
  p_intent_id uuid,p_attempt_id uuid,p_expected_version bigint,p_from text[],p_to text,
  p_result_code text default null,p_result_description text default null,
  p_review_reason text default null,p_collection_id uuid default null
)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_intent public.mpesa_payment_intents%rowtype;
begin
  select * into v_intent from public.mpesa_payment_intents where id=p_intent_id for update;
  if v_intent.id is null then raise exception 'mpesa_intent_not_found'; end if;
  if v_intent.current_attempt_id is distinct from p_attempt_id then raise exception 'stale_mpesa_attempt'; end if;
  if v_intent.state_version<>p_expected_version then raise exception 'stale_intent_version'; end if;
  if not (v_intent.status=any(p_from)) then raise exception 'invalid_intent_transition: % to %',v_intent.status,p_to; end if;
  if p_to not in('requesting','pending','funds_received','awaiting_cash','completed','cancelled',
    'expired','failed','manual_review') then raise exception 'invalid_intent_status'; end if;
  update public.mpesa_payment_intents set status=p_to,state_version=state_version+1,
    result_code=coalesce(p_result_code,result_code),
    result_description=coalesce(p_result_description,result_description),
    review_reason=coalesce(p_review_reason,review_reason),
    fulfilled_collection_id=coalesce(p_collection_id,fulfilled_collection_id),
    completed_at=case when p_to='completed' then now() else completed_at end,updated_at=now()
  where id=p_intent_id returning state_version into p_expected_version;
  return p_expected_version;
end $$;
revoke execute on function public.mpesa_transition_intent(uuid,uuid,bigint,text[],text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.mpesa_transition_intent(uuid,uuid,bigint,text[],text,text,text,text,uuid)
  to service_role;

create or replace function public.create_mpesa_payment_intent(
  p_workflow text,p_location_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text,p_customer_id uuid default null,p_lines jsonb default null,
  p_order_id uuid default null,p_draft_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_account_id uuid;v_subject_id uuid;
  v_order public.orders%rowtype;v_receipt_id uuid;v_session_id uuid;v_fingerprint text;v_existing record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_workflow not in('sale','order','customer_receipt') then raise exception 'invalid_mpesa_workflow'; end if;
  if p_amount<=0 or coalesce(p_cash_amount,0)<0 then raise exception 'invalid_payment_amount'; end if;
  if p_workflow='customer_receipt' and coalesce(p_cash_amount,0)<>0 then
    raise exception 'customer_receipt_split_not_supported'; end if;
  if p_phone is not null and btrim(p_phone)!~'^254[17][0-9]{8}$' then
    raise exception 'invalid_mpesa_phone'; end if;
  if btrim(coalesce(p_client_ref,''))='' then raise exception 'client_ref_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_company_id::text||':mpesa-client:'||btrim(p_client_ref),0));
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('workflow',p_workflow,'location',p_location_id,
    'phone',p_phone,'amount',p_amount,'cash_amount',coalesce(p_cash_amount,0),
    'customer',p_customer_id,'lines',p_lines,'order',p_order_id,'draft',p_draft_id)::text,'sha256'),'hex');
  select id,request_fingerprint into v_existing from public.mpesa_payment_intents
    where company_id=v_company_id and client_ref=btrim(p_client_ref);
  if v_existing.id is not null then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'idempotency_conflict'; end if;
    return v_existing.id;
  end if;
  select l.provider_account_id into v_account_id
  from public.location_payment_provider_accounts l
  join public.payment_provider_accounts a on a.id=l.provider_account_id
  join public.mpesa_platform_settings s on s.singleton
  where l.location_id=p_location_id and l.company_id=v_company_id and l.provider='mpesa'
    and a.status='active' and s.enabled
    and (s.pilot_company_id is null or s.pilot_company_id=v_company_id);
  if v_account_id is null then raise exception 'mpesa_not_available_at_location'; end if;
  perform set_config('app.business_location_id',p_location_id::text,true);
  v_session_id:=public.require_open_cashier_session_at_location(v_company_id,p_location_id);
  if p_workflow='sale' then
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'sale_lines_required'; end if;
    v_subject_id:=(public.post_sale_at_location(p_location_id,p_customer_id,p_lines,'[]'::jsonb,
      true,btrim(p_client_ref)||':order',p_draft_id,null)->>'order_id')::uuid;
  elsif p_workflow='order' then
    select * into v_order from public.orders where id=p_order_id and company_id=v_company_id for update;
    if v_order.id is null then raise exception 'order_not_found'; end if;
    if v_order.location_id<>p_location_id then raise exception 'order_location_mismatch'; end if;
    if v_order.status not in('draft','pending_payment') then raise exception 'order_not_payable'; end if;
    v_subject_id=v_order.id;
  else
    if not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company_id)
      then raise exception 'customer_not_found'; end if;
    v_receipt_id:=gen_random_uuid();v_subject_id:=v_receipt_id;
    insert into public.customer_receipts(id,company_id,customer_id,amount,method_code,location_id,
      cashier_session_id,client_ref,request_fingerprint,status,created_by)
    values(v_receipt_id,v_company_id,p_customer_id,p_amount,'mpesa',p_location_id,v_session_id,
      btrim(p_client_ref)||':receipt',v_fingerprint,'pending_approval',auth.uid());
  end if;
  select * into v_order from public.orders where id=v_subject_id and company_id=v_company_id;
  if p_workflow in('sale','order') and (v_order.id is null or v_order.total<>p_amount+coalesce(p_cash_amount,0))
    then raise exception 'payment_mismatch'; end if;
  if p_workflow in('sale','order') and v_session_id is not null then
    if v_order.cashier_session_id is not null and v_order.cashier_session_id<>v_session_id then
      raise exception 'cashier_session_mismatch'; end if;
    update public.orders set cashier_session_id=v_session_id,updated_at=now()
      where id=v_order.id and cashier_session_id is null;
  end if;
  insert into public.mpesa_payment_intents(company_id,provider_account_id,location_id,workflow,
    subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,cash_amount,
    initiating_cashier_session_id,created_by,created_by_role)
  values(v_company_id,v_account_id,p_location_id,p_workflow,
    case when p_workflow='customer_receipt' then 'customer_receipt' else 'order' end,
    v_subject_id,btrim(p_client_ref),v_fingerprint,btrim(p_phone),p_amount,coalesce(p_cash_amount,0),
    v_session_id,auth.uid(),auth.jwt()->>'user_role') returning id into v_subject_id;
  return v_subject_id;
end $$;
revoke execute on function public.create_mpesa_payment_intent(text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid)
  from public,anon;
grant execute on function public.create_mpesa_payment_intent(text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid)
  to authenticated;

create or replace function public.prepare_mpesa_checkout(
  p_workflow text,p_location_id uuid,p_phone text,p_amount bigint,p_cash_amount bigint,
  p_client_ref text,p_customer_id uuid default null,p_lines jsonb default null,
  p_order_id uuid default null,p_draft_id uuid default null,p_retry boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent_id uuid;v_intent public.mpesa_payment_intents%rowtype;v_action text;
begin
  v_intent_id:=public.create_mpesa_payment_intent(p_workflow,p_location_id,p_phone,p_amount,
    p_cash_amount,p_client_ref,p_customer_id,p_lines,p_order_id,p_draft_id);
  select * into v_intent from public.mpesa_payment_intents where id=v_intent_id for update;
  if v_intent.status='completed' then v_action:='completed';
  elsif v_intent.status='awaiting_cash' then v_action:='await_cash';
  elsif v_intent.status='manual_review' or v_intent.status='funds_received' then v_action:='review';
  elsif v_intent.status in('requesting','pending') then v_action:='poll';
  elsif v_intent.status='created' then
    if p_retry then raise exception 'retry_not_required'; end if;v_action:='send_prompt';
  elsif v_intent.status in('cancelled','expired','failed') then
    v_action:=case when p_retry then 'send_prompt' else 'retryable' end;
  else v_action:='review'; end if;
  return jsonb_build_object('intent_id',v_intent.id,'subject_id',v_intent.subject_id,
    'state',v_intent.status,'action',v_action,'attempt_id',v_intent.current_attempt_id,
    'cash_amount',v_intent.cash_amount,'result_code',v_intent.result_code,
    'message',v_intent.result_description);
end $$;
revoke execute on function public.prepare_mpesa_checkout(
  text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid,boolean) from public,anon;
grant execute on function public.prepare_mpesa_checkout(
  text,uuid,text,bigint,bigint,text,uuid,jsonb,uuid,uuid,boolean) to authenticated;

create or replace function public.create_mpesa_payment_attempt(
  p_intent_id uuid,p_callback_token_hash text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
  v_attempt_id uuid;v_number integer;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_callback_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_callback_token_hash'; end if;
  select * into v_intent from public.mpesa_payment_intents
    where id=p_intent_id and company_id=v_company_id for update;
  if v_intent.id is null then raise exception 'mpesa_intent_not_found'; end if;
  if v_intent.status not in('created','cancelled','expired','failed') then
    raise exception 'mpesa_intent_not_chargeable: %',v_intent.status; end if;
  if v_intent.status<>'created' and exists(select 1 from public.mpesa_payment_intents other
    where other.id<>v_intent.id and other.company_id=v_intent.company_id
      and other.provider_account_id=v_intent.provider_account_id
      and other.subject_type=v_intent.subject_type and other.subject_id=v_intent.subject_id
      and other.status not in('completed','cancelled','expired','failed')) then
    raise exception 'newer_mpesa_intent_exists'; end if;
  if v_intent.payer_phone is null then raise exception 'mpesa_phone_required_for_stk'; end if;
  if v_intent.fulfilled_collection_id is not null or exists(select 1 from public.payment_collections
    where mpesa_intent_id=v_intent.id and provider_status='received') then
    raise exception 'payment_already_received'; end if;
  v_number:=coalesce((select max(attempt_number) from public.mpesa_payment_attempts
    where intent_id=v_intent.id),0)+1;
  insert into public.mpesa_payment_attempts(intent_id,company_id,attempt_number)
    values(v_intent.id,v_company_id,v_number) returning id into v_attempt_id;
  insert into public.mpesa_callback_tokens(company_id,provider_account_id,attempt_id,kind,
    token_hash,status,activated_at,expires_at,created_by)
  values(v_company_id,v_intent.provider_account_id,v_attempt_id,'stk',p_callback_token_hash,
    'active',now(),now()+interval '24 hours 15 minutes',auth.uid());
  update public.mpesa_payment_intents set current_attempt_id=v_attempt_id,status='requesting',
    state_version=state_version+1,result_code=null,result_description=null,review_reason=null,
    expires_at=now()+interval '15 minutes',updated_at=now() where id=v_intent.id;
  return v_attempt_id;
end $$;
revoke execute on function public.create_mpesa_payment_attempt(uuid,text) from public,anon;
grant execute on function public.create_mpesa_payment_attempt(uuid,text) to authenticated;

create or replace function public.mpesa_private_for_attempt(p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select public.mpesa_private_connection(i.provider_account_id)||jsonb_build_object(
    'attempt_id',a.id,'intent_id',i.id,'payer_phone',i.payer_phone,'amount',i.amount,
    'client_ref',i.client_ref,'checkout_request_id',a.checkout_request_id,
    'account_reference',left('DR-'||i.client_ref,12),'transaction_description','Dukarun payment')
  into v_result from public.mpesa_payment_attempts a
  join public.mpesa_payment_intents i on i.id=a.intent_id where a.id=p_attempt_id;
  return v_result;
end $$;
revoke execute on function public.mpesa_private_for_attempt(uuid) from public,anon,authenticated;
grant execute on function public.mpesa_private_for_attempt(uuid) to service_role;

create or replace function public.mpesa_record_stk_request(
  p_attempt_id uuid,p_merchant_request_id text,p_checkout_request_id text,p_response_code text,
  p_response_description text,p_customer_message text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_attempt public.mpesa_payment_attempts%rowtype;v_intent public.mpesa_payment_intents%rowtype;
  v_terminal boolean:=p_response_code in('1','1032','1037','2001');v_status text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_attempt from public.mpesa_payment_attempts where id=p_attempt_id for update;
  select * into v_intent from public.mpesa_payment_intents where id=v_attempt.intent_id for update;
  if v_attempt.id is null or v_intent.current_attempt_id is distinct from v_attempt.id then
    raise exception 'stale_mpesa_attempt'; end if;
  update public.mpesa_payment_attempts set merchant_request_id=nullif(p_merchant_request_id,''),
    checkout_request_id=nullif(p_checkout_request_id,''),response_code=p_response_code,
    response_description=p_response_description,customer_message=p_customer_message,
    status=case when p_response_code='0' and btrim(coalesce(p_checkout_request_id,''))<>''
      then 'prompt_sent' when not v_terminal then 'request_unknown'
      when p_response_code='1032' then 'cancelled' when p_response_code='1037' then 'expired'
      else 'failed' end,
    next_query_at=case when not v_terminal and btrim(coalesce(p_checkout_request_id,''))<>''
      then now()+interval '15 seconds' end,updated_at=now()
  where id=v_attempt.id;
  v_status:=case when not v_terminal then 'pending' when p_response_code='1032' then 'cancelled'
    when p_response_code='1037' then 'expired' else 'failed' end;
  perform public.mpesa_transition_intent(v_intent.id,v_attempt.id,v_intent.state_version,
    array['requesting'],v_status,
    p_response_code,p_response_description,null,null);
end $$;
revoke execute on function public.mpesa_record_stk_request(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_record_stk_request(uuid,text,text,text,text,text) to service_role;

create or replace function public.mpesa_record_request_unknown(p_attempt_id uuid,p_description text)
returns void language plpgsql security definer set search_path='' as $$
declare v_attempt public.mpesa_payment_attempts%rowtype;v_intent public.mpesa_payment_intents%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_attempt from public.mpesa_payment_attempts where id=p_attempt_id for update;
  select * into v_intent from public.mpesa_payment_intents where id=v_attempt.intent_id for update;
  if v_attempt.id is null or v_intent.current_attempt_id is distinct from v_attempt.id then return; end if;
  if v_intent.status='requesting' then
    update public.mpesa_payment_attempts set status='request_unknown',result_description=p_description,
      next_query_at=now()+interval '15 seconds',updated_at=now() where id=v_attempt.id;
    perform public.mpesa_transition_intent(v_intent.id,v_attempt.id,v_intent.state_version,
      array['requesting'],'pending','REQUEST_UNKNOWN',p_description,null,null);
  end if;
end $$;
revoke execute on function public.mpesa_record_request_unknown(uuid,text) from public,anon,authenticated;
grant execute on function public.mpesa_record_request_unknown(uuid,text) to service_role;

create or replace function public.mpesa_intent_status(p_intent_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object('id',i.id,'subject_id',i.subject_id,'status',i.status,
    'state_version',i.state_version,'result_code',i.result_code,
    'result_description',i.result_description,'cash_amount',i.cash_amount,
    'provider_receipt',c.provider_receipt,'amount',i.amount,
    'retry_allowed',i.status in('cancelled','expired','failed') and i.fulfilled_collection_id is null)
  into v_result from public.mpesa_payment_intents i
  left join public.payment_collections c on c.id=i.fulfilled_collection_id
  where i.id=p_intent_id and i.company_id=v_company_id
    and (i.created_by=auth.uid() or public.current_user_has_permission('ManageReconciliation'));
  if v_result is null then raise exception 'mpesa_intent_not_found'; end if;
  return v_result;
end $$;
revoke execute on function public.mpesa_intent_status(uuid) from public,anon;
grant execute on function public.mpesa_intent_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Durable callback inbox and processor leases
-- ---------------------------------------------------------------------------
create or replace function public.queue_mpesa_processor()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text;v_service_key text;
begin
  select max(case when name='MPESA_PROCESS_URL' then decrypted_secret end),
    max(case when name='SUPABASE_SERVICE_ROLE_KEY' then decrypted_secret end)
  into v_url,v_service_key from vault.decrypted_secrets
  where name in('MPESA_PROCESS_URL','SUPABASE_SERVICE_ROLE_KEY');
  if nullif(v_url,'') is not null and nullif(v_service_key,'') is not null then
    perform net.http_post(url:=v_url,body:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_service_key),
      timeout_milliseconds:=5000);
  end if;
end $$;
revoke execute on function public.queue_mpesa_processor() from public,anon,authenticated;
grant execute on function public.queue_mpesa_processor() to service_role;

create or replace function public.mpesa_ingest_provider_event(
  p_token_hash text,p_event_type text,p_event_key text,p_payload jsonb,p_payload_sha256 text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_token public.mpesa_callback_tokens%rowtype;v_id uuid;v_existing_hash text;
  v_attempt public.mpesa_payment_attempts%rowtype;v_event_status text:='queued';v_error text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if p_token_hash!~'^[0-9a-f]{64}$' or p_payload_sha256!~'^[0-9a-f]{64}$'
    then raise exception 'invalid_callback_digest'; end if;
  if p_event_type not in('stk_callback','c2b_validation','c2b_confirmation')
    then raise exception 'invalid_event_type'; end if;
  select * into v_token from public.mpesa_callback_tokens
  where token_hash=p_token_hash
    and ((kind='stk' and p_event_type='stk_callback' and status in('active','consumed'))
      or (kind='c2b' and p_event_type in('c2b_validation','c2b_confirmation')
        and status in('active','retiring')))
    and coalesce(expires_at,retire_after,now()+interval '1 minute')>now() for update;
  if v_token.id is null then raise exception 'invalid_or_expired_callback_token'; end if;
  if p_event_type='stk_callback' then
    select * into v_attempt from public.mpesa_payment_attempts
      where id=v_token.attempt_id and company_id=v_token.company_id for update;
    if v_attempt.id is null then raise exception 'callback_attempt_not_found'; end if;
    if v_attempt.checkout_request_id is not null
      and v_attempt.checkout_request_id<>btrim(p_event_key) then
      v_event_status:='manual_review';v_error:='checkout_request_id_conflict';
    elsif v_attempt.checkout_request_id is null and exists(
      select 1 from public.mpesa_payment_attempts other
      where other.checkout_request_id=btrim(p_event_key) and other.id<>v_attempt.id
    ) then
      v_event_status:='manual_review';v_error:='checkout_request_id_already_bound';
    elsif v_attempt.checkout_request_id is null then
      update public.mpesa_payment_attempts set checkout_request_id=btrim(p_event_key),
        status=case when status in('requesting','request_unknown') then 'query_pending' else status end,
        next_query_at=coalesce(next_query_at,now()+interval '15 seconds'),updated_at=now()
      where id=v_attempt.id;
      update public.mpesa_payment_intents set status='pending',state_version=state_version+1,
        result_description='Callback recovered provider checkout reference',updated_at=now()
      where id=v_attempt.intent_id and current_attempt_id=v_attempt.id and status='requesting';
    end if;
    if v_event_status='manual_review' then
      update public.mpesa_payment_attempts set status='manual_review',result_description=v_error,
        updated_at=now() where id=v_attempt.id;
      update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
        review_reason=v_error,result_description='Callback checkout reference did not match the attempt',
        updated_at=now() where id=v_attempt.intent_id and status<>'completed';
    end if;
  end if;
  insert into public.mpesa_provider_events(company_id,provider_account_id,callback_token_id,
    attempt_id,event_type,provider_event_key,payload,payload_sha256,status,error)
  values(v_token.company_id,v_token.provider_account_id,v_token.id,v_token.attempt_id,
    p_event_type,btrim(p_event_key),p_payload,p_payload_sha256,v_event_status,v_error)
  on conflict(provider_account_id,event_type,provider_event_key) do nothing returning id into v_id;
  if v_id is null then
    select id,payload_sha256 into v_id,v_existing_hash from public.mpesa_provider_events
      where provider_account_id=v_token.provider_account_id and event_type=p_event_type
        and provider_event_key=btrim(p_event_key) for update;
    if v_existing_hash<>p_payload_sha256 or v_event_status='manual_review' then
      update public.mpesa_provider_events set status='manual_review',
        error=case when v_event_status='manual_review' then v_error
          else 'provider_event_payload_conflict' end,lease_until=null where id=v_id;
    end if;
  end if;
  if v_event_status='queued' then perform public.queue_mpesa_processor(); end if;
  return v_id;
end $$;
revoke execute on function public.mpesa_ingest_provider_event(text,text,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_ingest_provider_event(text,text,text,jsonb,text) to service_role;

create or replace function public.mpesa_claim_provider_events(p_limit integer default 25)
returns table(id uuid,event_type text,payload jsonb,attempt_id uuid,provider_account_id uuid,
  processing_attempts integer)
language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  return query with claimed as (
    select e.id from public.mpesa_provider_events e
    where (e.status in('queued','retry') and e.next_attempt_at<=now())
       or (e.status='processing' and e.lease_until<now())
    order by e.received_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  )
  update public.mpesa_provider_events e set status='processing',lease_until=now()+interval '1 minute',
    processing_attempts=e.processing_attempts+1
  from claimed where e.id=claimed.id
  returning e.id,e.event_type,e.payload,e.attempt_id,e.provider_account_id,e.processing_attempts;
end $$;
revoke execute on function public.mpesa_claim_provider_events(integer) from public,anon,authenticated;
grant execute on function public.mpesa_claim_provider_events(integer) to service_role;

create or replace function public.mpesa_complete_provider_event(
  p_event_id uuid,p_collection_id uuid default null,p_result_code text default null
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  update public.mpesa_provider_events set status='processed',collection_id=p_collection_id,
    result_code=p_result_code,error=null,lease_until=null,processed_at=now()
  where id=p_event_id and status='processing';
end $$;
revoke execute on function public.mpesa_complete_provider_event(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_complete_provider_event(uuid,uuid,text) to service_role;

create or replace function public.mpesa_retry_provider_event(
  p_event_id uuid,p_error text,p_terminal boolean default false
)
returns void language plpgsql security definer set search_path='' as $$
declare v_received timestamptz;v_attempts integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select received_at,processing_attempts into v_received,v_attempts
    from public.mpesa_provider_events where id=p_event_id for update;
  update public.mpesa_provider_events set
    status=case when p_terminal or v_received<=now()-interval '15 minutes'
      then 'manual_review' else 'retry' end,
    error=left(coalesce(p_error,'processing_failed'),500),lease_until=null,
    next_attempt_at=now()+least(interval '15 seconds'*greatest(v_attempts,1),interval '1 minute')
  where id=p_event_id;
end $$;
revoke execute on function public.mpesa_retry_provider_event(uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.mpesa_retry_provider_event(uuid,text,boolean) to service_role;

create or replace function public.list_mpesa_provider_event_reviews(p_limit integer default 50)
returns table(id uuid,provider_account_id uuid,provider_account_name text,event_type text,
  provider_event_key text,error text,result_code text,attempt_id uuid,intent_id uuid,
  collection_id uuid,processing_attempts integer,received_at timestamptz,allowed_actions text[])
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  return query select e.id,e.provider_account_id,a.display_name,e.event_type,e.provider_event_key,
    e.error,e.result_code,e.attempt_id,i.id,e.collection_id,e.processing_attempts,e.received_at,
    case when e.collection_id is not null then array['acknowledge']::text[]
      when e.payload is not null then array['retry','dismiss_no_money']::text[]
      else array['dismiss_no_money']::text[] end
  from public.mpesa_provider_events e
  join public.payment_provider_accounts a on a.id=e.provider_account_id
  left join public.mpesa_payment_attempts pa on pa.id=e.attempt_id
  left join public.mpesa_payment_intents i on i.id=pa.intent_id
  where e.company_id=v_company_id and e.status='manual_review'
  order by e.received_at
  limit greatest(1,least(coalesce(p_limit,50),250));
end $$;
revoke execute on function public.list_mpesa_provider_event_reviews(integer) from public,anon;
grant execute on function public.list_mpesa_provider_event_reviews(integer) to authenticated;

create or replace function public.review_mpesa_provider_event(
  p_event_id uuid,p_action text,p_notes text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_event public.mpesa_provider_events%rowtype;
  v_attempt public.mpesa_payment_attempts%rowtype;v_intent public.mpesa_payment_intents%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  if coalesce(p_action,'') not in('retry','dismiss_no_money','acknowledge') then
    raise exception 'invalid_provider_event_action'; end if;
  if btrim(coalesce(p_notes,''))='' then raise exception 'review_notes_required'; end if;
  select * into v_event from public.mpesa_provider_events
    where id=p_event_id and company_id=v_company_id for update;
  if v_event.id is null then raise exception 'mpesa_provider_event_not_found'; end if;
  if v_event.status<>'manual_review' then raise exception 'mpesa_provider_event_not_reviewable'; end if;
  if v_event.attempt_id is not null then
    select * into v_attempt from public.mpesa_payment_attempts where id=v_event.attempt_id for update;
    select * into v_intent from public.mpesa_payment_intents where id=v_attempt.intent_id for update;
  end if;
  if p_action='acknowledge' then
    if v_event.collection_id is null then raise exception 'provider_event_has_no_money_evidence'; end if;
    update public.mpesa_provider_events set status='processed',reviewed_by=auth.uid(),
      reviewed_at=now(),review_notes=btrim(p_notes),error=null,lease_until=null,
      processed_at=coalesce(processed_at,now()) where id=v_event.id;
    return jsonb_build_object('status','processed','event_id',v_event.id);
  end if;
  if v_event.collection_id is not null then raise exception 'provider_event_has_money_evidence'; end if;
  if p_action='dismiss_no_money' then
    update public.mpesa_provider_events set status='dismissed',reviewed_by=auth.uid(),
      reviewed_at=now(),review_notes=btrim(p_notes),lease_until=null where id=v_event.id;
    if v_attempt.id is not null and v_intent.status<>'completed'
      and v_intent.fulfilled_collection_id is null then
      update public.mpesa_payment_attempts set
        status=case when checkout_request_id is null then 'request_unknown' else 'query_pending' end,
        result_description='Conflicting callback dismissed during reconciliation',
        next_query_at=case when checkout_request_id is not null then now() else next_query_at end,
        updated_at=now() where id=v_attempt.id;
      update public.mpesa_payment_intents set status='pending',state_version=state_version+1,
        review_reason=null,result_description='Conflicting callback dismissed; provider query resumed',
        updated_at=now() where id=v_intent.id;
    end if;
    return jsonb_build_object('status','dismissed','event_id',v_event.id);
  end if;
  if v_event.payload is null then raise exception 'provider_event_payload_unavailable'; end if;
  if v_attempt.id is not null and v_event.event_type='stk_callback' then
    if exists(select 1 from public.mpesa_payment_attempts a
      where a.checkout_request_id=v_event.provider_event_key and a.id<>v_attempt.id) then
      raise exception 'checkout_request_id_already_bound'; end if;
    update public.mpesa_payment_attempts set checkout_request_id=v_event.provider_event_key,
      status='query_pending',result_description='Callback correlation approved during reconciliation',
      next_query_at=now(),query_lease_until=null,updated_at=now() where id=v_attempt.id;
    if v_intent.status<>'completed' and v_intent.fulfilled_collection_id is null then
      update public.mpesa_payment_intents set status='pending',state_version=state_version+1,
        review_reason=null,result_description='Callback approved for retry',updated_at=now()
        where id=v_intent.id;
    end if;
  end if;
  update public.mpesa_provider_events set status='retry',processing_attempts=0,
    next_attempt_at=now(),lease_until=null,reviewed_by=auth.uid(),reviewed_at=now(),
    review_notes=btrim(p_notes),error=null where id=v_event.id;
  perform public.queue_mpesa_processor();
  return jsonb_build_object('status','retry','event_id',v_event.id);
end $$;
revoke execute on function public.review_mpesa_provider_event(uuid,text,text) from public,anon;
grant execute on function public.review_mpesa_provider_event(uuid,text,text) to authenticated;

create or replace function public.mpesa_latest_trusted_callback_payload(p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_payload jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select e.payload into v_payload
  from public.mpesa_payment_attempts a
  join public.mpesa_provider_events e on e.attempt_id=a.id
    and e.event_type='stk_callback'
    and e.provider_event_key=a.checkout_request_id
    and e.status in('queued','processing','retry','processed')
  where a.id=p_attempt_id and e.payload is not null
  order by e.received_at desc limit 1;
  return v_payload;
end $$;
revoke execute on function public.mpesa_latest_trusted_callback_payload(uuid)
  from public,anon,authenticated;
grant execute on function public.mpesa_latest_trusted_callback_payload(uuid) to service_role;

create or replace function public.mpesa_claim_status_queries(p_limit integer default 25)
returns table(attempt_id uuid,checkout_request_id text)
language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  return query with claimed as (
    select a.id from public.mpesa_payment_attempts a
    join public.mpesa_payment_intents i on i.id=a.intent_id and i.current_attempt_id=a.id
    where a.status in('prompt_sent','query_pending','request_unknown')
      and a.checkout_request_id is not null and a.next_query_at<=now()
      and coalesce(a.query_lease_until,'-infinity')<now()
      and i.status='pending'
    order by a.next_query_at for update of a skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ) update public.mpesa_payment_attempts a set query_lease_until=now()+interval '1 minute',
      query_attempts=a.query_attempts+1,last_queried_at=now(),updated_at=now()
    from claimed where a.id=claimed.id returning a.id,a.checkout_request_id;
end $$;
revoke execute on function public.mpesa_claim_status_queries(integer) from public,anon,authenticated;
grant execute on function public.mpesa_claim_status_queries(integer) to service_role;

create or replace function public.mpesa_record_query_pending(
  p_attempt_id uuid,p_result_code text,p_description text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_created timestamptz;v_intent_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select created_at,intent_id into v_created,v_intent_id from public.mpesa_payment_attempts
    where id=p_attempt_id for update;
  if v_created is null then return; end if;
  update public.mpesa_payment_attempts set
    status=case when v_created<=now()-interval '15 minutes' then 'manual_review' else 'query_pending' end,
    result_code=p_result_code,result_description=p_description,query_lease_until=null,
    next_query_at=now()+least(interval '15 seconds'*greatest(query_attempts,1),interval '1 minute'),
    updated_at=now() where id=p_attempt_id;
  if v_created<=now()-interval '15 minutes' then
    update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
      review_reason='provider_status_unresolved',result_code=p_result_code,
      result_description=p_description,updated_at=now()
    where id=v_intent_id and current_attempt_id=p_attempt_id and status='pending';
  end if;
end $$;
revoke execute on function public.mpesa_record_query_pending(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_record_query_pending(uuid,text,text) to service_role;

create or replace function public.sweep_mpesa_processing()
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.mpesa_callback_tokens set status='retired'
    where status='retiring' and retire_after<=now();
  update public.mpesa_payment_attempts a set status='manual_review',updated_at=now()
    from public.mpesa_payment_intents i where i.id=a.intent_id and i.current_attempt_id=a.id
      and a.status='request_unknown' and a.checkout_request_id is null
      and a.created_at<=now()-interval '15 minutes' and i.status='pending';
  update public.mpesa_payment_intents i set status='manual_review',state_version=state_version+1,
    review_reason='provider_request_unresolved',updated_at=now()
    from public.mpesa_payment_attempts a where a.intent_id=i.id and i.current_attempt_id=a.id
      and a.status='manual_review' and i.status='pending';
  update public.mpesa_payment_intents set status='expired',state_version=state_version+1,
    result_description=coalesce(result_description,'Payment request expired'),updated_at=now()
    where status='created' and expires_at<=now() and fulfilled_collection_id is null;
  if exists(select 1 from public.mpesa_provider_events
      where (status in('queued','retry') and next_attempt_at<=now())
        or (status='processing' and lease_until<now()))
    or exists(select 1 from public.mpesa_payment_attempts a join public.mpesa_payment_intents i
      on i.id=a.intent_id where i.status='pending' and a.next_query_at<=now()
    )
  then perform public.queue_mpesa_processor(); end if;
end $$;
revoke execute on function public.sweep_mpesa_processing() from public,anon,authenticated;
grant execute on function public.sweep_mpesa_processing() to service_role;

-- ---------------------------------------------------------------------------
-- Canonical collections and accounting allocation
-- ---------------------------------------------------------------------------
create or replace function public.mpesa_upsert_collection(
  p_provider_account_id uuid,p_provider_receipt text,p_amount bigint,p_occurred_at timestamptz,
  p_payer_phone text,p_payer_name text,p_account_reference text,p_source text,
  p_verification_status text,p_intent_id uuid default null,p_created_by uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_account public.payment_provider_accounts%rowtype;v_collection public.payment_collections%rowtype;
  v_conflict text;
begin
  if btrim(coalesce(p_provider_receipt,''))='' or p_amount<=0 then raise exception 'invalid_collection'; end if;
  if p_occurred_at is null then raise exception 'invalid_provider_transaction_time'; end if;
  if p_source not in('stk','c2b','manual') or p_verification_status not in(
    'declared','provider_notified','provider_verified') then raise exception 'invalid_collection_source'; end if;
  select * into v_account from public.payment_provider_accounts where id=p_provider_account_id;
  if v_account.id is null then raise exception 'provider_account_not_found'; end if;
  select * into v_collection from public.payment_collections
    where provider='mpesa' and environment=v_account.environment
      and provider_receipt=upper(btrim(p_provider_receipt)) for update;
  if v_collection.id is null then
    insert into public.payment_collections(company_id,provider_account_id,provider,environment,
      provider_receipt,amount,occurred_at,payer_phone,payer_name,account_reference,source,
      verification_status,mpesa_intent_id,created_by)
    values(v_account.company_id,v_account.id,'mpesa',v_account.environment,
      upper(btrim(p_provider_receipt)),p_amount,p_occurred_at,nullif(btrim(coalesce(p_payer_phone,'')),''),
      nullif(btrim(coalesce(p_payer_name,'')),''),nullif(btrim(coalesce(p_account_reference,'')),''),
      p_source,p_verification_status,p_intent_id,p_created_by)
    returning * into v_collection;
  else
    if v_collection.company_id<>v_account.company_id
      or v_collection.provider_account_id<>v_account.id then v_conflict:='receipt_account_conflict';
    elsif v_collection.amount<>p_amount then v_conflict:='receipt_amount_conflict';
    elsif v_collection.occurred_at is distinct from p_occurred_at
      and not (v_collection.source='manual' and p_source<>'manual'
        and v_collection.allocation_status='unallocated') then
      v_conflict:='receipt_transaction_time_conflict';
    end if;
    if v_conflict is not null then
      update public.payment_collections set verification_status='disputed',
        notes=concat_ws('; ',notes,v_conflict),updated_at=now() where id=v_collection.id;
      if coalesce(p_intent_id,v_collection.mpesa_intent_id) is not null then
        update public.mpesa_payment_intents
        set status='manual_review',state_version=state_version+1,review_reason=v_conflict,updated_at=now()
        where id=coalesce(p_intent_id,v_collection.mpesa_intent_id)
          and status not in('cancelled','expired','failed'); end if;
      return jsonb_build_object('collection_id',v_collection.id,'conflict',v_conflict);
    end if;
    update public.payment_collections set
      occurred_at=case when source='manual' and p_source<>'manual'
        and allocation_status='unallocated' then p_occurred_at else occurred_at end,
      payer_phone=coalesce(p_payer_phone,payer_phone),
      payer_name=coalesce(p_payer_name,payer_name),
      account_reference=coalesce(p_account_reference,account_reference),
      source=case when p_source='c2b' then 'c2b' when source='manual' then p_source else source end,
      verification_status=case
        when p_verification_status='provider_verified' then 'provider_verified'
        when p_verification_status='provider_notified' and verification_status='declared'
          then 'provider_notified' else verification_status end,
      mpesa_intent_id=coalesce(mpesa_intent_id,p_intent_id),updated_at=now()
    where id=v_collection.id returning * into v_collection;
  end if;
  return jsonb_build_object('collection_id',v_collection.id,'conflict',null);
end $$;
revoke execute on function public.mpesa_upsert_collection(uuid,text,bigint,timestamptz,text,text,text,text,text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mpesa_upsert_collection(uuid,text,bigint,timestamptz,text,text,text,text,text,uuid,uuid)
  to service_role;

create or replace function public.execute_customer_receipt_core(
  p_receipt_id uuid,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_receipt public.customer_receipts%rowtype;v_order record;v_remaining bigint;v_take bigint;
  v_applied bigint:=0;v_deposit_id uuid;v_payment_id uuid;v_account_code text;
  v_lines jsonb:='[]'::jsonb;
begin
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id;
  if v_receipt.id is null then raise exception 'customer_receipt_not_found'; end if;
  perform public.lock_customer_account(v_receipt.company_id,v_receipt.customer_id);
  select * into v_receipt from public.customer_receipts
    where id=p_receipt_id and company_id=(p_context).company_id for update;
  if v_receipt.status='posted' then return v_receipt.id; end if;
  if v_receipt.status<>'pending_approval' then
    raise exception 'customer_receipt_not_postable: %',v_receipt.status; end if;
  if v_receipt.location_id is distinct from (p_context).location_id
    or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
    raise exception 'posting_context_receipt_mismatch'; end if;
  v_account_code:=public.prepayment_tender_account(
    v_receipt.location_id,v_receipt.method_code,v_receipt.reference);
  v_remaining:=v_receipt.amount;
  v_lines:=v_lines||jsonb_build_object('account_code',v_account_code,'debit',v_receipt.amount,
    'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
      'locationId',v_receipt.location_id,'method',v_receipt.method_code,
      'reference',v_receipt.reference));
  perform 1 from public.orders o where o.company_id=v_receipt.company_id
    and o.customer_id=v_receipt.customer_id and o.is_credit_sale and o.status='completed'
    order by o.created_at,o.id for update;
  for v_order in
    select o.id,o.code,o.created_at,
      greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)::bigint due
    from public.orders o left join public.payments p
      on p.order_id=o.id and p.company_id=o.company_id
    where o.company_id=v_receipt.company_id and o.customer_id=v_receipt.customer_id
      and o.is_credit_sale and o.status='completed'
    group by o.id
    having greatest(o.total-coalesce(sum(p.amount) filter(where p.status='settled'),0),0)>0
    order by o.created_at,o.id
  loop
    exit when v_remaining=0;v_take:=least(v_remaining,v_order.due);
    insert into public.payments(company_id,order_id,method_code,amount,reference,status,
      location_id,settlement_kind,customer_receipt_id,cashier_session_id)
    values(v_receipt.company_id,v_order.id,v_receipt.method_code,v_take,v_receipt.reference,'settled',
      v_receipt.location_id,'tender',v_receipt.id,(p_context).cashier_session_id)
    returning id into v_payment_id;
    v_lines:=v_lines||jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_take,
      'order_id',v_order.id,'meta',jsonb_build_object('customerId',v_receipt.customer_id,
        'receiptId',v_receipt.id,'paymentId',v_payment_id,'orderCode',v_order.code));
    v_applied:=v_applied+v_take;v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining>0 then
    insert into public.customer_deposits(company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,customer_receipt_id,created_by)
    values(v_receipt.company_id,v_receipt.customer_id,v_remaining,v_receipt.method_code,
      v_receipt.reference,v_receipt.location_id,(p_context).cashier_session_id,
      v_receipt.client_ref||':downpayment',v_receipt.id,v_receipt.created_by)
    returning id into v_deposit_id;
    v_lines:=v_lines||jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_remaining,
      'meta',jsonb_build_object('customerId',v_receipt.customer_id,'receiptId',v_receipt.id,
        'depositId',v_deposit_id,'locationId',v_receipt.location_id));
  end if;
  perform public.post_journal_entry_with_context(v_receipt.company_id,'CustomerReceipt',
    v_receipt.id::text,'Customer receipt',v_lines,p_context);
  update public.customer_receipts set status='posted',applied_amount=v_applied,
    downpayment_amount=v_remaining,posted_at=now() where id=v_receipt.id;
  return v_receipt.id;
end $$;
revoke execute on function public.execute_customer_receipt_core(uuid,public.posting_context)
  from public,anon,authenticated;
grant execute on function public.execute_customer_receipt_core(uuid,public.posting_context)
  to service_role;

create or replace function public.mpesa_post_reserved_allocation(
  p_collection_id uuid,p_allocation_id uuid,p_context public.posting_context,
  p_additional_payments jsonb default '[]'::jsonb
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_collection public.payment_collections%rowtype;
  v_allocation public.payment_collection_allocations%rowtype;v_order public.orders%rowtype;
  v_receipt public.customer_receipts%rowtype;v_payment jsonb;
  v_session_closed boolean:=false;v_timezone text;v_original_date date;
begin
  if jsonb_typeof(p_additional_payments)<>'array' then
    raise exception 'additional_payments_must_be_array'; end if;
  select * into v_collection from public.payment_collections where id=p_collection_id for update;
  select * into v_allocation from public.payment_collection_allocations
    where id=p_allocation_id for update;
  if v_collection.id is null or v_allocation.id is null
    or v_collection.company_id is distinct from (p_context).company_id
    or v_allocation.company_id<>v_collection.company_id
    or v_allocation.collection_id<>v_collection.id or v_allocation.amount<>v_collection.amount
    or v_allocation.status<>'reserved' or v_collection.provider_status<>'received'
    or v_collection.verification_status='disputed' then
    raise exception 'mpesa_posting_evidence_mismatch'; end if;
  if (p_context).cashier_session_id is not null then
    select s.status<>'open' into v_session_closed from public.cashier_sessions s
      where s.id=(p_context).cashier_session_id and s.company_id=v_collection.company_id;
  end if;
  if v_allocation.order_id is not null then
    select * into v_order from public.orders where id=v_allocation.order_id
      and company_id=v_collection.company_id for update;
    if v_order.id is null or v_order.location_id is distinct from (p_context).location_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    v_payment:=jsonb_build_array(jsonb_build_object('method','mpesa','amount',v_collection.amount,
      'reference',v_collection.provider_receipt,'mpesa_receipt',v_collection.provider_receipt,
      'collection_allocation_id',v_allocation.id))||p_additional_payments;
    perform public.complete_order_core(v_order.id,v_payment,p_context);
  elsif v_allocation.customer_receipt_id is not null then
    select * into v_receipt from public.customer_receipts where id=v_allocation.customer_receipt_id
      and company_id=v_collection.company_id for update;
    if v_receipt.id is null or v_receipt.location_id is distinct from (p_context).location_id
      or v_receipt.cashier_session_id is distinct from (p_context).cashier_session_id then
      raise exception 'mpesa_posting_target_mismatch'; end if;
    update public.customer_receipts set reference=v_collection.provider_receipt,
      collection_allocation_id=v_allocation.id where id=v_receipt.id;
    perform public.execute_customer_receipt_core(v_receipt.id,p_context);
  else raise exception 'unsupported_mpesa_subject'; end if;
  update public.payment_collection_allocations set status='posted',posted_at=now(),
    cashier_session_id=(p_context).cashier_session_id,posting_date=(p_context).posting_date,
    posted_after_session_close=v_session_closed,updated_at=now() where id=v_allocation.id;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_session_closed then
    select c.business_timezone into v_timezone from public.companies c where c.id=v_collection.company_id;
    v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
    update public.daily_business_closes set status='invalidated',invalidated_at=now(),
      invalidation_reason='Provider payment settled after the initiating till closed'
    where company_id=v_collection.company_id and business_date=v_original_date
      and status='signed_off';
  end if;
end $$;
revoke execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) from public,anon,authenticated;
grant execute on function public.mpesa_post_reserved_allocation(
  uuid,uuid,public.posting_context,jsonb) to service_role;

create or replace function public.mpesa_apply_collection_to_intent(
  p_intent_id uuid,p_attempt_id uuid,p_collection_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_intent public.mpesa_payment_intents%rowtype;v_collection public.payment_collections%rowtype;
  v_allocation_id uuid;v_allocation_status text;v_error text;v_timezone text;
  v_original_date date;v_lock_end date;v_review_id uuid;v_late boolean:=false;
  v_context public.posting_context;
begin
  select * into v_intent from public.mpesa_payment_intents where id=p_intent_id for update;
  select * into v_collection from public.payment_collections where id=p_collection_id for update;
  if v_intent.id is null or v_collection.id is null or v_collection.company_id<>v_intent.company_id
    then raise exception 'intent_collection_mismatch'; end if;
  if v_intent.current_attempt_id is distinct from p_attempt_id then
    if v_intent.fulfilled_collection_id is null then
      update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
        fulfilled_collection_id=v_collection.id,review_reason='stale_attempt_received_money',
        result_description='An older STK attempt received money',updated_at=now() where id=v_intent.id;
      update public.mpesa_payment_attempts set status='manual_review',updated_at=now()
        where id=v_intent.current_attempt_id and status not in('paid','cancelled','expired','failed');
      return jsonb_build_object('status','manual_review','collection_id',v_collection.id);
    end if;
    update public.payment_collections set classification='surplus',updated_at=now()
      where id=v_collection.id and allocation_status='unallocated';
    return jsonb_build_object('status','surplus','collection_id',v_collection.id);
  end if;
  if v_intent.fulfilled_collection_id is not null
    and v_intent.fulfilled_collection_id<>v_collection.id then
    update public.payment_collections set classification='surplus',updated_at=now()
      where id=v_collection.id and allocation_status='unallocated';
    return jsonb_build_object('status','surplus','collection_id',v_collection.id);
  end if;
  if v_collection.amount<>v_intent.amount or v_collection.verification_status='disputed' then
    update public.payment_collections set verification_status='disputed',updated_at=now()
      where id=v_collection.id;
    update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
      fulfilled_collection_id=v_collection.id,review_reason='collection_amount_or_receipt_conflict',updated_at=now()
      where id=v_intent.id;
    return jsonb_build_object('status','manual_review','collection_id',v_collection.id);
  end if;
  if v_intent.status='completed' then
    return jsonb_build_object('status','completed','collection_id',v_collection.id);
  end if;
  if v_intent.status not in('created','requesting','pending','funds_received','awaiting_cash','manual_review') then
    update public.payment_collections set classification='surplus',updated_at=now()
      where id=v_collection.id and allocation_status='unallocated';
    return jsonb_build_object('status','surplus','collection_id',v_collection.id);
  end if;
  if v_intent.status in('created','requesting','pending') then
    perform public.mpesa_transition_intent(v_intent.id,p_attempt_id,v_intent.state_version,
      array[v_intent.status],'funds_received','0','Payment received',null,v_collection.id);
    select * into v_intent from public.mpesa_payment_intents where id=v_intent.id for update;
  else
    update public.mpesa_payment_intents set fulfilled_collection_id=v_collection.id,updated_at=now()
      where id=v_intent.id and fulfilled_collection_id is null;
  end if;
  if v_intent.workflow='connection_test' then
    update public.payment_collections set classification='test',updated_at=now() where id=v_collection.id;
    update public.mpesa_connections set stk_test_collection_id=v_collection.id,updated_at=now()
      where provider_account_id=v_intent.provider_account_id;
    perform public.mpesa_transition_intent(v_intent.id,p_attempt_id,v_intent.state_version,
      array['funds_received'],'completed','0','KES 1 STK test passed',null,v_collection.id);
    return jsonb_build_object('status','completed','collection_id',v_collection.id);
  end if;
  insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id,
    customer_receipt_id,status,allocated_by,cashier_session_id)
  values(v_collection.id,v_intent.company_id,v_collection.amount,
    case when v_intent.subject_type='order' then v_intent.subject_id end,
    case when v_intent.subject_type='customer_receipt' then v_intent.subject_id end,
    'reserved',v_intent.created_by,v_intent.initiating_cashier_session_id)
  on conflict do nothing returning id,status into v_allocation_id,v_allocation_status;
  if v_allocation_id is null then select id,status into v_allocation_id,v_allocation_status
    from public.payment_collection_allocations where collection_id=v_collection.id
      and status in('reserved','posted') and (order_id=v_intent.subject_id
        or customer_receipt_id=v_intent.subject_id); end if;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_intent.cash_amount>0 then
    if v_intent.status='funds_received' then
      perform public.mpesa_transition_intent(v_intent.id,p_attempt_id,v_intent.state_version,
        array['funds_received'],'awaiting_cash','0','M-PESA received; cash balance due',null,v_collection.id);
    end if;
    return jsonb_build_object('status','awaiting_cash','collection_id',v_collection.id,
      'cash_amount',v_intent.cash_amount);
  end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_intent.company_id;
  v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
  select pl.lock_end_date into v_lock_end from public.period_locks pl
    where pl.company_id=v_intent.company_id for key share;
  if v_lock_end is not null and v_original_date<=v_lock_end then
    insert into public.mpesa_late_posting_reviews(company_id,intent_id,collection_id,allocation_id,
      original_business_date)
    values(v_intent.company_id,v_intent.id,v_collection.id,v_allocation_id,v_original_date)
    on conflict(collection_id,allocation_id) do update set intent_id=excluded.intent_id
    returning id into v_review_id;
    update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
      fulfilled_collection_id=v_collection.id,review_reason='provider_payment_for_locked_period',
      result_description='Payment verified; approval is required to post in the current period',
      updated_at=now() where id=v_intent.id and status<>'completed';
    return jsonb_build_object('status','late_review','collection_id',v_collection.id,
      'review_id',v_review_id);
  end if;
  if v_allocation_status='posted' then
    select * into v_intent from public.mpesa_payment_intents where id=v_intent.id for update;
    if v_intent.status<>'completed' then
      perform public.mpesa_transition_intent(v_intent.id,p_attempt_id,v_intent.state_version,
        array[v_intent.status],'completed','0','Payment posted',null,v_collection.id);
    end if;
    return jsonb_build_object('status','completed','collection_id',v_collection.id);
  end if;
  if v_intent.initiating_cashier_session_id is not null then
    select s.status<>'open' into v_late from public.cashier_sessions s
      where s.id=v_intent.initiating_cashier_session_id;
  end if;
  v_context:=row(v_intent.company_id,v_intent.location_id,v_intent.created_by,
    v_intent.initiating_cashier_session_id,v_collection.occurred_at,v_original_date,
    'mpesa_provider',case when v_late then 'provider_settlement_after_till_close' end)
    ::public.posting_context;
  begin
    perform public.mpesa_post_reserved_allocation(
      v_collection.id,v_allocation_id,v_context);
    select * into v_intent from public.mpesa_payment_intents where id=v_intent.id for update;
    perform public.mpesa_transition_intent(v_intent.id,p_attempt_id,v_intent.state_version,
      array['funds_received','manual_review'],'completed','0','Payment posted',null,v_collection.id);
    return jsonb_build_object('status','completed','collection_id',v_collection.id);
  exception when others then
    v_error:=sqlerrm;
  end;
  update public.mpesa_payment_intents set status='manual_review',state_version=state_version+1,
    review_reason='accounting_post_failed',result_description=left(v_error,500),updated_at=now()
    where id=v_intent.id and status<>'completed';
  return jsonb_build_object('status','manual_review','collection_id',v_collection.id);
end $$;
revoke execute on function public.mpesa_apply_collection_to_intent(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mpesa_apply_collection_to_intent(uuid,uuid,uuid) to service_role;

create or replace function public.review_mpesa_late_posting(
  p_review_id uuid,p_approve boolean,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_review public.mpesa_late_posting_reviews%rowtype;
  v_intent public.mpesa_payment_intents%rowtype;v_collection public.payment_collections%rowtype;
  v_allocation public.payment_collection_allocations%rowtype;v_order public.orders%rowtype;
  v_receipt public.customer_receipts%rowtype;v_timezone text;v_posting_date date;
  v_location_id uuid;v_session_id uuid;v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageApprovals')
    or not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ManageApprovals and SettleOrder required'; end if;
  if p_approve is null then raise exception 'review_decision_required'; end if;
  select * into v_review from public.mpesa_late_posting_reviews
    where id=p_review_id and company_id=v_company_id for update;
  if v_review.id is null then raise exception 'mpesa_late_review_not_found'; end if;
  if v_review.status<>'pending' then raise exception 'mpesa_late_review_already_decided'; end if;
  if v_review.intent_id is not null then
    select * into v_intent from public.mpesa_payment_intents where id=v_review.intent_id for update;
  end if;
  select * into v_collection from public.payment_collections where id=v_review.collection_id for update;
  select * into v_allocation from public.payment_collection_allocations
    where id=v_review.allocation_id and collection_id=v_collection.id for update;
  if v_collection.id is null or v_allocation.id is null or v_allocation.status<>'reserved' then
    raise exception 'mpesa_late_review_evidence_mismatch'; end if;
  if v_allocation.order_id is not null then
    select * into v_order from public.orders where id=v_allocation.order_id
      and company_id=v_company_id for update;
    v_location_id:=v_order.location_id;
  elsif v_allocation.customer_receipt_id is not null then
    select * into v_receipt from public.customer_receipts
      where id=v_allocation.customer_receipt_id and company_id=v_company_id for update;
    v_location_id:=v_receipt.location_id;
  else raise exception 'mpesa_late_review_target_missing'; end if;
  v_session_id:=coalesce(v_intent.initiating_cashier_session_id,
    v_allocation.cashier_session_id,v_receipt.cashier_session_id);
  if not p_approve then
    if btrim(coalesce(p_notes,''))='' then raise exception 'review_notes_required'; end if;
    update public.payment_collection_allocations set status='released',released_at=now(),updated_at=now()
      where id=v_review.allocation_id and status='reserved';
    perform public.refresh_payment_collection_status(v_collection.id);
    update public.mpesa_late_posting_reviews set status='rejected',reviewed_by=auth.uid(),
      reviewed_at=now(),review_notes=btrim(p_notes) where id=v_review.id;
    update public.customer_receipts set status='cancelled'
      where id=v_allocation.customer_receipt_id and status='pending_approval';
    update public.mpesa_payment_intents set review_reason='late_posting_rejected',
      result_description='Posting rejected; collection requires reconciliation',updated_at=now()
      where id=v_review.intent_id;
    return jsonb_build_object('status','rejected','review_id',v_review.id,
      'collection_id',v_collection.id);
  end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_posting_date:=(now() at time zone v_timezone)::date;
  if exists(select 1 from public.period_locks pl
    where pl.company_id=v_company_id and v_posting_date<=pl.lock_end_date) then
    raise exception 'no_open_accounting_date'; end if;
  v_context:=row(v_company_id,v_location_id,auth.uid(),v_session_id,
    v_collection.occurred_at,v_posting_date,'mpesa_reconciliation',v_review.reason)
    ::public.posting_context;
  perform public.mpesa_post_reserved_allocation(
    v_collection.id,v_review.allocation_id,v_context);
  update public.mpesa_late_posting_reviews set status='approved',reviewed_by=auth.uid(),
    reviewed_at=now(),review_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=v_review.id;
  update public.payment_collections set classification=null,updated_at=now()
    where id=v_collection.id and classification='surplus';
  if v_review.intent_id is not null then
    select * into v_intent from public.mpesa_payment_intents where id=v_review.intent_id for update;
    perform public.mpesa_transition_intent(v_intent.id,v_intent.current_attempt_id,
      v_intent.state_version,array['manual_review'],'completed','0',
      'Payment approved and posted in the current period',null,v_collection.id);
  else
    update public.mpesa_payment_intents set status='completed',state_version=state_version+1,
      completed_at=now(),review_reason=null,
      result_description='Payment allocated in reconciliation',updated_at=now()
    where id=v_collection.mpesa_intent_id and status='manual_review'
      and fulfilled_collection_id=v_collection.id;
  end if;
  return jsonb_build_object('status','completed','review_id',v_review.id,
    'collection_id',v_collection.id,'posting_date',v_posting_date);
end $$;
revoke execute on function public.review_mpesa_late_posting(uuid,boolean,text) from public,anon;
grant execute on function public.review_mpesa_late_posting(uuid,boolean,text) to authenticated;

create or replace function public.mpesa_finalize_stk_success(
  p_attempt_id uuid,p_provider_receipt text,p_amount bigint,p_occurred_at timestamptz,
  p_payer_phone text,p_payer_name text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt public.mpesa_payment_attempts%rowtype;v_intent public.mpesa_payment_intents%rowtype;
  v_upsert jsonb;v_collection_id uuid;v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_attempt from public.mpesa_payment_attempts where id=p_attempt_id for update;
  select * into v_intent from public.mpesa_payment_intents where id=v_attempt.intent_id for update;
  if v_attempt.id is null then raise exception 'mpesa_attempt_not_found'; end if;
  v_upsert:=public.mpesa_upsert_collection(v_intent.provider_account_id,p_provider_receipt,p_amount,
    p_occurred_at,p_payer_phone,p_payer_name,'DR-'||v_intent.client_ref,'stk','provider_verified',
    v_intent.id,null);
  v_collection_id:=(v_upsert->>'collection_id')::uuid;
  if v_upsert->>'conflict' is not null then
    update public.mpesa_payment_attempts set status='manual_review',query_lease_until=null,updated_at=now()
      where id=v_attempt.id;
    return jsonb_build_object('status','manual_review','collection_id',v_collection_id);
  end if;
  update public.mpesa_payment_attempts set status='paid',result_code='0',
    result_description='Payment verified',query_lease_until=null,updated_at=now() where id=v_attempt.id;
  update public.mpesa_callback_tokens set status='consumed' where attempt_id=v_attempt.id and kind='stk';
  v_result:=public.mpesa_apply_collection_to_intent(v_intent.id,v_attempt.id,v_collection_id);
  return v_result;
end $$;
revoke execute on function public.mpesa_finalize_stk_success(uuid,text,bigint,timestamptz,text,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_finalize_stk_success(uuid,text,bigint,timestamptz,text,text)
  to service_role;

create or replace function public.mpesa_finalize_stk_terminal(
  p_attempt_id uuid,p_result_code text,p_description text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_attempt public.mpesa_payment_attempts%rowtype;v_intent public.mpesa_payment_intents%rowtype;
  v_status text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if p_result_code not in('1','1032','1037','2001') then
    perform public.mpesa_record_query_pending(p_attempt_id,p_result_code,p_description);return;
  end if;
  select * into v_attempt from public.mpesa_payment_attempts where id=p_attempt_id for update;
  select * into v_intent from public.mpesa_payment_intents where id=v_attempt.intent_id for update;
  if v_attempt.id is null or v_intent.current_attempt_id is distinct from v_attempt.id then return; end if;
  if v_intent.fulfilled_collection_id is not null then return; end if;
  v_status:=case p_result_code when '1032' then 'cancelled' when '1037' then 'expired' else 'failed' end;
  update public.mpesa_payment_attempts set status=v_status,result_code=p_result_code,
    result_description=p_description,query_lease_until=null,updated_at=now() where id=v_attempt.id;
  if v_intent.status='pending' then perform public.mpesa_transition_intent(v_intent.id,v_attempt.id,
    v_intent.state_version,array['pending'],v_status,p_result_code,p_description,null,null); end if;
end $$;
revoke execute on function public.mpesa_finalize_stk_terminal(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_finalize_stk_terminal(uuid,text,text) to service_role;

create or replace function public.mpesa_record_c2b_collection(
  p_provider_account_id uuid,p_provider_receipt text,p_amount bigint,p_occurred_at timestamptz,
  p_payer_phone text,p_payer_name text,p_account_reference text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  v_result:=public.mpesa_upsert_collection(p_provider_account_id,p_provider_receipt,p_amount,
    p_occurred_at,p_payer_phone,p_payer_name,p_account_reference,'c2b','provider_notified',null,null);
  if v_result->>'conflict' is null then
    update public.mpesa_connections set c2b_callback_seen_at=now(),updated_at=now()
      where provider_account_id=p_provider_account_id;
  end if;
  return v_result;
end $$;
revoke execute on function public.mpesa_record_c2b_collection(uuid,text,bigint,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.mpesa_record_c2b_collection(uuid,text,bigint,timestamptz,text,text,text)
  to service_role;

create or replace function public.declare_mpesa_manual_fallback(
  p_intent_id uuid,p_provider_receipt text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
  v_result jsonb;v_collection_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if upper(btrim(coalesce(p_provider_receipt,'')))!~'^[A-Z0-9]{8,12}$' then
    raise exception 'valid_mpesa_receipt_required'; end if;
  select i.* into v_intent from public.mpesa_payment_intents i
  join public.payment_provider_accounts a on a.id=i.provider_account_id
  join public.mpesa_platform_settings s on s.singleton
  where i.id=p_intent_id and i.company_id=v_company_id and i.created_by=auth.uid()
    and s.enabled and s.manual_fallback_allowed and a.manual_fallback_until>now() for update of i;
  if v_intent.id is null then raise exception 'manual_fallback_not_available'; end if;
  if v_intent.status<>'created' or v_intent.current_attempt_id is not null then
    raise exception 'manual_fallback_not_allowed_after_stk'; end if;
  v_result:=public.mpesa_upsert_collection(v_intent.provider_account_id,p_provider_receipt,
    v_intent.amount,now(),v_intent.payer_phone,null,'DR-'||v_intent.client_ref,'manual','declared',
    v_intent.id,auth.uid());
  v_collection_id:=(v_result->>'collection_id')::uuid;
  if v_result->>'conflict' is not null then
    return jsonb_build_object('status','manual_review','collection_id',v_collection_id); end if;
  return public.mpesa_apply_collection_to_intent(v_intent.id,null,v_collection_id);
end $$;
revoke execute on function public.declare_mpesa_manual_fallback(uuid,text) from public,anon;
grant execute on function public.declare_mpesa_manual_fallback(uuid,text) to authenticated;

create or replace function public.finalize_mpesa_cash_split(p_intent_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
  v_collection public.payment_collections%rowtype;v_allocation_id uuid;v_cash_payment jsonb;
  v_session_id uuid;v_timezone text;v_posting_date date;v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_intent from public.mpesa_payment_intents
    where id=p_intent_id and company_id=v_company_id for update;
  if v_intent.id is null then raise exception 'mpesa_intent_not_found'; end if;
  if v_intent.status='completed' then return v_intent.subject_id; end if;
  if v_intent.status<>'awaiting_cash' or v_intent.cash_amount<=0
    or v_intent.subject_type<>'order' then raise exception 'mpesa_split_not_ready'; end if;
  select * into v_collection from public.payment_collections
    where id=v_intent.fulfilled_collection_id and provider_status='received'
      and verification_status<>'disputed' for update;
  if v_collection.id is null then raise exception 'verified_collection_required'; end if;
  select id into v_allocation_id from public.payment_collection_allocations
    where collection_id=v_collection.id and order_id=v_intent.subject_id and status='reserved' for update;
  if v_allocation_id is null then raise exception 'collection_reservation_missing'; end if;
  v_session_id:=public.require_open_cashier_session_at_location(
    v_company_id,v_intent.location_id);
  if v_session_id is distinct from v_intent.initiating_cashier_session_id then
    raise exception 'mpesa_cash_split_requires_initiating_session'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_posting_date:=(now() at time zone v_timezone)::date;
  v_context:=row(v_company_id,v_intent.location_id,auth.uid(),v_session_id,now(),v_posting_date,
    'interactive',null)::public.posting_context;
  v_cash_payment:=jsonb_build_array(
    jsonb_build_object('method','cash','amount',v_intent.cash_amount));
  perform public.mpesa_post_reserved_allocation(
    v_collection.id,v_allocation_id,v_context,v_cash_payment);
  perform public.mpesa_transition_intent(v_intent.id,v_intent.current_attempt_id,v_intent.state_version,
    array['awaiting_cash'],'completed','0','M-PESA and exact cash posted',null,v_collection.id);
  return v_intent.subject_id;
end $$;
revoke execute on function public.finalize_mpesa_cash_split(uuid) from public,anon;
grant execute on function public.finalize_mpesa_cash_split(uuid) to authenticated;

create or replace function public.list_unallocated_mpesa_collections(
  p_limit integer default 100,p_before timestamptz default null
)
returns table(id uuid,provider_account_id uuid,provider_receipt text,amount bigint,occurred_at timestamptz,
  payer_phone text,payer_name text,account_reference text,source text,verification_status text,
  classification text,allocation_status text,provider_status text,queue_reason text,intent_id uuid,
  review_reason text,late_review_id uuid,allowed_actions text[],notes text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_can_approve boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  v_can_approve:=public.current_user_has_permission('ManageApprovals')
    and public.current_user_has_permission('SettleOrder');
  return query select c.id,c.provider_account_id,c.provider_receipt,c.amount,c.occurred_at,
    c.payer_phone,c.payer_name,c.account_reference,c.source,c.verification_status,
    c.classification,c.allocation_status,c.provider_status,case
      when lr.id is not null then 'late_posting_review'
      when i.status='manual_review' and i.review_reason='accounting_post_failed' then 'posting_failure'
      when i.status='manual_review' and i.review_reason='stale_attempt_received_money'
        then 'stale_attempt_payment'
      when i.status='manual_review' and i.review_reason='late_posting_rejected'
        then 'late_posting_rejected'
      when i.status='manual_review' then 'manual_review'
      when c.provider_status='reversed' then 'reversal_pending'
      when c.classification='surplus' then 'surplus'
      else 'unallocated' end,c.mpesa_intent_id,coalesce(lr.reason,i.review_reason),lr.id,
    case
      when lr.id is not null and v_can_approve then array['approve_late','reject_late']::text[]
      when lr.id is not null then array[]::text[]
      when i.review_reason='accounting_post_failed' then array['retry_posting']::text[]
      else array['allocate','classify']::text[] end,c.notes,c.created_at
    from public.payment_collections c
    left join public.mpesa_payment_intents i on i.id=c.mpesa_intent_id
    left join lateral(select r.id,r.reason from public.mpesa_late_posting_reviews r
      where r.collection_id=c.id and r.status='pending'
      order by r.created_at desc limit 1) lr on true
    where c.company_id=v_company_id and c.provider='mpesa'
      and ((c.provider_status='received' and c.allocation_status='unallocated'
          and (c.classification is null or c.classification='surplus'))
        or i.status='manual_review'
        or lr.id is not null
        or (c.provider_status='reversed' and exists(select 1
          from public.payment_collection_reversals r where r.collection_id=c.id
            and r.status='accounting_pending')))
      and (p_before is null or c.created_at<p_before)
    order by c.created_at desc limit greatest(1,least(coalesce(p_limit,100),250));
end $$;
revoke execute on function public.list_unallocated_mpesa_collections(integer,timestamptz)
  from public,anon;
grant execute on function public.list_unallocated_mpesa_collections(integer,timestamptz) to authenticated;

create or replace function public.allocate_mpesa_collection(
  p_collection_id uuid,p_order_id uuid default null,p_customer_id uuid default null,
  p_location_id uuid default null,p_notes text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_collection public.payment_collections%rowtype;
  v_order public.orders%rowtype;v_allocation_id uuid;v_receipt_id uuid;v_session_id uuid;
  v_location_id uuid;v_review_id uuid;v_timezone text;v_posting_date date;
  v_original_date date;v_lock_end date;
  v_context public.posting_context;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  if (p_order_id is not null)::int+(p_customer_id is not null)::int<>1 then
    raise exception 'choose_exactly_one_allocation_target'; end if;
  select * into v_collection from public.payment_collections
    where id=p_collection_id and company_id=v_company_id for update;
  if v_collection.id is null or v_collection.provider_status<>'received'
    or v_collection.verification_status='disputed' or v_collection.allocation_status<>'unallocated'
    or coalesce(v_collection.classification,'surplus')<>'surplus'
    then raise exception 'collection_not_allocatable'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=v_company_id;
  v_original_date:=(v_collection.occurred_at at time zone v_timezone)::date;
  select pl.lock_end_date into v_lock_end from public.period_locks pl
    where pl.company_id=v_company_id;
  if p_order_id is not null then
    select * into v_order from public.orders where id=p_order_id and company_id=v_company_id for update;
    if v_order.id is null or v_order.status not in('draft','pending_payment')
      or v_order.total<>v_collection.amount then raise exception 'order_must_exactly_match_collection'; end if;
    if not exists(select 1 from public.location_payment_provider_accounts l
      where l.location_id=v_order.location_id and l.provider_account_id=v_collection.provider_account_id)
      then raise exception 'collection_location_mismatch'; end if;
    v_location_id:=v_order.location_id;
    v_session_id:=public.require_open_cashier_session_at_location(
      v_company_id,v_order.location_id);
    insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id,
      status,allocated_by,cashier_session_id,notes)
    values(v_collection.id,v_company_id,v_collection.amount,v_order.id,'reserved',auth.uid(),
      v_session_id,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_allocation_id;
  else
    if not exists(select 1 from public.customers where id=p_customer_id and company_id=v_company_id)
      then raise exception 'customer_not_found'; end if;
    if p_location_id is null or not exists(select 1 from public.location_payment_provider_accounts l
      where l.provider_account_id=v_collection.provider_account_id and l.location_id=p_location_id
        and l.company_id=v_company_id) then raise exception 'collection_location_required'; end if;
    perform public.resolve_business_location(p_location_id);
    v_location_id:=p_location_id;
    v_session_id:=public.require_open_cashier_session_at_location(v_company_id,p_location_id);
    v_receipt_id:=gen_random_uuid();
    insert into public.customer_receipts(id,company_id,customer_id,amount,method_code,reference,
      location_id,cashier_session_id,client_ref,request_fingerprint,status,created_by)
    select v_receipt_id,v_company_id,p_customer_id,v_collection.amount,'mpesa',
      v_collection.provider_receipt,p_location_id,v_session_id,
      'mpesa-allocation:'||v_collection.id::text||':'||v_receipt_id::text,
      encode(extensions.digest(v_collection.id::text||':'||p_customer_id::text,'sha256'),'hex'),
      'pending_approval',auth.uid();
    insert into public.payment_collection_allocations(collection_id,company_id,amount,
      customer_receipt_id,status,allocated_by,cashier_session_id,notes)
    values(v_collection.id,v_company_id,v_collection.amount,v_receipt_id,'reserved',auth.uid(),
      v_session_id,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_allocation_id;
    update public.customer_receipts set collection_allocation_id=v_allocation_id where id=v_receipt_id;
  end if;
  perform public.refresh_payment_collection_status(v_collection.id);
  if v_lock_end is not null and v_original_date<=v_lock_end then
    insert into public.mpesa_late_posting_reviews(company_id,intent_id,collection_id,allocation_id,
      original_business_date,reason)
    values(v_company_id,null,v_collection.id,v_allocation_id,v_original_date,
      'reconciled_collection_from_locked_period')
    on conflict(collection_id,allocation_id) do update set reason=excluded.reason
    returning id into v_review_id;
    return jsonb_build_object('status','late_review','review_id',v_review_id,
      'collection_id',v_collection.id,'allocation_id',v_allocation_id,'order_id',p_order_id,
      'customer_receipt_id',v_receipt_id);
  end if;
  v_posting_date:=v_original_date;
  v_context:=row(v_company_id,v_location_id,auth.uid(),v_session_id,v_collection.occurred_at,
    v_posting_date,'mpesa_reconciliation',null)::public.posting_context;
  perform public.mpesa_post_reserved_allocation(v_collection.id,v_allocation_id,v_context);
  update public.payment_collections set classification=null,updated_at=now()
    where id=v_collection.id and classification='surplus';
  update public.mpesa_payment_intents set status='completed',state_version=state_version+1,
    completed_at=now(),review_reason=null,result_description='Payment allocated in reconciliation',updated_at=now()
    where id=v_collection.mpesa_intent_id and status='manual_review'
      and fulfilled_collection_id=v_collection.id;
  return jsonb_build_object('status','completed','collection_id',v_collection.id,
    'allocation_id',v_allocation_id,'order_id',p_order_id,'customer_receipt_id',v_receipt_id);
end $$;
revoke execute on function public.allocate_mpesa_collection(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.allocate_mpesa_collection(uuid,uuid,uuid,uuid,text) to authenticated;

create or replace function public.retry_mpesa_collection_posting(p_collection_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_intent public.mpesa_payment_intents%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  select i.* into v_intent from public.mpesa_payment_intents i
    join public.payment_collections c on c.mpesa_intent_id=i.id
    where c.id=p_collection_id and c.company_id=v_company_id and i.status='manual_review'
      and i.review_reason='accounting_post_failed' for update of i;
  if v_intent.id is null then raise exception 'posting_failure_not_found'; end if;
  return public.mpesa_apply_collection_to_intent(v_intent.id,v_intent.current_attempt_id,p_collection_id);
end $$;
revoke execute on function public.retry_mpesa_collection_posting(uuid) from public,anon;
grant execute on function public.retry_mpesa_collection_posting(uuid) to authenticated;

create or replace function public.classify_mpesa_collection(
  p_collection_id uuid,p_classification text,p_notes text
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  if p_classification not in('test','refunded','non_business') then
    raise exception 'invalid_collection_classification'; end if;
  if btrim(coalesce(p_notes,''))='' then raise exception 'classification_notes_required'; end if;
  update public.payment_collections set classification=p_classification,notes=btrim(p_notes),updated_at=now()
    where id=p_collection_id and company_id=v_company_id and allocation_status='unallocated';
  if not found then raise exception 'unallocated_collection_not_found'; end if;
end $$;
revoke execute on function public.classify_mpesa_collection(uuid,text,text) from public,anon;
grant execute on function public.classify_mpesa_collection(uuid,text,text) to authenticated;

create or replace function public.list_reversible_mpesa_collections(p_limit integer default 50)
returns table(collection_id uuid,provider_receipt text,amount bigint,occurred_at timestamptz,
  allocation_id uuid,order_code text,customer_receipt_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required'; end if;
  return query select c.id,c.provider_receipt,c.amount,c.occurred_at,a.id,o.code,a.customer_receipt_id
  from public.payment_collections c join public.payment_collection_allocations a
    on a.collection_id=c.id and a.status='posted'
  left join public.orders o on o.id=a.order_id
  where c.company_id=v_company_id and c.provider_status='received'
  order by coalesce(c.occurred_at,c.created_at) desc
  limit greatest(1,least(coalesce(p_limit,50),100));
end $$;
revoke execute on function public.list_reversible_mpesa_collections(integer) from public,anon;
grant execute on function public.list_reversible_mpesa_collections(integer) to authenticated;

create or replace function public.request_mpesa_reversal(
  p_collection_id uuid,p_provider_reference text,p_provider_reversed_at timestamptz,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_collection public.payment_collections%rowtype;
  v_allocation public.payment_collection_allocations%rowtype;v_result jsonb;v_reversal_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  if btrim(coalesce(p_provider_reference,''))='' or btrim(coalesce(p_reason,''))=''
    or p_provider_reversed_at is null then raise exception 'provider_reversal_evidence_required'; end if;
  select * into v_collection from public.payment_collections
    where id=p_collection_id and company_id=v_company_id for update;
  if v_collection.id is null then raise exception 'collection_not_found'; end if;
  select * into v_allocation from public.payment_collection_allocations
    where collection_id=v_collection.id and status='posted' order by created_at desc limit 1 for update;
  insert into public.payment_collection_reversals(collection_id,allocation_id,company_id,
    provider_reference,provider_reversed_at,reason,recorded_by)
  values(v_collection.id,v_allocation.id,v_company_id,btrim(p_provider_reference),
    p_provider_reversed_at,btrim(p_reason),auth.uid())
  on conflict(collection_id,provider_reference) do update set reason=excluded.reason
  returning id into v_reversal_id;
  update public.payment_collections set provider_status='reversed',allocation_status='reversed',
    classification='refunded',updated_at=now() where id=v_collection.id;
  if v_allocation.id is null then
    update public.payment_collection_reversals set status='completed',completed_at=now()
      where id=v_reversal_id;
    return jsonb_build_object('status','completed','reversal_id',v_reversal_id); end if;
  if v_allocation.order_id is not null then
    select public.post_payment_reversal(p.id,btrim(p_reason)) into v_result
      from public.payments p where p.collection_allocation_id=v_allocation.id;
  else
    v_result:=public.post_customer_receipt_reversal(v_allocation.customer_receipt_id,btrim(p_reason));
  end if;
  update public.payment_collection_reversals set
    status=case when v_result->>'status'='completed' then 'completed' else 'accounting_pending' end,
    accounting_resource_id=coalesce(nullif(v_result->>'resource_id','')::uuid,
      nullif(v_result->>'approval_id','')::uuid),
    completed_at=case when v_result->>'status'='completed' then now() end where id=v_reversal_id;
  return v_result||jsonb_build_object('reversal_id',v_reversal_id,'collection_id',v_collection.id);
end $$;
revoke execute on function public.request_mpesa_reversal(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.request_mpesa_reversal(uuid,text,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform testing, callback rotation and activation
-- ---------------------------------------------------------------------------
create or replace function public.platform_create_mpesa_test_attempt(
  p_connection_id uuid,p_phone text,p_amount bigint,p_callback_token_hash text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_account public.payment_provider_accounts%rowtype;v_intent_id uuid;v_attempt_id uuid;
begin
  perform public.assert_platform_admin();
  if btrim(coalesce(p_phone,''))!~'^254[17][0-9]{8}$' or p_amount<>1
    then raise exception 'kes_1_test_required'; end if;
  if p_callback_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_callback_token_hash'; end if;
  select * into v_account from public.payment_provider_accounts
    where id=p_connection_id and provider='mpesa' for update;
  if v_account.id is null then raise exception 'mpesa_connection_not_found'; end if;
  if v_account.status<>'testing' then raise exception 'connection_not_in_testing'; end if;
  v_intent_id:=gen_random_uuid();v_attempt_id:=gen_random_uuid();
  insert into public.mpesa_payment_intents(id,company_id,provider_account_id,location_id,workflow,
    subject_type,subject_id,client_ref,request_fingerprint,payer_phone,amount,status,
    created_by,created_by_role)
  select v_intent_id,v_account.company_id,v_account.id,l.location_id,'connection_test',
    'connection_test',gen_random_uuid(),'mpesa-test:'||v_intent_id::text,
    encode(extensions.digest(v_intent_id::text,'sha256'),'hex'),btrim(p_phone),1,'requesting',
    auth.uid(),'platform_admin'
  from public.location_payment_provider_accounts l where l.provider_account_id=v_account.id
  order by l.created_at limit 1;
  if not found then raise exception 'connection_has_no_location'; end if;
  insert into public.mpesa_payment_attempts(id,intent_id,company_id,attempt_number)
    values(v_attempt_id,v_intent_id,v_account.company_id,1);
  update public.mpesa_payment_intents set current_attempt_id=v_attempt_id where id=v_intent_id;
  insert into public.mpesa_callback_tokens(company_id,provider_account_id,attempt_id,kind,
    token_hash,status,activated_at,expires_at,created_by)
  values(v_account.company_id,v_account.id,v_attempt_id,'stk',p_callback_token_hash,'active',now(),
    now()+interval '24 hours',auth.uid());
  update public.payment_provider_accounts set status='testing',updated_by=auth.uid(),updated_at=now()
    where id=v_account.id and status<>'active';
  return v_attempt_id;
end $$;
revoke execute on function public.platform_create_mpesa_test_attempt(uuid,text,bigint,text)
  from public,anon;
grant execute on function public.platform_create_mpesa_test_attempt(uuid,text,bigint,text)
  to authenticated;

create or replace function public.platform_prepare_mpesa_c2b_token(
  p_connection_id uuid,p_callback_token_hash text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid;v_id uuid;
begin
  perform public.assert_platform_admin();
  if p_callback_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_callback_token_hash'; end if;
  select company_id into v_company_id from public.payment_provider_accounts
    where id=p_connection_id and provider='mpesa';
  if v_company_id is null then raise exception 'mpesa_connection_not_found'; end if;
  if not exists(select 1 from public.mpesa_connections c
    join public.mpesa_daraja_apps d on d.id=c.daraja_app_id
    join public.mpesa_onboarding_requests r on r.id=c.onboarding_request_id
    where c.provider_account_id=p_connection_id and d.oauth_verified_at is not null
      and r.status='daraja_setup') then raise exception 'credentials_verification_required'; end if;
  delete from public.mpesa_callback_tokens where provider_account_id=p_connection_id
    and kind='c2b' and status='pending';
  insert into public.mpesa_callback_tokens(company_id,provider_account_id,kind,token_hash,status,created_by)
    values(v_company_id,p_connection_id,'c2b',p_callback_token_hash,'pending',auth.uid())
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.platform_prepare_mpesa_c2b_token(uuid,text) from public,anon;
grant execute on function public.platform_prepare_mpesa_c2b_token(uuid,text) to authenticated;

create or replace function public.platform_activate_mpesa_c2b_token(p_token_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_token public.mpesa_callback_tokens%rowtype;
begin
  perform public.assert_platform_admin();
  select * into v_token from public.mpesa_callback_tokens
    where id=p_token_id and kind='c2b' and status='pending' for update;
  if v_token.id is null then raise exception 'pending_callback_token_not_found'; end if;
  update public.mpesa_callback_tokens set status='retiring',retire_after=now()+interval '24 hours'
    where provider_account_id=v_token.provider_account_id and kind='c2b' and status='active';
  update public.mpesa_callback_tokens set status='active',activated_at=now(),expires_at=null
    where id=v_token.id;
  update public.mpesa_connections set c2b_registered_at=now(),updated_at=now()
    where provider_account_id=v_token.provider_account_id;
end $$;
revoke execute on function public.platform_activate_mpesa_c2b_token(uuid) from public,anon;
grant execute on function public.platform_activate_mpesa_c2b_token(uuid) to authenticated;

create or replace function public.platform_cancel_mpesa_c2b_token(p_token_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.mpesa_callback_tokens set status='retired'
    where id=p_token_id and kind='c2b' and status='pending';
  if not found then raise exception 'pending_callback_token_not_found'; end if;
end $$;
revoke execute on function public.platform_cancel_mpesa_c2b_token(uuid) from public,anon;
grant execute on function public.platform_cancel_mpesa_c2b_token(uuid) to authenticated;

create or replace function public.platform_update_mpesa_connection(
  p_connection_id uuid,p_action text,p_notes text default null,p_fallback_until timestamptz default null,
  p_collection_id uuid default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_account public.payment_provider_accounts%rowtype;v_connection public.mpesa_connections%rowtype;
  v_request_status text;
begin
  perform public.assert_platform_admin();
  select * into v_account from public.payment_provider_accounts where id=p_connection_id for update;
  select * into v_connection from public.mpesa_connections where provider_account_id=p_connection_id for update;
  if v_account.id is null then raise exception 'mpesa_connection_not_found'; end if;
  select r.status into v_request_status from public.mpesa_onboarding_requests r
    where r.id=v_connection.onboarding_request_id for update;
  if p_action='credentials_verified' then
    if v_request_status<>'daraja_setup' then raise exception 'invalid_commissioning_stage'; end if;
    update public.mpesa_daraja_apps set status='verified',oauth_verified_at=now(),updated_by=auth.uid(),
      updated_at=now() where id=v_connection.daraja_app_id;
  elsif p_action='testing' then
    if v_request_status<>'daraja_setup'
      or not exists(select 1 from public.mpesa_daraja_apps d
        where d.id=v_connection.daraja_app_id and d.oauth_verified_at is not null)
      or v_connection.c2b_registered_at is null then raise exception 'connection_setup_incomplete'; end if;
    update public.payment_provider_accounts set status='testing',updated_by=auth.uid(),updated_at=now()
      where id=v_account.id;
    update public.mpesa_onboarding_requests set status='testing',updated_at=now()
      where id=v_connection.onboarding_request_id;
  elsif p_action='c2b_test_passed' then
    if v_request_status<>'testing' then raise exception 'invalid_commissioning_stage'; end if;
    if not exists(select 1 from public.payment_collections c where c.id=p_collection_id
      and c.provider_account_id=v_account.id and c.amount=1 and c.source='c2b'
      and c.verification_status in('provider_notified','provider_verified'))
      then raise exception 'valid_kes_1_c2b_collection_required'; end if;
    update public.payment_collections set classification='test',updated_at=now() where id=p_collection_id;
    update public.mpesa_connections set c2b_test_collection_id=p_collection_id,updated_at=now()
      where provider_account_id=v_account.id;
  elsif p_action='activate' then
    if v_request_status<>'testing' then raise exception 'invalid_commissioning_stage'; end if;
    if v_account.environment<>'production' then raise exception 'production_connection_required'; end if;
    if not exists(select 1 from public.mpesa_daraja_apps d where d.id=v_connection.daraja_app_id
      and d.oauth_verified_at is not null) or v_connection.c2b_registered_at is null
      or v_connection.stk_test_collection_id is null or v_connection.c2b_test_collection_id is null
      then raise exception 'mpesa_activation_checks_incomplete'; end if;
    update public.payment_provider_accounts set status='active',activated_at=now(),disabled_at=null,
      updated_by=auth.uid(),updated_at=now() where id=v_account.id;
    update public.mpesa_onboarding_requests set status='live',operator_notes=p_notes,updated_at=now()
      where id=v_connection.onboarding_request_id;
  elsif p_action='disable' then
    if v_account.status<>'active' then raise exception 'connection_not_active'; end if;
    update public.payment_provider_accounts set status='disabled',disabled_at=now(),
      updated_by=auth.uid(),updated_at=now() where id=v_account.id;
  elsif p_action='set_fallback' then
    if v_account.status<>'active' then raise exception 'connection_not_active'; end if;
    if p_fallback_until is not null and p_fallback_until>now()+interval '7 days'
      then raise exception 'manual_fallback_maximum_7_days'; end if;
    update public.payment_provider_accounts set manual_fallback_until=p_fallback_until,
      updated_by=auth.uid(),updated_at=now() where id=v_account.id;
  else raise exception 'invalid_mpesa_connection_action'; end if;
end $$;
revoke execute on function public.platform_update_mpesa_connection(uuid,text,text,timestamptz,uuid)
  from public,anon;
grant execute on function public.platform_update_mpesa_connection(uuid,text,text,timestamptz,uuid)
  to authenticated;

create or replace function public.mpesa_commissioning_state(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_request public.mpesa_onboarding_requests%rowtype;v_account public.payment_provider_accounts%rowtype;
  v_connection public.mpesa_connections%rowtype;v_app public.mpesa_daraja_apps%rowtype;
  v_stage text;v_actions jsonb:='[]'::jsonb;v_blockers jsonb:='[]'::jsonb;
  v_oauth boolean:=false;v_callbacks boolean:=false;v_stk boolean:=false;v_c2b boolean:=false;
begin
  select * into v_request from public.mpesa_onboarding_requests where id=p_request_id;
  if v_request.id is null then raise exception 'onboarding_request_not_found'; end if;
  select a.* into v_account from public.payment_provider_accounts a
    join public.mpesa_connections c on c.provider_account_id=a.id
    where c.onboarding_request_id=v_request.id;
  if v_account.id is not null then
    select * into v_connection from public.mpesa_connections where provider_account_id=v_account.id;
    select * into v_app from public.mpesa_daraja_apps where id=v_connection.daraja_app_id;
    v_oauth:=v_app.oauth_verified_at is not null;
    v_callbacks:=v_connection.c2b_registered_at is not null;
    v_stk:=v_connection.stk_test_collection_id is not null;
    v_c2b:=v_connection.c2b_test_collection_id is not null;
  end if;
  if v_request.status='requested' then v_stage:='business_review';v_actions:='["begin_review","reject"]';
  elsif v_request.status='reviewing' then
    v_stage:='merchant_verification';v_actions:='["merchant_verified","reject"]';
  elsif v_request.status='merchant_verification' then
    v_stage:='daraja_connection';v_actions:='["configure_connection","reject"]';
  elsif v_request.status='daraja_setup' and not v_oauth then
    v_stage:='credential_verification';v_actions:='["verify_credentials","reject"]';
  elsif v_request.status='daraja_setup' and not v_callbacks then
    v_stage:='callback_registration';v_actions:='["register_callbacks","reject"]';
  elsif v_request.status='daraja_setup' then
    v_stage:='ready_for_testing';v_actions:='["start_testing","reject"]';
  elsif v_request.status='testing' then
    v_stage:=case when v_stk and v_c2b then 'activation_review' else 'payment_testing' end;
    if not v_stk then v_actions:=v_actions||'"run_stk_test"'::jsonb; end if;
    if not v_c2b then v_actions:=v_actions||'"verify_direct_test"'::jsonb; end if;
    if v_stk and v_c2b and v_account.environment='production' then
      v_actions:=v_actions||'"activate"'::jsonb;
    end if;
    v_actions:=v_actions||'"reject"'::jsonb;
  elsif v_request.status='live' then
    v_stage:='live';v_actions:='["set_fallback","disable"]';
  else v_stage:=v_request.status;end if;
  if v_account.id is null and v_request.status not in(
    'requested','reviewing','merchant_verification','rejected','cancelled') then
    v_blockers:=v_blockers||'"connection_missing"'::jsonb; end if;
  if v_account.id is not null and v_account.environment<>'production' then
    v_blockers:=v_blockers||'"production_connection_required_for_activation"'::jsonb; end if;
  if v_request.status='testing' and not v_stk then
    v_blockers:=v_blockers||'"kes_1_stk_test_required"'::jsonb; end if;
  if v_request.status='testing' and not v_c2b then
    v_blockers:=v_blockers||'"kes_1_direct_payment_test_required"'::jsonb; end if;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,
    'stage',v_stage,'connection_id',v_account.id,'allowed_actions',v_actions,'blockers',v_blockers,
    'checks',jsonb_build_object('business_details',true,
      'merchant_verified',v_request.status not in('requested','reviewing'),
      'connection_configured',v_account.id is not null,'production',v_account.environment='production',
      'credentials_verified',v_oauth,'callbacks_registered',v_callbacks,
      'stk_test_passed',v_stk,'direct_payment_test_passed',v_c2b,
      'active',v_account.status='active'));
end $$;
revoke execute on function public.mpesa_commissioning_state(uuid) from public,anon,authenticated;
grant execute on function public.mpesa_commissioning_state(uuid) to service_role;

create or replace function public.platform_mpesa_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object('settings',(select to_jsonb(s) from public.mpesa_platform_settings s
      where s.singleton),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('company_name',co.name,
      'commissioning',public.mpesa_commissioning_state(r.id))
      order by r.created_at desc) from public.mpesa_onboarding_requests r
      join public.companies co on co.id=r.company_id),'[]'::jsonb),
    'daraja_apps',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'company_id',d.company_id,
      'app_name',d.app_name,'environment',d.environment,'status',d.status,
      'oauth_verified',d.oauth_verified_at is not null) order by d.created_at desc)
      from public.mpesa_daraja_apps d),'[]'::jsonb),
    'connections',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'company_id',a.company_id,'company_name',co.name,'display_name',a.display_name,
      'environment',a.environment,'status',a.status,'manual_fallback_until',a.manual_fallback_until,
      'shortcode_type',c.shortcode_type,'organization_shortcode',c.organization_shortcode,
      'business_shortcode',c.business_shortcode,'party_b',c.party_b,'daraja_app_id',c.daraja_app_id,
      'commissioning',public.mpesa_commissioning_state(c.onboarding_request_id),
      'oauth_verified',d.oauth_verified_at is not null,'c2b_registered',c.c2b_registered_at is not null,
      'stk_test_passed',c.stk_test_collection_id is not null,
      'c2b_test_passed',c.c2b_test_collection_id is not null,
      'c2b_test_candidates',coalesce((select jsonb_agg(jsonb_build_object('id',pc.id,
        'provider_receipt',pc.provider_receipt,'occurred_at',pc.occurred_at))
        from public.payment_collections pc where pc.provider_account_id=a.id and pc.amount=1
          and pc.source='c2b' and pc.classification is null),'[]'::jsonb),
      'backlog',(select count(*) from public.mpesa_provider_events e
        where e.provider_account_id=a.id and e.status in('queued','retry','processing')),
      'manual_review',(select count(*) from public.mpesa_payment_intents i
        where i.provider_account_id=a.id and i.status='manual_review')
    ) order by a.created_at desc) from public.payment_provider_accounts a
      join public.companies co on co.id=a.company_id
      join public.mpesa_connections c on c.provider_account_id=a.id
      join public.mpesa_daraja_apps d on d.id=c.daraja_app_id),'[]'::jsonb)) into v_result;
  return v_result;
end $$;
revoke execute on function public.platform_mpesa_overview() from public,anon;
grant execute on function public.platform_mpesa_overview() to authenticated;

create or replace function public.purge_mpesa_raw_payloads()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_count bigint;
begin
  update public.mpesa_provider_events set payload=null,payload_purged_at=now()
    where payload is not null and received_at<now()-interval '90 days';
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke execute on function public.purge_mpesa_raw_payloads() from public,anon,authenticated;
grant execute on function public.purge_mpesa_raw_payloads() to service_role;

-- Missed callbacks and provider queries are retried every minute. Raw bodies
-- are deleted daily; hashes and normalized collection facts remain.
select cron.unschedule(jobid) from cron.job where jobname='mpesa-processing-sweep';
select cron.schedule('mpesa-processing-sweep','* * * * *',
  $$select public.sweep_mpesa_processing()$$);
select cron.unschedule(jobid) from cron.job where jobname='mpesa-raw-payload-retention';
select cron.schedule('mpesa-raw-payload-retention','31 2 * * *',
  $$select public.purge_mpesa_raw_payloads()$$);

comment on table public.payment_collections is
  'Canonical money received from a provider. Never delete to resolve reconciliation.';
comment on table public.mpesa_provider_events is
  'Service-only durable callback inbox. Raw payload is retained for 90 days.';
comment on function public.mpesa_availability(uuid) is
  'Minimal checkout capability for one location; exposes no provider configuration.';
comment on function public.mpesa_setup_status() is
  'Merchant setup detail; requires ManageMpesaIntegration.';
comment on function public.list_unallocated_mpesa_collections(integer,timestamptz) is
  'Normalized reconciliation queue; requires ManageReconciliation.';
