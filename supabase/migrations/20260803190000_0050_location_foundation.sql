-- Business-location foundation. Single-location companies remain automatic;
-- multi-location companies get explicit staff scope and operational ownership.

-- Use insertion time for records that can be created repeatedly inside one
-- transaction. This keeps "latest" ordering deterministic.
alter table public.reconciliations
  alter column created_at set default clock_timestamp();

alter table public.inventory_batches
  alter column created_at set default clock_timestamp();

alter table public.companies
  add column if not exists commissions_enabled boolean not null default false;

grant update (commissions_enabled) on public.companies to authenticated;

comment on table public.stock_locations is
  'Business locations. A location may be a selling site, kiosk, warehouse, or office.';

alter table public.stock_locations
  add column if not exists is_active boolean not null default true;

-- Staff may work in one or many locations. Existing memberships keep their
-- current company-wide behaviour through an explicit assignment backfill.
create table public.company_membership_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (membership_id, location_id)
);

create index company_membership_locations_location_idx
  on public.company_membership_locations(company_id, location_id, membership_id);
create unique index company_membership_locations_one_primary_idx
  on public.company_membership_locations(membership_id) where is_primary;

alter table public.company_membership_locations enable row level security;
create policy "location assignments readable by company members"
  on public.company_membership_locations for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );
grant select on public.company_membership_locations to authenticated;
grant all on public.company_membership_locations to service_role;

insert into public.company_membership_locations (
  company_id, membership_id, location_id, is_primary
)
select
  m.company_id,
  m.id,
  l.id,
  l.is_default
from public.company_memberships m
join public.stock_locations l on l.company_id = m.company_id
where m.authorization_status = 'approved'
on conflict (membership_id, location_id) do nothing;

create or replace function public.current_user_can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.company_memberships m
      join public.company_membership_locations ml on ml.membership_id = m.id
      join public.stock_locations l on l.id = ml.location_id
      where m.company_id = public.current_company_id()
        and m.user_id = auth.uid()
        and m.authorization_status = 'approved'
        and ml.location_id = p_location_id
        and ml.company_id = m.company_id
        and l.company_id = m.company_id
        and l.is_active
    )
$$;

revoke execute on function public.current_user_can_access_location(uuid) from anon, public;
grant execute on function public.current_user_can_access_location(uuid) to authenticated, service_role;

create or replace function public.resolve_business_location(p_location_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  if p_location_id is not null then
    select l.id into v_location_id
    from public.stock_locations l
    where l.id = p_location_id and l.company_id = v_company_id and l.is_active;
    if v_location_id is null or not public.current_user_can_access_location(v_location_id) then
      raise exception 'location_access_denied';
    end if;
    return v_location_id;
  end if;

  -- Compatibility path for single-location clients and old queued sales.
  -- New multi-location UI always sends an explicit location.
  select l.id into v_location_id
  from public.stock_locations l
  join public.company_memberships m
    on m.company_id = l.company_id and m.user_id = auth.uid()
  join public.company_membership_locations ml
    on ml.membership_id = m.id and ml.location_id = l.id
  where l.company_id = v_company_id and l.is_active
    and m.authorization_status = 'approved'
  order by ml.is_primary desc, l.is_default desc, l.created_at
  limit 1;

  if v_location_id is null then raise exception 'business_location_required'; end if;
  return v_location_id;
end;
$$;

revoke execute on function public.resolve_business_location(uuid) from anon, public;
grant execute on function public.resolve_business_location(uuid) to authenticated, service_role;

create or replace function public.accessible_business_locations()
returns table (
  id uuid,
  code text,
  name text,
  is_default boolean,
  is_primary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.code, l.name, l.is_default, ml.is_primary
  from public.company_memberships m
  join public.company_membership_locations ml on ml.membership_id = m.id
  join public.stock_locations l on l.id = ml.location_id and l.company_id = m.company_id
  where m.company_id = public.current_company_id()
    and m.user_id = auth.uid()
    and m.authorization_status = 'approved'
    and l.is_active
  order by ml.is_primary desc, l.is_default desc, l.name
$$;

revoke execute on function public.accessible_business_locations() from anon, public;
grant execute on function public.accessible_business_locations() to authenticated, service_role;

create or replace function public.set_membership_locations(
  p_membership_id uuid,
  p_location_ids uuid[],
  p_primary_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.id = p_membership_id and m.company_id = v_company_id
  ) then raise exception 'membership_not_found'; end if;
  if coalesce(cardinality(p_location_ids), 0) = 0 then
    raise exception 'at_least_one_location_required';
  end if;
  if p_primary_location_id is null or not (p_primary_location_id = any(p_location_ids)) then
    raise exception 'primary_location_must_be_selected';
  end if;
  if exists (
    select 1 from unnest(p_location_ids) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  delete from public.company_membership_locations where membership_id = p_membership_id;
  insert into public.company_membership_locations(
    company_id, membership_id, location_id, is_primary
  )
  select v_company_id, p_membership_id, x.id, x.id = p_primary_location_id
  from unnest(p_location_ids) x(id);
  return p_membership_id;
end;
$$;

revoke execute on function public.set_membership_locations(uuid, uuid[], uuid) from anon, public;
grant execute on function public.set_membership_locations(uuid, uuid[], uuid) to authenticated;

-- Company-level definitions, location-level availability and optional overrides.
alter table public.payment_methods
  add column if not exists availability_scope text not null default 'all_locations'
    check (availability_scope in ('all_locations', 'selected_locations'));

create table public.location_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  enabled boolean not null default true,
  ledger_account_code varchar(64),
  is_cashier_controlled boolean,
  requires_reconciliation boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, payment_method_id)
);

create index location_payment_methods_company_location_idx
  on public.location_payment_methods(company_id, location_id);
alter table public.location_payment_methods enable row level security;
create policy "location payment methods readable by company members"
  on public.location_payment_methods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(location_id))
    or (select public.is_platform_admin())
  );
