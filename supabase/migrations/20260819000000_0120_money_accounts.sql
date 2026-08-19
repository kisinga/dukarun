-- Customer-managed Bank and M-Pesa ledger accounts.
-- One account remains the default per payment method/location, while checkout
-- may explicitly route a tender to another active account of the same kind.

alter table public.ledger_accounts
  add column if not exists money_account_kind text
    check (money_account_kind in ('bank','mpesa'));

update public.ledger_accounts
set money_account_kind = case code when 'BANK_MAIN' then 'bank' when 'MPESA' then 'mpesa' end
where code in ('BANK_MAIN','MPESA') and money_account_kind is null;

create unique index if not exists ledger_accounts_active_money_name_unique
  on public.ledger_accounts(company_id,money_account_kind,lower(name))
  where money_account_kind is not null and is_active;

create or replace function public.classify_seed_money_account()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.money_account_kind is null then
    new.money_account_kind := case new.code
      when 'BANK_MAIN' then 'bank'
      when 'MPESA' then 'mpesa'
      else null
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_accounts_classify_seed_money on public.ledger_accounts;
create trigger ledger_accounts_classify_seed_money
before insert on public.ledger_accounts
for each row execute function public.classify_seed_money_account();

alter table public.payments add column if not exists ledger_account_code varchar(64);
-- The canonical VAT posting function already records this value; add the
-- missing persistence column for fresh and upgraded databases.
alter table public.payments add column if not exists cashier_session_id uuid
  references public.cashier_sessions(id) on delete set null;
alter table public.refunds add column if not exists ledger_account_code varchar(64);

update public.location_payment_methods lpm
set ledger_account_code=pm.ledger_account_code,updated_at=now()
from public.payment_methods pm
where pm.id=lpm.payment_method_id and lpm.ledger_account_code is null;

update public.payments p
set ledger_account_code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
from public.payment_methods pm
left join public.location_payment_methods lpm
  on lpm.payment_method_id=pm.id
where pm.company_id=p.company_id and pm.code=p.method_code
  and (lpm.location_id=p.location_id or lpm.location_id is null)
  and p.ledger_account_code is null;

update public.refunds r
set ledger_account_code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
from public.payment_methods pm
left join public.location_payment_methods lpm
  on lpm.payment_method_id=pm.id
where pm.company_id=r.company_id and pm.code=r.method_code
  and (lpm.location_id=r.location_id or lpm.location_id is null)
  and r.ledger_account_code is null;

create or replace function public.resolve_tender_account(
  p_company_id uuid,p_location_id uuid,p_method_code text,p_requested_account_code text default null
)
returns text language plpgsql stable security definer set search_path='' as $$
declare
  v_default_code text;
  v_kind text;
  v_account record;
begin
  select coalesce(lpm.ledger_account_code,pm.ledger_account_code),
    case pm.code when 'bank' then 'bank' when 'mpesa' then 'mpesa' else null end
  into v_default_code,v_kind
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id=pm.id and lpm.company_id=pm.company_id
   and lpm.location_id=p_location_id
  where pm.company_id=p_company_id and pm.code=p_method_code and pm.enabled and lpm.enabled;
  if v_default_code is null then
    raise exception 'payment_method_not_available: %',p_method_code;
  end if;

  select a.code,a.money_account_kind into v_account
  from public.ledger_accounts a
  where a.company_id=p_company_id
    and a.code=coalesce(nullif(btrim(p_requested_account_code),''),v_default_code)
    and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting;
  if v_account.code is null then
    raise exception 'payment_account_not_available: %',
      coalesce(nullif(btrim(p_requested_account_code),''),v_default_code);
  end if;
  if v_kind is null and v_account.code<>v_default_code then
    raise exception 'payment_account_not_selectable: %',p_method_code;
  end if;
  if v_kind is not null and v_account.money_account_kind is distinct from v_kind then
    raise exception 'payment_account_kind_mismatch: % requires %',p_method_code,v_kind;
  end if;
  return v_account.code;
