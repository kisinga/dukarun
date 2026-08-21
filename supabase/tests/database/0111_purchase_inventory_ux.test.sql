begin;
select plan(14);

select testkit.create_user('11110000-0000-4000-8000-000000000001', 'inventory-ux@test.local');
select testkit.create_user('11110000-0000-4000-8000-000000000002', 'inventory-viewer@test.local');

create temp table inventory_ux_company as
select testkit.provision(
  '11110000-0000-4000-8000-000000000001',
  'Inventory UX Co'
) as company_id;
grant select on pg_temp.inventory_ux_company to authenticated;

select testkit.add_member(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000002',
  'Inventory Viewer',
  array[]::text[]
);

create temp table inventory_ux_location as
select id as location_id
from public.stock_locations
where company_id = (select company_id from inventory_ux_company)
order by is_default desc, created_at
limit 1;
grant select on pg_temp.inventory_ux_location to authenticated;

insert into public.stock_locations(id, company_id, name, code, is_default)
select
  '11110000-0000-4000-8000-000000000003',
  company_id,
  'Overflow',
  'UX-OVERFLOW',
  false
from inventory_ux_company;

insert into public.company_membership_locations(company_id, membership_id, location_id, is_primary)
select
  company.company_id,
  membership.id,
  '11110000-0000-4000-8000-000000000003',
  false
from inventory_ux_company company
join public.company_memberships membership
  on membership.company_id = company.company_id
 and membership.user_id = '11110000-0000-4000-8000-000000000001'
on conflict (membership_id, location_id) do nothing;

create function pg_temp.consume_inventory_ux_as_owner(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.consume_fifo(
    p_company_id,
    p_variant_id,
    p_quantity,
    'SupplierStockTest',
    'supplier-stock-reversal'
  )
$$;
grant execute on function pg_temp.consume_inventory_ux_as_owner(uuid, uuid, numeric)
  to authenticated;

create function pg_temp.restore_inventory_ux_as_owner(
  p_batch_id uuid,
  p_quantity numeric,
  p_total_cost bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.inventory_batches%rowtype;
begin
  update public.inventory_batches
  set remaining = remaining + p_quantity
  where id = p_batch_id
  returning * into v_batch;

  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type,
    quantity, unit_cost, total_cost, source_type, source_id
  ) values (
    v_batch.company_id, v_batch.variant_id, v_batch.id, v_batch.stock_location_id, 'reversal',
    p_quantity, v_batch.unit_cost, p_total_cost, 'OrderReversal', 'supplier-stock-reversal'
  );
end;
$$;
grant execute on function pg_temp.restore_inventory_ux_as_owner(uuid, numeric, bigint)
  to authenticated;

select function_privs_are(
  'public',
  'supplier_stock_by_variant',
  array['uuid', 'uuid'],
  'authenticated',
  array['EXECUTE'],
  'authenticated members may use the company-scoped supplier stock function'
);

select function_privs_are(
  'public',
  'supplier_stock_by_variant',
  array['uuid', 'uuid'],
  'anon',
  array[]::text[],
  'anonymous callers cannot execute the supplier stock function'
);

insert into public.products(id, company_id, name)
select '11110000-0000-4000-8000-000000000010', company_id, 'Tea'
from inventory_ux_company;

insert into public.product_variants(id, product_id, company_id, name, sku, price)
select
  '11110000-0000-4000-8000-000000000011',
  '11110000-0000-4000-8000-000000000010',
  company_id,
  'Default',
  'UX-TEA',
  150
from inventory_ux_company;

insert into public.customers(id, company_id, first_name, is_supplier)
select '11110000-0000-4000-8000-000000000020'::uuid, company_id, 'Primary supplier', true
from inventory_ux_company
union all
select '11110000-0000-4000-8000-000000000021'::uuid, company_id, 'Other supplier', true
from inventory_ux_company;

insert into public.inventory_batches(
  id, company_id, variant_id, stock_location_id, supplier_id,
  quantity, remaining, unit_cost, original_cost, remaining_cost
)
select
  batch_id,
  company_id,
  '11110000-0000-4000-8000-000000000011',
  (select location_id from inventory_ux_location),
  supplier_id,
  quantity,
  remaining,
  unit_cost,
  quantity * unit_cost,
  remaining * unit_cost
from inventory_ux_company
cross join (values
  ('11110000-0000-4000-8000-000000000031'::uuid,
   '11110000-0000-4000-8000-000000000020'::uuid, 10::numeric, 4::numeric, 100::bigint),
  ('11110000-0000-4000-8000-000000000032'::uuid,
   '11110000-0000-4000-8000-000000000020'::uuid, 5::numeric, 5::numeric, 120::bigint),
  ('11110000-0000-4000-8000-000000000033'::uuid,
   '11110000-0000-4000-8000-000000000020'::uuid, 3::numeric, 0::numeric, 90::bigint),
  ('11110000-0000-4000-8000-000000000034'::uuid,
   '11110000-0000-4000-8000-000000000021'::uuid, 8::numeric, 8::numeric, 80::bigint)
) batches(batch_id, supplier_id, quantity, remaining, unit_cost);

-- The purchase location trigger checks the caller's company and location access.
-- Keep the fixture inserts owner-driven while preserving realistic auth claims.
select testkit.as_user(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000001',
  'Admin'
);
reset role;

insert into public.purchases(
  id, company_id, supplier_id, stock_location_id, total_cost, reference, status
)
select purchase_id, company_id, '11110000-0000-4000-8000-000000000020',
  (select location_id from inventory_ux_location), total_cost, reference, status
from inventory_ux_company
cross join (values
  ('11110000-0000-4000-8000-000000000041'::uuid, 200::bigint, 'POSTED', 'posted'::text),
  ('11110000-0000-4000-8000-000000000042'::uuid, 900::bigint, 'REVERSED', 'reversed'::text)
) purchases(purchase_id, total_cost, reference, status);

insert into public.purchase_lines(
  id, company_id, purchase_id, variant_id, quantity, unit_cost, line_total
)
select line_id, company_id, purchase_id, '11110000-0000-4000-8000-000000000011',
  2, unit_cost, unit_cost * 2
from inventory_ux_company
cross join (values
  ('11110000-0000-4000-8000-000000000051'::uuid,
   '11110000-0000-4000-8000-000000000041'::uuid, 100::bigint),
  ('11110000-0000-4000-8000-000000000052'::uuid,
   '11110000-0000-4000-8000-000000000042'::uuid, 450::bigint)
) lines(line_id, purchase_id, unit_cost);

select testkit.as_user(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000001',
  'Admin'
);

select is(
  (select stock from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )),
  9::numeric,
  'supplier stock aggregates only batches with remaining quantity'
);

