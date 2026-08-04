-- 0051_commissions.sql
-- Effective-dated commission plans and immutable, reviewable period statements.
-- V1 tracks approval/payment state but deliberately does not post payroll ledger entries.

create table public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (company_id, name)
);

create table public.commission_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_id uuid not null references public.commission_plans (id),
  staff_user_id uuid not null,
  effective_from date not null,
  effective_to date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index commission_assignments_staff_dates_idx
  on public.commission_assignments (company_id, staff_user_id, effective_from, effective_to);

create table public.commission_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (company_id, start_date, end_date)
);

create table public.commission_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_id uuid not null references public.commission_periods (id) on delete cascade,
  plan_id uuid references public.commission_plans (id),
  staff_user_id uuid not null,
  staff_name text not null,
  event_key text not null,
  event_type text not null check (
    event_type in ('payment', 'payment_reversal', 'refund', 'void', 'adjustment')
  ),
  order_id uuid references public.orders (id),
  occurred_on date not null,
  basis_amount bigint not null,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  commission_amount bigint not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (period_id, staff_user_id, event_key)
);

create index commission_lines_staff_idx
  on public.commission_lines (company_id, staff_user_id, occurred_on desc);
create index commission_lines_period_idx
  on public.commission_lines (period_id, staff_user_id);

alter table public.commission_plans enable row level security;
alter table public.commission_assignments enable row level security;
alter table public.commission_periods enable row level security;
alter table public.commission_lines enable row level security;

create or replace function public.commissions_available(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.feature_enabled(p_company_id, 'commissions'), false)
    and coalesce((select c.commissions_enabled from public.companies c where c.id = p_company_id), false)
$$;

revoke execute on function public.commissions_available(uuid) from anon, public;
grant execute on function public.commissions_available(uuid) to authenticated, service_role;

create policy "commission plans readable by managers or assignees"
  on public.commission_plans for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_assignments a
        where a.plan_id = commission_plans.id and a.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission assignments readable by managers or assignee"
  on public.commission_assignments for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

create policy "commission periods readable by managers or included staff"
  on public.commission_periods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_lines l
        where l.period_id = commission_periods.id and l.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission lines readable by managers or recipient"
  on public.commission_lines for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

grant select on public.commission_plans to authenticated;
grant select on public.commission_assignments to authenticated;
grant select on public.commission_periods to authenticated;
grant select on public.commission_lines to authenticated;
grant all on public.commission_plans to service_role;
grant all on public.commission_assignments to service_role;
grant all on public.commission_periods to service_role;
grant all on public.commission_lines to service_role;

create trigger commission_plans_audit
  after insert or update or delete on public.commission_plans
  for each row execute function public.audit_trigger();
create trigger commission_assignments_audit
  after insert or update or delete on public.commission_assignments
  for each row execute function public.audit_trigger();
create trigger commission_periods_audit
  after insert or update or delete on public.commission_periods
  for each row execute function public.audit_trigger();