grant select on public.location_payment_methods to authenticated;
grant all on public.location_payment_methods to service_role;

insert into public.location_payment_methods(company_id, location_id, payment_method_id)
select l.company_id, l.id, pm.id
from public.stock_locations l
join public.payment_methods pm on pm.company_id = l.company_id
on conflict (location_id, payment_method_id) do nothing;

create or replace function public.available_payment_methods(p_location_id uuid default null)
returns table (
  code text,
  name text,
  ledger_account_code varchar,
  is_cashier_controlled boolean,
  requires_reconciliation boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select
    pm.code,
    pm.name,
    coalesce(lpm.ledger_account_code, pm.ledger_account_code),
    coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled),
    coalesce(lpm.requires_reconciliation, pm.requires_reconciliation)
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
  where pm.company_id = v_company_id and pm.enabled and lpm.enabled
  order by pm.name;
end;
$$;

revoke execute on function public.available_payment_methods(uuid) from anon, public;
grant execute on function public.available_payment_methods(uuid) to authenticated, service_role;

create or replace function public.set_payment_method_locations(
  p_code text,
  p_location_ids uuid[],
  p_all_locations boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_method_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select id into v_method_id from public.payment_methods
  where company_id = v_company_id and code = p_code for update;
  if v_method_id is null then raise exception 'payment_method_not_found: %', p_code; end if;

  if exists (
    select 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  update public.payment_methods
  set availability_scope = case when p_all_locations then 'all_locations' else 'selected_locations' end,
      updated_at = now()
  where id = v_method_id;

  delete from public.location_payment_methods where payment_method_id = v_method_id;
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select v_company_id, l.id, v_method_id
  from public.stock_locations l
  where l.company_id = v_company_id and l.is_active
    and (p_all_locations or l.id = any(coalesce(p_location_ids, '{}'::uuid[])));

  return v_method_id;
end;
$$;

revoke execute on function public.set_payment_method_locations(text, uuid[], boolean)
  from anon, public;
grant execute on function public.set_payment_method_locations(text, uuid[], boolean)
  to authenticated;

-- New locations inherit company-wide methods and are assigned to existing
-- approved staff. Managers can narrow assignments later without changing data ownership.
create or replace function public.bootstrap_business_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select new.company_id, new.id, pm.id
  from public.payment_methods pm
  where pm.company_id = new.company_id and pm.availability_scope = 'all_locations'
  on conflict (location_id, payment_method_id) do nothing;

  insert into public.company_membership_locations(company_id, membership_id, location_id, is_primary)
  select new.company_id, m.id, new.id, false
  from public.company_memberships m
  where m.company_id = new.company_id and m.authorization_status = 'approved'
  on conflict (membership_id, location_id) do nothing;
  return new;
end;
$$;

create trigger stock_locations_bootstrap_business_location
  after insert on public.stock_locations
  for each row execute function public.bootstrap_business_location();

create or replace function public.bootstrap_membership_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
begin
  if new.authorization_status <> 'approved' then return new; end if;
  select l.id into v_location_id
  from public.stock_locations l
  where l.company_id = new.company_id and l.is_active
  order by l.is_default desc, l.created_at
  limit 1;
  if v_location_id is not null then
    insert into public.company_membership_locations(
      company_id, membership_id, location_id, is_primary
    ) values (new.company_id, new.id, v_location_id, true)
    on conflict (membership_id, location_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

create trigger company_memberships_bootstrap_location
  after insert or update of authorization_status on public.company_memberships
  for each row execute function public.bootstrap_membership_location();

create or replace function public.bootstrap_payment_method_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.availability_scope = 'all_locations' then
    insert into public.location_payment_methods(company_id, location_id, payment_method_id)
    select new.company_id, l.id, new.id
    from public.stock_locations l
    where l.company_id = new.company_id and l.is_active
    on conflict (location_id, payment_method_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger payment_methods_bootstrap_locations
  after insert on public.payment_methods
  for each row execute function public.bootstrap_payment_method_locations();

-- Location ownership for operational roots.
alter table public.orders
  add column if not exists location_id uuid references public.stock_locations(id),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;
alter table public.payments add column if not exists location_id uuid references public.stock_locations(id);
alter table public.refunds add column if not exists location_id uuid references public.stock_locations(id);
alter table public.cashier_sessions add column if not exists location_id uuid references public.stock_locations(id);
alter table public.reconciliations add column if not exists location_id uuid references public.stock_locations(id);
alter table public.mpesa_verifications add column if not exists location_id uuid references public.stock_locations(id);
alter table public.inventory_movements add column if not exists stock_location_id uuid references public.stock_locations(id);

update public.orders o
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = o.company_id order by l.is_default desc, l.created_at limit 1
)
where o.location_id is null;
update public.payments p set location_id = o.location_id
from public.orders o where o.id = p.order_id and p.location_id is null;
update public.refunds r set location_id = o.location_id
from public.orders o where o.id = r.order_id and r.location_id is null;
update public.cashier_sessions s
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = s.company_id order by l.is_default desc, l.created_at limit 1
)
where s.location_id is null;
update public.reconciliations r set location_id = s.location_id
from public.cashier_sessions s
where r.scope = 'cash-session' and split_part(r.scope_ref_id, ':', 1) = s.id::text
  and r.location_id is null;
update public.mpesa_verifications m set location_id = s.location_id
from public.cashier_sessions s where s.id = m.session_id and m.location_id is null;
update public.inventory_movements m set stock_location_id = b.stock_location_id
from public.inventory_batches b where b.id = m.batch_id and m.stock_location_id is null;
update public.purchases p
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = p.company_id order by l.is_default desc, l.created_at limit 1
)
where p.stock_location_id is null;
update public.inventory_batches b
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = b.company_id order by l.is_default desc, l.created_at limit 1
)
where b.stock_location_id is null;

