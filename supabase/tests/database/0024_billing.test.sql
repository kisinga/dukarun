-- Billing tests (migration 0024): activation, idempotent webhook replay,
-- expiry scan + grace, entitlement gates and tier limits.
begin;
select plan(10);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@bill.local');
create temp table bl_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Bill Co') as company_id;
grant select on pg_temp.bl_company to authenticated;

select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. Activation sets active + expiry a month out.
reset role;
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
  (select subscription_expires_at > now() + interval '25 days' from public.companies
   where id = (select company_id from bl_company)),
  'expiry set ~1 month out'
);

-- 3. Replay with same reference is a no-op (no double extension).
select public.activate_subscription(
  (select company_id from bl_company),
  (select id from public.subscription_tiers where code = 'standard'),
  'monthly', 'ps_ref_001', 150000
);

select ok(
  (select subscription_expires_at < now() + interval '45 days' from public.companies
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

-- 5. Expiry scan: expired trial flips to expired + grace.
reset role;
update public.companies
set subscription_status = 'trial', subscription_expires_at = now() - interval '1 day',
    subscription_grace_period_end = null
where id = (select company_id from bl_company);

select public.subscription_expiry_scan();

select is(
  (select subscription_status from public.companies where id = (select company_id from bl_company)),
  'expired',
  'scanner flips expired subscriptions'
);

-- 6. Grace period: still entitled (scan set grace = expiry + 3 days = 2 days from now).
select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  $$select public.save_draft(null, '[]'::jsonb)$$ || ';',
  'company in grace period can still create orders'
);
reset role;
delete from public.orders where company_id = (select company_id from bl_company);
delete from public.order_lines where company_id = (select company_id from bl_company);

-- 7. Past grace: hard block.
reset role;
update public.companies set subscription_grace_period_end = now() - interval '1 hour'
where id = (select company_id from bl_company);
select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select throws_ok(
  $$select public.save_draft(null, '[]')$$,
  'P0001', 'subscription_expired: renew to continue selling',
  'past grace period, selling is blocked'
);

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
update public.subscription_tiers set limits = '{"maxProducts": 1}' where code = 'standard';
update public.companies
set subscription_status = 'active',
    subscription_expires_at = now() + interval '30 days',
    subscription_exempt_until = null,
    subscription_tier_id = (select id from public.subscription_tiers where code = 'standard')
where id = (select company_id from bl_company);

select testkit.as_user((select company_id from bl_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select lives_ok(
  $$select public.create_product_with_variants('First', '[{"price": 1000}]')$$,
  'first product within the limit'
);

select throws_ok(
  $$select public.create_product_with_variants('Second', '[{"price": 1000}]')$$,
  'P0001', 'limit_reached: product limit (1); upgrade your plan',
  'second product exceeds the tier limit'
);

select * from finish();
rollback;
