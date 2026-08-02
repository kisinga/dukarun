-- Analytics tests (migration 0018): MV contents after refresh, tenant
-- isolation through the rpt_ wrapper views, dashboard helper views.
begin;
select plan(8);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'a@rpt.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'b@rpt.local');

create temp table rpt_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Rpt Co') as company_id;
grant select on pg_temp.rpt_company to authenticated;

-- Product + variant + batch.
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000a1', company_id, 'Rice' from rpt_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', company_id, '1kg', 'RICE1', 20000 from rpt_company;
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'aa000000-0000-0000-0000-0000000000a1', 10, 10, 12000 from rpt_company;

select testkit.as_user((select company_id from rpt_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- Two sales today: 2x Rice (revenue 40000, cogs 24000) + split payment.
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000a1","quantity":2,"unit_price":20000}]',
  '[{"method":"cash","amount":30000},{"method":"mpesa","amount":10000}]');

reset role;
select public.refresh_analytics();

-- 1-3. Sales summary MV.
select is(
  (select revenue from public.rpt_daily_sales_summary
   where day = (now() at time zone 'Africa/Nairobi')::date),
  40000::bigint,
  'daily summary revenue'
);

select is(
  (select cogs from public.rpt_daily_sales_summary
   where day = (now() at time zone 'Africa/Nairobi')::date),
  24000::bigint,
  'daily summary COGS at FIFO cost'
);

select is(
  (select margin from public.rpt_daily_sales_summary
   where day = (now() at time zone 'Africa/Nairobi')::date),
  16000::bigint,
  'daily summary margin = revenue - cogs'
);

-- 4. Product sales MV has the variant row.
select is(
  (select quantity from public.rpt_daily_product_sales
   where variant_id = 'aa000000-0000-0000-0000-0000000000a1'
     and day = (now() at time zone 'Africa/Nairobi')::date),
  2::numeric,
  'product sales MV tracks variant quantity'
);

-- 5. Order stats MV: cash + mpesa method rows.
select is(
  (select count(*)::int from public.rpt_daily_order_stats
   where day = (now() at time zone 'Africa/Nairobi')::date and method_code in ('cash','mpesa')),
  2,
  'order stats MV splits by payment method'
);

-- 6-7. Tenant isolation: company B sees nothing through the wrapper views.
create temp table rpt_company2 as select testkit.provision('22222222-2222-2222-2222-222222222222', 'Rpt Other') as company_id2;
grant select on pg_temp.rpt_company2 to authenticated;

select testkit.as_user((select company_id2 from rpt_company2), '22222222-2222-2222-2222-222222222222', 'Admin');

select is(
  (select count(*)::int from public.rpt_daily_sales_summary),
  0,
  'tenant B sees no summary rows (MV isolation via wrapper view)'
);

select throws_ok(
  $$select count(*) from public.mv_daily_sales_summary$$,
  '42501', null,
  'tenant B cannot read the raw MV directly'
);

-- 8. Low-stock view: remaining 8 > threshold 10? default threshold is 10 -> 8 <= 10 shows.
reset role;
select is(
  (select count(*)::int from public.low_stock_variants
   where company_id = (select company_id from rpt_company)),
  1,
  'low-stock view flags the depleted variant (8 <= threshold 10)'
);

select * from finish();
rollback;
