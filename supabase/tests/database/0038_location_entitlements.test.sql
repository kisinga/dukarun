begin;
select plan(16);

select testkit.create_user('39393939-3939-3939-3939-393939393939', 'locations@feature.local');
select testkit.create_user('40404040-4040-4040-4040-404040404040',
  'trial-team-limit@feature.local', '254740404040');
create temp table location_company as
select testkit.provision('39393939-3939-3939-3939-393939393939', 'Location Feature Co') company_id;
grant select on pg_temp.location_company to authenticated;
insert into public.subscription_tiers (
  code, name, price_monthly, price_yearly, max_team_members,
  max_products, max_stock_locations, max_orders_per_month, sms_per_period
)
values ('restricted-test', 'Restricted Test', 0, 0, 1, 100, 1, 500, 50);
update public.companies
set subscription_tier_id = (select id from public.subscription_tiers where code = 'restricted-test')
where id = (select company_id from location_company);
select testkit.as_user((select company_id from location_company),
  '39393939-3939-3939-3939-393939393939', 'Admin');

select is((public.current_entitlements() -> 'features' ->> 'multipleLocations')::boolean,
  false, 'restricted tier disables multiple locations');
select is((public.current_entitlements() -> 'limits' ->> 'maxStockLocations')::int,
  1, 'restricted tier exposes the location limit');
select is((public.current_entitlements() -> 'usage' ->> 'stockLocations')::int,
  1, 'entitlements expose current usage');
select is((select count(*)::int from public.stock_locations where company_id =
  (select company_id from location_company) and is_default), 1, 'provisioned location is default');
select throws_ok(
  $$select public.create_stock_location('BR-2', 'Branch 2')$$,
  'P0001', 'feature_unavailable: multiple locations; upgrade your plan',
  'restricted tier cannot add a second location');
select throws_ok(
  $$select public.add_team_member('0740404040',
    (select id from public.roles where company_id =
      (select company_id from location_company) and name = 'Cashier'))$$,
  'P0001', 'limit_reached: team member limit (1); upgrade your plan',
  'restricted tier team-member limit is enforced');
set local role postgres;
create temp table disabled_restricted_member as
with inserted as (
  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  select (select company_id from location_company), '40404040-4040-4040-4040-404040404040',
    id, 'disabled' from public.roles where company_id =
    (select company_id from location_company) and name = 'Cashier'
  returning id
)
select id membership_id from inserted;
grant select on pg_temp.disabled_restricted_member to authenticated;
select testkit.as_user((select company_id from location_company),
  '39393939-3939-3939-3939-393939393939', 'Admin');
select throws_ok(
  $$select public.update_team_member(
    (select membership_id from disabled_restricted_member), null, 'approved')$$,
  'P0001', 'limit_reached: team member limit (1); upgrade your plan',
  'reactivating a member also enforces the limit');

select lives_ok(
  $$select public.update_stock_location(
    (select id from public.stock_locations where company_id =
      (select company_id from location_company) and is_default),
    'MAIN', 'Main shop', true)$$,
  'restricted tier can maintain its existing location');

set local role postgres;
insert into public.subscription_tiers (
  code, name, price_monthly, price_yearly,
  multiple_locations_enabled, max_stock_locations
)
values ('location-test', 'Location Test', 1, 1, true, 2)
on conflict (code) do update
set multiple_locations_enabled = excluded.multiple_locations_enabled,
    max_stock_locations = excluded.max_stock_locations;
update public.companies set subscription_tier_id =
  (select id from public.subscription_tiers where code = 'location-test'), subscription_status = 'active'
where id = (select company_id from location_company);
select testkit.as_user((select company_id from location_company),
  '39393939-3939-3939-3939-393939393939', 'Admin');

select is((public.current_entitlements() -> 'features' ->> 'multipleLocations')::boolean,
  true, 'paid feature is exposed');
select lives_ok(
  $$select public.add_team_member('0740404040',
    (select id from public.roles where company_id =
      (select company_id from location_company) and name = 'Cashier'))$$,
  'paid tier can add a team member');
create temp table branch_location as
select public.create_stock_location('br 2', 'Branch 2', true) location_id;
grant select on pg_temp.branch_location to authenticated;
select is((select code from public.stock_locations where id =
  (select location_id from branch_location)), 'BR-2', 'location code is normalized');
select ok((select is_default from public.stock_locations where id =
  (select location_id from branch_location)), 'new location can become default');
select is((select count(*)::int from public.stock_locations where company_id =
  (select company_id from location_company) and is_default), 1, 'only one default remains');
select throws_ok(
  $$select public.create_stock_location('BR-3', 'Branch 3')$$,
  'P0001', 'limit_reached: stock location limit (2); upgrade your plan',
  'tier location count is enforced');
select throws_ok(
  $$select public.delete_stock_location((select location_id from branch_location))$$,
  'P0001', 'default_location_cannot_be_deleted', 'default location cannot be deleted');
create temp table removable_location as
select id location_id from public.stock_locations where company_id =
  (select company_id from location_company) and not is_default;
grant select on pg_temp.removable_location to authenticated;
select is(public.delete_stock_location((select location_id from removable_location)),
  (select location_id from removable_location),
  'unused non-default location can be deleted');

select * from finish();
rollback;
