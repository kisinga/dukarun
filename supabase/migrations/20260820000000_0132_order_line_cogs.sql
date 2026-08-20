-- Persist the exact FIFO cost already calculated while each sale line is
-- completed. Historical rows stay null unless their cost can be recovered
-- without splitting an order-level total or otherwise estimating it.

alter table public.order_lines
  add column if not exists cogs_total bigint;

alter table public.order_lines
  drop constraint if exists order_lines_cogs_total_nonnegative,
  add constraint order_lines_cogs_total_nonnegative
    check (cogs_total is null or cogs_total >= 0);

-- A historical line is recoverable only when it is the sole line for that
-- order and variant and matching sale movements exist. Current variant flags
-- are mutable, so they cannot establish what happened during an older sale.
with unique_lines as (
  select
    line.company_id,
    line.order_id,
    line.variant_id,
    (array_agg(line.id order by line.id))[1] as line_id
  from public.order_lines line
  join public.orders orders on orders.id = line.order_id
  where orders.status = 'completed'
  group by line.company_id, line.order_id, line.variant_id
  having count(*) = 1
), exact_costs as (
  select unique_lines.line_id, sum(movement.total_cost)::bigint as cogs_total
  from unique_lines
  join public.inventory_movements movement
    on movement.company_id = unique_lines.company_id
   and movement.variant_id = unique_lines.variant_id
   and movement.source_type = 'Sale'
   and movement.source_id = unique_lines.order_id::text
   and movement.type = 'sale'
  group by unique_lines.line_id
)
update public.order_lines line
set cogs_total = exact_costs.cogs_total
from exact_costs
where line.id = exact_costs.line_id
  and line.cogs_total is null;