create trigger commission_lines_audit
  after insert or update or delete on public.commission_lines
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Plan management.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_commission_plan(
  p_name text,
  p_rate_bps integer,
  p_effective_from date,
  p_effective_to date default null,
  p_active boolean default true,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_plan_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'invalid_plan_name';
  end if;
  if p_rate_bps is null or p_rate_bps < 0 or p_rate_bps > 10000 then
    raise exception 'invalid_commission_rate';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;

  if p_plan_id is null then
    insert into public.commission_plans (
      company_id, name, rate_bps, effective_from, effective_to, active, created_by
    ) values (
      v_company_id, trim(p_name), p_rate_bps, p_effective_from, p_effective_to,
      coalesce(p_active, true), auth.uid()
    ) returning id into v_plan_id;
  else
    update public.commission_plans
    set name = trim(p_name),
        rate_bps = p_rate_bps,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_plan_id and company_id = v_company_id
    returning id into v_plan_id;
    if v_plan_id is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  end if;

  return v_plan_id;
end;
$$;

revoke execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  from anon, public;
grant execute on function public.upsert_commission_plan(text, integer, date, date, boolean, uuid)
  to authenticated;

create or replace function public.assign_commission_plan(
  p_plan_id uuid,
  p_staff_user_id uuid,
  p_effective_from date,
  p_effective_to date default null,
  p_assignment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_assignment_id uuid;
  v_plan record;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'invalid_date_range';
  end if;
  if not exists (
    select 1 from public.company_staff_profiles p
    where p.company_id = v_company_id and p.user_id = p_staff_user_id
  ) then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  select * into v_plan from public.commission_plans
  where id = p_plan_id and company_id = v_company_id;
  if v_plan is null then raise exception 'commission_plan_not_found: %', p_plan_id; end if;
  if not v_plan.active then raise exception 'commission_plan_inactive'; end if;

  if exists (
    select 1 from public.commission_assignments a
    where a.company_id = v_company_id
      and a.staff_user_id = p_staff_user_id
      and (p_assignment_id is null or a.id <> p_assignment_id)
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then raise exception 'commission_assignment_overlap'; end if;

  if p_assignment_id is null then
    insert into public.commission_assignments (
      company_id, plan_id, staff_user_id, effective_from, effective_to, created_by
    ) values (
      v_company_id, p_plan_id, p_staff_user_id, p_effective_from, p_effective_to, auth.uid()
    ) returning id into v_assignment_id;
  else
    update public.commission_assignments
    set plan_id = p_plan_id,
        staff_user_id = p_staff_user_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        updated_at = now()
    where id = p_assignment_id and company_id = v_company_id
    returning id into v_assignment_id;
    if v_assignment_id is null then
      raise exception 'commission_assignment_not_found: %', p_assignment_id;
    end if;
  end if;

  return v_assignment_id;
end;
$$;

revoke execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  from anon, public;
grant execute on function public.assign_commission_plan(uuid, uuid, date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Generate/re-generate a draft statement from immutable collection events.
-- Approved/paid periods are locked and never recalculated.
-- ---------------------------------------------------------------------------
create or replace function public.generate_commission_period(
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_period_id uuid;
  v_status text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_date_range';
  end if;

  select id, status into v_period_id, v_status
  from public.commission_periods
  where company_id = v_company_id and start_date = p_start_date and end_date = p_end_date
  for update;

  if v_period_id is null then
    if exists (
      select 1 from public.commission_periods p
      where p.company_id = v_company_id
        and daterange(p.start_date, p.end_date, '[]')
            && daterange(p_start_date, p_end_date, '[]')
    ) then raise exception 'commission_period_overlap'; end if;

    insert into public.commission_periods (
      company_id, start_date, end_date, status, created_by
    ) values (
      v_company_id, p_start_date, p_end_date, 'draft', auth.uid()
    ) returning id into v_period_id;
  elsif v_status <> 'draft' then
    raise exception 'commission_period_locked: %', v_status;
  end if;

  -- Manual adjustments survive regeneration; only generated event lines are rebuilt.
  delete from public.commission_lines
  where period_id = v_period_id and event_type <> 'adjustment';

  insert into public.commission_lines (
    company_id, period_id, plan_id, staff_user_id, staff_name,
    event_key, event_type, order_id, occurred_on, basis_amount,
    rate_bps, commission_amount, created_by
  )
  select
    v_company_id,
    v_period_id,
    p.id,
    e.staff_user_id,
    coalesce(sp.display_name, 'Staff …' || right(e.staff_user_id::text, 6)),
    e.event_key,
    e.event_type,
    e.order_id,
    e.occurred_on,
    e.basis_amount,
    p.rate_bps,
    round(e.basis_amount::numeric * p.rate_bps / 10000)::bigint,
    auth.uid()
  from public.sales_collection_events(v_company_id, p_start_date, p_end_date) e
  join public.commission_assignments a
    on a.company_id = v_company_id
   and a.staff_user_id = e.staff_user_id
   and e.occurred_on between a.effective_from and coalesce(a.effective_to, 'infinity'::date)
  join public.commission_plans p
    on p.id = a.plan_id and p.company_id = v_company_id
   and e.occurred_on between p.effective_from and coalesce(p.effective_to, 'infinity'::date)
  left join public.company_staff_profiles sp
    on sp.company_id = v_company_id and sp.user_id = e.staff_user_id
  where e.staff_user_id is not null
    and e.basis_amount <> 0;

  update public.commission_periods set updated_at = now() where id = v_period_id;
  return v_period_id;
end;
$$;

revoke execute on function public.generate_commission_period(date, date) from anon, public;
grant execute on function public.generate_commission_period(date, date) to authenticated;

create or replace function public.add_commission_adjustment(
  p_period_id uuid,
  p_staff_user_id uuid,
  p_commission_amount bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_line_id uuid;
  v_name text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_commission_amount is null or p_commission_amount = 0 then raise exception 'invalid_amount'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'adjustment_reason_required'; end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id and p.status = 'draft'
  ) then raise exception 'commission_period_not_editable'; end if;

  select display_name into v_name from public.company_staff_profiles
  where company_id = v_company_id and user_id = p_staff_user_id;
  if v_name is null then raise exception 'staff_profile_not_found: %', p_staff_user_id; end if;

  insert into public.commission_lines (
    company_id, period_id, staff_user_id, staff_name, event_key, event_type,
    occurred_on, basis_amount, rate_bps, commission_amount, reason, created_by
  ) values (
    v_company_id, p_period_id, p_staff_user_id, v_name,
    'adjustment:' || gen_random_uuid()::text, 'adjustment',
    (now() at time zone 'Africa/Nairobi')::date, 0, 0,
    p_commission_amount, trim(p_reason), auth.uid()
  ) returning id into v_line_id;

  return v_line_id;
end;
$$;

revoke execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  from anon, public;
grant execute on function public.add_commission_adjustment(uuid, uuid, bigint, text)
  to authenticated;

create or replace function public.update_commission_period_status(
  p_period_id uuid,
  p_status text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_current text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if p_status not in ('approved', 'paid') then raise exception 'invalid_commission_status'; end if;

  select status into v_current from public.commission_periods
  where id = p_period_id and company_id = v_company_id for update;
  if v_current is null then raise exception 'commission_period_not_found: %', p_period_id; end if;
  if (v_current = 'draft' and p_status <> 'approved')
     or (v_current = 'approved' and p_status <> 'paid')
     or v_current = 'paid' then
    raise exception 'invalid_commission_transition: % to %', v_current, p_status;
  end if;

  update public.commission_periods
  set status = p_status,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      paid_by = case when p_status = 'paid' then auth.uid() else paid_by end,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_period_id;

  return p_period_id;
end;
$$;

revoke execute on function public.update_commission_period_status(uuid, text, text)
  from anon, public;
grant execute on function public.update_commission_period_status(uuid, text, text)
  to authenticated;

-- Compact read models for the Angular page.
create or replace function public.list_commission_periods()
returns table (
  id uuid,
  start_date date,
  end_date date,
  status text,
  staff_count integer,
  basis_total bigint,
  commission_total bigint,
  approved_at timestamptz,
  paid_at timestamptz
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
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;

  return query
  select
    p.id, p.start_date, p.end_date, p.status,
    count(distinct l.staff_user_id)::int,
    coalesce(sum(l.basis_amount), 0)::bigint,
    coalesce(sum(l.commission_amount), 0)::bigint,
    p.approved_at, p.paid_at
  from public.commission_periods p
  left join public.commission_lines l on l.period_id = p.id
  where p.company_id = v_company_id
  group by p.id
  order by p.start_date desc;
end;
$$;

revoke execute on function public.list_commission_periods() from anon, public;
grant execute on function public.list_commission_periods() to authenticated;

create or replace function public.commission_period_statement(p_period_id uuid)
returns table (
  staff_user_id uuid,
  staff_name text,
  basis_total bigint,
  commission_total bigint,
  event_count integer
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
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if not public.commissions_available(v_company_id) then
    raise exception 'feature_unavailable: enable commissions on an eligible plan';
  end if;
  if not exists (
    select 1 from public.commission_periods p
    where p.id = p_period_id and p.company_id = v_company_id
  ) then raise exception 'commission_period_not_found: %', p_period_id; end if;

  return query
  select
    l.staff_user_id,
    max(l.staff_name),
    sum(l.basis_amount)::bigint,
    sum(l.commission_amount)::bigint,
    count(*)::int
  from public.commission_lines l
  where l.period_id = p_period_id and l.company_id = v_company_id
  group by l.staff_user_id
  order by 4 desc, 2;
end;
$$;

revoke execute on function public.commission_period_statement(uuid) from anon, public;
grant execute on function public.commission_period_statement(uuid) to authenticated;
