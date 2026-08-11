-- Customer deposits and supplier advances. Unapplied funds stay outside AR/AP.
-- until an explicit, FIFO application settles a sale or purchase.

-- ---------------------------------------------------------------------------
-- Control accounts and settlement markers
-- ---------------------------------------------------------------------------

insert into public.ledger_accounts(company_id,code,name,type,is_system,allow_manual_posting)
select c.id,'CUSTOMER_DEPOSITS','Customer Deposits','liability',true,false
from public.companies c
on conflict(company_id,code) do nothing;

insert into public.ledger_accounts(company_id,code,name,type,is_system,allow_manual_posting)
select c.id,'SUPPLIER_ADVANCES','Supplier Advances','asset',true,false
from public.companies c
on conflict(company_id,code) do nothing;

create or replace function public.seed_prepayment_control_accounts()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.ledger_accounts(company_id,code,name,type,is_system,allow_manual_posting)
  values
    (new.id,'CUSTOMER_DEPOSITS','Customer Deposits','liability',true,false),
    (new.id,'SUPPLIER_ADVANCES','Supplier Advances','asset',true,false)
  on conflict(company_id,code) do nothing;
  return new;
end; $$;
revoke execute on function public.seed_prepayment_control_accounts() from public,anon,authenticated;
grant execute on function public.seed_prepayment_control_accounts() to service_role;
create trigger companies_seed_prepayment_control_accounts
  after insert on public.companies
  for each row execute function public.seed_prepayment_control_accounts();

alter table public.payments
  add column settlement_kind text not null default 'tender',
  add column customer_deposit_application_id uuid;

alter table public.payments
  add constraint payments_settlement_kind_check
    check(settlement_kind in ('tender','customer_deposit'));

alter table public.purchase_payments
  add column settlement_kind text not null default 'account',
  add column supplier_advance_application_id uuid,
  add column status text not null default 'settled';

alter table public.purchase_payments
  add constraint purchase_payments_settlement_kind_check
    check(settlement_kind in ('account','supplier_advance')),
  add constraint purchase_payments_status_check
    check(status in ('settled','cancelled'));

alter table public.purchases
  add column if not exists client_ref text;
create unique index purchases_company_client_ref_unique
  on public.purchases(company_id,client_ref) where client_ref is not null;

alter table public.purchase_drafts
  add column if not exists advance_amount bigint not null default 0
    check(advance_amount>=0),
  add column if not exists client_ref text;
create unique index if not exists purchase_drafts_company_client_ref_unique
  on public.purchase_drafts(company_id,client_ref) where client_ref is not null;

-- ---------------------------------------------------------------------------
-- Operational subledgers
-- ---------------------------------------------------------------------------

create table public.customer_deposits(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount bigint not null check(amount>0),
  method_code text not null,
  reference text,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid references public.cashier_sessions(id),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text
);
create index customer_deposits_party_fifo_idx
  on public.customer_deposits(company_id,customer_id,created_at,id)
  where status='active';
create unique index customer_deposits_client_ref_unique
  on public.customer_deposits(company_id,client_ref) where client_ref is not null;

create table public.customer_deposit_applications(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  order_id uuid not null references public.orders(id),
  amount bigint not null check(amount>0),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text
);
create index customer_deposit_applications_order_idx
  on public.customer_deposit_applications(order_id,created_at);
create unique index customer_deposit_applications_client_ref_unique
  on public.customer_deposit_applications(company_id,client_ref)
  where client_ref is not null;

create table public.customer_deposit_allocations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  application_id uuid not null references public.customer_deposit_applications(id),
  deposit_id uuid not null references public.customer_deposits(id),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  unique(application_id,deposit_id)
);
create index customer_deposit_allocations_deposit_idx
  on public.customer_deposit_allocations(deposit_id);

create table public.customer_deposit_refunds(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount bigint not null check(amount>0),
  method_code text not null,
  reference text,
  reason text not null,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid references public.cashier_sessions(id),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index customer_deposit_refunds_client_ref_unique
  on public.customer_deposit_refunds(company_id,client_ref) where client_ref is not null;

create table public.customer_deposit_refund_allocations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  refund_id uuid not null references public.customer_deposit_refunds(id),
  deposit_id uuid not null references public.customer_deposits(id),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  unique(refund_id,deposit_id)
);
create index customer_deposit_refund_allocations_deposit_idx
  on public.customer_deposit_refund_allocations(deposit_id);

create table public.supplier_advances(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  amount bigint not null check(amount>0),
  account_code text not null,
  reference text,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid references public.cashier_sessions(id),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text
);
create index supplier_advances_party_fifo_idx
  on public.supplier_advances(company_id,supplier_id,created_at,id)
  where status='active';
create unique index supplier_advances_client_ref_unique
  on public.supplier_advances(company_id,client_ref) where client_ref is not null;

create table public.supplier_advance_applications(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  purchase_id uuid not null references public.purchases(id),
  amount bigint not null check(amount>0),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text
);
create index supplier_advance_applications_purchase_idx
  on public.supplier_advance_applications(purchase_id,created_at);
create unique index supplier_advance_applications_client_ref_unique
  on public.supplier_advance_applications(company_id,client_ref)
  where client_ref is not null;

create table public.supplier_advance_allocations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  application_id uuid not null references public.supplier_advance_applications(id),
  advance_id uuid not null references public.supplier_advances(id),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  unique(application_id,advance_id)
);
create index supplier_advance_allocations_advance_idx
  on public.supplier_advance_allocations(advance_id);

