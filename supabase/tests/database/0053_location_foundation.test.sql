begin;
select plan(15);

create temp table location_company as
select id as company_id from public.companies where name = 'Mama Mboga Stores';
grant select on pg_temp.location_company to authenticated;

select testkit.as_user(
  (select company_id from location_company),
  '5877ac73-ff8d-457c-afcd-791e66229d17',
  'Admin'
);

select is(
  (select count(*)::int from public.accessible_business_locations()),
  3,
  'user sees all assigned business locations'
);

select ok(
  public.current_user_can_access_location(
    (select id from public.stock_locations
     where company_id = (select company_id from location_company) and code = 'WESTLANDS')
  ),
  'location access is server validated'
);

select is(
  (select count(*)::int from public.available_payment_methods(
    (select id from public.stock_locations
     where company_id = (select company_id from location_company) and code = 'WESTLANDS')
  )),
  4,
  'all company payment methods initially span Westlands'
);

select is(
  (select reconciliation_type from public.available_payment_methods(
    (select id from public.stock_locations
     where company_id = (select company_id from location_company) and code = 'WESTLANDS')
  ) where code = 'bank'),
  'statement_match',
  'bank method exposes its statement_match reconciliation type'
);

select public.set_payment_method_locations(
  'cash',
  array[(select id from public.stock_locations
         where company_id = (select company_id from location_company) and code = 'MAIN')],
  false
);

select is(
  (select count(*)::int from public.available_payment_methods(
    (select id from public.stock_locations
     where company_id = (select company_id from location_company) and code = 'WESTLANDS')
  ) where code = 'cash'),
  0,
  'payment method may be limited to selected locations'
);

create temp table west_draft as
select public.save_draft_at_location(
  (select id from public.stock_locations
   where company_id = (select company_id from location_company) and code = 'WESTLANDS'),
  null,
  '[{"variant_id":"dd000000-0000-0000-0000-000000000004","quantity":1,"unit_price":5000}]',
  null
) as order_id;
grant select on pg_temp.west_draft to authenticated;

select is(
  (select l.code from public.orders o join public.stock_locations l on l.id = o.location_id
   where o.id = (select order_id from west_draft)),
  'WESTLANDS',
  'sale root keeps explicit business location'
);

select is(
  ((public.dashboard_location_snapshot(
    (now() at time zone 'Africa/Nairobi')::date - 6,
    null
  ) -> 'locations')::jsonb #>> '{}') is not null,
  true,
  'consolidated dashboard returns a location collection'
);

select is(
  jsonb_array_length(public.dashboard_location_snapshot(
    (now() at time zone 'Africa/Nairobi')::date - 6,
    null
  ) -> 'locations'),
  3,
  'consolidated dashboard includes all accessible locations'
);

create temp table test_transfer as
select public.transfer_stock(
  (select id from public.stock_locations
   where company_id = (select company_id from location_company) and code = 'WESTLANDS'),
  (select id from public.stock_locations
   where company_id = (select company_id from location_company) and code = 'MAIN'),
  '[{"variant_id":"dd000000-0000-0000-0000-000000000001","quantity":2}]',
  'Restock main'
) as transfer_id;
grant select on pg_temp.test_transfer to authenticated;

select ok((select transfer_id is not null from test_transfer), 'stock transfer is recorded');

select results_eq(
  $$select l.code::text, sum(b.remaining)::numeric
    from public.inventory_batches b
    join public.stock_locations l on l.id = b.stock_location_id
    where b.variant_id = 'dd000000-0000-0000-0000-000000000001'
      and l.code in ('MAIN', 'WESTLANDS')
    group by l.code order by l.code$$,
  $$values ('MAIN'::text, 32::numeric), ('WESTLANDS'::text, 6::numeric)$$,
  'transfer moves quantity between locations'
);

select is(
  (select sum(remaining)::numeric from public.inventory_batches
   where variant_id = 'dd000000-0000-0000-0000-000000000001'),
  50::numeric,
  'transfer preserves company-wide stock quantity'
);

select is(
  (select count(*)::int from public.inventory_movements
   where source_type = 'StockTransfer'
     and source_id = (select transfer_id::text from test_transfer)),
  2,
  'transfer records balanced source and destination movements'
);

select is(
  (public.current_entitlements() -> 'settings' ->> 'commissionsEnabled')::boolean,
  true,
  'entitlements expose commission opt-in separately from tier capability'
);

select public.set_commissions_enabled(false);

select throws_ok(
  $$select * from public.list_commission_periods()$$,
  'P0001',
  'feature_unavailable: enable commissions on an eligible plan',
  'commission RPCs reject access after company opt-out'
);

select public.set_commissions_enabled(true);

select ok(
  (public.current_entitlements() -> 'features' ->> 'staffPerformance')::boolean,
  'staff performance is enabled by the higher tier'
);

select * from finish();
rollback;
