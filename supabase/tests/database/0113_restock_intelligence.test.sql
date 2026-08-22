begin;
select plan(14);

select ok(
  to_regclass('public.mv_daily_location_product_sales') is not null,
  'location product sales rollup exists'
);
select has_function(
  'public', 'restock_product_intelligence',
  array['date','date','uuid','uuid','uuid','integer'],
  'bounded restock intelligence RPC exists'
);

select testkit.create_user(
  '14550000-0000-4000-8000-000000000001', 'restock-admin@test.local');
select testkit.create_user(
  '14550000-0000-4000-8000-000000000002', 'restock-staff@test.local');
create temp table restock_company as
select testkit.provision(
  '14550000-0000-4000-8000-000000000001', 'Restock Intelligence Store'
) company_id;
grant select on pg_temp.restock_company to authenticated;
select testkit.add_member(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000002',
  'Stock viewer', '{SettleOrder}'
);

update public.companies set low_stock_threshold = 6
where id = (select company_id from restock_company);

create temp table restock_locations as
select id as main_id, null::uuid as other_id
from public.stock_locations
where company_id = (select company_id from restock_company)
  and is_default
limit 1;
update restock_locations set other_id = '14550000-0000-4000-8000-000000000009';
grant select on pg_temp.restock_locations to authenticated;
insert into public.stock_locations(
  id, company_id, code, name, is_active, is_default
)
select other_id, company_id, 'OTHER', 'Other branch', true, false
from restock_locations cross join restock_company;

insert into public.customers(id, company_id, first_name, is_supplier)
select '14550000-0000-4000-8000-000000000010', company_id, 'Fresh Supply', true
from restock_company;
insert into public.customers(id, company_id, first_name, is_supplier)
select '14550000-0000-4000-8000-000000000011', company_id, 'Alternate Supply', true
from restock_company;
insert into public.manufacturers(id, company_id, name)
select '14550000-0000-4000-8000-000000000012', company_id, 'Acme Foods'
from restock_company;
insert into public.manufacturers(id, company_id, name)
select '14550000-0000-4000-8000-000000000013', company_id, 'Other Foods'
from restock_company;

insert into public.products(id, company_id, name, manufacturer_id)
select '14550000-0000-4000-8000-000000000020', company_id, 'Restock Tea',
  '14550000-0000-4000-8000-000000000012'
from restock_company;
insert into public.products(id, company_id, name, manufacturer_id)
select '14550000-0000-4000-8000-000000000021', company_id, 'Restock Sugar',
  '14550000-0000-4000-8000-000000000012'
from restock_company;
insert into public.products(id, company_id, name, manufacturer_id)
select '14550000-0000-4000-8000-000000000022', company_id, 'Other Flour',
  '14550000-0000-4000-8000-000000000013'
from restock_company;
insert into public.products(id, company_id, name, manufacturer_id)
select '14550000-0000-4000-8000-000000000023', company_id, 'Delivery Service',
  '14550000-0000-4000-8000-000000000012'
from restock_company;

insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14550000-0000-4000-8000-000000000030',
  '14550000-0000-4000-8000-000000000020', company_id,
  'Default', 'RESTOCK-TEA', 1000, true
from restock_company;
insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14550000-0000-4000-8000-000000000031',
  '14550000-0000-4000-8000-000000000021', company_id,
  'Default', 'RESTOCK-SUGAR', 500, true
from restock_company;
insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select '14550000-0000-4000-8000-000000000032',
  '14550000-0000-4000-8000-000000000022', company_id,
  'Default', 'RESTOCK-FLOUR', 700, true
from restock_company;
insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory, kind
)
select '14550000-0000-4000-8000-000000000033',
  '14550000-0000-4000-8000-000000000023', company_id,
  'Default', 'RESTOCK-SERVICE', 200, false, 'service'
from restock_company;

insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id, quantity, remaining, unit_cost
)
select '14550000-0000-4000-8000-000000000040', company_id,
  '14550000-0000-4000-8000-000000000030', main_id,
  '14550000-0000-4000-8000-000000000010', 12, 12, 600
from restock_company cross join restock_locations;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id, quantity, remaining, unit_cost
)
select '14550000-0000-4000-8000-000000000041', company_id,
  '14550000-0000-4000-8000-000000000030', main_id,
  '14550000-0000-4000-8000-000000000011', 10, 10, 650