alter table public.orders alter column location_id set not null;
alter table public.payments alter column location_id set not null;
alter table public.refunds alter column location_id set not null;
alter table public.cashier_sessions alter column location_id set not null;
alter table public.purchases alter column stock_location_id set not null;
alter table public.inventory_batches alter column stock_location_id set not null;

create index orders_company_location_completed_idx
  on public.orders(company_id, location_id, completed_at desc);
create index cashier_sessions_company_location_idx
  on public.cashier_sessions(company_id, location_id, status);
create index inventory_batches_location_variant_idx
  on public.inventory_batches(company_id, stock_location_id, variant_id, purchased_at)
  where remaining > 0;

drop index if exists public.cashier_sessions_one_open;
create unique index cashier_sessions_one_open_per_location
  on public.cashier_sessions(company_id, location_id) where status = 'open';

create or replace function public.assign_operational_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if tg_table_name = 'payments' or tg_table_name = 'refunds' then
    select o.location_id into new.location_id
    from public.orders o where o.id = new.order_id and o.company_id = new.company_id;
  elsif tg_table_name = 'inventory_movements' then
    if nullif(to_jsonb(new) ->> 'batch_id', '') is not null then
      select b.stock_location_id into new.stock_location_id
      from public.inventory_batches b
      where b.id = (to_jsonb(new) ->> 'batch_id')::uuid and b.company_id = new.company_id;
    end if;
  elsif tg_table_name = 'purchases' then
    if new.stock_location_id is null then
      new.stock_location_id := public.resolve_business_location(null);
    elsif not public.current_user_can_access_location(new.stock_location_id) then
      raise exception 'location_access_denied';
    end if;
  else
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    new.location_id := public.resolve_business_location(coalesce(new.location_id, v_requested));
  end if;
  return new;
