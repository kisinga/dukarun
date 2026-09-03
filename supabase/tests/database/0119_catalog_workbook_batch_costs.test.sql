begin;
select plan(26);

select hasnt_function(
  'public', 'apply_catalog_workbook_updates', array['jsonb','jsonb','jsonb','uuid'],
  'the superseded workbook RPC signature is removed'
);
select has_function(
  'public', 'apply_catalog_workbook_updates', array['jsonb','jsonb','jsonb','jsonb','uuid'],
  'the unified workbook RPC accepts batch cost changes'
);
select hasnt_function(
  'public', 'apply_catalog_batch_cost_updates', array['jsonb'],
  'there is no separate batch-only workbook RPC'
);

select testkit.create_user('92929292-9292-4292-8292-929292929291', 'batch-cost-admin@local.test');
select testkit.create_user('92929292-9292-4292-8292-929292929292', 'batch-cost-catalog@local.test');
select testkit.create_user('92929292-9292-4292-8292-929292929293', 'batch-cost-stock@local.test');
create temp table batch_cost_company as
select testkit.provision(
  '92929292-9292-4292-8292-929292929291', 'Batch Cost Workbook Co'
) company_id;
grant select on pg_temp.batch_cost_company to authenticated;
select testkit.add_member(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929292',
  'Catalog manager',
  array['ManageCatalog']
);
select testkit.add_member(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929293',
  'Stock manager',
  array['ManageCatalog', 'ManageStockAdjustments']
);

select testkit.as_user(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929291',
  'Admin'
);

create temp table batch_cost_product as
select public.create_catalog_product(
  'Cost Correction Tea',
  '[{"name":"250g","sku":"BATCH-COST-TEA","price":100}]'
) product_id;
create temp table precise_product as
select public.create_catalog_product(
  'Precise Cost Flour',
  '[{"name":"Default","sku":"PRECISE-COST-FLOUR","price":100}]'
) product_id;

set local role postgres;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, batch_number,
  quantity, remaining, unit_cost, original_cost, remaining_cost
)
select '92929292-9292-4292-8292-9292929292b1', company.company_id,
  variant.id, location.id, 'PO-ZERO', 10, 6, 0, 0, 0
from batch_cost_company company
join public.product_variants variant
  on variant.company_id = company.company_id and variant.sku = 'BATCH-COST-TEA'
join public.stock_locations location
  on location.company_id = company.company_id and location.is_default;

create temp table editable_batch as
select id, variant_id, stock_location_id
from public.inventory_batches
where id = '92929292-9292-4292-8292-9292929292b1';
grant select on pg_temp.editable_batch to authenticated;

insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, batch_number,
  quantity, remaining, unit_cost, original_cost, remaining_cost
)
select '92929292-9292-4292-8292-9292929292b2', company.company_id,
  variant.id, location.id, 'PO-EMPTY', 2, 0, 30, 60, 0
from batch_cost_company company
join public.product_variants variant
  on variant.company_id = company.company_id and variant.sku = 'BATCH-COST-TEA'
join public.stock_locations location
  on location.company_id = company.company_id and location.is_default;

create temp table exhausted_batch as
select id, variant_id, stock_location_id
from public.inventory_batches
where id = '92929292-9292-4292-8292-9292929292b2';
grant select on pg_temp.exhausted_batch to authenticated;

update public.companies
set batch_expiry_enabled = true
where id = (select company_id from batch_cost_company);
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, batch_number, purchased_at,
  quantity, remaining, unit_cost, original_cost, remaining_cost, expiry_date
)
select '92929292-9292-4292-8292-9292929292b3', company.company_id,
  variant.id, location.id, 'PO-PRECISE', '2025-01-01T00:00:00Z',
  3, 3, 33, 100, 100, '2027-01-31'
from batch_cost_company company
join public.product_variants variant
  on variant.company_id = company.company_id and variant.sku = 'PRECISE-COST-FLOUR'
join public.stock_locations location
  on location.company_id = company.company_id and location.is_default;
insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, batch_number, purchased_at,
  quantity, remaining, unit_cost, original_cost, remaining_cost
)
select '92929292-9292-4292-8292-9292929292b4', company.company_id,
  variant.id, location.id, 'PO-PRECISE-LATEST', '2026-01-01T00:00:00Z',
  1, 1, 10, 10, 10
from batch_cost_company company
join public.product_variants variant
  on variant.company_id = company.company_id and variant.sku = 'PRECISE-COST-FLOUR'
