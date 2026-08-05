-- Payment method type, explicit: expose reconciliation_type from
-- public.payment_methods through available_payment_methods so clients stop
-- string-sniffing codes (cash → blind_count, mpesa → transaction_verification,
-- bank → statement_match, credit → credit_ledger).
--
-- Based verbatim on the latest definition (20260723005000_0006_platform.sql);
-- the only change is the added reconciliation_type column. The function is
-- dropped first because CREATE OR REPLACE cannot change a function's return
-- type; callers reference it in plpgsql bodies, so a plain drop is safe.

drop function if exists public.available_payment_methods(uuid);

create function public.available_payment_methods(p_location_id uuid default null)
returns table (
  code text,
  name text,
  ledger_account_code varchar,
  is_cashier_controlled boolean,
  requires_reconciliation boolean,
  reconciliation_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select
    pm.code,
    pm.name,
    coalesce(lpm.ledger_account_code, pm.ledger_account_code),
    coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled),
    coalesce(lpm.requires_reconciliation, pm.requires_reconciliation),
    pm.reconciliation_type
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
  where pm.company_id = v_company_id and pm.enabled and lpm.enabled
  order by pm.name;
end;
$$;

revoke execute on function public.available_payment_methods(uuid) from anon, public;
grant execute on function public.available_payment_methods(uuid) to authenticated, service_role;