select is(
  (select stock_value from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )),
  1000::bigint,
  'supplier stock uses the exact remaining batch cost'
);

select is(
  (select count(*)::int from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000021',
    (select location_id from inventory_ux_location)
  )),
  1,
  'supplier stock is isolated by supplier'
);

select throws_ok(
  $$select * from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000099',
    (select location_id from inventory_ux_location)
  )$$,
  'P0001',
  'supplier_not_found',
  'unknown suppliers are rejected before inventory is read'
);

select is(
  (select count(*)::int from public.purchase_history
   where id in (
     '11110000-0000-4000-8000-000000000041',
     '11110000-0000-4000-8000-000000000042'
   )),
  2,
  'purchase history keeps posted and reversed documents addressable'
);

select is(
  (select purchase_count::int from public.supplier_purchase_metrics
   where supplier_id = '11110000-0000-4000-8000-000000000020'),
  1,
  'supplier metrics exclude reversed purchases'
);

select results_eq(
  $$select purchase_count::int, last_unit_cost
    from public.supplier_variant_performance
    where supplier_id = '11110000-0000-4000-8000-000000000020'
      and variant_id = '11110000-0000-4000-8000-000000000011'$$,
  $$values (1, 100::bigint)$$,
  'supplier price history excludes reversed purchases'
);

select testkit.as_user(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000002',
  'Inventory Viewer'
);

select is(
  (select stock from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )),
  9::numeric,
  'members without financial access can still use supplier quantity'
);

select is(
  (select stock_value from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )),
  null::bigint,
  'members without ViewFinancials cannot read supplier stock value'
);

select testkit.as_user(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000001',
  'Admin'
);

select public.transfer_stock(
  (select location_id from inventory_ux_location),
  '11110000-0000-4000-8000-000000000003',
  '[{"variant_id":"11110000-0000-4000-8000-000000000011","quantity":2}]',
  'Supplier attribution test'
);

select results_eq(
  $$select location_name, stock, stock_value
    from (values
      ('Destination'::text, '11110000-0000-4000-8000-000000000003'::uuid),
      ('Source'::text, (select location_id from inventory_ux_location))
    ) locations(location_name, location_id)
    cross join lateral public.supplier_stock_by_variant(
      '11110000-0000-4000-8000-000000000020', locations.location_id
    )
    order by location_name$$,
  $$values
    ('Destination'::text, 2::numeric, 200::bigint),
    ('Source'::text, 7::numeric, 800::bigint)$$,
  'supplier attribution and exact value survive a location transfer'
);

select pg_temp.consume_inventory_ux_as_owner(
  (select company_id from inventory_ux_company),
  '11110000-0000-4000-8000-000000000011',
  1
);

select results_eq(
  $$select stock, stock_value from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )$$,
  $$values (6::numeric, 700::bigint)$$,
  'supplier totals follow FIFO depletion'
);

select pg_temp.restore_inventory_ux_as_owner(
  '11110000-0000-4000-8000-000000000031',
  1,
  100
);

select results_eq(
  $$select stock, stock_value from public.supplier_stock_by_variant(
    '11110000-0000-4000-8000-000000000020',
    (select location_id from inventory_ux_location)
  )$$,
  $$values (7::numeric, 800::bigint)$$,
  'supplier totals restore quantity and exact value after reversal'
);

select * from finish();
rollback;
