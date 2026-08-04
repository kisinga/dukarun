begin;
select plan(8);

select testkit.create_user(
  '11111111-1111-1111-1111-111111111111',
  'stock-history@test.local'
);

create temp table history_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Stock History Co'
) as company_id;
grant select on pg_temp.history_company to authenticated;

insert into public.products(id, company_id, name)
select 'a0000000-0000-0000-0000-000000000055', company_id, 'Cooking Oil'
from history_company;

insert into public.product_variants(
  id, product_id, company_id, name, sku, price, track_inventory
)
select
  'aa000000-0000-0000-0000-000000000055',
  'a0000000-0000-0000-0000-000000000055',
  company_id, '1 litre', 'OIL-HISTORY', 10000, true
from history_company;

insert into public.inventory_batches(
  company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
)
select c.company_id, 'aa000000-0000-0000-0000-000000000055', l.id, 5, 5, 300, date '2026-01-01'
from history_company c
join public.stock_locations l on l.company_id = c.company_id and l.is_default;

insert into public.inventory_batches(
  company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
)
select c.company_id, 'aa000000-0000-0000-0000-000000000055', l.id, 5, 5, 350, date '2026-02-01'
from history_company c
join public.stock_locations l on l.company_id = c.company_id and l.is_default;

select testkit.as_user(
  (select company_id from history_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.post_stock_adjustment_at_location(
  (select id from public.stock_locations
   where company_id = (select company_id from history_company) and is_default),
  'aa000000-0000-0000-0000-000000000055',
  10, 3, 'Damaged stock: leaking bottles'
);

select public.post_stock_adjustment_at_location(
  (select id from public.stock_locations
   where company_id = (select company_id from history_company) and is_default),
  'aa000000-0000-0000-0000-000000000055',
  3, 5, 'Found stock: recount', 400
);

select is(
  (select count(*) from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  )),
  2::bigint,
  'history returns one row per adjustment'
);

select is(
  (select batch_movements from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  ) where quantity_change < 0),
  2,
  'FIFO decrease spanning two batches is grouped into one row'
);

select is(
  (select quantity_change from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  ) where quantity_change < 0),
  (-7)::numeric,
  'grouped history keeps the signed quantity change'
);

select is(
  (select quantity_before from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  ) where quantity_change < 0),
  10::numeric,
  'decrease history stores the count before adjustment'
);

select is(
  (select quantity_after from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  ) where quantity_change < 0),
  3::numeric,
  'decrease history stores the final count'
);

select is(
  (select reason from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default)
  ) where quantity_change < 0),
  'Damaged stock: leaking bottles',
  'history retains the adjustment reason'
);

select is(
  (select count(*) from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default),
    null, 'Found stock'
  )),
  1::bigint,
  'history search filters by reason'
);

select is(
  (select total_count from public.stock_adjustment_history(
    (select id from public.stock_locations
     where company_id = (select company_id from history_company) and is_default),
    null, null, 1, 0
  )),
  2::bigint,
  'paged history reports the unpaged total'
);

select * from finish();
rollback;
