-- Role template tests (migration 0023): seeded templates, apply RPC,
-- provisioning defaults, ViewFinancials gating.
begin;
select plan(8);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@tmpl.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'clerk@tmpl.local');
create temp table tm_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Tmpl Co') as company_id;
grant select on pg_temp.tm_company to authenticated;

-- 1. Four platform templates exist.
reset role;
select is(
  (select count(*)::int from public.roles where is_template),
  4,
  'four platform templates seeded (Admin, Manager, Cashier, Stock Clerk)'
);

-- 2. Provisioning seeds Admin AND Cashier.
select is(
  (select count(*)::int from public.roles
   where company_id = (select company_id from tm_company) and name in ('Admin', 'Cashier')),
  2,
  'provisioning creates Admin + Cashier roles'
);

-- 3. Template permissions are valid per the constraint (spot-check Manager).
select ok(
  (select permissions <@ array[
    'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
    'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
    'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
    'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
    'CreateInterAccountTransfer', 'ManageTeam', 'ViewAuditTrail'
  ]::text[] from public.roles where is_template and name = 'Manager'),
  'Manager template permissions are a valid subset'
);

-- 4. apply_role_template instantiates it as a company role.
select testkit.as_user((select company_id from tm_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

create temp table applied as
select public.apply_role_template(
  (select id from public.roles where is_template and name = 'Manager')
) as role_id;

select is(
  (select array_length(permissions, 1) from public.roles where id = (select role_id from applied)),
  (select array_length(permissions, 1) from public.roles where is_template and name = 'Manager'),
  'apply_role_template copies the template permissions'
);

-- 5. (setup) Manager template applied → member gets ViewFinancials reads; Cashier doesn't.
select testkit.add_member((select company_id from tm_company), '22222222-2222-2222-2222-222222222222', 'Floor Staff', '{SettleOrder}');

reset role;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000f1', company_id, 'Tea' from tm_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-0000000000f1', company_id, 'Box', 'TEA1', 5000, false from tm_company;

-- a sale so journals exist
select testkit.as_user((select company_id from tm_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select public.post_sale(null,
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000f1","quantity":1,"unit_price":5000}]',
  '[{"method":"cash","amount":5000}]');

-- 6. Admin reads journal lines.
select ok(
  (select count(*) from public.ledger_journal_lines) > 0,
  'ViewFinancials role reads journal lines'
);

-- 7. Floor staff (no ViewFinancials) reads none.
select testkit.as_user((select company_id from tm_company), '22222222-2222-2222-2222-222222222222', 'Floor Staff');

select is(
  (select count(*)::int from public.ledger_journal_lines),
  0,
  'role without ViewFinancials cannot read journal lines'
);

-- 8. ...but can still read POS data (orders).
select ok(
  (select count(*) from public.orders) > 0,
  'staff still reads orders (POS unaffected)'
);

-- 9. Report views also gated.
reset role;
select public.refresh_analytics();

select testkit.as_user((select company_id from tm_company), '22222222-2222-2222-2222-222222222222', 'Floor Staff');

select is(
  (select count(*)::int from public.rpt_daily_sales_summary),
  0,
  'report views gated by ViewFinancials'
);

select * from finish();
rollback;
