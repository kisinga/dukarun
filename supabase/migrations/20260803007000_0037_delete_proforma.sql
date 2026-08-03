-- Proformas are non-posting draft orders. Any active company member may remove one,
-- matching the existing save/edit behavior. Tenant scoping and the state check keep
-- posted and parked sales outside this destructive path.

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

  if v_order.status <> 'draft' then
    raise exception 'invalid_order_state: only proformas can be deleted (% is %)',
      p_order_id, v_order.status;
  end if;

  delete from public.approvals
  where company_id = v_company_id
    and type = 'below_wholesale'
    and status = 'pending'
    and metadata ->> 'order_id' = p_order_id::text;

  delete from public.orders
  where id = p_order_id and company_id = v_company_id and status = 'draft';

  return p_order_id;
end;
$$;

revoke execute on function public.delete_proforma(uuid) from public, anon;
grant execute on function public.delete_proforma(uuid) to authenticated, service_role;