from restock_company cross join restock_locations;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id, quantity, remaining, unit_cost
)
select '14550000-0000-4000-8000-000000000042', company_id,
  '14550000-0000-4000-8000-000000000031', main_id,
  '14550000-0000-4000-8000-000000000010', 8, 8, 300
from restock_company cross join restock_locations;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id, quantity, remaining, unit_cost
)
select '14550000-0000-4000-8000-000000000043', company_id,
  '14550000-0000-4000-8000-000000000030', other_id,
  '14550000-0000-4000-8000-000000000010', 50, 50, 590
from restock_company cross join restock_locations;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id, quantity, remaining, unit_cost
)
select '14550000-0000-4000-8000-000000000044', company_id,
  '14550000-0000-4000-8000-000000000032', main_id,
  '14550000-0000-4000-8000-000000000011', 20, 20, 400
from restock_company cross join restock_locations;

select testkit.as_user(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000001', 'Admin'
);
reset role;
insert into public.purchases(
  id, company_id, supplier_id, stock_location_id, total_cost, status, purchase_date
)
select '14550000-0000-4000-8000-000000000050', company_id,
  '14550000-0000-4000-8000-000000000010', main_id,
  9600, 'posted', current_date - 14
from restock_company cross join restock_locations;
insert into public.purchase_lines(
  company_id, purchase_id, variant_id, inventory_batch_id, quantity, unit_cost, line_total
)
select company_id, '14550000-0000-4000-8000-000000000050',
  '14550000-0000-4000-8000-000000000030',
  '14550000-0000-4000-8000-000000000040', 12, 600, 7200
from restock_company;
insert into public.purchase_lines(
  company_id, purchase_id, variant_id, inventory_batch_id, quantity, unit_cost, line_total
)
select company_id, '14550000-0000-4000-8000-000000000050',
  '14550000-0000-4000-8000-000000000031',
  '14550000-0000-4000-8000-000000000042', 8, 300, 2400
from restock_company;
insert into public.purchase_lines(
  company_id, purchase_id, variant_id, quantity, unit_cost, line_total
)
select company_id, '14550000-0000-4000-8000-000000000050',
  '14550000-0000-4000-8000-000000000033', 1, 200, 200
from restock_company;

select testkit.as_user(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000001', 'Admin'
);
select testkit.ensure_open_session();

create temp table current_tea as select public.post_sale(
  null,
  '[{"variant_id":"14550000-0000-4000-8000-000000000030","quantity":4,"unit_price":1000}]',
  '[{"method":"cash","amount":4000}]'
) order_id;
create temp table current_sugar as select public.post_sale(
  null,
  '[{"variant_id":"14550000-0000-4000-8000-000000000031","quantity":2,"unit_price":500}]',
  '[{"method":"cash","amount":1000}]'
) order_id;
create temp table previous_tea as select public.post_sale(
  null,
  '[{"variant_id":"14550000-0000-4000-8000-000000000030","quantity":2,"unit_price":1000}]',
  '[{"method":"cash","amount":2000}]'
) order_id;
create temp table previous_sugar as select public.post_sale(
  null,
  '[{"variant_id":"14550000-0000-4000-8000-000000000031","quantity":4,"unit_price":500}]',
  '[{"method":"cash","amount":2000}]'
) order_id;
select public.post_sale(
  null,
  '[{"variant_id":"14550000-0000-4000-8000-000000000030","quantity":1,"unit_price":1000}]',
  '[]', true
);
grant select on pg_temp.current_tea, pg_temp.current_sugar,
  pg_temp.previous_tea, pg_temp.previous_sugar to authenticated;

