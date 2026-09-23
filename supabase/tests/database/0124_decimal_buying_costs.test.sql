-- Rates retain two decimal places; posted money remains whole KES.
begin;
select no_plan();

select col_type_is('public', 'inventory_batches', 'unit_cost', 'numeric',
  'batch buying costs support decimal rates');
select col_type_is('public', 'inventory_movements', 'unit_cost', 'numeric',
  'movement buying costs support decimal rates');
select col_type_is('public', 'purchase_lines', 'unit_cost', 'numeric',
  'invoice buying costs support decimal rates');
select col_type_is('public', 'inventory_batches', 'original_cost', 'bigint',
  'original batch values remain whole-shilling amounts');
select col_type_is('public', 'inventory_batches', 'remaining_cost', 'bigint',
  'remaining batch values remain whole-shilling amounts');
select col_type_is('public', 'purchase_lines', 'line_total', 'bigint',
  'invoice totals remain whole-shilling amounts');
select col_type_is('public', 'ledger_journal_lines', 'debit', 'bigint',
  'ledger money is not converted to decimal rates');
select has_function('public', 'post_stock_adjustment',
  array['uuid', 'numeric', 'numeric', 'text', 'numeric'],
  'stock adjustments accept a decimal buying cost');
select hasnt_function('public', 'post_stock_adjustment',
  array['uuid', 'numeric', 'numeric', 'text', 'bigint'],
  'the obsolete integer adjustment overload is removed');

select testkit.create_user('aa240000-0000-4000-8000-000000000001', 'decimal-costs@test.local');
create temp table decimal_company as
select testkit.provision('aa240000-0000-4000-8000-000000000001', 'Decimal Buying Costs') id;
grant select on decimal_company to authenticated;
insert into public.products(id, company_id, name)
select 'aa240000-0000-4000-8000-000000000002', id, 'Decimal cost fixtures' from decimal_company;
insert into public.product_variants(id, company_id, product_id, name, sku, price, stock_unit)
select fixture.id, company.id, 'aa240000-0000-4000-8000-000000000002',
  fixture.name, fixture.name, 10, 'piece'
from decimal_company company cross join (values
  ('aa240000-0000-4000-8000-000000000003'::uuid, 'DECIMAL-UNIT'),
  ('aa240000-0000-4000-8000-000000000004'::uuid, 'DECIMAL-TOTAL'),
  ('aa240000-0000-4000-8000-000000000005'::uuid, 'DECIMAL-BOX'),
  ('aa240000-0000-4000-8000-000000000006'::uuid, 'DECIMAL-RECURRING'),
  ('aa240000-0000-4000-8000-000000000007'::uuid, 'DECIMAL-WORKBOOK'),
  ('aa240000-0000-4000-8000-000000000008'::uuid, 'DECIMAL-ADJUSTMENT'),
  ('aa240000-0000-4000-8000-000000000012'::uuid, 'DECIMAL-ZERO-ADJUSTMENT'),
  ('aa240000-0000-4000-8000-000000000013'::uuid, 'DECIMAL-ZERO-WORKBOOK')
) fixture(id, name);
insert into public.variant_packs(id, company_id, variant_id, name, units_per_pack, sale_price)
select 'aa240000-0000-4000-8000-000000000009', id,
  'aa240000-0000-4000-8000-000000000005', 'Box', 100, 900 from decimal_company;
insert into public.customers(id, company_id, first_name, is_supplier, supplier_credit_limit)
select 'aa240000-0000-4000-8000-000000000010', id, 'Decimal supplier', true, 100000
from decimal_company;
select testkit.as_user((select id from decimal_company),
  'aa240000-0000-4000-8000-000000000001', 'Admin');
select testkit.ensure_open_session();

create temp table decimal_purchase as select public.record_purchase_complete(
  'aa240000-0000-4000-8000-000000000010',
  '[
    {"variant_id":"aa240000-0000-4000-8000-000000000003","quantity":100,"unit_cost":2.5},
    {"variant_id":"aa240000-0000-4000-8000-000000000004","quantity":100,"value_source":"total","line_total":250},
    {"variant_id":"aa240000-0000-4000-8000-000000000005","pack_id":"aa240000-0000-4000-8000-000000000009","quantity":1,"unit_cost":250},
    {"variant_id":"aa240000-0000-4000-8000-000000000006","quantity":3,"value_source":"total","line_total":100},
    {"variant_id":"aa240000-0000-4000-8000-000000000007","quantity":100,"unit_cost":250}
  ]', '[]', 0, 'DECIMAL-COST-BUY') id;

