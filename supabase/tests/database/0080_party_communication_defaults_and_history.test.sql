begin;
select plan(3);

select testkit.create_user(
  '80000000-0000-4000-8000-000000000001',
  'party-defaults@test.local'
);
create temp table party_defaults_fixture as
select testkit.provision(
  '80000000-0000-4000-8000-000000000001',
  'Party Defaults Store'
) company_id;
select testkit.as_user(
  (select company_id from party_defaults_fixture),
  '80000000-0000-4000-8000-000000000001',
  'Admin'
);

select public.create_customer('New Customer',null,'+254700008001',null,false);
select public.create_customer('New Supplier',null,'+254700008002',null,true);
reset role;

select ok(
  (select bool_and(notifications_enabled and sms_notifications_enabled
    and whatsapp_notifications_enabled)
   from public.customers
   where company_id=(select company_id from party_defaults_fixture)
     and first_name in ('New Customer','New Supplier')),
  'new customers and suppliers enable every communication preference'
);
select is(
  (select count(*)::int from public.customers
   where company_id=(select company_id from party_defaults_fixture)
     and first_name in ('New Customer','New Supplier')),
  2,
  'customer and supplier fixtures were both created'
);
select has_index(
  'public','orders','orders_company_customer_created_idx',
  'customer history has a dedicated newest-first index'
);

select * from finish();
rollback;
