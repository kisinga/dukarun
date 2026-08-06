begin;
select plan(9);

select testkit.create_user('37373737-3737-3737-3737-373737373737', 'draft-owner@delete.local');
select testkit.create_user('38383838-3838-3838-3838-383838383838', 'other-tenant@delete.local');

create temp table delete_companies as
select testkit.provision('37373737-3737-3737-3737-373737373737', 'Delete Draft Co') company_id,
       testkit.provision('38383838-3838-3838-3838-383838383838', 'Other Delete Co') other_company_id;
grant select on pg_temp.delete_companies to authenticated;

select testkit.as_user((select company_id from delete_companies),
  '37373737-3737-3737-3737-373737373737', 'Admin');

create temp table delete_product as
select public.create_catalog_product('Draft item',
  '[{"name":"Each","price":10000,"wholesale_price":8000}]') product_id;
grant select on pg_temp.delete_product to authenticated;

create temp table delete_variant as
select id variant_id from public.product_variants
where product_id = (select product_id from delete_product);
grant select on pg_temp.delete_variant to authenticated;

create temp table doomed_draft as
select public.save_draft(null, jsonb_build_array(jsonb_build_object(
  'variant_id', (select variant_id from delete_variant),
  'quantity', 1,
  'unit_price', 10000,
  'custom_price', 7000,
  'override_reason', 'quoted price'
))) order_id;
grant select on pg_temp.doomed_draft to authenticated;

select is((select status from public.orders where id = (select order_id from doomed_draft)),
  'draft', 'fixture is a proforma');
select is((select count(*)::int from public.order_lines
  where order_id = (select order_id from doomed_draft)), 1, 'proforma has a line');
select is((select count(*)::int from public.approvals
  where status = 'pending' and metadata ->> 'order_id' = (select order_id::text from doomed_draft)),
  1, 'proforma has a pending approval');

select testkit.as_user((select other_company_id from delete_companies),
  '38383838-3838-3838-3838-383838383838', 'Admin');
select throws_ok(
  format('select public.delete_proforma(%L::uuid)', (select order_id from doomed_draft)),
  'P0001',
  format('proforma_not_found: %s', (select order_id from doomed_draft)),
  'another tenant cannot delete the proforma'
);

select testkit.as_user((select company_id from delete_companies),
  '37373737-3737-3737-3737-373737373737', 'Admin');
select is(public.delete_proforma((select order_id from doomed_draft)),
  (select order_id from doomed_draft), 'delete returns the removed id');
select is((select count(*)::int from public.orders
  where id = (select order_id from doomed_draft)), 0, 'proforma is deleted');
select is((select count(*)::int from public.order_lines
  where order_id = (select order_id from doomed_draft)), 0, 'lines are deleted by cascade');
select is((select count(*)::int from public.approvals
  where status = 'pending' and metadata ->> 'order_id' = (select order_id::text from doomed_draft)),
  0, 'stale pending approval is removed');
select throws_ok(
  format('select public.delete_proforma(%L::uuid)', (select order_id from doomed_draft)),
  'P0001',
  format('proforma_not_found: %s', (select order_id from doomed_draft)),
  'deleting the same proforma twice is rejected'
);

select * from finish();
rollback;

