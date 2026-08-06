begin;
select plan(6);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'credit-admin@test.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'credit-cashier@test.local');
create temp table credit_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Credit Policies') as company_id;
grant select on pg_temp.credit_company to authenticated;

insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-000000000043', company_id, 'Policy Supplier', true
from credit_company;

select testkit.as_user((select company_id from credit_company),
  '11111111-1111-1111-1111-111111111111', 'Admin');

select is(
  public.update_supplier_credit('c0000000-0000-0000-0000-000000000043', 250000, 30),
  'c0000000-0000-0000-0000-000000000043'::uuid,
  'authorized manager can update supplier credit policy'
);
select is((select supplier_credit_limit from public.customers
  where id = 'c0000000-0000-0000-0000-000000000043'), 250000::bigint,
  'supplier credit limit is saved');
select is((select supplier_credit_terms_days from public.customers
  where id = 'c0000000-0000-0000-0000-000000000043'), 30,
  'supplier credit terms are saved');

select throws_ok(
  $$select public.update_supplier_credit('c0000000-0000-0000-0000-000000000043', -1, 30)$$,
  'P0001', 'invalid_supplier_credit_limit', 'negative limits are rejected'
);
select throws_ok(
  $$select public.update_supplier_credit('c0000000-0000-0000-0000-000000000043', 1000, -1)$$,
  'P0001', 'invalid_supplier_credit_terms', 'negative terms are rejected'
);

reset role;
insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
select company_id, '22222222-2222-2222-2222-222222222222',
  (select id from public.roles where company_id = credit_company.company_id and name = 'Cashier'),
  'approved'
from credit_company;
select testkit.as_user((select company_id from credit_company),
  '22222222-2222-2222-2222-222222222222', 'Cashier');
select throws_ok(
  $$select public.update_supplier_credit('c0000000-0000-0000-0000-000000000043', 1000, 7)$$,
  'P0001', 'permission_denied: ManageSupplierCreditPurchases required',
  'supplier credit policy is permission gated'
);

select * from finish();
rollback;
