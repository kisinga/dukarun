-- Bounded purchase and inventory reads for linked product history and supplier context.

create index if not exists inventory_batches_supplier_location_variant_available_idx
  on public.inventory_batches(company_id, supplier_id, stock_location_id, variant_id)
  where remaining > 0 and supplier_id is not null;

create or replace function public.supplier_stock_by_variant(
  p_supplier_id uuid,
  p_location_id uuid default null
)
returns table(variant_id uuid, stock numeric, stock_value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
  v_can_view_financials boolean := public.current_user_has_permission('ViewFinancials');
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1
    from public.customers supplier
    where supplier.id = p_supplier_id
      and supplier.company_id = v_company_id
      and supplier.is_supplier
  ) then
    raise exception 'supplier_not_found';
  end if;

  v_location_id := public.resolve_business_location(p_location_id);

  return query
  select
    batch.variant_id,
    sum(batch.remaining)::numeric as stock,
    case
      when v_can_view_financials then sum(batch.remaining_cost)::bigint
      else null::bigint
    end as stock_value
  from public.inventory_batches batch
  where batch.company_id = v_company_id
    and batch.supplier_id = p_supplier_id
    and batch.stock_location_id = v_location_id
    and batch.remaining > 0
  group by batch.variant_id
  order by batch.variant_id;
end;
$$;

revoke execute on function public.supplier_stock_by_variant(uuid, uuid) from public, anon;
grant execute on function public.supplier_stock_by_variant(uuid, uuid) to authenticated, service_role;

-- Keep reversed purchases available to direct history links. Operational lists
-- and supplier summaries continue to opt into posted purchases explicitly.
drop view public.purchase_history cascade;
create view public.purchase_history with (security_invoker = true) as
select
  p.*,
  coalesce(x.expense_total, 0)::bigint as expense_total,
  coalesce(x.separate_expense_total, 0)::bigint as separate_expense_total,
  (p.total_cost + coalesce(x.separate_expense_total, 0))::bigint as all_in_total,
  case
    when p.purchase_posting_version = 'ap_invoice_v2' then coalesce(sum(pp.amount), 0)::bigint
    when not p.is_credit then p.total_cost
    else coalesce(sum(pp.amount), 0)::bigint
  end as paid,
  case
    when (p.purchase_posting_version <> 'ap_invoice_v2' and not p.is_credit)
      or coalesce(sum(pp.amount), 0) >= p.total_cost then 'paid'
    when coalesce(sum(pp.amount), 0) > 0 then 'part_paid'
    else 'unpaid'
  end::text as payment_status
from public.purchases p
left join public.purchase_payments pp
  on pp.purchase_id = p.id and pp.status = 'settled'
left join lateral (
  select
    coalesce(sum(pe.amount), 0) as expense_total,
    coalesce(sum(pe.amount) filter (where pe.settlement = 'separate'), 0)
      as separate_expense_total
  from public.purchase_expenses pe
  where pe.purchase_id = p.id
) x on true
group by p.id, x.expense_total, x.separate_expense_total;

grant select on public.purchase_history to authenticated;

create view public.supplier_purchase_metrics with (security_invoker = true) as
select
  company_id,
  supplier_id,
  count(*)::bigint as purchase_count,
  coalesce(avg(total_cost), 0)::bigint as average_order,
  count(*) filter (where payment_status <> 'paid')::bigint as open_purchase_count,
  coalesce(sum(greatest(total_cost - paid, 0)), 0)::bigint as outstanding
from public.purchase_history
where status = 'posted'
group by company_id, supplier_id;

grant select on public.supplier_purchase_metrics to authenticated;

create or replace view public.supplier_variant_performance
with (security_invoker = true) as
select
  pl.company_id,
  p.supplier_id,
  pl.variant_id,
  count(distinct pl.purchase_id)::bigint as purchase_count,
  sum(pl.quantity)::numeric as total_quantity,
  sum(pl.line_total)::bigint as total_spend,
  round(sum(pl.line_total)::numeric / nullif(sum(pl.quantity), 0))::bigint
    as average_unit_cost,
  min(pl.unit_cost)::bigint as lowest_unit_cost,
  max(pl.unit_cost)::bigint as highest_unit_cost,
  (array_agg(pl.unit_cost order by p.purchase_date desc, p.created_at desc, pl.created_at desc))[1]::bigint
    as last_unit_cost,
  max(p.purchase_date) as last_purchase_date
from public.purchase_lines pl
join public.purchases p on p.id = pl.purchase_id and p.company_id = pl.company_id
where p.status = 'posted'
group by pl.company_id, p.supplier_id, pl.variant_id;

grant select on public.supplier_variant_performance to authenticated;
