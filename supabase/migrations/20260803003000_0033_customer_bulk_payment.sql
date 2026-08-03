-- 0033_customer_bulk_payment.sql
-- Allocate one received customer payment oldest-credit-order first. The
-- existing allocation RPC remains the source of payment + ledger truth.

create or replace function public.post_customer_payment(
  p_customer_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order record;
  v_remaining bigint := p_amount;
  v_due bigint;
  v_take bigint;
  v_total_due bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists (
    select 1 from public.customers where id = p_customer_id
      and company_id = v_company_id and not is_supplier
  ) then raise exception 'customer_not_found'; end if;

  select coalesce(sum(o.total - coalesce(p.paid, 0)), 0)::bigint into v_total_due
  from public.orders o
  left join (
    select order_id, sum(amount)::bigint paid from public.payments
    where company_id = v_company_id and status = 'settled' group by order_id
  ) p on p.order_id = o.id
  where o.company_id = v_company_id and o.customer_id = p_customer_id
    and o.is_credit_sale and o.status = 'completed';
  if p_amount > v_total_due then raise exception 'payment_exceeds_customer_balance'; end if;

  for v_order in
    select o.id, o.code, o.total - coalesce(p.paid, 0) as due
    from public.orders o
    left join (
      select order_id, sum(amount)::bigint paid from public.payments
      where company_id = v_company_id and status = 'settled' group by order_id
    ) p on p.order_id = o.id
    where o.company_id = v_company_id and o.customer_id = p_customer_id
      and o.is_credit_sale and o.status = 'completed'
      and o.total - coalesce(p.paid, 0) > 0
    order by o.created_at, o.id
    for update of o
  loop
    exit when v_remaining <= 0;
    v_due := v_order.due;
    v_take := least(v_remaining, v_due);
    perform public.post_payment_allocation(
      v_order.id, v_take, p_method_code,
      case when p_reference is null then null
           else p_reference || ' · ' || v_order.code end
    );
    v_allocations := v_allocations || jsonb_build_object(
      'order_id', v_order.id, 'order_code', v_order.code, 'amount', v_take
    );
    v_remaining := v_remaining - v_take;
  end loop;

  return jsonb_build_object('amount', p_amount, 'allocations', v_allocations);
end;
$$;

revoke execute on function public.post_customer_payment(uuid, bigint, text, text)
  from anon, public;
grant execute on function public.post_customer_payment(uuid, bigint, text, text)
  to authenticated;

