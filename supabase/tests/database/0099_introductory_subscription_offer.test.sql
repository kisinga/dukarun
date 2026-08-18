begin;
select plan(18);

select testkit.create_user('99000000-0000-0000-0000-000000000001', 'intro-offer@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';

select lives_ok(
  $$select public.platform_update_billing_policy(
    30,
    (select id from public.subscription_tiers where code='standard'),
    true,
    (select id from public.subscription_tiers where code='standard'),
    1,
    1
  )$$,
  'platform admin enables a one-paid-one-free offer'
);

reset role;

select is(public.public_billing_config()->>'introOfferEnabled','true',
  'public billing config exposes enabled offer');
select is((public.public_billing_config()->>'introOfferPaidMonths')::integer,1,
  'public billing config exposes paid months');
select is((public.public_billing_config()->>'introOfferBonusMonths')::integer,1,
  'public billing config exposes bonus months');

set local role service_role;
set local request.jwt.claims = '{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table intro_company as
select public.provision_company('Intro Offer Co') company_id;
grant select on pg_temp.intro_company to authenticated;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select public.platform_set_company_status((select company_id from intro_company),'approved');
reset role;

select is((select status from public.companies where id=(select company_id from intro_company)),
  'approved','offer company is approved');
select is((select subscription_status from public.companies where id=(select company_id from intro_company)),
  null,'offer company has no free access before payment');
select is((select trial_ends_at from public.companies where id=(select company_id from intro_company)),
  null,'offer company has no trial deadline');
select is((select t.code from public.companies c join public.subscription_tiers t on t.id=c.subscription_tier_id
  where c.id=(select company_id from intro_company)),'standard','configured offer tier is assigned');

set local role service_role;
select throws_ok(
  format('select public.activate_intro_offer(%L,%L,%L,%s,%s,%s,%s)',
    (select company_id from intro_company),
    (select id from public.subscription_tiers where code='standard'),
    'intro_bad_amount',1499,1500,1,1),
  'P0001','intro_offer_amount_mismatch','offer rejects an incorrect charge amount'
);

select public.activate_intro_offer(
  (select company_id from intro_company),
  (select id from public.subscription_tiers where code='standard'),
  'intro_ref_001',1500,1500,1,1
);
reset role;

select is((select subscription_status from public.companies where id=(select company_id from intro_company)),
  'active','successful offer payment activates subscription');
select ok((select subscription_expires_at between now()+interval '1 month 27 days'
  and now()+interval '2 months 1 minute' from public.companies where id=(select company_id from intro_company)),
  'paid and bonus months are both granted');
select is((select count(*)::integer from public.subscription_intro_offer_redemptions
  where company_id=(select company_id from intro_company)),1,'redemption is recorded once');

set local role service_role;
select public.activate_intro_offer(
  (select company_id from intro_company),
  (select id from public.subscription_tiers where code='standard'),
  'intro_ref_001',1500,1500,1,1
);
reset role;

select is((select count(*)::integer from public.subscription_intro_offer_redemptions
  where company_id=(select company_id from intro_company)),1,'webhook replay is idempotent');

create temp table expiry_after_offer as
select subscription_expires_at
from public.companies where id=(select company_id from intro_company);

set local role service_role;
select public.activate_intro_offer(
  (select company_id from intro_company),
  (select id from public.subscription_tiers where code='standard'),
  'intro_ref_002',1500,1500,1,1
);
reset role;

select is(
  (select subscription_expires_at from public.companies where id=(select company_id from intro_company)),
  (select subscription_expires_at + interval '1 month' from expiry_after_offer),
  'a second successful charge receives its paid month without another bonus'
);
select is((select count(*)::integer from public.subscription_intro_offer_redemptions
  where company_id=(select company_id from intro_company)),2,'both successful charges are recorded');
select is((select bonus_months from public.subscription_intro_offer_redemptions
  where payment_reference='intro_ref_002'),0,'a later successful charge receives no second bonus');

create temp table expiry_after_second_charge as
select subscription_expires_at
from public.companies where id=(select company_id from intro_company);

set local role service_role;
select public.activate_intro_offer(
  (select company_id from intro_company),
  (select id from public.subscription_tiers where code='standard'),
  'intro_ref_001',1500,1500,1,1
);
reset role;

select is(
  (select subscription_expires_at from public.companies where id=(select company_id from intro_company)),
  (select subscription_expires_at from expiry_after_second_charge),
  'an older webhook remains idempotent after a later payment'
);
select is((select count(*)::integer from public.subscription_intro_offer_redemptions
  where company_id=(select company_id from intro_company)),2,'an older replay creates no payment row');

select * from finish();
rollback;
