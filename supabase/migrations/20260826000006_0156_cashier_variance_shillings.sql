-- Cashier reconciliation amounts are already stored as integer shillings.
-- Remove the leftover cents conversion from closing-variance notifications.
create or replace function public.notify_large_cashier_variance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reconciliation record;
  v_threshold bigint;
  v_location_name text;
begin
  select r.company_id, r.location_id, r.scope, r.scope_ref_id
  into v_reconciliation
  from public.reconciliations r
  where r.id = new.reconciliation_id;

  if v_reconciliation.scope <> 'cash-session'
     or not v_reconciliation.scope_ref_id like '%:closing'
     or new.variance = 0 then
    return new;
  end if;

  select c.variance_notification_threshold into v_threshold
  from public.companies c where c.id = v_reconciliation.company_id;

  if abs(new.variance) < coalesce(v_threshold, 0) then
    return new;
  end if;

  select l.name into v_location_name
  from public.stock_locations l where l.id = v_reconciliation.location_id;

  perform public.notify(
    v_reconciliation.company_id,
    'system',
    'Till variance needs review',
    format(
      '%s at %s recorded a %s of %s.',
      new.account_code,
      coalesce(v_location_name, 'the business'),
      case when new.variance < 0 then 'shortage' else 'overage' end,
      public.cashier_kes(abs(new.variance))
    ),
    '/money/cashier'
  );

  return new;
end;
$$;

revoke execute on function public.notify_large_cashier_variance()
  from public, anon, authenticated;
grant execute on function public.notify_large_cashier_variance() to service_role;
