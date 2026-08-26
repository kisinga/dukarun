begin;
select plan(30);

select testkit.create_user('11111111-1111-1111-1111-111111111171','admin@credit-approval.local');
select testkit.create_user('22222222-2222-2222-2222-222222222172','cashier@credit-approval.local');
select testkit.create_user('33333333-3333-3333-3333-333333333173','manager@credit-approval.local');
select testkit.create_user('44444444-4444-4444-4444-444444444174','customers@credit-approval.local');

create temp table cr_company as
select testkit.provision('11111111-1111-1111-1111-111111111171','Credit Approval Co') company_id;
grant select on pg_temp.cr_company to authenticated;
select testkit.add_member((select company_id from cr_company),
  '22222222-2222-2222-2222-222222222172','Cashier','{SettleOrder}');
select testkit.add_member((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager',
  '{ManageApprovals,ApproveCustomerCredit,ManageCustomerCreditLimit}');
select testkit.add_member((select company_id from cr_company),
  '44444444-4444-4444-4444-444444444174','Customer clerk','{ManageCustomers}');

create temp table cr_location as select id from public.stock_locations
where company_id=(select company_id from cr_company) order by is_default desc,created_at limit 1;
grant select on pg_temp.cr_location to authenticated;
update public.companies set cash_control_enabled=false,cashier_flow_enabled=false,
  batch_expiry_enabled=false where id=(select company_id from cr_company);

insert into public.products(id,company_id,name)
select 'a0000000-0000-0000-0000-000000000171',company_id,'Credit stock' from cr_company;
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,wholesale_price,track_inventory
)
select 'aa000000-0000-0000-0000-000000000171',
  'a0000000-0000-0000-0000-000000000171',company_id,'Default','CR-171',3000,2000,true
from cr_company;
insert into public.inventory_batches(company_id,variant_id,stock_location_id,quantity,remaining,unit_cost)
select company_id,'aa000000-0000-0000-0000-000000000171',(select id from cr_location),10,10,1500
from cr_company;
insert into public.customers(
  id,company_id,first_name,is_credit_approved,credit_limit,credit_terms_days
)
select 'c0000000-0000-0000-0000-000000000171',company_id,'Credit Jane',true,1000,14
from cr_company;

select testkit.as_user((select company_id from cr_company),
  '22222222-2222-2222-2222-222222222172','Cashier');
select is(public.current_access_snapshot()->'actions'->>'sale.credit_over_limit','request',
  'SettleOrder can request an over-limit credit sale');
select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select is(public.current_access_snapshot()->'actions'->>'sale.credit_over_limit','execute',
  'ApproveCustomerCredit executes over-limit credit sales');
select testkit.as_user((select company_id from cr_company),
  '44444444-4444-4444-4444-444444444174','Customer clerk');
select is(public.current_access_snapshot()->'actions'->>'customer.credit.update','request',
  'ManageCustomers can request a credit-policy change');
select testkit.as_user((select company_id from cr_company),
  '11111111-1111-1111-1111-111111111171','Admin');
select is(public.current_access_snapshot()->'actions'->>'customer.credit.update','execute',
  'ManageCustomerCreditLimit executes credit-policy changes');

-- Customer credit-policy request and execution.
select testkit.as_user((select company_id from cr_company),
  '44444444-4444-4444-4444-444444444174','Customer clerk');
create temp table cr_policy as select public.change_customer_credit(
  'c0000000-0000-0000-0000-000000000171',2000,true,30,'Long payment history') result;
grant select on pg_temp.cr_policy to authenticated;
select is((select result->>'status' from cr_policy),'approval_required',
  'customer clerk creates a credit-policy request');
select is((select count(*)::int from public.approvals where type='customer_credit'
  and subject_id='c0000000-0000-0000-0000-000000000171' and status='pending'),1,
  'one customer credit request is pending');
select is((select metadata->'proposed'->>'credit_terms_days' from public.approvals
  where id=(select (result->>'approval_id')::uuid from cr_policy)),'30',
  'request stores the full proposed credit policy');
reset role;
select results_eq(
  $$select user_id from public.notifications where title='Customer credit change needs approval' order by user_id$$,
  $$values ('11111111-1111-1111-1111-111111111171'::uuid),
           ('33333333-3333-3333-3333-333333333173'::uuid)$$,
  'only eligible customer-credit approvers are notified');
select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select public.approve_request((select (result->>'approval_id')::uuid from cr_policy),'Approved terms');
select is((select credit_limit from public.customers
  where id='c0000000-0000-0000-0000-000000000171'),2000::bigint,
  'approval updates the customer credit limit');
select is((select is_credit_approved from public.customers
  where id='c0000000-0000-0000-0000-000000000171'),true,
  'approval updates the credit-approved flag');
select is((select credit_terms_days from public.customers
  where id='c0000000-0000-0000-0000-000000000171'),30,
  'approval updates the credit terms');
reset role;
select is((select link from public.notifications
  where user_id='44444444-4444-4444-4444-444444444174' and title='Customer credit request approved'
  order by created_at desc limit 1),
  '/customers?customer=c0000000-0000-0000-0000-000000000171&approval='||
    (select result->>'approval_id' from cr_policy),
  'requester receives a customer deep link');

-- A stale request expires instead of overwriting a direct update.
select testkit.as_user((select company_id from cr_company),
  '44444444-4444-4444-4444-444444444174','Customer clerk');
create temp table cr_stale_policy as select public.change_customer_credit(
  'c0000000-0000-0000-0000-000000000171',4000,true,45,'Larger facility') result;
grant select on pg_temp.cr_stale_policy to authenticated;
select testkit.as_user((select company_id from cr_company),
  '11111111-1111-1111-1111-111111111171','Admin');
