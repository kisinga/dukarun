begin;
select plan(88);

select has_table('public','fulfillment_settings','location fulfillment settings exist');
select has_table('public','order_fulfillments','one fulfillment record can own an order');
select has_table('public','fulfillment_events','fulfillment history is durable');
select has_table('public','cash_custody_remittances','cash custody handoffs are durable');
select has_column('public','customers','delivery_address',
  'customers have one reusable delivery address');
select hasnt_function('public','transition_fulfillment',
  array['uuid','text','bigint','jsonb'],'generic state transitions are not a client API');
select has_function('public','start_fulfillment_preparation',array['uuid','bigint'],
  'preparation starts through a named command');
select has_function('public','cancel_fulfillment',array['uuid','bigint','text'],
  'cancellation coordinates fulfillment with the commercial lifecycle');
select has_function('public','public_fulfillment_tracking',array['text'],
  'anonymous tracking uses a narrow RPC');
select has_function('public','save_customer_profile',array['jsonb','uuid'],
  'customer profile editing is one transactional command');

select testkit.create_user('f1160000-0000-4000-8000-000000000001','fulfillment-admin@test.local');
select testkit.create_user('f1160000-0000-4000-8000-000000000002','fulfillment-process@test.local');
select testkit.create_user('f1160000-0000-4000-8000-000000000003','fulfillment-complete@test.local');
select testkit.create_user('f1160000-0000-4000-8000-000000000004','fulfillment-cashier@test.local');
select testkit.create_user('f1160000-0000-4000-8000-000000000005','fulfillment-settings@test.local');
select testkit.create_user('f1160000-0000-4000-8000-000000000006','fulfillment-approver@test.local');

create temp table fulfillment_fixture as
select testkit.provision(
  'f1160000-0000-4000-8000-000000000001','Fulfillment Test Store'
) company_id;
alter table fulfillment_fixture add column location_id uuid;
update fulfillment_fixture f set location_id=(select id from public.stock_locations l
  where l.company_id=f.company_id and l.is_default);
grant select on pg_temp.fulfillment_fixture to authenticated;

update public.companies set subscription_tier_id=(select id from public.subscription_tiers
  where name='Standard') where id=(select company_id from fulfillment_fixture);

