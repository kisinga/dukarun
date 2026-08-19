begin;
select plan(12);

select testkit.create_user('10101010-1010-4010-8010-101010101010', 'bounded-dashboard@local.test');
create temp table bounded_company as
select testkit.provision(
  '10101010-1010-4010-8010-101010101010',
  'Bounded Dashboard Co'
) company_id;
grant select on pg_temp.bounded_company to authenticated;

insert into public.products(id, company_id, name)
select '10101010-0000-4000-8000-000000000001', company_id, 'Sixteen Sizes'
from bounded_company;

insert into public.product_variants(product_id, company_id, name, sku, price)
select
  '10101010-0000-4000-8000-000000000001',
  company_id,
  'Size ' || n,
  'BOUND-' || n,
  1000 + n
from bounded_company cross join generate_series(1, 16) n;

select is(
  (select count(*)::integer from public.product_variants
   where product_id = '10101010-0000-4000-8000-000000000001' and active),
  16,
  'a product may have 16 active variants'
);

select throws_ok(
  $$insert into public.product_variants(product_id, company_id, name, sku, price)
    select '10101010-0000-4000-8000-000000000001', company_id,
      'Size 17', 'BOUND-17', 1017 from bounded_company$$,
  'P0001',
  'active_variant_limit_exceeded: maximum 16 active variants per product',
  'the table rejects a seventeenth active variant'
);

update public.product_variants set active = false
where product_id = '10101010-0000-4000-8000-000000000001' and sku = 'BOUND-16';

select lives_ok(
  $$insert into public.product_variants(product_id, company_id, name, sku, price)
    select '10101010-0000-4000-8000-000000000001', company_id,
      'Replacement', 'BOUND-NEW', 2000 from bounded_company$$,
  'a deactivated slot can be replaced consistently'
);

select throws_ok(
  $$update public.product_variants set active = true where sku = 'BOUND-16'$$,
  'P0001',
  'active_variant_limit_exceeded: maximum 16 active variants per product',
  'reactivation follows the same 16-variant rule'
);

select has_table('public', 'dashboard_snapshot_cache', 'shared dashboard cache exists');
select has_trigger(
  'public', 'product_variants', 'product_variants_enforce_active_limit',
  'the active-variant limit is enforced at the table boundary'
);

insert into public.inventory_batches(company_id, variant_id, quantity, remaining, unit_cost)
select company.company_id, variant.id, 10, 10, 500
from bounded_company company
join public.product_variants variant
  on variant.product_id = '10101010-0000-4000-8000-000000000001'
 and variant.sku = 'BOUND-1';

select testkit.as_user(
  (select company_id from bounded_company),
  '10101010-1010-4010-8010-101010101010',
  'Admin'
);
select testkit.ensure_open_session();

create temp table initial_dashboard as
select public.dashboard_location_snapshot() value;
grant select on pg_temp.initial_dashboard to authenticated;

select is(
  jsonb_array_length((select value -> 'summary' from initial_dashboard)),
  0,
  'the first lazy snapshot is computed on demand'
);

select public.post_sale(
  null,
  format('[{"variant_id":"%s","quantity":2}]', (
    select id from public.product_variants where sku = 'BOUND-1'
  ))::jsonb,
  '[{"method":"cash","amount":2002}]'::jsonb
);

select ok(
  public.dashboard_location_snapshot() ? 'refreshAfter',
  'a changed snapshot advertises its bounded refresh time instead of recomputing repeatedly'
);

reset role;
update public.dashboard_snapshot_cache
set computed_at = clock_timestamp() - interval '61 seconds'
where company_id = (select company_id from bounded_company);
select testkit.as_user(
  (select company_id from bounded_company),
  '10101010-1010-4010-8010-101010101010',
  'Admin'
);

create temp table refreshed_dashboard as
select public.dashboard_location_snapshot() value;
grant select on pg_temp.refreshed_dashboard to authenticated;

select is(
  ((select value from refreshed_dashboard) -> 'summary' -> 0 ->> 'quantity')::numeric,
  2::numeric,
  'daily quantity is returned with the compact summary'
);

select is(
  jsonb_array_length((select value -> 'topVariants' from refreshed_dashboard)),
  1,
  'the compact snapshot returns only ranked variant totals'
);

select ok(
  not ((select value from refreshed_dashboard) ? 'productSales'),
  'the dashboard no longer returns every variant-day row'
);

select ok(
  not (public.dashboard_location_snapshot() ? 'refreshAfter'),
  'an unchanged source reuses the snapshot without scheduling more work'
);

select * from finish();
rollback;