end;
$$;

create trigger orders_assign_operational_location
  before insert on public.orders
  for each row execute function public.assign_operational_location();
create trigger payments_assign_operational_location
  before insert on public.payments
  for each row execute function public.assign_operational_location();
create trigger refunds_assign_operational_location
  before insert on public.refunds
  for each row execute function public.assign_operational_location();
create trigger cashier_sessions_assign_operational_location
  before insert on public.cashier_sessions
  for each row execute function public.assign_operational_location();
create trigger purchases_assign_operational_location
  before insert on public.purchases
  for each row execute function public.assign_operational_location();
create trigger inventory_movements_assign_operational_location
  before insert on public.inventory_movements
  for each row execute function public.assign_operational_location();

-- Legacy imports/tests may insert valuation layers directly. They still land
-- in a real location: explicit context first, then company default.
create or replace function public.assign_inventory_batch_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if new.stock_location_id is null then
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    if v_requested is not null and exists (
      select 1 from public.stock_locations l
      where l.id = v_requested and l.company_id = new.company_id and l.is_active
    ) then
      new.stock_location_id := v_requested;
    else
      select l.id into new.stock_location_id
      from public.stock_locations l
      where l.company_id = new.company_id and l.is_active
      order by l.is_default desc, l.created_at
      limit 1;
    end if;
  elsif not exists (
    select 1 from public.stock_locations l
    where l.id = new.stock_location_id and l.company_id = new.company_id and l.is_active
  ) then
    raise exception 'invalid_business_location';
  end if;
  if new.stock_location_id is null then raise exception 'business_location_required'; end if;
  return new;
end;
$$;

create trigger inventory_batches_assign_location
  before insert on public.inventory_batches
  for each row execute function public.assign_inventory_batch_location();

create or replace function public.post_sale_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  return public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref);
end;
$$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text)
  to authenticated;

create or replace function public.save_draft_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_order_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_order_id := public.save_draft(p_customer_id, p_lines, p_draft_id);
  if not exists (
    select 1 from public.orders o where o.id = v_order_id and o.location_id = v_location_id
  ) then raise exception 'draft_belongs_to_another_location'; end if;
  return v_order_id;
end;
$$;

revoke execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  from anon, public;
grant execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  to authenticated;