select testkit.add_member((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000002','Fulfillment processor','{ProcessFulfillments}');
select testkit.add_member((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer',
  '{CompleteFulfillments}');
select testkit.add_member((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000004','Fulfillment cashier','{SettleOrder}');
select testkit.add_member((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000005','Fulfillment settings','{ManageCompanySettings}');
select testkit.add_member((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000006','Fulfillment approver',
  '{ManageApprovals,ApproveCustomerCredit,SettleOrder}');

insert into public.company_membership_locations(company_id,membership_id,location_id,is_primary)
select f.company_id,m.id,f.location_id,true from fulfillment_fixture f
join public.company_memberships m on m.company_id=f.company_id
where m.user_id in(
  'f1160000-0000-4000-8000-000000000002',
  'f1160000-0000-4000-8000-000000000003',
  'f1160000-0000-4000-8000-000000000004',
  'f1160000-0000-4000-8000-000000000005',
  'f1160000-0000-4000-8000-000000000006'
) on conflict(membership_id,location_id) do nothing;

insert into public.products(id,company_id,name)
select 'f1160000-0000-4000-8000-000000000010'::uuid,company_id,
  'Fulfillment item' from fulfillment_fixture
union all
select 'f1160000-0000-4000-8000-000000000011'::uuid,company_id,
  'Delivery fee' from fulfillment_fixture;
insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,wholesale_price,track_inventory
)
select 'f1160000-0000-4000-8000-000000000020'::uuid,
  'f1160000-0000-4000-8000-000000000010'::uuid,company_id,
  'Default','good','FULFILL-ITEM',500,100,true from fulfillment_fixture
union all
select 'f1160000-0000-4000-8000-000000000021'::uuid,
  'f1160000-0000-4000-8000-000000000011'::uuid,company_id,
  'Default','service','FULFILL-FEE',200,0,false from fulfillment_fixture;
insert into public.inventory_batches(
  company_id,variant_id,stock_location_id,quantity,remaining,unit_cost,purchased_at
)
select company_id,'f1160000-0000-4000-8000-000000000020',location_id,
  10,10,100,now()-interval '1 day' from fulfillment_fixture;

create temp table fulfillment_mpesa_account as
with account as (
  insert into public.payment_provider_accounts(
    company_id,provider,environment,display_name,status,activated_at,ledger_account_code
  ) select company_id,'mpesa','production','Fulfillment test till','active',now(),'MPESA'
    from fulfillment_fixture returning id,company_id
), mapped as (
  insert into public.location_payment_provider_accounts(
    location_id,company_id,provider,provider_account_id
  ) select f.location_id,a.company_id,'mpesa',a.id
    from account a join fulfillment_fixture f on f.company_id=a.company_id
  returning location_id,provider_account_id
)
select a.id account_id,a.company_id,m.location_id
from account a join mapped m on m.provider_account_id=a.id;
grant select on pg_temp.fulfillment_mpesa_account to authenticated;

select is((select count(*)::int from public.roles where is_template and name in('Admin','Manager')
  and '{ProcessFulfillments,CompleteFulfillments,ManageFulfillments}'::text[]<@permissions),2,
  'Admin and Manager templates receive all fulfillment capabilities');
select is((select count(*)::int from public.roles where company_id=(select company_id from fulfillment_fixture)
  and name in('Admin','Manager')
  and '{ProcessFulfillments,CompleteFulfillments,ManageFulfillments}'::text[]<@permissions),2,
  'provisioned Admin and Manager roles receive all fulfillment capabilities');
select is((select permissions from public.roles where is_template and name='Delivery person'),
  array['CompleteFulfillments']::text[],
  'the delivery person template can perform assigned handoffs without broader access');
select ok(exists(select 1 from public.ledger_accounts where company_id=(select company_id from fulfillment_fixture)
  and code='CASH_IN_CUSTODY' and type='asset'),
  'provisioning creates the custody asset account');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select lives_ok(format($sql$select public.update_fulfillment_settings(%L,
  '{"enabled":true,"pickup_enabled":true,"delivery_enabled":true,"cod_enabled":true,
    "default_delivery_fee_variant_id":"f1160000-0000-4000-8000-000000000021",
    "notification_channel":"sms","sms_fallback":false,"notify_ready":false}'::jsonb)$sql$,
  (select location_id from fulfillment_fixture)),
  'an entitled settings manager can enable fulfillment');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000005','Fulfillment settings');
select lives_ok(format($sql$select public.update_fulfillment_settings(%L,
  '{"pickup_sla_minutes":45}'::jsonb)$sql$,(select location_id from fulfillment_fixture)),
  'a settings manager can update operations without communications permission');
select is((select jsonb_build_object(
    'pickup_sla_minutes',(s->>'pickup_sla_minutes')::int,
    'notification_channel',s->>'notification_channel',
    'sms_fallback',(s->>'sms_fallback')::boolean,
    'notify_ready',(s->>'notify_ready')::boolean)
  from (select public.fulfillment_settings_at_location(
    (select location_id from fulfillment_fixture)) s) q),
  '{"pickup_sla_minutes":45,"notification_channel":"sms",
    "sms_fallback":false,"notify_ready":false}'::jsonb,
  'a partial operations update preserves notification settings');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select public.update_fulfillment_settings((select location_id from fulfillment_fixture),
  '{"notify_ready":true}'::jsonb);

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000002','Fulfillment processor');
select throws_ok('select * from public.order_fulfillments','42501',
  'permission denied for table order_fulfillments','fulfillment tables have no broad member read');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select is(public.normalize_fulfillment_phone('0712 345 678'),'+254712345678',
  'checkout phone normalization is canonical');
create temp table profile_customer as
select public.save_customer_profile(jsonb_build_object(
  'first_name','Profile','last_name','Customer','phone','0712000010',
  'email','profile@example.test','delivery_address','  Ngong Road, Nairobi  ',
  'tax_registration_number','P000010','notes','Call first',
  'notifications_enabled',true,'sms_notifications_enabled',true,
  'whatsapp_notifications_enabled',false
)) id;
select is((select jsonb_build_object('address',delivery_address,'phone',phone_normalized,
    'tax_pin',tax_registration_number) from public.customers
    where id=(select id from profile_customer)),
  '{"address":"Ngong Road, Nairobi","phone":"+254712000010","tax_pin":"P000010"}'::jsonb,
  'the profile command creates and normalizes one complete customer profile');
select public.save_customer_profile(jsonb_build_object(
  'first_name','Profile','last_name','','phone','','email','','delivery_address','',
  'tax_registration_number','','notes','','notifications_enabled',false,
  'sms_notifications_enabled',false,'whatsapp_notifications_enabled',false
),(select id from profile_customer));
select is((select jsonb_build_object('last_name',last_name,'phone',phone,'email',email,
    'address',delivery_address,'tax_pin',tax_registration_number,'notes',notes,
    'notifications',notifications_enabled) from public.customers
    where id=(select id from profile_customer)),
  '{"last_name":null,"phone":null,"email":null,"address":null,"tax_pin":null,
    "notes":null,"notifications":false}'::jsonb,
  'the profile command intentionally clears optional values');
select throws_ok($sql$select public.save_customer_profile(jsonb_build_object(
    'first_name','Invalid Profile','delivery_address',repeat('x',501)))$sql$,
  'P0001','delivery_address_too_long','an invalid profile is rejected atomically');
select is((select count(*)::int from public.customers
    where company_id=(select company_id from fulfillment_fixture)
      and first_name='Invalid Profile'),0,
  'a rejected profile command leaves no partial customer');
select testkit.ensure_open_session();

create temp table pickup_checkout as
select public.post_fulfillment_sale_at_location(
  (select location_id from fulfillment_fixture),
  '{"name":"Alice Pickup","phone":"0712345678","save_as_customer":true}'::jsonb,
  '[{"variant_id":"f1160000-0000-4000-8000-000000000020","quantity":1,"unit_price":500}]'::jsonb,
  '[{"method":"cash","amount":500}]'::jsonb,
  '{"type":"pickup","collection_kind":"none","recipient_name":"Alice Pickup",
    "phone":"0712345678","preparation_notes":"No bag",
    "handoff_notes":"Ask for Alice","transactional_message_consent":false}'::jsonb,
  'fulfillment-pickup-1',null,null
) result;
grant select on pg_temp.pickup_checkout to authenticated,anon;
create temp table pickup_code as select o.code from public.orders o
  where o.id=(select (result->>'order_id')::uuid from pickup_checkout);
grant select on pg_temp.pickup_code to anon;

select is((select customer_origin from public.customers where id=
  (select (result->>'customer_id')::uuid from pickup_checkout)),'checkout',
  'checkout-created customers record their origin');
select is((select jsonb_build_object('notifications',notifications_enabled,
    'sms',sms_notifications_enabled,'whatsapp',whatsapp_notifications_enabled,
    'phone',phone_normalized) from public.customers where id=
    (select (result->>'customer_id')::uuid from pickup_checkout)),
  '{"notifications":false,"sms":false,"whatsapp":false,"phone":"+254712345678"}'::jsonb,
  'checkout customers are normalized and excluded from promotional messaging');
select is((select count(*)::int from public.match_checkout_customers('254712345678')),1,
  'exact normalized phone matching suggests the saved customer');
select public.update_customer(
  p_customer_id=>(select (result->>'customer_id')::uuid from pickup_checkout),
  p_delivery_address=>'Ngong Road, Nairobi');
select is((select delivery_address from public.customers where id=
  (select (result->>'customer_id')::uuid from pickup_checkout)),'Ngong Road, Nairobi',
  'customer editing stores a trimmed reusable delivery address');
select public.update_customer(
  p_customer_id=>(select (result->>'customer_id')::uuid from pickup_checkout),
  p_delivery_address=>'');
select is((select delivery_address from public.customers where id=
  (select (result->>'customer_id')::uuid from pickup_checkout)),null,
  'customer editing can intentionally clear the delivery address');
reset role;
update public.customers set phone='0733 000 001' where id=
  (select (result->>'customer_id')::uuid from pickup_checkout);
select is((select phone_normalized from public.customers where id=
  (select (result->>'customer_id')::uuid from pickup_checkout)),'+254733000001',
  'normal customer updates keep the canonical phone projection synchronized');
update public.customers set phone='0712 345 678' where id=
  (select (result->>'customer_id')::uuid from pickup_checkout);
select is((select count(*)::int from public.outbox where fulfillment_id=
  (select (result->>'fulfillment_id')::uuid from pickup_checkout)),1,
  'initial tracking and proof is queued even without later milestone consent');

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((public.public_fulfillment_tracking(
  (select result->>'tracking_token' from pickup_checkout))->>'order_code'),
  (select code from pickup_code),
  'the token exposes public order progress without authentication');
select ok(not (public.public_fulfillment_tracking(
  (select result->>'tracking_token' from pickup_checkout)) ?| array[
    'phone_normalized','address_line','payments','assignee','customer_id','total','pin'
  ]),'public tracking excludes private and financial fields');

reset role;
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000002','Fulfillment processor');
select is((select jsonb_strip_nulls(jsonb_build_object('recipient',recipient_name,
    'phone',phone_normalized,'address',address_line,'handoff',handoff_notes,
    'preparation',preparation_notes))
  from public.fulfillment_board((select location_id from fulfillment_fixture),null,false,null,20)
  where id=(select (result->>'fulfillment_id')::uuid from pickup_checkout)),
  '{"preparation":"No bag"}'::jsonb,
  'processors receive preparation data but no recipient or handoff data');
select is((public.start_fulfillment_preparation(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout),1)->>'state_version')::int,
  2,'processor starts preparation with the expected version');
select throws_ok(format($sql$select public.mark_fulfillment_ready(%L,1)$sql$,
  (select result->>'fulfillment_id' from pickup_checkout)),'P0001',
  'stale_fulfillment_version: expected 1, current 2','stale transitions are rejected');
select is((public.mark_fulfillment_ready(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout),2)->>'state_version')::int,
  3,'processor marks prepared work ready');
reset role;
select is((select count(*)::int from public.outbox where fulfillment_id=
  (select (result->>'fulfillment_id')::uuid from pickup_checkout)),1,
  'milestone messages stay off when the checkout disables status updates');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer');
select is(public.current_access_snapshot()->'workspaces','["fulfillment"]'::jsonb,
  'a delivery-only role receives only the fulfillment workspace');
select is((select count(*)::int from public.customers),0,
  'a delivery-only role cannot read customer records');
select is((select count(*)::int from public.orders),0,
  'a delivery-only role cannot read broad sales records');
select is((select count(*)::int from public.products),0,
  'a delivery-only role cannot read the product catalog');
select throws_ok($sql$select public.save_draft(null,'[]'::jsonb,null)$sql$,'P0001',
  'permission_denied: SettleOrder required',
  'a delivery-only role cannot create a sale through the shared order core');
select throws_ok($sql$select public.create_customer('Delivery Mutation')$sql$,'P0001',
  'permission_denied: ManageCustomers required',
  'a delivery-only role cannot create customers through a security-definer RPC');
select throws_ok(format($sql$select public.update_customer(%L,p_first_name=>'Changed')$sql$,
    (select result->>'customer_id' from pickup_checkout)),'P0001',
  'permission_denied: ManageCustomers required',
  'a delivery-only role cannot update customers through a security-definer RPC');
select throws_ok($sql$select public.save_customer_profile(
    '{"first_name":"Delivery Mutation"}'::jsonb)$sql$,'P0001',
  'permission_denied: ManageCustomers required',
  'a delivery-only role cannot invoke the profile command');
select is((select count(*)::int from public.fulfillment_board(
  (select location_id from fulfillment_fixture),array['ready'],false,null,20)
  where id=(select (result->>'fulfillment_id')::uuid from pickup_checkout)),1,
  'a completer can discover unassigned ready work');
select is((public.fulfillment_detail(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout))->>'phone_normalized'),null,
  'claimable work does not expose recipient details before claim');
select is((public.claim_fulfillment(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout),3)->>'state_version')::int,
  4,'a completer atomically claims ready work');