create or replace function public.complete_order_core(
  p_order_id uuid,
  p_payments jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_line record;
  v_payment_row record;
  v_customer record;
  v_ar_balance bigint;
  v_is_credit boolean;
  v_paid bigint := 0;
  v_fifo jsonb;
  v_line_cogs bigint;
  v_persisted_line_cogs bigint;
  v_total_cogs bigint := 0;
  v_quantity_total numeric := 0;
  v_all_allocations jsonb := '[]'::jsonb;
  v_pending_approval uuid;
  v_business_timezone text;
  v_entry_date date;
  v_actor uuid := (p_context).actor_id;
  v_posting_context public.posting_context;
begin
  if (p_context).company_id is null or (p_context).source not in (
    'interactive','approval','offline','offline_review','mpesa_provider','mpesa_reconciliation'
  ) then raise exception 'invalid_posting_context'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'invalid_payments';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and company_id = (p_context).company_id
  for update;
  if v_order is null then raise exception 'order_not_found: %', p_order_id; end if;
  if v_order.status not in ('draft','pending_payment') then
    raise exception 'invalid_order_state: % is %', p_order_id, v_order.status;
  end if;
  if exists (
    select 1
    from public.order_lines line
    where line.order_id = p_order_id
    limit 1 offset 128
  ) then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  select company.business_timezone into v_business_timezone
  from public.companies company where company.id = v_order.company_id;
  if (p_context).location_id is distinct from v_order.location_id then
    raise exception 'posting_context_location_mismatch';
  end if;
  v_entry_date := coalesce(
    (p_context).posting_date,
    (coalesce((p_context).occurred_at, now()) at time zone v_business_timezone)::date
  );
  v_posting_context := row(
    (p_context).company_id, (p_context).location_id, (p_context).actor_id,
    (p_context).cashier_session_id, coalesce((p_context).occurred_at, now()),
    v_entry_date, (p_context).source, (p_context).late_reason
  )::public.posting_context;

  select approval.id into v_pending_approval
  from public.approvals approval
  where approval.company_id = v_order.company_id
    and approval.type = 'below_wholesale'
    and approval.status = 'pending'
    and approval.metadata ->> 'order_id' = p_order_id::text
  limit 1;
  if v_pending_approval is not null then
    raise exception 'below_wholesale_approval_required: approval %', v_pending_approval;
  end if;

  v_is_credit := jsonb_array_length(p_payments) = 0
    or (jsonb_array_length(p_payments) = 1 and p_payments -> 0 ->> 'method' = 'credit');
  if v_is_credit then
    if v_order.customer_id is null then raise exception 'credit_requires_customer'; end if;
    select * into v_customer
    from public.customers customer
    where customer.id = v_order.customer_id and customer.company_id = v_order.company_id;
    if v_customer is null or (
      coalesce(nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
        v_order.total) > 0
      and not v_customer.is_credit_approved
    ) then
      raise exception 'credit_not_approved: customer %', v_order.customer_id;
    end if;

    select coalesce(sum(line.debit) - sum(line.credit), 0)
    into v_ar_balance
    from public.ledger_journal_lines line
    join public.ledger_accounts account on account.id = line.account_id
    where line.company_id = v_order.company_id
      and line.customer_id = v_order.customer_id
      and account.code = 'ACCOUNTS_RECEIVABLE';

    if v_ar_balance + coalesce(
      nullif(current_setting('app.sale_residual_credit_amount', true), '')::bigint,
      v_order.total
    ) > v_customer.credit_limit and v_customer.credit_limit > 0 then
      if public.current_user_has_permission('ApproveCustomerCredit')
        or exists (
          select 1
          from public.company_memberships membership
          join public.roles role
            on role.id = membership.role_id and role.company_id = membership.company_id
          where membership.company_id = v_order.company_id
            and membership.user_id = v_actor
            and membership.authorization_status = 'approved'
            and 'ApproveCustomerCredit' = any(role.permissions)
        )
        or coalesce(current_setting('app.approved_credit_order_id', true), '') = p_order_id::text
      then
        insert into public.approvals(
          company_id, type, status, metadata, requested_by, decided_by,
          decided_at, decision_reason
        ) values(
          v_order.company_id, 'overdraft', 'approved', jsonb_build_object(
            'order_id', p_order_id, 'customerId', v_order.customer_id,
            'ar_balance', v_ar_balance, 'order_total', v_order.total,
            'credit_limit', v_customer.credit_limit
          ), auth.uid(), auth.uid(), now(), 'Overdraft authorized at checkout'
        );
      else
        raise exception 'credit_limit_exceeded: balance % + % > limit %',
          v_ar_balance, v_order.total, v_customer.credit_limit;
      end if;
    end if;
  else
    if exists (
      select 1 from jsonb_array_elements(p_payments) payment
      where payment ->> 'method' = 'credit'
    ) then
      raise exception 'invalid_payment_mix: credit cannot be combined with other methods';
    end if;

    with inserted as (
      insert into public.payments(
        company_id, order_id, method_code, amount, reference, mpesa_receipt,
        collection_allocation_id, location_id, cashier_session_id, ledger_account_code
      )
      select
        v_order.company_id, p_order_id, payment.method, payment.amount,
        payment.reference, payment.mpesa_receipt, payment.collection_allocation_id,
        v_order.location_id,
        coalesce((p_context).cashier_session_id, v_order.cashier_session_id),
        public.resolve_tender_account(
          v_order.company_id, v_order.location_id, payment.method, payment.account_code
        )
      from jsonb_to_recordset(p_payments) as payment(
        method text,
        amount bigint,
        reference text,
        mpesa_receipt text,
        collection_allocation_id uuid,
        account_code text
      )
      returning amount
    )
    select coalesce(sum(amount), 0)::bigint into v_paid from inserted;
    if v_paid <> v_order.total then
      raise exception 'payment_mismatch: paid % <> order total %', v_paid, v_order.total;
    end if;
  end if;

  for v_line in
    select line.*, variant.track_inventory
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id
  loop
    v_quantity_total := v_quantity_total + v_line.quantity;
    v_line_cogs := 0;
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity,
        'Sale', p_order_id::text
      );
      v_line_cogs := (v_fifo ->> 'total_cogs')::bigint;
      v_total_cogs := v_total_cogs + v_line_cogs;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
    update public.order_lines
    set cogs_total = v_line_cogs
    where id = v_line.id and company_id = v_order.company_id;
  end loop;

  select coalesce(sum(line.cogs_total), 0)::bigint
  into v_persisted_line_cogs
  from public.order_lines line
  where line.order_id = p_order_id and line.company_id = v_order.company_id;
  if v_persisted_line_cogs <> v_total_cogs then
    raise exception 'order_line_cogs_mismatch: lines % <> order %',
      v_persisted_line_cogs, v_total_cogs;
  end if;

  if v_is_credit then
    perform public.post_journal_entry_with_context(
      v_order.company_id, 'CreditSale', p_order_id::text,
      'Credit sale ' || v_order.code,
      jsonb_build_array(
        jsonb_build_object(
          'account_code', 'ACCOUNTS_RECEIVABLE', 'debit', v_order.total,
          'order_id', p_order_id, 'meta', jsonb_build_object(
            'orderCode', v_order.code, 'customerId', v_order.customer_id, 'method', 'credit'
          )
        ),
        jsonb_build_object(
          'account_code', 'SALES', 'credit', v_order.total, 'order_id', p_order_id,
          'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
        )
      ), v_posting_context
    );
  else
    for v_payment_row in select payment.* from public.payments payment
      where payment.order_id = p_order_id
    loop
      perform public.post_journal_entry_with_context(
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
            'account_code', 'SALES', 'credit', v_payment_row.amount,
            'order_id', p_order_id,
            'meta', jsonb_build_object('orderCode', v_order.code, 'customerId', v_order.customer_id)
          )
        ), v_posting_context
      );
    end loop;
  end if;

  if v_total_cogs > 0 then
    perform public.post_journal_entry_with_context(
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
      ), v_posting_context
    );
  end if;

  update public.orders
  set status = 'completed',
      is_credit_sale = v_is_credit,
      cashier_pending_at = null,
      completed_at = coalesce((p_context).occurred_at, completed_at, now()),
      accounting_posting_date = v_entry_date,
      posting_source = (p_context).source,
      late_posting_reason = (p_context).late_reason,
      cashier_session_id = coalesce(cashier_session_id, (p_context).cashier_session_id),
      quantity_total = v_quantity_total,
      cogs_total = v_total_cogs,
      updated_at = now()
  where id = p_order_id;
  return p_order_id;
end;
$$;

revoke execute on function public.complete_order_core(uuid,jsonb,public.posting_context)
  from public, anon, authenticated;
grant execute on function public.complete_order_core(uuid,jsonb,public.posting_context)
  to service_role;
