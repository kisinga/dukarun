-- Incremental credit intelligence. Operational transactions only enqueue a
-- party; the worker owns document reconstruction, scoring and notifications.

alter table public.companies
  add column credit_opportunity_rate_bps integer not null default 1800
    check (credit_opportunity_rate_bps between 0 and 10000),
  add column credit_score_notifications_enabled boolean not null default true;

alter table public.customers
  add column credit_score_notifications_enabled boolean not null default true;

alter table public.customer_receipts
  add column paid_on date,
  add column paid_on_source text not null default 'estimated'
    check (paid_on_source in ('manual','provider','estimated'));

alter table public.supplier_payments
  add column paid_on date,
  add column paid_on_source text not null default 'estimated'
    check (paid_on_source in ('manual','provider','estimated'));

update public.customer_receipts r
set paid_on = coalesce((r.posted_at at time zone c.business_timezone)::date,
  (r.created_at at time zone c.business_timezone)::date),
    paid_on_source = 'estimated'
from public.companies c
where c.id=r.company_id and r.paid_on is null;

update public.supplier_payments p
set paid_on=(p.created_at at time zone c.business_timezone)::date,
    paid_on_source='estimated'
from public.companies c
where c.id=p.company_id and p.paid_on is null;

alter table public.customer_receipts alter column paid_on set not null;
alter table public.supplier_payments alter column paid_on set not null;

