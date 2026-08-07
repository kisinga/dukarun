-- The local demo must stay fully walkable as features and permissions grow.
begin;
select plan(14);

select is(
  (select count(*)::int from public.companies where name = 'Mama Mboga Stores'),
  1,
  'the demo company is seeded once'
);

select is(
  (select t.code
   from public.companies c
   join public.subscription_tiers t on t.id = c.subscription_tier_id
   where c.name = 'Mama Mboga Stores'),
  'standard',
  'the demo company uses the multi-location Standard tier'
);

select results_eq(
  $$select c.status::text, c.subscription_status::text
    from public.companies c where c.name = 'Mama Mboga Stores'$$,
  $$values ('approved'::text, 'active'::text)$$,
  'the demo company is approved with an active subscription'
);

select results_eq(
  $$select r.name::text, m.authorization_status::text
    from public.company_memberships m
    join public.roles r on r.id = m.role_id
    join public.companies c on c.id = m.company_id
    where c.name = 'Mama Mboga Stores'
      and m.user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'$$,
  $$values ('Admin'::text, 'approved'::text)$$,
  'the demo user is an approved Admin'
);

select ok(
  (select r.permissions @> array[
    'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
    'ManageCustomerCreditLimit','ManageCatalog','ReverseOrder','OverrideCustomerBalance','SettleOrder',
    'ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
    'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
    'ViewStaffPerformance','ManageCommissions'
  ]::text[] and cardinality(r.permissions) = 18
  from public.roles r
  join public.companies c on c.id = r.company_id
  where c.name = 'Mama Mboga Stores' and r.name = 'Admin'),
  'the demo Admin has every application permission'
);

select is(
  (select count(*)::int
   from public.stock_locations l
   join public.companies c on c.id = l.company_id
   where c.name = 'Mama Mboga Stores'),
  3,
  'the demo company has three stock locations'
);

select is(
  (select count(*)::int
   from public.stock_locations l
   join public.companies c on c.id = l.company_id
   where c.name = 'Mama Mboga Stores' and l.is_default),
  1,
  'the demo company has exactly one default stock location'
);

select is(
  (select count(distinct b.stock_location_id)::int
   from public.inventory_batches b
   join public.companies c on c.id = b.company_id
   where c.name = 'Mama Mboga Stores'),
  3,
  'seeded inventory is distributed across all locations'
);

select results_eq(
  $$select v.sku::text, sum(b.remaining)::numeric
    from public.inventory_batches b
    join public.product_variants v on v.id = b.variant_id
    join public.companies c on c.id = b.company_id
    where c.name = 'Mama Mboga Stores'
    group by v.sku
    order by v.sku$$,
  $$values
    ('SUG1'::text, 40::numeric),
    ('SUGL'::text, 30::numeric),
    ('UNGA2'::text, 50::numeric)$$,
  'distributed stock preserves the intended company-wide quantities'
);

select is(
  (select count(*)::int
   from public.company_membership_locations ml
   join public.company_memberships m on m.id = ml.membership_id
   join public.companies c on c.id = m.company_id
   where c.name = 'Mama Mboga Stores'
     and m.user_id = '5877ac73-ff8d-457c-afcd-791e66229d17'),
  3,
  'seeded administrator is assigned to every location'
);

select is(
  (select count(*)::int
   from public.location_payment_methods lpm
   join public.companies c on c.id = lpm.company_id
   where c.name = 'Mama Mboga Stores'),
  12,
  'four payment methods are available at all three locations'
);

select ok(
  (select c.commissions_enabled
     and t.staff_performance_enabled
     and t.commissions_available
   from public.companies c
   join public.subscription_tiers t on t.id = c.subscription_tier_id
   where c.name = 'Mama Mboga Stores'),
  'premium staff features are enabled for the walkable demo'
);

select is(
  (select count(*)::int
   from public.manufacturers m
   join public.companies c on c.id=m.company_id
   where c.name='Mama Mboga Stores'),
  2,
  'the demo company has canonical manufacturers for autocomplete'
);

select results_eq(
  $$select p.name::text, m.name::text
    from public.products p
    join public.manufacturers m on m.id=p.manufacturer_id
    join public.companies c on c.id=p.company_id
    where c.name='Mama Mboga Stores'
    order by p.name$$,
  $$values
    ('Sugar'::text, 'Mumias Sugar'::text),
    ('Unga wa Dola 2kg'::text, 'Kitui Flour Mills'::text)$$,
  'seeded products link to their manufacturers'
);

select * from finish();
rollback;
