-- Billing tests (migration 0024): activation, idempotent webhook replay,
-- expiry scan + grace, entitlement gates and tier limits.
begin;
select plan(13);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@bill.local');
create temp table bl_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Bill Co') as company_id;
grant select on pg_temp.bl_company to authenticated;

select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. A regular renewal extends active paid access.
reset role;
update public.companies set subscription_expires_at = now()
where id = (select company_id from bl_company);
select public.activate_subscription(
  (select company_id from bl_company),
  (select id from public.subscription_tiers where code = 'standard'),
  'monthly', 'ps_ref_001', 150000
);

select is(
  (select subscription_status from public.companies where id = (select company_id from bl_company)),
  'active',
  'activation sets subscription active'
);

select ok(
  (select subscription_expires_at > now() + interval '25 days'
     and subscription_expires_at < now() + interval '35 days' from public.companies
   where id = (select company_id from bl_company)),
  'expiry extends by one paid month'
);

-- 3. Replay with same reference is a no-op (no double extension).
select public.activate_subscription(
  (select company_id from bl_company),
  (select id from public.subscription_tiers where code = 'standard'),
  'monthly', 'ps_ref_001', 150000
);

select ok(
  (select subscription_expires_at < now() + interval '35 days' from public.companies
   where id = (select company_id from bl_company)),
  'webhook replay with same reference does not double-extend'
);

-- 4. Renewal with a new reference extends from the current expiry.
reset role;
update public.companies set subscription_expires_at = now() + interval '10 days'
where id = (select company_id from bl_company);

select public.activate_subscription(
  (select company_id from bl_company),
  (select id from public.subscription_tiers where code = 'standard'),
  'monthly', 'ps_ref_002', 150000
);

select ok(
  (select subscription_expires_at > now() + interval '39 days'
     and subscription_expires_at < now() + interval '42 days'
   from public.companies where id = (select company_id from bl_company)),
  'renewal extends from current expiry (10 + 30 days)'
);

-- 5. Expiry scan moves paid access into its grace period.
reset role;
update public.companies
set subscription_status = 'active',
    subscription_expires_at = now() - interval '1 day',
    subscription_grace_period_end = null
where id = (select company_id from bl_company);

select public.subscription_expiry_scan();

select is(
  (select subscription_status from public.companies where id = (select company_id from bl_company)),
  'expired',
  'scanner flips expired subscriptions'
);

-- 6. Paid subscriptions receive a three-day grace period.
select ok(
  (select subscription_grace_period_end > now() from public.companies where id = (select company_id from bl_company)),
  'expired paid subscription receives grace'
);

-- 7. Grace-period access remains entitled.
select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  $$select public.save_draft(null, '[]')$$,
  'paid grace period can continue selling'
);
reset role;

-- 8. Exemption overrides.
reset role;
update public.companies set subscription_exempt_until = now() + interval '7 days'
where id = (select company_id from bl_company);
select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  $$select public.save_draft(null, '[]')$$,
  'manual exemption restores selling'
);
reset role;
delete from public.orders where company_id = (select company_id from bl_company);

-- 9-10. Tier limits: set a tiny product limit and hit it.
reset role;
update public.subscription_tiers set max_products = 1 where code = 'standard';
update public.companies
set subscription_status = 'active',
    subscription_expires_at = now() + interval '30 days',
    subscription_exempt_until = null,
    subscription_tier_id = (select id from public.subscription_tiers where code = 'standard')
where id = (select company_id from bl_company);

select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select throws_ok(
  $$select public.create_product_with_variants(
    'Too many at once', '[{"name":"One","price":1000},{"name":"Two","price":1000}]'
  )$$,
  'P0001', 'limit_reached: product limit (1); upgrade your plan',
  'one product family cannot smuggle multiple variants past the limit'
);

select is(
  (select count(*)::int from public.product_variants
   where company_id = (select company_id from bl_company) and active),
  0,
  'failed multi-variant creation rolls back the whole family'
);

select lives_ok(
  $$select public.create_product_with_variants('First', '[{"price": 1000}]')$$,
  'first product within the limit'
);

select throws_ok(
  $$select public.create_product_with_variants('Second', '[{"price": 1000}]')$$,
  'P0001', 'limit_reached: product limit (1); upgrade your plan',
  'second product exceeds the tier limit'
);

select lives_ok(
  $$select public.assert_entitled((select company_id from bl_company), 'product')$$,
  'being at the product limit does not block restocking or purchase workflows'
);

select * from finish();
rollback;