-- Legacy callers do not yet pass paid_on. Fill their evidence before the
-- NOT NULL check, then let the dated wrappers upgrade estimated evidence.
create or replace function public.default_payment_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_timezone text;
begin
  if new.paid_on is null then
    select business_timezone into v_timezone from public.companies where id=new.company_id;
    new.paid_on:=(coalesce(new.created_at,now()) at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
    new.paid_on_source:='estimated';
  end if;
  return new;
end;
$$;
revoke execute on function public.default_payment_evidence() from public,anon,authenticated;
create trigger customer_receipts_default_payment_evidence
before insert on public.customer_receipts for each row execute function public.default_payment_evidence();
create trigger supplier_payments_default_payment_evidence
before insert on public.supplier_payments for each row execute function public.default_payment_evidence();

create or replace function public.guard_payment_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.paid_on is distinct from new.paid_on
    or old.paid_on_source is distinct from new.paid_on_source then
    if old.paid_on_source<>'estimated' or new.paid_on_source='estimated' then
      raise exception 'payment_evidence_immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_payment_evidence() from public,anon,authenticated;

create trigger customer_receipts_payment_evidence_immutable
before update of paid_on,paid_on_source on public.customer_receipts
for each row execute function public.guard_payment_evidence();
create trigger supplier_payments_payment_evidence_immutable
before update of paid_on,paid_on_source on public.supplier_payments
for each row execute function public.guard_payment_evidence();

-- Provider collections are authoritative. Receipt creation and allocation are
-- intentionally decoupled in the M-Pesa workflow, so upgrade the evidence as
-- soon as the allocation is linked without changing the receipt amount.
create or replace function public.apply_provider_receipt_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_occurred timestamptz;v_timezone text;
begin
  if new.collection_allocation_id is null or new.paid_on_source<>'estimated' then return new; end if;
  select pc.occurred_at,c.business_timezone into v_occurred,v_timezone
  from public.payment_collection_allocations a
  join public.payment_collections pc on pc.id=a.collection_id
  join public.companies c on c.id=new.company_id
  where a.id=new.collection_allocation_id and a.company_id=new.company_id;
  if v_occurred is not null then
    update public.customer_receipts set
      paid_on=(v_occurred at time zone coalesce(v_timezone,'Africa/Nairobi'))::date,
      paid_on_source='provider'
    where id=new.id and paid_on_source='estimated';
  end if;
  return new;
end;
$$;
revoke execute on function public.apply_provider_receipt_evidence() from public,anon,authenticated;
create trigger customer_receipts_apply_provider_evidence_insert
after insert on public.customer_receipts
for each row execute function public.apply_provider_receipt_evidence();
create trigger customer_receipts_apply_provider_evidence_update
after update of collection_allocation_id on public.customer_receipts
for each row execute function public.apply_provider_receipt_evidence();

update public.customer_receipts r set
  paid_on=(pc.occurred_at at time zone c.business_timezone)::date,
  paid_on_source='provider'
from public.payment_collection_allocations a
join public.payment_collections pc on pc.id=a.collection_id
join public.companies c on c.id=a.company_id
where r.collection_allocation_id=a.id and r.company_id=a.company_id
  and r.paid_on_source='estimated';

-- New clients send the effective payment date. The old six/five argument RPCs
-- remain valid for cached clients and continue to create estimated evidence.
create or replace function public.post_customer_receipt(
  p_location_id uuid,p_customer_id uuid,p_amount bigint,p_method_code text,
  p_reference text,p_client_ref text,p_paid_on date,p_paid_on_source text default 'manual'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_receipt_id uuid;v_today date;v_timezone text;
begin
  if p_paid_on_source not in ('manual','provider') then raise exception 'invalid_paid_on_source'; end if;
  select business_timezone into v_timezone from public.companies where id=public.current_company_id();
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  if p_paid_on is null or p_paid_on>v_today then raise exception 'invalid_paid_on'; end if;
  v_result:=public.post_customer_receipt(p_location_id,p_customer_id,p_amount,p_method_code,
    p_reference,p_client_ref);
  v_receipt_id:=coalesce((v_result->>'receipt_id')::uuid,(v_result->>'resource_id')::uuid);
  update public.customer_receipts set paid_on=p_paid_on,paid_on_source=p_paid_on_source
  where id=v_receipt_id and company_id=public.current_company_id() and paid_on_source='estimated';
  return v_result;
end;
$$;
revoke execute on function public.post_customer_receipt(uuid,uuid,bigint,text,text,text,date,text)
  from public,anon;
grant execute on function public.post_customer_receipt(uuid,uuid,bigint,text,text,text,date,text)
  to authenticated;

create or replace function public.post_supplier_payment(
  p_supplier_id uuid,p_purchase_id uuid,p_amount bigint,p_account_code text,
  p_client_ref text,p_paid_on date,p_paid_on_source text default 'manual'
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_today date;v_timezone text;
begin
  if p_paid_on_source not in ('manual','provider') then raise exception 'invalid_paid_on_source'; end if;
  select business_timezone into v_timezone from public.companies where id=public.current_company_id();
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  if p_paid_on is null or p_paid_on>v_today then raise exception 'invalid_paid_on'; end if;
  v_id:=public.post_supplier_payment(p_supplier_id,p_purchase_id,p_amount,p_account_code,p_client_ref);
  update public.supplier_payments set paid_on=p_paid_on,paid_on_source=p_paid_on_source
  where id=v_id and company_id=public.current_company_id() and paid_on_source='estimated';
  return v_id;
end;
$$;
revoke execute on function public.post_supplier_payment(uuid,uuid,bigint,text,text,date,text)
  from public,anon;
grant execute on function public.post_supplier_payment(uuid,uuid,bigint,text,text,date,text)
  to authenticated;

create or replace function public.post_supplier_fifo_payment(
  p_supplier_id uuid,p_amount bigint,p_account_code text,p_client_ref text,
  p_paid_on date,p_paid_on_source text default 'manual'
)
returns uuid language sql security definer set search_path='' as $$
  select public.post_supplier_payment(p_supplier_id,null,p_amount,p_account_code,
    p_client_ref,p_paid_on,p_paid_on_source)
$$;
revoke execute on function public.post_supplier_fifo_payment(uuid,bigint,text,text,date,text)
  from public,anon;
grant execute on function public.post_supplier_fifo_payment(uuid,bigint,text,text,date,text)
  to authenticated;

create table public.credit_document_performance (
  company_id uuid not null references public.companies(id) on delete cascade,
  side text not null check(side in ('customer','supplier')),
  party_id uuid not null references public.customers(id) on delete cascade,
  document_id uuid not null,
  document_code text not null,
  issued_on date not null,
  due_on date not null,
  original_amount bigint not null check(original_amount>=0),
  settled_amount bigint not null default 0 check(settled_amount>=0),
  outstanding_amount bigint not null default 0 check(outstanding_amount>=0),
  settled_on date,
  settled_days_late integer,
  punctuality_factor numeric(6,5),
  overdue_days integer not null default 0,
  settled_principal_days numeric(24,3) not null default 0,
  principal_days_as_of date not null,
  next_refresh_on date,
  refreshed_at timestamptz not null default now(),
  primary key(company_id,side,document_id)
);
create index credit_document_party_idx on public.credit_document_performance
  (company_id,side,party_id,due_on desc,document_id);
create index credit_document_next_refresh_idx on public.credit_document_performance(next_refresh_on)
  where next_refresh_on is not null;

create table public.party_credit_profile (
  company_id uuid not null references public.companies(id) on delete cascade,
  side text not null check(side in ('customer','supplier')),
  party_id uuid not null references public.customers(id) on delete cascade,
  party_name text not null,
  model_version text not null default 'credit-v1',
  score numeric(3,1),
  band text not null check(band in ('unrated','strong','good','watch','restricted','high_risk')),
  confidence text not null check(confidence in ('unrated','provisional','established')),
  balance bigint not null default 0,
  credit_limit bigint not null default 0,
  available_credit bigint,
  utilization numeric(8,4),
  overdue_amount bigint not null default 0,
  oldest_due_on date,
  oldest_overdue_days integer not null default 0,
  settled_documents integer not null default 0,
  history_days integer not null default 0,
  punctuality numeric(6,5),
  recommendation_code text not null,
  reason_codes text[] not null default '{}',
  opportunity_cost bigint not null default 0,
  next_refresh_on date,
  refreshed_at timestamptz not null default now(),
  primary key(company_id,side,party_id)
);
create index party_credit_portfolio_idx on public.party_credit_profile
  (company_id,side,band,overdue_amount desc,oldest_overdue_days desc,party_id);
create index party_credit_refresh_idx on public.party_credit_profile(next_refresh_on)
  where next_refresh_on is not null;

create table public.credit_profile_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  side text not null check(side in ('customer','supplier')),
  party_id uuid not null references public.customers(id) on delete cascade,
  model_version text not null,
  score numeric(3,1),
  band text not null,
  confidence text not null,
  reason_codes text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index credit_profile_events_party_idx on public.credit_profile_events
  (company_id,side,party_id,created_at desc,id desc);

create table public.credit_dirty_parties (
  company_id uuid not null references public.companies(id) on delete cascade,
  side text not null check(side in ('customer','supplier')),
  party_id uuid not null references public.customers(id) on delete cascade,
  reason text not null default 'activity',
  dirty_since timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  primary key(company_id,side,party_id)
);
create index credit_dirty_ready_idx on public.credit_dirty_parties(available_at,dirty_since);

create table public.credit_band_notification_queue (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  from_band text not null,
  to_band text not null,
  score numeric(3,1),
  reason_code text,
  changed_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  primary key(company_id,customer_id)
);
create index credit_band_notification_ready_idx on public.credit_band_notification_queue(send_after)
  where sent_at is null;

create table public.sale_credit_advisory_snapshots (
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  score numeric(3,1),
  band text not null,
  confidence text not null,
  reason_codes text[] not null default '{}',
  recommendation_code text not null,
  score_refreshed_at timestamptz,
  presented_at timestamptz not null default now(),
  acknowledgement_reason text,
  acknowledged_by uuid
);
alter table public.sale_credit_advisory_snapshots enable row level security;
create policy "credit advisory snapshots readable with financial access"
  on public.sale_credit_advisory_snapshots for select using(
    (company_id=(select public.current_company_id())
      and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin()));
grant select on public.sale_credit_advisory_snapshots to authenticated;
grant all on public.sale_credit_advisory_snapshots to service_role;

alter table public.credit_document_performance enable row level security;
alter table public.party_credit_profile enable row level security;
alter table public.credit_profile_events enable row level security;
alter table public.credit_dirty_parties enable row level security;
alter table public.credit_band_notification_queue enable row level security;
revoke all on public.credit_document_performance,public.party_credit_profile,
  public.credit_profile_events,public.credit_dirty_parties,
  public.credit_band_notification_queue from public,anon,authenticated;
grant all on public.credit_document_performance,public.party_credit_profile,
  public.credit_profile_events,public.credit_dirty_parties,
  public.credit_band_notification_queue to service_role;

create or replace function public.record_credit_advisory_snapshot(
  p_order_id uuid,p_score numeric,p_band text,p_confidence text,p_reason_codes text[],
  p_recommendation_code text,p_score_refreshed_at timestamptz,p_acknowledgement_reason text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_order public.orders%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_order from public.orders where id=p_order_id and company_id=v_company;
  if v_order.id is null or v_order.customer_id is null then raise exception 'sale_not_found'; end if;
  insert into public.sale_credit_advisory_snapshots(company_id,order_id,customer_id,score,band,
    confidence,reason_codes,recommendation_code,score_refreshed_at,acknowledgement_reason,acknowledged_by)
  values(v_company,v_order.id,v_order.customer_id,p_score,p_band,p_confidence,
    coalesce(p_reason_codes,'{}'),p_recommendation_code,p_score_refreshed_at,
    nullif(btrim(p_acknowledgement_reason),''),auth.uid())
  on conflict(order_id) do nothing;
end;
$$;
revoke execute on function public.record_credit_advisory_snapshot(uuid,numeric,text,text,text[],text,timestamptz,text)
  from public,anon;
grant execute on function public.record_credit_advisory_snapshot(uuid,numeric,text,text,text[],text,timestamptz,text)
  to authenticated;

create or replace function public.enqueue_credit_party(
  p_company_id uuid,p_side text,p_party_id uuid,p_reason text default 'activity'
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_company_id is null or p_party_id is null or p_side not in ('customer','supplier') then return; end if;
  insert into public.credit_dirty_parties(company_id,side,party_id,reason)
  values(p_company_id,p_side,p_party_id,coalesce(nullif(p_reason,''),'activity'))
  on conflict(company_id,side,party_id) do update set
    reason=excluded.reason,dirty_since=least(public.credit_dirty_parties.dirty_since,now()),
    available_at=least(public.credit_dirty_parties.available_at,now()),last_error=null;
end;
$$;
revoke execute on function public.enqueue_credit_party(uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.enqueue_credit_party(uuid,text,uuid,text) to service_role;

create or replace function public.enqueue_credit_from_party_row()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row public.customers%rowtype;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  perform public.enqueue_credit_party(v_row.company_id,
    case when v_row.is_supplier then 'supplier' else 'customer' end,v_row.id,'policy');
  return coalesce(new,old);
end;
$$;
create trigger customers_enqueue_credit
after insert or update of credit_limit,credit_terms_days,is_credit_approved,
  supplier_credit_limit,supplier_credit_terms_days on public.customers
for each row execute function public.enqueue_credit_from_party_row();

create or replace function public.enqueue_credit_from_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' and old.customer_id is not null then
    perform public.enqueue_credit_party(old.company_id,'customer',old.customer_id,'sale'); end if;
  if tg_op<>'DELETE' and new.customer_id is not null then
    perform public.enqueue_credit_party(new.company_id,'customer',new.customer_id,'sale'); end if;
  return coalesce(new,old);
end;
$$;
create trigger orders_enqueue_credit after insert or update or delete on public.orders
for each row execute function public.enqueue_credit_from_order();

create or replace function public.enqueue_credit_from_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order_id uuid;v_company uuid;v_party uuid;
begin
  v_order_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  select company_id,customer_id into v_company,v_party from public.orders where id=v_order_id;
  perform public.enqueue_credit_party(v_company,'customer',v_party,'payment');
  return coalesce(new,old);
end;
$$;
create trigger payments_enqueue_credit after insert or update or delete on public.payments
for each row execute function public.enqueue_credit_from_payment();

create or replace function public.enqueue_credit_from_purchase()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then perform public.enqueue_credit_party(old.company_id,'supplier',old.supplier_id,'purchase'); end if;
  if tg_op<>'DELETE' then perform public.enqueue_credit_party(new.company_id,'supplier',new.supplier_id,'purchase'); end if;
  return coalesce(new,old);
end;
$$;
create trigger purchases_enqueue_credit after insert or update or delete on public.purchases
for each row execute function public.enqueue_credit_from_purchase();

create or replace function public.enqueue_credit_from_purchase_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_purchase_id uuid;v_company uuid;v_party uuid;
begin
  v_purchase_id:=case when tg_op='DELETE' then old.purchase_id else new.purchase_id end;
  select company_id,supplier_id into v_company,v_party from public.purchases where id=v_purchase_id;
  perform public.enqueue_credit_party(v_company,'supplier',v_party,'payment');
  return coalesce(new,old);
end;
$$;
create trigger purchase_payments_enqueue_credit
after insert or update or delete on public.purchase_payments
for each row execute function public.enqueue_credit_from_purchase_payment();

create or replace function public.refresh_credit_party(
  p_company_id uuid,p_side text,p_party_id uuid,p_baseline boolean default false
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_today date;v_timezone text;v_party record;v_previous public.party_credit_profile%rowtype;
  v_score numeric;v_raw_score numeric;v_band text;v_confidence text;v_recommendation text;
  v_punctuality numeric;v_overdue_component numeric;v_utilization_component numeric;v_trend numeric;
  v_weight numeric:=0;v_total numeric:=0;v_balance bigint;v_limit bigint;v_overdue bigint;
  v_oldest date;v_oldest_days integer;v_settled integer;v_history integer;v_utilization numeric;
  v_material numeric;v_reasons text[]:=array[]::text[];v_next date;v_opportunity bigint;v_changed boolean;
begin
  if p_side not in ('customer','supplier') then raise exception 'invalid_credit_side'; end if;
  select c.business_timezone into v_timezone from public.companies c where c.id=p_company_id;
  if v_timezone is null then raise exception 'company_not_found'; end if;
  v_today:=(now() at time zone v_timezone)::date;
  select c.*,trim(concat_ws(' ',c.first_name,c.last_name)) party_name into v_party
  from public.customers c where c.id=p_party_id and c.company_id=p_company_id;
  if not found then return; end if;
  v_limit:=case when p_side='supplier' then v_party.supplier_credit_limit else v_party.credit_limit end;
  select * into v_previous from public.party_credit_profile
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  delete from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  if p_side='customer' then
    insert into public.credit_document_performance(company_id,side,party_id,document_id,document_code,
      issued_on,due_on,original_amount,settled_amount,outstanding_amount,settled_on,
      settled_days_late,punctuality_factor,overdue_days,settled_principal_days,
      principal_days_as_of,next_refresh_on,refreshed_at)
    select p_company_id,'customer',o.customer_id,o.id,o.code,
      (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date,
      coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),
      o.total,least(coalesce(pay.paid,0),o.total),greatest(o.total-coalesce(pay.paid,0),0),
      pay.settled_on,
      case when coalesce(pay.paid,0)>=o.total then greatest(pay.settled_on-coalesce(o.credit_due_at,
        (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0) end,
      pay.punctuality,greatest(v_today-coalesce(o.credit_due_at,
        (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0),
      coalesce(pay.principal_days,0),v_today,
      case when o.total-coalesce(pay.paid,0)>0 then
        (select min(x) from unnest(array[
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+8,
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+31,
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+61
        ]) x where x>v_today) end,now()
    from public.orders o
    left join lateral (
      select sum(p.amount) filter(where p.status='settled')::bigint paid,
        max(coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date))
          filter(where p.status='settled') settled_on,
        case when sum(p.amount) filter(where p.status='settled')>0 then
          sum(p.amount*(case
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date) then 1
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+7 then .8
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+30 then .5
            when coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)<=coalesce(o.credit_due_at,
              (coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date)+60 then .2 else 0 end))
            filter(where p.status='settled')/nullif(sum(p.amount) filter(where p.status='settled'),0) end punctuality,
        sum(p.amount*greatest(coalesce(r.paid_on,(p.created_at at time zone v_timezone)::date)-
          coalesce(o.credit_due_at,(coalesce(o.completed_at,o.created_at) at time zone v_timezone)::date),0))
          filter(where p.status='settled') principal_days
      from public.payments p left join public.customer_receipts r on r.id=p.customer_receipt_id
      where p.order_id=o.id
    ) pay on true
    where o.company_id=p_company_id and o.customer_id=p_party_id and o.is_credit_sale
      and o.status='completed' and (o.total-coalesce(pay.paid,0)>0
        or pay.settled_on>=v_today-365);
  else
    insert into public.credit_document_performance(company_id,side,party_id,document_id,document_code,
      issued_on,due_on,original_amount,settled_amount,outstanding_amount,settled_on,
      settled_days_late,punctuality_factor,overdue_days,settled_principal_days,
      principal_days_as_of,next_refresh_on,refreshed_at)
    select p_company_id,'supplier',p.supplier_id,p.id,coalesce(nullif(p.reference,''),'Purchase '||left(p.id::text,8)),
      p.purchase_date,coalesce(p.credit_due_at,p.purchase_date),p.total_cost,
      least(coalesce(pay.paid,0),p.total_cost),greatest(p.total_cost-coalesce(pay.paid,0),0),pay.settled_on,
      case when coalesce(pay.paid,0)>=p.total_cost then greatest(pay.settled_on-coalesce(p.credit_due_at,p.purchase_date),0) end,
      pay.punctuality,greatest(v_today-coalesce(p.credit_due_at,p.purchase_date),0),
      coalesce(pay.principal_days,0),v_today,
      case when p.total_cost-coalesce(pay.paid,0)>0 then
        (select min(x) from unnest(array[coalesce(p.credit_due_at,p.purchase_date),
          coalesce(p.credit_due_at,p.purchase_date)+8,coalesce(p.credit_due_at,p.purchase_date)+31,
          coalesce(p.credit_due_at,p.purchase_date)+61]) x where x>v_today) end,now()
    from public.purchases p
    left join lateral (
      select sum(pp.amount) filter(where pp.status='settled')::bigint paid,
        max(coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date))
          filter(where pp.status='settled') settled_on,
        case when sum(pp.amount) filter(where pp.status='settled')>0 then
          sum(pp.amount*(case
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date) then 1
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+7 then .8
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+30 then .5
            when coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)<=coalesce(p.credit_due_at,p.purchase_date)+60 then .2 else 0 end))
            filter(where pp.status='settled')/nullif(sum(pp.amount) filter(where pp.status='settled'),0) end punctuality,
        sum(pp.amount*greatest(coalesce(sp.paid_on,(pp.created_at at time zone v_timezone)::date)-
          coalesce(p.credit_due_at,p.purchase_date),0)) filter(where pp.status='settled') principal_days
      from public.purchase_payments pp left join public.supplier_payments sp on sp.id=pp.supplier_payment_id
      where pp.purchase_id=p.id
    ) pay on true
    where p.company_id=p_company_id and p.supplier_id=p_party_id and p.is_credit and p.status='posted'
      and (p.total_cost-coalesce(pay.paid,0)>0 or pay.settled_on>=v_today-365);
  end if;

  select coalesce(sum(outstanding_amount),0)::bigint,
    coalesce(sum(outstanding_amount) filter(where due_on<v_today),0)::bigint,
    min(due_on) filter(where outstanding_amount>0 and due_on<v_today),
    coalesce(max(v_today-due_on) filter(where outstanding_amount>0 and due_on<v_today),0)::int,
    count(*) filter(where outstanding_amount=0)::int,
    coalesce(v_today-min(issued_on),0)::int,
    sum(punctuality_factor*settled_amount*(case when settled_on>=v_today-90 then 1
      when settled_on>=v_today-180 then .75 else .5 end)) /
      nullif(sum(settled_amount*(case when settled_on>=v_today-90 then 1
      when settled_on>=v_today-180 then .75 else .5 end)) filter(where punctuality_factor is not null),0),
    min(next_refresh_on),
    coalesce(round(sum(settled_principal_days+outstanding_amount*greatest(v_today-due_on,0)) *
      (select credit_opportunity_rate_bps from public.companies where id=p_company_id)/10000.0/365.0),0)::bigint
  into v_balance,v_overdue,v_oldest,v_oldest_days,v_settled,v_history,v_punctuality,v_next,v_opportunity
  from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id;

  v_utilization:=case when v_limit>0 then v_balance::numeric/v_limit end;
  if v_punctuality is not null then v_total:=v_total+v_punctuality*.45;v_weight:=v_weight+.45; end if;
  if v_balance>0 then
    v_overdue_component:=greatest(0,1-(v_overdue::numeric/greatest(v_balance,1)) *
      (case when v_oldest_days>60 then 1 when v_oldest_days>30 then .8 when v_oldest_days>7 then .6 else .4 end));
    v_total:=v_total+v_overdue_component*.30;v_weight:=v_weight+.30;
  end if;
  if v_limit>0 then
    v_utilization_component:=case when v_utilization<=.5 then 1 when v_utilization<=1 then 2-2*v_utilization else 0 end;
    v_total:=v_total+v_utilization_component*.15;v_weight:=v_weight+.15;
  end if;
  select .5+greatest(-1,least(1,
    coalesce(avg(punctuality_factor) filter(where settled_on>=v_today-90),.5)-
    coalesce(avg(punctuality_factor) filter(where settled_on between v_today-180 and v_today-91),.5)))/2
  into v_trend from public.credit_document_performance
  where company_id=p_company_id and side=p_side and party_id=p_party_id and punctuality_factor is not null;
  if v_settled>=2 then v_total:=v_total+v_trend*.10;v_weight:=v_weight+.10; end if;

  if v_settled=0 and v_overdue=0 then
    v_score:=null;v_band:='unrated';v_confidence:='unrated';
  else
    v_raw_score:=round((10*v_total/nullif(v_weight,0))::numeric,1);
    v_score:=least(v_raw_score,case when v_settled=0 then 6.9 else 10 end);
    if v_limit>0 and v_balance>v_limit then v_score:=least(v_score,6.9); end if;
    v_material:=v_overdue::numeric/greatest(v_balance,v_limit,1);
    if v_oldest_days>30 and v_material>=.10 then v_score:=least(v_score,4.9); end if;
    if v_oldest_days>60 and v_material>=.25 then v_score:=least(v_score,2.9); end if;
    v_band:=case when v_score>=8.5 then 'strong' when v_score>=7 then 'good'
      when v_score>=5 then 'watch' when v_score>=3 then 'restricted' else 'high_risk' end;
    v_confidence:=case when v_settled<3 or v_history<90 then 'provisional' else 'established' end;
  end if;
  v_recommendation:=case v_band when 'strong' then 'maintain_review_eligible'
    when 'good' then 'maintain' when 'watch' then 'pause_increases_target_down_10'
    when 'restricted' then 'manager_review_target_down_25'
    when 'high_risk' then 'pause_new_credit' else 'establish_limit' end;
  if v_limit=0 and v_band<>'unrated' then v_recommendation:='establish_limit'; end if;
  if v_limit>0 and v_balance>v_limit then v_reasons:=array_append(v_reasons,'over_limit'); end if;
  if v_oldest_days>60 then v_reasons:=array_append(v_reasons,'overdue_60_plus');
  elsif v_oldest_days>30 then v_reasons:=array_append(v_reasons,'overdue_31_60');
  elsif v_oldest_days>7 then v_reasons:=array_append(v_reasons,'overdue_8_30');
  elsif v_oldest_days>0 then v_reasons:=array_append(v_reasons,'overdue_1_7'); end if;
  if v_punctuality is not null and v_punctuality<.5 then v_reasons:=array_append(v_reasons,'frequently_late'); end if;
  if cardinality(v_reasons)=0 then v_reasons:=array['no_current_risk']; end if;

  v_changed:=v_previous.party_id is null or v_previous.score is distinct from v_score
    or v_previous.band is distinct from v_band or v_previous.confidence is distinct from v_confidence;
  insert into public.party_credit_profile(company_id,side,party_id,party_name,score,band,confidence,
    balance,credit_limit,available_credit,utilization,overdue_amount,oldest_due_on,oldest_overdue_days,
    settled_documents,history_days,punctuality,recommendation_code,reason_codes,opportunity_cost,
    next_refresh_on,refreshed_at)
  values(p_company_id,p_side,p_party_id,v_party.party_name,v_score,v_band,v_confidence,v_balance,v_limit,
    case when v_limit>0 then greatest(v_limit-v_balance,0) end,v_utilization,v_overdue,v_oldest,v_oldest_days,
    v_settled,v_history,v_punctuality,v_recommendation,v_reasons,v_opportunity,v_next,now())
  on conflict(company_id,side,party_id) do update set party_name=excluded.party_name,score=excluded.score,
    band=excluded.band,confidence=excluded.confidence,balance=excluded.balance,credit_limit=excluded.credit_limit,
    available_credit=excluded.available_credit,utilization=excluded.utilization,
    overdue_amount=excluded.overdue_amount,oldest_due_on=excluded.oldest_due_on,
    oldest_overdue_days=excluded.oldest_overdue_days,settled_documents=excluded.settled_documents,
    history_days=excluded.history_days,punctuality=excluded.punctuality,
    recommendation_code=excluded.recommendation_code,reason_codes=excluded.reason_codes,
    opportunity_cost=excluded.opportunity_cost,next_refresh_on=excluded.next_refresh_on,refreshed_at=now();

  if v_changed then
    insert into public.credit_profile_events(company_id,side,party_id,model_version,score,band,confidence,reason_codes)
    values(p_company_id,p_side,p_party_id,'credit-v1',v_score,v_band,v_confidence,v_reasons);
  end if;
  if not p_baseline and p_side='customer' and v_previous.party_id is not null
    and v_previous.band is distinct from v_band and v_band<>'unrated' then
    insert into public.credit_band_notification_queue(company_id,customer_id,from_band,to_band,score,reason_code,send_after)
    values(p_company_id,p_party_id,v_previous.band,v_band,v_score,v_reasons[1],
      greatest(now(),coalesce((select max(sent_at)+interval '14 days' from public.credit_band_notification_queue
        where company_id=p_company_id and customer_id=p_party_id),now())))
    on conflict(company_id,customer_id) do update set
      from_band=case when public.credit_band_notification_queue.sent_at is null
        then public.credit_band_notification_queue.from_band else excluded.from_band end,
      to_band=excluded.to_band,score=excluded.score,reason_code=excluded.reason_code,changed_at=now(),
      send_after=greatest(public.credit_band_notification_queue.send_after,excluded.send_after),
      sent_at=null,last_error=null;
  end if;
end;
$$;
revoke execute on function public.refresh_credit_party(uuid,text,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.refresh_credit_party(uuid,text,uuid,boolean) to service_role;

create or replace function public.process_credit_dirty_parties(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record;v_count integer:=0;
begin
  for v_row in select * from public.credit_dirty_parties
    where available_at<=now() order by dirty_since limit least(greatest(p_limit,1),500)
    for update skip locked
  loop
    begin
      perform public.refresh_credit_party(v_row.company_id,v_row.side,v_row.party_id,false);
      delete from public.credit_dirty_parties where company_id=v_row.company_id
        and side=v_row.side and party_id=v_row.party_id;
      v_count:=v_count+1;
    exception when others then
      update public.credit_dirty_parties set attempts=attempts+1,last_error=sqlerrm,
        available_at=now()+least(interval '30 minutes',interval '1 minute'*power(2,least(attempts,5)))
      where company_id=v_row.company_id and side=v_row.side and party_id=v_row.party_id;
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.process_credit_dirty_parties(integer) from public,anon,authenticated;
grant execute on function public.process_credit_dirty_parties(integer) to service_role;

create or replace function public.enqueue_due_credit_profiles()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  insert into public.credit_dirty_parties(company_id,side,party_id,reason)
  select p.company_id,p.side,p.party_id,'aging_threshold' from public.party_credit_profile p
  join public.companies c on c.id=p.company_id
  where p.next_refresh_on<=(now() at time zone c.business_timezone)::date
  on conflict(company_id,side,party_id) do update set available_at=least(public.credit_dirty_parties.available_at,now()),
    reason='aging_threshold',last_error=null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke execute on function public.enqueue_due_credit_profiles() from public,anon,authenticated;
grant execute on function public.enqueue_due_credit_profiles() to service_role;

create or replace function public.list_party_credit_profiles(
  p_side text default 'customer',p_band text default null,p_confidence text default null,
  p_overdue_only boolean default false,p_recommendation text default null,
  p_search text default null,p_limit integer default 50,p_cursor uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_result jsonb;v_cursor_party uuid;
  v_cursor_rank integer;v_cursor_overdue bigint;v_cursor_oldest integer;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then raise exception 'permission_denied: ViewFinancials required'; end if;
  if p_cursor is not null then
    select case p.band when 'high_risk' then 1 when 'restricted' then 2 when 'watch' then 3
      when 'good' then 4 when 'strong' then 5 else 6 end band_rank,
      p.overdue_amount,p.oldest_overdue_days,p.party_id
    into v_cursor_rank,v_cursor_overdue,v_cursor_oldest,v_cursor_party
    from public.party_credit_profile p
    where p.company_id=v_company and p.side=p_side and p.party_id=p_cursor;
  end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by x.band_rank,x.overdue_amount desc,
    x.oldest_overdue_days desc,x.party_id),'[]'::jsonb),'nextCursor',
    max(x.party_id::text) filter(where x.row_number=least(greatest(p_limit,1),100)))
  into v_result from (
    select p.*,case p.band when 'high_risk' then 1 when 'restricted' then 2 when 'watch' then 3
      when 'good' then 4 when 'strong' then 5 else 6 end band_rank,
      row_number() over(order by case p.band when 'high_risk' then 1 when 'restricted' then 2 when 'watch' then 3
        when 'good' then 4 when 'strong' then 5 else 6 end,p.overdue_amount desc,p.oldest_overdue_days desc,p.party_id) row_number
    from public.party_credit_profile p where p.company_id=v_company and p.side=p_side
      and (p_band is null or p.band=p_band) and (p_confidence is null or p.confidence=p_confidence)
      and (not p_overdue_only or p.overdue_amount>0)
      and (p_recommendation is null or p.recommendation_code=p_recommendation)
      and (p_search is null or p.party_name ilike '%'||p_search||'%')
      and (p_cursor is null or v_cursor_party is null
        or (case p.band when 'high_risk' then 1 when 'restricted' then 2 when 'watch' then 3
          when 'good' then 4 when 'strong' then 5 else 6 end)>v_cursor_rank
        or ((case p.band when 'high_risk' then 1 when 'restricted' then 2 when 'watch' then 3
          when 'good' then 4 when 'strong' then 5 else 6 end)=v_cursor_rank
          and (p.overdue_amount<v_cursor_overdue
            or (p.overdue_amount=v_cursor_overdue and
              (p.oldest_overdue_days<v_cursor_oldest
                or (p.oldest_overdue_days=v_cursor_oldest and p.party_id>v_cursor_party))))))
    order by band_rank,p.overdue_amount desc,p.oldest_overdue_days desc,p.party_id
    limit least(greatest(p_limit,1),100)
  ) x;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'nextCursor',null));
end;
$$;
revoke execute on function public.list_party_credit_profiles(text,text,text,boolean,text,text,integer,uuid)
  from public,anon;
grant execute on function public.list_party_credit_profiles(text,text,text,boolean,text,text,integer,uuid)
  to authenticated;

create or replace function public.party_credit_profile(
  p_party_id uuid,p_side text default 'customer',p_document_limit integer default 25,p_before date default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then raise exception 'permission_denied: ViewFinancials required'; end if;
  select to_jsonb(p)||jsonb_build_object(
    'opportunity_cost',coalesce((select round(sum(d.settled_principal_days+
      d.outstanding_amount*greatest((now() at time zone c.business_timezone)::date-d.due_on,0)) *
      max(c.credit_opportunity_rate_bps)/10000.0/365.0)::bigint
      from public.credit_document_performance d join public.companies c on c.id=d.company_id
      where d.company_id=v_company and d.side=p_side and d.party_id=p_party_id),0),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from (
      select score,band,confidence,reason_codes,created_at from public.credit_profile_events
      where company_id=v_company and side=p_side and party_id=p_party_id
      order by created_at desc limit 24) e),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.due_on desc,d.document_id) from (
      select * from public.credit_document_performance where company_id=v_company and side=p_side
        and party_id=p_party_id and (p_before is null or due_on<p_before)
      order by due_on desc,document_id limit least(greatest(p_document_limit,1),100)) d),'[]'::jsonb)
  ) into v_result from public.party_credit_profile p
  where p.company_id=v_company and p.side=p_side and p.party_id=p_party_id;
  return v_result;
end;
$$;
revoke execute on function public.party_credit_profile(uuid,text,integer,date) from public,anon;
grant execute on function public.party_credit_profile(uuid,text,integer,date) to authenticated;

-- Compact, bounded projection for the offline party cache and cashier search.
-- It deliberately excludes monetary fields: those remain governed by the
-- existing balance projections and the live decision-summary RPC.
create or replace function public.credit_cache_summaries(
  p_party_ids uuid[] default null,p_after uuid default null,p_limit integer default 500
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_result jsonb;v_limit integer;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder')
    and not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  v_limit:=least(greatest(coalesce(p_limit,500),1),500);
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'party_id',x.party_id,'score',x.score,'band',x.band,'confidence',x.confidence,
      'reason_codes',x.reason_codes[1:2],'recommendation_code',x.recommendation_code,
      'refreshed_at',x.refreshed_at) order by x.party_id),'[]'::jsonb),
    'nextCursor',case when count(*)=v_limit
      then (array_agg(x.party_id order by x.party_id desc))[1] else null end)
  into v_result from (
    select p.party_id,p.score,p.band,p.confidence,p.reason_codes,p.recommendation_code,p.refreshed_at
    from public.party_credit_profile p
    where p.company_id=v_company and p.side='customer'
      and (p_party_ids is null or p.party_id=any(p_party_ids))
      and (p_after is null or p.party_id>p_after)
    order by p.party_id limit v_limit
  ) x;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'nextCursor',null));
