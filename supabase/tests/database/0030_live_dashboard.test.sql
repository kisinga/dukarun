-- Live dashboard snapshot: completed sales are visible immediately, without
-- waiting for refresh_analytics / the hourly materialized-view cron.
begin;
select plan(5);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'live@dashboard.local');
create temp table live_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Live Dashboard Co') as company_id;
grant select on pg_temp.live_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000a1', company_id, 'Rice' from live_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select
  'aa000000-0000-0000-0000-0000000000a1',
  'a0000000-0000-0000-0000-0000000000a1',
  company_id,
  '1kg',
  'RICE1',
  20000
from live_company;
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'aa000000-0000-0000-0000-0000000000a1', 10, 10, 12000 from live_company;

select testkit.as_user(
  (select company_id from live_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);
select testkit.ensure_open_session();

select is(
  jsonb_array_length(public.dashboard_sales_snapshot() -> 'summary'),
  0,
  'snapshot starts empty'
);

select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000a1","quantity":2,"unit_price":20000}]',
  '[{"method":"cash","amount":40000}]'
);

-- Deliberately do not call refresh_analytics().
select is(
  (public.dashboard_sales_snapshot() -> 'summary' -> 0 ->> 'revenue')::bigint,
  40000::bigint,
  'new sale revenue is immediately visible'
);

select is(
  (public.dashboard_sales_snapshot() -> 'summary' -> 0 ->> 'cogs')::bigint,
  24000::bigint,
  'live snapshot includes FIFO COGS'
);

select is(
  (public.dashboard_sales_snapshot() -> 'summary' -> 0 ->> 'margin')::bigint,
  16000::bigint,
  'live snapshot derives margin'
);

select is(
  (public.dashboard_sales_snapshot() -> 'productSales' -> 0 ->> 'revenue')::bigint,
  40000::bigint,
  'live snapshot includes product sales'
);

select * from finish();
rollback;
