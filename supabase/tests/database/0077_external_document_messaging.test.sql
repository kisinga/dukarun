begin;
select plan(33);

select testkit.create_user('77777777-7777-4777-8777-777777777771','docs-admin@test.local','+254700000771');
select testkit.create_user('77777777-7777-4777-8777-777777777779','docs-root@test.local','+254700000779');
create temp table docs_fixture as
select testkit.provision('77777777-7777-4777-8777-777777777771','Document Test Store') company_id;
grant select on pg_temp.docs_fixture to authenticated;

insert into public.platform_admins(user_id) values('77777777-7777-4777-8777-777777777779');
insert into public.customers(id,company_id,first_name,last_name,phone,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled)
select '77777777-7777-4777-8777-777777777772',company_id,'Amina','Buyer','+254700000772',true,true,true
from docs_fixture;
insert into public.customers(id,company_id,first_name,last_name,phone,is_supplier,supplier_active,
  notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled)
select '77777777-7777-4777-8777-777777777773',company_id,'Safi','Supplier','+254700000773',true,true,true,true,true
from docs_fixture;
update public.companies set public_whatsapp_number='+254700000774'
where id=(select company_id from docs_fixture);
select set_config('request.jwt.claims',testkit.claims(
  (select company_id from docs_fixture),'77777777-7777-4777-8777-777777777771','Admin'),true);

insert into public.orders(id,company_id,location_id,code,customer_id,status,total,is_credit_sale,
  expires_at,completed_at)
select '77777777-7777-4777-8777-777777777774',f.company_id,l.id,'DOC-RECEIPT',
  '77777777-7777-4777-8777-777777777772','completed',1000,false,now()+interval '30 days',now()
from docs_fixture f join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN';
insert into public.payments(id,company_id,order_id,method_code,amount,status)
select '77777777-7777-4777-8777-777777777775',company_id,
  '77777777-7777-4777-8777-777777777774','cash',1000,'settled' from docs_fixture;

insert into public.orders(id,company_id,location_id,code,customer_id,status,total,is_credit_sale,
  expires_at,completed_at,credit_due_at)
select '77777777-7777-4777-8777-777777777776',f.company_id,l.id,'DOC-INVOICE',
  '77777777-7777-4777-8777-777777777772','completed',2500,true,now()+interval '30 days',now(),current_date+7
from docs_fixture f join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN';

insert into public.orders(id,company_id,location_id,code,customer_id,status,total,is_credit_sale,expires_at)
select '77777777-7777-4777-8777-777777777777',f.company_id,l.id,'DOC-PROFORMA',
  '77777777-7777-4777-8777-777777777772','draft',3000,false,now()+interval '7 days'
from docs_fixture f join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN';

insert into public.purchases(id,company_id,supplier_id,reference,total_cost,is_credit,purchase_date)
select '77777777-7777-4777-8777-777777777778',company_id,
  '77777777-7777-4777-8777-777777777773','PO-TEST-1',4500,true,current_date from docs_fixture;

select is((select external_messaging_enabled from public.platform_communication_settings where singleton),true,
  'platform external messaging is enabled by default');
select is((select automated_customer_notifications_enabled from public.companies
  where id=(select company_id from docs_fixture)),true,'company automation is enabled by default');
select is((select automated_customer_notifications_override is null from public.companies
  where id=(select company_id from docs_fixture)),true,'company automation has no override by default');

select testkit.as_user((select company_id from docs_fixture),
  '77777777-7777-4777-8777-777777777771','Admin');
select is(public.set_automated_customer_notifications(false),0,'tenant can pause its automation');
reset role;
select is(public.external_messaging_allowed((select company_id from docs_fixture),true),false,
  'company preference blocks automated messaging');
select is(public.external_messaging_allowed((select company_id from docs_fixture),false),true,
  'company automation preference does not block reviewed documents');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777779","role":"authenticated","is_platform_admin":true}',true);
select is(public.platform_set_company_automation_override((select company_id from docs_fixture),true),0,
  'superadmin can force company automation on');
reset role;
select is(public.external_messaging_allowed((select company_id from docs_fixture),true),true,
  'force-on overrides the tenant preference');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777779","role":"authenticated","is_platform_admin":true}',true);
select is(public.platform_set_company_automation_override((select company_id from docs_fixture),false),0,
  'superadmin can force company automation off');
reset role;
select is(public.external_messaging_allowed((select company_id from docs_fixture),true),false,
  'force-off blocks automation');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777779","role":"authenticated","is_platform_admin":true}',true);
select is(public.platform_set_company_automation_override((select company_id from docs_fixture),null),0,
  'superadmin can return control to the company');
select is(public.platform_set_external_messaging(false),0,'superadmin can pause platform messaging');
reset role;
select is(public.external_messaging_allowed((select company_id from docs_fixture),false),false,
  'platform master switch also blocks manual documents');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777779","role":"authenticated","is_platform_admin":true}',true);
select is(public.platform_set_external_messaging(true),0,'superadmin can restore platform messaging');
reset role;

