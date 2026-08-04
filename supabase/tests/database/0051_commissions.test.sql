-- Effective-dated net-collected commission statements.
begin;
select plan(12);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner@commission.local', '254711111111');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'seller@commission.local', '254722222222');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'viewer@commission.local', '254733333333');

create temp table com_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Commission Co') as company_id;
grant select on pg_temp.com_company to authenticated;

update public.companies c
set subscription_tier_id = t.id,
    subscription_status = 'active',
    commissions_enabled = true
from public.subscription_tiers t
where c.id = (select company_id from com_company) and t.code = 'standard';

select testkit.add_member(
  (select company_id from com_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller', '{}'
);
select testkit.add_member(
  (select company_id from com_company),
  '33333333-3333-3333-3333-333333333333',
  'Viewer', '{}'
);

select testkit.as_user(
  (select company_id from com_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);
select public.update_staff_display_name(
  (select id from public.company_memberships
   where company_id = (select company_id from com_company)
     and user_id = '22222222-2222-2222-2222-222222222222'),
  'Kamau Seller'
);

reset role;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000051', company_id, 'Commission service'
from com_company;
insert into public.product_variants (
  id, product_id, company_id, name, kind, sku, price, track_inventory
) select
  'aa000000-0000-0000-0000-000000000051',
  'a0000000-0000-0000-0000-000000000051',
  company_id, 'Default', 'service', 'COMM-SERVICE', 10000, false
from com_company;

select testkit.as_user(
  (select company_id from com_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);
select testkit.ensure_open_session();

select testkit.as_user(
  (select company_id from com_company),
  '22222222-2222-2222-2222-222222222222',
  'Seller'
);
create temp table com_sale as
select public.post_sale(
  null,
  '[{"variant_id":"aa000000-0000-0000-0000-000000000051","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]'
) as order_id;
grant select on pg_temp.com_sale to authenticated;

select testkit.as_user(
  (select company_id from com_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);
select public.post_refund((select order_id from com_sale), 2000, 'cash', 'Partial refund');

create temp table com_plan as
select public.upsert_commission_plan(
  'Standard 5%', 500,
  (now() at time zone 'Africa/Nairobi')::date,
  null, true, null
) as plan_id;
grant select on pg_temp.com_plan to authenticated;

select public.assign_commission_plan(
  (select plan_id from com_plan),
  '22222222-2222-2222-2222-222222222222',
  (now() at time zone 'Africa/Nairobi')::date,
  null, null
);

-- 1. Assignment overlap is rejected.
select throws_ok(
  $$select public.assign_commission_plan(
    (select plan_id from com_plan),
    '22222222-2222-2222-2222-222222222222',
    (now() at time zone 'Africa/Nairobi')::date,
    null, null
  )$$,
  'P0001',
  'commission_assignment_overlap',
  'a staff member cannot have overlapping plans'
);

create temp table com_period as
select public.generate_commission_period(
  (now() at time zone 'Africa/Nairobi')::date,
  (now() at time zone 'Africa/Nairobi')::date
) as period_id;
grant select on pg_temp.com_period to authenticated;

-- 2-6. Payment and refund become immutable statement lines.
select is(
  (select count(*)::int from public.commission_lines
   where period_id = (select period_id from com_period)),
  2,
  'statement contains payment and refund events'
);
select is(
  (select basis_total from public.commission_period_statement((select period_id from com_period))
   where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  8000::bigint,
  'commission basis is net collected sales'
);
select is(
  (select commission_total from public.commission_period_statement((select period_id from com_period))
   where staff_user_id = '22222222-2222-2222-2222-222222222222'),
  400::bigint,
  '5 percent commission is calculated in integer cents'
);
select is(
  (select min(rate_bps) from public.commission_lines
   where period_id = (select period_id from com_period)),
  500,
  'statement lines snapshot the effective rate'
);
select is(
  (select min(staff_name) from public.commission_lines
   where period_id = (select period_id from com_period)),
  'Kamau Seller',
  'statement lines snapshot staff identity'
);

-- 7. Draft regeneration is idempotent.
select lives_ok(
  $$select public.generate_commission_period(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  )$$,
  'draft period can be regenerated safely'
);

-- 8. Regeneration preserves manual adjustments while rebuilding event lines.
select public.add_commission_adjustment(
  (select period_id from com_period),
  '22222222-2222-2222-2222-222222222222',
  500, 'Good will bonus'
);
select public.generate_commission_period(
  (now() at time zone 'Africa/Nairobi')::date,
  (now() at time zone 'Africa/Nairobi')::date
);
select is(
  (select count(*)::int from public.commission_lines
   where period_id = (select period_id from com_period)
     and event_type = 'adjustment'),
  1,
  'regeneration keeps manual adjustment lines'
);

select public.update_commission_period_status(
  (select period_id from com_period), 'approved', 'Reviewed'
);

-- 9-10. Approval locks calculation; paid is the only next transition.
select throws_ok(
  $$select public.generate_commission_period(
    (now() at time zone 'Africa/Nairobi')::date,
    (now() at time zone 'Africa/Nairobi')::date
  )$$,
  'P0001',
  'commission_period_locked: approved',
  'approved statement cannot be regenerated'
);
select lives_ok(
  $$select public.update_commission_period_status(
    (select period_id from com_period), 'paid', 'Paid externally'
  )$$,
  'approved statement can be marked paid'
);

-- 11. Paid statement is immutable.
select throws_ok(
  $$select public.update_commission_period_status(
    (select period_id from com_period), 'paid', null
  )$$,
  'P0001',
  'invalid_commission_transition: paid to paid',
  'paid statement rejects further transitions'
);

-- 12. Unprivileged staff cannot manage commission configuration.
select testkit.as_user(
  (select company_id from com_company),
  '33333333-3333-3333-3333-333333333333',
  'Viewer'
);
select throws_ok(
  $$select public.generate_commission_period(current_date, current_date)$$,
  'P0001',
  'permission_denied: ManageCommissions required',
  'commission generation fails closed without permission'
);

select * from finish();
rollback;
