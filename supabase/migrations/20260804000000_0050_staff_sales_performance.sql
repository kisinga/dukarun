-- 0050_staff_sales_performance.sql
-- Durable staff identity, explicit sale-completion attribution, refund safety,
-- and server-side staff performance read models.

-- ---------------------------------------------------------------------------
-- Permissions. Staff sales figures are intentionally separate from the full
-- ledger permission; Admin and Manager receive the new permission by default.
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = permissions
    || array['ViewStaffPerformance', 'ManageCommissions']::text[],
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not (permissions @> array['ViewStaffPerformance', 'ManageCommissions']::text[]);

-- New companies must receive the same defaults. The stored provisioning
-- function uses a literal permission array, so patch that definition in place.
do $$
declare
  v_definition text;
  v_old text := '''ViewAuditTrail''';
  v_new text := '''ViewAuditTrail'', ''ViewStaffPerformance'', ''ManageCommissions''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text)'::regprocedure)
    into v_definition;

  if position('''ViewStaffPerformance''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add staff performance permissions to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durable staff directory. Memberships can be deleted; this identity record
-- remains so old sales and commission statements keep a useful label.
-- user_id deliberately has no auth.users FK for the same retention reason.
-- ---------------------------------------------------------------------------
create table public.company_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  last_role_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index company_staff_profiles_company_name_idx
  on public.company_staff_profiles (company_id, display_name);

alter table public.company_staff_profiles enable row level security;

