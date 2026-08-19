-- Reduce work on the sale, cache-invalidation, and live-dashboard hot paths.
-- This migration deliberately reuses the existing transaction boundaries and
-- cache journal instead of introducing another queue or reporting subsystem.

-- ---------------------------------------------------------------------------
-- Orders retain totals already known by sale completion. Reporting no longer
-- has to reconstruct these values from journal and line tables.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists quantity_total numeric not null default 0,
  add column if not exists cogs_total bigint not null default 0;

alter table public.orders
  drop constraint if exists orders_quantity_total_nonnegative,
  add constraint orders_quantity_total_nonnegative check (quantity_total >= 0),
  drop constraint if exists orders_cogs_total_nonnegative,
  add constraint orders_cogs_total_nonnegative check (cogs_total >= 0);

with totals as materialized (
  select line.order_id, coalesce(sum(line.quantity), 0) as quantity_total
  from public.order_lines line
  group by line.order_id
)
update public.orders orders
set quantity_total = totals.quantity_total
from totals
where orders.id = totals.order_id
  and orders.quantity_total is distinct from totals.quantity_total;

with totals as materialized (
  select l.company_id, l.order_id, coalesce(sum(l.debit), 0)::bigint as cogs_total
  from public.ledger_journal_lines l
  join public.ledger_accounts a
    on a.id = l.account_id and a.company_id = l.company_id
  where l.order_id is not null and a.code = 'COGS'
  group by l.company_id, l.order_id
)
update public.orders orders
set cogs_total = totals.cogs_total
from totals
where orders.id = totals.order_id
  and orders.company_id = totals.company_id
  and orders.cogs_total is distinct from totals.cogs_total;

