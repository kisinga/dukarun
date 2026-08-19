begin;
select plan(17);

select testkit.create_user('91919191-9191-4191-8191-919191919191', 'price-admin@local.test');
select testkit.create_user('91919191-9191-4191-8191-919191919192', 'price-cashier@local.test');
select testkit.create_user('91919191-9191-4191-8191-919191919193', 'price-other@local.test');
create temp table price_company as
select testkit.provision('91919191-9191-4191-8191-919191919191', 'Price Workbook Co') company_id;
grant select on pg_temp.price_company to authenticated;
create temp table price_other_company as
select testkit.provision('91919191-9191-4191-8191-919191919193', 'Other Price Co') company_id;
grant select on pg_temp.price_other_company to authenticated;
select testkit.add_member(
  (select company_id from price_company),
  '91919191-9191-4191-8191-919191919192',
  'Cashier',
  array['SettleOrder']
);

select testkit.as_user(
  (select company_id from price_company),
  '91919191-9191-4191-8191-919191919191',
  'Admin'
);

create temp table price_product as
select public.create_catalog_product(
  'Workbook Tea',
  '[{"name":"250g","sku":"WB-TEA-250","price":100,"wholesale_price":80},
    {"name":"500g","sku":"WB-TEA-500","price":180,"wholesale_price":150}]'
) product_id;

select ok(
  (select variant_updated_at is not null
    from public.catalog_cache_page()
    where sku = 'WB-TEA-250'),
  'catalog cache carries the variant version needed for safe price updates'
);

set local role postgres;
update public.products set active = false where id = (select product_id from price_product);
update public.product_variants set active = false where sku = 'WB-TEA-500';
set local role authenticated;

create temp table price_versions as
select id, updated_at from public.product_variants where sku like 'WB-TEA-%';

create temp table catalog_sequence_before as
select coalesce(max(sequence), 0) sequence
from public.cache_change_log
where company_id = (select company_id from price_company) and stream = 'catalog';

create temp table price_audit_before as
select count(*)::bigint audit_count
from public.audit_log
where table_name = 'product_variants' and operation = 'UPDATE';

create temp table price_result as
select public.apply_catalog_price_updates(jsonb_build_array(
  jsonb_build_object(
    'variant_id', (select id from public.product_variants where sku = 'WB-TEA-250'),
    'expected_updated_at', (select updated_at from price_versions where id =
      (select id from public.product_variants where sku = 'WB-TEA-250')),
    'new_retail_price', 120,
    'new_wholesale_price', 90
  ),
  jsonb_build_object(
    'variant_id', (select id from public.product_variants where sku = 'WB-TEA-500'),
    'expected_updated_at', (select updated_at from price_versions where id =
      (select id from public.product_variants where sku = 'WB-TEA-500')),
    'new_wholesale_price', null
  )
)) result;

select is((select (result ->> 'updated_variants')::integer from price_result), 2,
  'apply reports updated variants');
select is((select (result ->> 'retail_changes')::integer from price_result), 1,
  'apply reports retail changes');
select is((select (result ->> 'wholesale_changes')::integer from price_result), 2,
  'apply reports wholesale changes');
select is((select price from public.product_variants where sku = 'WB-TEA-250'), 120::bigint,
  'retail price updates');
select is((select wholesale_price from public.product_variants where sku = 'WB-TEA-250'), 90::bigint,
  'wholesale price updates');
select is((select wholesale_price from public.product_variants where sku = 'WB-TEA-500'), null,
  'wholesale price clears');

select is(
  (select count(*)::integer from public.cache_change_log
    where company_id = (select company_id from price_company)
      and stream = 'catalog'
      and sequence > (select sequence from catalog_sequence_before)
      and operation = 'reset'),
  1,
  'one catalog reset is emitted for the whole update'
);

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from public.product_variants where sku = 'WB-TEA-250'),
    'expected_updated_at', (select updated_at from price_versions where id =
      (select id from public.product_variants where sku = 'WB-TEA-250')),
    'new_retail_price', 130
  )))$$,
  'P0001', 'stale_catalog_price_export', 'stale exports are rejected'
);

create temp table current_version as
select id, updated_at from public.product_variants where sku = 'WB-TEA-250';

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from current_version),
    'expected_updated_at', (select updated_at from current_version),
    'new_retail_price', 70,
    'new_wholesale_price', 80
  )))$$,
  'P0001', 'wholesale_price_above_retail', 'wholesale cannot exceed retail'
);

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from current_version),
    'expected_updated_at', (select updated_at from current_version),
    'new_retail_price', 100.5
  )))$$,
  'P0001', 'invalid_price_change', 'fractional shillings are rejected'
);

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from current_version),
    'expected_updated_at', 'not-a-time',
    'new_retail_price', 130
  )))$$,
  'P0001', 'invalid_price_change', 'invalid timestamps are rejected'
);

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(
    jsonb_build_object('variant_id', (select id from current_version),
      'expected_updated_at', (select updated_at from current_version), 'new_retail_price', 130),
    jsonb_build_object('variant_id', (select id from current_version),
      'expected_updated_at', (select updated_at from current_version), 'new_retail_price', 140)
  ))$$,
  'P0001', 'duplicate_variant_id', 'duplicate variants are rejected'
);

select is((select price from public.product_variants where sku = 'WB-TEA-250'), 120::bigint,
  'failed changes write nothing');

select is(
  (select count(*)::bigint - (select audit_count from price_audit_before)
    from public.audit_log
    where table_name = 'product_variants' and operation = 'UPDATE'),
  2::bigint,
  'price updates create one audit record per changed variant'
);

select testkit.as_user(
  (select company_id from price_other_company),
  '91919191-9191-4191-8191-919191919193',
  'Admin'
);

create temp table other_product as
select public.create_catalog_product(
  'Other Company Product',
  '[{"name":"Default","sku":"OTHER-PRICE","price":500}]'
) product_id;

create temp table other_variant as
select id, updated_at from public.product_variants where sku = 'OTHER-PRICE';

select testkit.as_user(
  (select company_id from price_company),
  '91919191-9191-4191-8191-919191919191',
  'Admin'
);

select throws_ok(
  $$select public.apply_catalog_price_updates(jsonb_build_array(jsonb_build_object(
    'variant_id', (select id from other_variant),
    'expected_updated_at', (select updated_at from other_variant),
    'new_retail_price', 600
  )))$$,
  'P0001', 'variant_not_found', 'cross-company variants are rejected'
);

select testkit.as_user(
  (select company_id from price_company),
  '91919191-9191-4191-8191-919191919192',
  'Cashier'
);

select throws_ok(
  $$select public.apply_catalog_price_updates('[{"variant_id":"00000000-0000-0000-0000-000000000000",
    "expected_updated_at":"2026-01-01T00:00:00Z","new_retail_price":1}]')$$,
  'P0001', 'permission_denied: ManageCatalog required', 'updates require catalog permission'
);

select * from finish();
rollback;