select results_eq(
  $$select variant_id, quantity, stock_quantity, unit_cost, line_total
    from public.purchase_lines where purchase_id=(select id from decimal_purchase)
    order by variant_id$$,
  $$values
    ('aa240000-0000-4000-8000-000000000003'::uuid,100::numeric,100::numeric,2.5::numeric,250::bigint),
    ('aa240000-0000-4000-8000-000000000004'::uuid,100::numeric,100::numeric,2.5::numeric,250::bigint),
    ('aa240000-0000-4000-8000-000000000005'::uuid,1::numeric,100::numeric,250::numeric,250::bigint),
    ('aa240000-0000-4000-8000-000000000006'::uuid,3::numeric,3::numeric,33.33::numeric,100::bigint),
    ('aa240000-0000-4000-8000-000000000007'::uuid,100::numeric,100::numeric,250::numeric,25000::bigint)$$,
  'unit, total and box entry preserve invoice rates and exact whole-KES totals');
select results_eq(
  $$select variant_id, quantity, unit_cost, original_cost, remaining_cost
    from public.inventory_batches where company_id=(select id from decimal_company)
    order by variant_id$$,
  $$values
    ('aa240000-0000-4000-8000-000000000003'::uuid,100::numeric,2.5::numeric,250::bigint,250::bigint),
    ('aa240000-0000-4000-8000-000000000004'::uuid,100::numeric,2.5::numeric,250::bigint,250::bigint),
    ('aa240000-0000-4000-8000-000000000005'::uuid,100::numeric,2.5::numeric,250::bigint,250::bigint),
    ('aa240000-0000-4000-8000-000000000006'::uuid,3::numeric,33.33::numeric,100::bigint,100::bigint),
    ('aa240000-0000-4000-8000-000000000007'::uuid,100::numeric,250::numeric,25000::bigint,25000::bigint)$$,
  'all purchase entry modes store base-unit rates, rounding repeating rates to two places');
select results_eq(
  $$select unit_cost, total_cost from public.inventory_movements
    where source_type='InventoryPurchase' and source_id=(select id::text from decimal_purchase)
    and variant_id='aa240000-0000-4000-8000-000000000005'$$,
  $$values (2.5::numeric,250::bigint)$$,
  'purchase movements retain the per-piece rate of a KES 250 box of 100');
select results_eq(
  $$select average_unit_cost, lowest_unit_cost, highest_unit_cost, last_unit_cost
    from public.supplier_variant_performance
    where variant_id='aa240000-0000-4000-8000-000000000005'$$,
  $$values (2.5::numeric,2.5::numeric,2.5::numeric,2.5::numeric)$$,
  'supplier buying-cost history exposes the same unrounded per-piece rate');

-- FIFO keeps its whole-KES allocation and exact last-batch remainder contract.
create temp table decimal_sales(sequence integer, id uuid);
insert into decimal_sales select 1, public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000005","quantity":1}]',
  '[{"method":"cash","amount":10}]', p_client_ref=>'decimal-first-piece');
select is((select cogs_total from public.order_lines where order_id=(select id from decimal_sales where sequence=1)),
  3::bigint, 'the first KES 2.50 piece posts a whole-KES cost allocation');
select is((select remaining_cost from public.inventory_batches where variant_id='aa240000-0000-4000-8000-000000000005')+
  (select cogs_total from public.order_lines where order_id=(select id from decimal_sales where sequence=1)),
  250::bigint, 'partial sale cost plus remaining value still equals the original box cost');
insert into decimal_sales select 2, public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000005","quantity":1}]',
  '[{"method":"cash","amount":10}]', p_client_ref=>'decimal-second-piece');
insert into decimal_sales select 3, public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000005","quantity":98}]',
  '[{"method":"cash","amount":980}]', p_client_ref=>'decimal-last-pieces');
select results_eq(
  $$select remaining, remaining_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000005'$$,
  $$values (0::numeric,0::bigint)$$, 'exhausting a fractional-cost batch leaves no stranded quantity or value');
select is((select sum(cogs_total) from public.order_lines where order_id in(select id from decimal_sales)),
  250::numeric, 'successive small sales and final exhaustion consume exactly KES 250');
select is(public.post_full_refund((select id from decimal_sales where sequence=1),
  'cash', 'First decimal piece returned', 'return_to_stock')->>'status', 'completed',
  'an individual-piece refund completes after exhaustion');
select is((select remaining_cost from public.inventory_batches where variant_id='aa240000-0000-4000-8000-000000000005'),
  (select cogs_total from public.order_lines where order_id=(select id from decimal_sales where sequence=1)),
  'the refund restores its original rounded allocation, not a recomputed decimal amount');
