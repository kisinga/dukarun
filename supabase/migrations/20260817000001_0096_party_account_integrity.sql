-- Document-backed customer and supplier balances.
-- Manual AR/AP journals are retired; supplier payments become reversible
-- headers with FIFO allocations. Deferred checks ensure each transaction
-- finishes with control-account and document subledgers in agreement.

-- ---------------------------------------------------------------------------
-- Retire naked balance adjustments while preserving a useful old-client error.
-- ---------------------------------------------------------------------------
create or replace function public.post_balance_adjustment(
  p_customer_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.current_user_has_permission('OverrideCustomerBalance') then
    raise exception 'permission_denied: OverrideCustomerBalance required';
  end if;
  raise exception 'manual_balance_adjustment_removed: use a sale, receipt reversal, or credit note';
end;
$$;

create or replace function public.post_supplier_balance_adjustment(
  p_supplier_id uuid,
  p_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  raise exception 'manual_balance_adjustment_removed: use a purchase, supplier payment reversal, or supplier credit';
end;
$$;

-- Keep execute permission temporarily so cached clients receive the explicit
-- migration message rather than an opaque PostgREST permission error.
revoke execute on function public.post_balance_adjustment(uuid,bigint,text),
  public.post_supplier_balance_adjustment(uuid,bigint,text) from public,anon;
grant execute on function public.post_balance_adjustment(uuid,bigint,text),
  public.post_supplier_balance_adjustment(uuid,bigint,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Supplier payment headers. One user action may allocate over many purchases,
-- but remains one reversible business event.
-- ---------------------------------------------------------------------------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.customers(id),
  purchase_id uuid references public.purchases(id),
  amount bigint not null check(amount>0),
  account_code text not null,
  location_id uuid not null references public.stock_locations(id),
  cashier_session_id uuid not null references public.cashier_sessions(id),
  client_ref text,
  status text not null default 'posted' check(status in ('posted','reversed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  unique(company_id,client_ref)
);
create index supplier_payments_supplier_activity_idx
  on public.supplier_payments(company_id,supplier_id,created_at desc,id desc);

alter table public.purchase_payments
  add column supplier_payment_id uuid references public.supplier_payments(id);
create index purchase_payments_supplier_payment_idx
  on public.purchase_payments(supplier_payment_id)
  where supplier_payment_id is not null;

alter table public.purchases
  add column status text not null default 'posted' check(status in ('posted','reversed')),
  add column reversed_by uuid,
  add column reversed_at timestamptz,
  add column reversal_reason text;

alter table public.supplier_payments enable row level security;
create policy "supplier payments readable with financial access"
  on public.supplier_payments for select
  using (
    (company_id=(select public.current_company_id())
      and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );
grant select on public.supplier_payments to authenticated;
grant all on public.supplier_payments to service_role;

-- Typed party links make control-account ownership enforceable. Historical
-- rows are backfilled where their source metadata is valid; future AR/AP lines
-- are rejected unless their party is explicit and belongs to the company.
alter table public.ledger_journal_lines
  add column customer_id uuid references public.customers(id),
  add column supplier_id uuid references public.customers(id);

-- Historical journal lines are immutable to application traffic. This
-- transaction-local maintenance flag permits only the schema backfill below;
-- it is disabled again before any new posting trigger is installed.
select set_config('app.allow_ledger_mutation','on',true);

update public.ledger_journal_lines l
set customer_id=coalesce(
  case when l.meta->>'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (l.meta->>'customerId')::uuid end,
  (select o.customer_id from public.orders o where o.id=l.order_id and o.company_id=l.company_id)
)
from public.ledger_accounts a
where a.id=l.account_id and a.company_id=l.company_id and a.code='ACCOUNTS_RECEIVABLE';

update public.ledger_journal_lines l
set supplier_id=case
  when l.meta->>'supplierId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (l.meta->>'supplierId')::uuid
end
from public.ledger_accounts a
where a.id=l.account_id and a.company_id=l.company_id and a.code='ACCOUNTS_PAYABLE';

select set_config('app.allow_ledger_mutation','off',true);

create index ledger_lines_customer_control_idx
  on public.ledger_journal_lines(company_id,customer_id) where customer_id is not null;
create index ledger_lines_supplier_control_idx
  on public.ledger_journal_lines(company_id,supplier_id) where supplier_id is not null;

create or replace function public.enforce_ledger_control_party()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_code text; v_source_type text;
begin
  select a.code into v_code from public.ledger_accounts a
  where a.id=new.account_id and a.company_id=new.company_id;
  if v_code='ACCOUNTS_RECEIVABLE' then
    new.customer_id:=coalesce(new.customer_id,
      case when new.meta->>'customerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.meta->>'customerId')::uuid end,
      (select o.customer_id from public.orders o
       where o.id=new.order_id and o.company_id=new.company_id));
    if new.customer_id is null then
      select e.source_type into v_source_type from public.ledger_journal_entries e where e.id=new.entry_id;
      if v_source_type='PaymentAllocation' and new.order_id is not null then
        raise exception 'ar_allocation_without_debt: order % has no AR balance',new.order_id;
      end if;
      raise exception 'ar_customer_required';
    end if;
    if not exists(select 1 from public.customers c
      where c.id=new.customer_id and c.company_id=new.company_id) then
      raise exception 'customer_not_found';
    end if;
  elsif v_code='ACCOUNTS_PAYABLE' then
    new.supplier_id:=coalesce(new.supplier_id,
      case when new.meta->>'supplierId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (new.meta->>'supplierId')::uuid end);
    if new.supplier_id is null then raise exception 'ap_supplier_required'; end if;
    if not exists(select 1 from public.customers c
      where c.id=new.supplier_id and c.company_id=new.company_id and c.is_supplier) then
      raise exception 'supplier_not_found';
    end if;
  end if;
  return new;
end;
$$;
create trigger aa_ledger_control_party
before insert or update on public.ledger_journal_lines
for each row execute function public.enforce_ledger_control_party();

-- ---------------------------------------------------------------------------
-- Canonical document/control-account totals and assertion helpers.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_document_balance(
  p_company_id uuid,
  p_supplier_id uuid
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(p.total_cost-coalesce(paid.amount,0)),0)::bigint
  from public.purchases p
  left join lateral (
    select sum(pp.amount)::bigint amount
    from public.purchase_payments pp
    where pp.purchase_id=p.id and pp.status='settled'
  ) paid on true
  where p.company_id=p_company_id and p.supplier_id=p_supplier_id and p.is_credit
    and p.status='posted'
$$;

create or replace function public.customer_document_balance(
  p_company_id uuid,
  p_customer_id uuid
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(o.total-coalesce(paid.amount,0)),0)::bigint
  from public.orders o
  left join lateral (
    select sum(p.amount)::bigint amount
    from public.payments p
    where p.order_id=o.id and p.status='settled'
  ) paid on true
  where o.company_id=p_company_id and o.customer_id=p_customer_id
    and o.is_credit_sale and o.status='completed'
$$;

create or replace function public.supplier_ledger_balance(
  p_company_id uuid,
  p_supplier_id uuid
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(l.credit)-sum(l.debit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  where l.company_id=p_company_id and a.code='ACCOUNTS_PAYABLE'
    and l.supplier_id=p_supplier_id
$$;

create or replace function public.customer_ledger_balance(
  p_company_id uuid,
  p_customer_id uuid
)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(sum(l.debit)-sum(l.credit),0)::bigint
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
  where l.company_id=p_company_id and a.code='ACCOUNTS_RECEIVABLE'
    and l.customer_id=p_customer_id
$$;

create or replace function public.assert_supplier_account_consistent(
  p_company_id uuid,
  p_supplier_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_ledger bigint; v_documents bigint;
begin
  v_ledger:=public.supplier_ledger_balance(p_company_id,p_supplier_id);
  v_documents:=public.supplier_document_balance(p_company_id,p_supplier_id);
  if v_ledger<>v_documents then
    raise exception 'supplier_account_out_of_balance: ledger %, documents %',v_ledger,v_documents;
  end if;
end;
$$;

create or replace function public.assert_customer_account_consistent(
  p_company_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_ledger bigint; v_documents bigint;
begin
  v_ledger:=public.customer_ledger_balance(p_company_id,p_customer_id);
  v_documents:=public.customer_document_balance(p_company_id,p_customer_id);
  if v_ledger<>v_documents then
    raise exception 'customer_account_out_of_balance: ledger %, documents %',v_ledger,v_documents;
  end if;
end;
$$;

create or replace function public.supplier_account_status(p_supplier_id uuid)
returns table(ledger_balance bigint,document_balance bigint,difference bigint,is_consistent boolean)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: supplier financial access required';
  end if;
  if not exists(select 1 from public.customers where id=p_supplier_id
    and company_id=v_company_id and is_supplier and deleted_at is null) then
    raise exception 'supplier_not_found';
  end if;
  return query
  select l,d,l-d,l=d
  from (select public.supplier_ledger_balance(v_company_id,p_supplier_id) l) ledger
  cross join (select public.supplier_document_balance(v_company_id,p_supplier_id) d) documents;
end;
$$;

create or replace function public.customer_account_status(p_customer_id uuid)
returns table(ledger_balance bigint,document_balance bigint,difference bigint,is_consistent boolean)
language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials')
    and not public.current_user_has_permission('SettleOrder')
    and not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: customer account access required';
  end if;
  if not exists(select 1 from public.customers where id=p_customer_id
    and company_id=v_company_id and deleted_at is null) then raise exception 'customer_not_found'; end if;
  return query select l,d,l-d,l=d
  from (select public.customer_ledger_balance(v_company_id,p_customer_id) l) ledger
  cross join (select public.customer_document_balance(v_company_id,p_customer_id) d) documents;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deferred checks. Multi-row business operations may be temporarily out of
-- balance, but cannot commit that way.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_party_account_consistency()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_company_id uuid; v_new_company_id uuid;
  v_old_supplier_id uuid; v_new_supplier_id uuid;
  v_old_customer_id uuid; v_new_customer_id uuid;
begin
  if current_setting('app.bypass_business_limits',true)='on' then return null; end if;

  if tg_table_name='ledger_journal_lines' then
    if tg_op<>'DELETE' then
      v_new_company_id:=new.company_id; v_new_supplier_id:=new.supplier_id; v_new_customer_id:=new.customer_id;
    end if;
    if tg_op<>'INSERT' then
      v_old_company_id:=old.company_id; v_old_supplier_id:=old.supplier_id; v_old_customer_id:=old.customer_id;
    end if;
  elsif tg_table_name='purchase_payments' then
    if tg_op<>'DELETE' then select p.company_id,p.supplier_id into v_new_company_id,v_new_supplier_id
      from public.purchases p where p.id=new.purchase_id; end if;
    if tg_op<>'INSERT' then select p.company_id,p.supplier_id into v_old_company_id,v_old_supplier_id
      from public.purchases p where p.id=old.purchase_id; end if;
  elsif tg_table_name='purchases' then
    if tg_op<>'DELETE' then v_new_company_id:=new.company_id; v_new_supplier_id:=new.supplier_id; end if;
    if tg_op<>'INSERT' then v_old_company_id:=old.company_id; v_old_supplier_id:=old.supplier_id; end if;
  elsif tg_table_name='payments' then
    if tg_op<>'DELETE' then select o.company_id,o.customer_id into v_new_company_id,v_new_customer_id
      from public.orders o where o.id=new.order_id; end if;
    if tg_op<>'INSERT' then select o.company_id,o.customer_id into v_old_company_id,v_old_customer_id
      from public.orders o where o.id=old.order_id; end if;
  elsif tg_table_name='orders' then
    if tg_op<>'DELETE' then v_new_company_id:=new.company_id; v_new_customer_id:=new.customer_id; end if;
    if tg_op<>'INSERT' then v_old_company_id:=old.company_id; v_old_customer_id:=old.customer_id; end if;
  end if;

  if v_old_supplier_id is not null then perform public.assert_supplier_account_consistent(v_old_company_id,v_old_supplier_id); end if;
  if v_new_supplier_id is not null and (v_new_company_id,v_new_supplier_id) is distinct from (v_old_company_id,v_old_supplier_id)
    then perform public.assert_supplier_account_consistent(v_new_company_id,v_new_supplier_id); end if;
  if v_old_customer_id is not null then perform public.assert_customer_account_consistent(v_old_company_id,v_old_customer_id); end if;
  if v_new_customer_id is not null and (v_new_company_id,v_new_customer_id) is distinct from (v_old_company_id,v_old_customer_id)
    then perform public.assert_customer_account_consistent(v_new_company_id,v_new_customer_id); end if;
  return null;
end;
$$;

create or replace function public.enforce_purchase_not_overallocated()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_purchase_id uuid:=coalesce(new.purchase_id,old.purchase_id); v_total bigint; v_paid bigint;
begin
  if current_setting('app.bypass_business_limits',true)='on' then return null; end if;
  select total_cost into v_total from public.purchases where id=v_purchase_id;
  if v_total is null then return null; end if;
  select coalesce(sum(amount) filter(where status='settled'),0)::bigint into v_paid
  from public.purchase_payments where purchase_id=v_purchase_id;
  if v_paid>v_total then
    raise exception 'purchase_overallocated: payments % exceed total %',v_paid,v_total;
  end if;
  return null;
end;
$$;

create constraint trigger purchases_account_consistency
after insert or update or delete on public.purchases
deferrable initially deferred for each row execute function public.enforce_party_account_consistency();
create constraint trigger purchase_payments_account_consistency
after insert or update or delete on public.purchase_payments
deferrable initially deferred for each row execute function public.enforce_party_account_consistency();
create constraint trigger purchase_payments_not_overallocated
after insert or update or delete on public.purchase_payments
deferrable initially deferred for each row execute function public.enforce_purchase_not_overallocated();
create constraint trigger orders_account_consistency
after insert or update or delete on public.orders
deferrable initially deferred for each row execute function public.enforce_party_account_consistency();
create constraint trigger payments_account_consistency
after insert or update or delete on public.payments
deferrable initially deferred for each row execute function public.enforce_party_account_consistency();
create constraint trigger journal_lines_account_consistency
after insert or update or delete on public.ledger_journal_lines
deferrable initially deferred for each row execute function public.enforce_party_account_consistency();

-- ---------------------------------------------------------------------------
-- Canonical supplier payment and reversal.
-- ---------------------------------------------------------------------------
create or replace function public.post_supplier_payment(
  p_supplier_id uuid,
  p_purchase_id uuid,
  p_amount bigint,
  p_account_code text,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_supplier_payment_id uuid;
  v_session_id uuid;
  v_location_id uuid;
  v_remaining bigint:=p_amount;
  v_due bigint;
  v_take bigint;
  v_purchase record;
  v_existing public.supplier_payments%rowtype;
  v_client_ref text:=nullif(btrim(p_client_ref),'');
  v_allocations jsonb:='[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  if v_client_ref is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'supplier-payment:'||v_company_id::text||':'||v_client_ref,0));
    select * into v_existing from public.supplier_payments
    where company_id=v_company_id and client_ref=v_client_ref;
    if v_existing.id is not null then
      if v_existing.supplier_id is distinct from p_supplier_id
        or v_existing.purchase_id is distinct from p_purchase_id
        or v_existing.amount is distinct from p_amount
        or v_existing.account_code is distinct from p_account_code then
        raise exception 'supplier_payment_idempotency_conflict: reference % has different details',v_client_ref;
      end if;
      return v_existing.id;
    end if;
  end if;

  perform 1 from public.customers
  where id=p_supplier_id and company_id=v_company_id and is_supplier
    and deleted_at is null and coalesce(supplier_active,true)
  for update;
  if not found then raise exception 'supplier_not_found'; end if;
  perform public.assert_supplier_account_consistent(v_company_id,p_supplier_id);
  perform public.require_asset_leaf_account(v_company_id,p_account_code);
  v_session_id:=public.require_open_cashier_session(v_company_id);
  select location_id into v_location_id from public.cashier_sessions
  where id=v_session_id and company_id=v_company_id;
  perform set_config('app.business_location_id',v_location_id::text,true);

  perform 1 from public.purchases p
  where p.company_id=v_company_id and p.supplier_id=p_supplier_id and p.is_credit
    and p.status='posted'
    and (p_purchase_id is null or p.id=p_purchase_id)
  order by p.purchase_date,p.created_at,p.id for update;
  if p_purchase_id is not null and not found then raise exception 'credit_purchase_not_found'; end if;

  select coalesce(sum(greatest(p.total_cost-coalesce(paid.amount,0),0)),0)::bigint into v_due
  from public.purchases p
  left join lateral (
    select sum(pp.amount)::bigint amount from public.purchase_payments pp
    where pp.purchase_id=p.id and pp.status='settled'
  ) paid on true
  where p.company_id=v_company_id and p.supplier_id=p_supplier_id and p.is_credit
    and p.status='posted'
    and (p_purchase_id is null or p.id=p_purchase_id);
  if v_due=0 then raise exception 'no_outstanding_ap: supplier %',p_supplier_id; end if;
  if p_amount>v_due then raise exception 'ap_overpayment: % exceeds outstanding %',p_amount,v_due; end if;

  insert into public.supplier_payments(company_id,supplier_id,purchase_id,amount,account_code,
    location_id,cashier_session_id,client_ref,created_by)
  values(v_company_id,p_supplier_id,p_purchase_id,p_amount,p_account_code,v_location_id,v_session_id,
    v_client_ref,auth.uid()) returning id into v_supplier_payment_id;

  for v_purchase in
    select p.id,p.reference,p.purchase_date,p.created_at,
      greatest(p.total_cost-coalesce(paid.amount,0),0)::bigint due
    from public.purchases p
    left join lateral (
      select sum(pp.amount)::bigint amount from public.purchase_payments pp
      where pp.purchase_id=p.id and pp.status='settled'
    ) paid on true
    where p.company_id=v_company_id and p.supplier_id=p_supplier_id and p.is_credit
      and p.status='posted'
      and (p_purchase_id is null or p.id=p_purchase_id)
      and greatest(p.total_cost-coalesce(paid.amount,0),0)>0
    order by p.purchase_date,p.created_at,p.id
  loop
    exit when v_remaining=0;
    v_take:=least(v_remaining,v_purchase.due);
    insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by,
      supplier_payment_id,status,settlement_kind)
    values(v_company_id,v_purchase.id,v_take,p_account_code,auth.uid(),
      v_supplier_payment_id,'settled','account');
    v_allocations:=v_allocations||jsonb_build_object(
      'purchaseId',v_purchase.id,'purchaseReference',v_purchase.reference,'amount',v_take);
    v_remaining:=v_remaining-v_take;
  end loop;
  if v_remaining<>0 then raise exception 'supplier_payment_allocation_failed: % unallocated',v_remaining; end if;

  perform public.post_journal_entry(v_company_id,'SupplierPayment',v_supplier_payment_id::text,
    'Supplier payment',jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'supplierPaymentId',v_supplier_payment_id,
          'purchaseId',p_purchase_id,'allocations',v_allocations,'locationId',v_location_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,
        'meta',jsonb_build_object('supplierId',p_supplier_id,'supplierPaymentId',v_supplier_payment_id,
          'method',p_account_code,'locationId',v_location_id))));
  perform public.assert_supplier_account_consistent(v_company_id,p_supplier_id);
  return v_supplier_payment_id;
end;
$$;

create or replace function public.pay_supplier(p_supplier_id uuid,p_amount bigint,p_account_code text)
returns uuid language sql security definer set search_path='' as $$
  select public.post_supplier_payment(p_supplier_id,null,p_amount,p_account_code,null)
$$;

create or replace function public.pay_purchase(p_purchase_id uuid,p_amount bigint,p_account_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id(); v_supplier_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  select supplier_id into v_supplier_id from public.purchases
  where id=p_purchase_id and company_id=v_company_id and is_credit and status='posted';
  if v_supplier_id is null then raise exception 'credit_purchase_not_found'; end if;
  return public.post_supplier_payment(v_supplier_id,p_purchase_id,p_amount,p_account_code,null);
end;
$$;

create or replace function public.reverse_supplier_payment(
  p_supplier_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_payment public.supplier_payments%rowtype;
  v_entry public.ledger_journal_entries%rowtype;
  v_line record;
  v_lines jsonb:='[]'::jsonb;
  v_reversal_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    or not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: supplier payment reversal requires purchase and reversal access';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_payment from public.supplier_payments
  where id=p_supplier_payment_id and company_id=v_company_id for update;
  if v_payment.id is null then raise exception 'supplier_payment_not_found'; end if;
  if v_payment.status='reversed' then
    select id into v_reversal_id from public.ledger_journal_entries
    where company_id=v_company_id and source_type='SupplierPaymentReversal'
      and source_id=v_payment.id::text||'-reversal';
    return v_reversal_id;
  end if;
  perform 1 from public.customers where id=v_payment.supplier_id and company_id=v_company_id for update;
  perform 1 from public.purchases p join public.purchase_payments pp on pp.purchase_id=p.id
  where pp.supplier_payment_id=v_payment.id order by p.purchase_date,p.created_at,p.id for update of p;
  perform public.assert_supplier_account_consistent(v_company_id,v_payment.supplier_id);
  perform set_config('app.business_location_id',v_payment.location_id::text,true);
  perform public.require_open_cashier_session(v_company_id);

  select * into v_entry from public.ledger_journal_entries
  where company_id=v_company_id and source_type='SupplierPayment'
    and source_id=v_payment.id::text;
  if v_entry.id is null then raise exception 'supplier_payment_journal_not_found'; end if;
  for v_line in
    select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,
      'meta',v_line.meta||jsonb_build_object('reason',btrim(p_reason),
        'reversalOfSupplierPaymentId',v_payment.id,'locationId',v_payment.location_id));
  end loop;
  update public.purchase_payments set status='cancelled'
  where supplier_payment_id=v_payment.id and status='settled';
  update public.supplier_payments set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_payment.id;
  v_reversal_id:=public.post_reversal_entry(v_company_id,'SupplierPaymentReversal',
    v_payment.id::text||'-reversal','Supplier payment reversed: '||btrim(p_reason),v_lines,v_entry.id);
  perform public.assert_supplier_account_consistent(v_company_id,v_payment.supplier_id);
  return v_reversal_id;
end;
$$;

-- Reverse only untouched, unpaid credit purchases. Once stock or money moved,
-- the user must reverse those dependent source events first.
create or replace function public.reverse_credit_purchase(p_purchase_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_purchase public.purchases%rowtype;
  v_entry public.ledger_journal_entries%rowtype;
  v_line record;
  v_purchase_line record;
  v_lines jsonb:='[]'::jsonb;
  v_reversal_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageSupplierCreditPurchases')
    or not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: purchase reversal requires purchase and reversal access';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into v_purchase from public.purchases
  where id=p_purchase_id and company_id=v_company_id for update;
  if v_purchase.id is null then raise exception 'purchase_not_found'; end if;
  if not v_purchase.is_credit then raise exception 'only_credit_purchase_reversal_supported'; end if;
  if v_purchase.status='reversed' then
    select id into v_reversal_id from public.ledger_journal_entries
    where company_id=v_company_id and source_type='PurchaseReversal'
      and source_id=v_purchase.id::text||'-reversal';
    if v_reversal_id is null then raise exception 'purchase_reversal_journal_not_found'; end if;
    return v_reversal_id;
  end if;
  if exists(select 1 from public.purchase_payments
    where purchase_id=v_purchase.id and status='settled') then
    raise exception 'purchase_has_payments: reverse its payments first';
  end if;
  if exists(select 1 from public.purchase_expenses
    where purchase_id=v_purchase.id and settlement='separate') then
    raise exception 'purchase_has_separate_expenses: reverse those expenses first';
  end if;
  perform 1 from public.purchase_lines pl join public.inventory_batches b on b.id=pl.inventory_batch_id
  where pl.purchase_id=v_purchase.id order by b.id for update of b;
  if exists(
    select 1 from public.purchase_lines pl
    join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id
      and (b.remaining<>pl.quantity or b.remaining_cost<>pl.line_total)
  ) then raise exception 'purchase_stock_already_moved'; end if;

  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  perform set_config('app.business_location_id',v_purchase.stock_location_id::text,true);
  perform public.require_open_cashier_session(v_company_id);
  select * into v_entry from public.ledger_journal_entries
  where company_id=v_company_id and source_type='InventoryPurchase'
    and source_id=v_purchase.id::text;
  if v_entry.id is null then raise exception 'purchase_journal_not_found'; end if;
  for v_line in
    select l.*,a.code account_code from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id=l.account_id where l.entry_id=v_entry.id
  loop
    v_lines:=v_lines||jsonb_build_object('account_code',v_line.account_code,
      'debit',v_line.credit,'credit',v_line.debit,
      'meta',v_line.meta||jsonb_build_object('reason',btrim(p_reason),
        'reversalOfPurchaseId',v_purchase.id,'locationId',v_purchase.stock_location_id));
  end loop;
  for v_purchase_line in
    select pl.*,b.stock_location_id from public.purchase_lines pl
    join public.inventory_batches b on b.id=pl.inventory_batch_id
    where pl.purchase_id=v_purchase.id order by b.id
  loop
    update public.inventory_batches set remaining=0,remaining_cost=0
    where id=v_purchase_line.inventory_batch_id;
    insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
      quantity,unit_cost,total_cost,source_type,source_id,meta)
    values(v_company_id,v_purchase_line.variant_id,v_purchase_line.inventory_batch_id,
      v_purchase_line.stock_location_id,'reversal',-v_purchase_line.quantity,
      v_purchase_line.unit_cost,-v_purchase_line.line_total,'PurchaseReversal',v_purchase.id::text,
      jsonb_build_object('reason',btrim(p_reason)));
  end loop;
  update public.purchases set status='reversed',reversed_by=auth.uid(),reversed_at=now(),
    reversal_reason=btrim(p_reason) where id=v_purchase.id;
  v_reversal_id:=public.post_reversal_entry(v_company_id,'PurchaseReversal',
    v_purchase.id::text||'-reversal','Purchase reversed: '||btrim(p_reason),v_lines,v_entry.id);
  perform public.assert_supplier_account_consistent(v_company_id,v_purchase.supplier_id);
  return v_reversal_id;
end;
$$;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean language sql immutable set search_path='' as $$
  select p_source_type=any(array[
    'Payment','CreditSale','PaymentAllocation','Expense','PurchaseExpense',
    'InterAccountTransfer','SupplierPayment','SupplierPaymentReversal','PurchaseReversal','Refund','PaymentReversal',
    'CustomerDeposit','CustomerDepositRefund','SupplierAdvance','SupplierAdvanceReturn','MixedSaleTender',
    'CustomerReceipt','CustomerReceiptReversal'
  ])
$$;

revoke execute on function public.supplier_document_balance(uuid,uuid),
  public.customer_document_balance(uuid,uuid),public.supplier_ledger_balance(uuid,uuid),
  public.customer_ledger_balance(uuid,uuid),public.assert_supplier_account_consistent(uuid,uuid),
  public.assert_customer_account_consistent(uuid,uuid),public.enforce_party_account_consistency(),
  public.enforce_purchase_not_overallocated(),public.post_supplier_payment(uuid,uuid,bigint,text,text),
  public.reverse_supplier_payment(uuid,text),public.reverse_credit_purchase(uuid,text),
  public.enforce_ledger_control_party() from public,anon;
revoke execute on function public.supplier_document_balance(uuid,uuid),
  public.customer_document_balance(uuid,uuid),public.supplier_ledger_balance(uuid,uuid),
  public.customer_ledger_balance(uuid,uuid),public.assert_supplier_account_consistent(uuid,uuid),
  public.assert_customer_account_consistent(uuid,uuid),public.enforce_party_account_consistency(),
  public.enforce_purchase_not_overallocated(),public.enforce_ledger_control_party() from authenticated;
grant execute on function public.supplier_account_status(uuid),public.customer_account_status(uuid),
  public.post_supplier_payment(uuid,uuid,bigint,text,text),public.reverse_supplier_payment(uuid,text),
  public.reverse_credit_purchase(uuid,text),public.pay_supplier(uuid,bigint,text),
  public.pay_purchase(uuid,bigint,text) to authenticated;
grant execute on function public.supplier_document_balance(uuid,uuid),
  public.customer_document_balance(uuid,uuid),public.supplier_ledger_balance(uuid,uuid),
  public.customer_ledger_balance(uuid,uuid),public.assert_supplier_account_consistent(uuid,uuid),
  public.assert_customer_account_consistent(uuid,uuid),public.enforce_party_account_consistency(),
  public.enforce_purchase_not_overallocated(),public.enforce_ledger_control_party(),
  public.post_supplier_payment(uuid,uuid,bigint,text,text),
  public.reverse_supplier_payment(uuid,text),public.reverse_credit_purchase(uuid,text) to service_role;

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
where p.status='posted'
group by p.id,x.expense_total,x.separate_expense_total;
grant select on public.purchase_history to authenticated;

create view public.supplier_purchase_metrics with(security_invoker=true) as
select company_id,supplier_id,count(*)::bigint purchase_count,
  coalesce(avg(total_cost),0)::bigint average_order,
  count(*) filter(where payment_status<>'paid')::bigint open_purchase_count,
  coalesce(sum(greatest(total_cost-paid,0)),0)::bigint outstanding
from public.purchase_history group by company_id,supplier_id;
grant select on public.supplier_purchase_metrics to authenticated;
