begin;
select plan(15);

select testkit.create_user(
  '88888888-8888-4888-8888-888888888881',
  'cashier-alert-admin@test.local',
  '+254700000881'
);
create temp table alert_company as
select testkit.provision(
  '88888888-8888-4888-8888-888888888881','Cashier Alert Store'
) company_id;
grant select on pg_temp.alert_company to authenticated;

select is(
  (select primary_contact_user_id from public.companies
   where id=(select company_id from alert_company)),
  '88888888-8888-4888-8888-888888888881'::uuid,
  'first approved admin becomes primary contact'
);

select testkit.as_user(
  (select company_id from alert_company),
  '88888888-8888-4888-8888-888888888881','Admin'
);
create temp table alert_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":0},
  {"account_code":"MPESA","declared":0}
]') session_id;
grant select on pg_temp.alert_session to authenticated;

set constraints cashier_session_notifications immediate;
set constraints cashier_session_notifications deferred;

select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  1,'opening queues one alert'
);
select is(
  (select recipient from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  '+254700000881','opening targets explicit primary contact'
);
select is(
  (select source from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  'cashier_session','alert has cashier-session source'
);
select ok(
  (select body like '%Day opened%' and body like '%Main%' and body like '%Opening balances%'
   from public.outbox where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  'opening message contains report details'
);
select ok(
  (select scheduled_after<=now() from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  'operational alert bypasses quiet-hour scheduling'
);
select is(
  (select whatsapp_reserved_this_period from public.companies
   where id=(select company_id from alert_company)),
  1,'opening reserves standard WhatsApp quota'
);

reset role;
select public.queue_cashier_session_notification(
  (select session_id from alert_session),'opened'
);
select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='opened'),
  1,'repeated opening alert is idempotent'
);
select testkit.as_user(
  (select company_id from alert_company),
  '88888888-8888-4888-8888-888888888881','Admin'
);

reset role;
insert into public.products(id,company_id,name)
select '88888888-8888-4888-8888-888888888891',company_id,'Alert Service'
from alert_company;
insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,track_inventory
)
select '88888888-8888-4888-8888-888888888892',
  '88888888-8888-4888-8888-888888888891',company_id,
  'Default','service','ALERT-SVC',2500,false
from alert_company;
select testkit.as_user(
  (select company_id from alert_company),
  '88888888-8888-4888-8888-888888888881','Admin'
);

create temp table alert_sale as select public.post_sale(
  null,
  '[{"variant_id":"88888888-8888-4888-8888-888888888892","quantity":1,"unit_price":2500}]',
  '[{"method":"cash","amount":2500}]'
) order_id;

select public.close_cashier_session((select session_id from alert_session),'[
  {"account_code":"CASH_ON_HAND","declared":2500},
  {"account_code":"MPESA","declared":0}
]');
set constraints cashier_session_notifications immediate;
set constraints cashier_session_notifications deferred;

select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='closed'),
  1,'closing queues one alert'
);
select ok(
  (select body like '%Day closed%' and body like '%Sales:%KES 2,500%'
     and body like '%Cash: KES 2,500%' and body like '%Variance:%None%'
   from public.outbox where cashier_session_id=(select session_id from alert_session)
     and cashier_session_event='closed'),
  'closing message contains sales, collections, and variance'
);
select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from alert_session)),
  2,'session has exactly one opening and one closing alert'
);

-- Absence of an explicit primary contact must skip—not guess—and must not
-- roll back the accounting operation.
reset role;
update public.companies set primary_contact_user_id=null
where id=(select company_id from alert_company);
select testkit.as_user(
  (select company_id from alert_company),
  '88888888-8888-4888-8888-888888888881','Admin'
);
create temp table no_primary_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":2500},
  {"account_code":"MPESA","declared":0}
]') session_id;
set constraints cashier_session_notifications immediate;
select ok((select session_id is not null from no_primary_session),
  'missing primary contact does not block session opening');
select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from no_primary_session)),
  0,'missing primary contact queues no alert'
);

select public.close_cashier_session((select session_id from no_primary_session),'[
  {"account_code":"CASH_ON_HAND","declared":2500},
  {"account_code":"MPESA","declared":0}
]');
reset role;
update public.companies set
  primary_contact_user_id='88888888-8888-4888-8888-888888888881'
where id=(select company_id from alert_company);
update public.subscription_tiers set whatsapp_per_period=0
where id=(select subscription_tier_id from public.companies
  where id=(select company_id from alert_company));
select testkit.as_user(
  (select company_id from alert_company),
  '88888888-8888-4888-8888-888888888881','Admin'
);
create temp table quota_session as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":2500},
  {"account_code":"MPESA","declared":0}
]') session_id;
select ok((select session_id is not null from quota_session),
  'exhausted WhatsApp quota does not block session opening');
select is(
  (select count(*)::integer from public.outbox
   where cashier_session_id=(select session_id from quota_session)),
  0,'exhausted WhatsApp quota queues no alert'
);

select * from finish();
rollback;
