begin;
select plan(13);

select testkit.create_user(
  '11111111-1111-1111-1111-111111111111',
  'direct-checkout@test.local'
);

create temp table flow_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Direct Checkout Co'
) as company_id;
grant select on pg_temp.flow_company to authenticated;

insert into public.products(id, company_id, name)
select 'a0000000-0000-0000-0000-000000000054', company_id, 'Consultation'
from flow_company;

insert into public.product_variants(
  id, product_id, company_id, name, kind, sku, price, track_inventory
)
select
  'aa000000-0000-0000-0000-000000000054',
  'a0000000-0000-0000-0000-000000000054',
  company_id, 'Default', 'service', 'DIRECT-54', 10000, false
from flow_company;

update public.companies
set cashier_flow_enabled = false,
    cash_control_enabled = false,
    batch_expiry_enabled = false,
    -- member-side settings toggles below require an approved company
    status = 'approved'
where id = (select company_id from flow_company);

select testkit.as_user(
  (select company_id from flow_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

create temp table direct_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000054","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]'
) as order_id;

select ok((select order_id from direct_sale) is not null, 'direct checkout works without a till');
select is(
  (select status from public.orders where id = (select order_id from direct_sale)),
  'completed',
  'direct checkout completes the order'
);
select is(
  (select cashier_session_id from public.orders where id = (select order_id from direct_sale)),
  null::uuid,
  'direct checkout does not attach a cashier session'
);

select throws_ok(
  $$select public.post_sale(
    null,
    '[{"variant_id":"aa000000-0000-0000-0000-000000000054","quantity":1,"unit_price":10000}]',
    '[]', true
  )$$,
  'P0001',
  'cashier_flow_disabled: take payment and complete this sale directly',
  'disabled cashier workflow rejects new queue handoffs'
);

update public.companies
set cashier_flow_enabled = true
where id = (select company_id from flow_company);

create temp table queued_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000054","quantity":1,"unit_price":10000}]',
  '[]', true
) as order_id;

select is(
  (select status from public.orders where id = (select order_id from queued_sale)),
  'pending_payment',
  'enabled cashier workflow permits queue handoff'
);

update public.companies
set cash_control_enabled = true
where id = (select company_id from flow_company);

select throws_ok(
  $$select public.post_sale(
    null,
    '[{"variant_id":"aa000000-0000-0000-0000-000000000054","quantity":1,"unit_price":10000}]',
    '[{"method":"cash","amount":10000}]'
  )$$,
  'P0001',
  'cashier_session_required: open a session before recording this transaction',
  'cash control independently requires an open till'
);

select is(
  (select count(*) from public.cashier_sessions where company_id = (select company_id from flow_company)),
  0::bigint,
  'mode checks do not create hidden cashier sessions'
);

reset role;

insert into public.inventory_batches(
  company_id, variant_id, quantity, remaining, unit_cost, expiry_date
)
select company_id, 'aa000000-0000-0000-0000-000000000054', 1, 1, 5000, date '2026-12-31'
from flow_company;

select is(
  (select expiry_date from public.inventory_batches
   where company_id = (select company_id from flow_company) order by created_at desc limit 1),
  null::date,
  'disabled batch expiry removes new stock from the expiry workflow'
);

update public.companies
set batch_expiry_enabled = true
where id = (select company_id from flow_company);

insert into public.inventory_batches(
  company_id, variant_id, quantity, remaining, unit_cost, expiry_date
)
select company_id, 'aa000000-0000-0000-0000-000000000054', 1, 1, 5000, date '2026-12-31'
from flow_company;

select is(
  (select expiry_date from public.inventory_batches
   where company_id = (select company_id from flow_company) order by created_at desc limit 1),
  date '2026-12-31',
  'enabled batch expiry preserves the supplied date'
);

update public.companies
set require_opening_count = false
where id = (select company_id from flow_company);

select testkit.as_user(
  (select company_id from flow_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

create temp table automatic_open as
select public.open_cashier_session_at_location(
  (select id from public.stock_locations
   where company_id = (select company_id from flow_company) and is_default),
  '[]'
) as session_id;

select ok((select session_id from automatic_open) is not null, 'till opens without an opening count');
select ok(
  (select bool_and(ra.variance = 0)
   from public.reconciliation_accounts ra
   join public.reconciliations r on r.id = ra.reconciliation_id
   where r.scope_ref_id = (select session_id::text from automatic_open) || ':opening'),
  'opening balances are inferred without hidden variances'
);

update public.companies
set variance_notification_threshold = 100
where id = (select company_id from flow_company);

select public.close_cashier_session_at_location(
  (select id from public.stock_locations
   where company_id = (select company_id from flow_company) and is_default),
  (select session_id from automatic_open),
  jsonb_build_array(
    jsonb_build_object(
      'account_code', 'CASH_ON_HAND',
      'declared', public.account_balance((select company_id from flow_company), 'CASH_ON_HAND') - 500
    ),
    jsonb_build_object(
      'account_code', 'MPESA',
      'declared', public.account_balance((select company_id from flow_company), 'MPESA')
    )
  )
);

select is(
  (select count(*) from public.notifications
   where company_id = (select company_id from flow_company)
     and title = 'Till variance needs review'),
  1::bigint,
  'closing variance threshold creates one actionable notification'
);

select ok(
  (select body like '%shortage of KES 500.%'
   from public.notifications
   where company_id = (select company_id from flow_company)
     and title = 'Till variance needs review'),
  'closing variance notification keeps the shilling value'
);

select * from finish();
rollback;