join public.stock_locations location
  on location.company_id = company.company_id and location.is_default;
update public.companies
set batch_expiry_enabled = false
where id = (select company_id from batch_cost_company);

create temp table precise_older_batch as
select id, variant_id, stock_location_id
from public.inventory_batches
where id = '92929292-9292-4292-8292-9292929292b3';
grant select on pg_temp.precise_older_batch to authenticated;
set local role authenticated;

create temp table batch_cost_result as
select public.apply_catalog_workbook_updates(
  p_batch_changes => jsonb_build_array(jsonb_build_object(
    'action', 'update',
    'batch_id', (select id from editable_batch),
    'variant_id', (select variant_id from editable_batch),
    'stock_location_id', (select stock_location_id from editable_batch),
    'latest', true,
    'expected_remaining', 6,
    'expected_unit_cost', 0,
    'expected_remaining_cost', 0,
    'expected_batch_number', 'PO-ZERO',
    'expected_expiry_date', null,
    'new_unit_cost', 60,
    'new_batch_number', 'PO-CORRECTED',
    'new_expiry_date', null,
    'quantity_added', 0
  ))
) result;

select is(
  (select (result ->> 'batch_changes')::integer from batch_cost_result), 1,
  'the workbook reports one corrected batch'
);
select is(
  (select unit_cost from public.inventory_batches where id = (select id from editable_batch)),
  60::bigint,
  'the open batch unit cost is corrected'
);
select is(
  (select remaining_cost from public.inventory_batches where id = (select id from editable_batch)),
  360::bigint,
  'only currently remaining stock is revalued in inventory'
);
select is(
  (select original_cost from public.inventory_batches where id = (select id from editable_batch)),
  360::bigint,
  'the batch basis changes only for stock that remains'
);
select is(
  (select batch_number from public.inventory_batches where id = (select id from editable_batch)),
  'PO-CORRECTED',
  'the same canonical batch receives its metadata correction'
);
select is(
  (select count(*)::integer from public.ledger_journal_entries
   where company_id = (select company_id from batch_cost_company)
     and source_type = 'InventoryBatchCostCorrection'),
  1,
  'the valuation correction creates one journal entry'
);
select is(
  (select line.debit
   from public.ledger_journal_entries entry
   join public.ledger_journal_lines line on line.entry_id = entry.id
   join public.ledger_accounts account on account.id = line.account_id
   where entry.company_id = (select company_id from batch_cost_company)
     and entry.source_type = 'InventoryBatchCostCorrection'
     and account.code = 'INVENTORY'),
  360::bigint,
  'the ledger records the exact remaining-stock value increase'
);

select throws_ok(
  $$select public.apply_catalog_workbook_updates(
    p_batch_changes => jsonb_build_array(jsonb_build_object(
      'action', 'update',
      'batch_id', (select id from editable_batch),
      'variant_id', (select variant_id from editable_batch),
      'stock_location_id', (select stock_location_id from editable_batch),
      'latest', true,
      'expected_remaining', 6,
      'expected_unit_cost', 0,
      'expected_remaining_cost', 0,
      'expected_batch_number', 'PO-ZERO',
      'expected_expiry_date', null,
      'new_unit_cost', 70,
      'new_batch_number', 'PO-CORRECTED',
      'new_expiry_date', null,
      'quantity_added', 0
    ))
  )$$,
  'P0001', 'stale_catalog_batch_export',
  'a stale batch value is rejected'
);

select throws_ok(
  $$select public.apply_catalog_workbook_updates(
    p_batch_changes => jsonb_build_array(jsonb_build_object(
      'action', 'update',
      'batch_id', (select id from exhausted_batch),
      'variant_id', (select variant_id from exhausted_batch),
      'stock_location_id', (select stock_location_id from exhausted_batch),
      'latest', false,
      'expected_remaining', 1,
      'expected_unit_cost', 30,
      'expected_remaining_cost', 0,
      'expected_batch_number', 'PO-EMPTY',
      'expected_expiry_date', null,
      'new_unit_cost', 40,
      'new_batch_number', 'PO-EMPTY',
      'new_expiry_date', null,
      'quantity_added', 0
    ))
  )$$,
  'P0001', 'stale_catalog_batch_export',
  'an exhausted batch cannot be corrected'
);