-- ---------------------------------------------------------------------------
-- Draft lines are validated and inserted as sets. The old function selected a
-- variant and inserted an order line once per JSON element.
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
  v_input_count integer;
  v_resolved_count integer;
  v_total bigint := 0;
  v_quantity_total numeric := 0;
  v_has_override boolean := false;
  v_invalid_fractional uuid;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_sale_lines';
  end if;
  -- Checkout work is deliberately bounded. A larger basket must become a
  -- second order; silently splitting one order would change its payment,
  -- receipt, stock and accounting meaning.
  if jsonb_array_length(p_lines) > 128 then
    raise exception 'sale_line_limit_exceeded: maximum 128 distinct lines per order';
  end if;

  perform public.assert_entitled(v_company_id, 'order');

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = v_company_id
  ) then
    raise exception 'invalid_customer: %', p_customer_id;
  end if;

  with input_lines as (
    select *
    from jsonb_to_recordset(p_lines) as line(
      variant_id uuid,
      quantity numeric,
      custom_price bigint,
      override_reason text
    )
  ), resolved as (
    select line.*, variant.id as resolved_id, variant.price,
      variant.wholesale_price, variant.allow_fractional
    from input_lines line
    left join public.product_variants variant
      on variant.id = line.variant_id and variant.company_id = v_company_id
  )
  select
    count(*)::integer,
    count(resolved_id)::integer,
    coalesce(bool_or(custom_price is not null and custom_price <> price), false),
    (min(variant_id::text) filter (
      where quantity <> trunc(quantity) and not coalesce(allow_fractional, false)
    ))::uuid
  into v_input_count, v_resolved_count, v_has_override, v_invalid_fractional
  from resolved;

  if v_resolved_count <> v_input_count then
    raise exception 'invalid_variant: line references a variant outside this company';
  end if;
  if v_invalid_fractional is not null then
    raise exception 'fractional_not_allowed: variant %', v_invalid_fractional;
  end if;
  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;
    if v_order_id is null then raise exception 'draft_not_found: %', p_draft_id; end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders(company_id, code, customer_id, status, created_by)
    values(
      v_company_id, 'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  insert into public.order_lines(
    order_id, company_id, variant_id, quantity, unit_price,
    custom_price, price_override_reason, line_total
  )
  select
    v_order_id, v_company_id, line.variant_id, line.quantity, variant.price,
    line.custom_price, line.override_reason,
    round(line.quantity * coalesce(line.custom_price, variant.price))
  from jsonb_to_recordset(p_lines) as line(
    variant_id uuid,
    quantity numeric,
    custom_price bigint,
    override_reason text
  )
  join public.product_variants variant
    on variant.id = line.variant_id and variant.company_id = v_company_id;

  select coalesce(sum(line_total), 0)::bigint, coalesce(sum(quantity), 0)
  into v_total, v_quantity_total
  from public.order_lines
  where order_id = v_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'variant_id', line.variant_id,
    'custom_price', line.custom_price,
    'reason', line.price_override_reason
  ) order by line.id), '[]'::jsonb)
  into v_below
  from public.order_lines line
  join public.product_variants variant
    on variant.id = line.variant_id and variant.company_id = line.company_id
  where line.order_id = v_order_id
    and line.custom_price is not null
    and variant.wholesale_price is not null
    and line.custom_price < variant.wholesale_price;

  update public.orders
  set total = v_total, quantity_total = v_quantity_total, updated_at = now()
  where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_draft(uuid,jsonb,uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Journal lines are resolved and inserted in one statement. FIFO inventory
-- remains procedural because its ordered row locking is a correctness rule.
-- ---------------------------------------------------------------------------
create or replace function public.post_journal_entry_with_context(
  p_company_id uuid,
  p_source_type text,
  p_source_id text,
  p_memo text,
  p_lines jsonb,
  p_context public.posting_context
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_entry_date date;
  v_payload_hash text;
  v_existing record;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_unknown_account text;
  v_line_count integer;
  v_account_count integer;
begin
  if (p_context).company_id is distinct from p_company_id
    or (p_context).occurred_at is null or (p_context).posting_date is null
    or (p_context).source is null then
    raise exception 'invalid_posting_context';
  end if;
  if not exists (
    select 1 from public.stock_locations location
    where location.id = (p_context).location_id and location.company_id = p_company_id
  ) then
    raise exception 'posting_context_location_mismatch';
  end if;

  select coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0)
  into v_debit_sum, v_credit_sum
  from jsonb_to_recordset(p_lines) as line(debit bigint, credit bigint);
  if v_debit_sum <> v_credit_sum or v_debit_sum = 0 then
    raise exception 'unbalanced_entry: debits % <> credits %', v_debit_sum, v_credit_sum;
  end if;

  select count(*)::integer, count(account.id)::integer,
    min(input.account_code) filter (where account.id is null)
  into v_line_count, v_account_count, v_unknown_account
  from jsonb_to_recordset(p_lines) as input(account_code text)
  left join public.ledger_accounts account
    on account.company_id = p_company_id
   and account.code = input.account_code
   and account.is_active
   and not account.is_parent;
  if v_account_count <> v_line_count then
    raise exception 'unknown_account: %', coalesce(v_unknown_account, '<missing>');
  end if;

  v_entry_date := (p_context).posting_date;
  v_payload_hash := public.journal_payload_hash(v_entry_date, p_memo, p_lines);
  perform pg_advisory_xact_lock(hashtextextended(
    'journal-source:' || p_company_id::text || ':' || p_source_type || ':' || p_source_id, 0
  ));

  select entry.* into v_existing
  from public.ledger_journal_entries entry
  where entry.company_id = p_company_id
    and entry.source_type = p_source_type
    and entry.source_id = p_source_id;
  if v_existing.id is not null then
    if v_existing.finalized_at is null then raise exception 'journal_unfinalized'; end if;
    if v_existing.payload_hash is distinct from v_payload_hash
      or v_existing.occurred_at is distinct from (p_context).occurred_at
      or v_existing.posting_source is distinct from (p_context).source
      or v_existing.posting_location_id is distinct from (p_context).location_id
      or v_existing.cashier_session_id is distinct from (p_context).cashier_session_id
      or v_existing.late_posting_reason is distinct from (p_context).late_reason then
      raise exception 'journal_idempotency_conflict: source %/% has different posting evidence',
        p_source_type, p_source_id;
    end if;
    return v_existing.id;
  end if;

  insert into public.ledger_journal_entries(
    company_id, entry_date, source_type, source_id, memo, payload_hash, finalized_at,
    occurred_at, posting_source, posting_location_id, cashier_session_id, late_posting_reason
  ) values(
    p_company_id, v_entry_date, p_source_type, p_source_id, p_memo, v_payload_hash, null,
    (p_context).occurred_at, (p_context).source, (p_context).location_id,
    (p_context).cashier_session_id, (p_context).late_reason
  )
  returning id into v_entry_id;

  insert into public.ledger_journal_lines(
    entry_id, company_id, account_id, order_id, debit, credit, meta
  )
  select
    v_entry_id, p_company_id, account.id, input.order_id,
    coalesce(input.debit, 0), coalesce(input.credit, 0), coalesce(input.meta, '{}'::jsonb)
  from jsonb_to_recordset(p_lines) as input(
    account_code text,
    debit bigint,
    credit bigint,
    order_id uuid,
    meta jsonb
  )
  join public.ledger_accounts account
    on account.company_id = p_company_id
   and account.code = input.account_code
   and account.is_active
   and not account.is_parent;

  update public.ledger_journal_entries
  set finalized_at = now()
  where id = v_entry_id and finalized_at is null;
  if not found then raise exception 'journal_finalize_failed: %', v_entry_id; end if;
  return v_entry_id;
end;
$$;

revoke execute on function public.post_journal_entry_with_context(
  uuid,text,text,text,jsonb,public.posting_context
) from public, anon, authenticated;
grant execute on function public.post_journal_entry_with_context(
  uuid,text,text,text,jsonb,public.posting_context
) to service_role;

-- ---------------------------------------------------------------------------
-- Cache batches reuse the current per-company stream sequence. Clients still
-- receive the old flat changes array because sync_cache_stream expands batches.
-- ---------------------------------------------------------------------------
alter table public.cache_change_log add column if not exists changes jsonb;

alter table public.cache_change_log
  drop constraint if exists cache_change_log_changes_array,
  add constraint cache_change_log_changes_array
  check (changes is null or jsonb_typeof(changes) = 'array');

create or replace function public.emit_cache_change(
  p_company_id uuid,
  p_stream text,
  p_entity_type text,
  p_entity_id text,
  p_operation text default 'upsert',
  p_location_id uuid default null,
  p_user_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_sequence bigint;
begin
  if current_setting('app.cache_change_suppressed', true) = 'on' then return null; end if;
  if p_stream not in ('catalog','parties','sales','settings','inbox','team') then
    raise exception 'invalid_cache_stream: %', p_stream;
  end if;
  if p_operation not in ('upsert','delete','reset') then
    raise exception 'invalid_cache_operation: %', p_operation;
  end if;
  if p_company_id is null or nullif(p_entity_type, '') is null
    or nullif(p_entity_id, '') is null then
    raise exception 'invalid_cache_change';
  end if;

  insert into public.cache_stream_heads(company_id, stream, head_sequence)
  values(p_company_id, p_stream, 1)
  on conflict(company_id, stream) do update
    set head_sequence = public.cache_stream_heads.head_sequence + 1,
        updated_at = now()
  returning head_sequence into v_sequence;

  insert into public.cache_change_log(
    company_id, stream, sequence, entity_type, entity_id, operation, location_id, user_id
  ) values(
    p_company_id, p_stream, v_sequence, p_entity_type, p_entity_id,
    p_operation, p_location_id, p_user_id
  );
  return v_sequence;
end;
$$;

create or replace function public.emit_cache_batch(
  p_company_id uuid,
  p_stream text,
  p_changes jsonb,
  p_user_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_count integer;
begin
  if p_stream not in ('catalog','parties','sales','settings','inbox','team') then
    raise exception 'invalid_cache_stream: %', p_stream;
  end if;
  if p_company_id is null or p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'invalid_cache_batch';
  end if;
  v_count := jsonb_array_length(p_changes);
  if v_count < 1 or v_count > 512 then raise exception 'invalid_cache_batch_size'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_changes) change
    where nullif(change ->> 'entityType', '') is null
      or nullif(change ->> 'entityId', '') is null
      or coalesce(change ->> 'operation', 'upsert') not in ('upsert','delete','reset')
  ) then
    raise exception 'invalid_cache_batch_change';
  end if;

  insert into public.cache_stream_heads(company_id, stream, head_sequence)
  values(p_company_id, p_stream, 1)
  on conflict(company_id, stream) do update
    set head_sequence = public.cache_stream_heads.head_sequence + 1,
        updated_at = now()
  returning head_sequence into v_sequence;

  insert into public.cache_change_log(
    company_id, stream, sequence, entity_type, entity_id, operation, user_id, changes
  ) values(
    p_company_id, p_stream, v_sequence, 'batch', '*', 'upsert', p_user_id, p_changes
  );
  return v_sequence;
end;
$$;

revoke execute on function public.emit_cache_change(uuid,text,text,text,text,uuid,uuid)
  from public, anon, authenticated;
revoke execute on function public.emit_cache_batch(uuid,text,jsonb,uuid)
  from public, anon, authenticated;

create or replace function public.sync_cache_stream(
  p_stream text,
  p_after_sequence bigint default 0,
  p_limit integer default 512
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid := auth.uid();
  v_head bigint := 0;
  v_floor bigint := 0;
  v_changes jsonb := '[]'::jsonb;
  v_next bigint := p_after_sequence;
  v_has_more boolean := false;
begin
  if v_company_id is null or v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_stream not in ('catalog','parties','sales','settings','inbox','team') then
    raise exception 'invalid_cache_stream: %', p_stream;
  end if;
  if p_after_sequence < 0 then raise exception 'invalid_cache_sequence'; end if;
  if p_limit < 1 or p_limit > 512 then raise exception 'invalid_cache_page_size'; end if;

  select head_sequence, pruned_through_sequence into v_head, v_floor
  from public.cache_stream_heads
  where company_id = v_company_id and stream = p_stream;
  if not found then
    return jsonb_build_object(
      'stream', p_stream, 'headSequence', 0, 'prunedThroughSequence', 0,
      'resetRequired', false, 'nextSequence', 0, 'hasMore', false,
      'changes', '[]'::jsonb
    );
  end if;

  -- Cache correctness is based only on sequence continuity. Change volume is
  -- never a reason to rebuild a cache. If the client's cursor is at or above
  -- the retention floor, replay every later visible change in bounded pages.
  -- A hard refresh is required only when p_after_sequence is below v_floor
  -- or above v_head (or when an explicit reset change is replayed).
  if p_after_sequence between v_floor and v_head then
    with candidate_rows as materialized (
      select
        log.*,
        coalesce(jsonb_array_length(log.changes), 1) as logical_count,
        row_number() over (order by log.sequence) as row_number
      from public.cache_change_log log
      where log.company_id = v_company_id
        and log.stream = p_stream
        and log.sequence > p_after_sequence
        and (log.user_id is null or log.user_id = v_user_id)
      order by log.sequence
      -- Every row contains at least one logical change, so p_limit + 1 rows
      -- are sufficient to fill one logical page and detect another page.
      limit p_limit + 1
    ), sized_rows as (
      select candidate.*,
        sum(candidate.logical_count) over (order by candidate.sequence) as running_count
      from candidate_rows candidate
    ), journal_rows as materialized (
      select sized.*
      from sized_rows sized
      where sized.running_count <= p_limit or sized.row_number = 1
      order by sized.sequence
    ), expanded as (
      select
        row.sequence,
        coalesce(change.value ->> 'entityType', row.entity_type) as entity_type,
        coalesce(change.value ->> 'entityId', row.entity_id) as entity_id,
        coalesce(change.value ->> 'operation', row.operation) as operation,
        coalesce(nullif(change.value ->> 'locationId', '')::uuid, row.location_id) as location_id,
        coalesce(nullif(change.value ->> 'userId', '')::uuid, row.user_id) as user_id,
        row.changed_at,
        change.ordinality
      from journal_rows row
      left join lateral jsonb_array_elements(coalesce(row.changes, jsonb_build_array(
        jsonb_build_object(
          'entityType', row.entity_type,
          'entityId', row.entity_id,
          'operation', row.operation,
          'locationId', row.location_id,
          'userId', row.user_id
        )
      ))) with ordinality change(value, ordinality) on true
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'sequence', sequence,
        'entityType', entity_type,
        'entityId', entity_id,
        'operation', operation,
        'locationId', location_id,
        'userId', user_id,
        'changedAt', changed_at
      ) order by sequence, ordinality), '[]'::jsonb),
      coalesce(max(sequence), p_after_sequence),
      exists (
        select 1
        from sized_rows pending
        where pending.sequence > coalesce((select max(selected.sequence) from journal_rows selected), p_after_sequence)
      )
    into v_changes, v_next, v_has_more
    from expanded;
  end if;

  return jsonb_build_object(
    'stream', p_stream,
    'headSequence', v_head,
    'prunedThroughSequence', v_floor,
    'resetRequired', p_after_sequence not between v_floor and v_head,
    'nextSequence', case
      when p_after_sequence < v_floor or p_after_sequence > v_head then v_head
      -- No later visible row remains. Advance across any user-filtered
      -- sequences to the stream head without forcing an unnecessary rebuild.
      when not v_has_more then v_head
      else v_next
    end,
    'hasMore', p_after_sequence between v_floor and v_head and v_has_more,
    'changes', v_changes
  );