select is((select phone_normalized from public.fulfillment_board(
  (select location_id from fulfillment_fixture),null,true,null,20)
  where id=(select (result->>'fulfillment_id')::uuid from pickup_checkout)),
  '+254712345678','the assigned completer receives the required recipient contact');

create temp table wrong_pin as select case when result->>'pin'='000000'
  then '000001' else '000000' end value from pickup_checkout;
grant select on pg_temp.wrong_pin to authenticated;
select is((public.complete_fulfillment(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout),
  (select value from wrong_pin),4,null)->>'status'),'invalid_pin',
  'an invalid PIN is rejected without losing the fulfillment version');
select is((public.complete_fulfillment(
  (select (result->>'fulfillment_id')::uuid from pickup_checkout),
  (select result->>'pin' from pickup_checkout),4,null)->>'status'),'fulfilled',
  'the assigned completer can finish pickup with its PIN');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
create temp table mpesa_fulfillment_checkout as
select public.prepare_mpesa_fulfillment_checkout(
  (select location_id from fulfillment_fixture),
  '{"name":"Mary Mpesa","phone":"0711000000","save_as_customer":true,
    "delivery_address":"Riverside Drive, Nairobi","save_delivery_address":true}'::jsonb,
  '[{"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '{"type":"pickup","collection_kind":"none","recipient_name":"Mary Mpesa",
    "phone":"0711000000","transactional_message_consent":false}'::jsonb,
  '254711000000',200,0,'fulfillment-mpesa-1',null,false
) result;
grant select on pg_temp.mpesa_fulfillment_checkout to authenticated;
select is((select result->>'fulfillment_id' from mpesa_fulfillment_checkout),null,
  'M-PESA preparation does not create accepted fulfillment work');
