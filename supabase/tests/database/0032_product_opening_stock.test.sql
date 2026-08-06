begin;
select plan(10);

select testkit.create_user('32323232-3232-3232-3232-323232323232', 'opening@stock.local');
create temp table opening_company as
select testkit.provision('32323232-3232-3232-3232-323232323232', 'Opening Stock Co') company_id;
grant select on pg_temp.opening_company to authenticated;
select testkit.as_user((select company_id from opening_company),
  '32323232-3232-3232-3232-323232323232', 'Admin');

create temp table opened_product as
select public.create_catalog_product('Flour', '[
  {"name":"1kg","price":18000,"opening_quantity":12,"opening_unit_cost":12000},
  {"name":"2kg","price":34000,"opening_quantity":2.5,"opening_unit_cost":23000,
   "allow_fractional":true,"batch_number":"OPEN-1","expiry_date":"2027-01-31"}
]') product_id;

select is((select count(*)::int from public.product_variants
  where product_id = (select product_id from opened_product)), 2, 'variants created');
select is((select sum(quantity) from public.inventory_batches b join public.product_variants v
  on v.id = b.variant_id where v.product_id = (select product_id from opened_product)),
  14.500::numeric, 'opening batches created');
select is((select count(*)::int from public.inventory_movements
  where source_type = 'ProductOpeningStock' and source_id = (select product_id::text from opened_product)),
  2, 'opening movements created');
select is((select batch_number from public.inventory_batches b join public.product_variants v
  on v.id = b.variant_id where v.product_id = (select product_id from opened_product)
  and v.name = '2kg'), 'OPEN-1', 'batch metadata retained');
select is((select sum(debit)::bigint from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where e.source_type = 'ProductOpeningStock' and e.source_id = (select product_id::text from opened_product)),
  201500::bigint, 'opening journal debit matches batch value');
select is((select sum(credit)::bigint from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id = l.entry_id
  where e.source_type = 'ProductOpeningStock' and e.source_id = (select product_id::text from opened_product)),
  201500::bigint, 'opening journal is balanced');
select ok(exists(select 1 from public.ledger_accounts where company_id =
  (select company_id from opening_company) and code = 'OPENING_BALANCE_EQUITY'),
  'opening equity account provisioned');

select throws_ok(
  $$select public.create_catalog_product('Bad service',
    '[{"price":1000,"kind":"service","opening_quantity":1,"opening_unit_cost":1}]')$$,
  'P0001', 'opening_stock_requires_tracked_good', 'services reject opening stock');
select is((select count(*)::int from public.products where name = 'Bad service'), 0,
  'invalid creation rolls back');
select throws_ok(
  $$select public.create_catalog_product('Bad units',
    '[{"price":1000,"opening_quantity":1.5,"opening_unit_cost":1}]')$$,
  'P0001', 'fractional_opening_stock_not_allowed', 'whole-unit variants reject fractions');

select * from finish();
rollback;