create policy "staff profiles readable by permitted members"
  on public.company_staff_profiles for select
  using (
    company_id = (select public.current_company_id())
    and (
      user_id = auth.uid()
      or (select public.current_user_has_permission('ManageTeam'))
      or (select public.current_user_has_permission('ViewStaffPerformance'))
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

grant select on public.company_staff_profiles to authenticated;
grant all on public.company_staff_profiles to service_role;

create or replace function public.staff_fallback_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(concat_ws(' ',
      nullif(u.raw_user_meta_data ->> 'first_name', ''),
      nullif(u.raw_user_meta_data ->> 'last_name', '')
    )), ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    case
      when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
        then 'Staff ••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
      else null
    end,
    'Staff …' || right(p_user_id::text, 6)
  )
  from auth.users u
  where u.id = p_user_id
  union all
  select 'Staff …' || right(p_user_id::text, 6)
  where not exists (select 1 from auth.users u where u.id = p_user_id)
  limit 1
$$;

revoke execute on function public.staff_fallback_name(uuid) from authenticated, anon, public;
grant execute on function public.staff_fallback_name(uuid) to service_role;

insert into public.company_staff_profiles (company_id, user_id, display_name, last_role_name)
select
  m.company_id,
  m.user_id,
  public.staff_fallback_name(m.user_id),
  r.name
from public.company_memberships m
left join public.roles r on r.id = m.role_id
on conflict (company_id, user_id) do update
set last_role_name = excluded.last_role_name,
    updated_at = now();

create or replace function public.sync_staff_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_name text;
begin
  select r.name into v_role_name from public.roles r where r.id = new.role_id;

  insert into public.company_staff_profiles (
    company_id, user_id, display_name, last_role_name
  ) values (
    new.company_id,
    new.user_id,
    public.staff_fallback_name(new.user_id),
    v_role_name
  )
  on conflict (company_id, user_id) do update
  set last_role_name = excluded.last_role_name,
      updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_staff_profile_from_membership()
  from authenticated, anon, public;

create trigger company_memberships_staff_profile
  after insert or update of role_id on public.company_memberships
  for each row execute function public.sync_staff_profile_from_membership();

create trigger company_staff_profiles_audit
  after insert or update or delete on public.company_staff_profiles
  for each row execute function public.audit_trigger();

create or replace function public.update_staff_display_name(
  p_membership_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_profile_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 120 then
    raise exception 'invalid_display_name';
  end if;

  select m.user_id into v_user_id
  from public.company_memberships m
  where m.id = p_membership_id and m.company_id = v_company_id;
  if v_user_id is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  insert into public.company_staff_profiles (company_id, user_id, display_name)
  values (v_company_id, v_user_id, trim(p_display_name))
  on conflict (company_id, user_id) do update
  set display_name = excluded.display_name,
      updated_at = now()
  returning id into v_profile_id;

  return v_profile_id;
end;
$$;

revoke execute on function public.update_staff_display_name(uuid, text) from anon, public;
grant execute on function public.update_staff_display_name(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Completion attribution. created_by remains the seller/originator;
-- completed_by captures the actor who finalized or settled the sale.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

with posted_sales as (
  select
    l.order_id,
    min(e.posted_at) as completed_at
  from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where l.order_id is not null
    and e.source_type in ('Payment', 'CreditSale')
  group by l.order_id
)
update public.orders o
set completed_at = coalesce(s.completed_at, o.created_at),
    completed_by = o.created_by
from posted_sales s
where s.order_id = o.id
  and o.status in ('completed', 'voided');

update public.orders
set completed_at = created_at,
    completed_by = created_by
where status in ('completed', 'voided')
  and completed_at is null;

create index orders_company_completed_idx
  on public.orders (company_id, completed_at desc)
  where completed_at is not null;

create index orders_company_seller_completed_idx
  on public.orders (company_id, created_by, completed_at desc)
  where completed_at is not null;

create or replace function public.capture_order_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

create trigger orders_capture_completion
  before update on public.orders
  for each row execute function public.capture_order_completion();

-- ---------------------------------------------------------------------------
-- Refund hardening: completed sale only, and never more than cash collected
-- and not previously refunded. The order row lock serializes concurrent calls.
-- ---------------------------------------------------------------------------
create or replace function public.post_refund(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_account_code text;
  v_refund_id uuid;
  v_collected bigint;
  v_refunded bigint;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed sales can be refunded';
  end if;

  select coalesce(sum(p.amount), 0)::bigint into v_collected
  from public.payments p
  where p.company_id = v_company_id
    and p.order_id = p_order_id
    and p.status = 'settled';

  select coalesce(sum(r.amount), 0)::bigint into v_refunded
  from public.refunds r
  where r.company_id = v_company_id and r.order_id = p_order_id;

  if p_amount > v_collected - v_refunded then
    raise exception 'refund_exceeds_collected: refundable amount is %',
      greatest(v_collected - v_refunded, 0);
  end if;

  select pm.ledger_account_code into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code and pm.enabled;
  if v_account_code is null then raise exception 'payment_method_not_found: %', p_method_code; end if;

  insert into public.refunds (company_id, order_id, amount, method_code, reason, created_by)
  values (v_company_id, p_order_id, p_amount, p_method_code, p_reason, auth.uid())
  returning id into v_refund_id;

  return public.post_journal_entry(
    v_company_id, 'Refund', v_refund_id::text,
    'Refund for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'SALES_RETURNS', 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      ),
      jsonb_build_object(
        'account_code', v_account_code, 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code
        )
      )
    )
  );
end;
$$;

revoke execute on function public.post_refund(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_refund(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Immutable collection events used by both performance and commission reads.
-- Positive payments retain their original event even if later cancelled;
-- reversals, refunds and voids become dated negative events.
-- ---------------------------------------------------------------------------
create or replace function public.sales_collection_events(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  event_key text,
  event_type text,
  occurred_on date,
  staff_user_id uuid,
  order_id uuid,
  basis_amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'payment:' || p.id::text,
    'payment'::text,
    (p.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    p.amount::bigint
  from public.payments p
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where p.company_id = p_company_id
    and (p.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'payment_reversal:' || p.id::text,
    'payment_reversal'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -p.amount::bigint
  from public.ledger_journal_entries e
  join public.payments p on e.source_id = p.id::text || '-reversal'
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where e.company_id = p_company_id
    and e.source_type = 'PaymentReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'refund:' || r.id::text,
    'refund'::text,
    (r.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -r.amount::bigint
  from public.refunds r
  join public.orders o on o.id = r.order_id and o.company_id = r.company_id
  where r.company_id = p_company_id
    and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'void:' || o.id::text,
    'void'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -greatest(
      coalesce((
        select sum(p.amount)
        from public.payments p
        where p.order_id = o.id
          and not exists (
            select 1 from public.ledger_journal_entries pr
            where pr.company_id = o.company_id
              and pr.source_type = 'PaymentReversal'
              and pr.source_id = p.id::text || '-reversal'
          )
      ), 0)
      - coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
      0
    )::bigint
  from public.ledger_journal_entries e
  join public.orders o
    on e.company_id = o.company_id
   and e.source_id = o.id::text || '-reversal'
  where e.company_id = p_company_id
    and e.source_type = 'OrderReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
$$;

revoke execute on function public.sales_collection_events(uuid, date, date)
  from authenticated, anon, public;
grant execute on function public.sales_collection_events(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- Staff leaderboard. All aggregation happens in PostgreSQL so report totals
-- are not truncated by PostgREST row limits.
-- ---------------------------------------------------------------------------
create or replace function public.staff_sales_performance(
  p_from date,
  p_to date
)
returns table (
  staff_user_id uuid,
  display_name text,
  role_name text,
  authorization_status text,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  cogs bigint,
  margin bigint,
  collected bigint,
  credit_sales bigint,
  voids integer,
  average_sale bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with completed as (
    select
      o.created_by as user_id,
      count(*)::int as transactions,
      coalesce(sum(o.total), 0)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs,
      coalesce(sum(o.total) filter (where o.is_credit_sale), 0)::bigint as credit_sales
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      where l.order_id = o.id
        and exists (
          select 1 from public.ledger_journal_entries e
          where e.id = l.entry_id and e.source_type = 'InventorySaleCogs'
        )
    ) cost on true
    where o.company_id = v_company_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), refunded as (
    select o.created_by as user_id, coalesce(sum(r.amount), 0)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id and o.company_id = r.company_id
    where r.company_id = v_company_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), voided as (
    select
      o.created_by as user_id,
      count(*)::int as voids,
      coalesce(sum(o.total), 0)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity,
      coalesce(sum(cost.cogs), 0)::bigint as cogs
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    left join lateral (
      select sum(l.debit) filter (where a.code = 'COGS') as cogs
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
      join public.ledger_journal_entries ce on ce.id = l.entry_id
      where l.order_id = o.id and ce.source_type = 'InventorySaleCogs'
    ) cost on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by o.created_by
  ), collection as (
    select c.staff_user_id as user_id, coalesce(sum(c.basis_amount), 0)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    group by c.staff_user_id
  ), people as (
    select p.user_id from public.company_staff_profiles p where p.company_id = v_company_id
    union select c.user_id from completed c
    union select r.user_id from refunded r
    union select v.user_id from voided v
    union select c.user_id from collection c
  )
  select
    people.user_id,
    coalesce(p.display_name, 'Unassigned'),
    coalesce(r.name, p.last_role_name),
    coalesce(m.authorization_status, 'removed'),
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(f.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))::bigint,
    (
      coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0)
      - (coalesce(c.cogs, 0) - coalesce(v.cogs, 0))
    )::bigint,
    coalesce(col.collected, 0),
    coalesce(c.credit_sales, 0),
    coalesce(v.voids, 0),
    case when coalesce(c.transactions, 0) - coalesce(v.voids, 0) <= 0 then 0
      else round(
        (coalesce(c.gross_sales, 0) - coalesce(f.refunds, 0) - coalesce(v.voided_sales, 0))::numeric
        / (c.transactions - coalesce(v.voids, 0))
      )::bigint
    end
  from people
  left join public.company_staff_profiles p
    on p.company_id = v_company_id and p.user_id is not distinct from people.user_id
  left join public.company_memberships m
    on m.company_id = v_company_id and m.user_id is not distinct from people.user_id
  left join public.roles r on r.id = m.role_id
  left join completed c on c.user_id is not distinct from people.user_id
  left join refunded f on f.user_id is not distinct from people.user_id
  left join voided v on v.user_id is not distinct from people.user_id
  left join collection col on col.user_id is not distinct from people.user_id
  order by 9 desc, 2;
end;
$$;

revoke execute on function public.staff_sales_performance(date, date) from anon, public;
grant execute on function public.staff_sales_performance(date, date) to authenticated;

create or replace function public.staff_sales_daily(
  p_from date,
  p_to date,
  p_staff_user_id uuid
)
returns table (
  day date,
  transactions integer,
  gross_sales bigint,
  refunds bigint,
  voided_sales bigint,
  net_sales bigint,
  quantity numeric,
  collected bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewStaffPerformance') then
    raise exception 'permission_denied: ViewStaffPerformance required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'staffPerformance'), false) then
    raise exception 'feature_unavailable: staff performance; upgrade your plan';
  end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;

  return query
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ), completed as (
    select
      (o.completed_at at time zone 'Africa/Nairobi')::date as day,
      count(*)::int as transactions,
      sum(o.total)::bigint as gross_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.orders o
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where o.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and o.completed_at is not null
      and (o.completed_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (o.completed_at at time zone 'Africa/Nairobi')::date
  ), refunded as (
    select (r.created_at at time zone 'Africa/Nairobi')::date as day,
      sum(r.amount)::bigint as refunds
    from public.refunds r
    join public.orders o on o.id = r.order_id
    where r.company_id = v_company_id
      and o.created_by is not distinct from p_staff_user_id
      and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (r.created_at at time zone 'Africa/Nairobi')::date
  ), voided as (
    select (e.posted_at at time zone 'Africa/Nairobi')::date as day,
      sum(o.total)::bigint as voided_sales,
      coalesce(sum(q.quantity), 0) as quantity
    from public.ledger_journal_entries e
    join public.orders o
      on o.company_id = e.company_id and e.source_id = o.id::text || '-reversal'
    left join lateral (
      select sum(l.quantity) as quantity from public.order_lines l where l.order_id = o.id
    ) q on true
    where e.company_id = v_company_id
      and e.source_type = 'OrderReversal'
      and o.created_by is not distinct from p_staff_user_id
      and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
    group by (e.posted_at at time zone 'Africa/Nairobi')::date
  ), collection as (
    select c.occurred_on as day, sum(c.basis_amount)::bigint as collected
    from public.sales_collection_events(v_company_id, p_from, p_to) c
    where c.staff_user_id is not distinct from p_staff_user_id
    group by c.occurred_on
  )
  select
    d.day,
    coalesce(c.transactions, 0),
    coalesce(c.gross_sales, 0),
    coalesce(r.refunds, 0),
    coalesce(v.voided_sales, 0),
    (coalesce(c.gross_sales, 0) - coalesce(r.refunds, 0) - coalesce(v.voided_sales, 0))::bigint,
    (coalesce(c.quantity, 0) - coalesce(v.quantity, 0))::numeric,
    coalesce(col.collected, 0)
  from days d
  left join completed c on c.day = d.day
  left join refunded r on r.day = d.day
  left join voided v on v.day = d.day
  left join collection col on col.day = d.day
  order by d.day;
end;
$$;

revoke execute on function public.staff_sales_daily(date, date, uuid) from anon, public;
grant execute on function public.staff_sales_daily(date, date, uuid) to authenticated;