reset role;
select is((select delivery_address from public.customers where id=
  (select (result->>'customer_id')::uuid from mpesa_fulfillment_checkout)),null,
  'M-PESA preparation does not update the reusable customer address early');
update public.customers set deleted_at=now() where id=
  (select (result->>'customer_id')::uuid from mpesa_fulfillment_checkout);
select is((select count(*)::int from public.order_fulfillments where order_id=
  (select (result->>'subject_id')::uuid from mpesa_fulfillment_checkout)),0,
  'an unpaid M-PESA order has no fulfillment row');

create temp table mpesa_fulfillment_evidence as
with collection as (
  insert into public.payment_collections(
    company_id,provider_account_id,provider,environment,provider_receipt,amount,
    occurred_at,payer_phone,source,verification_status,provider_status,
    allocation_status,mpesa_intent_id
  ) select a.company_id,a.account_id,'mpesa','production','FULFILL-MPESA-1',200,
      now(),'254711000000','stk','provider_notified','received','reserved',
      (c.result->>'intent_id')::uuid
    from fulfillment_mpesa_account a cross join mpesa_fulfillment_checkout c
  returning id,company_id
), allocation as (
  insert into public.payment_collection_allocations(
    collection_id,company_id,amount,order_id,status
  ) select c.id,c.company_id,200,(m.result->>'subject_id')::uuid,'reserved'
    from collection c cross join mpesa_fulfillment_checkout m
  returning id,collection_id
)
select a.id allocation_id,a.collection_id from allocation a;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.mpesa_post_reserved_allocation(
  (select collection_id from mpesa_fulfillment_evidence),
  (select allocation_id from mpesa_fulfillment_evidence),
  row(
    (select company_id from fulfillment_fixture),
    (select location_id from fulfillment_fixture),
    'f1160000-0000-4000-8000-000000000001'::uuid,
    (select id from public.cashier_sessions where company_id=
      (select company_id from fulfillment_fixture) and status='open'),
    now(),current_date,'mpesa_provider',null
  )::public.posting_context,'[]'::jsonb
);
select is((select jsonb_build_object('order_status',o.status,'fulfillment_count',count(f.id))
  from public.orders o left join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'subject_id')::uuid from mpesa_fulfillment_checkout)
  group by o.id),'{"order_status":"completed","fulfillment_count":1}'::jsonb,
  'provider-confirmed M-PESA atomically accepts the order and creates fulfillment');
