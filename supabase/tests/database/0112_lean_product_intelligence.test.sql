begin;
select plan(4);

select has_column(
  'public', 'dashboard_snapshot_cache', 'catalog_sequence',
  'dashboard cache records catalog changes'
);

select testkit.create_user(
  '14440000-0000-4000-8000-000000000001', 'product-intelligence-admin@test.local');
select testkit.create_user(
  '14440000-0000-4000-8000-000000000002', 'product-intelligence-staff@test.local');
create temp table intelligence_company as
select testkit.provision(
  '14440000-0000-4000-8000-000000000001', 'Product Intelligence Store'
) company_id;
grant select on pg_temp.intelligence_company to authenticated;
select testkit.add_member(
  (select company_id from intelligence_company),
  '14440000-0000-4000-8000-000000000002',
  'Product viewer', '{SettleOrder}'
);

insert into public.manufacturers(id, company_id, name)
select '14440000-0000-4000-8000-000000000010', company_id, 'Acme'
from intelligence_company;
insert into public.categories(id, company_id, name, slug)
select '14440000-0000-4000-8000-000000000011', company_id, 'Core stock', 'core-stock'
from intelligence_company;

insert into public.products(id, company_id, name, manufacturer_id)
select '14440000-0000-4000-8000-000000000020', company_id, 'Tracked Tea',
  '14440000-0000-4000-8000-000000000010'
from intelligence_company;
insert into public.products(id, company_id, name)
select '14440000-0000-4000-8000-000000000021', company_id, 'Small Sale'
from intelligence_company;
insert into public.products(id, company_id, name)
select '14440000-0000-4000-8000-000000000022', company_id, 'Stopped Sale'
from intelligence_company;

insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14440000-0000-4000-8000-000000000030',
  '14440000-0000-4000-8000-000000000020', company_id,
  'Default', 'INTEL-TEA', 1000, true
from intelligence_company;
insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14440000-0000-4000-8000-000000000031',
  '14440000-0000-4000-8000-000000000021', company_id,
  'Default', 'INTEL-SMALL', 500, false
from intelligence_company;
insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14440000-0000-4000-8000-000000000032',
  '14440000-0000-4000-8000-000000000022', company_id,
  'Default', 'INTEL-STOPPED', 800, false
from intelligence_company;
insert into public.product_categories(company_id, product_id, category_id)
select company_id, '14440000-0000-4000-8000-000000000020',
  '14440000-0000-4000-8000-000000000011'
from intelligence_company;
insert into public.inventory_batches(company_id, variant_id, quantity, remaining, unit_cost)
select company_id, '14440000-0000-4000-8000-000000000030', 10, 10, 600
from intelligence_company;

select testkit.as_user(
  (select company_id from intelligence_company),
  '14440000-0000-4000-8000-000000000001', 'Admin'
);
select testkit.ensure_open_session();

create temp table current_tea_sale as select public.post_sale(
  null,
  '[{"variant_id":"14440000-0000-4000-8000-000000000030","quantity":2,"unit_price":1000}]',
  '[{"method":"cash","amount":2000}]'
) order_id;
create temp table current_small_sale as select public.post_sale(
  null,
  '[{"variant_id":"14440000-0000-4000-8000-000000000031","quantity":1,"unit_price":500}]',
  '[{"method":"cash","amount":500}]'
) order_id;
create temp table previous_tea_sale as select public.post_sale(
  null,
  '[{"variant_id":"14440000-0000-4000-8000-000000000030","quantity":1,"unit_price":1000}]',
  '[{"method":"cash","amount":1000}]'
) order_id;
create temp table previous_stopped_sale as select public.post_sale(
  null,
  '[{"variant_id":"14440000-0000-4000-8000-000000000032","quantity":3,"unit_price":800}]',
  '[{"method":"cash","amount":2400}]'
) order_id;
grant select on pg_temp.current_tea_sale, pg_temp.current_small_sale,
  pg_temp.previous_tea_sale, pg_temp.previous_stopped_sale to authenticated;

reset role;
update public.orders
set created_at = ((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00',
    completed_at = (((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00')
      at time zone 'Africa/Nairobi'
where id in (
  (select order_id from previous_tea_sale),
  (select order_id from previous_stopped_sale)
);
select public.refresh_analytics();

select testkit.as_user(
  (select company_id from intelligence_company),
  '14440000-0000-4000-8000-000000000001', 'Admin'
);

create temp table intelligence_dashboard as
select public.dashboard_location_snapshot() value;
grant select on pg_temp.intelligence_dashboard to authenticated;
select is(
  (select value -> 'productSignals' -> 'restockRisks' -> 0 ->> 'variant_id'
   from intelligence_dashboard),
  '14440000-0000-4000-8000-000000000030',
  'dashboard identifies a selling tracked variant below the stock threshold'
);

reset role;
insert into public.inventory_batches(company_id, variant_id, quantity, remaining, unit_cost)
select company_id, '14440000-0000-4000-8000-000000000030', 10, 10, 600
from intelligence_company;
select testkit.as_user(
  (select company_id from intelligence_company),
  '14440000-0000-4000-8000-000000000001', 'Admin'
);
select ok(
  public.dashboard_location_snapshot() ? 'refreshAfter',
  'stock changes invalidate the shared dashboard snapshot'
);

reset role;
update public.dashboard_snapshot_cache
set computed_at = clock_timestamp() - interval '61 seconds'
where company_id = (select company_id from intelligence_company);
select testkit.as_user(
  (select company_id from intelligence_company),
  '14440000-0000-4000-8000-000000000001', 'Admin'
);
select is(
  jsonb_array_length(public.dashboard_location_snapshot()
    -> 'productSignals' -> 'restockRisks'),
  0,
  'recomputed dashboard removes a restock risk after stock is received'
);

select * from finish();
rollback;
