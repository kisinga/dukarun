-- 0015_audit_log.sql
-- Integral audit trail: a generic trigger captures every INSERT/UPDATE/DELETE
-- on mutable business tables, regardless of write path (RPC, edge function,
-- ETL, manual SQL). Actor comes from the JWT claims (works inside security
-- definer RPCs).
--
-- Deliberately NOT audited: ledger_journal_entries/lines (immutable — they
-- ARE the audit), inventory_movements (already an audit trail),
-- inventory_batches (covered by movements), audit_log itself.

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id text,
  actor uuid,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index audit_log_company_time_idx on public.audit_log (company_id, changed_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;

create policy "audit log readable by members"
  on public.audit_log for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

-- No write grants for anyone: rows come only from the trigger function.
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

-- ---------------------------------------------------------------------------
-- Generic audit trigger function.
-- ---------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_company_id uuid;
  v_row_id text;
begin
  v_old := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) end;
  v_new := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) end;

  v_company_id := coalesce(
    nullif(coalesce(v_new, v_old) ->> 'company_id', '')::uuid,
    null
  );
  v_row_id := coalesce(v_new, v_old) ->> 'id';

  insert into public.audit_log (company_id, table_name, operation, row_id, actor, old_data, new_data)
  values (v_company_id, TG_TABLE_NAME, TG_OP, v_row_id, auth.uid(), v_old, v_new);

  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.audit_trigger() from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Attach to mutable business tables.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'roles', 'company_memberships', 'payment_methods', 'stock_locations',
    'customers', 'products', 'orders', 'order_lines', 'payments', 'refunds',
    'purchases', 'purchase_payments', 'cashier_sessions', 'cash_drawer_counts',
    'reconciliations', 'accounting_periods', 'subscription_tiers', 'platform_admins'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end $$;