select public.update_customer_credit('c0000000-0000-0000-0000-000000000171',2500,true,21);
select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select public.approve_request((select (result->>'approval_id')::uuid from cr_stale_policy),'Looks fine');
select is((select status from public.approvals
  where id=(select (result->>'approval_id')::uuid from cr_stale_policy)),'expired',
  'stale customer credit request expires');
select is((select credit_limit from public.customers
  where id='c0000000-0000-0000-0000-000000000171'),2500::bigint,
  'stale approval does not overwrite the newer policy');

-- Cashier requests an over-limit credit sale.
select testkit.as_user((select company_id from cr_company),
  '22222222-2222-2222-2222-222222222172','Cashier');
create temp table cr_overdraft as select public.post_sale_at_location(
  (select id from cr_location),'c0000000-0000-0000-0000-000000000171',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000171","quantity":1,"unit_price":3000}]',
  '[]',false,'credit-171-a',null,'Trusted customer needs stock today') result;
grant select on pg_temp.cr_overdraft to authenticated;
select is((select result->>'status' from cr_overdraft),'approval_required',
  'over-limit sale returns approval_required');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from cr_overdraft)),'pending_payment',
  'over-limit order is held unpaid');
select is((select cashier_pending_at from public.orders
  where id=(select (result->>'order_id')::uuid from cr_overdraft)),null,
  'approval hold is excluded from the cashier queue');
select is((select remaining from public.inventory_batches
  where variant_id='aa000000-0000-0000-0000-000000000171'),10::numeric,
  'request does not consume inventory');
select throws_ok(format($$select public.settle_order('%s','[]')$$,
  (select result->>'order_id' from cr_overdraft)),'P0001',null,
  'cashier cannot bypass a pending credit approval');
reset role;
select results_eq(
  $$select user_id from public.notifications where title='Credit sale needs approval' order by user_id$$,
  $$values ('11111111-1111-1111-1111-111111111171'::uuid),
           ('33333333-3333-3333-3333-333333333173'::uuid)$$,
  'only eligible credit-sale approvers are notified');

select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select public.approve_request((select (result->>'approval_id')::uuid from cr_overdraft),'Approved exception');
reset role;
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from cr_overdraft)),'completed',
  'approving the request completes the credit sale');
select is((select remaining from public.inventory_batches
  where variant_id='aa000000-0000-0000-0000-000000000171'),9::numeric,
  'inventory is consumed only on approval');
select is((select count(*)::int from public.approvals where type='overdraft'
  and metadata->>'order_id'=(select result->>'order_id' from cr_overdraft)
  and status='approved'),1,
  'pending request becomes the sole approved overdraft audit');

-- Denial voids the hold.
select testkit.as_user((select company_id from cr_company),
  '22222222-2222-2222-2222-222222222172','Cashier');
create temp table cr_denied as select public.post_sale_at_location(
  (select id from cr_location),'c0000000-0000-0000-0000-000000000171',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000171","quantity":1,"unit_price":3000}]',
  '[]',false,'credit-171-b',null,'Second exception') result;
grant select on pg_temp.cr_denied to authenticated;
select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select public.deny_request((select (result->>'approval_id')::uuid from cr_denied),'Exposure too high');
select is((select status from public.approvals
  where id=(select (result->>'approval_id')::uuid from cr_denied)),'denied',
  'manager can deny an over-limit request');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from cr_denied)),'voided',
  'denial voids the held order');
select matches((select void_reason from public.orders
  where id=(select (result->>'order_id')::uuid from cr_denied)),'Exposure too high',
  'void reason preserves the decision reason');

-- Credit revocation makes a pending request expire and voids its hold.
select testkit.as_user((select company_id from cr_company),
  '22222222-2222-2222-2222-222222222172','Cashier');
create temp table cr_expired as select public.post_sale_at_location(
  (select id from cr_location),'c0000000-0000-0000-0000-000000000171',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000171","quantity":1,"unit_price":3000}]',
  '[]',false,'credit-171-c',null,'Final exception') result;
grant select on pg_temp.cr_expired to authenticated;
select testkit.as_user((select company_id from cr_company),
  '11111111-1111-1111-1111-111111111171','Admin');
select public.update_customer_credit('c0000000-0000-0000-0000-000000000171',2500,false,21);
select testkit.as_user((select company_id from cr_company),
  '33333333-3333-3333-3333-333333333173','Manager');
select public.approve_request((select (result->>'approval_id')::uuid from cr_expired),'Approve');
select is((select status from public.approvals
  where id=(select (result->>'approval_id')::uuid from cr_expired)),'expired',
  'credit revocation expires the request');
select is((select status from public.orders
  where id=(select (result->>'order_id')::uuid from cr_expired)),'voided',
  'expired request voids the held order');

-- Direct authority still executes and records one audit row.
select testkit.as_user((select company_id from cr_company),
  '11111111-1111-1111-1111-111111111171','Admin');
select public.update_customer_credit('c0000000-0000-0000-0000-000000000171',2500,true,21);
create temp table cr_direct as select public.post_sale_at_location(
  (select id from cr_location),'c0000000-0000-0000-0000-000000000171',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000171","quantity":1,"unit_price":3000}]',
  '[]',false,'credit-171-direct') result;
select is((select result->>'status' from cr_direct),'completed',
  'direct credit authority completes immediately');
select is((select count(*)::int from public.approvals where type='overdraft'
  and metadata->>'order_id'=(select result->>'order_id' from cr_direct)
  and status='approved'),1,
  'direct execution records one approved overdraft audit');

select * from finish();
rollback;