end;
$$;
revoke execute on function public.credit_cache_summaries(uuid[],uuid,integer) from public,anon;
grant execute on function public.credit_cache_summaries(uuid[],uuid,integer) to authenticated;

create or replace function public.credit_decision_summary(p_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder')
    and not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select jsonb_build_object('customerId',p.party_id,'score',p.score,'band',p.band,
    'confidence',p.confidence,'reasonCodes',p.reason_codes[1:2],
    'recommendationCode',p.recommendation_code,'scoreTimestamp',p.refreshed_at,
    'balance',p.balance,'creditLimit',p.credit_limit,'availableCredit',p.available_credit,
    'overdueAmount',p.overdue_amount,'oldestOverdueDays',p.oldest_overdue_days)
  into v_result from public.party_credit_profile p
  where p.company_id=v_company and p.side='customer' and p.party_id=p_customer_id;
  return coalesce(v_result,jsonb_build_object('customerId',p_customer_id,'band','unrated',
    'confidence','unrated','reasonCodes',jsonb_build_array('profile_updating'),
    'recommendationCode','establish_limit','scoreTimestamp',null));
end;
$$;
revoke execute on function public.credit_decision_summary(uuid) from public,anon;
grant execute on function public.credit_decision_summary(uuid) to authenticated;

create or replace function public.update_credit_insight_settings(
  p_opportunity_rate_bps integer,p_notifications_enabled boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required'; end if;
  if p_opportunity_rate_bps is null or p_opportunity_rate_bps<0 or p_opportunity_rate_bps>10000 then
    raise exception 'invalid_opportunity_rate'; end if;
  update public.companies set credit_opportunity_rate_bps=p_opportunity_rate_bps,
    credit_score_notifications_enabled=coalesce(p_notifications_enabled,false),updated_at=now()
  where id=v_company;
end;
$$;
revoke execute on function public.update_credit_insight_settings(integer,boolean) from public,anon;
grant execute on function public.update_credit_insight_settings(integer,boolean) to authenticated;

create or replace function public.update_customer_credit_score_notifications(
  p_customer_id uuid,p_enabled boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required'; end if;
  update public.customers set credit_score_notifications_enabled=coalesce(p_enabled,false),
    updated_at=now()
  where id=p_customer_id and company_id=v_company and not is_supplier and deleted_at is null;
  if not found then raise exception 'customer_not_found'; end if;
end;
$$;
revoke execute on function public.update_customer_credit_score_notifications(uuid,boolean)
  from public,anon;
grant execute on function public.update_customer_credit_score_notifications(uuid,boolean)
  to authenticated;

insert into public.message_templates(template_key,name,context,sms_body,whatsapp_body,is_system)
select 'credit-score-band-change','Credit profile band changed','customer',
  'Your credit profile is now {{score}}/10 ({{band}}). {{reason}} {{consequence}} Statement: {{statement_url}}',
  'Credit profile update\n\nYour score is now {{score}}/10 ({{band}}).\n\n{{reason}}\n{{consequence}}\n\nStatement: {{statement_url}}',true
where not exists(select 1 from public.message_templates where company_id is null
  and template_key='credit-score-band-change');

create or replace function public.dispatch_credit_band_notifications(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record;v_origin text;v_token text;v_url text;v_body text;v_outbox uuid;v_count integer:=0;
begin
  select nullif(rtrim(decrypted_secret,'/'),'') into v_origin
  from vault.decrypted_secrets where name='STOREFRONT_PUBLIC_URL' limit 1;
  if v_origin is null then return 0; end if;
  for v_row in
    select q.*,cu.first_name,cu.phone,cu.notifications_enabled,cu.sms_notifications_enabled,
      cu.whatsapp_notifications_enabled,cu.credit_score_notifications_enabled,
      c.credit_score_notifications_enabled company_enabled,c.payment_reminder_channel channel,
      mt.sms_body,mt.whatsapp_body,mt.version
    from public.credit_band_notification_queue q
    join public.customers cu on cu.id=q.customer_id and cu.company_id=q.company_id
    join public.companies c on c.id=q.company_id
    join public.subscription_tiers t on t.id=c.subscription_tier_id
    left join public.message_templates mt on mt.template_key='credit-score-band-change' and mt.company_id is null
    where q.sent_at is null and q.send_after<=now() and c.credit_score_notifications_enabled
      and cu.credit_score_notifications_enabled and cu.notifications_enabled and cu.phone is not null
      and public.company_subscription_accessible(c.id)
      and case when c.payment_reminder_channel='sms' then cu.sms_notifications_enabled
        else cu.whatsapp_notifications_enabled end
    order by q.send_after limit least(greatest(p_limit,1),500) for update of q skip locked
  loop
    begin
      v_token:=public.issue_customer_statement_link(v_row.company_id,v_row.customer_id);
      v_url:=v_origin||'/statement/'||v_token;
      v_body:=public.render_message_template(
        case when v_row.channel='sms' then v_row.sms_body else v_row.whatsapp_body end,
        jsonb_build_object('customer_first_name',v_row.first_name,'score',coalesce(v_row.score::text,'unrated'),
          'band',replace(v_row.to_band,'_',' '),'reason',replace(coalesce(v_row.reason_code,'account_activity'),'_',' '),
          'consequence',case v_row.to_band when 'watch' then 'Future limit increases may be paused.'
            when 'restricted' then 'A manager review is recommended.'
            when 'high_risk' then 'New credit may be paused.' else 'Maintain timely payments.' end,
          'statement_url',v_url));
      v_outbox:=public.queue_message(v_row.company_id,v_row.channel,v_row.phone,v_body);
      update public.outbox set source='reminder',customer_id=v_row.customer_id,
        template_key='credit-score-band-change',template_version=v_row.version where id=v_outbox;
      update public.credit_band_notification_queue set sent_at=now(),last_error=null
      where company_id=v_row.company_id and customer_id=v_row.customer_id;
      v_count:=v_count+1;
    exception when others then
      update public.credit_band_notification_queue set last_error=sqlerrm,send_after=now()+interval '1 hour'
      where company_id=v_row.company_id and customer_id=v_row.customer_id;
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.dispatch_credit_band_notifications(integer)
  from public,anon,authenticated;
grant execute on function public.dispatch_credit_band_notifications(integer) to service_role;

-- Seed the queue without sending baseline customer notifications.
insert into public.credit_dirty_parties(company_id,side,party_id,reason)
select c.company_id,case when c.is_supplier then 'supplier' else 'customer' end,c.id,'baseline'
from public.customers c where c.deleted_at is null
on conflict do nothing;

select cron.schedule('credit-intelligence-worker','* * * * *',
  $$select public.process_credit_dirty_parties(200)$$);
select cron.schedule('credit-aging-thresholds','*/5 * * * *',
  $$select public.enqueue_due_credit_profiles()$$);
select cron.schedule('credit-band-notifications','*/5 * * * *',
  $$select public.dispatch_credit_band_notifications(100)$$);

comment on table public.party_credit_profile is
  'Cached credit-v1 portfolio read model; never calculate company-wide scores in an interactive request.';
comment on column public.party_credit_profile.opportunity_cost is
  'Internal illustrative amount only. Never posted to balances, communications or the ledger.';