select public.post_full_refund(id, 'cash', 'Remaining decimal pieces returned', 'return_to_stock')
from decimal_sales where sequence>1 order by sequence;
select results_eq(
  $$select remaining, unit_cost, remaining_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000005'$$,
  $$values (100::numeric,2.5::numeric,250::bigint)$$,
  'all refunds restore the original quantity, decimal rate and exact box value');

create temp table decimal_void_sales(sequence integer, id uuid);
insert into decimal_void_sales select 1, public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000003","quantity":1}]',
  '[{"method":"cash","amount":10}]', p_client_ref=>'decimal-before-void');
insert into decimal_void_sales select 2, public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000003","quantity":1}]',
  '[{"method":"cash","amount":10}]', p_client_ref=>'decimal-void');
select lives_ok($$select public.void_sale((select id from decimal_void_sales where sequence=2),
  'Second decimal piece entered in error')$$, 'void accepts decimal cost allocations');
select results_eq(
  $$select remaining, unit_cost, remaining_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000003'$$,
  $$values (99::numeric,2.5::numeric,247::bigint)$$,
  'void restores the second sale exact KES 2 allocation, not a recomputed KES 3');
select results_eq(
  $$select quantity, unit_cost, total_cost from public.inventory_movements
    where source_type='OrderReversal' and source_id=(select id::text from decimal_void_sales where sequence=2)$$,
  $$values (1::numeric,2.5::numeric,2::bigint)$$,
  'void movements retain decimal rates and original whole-shilling allocations');

-- Use the real exported concurrency fields, including decimal expected costs.
create temp table decimal_batch_change as select jsonb_build_object(
  'action', 'update', 'batch_id', id, 'variant_id', variant_id,
  'stock_location_id', stock_location_id, 'latest', true,
  'expected_remaining', remaining, 'expected_unit_cost', unit_cost,
  'expected_remaining_cost', remaining_cost, 'expected_batch_number', batch_number,
  'expected_expiry_date', expiry_date, 'new_unit_cost', 2.5,
  'new_batch_number', batch_number, 'new_expiry_date', expiry_date, 'quantity_added', 0
) change from public.inventory_batches where variant_id='aa240000-0000-4000-8000-000000000007';
select is(public.apply_catalog_workbook_updates(
  p_batch_changes=>jsonb_build_array((select change from decimal_batch_change)))->>'batch_changes', '1',
  'workbook corrects a box cost mistakenly entered per piece to KES 2.50');
select results_eq(
  $$select unit_cost, original_cost, remaining_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000007'$$,
  $$values (2.5::numeric,250::bigint,250::bigint)$$,
  'decimal workbook correction revalues remaining stock to the exact whole-KES amount');
update decimal_batch_change set change=change || '{"expected_unit_cost":2.5,"expected_remaining_cost":250}'::jsonb;
select lives_ok($$select public.apply_catalog_workbook_updates(
  p_batch_changes=>jsonb_build_array((select change from decimal_batch_change)))$$,
  'a fresh workbook carrying a decimal expected cost is accepted');
select throws_ok($$select public.apply_catalog_workbook_updates(p_batch_changes=>jsonb_build_array(
  (select change from decimal_batch_change) || '{"expected_unit_cost":2.49,"new_unit_cost":3}'::jsonb))$$,
  'P0001', 'stale_catalog_batch_export', 'a sub-shilling stale expected cost cannot pass the concurrency check');
select throws_ok(format(
  'select public.apply_catalog_workbook_updates(p_batch_changes=>jsonb_build_array(%L::jsonb || %L::jsonb))',
  (select change from decimal_batch_change), jsonb_build_object('new_unit_cost', bad.cost)),
  'P0001', 'invalid_batch_change', 'workbook rejects ' || bad.label || ' buying cost')
from (values
  ('-0.1'::jsonb, 'negative'),
  ('"NaN"'::jsonb, 'NaN'),
  ('"Infinity"'::jsonb, 'infinite'),
  ('2.501'::jsonb, 'more than two decimal places')
) bad(cost, label);
select lives_ok($$select public.apply_catalog_workbook_updates(p_batch_changes=>jsonb_build_array(
  (select change from decimal_batch_change) || '{"new_unit_cost":2.12}'::jsonb))$$,
  'an explicit buying cost with two decimal places is accepted');
select is((select unit_cost from public.inventory_batches where variant_id='aa240000-0000-4000-8000-000000000007'),
  2.12::numeric, 'both decimal places survive the workbook write');

