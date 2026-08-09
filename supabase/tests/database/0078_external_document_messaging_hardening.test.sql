begin;
select plan(10);

select is(
  (select count(*)::int from public.message_templates
   where company_id is null
     and template_key in ('manual-receipt','manual-invoice','manual-proforma',
       'manual-purchase-order','manual-document-company-copy')
     and position(E'\\n' in whatsapp_body) > 0),
  0,
  'controlled WhatsApp templates contain no literal backslash-n sequences'
);
select is(
  (select count(*)::int from public.message_templates
   where company_id is null
     and template_key in ('manual-receipt','manual-invoice','manual-proforma',
       'manual-purchase-order','manual-document-company-copy')
     and position(E'\n' in whatsapp_body) > 0),
  5,
  'controlled WhatsApp templates contain real line feeds'
);

select testkit.create_user(
  '78888888-8888-4888-8888-888888888881',
  'docs-hardening@test.local',
  '+254700000881'
);
create temp table docs_hardening_fixture as
select testkit.provision(
  '78888888-8888-4888-8888-888888888881',
  'Document Hardening Store'
) company_id;
grant select on pg_temp.docs_hardening_fixture to authenticated;
select set_config(
  'request.jwt.claims',
  testkit.claims(
    (select company_id from docs_hardening_fixture),
    '78888888-8888-4888-8888-888888888881',
    'Admin'
  ),
  true
);

insert into public.customers(
  id,company_id,first_name,last_name,phone,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled
)
select '78888888-8888-4888-8888-888888888882',company_id,
  'Wanjiku','Buyer','+254700000882',true,true,true
from docs_hardening_fixture;

insert into public.orders(
  id,company_id,location_id,code,customer_id,status,total,is_credit_sale,
  expires_at,completed_at
)
select '78888888-8888-4888-8888-888888888883',f.company_id,l.id,
  'DOC-HARDENED','78888888-8888-4888-8888-888888888882',
  'completed',1500,false,now()+interval '30 days',now()
from docs_hardening_fixture f
join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN';

insert into public.payments(
  id,company_id,order_id,method_code,amount,status,reference
)
select '78888888-8888-4888-8888-888888888884',company_id,
  '78888888-8888-4888-8888-888888888883','mpesa',1500,'settled','PRIVATE-MPESA-REF'
from docs_hardening_fixture;

select vault.create_secret('https://storefront-hardening.test','STOREFRONT_PUBLIC_URL');
select testkit.as_user(
  (select company_id from docs_hardening_fixture),
  '78888888-8888-4888-8888-888888888881',
  'Admin'
);

create temp table docs_hardening_send as
select public.send_external_document(
  'receipt','78888888-8888-4888-8888-888888888883','whatsapp',false
) result;
grant select on pg_temp.docs_hardening_send to authenticated;

select ok(
  ((select result from docs_hardening_send)->>'queued')::boolean,
  'hardened document send queues successfully'
);
select ok(
  position(E'\n' in ((select result from docs_hardening_send)->>'body')) > 0,
  'rendered WhatsApp document contains real line feeds'
);
reset role;

select ok(
  (select not (snapshot ? 'payments')
   from public.external_document_links
   where document_type='receipt'
     and subject_id='78888888-8888-4888-8888-888888888883'),
  'new public document snapshots omit payment metadata'
);
select ok(
  (select position('PRIVATE-MPESA-REF' in snapshot::text)=0
   from public.external_document_links
   where document_type='receipt'
     and subject_id='78888888-8888-4888-8888-888888888883'),
  'public snapshots do not expose payment references'
);
select ok(
  position(
    'pg_advisory_xact_lock' in
    pg_catalog.pg_get_functiondef(
      'public.send_external_document(text,uuid,text,boolean)'::regprocedure
    )
  ) > 0,
  'document send serializes the cooldown check'
);

update public.outbox
set attempts=1
where id=((select result from docs_hardening_send)->>'outbox_id')::uuid;
update public.platform_communication_settings
set external_messaging_enabled=false
where singleton;

select is(
  public.prepare_controlled_outbox_delivery(
    ((select result from docs_hardening_send)->>'outbox_id')::uuid
  ),
  false,
  'delivery policy rejects a claimed row after the master switch changes'
);
select ok(
  (select status='cancelled' and quota_state='released'
   from public.outbox
   where id=((select result from docs_hardening_send)->>'outbox_id')::uuid),
  'policy cancellation releases a claimed but unsent reservation'
);
select ok(
  (select whatsapp_used_this_period=0 and whatsapp_reserved_this_period=0
   from public.companies
   where id=(select company_id from docs_hardening_fixture)),
  'policy cancellation does not consume tenant quota'
);

select * from finish();
rollback;