end;
$$;

revoke execute on function public.sync_cache_stream(text,bigint,integer) from public, anon;
grant execute on function public.sync_cache_stream(text,bigint,integer) to authenticated;

create or replace function public.prune_cache_change_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer := 0;
begin
  with cutoffs as (
    select company_id, stream, greatest(head_sequence - 512, 0) as cutoff
    from public.cache_stream_heads
    where head_sequence > 512
  ), deleted as (
    delete from public.cache_change_log log
    using cutoffs cutoff
    where log.company_id = cutoff.company_id
      and log.stream = cutoff.stream
      and log.sequence <= cutoff.cutoff
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;

  update public.cache_stream_heads head
  set pruned_through_sequence = greatest(
        head.pruned_through_sequence,
        greatest(head.head_sequence - 512, 0)
      ),
      updated_at = now()
  where head.head_sequence > 512;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_cache_change_log() from public, anon, authenticated;
grant execute on function public.prune_cache_change_log() to service_role;

select cron.schedule(
  'prune-cache-change-log',
  '17 * * * *',
  $$select public.prune_cache_change_log()$$
);

-- Emit one durable batch per affected stream after a completed/parked sale.
create or replace function public.emit_sale_cache_batches(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_catalog_changes jsonb;
begin
  select order_row.company_id, order_row.customer_id, order_row.location_id
  into v_order
  from public.orders order_row
  where order_row.id = p_order_id;
  if v_order.company_id is null then raise exception 'order_not_found: %', p_order_id; end if;

  perform public.emit_cache_batch(v_order.company_id, 'sales', jsonb_build_array(
    jsonb_build_object(
      'entityType', 'order', 'entityId', p_order_id, 'operation', 'upsert',
      'locationId', v_order.location_id
    )
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'entityType', 'stock', 'entityId', changed.variant_id,
    'operation', 'upsert', 'locationId', v_order.location_id
  ) order by changed.variant_id), '[]'::jsonb)
  into v_catalog_changes
  from (
    select distinct line.variant_id
    from public.order_lines line
    join public.product_variants variant on variant.id = line.variant_id
    where line.order_id = p_order_id and variant.track_inventory
  ) changed;
  if jsonb_array_length(v_catalog_changes) > 0 then
    perform public.emit_cache_batch(v_order.company_id, 'catalog', v_catalog_changes);
  end if;

  if v_order.customer_id is not null then
    perform public.emit_cache_batch(v_order.company_id, 'parties', jsonb_build_array(
      jsonb_build_object(
        'entityType', 'customer', 'entityId', v_order.customer_id,
        'operation', 'upsert'
      )
    ));
  end if;
end;
$$;

revoke execute on function public.emit_sale_cache_batches(uuid)
  from public, anon, authenticated;
grant execute on function public.emit_sale_cache_batches(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Complete a sale with set-based payments, indexed customer balance lookup,
-- and persisted totals. Cache triggers may be suppressed by the wrapper.
-- ---------------------------------------------------------------------------
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
    if v_line.track_inventory then
      v_fifo := public.consume_fifo(
        v_order.company_id, v_line.variant_id, v_line.quantity,
        'Sale', p_order_id::text
      );
      v_total_cogs := v_total_cogs + (v_fifo ->> 'total_cogs')::bigint;
      v_all_allocations := v_all_allocations || (v_fifo -> 'allocations');
    end if;
  end loop;

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
  v_context public.posting_context;
  v_result uuid;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if p_actor is distinct from auth.uid() then raise exception 'posting_actor_mismatch'; end if;
  perform set_config('app.cache_change_suppressed', 'on', true);
  v_context := public.order_posting_context(p_order_id, 'interactive');
  v_result := public.complete_order_core(p_order_id, p_payments, v_context);
  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  perform public.emit_sale_cache_batches(v_result);
  return v_result;
end;
$$;

-- post_sale suppresses draft/line events; complete_order emits one batch for
-- completed sales. Parked orders emit one sales batch here. Drop the obsolete
-- five-argument overload if this migration is reapplied during development.
drop function if exists public.post_sale(uuid,jsonb,jsonb,boolean,text);

create or replace function public.post_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_park boolean default false,
  p_client_ref text default null,
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
  v_existing uuid;
  v_location_id uuid;
  v_previous_cache_suppression text := current_setting('app.cache_change_suppressed', true);
begin
  if p_client_ref is not null then
    select id into v_existing
    from public.orders
    where company_id = v_company_id and client_ref = p_client_ref;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_draft_id is not null and not exists (
    select 1
    from public.orders order_row
    where order_row.id = p_draft_id
      and order_row.company_id = v_company_id
      and order_row.status = 'draft'
  ) then
    raise exception 'draft_not_found: %', p_draft_id;
  end if;

  perform set_config('app.cache_change_suppressed', 'on', true);
  v_order_id := public.save_draft(p_customer_id, p_lines);

  if p_client_ref is not null then
    begin
      update public.orders set client_ref = p_client_ref where id = v_order_id;
    exception when unique_violation then
      delete from public.orders where id = v_order_id;
      select id into v_existing
      from public.orders
      where company_id = v_company_id and client_ref = p_client_ref;
      perform set_config(
        'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
      );
      return v_existing;
    end;
  end if;

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
    where id = v_order_id
    returning location_id into v_location_id;
    perform set_config(
      'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
    );
    perform public.emit_cache_batch(v_company_id, 'sales', jsonb_build_array(
      jsonb_build_object(
        'entityType', 'order', 'entityId', v_order_id, 'operation', 'upsert',
        'locationId', v_location_id
      )
    ));
    return v_order_id;
  end if;

  perform set_config(
    'app.cache_change_suppressed', coalesce(v_previous_cache_suppression, 'off'), true
  );
  return public.complete_order(v_order_id, p_payments, auth.uid());
end;
$$;

revoke execute on function public.post_sale(uuid,jsonb,jsonb,boolean,text,uuid)
  from public, anon;
grant execute on function public.post_sale(uuid,jsonb,jsonb,boolean,text,uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Live dashboard reads bounded, indexed completed-order ranges and stored
-- order totals instead of rebuilding COGS from ledger rows on every refresh.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := p_location_id;
  v_timezone text;
  v_today date;
  v_since date;
  v_days integer;
  v_previous_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if v_location_id is not null and not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied';
  end if;

  select company.business_timezone into v_timezone
  from public.companies company where company.id = v_company_id;
  v_today := (now() at time zone v_timezone)::date;
  v_since := coalesce(p_since, v_today - 6);
  if v_since < v_today - 6 or v_since > v_today then
    raise exception 'invalid_dashboard_range: dashboard supports at most 7 days';
  end if;
  v_days := greatest((v_today - v_since) + 1, 1);
  v_previous_start := ((v_since - v_days)::timestamp at time zone v_timezone);
  v_end := ((v_today + 1)::timestamp at time zone v_timezone);

  with accessible as (
    select id from public.accessible_business_locations()
  ), scoped_orders as (
    select
      orders.id,
      orders.company_id,
      orders.location_id,
      orders.total,
      orders.cogs_total,
      orders.quantity_total,
      (orders.completed_at at time zone v_timezone)::date as day
    from public.orders orders
    where orders.company_id = v_company_id
      and orders.status = 'completed'
      and orders.completed_at >= v_previous_start
      and orders.completed_at < v_end
      and orders.location_id in (select id from accessible)
      and (v_location_id is null or orders.location_id = v_location_id)
  ), current_orders as (
    select * from scoped_orders where day >= v_since
  ), summary as (
    select day, count(*)::integer as orders,
      coalesce(sum(total), 0)::bigint as revenue,
      coalesce(sum(cogs_total), 0)::bigint as cogs,
      (coalesce(sum(total), 0) - coalesce(sum(cogs_total), 0))::bigint as margin
    from current_orders
    group by day
  ), product_sales as (
    select orders.day, line.variant_id,
      coalesce(sum(line.quantity), 0) as quantity,
      coalesce(sum(line.line_total), 0)::bigint as revenue,
      coalesce(sum(round(
        orders.cogs_total * line.line_total::numeric / nullif(orders.total, 0)
      )), 0)::bigint as cogs
    from current_orders orders
    join public.order_lines line on line.order_id = orders.id
    group by orders.day, line.variant_id
  ), locations as (
    select location.id as location_id, location.name as location_name,
      count(orders.id)::integer as orders,
      coalesce(sum(orders.total), 0)::bigint as revenue,
      coalesce(sum(orders.quantity_total), 0) as quantity,
      coalesce(sum(orders.cogs_total), 0)::bigint as cogs,
      (coalesce(sum(orders.total), 0) - coalesce(sum(orders.cogs_total), 0))::bigint as margin
    from public.stock_locations location
    join accessible on accessible.id = location.id
    left join current_orders orders on orders.location_id = location.id
    where location.company_id = v_company_id and location.is_active
    group by location.id, location.name
  ), comparison as (
    select
      coalesce(sum(total) filter (where day >= v_since), 0)::bigint as current_revenue,
      coalesce(sum(quantity_total) filter (where day >= v_since), 0) as current_quantity,
      count(*) filter (where day >= v_since)::integer as current_orders,
      coalesce(sum(total) filter (where day < v_since), 0)::bigint as previous_revenue,
      coalesce(sum(quantity_total) filter (where day < v_since), 0) as previous_quantity,
      count(*) filter (where day < v_since)::integer as previous_orders
    from scoped_orders
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(row) order by row.day) from summary row), '[]'::jsonb),
    'productSales', coalesce((select jsonb_agg(to_jsonb(row) order by row.day, row.variant_id) from product_sales row), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(row) order by row.revenue desc, row.location_name) from locations row), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(row) from comparison row), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date,uuid) from public, anon;
grant execute on function public.dashboard_location_snapshot(date,uuid) to authenticated;
