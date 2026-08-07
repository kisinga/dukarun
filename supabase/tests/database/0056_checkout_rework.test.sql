-- Checkout rework tests (migration 0054): external-account gating at
-- checkout — walk-in hard block, approval hold without ViewFinancials,
-- approve settles the held order, and denial terminally voids it.
begin;
select plan(17);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@extpay.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'cashier@extpay.local');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'approver@extpay.local');
select testkit.create_user('44444444-4444-4444-4444-444444444444', 'finance@extpay.local');

create temp table ep_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Ext Pay Co') as company_id;
grant select on pg_temp.ep_company to authenticated;

-- Cashier: no ViewFinancials, no ManageApprovals.
select testkit.add_member((select company_id from ep_company), '22222222-2222-2222-2222-222222222222', 'Cashier', '{SettleOrder}');
-- Approvals manager WITHOUT ViewFinancials.
select testkit.add_member((select company_id from ep_company), '33333333-3333-3333-3333-333333333333', 'Approver', '{ManageApprovals}');
select testkit.add_member((select company_id from ep_company), '44444444-4444-4444-4444-444444444444', 'Finance', '{ViewFinancials}');

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000056', company_id, 'Service' from ep_company;

insert into public.product_variants (
  id, product_id, company_id, name, kind, sku, price, track_inventory
)
select
  'aa000000-0000-0000-0000-000000000056',
  'a0000000-0000-0000-0000-000000000056',
  company_id, 'Default', 'service', 'EXT-56', 10000, false
from ep_company;

insert into public.customers (id, company_id, first_name)
select 'c0000000-0000-0000-0000-000000000056', company_id, 'Ext Customer' from ep_company;

-- The hold must work even with the cashier queue disabled.
update public.companies
set cashier_flow_enabled = false,
    cash_control_enabled = false,
    batch_expiry_enabled = false
where id = (select company_id from ep_company);

create temp table ep_location as
select id from public.stock_locations
where company_id = (select company_id from ep_company)
order by is_default desc, created_at
limit 1;
grant select on pg_temp.ep_location to authenticated;

select testkit.as_user((select company_id from ep_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- ---------------------------------------------------------------------------
-- 1-2. update_payment_method: p_is_cashier_controlled (null keeps current).
-- ---------------------------------------------------------------------------
select public.update_payment_method('mpesa', null, null, false);

select is(
  (select is_cashier_controlled from public.payment_methods
   where company_id = (select company_id from ep_company) and code = 'mpesa'),
  false,
  'update_payment_method sets is_cashier_controlled'
);

select public.update_payment_method('mpesa');

select is(
  (select is_cashier_controlled from public.payment_methods
   where company_id = (select company_id from ep_company) and code = 'mpesa'),
  false,
  'null p_is_cashier_controlled keeps the current value'
);

select public.update_payment_method('mpesa', null, null, true);

-- ---------------------------------------------------------------------------
-- 3. Walk-in sale on an external account (bank) is a hard error — even for
-- a ViewFinancials holder.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.post_sale_at_location(
    (select id from ep_location), null,
    '[{"variant_id":"aa000000-0000-0000-0000-000000000056","quantity":1,"unit_price":10000}]',
    '[{"method":"bank","amount":10000,"reference":"TXN-1"}]')$$,
  'P0001',
  'cashier_controlled_only: walk-in sales require cashier-controlled accounts',
  'walk-in sale to a non-cashier-controlled account is rejected'
);

-- ---------------------------------------------------------------------------
-- 4-7. Customer sale by a cashier (no ViewFinancials): held for approval.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from ep_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

select throws_ok(
  $$select public.post_sale_at_location(
    (select id from ep_location),
    'c0000000-0000-0000-0000-000000000056',
    '[{"variant_id":"aa000000-0000-0000-0000-000000000056","quantity":1,"unit_price":10000}]',
    '[{"method":"bank","amount":10000}]')$$,
  'P0001', 'invalid_external_tenders',
  'statement-matched external tenders require a reference before requesting approval'
);

create temp table held_result as
select public.post_sale_at_location(
  (select id from ep_location),
  'c0000000-0000-0000-0000-000000000056',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000056","quantity":1,"unit_price":10000}]',
  '[{"method":"bank","amount":10000,"reference":"TXN-2"}]'
) as result;

select is(
  (select result ->> 'status' from held_result),
  'approval_required',
  'cashier sale to an external account returns approval_required'
);

select is(
  (select status from public.orders where id = (select (result ->> 'order_id')::uuid from held_result)),
  'pending_payment',
  'held order is created unpaid (pending settlement)'
);

select is(
  (select metadata -> 'tenders' -> 0 ->> 'method' from public.approvals
   where type = 'external_account_payment' and status = 'pending'
     and metadata ->> 'order_id' = (select result ->> 'order_id' from held_result)),
  'bank',
  'approval request records the external tenders'
);

-- Targeted notifications are user-private, so verify them in the recipient's
-- session instead of relying on a table-owner bypass.
select testkit.as_user((select company_id from ep_company), '44444444-4444-4444-4444-444444444444', 'Finance');
select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from ep_company)
     and type = 'approval'
     and link = '/approvals?approval=' || (select result ->> 'approval_id' from held_result)
     and user_id = '44444444-4444-4444-4444-444444444444'),
  1,
  'eligible finance viewer receives a targeted deep-link notification'
);
select testkit.as_user((select company_id from ep_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

-- ---------------------------------------------------------------------------
-- 8-9. Approval is ViewFinancials-gated: cashier and a ManageApprovals-only
-- holder are both denied.
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$select public.approve_request('%s')$$, (select result ->> 'approval_id' from held_result)),
  'P0001',
  'permission_denied: ViewFinancials required',
  'cashier cannot approve external account payments'
);

