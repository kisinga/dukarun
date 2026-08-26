-- Held (pending_payment) sales surface per staff member on the leaderboard.
begin;
select plan(5);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner@held.local', '254711111111');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'seller@held.local', '254722222222');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'cashier@held.local', '254733333333');

create temp table held_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Held Co') as company_id;
grant select on pg_temp.held_company to authenticated;

update public.companies c
set subscription_tier_id = t.id, subscription_status = 'active'
from public.subscription_tiers t
where c.id = (select company_id from held_company) and t.code = 'standard';

select testkit.add_member(
  (select company_id from held_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller', '{SettleOrder}'
);
select testkit.add_member(
  (select company_id from held_company),
  '33333333-3333-3333-3333-333333333333',
  'Cashier', '{SettleOrder}'
);

reset role;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000060', company_id, 'Repair'
from held_company;
insert into public.product_variants (
  id, product_id, company_id, name, kind, sku, price, track_inventory
) select
  'aa000000-0000-0000-0000-000000000060',
  'a0000000-0000-0000-0000-000000000060',
  company_id, 'Default', 'service', 'HELD-SERVICE', 10000, false
from held_company;

select testkit.as_user(
  (select company_id from held_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select testkit.ensure_open_session();

select testkit.as_user(
  (select company_id from held_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller'
);

-- Parked sale lands in the cashier queue (pending_payment), unpaid.
create temp table held_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000060","quantity":1,"unit_price":10000}]',
  '[]', true
) as order_id;
grant select on pg_temp.held_sale to authenticated;

select testkit.as_user(
  (select company_id from held_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

-- 1-2. The parked sale counts as held for the originating seller.
select is(
  (select held_count from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'parked sale counts as held for the seller'
);
select is(
  (select held_value from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  10000::bigint,
  'held value tracks the unpaid order total'
);

select testkit.as_user(
  (select company_id from held_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller'
);

-- A completed checkout must not inflate the held metric.
create temp table done_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000060","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]'
) as order_id;
grant select on pg_temp.done_sale to authenticated;

select testkit.as_user(
  (select company_id from held_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

-- 3. Completed sales do not count toward held.
select is(
  (select held_count from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'completed sale does not count toward held'
);

select public.void_sale((select order_id from done_sale), 'Cancelled service');

-- 4. Voided sales do not count toward held either.
select is(
  (select held_count from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'voided sale does not count toward held'
);

-- Settling the parked sale takes it out of the cashier queue.
select testkit.as_user(
  (select company_id from held_company),
  '33333333-3333-3333-3333-333333333333',
  'Cashier'
);
select public.settle_order(
  (select order_id from held_sale),
  '[{"method":"cash","amount":10000}]'
);

select testkit.as_user(
  (select company_id from held_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

-- 5. Once settled, nothing remains held.
select is(
  (select held_count from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'settling the parked sale clears the held metric'
);

select * from finish();
rollback;