select throws_ok(
  $$select public.apply_catalog_workbook_updates(
    p_variant_changes => jsonb_build_array(jsonb_build_object(
      'variant_id', (select variant_id from editable_batch),
      'expected_updated_at', 'not-a-time',
      'new_retail_price', 120
    )),
    p_batch_changes => jsonb_build_array(jsonb_build_object(
      'action', 'update',
      'batch_id', (select id from editable_batch),
      'variant_id', (select variant_id from editable_batch),
      'stock_location_id', (select stock_location_id from editable_batch),
      'latest', true,
      'expected_remaining', 6,
      'expected_unit_cost', 60,
      'expected_remaining_cost', 360,
      'expected_batch_number', 'PO-CORRECTED',
      'expected_expiry_date', null,
      'new_unit_cost', 70,
      'new_batch_number', 'PO-CORRECTED',
      'new_expiry_date', null,
      'quantity_added', 0
    ))
  )$$,
  'P0001', 'invalid_price_change',
  'a later workbook error rolls back the batch correction'
);
select is(
  (select unit_cost from public.inventory_batches where id = (select id from editable_batch)),
  60::bigint,
  'a failed unified workbook leaves the batch unchanged'
);
select is(
  (select count(*)::integer from public.ledger_journal_entries
   where company_id = (select company_id from batch_cost_company)
     and source_type = 'InventoryBatchCostCorrection'),
  1,
  'a failed unified workbook leaves no correction ledger entry'
);

select testkit.as_user(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929292',
  'Catalog manager'
);

select throws_ok(
  $$select public.apply_catalog_workbook_updates(
    p_batch_changes => jsonb_build_array(jsonb_build_object(
      'action', 'update',
      'batch_id', (select id from editable_batch),
      'variant_id', (select variant_id from editable_batch),
      'stock_location_id', (select stock_location_id from editable_batch),
      'latest', true,
      'expected_remaining', 6,
      'expected_unit_cost', 60,
      'expected_remaining_cost', 360,
      'expected_batch_number', 'PO-CORRECTED',
      'expected_expiry_date', null,
      'new_unit_cost', 70,
      'new_batch_number', 'PO-CORRECTED',
      'new_expiry_date', null,
      'quantity_added', 0
    ))
  )$$,
  'P0001', 'permission_denied: ManageStockAdjustments required',
  'batch cost corrections require stock-adjustment permission'
);

select testkit.as_user(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929293',
  'Stock manager'
);

select throws_ok(
  $$select public.apply_catalog_workbook_updates(
    p_batch_changes => jsonb_build_array(jsonb_build_object(
      'action', 'update',
      'batch_id', (select id from editable_batch),
      'variant_id', (select variant_id from editable_batch),
      'stock_location_id', (select stock_location_id from editable_batch),
      'latest', true,
      'expected_remaining', 6,
      'expected_unit_cost', 60,
      'expected_remaining_cost', 360,
      'expected_batch_number', 'PO-CORRECTED',
      'expected_expiry_date', null,
      'new_unit_cost', 70,
      'new_batch_number', 'PO-CORRECTED',
      'new_expiry_date', null,
      'quantity_added', 0
    ))
  )$$,
  'P0001', 'permission_denied: ViewFinancials required',
  'batch cost corrections require financial access'
);

select testkit.as_user(
  (select company_id from batch_cost_company),
  '92929292-9292-4292-8292-929292929291',
  'Admin'
);

create temp table metadata_only_result as
select public.apply_catalog_workbook_updates(
  p_batch_changes => jsonb_build_array(jsonb_build_object(
    'action', 'update',
    'batch_id', (select id from precise_older_batch),
    'variant_id', (select variant_id from precise_older_batch),
    'stock_location_id', (select stock_location_id from precise_older_batch),
    'latest', false,
    'expected_remaining', 3,
    'expected_unit_cost', 33,
    'expected_remaining_cost', 100,
    'expected_batch_number', 'PO-PRECISE',
    'expected_expiry_date', '2027-01-31',
    'new_unit_cost', 33,
    'new_batch_number', 'PO-PRECISE-RENAMED',
    'new_expiry_date', '2027-01-31',
    'quantity_added', 0
  ))
) result;

select is(
  (select (result ->> 'batches_updated')::integer from metadata_only_result), 1,
  'an older open batch can be identified and updated from the Batches sheet'
);
select results_eq(
  $$select original_cost,remaining_cost,batch_number,expiry_date
    from public.inventory_batches where id = '92929292-9292-4292-8292-9292929292b3'$$,
  $$values (100::bigint,100::bigint,'PO-PRECISE-RENAMED'::text,'2027-01-31'::date)$$,
  'metadata-only edits preserve precise value and retained expiry history'
);

