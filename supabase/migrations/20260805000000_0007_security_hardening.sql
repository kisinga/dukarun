-- ===========================================================================
-- 0007_security_hardening
--
-- Tenant isolation & money safety:
--   - scope complete_order / do_void order lookups to the caller's company
--     (previously keyed by id only: any authenticated user could complete or
--     void another company's orders, posting payments/journals/FIFO under
--     the victim's company)
--   - server-side pricing + ownership validation in save_draft
--   - permission gates on money-moving and settings RPCs that lacked them
--   - row locking in pay_supplier; companies write-policy tightening
-- Ledger integrity:
--   - posted journal entries/lines become immutable (trigger-guarded)
--   - per-method reconciliation check + row locks in period closing
--   - commit-time debits = credits invariant on journal entries
-- Hardening:
--   - auth hook clears stale claims; notifications/outbox/storage policies;
--     execute-privilege cleanup on anon-callable and trigger-only functions
-- RPC additions:
--   - settle_order gains p_client_ref idempotent replay (same pattern as
--     post_sale)
--   - post_sale / post_sale_at_location gain p_draft_id: atomic proforma
--     consumption in the same transaction as the sale
--
-- All function re-creations use `create or replace`, which preserves existing
-- ACLs; grants are re-issued explicitly only where the signature changed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Cross-tenant order completion/void: scope order lookups by company.
-- complete_order is only granted to service_role and invoked via the
-- convert_draft / settle_order / post_sale wrappers (all in the caller's
-- company context), so scoping by current_company_id() closes the
-- cross-tenant path without breaking internal callers.
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(p_order_id uuid, p_payments jsonb, p_actor uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_pending_approval uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
    and company_id = public.current_company_id()
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status not in ('draft', 'pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;

  -- below-wholesale gate.
  select a.id into v_pending_approval
  from public.approvals a
  where a.company_id = v_order.company_id
    and a.type = 'below_wholesale'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

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

    select coalesce(sum(l.debit) - sum(l.credit), 0) into v_ar_balance
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.company_id = v_order.company_id
      and a.code = 'ACCOUNTS_RECEIVABLE'
      and l.meta ->> 'customerId' = v_order.customer_id::text;

    if v_ar_balance + v_order.total > v_customer.credit_limit
       and v_customer.credit_limit > 0 then
      -- overdraft — allowed with an audit trail when the actor holds
      -- ApproveCustomerCredit; hard fail otherwise.
      if public.current_user_has_permission('ApproveCustomerCredit') then
        insert into public.approvals (company_id, type, status, metadata, requested_by, decided_by, decided_at, decision_reason)
        values (
          v_order.company_id, 'overdraft', 'approved',
          jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ),
          auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  end if;

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

  for v_line in
    select l.*, v.track_inventory
    from public.order_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.order_id = p_order_id
  loop
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity, 'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

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
$function$;

create or replace function public.do_void(p_order_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_account record;
  v_allocation jsonb;
  v_cogs_entry_id uuid;
  v_entry_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
    and company_id = public.current_company_id()
  for update;

  if v_order is null then
    raise exception 'order_not_found: %', p_order_id;
  end if;

  if v_order.status <> 'completed' then
    raise exception 'invalid_order_state: only completed orders can be voided (% is %)',
      p_order_id, v_order.status;
  end if;

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
        'debit', v_account.total_credit, 'credit', 0, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;

    if v_account.total_debit > 0 then
      v_reversal_lines := v_reversal_lines || jsonb_build_object(
        'account_code',
        (select code from public.ledger_accounts where id = v_account.account_id),
        'debit', 0, 'credit', v_account.total_debit, 'order_id', p_order_id,
        'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
      );
    end if;
  end loop;

  v_entry_id := public.post_journal_entry(
    v_order.company_id, 'OrderReversal', p_order_id::text || '-reversal',
    'Order reversal for order ' || v_order.code || coalesce(': ' || p_reason, ''),
    v_reversal_lines
  );

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
        company_id, variant_id, batch_id, type, quantity, unit_cost, total_cost, source_type, source_id
      )
      select b.company_id, b.variant_id, b.id, 'reversal',
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
$function$;

-- convert_draft previously forwarded any order id with no permission check;
-- give it the same gate settle_order has (cashiers hold SettleOrder; it is
-- the POS completion permission).
create or replace function public.convert_draft(p_order_id uuid, p_payments jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$function$;

-- ---------------------------------------------------------------------------
-- save_draft: never trust client prices. The override gate used to compare
-- the client-supplied custom_price against the client-supplied unit_price,
-- so a cashier could sell at any price by sending a low unit_price and no
-- custom_price. Prices are now resolved server-side from product_variants,
-- and the customer + every variant must belong to the caller's company
-- (previously only FK existence was enforced, so cross-tenant ids stuck).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(p_customer_id uuid, p_lines jsonb, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_list_price bigint;
  v_wholesale bigint;
  v_allow_fractional boolean;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_entitled(v_company_id, 'order');

  -- Ownership: the customer (when given) must belong to the caller's company.
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = v_company_id
  ) then
    raise exception 'invalid_customer: %', p_customer_id;
  end if;

  -- Ownership: every variant must belong to the caller's company.
  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    left join public.product_variants fv
      on fv.id = (l ->> 'variant_id')::uuid
     and fv.company_id = v_company_id
    where fv.id is null
  ) then
    raise exception 'invalid_variant: line references a variant outside this company';
  end if;

  -- Override detection compares custom_price against the SERVER-SIDE list
  -- price; the client-supplied unit_price is never trusted.
  select coalesce(bool_or(
           nullif(l ->> 'custom_price', '') is not null
           and (l ->> 'custom_price')::bigint <> fv.price
         ), false)
  into v_has_override
  from jsonb_array_elements(p_lines) l
  join public.product_variants fv
    on fv.id = (l ->> 'variant_id')::uuid
   and fv.company_id = v_company_id;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;

    select fv.price, fv.wholesale_price, fv.allow_fractional
    into v_list_price, v_wholesale, v_allow_fractional
    from public.product_variants fv
    where fv.id = (v_line ->> 'variant_id')::uuid
      and fv.company_id = v_company_id;

    v_price := coalesce(nullif(v_line ->> 'custom_price', '')::bigint, v_list_price);

    if v_qty <> trunc(v_qty) and not v_allow_fractional then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      v_list_price,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    if nullif(v_line ->> 'custom_price', '') is not null then
      if v_wholesale is not null
         and (v_line ->> 'custom_price')::bigint < v_wholesale then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- post_expense moves money (asset account -> EXPENSES) but had no permission
-- check: any member could drain an asset account. Gate it on the
-- money-movement permission (same level as post_transfer).
-- ---------------------------------------------------------------------------
create or replace function public.post_expense(p_amount bigint, p_source_account_code text, p_category text DEFAULT 'other'::text, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CreateInterAccountTransfer') then
    raise exception 'permission_denied: CreateInterAccountTransfer required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_source_account_code);

  return public.post_journal_entry(
    v_company_id, 'Expense', 'expense-' || gen_random_uuid(),
    coalesce(p_memo, 'Expense (' || coalesce(p_category, 'other') || ')'),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', 'EXPENSES', 'debit', p_amount,
        'meta', jsonb_build_object('sourceAccountCode', p_source_account_code, 'expenseCategory', coalesce(p_category, 'other'))
      ),
      jsonb_build_object('account_code', p_source_account_code, 'credit', p_amount, 'meta', '{}')
    )
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- pay_supplier: lock the supplier's credit purchases before computing the
-- unpaid total — two concurrent calls used to compute the same total and
-- double-pay AP. Also add the missing permission gate (the supplier UI
-- already hides this behind ManageSupplierCreditPurchases).
-- ---------------------------------------------------------------------------
create or replace function public.pay_supplier(p_supplier_id uuid, p_amount bigint, p_account_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase record;
  v_remaining bigint := p_amount;
  v_unpaid_total bigint := 0;
  v_alloc bigint;
  v_payment_id uuid;
  v_last_payment_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  perform public.require_asset_leaf_account(v_company_id, p_account_code);

  -- Lock the supplier's credit purchases so concurrent payments serialize.
  perform 1
  from public.purchases p
  where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit
  order by p.created_at asc
  for update;

  -- Total unpaid across credit purchases.
  select coalesce(sum(p.total_cost - coalesce(paid.s, 0)), 0) into v_unpaid_total
  from public.purchases p
  left join lateral (
    select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
  ) paid on true
  where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit;

  if v_unpaid_total = 0 then
    raise exception 'no_outstanding_ap: supplier %', p_supplier_id;
  end if;

  if p_amount > v_unpaid_total then
    raise exception 'ap_overpayment: % exceeds outstanding %', p_amount, v_unpaid_total;
  end if;

  -- Oldest unpaid first.
  for v_purchase in
    select p.id, p.reference, p.total_cost - coalesce(paid.s, 0) as unpaid
    from public.purchases p
    left join lateral (
      select sum(pp.amount) as s from public.purchase_payments pp where pp.purchase_id = p.id
    ) paid on true
    where p.company_id = v_company_id and p.supplier_id = p_supplier_id and p.is_credit
      and p.total_cost - coalesce(paid.s, 0) > 0
    order by p.created_at asc
  loop
    exit when v_remaining <= 0;

    v_alloc := least(v_purchase.unpaid, v_remaining);
    v_remaining := v_remaining - v_alloc;

    insert into public.purchase_payments (company_id, purchase_id, amount, account_code, created_by)
    values (v_company_id, v_purchase.id, v_alloc, p_account_code, auth.uid())
    returning id into v_payment_id;

    v_last_payment_id := v_payment_id;

    perform public.post_journal_entry(
      v_company_id, 'SupplierPayment', v_payment_id::text,
      'Supplier payment ' || coalesce(v_purchase.reference, v_purchase.id::text),
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_PAYABLE', 'debit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference, 'supplierId', p_supplier_id
          )
        ),
        jsonb_build_object(
          'account_code', p_account_code, 'credit', v_alloc,
          'meta', jsonb_build_object(
            'purchaseId', v_purchase.id, 'purchaseReference', v_purchase.reference,
            'supplierId', p_supplier_id, 'method', p_account_code
          )
        )
      )
    );
  end loop;

  return v_last_payment_id;
end;
$function$;

-- pay_purchase pays down AP on a single credit purchase; it had no
-- permission check either. record_purchase_with_payment calls it internally
-- only on the credit path, which the UI already gates on the same
-- permission, so the gate is consistent for internal callers.
create or replace function public.pay_purchase(p_purchase_id uuid, p_amount bigint, p_account_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid:=public.current_company_id(); v_purchase public.purchases%rowtype;
  v_paid bigint; v_payment_id uuid;
begin
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  if p_amount is null or p_amount<=0 then raise exception 'invalid_amount'; end if;
  perform public.require_asset_leaf_account(v_company_id,p_account_code);
  select * into v_purchase from public.purchases where id=p_purchase_id and company_id=v_company_id
    and is_credit for update;
  if v_purchase.id is null then raise exception 'credit_purchase_not_found'; end if;
  select coalesce(sum(amount),0) into v_paid from public.purchase_payments where purchase_id=p_purchase_id;
  if p_amount > v_purchase.total_cost-v_paid then raise exception 'ap_overpayment'; end if;
  insert into public.purchase_payments(company_id,purchase_id,amount,account_code,created_by)
  values(v_company_id,p_purchase_id,p_amount,p_account_code,auth.uid()) returning id into v_payment_id;
  perform public.post_journal_entry(v_company_id,'SupplierPayment',v_payment_id::text,
    'Supplier payment '||coalesce(v_purchase.reference,v_purchase.id::text),jsonb_build_array(
      jsonb_build_object('account_code','ACCOUNTS_PAYABLE','debit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id)),
      jsonb_build_object('account_code',p_account_code,'credit',p_amount,'meta',jsonb_build_object('purchaseId',p_purchase_id,'supplierId',v_purchase.supplier_id,'method',p_account_code))));
  return v_payment_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- update_payment_method had no permission check: any member could disable
-- methods or clear requires_reconciliation, weakening the external-tender
-- gate. Restrict it to the reconciliation/settings role.
-- ---------------------------------------------------------------------------
create or replace function public.update_payment_method(p_code text, p_enabled boolean DEFAULT NULL::boolean, p_requires_reconciliation boolean DEFAULT NULL::boolean, p_is_cashier_controlled boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  update public.payment_methods
  set enabled = coalesce(p_enabled, enabled),
      requires_reconciliation = coalesce(p_requires_reconciliation, requires_reconciliation),
      is_cashier_controlled = coalesce(p_is_cashier_controlled, is_cashier_controlled),
      updated_at = now()
  where company_id = v_company_id and code = p_code
  returning id into v_id;

  if v_id is null then
    raise exception 'payment_method_not_found: %', p_code;
  end if;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- post_payment_reversal reverses any posted payment; add the reversal
-- permission gate (same level as order void).
-- ---------------------------------------------------------------------------
create or replace function public.post_payment_reversal(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_entry record;
  v_existing uuid;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_line record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  select id into v_existing
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type = 'PaymentReversal'
    and source_id = p_payment_id::text || '-reversal';

  if v_existing is not null then
    return v_existing; -- idempotent
  end if;

  select * into v_entry
  from public.ledger_journal_entries
  where company_id = v_company_id
    and source_type in ('Payment', 'PaymentAllocation')
    and source_id = p_payment_id::text;

  if v_entry is null then
    raise exception 'original_entry_not_found: %', p_payment_id;
  end if;

  for v_line in
    select l.*, a.code as account_code
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = v_entry.id
  loop
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code', v_line.account_code,
      'debit', v_line.credit,
      'credit', v_line.debit,
      'order_id', v_line.order_id,
      'meta', v_line.meta
    );
  end loop;

  -- post_journal_entry can't set reversal_of; insert entry directly via a
  -- wrapper below.
  return public.post_reversal_entry(
    v_company_id, 'PaymentReversal', p_payment_id::text || '-reversal',
    'Payment reversal ' || p_payment_id::text, v_reversal_lines, v_entry.id
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Cashier session RPCs had no permission checks — any authenticated member
-- could open/close sessions or record M-Pesa verifications. Gate them on
-- SettleOrder, the POS permission the Cashier role actually holds.
-- ---------------------------------------------------------------------------
create or replace function public.open_cashier_session_at_location(p_location_id uuid, p_declarations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_session_id uuid;
  v_recon_id uuid;
  v_required record;
  v_decl jsonb;
  v_declarations jsonb := coalesce(p_declarations, '[]'::jsonb);
  v_declared bigint;
  v_expected bigint;
  v_require_opening_count boolean;
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  perform set_config('app.business_location_id', v_location_id::text, true);
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and location_id = v_location_id and status = 'open'
  ) then raise exception 'session_already_open'; end if;

  select c.require_opening_count into v_require_opening_count
  from public.companies c where c.id = v_company_id;

  if not coalesce(v_require_opening_count, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'account_code', method.ledger_account_code,
      'declared', public.account_balance(v_company_id, method.ledger_account_code)
    )), '[]'::jsonb)
    into v_declarations
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled;
  end if;

  for v_required in
    select method.ledger_account_code
    from public.available_payment_methods(v_location_id) method
    where method.is_cashier_controlled
  loop
    if not exists (
      select 1 from jsonb_array_elements(v_declarations) d
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

  for v_decl in select * from jsonb_array_elements(v_declarations)
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
  from jsonb_array_elements(v_declarations) d where d ->> 'account_code' = 'CASH_ON_HAND';
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
$function$;

create or replace function public.close_cashier_session(p_session_id uuid, p_declarations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_session record;
  v_recon_id uuid;
  v_decl jsonb;
  v_declared bigint;
  v_expected bigint;
  v_cash_declared bigint;
  v_cash_expected bigint;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  select * into v_session
  from public.cashier_sessions
  where id = p_session_id and company_id = v_company_id and status = 'open'
  for update;

  if v_session is null then
    raise exception 'session_not_open: %', p_session_id;
  end if;

  insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by)
  values (v_company_id, 'cash-session', p_session_id::text || ':closing', 'verified', auth.uid())
  returning id into v_recon_id;

  for v_decl in select * from jsonb_array_elements(p_declarations)
  loop
    v_declared := (v_decl ->> 'declared')::bigint;
    v_expected := public.account_balance(v_company_id, v_decl ->> 'account_code');

    insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
    values (v_recon_id, v_decl ->> 'account_code', v_declared, v_expected, v_declared - v_expected);

    perform public.post_variance_adjustment(
      v_company_id, p_session_id::text, v_decl ->> 'account_code', v_declared,
      v_recon_id::text, 'Closing count variance'
    );

    if v_decl ->> 'account_code' = 'CASH_ON_HAND' then
      v_cash_declared := v_declared;
      v_cash_expected := v_expected;
    end if;
  end loop;

  if v_cash_declared is not null then
    insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by)
    values (p_session_id, v_company_id, 'closing', v_cash_declared, v_cash_expected, v_cash_declared - v_cash_expected, auth.uid());
  end if;

  update public.cashier_sessions
  set status = 'closed', closed_at = now(), closing_declared = v_cash_declared
  where id = p_session_id;

  return p_session_id;
end;
$function$;

create or replace function public.record_mpesa_verification(p_session_id uuid, p_all_confirmed boolean, p_flagged_ids jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  insert into public.mpesa_verifications (company_id, session_id, all_confirmed, flagged_ids, notes, created_by)
  values (v_company_id, p_session_id, p_all_confirmed, coalesce(p_flagged_ids, '[]'), p_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Supplier/catalog guards: archiving a supplier and rewriting variant prices
-- during purchase capture were open to every member.
-- ---------------------------------------------------------------------------
create or replace function public.set_supplier_active(p_supplier_id uuid, p_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_company_id uuid := public.current_company_id(); v_id uuid; v_balance bigint;
begin
  if not public.current_user_has_permission('ManageSupplierCreditPurchases') then
    raise exception 'permission_denied: ManageSupplierCreditPurchases required';
  end if;
  if not p_active then
    select coalesce(sum(l.credit)-sum(l.debit),0) into v_balance
    from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
    where l.company_id=v_company_id and a.code='ACCOUNTS_PAYABLE'
      and l.meta ->> 'supplierId'=p_supplier_id::text;
    if v_balance <> 0 then raise exception 'supplier_has_outstanding_balance'; end if;
    if exists(select 1 from public.purchase_drafts where company_id=v_company_id
      and supplier_id=p_supplier_id and status='draft')
      then raise exception 'supplier_has_open_drafts'; end if;
  end if;
  update public.customers set supplier_active=p_active,updated_at=now()
  where id=p_supplier_id and company_id=v_company_id and is_supplier returning id into v_id;
  if v_id is null then raise exception 'supplier_not_found'; end if;
  return v_id;
end;
$function$;

create or replace function public.record_purchase_with_prices(p_supplier_id uuid, p_lines jsonb, p_is_credit boolean, p_reference text DEFAULT NULL::text, p_account_code text DEFAULT 'CASH_ON_HAND'::text, p_notes text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_stock_location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_purchase_id uuid;
  v_line jsonb;
  v_variant public.product_variants%rowtype;
  v_wholesale bigint;
  v_retail bigint;
begin
  -- Catalog price changes ride along with purchase capture; gate them on the
  -- catalog permission so a stock receiver cannot rewrite retail/wholesale
  -- prices.
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ? 'new_wholesale_price' or l ? 'new_retail_price'
  ) and not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required for price updates';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_supplier_id and company_id = v_company_id and is_supplier and supplier_active
  ) then
    raise exception 'supplier_archived_or_not_found';
  end if;

  -- The selling price is one value per variant: duplicate lines for the same
  -- variant must agree on the new price, otherwise the last line would win
  -- silently. Identical values across duplicate lines are fine.
  if exists (
    select 1
    from (
      select l ->> 'variant_id' as variant_id,
        nullif(l ->> 'new_wholesale_price', '')::bigint as new_wholesale_price,
        nullif(l ->> 'new_retail_price', '')::bigint as new_retail_price
      from jsonb_array_elements(p_lines) l
      where l ? 'new_wholesale_price' or l ? 'new_retail_price'
    ) price_lines
    group by variant_id
    having count(distinct new_wholesale_price) > 1
      or count(distinct new_retail_price) > 1
  ) then
    raise exception 'conflicting_new_prices_for_variant';
  end if;

  -- Validate all requested catalog updates before creating any purchase state.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      select * into v_variant from public.product_variants
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
      if v_variant.id is null then raise exception 'invalid_purchase_variant'; end if;
      v_wholesale := coalesce(nullif(v_line ->> 'new_wholesale_price', '')::bigint,
        v_variant.wholesale_price, 0);
      v_retail := coalesce(nullif(v_line ->> 'new_retail_price', '')::bigint, v_variant.price);
      if v_wholesale < 0 or v_retail < 0 then raise exception 'invalid_price'; end if;
      if v_retail < v_wholesale then raise exception 'retail_price_below_wholesale'; end if;
    end if;
  end loop;

  v_purchase_id := public.record_purchase(p_supplier_id, p_lines, p_is_credit, p_reference,
    p_account_code, p_notes, p_purchase_date, p_stock_location_id);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_wholesale_price' or v_line ? 'new_retail_price' then
      update public.product_variants set
        wholesale_price = case when v_line ? 'new_wholesale_price'
          then (v_line ->> 'new_wholesale_price')::bigint else wholesale_price end,
        price = case when v_line ? 'new_retail_price'
          then (v_line ->> 'new_retail_price')::bigint else price end,
        updated_at = now()
      where id = (v_line ->> 'variant_id')::uuid and company_id = v_company_id;
    end if;
  end loop;
  return v_purchase_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- settle_order idempotency: optional p_client_ref stamped on the order
-- (orders_client_ref_unique already enforces uniqueness per company). A
-- replayed settle with the same ref returns the original result instead of
-- failing on invalid_order_state or double-posting payments.
-- ---------------------------------------------------------------------------
drop function public.settle_order(uuid, jsonb);

create function public.settle_order(p_order_id uuid, p_payments jsonb, p_client_ref text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
begin
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  if p_client_ref is not null then
    begin
      update public.orders
      set client_ref = p_client_ref
      where id = p_order_id
        and company_id = v_company_id
        and client_ref is null;
    exception when unique_violation then
      -- The ref is already attached to a different order.
      raise exception 'client_ref_in_use: %', p_client_ref;
    end;

    if not found then
      -- Either the order is not ours (complete_order below raises) or a
      -- concurrent/replayed settle with this ref already stamped it. The
      -- ref is only stamped by settle_order itself, so a match means this
      -- exact operation already succeeded — return the original result
      -- regardless of the order's current status (it may since have been
      -- voided).
      if exists (
        select 1 from public.orders o
        where o.id = p_order_id
          and o.company_id = v_company_id
          and o.client_ref = p_client_ref
      ) then
        return p_order_id;
      end if;
    end if;
  end if;

  return public.complete_order(p_order_id, p_payments, auth.uid());
end;
$function$;

revoke execute on function public.settle_order(uuid, jsonb, text) from anon, public;
grant execute on function public.settle_order(uuid, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- post_sale gains p_draft_id: when a sale is completed from a loaded
-- proforma, the draft is validated (must belong to the caller's company)
-- and retired in the same transaction as the sale — closing the window
-- where a separate deleteProforma call could be lost and the proforma
-- converted into a second, duplicate sale. Retirement happens on every
-- path that produces an order (parked/held included): once the order row
-- exists it supersedes the proforma. The client_ref replay check runs
-- before all input validation — a replay short-circuits, and since the
-- original call retired the draft in its own transaction, the replay
-- path needs no draft handling.
-- ---------------------------------------------------------------------------
drop function public.post_sale(uuid, jsonb, jsonb, boolean, text);

create function public.post_sale(p_customer_id uuid, p_lines jsonb, p_payments jsonb, p_park boolean DEFAULT false, p_client_ref text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_existing uuid;
begin
  -- Idempotent replay: this client_ref already posted. Must precede all
  -- input validation — the original call already retired its draft, so a
  -- replay would fail draft validation instead of returning the order.
  if p_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = p_client_ref;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- The proforma being converted must be one of the caller's own drafts.
  if p_draft_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_draft_id
      and o.company_id = v_company_id
      and o.status = 'draft'
  ) then
    raise exception 'draft_not_found: %', p_draft_id;
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

  -- The order row now exists and supersedes the source proforma: retire
  -- the proforma on every path (parked/held included) so it cannot be
  -- converted into a second, duplicate sale. Rolls back with the sale if
  -- complete_order below raises.
  if p_draft_id is not null then
    delete from public.approvals
    where company_id = v_company_id
      and type = 'below_wholesale'
      and metadata ->> 'order_id' = p_draft_id::text;

    delete from public.orders
    where id = p_draft_id
      and company_id = v_company_id
      and status in ('draft', 'expired');
  end if;

  if p_park then
    update public.orders
    set status = 'pending_payment', cashier_pending_at = now(), updated_at = now()
    where id = v_order_id;
    return v_order_id;
  end if;

  v_order_id := public.complete_order(v_order_id, p_payments, auth.uid());

  return v_order_id;
end;
$function$;

revoke execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text, uuid) from anon, public;
grant execute on function public.post_sale(uuid, jsonb, jsonb, boolean, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- post_sale_at_location: pass p_draft_id through to post_sale, and close an
-- external-tender gate hole — tenders whose method code matches no
-- payment_methods row used to fall out of the external set (inner join) and
-- land in CLEARING_GENERIC ungated. Unknown methods are now treated as
-- external (left join).
-- ---------------------------------------------------------------------------
drop function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text);

create function public.post_sale_at_location(p_location_id uuid, p_customer_id uuid, p_lines jsonb, p_payments jsonb, p_park boolean DEFAULT false, p_client_ref text DEFAULT NULL::text, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_external_tenders jsonb;
  v_order_id uuid;
  v_approval_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);

  -- Parked sales take no payment, so only live tenders are gated. 'credit'
  -- is excluded: credit sales are handled by the credit-limit logic in
  -- complete_order, not by cashier control.
  if not p_park then
    select jsonb_agg(jsonb_build_object(
             'method', t.method, 'amount', t.amount, 'reference', t.reference
           ))
    into v_external_tenders
    from (
      select p ->> 'method' as method,
             (p ->> 'amount')::bigint as amount,
             p ->> 'reference' as reference
      from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) p
    ) t
    left join public.payment_methods pm
      on pm.company_id = v_company_id and pm.code = t.method
    left join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
    where t.method <> 'credit'
      and (pm.id is null or not coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled));
  end if;

  if v_external_tenders is not null then
    if p_customer_id is null then
      raise exception 'cashier_controlled_only: walk-in sales require cashier-controlled accounts';
    end if;

    if not public.current_user_has_permission('ViewFinancials') then
      -- Hold the order unpaid for finance sign-off. The hold flag lets the
      -- order reach pending_payment even when the cashier queue is disabled
      -- (enforce_order_cashier_flow exemption below).
      perform set_config('app.external_payment_hold', 'on', true);
      v_order_id := public.post_sale(p_customer_id, p_lines, '[]'::jsonb, true, p_client_ref, p_draft_id);

      -- Reuse an existing pending request (idempotent client_ref replay),
      -- same pattern as void_sale.
      select a.id into v_approval_id
      from public.approvals a
      where a.company_id = v_company_id
        and a.type = 'external_account_payment'
        and a.status = 'pending'
        and a.metadata ->> 'order_id' = v_order_id::text
      limit 1;

      if v_approval_id is null then
        v_approval_id := public.create_approval(
          v_company_id, 'external_account_payment',
          jsonb_build_object('order_id', v_order_id, 'tenders', v_external_tenders)
        );

        perform public.notify(
          v_company_id, 'approval',
          'External account payment needs approval',
          'A sale was tendered to a non-cashier-controlled account and is held pending settlement.',
          '/approvals', null
        );
      end if;

      return jsonb_build_object(
        'status', 'approval_required',
        'approval_id', v_approval_id,
        'order_id', v_order_id
      );
    end if;
  end if;

  v_order_id := public.post_sale(p_customer_id, p_lines, p_payments, p_park, p_client_ref, p_draft_id);

  return jsonb_build_object(
    'status', case when p_park then 'parked' else 'completed' end,
    'order_id', v_order_id
  );
end;
$function$;

revoke execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text, uuid) from anon, public;
grant execute on function public.post_sale_at_location(uuid, uuid, jsonb, jsonb, boolean, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ledger immutability. Nothing blocked UPDATE/DELETE on posted journal
-- entries/lines, so a service_role bug or direct write could rewrite history
-- or move entry_date across a period lock. Posted rows are now immutable,
-- with two narrow, auditable exceptions that existing posting paths rely on:
--   * entries: stamping reversal_of exactly once (post_reversal_entry)
--   * lines:   meta enrichment only (cashier-session tagging backfills
--              openSessionId on the entry's earlier lines mid-post)
-- One-off backfills can opt out per transaction via:
--   set local app.allow_ledger_mutation = 'on';
-- ---------------------------------------------------------------------------
create or replace function public.guard_ledger_entries_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'ledger_immutable: posted journal entries cannot be deleted';
  end if;

  if old.reversal_of is null and new.reversal_of is not null
     and new.id = old.id
     and new.company_id = old.company_id
     and new.entry_date = old.entry_date
     and new.posted_at = old.posted_at
     and new.source_type = old.source_type
     and new.source_id = old.source_id
     and new.memo is not distinct from old.memo
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'ledger_immutable: posted journal entries cannot be modified';
end;
$function$;

create or replace function public.guard_ledger_lines_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_setting('app.allow_ledger_mutation', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'ledger_immutable: posted journal lines cannot be deleted';
  end if;

  if new.id = old.id
     and new.entry_id = old.entry_id
     and new.company_id = old.company_id
     and new.account_id = old.account_id
     and new.order_id is not distinct from old.order_id
     and new.debit = old.debit
     and new.credit = old.credit then
    return new;
  end if;

  raise exception 'ledger_immutable: posted journal lines cannot be modified';
end;
$function$;

create trigger ledger_entries_immutable
  before update or delete on public.ledger_journal_entries
  for each row execute function public.guard_ledger_entries_immutable();

create trigger ledger_lines_immutable
  before update or delete on public.ledger_journal_lines
  for each row execute function public.guard_ledger_lines_immutable();

revoke execute on function public.guard_ledger_entries_immutable() from anon, authenticated, public;
revoke execute on function public.guard_ledger_lines_immutable() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Commit-time balance invariant. debits = credits was enforced only inside
-- post_journal_entry, so any direct write path could create unbalanced
-- entries. A deferrable constraint trigger validates every new entry when
-- the transaction commits (lines are inserted after the entry within the
-- same transaction, so the check must be deferred).
-- ---------------------------------------------------------------------------
create or replace function public.check_journal_entry_balanced()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
  into v_debit, v_credit
  from public.ledger_journal_lines l
  where l.entry_id = new.id;

  if v_debit <> v_credit or v_debit = 0 then
    raise exception 'unbalanced_entry: entry % has debits % <> credits %', new.id, v_debit, v_credit;
  end if;

  return null;
end;
$function$;

create constraint trigger ledger_journal_entries_balanced
  after insert on public.ledger_journal_entries
  deferrable initially deferred
  for each row execute function public.check_journal_entry_balanced();

revoke execute on function public.check_journal_entry_balanced() from anon, authenticated, public;

-- Zero-amount lines were permitted by check (debit = 0 or credit = 0);
-- require at least one side to be non-zero. Added NOT VALID so any legacy
-- zero-amount rows cannot abort the migration, then validated — if legacy
-- zero rows exist, the validate fails loudly here rather than mid-deploy.
alter table public.ledger_journal_lines
  add constraint ledger_journal_lines_nonzero_amount_chk check (debit > 0 or credit > 0) not valid;

alter table public.ledger_journal_lines
  validate constraint ledger_journal_lines_nonzero_amount_chk;

-- Tie each line's company to its parent entry's company. entries.id is a
-- primary key, so the (id, company_id) unique constraint cannot reject
-- existing data; the FK then guarantees line.company_id = entry.company_id.
alter table public.ledger_journal_entries
  add constraint ledger_journal_entries_id_company_key unique (id, company_id);

alter table public.ledger_journal_lines
  add constraint ledger_journal_lines_entry_company_fkey
  foreign key (entry_id, company_id)
  references public.ledger_journal_entries (id, company_id);

-- ---------------------------------------------------------------------------
-- Period closing: the reconciliation gate accepted ANY verified
-- reconciliation since the last lock for every requires_reconciliation
-- method (the method code never reached the inner query). Now each method
-- needs a verified reconciliation covering its own ledger account. Also take
-- a row lock on period_locks so two concurrent closes serialize.
-- ---------------------------------------------------------------------------
create or replace function public.close_accounting_period(p_end_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_id uuid := public.current_company_id();
  v_lock record;
  v_period_id uuid;
  v_method record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;

  if p_end_date is null or p_end_date > (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'invalid_period_end: cannot close a future period';
  end if;

  select * into v_lock from public.period_locks where company_id = v_company_id
  for update;

  if v_lock is not null and p_end_date <= v_lock.lock_end_date then
    raise exception 'invalid_period_end: must be after the last locked period (%)', v_lock.lock_end_date;
  end if;

  -- No open cashier sessions.
  if exists (select 1 from public.cashier_sessions where company_id = v_company_id and status = 'open') then
    raise exception 'open_sessions_exist: close cashier sessions before closing the period';
  end if;

  -- Every reconciliation-requiring payment method needs a verified
  -- reconciliation covering its own ledger account since the last lock.
  for v_method in
    select pm.code, pm.ledger_account_code
    from public.payment_methods pm
    where pm.company_id = v_company_id and pm.requires_reconciliation and pm.enabled
    order by pm.code
  loop
    if not exists (
      select 1
      from public.reconciliations r
      join public.reconciliation_accounts ra on ra.reconciliation_id = r.id
      where r.company_id = v_company_id
        and r.status = 'verified'
        and r.created_at > coalesce(v_lock.updated_at, '-infinity'::timestamptz)
        and ra.account_code = v_method.ledger_account_code
    ) then
      raise exception 'reconciliation_required: method % has no verified reconciliation this period', v_method.code;
    end if;
  end loop;

  insert into public.period_locks (company_id, lock_end_date, updated_at)
  values (v_company_id, p_end_date, now())
  on conflict (company_id) do update set lock_end_date = p_end_date, updated_at = now();

  insert into public.accounting_periods (company_id, start_date, end_date, status, created_by)
  values (
    v_company_id,
    coalesce(v_lock.lock_end_date + 1, p_end_date),
    p_end_date,
    'closed',
    auth.uid()
  )
  returning id into v_period_id;

  return v_period_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- post_journal_entry: serialize the period-lock check against a concurrent
-- close_accounting_period by taking a shared row lock (for key share
-- conflicts with the closer's for update) before evaluating the lock date.
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry(p_company_id uuid, p_source_type text, p_source_id text, p_memo text, p_lines jsonb, p_entry_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_entry_id uuid;
  v_entry_date date;
  v_lock_end date;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_line jsonb;
  v_account_id uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum((l ->> 'debit')::bigint), 0),
         coalesce(sum((l ->> 'credit')::bigint), 0)
    into v_debit_sum, v_credit_sum
  from jsonb_array_elements(p_lines) l;

  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  v_entry_date := coalesce(p_entry_date, (now() at time zone 'Africa/Nairobi')::date);

  -- Period lock enforcement, serialized against close_accounting_period.
  select pl.lock_end_date into v_lock_end
  from public.period_locks pl
  where pl.company_id = p_company_id
  for key share of pl;

  if v_lock_end is not null and v_entry_date <= v_lock_end then
    raise exception 'period_locked: entry date % is within a locked period', v_entry_date;
  end if;

  begin
    insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
    values (p_company_id, v_entry_date, p_source_type, p_source_id, p_memo)
    returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
    from public.ledger_journal_entries e
    where e.company_id = p_company_id
      and e.source_type = p_source_type
      and e.source_id = p_source_id;

    return v_entry_id; -- already posted; idempotent replay
  end;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line ->> 'debit')::bigint, 0);
    v_credit := coalesce((v_line ->> 'credit')::bigint, 0);

    select a.id into v_account_id
    from public.ledger_accounts a
    where a.company_id = p_company_id
      and a.code = v_line ->> 'account_code'
      and a.is_active
      and not a.is_parent;

    if v_account_id is null then
      raise exception 'unknown_account: %', v_line ->> 'account_code';
    end if;

    insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
    values (
      v_entry_id, p_company_id, v_account_id,
      nullif(v_line ->> 'order_id', '')::uuid,
      v_debit, v_credit,
      coalesce(v_line -> 'meta', '{}'::jsonb)
    );
  end loop;

  return v_entry_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Auth hook: stale claims were never cleared — after a membership disable or
-- admin removal, previous company_id / user_role / is_platform_admin values
-- survived in the event payload. Delete the keys before the conditional sets.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  -- Clear first: a disabled membership or removed platform admin must not
  -- retain claims carried in the event payload.
  v_claims := v_claims - 'company_id' - 'user_role' - 'is_platform_admin';

  -- Single indexed lookup. A user belongs to at most one company in the
  -- current model; earliest approved membership wins if data says otherwise.
  select m.company_id, r.name
    into v_company_id, v_role_name
  from public.company_memberships m
  left join public.roles r on r.id = m.role_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
  order by m.created_at asc
  limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role_name, '')));
  end if;

  select exists (
    select 1 from public.platform_admins p
    where p.user_id = (event ->> 'user_id')::uuid
  ) into v_is_platform_admin;

  if v_is_platform_admin then
    v_claims := jsonb_set(v_claims, '{is_platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$function$;

-- ---------------------------------------------------------------------------
-- assert_entitled leaked cross-company existence/subscription state and
-- usage counts via its error messages: any authenticated user could probe
-- arbitrary company ids. Verify the caller belongs to the company (or is a
-- platform admin) before reading anything.
-- ---------------------------------------------------------------------------
create or replace function public.assert_entitled(p_company_id uuid, p_check text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  if p_company_id is distinct from public.current_company_id()
     and not public.is_platform_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_company from public.companies where id = p_company_id;
  if v_company is null then raise exception 'company_not_found: %', p_company_id; end if;

  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > v_now then
    return;
  end if;
  if v_company.subscription_status not in ('trial', 'active') then
    if not (v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;
  if p_check is null then return; end if;

  select t.limits into v_limits from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;
  if v_limits is null then return; end if;

  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= (v_limits ->> 'maxOrdersPerMonth')::int then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_limits ->> 'maxOrdersPerMonth';
  end if;

  if p_check = 'product' and (v_limits ->> 'maxProducts') is not null
     and (select count(*) from public.product_variants v
          where v.company_id = p_company_id and v.active) >= (v_limits ->> 'maxProducts')::int then
    raise exception 'limit_reached: product limit (%); upgrade your plan', v_limits ->> 'maxProducts';
  end if;

  if p_check = 'team' and (v_limits ->> 'maxAdmins') is not null
     and (select count(*) from public.company_memberships m
          where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= (v_limits ->> 'maxAdmins')::int then
    raise exception 'limit_reached: team member limit (%); upgrade your plan', v_limits ->> 'maxAdmins';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- notifications: policies were company-wide and ignored user_id, so any
-- member could read or mark-read another user's targeted notifications.
-- ---------------------------------------------------------------------------
drop policy "notifications readable by members" on public.notifications;
create policy "notifications readable by members"
  on public.notifications for select
  using (
    (select public.is_platform_admin())
    or (
      company_id = (select public.current_company_id())
      and (user_id is null or user_id = auth.uid())
    )
  );

drop policy "members mark read" on public.notifications;
create policy "members mark read"
  on public.notifications for update
  using (
    company_id = (select public.current_company_id())
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    company_id = (select public.current_company_id())
    and (user_id is null or user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- outbox: the member-wide select policy exposed customer phone numbers and
-- message bodies to every role. Restrict reads to platform admins and
-- members with ViewFinancials (the notifications page's message log is a
-- finance/manager surface).
-- ---------------------------------------------------------------------------
drop policy "outbox readable by members" on public.outbox;
create policy "outbox readable by finance or platform admins"
  on public.outbox for select
  using (
    (select public.is_platform_admin())
    or (
      company_id = (select public.current_company_id())
      and (select public.current_user_has_permission('ViewFinancials'))
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: the update policy had no WITH CHECK, so a member could rename an
-- object outside their company prefix. The public-bucket select policy only
-- enabled anonymous LISTING of every object — public buckets serve object
-- URLs without any policy, so dropping it keeps image URLs working.
-- ---------------------------------------------------------------------------
drop policy "members update their company image prefix" on storage.objects;
create policy "members update their company image prefix"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

drop policy "product images readable by everyone" on storage.objects;

-- ---------------------------------------------------------------------------
-- companies writes: the app writes public_slug / public_storefront_enabled /
-- proforma_validity_days directly through the PostgREST table API (settings
-- page), so those column grants must stay — instead the member update policy
-- now requires the company to be approved, closing self-approval and
-- pre-approval storefront toggling. commissions_enabled is only written via
-- the gated set_commissions_enabled RPC, so its direct column grant goes.
-- ---------------------------------------------------------------------------
drop policy "companies updatable by members" on public.companies;
create policy "companies updatable by members"
  on public.companies for update
  using (
    id = (select public.current_company_id())
    and status = 'approved'
  )
  with check (
    id = (select public.current_company_id())
    and status = 'approved'
  );

revoke update (commissions_enabled) on public.companies from authenticated;

-- ---------------------------------------------------------------------------
-- Execute-privilege cleanup (dashboard linter):
--  * account_balance was granted to authenticated without a preceding
--    revoke, leaving it anon-executable (Postgres grants EXECUTE to PUBLIC
--    by default).
--  * current_user_has_permission had the same gap.
--  * trigger-only functions are never meant to be called directly; revoke
--    them from every non-owner role. storefront_catalog /
--    storefront_collections keep their anon grant on purpose (public
--    storefront).
-- ---------------------------------------------------------------------------
revoke execute on function public.account_balance(uuid, text) from anon, public;
-- current_user_has_permission ran on the default PUBLIC grant only; grant
-- the real callers explicitly before cutting PUBLIC off.
grant execute on function public.current_user_has_permission(text) to authenticated, service_role;
revoke execute on function public.current_user_has_permission(text) from anon, public;

revoke execute on function public.apply_batch_expiry_preference() from anon, authenticated, public;
revoke execute on function public.assign_inventory_batch_location() from anon, authenticated, public;
revoke execute on function public.assign_operational_location() from anon, authenticated, public;
revoke execute on function public.bootstrap_business_location() from anon, authenticated, public;
revoke execute on function public.bootstrap_membership_location() from anon, authenticated, public;
revoke execute on function public.bootstrap_payment_method_locations() from anon, authenticated, public;
revoke execute on function public.enforce_journal_entry_cashier_session() from anon, authenticated, public;
revoke execute on function public.ensure_first_stock_location_default() from anon, authenticated, public;
revoke execute on function public.ensure_opening_balance_account() from anon, authenticated, public;
revoke execute on function public.notify_large_cashier_variance() from anon, authenticated, public;
revoke execute on function public.require_active_purchase_supplier() from anon, authenticated, public;
revoke execute on function public.set_order_expiry() from anon, authenticated, public;
revoke execute on function public.tag_journal_line_cashier_session() from anon, authenticated, public;
revoke execute on function public.tag_order_session() from anon, authenticated, public;
revoke execute on function public.validate_payment_location() from anon, authenticated, public;

comment on table public.credit_notification_checkpoints is
  'Service-role-only cron checkpoint table; RLS enabled with no member policies by design.';

-- ---------------------------------------------------------------------------
-- Template role seed idempotency: unique (company_id, name) can never fire
-- for templates (company_id is null), so re-seeding duplicated templates.
-- A partial unique index makes template names unique.
-- ---------------------------------------------------------------------------
create unique index if not exists roles_template_name_uidx
  on public.roles (name) where is_template;

-- ---------------------------------------------------------------------------
-- Missing FK / hot-path indexes (plain create index; concurrently is not
-- allowed inside a migration transaction).
-- ---------------------------------------------------------------------------
create index if not exists journal_lines_account_id_idx on public.ledger_journal_lines (account_id);
create index if not exists cash_drawer_counts_session_idx on public.cash_drawer_counts (session_id);
create index if not exists reconciliation_accounts_recon_idx on public.reconciliation_accounts (reconciliation_id);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_cashier_session_idx on public.orders (cashier_session_id);
create index if not exists order_lines_company_idx on public.order_lines (company_id);
create index if not exists payments_company_idx on public.payments (company_id);
create index if not exists commission_lines_order_idx on public.commission_lines (order_id);
create index if not exists purchases_supplier_id_idx on public.purchases (supplier_id);
create index if not exists purchases_stock_location_idx on public.purchases (stock_location_id);
create index if not exists purchase_lines_variant_idx on public.purchase_lines (variant_id);
create index if not exists purchase_lines_batch_idx on public.purchase_lines (inventory_batch_id);
create index if not exists purchase_drafts_company_idx on public.purchase_drafts (company_id);
create index if not exists purchase_drafts_supplier_idx on public.purchase_drafts (supplier_id);
create index if not exists purchase_payments_company_idx on public.purchase_payments (company_id);
create index if not exists inventory_movements_batch_idx on public.inventory_movements (batch_id);
create index if not exists company_memberships_role_idx on public.company_memberships (role_id);
create index if not exists ledger_accounts_parent_idx on public.ledger_accounts (parent_id);
create index if not exists companies_subscription_tier_idx on public.companies (subscription_tier_id);
create index if not exists ledger_journal_entries_reversal_of_idx on public.ledger_journal_entries (reversal_of);
create index if not exists approvals_order_id_expr_idx on public.approvals ((metadata ->> 'order_id'));