select is((select delivery_address from public.customers where id=
  (select (result->>'customer_id')::uuid from mpesa_fulfillment_checkout)),
  'Riverside Drive, Nairobi',
  'provider-confirmed M-PESA settles and persists the address for an archived customer');

reset role;
update public.customers set is_credit_approved=true,credit_limit=10000
where id=(select (result->>'customer_id')::uuid from pickup_checkout);
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
create temp table credit_delivery_checkout as
select public.post_fulfillment_credit_sale_at_location(
  (select location_id from fulfillment_fixture),
  (select (result->>'customer_id')::uuid from pickup_checkout),
  '[{"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '{"type":"delivery","collection_kind":"none","recipient_name":"Alice Credit",
    "phone":"0712345678","address":"Upper Hill, Nairobi"}'::jsonb,
  'fulfillment-credit-delivery-1',null,null,
  jsonb_build_object('customer_id',(select result->>'customer_id' from pickup_checkout),
    'name','Alice Pickup','phone','0712345678','save_as_customer',false,
    'delivery_address','Upper Hill, Nairobi','save_delivery_address',true)
) result;
grant select on pg_temp.credit_delivery_checkout to authenticated;
reset role;
select is((select jsonb_build_object('order_status',o.status,'receivable_kind',o.receivable_kind,
    'credit',o.is_credit_sale,'collection_kind',f.collection_kind)
  from public.orders o join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from credit_delivery_checkout)),
  '{"order_status":"completed","receivable_kind":"credit","credit":true,
    "collection_kind":"none"}'::jsonb,
  'ordinary customer credit remains canonical while the order is delivered');