select ok(position('p_body' in pg_get_function_arguments(
  'public.send_external_document(text,uuid,text,boolean,boolean)'::regprocedure))=0,
  'document send API accepts no message body');
select ok(position('recipient' in pg_get_function_arguments(
  'public.send_external_document(text,uuid,text,boolean,boolean)'::regprocedure))=0,
  'document send API accepts no recipient');

select vault.create_secret('https://storefront.test','STOREFRONT_PUBLIC_URL');
select testkit.as_user((select company_id from docs_fixture),
  '77777777-7777-4777-8777-777777777771','Admin');
select is(public.set_automated_customer_notifications(true),0,'tenant can restore its preference');
select is(public.preview_external_document('receipt','77777777-7777-4777-8777-777777777774','sms',false)->>'document_number',
  'DOC-RECEIPT','settled completed sale previews as a receipt');
select is(public.preview_external_document('invoice','77777777-7777-4777-8777-777777777776','whatsapp',true)->>'company_copy_recipient',
  '+254700000774','invoice preview resolves the configured company copy recipient');
select is(public.preview_external_document('proforma','77777777-7777-4777-8777-777777777777','sms',false)->>'status',
  'active','active draft previews as a proforma');
select is(public.preview_external_document('purchase_order','77777777-7777-4777-8777-777777777778','whatsapp',true)->>'document_number',
  'PO-TEST-1','confirmed purchase previews as a purchase order');
select ok((public.send_external_document('receipt','77777777-7777-4777-8777-777777777774','sms',false)->>'queued')::boolean,
  'receipt send queues a fixed message');
select is((select count(*)::int from public.outbox where source='manual_document'
  and document_type='receipt' and document_subject_id='77777777-7777-4777-8777-777777777774'),1,
  'primary document is linked in the existing outbox');
select ok((public.send_external_document('invoice','77777777-7777-4777-8777-777777777776','whatsapp',true)
  ->>'company_copy_outbox_id') is not null,'invoice can queue a separate company copy');
select is((select count(*)::int from public.outbox where document_type='invoice'
  and document_subject_id='77777777-7777-4777-8777-777777777776'),2,
  'invoice primary and company copy are separately auditable');
select is(
  (select scheduled_after from public.outbox where document_type='invoice'
    and document_subject_id='77777777-7777-4777-8777-777777777776'
    and document_copy_role='primary'),
  case
    when extract(hour from now() at time zone 'Africa/Nairobi')::int >= 19 then
      (((now() at time zone 'Africa/Nairobi')::date + interval '1 day 8 hours')
        at time zone 'Africa/Nairobi')
    when extract(hour from now() at time zone 'Africa/Nairobi')::int < 8 then
      (((now() at time zone 'Africa/Nairobi')::date + interval '8 hours')
        at time zone 'Africa/Nairobi')
    else now()
  end,
  'manual WhatsApp documents respect quiet hours by default'
);
select throws_ok(
  $$select public.send_external_document('receipt','77777777-7777-4777-8777-777777777774','sms',false)$$,
  'P0001','document_send_cooldown','rapid duplicate sends are blocked');
reset role;

select ok((select not (snapshot ?| array['company_id','party_id','recipient','company_copy_recipient','subject_id'])
  from public.external_document_links where document_type='receipt' order by created_at desc limit 1),
  'public document snapshots omit internal identifiers and recipient phone metadata');

update public.platform_communication_settings set external_messaging_enabled=false where singleton;
select is(public.prepare_controlled_outbox_delivery((select id from public.outbox
  where document_type='receipt' and document_copy_role='primary' limit 1)),false,
  'delivery-time policy fails closed after the master switch changes');
select ok((select status='cancelled' and quota_state='released' from public.outbox
  where document_type='receipt' and document_copy_role='primary' limit 1),
  'delivery-time rejection cancels the row and releases untouched quota');
update public.platform_communication_settings set external_messaging_enabled=true where singleton;

insert into public.external_document_links(company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at)
select company_id,'77777777-7777-4777-8777-777777777772','receipt',
  '77777777-7777-4777-8777-777777777774',encode(extensions.digest('known-token','sha256'),'hex'),
  jsonb_build_object('document_number','PUBLIC-1'),now()+interval '1 day' from docs_fixture;
set local role anon;
select is(public.public_external_document('known-token')->>'document_number','PUBLIC-1',
  'anonymous document route resolves a valid opaque token');
select is(public.public_external_document('wrong-token'),null,'invalid document token reveals nothing');
reset role;

update public.customers set whatsapp_notifications_enabled=false
where id='77777777-7777-4777-8777-777777777773';
select testkit.as_user((select company_id from docs_fixture),
  '77777777-7777-4777-8777-777777777771','Admin');
select throws_ok(
  $$select public.preview_external_document('purchase_order','77777777-7777-4777-8777-777777777778','whatsapp',false)$$,
  'P0001','recipient_opted_out','supplier channel consent is enforced');
reset role;

select * from finish();
rollback;
