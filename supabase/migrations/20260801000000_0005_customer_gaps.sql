-- 0005_customer_gaps.sql
-- Fixes two gaps found during POS screen integration:
--   1. No client-reachable way to create customers (writes are RPC-only).
--   2. Credit sales were permitted without a customer — AR lines with no
--      debtor attached. Now enforced inside complete_order.

-- ---------------------------------------------------------------------------
-- create_customer RPC (minimal; credit fields managed separately in Phase 4)
-- ---------------------------------------------------------------------------
create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text) from anon, public;
grant execute on function public.create_customer(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: enforce that credit sales have a customer.
-- (Full-body replace; only the marked block is new.)
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(
  p_order_id uuid,
  p_payments jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment jsonb;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_journal_lines jsonb := '[]'::jsonb;
  v_account_code text;
  v_fifo jsonb;
  v_total_cogs bigint := 0;
  v_all_allocations jsonb := '[]'::jsonb;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- Classify: credit sale = no payments, or a single 'credit' payment line.
  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');

  -- NEW: a credit sale without a debtor is meaningless AR.
  if v_is_credit and v_order.customer_id is null then
    raise exception 'credit_requires_customer';
  end if;

  -- Record settled payments (non-credit path).
  if not v_is_credit then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      if v_payment ->> 'method' = 'credit' then
        raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
      end if;

      insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt)
      values (
        v_order.company_id, p_order_id,
        v_payment ->> 'method',
        (v_payment ->> 'amount')::bigint,
        v_payment ->> 'reference',
        v_payment ->> 'mpesa_receipt'
      );

      v_paid := v_paid + (v_payment ->> 'amount')::bigint;
    end loop;

    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  -- FIFO consumption + COGS per line.
  for v_line in
    select l.*, p.track_inventory
    from public.order_lines l
    join public.products p on p.id = l.product_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.product_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

  -- Revenue entry: DR per-method clearing (or AR for credit) / CR SALES, gross.
  if v_is_credit then
    v_journal_lines := v_journal_lines || jsonb_build_object(
      'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
      'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
    );
  else
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
      from public.payment_methods pm
      where pm.company_id = v_order.company_id and pm.code = v_payment ->> 'method';

      v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'),
        'debit', (v_payment ->> 'amount')::bigint, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', v_payment ->> 'method', 'reference', v_payment ->> 'reference'
        )
      );
    end loop;
  end if;

  v_journal_lines := v_journal_lines || jsonb_build_object(
    'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
    'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
  );

  perform public.post_journal_entry(
    v_order.company_id,
    case when v_is_credit then 'CreditSale' else 'Payment' end,
    p_order_id::text,
    case when v_is_credit then 'Credit sale ' else 'Sale ' end || v_order.code,
    v_journal_lines
  );

  -- COGS entry.
  if v_total_cogs > 0 then
    perform public.post_journal_entry(
      v_order.company_id, 'InventorySaleCogs', p_order_id::text,
      'COGS for order ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'COGS', 'debit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id,
            'cogsAllocations', v_all_allocations
          )
        ),
        jsonb_build_object(
          'account_code', 'INVENTORY', 'credit', v_total_cogs, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      updated_at = now()
  where id = p_order_id;

  return p_order_id;
end;
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;