create temp table decimal_opening as select public.save_catalog_product_units(
  '{"name":"Decimal opening stock"}',
  '[{"name":"Screws","sku":"DECIMAL-OPENING","price":10,"stock_unit":"piece","opening_quantity":100,"opening_unit_cost":2.5,"packs":[]}]',
  'aa240000-0000-4000-8000-000000000011') id;
select results_eq(
  $$select b.quantity, b.unit_cost, b.original_cost from public.inventory_batches b
    join public.product_variants v on v.id=b.variant_id where v.product_id=(select id from decimal_opening)$$,
  $$values (100::numeric,2.5::numeric,250::bigint)$$,
  'product creation preserves decimal opening cost without inflating stock value');
create temp table decimal_adjustment as select public.post_stock_adjustment(
  'aa240000-0000-4000-8000-000000000008', 0, 100, 'Decimal cost opening count', 2.5) id;
select results_eq(
  $$select quantity, unit_cost, original_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000008'$$,
  $$values (100::numeric,2.5::numeric,250::bigint)$$,
  'stock adjustment accepts the same KES 2.50 per-piece buying cost');
select is((select sum(debit) from public.ledger_journal_lines where entry_id=(select id from decimal_adjustment)),
  250::numeric, 'stock adjustment posts KES 250, not a rounded KES 3 per piece');

-- A real movement can legitimately round to zero money; do not invent a journal.
create temp table decimal_before_zero as select count(*)::integer entries
from public.ledger_journal_entries where company_id=(select id from decimal_company);
select is(public.post_stock_adjustment('aa240000-0000-4000-8000-000000000012', 0, 1,
  'One low-value piece found', 0.25), null::uuid,
  'a sub-shilling stock increase succeeds without a zero-value journal');
select results_eq(
  $$select remaining, unit_cost, remaining_cost from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000012'$$,
  $$values (1::numeric,0.25::numeric,0::bigint)$$,
  'the sub-shilling adjustment retains its quantity and rate despite zero posted value');
select is(public.post_stock_adjustment('aa240000-0000-4000-8000-000000000012', 1, 0,
  'Low-value piece removed'), null::uuid, 'zero-value stock can be counted down again');
select is(public.post_stock_adjustment_at_location(
  (select id from public.stock_locations where company_id=(select id from decimal_company) and is_default),
  'aa240000-0000-4000-8000-000000000012', 0, 1, 'Location low-value piece found', 0.25),
  null::uuid, 'location-specific stock adjustment also accepts a zero-value increase');
select results_eq(
  $$select quantity, unit_cost, total_cost from public.inventory_movements
    where variant_id='aa240000-0000-4000-8000-000000000012' order by quantity$$,
  $$values (-1::numeric,0.25::numeric,0::bigint),(1::numeric,0.25::numeric,0::bigint),
    (1::numeric,0.25::numeric,0::bigint)$$,
  'all zero-value adjustments still leave exact movement records');
select lives_ok($$select public.apply_catalog_workbook_updates(
  p_variant_changes=>jsonb_build_array(jsonb_build_object(
    'variant_id','aa240000-0000-4000-8000-000000000013',
    'stock_location_id',(select id from public.stock_locations where company_id=(select id from decimal_company) and is_default),
    'expected_stock_quantity',0,'new_stock_quantity',1)),
  p_batch_changes=>jsonb_build_array(
  jsonb_build_object('action','create','variant_id','aa240000-0000-4000-8000-000000000013',
    'stock_location_id',(select id from public.stock_locations where company_id=(select id from decimal_company) and is_default),
    'latest',true,'expected_remaining',0,'expected_unit_cost',0,'expected_remaining_cost',0,
    'expected_batch_number',null,'expected_expiry_date',null,'new_unit_cost',0.25,
    'new_batch_number',null,'new_expiry_date',null,'quantity_added',1)))$$,
  'workbook can add a single piece at KES 0.25 without posting a zero journal');
select is(public.post_inventory_write_off('aa240000-0000-4000-8000-000000000013', 1,
  'Low-value workbook stock removed'), null::uuid, 'zero-value workbook stock can be written off');
select results_eq(
  $$select quantity, unit_cost, total_cost, meta->>'reason' from public.inventory_movements
    where variant_id='aa240000-0000-4000-8000-000000000013' order by quantity$$,
  $$values (-1::numeric,0.25::numeric,0::bigint,'Low-value workbook stock removed'::text),
    (1::numeric,0.25::numeric,0::bigint,'Bulk product workbook'::text)$$,
  'workbook increments and write-offs retain rates, quantities and reasons');
select is((select count(*)::integer from public.ledger_journal_entries where company_id=(select id from decimal_company)),
  (select entries from decimal_before_zero), 'zero-value inventory movements do not manufacture ledger money');