create or replace function public.open_cashier_session_at_location(
  p_location_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(p_declarations) d
      where d ->> 'account_code' = v_required.ledger_account_code
    ) then raise exception 'missing_declaration: %', v_required.ledger_account_code; end if;
  end loop;

  insert into public.cashier_sessions(company_id, location_id, cashier_user_id)
  values(v_company_id, v_location_id, auth.uid()) returning id into v_session_id;
  insert into public.reconciliations(
    company_id, location_id, scope, scope_ref_id, status, created_by
  ) values(
    v_company_id, v_location_id, 'cash-session', v_session_id::text || ':opening',
    'verified', auth.uid()
  ) returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    if not exists (
      select 1 from public.available_payment_methods(v_location_id) method
      where method.is_cashier_controlled
        and method.ledger_account_code = v_decl ->> 'account_code'
    ) then raise exception 'payment_method_unavailable_at_location'; end if;
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');
    insert into public.reconciliation_accounts(
      reconciliation_id, account_code, declared, expected, variance
    ) values(
      v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected
    );
    perform public.post_variance_adjustment(
      v_company_id, v_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Opening count variance'
    );
  end loop;

  select (d ->> 'declared')::bigint into v_declared
  from jsonb_array_elements(p_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
  if v_declared is not null then
    insert into public.cash_drawer_counts(
      session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by
    ) values(
      v_session_id, v_company_id, 'opening', v_declared,
      public.account_balance(v_company_id, 'CASH_ON_HAND'),
      v_declared - public.account_balance(v_company_id, 'CASH_ON_HAND'), auth.uid()
    );
  end if;
  return v_session_id;
end;
$$;

revoke execute on function public.open_cashier_session_at_location(uuid, jsonb)
  from anon, public;
grant execute on function public.open_cashier_session_at_location(uuid, jsonb)
  to authenticated;

create or replace function public.close_cashier_session_at_location(
  p_location_id uuid,
  p_session_id uuid,
  p_declarations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_result uuid;
begin
  if not exists (
    select 1 from public.cashier_sessions s
    where s.id = p_session_id and s.company_id = v_company_id
      and s.location_id = v_location_id and s.status = 'open'
  ) then raise exception 'session_not_open_at_location'; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_result := public.close_cashier_session(p_session_id, p_declarations);
  update public.reconciliations r set location_id = v_location_id
  where r.company_id = v_company_id and r.scope = 'cash-session'
    and r.scope_ref_id like p_session_id::text || ':%';
  return v_result;
end;
$$;

revoke execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  from anon, public;
grant execute on function public.close_cashier_session_at_location(uuid, uuid, jsonb)
  to authenticated;

-- Session tagging must never cross location boundaries.
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.cashier_session_id is null then
    new.cashier_session_id := (
      select s.id from public.cashier_sessions s
      where s.company_id = new.company_id
        and s.location_id = new.location_id
        and s.status = 'open'
      limit 1
    );
  end if;
  return new;
end;
$$;

-- Location-aware FIFO while preserving the established internal signature.
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
  v_location_id uuid;
begin
  if p_source_type = 'Sale' then
    select o.location_id into v_location_id
    from public.orders o
    where o.id = p_source_id::uuid and o.company_id = p_company_id;
  end if;
  if v_location_id is null then
    begin
      v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_location_id := null;
    end;
  end if;
  if v_location_id is null then
    select l.id into v_location_id from public.stock_locations l
    where l.company_id = p_company_id and l.is_active
    order by l.is_default desc, l.created_at limit 1;
  end if;

  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and variant_id = p_variant_id
    and stock_location_id = v_location_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and variant_id = p_variant_id
      and stock_location_id = v_location_id and remaining > 0
    order by purchased_at, created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;
    update public.inventory_batches set remaining = remaining - v_take where id = v_batch.id;
    insert into public.inventory_movements (
      company_id, variant_id, batch_id, stock_location_id, type, quantity,
      unit_cost, total_cost, source_type, source_id
    ) values (
      p_company_id, p_variant_id, v_batch.id, v_location_id, p_movement_type,
      -v_take, v_batch.unit_cost, v_cost, p_source_type, p_source_id
    );
    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost,
      'location_id', v_location_id
    );
  end loop;
  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- Validate sale payment availability at the order's location.
create or replace function public.validate_payment_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = new.location_id
    where pm.company_id = new.company_id and pm.code = new.method_code
      and pm.enabled and lpm.enabled
  ) then
    raise exception 'payment_method_unavailable_at_location: %', new.method_code;
  end if;
  return new;
end;
$$;

create trigger payments_validate_location
  before insert on public.payments
  for each row execute function public.validate_payment_location();

-- Feature preferences. Tier capability and company opt-in stay separate.
create or replace function public.set_commissions_enabled(p_enabled boolean)
returns boolean
language plpgsql
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
  if p_enabled and not coalesce(public.feature_enabled(v_company_id, 'commissions'), false) then
    raise exception 'feature_unavailable: commissions; upgrade your plan';
  end if;
  update public.companies set commissions_enabled = p_enabled, updated_at = now()
  where id = v_company_id;
  return p_enabled;
end;
$$;

revoke execute on function public.set_commissions_enabled(boolean) from anon, public;
grant execute on function public.set_commissions_enabled(boolean) to authenticated;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', coalesce(t.features, '{}'::jsonb),
    'settings', jsonb_build_object('commissionsEnabled', c.commissions_enabled),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id and l.is_active),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  return v_result;
end;
$$;

