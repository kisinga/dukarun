-- Backward-compatible typed entry point for supplier-wide FIFO payments.
-- Keep post_supplier_payment unchanged because the currently deployed web app
-- calls it with p_purchase_id = null. New clients use this wrapper and never
-- need to represent a nullable PostgreSQL RPC argument in generated types.

create or replace function public.post_supplier_fifo_payment(
  p_supplier_id uuid,
  p_amount bigint,
  p_account_code text,
  p_client_ref text
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select public.post_supplier_payment(
    p_supplier_id,
    null,
    p_amount,
    p_account_code,
    p_client_ref
  )
$$;

revoke execute on function public.post_supplier_fifo_payment(uuid,bigint,text,text)
  from public,anon;
grant execute on function public.post_supplier_fifo_payment(uuid,bigint,text,text)
  to authenticated,service_role;
