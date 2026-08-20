begin;
select plan(44);

select hasnt_table('public','subscription_intro_offer_redemptions',
  'legacy introductory purchase table is removed');
select has_table('public','initial_subscription_purchases',
  'initial purchase table is present');
select has_table('public','initial_subscription_payment_attempts',
  'durable initial payment attempts are present');
select hasnt_column('public','companies','trial_started_at',
  'trial start column is removed');
select hasnt_column('public','companies','trial_ends_at',
  'trial expiry column is removed');

select testkit.create_user('a9000000-0000-0000-0000-000000000001','platform-sales@test.local');
insert into public.platform_admins(user_id) values('a9000000-0000-0000-0000-000000000001')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
create temp table salesperson as
select public.platform_create_salesperson('Amina','254700111222','amina7') id;
grant select on pg_temp.salesperson to authenticated,service_role;
select is((select invitation_code from public.platform_salespeople where id=(select id from salesperson)),
  'AMINA7','salesperson codes are normalized');
select public.platform_update_sales_commission_settings(true,1250);
select is((public.platform_sales_snapshot()->'settings'->>'rate_bps')::integer,1250,
  'global commission rate is configurable');
reset role;

select throws_ok(
  format('update public.subscription_tiers set price_monthly=0 where id=%L',
    (select new_customer_tier_id from public.platform_billing_settings where singleton)),
  'P0001','new_customer_tier_must_remain_billable',
  'configured onboarding tier cannot be made free'
);

create function pg_temp.verify_testing_access_months(p_months integer)
returns boolean language plpgsql set search_path='' as $$
declare v_company_id uuid:=gen_random_uuid();v_tier_id uuid;v_price bigint;v_exact boolean;
begin
  select s.new_customer_tier_id,t.price_monthly into v_tier_id,v_price
  from public.platform_billing_settings s
  join public.subscription_tiers t on t.id=s.new_customer_tier_id where s.singleton;
  update public.platform_billing_settings set testing_access_months=p_months where singleton;
  insert into public.companies(id,code,name,status,subscription_tier_id,subscription_status)
  values(v_company_id,'ACCESS'||left(v_company_id::text,8),'Access duration fixture','approved',v_tier_id,null);
  perform public.reserve_initial_subscription_payment(
    v_company_id,v_tier_id,'ACCESS-'||v_company_id::text,v_price,p_months
  );
  perform public.activate_initial_subscription_purchase(
    v_company_id,v_tier_id,'ACCESS-'||v_company_id::text,v_price,v_price,p_months,now()
  );
  select subscription_expires_at=subscription_started_at+make_interval(months=>p_months)
  into v_exact from public.companies where id=v_company_id;
  delete from public.companies where id=v_company_id;
  return v_exact;
end;
$$;
select ok(pg_temp.verify_testing_access_months(1),'one-month testing access is exact');
select ok(pg_temp.verify_testing_access_months(2),'two-month testing access is exact');
select ok(pg_temp.verify_testing_access_months(3),'three-month testing access is exact');

update public.legal_document_versions set publication_state='superseded'
where document_type='terms' and publication_state='published';
insert into public.legal_document_versions(
  document_type,version,content_markdown,content_sha256,effective_at,publication_state,requires_company_acceptance
) values('terms','2098-08-20','# Paid onboarding',repeat('d',64),now()-interval '1 day','published',true);