end;
$$;
revoke execute on function public.resolve_tender_account(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.resolve_tender_account(uuid,uuid,text,text) to service_role;

create or replace function public.available_tender_accounts(p_location_id uuid default null)
returns table(account_code varchar,account_name varchar,method_code text,is_default boolean)
language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  return query
  select a.code,a.name,pm.code,a.code=coalesce(lpm.ledger_account_code,pm.ledger_account_code)
  from public.ledger_accounts a
  join public.payment_methods pm
    on pm.company_id=a.company_id
   and pm.code=case a.money_account_kind when 'bank' then 'bank' when 'mpesa' then 'mpesa' end
  join public.location_payment_methods lpm
    on lpm.payment_method_id=pm.id and lpm.location_id=v_location_id and lpm.enabled
  where a.company_id=v_company_id and a.money_account_kind is not null
    and a.is_active and not a.is_parent and a.type='asset' and a.allow_manual_posting
    and pm.enabled
  order by pm.code,is_default desc,a.name,a.code;
end;
$$;
revoke execute on function public.available_tender_accounts(uuid) from public,anon;
grant execute on function public.available_tender_accounts(uuid) to authenticated,service_role;

create or replace function public.create_money_account(p_kind text,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_parent_id uuid;
  v_id uuid:=gen_random_uuid();
  v_name text:=btrim(coalesce(p_name,''));
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;
  if p_kind not in ('bank','mpesa') then raise exception 'invalid_money_account_kind'; end if;
  if length(v_name)<2 or length(v_name)>100 then
    raise exception 'invalid_money_account_name: use 2 to 100 characters';
  end if;
  if exists(select 1 from public.ledger_accounts a where a.company_id=v_company_id
    and a.money_account_kind=p_kind and a.is_active and lower(a.name)=lower(v_name)) then
    raise exception 'money_account_name_exists';
  end if;
  select id into v_parent_id from public.ledger_accounts
    where company_id=v_company_id and code='CASH' and is_parent;
  if v_parent_id is null then raise exception 'cash_parent_account_missing'; end if;
  v_code:=upper(p_kind)||'_'||replace(v_id::text,'-','');
  insert into public.ledger_accounts(
    id,company_id,code,name,type,parent_id,is_parent,is_system,is_active,allow_manual_posting,
    money_account_kind
  ) values(
    v_id,v_company_id,v_code,v_name,'asset',v_parent_id,false,false,true,true,p_kind
  );
  return v_id;
end;
$$;

create or replace function public.update_money_account(
  p_account_id uuid,p_name text default null,p_is_active boolean default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_account public.ledger_accounts%rowtype;
  v_name text:=nullif(btrim(coalesce(p_name,'')),'');
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;
  select * into v_account from public.ledger_accounts
  where id=p_account_id and company_id=v_company_id and money_account_kind is not null for update;
  if v_account.id is null then raise exception 'money_account_not_found'; end if;
  if p_name is not null and (v_name is null or length(v_name)<2 or length(v_name)>100) then
    raise exception 'invalid_money_account_name: use 2 to 100 characters';
  end if;
  if coalesce(p_is_active,v_account.is_active) and exists(
    select 1 from public.ledger_accounts a
    where a.company_id=v_company_id and a.money_account_kind=v_account.money_account_kind
      and a.id<>v_account.id and a.is_active
      and lower(a.name)=lower(coalesce(v_name,v_account.name))
  ) then raise exception 'money_account_name_exists'; end if;
  if coalesce(p_is_active,v_account.is_active)=false and exists(
    select 1 from public.location_payment_methods lpm
    join public.payment_methods pm on pm.id=lpm.payment_method_id
    where lpm.company_id=v_company_id and lpm.ledger_account_code=v_account.code
      and pm.code in ('bank','mpesa')
  ) then raise exception 'money_account_is_location_default'; end if;
  update public.ledger_accounts
  set name=coalesce(v_name,name),is_active=coalesce(p_is_active,is_active),updated_at=now()
  where id=v_account.id;
  return v_account.id;
end;
$$;

create or replace function public.set_location_payment_account(
  p_location_id uuid,p_method_code text,p_account_code text
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid;
  v_method_id uuid;
  v_kind text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;
  if p_method_code not in ('bank','mpesa') then raise exception 'unsupported_payment_method'; end if;
  v_location_id:=public.resolve_business_location(p_location_id);
  v_kind:=p_method_code;
  if not exists(select 1 from public.ledger_accounts a where a.company_id=v_company_id
    and a.code=p_account_code and a.money_account_kind=v_kind and a.is_active
    and not a.is_parent and a.type='asset' and a.allow_manual_posting) then
    raise exception 'payment_account_not_available: %',p_account_code;
  end if;
  select id into v_method_id from public.payment_methods
    where company_id=v_company_id and code=p_method_code for update;
  if v_method_id is null then raise exception 'payment_method_not_found'; end if;
  insert into public.location_payment_methods(
    company_id,location_id,payment_method_id,enabled,ledger_account_code
  ) values(v_company_id,v_location_id,v_method_id,true,p_account_code)
  on conflict(location_id,payment_method_id) do update
    set ledger_account_code=excluded.ledger_account_code,updated_at=now();
  return v_method_id;
end;
$$;

revoke execute on function public.create_money_account(text,text),
  public.update_money_account(uuid,text,boolean),
  public.set_location_payment_account(uuid,text,text) from public,anon;
grant execute on function public.create_money_account(text,text),
  public.update_money_account(uuid,text,boolean),
  public.set_location_payment_account(uuid,text,text) to authenticated,service_role;

-- Preserve per-location defaults when availability is changed.
create or replace function public.set_payment_method_locations(
  p_code text,p_location_ids uuid[],p_all_locations boolean default false
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_method_id uuid;
  v_default_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;
  select id,ledger_account_code into v_method_id,v_default_code from public.payment_methods
    where company_id=v_company_id and code=p_code for update;
  if v_method_id is null then raise exception 'payment_method_not_found: %',p_code; end if;
  if exists(select 1 from unnest(coalesce(p_location_ids,'{}'::uuid[])) x(id)
    where not exists(select 1 from public.stock_locations l
      where l.id=x.id and l.company_id=v_company_id and l.is_active)) then
    raise exception 'invalid_business_location';
  end if;
  update public.payment_methods set
    availability_scope=case when p_all_locations then 'all_locations' else 'selected_locations' end,
    updated_at=now() where id=v_method_id;
  update public.location_payment_methods lpm set
    enabled=(p_all_locations or lpm.location_id=any(coalesce(p_location_ids,'{}'::uuid[]))),
    updated_at=now()
  where lpm.company_id=v_company_id and lpm.payment_method_id=v_method_id;
  insert into public.location_payment_methods(
    company_id,location_id,payment_method_id,enabled,ledger_account_code
  )
  select v_company_id,l.id,v_method_id,true,v_default_code
  from public.stock_locations l
  where l.company_id=v_company_id and l.is_active
    and (p_all_locations or l.id=any(coalesce(p_location_ids,'{}'::uuid[])))
  on conflict(location_id,payment_method_id) do nothing;
  return v_method_id;
end;
$$;

-- Mixed settlement uses the same explicit posting context as normal sales and
-- approval execution. Account routing is resolved once and persisted on each
-- payment before its journal is sealed.
create or replace function public.complete_order_with_prepayment_core(
  p_order_id uuid,p_payments jsonb,p_deposit_amount bigint,p_credit_amount bigint,
  p_client_ref text,p_context public.posting_context
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=(p_context).company_id;v_order public.orders%rowtype;v_payment jsonb;
  v_tender_total bigint:=0;v_amount bigint;v_payment_id uuid;v_account_code text;
  v_method record;
begin
  if v_company_id is null or (p_context).source not in('interactive','approval') then
    raise exception 'invalid_posting_context'; end if;
  if coalesce(p_deposit_amount,0)<0 or coalesce(p_credit_amount,0)<0 then
    raise exception 'invalid_settlement_amount'; end if;
  select * into v_order from public.orders
  where id=p_order_id and company_id=v_company_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.status='completed' then return v_order.id; end if;
  if v_order.location_id is distinct from (p_context).location_id then
    raise exception 'posting_context_location_mismatch'; end if;
  if v_order.status not in('draft','pending_payment') or v_order.customer_id is null then
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
  perform set_config('app.sale_residual_credit_amount',coalesce(p_credit_amount,0)::text,true);
  perform public.complete_order_core(p_order_id,'[]'::jsonb,p_context);
  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    v_amount:=(v_payment->>'amount')::bigint;
    select * into v_method from public.available_payment_methods(v_order.location_id) m
    where m.code=v_payment->>'method';
    if v_method is null then raise exception 'payment_method_not_available: %',v_payment->>'method'; end if;
    if not v_method.is_cashier_controlled and (p_context).source<>'approval'
      and not public.current_user_has_permission('ViewFinancials') then
      raise exception 'approval_required: external_account_payment'; end if;
    v_account_code:=public.resolve_tender_account(v_company_id,v_order.location_id,
      v_payment->>'method',v_payment->>'account_code');
    if v_payment->>'method'='bank' and nullif(btrim(v_payment->>'reference'),'') is null then
      raise exception 'reconciliation_reference_required: bank'; end if;
    insert into public.payments(
      company_id,order_id,method_code,amount,reference,mpesa_receipt,status,location_id,
      settlement_kind,ledger_account_code,cashier_session_id
    ) values(
      v_company_id,p_order_id,v_payment->>'method',v_amount,
      nullif(btrim(v_payment->>'reference'),''),nullif(btrim(v_payment->>'mpesa_receipt'),''),
      'settled',v_order.location_id,'tender',v_account_code,(p_context).cashier_session_id
    ) returning id into v_payment_id;
    perform public.post_journal_entry_with_context(v_company_id,'MixedSaleTender',v_payment_id::text,
      'Tender applied to sale '||v_order.code,jsonb_build_array(
        jsonb_build_object('account_code',v_account_code,'debit',v_amount,'order_id',p_order_id,
          'meta',jsonb_build_object('customerId',v_order.customer_id,'orderCode',v_order.code,
            'method',v_payment->>'method','reference',v_payment->>'reference')),
        jsonb_build_object('account_code','ACCOUNTS_RECEIVABLE','credit',v_amount,
          'order_id',p_order_id,'meta',jsonb_build_object('customerId',v_order.customer_id,
            'orderCode',v_order.code))),p_context);
  end loop;
  if coalesce(p_deposit_amount,0)>0 then
    -- Customer-deposit allocation remains its own idempotent domain action.
    perform set_config('app.business_location_id',v_order.location_id::text,true);
    perform public.apply_customer_deposit(p_order_id,p_deposit_amount,
      case when p_client_ref is null then null else p_client_ref||':deposit' end);
  end if;
  return p_order_id;
end;
$$;
revoke execute on function public.complete_order_with_prepayment_core(
  uuid,jsonb,bigint,bigint,text,public.posting_context) from public,anon,authenticated;
grant execute on function public.complete_order_with_prepayment_core(
  uuid,jsonb,bigint,bigint,text,public.posting_context) to service_role;

create or replace function public.complete_order_with_prepayment(
  p_order_id uuid,p_payments jsonb,p_deposit_amount bigint,p_credit_amount bigint,
  p_client_ref text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_context public.posting_context;
begin
  if not public.current_user_has_permission('SettleOrder')
    and nullif(current_setting('app.approved_prepayment_order_id',true),'')::uuid
      is distinct from p_order_id then
    raise exception 'permission_denied: SettleOrder required'; end if;
  v_context:=public.order_posting_context(p_order_id,'interactive');
  return public.complete_order_with_prepayment_core(p_order_id,p_payments,p_deposit_amount,
    p_credit_amount,p_client_ref,v_context);
end;
$$;
revoke execute on function public.complete_order_with_prepayment(uuid,jsonb,bigint,bigint,text)
  from public,anon,authenticated;
grant execute on function public.complete_order_with_prepayment(uuid,jsonb,bigint,bigint,text)
  to service_role;

-- Defaults plus non-default cashier-controlled accounts actually used in a session.
create or replace function public.cashier_controlled_accounts(
  p_company_id uuid,p_location_id uuid,p_session_id uuid default null
)
returns table(account_code varchar,account_name varchar)
language sql stable security definer set search_path='' as $$
  with codes as (
    select coalesce(lpm.ledger_account_code,pm.ledger_account_code)::varchar as account_code
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.company_id=pm.company_id
     and lpm.location_id=p_location_id
    where pm.company_id=p_company_id and pm.enabled and lpm.enabled
      and coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled)
    union
    select p.ledger_account_code
    from public.payments p
    join public.payment_methods pm
      on pm.company_id=p.company_id and pm.code=p.method_code
    join public.location_payment_methods lpm
      on lpm.payment_method_id=pm.id and lpm.location_id=p.location_id
    where p.company_id=p_company_id and p.location_id=p_location_id
      and p.cashier_session_id=p_session_id and p.ledger_account_code is not null
      and coalesce(lpm.is_cashier_controlled,pm.is_cashier_controlled)
  )
  select c.account_code,a.name
  from codes c join public.ledger_accounts a
    on a.company_id=p_company_id and a.code=c.account_code
  order by a.name,c.account_code
$$;
revoke execute on function public.cashier_controlled_accounts(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.cashier_controlled_accounts(uuid,uuid,uuid) to service_role;

create or replace function public.cashier_count_accounts(
  p_location_id uuid,p_session_id uuid default null
)
returns table(account_code varchar,account_name varchar)
language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  if p_session_id is not null and not exists(select 1 from public.cashier_sessions s
    where s.id=p_session_id and s.company_id=v_company_id and s.location_id=v_location_id) then
    raise exception 'cashier_session_not_found';
  end if;
  return query select * from public.cashier_controlled_accounts(
    v_company_id,v_location_id,p_session_id);
end;
$$;
revoke execute on function public.cashier_count_accounts(uuid,uuid) from public,anon;
grant execute on function public.cashier_count_accounts(uuid,uuid) to authenticated,service_role;

drop function if exists public.cashier_expected_balances(uuid);
create function public.cashier_expected_balances(
  p_location_id uuid,p_session_id uuid default null
)
returns table(account_code varchar,expected_balance bigint)
language plpgsql stable security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();
  v_location_id uuid:=public.resolve_business_location(p_location_id);
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;
  return query select a.account_code,
    public.location_account_balance(v_company_id,v_location_id,a.account_code)
  from public.cashier_controlled_accounts(v_company_id,v_location_id,p_session_id) a;
end;
$$;
revoke execute on function public.cashier_expected_balances(uuid,uuid) from public,anon;
grant execute on function public.cashier_expected_balances(uuid,uuid) to authenticated,service_role;

create or replace function public.validate_cashier_declarations(
  p_company_id uuid,p_location_id uuid,p_declarations jsonb,p_session_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_account_code text;
begin
  if jsonb_typeof(p_declarations) is distinct from 'array' then
    raise exception 'invalid_declarations: expected an array';
  end if;
  if exists(select 1 from jsonb_array_elements(p_declarations) d
    where jsonb_typeof(d)<>'object' or nullif(btrim(d->>'account_code'),'') is null
      or coalesce(d->>'declared','')!~'^[0-9]+$') then
    raise exception 'invalid_declaration: account_code and nonnegative integer declared are required';
  end if;
  select d->>'account_code' into v_account_code from jsonb_array_elements(p_declarations) d
    group by d->>'account_code' having count(*)>1 limit 1;
  if v_account_code is not null then raise exception 'duplicate_declaration: %',v_account_code; end if;
  select e.account_code into v_account_code
  from public.cashier_controlled_accounts(p_company_id,p_location_id,p_session_id) e
  where not exists(select 1 from jsonb_array_elements(p_declarations) d
    where d->>'account_code'=e.account_code) limit 1;
  if v_account_code is not null then raise exception 'missing_declaration: %',v_account_code; end if;
  select d->>'account_code' into v_account_code from jsonb_array_elements(p_declarations) d
  where not exists(select 1
    from public.cashier_controlled_accounts(p_company_id,p_location_id,p_session_id) e
    where e.account_code=d->>'account_code') limit 1;
  if v_account_code is not null then raise exception 'unexpected_declaration: %',v_account_code; end if;
end;
$$;
revoke execute on function public.validate_cashier_declarations(uuid,uuid,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.validate_cashier_declarations(uuid,uuid,jsonb,uuid) to service_role;

create or replace function public.close_cashier_session(p_session_id uuid,p_declarations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid:=public.current_company_id();v_session public.cashier_sessions%rowtype;
  v_recon_id uuid;v_decl jsonb;v_declared bigint;v_expected bigint;
  v_cash_declared bigint;v_cash_expected bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_session from public.cashier_sessions
  where id=p_session_id and company_id=v_company_id and status='open' for update;
  if v_session.id is null then raise exception 'session_not_open: %',p_session_id; end if;
  if not public.current_user_can_access_location(v_session.location_id) then
    raise exception 'location_access_denied'; end if;
  perform public.validate_cashier_declarations(v_company_id,v_session.location_id,
    coalesce(p_declarations,'null'::jsonb),p_session_id);
  insert into public.reconciliations(company_id,location_id,scope,scope_ref_id,status,created_by)
  values(v_company_id,v_session.location_id,'cash-session',p_session_id::text||':closing',
    'verified',auth.uid()) returning id into v_recon_id;
  for v_decl in select * from jsonb_array_elements(p_declarations) loop
    v_declared:=(v_decl->>'declared')::bigint;
    v_expected:=public.location_account_balance(
      v_company_id,v_session.location_id,v_decl->>'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id,account_code,declared,expected,variance
    ) values(v_recon_id,v_decl->>'account_code',v_declared,v_expected,v_declared-v_expected);
    if v_decl->>'account_code'='CASH_ON_HAND' then
      v_cash_declared:=v_declared;v_cash_expected:=v_expected;end if;
    perform public.post_location_variance_adjustment(v_company_id,v_session.location_id,
      p_session_id,v_decl->>'account_code',v_declared,v_recon_id::text,'Closing count variance');
  end loop;
  if v_cash_declared is not null then
    insert into public.cash_drawer_counts(
      session_id,company_id,count_type,declared_cash,expected_cash,variance,created_by
    ) values(p_session_id,v_company_id,'closing',v_cash_declared,v_cash_expected,
      v_cash_declared-v_cash_expected,auth.uid());
  end if;
  update public.cashier_sessions set status='closed',closed_at=now(),
    closing_declared=v_cash_declared where id=p_session_id;
  return p_session_id;
end;
$$;

-- New locations receive explicit defaults; account and mapping changes invalidate POS settings.
create or replace function public.bootstrap_business_location()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.location_payment_methods(
    company_id,location_id,payment_method_id,ledger_account_code
  )
  select new.company_id,new.id,pm.id,pm.ledger_account_code
  from public.payment_methods pm
  where pm.company_id=new.company_id and pm.availability_scope='all_locations'
  on conflict(location_id,payment_method_id) do nothing;
  insert into public.company_membership_locations(company_id,membership_id,location_id,is_primary)
  select new.company_id,m.id,new.id,false from public.company_memberships m
  where m.company_id=new.company_id and m.authorization_status='approved'
  on conflict(membership_id,location_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ledger_accounts_money_audit on public.ledger_accounts;
create trigger ledger_accounts_money_audit after insert or update or delete on public.ledger_accounts
for each row execute function public.audit_trigger();
drop trigger if exists location_payment_methods_audit on public.location_payment_methods;
create trigger location_payment_methods_audit after insert or update or delete on public.location_payment_methods
for each row execute function public.audit_trigger();

drop trigger if exists ledger_accounts_settings_cache_change on public.ledger_accounts;
create trigger ledger_accounts_settings_cache_change after insert or update or delete
on public.ledger_accounts for each row
execute function public.cache_change_trigger('settings','payment_account','id');
drop trigger if exists location_payment_methods_settings_cache_change on public.location_payment_methods;
create trigger location_payment_methods_settings_cache_change after insert or update or delete
on public.location_payment_methods for each row
execute function public.cache_change_trigger('settings','payment_account','payment_method_id','location_id');