select is((select delivery_address from public.customers where id=
  (select (result->>'customer_id')::uuid from pickup_checkout)),'Upper Hill, Nairobi',
  'credit delivery persists the customer address in the same checkout transaction');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select public.start_fulfillment_preparation(
  (select (result->>'fulfillment_id')::uuid from credit_delivery_checkout),1);
select public.mark_fulfillment_ready(
  (select (result->>'fulfillment_id')::uuid from credit_delivery_checkout),2);
select public.dispatch_fulfillment(
  (select (result->>'fulfillment_id')::uuid from credit_delivery_checkout),3);
reset role;
select is((select jsonb_build_object('fulfillment',f.status,'balance',public.order_open_balance_core(o.id))
  from public.orders o join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from credit_delivery_checkout)),
  '{"fulfillment":"in_transit","balance":200}'::jsonb,
  'dispatch moves an approved credit delivery without collecting or reposting money');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select is((public.complete_fulfillment(
  (select (result->>'fulfillment_id')::uuid from credit_delivery_checkout),
  (select result->>'pin' from credit_delivery_checkout),4,null)->>'status'),'fulfilled',
  'credit delivery can be fulfilled while its customer-account balance remains due');

reset role;
update public.customers set credit_limit=100
where id=(select (result->>'customer_id')::uuid from pickup_checkout);
update public.roles set permissions=array_remove(permissions,'ApproveCustomerCredit')
where company_id=(select company_id from fulfillment_fixture) and name='Admin';
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
create temp table held_credit_pickup as
select public.post_fulfillment_credit_sale_at_location(
  (select location_id from fulfillment_fixture),
  (select (result->>'customer_id')::uuid from pickup_checkout),
  '[{"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '{"type":"pickup","collection_kind":"none","recipient_name":"Alice Credit",
    "phone":"0712345678"}'::jsonb,
  'fulfillment-credit-pickup-held-1',null,'Credit limit exception'
) result;
grant select on pg_temp.held_credit_pickup to authenticated;
select is((select result->>'status' from held_credit_pickup),'approval_required',
  'credit pickup preserves the established credit approval workflow');
reset role;
select is((select jsonb_build_object('order_status',o.status,'fulfillment_count',count(f.id),
    'intent_staged',bool_or(a.metadata?'fulfillment_request'))
  from public.orders o join public.approvals a on a.subject_id=o.id
  left join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from held_credit_pickup)
  group by o.id),
  '{"order_status":"pending_payment","fulfillment_count":0,"intent_staged":true}'::jsonb,
  'approval-held credit keeps one intent and exposes no premature fulfillment work');
reset role;
update public.roles set permissions=permissions||array['ApproveCustomerCredit']::text[]
where company_id=(select company_id from fulfillment_fixture) and name='Admin'
  and not ('ApproveCustomerCredit'=any(permissions));
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000006','Fulfillment approver');
select public.approve_request((select (result->>'approval_id')::uuid from held_credit_pickup),
  'Approved for established customer');
reset role;
select is((select jsonb_build_object('order_status',o.status,'fulfillment_count',count(f.id))
  from public.orders o left join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from held_credit_pickup)
  group by o.id),'{"order_status":"completed","fulfillment_count":1}'::jsonb,
  'approving the sale materializes its fulfillment exactly once');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select testkit.close_open_session();
