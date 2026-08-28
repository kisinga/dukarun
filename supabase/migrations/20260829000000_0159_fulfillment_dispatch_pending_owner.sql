-- COD orders can wait in the cashier-owned pending state until fulfillment
-- dispatch creates the receivable. Permit that completion source only after
-- the order has been explicitly classified as COD.

create or replace function public.normalize_order_pending_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.status = 'pending_payment'
    and new.status = 'completed' then
    if old.pending_owner = 'cashier'
      and new.posting_source is distinct from 'interactive'
      and not (
        old.receivable_kind = 'cod'
        and new.posting_source = 'fulfillment_dispatch'
      ) then
      raise exception 'invalid_order_completion_owner: cashier';
    elsif old.pending_owner = 'approval'
      and new.posting_source is distinct from 'approval'
      and coalesce(current_setting('app.external_payment_hold', true), '') <> 'on' then
      raise exception 'invalid_order_completion_owner: approval';
    elsif old.pending_owner = 'payment_provider'
      and coalesce(new.posting_source, '') not in ('mpesa_provider', 'mpesa_reconciliation') then
      raise exception 'invalid_order_completion_owner: payment_provider';
    end if;
  end if;

  if new.status <> 'pending_payment' then
    new.pending_owner := null;
    new.cashier_pending_at := null;
  elsif new.pending_owner is null then
    raise exception 'pending_owner_required';
  elsif new.pending_owner = 'cashier' then
    new.cashier_pending_at := coalesce(new.cashier_pending_at, now());
  else
    new.cashier_pending_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.normalize_order_pending_owner()
  from public, anon, authenticated;
grant execute on function public.normalize_order_pending_owner() to service_role;
