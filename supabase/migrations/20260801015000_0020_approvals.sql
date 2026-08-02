-- 0020_approvals.sql
-- Approvals workflow (old: approval-request entity, 4 types).
-- Semantics per type:
--   below_wholesale  — save_draft records it when a custom price dips below
--                      wholesale; complete_order blocks until approved.
--   order_reversal   — callers with ReverseOrder but without ManageApprovals
--                      get a pending approval instead of an instant void;
--                      approval executes the void.
--   overdraft        — over-limit credit sale by an ApproveCustomerCredit
--                      holder succeeds and records an approved overdraft
--                      approval (audit of who authorized); others hard-fail.
--   customer_credit  — reserved (credit-limit raise requests); table support
--                      now, triggers when that flow lands.

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in ('overdraft', 'customer_credit', 'below_wholesale', 'order_reversal')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  metadata jsonb not null default '{}',
  due_at timestamptz,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);

create index approvals_company_status_idx on public.approvals (company_id, status, created_at desc);

alter table public.approvals enable row level security;

create policy "approvals readable by members"
  on public.approvals for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.approvals to authenticated;
grant all on public.approvals to service_role;

create trigger approvals_audit
  after insert or update or delete on public.approvals
  for each row execute function public.audit_trigger();

alter publication supabase_realtime add table public.approvals;

-- ---------------------------------------------------------------------------
-- Internal: create an approval row (service-role/RPC use).
-- ---------------------------------------------------------------------------
create or replace function public.create_approval(
  p_company_id uuid,
  p_type text,
  p_metadata jsonb,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.approvals (company_id, type, metadata, due_at, requested_by)
  values (p_company_id, p_type, coalesce(p_metadata, '{}'), p_due_at, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_approval(uuid, text, jsonb, timestamptz) from authenticated, anon, public;
grant execute on function public.create_approval(uuid, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- save_draft: record below-wholesale approvals for overridden lines.
-- Full-body replace (adds the marked block at the end).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

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
    -- fresh draft: drop any stale below-wholesale requests for it
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
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    -- NEW: track below-wholesale custom prices for approval.
    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  -- NEW: one approval request per order covering all below-wholesale lines.
  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_order: block while a below-wholesale approval is pending.
-- Full-body replace (only the marked guard is new).
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
  v_pending_approval uuid;
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

  -- NEW: below-wholesale gate.
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
      -- NEW: overdraft — allowed with an audit trail when the actor holds
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
$$;

revoke execute on function public.complete_order(uuid, jsonb, uuid) from authenticated, anon, public;
grant execute on function public.complete_order(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- do_void (internal): the void mechanics, no permission checks.
-- ---------------------------------------------------------------------------
create or replace function public.do_void(p_order_id uuid, p_reason text)
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
  select * into v_order from public.orders where id = p_order_id for update;

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
$$;

revoke execute on function public.do_void(uuid, text) from authenticated, anon, public;
grant execute on function public.do_void(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- void_sale: instant for ManageApprovals; approval request otherwise.
-- Returns a status object (NOT an exception for the approval path — raising
-- would roll back the approval insert itself).
--   {"status": "voided", "entry_id": "..."}
--   {"status": "approval_required", "approval_id": "..."}
-- ---------------------------------------------------------------------------
drop function public.void_sale(uuid, text);

create or replace function public.void_sale(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval_id uuid;
  v_entry_id uuid;
begin
  if not public.current_user_has_permission('ReverseOrder') then
    raise exception 'permission_denied: ReverseOrder required';
  end if;

  if public.current_user_has_permission('ManageApprovals') then
    v_entry_id := public.do_void(p_order_id, p_reason);
    return jsonb_build_object('status', 'voided', 'entry_id', v_entry_id);
  end if;

  -- Needs sign-off: create (or reuse) a pending approval request.
  select a.id into v_approval_id
  from public.approvals a
  where a.company_id = v_company_id
    and a.type = 'order_reversal'
    and a.status = 'pending'
    and a.metadata ->> 'order_id' = p_order_id::text
  limit 1;

  if v_approval_id is null then
    v_approval_id := public.create_approval(
      v_company_id, 'order_reversal',
      jsonb_build_object('order_id', p_order_id, 'reason', p_reason)
    );
  end if;

  return jsonb_build_object('status', 'approval_required', 'approval_id', v_approval_id);
end;
$$;

revoke execute on function public.void_sale(uuid, text) from anon, public;
grant execute on function public.void_sale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- approve_request / deny_request (ManageApprovals-gated).
-- Approval executes the gated action where applicable.
-- ---------------------------------------------------------------------------
create or replace function public.approve_request(
  p_approval_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_approval record;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  select * into v_approval
  from public.approvals
  where id = p_approval_id and company_id = v_company_id and status = 'pending'
  for update;

  if v_approval is null then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  update public.approvals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id;

  -- Execute the gated action.
  if v_approval.type = 'order_reversal' then
    perform public.do_void(
      (v_approval.metadata ->> 'order_id')::uuid,
      coalesce(v_approval.metadata ->> 'reason', 'approved reversal')
    );
  end if;
  -- below_wholesale: approval simply unblocks complete_order (no action here).
  -- overdraft: recorded pre-approved; nothing to execute.

  return p_approval_id;
end;
$$;

create or replace function public.deny_request(
  p_approval_id uuid,
  p_reason text default null
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

  if not public.current_user_has_permission('ManageApprovals') then
    raise exception 'permission_denied: ManageApprovals required';
  end if;

  update public.approvals
  set status = 'denied', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_approval_id and company_id = v_company_id and status = 'pending';

  if not found then
    raise exception 'approval_not_found: %', p_approval_id;
  end if;

  return p_approval_id;
end;
$$;

revoke execute on function public.approve_request(uuid, text) from anon, public;
revoke execute on function public.deny_request(uuid, text) from anon, public;
grant execute on function public.approve_request(uuid, text) to authenticated;
grant execute on function public.deny_request(uuid, text) to authenticated;
