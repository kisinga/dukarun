begin;
select plan(11);

select testkit.create_user('45454545-4545-4545-4545-454545454545', 'catalog-edit@local.test');
create temp table edit_company as
select testkit.provision('45454545-4545-4545-4545-454545454545', 'Catalog Edit Co') company_id;
grant select on pg_temp.edit_company to authenticated;
select testkit.as_user((select company_id from edit_company),
  '45454545-4545-4545-4545-454545454545', 'Admin');

create temp table edited_product as
select public.create_catalog_product('Tea', '[
  {"name":"250g","price":12000,"sku":"TEA-250",
   "opening_quantity":1,"opening_unit_cost":5000},
  {"name":"500g","price":22000,"sku":"TEA-500"}
]', '616000000001') product_id;

create temp table edited_variants as
select id, name from public.product_variants
where product_id = (select product_id from edited_product);

select public.update_catalog_product(
  (select product_id from edited_product),
  'Premium Tea',
  jsonb_build_array(
    jsonb_build_object(
      'variant_id', (select id from edited_variants where name = '250g'),
      'name', '250 g', 'price', 13000, 'sku', 'TEA-250-NEW', 'barcode', null,
      'wholesale_price', 11000, 'kind', 'good', 'track_inventory', true,
      'allow_fractional', false, 'active', true
    ),
    jsonb_build_object(
      'variant_id', (select id from edited_variants where name = '500g'),
      'name', '500g', 'price', 22000, 'sku', 'TEA-500', 'barcode', null,
      'wholesale_price', null, 'kind', 'good', 'track_inventory', true,
      'allow_fractional', false, 'active', false
    ),
    jsonb_build_object(
      'name', '1 kg', 'price', 40000, 'kind', 'good', 'track_inventory', true,
      'allow_fractional', false, 'active', true, 'opening_quantity', 3,
      'opening_unit_cost', 30000, 'batch_number', 'OPEN-TEA'
    )
  ),
  '',
  true
);

select is((select name from public.products where id = (select product_id from edited_product)),
  'Premium Tea', 'product details update with variants');
select is((select barcode from public.products where id = (select product_id from edited_product)),
  null, 'shared barcode can be cleared');
select is((select price from public.product_variants where sku = 'TEA-250-NEW'),
  13000::bigint, 'existing variant and SKU update in place');
select is((select active from public.product_variants where sku = 'TEA-500'),
  false, 'existing variant can be deactivated in the coupled edit');
select is((select count(*)::int from public.product_variants
  where product_id = (select product_id from edited_product)), 3, 'new variant is added');
select is((select quantity from public.inventory_batches where batch_number = 'OPEN-TEA'),
  3.000::numeric, 'new variant opening stock is created');
select is((select sum(debit)::bigint from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where e.source_type = 'ProductOpeningStock'
    and e.source_id like (select product_id::text || '%' from edited_product)),
  95000::bigint, 'new variant opening stock is journaled in addition to the original');
select is((select count(*)::int from public.ledger_journal_entries e
  where e.source_type = 'ProductOpeningStock'
    and e.source_id like (select product_id::text || '%' from edited_product)),
  2, 'each coupled edit gets a distinct opening-stock journal');

select throws_ok(
  format($$select public.update_catalog_product('%s', 'Should Roll Back',
    '[{"variant_id":"99999999-9999-9999-9999-999999999999","name":"Bad","price":1}]')$$,
    (select product_id from edited_product)),
  'P0001',
  'variant_not_found: 99999999-9999-9999-9999-999999999999',
  'foreign variant ids reject the whole edit'
);
select is((select name from public.products where id = (select product_id from edited_product)),
  'Premium Tea', 'a failed variant update rolls back the product update');
select throws_ok(
  format($$select public.update_catalog_product('%s', 'No Variants', '[]')$$,
    (select product_id from edited_product)),
  'P0001', 'variants_required: a product needs at least one variant',
  'a coupled edit always requires a variant'
);

select * from finish();
rollback;