select testkit.create_user('a9000000-0000-0000-0000-000000000002','merchant-sales@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated"}';
create temp table registration as
select public.provision_company_registration(
  'Attributed Merchant','Main','KES',null,null,'2098-08-20',repeat('d',64),'Merchant Owner',null,'amina7'
) result;
grant select on pg_temp.registration to authenticated,service_role;
select is((select result->>'sales_attributed' from registration),'true',
  'a valid salesperson code attributes the first company');
reset role;
select is((select subscription_status from public.companies where id=(select (result->>'company_id')::uuid from registration)),
  null,'new company has no free subscription access');
select is((select count(*)::integer from public.company_sales_attributions where company_id=(select (result->>'company_id')::uuid from registration)),
  1,'sales attribution is durable');
select throws_ok(
  $$update public.platform_salespeople set invitation_code='CHANGED' where invitation_code='AMINA7'$$,
  'P0001','sales_invitation_code_immutable','salesperson invitation codes are immutable'
);
select throws_ok(
  $$update public.company_sales_attributions set invitation_code='CHANGED' where invitation_code='AMINA7'$$,
  'P0001','company_sales_attribution_immutable','company sales attribution is immutable'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select public.platform_set_company_status(
  (select (result->>'company_id')::uuid from registration),'approved'
);
select public.platform_set_salesperson_active((select id from salesperson),false);
select is((select active from public.platform_salespeople where id=(select id from salesperson)),
  false,'salesperson can be deactivated after attribution');
reset role;

select throws_ok(
  format('select public.assert_entitled(%L,null)',(select (result->>'company_id')::uuid from registration)),
  'P0001','subscription_required: make the initial purchase to continue',
  'approved unpaid company remains blocked'
);

create temp table initial_quote as
select s.new_customer_tier_id tier_id,t.price_monthly price,s.testing_access_months,
  now()-interval '2 hours' paid_at
from public.platform_billing_settings s
join public.subscription_tiers t on t.id=s.new_customer_tier_id where s.singleton;
grant select on pg_temp.initial_quote to service_role,authenticated;

set local role service_role;
select public.reserve_initial_subscription_payment(
  (select (result->>'company_id')::uuid from registration),
  (select tier_id from initial_quote),'INITIAL-001',(select price from initial_quote),
  (select testing_access_months from initial_quote)
);
select throws_ok(
  format('select public.reserve_initial_subscription_payment(%L,%L,%L,%L,%L)',
    (select (result->>'company_id')::uuid from registration),(select tier_id from initial_quote),
    'INITIAL-002',(select price from initial_quote),(select testing_access_months from initial_quote)),
  'P0001','initial_purchase_payment_pending',
  'a company cannot open a competing initial payment'
);
reset role;
update public.platform_billing_settings set testing_access_months=1 where singleton;

set local role service_role;
select public.activate_initial_subscription_purchase(
  (select (result->>'company_id')::uuid from registration),
  (select tier_id from initial_quote),
  'INITIAL-001',
  (select price from initial_quote),(select price from initial_quote),
  (select testing_access_months from initial_quote),(select paid_at from initial_quote)
);
select is((select subscription_status from public.companies where id=(select (result->>'company_id')::uuid from registration)),
  'active','verified initial purchase activates access');
select is((select count(*)::integer from public.initial_subscription_purchases where company_id=(select (result->>'company_id')::uuid from registration)),
  1,'initial purchase is recorded once');
select is((select status from public.initial_subscription_payment_attempts where payment_reference='INITIAL-001'),
  'succeeded','activation settles the reserved payment attempt');
select ok((select subscription_expires_at>now()+interval '1 month' from public.companies where id=(select (result->>'company_id')::uuid from registration)),
  'configured testing months determine expiry');
select is((select subscription_started_at from public.companies where id=(select (result->>'company_id')::uuid from registration)),
  (select paid_at from initial_quote),'access starts at verified payment time');
select is((select testing_access_months from public.initial_subscription_purchases where company_id=(select (result->>'company_id')::uuid from registration)),
  (select testing_access_months from initial_quote),'pending payment honors its captured duration after configuration changes');
select is((select rate_bps from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  1250,'commission snapshots the global rate');
select is((select commission_amount from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  188::bigint,'commission is rounded from collected value');

select public.activate_initial_subscription_purchase(
  (select (result->>'company_id')::uuid from registration),
  (select tier_id from initial_quote),
  'INITIAL-001',(select price from initial_quote),(select price from initial_quote),
  (select testing_access_months from initial_quote),(select paid_at from initial_quote)
);
select is((select count(*)::integer from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  1,'webhook replay does not duplicate commission');
reset role;

select throws_ok(
  $$select public.activate_initial_subscription_purchase(
    (select (result->>'company_id')::uuid from registration),(select tier_id from initial_quote),
    'INITIAL-001',1499,1499,(select testing_access_months from initial_quote),(select paid_at from initial_quote)
  )$$,
  'P0001','initial_purchase_reference_conflict','mismatched payment-reference replay is rejected'
);
update public.companies set subscription_expires_at=now()-interval '1 second'
where id=(select (result->>'company_id')::uuid from registration);
select is(public.company_subscription_accessible(
  (select (result->>'company_id')::uuid from registration)),false,
  'active status cannot outlive its expiry timestamp');
select throws_ok(
  format('select public.assert_entitled(%L,null)',(select (result->>'company_id')::uuid from registration)),
  'P0001','subscription_expired: renew to continue selling',
  'server entitlement rejects overdue active subscriptions'
);
update public.companies c set subscription_expires_at=i.purchased_at+make_interval(months=>i.testing_access_months)
from public.initial_subscription_purchases i where i.company_id=c.id
  and c.id=(select (result->>'company_id')::uuid from registration);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is((public.platform_sales_snapshot(100,0)->'totals'->>'first_payments')::integer,1,
  'sales snapshot exposes global first-payment totals');
select is((public.platform_sales_snapshot(100,0)->>'commission_total')::integer,1,
  'sales snapshot exposes a paginatable commission total');
select public.platform_review_sales_commission(
  (select id from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  'approved',null,null
);
select is((select status from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  'approved','admin approves a pending commission');
select throws_ok(
  format('select public.platform_review_sales_commission(%L,%L,null,null)',
    (select id from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),'paid'),
  'P0001','payout_reference_required','paid status requires payout reference'
);
select public.platform_review_sales_commission(
  (select id from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  'paid','MPESA-PAYOUT-1',null
);
select is((select payout_reference from public.platform_sales_commissions where company_id=(select (result->>'company_id')::uuid from registration)),
  'MPESA-PAYOUT-1','admin records the manual payout reference');

create temp table inactive_salesperson as
select public.platform_create_salesperson('Inactive Rep',null,'STOPPED') id;
select public.platform_set_salesperson_active((select id from inactive_salesperson),false);
reset role;

update public.platform_billing_settings set sales_commissions_enabled=false where singleton;
insert into public.companies(id,code,name,status,subscription_tier_id,subscription_status)
select 'a9100000-0000-0000-0000-000000000001','NO-COMMISSION','No commission merchant',
  'approved',new_customer_tier_id,null from public.platform_billing_settings where singleton;
insert into public.company_sales_attributions(company_id,salesperson_id,invitation_code)
select 'a9100000-0000-0000-0000-000000000001',id,invitation_code
from public.platform_salespeople where invitation_code='AMINA7';
set local role service_role;
select public.reserve_initial_subscription_payment(
  'a9100000-0000-0000-0000-000000000001',
  (select new_customer_tier_id from public.platform_billing_settings where singleton),
  'INITIAL-DISABLED',1500,
  (select testing_access_months from public.platform_billing_settings where singleton)
);
select public.activate_initial_subscription_purchase(
  'a9100000-0000-0000-0000-000000000001',
  (select new_customer_tier_id from public.platform_billing_settings where singleton),
  'INITIAL-DISABLED',1500,1500,
  (select testing_access_months from public.platform_billing_settings where singleton),now()
);
reset role;
select is((select count(*)::integer from public.platform_sales_commissions
  where company_id='a9100000-0000-0000-0000-000000000001'),0,
  'disabled commissions create no record');

update public.platform_billing_settings set sales_commissions_enabled=true where singleton;
insert into public.companies(id,code,name,status,subscription_tier_id,subscription_status)
select 'a9100000-0000-0000-0000-000000000002','REVERSED-COMMISSION','Reversed commission merchant',
  'approved',new_customer_tier_id,null from public.platform_billing_settings where singleton;
insert into public.company_sales_attributions(company_id,salesperson_id,invitation_code)
select 'a9100000-0000-0000-0000-000000000002',id,invitation_code
from public.platform_salespeople where invitation_code='AMINA7';
set local role service_role;
select public.reserve_initial_subscription_payment(
  'a9100000-0000-0000-0000-000000000002',
  (select new_customer_tier_id from public.platform_billing_settings where singleton),
  'INITIAL-REVERSED',1500,
  (select testing_access_months from public.platform_billing_settings where singleton)
);
select public.activate_initial_subscription_purchase(
  'a9100000-0000-0000-0000-000000000002',
  (select new_customer_tier_id from public.platform_billing_settings where singleton),
  'INITIAL-REVERSED',1500,1500,
  (select testing_access_months from public.platform_billing_settings where singleton),now()
);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select public.platform_review_sales_commission(
  (select id from public.platform_sales_commissions
   where company_id='a9100000-0000-0000-0000-000000000002'),
  'reversed',null,'Customer payment refunded'
);
select is((select status from public.platform_sales_commissions
  where company_id='a9100000-0000-0000-0000-000000000002'),'reversed',
  'pending commissions can be reversed');
select is((select reversal_reason from public.platform_sales_commissions
  where company_id='a9100000-0000-0000-0000-000000000002'),'Customer payment refunded',
  'commission reversal records its reason');

create temp table stats_before as select public.platform_stats() value;
reset role;
insert into public.companies(id,code,name,status,subscription_tier_id,subscription_status,
  subscription_expires_at,billing_cycle,last_payment_reference)
select 'a9100000-0000-0000-0000-000000000003','LEGACY-ACCESS','Legacy converted access',
  'approved',new_customer_tier_id,'active',now()+interval '5 days','monthly',null
from public.platform_billing_settings where singleton;
insert into public.companies(id,code,name,status,subscription_tier_id,subscription_status,
  subscription_expires_at,billing_cycle,last_payment_reference)
select 'a9100000-0000-0000-0000-000000000004','OVERDUE-ACCESS','Overdue active flag',
  'approved',new_customer_tier_id,'active',now()-interval '5 days','monthly','OVERDUE-PAID'
from public.platform_billing_settings where singleton;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is((public.platform_stats()->>'subscriptions_active')::integer,
  ((select value->>'subscriptions_active' from stats_before)::integer+1),
  'active subscription metric excludes overdue rows');
select is((public.platform_stats()->>'mrr_estimate')::bigint,
  (select (value->>'mrr_estimate')::bigint from stats_before),
  'MRR excludes converted no-payment access and overdue subscriptions');
reset role;

update public.platform_salespeople set active=true where invitation_code='AMINA7';
select testkit.create_user('a9000000-0000-0000-0000-000000000003','invalid-code@test.local');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.platform_sales_snapshot()$$,
  'P0001','platform_admin_required','tenant users cannot inspect platform sales data'
);
select throws_ok(
  $$select public.provision_company_registration(
    'Invalid Code Merchant','Main','KES',null,null,'2098-08-20',repeat('d',64),null,null,'STOPPED'
  )$$,
  'P0001','invalid_or_inactive_sales_code','inactive codes cannot attribute new companies'
);

create temp table second_registration as
select set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
create temp table second_registration_result as
select public.provision_company_registration(
  'Second Merchant','Main','KES',null,null,'2098-08-20',repeat('d',64),null,null,'AMINA7'
) result;
select is((select result->>'sales_attributed' from second_registration_result),'false',
  'additional companies are not commission-attributed');

select * from finish();
rollback;