select testkit.as_user((select company_id from ep_company), '33333333-3333-3333-3333-333333333333', 'Approver');

select throws_ok(
  format($$select public.approve_request('%s')$$, (select result ->> 'approval_id' from held_result)),
  'P0001',
  'permission_denied: ViewFinancials required',
  'ManageApprovals without ViewFinancials cannot approve external account payments'
);

-- ---------------------------------------------------------------------------
-- 10-11. Admin (ViewFinancials) approves -> the order settles via
-- complete_order with the stored tenders.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from ep_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select public.approve_request((select (result ->> 'approval_id')::uuid from held_result), 'bank transfer confirmed');

select is(
  (select status from public.orders where id = (select (result ->> 'order_id')::uuid from held_result)),
  'completed',
  'approving the request settles the held order'
);

select is(
  (select count(*)::int from public.payments
   where order_id = (select (result ->> 'order_id')::uuid from held_result)
     and method_code = 'bank' and amount = 10000),
  1,
  'settlement records the stored tender as a payment'
);

-- ---------------------------------------------------------------------------
-- 12-13. A ViewFinancials holder completes external tenders directly.
-- ---------------------------------------------------------------------------
create temp table direct_result as
select public.post_sale_at_location(
  (select id from ep_location),
  'c0000000-0000-0000-0000-000000000056',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000056","quantity":1,"unit_price":10000}]',
  '[{"method":"bank","amount":10000,"reference":"TXN-3"}]'
) as result;

select is(
  (select result ->> 'status' from direct_result),
  'completed',
  'ViewFinancials holder completes an external tender directly'
);

select is(
  (select count(*)::int from public.approvals
   where type = 'external_account_payment'
     and metadata ->> 'order_id' = (select result ->> 'order_id' from direct_result)),
  0,
  'direct completion records no approval request'
);

-- ---------------------------------------------------------------------------
-- 14-16. Deny leaves the order pending_payment; the cashier queue can still
-- settle it through normal methods.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from ep_company), '22222222-2222-2222-2222-222222222222', 'Cashier');

create temp table denied_result as
select public.post_sale_at_location(
  (select id from ep_location),
  'c0000000-0000-0000-0000-000000000056',
  '[{"variant_id":"aa000000-0000-0000-0000-000000000056","quantity":1,"unit_price":10000}]',
  '[{"method":"bank","amount":10000,"reference":"TXN-4"}]'
) as result;

select testkit.as_user((select company_id from ep_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select public.deny_request((select (result ->> 'approval_id')::uuid from denied_result), 'unverified transfer');

select is(
  (select status from public.approvals where id = (select (result ->> 'approval_id')::uuid from denied_result)),
  'denied',
  'deny marks the external account approval denied'
);

select is(
  (select status from public.orders where id = (select (result ->> 'order_id')::uuid from denied_result)),
  'voided',
  'denied approval hold is terminally voided'
);

select throws_ok(
  format($$select public.settle_order('%s','[{"method":"cash","amount":10000}]')$$,
    (select result ->> 'order_id' from denied_result)),
  'P0001', null,
  'denied approval hold cannot be settled later'
);

select * from finish();
rollback;
