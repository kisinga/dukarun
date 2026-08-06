-- Customer lifecycle: keep historical account links while preventing archived
-- customers from being selected for new sales.

alter table public.customers
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;

create index customers_company_active_idx
  on public.customers (company_id, first_name)
  where deleted_at is null;

create or replace function public.set_customer_deleted(
  p_customer_id uuid,
  p_deleted boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.customers
  set deleted_at = case when p_deleted then coalesce(deleted_at, now()) else null end,
      deleted_by = case when p_deleted then coalesce(deleted_by, auth.uid()) else null end,
      updated_at = now()
  where id = p_customer_id
    and company_id = v_company_id
    and not is_supplier;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

revoke execute on function public.set_customer_deleted(uuid, boolean) from anon, public;
grant execute on function public.set_customer_deleted(uuid, boolean) to authenticated;

-- A deleted account may keep receiving repayments against its historical
-- balance, but it must not be attached to a newly created sale.
create or replace function public.reject_deleted_order_customer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.customer_id is not null
     and (
       tg_op = 'INSERT'
       or new.customer_id is distinct from old.customer_id
       or (
         new.status in ('pending_payment', 'completed')
         and new.status is distinct from old.status
       )
     )
     and exists (
       select 1
       from public.customers c
       where c.id = new.customer_id
         and c.company_id = new.company_id
         and c.deleted_at is not null
     ) then
    raise exception 'customer_deleted: %', new.customer_id;
  end if;
  return new;
end;
$$;

create trigger orders_reject_deleted_customer
before insert or update of customer_id, status on public.orders
for each row execute function public.reject_deleted_order_customer();
