begin;
set local timezone to 'UTC';
select no_plan();
select testkit.create_user('a1350000-0000-4000-8000-000000000001','vat-boundaries@test.local');
create temp table vat_boundary_fixture as select testkit.provision(
  'a1350000-0000-4000-8000-000000000001','VAT posting boundaries') company_id;
grant select on vat_boundary_fixture to authenticated;
insert into public.products(id,company_id,name)
select 'a1350000-0000-4000-8000-000000000010',company_id,'Boundary service' from vat_boundary_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1350000-0000-4000-8000-000000000020','a1350000-0000-4000-8000-000000000010',
  company_id,'Default','VAT-BOUNDARY','service',116,116,false from vat_boundary_fixture;
create function pg_temp.change_vat(enabled boolean,starts date default null)
returns uuid language sql as $$
  select public.schedule_company_tax_profile(j.id,enabled,'',starts,c.id)
  from public.tax_jurisdictions j join public.tax_categories c on c.jurisdiction_id=j.id
  where j.country_code='KE' and c.code='STANDARD'
$$;
select testkit.as_user((select company_id from vat_boundary_fixture),
  'a1350000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
create temp table vat_before as select public.post_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_boundary_fixture) and is_default limit 1),null,
  '[{"variant_id":"a1350000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]',false,'vat-before-boundary') result;
select is((select tax_total from public.orders where client_ref='vat-before-boundary'),0::bigint,
  'the original VAT-off sale has no tax');
create temp table vat_enabled as select pg_temp.change_vat(true) id;
select is((public.company_tax_settings()->'active_profile'->>'vat_registered')::boolean,true,
  'VAT activates immediately even after same-day financial activity');
select is((public.company_tax_settings()->'activation'->>'immediate_available')::boolean,true,
  'settings advertise immediate activation');
select is((select count(*)::integer from public.company_tax_profiles
  where company_id=(select company_id from vat_boundary_fixture)),2,
  'the previous VAT-off profile is retained');
select is((select effective_to_at from public.company_tax_profiles
  where company_id=(select company_id from vat_boundary_fixture) and not vat_registered),
  (select effective_from_at from public.company_tax_profiles where id=(select id from vat_enabled)),
  'activation creates an exact exclusive boundary');
create temp table vat_captured as select clock_timestamp()-interval '2 hours' captured;
create temp table vat_delayed as select testkit.post_offline_sale(
  (select id from public.stock_locations where company_id=(select company_id from vat_boundary_fixture) and is_default limit 1),null,
  '[{"variant_id":"a1350000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]','vat-delayed-boundary',
  (select captured from vat_captured),'vat-boundary-device',1) result;
select results_eq(
  $$select total,net_total,tax_total from public.orders where client_ref='vat-delayed-boundary'$$,
  $$values (116::bigint,100::bigint,16::bigint)$$,
  'a sale captured before activation posts with current VAT and preserves gross payment');
select is((select captured_at from public.orders where client_ref='vat-delayed-boundary'),
  (select captured from vat_captured),'the offline capture instant remains an audit fact');
select ok((select posted_at>captured_at and tax_point_at=posted_at and completed_at=posted_at
  from public.orders where client_ref='vat-delayed-boundary'),
  'completion and tax share the server posting instant, distinct from capture');
select pg_temp.change_vat(false);
select is((public.company_tax_settings()->'active_profile'->>'vat_registered')::boolean,false,
  'VAT can turn off again on the same business day');
select is(testkit.post_offline_sale(
  (select id from public.stock_locations where company_id=(select company_id from vat_boundary_fixture) and is_default limit 1),null,
  '[{"variant_id":"a1350000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]','vat-delayed-boundary',
  (select captured from vat_captured),'vat-boundary-device',1)->>'order_id',
  (select result->>'order_id' from vat_delayed),'lost-response replay returns the original sale');
select is((select tax_total from public.orders where client_ref='vat-delayed-boundary'),16::bigint,
  'replaying after VAT changes preserves the saved tax treatment');
select is((select count(*)::integer from public.payments p join public.orders o on o.id=p.order_id
  where o.client_ref='vat-delayed-boundary'),1,'replaying does not collect another payment');
select is((select tax_total from public.orders where client_ref='vat-before-boundary'),0::bigint,
  'immediate activation never rewrites earlier sales');
create temp table vat_scheduled as select pg_temp.change_vat(true,
  (clock_timestamp() at time zone 'Africa/Nairobi')::date+2) id;
select is((select effective_from_at from public.company_tax_profiles where id=(select id from vat_scheduled)),
  (((clock_timestamp() at time zone 'Africa/Nairobi')::date+2)::timestamp at time zone 'Africa/Nairobi'),
  'future activation is shop-local midnight, independent of the database timezone');
select is(jsonb_array_length(public.company_tax_settings()->'scheduled_profiles'),1,
  'future activation stays visible separately from the active profile');
select public.cancel_scheduled_company_tax_profile((select id from vat_scheduled));
select is(jsonb_array_length(public.company_tax_settings()->'scheduled_profiles'),0,
  'cancelling a future activation restores the open-ended current interval');
select throws_ok(format('select public.cancel_scheduled_company_tax_profile(%L)',
  public.company_tax_settings()->'active_profile'->>'id'),'P0001','active_tax_profile_cannot_be_cancelled',
  'an active profile cannot be deleted through cancellation');
select * from finish();
rollback;