-- Live dashboard: same detail data plus location comparison and prior-period totals.
create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_location_id uuid := p_location_id;
  v_days int;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if v_location_id is not null and not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied';
  end if;
  v_days := greatest(((now() at time zone 'Africa/Nairobi')::date - v_since) + 1, 1);

  with accessible as (
    select id from public.accessible_business_locations()
  ), scoped_orders as (
    select o.*, (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date as day
    from public.orders o
    where o.company_id = v_company_id and o.status = 'completed'
      and o.location_id in (select id from accessible)
      and (v_location_id is null or o.location_id = v_location_id)
      and (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date >= v_since - v_days
  ), order_costs as (
    select o.id, o.location_id, o.day, o.total,
      coalesce(sum(jl.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs,
      coalesce((select sum(ol.quantity) from public.order_lines ol where ol.order_id = o.id), 0) as quantity
    from scoped_orders o
    left join public.ledger_journal_lines jl on jl.order_id = o.id and jl.company_id = o.company_id
    left join public.ledger_accounts a on a.id = jl.account_id
    group by o.id, o.location_id, o.day, o.total
  ), current_orders as (
    select * from order_costs where day >= v_since
  ), summary as (
    select day, count(*)::int as orders, sum(total)::bigint as revenue,
      sum(cogs)::bigint as cogs, (sum(total) - sum(cogs))::bigint as margin
    from current_orders group by day
  ), product_sales as (
    select o.day, ol.variant_id, sum(ol.quantity) as quantity,
      sum(ol.line_total)::bigint as revenue,
      coalesce(sum(round(o.cogs * ol.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
    from current_orders o join public.order_lines ol on ol.order_id = o.id
    group by o.day, ol.variant_id
  ), locations as (
    select l.id as location_id, l.name as location_name,
      count(o.id)::int as orders,
      coalesce(sum(o.total), 0)::bigint as revenue,
      coalesce(sum(o.quantity), 0) as quantity,
      coalesce(sum(o.cogs), 0)::bigint as cogs,
      (coalesce(sum(o.total), 0) - coalesce(sum(o.cogs), 0))::bigint as margin
    from public.stock_locations l
    join accessible x on x.id = l.id
    left join current_orders o on o.location_id = l.id
    where l.company_id = v_company_id and l.is_active
    group by l.id, l.name
  ), comparison as (
    select
      coalesce(sum(total) filter (where day >= v_since), 0)::bigint as current_revenue,
      coalesce(sum(quantity) filter (where day >= v_since), 0) as current_quantity,
      count(*) filter (where day >= v_since)::int as current_orders,
      coalesce(sum(total) filter (where day < v_since), 0)::bigint as previous_revenue,
      coalesce(sum(quantity) filter (where day < v_since), 0) as previous_quantity,
      count(*) filter (where day < v_since)::int as previous_orders
    from order_costs
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from summary s), '[]'::jsonb),
    'productSales', coalesce((select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.revenue desc, l.location_name) from locations l), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(c) from comparison c), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date, uuid) from anon, public;
grant execute on function public.dashboard_location_snapshot(date, uuid) to authenticated;

create or replace function public.location_stock_snapshot(p_location_id uuid default null)
returns table (variant_id uuid, stock numeric, stock_value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select v.id,
    coalesce(sum(b.remaining), 0)::numeric,
    coalesce(sum(b.remaining * b.unit_cost), 0)::bigint
  from public.product_variants v
  left join public.inventory_batches b
    on b.variant_id = v.id and b.stock_location_id = v_location_id and b.remaining > 0
  where v.company_id = v_company_id
  group by v.id;
end;
$$;

revoke execute on function public.location_stock_snapshot(uuid) from anon, public;
grant execute on function public.location_stock_snapshot(uuid) to authenticated, service_role;

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
  v_total bigint;
  v_batch_id uuid;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    return public.post_inventory_write_off(p_variant_id, abs(v_change), trim(p_reason));
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

revoke execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  from anon, public;
grant execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  to authenticated;

-- Stock transfers preserve valuation layers and never post a ledger entry:
-- company inventory value is unchanged; only physical custody moves.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_type_check
  check (type in ('purchase', 'sale', 'adjustment', 'reversal', 'transfer_out', 'transfer_in'));

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_location_id uuid not null references public.stock_locations(id),
  to_location_id uuid not null references public.stock_locations(id),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  source_batch_id uuid not null references public.inventory_batches(id),
  destination_batch_id uuid not null references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index stock_transfers_company_created_idx
  on public.stock_transfers(company_id, created_at desc);
create index stock_transfer_lines_transfer_idx
  on public.stock_transfer_lines(transfer_id, variant_id);

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;
create policy "stock transfers readable in assigned locations"
  on public.stock_transfers for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(from_location_id))
    and (select public.current_user_can_access_location(to_location_id))
    or (select public.is_platform_admin())
  );
create policy "stock transfer lines readable with transfer"
  on public.stock_transfer_lines for select
  using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = stock_transfer_lines.transfer_id
        and t.company_id = stock_transfer_lines.company_id
    )
    or (select public.is_platform_admin())
  );
grant select on public.stock_transfers, public.stock_transfer_lines to authenticated;
grant all on public.stock_transfers, public.stock_transfer_lines to service_role;

create trigger stock_transfers_audit
  after insert or update or delete on public.stock_transfers
  for each row execute function public.audit_trigger();

create or replace function public.transfer_stock(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_transfer_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_requested numeric;
  v_remaining numeric;
  v_available numeric;
  v_take numeric;
  v_cost bigint;
  v_source record;
  v_destination_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;
  if p_from_location_id = p_to_location_id then raise exception 'transfer_locations_must_differ'; end if;
  if not public.current_user_can_access_location(p_from_location_id)
    or not public.current_user_can_access_location(p_to_location_id) then
    raise exception 'location_access_denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_lines_required';
  end if;

  insert into public.stock_transfers(
    company_id, from_location_id, to_location_id, notes, created_by
  ) values (
    v_company_id, p_from_location_id, p_to_location_id,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_transfer_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_requested := nullif(v_line ->> 'quantity', '')::numeric;
    if v_variant_id is null or v_requested is null or v_requested <= 0 then
      raise exception 'invalid_transfer_line';
    end if;
    if not exists (
      select 1 from public.product_variants v
      where v.id = v_variant_id and v.company_id = v_company_id and v.track_inventory
    ) then raise exception 'invalid_transfer_variant'; end if;

    perform 1 from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0
    order by b.purchased_at, b.created_at for update;

    select coalesce(sum(b.remaining), 0) into v_available
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0;
    if v_available < v_requested then
      raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
        v_variant_id, v_available, v_requested;
    end if;

    v_remaining := v_requested;
    for v_source in
      select b.* from public.inventory_batches b
      where b.company_id = v_company_id and b.variant_id = v_variant_id
        and b.stock_location_id = p_from_location_id and b.remaining > 0
      order by b.purchased_at, b.created_at
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_source.remaining, v_remaining);
      v_cost := round(v_take * v_source.unit_cost);
      update public.inventory_batches set remaining = remaining - v_take where id = v_source.id;

      insert into public.inventory_batches(
        company_id, variant_id, stock_location_id, supplier_id, quantity, remaining,
        unit_cost, purchased_at, expiry_date, batch_number
      ) values (
        v_company_id, v_variant_id, p_to_location_id, v_source.supplier_id, v_take, v_take,
        v_source.unit_cost, v_source.purchased_at, v_source.expiry_date, v_source.batch_number
      ) returning id into v_destination_batch_id;

      insert into public.stock_transfer_lines(
        company_id, transfer_id, variant_id, source_batch_id,
        destination_batch_id, quantity, unit_cost
      ) values (
        v_company_id, v_transfer_id, v_variant_id, v_source.id,
        v_destination_batch_id, v_take, v_source.unit_cost
      );

      insert into public.inventory_movements(
        company_id, variant_id, batch_id, stock_location_id, type, quantity,
        unit_cost, total_cost, source_type, source_id, meta
      ) values
        (v_company_id, v_variant_id, v_source.id, p_from_location_id, 'transfer_out',
         -v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('toLocationId', p_to_location_id)),
        (v_company_id, v_variant_id, v_destination_batch_id, p_to_location_id, 'transfer_in',
         v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('fromLocationId', p_from_location_id));
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;
  return v_transfer_id;
end;
$$;

revoke execute on function public.transfer_stock(uuid, uuid, jsonb, text) from anon, public;
grant execute on function public.transfer_stock(uuid, uuid, jsonb, text) to authenticated;
