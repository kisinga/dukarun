-- Proformas are valid for a configurable number of days (30 by default).
-- Expiry is stamped when the proforma is created, so later setting changes
-- apply to new proformas without silently changing an issued document.

alter table public.companies
  add column proforma_validity_days integer not null default 30
  check (proforma_validity_days between 1 and 3650);

grant update (proforma_validity_days) on public.companies to authenticated;

alter table public.orders
  add column expires_at timestamptz;

update public.orders o
set expires_at = o.created_at + make_interval(days => c.proforma_validity_days)
from public.companies c
where c.id = o.company_id;

alter table public.orders
  alter column expires_at set not null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('draft', 'expired', 'pending_payment', 'completed', 'voided'));

create index orders_active_proformas_idx
  on public.orders (company_id, expires_at desc)
  where status = 'draft';

-- Stamp the validity window for all order creation paths. Orders begin as
-- drafts, including sales that are completed immediately by post_sale.
create or replace function public.set_order_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_validity_days integer;
begin
  if new.expires_at is null then
    select c.proforma_validity_days into v_validity_days
    from public.companies c
    where c.id = new.company_id;

    new.expires_at := coalesce(new.created_at, now())
      + make_interval(days => coalesce(v_validity_days, 30));
  end if;
  return new;
end;
$$;

create trigger orders_set_expiry
  before insert on public.orders
  for each row execute function public.set_order_expiry();

-- A conversion must not succeed merely because the expiry sweep has not run
-- yet. Raising from this trigger rolls the whole sale posting back atomically.
create or replace function public.enforce_proforma_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'draft'
     and new.status not in ('draft', 'expired')
     and old.expires_at <= now() then
    raise exception 'proforma_expired: % expired at %', old.id, old.expires_at;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_proforma_expiry
  before update of status on public.orders
  for each row execute function public.enforce_proforma_expiry();

-- Called opportunistically by the app before list/count reads. The time check
-- in queries and the conversion trigger remain authoritative between sweeps.
create or replace function public.expire_proformas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_expired integer;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.approvals a
  set status = 'denied',
      decided_at = now(),
      decision_reason = 'Proforma expired'
  where a.company_id = v_company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and exists (
      select 1
      from public.orders o
      where o.id::text = a.metadata ->> 'order_id'
        and o.company_id = v_company_id
        and o.status = 'draft'
        and o.expires_at <= now()
    );

  update public.orders
  set status = 'expired', updated_at = now()
  where company_id = v_company_id
    and status = 'draft'
    and expires_at <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

revoke execute on function public.expire_proformas() from public, anon;
grant execute on function public.expire_proformas() to authenticated, service_role;

-- Mark existing stale proformas immediately during deployment.
update public.approvals a
set status = 'denied',
    decided_at = now(),
    decision_reason = 'Proforma expired'
where a.type = 'below_wholesale'
  and a.status = 'pending'
  and exists (
    select 1
    from public.orders o
    where o.id::text = a.metadata ->> 'order_id'
      and o.company_id = a.company_id
      and o.status = 'draft'
      and o.expires_at <= now()
  );

update public.orders
set status = 'expired', updated_at = now()
where status = 'draft' and expires_at <= now();

-- Expired proformas remain removable from the history list.
create or replace function public.delete_proforma(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order public.orders%rowtype;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id
  for update;

  if v_order.id is null then
    raise exception 'proforma_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'expired') then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id
    and company_id = v_company_id
    and status in ('draft', 'expired');

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;