create temp table cod_checkout as
select public.post_fulfillment_sale_at_location(
  (select location_id from fulfillment_fixture),
  '{"name":"David Delivery","phone":"0722000000","save_as_customer":true,
    "delivery_address":"Westlands, Nairobi","save_delivery_address":true}'::jsonb,
  '[{"variant_id":"f1160000-0000-4000-8000-000000000020","quantity":1,"unit_price":500},
    {"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '[]'::jsonb,
  '{"type":"delivery","collection_kind":"cod","recipient_name":"David Delivery",
    "phone":"0722000000","address":"Westlands, Nairobi",
    "transactional_message_consent":false}'::jsonb,
  'fulfillment-cod-1',null,null
) result;
grant select on pg_temp.cod_checkout to authenticated;
select is((select status from public.orders where id=(select (result->>'order_id')::uuid from cod_checkout)),
  'pending_payment','COD checkout creates one unpaid order without consuming stock');
reset role;
select is((select jsonb_build_object('customer_address',c.delivery_address,
    'order_address',f.address_line) from public.customers c
    join public.order_fulfillments f on f.customer_id=c.id
    where f.id=(select (result->>'fulfillment_id')::uuid from cod_checkout)),
  '{"customer_address":"Westlands, Nairobi","order_address":"Westlands, Nairobi"}'::jsonb,
  'COD stores a reusable customer address and an immutable order snapshot');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');

create temp table cancelled_checkout as
select public.post_fulfillment_sale_at_location(
  (select location_id from fulfillment_fixture),
  '{"name":"Cancelled Delivery","phone":"0722000001","save_as_customer":true}'::jsonb,
  '[{"variant_id":"f1160000-0000-4000-8000-000000000020","quantity":1,"unit_price":500},
    {"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '[]'::jsonb,
  '{"type":"delivery","collection_kind":"cod","recipient_name":"Cancelled Delivery",
    "phone":"0722000001","address":"Kilimani, Nairobi"}'::jsonb,
  'fulfillment-cancel-1',null,null
) result;
select is((public.cancel_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cancelled_checkout),1,
  'Customer changed their mind')->>'status'),'cancelled',
  'a manager can cancel accepted work before dispatch without accounting reversal');
reset role;
select is((select jsonb_build_object('order',o.status,'fulfillment',f.status)
  from public.orders o join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from cancelled_checkout)),
  '{"order":"voided","fulfillment":"cancelled"}'::jsonb,
  'pre-dispatch cancellation synchronizes commercial and physical state');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
create temp table reversed_checkout as
select public.post_fulfillment_sale_at_location(
  (select location_id from fulfillment_fixture),
  '{"name":"Reversed Delivery","phone":"0722000002","save_as_customer":true}'::jsonb,
  '[{"variant_id":"f1160000-0000-4000-8000-000000000020","quantity":1,"unit_price":500},
    {"variant_id":"f1160000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}]'::jsonb,
  '[]'::jsonb,
  '{"type":"delivery","collection_kind":"cod","recipient_name":"Reversed Delivery",
    "phone":"0722000002","address":"Parklands, Nairobi"}'::jsonb,
  'fulfillment-reverse-1',null,null
) result;
select public.start_fulfillment_preparation(
  (select (result->>'fulfillment_id')::uuid from reversed_checkout),1);
select public.mark_fulfillment_ready(
  (select (result->>'fulfillment_id')::uuid from reversed_checkout),2);
select public.dispatch_fulfillment(
  (select (result->>'fulfillment_id')::uuid from reversed_checkout),3);
select is((public.cancel_fulfillment(
  (select (result->>'fulfillment_id')::uuid from reversed_checkout),4,
  'Customer rejected at dispatch')->>'status'),'completed',
  'post-dispatch cancellation reuses the existing immediate reversal path');
reset role;
select is((select jsonb_build_object('order',o.status,'fulfillment',f.status)
  from public.orders o join public.order_fulfillments f on f.order_id=o.id
  where o.id=(select (result->>'order_id')::uuid from reversed_checkout)),
  '{"order":"voided","fulfillment":"cancelled"}'::jsonb,
  'completed reversal synchronizes the physical workflow without a second cancellation fact');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000002','Fulfillment processor');
select public.start_fulfillment_preparation(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),1);
select public.mark_fulfillment_ready(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),2);

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select is((public.assign_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),
  (select m.id from public.company_memberships m where m.company_id=(select company_id from fulfillment_fixture)
    and m.user_id='f1160000-0000-4000-8000-000000000003'),3)->>'state_version')::int,
  4,'a manager assigns the COD handoff');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer');
select is((public.dispatch_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),4)->>'state_version')::int,
  5,'dispatch invoices COD and moves delivery in transit atomically');
