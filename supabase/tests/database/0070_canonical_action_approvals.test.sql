-- Canonical access snapshot and sale-action approval workflow.
begin;
select plan(30);

select testkit.create_user('11111111-1111-1111-1111-111111111111','admin@canonical.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222','cashier@canonical.local');
select testkit.create_user('33333333-3333-3333-3333-333333333333','approver@canonical.local');
select testkit.create_user('44444444-4444-4444-4444-444444444444','reverser@canonical.local');
select testkit.create_user('55555555-5555-5555-5555-555555555555','viewer@canonical.local');

create temp table ca_company as
select testkit.provision('11111111-1111-1111-1111-111111111111','Canonical Co') company_id;
grant select on pg_temp.ca_company to authenticated;

select testkit.add_member((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier','{SettleOrder}');
select testkit.add_member((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver','{ManageApprovals,ReverseOrder}');
select testkit.add_member((select company_id from ca_company),
  '44444444-4444-4444-4444-444444444444','Reverser','{ReverseOrder}');
select testkit.add_member((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer','{}');

insert into public.products(id,company_id,name)
select 'a0000000-0000-0000-0000-000000000070',company_id,'Canonical service'
from ca_company;
insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,track_inventory
)
select 'aa000000-0000-0000-0000-000000000070',
  'a0000000-0000-0000-0000-000000000070',company_id,'Default','service','CAN-70',10000,false
from ca_company;

select testkit.as_user((select company_id from ca_company),
  '11111111-1111-1111-1111-111111111111','Admin');
select testkit.ensure_open_session();

create temp table ca_sales as
select n,public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000070","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]') order_id
from generate_series(1,7) n;
grant select on pg_temp.ca_sales to authenticated;

-- 1-3. The snapshot derives action modes once on the server.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
select is(public.current_access_snapshot()->'actions'->>'sale.void','request',
  'SettleOrder maps reversal actions to request');
select testkit.as_user((select company_id from ca_company),
  '44444444-4444-4444-4444-444444444444','Reverser');
select is(public.current_access_snapshot()->'actions'->>'sale.refund','execute',
  'ReverseOrder maps reversal actions to execute');
select testkit.as_user((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer');
select is(public.current_access_snapshot()->'actions'->>'payment.reverse','blocked',
  'users with neither permission are blocked');

-- 4-12. Void request: deduplicated, private to requester/approvers, then executed.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
create temp table ca_void as
select public.void_sale((select order_id from ca_sales where n=1),'wrong item') result;
grant select on pg_temp.ca_void to authenticated;

select is((select result->>'status' from ca_void),'approval_required',
  'cashier void creates an approval request');
select is(
  public.void_sale((select order_id from ca_sales where n=1),'wrong item')->>'approval_id',
  (select result->>'approval_id' from ca_void),
  'duplicate void request reuses the pending approval');
select is((select status from public.orders where id=(select order_id from ca_sales where n=1)),
  'completed','requesting does not execute the void');
reset role;
select results_eq(
  $$select user_id from public.notifications where title='Sale void needs approval' order by user_id$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid),
           ('33333333-3333-3333-3333-333333333333'::uuid)$$,
  'only users holding both approval and reversal authority are notified');

select testkit.as_user((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer');
select is((select count(*)::int from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_void)),0,
  'unrelated users cannot read the request');
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
select is((select count(*)::int from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_void)),1,
  'requester can read their request');
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select is((select count(*)::int from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_void)),1,
  'eligible approver can read the request');
select is(
  (select link from public.notifications where title='Sale void needs approval' limit 1),
  '/approvals?approval='||(select result->>'approval_id' from ca_void),
  'approver notification opens the exact approval request'
);
select public.approve_request((select (result->>'approval_id')::uuid from ca_void),'checked');
select is((select status from public.orders where id=(select order_id from ca_sales where n=1)),
  'voided','approval executes the void');
select ok((select result->>'resource_id' is not null from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_void)),
  'approval records the execution result');
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
select is(
  (select link from public.notifications where title='Void request approved' limit 1),
  format('/sales?order=%s&approval=%s',
    (select order_id from ca_sales where n=1),
    (select result->>'approval_id' from ca_void)),
  'approval decision notifies the requester with a linked sale'
);
select testkit.as_user((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer');
select is((select count(*)::int from public.notifications
  where title='Void request approved'),0,
  'targeted decision notifications are private to the requester');

-- 13-15. Refund request validates first and posts only after approval.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
create temp table ca_refund as
select public.post_refund((select order_id from ca_sales where n=2),2000,'cash','damaged') result;
grant select on pg_temp.ca_refund to authenticated;
select is((select result->>'status' from ca_refund),'approval_required',
  'cashier refund creates an approval request');
select throws_ok(
  format(
    $$select public.post_refund('%s',3000,'cash','more damaged')$$,
    (select order_id from ca_sales where n=2)
  ),
  'P0001',
  format(
    'approval_already_pending: %s',
    (select result->>'approval_id' from ca_refund)
  ),
  'a different request cannot silently reuse pending approval payload'
);
select is((select count(*)::int from public.refunds
  where order_id=(select order_id from ca_sales where n=2)),0,
  'refund request does not post money');
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select public.approve_request((select (result->>'approval_id')::uuid from ca_refund),'goods returned');
select is((select count(*)::int from public.refunds
  where order_id=(select order_id from ca_sales where n=2)),1,
  'approved refund posts once');

-- 16-18. Payment reversal follows the same request path and remains idempotent.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
create temp table ca_payment as
select p.id payment_id from public.payments p
join ca_sales s on s.order_id=p.order_id where s.n=3 limit 1;
grant select on pg_temp.ca_payment to authenticated;
create temp table ca_payment_request as
select public.post_payment_reversal((select payment_id from ca_payment),'duplicate tender') result;
grant select on pg_temp.ca_payment_request to authenticated;
select is((select result->>'status' from ca_payment_request),'approval_required',
  'cashier payment reversal creates an approval request');
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select public.approve_request(
  (select (result->>'approval_id')::uuid from ca_payment_request),'confirmed duplicate');
select is((select status from public.payments where id=(select payment_id from ca_payment)),
  'cancelled','approved reversal cancels the payment atomically');
reset role;
select is((select count(*)::int from public.ledger_journal_entries
  where source_type='PaymentReversal'
    and source_id=(select payment_id::text||'-reversal' from ca_payment)),1,
  'payment reversal posts exactly one journal entry');
select testkit.as_user((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer');
select throws_ok(
  format(
    $$select public.post_payment_reversal('%s','probe')$$,
    (select payment_id from ca_payment)
  ),
  'P0001','permission_denied: ReverseOrder or SettleOrder required',
  'idempotent payment reversal still checks caller authority'
);

-- Denial has no financial side effect.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
create temp table ca_denied as
select public.post_refund((select order_id from ca_sales where n=4),1000,'cash','test denial') result;
grant select on pg_temp.ca_denied to authenticated;
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select public.deny_request((select (result->>'approval_id')::uuid from ca_denied),'not accepted');
select is((select status from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_denied)),'denied',
  'denial records the decision');
select is((select count(*)::int from public.refunds
  where order_id=(select order_id from ca_sales where n=4)),0,
  'denied refund has no financial side effect');
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
select is(
  (select body from public.notifications where title='Refund request denied' limit 1),
  (select 'Sale '||o.code||' — not accepted' from public.orders o
    where o.id=(select order_id from ca_sales where n=4)),
  'denial notification explains the decision to the requester'
);

-- 21. Authorized requesters still cannot approve their own row.
reset role;
insert into public.approvals(
  company_id,type,subject_type,subject_id,metadata,requested_by
)
select company_id,'order_reversal','order',(select order_id from ca_sales where n=7),
  jsonb_build_object('order_id',(select order_id from ca_sales where n=7),'reason','self'),
  '33333333-3333-3333-3333-333333333333' from ca_company;
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select throws_ok(
  format($$select public.approve_request('%s')$$,(select id from public.approvals
    where subject_id=(select order_id from ca_sales where n=7) and status='pending')),
  'P0001','self_approval_denied','requesters cannot approve their own request');

-- 22. A stale target expires instead of executing.
select testkit.as_user((select company_id from ca_company),
  '22222222-2222-2222-2222-222222222222','Cashier');
create temp table ca_stale as
select public.void_sale((select order_id from ca_sales where n=5),'stale request') result;
grant select on pg_temp.ca_stale to authenticated;
select testkit.as_user((select company_id from ca_company),
  '11111111-1111-1111-1111-111111111111','Admin');
select public.void_sale((select order_id from ca_sales where n=5),'already handled');
select testkit.as_user((select company_id from ca_company),
  '33333333-3333-3333-3333-333333333333','Approver');
select public.approve_request((select (result->>'approval_id')::uuid from ca_stale),'reviewed');
select is((select status from public.approvals
  where id=(select (result->>'approval_id')::uuid from ca_stale)),'expired',
  'approval expires when the target is no longer actionable');

-- 23-24. ReverseOrder executes directly; no-authority users are rejected.
select testkit.as_user((select company_id from ca_company),
  '44444444-4444-4444-4444-444444444444','Reverser');
select is(public.void_sale((select order_id from ca_sales where n=6),'direct')->>'status',
  'completed','ReverseOrder executes directly');
select testkit.as_user((select company_id from ca_company),
  '55555555-5555-5555-5555-555555555555','Viewer');
select throws_ok(
  $$select public.void_sale((select order_id from ca_sales where n=7),'not allowed')$$,
  'P0001','permission_denied: ReverseOrder or SettleOrder required',
  'users without execute or request authority are rejected');

select * from finish();
rollback;
