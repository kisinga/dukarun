-- 0031_cashier_session_enforcement.sql
-- Cashier sessions are an accounting boundary, not just a UI state.
-- Drafts and credit purchases remain available while the till is closed;
-- completed sales and any operation that moves money require an open session.

create or replace function public.require_open_cashier_session(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = p_company_id
    and s.status = 'open'
  limit 1
  for key share;

  if v_session_id is null then
    raise exception 'cashier_session_required: open a session before recording this transaction';
  end if;

  return v_session_id;
end;
$$;

revoke execute on function public.require_open_cashier_session(uuid)
  from authenticated, anon, public;
grant execute on function public.require_open_cashier_session(uuid) to service_role;

create or replace function public.cashier_session_required_for_source(p_source_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_source_type = any (array[
    'Payment',
    'CreditSale',
    'PaymentAllocation',
    'Expense',
    'InterAccountTransfer',
    'SupplierPayment',
    'Refund',
    'PaymentReversal'
  ])
$$;

revoke execute on function public.cashier_session_required_for_source(text)
  from authenticated, anon, public;
grant execute on function public.cashier_session_required_for_source(text) to service_role;

-- AFTER INSERT preserves post_journal_entry's idempotent replay behaviour:
-- an already-posted entry is not a new financial action and needs no new session.
create or replace function public.enforce_journal_entry_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.cashier_session_required_for_source(new.source_type) then
    perform public.require_open_cashier_session(new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_entries_require_cashier_session on public.ledger_journal_entries;
create trigger ledger_entries_require_cashier_session
  after insert on public.ledger_journal_entries
  for each row execute function public.enforce_journal_entry_cashier_session();

-- Stamp governed journal lines with the session that was open while they were
-- posted. Paid purchases share InventoryPurchase with credit purchases, so the
-- isCreditPurchase line metadata is the authoritative discriminator.
create or replace function public.tag_journal_line_cashier_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text;
  v_session_id uuid;
  v_requires_session boolean;
begin
  select e.source_type into v_source_type
  from public.ledger_journal_entries e
  where e.id = new.entry_id
    and e.company_id = new.company_id;

  if v_source_type is null then
    raise exception 'journal_entry_not_found: %', new.entry_id;
  end if;

  v_requires_session := public.cashier_session_required_for_source(v_source_type)
    or (
      v_source_type = 'InventoryPurchase'
      and new.meta ? 'isCreditPurchase'
      and (new.meta ->> 'isCreditPurchase')::boolean is false
    );

  if v_requires_session then
    v_session_id := public.require_open_cashier_session(new.company_id);
    new.meta := coalesce(new.meta, '{}'::jsonb)
      || jsonb_build_object('openSessionId', v_session_id);

    -- The paid/credit discriminator arrives on the second purchase line.
    -- Backfill the earlier inventory line so the whole entry is attributable.
    if v_source_type = 'InventoryPurchase'
       and new.meta ? 'isCreditPurchase'
       and (new.meta ->> 'isCreditPurchase')::boolean is false then
      update public.ledger_journal_lines
      set meta = meta || jsonb_build_object('openSessionId', v_session_id)
      where entry_id = new.entry_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_lines_tag_cashier_session on public.ledger_journal_lines;
create trigger ledger_lines_tag_cashier_session
  before insert on public.ledger_journal_lines
  for each row execute function public.tag_journal_line_cashier_session();

-- A completed order must belong to the open session. The database supplies the
-- session id so callers cannot attach a sale to a closed or foreign session.
create or replace function public.tag_order_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.status = 'completed' and old.status <> 'completed' then
    v_session_id := public.require_open_cashier_session(new.company_id);

    if new.cashier_session_id is not null and new.cashier_session_id <> v_session_id then
      raise exception 'cashier_session_mismatch: completed order must use the open session';
    end if;

    new.cashier_session_id := v_session_id;
  end if;

  return new;
end;
$$;
