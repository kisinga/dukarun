-- Authoritative, RLS-preserving read models for paginated operational history.

create or replace view public.purchase_history
with (security_invoker = true) as
select
  p.*,
  case
    -- Paid-now purchases post directly to the asset account and intentionally
    -- have no purchase_payments row; their full cost is already settled.
    when not p.is_credit then p.total_cost
    else coalesce(sum(pp.amount), 0)::bigint
  end as paid,
  case
    when not p.is_credit or coalesce(sum(pp.amount), 0) >= p.total_cost then 'paid'
    when coalesce(sum(pp.amount), 0) > 0 then 'part_paid'
    else 'unpaid'
  end::text as payment_status
from public.purchases p
left join public.purchase_payments pp on pp.purchase_id = p.id
group by p.id;

create or replace view public.supplier_purchase_metrics
with (security_invoker = true) as
select
  company_id,
  supplier_id,
  count(*)::bigint as purchase_count,
  coalesce(avg(total_cost), 0)::bigint as average_order,
  count(*) filter (where payment_status <> 'paid')::bigint as open_purchase_count,
  coalesce(sum(greatest(total_cost - paid, 0)), 0)::bigint as outstanding
from public.purchase_history
group by company_id, supplier_id;

create or replace view public.low_stock_variants_by_location
with (security_invoker = true) as
select
  v.company_id,
  l.id as location_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(s.stock, 0) as stock,
  c.low_stock_threshold
from public.product_variants v
join public.products p on p.id = v.product_id
join public.companies c on c.id = v.company_id
join public.stock_locations l on l.company_id = v.company_id and l.is_active
left join (
  select variant_id, stock_location_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id, stock_location_id
) s on s.variant_id = v.id and s.stock_location_id = l.id
where v.track_inventory and v.active and p.active
  and coalesce(s.stock, 0) <= c.low_stock_threshold;

grant select on public.purchase_history to authenticated;
grant select on public.supplier_purchase_metrics to authenticated;
grant select on public.low_stock_variants_by_location to authenticated;

create index if not exists purchases_location_date_idx
  on public.purchases(stock_location_id, purchase_date desc, id);
create index if not exists purchases_supplier_date_idx
  on public.purchases(supplier_id, purchase_date desc, id);
create index if not exists outbox_company_created_idx
  on public.outbox(company_id, created_at desc, id);
create index if not exists stock_transfers_company_created_idx
  on public.stock_transfers(company_id, created_at desc, id);
