begin;
select plan(3);
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'bulk@payment.local');
create temp table bulk_company as select testkit.provision(
  '33333333-3333-3333-3333-333333333333', 'Bulk Payment Co') company_id;
grant select on pg_temp.bulk_company to authenticated;
select testkit.as_user((select company_id from bulk_company),
  '33333333-3333-3333-3333-333333333333', 'Admin');

-- The wrapper rejects invalid/customer-less requests before allocation.
select throws_ok(
  $$select public.post_customer_payment(gen_random_uuid(), 1000, 'cash')$$,
  'P0001', 'customer_not_found', 'unknown customer rejected');
select throws_ok(
  $$select public.post_customer_payment(gen_random_uuid(), 0, 'cash')$$,
  'P0001', 'invalid_amount', 'zero payment rejected');
select has_function('public', 'post_customer_payment', array['uuid','bigint','text','text'],
  'bulk allocation RPC exists');
select * from finish();
rollback;