create temp table linked_increase_result as
select public.apply_catalog_workbook_updates(
  p_variant_changes => jsonb_build_array(jsonb_build_object(
    'variant_id', (select variant_id from editable_batch),
    'expected_updated_at', (select updated_at::text from public.product_variants
      where id = (select variant_id from editable_batch)),
    'stock_location_id', (select stock_location_id from editable_batch),
    'expected_stock_quantity', 6,
    'new_stock_quantity', 8
  )),
  p_batch_changes => jsonb_build_array(jsonb_build_object(
    'action', 'update',
    'batch_id', (select id from editable_batch),
    'variant_id', (select variant_id from editable_batch),
    'stock_location_id', (select stock_location_id from editable_batch),
    'latest', true,
    'expected_remaining', 6,
    'expected_unit_cost', 60,
    'expected_remaining_cost', 360,
    'expected_batch_number', 'PO-CORRECTED',
    'expected_expiry_date', null,
    'new_unit_cost', 70,
    'new_batch_number', 'COUNT-LATEST',
    'new_expiry_date', null,
    'quantity_added', 2
  ))
) result;

select is(
  (select (result ->> 'stock_changes')::integer from linked_increase_result), 1,
  'a linked latest-batch increase reports one stock change'
);
select is(
  (select (result ->> 'batches_updated')::integer from linked_increase_result), 1,
  'a stock increase updates rather than replacing the latest batch'
);
select results_eq(
  $$select quantity,remaining,unit_cost,original_cost,remaining_cost,batch_number
    from public.inventory_batches where id = '92929292-9292-4292-8292-9292929292b1'$$,
  $$values (12::numeric,8::numeric,70::bigint,560::bigint,560::bigint,'COUNT-LATEST'::text)$$,
  'the added quantity, corrected cost, and metadata share one canonical batch row'
);
select is(
  (select count(*)::integer from public.inventory_movements
   where batch_id = (select id from editable_batch) and quantity = 2),
  1,
  'the stock-increase movement links to that same latest batch'
);

create temp table no_batch_product as
select public.create_catalog_product(
  'No Batch Coffee',
  '[{"name":"Default","sku":"NO-BATCH-COFFEE","price":100}]'
) product_id;
create temp table no_batch_variant as
select variant.id variant_id, location.id stock_location_id
from no_batch_product product
join public.product_variants variant on variant.product_id = product.product_id
join public.stock_locations location
  on location.company_id = variant.company_id and location.is_default;

create temp table created_batch_result as
select public.apply_catalog_workbook_updates(
  p_variant_changes => jsonb_build_array(jsonb_build_object(
    'variant_id', (select variant_id from no_batch_variant),
    'expected_updated_at', (select updated_at::text from public.product_variants
      where id = (select variant_id from no_batch_variant)),
    'stock_location_id', (select stock_location_id from no_batch_variant),
    'expected_stock_quantity', 0,
    'new_stock_quantity', 3
  )),
  p_batch_changes => jsonb_build_array(jsonb_build_object(
    'action', 'create',
    'variant_id', (select variant_id from no_batch_variant),
    'stock_location_id', (select stock_location_id from no_batch_variant),
    'latest', true,
    'expected_remaining', 0,
    'expected_unit_cost', 0,
    'expected_remaining_cost', 0,
    'expected_batch_number', null,
    'expected_expiry_date', null,
    'new_unit_cost', 75,
    'new_batch_number', 'COUNT-NEW',
    'new_expiry_date', null,
    'quantity_added', 3
  ))
) result;

select is(
  (select (result ->> 'batches_created')::integer from created_batch_result), 1,
  'an increase with no open batch reports one newly created latest batch'
);
select results_eq(
  $$select quantity,remaining,unit_cost,original_cost,remaining_cost,batch_number
    from public.inventory_batches
    where variant_id = (select variant_id from no_batch_variant)$$,
  $$values (3::numeric,3::numeric,75::bigint,225::bigint,225::bigint,'COUNT-NEW'::text)$$,
  'the dynamically created batch carries the entered quantity, price, and number'
);
select is(
  (select count(*)::integer from public.audit_log
   where company_id = (select company_id from batch_cost_company)
     and table_name = 'inventory_batches'),
  4,
  'every workbook batch mutation is recorded in the audit trail'
);

select * from finish();
rollback;
