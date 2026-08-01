-- 0018_analytics.sql
-- Analytics: 4 materialized views (recreated over the new flat schema),
-- hourly refresh via pg_cron, plus low-stock and expiring-batch views for
-- the dashboard. Old system: 4 MVs refreshed hourly by a worker task.

create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- mv_daily_sales_summary: per company/day — orders, revenue, COGS, margin.
-- Revenue from completed orders (gross, as posted); COGS from COGS journal
-- lines tagged with the order.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_sales_summary as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(c.cogs), 0)::bigint as cogs,
  (coalesce(sum(o.total), 0) - coalesce(sum(c.cogs), 0))::bigint as margin
from public.orders o
left join lateral (
  select sum(l.debit) as cogs
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'COGS' and l.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date;

create unique index mv_daily_sales_summary_idx on public.mv_daily_sales_summary (company_id, day);

-- ---------------------------------------------------------------------------
-- mv_daily_product_sales: per company/day/variant — qty, revenue, COGS share.
-- COGS allocated per line proportionally to the order's line totals.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_product_sales as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  l.variant_id,
  coalesce(sum(l.quantity), 0) as quantity,
  coalesce(sum(l.line_total), 0)::bigint as revenue,
  coalesce(sum(round(c.cogs * l.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
from public.orders o
join public.order_lines l on l.order_id = o.id
left join lateral (
  select sum(jl.debit) as cogs
  from public.ledger_journal_lines jl
  join public.ledger_accounts a on a.id = jl.account_id
  where a.code = 'COGS' and jl.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, l.variant_id;

create unique index mv_daily_product_sales_idx
  on public.mv_daily_product_sales (company_id, day, variant_id);

-- ---------------------------------------------------------------------------
-- mv_daily_customer_stats: per company/day/customer — orders, spend, AR delta.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_customer_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.customer_id,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(ar.delta), 0)::bigint as ar_delta
from public.orders o
left join lateral (
  select sum(l.debit) - sum(l.credit) as delta
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id = o.id
) ar on true
where o.status = 'completed' and o.customer_id is not null
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.customer_id;

create unique index mv_daily_customer_stats_idx
  on public.mv_daily_customer_stats (company_id, day, customer_id);

-- ---------------------------------------------------------------------------
-- mv_daily_order_stats: per company/day — by status and payment method.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_order_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.status,
  p.method_code,
  count(distinct o.id)::int as orders,
  coalesce(sum(o.total), 0)::bigint as total,
  coalesce(sum(p.amount), 0)::bigint as method_total
from public.orders o
left join public.payments p on p.order_id = o.id and p.status = 'settled'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.status, p.method_code;

create unique index mv_daily_order_stats_idx
  on public.mv_daily_order_stats (company_id, day, status, method_code);

-- ---------------------------------------------------------------------------
-- Tenant isolation: MVs cannot have RLS, so clients never read them directly.
-- These security_invoker views filter by the JWT company claim (platform
-- admins see everything) and are the only granted read surface.
-- ---------------------------------------------------------------------------
create view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_customer_stats as
select * from public.mv_daily_customer_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_order_stats as
select * from public.mv_daily_order_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

grant select on public.rpt_daily_sales_summary to authenticated;
grant select on public.rpt_daily_product_sales to authenticated;
grant select on public.rpt_daily_customer_stats to authenticated;
grant select on public.rpt_daily_order_stats to authenticated;
revoke all on public.mv_daily_sales_summary from authenticated, anon;
revoke all on public.mv_daily_product_sales from authenticated, anon;
revoke all on public.mv_daily_customer_stats from authenticated, anon;
revoke all on public.mv_daily_order_stats from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dashboard helpers: low stock + expiring batches (plain views, always fresh).
-- ---------------------------------------------------------------------------
create view public.low_stock_variants
with (security_invoker = true) as
select
  v.company_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(s.stock, 0) as stock,
  c.low_stock_threshold
from public.product_variants v
join public.products p on p.id = v.product_id
join public.companies c on c.id = v.company_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id
where v.track_inventory and v.active and p.active
  and coalesce(s.stock, 0) <= c.low_stock_threshold;

create view public.expiring_batches
with (security_invoker = true) as
select
  b.company_id,
  b.id as batch_id,
  b.variant_id,
  p.name as product_name,
  v.name as variant_name,
  b.remaining,
  b.expiry_date
from public.inventory_batches b
join public.product_variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.companies c on c.id = b.company_id
where b.remaining > 0
  and b.expiry_date is not null
  and b.expiry_date <= (now() at time zone 'Africa/Nairobi')::date + 30
  and c.batch_expiry_enabled
order by b.expiry_date asc;

grant select on public.low_stock_variants to authenticated;
grant select on public.expiring_batches to authenticated;

-- ---------------------------------------------------------------------------
-- Refresh function + hourly cron (was a worker task in the old stack).
-- ---------------------------------------------------------------------------
create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_daily_sales_summary;
  refresh materialized view concurrently public.mv_daily_product_sales;
  refresh materialized view concurrently public.mv_daily_customer_stats;
  refresh materialized view concurrently public.mv_daily_order_stats;
end;
$$;

revoke execute on function public.refresh_analytics() from authenticated, anon, public;
grant execute on function public.refresh_analytics() to service_role;

select cron.schedule(
  'refresh-analytics',
  '7 * * * *',
  $$select public.refresh_analytics()$$
);