reset role;
update public.orders
set created_at = ((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00',
    completed_at = (((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00')
      at time zone 'Africa/Nairobi'
where id in ((select order_id from previous_tea), (select order_id from previous_sugar));
select public.refresh_analytics();

select testkit.as_user(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000001', 'Admin'
);
create temp table supplier_restock_report as
select public.restock_product_intelligence(
  (now() at time zone 'Africa/Nairobi')::date - 6,
  (now() at time zone 'Africa/Nairobi')::date,
  (select main_id from restock_locations),
  '14550000-0000-4000-8000-000000000010', null, 50
) value;
grant select on pg_temp.supplier_restock_report to authenticated;

select results_eq(
  $$select item ->> 'variantId'
    from supplier_restock_report,
      jsonb_array_elements(value -> 'products') item
    order by item ->> 'variantId'$$,
  $$values
    ('14550000-0000-4000-8000-000000000030'::text),
    ('14550000-0000-4000-8000-000000000031'::text)$$,
  'supplier scope includes its goods and excludes other suppliers and services'
);
select is(
  ((select value from supplier_restock_report) -> 'summary' ->> 'unitsSold')::numeric,
  6::numeric,
  'current totals count only completed sales'
);
select is(
  (select sum((point ->> 'previousQuantity')::numeric)
   from supplier_restock_report, jsonb_array_elements(value -> 'trend') point),
  6::numeric,
  'trend includes the previous equal period'
);
select is(
  jsonb_array_length((select value -> 'trend' from supplier_restock_report)),
  7,
  'trend returns one point for every selected day'
);
select results_eq(
  $$select (item ->> 'stock')::numeric, (item ->> 'supplierStock')::numeric
    from supplier_restock_report, jsonb_array_elements(value -> 'products') item
    where item ->> 'variantId' = '14550000-0000-4000-8000-000000000030'$$,
  $$values (16::numeric, 6::numeric)$$,
  'stock uses the selected location and separates total from supplier-sourced stock'
);
select is(
  ((select value from supplier_restock_report) -> 'summary' ->> 'restockRisks')::integer,
  1,
  'short stock is counted as a restock risk'
);
select results_eq(
  $$select (item ->> 'lastUnitCost')::bigint, (item ->> 'lastPurchaseDate')::date
    from supplier_restock_report, jsonb_array_elements(value -> 'products') item
    where item ->> 'variantId' = '14550000-0000-4000-8000-000000000030'$$,
  $$values (600::bigint, current_date - 14)$$,
  'latest supplier cost and receipt date are returned'
);
select is(
  jsonb_array_length(public.restock_product_intelligence(
    (now() at time zone 'Africa/Nairobi')::date - 6,
    (now() at time zone 'Africa/Nairobi')::date,
    (select main_id from restock_locations), null,
    '14550000-0000-4000-8000-000000000012', 50
  ) -> 'products'),
  2,
  'manufacturer scope returns stocked goods from the selected manufacturer'
);

reset role;
update public.orders
set created_at = ((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00',
    completed_at = (((now() at time zone 'Africa/Nairobi')::date - 7) + time '12:00')
      at time zone 'Africa/Nairobi'
where id = (select order_id from current_sugar);
update public.inventory_batches
set remaining = 0, remaining_cost = 0
where id = '14550000-0000-4000-8000-000000000042';
select public.refresh_analytics();
select testkit.as_user(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000001', 'Admin'
);
select is(
  (public.restock_product_intelligence(
    (now() at time zone 'Africa/Nairobi')::date - 6,
    (now() at time zone 'Africa/Nairobi')::date,
    (select main_id from restock_locations),
    '14550000-0000-4000-8000-000000000010', null, 50
  ) -> 'summary' ->> 'restockRisks')::integer,
  1,
  'a sold-out product with previous-period demand remains a restock risk'
);
select throws_ok(
  $$select public.restock_product_intelligence(
    current_date-400,current_date,
    (select main_id from restock_locations),
    '14550000-0000-4000-8000-000000000010',null,50
  )$$,
  'P0001', 'restock_intelligence_range_too_large: maximum 366 days',
  'restock intelligence rejects unbounded ranges'
);
select throws_ok(
  $$select public.restock_product_intelligence(
    current_date-6,current_date,
    (select main_id from restock_locations),null,null,50
  )$$,
  'P0001', 'restock_scope_required: choose one supplier or manufacturer',
  'restock intelligence requires one product source'
);
select testkit.as_user(
  (select company_id from restock_company),
  '14550000-0000-4000-8000-000000000002', 'Stock viewer'
);
select throws_ok(
  $$select public.restock_product_intelligence(
    current_date-6,current_date,
    (select main_id from restock_locations),
    '14550000-0000-4000-8000-000000000010',null,50
  )$$,
  'P0001', 'permission_denied: ViewFinancials required',
  'restock intelligence requires financial permission'
);

select * from finish();
rollback;
