-- Keep migrated customer accounts tied to the balance explicitly preserved
-- during the document-backed account transition. Migration 0149 replaced
-- this function to use receivable_kind but inadvertently dropped the durable
-- legacy reconciliation component introduced by migration 0102.
create or replace function public.customer_document_balance(
  p_company_id uuid,
  p_customer_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((
      select sum(o.total-coalesce(paid.amount,0))
      from public.orders o
      left join lateral (
        select sum(p.amount)::bigint amount
        from public.payments p
        where p.order_id=o.id and p.status='settled'
      ) paid on true
      where o.company_id=p_company_id
        and o.customer_id=p_customer_id
        and o.receivable_kind in ('credit','cod')
        and o.status='completed'
    ),0)
    + coalesce((
      select sum(r.amount)
      from public.legacy_customer_account_reconciliations r
      where r.company_id=p_company_id and r.customer_id=p_customer_id
    ),0)
  )::bigint
$$;

comment on function public.customer_document_balance(uuid,uuid) is
  'Outstanding credit/COD documents plus the explicit migration-era account reconciliation; must remain equal to the customer AR control balance.';

revoke execute on function public.customer_document_balance(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.customer_document_balance(uuid,uuid) to service_role;
