-- 0013_void_mixed_accounts.sql
-- Bug: void_sale aggregated an order's journal lines per account and emitted
-- ONE swapped line per account. When an account has BOTH debits and credits
-- on the order (e.g. credit sale + partial AR repayment, or cash sale + cash
-- refund), that line had debit>0 AND credit>0, violating
-- ledger_journal_lines_check (debit = 0 or credit = 0).
-- Fix: emit single-sided lines — a debit line for the account's credit total
-- and a credit line for its debit total. Gross totals unchanged (still a
-- perfect mirror); the entry stays balanced because the original was.

create or replace function public.void_sale(
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

  -- Swapped per-account totals, emitted as single-sided lines.
  for v_account in
    select account_id, sum(debit) as total_debit, sum(credit) as total_credit
    from public.ledger_journal_lines
    where order_id = p_order_id
    group by account_id
  loop
    if v_account.total_credit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', v_account.total_credit,
        'credit', 0,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0,
        'credit', v_account.total_debit,
        'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

  -- Restore FIFO batches from the recorded COGS allocations.
  select id into v_cogs_entry_id
  from public.ledger_journal_entries
  where company_id = v_order.company_id
    and source_type = 'InventorySaleCogs'
    and source_id = p_order_id::text;

  if v_cogs_entry_id is not null then
    for v_allocation in
      select a.value as allocation
      from public.ledger_journal_lines l,
           lateral jsonb_array_elements(l.meta -> 'cogsAllocations') a
      where l.entry_id = v_cogs_entry_id
    loop
      update public.inventory_batches
      set remaining = remaining + (v_allocation ->> 'quantity')::numeric
      where id = (v_allocation ->> 'batch_id')::uuid;

      insert into public.inventory_movements (
        company_id, product_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.product_id, b.id, 'reversal',
             (v_allocation ->> 'quantity')::numeric,
             (v_allocation ->> 'unit_cost')::bigint,
             (v_allocation ->> 'total_cost')::bigint,
             'OrderReversal', p_order_id::text
      from public.inventory_batches b
      where b.id = (v_allocation ->> 'batch_id')::uuid;
    end loop;
  end if;

  update public.payments set status = 'cancelled' where order_id = p_order_id;

  update public.orders
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
      updated_at = now()
  where id = p_order_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;
