begin;
select plan(9);

select testkit.create_user(
  '11111111-1111-1111-1111-111111111111',
  'customer-delete@test.local'
);

create temp table customer_delete_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Customer Delete Co'
) as company_id;
grant select on pg_temp.customer_delete_company to authenticated;

select testkit.as_user(
  (select company_id from customer_delete_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

create temp table customer_delete_target as
select public.create_customer('Archived', 'Customer') as customer_id;
grant select on pg_temp.customer_delete_target to authenticated;

reset role;
update public.roles
set permissions = array_remove(permissions, 'ManageCustomers')
where company_id = (select company_id from customer_delete_company)
  and name = 'Admin';
select testkit.as_user(
  (select company_id from customer_delete_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select throws_ok(
  $$select public.set_customer_deleted((select customer_id from customer_delete_target))$$,
  'P0001',
  'permission_denied: ManageCustomers required',
  'customer deletion requires ManageCustomers'
);

reset role;
update public.roles
set permissions = array_append(permissions, 'ManageCustomers')
where company_id = (select company_id from customer_delete_company)
  and name = 'Admin';

insert into public.orders (company_id, code, customer_id, status, created_by)
values (
  (select company_id from customer_delete_company),
  'EXISTING-DRAFT',
  (select customer_id from customer_delete_target),
  'draft',
  '11111111-1111-1111-1111-111111111111'
);
select testkit.as_user(
  (select company_id from customer_delete_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.set_customer_deleted((select customer_id from customer_delete_target));

select ok(
  (select deleted_at is not null from public.customers
   where id = (select customer_id from customer_delete_target)),
  'soft delete timestamps the customer'
);

select is(
  (select deleted_by from public.customers
   where id = (select customer_id from customer_delete_target)),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'soft delete records the actor'
);

select is(
  (select first_name from public.customers
   where id = (select customer_id from customer_delete_target)),
  'Archived',
  'soft delete preserves the customer record'
);

reset role;
select throws_ok(
  $$insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      (select company_id from customer_delete_company),
      'DELETED-CUSTOMER',
      (select customer_id from customer_delete_target),
      'draft',
      '11111111-1111-1111-1111-111111111111'
    )$$,
  'P0001',
  'customer_deleted: ' || (select customer_id from customer_delete_target),
  'deleted customers cannot be attached to new sales'
);

select throws_ok(
  $$update public.orders set status = 'completed' where code = 'EXISTING-DRAFT'$$,
  'P0001',
  'customer_deleted: ' || (select customer_id from customer_delete_target),
  'drafts cannot be finalized after their customer is deleted'
);
select testkit.as_user(
  (select company_id from customer_delete_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.set_customer_deleted((select customer_id from customer_delete_target), false);

select ok(
  (select deleted_at is null and deleted_by is null from public.customers
   where id = (select customer_id from customer_delete_target)),
  'restore clears deletion metadata'
);

select throws_ok(
  $$select public.set_customer_deleted('ffffffff-ffff-ffff-ffff-ffffffffffff')$$,
  'P0001',
  'customer_not_found: ffffffff-ffff-ffff-ffff-ffffffffffff',
  'unknown customers cannot be deleted'
);

reset role;
insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-000000000063', company_id, 'Supplier', true
from customer_delete_company;
select testkit.as_user(
  (select company_id from customer_delete_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select throws_ok(
  $$select public.set_customer_deleted('c0000000-0000-0000-0000-000000000063')$$,
  'P0001',
  'customer_not_found: c0000000-0000-0000-0000-000000000063',
  'customer deletion cannot archive supplier accounts'
);

select * from finish();
rollback;
