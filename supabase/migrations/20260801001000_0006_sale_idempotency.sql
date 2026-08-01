-- 0006_sale_idempotency.sql
-- Offline-queue support: client-generated idempotency refs on post_sale.
-- A queued offline sale carries a client_ref (uuid generated on the device);
-- replaying it after an ambiguous network failure returns the original order
-- instead of double-posting. Exactly-once without server sessions.

alter table public.orders add column client_ref text;

create unique index orders_client_ref_unique
  on public.orders (company_id, client_ref)
  where client_ref is not null;

-- post_sale gains p_client_ref. Postgres treats this as a new signature, so
-- the old 4-arg function is dropped to avoid PostgREST overload ambiguity.
drop function public.post_sale(uuid, jsonb, jsonb, boolean);

create or replace function public.post_sale(
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
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_existing uuid;
begin
  -- Idempotent replay: this client_ref already posted.
  if p_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = p_client_ref;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_client_ref is not null then
    begin
      update public.orders set client_ref = p_client_ref where id = v_order_id;
    exception when unique_violation then
      -- Concurrent post with the same ref won the race. Our row is a fresh
      -- draft with no stock/ledger side effects yet, so it is safe to drop.
      delete from public.orders where id = v_order_id;

      select id into v_existing
      from public.orders
      where company_id = v_company_id and client_ref = p_client_ref;

      return v_existing;
    end;
  end if;

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) from anon, public;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text) to authenticated;