reset role;
select is((select jsonb_build_object('status',status,'receivable_kind',receivable_kind,
    'is_credit_sale',is_credit_sale,'due_date_absent',credit_due_at is null)
  from public.orders where id=(select (result->>'order_id')::uuid from cod_checkout)),
  '{"status":"completed","receivable_kind":"cod","is_credit_sale":false,
    "due_date_absent":true}'::jsonb,
  'COD dispatch completes the order without treating it as credit risk');
select is((select coalesce(sum(case when l.debit>0 then l.debit else -l.credit end),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.order_id=(select (result->>'order_id')::uuid from cod_checkout)
    and a.code='ACCOUNTS_RECEIVABLE'),700::bigint,
  'COD dispatch posts the exact receivable');
select is((select remaining::int from public.inventory_batches where variant_id=
  'f1160000-0000-4000-8000-000000000020'),8,
  'inventory is consumed once for prepaid checkout and once at COD dispatch');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer');
select is((public.report_fulfillment_failure(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),5,'Recipient unavailable')
  ->>'state_version')::int,6,'the assigned completer records a failed attempt with a reason');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000002','Fulfillment processor');
select ok(not exists(select 1 from jsonb_array_elements(public.fulfillment_detail(
  (select (result->>'fulfillment_id')::uuid from cod_checkout))->'events') event
  where event->>'note' is not null),'processors do not receive handoff event notes');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer');
select is((public.retry_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),6)->>'state_version')::int,
  7,'retry returns failed delivery to ready for a fresh handoff attempt');
select is((public.dispatch_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),7)->>'state_version')::int,
  8,'redispatch does not repeat commercial completion');
select is((select count(*)::int from public.cashier_sessions where company_id=
  (select company_id from fulfillment_fixture) and status='open'),0,
  'a completer does not need an open cashier session to collect custody cash');
select is((public.collect_cod_cash(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),8)->>'amount')::bigint,
  700::bigint,'COD cash settles the exact order balance into custody');
select is(public.fulfillment_cod_balance(
  (select (result->>'fulfillment_id')::uuid from cod_checkout)),0::bigint,
  'the narrow COD balance RPC reaches zero');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000001','Admin');
select is((public.cancel_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),8,
  'Cancellation after collection')->>'status'),'payment_resolution_required',
  'collected COD money must be resolved before cancellation');
select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000003','Fulfillment completer');
select is((public.complete_fulfillment(
  (select (result->>'fulfillment_id')::uuid from cod_checkout),
  (select result->>'pin' from cod_checkout),8,null)->>'status'),'fulfilled',
  'zero balance and valid PIN complete the delivery');

create temp table cod_holding as select * from public.cash_custody_holdings(
  (select location_id from fulfillment_fixture));
grant select on pg_temp.cod_holding to authenticated;
create temp table cod_remittance as select public.submit_cash_custody_remittance(
  (select location_id from fulfillment_fixture),array[(select payment_id from cod_holding)]) result;
grant select on pg_temp.cod_remittance to authenticated;
select is((select result->>'expected_amount' from cod_remittance),'700',
  'the custodian submits selected settled cash as one handoff');

select testkit.as_user((select company_id from fulfillment_fixture),
  'f1160000-0000-4000-8000-000000000004','Fulfillment cashier');
select testkit.ensure_open_session();
select is((public.accept_cash_custody_remittance(
  (select (result->>'remittance_id')::uuid from cod_remittance))->>'status'),'accepted',
  'a different cashier accepts the exact cash into an open session');
reset role;
select is((select jsonb_build_object('status',status,'expected',expected_amount,
    'received',received_amount) from public.cash_custody_remittances
  where id=(select (result->>'remittance_id')::uuid from cod_remittance)),
  '{"status":"accepted","expected":700,"received":700}'::jsonb,
  'accepted custody records preserve the expected and received amounts');
select is((select coalesce(sum(l.debit-l.credit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from fulfillment_fixture)
    and a.code='CASH_IN_CUSTODY'),0::bigint,
  'cash handoff clears the custody asset account');
select is((select count(*)::int from public.customer_credit_aging a
  where a.customer_id=(select (result->>'customer_id')::uuid from cod_checkout)),0,
  'COD receivables do not enter customer credit aging');

select * from finish();
rollback;
