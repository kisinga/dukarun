-- Staff identity, completion attribution, refund safety and performance totals.
begin;
select plan(14);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner@performance.local', '254711111111');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'seller@performance.local', '254722222222');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'cashier@performance.local', '254733333333');
select testkit.create_user('44444444-4444-4444-4444-444444444444', 'viewer@performance.local', '254744444444');
select testkit.create_user('55555555-5555-5555-5555-555555555555', 'other@performance.local', '254755555555');

create temp table perf_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Performance Co') as company_id;
grant select on pg_temp.perf_company to authenticated;

update public.companies c
set subscription_tier_id = t.id, subscription_status = 'active'
from public.subscription_tiers t
where c.id = (select company_id from perf_company) and t.code = 'standard';

select testkit.add_member(
  (select company_id from perf_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller', '{}'
);
select testkit.add_member(
  (select company_id from perf_company),
  '33333333-3333-3333-3333-333333333333',
  'Cashier', '{SettleOrder}'
);
select testkit.add_member(
  (select company_id from perf_company),
  '44444444-4444-4444-4444-444444444444',
  'Viewer', '{}'
);

select testkit.as_user(
  (select company_id from perf_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.update_staff_display_name(
  (select id from public.company_memberships
   where company_id = (select company_id from perf_company)
     and user_id = '22222222-2222-2222-2222-222222222222'),
  'Amina Seller'
);

reset role;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000050', company_id, 'Consultation'
from perf_company;
insert into public.product_variants (
  id, product_id, company_id, name, kind, sku, price, track_inventory
) select
  'aa000000-0000-0000-0000-000000000050',
  'a0000000-0000-0000-0000-000000000050',
  company_id, 'Default', 'service', 'PERF-SERVICE', 10000, false
from perf_company;

select testkit.as_user(
  (select company_id from perf_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select testkit.ensure_open_session();

select testkit.as_user(
  (select company_id from perf_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller'
);

create temp table direct_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000050","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]'
) as order_id;
grant select on pg_temp.direct_sale to authenticated;

create temp table parked_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000050","quantity":1,"unit_price":10000}]',
  '[]', true
) as order_id;
grant select on pg_temp.parked_sale to authenticated;

-- 1-2. Completion time and actor are durable for a direct sale.
select ok(
  (select completed_at is not null from public.orders where id = (select order_id from direct_sale)),
  'completed sale receives completed_at'
);
select is(
  (select completed_by from public.orders where id = (select order_id from direct_sale)),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'direct sale is completed by the seller'
);

select testkit.as_user(
  (select company_id from perf_company),
  '33333333-3333-3333-3333-333333333333',
  'Cashier'
);
select public.settle_order(
  (select order_id from parked_sale),
  '[{"method":"cash","amount":10000}]'
);

-- 3-4. The order originator remains the salesperson; the completer is cashier.
select is(
  (select created_by from public.orders where id = (select order_id from parked_sale)),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'parked sale retains its originating salesperson'
);
select is(
  (select completed_by from public.orders where id = (select order_id from parked_sale)),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'parked sale records the settling cashier'
);

select testkit.as_user(
  (select company_id from perf_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.post_refund((select order_id from direct_sale), 2000, 'cash', 'Partial return');

-- 5. Cumulative refunds cannot exceed settled cash remaining.
select throws_ok(
  $$select public.post_refund(
    (select order_id from direct_sale), 9000, 'cash', 'Too much'
  )$$,
  'P0001',
  'refund_exceeds_collected: refundable amount is 8000',
  'refund amount is capped by net collection'
);

select public.void_sale((select order_id from parked_sale), 'Cancelled service');

-- 6-12. Leaderboard reconciles completion, refund and void events.
select is(
  (select transactions from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  2,
  'performance counts both completed checkouts'
);
select is(
  (select gross_sales from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  20000::bigint,
  'performance retains gross completed sales'
);
select is(
  (select net_sales from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  8000::bigint,
  'net sales subtract refunds and voids'
);
select is(
  (select collected from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  8000::bigint,
  'net collected value follows immutable payment events'
);
select is(
  (select quantity from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  1::numeric,
  'quantity volume subtracts voided sale lines'
);
select is(
  (select refunds from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  2000::bigint,
  'refund total is attributed to original seller'
);
select is(
  (select voids from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'void count is attributed to original seller'
);

-- Remove membership; retained profile must keep history readable.
select public.remove_team_member(
  (select id from public.company_memberships
   where company_id = (select company_id from perf_company)
     and user_id = '22222222-2222-2222-2222-222222222222')
);

-- 13. Historical identity survives membership deletion.
select is(
  (select display_name from public.staff_sales_performance(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  ) where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  'Amina Seller',
  'removed staff retain their display name in performance history'
);

-- 14. Ordinary staff cannot read company-wide performance.
select testkit.as_user(
  (select company_id from perf_company),
  '44444444-4444-4444-4444-444444444444',
  'Viewer'
);
select throws_ok(
  $$select * from public.staff_sales_performance(current_date, current_date)$$,
  'P0001',
  'permission_denied: ViewStaffPerformance required',
  'staff performance fails closed without permission'
);

select * from finish();
rollback;
