-- 0008_customer_credit.sql
-- Customer credit: AR repayment allocations with the per-order AR invariant,
-- plus credit validation at sale time (approved customer + credit limit).
-- Deviation from upstream (noted): over-limit / unapproved credit sales
-- hard-fail here; the approval-request workflow (overdraft approvals) is a
-- later phase, matching the plan's approvals table.

-- ---------------------------------------------------------------------------
-- post_payment_allocation: DR clearing / CR ACCOUNTS_RECEIVABLE with the
-- per-order invariant (at least one AR debit exists; credits <= debits).
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_allocation(
  p_order_id uuid,
  p_amount bigint,
  p_method_code text,
  p_reference text default null
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
  v_payment_id uuid;
  v_ar_debits bigint;
  v_ar_credits bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = v_company_id;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  select coalesce(pm.ledger_account_code, 'CLEARING_GENERIC') into v_account_code
  from public.payment_methods pm
  where pm.company_id = v_company_id and pm.code = p_method_code;

  insert into public.payments (company_id, order_id, method_code, amount, reference)
  values (v_company_id, p_order_id, p_method_code, p_amount, p_reference)
  returning id into v_payment_id;

  perform public.post_journal_entry(
    v_company_id, 'PaymentAllocation', v_payment_id::text,
    'Credit repayment for order ' || v_order.code,
    jsonb_build_array(
      jsonb_build_object(
        'account_code', coalesce(v_account_code, 'CLEARING_GENERIC'), 'debit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object(
          'orderCode', v_order.code, 'customerId', v_order.customer_id,
          'method', p_method_code, 'reference', p_reference
        )
      ),
      jsonb_build_object(
        'account_code', 'ACCOUNTS_RECEIVABLE', 'credit', p_amount, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      )
    )
  );

  -- Per-order AR invariant (same transaction, so this allocation is visible).
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    into v_ar_debits, v_ar_credits
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where l.company_id = v_company_id
    and a.code = 'ACCOUNTS_RECEIVABLE'
    and l.order_id = p_order_id;

  if v_ar_debits = 0 then
    raise exception 'ar_allocation_without_debt: order % has no AR balance', p_order_id;
  end if;

  if v_ar_credits > v_ar_debits then
    raise exception 'ar_overpayment: order % AR credits % exceed debits %', p_order_id, v_ar_credits, v_ar_debits;
  end if;

  return v_payment_id;
end;
$$;

revoke execute on function public.post_payment_allocation(uuid, bigint, text, text) from anon, public;
grant execute on function public.post_payment_allocation(uuid, bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: credit-sale validation — approved customer, limit check
-- against current AR balance. Full-body replace (credit branch is new).
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
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
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

  if v_is_credit then
    if v_order.customer_id is null then
      raise exception 'credit_requires_customer';
    end if;

    select * into v_customer
    from public.customers
    where id = v_order.customer_id and company_id = v_order.company_id;

    if v_customer is null or not v_customer.is_credit_approved then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    -- Current AR exposure for this customer (all orders).
    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_customer.credit_limit > 0
       and v_ar_balance + v_order.total > v_customer.credit_limit then
      raise exception 'credit_limit_exceeded: balance % + % > limit %',
        v_ar_balance, v_order.total, v_customer.credit_limit;
    end if;
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

  -- Revenue entries.
  if v_is_credit then
    perform public.post_journal_entry(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit')
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      )
    );
  else
    for v_payment_row in
      select p.*, pm.ledger_account_code
      from public.payments p
      left join public.payment_methods pm
        on pm.company_id = p.company_id and pm.code = p.method_code
      where p.order_id = p_order_id
    loop
      perform public.post_journal_entry(
        v_order.company_id, 'Payment', v_payment_row.id::text,
        'Sale ' || v_order.code || ' (' || v_payment_row.method_code || ')',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', coalesce(v_payment_row.ledger_account_code, 'CLEARING_GENERIC'),
            'debit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object(
              'orderCode', v_order.code, 'customerId', v_order.customer_id,
              'method', v_payment_row.method_code, 'reference', v_payment_row.reference
            )
          ),
          jsonb_build_object(
            'account_code', 'SALES', 'credit', v_payment_row.amount, 'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        )
      );
    end loop;
  end if;

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
