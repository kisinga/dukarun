-- Narrow till-count read model. Settlement users may inspect the current
-- book balance only for cashier-controlled accounts at an accessible location.
create function public.cashier_expected_balances(p_location_id uuid)
returns table (
  account_code varchar,
  expected_balance bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required';
  end if;

  v_location_id := public.resolve_business_location(p_location_id);

  return query
  select
    controlled.account_code,
    public.location_account_balance(v_company_id, v_location_id, controlled.account_code)
  from (
    select distinct coalesce(lpm.ledger_account_code, pm.ledger_account_code) as account_code
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id
     and lpm.company_id = pm.company_id
     and lpm.location_id = v_location_id
    where pm.company_id = v_company_id
      and pm.enabled
      and lpm.enabled
      and coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled)
  ) controlled
  order by controlled.account_code;
end;
$$;

revoke execute on function public.cashier_expected_balances(uuid) from public, anon;
grant execute on function public.cashier_expected_balances(uuid) to authenticated, service_role;
