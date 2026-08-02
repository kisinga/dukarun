-- Approvals tests (migration 0020): below-wholesale gate, order-reversal
-- approval, overdraft audit trail, deny flow.
begin;
select plan(12);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@appr.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'super@appr.local');

create temp table ap_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Appr Co') as company_id;
grant select on pg_temp.ap_company to authenticated;

-- Supervisor role: ReverseOrder but NOT ManageApprovals.
select testkit.add_member((select company_id from ap_company), '22222222-2222-2222-2222-222222222222', 'Supervisor', '{ReverseOrder,SettleOrder}');

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000b1', company_id, 'Shoes' from ap_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price, wholesale_price)
select 'aa000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', company_id, '42', 'SHOE42', 100000, 80000 from ap_company;

insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'aa000000-0000-0000-0000-0000000000b1', 10, 10, 50000 from ap_company;

insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000b1', company_id, 'Ltd Jane', true, 10000 from ap_company;

select testkit.as_user((select company_id from ap_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- ---------------------------------------------------------------------------
-- 1-4. below_wholesale: draft saves, completion blocked, approval unblocks.
-- ---------------------------------------------------------------------------
create temp table bw_draft as
select public.save_draft(null, '[{
  "variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000,
  "custom_price":70000,"override_reason":"regular customer"
}]') as order_id;

select is(
  (select count(*)::int from public.approvals
   where type = 'below_wholesale' and status = 'pending'
     and metadata ->> 'order_id' = (select order_id::text from bw_draft)),
  1,
  'below-wholesale save records a pending approval'
);

select throws_ok(
  $$select public.convert_draft((select order_id from bw_draft), '[{"method":"cash","amount":70000}]')$$,
  'P0001', null,
  'completion blocked while below-wholesale approval is pending'
);

create temp table bw_approval as
select id from public.approvals
where type = 'below_wholesale' and status = 'pending'
  and metadata ->> 'order_id' = (select order_id::text from bw_draft);

select public.approve_request((select id from bw_approval), 'ok, known customer');

select lives_ok(
  $$select public.convert_draft((select order_id from bw_draft), '[{"method":"cash","amount":70000}]')$$,
  'approval unblocks completion'
);

select is(
  (select status from public.orders where id = (select order_id from bw_draft)),
  'completed',
  'order completes after approval'
);

-- ---------------------------------------------------------------------------
-- 5-8. order_reversal: supervisor needs approval; admin instant; approval voids.
-- ---------------------------------------------------------------------------
-- A normal sale to void (admin, no override).
create temp table or_sale as
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000}]',
  '[{"method":"cash","amount":100000}]') as order_id;

-- Supervisor attempts void -> approval required (status object, no exception).
select testkit.as_user((select company_id from ap_company), '22222222-2222-2222-2222-222222222222', 'Supervisor');

select is(
  (public.void_sale((select order_id from or_sale), 'damaged') ->> 'status'),
  'approval_required',
  'supervisor void returns approval_required status'
);

select is(
  (select count(*)::int from public.approvals
   where type = 'order_reversal' and status = 'pending'
     and metadata ->> 'order_id' = (select order_id::text from or_sale)),
  1,
  'order-reversal approval request recorded'
);

-- Admin approves -> the void executes.
select testkit.as_user((select company_id from ap_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table or_approval as
select id from public.approvals
where type = 'order_reversal' and status = 'pending'
  and metadata ->> 'order_id' = (select order_id::text from or_sale);

select public.approve_request((select id from or_approval), 'confirmed damaged');

select is(
  (select status from public.orders where id = (select order_id from or_sale)),
  'voided',
  'approving the request executes the void'
);

-- Admin void is instant (no approval) — second sale.
create temp table or_sale2 as
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000}]',
  '[{"method":"cash","amount":100000}]') as order_id;

select public.void_sale((select order_id from or_sale2), 'mistake');

select is(
  (select count(*)::int from public.approvals
   where type = 'order_reversal' and metadata ->> 'order_id' = (select order_id::text from or_sale2)),
  0,
  'admin void needs no approval'
);

-- ---------------------------------------------------------------------------
-- 9-10. overdraft: admin (ApproveCustomerCredit) succeeds with audit record.
-- ---------------------------------------------------------------------------
-- Credit sale 15000 against limit 10000 -> overdraft for admin.
create temp table od_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000b1',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000}]',
  '[]') as order_id;

select is(
  (select status from public.approvals
   where type = 'overdraft' and metadata ->> 'order_id' = (select order_id::text from od_sale)),
  'approved',
  'over-limit sale by an ApproveCustomerCredit holder records an approved overdraft'
);

-- Supervisor (no ApproveCustomerCredit) gets the hard error.
select testkit.as_user((select company_id from ap_company), '22222222-2222-2222-2222-222222222222', 'Supervisor');

select throws_ok(
  format($$select public.post_sale('c0000000-0000-0000-0000-0000000000b1',
    '[{"variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000}]',
    '[]')$$),
  'P0001', null,
  'over-limit sale without ApproveCustomerCredit hard-fails'
);

-- ---------------------------------------------------------------------------
-- 11-12. deny flow + permission gate.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from ap_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table deny_draft as
select public.save_draft(null, '[{
  "variant_id":"aa000000-0000-0000-0000-0000000000b1","quantity":1,"unit_price":100000,
  "custom_price":60000,"override_reason":"test"
}]') as order_id;

create temp table deny_approval as
select id from public.approvals
where type = 'below_wholesale' and status = 'pending'
  and metadata ->> 'order_id' = (select order_id::text from deny_draft);

select public.deny_request((select id from deny_approval), 'too low');

select is(
  (select status from public.approvals where id = (select id from deny_approval)),
  'denied',
  'deny marks the approval denied'
);

select testkit.as_user((select company_id from ap_company), '22222222-2222-2222-2222-222222222222', 'Supervisor');

select throws_ok(
  format($$select public.approve_request('%s')$$, (select id from bw_approval)),
  'P0001', 'permission_denied: ManageApprovals required',
  'supervisor cannot approve requests'
);

select * from finish();
rollback;
