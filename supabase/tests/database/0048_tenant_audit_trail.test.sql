-- Tenant audit trail: secure permission boundary + unified activity read model.
begin;
select plan(10);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'owner@audit.local', '254711111111');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'cashier@audit.local', '254722222222');
select testkit.create_user('33333333-3333-3333-3333-333333333333', 'auditor@audit.local', '254733333333');

create temp table audit_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Audit Co') as company_id;
grant select on pg_temp.audit_company to authenticated;

select testkit.add_member(
  (select company_id from audit_company),
  '22222222-2222-2222-2222-222222222222',
  'Audit Cashier',
  '{SettleOrder}'
);
select testkit.add_member(
  (select company_id from audit_company),
  '33333333-3333-3333-3333-333333333333',
  'Auditor',
  '{ViewAuditTrail}'
);

-- 1. Future provisioning includes the secure default.
reset role;
select ok(
  (select 'ViewAuditTrail' = any(permissions)
   from public.roles
   where company_id = (select company_id from audit_company) and name = 'Admin'),
  'provisioned Admin can view the audit trail'
);

-- Generate one generic change and one immutable stock movement.
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-000000000048', company_id, 'Audit Tea'
from audit_company;
insert into public.product_variants (
  id, product_id, company_id, name, sku, price, track_inventory
) select
  'aa000000-0000-0000-0000-000000000048',
  'a0000000-0000-0000-0000-000000000048',
  company_id, 'Box', 'AUDIT-TEA', 5000, true
from audit_company;

select testkit.as_user(
  (select company_id from audit_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select public.post_stock_adjustment(
  'aa000000-0000-0000-0000-000000000048',
  0,
  5,
  'Opening count correction',
  1000
);

-- 2. Admin gets generic changes through RLS.
select ok(
  (select count(*) from public.audit_log) > 0,
  'permitted user can read company audit rows'
);

-- 3. Unified feed includes the stock movement and its reason.
select ok(
  exists(
    select 1 from public.list_audit_events(100, 0, null, 'stock', null, null, null)
    where reason = 'Opening count correction'
      and entity_type = 'inventory_movements'
  ),
  'stock movement reason appears in the tenant feed'
);

-- 4. Actor directory returns useful identity context without exposing auth.users.
select ok(
  exists(
    select 1 from public.list_audit_actors()
    where user_id = '11111111-1111-1111-1111-111111111111'
      and phone = '••• 1111'
      and role_name = 'Admin'
  ),
  'audit actor directory includes phone and role'
);

-- 5. Search/filtering is applied server-side.
select ok(
  exists(select 1 from public.list_audit_events(25, 0, 'Opening count', null, 'inventory', null, null)),
  'audit feed supports search and area filters'
);

-- A role may review activity without gaining financial access.
select testkit.as_user(
  (select company_id from audit_company),
  '33333333-3333-3333-3333-333333333333',
  'Auditor'
);

-- 6. Curated read model remains available.
select ok(
  exists(select 1 from public.list_audit_events(25, 0, null, null, null, null, null)),
  'audit-only role can use the curated tenant feed'
);

-- 7. Financial values are stripped when ViewFinancials is absent.
select ok(
  exists(
    select 1 from public.list_audit_events(100, 0, null, null, 'inventory', null, null)
    where entity_type = 'product_variants' and not (after_data ? 'price')
  ),
  'audit-only role does not receive product prices'
);

-- 8. The raw JSON table requires both audit and financial permissions.
select is(
  (select count(*)::int from public.audit_log),
  0,
  'audit-only role cannot bypass the curated feed'
);

-- Cashier has no audit permission.
select testkit.as_user(
  (select company_id from audit_company),
  '22222222-2222-2222-2222-222222222222',
  'Audit Cashier'
);

-- 9. RLS hides raw rows.
select is(
  (select count(*)::int from public.audit_log),
  0,
  'role without ViewAuditTrail cannot read raw audit rows'
);

-- 10. Security-definer read model also fails closed.
select throws_ok(
  $$select * from public.list_audit_events(25, 0, null, null, null, null, null)$$,
  'P0001',
  'permission_denied: ViewAuditTrail required',
  'role without ViewAuditTrail cannot call the tenant feed'
);

select * from finish();
rollback;