create table public.supplier_advance_returns(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  amount bigint not null check(amount>0),
  account_code text not null,
  reference text,
  reason text not null,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid references public.cashier_sessions(id),
  client_ref text,
  status text not null default 'active' check(status in ('active','reversed')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index supplier_advance_returns_client_ref_unique
  on public.supplier_advance_returns(company_id,client_ref) where client_ref is not null;

create table public.supplier_advance_return_allocations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  return_id uuid not null references public.supplier_advance_returns(id),
  advance_id uuid not null references public.supplier_advances(id),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  unique(return_id,advance_id)
);
create index supplier_advance_return_allocations_advance_idx
  on public.supplier_advance_return_allocations(advance_id);

alter table public.payments
  add constraint payments_customer_deposit_application_fk
  foreign key(customer_deposit_application_id)
  references public.customer_deposit_applications(id);
alter table public.payments
  add constraint payments_settlement_shape_check check(
    (settlement_kind='tender' and customer_deposit_application_id is null)
    or (settlement_kind='customer_deposit' and customer_deposit_application_id is not null
      and method_code='customer_deposit')
  );
create unique index payments_customer_deposit_application_unique
  on public.payments(customer_deposit_application_id)
  where customer_deposit_application_id is not null;

create or replace function public.validate_payment_location()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.settlement_kind='customer_deposit' then return new; end if;
  if not exists(
    select 1 from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.location_id=new.location_id
    where pm.company_id=new.company_id and pm.code=new.method_code
      and pm.enabled and lpm.enabled
  ) then raise exception 'payment_method_unavailable_at_location: %',new.method_code; end if;
  return new;
end; $$;

alter table public.purchase_payments
  add constraint purchase_payments_supplier_advance_application_fk
  foreign key(supplier_advance_application_id)
  references public.supplier_advance_applications(id);
alter table public.purchase_payments
  add constraint purchase_payments_settlement_shape_check check(
    (settlement_kind='account' and supplier_advance_application_id is null)
    or (settlement_kind='supplier_advance' and supplier_advance_application_id is not null
      and account_code='SUPPLIER_ADVANCES')
  );
create unique index purchase_payments_supplier_advance_application_unique
  on public.purchase_payments(supplier_advance_application_id)
  where supplier_advance_application_id is not null;

-- Read access is financial; operational users receive narrow values through RPCs.
do $$
declare t text;
begin
  foreach t in array array[
    'customer_deposits','customer_deposit_applications','customer_deposit_allocations',
    'customer_deposit_refunds','customer_deposit_refund_allocations',
    'supplier_advances','supplier_advance_applications','supplier_advance_allocations',
    'supplier_advance_returns','supplier_advance_return_allocations'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format(
      'create policy %I on public.%I for select using (
         (company_id=(select public.current_company_id())
          and (select public.current_user_has_permission(''ViewFinancials'')))
         or (select public.is_platform_admin()))',t||'_financial_read',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()',t||'_audit',t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Authoritative availability views
-- ---------------------------------------------------------------------------

create view public.customer_deposit_source_balances
with(security_invoker=true) as
select d.id,d.company_id,d.customer_id,d.amount,d.method_code,d.reference,d.created_at,
  (case when d.status='active' then d.amount else 0 end
   -coalesce((select sum(x.amount) from public.customer_deposit_allocations x
     join public.customer_deposit_applications a on a.id=x.application_id
     where x.deposit_id=d.id and a.status='active'),0)
   -coalesce((select sum(x.amount) from public.customer_deposit_refund_allocations x
     join public.customer_deposit_refunds r on r.id=x.refund_id
     where x.deposit_id=d.id and r.status='active'),0))::bigint available
from public.customer_deposits d;

create view public.customer_deposit_balances
with(security_invoker=true) as
select c.id customer_id,c.company_id,
  coalesce(sum(b.available),0)::bigint balance
from public.customers c
left join public.customer_deposit_source_balances b on b.customer_id=c.id and b.company_id=c.company_id
where not c.is_supplier
group by c.id,c.company_id;

create view public.supplier_advance_source_balances
with(security_invoker=true) as
select a.id,a.company_id,a.supplier_id,a.amount,a.account_code,a.reference,a.created_at,
  (case when a.status='active' then a.amount else 0 end
   -coalesce((select sum(x.amount) from public.supplier_advance_allocations x
     join public.supplier_advance_applications p on p.id=x.application_id
     where x.advance_id=a.id and p.status='active'),0)
   -coalesce((select sum(x.amount) from public.supplier_advance_return_allocations x
     join public.supplier_advance_returns r on r.id=x.return_id
     where x.advance_id=a.id and r.status='active'),0))::bigint available
from public.supplier_advances a;

create view public.supplier_advance_balances
with(security_invoker=true) as
select c.id supplier_id,c.company_id,
  coalesce(sum(b.available),0)::bigint balance
from public.customers c
left join public.supplier_advance_source_balances b on b.supplier_id=c.id and b.company_id=c.company_id
where c.is_supplier
group by c.id,c.company_id;

grant select on public.customer_deposit_source_balances,public.customer_deposit_balances,
  public.supplier_advance_source_balances,public.supplier_advance_balances to authenticated;

create or replace function public.customer_deposit_available(p_customer_id uuid)
returns bigint language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_balance bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder')
    and not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: SettleOrder, ReverseOrder or ViewFinancials required'; end if;
  select coalesce(sum(b.available),0)::bigint into v_balance
  from public.customer_deposit_source_balances b
  where b.company_id=v_company_id and b.customer_id=p_customer_id;
  return coalesce(v_balance,0);
end; $$;

create or replace function public.supplier_advance_available(p_supplier_id uuid)
returns bigint language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_balance bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    and not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases or ViewFinancials required'; end if;
  select coalesce(sum(b.available),0)::bigint into v_balance
  from public.supplier_advance_source_balances b
  where b.company_id=v_company_id and b.supplier_id=p_supplier_id;
  return coalesce(v_balance,0);
end; $$;

revoke execute on function public.customer_deposit_available(uuid),
  public.supplier_advance_available(uuid) from anon,public;
grant execute on function public.customer_deposit_available(uuid),
  public.supplier_advance_available(uuid) to authenticated;

create or replace function public.customer_deposit_activity(
  p_customer_id uuid,
  p_limit integer default 50
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id
    and company_id=v_company_id and not is_supplier) then raise exception 'customer_not_found'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
  into v_result from (
    select * from (
      select d.id::text id,d.created_at occurred_at,'deposit_received'::text activity_kind,
        d.amount,'increase'::text direction,d.method_code reference,d.status,
        'Deposit received'::text description
      from public.customer_deposits d
      where d.company_id=v_company_id and d.customer_id=p_customer_id
      union all
      select (d.id::text||':reversal'),d.reversed_at,'deposit_reversed',d.amount,'decrease',
        d.method_code,'reversed','Deposit receipt reversed'
      from public.customer_deposits d
      where d.company_id=v_company_id and d.customer_id=p_customer_id and d.reversed_at is not null
      union all
      select a.id::text,a.created_at,'deposit_applied',a.amount,'decrease',o.code,a.status,
        'Applied to sale '||o.code
      from public.customer_deposit_applications a join public.orders o on o.id=a.order_id
      where a.company_id=v_company_id and a.customer_id=p_customer_id
      union all
      select (a.id::text||':reversal'),a.reversed_at,'application_reversed',a.amount,'increase',
        o.code,'reversed','Application reversed for sale '||o.code
      from public.customer_deposit_applications a join public.orders o on o.id=a.order_id
      where a.company_id=v_company_id and a.customer_id=p_customer_id and a.reversed_at is not null
      union all
      select r.id::text,r.created_at,'deposit_refunded',r.amount,'decrease',r.method_code,r.status,
        'Unused deposit refunded'
      from public.customer_deposit_refunds r
      where r.company_id=v_company_id and r.customer_id=p_customer_id
    ) events
    order by occurred_at desc,id desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) x;
  return v_result;
end; $$;

create or replace function public.supplier_advance_activity(
  p_supplier_id uuid,
  p_limit integer default 50
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required'; end if;
  if not exists(select 1 from public.customers where id=p_supplier_id
    and company_id=v_company_id and is_supplier) then raise exception 'supplier_not_found'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
  into v_result from (
    select * from (
      select a.id::text id,a.created_at occurred_at,'advance_paid'::text activity_kind,
        a.amount,'increase'::text direction,a.account_code reference,a.status,
        'Advance paid to supplier'::text description
      from public.supplier_advances a
      where a.company_id=v_company_id and a.supplier_id=p_supplier_id
      union all
      select (a.id::text||':reversal'),a.reversed_at,'advance_reversed',a.amount,'decrease',
        a.account_code,'reversed','Supplier advance reversed'
      from public.supplier_advances a
      where a.company_id=v_company_id and a.supplier_id=p_supplier_id and a.reversed_at is not null
      union all
      select p.id::text,p.created_at,'advance_applied',p.amount,'decrease',
        coalesce(i.reference,i.id::text),p.status,'Applied to purchase '||coalesce(i.reference,i.id::text)
      from public.supplier_advance_applications p join public.purchases i on i.id=p.purchase_id
      where p.company_id=v_company_id and p.supplier_id=p_supplier_id
      union all
      select (p.id::text||':reversal'),p.reversed_at,'application_reversed',p.amount,'increase',
        coalesce(i.reference,i.id::text),'reversed',
        'Application reversed for purchase '||coalesce(i.reference,i.id::text)
      from public.supplier_advance_applications p join public.purchases i on i.id=p.purchase_id
      where p.company_id=v_company_id and p.supplier_id=p_supplier_id and p.reversed_at is not null
      union all
      select r.id::text,r.created_at,'advance_returned',r.amount,'decrease',r.account_code,r.status,
        'Unused advance returned'
      from public.supplier_advance_returns r
      where r.company_id=v_company_id and r.supplier_id=p_supplier_id
    ) events
    order by occurred_at desc,id desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) x;
  return v_result;
end; $$;

revoke execute on function public.customer_deposit_activity(uuid,integer),
  public.supplier_advance_activity(uuid,integer) from public,anon;
grant execute on function public.customer_deposit_activity(uuid,integer),
  public.supplier_advance_activity(uuid,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Money-account and FIFO mutation helpers
-- ---------------------------------------------------------------------------

create or replace function public.prepayment_tender_account(
  p_location_id uuid,
  p_method_code text,
  p_reference text default null
)
returns text language plpgsql security definer set search_path='' as $$
declare v_method record; v_reconciliation_type text;
begin
  select * into v_method
  from public.available_payment_methods(p_location_id) m
  where m.code=p_method_code;
  if v_method is null then raise exception 'payment_method_not_available: %',p_method_code; end if;
  select pm.reconciliation_type into v_reconciliation_type
  from public.payment_methods pm
  where pm.company_id=public.current_company_id() and pm.code=p_method_code;
  if coalesce(v_reconciliation_type,'')='statement_match'
    and nullif(btrim(p_reference),'') is null then
    raise exception 'reconciliation_reference_required: %',p_method_code;
  end if;
  perform public.require_asset_leaf_account(public.current_company_id(),v_method.ledger_account_code);
  return v_method.ledger_account_code;
end; $$;
revoke execute on function public.prepayment_tender_account(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepayment_tender_account(uuid,text,text) to service_role;

create or replace function public.prepayment_money_account(
  p_location_id uuid,
  p_account_code text,
  p_reference text default null
)
returns text language plpgsql security definer set search_path='' as $$
declare v_requires_reference boolean;
begin
  perform public.require_asset_leaf_account(public.current_company_id(),p_account_code);
  select bool_or(coalesce(pm.reconciliation_type,'')='statement_match')
    into v_requires_reference
  from public.available_payment_methods(p_location_id) m
  join public.payment_methods pm
    on pm.company_id=public.current_company_id() and pm.code=m.code
  where m.ledger_account_code=p_account_code;
  if v_requires_reference is null then
    raise exception 'payment_account_not_available_at_location: %',p_account_code;
  end if;
  if v_requires_reference and nullif(btrim(p_reference),'') is null then
    raise exception 'reconciliation_reference_required: %',p_account_code;
  end if;
  return p_account_code;
end; $$;
revoke execute on function public.prepayment_money_account(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.prepayment_money_account(uuid,text,text) to service_role;

create or replace function public.record_customer_deposit(
  p_customer_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null,
  p_client_ref text default null,
  p_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_location_id uuid; v_session_id uuid;
  v_account_code text; v_id uuid; v_customer public.customers%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.customer_deposits
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  select * into v_customer from public.customers
  where id=p_customer_id and company_id=v_company_id and not is_supplier and deleted_at is null;
  if v_customer.id is null then raise exception 'customer_not_found'; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  v_account_code:=public.prepayment_tender_account(v_location_id,p_method_code,p_reference);
  insert into public.customer_deposits(
    company_id,customer_id,amount,method_code,reference,location_id,cashier_session_id,client_ref,created_by)
  values(v_company_id,p_customer_id,p_amount,p_method_code,nullif(btrim(p_reference),''),
    v_location_id,v_session_id,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  perform public.post_journal_entry(v_company_id,'CustomerDeposit',v_id::text,
    'Customer deposit from '||concat_ws(' ',v_customer.first_name,v_customer.last_name),jsonb_build_array(
      jsonb_build_object('account_code',v_account_code,'debit',p_amount,
        'meta',jsonb_build_object('customerId',p_customer_id,'locationId',v_location_id,
          'method',p_method_code,'reference',p_reference)),
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',p_amount,
        'meta',jsonb_build_object('customerId',p_customer_id,'locationId',v_location_id))));
  return v_id;
end; $$;

create or replace function public.record_supplier_advance(
  p_supplier_id uuid,
  p_amount bigint,
  p_account_code text,
  p_reference text default null,
  p_client_ref text default null,
  p_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_location_id uuid; v_session_id uuid;
  v_id uuid; v_supplier public.customers%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.supplier_advances
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  select * into v_supplier from public.customers
  where id=p_supplier_id and company_id=v_company_id and is_supplier and deleted_at is null
    and coalesce(supplier_active,true);
  if v_supplier.id is null then raise exception 'supplier_not_found'; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  perform public.prepayment_money_account(v_location_id,p_account_code,p_reference);
  insert into public.supplier_advances(
    company_id,supplier_id,amount,account_code,reference,location_id,cashier_session_id,client_ref,created_by)
  values(v_company_id,p_supplier_id,p_amount,p_account_code,nullif(btrim(p_reference),''),
    v_location_id,v_session_id,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  perform public.post_journal_entry(v_company_id,'SupplierAdvance',v_id::text,
    'Advance paid to '||concat_ws(' ',v_supplier.first_name,v_supplier.last_name),jsonb_build_array(
      jsonb_build_object('account_code','SUPPLIER_ADVANCES','debit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'locationId',v_location_id,'reference',p_reference)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'locationId',v_location_id,'method',p_account_code))));
  return v_id;
end; $$;

create or replace function public.apply_customer_deposit(
  p_order_id uuid,
  p_amount bigint,
  p_client_ref text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_order public.orders%rowtype; v_id uuid;
  v_due bigint; v_remaining bigint:=p_amount; v_available bigint; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.customer_deposit_applications
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null or v_order.status<>'completed' or v_order.customer_id is null then
    raise exception 'settleable_customer_order_not_found'; end if;
  select v_order.total-coalesce(sum(p.amount) filter(where p.status='settled'),0)
    into v_due from public.payments p where p.order_id=p_order_id;
  if p_amount>v_due then raise exception 'ar_overpayment: % exceeds outstanding %',p_amount,v_due; end if;
  perform 1 from public.customer_deposits d
  where d.company_id=v_company_id and d.customer_id=v_order.customer_id and d.status='active'
  order by d.created_at,d.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.customer_deposit_source_balances b
  where b.company_id=v_company_id and b.customer_id=v_order.customer_id;
  if p_amount>v_available then raise exception 'insufficient_customer_deposit: % available',v_available; end if;
  insert into public.customer_deposit_applications(company_id,customer_id,order_id,amount,client_ref,created_by)
  values(v_company_id,v_order.customer_id,p_order_id,p_amount,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.customer_deposit_source_balances b
    where b.company_id=v_company_id and b.customer_id=v_order.customer_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.customer_deposit_allocations(company_id,application_id,deposit_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  insert into public.payments(company_id,order_id,method_code,amount,status,location_id,
    settlement_kind,customer_deposit_application_id)
  values(v_company_id,p_order_id,'customer_deposit',p_amount,'settled',v_order.location_id,
    'customer_deposit',v_id);
  perform public.post_journal_entry(v_company_id,'CustomerDepositApplication',v_id::text,
    'Apply customer deposit to '||v_order.code,jsonb_build_array(
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','debit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code)),
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',p_amount,'order_id',p_order_id,
        'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code))));
  return v_id;
end; $$;

create or replace function public.apply_supplier_advance(
  p_purchase_id uuid,
  p_amount bigint,
  p_client_ref text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_purchase public.purchases%rowtype; v_id uuid;
  v_due bigint; v_remaining bigint:=p_amount; v_available bigint; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.supplier_advance_applications
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  select * into v_purchase from public.purchases
  where id=p_purchase_id and company_id=v_company_id and is_credit for update;
  if v_purchase.id is null then raise exception 'credit_purchase_not_found'; end if;
  select v_purchase.total_cost-coalesce(sum(pp.amount) filter(where pp.status='settled'),0)
    into v_due from public.purchase_payments pp where pp.purchase_id=p_purchase_id;
  if p_amount>v_due then raise exception 'ap_overpayment: % exceeds outstanding %',p_amount,v_due; end if;
  perform 1 from public.supplier_advances a
  where a.company_id=v_company_id and a.supplier_id=v_purchase.supplier_id and a.status='active'
  order by a.created_at,a.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.supplier_advance_source_balances b
  where b.company_id=v_company_id and b.supplier_id=v_purchase.supplier_id;
  if p_amount>v_available then raise exception 'insufficient_supplier_advance: % available',v_available; end if;
  insert into public.supplier_advance_applications(company_id,supplier_id,purchase_id,amount,client_ref,created_by)
  values(v_company_id,v_purchase.supplier_id,p_purchase_id,p_amount,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.supplier_advance_source_balances b
    where b.company_id=v_company_id and b.supplier_id=v_purchase.supplier_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.supplier_advance_allocations(company_id,application_id,advance_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
    settlement_kind,supplier_advance_application_id,status)
  values(v_company_id,p_purchase_id,p_amount,'SUPPLIER_ADVANCES',auth.uid(),
    'supplier_advance',v_id,'settled');
  perform public.post_journal_entry(v_company_id,'SupplierAdvanceApplication',v_id::text,
    'Apply supplier advance to '||coalesce(v_purchase.reference,v_purchase.id::text),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,
        'meta',jsonb_build_object('supplierId',v_purchase.supplier_id,'purchaseId',p_purchase_id)),
      jsonb_build_object('account_code','SUPPLIER_ADVANCES','credit',p_amount,
        'meta',jsonb_build_object('supplierId',v_purchase.supplier_id,'purchaseId',p_purchase_id))));
  return v_id;
end; $$;

create or replace function public.refund_customer_deposit(
  p_customer_id uuid,
  p_amount bigint,
  p_reason text,
  p_method_code text default null,
  p_reference text default null,
  p_client_ref text default null,
  p_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_id uuid; v_location_id uuid; v_session_id uuid;
  v_method text; v_account_code text; v_remaining bigint:=p_amount; v_available bigint;
  v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.customer_deposit_refunds
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  perform 1 from public.customers where id=p_customer_id and company_id=v_company_id
    and not is_supplier and deleted_at is null;
  if not found then raise exception 'customer_not_found'; end if;
  perform 1 from public.customer_deposits d
  where d.company_id=v_company_id and d.customer_id=p_customer_id and d.status='active'
  order by d.created_at,d.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.customer_deposit_source_balances b
  where b.company_id=v_company_id and b.customer_id=p_customer_id;
  if p_amount>v_available then raise exception 'deposit_over_refund: % available',v_available; end if;
  v_method:=nullif(btrim(p_method_code),'');
  if v_method is null then
    -- A single refund header can post to only one money account. Preserve the
    -- original channel automatically only when every FIFO source consumed by
    -- this refund used that same channel; otherwise require an explicit choice.
    for v_source in
      select b.* from public.customer_deposit_source_balances b
      where b.company_id=v_company_id and b.customer_id=p_customer_id and b.available>0
      order by b.created_at,b.id
    loop
      exit when v_remaining=0;
      v_take:=least(v_remaining,v_source.available);
      if v_method is null then v_method:=v_source.method_code;
      elsif v_method<>v_source.method_code then
        raise exception 'refund_channel_required_for_mixed_sources';
      end if;
      v_remaining:=v_remaining-v_take;
    end loop;
    v_remaining:=p_amount;
  end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  v_account_code:=public.prepayment_tender_account(v_location_id,v_method,p_reference);
  insert into public.customer_deposit_refunds(company_id,customer_id,amount,method_code,reference,
    reason,location_id,cashier_session_id,client_ref,created_by)
  values(v_company_id,p_customer_id,p_amount,v_method,nullif(btrim(p_reference),''),btrim(p_reason),
    v_location_id,v_session_id,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.customer_deposit_source_balances b
    where b.company_id=v_company_id and b.customer_id=p_customer_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.customer_deposit_refund_allocations(company_id,refund_id,deposit_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  perform public.post_journal_entry(v_company_id,'CustomerDepositRefund',v_id::text,
    'Refund unused customer deposit: '||btrim(p_reason),jsonb_build_array(
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','debit',p_amount,
        'meta',jsonb_build_object('customerId',p_customer_id,'reason',btrim(p_reason))),
      jsonb_build_object('account_code',v_account_code,'credit',p_amount,
        'meta',jsonb_build_object('customerId',p_customer_id,'locationId',v_location_id,
          'method',v_method,'reference',p_reference,'reason',btrim(p_reason)))));
  return v_id;
end; $$;

create or replace function public.record_supplier_advance_return(
  p_supplier_id uuid,
  p_amount bigint,
  p_account_code text,
  p_reason text,
  p_reference text default null,
  p_client_ref text default null,
  p_location_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_id uuid; v_location_id uuid; v_session_id uuid;
  v_remaining bigint:=p_amount; v_available bigint; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_client_ref is not null then
    select id into v_id from public.supplier_advance_returns
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_id is not null then return v_id; end if;
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  perform 1 from public.customers where id=p_supplier_id and company_id=v_company_id
    and is_supplier and deleted_at is null and coalesce(supplier_active,true);
  if not found then raise exception 'supplier_not_found'; end if;
  perform 1 from public.supplier_advances a
  where a.company_id=v_company_id and a.supplier_id=p_supplier_id and a.status='active'
  order by a.created_at,a.id for update;
  select coalesce(sum(b.available),0)::bigint into v_available
  from public.supplier_advance_source_balances b
  where b.company_id=v_company_id and b.supplier_id=p_supplier_id;
  if p_amount>v_available then raise exception 'advance_over_return: % available',v_available; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  perform public.prepayment_money_account(v_location_id,p_account_code,p_reference);
  insert into public.supplier_advance_returns(company_id,supplier_id,amount,account_code,reference,
    reason,location_id,cashier_session_id,client_ref,created_by)
  values(v_company_id,p_supplier_id,p_amount,p_account_code,nullif(btrim(p_reference),''),btrim(p_reason),
    v_location_id,v_session_id,nullif(btrim(p_client_ref),''),auth.uid()) returning id into v_id;
  for v_source in
    select b.* from public.supplier_advance_source_balances b
    where b.company_id=v_company_id and b.supplier_id=p_supplier_id and b.available>0
    order by b.created_at,b.id
  loop
    exit when v_remaining=0; v_take:=least(v_remaining,v_source.available); v_remaining:=v_remaining-v_take;
    insert into public.supplier_advance_return_allocations(company_id,return_id,advance_id,amount)
    values(v_company_id,v_id,v_source.id,v_take);
  end loop;
  perform public.post_journal_entry(v_company_id,'SupplierAdvanceReturn',v_id::text,
    'Supplier returned unused advance: '||btrim(p_reason),jsonb_build_array(
      jsonb_build_object('account_code',p_account_code,'debit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'locationId',v_location_id,'reference',p_reference)),
      jsonb_build_object('account_code','SUPPLIER_ADVANCES','credit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'reason',btrim(p_reason)))));
  return v_id;
end; $$;

create or replace function public.reverse_customer_deposit_application(
  p_application_id uuid,
  p_reason text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_app public.customer_deposit_applications%rowtype;
  v_order public.orders%rowtype;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_app from public.customer_deposit_applications
  where id=p_application_id and company_id=v_company_id for update;
  if v_app.id is null then raise exception 'customer_deposit_application_not_found'; end if;
  if v_app.status='reversed' then return v_app.id; end if;
  select * into v_order from public.orders where id=v_app.order_id and company_id=v_company_id for update;
  if v_order.status='voided' then raise exception 'application_already_restored_by_void'; end if;
  update public.customer_deposit_applications set status='reversed',reversed_by=auth.uid(),
    reversed_at=now(),reversal_reason=btrim(p_reason) where id=v_app.id;
  update public.payments set status='cancelled'
  where customer_deposit_application_id=v_app.id and status='settled';
  perform public.post_journal_entry(v_company_id,'CustomerDepositApplicationReversal',v_app.id::text,
    'Reverse customer deposit application: '||btrim(p_reason),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','debit',v_app.amount,'order_id',v_app.order_id,
        'meta',jsonb_build_object('customerId',v_app.customer_id,'reason',btrim(p_reason))),
      jsonb_build_object('account_code','CUSTOMER_DEPOSITS','credit',v_app.amount,'order_id',v_app.order_id,
        'meta',jsonb_build_object('customerId',v_app.customer_id,'reason',btrim(p_reason)))));
  return v_app.id;
end; $$;

create or replace function public.reverse_supplier_advance_application(
  p_application_id uuid,
  p_reason text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_app public.supplier_advance_applications%rowtype;
begin
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_app from public.supplier_advance_applications
  where id=p_application_id and company_id=v_company_id for update;
  if v_app.id is null then raise exception 'supplier_advance_application_not_found'; end if;
  if v_app.status='reversed' then return v_app.id; end if;
  perform 1 from public.purchases
  where id=v_app.purchase_id and company_id=v_company_id for update;
  update public.supplier_advance_applications set status='reversed',reversed_by=auth.uid(),
    reversed_at=now(),reversal_reason=btrim(p_reason) where id=v_app.id;
  update public.purchase_payments set status='cancelled'
  where supplier_advance_application_id=v_app.id and status='settled';
  perform public.post_journal_entry(v_company_id,'SupplierAdvanceApplicationReversal',v_app.id::text,
    'Reverse supplier advance application: '||btrim(p_reason),jsonb_build_array(
      jsonb_build_object('account_code','SUPPLIER_ADVANCES','debit',v_app.amount,
        'meta',jsonb_build_object('supplierId',v_app.supplier_id,'purchaseId',v_app.purchase_id,'reason',btrim(p_reason))),
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','credit',v_app.amount,
        'meta',jsonb_build_object('supplierId',v_app.supplier_id,'purchaseId',v_app.purchase_id,'reason',btrim(p_reason)))));
  return v_app.id;
end; $$;

-- Voiding reverses all order journals in one entry. Marking the application
-- reversed here restores FIFO availability without posting a second reversal.
create or replace function public.restore_customer_deposits_after_void()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from 'voided' and new.status='voided' then
    update public.customer_deposit_applications
    set status='reversed',reversed_by=new.voided_by,reversed_at=coalesce(new.voided_at,now()),
      reversal_reason=coalesce(new.void_reason,'Order void')
    where company_id=new.company_id and order_id=new.id and status='active';
  end if;
  return new;
end; $$;
revoke execute on function public.restore_customer_deposits_after_void() from public,anon,authenticated;
grant execute on function public.restore_customer_deposits_after_void() to service_role;
create trigger orders_restore_customer_deposits_after_void
  after update of status on public.orders
  for each row execute function public.restore_customer_deposits_after_void();

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean language sql immutable set search_path='' as $$
  select p_source_type = any(array[
    'Payment','CreditSale','PaymentAllocation','Expense','PurchaseExpense','InterAccountTransfer',
    'SupplierPayment','Refund','PaymentReversal','CustomerDeposit',
    'CustomerDepositRefund','SupplierAdvance','SupplierAdvanceReturn'
  ])
$$;

revoke execute on function public.record_customer_deposit(uuid,bigint,text,text,text,uuid),
  public.record_supplier_advance(uuid,bigint,text,text,text,uuid),
  public.apply_customer_deposit(uuid,bigint,text),
  public.apply_supplier_advance(uuid,bigint,text),
  public.refund_customer_deposit(uuid,bigint,text,text,text,text,uuid),
  public.record_supplier_advance_return(uuid,bigint,text,text,text,text,uuid),
  public.reverse_customer_deposit_application(uuid,text),
  public.reverse_supplier_advance_application(uuid,text)
from public,anon;
grant execute on function public.record_customer_deposit(uuid,bigint,text,text,text,uuid),
  public.record_supplier_advance(uuid,bigint,text,text,text,uuid),
  public.apply_customer_deposit(uuid,bigint,text),
  public.apply_supplier_advance(uuid,bigint,text),
  public.refund_customer_deposit(uuid,bigint,text,text,text,text,uuid),
  public.record_supplier_advance_return(uuid,bigint,text,text,text,text,uuid),
  public.reverse_customer_deposit_application(uuid,text),
  public.reverse_supplier_advance_application(uuid,text)
to authenticated;

-- Customer deposit refunds use the existing execute-or-request approval model.
alter table public.approvals drop constraint if exists approvals_type_check;
alter table public.approvals add constraint approvals_type_check check(type in(
  'overdraft','customer_credit','below_wholesale','order_reversal','external_account_payment',
  'sale_refund','payment_reversal','customer_deposit_refund'
));

do $migration$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.can_approve_request_type(text)'::regprocedure);
  v_definition:=replace(v_definition,
    '(''order_reversal'',''sale_refund'',''payment_reversal'')',
    '(''order_reversal'',''sale_refund'',''payment_reversal'',''customer_deposit_refund'')');
  execute v_definition;
  v_definition:=pg_get_functiondef('public.assert_approval_authority(text)'::regprocedure);
  v_definition:=replace(v_definition,
    '(''order_reversal'',''sale_refund'',''payment_reversal'')',
    '(''order_reversal'',''sale_refund'',''payment_reversal'',''customer_deposit_refund'')');
  execute v_definition;
  v_definition:=pg_get_functiondef('public.notify_approval_approvers(uuid)'::regprocedure);
  v_definition:=replace(v_definition,
    '(''order_reversal'',''sale_refund'',''payment_reversal'')',
    '(''order_reversal'',''sale_refund'',''payment_reversal'',''customer_deposit_refund'')');
  execute v_definition;

  v_definition:=pg_get_functiondef('public.approve_request(uuid,text)'::regprocedure);
  v_definition:=replace(v_definition,
    'elsif v_approval.type=''below_wholesale'' then',
    $branch$elsif v_approval.type='customer_deposit_refund' then
    v_resource_id:=public.refund_customer_deposit(
      v_approval.subject_id,
      (v_approval.metadata->>'amount')::bigint,
      coalesce(v_approval.metadata->>'reason','Approved customer deposit refund'),
      nullif(v_approval.metadata->>'method_code',''),
      nullif(v_approval.metadata->>'reference',''),
      nullif(v_approval.metadata->>'client_ref',''),
      nullif(v_approval.metadata->>'location_id','')::uuid
    );

  elsif v_approval.type='below_wholesale' then$branch$);
  execute v_definition;
end;
$migration$;

create or replace function public.post_customer_deposit_refund(
  p_customer_id uuid,p_amount bigint,p_reason text,p_method_code text default null,
  p_reference text default null,p_client_ref text default null,p_location_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_location_id uuid; v_method text;
  v_resource_id uuid; v_approval_id uuid; v_metadata jsonb; v_existing_metadata jsonb;
  v_client_ref text; v_remaining bigint:=p_amount; v_take bigint; v_source record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder')
    and not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: ReverseOrder or SettleOrder required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if p_amount>public.customer_deposit_available(p_customer_id) then
    raise exception 'deposit_over_refund'; end if;
  v_method:=nullif(btrim(p_method_code),'');
  if v_method is null then
    for v_source in
      select b.* from public.customer_deposit_source_balances b
      where b.company_id=v_company_id and b.customer_id=p_customer_id and b.available>0
      order by b.created_at,b.id
    loop
      exit when v_remaining=0;
      v_take:=least(v_remaining,v_source.available);
      if v_method is null then v_method:=v_source.method_code;
      elsif v_method<>v_source.method_code then
        raise exception 'refund_channel_required_for_mixed_sources';
      end if;
      v_remaining:=v_remaining-v_take;
    end loop;
  end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform public.prepayment_tender_account(v_location_id,v_method,p_reference);
  if public.current_user_has_permission('ReverseOrder') then
    v_resource_id:=public.refund_customer_deposit(p_customer_id,p_amount,p_reason,p_method_code,
      p_reference,p_client_ref,v_location_id);
    return jsonb_build_object('status','completed','resource_id',v_resource_id,
      'subject_id',p_customer_id);
  end if;
  v_client_ref:=coalesce(nullif(btrim(p_client_ref),''),gen_random_uuid()::text);
  v_metadata:=jsonb_build_object('customer_id',p_customer_id,'amount',p_amount,
    'reason',btrim(p_reason),'method_code',nullif(btrim(p_method_code),''),'reference',p_reference,
    'client_ref',v_client_ref,'location_id',v_location_id);
  insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
  values(v_company_id,'customer_deposit_refund','customer',p_customer_id,v_metadata,auth.uid())
  on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
  do nothing returning id into v_approval_id;
  if v_approval_id is null then
    select id,metadata into v_approval_id,v_existing_metadata from public.approvals where company_id=v_company_id
      and type='customer_deposit_refund' and subject_id=p_customer_id and status='pending';
    if nullif(v_existing_metadata->>'client_ref','') is distinct from v_client_ref then
      raise exception 'customer_deposit_refund_already_pending: %',v_approval_id;
    end if;
  end if;
  return jsonb_build_object('status','approval_required','approval_id',v_approval_id,
    'subject_id',p_customer_id);
end; $$;

revoke execute on function public.refund_customer_deposit(uuid,bigint,text,text,text,text,uuid)
from authenticated;
grant execute on function public.refund_customer_deposit(uuid,bigint,text,text,text,text,uuid)
to service_role;
revoke execute on function public.post_customer_deposit_refund(uuid,bigint,text,text,text,text,uuid)
from public,anon;
grant execute on function public.post_customer_deposit_refund(uuid,bigint,text,text,text,text,uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Mixed sale settlement. The existing completion routine remains the single
-- owner of inventory/COGS/revenue posting. A transaction-local projected
-- credit value makes its limit check use residual AR while revenue still posts
-- at the document's gross value.
-- ---------------------------------------------------------------------------

do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.complete_order(uuid,jsonb,uuid)'::regprocedure);
  v_definition:=replace(v_definition,
    'if v_customer is null or not v_customer.is_credit_approved then',
    'if v_customer is null or (coalesce(nullif(current_setting(''app.sale_residual_credit_amount'',true),'''')::bigint,v_order.total)>0 and not v_customer.is_credit_approved) then');
  v_definition:=replace(v_definition,
    'if v_ar_balance + v_order.total > v_customer.credit_limit',
    'if v_ar_balance + coalesce(nullif(current_setting(''app.sale_residual_credit_amount'',true),'''')::bigint,v_order.total) > v_customer.credit_limit');
  execute v_definition;

  v_definition:=pg_get_functiondef('public.enforce_credit_serialization()'::regprocedure);
  v_definition:=replace(v_definition,
    'if not v_party.is_credit_approved then',
    'if coalesce(nullif(current_setting(''app.sale_residual_credit_amount'',true),'''')::bigint,new.debit)>0 and not v_party.is_credit_approved then');
  v_definition:=replace(v_definition,
    'v_balance + new.debit > v_party.credit_limit',
    'v_balance + coalesce(nullif(current_setting(''app.sale_residual_credit_amount'',true),'''')::bigint,new.debit) > v_party.credit_limit');
  execute v_definition;
end $$;

create or replace function public.complete_order_with_prepayment(
  p_order_id uuid,
  p_payments jsonb,
  p_deposit_amount bigint,
  p_credit_amount bigint,
  p_client_ref text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_order public.orders%rowtype; v_payment jsonb;
  v_tender_total bigint:=0; v_amount bigint; v_payment_id uuid; v_account_code text;
  v_method record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder')
    and nullif(current_setting('app.approved_prepayment_order_id',true),'')::uuid
      is distinct from p_order_id then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if coalesce(p_deposit_amount,0)<0 or coalesce(p_credit_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status='completed' then return v_order.id; end if;
  if v_order.status not in ('draft','pending_payment') or v_order.customer_id is null then
    raise exception 'identified_customer_required_for_mixed_settlement'; end if;
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if v_payment->>'method'='credit' then raise exception 'credit_is_not_a_tender'; end if;
    v_amount:=coalesce((v_payment->>'amount')::bigint,0);
    if v_amount<=0 then raise exception 'invalid_tender_amount'; end if;
    v_tender_total:=v_tender_total+v_amount;
  end loop;
  if v_tender_total+coalesce(p_deposit_amount,0)+coalesce(p_credit_amount,0)<>v_order.total then
    raise exception 'payment_mismatch: tender % + deposit % + credit % <> order total %',
      v_tender_total,p_deposit_amount,p_credit_amount,v_order.total;
  end if;
  if coalesce(p_deposit_amount,0)>public.customer_deposit_available(v_order.customer_id) then
    raise exception 'insufficient_customer_deposit'; end if;
  perform set_config('app.business_location_id',v_order.location_id::text,true);
  perform public.require_open_cashier_session(v_company_id);
  perform set_config('app.sale_residual_credit_amount',coalesce(p_credit_amount,0)::text,true);
  perform public.complete_order(p_order_id,'[]'::jsonb,auth.uid());
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    v_amount:=(v_payment->>'amount')::bigint;
    select * into v_method from public.available_payment_methods(v_order.location_id) m
    where m.code=v_payment->>'method';
    if v_method is null then raise exception 'payment_method_not_available: %',v_payment->>'method'; end if;
    if not v_method.is_cashier_controlled and not public.current_user_has_permission('ViewFinancials') then
      raise exception 'approval_required: external_account_payment'; end if;
    v_account_code:=public.prepayment_tender_account(v_order.location_id,v_payment->>'method',v_payment->>'reference');
    insert into public.payments(company_id,order_id,method_code,amount,reference,mpesa_receipt,
      status,location_id,settlement_kind)
    values(v_company_id,p_order_id,v_payment->>'method',v_amount,nullif(btrim(v_payment->>'reference'),''),
      nullif(btrim(v_payment->>'mpesa_receipt'),''),'settled',v_order.location_id,'tender')
    returning id into v_payment_id;
    perform public.post_journal_entry(v_company_id,'MixedSaleTender',v_payment_id::text,
      'Tender applied to sale '||v_order.code,jsonb_build_array(
        jsonb_build_object('account_code',v_account_code,'debit',v_amount,'order_id',p_order_id,
          'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code,
            'method',v_payment->>'method','reference',v_payment->>'reference')),
        jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_amount,'order_id',p_order_id,
          'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code))));
  end loop;
  if coalesce(p_deposit_amount,0)>0 then
    perform public.apply_customer_deposit(p_order_id,p_deposit_amount,
      case when p_client_ref is null then null else p_client_ref||':deposit' end);
  end if;
  return p_order_id;
end; $$;

-- Extend the existing approval executor without changing legacy approval
-- payloads. Mixed approvals carry the complete settlement and revalidate it
-- through the same atomic completion RPC at execution time.
do $migration$
declare v_definition text; v_replacement text;
begin
  v_definition:=pg_get_functiondef('public.approve_request(uuid,text)'::regprocedure);
  v_replacement:=replace(v_definition,
    $old$and (select coalesce(sum((t->>'amount')::bigint),0)
        from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total$old$,
    $new$and (
        (not coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)=v_order.total)
        or (coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false)
          and (select coalesce(sum((t->>'amount')::bigint),0)
            from jsonb_array_elements(v_approval.metadata->'tenders') t)
            +coalesce((v_approval.metadata->>'deposit_amount')::bigint,0)
            +coalesce((v_approval.metadata->>'credit_amount')::bigint,0)=v_order.total)
      )$new$);
  if v_replacement=v_definition then
    raise exception 'external approval settlement validation not found';
  end if;
  v_definition:=v_replacement;
  v_replacement:=replace(v_definition,
    $old$perform public.complete_order(v_order.id,v_approval.metadata->'tenders',auth.uid());$old$,
    $new$if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='overdraft' and a.status='pending') then
          -- Both approvals are independent. The second decision completes the sale.
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          if exists(select 1 from public.approvals a where a.company_id=v_company_id
            and a.subject_id=v_order.id and a.type='overdraft' and a.status='approved') then
            perform set_config('app.approved_credit_order_id',v_order.id::text,true);
          end if;
          perform public.complete_order_with_prepayment(v_order.id,
            v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''));
        end if;
      else
        perform public.complete_order(v_order.id,v_approval.metadata->'tenders',auth.uid());
      end if;$new$);
  if v_replacement=v_definition then
    raise exception 'external approval execution call not found';
  end if;
  v_definition:=v_replacement;
  v_replacement:=replace(v_definition,
    $old$perform public.complete_order(v_order.id,'[]',auth.uid());$old$,
    $new$if coalesce((v_approval.metadata->>'prepayment_settlement')::boolean,false) then
        if exists(select 1 from public.approvals a where a.company_id=v_company_id
          and a.subject_id=v_order.id and a.type='external_account_payment' and a.status='pending') then
          v_resource_id:=v_order.id;
        else
          perform set_config('app.approved_prepayment_order_id',v_order.id::text,true);
          perform set_config('app.approved_credit_order_id',v_order.id::text,true);
          perform public.complete_order_with_prepayment(v_order.id,
            v_approval.metadata->'tenders',
            coalesce((v_approval.metadata->>'deposit_amount')::bigint,0),
            coalesce((v_approval.metadata->>'credit_amount')::bigint,0),
            nullif(v_approval.metadata->>'client_ref',''));
        end if;
      else
        perform public.complete_order(v_order.id,'[]',auth.uid());
      end if;$new$);
  if v_replacement=v_definition then
    raise exception 'overdraft approval execution call not found';
  end if;
  execute v_replacement;
end;
$migration$;

create or replace function public.post_sale_with_prepayment_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_deposit_amount bigint,
  p_credit_amount bigint,
  p_client_ref text default null,
  p_draft_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id(); v_location_id uuid; v_order_id uuid;
  v_order public.orders%rowtype; v_customer public.customers%rowtype; v_payment jsonb;
  v_tender_total bigint:=0; v_amount bigint; v_external_tenders jsonb;
  v_external_approval_id uuid; v_overdraft_approval_id uuid;
  v_ar_balance bigint; v_metadata jsonb; v_overdraft_metadata jsonb;
  v_needs_external boolean; v_needs_overdraft boolean;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  if p_customer_id is null then raise exception 'identified_customer_required_for_mixed_settlement'; end if;
  if coalesce(p_deposit_amount,0)<0 or coalesce(p_credit_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  perform set_config('app.business_location_id',v_location_id::text,true);
  v_order_id:=public.post_sale(p_customer_id,p_lines,'[]'::jsonb,true,p_client_ref,p_draft_id);
  select * into v_order from public.orders where id=v_order_id and company_id=v_company_id for update;
  if v_order.status='completed' then
    return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
  end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %',v_order_id,v_order.status;
  end if;
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if v_payment->>'method'='credit' then raise exception 'credit_is_not_a_tender'; end if;
    v_amount:=coalesce((v_payment->>'amount')::bigint,0);
    if v_amount<=0 then raise exception 'invalid_tender_amount'; end if;
    v_tender_total:=v_tender_total+v_amount;
    perform public.prepayment_tender_account(v_location_id,v_payment->>'method',v_payment->>'reference');
  end loop;
  if v_tender_total+coalesce(p_deposit_amount,0)+coalesce(p_credit_amount,0)<>v_order.total then
    raise exception 'payment_mismatch: tender % + deposit % + credit % <> order total %',
      v_tender_total,p_deposit_amount,p_credit_amount,v_order.total;
  end if;
  if coalesce(p_deposit_amount,0)>public.customer_deposit_available(p_customer_id) then
    raise exception 'insufficient_customer_deposit'; end if;
  select * into v_customer from public.customers
  where id=p_customer_id and company_id=v_company_id and not is_supplier and deleted_at is null for update;
  if v_customer.id is null then raise exception 'customer_not_found'; end if;
  if coalesce(p_credit_amount,0)>0 and not v_customer.is_credit_approved then
    raise exception 'credit_not_approved: customer %',p_customer_id; end if;
  select jsonb_agg(t.value) into v_external_tenders
  from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) t(value)
  join public.available_payment_methods(v_location_id) m on m.code=t.value->>'method'
  where not m.is_cashier_controlled;
  v_needs_external:=v_external_tenders is not null
    and not public.current_user_has_permission('ViewFinancials');
  select coalesce(sum(l.debit)-sum(l.credit),0)::bigint into v_ar_balance
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=v_company_id and a.code='ACCOUNTS_RECEIVABLE'
    and l.meta->>'customerId'=p_customer_id::text;
  v_needs_overdraft:=coalesce(p_credit_amount,0)>0 and v_customer.credit_limit>0
    and v_ar_balance+p_credit_amount>v_customer.credit_limit
    and not public.current_user_has_permission('ApproveCustomerCredit');
  v_metadata:=jsonb_build_object('order_id',v_order_id,'tenders',coalesce(p_payments,'[]'::jsonb),
    'prepayment_settlement',true,'deposit_amount',coalesce(p_deposit_amount,0),
    'credit_amount',coalesce(p_credit_amount,0),'client_ref',p_client_ref);
  if v_needs_external then
    insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
    values(v_company_id,'external_account_payment','order',v_order_id,v_metadata,auth.uid())
    on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
    do nothing returning id into v_external_approval_id;
    if v_external_approval_id is null then select id into v_external_approval_id from public.approvals
      where company_id=v_company_id and type='external_account_payment'
      and subject_id=v_order_id and status='pending'; end if;
  end if;
  if v_needs_overdraft then
    v_overdraft_metadata:=v_metadata||jsonb_build_object('customer_id',p_customer_id,
      'ar_balance',v_ar_balance,'order_total',v_order.total,'credit_amount',p_credit_amount,
      'credit_limit',v_customer.credit_limit,'projected_balance',v_ar_balance+p_credit_amount,
      'reason','Residual credit exceeds customer limit');
    insert into public.approvals(company_id,type,subject_type,subject_id,metadata,requested_by)
    values(v_company_id,'overdraft','order',v_order_id,v_overdraft_metadata,auth.uid())
    on conflict(company_id,type,subject_id) where status='pending' and subject_id is not null
    do nothing returning id into v_overdraft_approval_id;
    if v_overdraft_approval_id is null then select id into v_overdraft_approval_id from public.approvals
      where company_id=v_company_id and type='overdraft'
      and subject_id=v_order_id and status='pending'; end if;
  end if;
  if v_needs_external or v_needs_overdraft then
    return jsonb_build_object('status','approval_required',
      'approval_id',coalesce(v_external_approval_id,v_overdraft_approval_id),
      'approval_ids',to_jsonb(array_remove(array[v_external_approval_id,v_overdraft_approval_id],null)),
      'order_id',v_order_id,'subject_id',v_order_id);
  end if;
  perform public.complete_order_with_prepayment(v_order_id,p_payments,
    coalesce(p_deposit_amount,0),coalesce(p_credit_amount,0),p_client_ref);
  return jsonb_build_object('status','completed','order_id',v_order_id,'subject_id',v_order_id);
end; $$;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean language sql immutable set search_path='' as $$
  select p_source_type = any(array[
    'Payment','CreditSale','PaymentAllocation','Expense','PurchaseExpense','InterAccountTransfer',
    'SupplierPayment','Refund','PaymentReversal','CustomerDeposit',
    'CustomerDepositRefund','SupplierAdvance','SupplierAdvanceReturn','MixedSaleTender'
  ])
$$;

revoke execute on function public.complete_order_with_prepayment(uuid,jsonb,bigint,bigint,text),
  public.post_sale_with_prepayment_at_location(uuid,uuid,jsonb,jsonb,bigint,bigint,text,uuid)
from public,anon;
grant execute on function public.post_sale_with_prepayment_at_location(uuid,uuid,jsonb,jsonb,bigint,bigint,text,uuid)
to authenticated;
revoke execute on function public.complete_order_with_prepayment(uuid,jsonb,bigint,bigint,text)
from authenticated;
grant execute on function public.complete_order_with_prepayment(uuid,jsonb,bigint,bigint,text)
to service_role;

-- ---------------------------------------------------------------------------
-- Mixed purchase settlement and draft compatibility
-- ---------------------------------------------------------------------------

do $$
declare v_definition text; v_replacement text;
begin
  v_definition:=pg_get_functiondef(
    'public.record_purchase_complete(uuid,jsonb,jsonb,bigint,text,text,text,date,uuid)'::regprocedure);
  v_replacement:=replace(v_definition,
    'v_ap_balance+v_invoice_total-p_payment_amount>v_supplier.supplier_credit_limit',
    'v_ap_balance+v_invoice_total-p_payment_amount-coalesce(nullif(current_setting(''app.purchase_projected_advance'',true),'''')::bigint,0)>v_supplier.supplier_credit_limit');
  if v_replacement=v_definition then
    if position('app.purchase_projected_advance' in v_definition)=0 then
      raise exception 'purchase credit-limit expression not found';
    end if;
  else execute v_replacement; end if;

  v_definition:=pg_get_functiondef('public.enforce_credit_serialization()'::regprocedure);
  v_replacement:=replace(v_definition,
    '- coalesce(nullif(new.meta ->> ''projectedInitialPayment'', '''')::bigint, 0) + coalesce(nullif(current_setting(''app.purchase_projected_advance'',true), '''')::bigint, 0)',
    '- coalesce(nullif(new.meta ->> ''projectedInitialPayment'', '''')::bigint, 0) - coalesce(nullif(current_setting(''app.purchase_projected_advance'',true), '''')::bigint, 0)');
  if position('app.purchase_projected_advance' in v_replacement)=0 then
    v_replacement:=replace(v_replacement,
      'coalesce(nullif(new.meta ->> ''projectedInitialPayment'', '''')::bigint, 0)',
      '(coalesce(nullif(new.meta ->> ''projectedInitialPayment'', '''')::bigint, 0) + coalesce(nullif(current_setting(''app.purchase_projected_advance'',true), '''')::bigint, 0))');
  end if;
  if position('app.purchase_projected_advance' in v_replacement)=0 then
    raise exception 'supplier serialization projection expression not found';
  end if;
  if v_replacement<>v_definition then execute v_replacement; end if;
end $$;

create or replace function public.record_purchase_with_advance(
  p_supplier_id uuid,
  p_lines jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_payment_amount bigint default 0,
  p_advance_amount bigint default 0,
  p_credit_amount bigint default 0,
  p_reference text default null,
  p_account_code text default 'CASH_ON_HAND',
  p_notes text default null,
  p_purchase_date date default current_date,
  p_stock_location_id uuid default null,
  p_client_ref text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_purchase_id uuid; v_purchase public.purchases%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required'; end if;
  if p_client_ref is not null then
    select id into v_purchase_id from public.purchases
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_purchase_id is not null then return v_purchase_id; end if;
  end if;
  if coalesce(p_payment_amount,0)<0 or coalesce(p_advance_amount,0)<0 or coalesce(p_credit_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  if coalesce(p_advance_amount,0)>public.supplier_advance_available(p_supplier_id) then
    raise exception 'insufficient_supplier_advance'; end if;
  perform set_config('app.purchase_projected_advance',
    (coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0))::text,true);
  begin
    v_purchase_id:=public.record_purchase_complete(p_supplier_id,p_lines,p_expenses,0,p_reference,
      p_account_code,p_notes,p_purchase_date,p_stock_location_id);
    update public.purchases set client_ref=nullif(btrim(p_client_ref),'') where id=v_purchase_id;
  exception when unique_violation then
    select id into v_purchase_id from public.purchases
    where company_id=v_company_id and client_ref=p_client_ref;
    if v_purchase_id is null then raise; end if;
    return v_purchase_id;
  end;
  select * into v_purchase from public.purchases where id=v_purchase_id and company_id=v_company_id for update;
  if coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0)+coalesce(p_credit_amount,0)<>v_purchase.total_cost then
    raise exception 'payment_mismatch: money % + advance % + credit % <> invoice total %',
      p_payment_amount,p_advance_amount,p_credit_amount,v_purchase.total_cost;
  end if;
  if coalesce(p_payment_amount,0)>0 then
    perform public.pay_purchase(v_purchase_id,p_payment_amount,p_account_code);
  end if;
  if coalesce(p_advance_amount,0)>0 then
    perform public.apply_supplier_advance(v_purchase_id,p_advance_amount,
      case when p_client_ref is null then null else p_client_ref||':advance' end);
  end if;
  return v_purchase_id;
end; $$;

create or replace function public.save_purchase_draft_with_advance(
  p_supplier_id uuid,p_lines jsonb,p_expenses jsonb default '[]'::jsonb,
  p_reference text default null,p_notes text default null,p_purchase_date date default current_date,
  p_stock_location_id uuid default null,p_payment_amount bigint default 0,
  p_advance_amount bigint default 0,p_account_code text default null,
  p_client_ref text default null,p_draft_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_id uuid; v_draft public.purchase_drafts%rowtype;
begin
  if coalesce(p_payment_amount,0)<0 or coalesce(p_advance_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  if p_draft_id is null and nullif(btrim(p_client_ref),'') is not null then
    select id into v_id from public.purchase_drafts
    where company_id=v_company_id and client_ref=btrim(p_client_ref);
    if v_id is not null then return v_id; end if;
  end if;
  begin
    v_id:=public.save_purchase_draft_complete(p_supplier_id,p_lines,p_expenses,p_reference,p_notes,
      p_purchase_date,p_stock_location_id,'later',0,null,p_draft_id);
    select * into v_draft from public.purchase_drafts where id=v_id and company_id=v_company_id for update;
    if coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0)>v_draft.total_cost then
      raise exception 'purchase_settlement_exceeds_total'; end if;
    if coalesce(p_payment_amount,0)>0 then
      perform public.require_asset_leaf_account(v_company_id,p_account_code); end if;
    update public.purchase_drafts set
      payment_mode=case
        when coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0)=total_cost then 'paid'
        when coalesce(p_payment_amount,0)+coalesce(p_advance_amount,0)>0 then 'partial'
        else 'later' end,
      payment_amount=coalesce(p_payment_amount,0),advance_amount=coalesce(p_advance_amount,0),
      account_code=case when coalesce(p_payment_amount,0)>0 then p_account_code end,
      client_ref=nullif(btrim(p_client_ref),''),updated_at=now()
    where id=v_id;
  exception when unique_violation then
    if p_draft_id is not null then raise; end if;
    select id into v_id from public.purchase_drafts
    where company_id=v_company_id and client_ref=btrim(p_client_ref);
    if v_id is null then raise; end if;
  end;
  return v_id;
end; $$;

create or replace function public.confirm_purchase_draft_with_advance(p_draft_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_draft public.purchase_drafts%rowtype; v_purchase_id uuid;
begin
  select * into v_draft from public.purchase_drafts
  where id=p_draft_id and company_id=v_company_id for update;
  if v_draft.id is null then raise exception 'purchase_draft_not_found'; end if;
  if v_draft.status='confirmed' and v_draft.posted_purchase_id is not null then
    return v_draft.posted_purchase_id;
  end if;
  if v_draft.status<>'draft' then raise exception 'purchase_draft_not_found'; end if;
  v_purchase_id:=public.record_purchase_with_advance(v_draft.supplier_id,v_draft.lines,v_draft.expenses,
    coalesce(v_draft.payment_amount,0),coalesce(v_draft.advance_amount,0),
    v_draft.total_cost-coalesce(v_draft.payment_amount,0)-coalesce(v_draft.advance_amount,0),
    v_draft.reference,coalesce(v_draft.account_code,'CASH_ON_HAND'),v_draft.notes,
    v_draft.purchase_date,v_draft.stock_location_id,v_draft.client_ref);
  update public.purchase_drafts set status='confirmed',posted_purchase_id=v_purchase_id,updated_at=now()
  where id=p_draft_id;
  return v_purchase_id;
end; $$;

-- Cancelled advance applications no longer settle AP.
do $$
declare v_definition text; v_replacement text;
begin
  v_definition:=pg_get_functiondef('public.pay_supplier(uuid,bigint,text)'::regprocedure);
  v_replacement:=replace(v_definition,'where pp.purchase_id = p.id',
    'where pp.purchase_id = p.id and pp.status = ''settled''');
  if v_replacement<>v_definition then execute v_replacement;
  elsif position('pp.status = ''settled''' in v_definition)=0 then
    raise exception 'pay_supplier paid filters not found';
  end if;
  v_definition:=pg_get_functiondef('public.pay_purchase(uuid,bigint,text)'::regprocedure);
  v_replacement:=replace(v_definition,'where purchase_id=p_purchase_id;',
    'where purchase_id=p_purchase_id and status=''settled'';');
  if v_replacement<>v_definition then execute v_replacement;
  elsif position('status=''settled''' in v_definition)=0 then
    raise exception 'pay_purchase paid filter not found';
  end if;
end $$;

drop view public.purchase_history cascade;
create view public.purchase_history with(security_invoker=true) as
select p.*,
  coalesce(x.expense_total,0)::bigint as expense_total,
  coalesce(x.separate_expense_total,0)::bigint as separate_expense_total,
  (p.total_cost+coalesce(x.separate_expense_total,0))::bigint as all_in_total,
  case when not p.is_credit then p.total_cost else coalesce(sum(pp.amount),0)::bigint end as paid,
  case when not p.is_credit or coalesce(sum(pp.amount),0)>=p.total_cost then 'paid'
    when coalesce(sum(pp.amount),0)>0 then 'part_paid' else 'unpaid' end::text as payment_status
from public.purchases p
left join public.purchase_payments pp on pp.purchase_id=p.id and pp.status='settled'
left join lateral(select coalesce(sum(pe.amount),0) expense_total,
  coalesce(sum(pe.amount) filter(where pe.settlement='separate'),0) separate_expense_total
  from public.purchase_expenses pe where pe.purchase_id=p.id) x on true
group by p.id,x.expense_total,x.separate_expense_total;
grant select on public.purchase_history to authenticated;

create view public.supplier_purchase_metrics with(security_invoker=true) as
select company_id,supplier_id,count(*)::bigint as purchase_count,
  coalesce(avg(total_cost),0)::bigint as average_order,
  count(*) filter(where payment_status<>'paid')::bigint as open_purchase_count,
  coalesce(sum(greatest(total_cost-paid,0)),0)::bigint as outstanding
from public.purchase_history group by company_id,supplier_id;
grant select on public.supplier_purchase_metrics to authenticated;

revoke execute on function public.record_purchase_with_advance(uuid,jsonb,jsonb,bigint,bigint,bigint,text,text,text,date,uuid,text),
  public.save_purchase_draft_with_advance(uuid,jsonb,jsonb,text,text,date,uuid,bigint,bigint,text,text,uuid),
  public.confirm_purchase_draft_with_advance(uuid)
from public,anon;
grant execute on function public.record_purchase_with_advance(uuid,jsonb,jsonb,bigint,bigint,bigint,text,text,text,date,uuid,text),
  public.save_purchase_draft_with_advance(uuid,jsonb,jsonb,text,text,date,uuid,bigint,bigint,text,text,uuid),
  public.confirm_purchase_draft_with_advance(uuid)
to authenticated;

select pg_notify('pgrst','reload schema');