create temp table decimal_zero_sale as select public.post_sale(null,
  '[{"variant_id":"aa240000-0000-4000-8000-000000000012","quantity":1}]',
  '[{"method":"cash","amount":10}]', p_client_ref=>'decimal-zero-cogs-void') id;
select is((select cogs_total from public.order_lines where order_id=(select id from decimal_zero_sale)),
  0::bigint, 'a sub-shilling piece can sell with zero whole-KES COGS');
select lives_ok($$select public.void_sale((select id from decimal_zero_sale),
  'Zero-cost sale entered in error')$$, 'zero-COGS sale can be voided without a COGS journal');
select results_eq(
  $$select sum(remaining), sum(remaining_cost) from public.inventory_batches
    where variant_id='aa240000-0000-4000-8000-000000000012'$$,
  $$values (1::numeric,0::numeric)$$, 'zero-COGS void still restores the sold piece');
select results_eq(
  $$select quantity, unit_cost, total_cost from public.inventory_movements
    where source_type='OrderReversal' and source_id=(select id::text from decimal_zero_sale)$$,
  $$values (1::numeric,0.25::numeric,0::bigint)$$,
  'zero-COGS void preserves the decimal reversal movement');

-- Enable VAT only for these invoice fixtures; historical sale snapshots are unchanged.
reset role;
update public.company_tax_profiles profile set vat_registered=true,
  tax_registration_number='P051234567A', default_tax_category_id=category.id,
  effective_from=current_date-100
from public.tax_categories category join public.tax_jurisdictions jurisdiction
  on jurisdiction.id=category.jurisdiction_id
where profile.company_id=(select id from decimal_company)
  and profile.jurisdiction_id=jurisdiction.id and jurisdiction.country_code='KE' and category.code='STANDARD';
update public.customers set tax_registration_number='P009999999Z'
where id='aa240000-0000-4000-8000-000000000010';
set local role authenticated;
create temp table decimal_vat_inclusive as select public.record_purchase_complete_with_tax(
  'aa240000-0000-4000-8000-000000000010',
  '[{"variant_id":"aa240000-0000-4000-8000-000000000004","quantity":100,"unit_cost":2.5}]',
  p_reference=>'DECIMAL-VAT-INCLUSIVE', p_claim_input_vat=>true, p_tax_invoice_date=>current_date) id;
select results_eq(
  $$select p.gross_total,p.net_total,p.input_tax_total,l.unit_cost,b.unit_cost,b.original_cost
    from public.purchases p join public.purchase_lines l on l.purchase_id=p.id
    join public.inventory_batches b on b.id=l.inventory_batch_id
    where p.id=(select id from decimal_vat_inclusive)$$,
  $$values (250::bigint,216::bigint,34::bigint,2.5::numeric,2.16::numeric,216::bigint)$$,
  'VAT-inclusive decimal invoice preserves the entered rate and rounded net inventory value');
create temp table decimal_vat_exclusive_draft as select public.save_purchase_workspace_draft(
  'aa240000-0000-4000-8000-000000000010',
  '[{"variant_id":"aa240000-0000-4000-8000-000000000004","quantity":100,"unit_cost":2.9,
    "value_source":"unit","price_entry_basis":"exclusive","entered_value_source":"unit","entered_unit_cost":2.5}]',
  '[]','DECIMAL-VAT-EXCLUSIVE',null,current_date,
  (select id from public.stock_locations where company_id=(select id from decimal_company) and is_default),
  'later',0,0,null,'decimal-exclusive-draft',null,true,current_date) id;
create temp table decimal_vat_exclusive as select public.finalize_purchase_draft(
  (select id from decimal_vat_exclusive_draft)) id;
select results_eq(
  $$select p.gross_total,p.net_total,p.input_tax_total,l.unit_cost,b.unit_cost,b.original_cost,p.price_entry_basis
    from public.purchases p join public.purchase_lines l on l.purchase_id=p.id
    join public.inventory_batches b on b.id=l.inventory_batch_id
    where p.id=(select id from decimal_vat_exclusive)$$,
  $$values (290::bigint,250::bigint,40::bigint,2.9::numeric,2.5::numeric,250::bigint,'exclusive'::text)$$,
  'VAT-exclusive KES 2.50 per piece finalizes with exact KES 250 net inventory and KES 40 tax');
select is((select sum(debit)-sum(credit) from public.ledger_journal_lines
  where company_id=(select id from decimal_company)), 0::numeric,
  'purchase, sales, refunds, corrections and stock adjustments remain balanced');

select * from finish();
rollback;
