begin;
select plan(5);

select testkit.create_user('82828282-8282-4282-8282-828282828281', 'barcode-conflict@local.test');
create temp table conflict_company as
select testkit.provision('82828282-8282-4282-8282-828282828281', 'Conflict Co') company_id;
grant select on pg_temp.conflict_company to authenticated;
select testkit.as_user(
  (select company_id from conflict_company),
  '82828282-8282-4282-8282-828282828281',
  'Admin'
);

create temp table family_code as
select public.create_catalog_product('Family code', '[{"price":100}]', 'CROSS-CODE') product_id;

select throws_ok(
  $$select public.create_catalog_product('Variant collision',
    '[{"price":200,"barcode":"CROSS-CODE"}]')$$,
  'P0001', 'barcode_conflict: CROSS-CODE',
  'variant barcode cannot duplicate a family barcode'
);

create temp table variant_code as
select public.create_catalog_product('Variant code',
  '[{"price":300,"barcode":"VARIANT-CODE"}]') product_id;

select throws_ok(
  $$select public.create_catalog_product('Family collision', '[{"price":400}]', 'VARIANT-CODE')$$,
  'P0001', 'barcode_conflict: VARIANT-CODE',
  'family barcode cannot duplicate a variant barcode'
);

select throws_ok(
  $$select public.create_catalog_product('Ambiguous family',
    '[{"name":"Small","price":100},{"name":"Large","price":200}]', 'SHARED')$$,
  'P0001', 'barcode_conflict: SHARED',
  'one family barcode cannot resolve to two active variants'
);

select lives_ok(
  $$select public.create_catalog_product('Distinct variants',
    '[{"name":"Small","price":100,"barcode":"DISTINCT-S"},
      {"name":"Large","price":200,"barcode":"DISTINCT-L"}]', 'UNUSED-FAMILY')$$,
  'distinct effective variant barcodes are accepted'
);

select is(
  (select count(*)::integer from public.resolve_catalog_barcode('CROSS-CODE')),
  1,
  'original barcode remains resolvable after rejected writes'
);

select * from finish();
rollback;
