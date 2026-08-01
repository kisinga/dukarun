-- Analytics tests (migration 0018): MV contents after refresh, tenant
-- isolation through the rpt_ wrapper views, dashboard helper views.
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@rpt.local', '', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@rpt.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table rpt_company as select public.provision_company('Rpt Co', 'Main') as company_id;
reset role;

create temp table rpt_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from rpt_company;
grant select on pg_temp.rpt_claims to authenticated;

-- Product + variant + batch.
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000a1', company_id, 'Rice' from rpt_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', company_id, '1kg', 'RICE1', 20000 from rpt_company;
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'aa000000-0000-0000-0000-0000000000a1', 10, 10, 12000 from rpt_company;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from rpt_claims), true);

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
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
create temp table rpt_company2 as select public.provision_company('Rpt Other', 'Main') as company_id2;

create temp table rpt_claims2 as
select format('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id2) as claims
from rpt_company2;
grant select on pg_temp.rpt_claims2 to authenticated;

select set_config('request.jwt.claims', (select claims from rpt_claims2), true);

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
