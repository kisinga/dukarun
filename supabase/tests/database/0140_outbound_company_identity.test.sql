begin;
select no_plan();
select testkit.create_user('94000000-0000-4000-8000-000000000001','identity-a@test.local','+254714000001');
select testkit.create_user('94000000-0000-4000-8000-000000000002','identity-b@test.local','+254714000002');
create temp table identity_companies as
select testkit.provision('94000000-0000-4000-8000-000000000001','Amina Store') id,'Amina Store' name
union all select testkit.provision('94000000-0000-4000-8000-000000000002','Safi Market'),'Safi Market';
update public.subscription_tiers set sms_per_period=10000,whatsapp_per_period=10000;
select vault.create_secret('https://store.test','STOREFRONT_PUBLIC_URL');
create temp table identity_messages as
select public.queue_message(c.id,ch,'+254714000009','Your account has changed.') id,c.name,ch channel
from identity_companies c cross join unnest(array['sms','whatsapp']) ch;
select is(o.body,case when o.channel='sms' then m.name||': Your account has changed.'
  else m.name||E'\n\nYour account has changed.' end,'same recipient can distinguish '||m.name||' via '||o.channel)
from identity_messages m join public.outbox o using(id);
select is(o.company_name_snapshot,m.name,'queue captures authoritative identity')
from identity_messages m join public.outbox o using(id);
select is(public.format_outbound_message(o.channel,o.company_name_snapshot,o.body),o.body,'canonical header appears once')
from identity_messages m join public.outbox o using(id);
select is(public.format_outbound_message('sms','Amina Store','Update from Amina Store.'),
  'Amina Store: Update from Amina Store.','mentioning the company in prose does not replace the opening');
select is(public.format_outbound_message('sms','Amina Store','Account update.','platform_account'),
  'Dukarun - Amina Store: Account update.','platform account SMS identifies both parties');
select is(public.format_outbound_message('whatsapp','Amina Store','Account update.','platform_account'),
  E'Dukarun\nAccount: Amina Store\n\nAccount update.','platform account WhatsApp identifies both parties');

select throws_ok(format($q$insert into public.outbox(company_id,channel,recipient,body,company_name_snapshot)
 values(%L,'sms','+254714000009',%L,%L)$q$,c.id,b.body,b.name),'23514',null,
 'pending constraint rejects '||b.label)
from identity_companies c cross join (values
 (null::text,'Amina Store: Update.','missing snapshot'),
 (' ',' : Update.','blank snapshot'),('Amina Store','Safi Market: Update.','wrong opening'),
 ('Amina Store','Update for Amina Store.','loose company mention'),
 ('Amina Store','Amina Store: {{missing}}','unresolved placeholder')) b(name,body,label)
where c.name='Amina Store';
select throws_ok(format($q$update public.outbox set fallback_body='Amina Store: Fallback.',fallback_channel=null where id=%L$q$,id),
 '23514',null,'fallback must explicitly be SMS') from identity_messages where name='Amina Store' and channel='whatsapp';
select throws_ok(format($q$update public.outbox set fallback_body='Safi Market: Fallback.',fallback_channel='sms' where id=%L$q$,id),
 '23514',null,'fallback must match original identity') from identity_messages where name='Amina Store' and channel='whatsapp';
select lives_ok(format($q$insert into public.outbox(company_id,channel,recipient,body,status)
 values(%L,'sms','+254714000009','Historical body','sent')$q$,id),'historical messages remain valid')
from identity_companies where name='Amina Store';
select throws_ok($$select public.format_outbound_message('sms',null,'Body')$$,'P0001',
 'message_contract: invalid_company_name','formatter fails closed without a company');

-- Inherit frozen identity on retries and fallback, never the renamed company.
update public.outbox set fallback_channel='sms',fallback_body='Amina Store: SMS fallback.'
where id=(select id from identity_messages where name='Amina Store' and channel='whatsapp');
update public.companies set name='Renamed Store' where id=(select id from identity_companies where name='Amina Store');
update public.outbox set attempts=attempts+1,scheduled_after=now()+interval '1 minute'
where id in (select id from identity_messages);
select is(o.company_name_snapshot,m.name,'retry retains captured company')
from identity_messages m join public.outbox o using(id);
create temp table inherited_fallback as select public.queue_sms_fallback(id) id
from identity_messages where name='Amina Store' and channel='whatsapp';
select is((select body from public.outbox where id=(select id from inherited_fallback)),
 'Amina Store: SMS fallback.','fallback keeps the pre-rename opening exactly once');
select is((select company_name_snapshot from public.outbox where id=(select id from inherited_fallback)),
 'Amina Store','fallback inherits snapshot');
select is(public.queue_sms_fallback((select id from identity_messages where name='Amina Store' and channel='whatsapp')),
 (select id from inherited_fallback),'fallback remains deduplicated');
update public.outbox set fallback_channel='sms',fallback_body='Safi Market: SMS fallback.',error='message_contract: invalid_body',status='failed'
where id=(select id from identity_messages where name='Safi Market' and channel='whatsapp');
select is(public.queue_sms_fallback((select id from identity_messages where name='Safi Market' and channel='whatsapp')),
 null::uuid,'contract failures cannot create automatic fallback');
update public.companies set name='Amina Store' where id=(select id from identity_companies where name='Amina Store');

create temp table quota_message as select public.queue_message(id,'sms','+254714000009',repeat('A',150)) id
from identity_companies where name='Amina Store';
select is((select quota_units from public.outbox where id=(select id from quota_message)),2,
 'company opening participates in initial SMS quota reservation');

-- Actual credit-band producer: every reason is a sentence in both supported channels.
insert into public.customers(id,company_id,first_name,phone,is_credit_approved,credit_limit,
 notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled,credit_score_notifications_enabled)
select '94000000-0000-4000-8000-000000000010',id,'Amina','+254714000010',true,100000,true,true,true,true
from identity_companies where name='Amina Store';
update public.companies set credit_score_notifications_enabled=true where id in(select id from identity_companies);
create temp table credit_outputs(channel text,reason text,id uuid);
do $$ declare ch text;r text;v_company uuid;begin
 select id into v_company from identity_companies where name='Amina Store';
 foreach ch in array array['sms','whatsapp'] loop
  update public.companies set payment_reminder_channel=ch where id=v_company;
  foreach r in array array['over_limit','overdue_60_plus','overdue_31_60','overdue_8_30','overdue_1_7','frequently_late','no_current_risk'] loop
   insert into public.credit_band_notification_queue(company_id,customer_id,from_band,to_band,score,reason_code)
   values(v_company,'94000000-0000-4000-8000-000000000010','good','high_risk',3.0,r)
   on conflict(company_id,customer_id) do update set reason_code=r,sent_at=null,send_after=now();
   perform public.dispatch_credit_band_notifications();
   insert into credit_outputs select ch,r,id from public.outbox
    where company_id=v_company and template_key='credit-score-band-change'
    and id not in(select id from credit_outputs) order by created_at desc limit 1;
  end loop;
 end loop;
end $$;
select is((select count(*)::integer from credit_outputs),14,'credit producer renders seven reasons over two channels');
select ok(public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body)
 and o.body like '%High risk%' and o.body not like '%'||c.reason||'%'
 and o.body like '%Please contact the company to discuss your balance before requesting more credit.%',
 'credit '||c.reason||' via '||c.channel||' has readable reason and advisory next step')
from credit_outputs c join public.outbox o using(id);
select ok((select body from public.outbox where id=(select id from credit_outputs where reason='over_limit' and channel='sms')) like
 'Amina Store: Your credit score with Amina Store is now 3.0/10 (High risk). Your outstanding balance exceeds your credit limit. Please contact the company to discuss your balance before requesting more credit. View your account statement: https://store.test/statement/%',
 'complete credit message reads naturally and includes the correct company');

-- Direct campaign insert and review share the exact server envelope and SMS count.
select testkit.create_user('94000000-0000-4000-8000-000000000003','identity-platform@test.local');
insert into public.platform_admins(user_id) values('94000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated","is_platform_admin":true}',true);
create temp table campaign_outputs(channel text,id uuid,preview jsonb);
do $$ declare ch text;v_id uuid;v_company uuid;begin
 select id into v_company from identity_companies where name='Amina Store';
 foreach ch in array array['sms','whatsapp'] loop
  v_id:=public.platform_save_campaign_draft('Identity campaign',ch,'Account update','Please review your {{tier}} account.','selected',null,null,array[v_company],null,null,null);
  insert into campaign_outputs values(ch,v_id,public.platform_review_campaign(v_id));
  perform public.platform_launch_campaign(v_id,null);
 end loop;
end $$;
select is(o.body,c.preview->>'rendered_body','review matches direct campaign queue for '||c.channel)
from campaign_outputs c join public.outbox o on o.campaign_id=c.id;
select is(o.company_name_snapshot,'Amina Store','campaign captures business account name')
from campaign_outputs c join public.outbox o on o.campaign_id=c.id;
select is((c.preview->>'sms_segments')::int,public.sms_segment_count(o.body),'review counts complete SMS')
from campaign_outputs c join public.outbox o on o.campaign_id=c.id where c.channel='sms';
create temp table quota_before as select sms_reserved_this_period reserved from public.companies
where id=(select id from identity_companies where name='Amina Store');
select public.reconcile_runtime_sms_quota(o.id,o.body||repeat('A',350)) from campaign_outputs c join public.outbox o on o.campaign_id=c.id where c.channel='sms';
select is((select sms_reserved_this_period from public.companies where id=(select id from identity_companies where name='Amina Store')),
 (select reserved from quota_before),'platform campaign runtime reconciliation does not consume company quota');

-- Documents and statements: actual preview/send producers, both channels and company copies.
select set_config('request.jwt.claims',testkit.claims(id,'94000000-0000-4000-8000-000000000001','Admin'),true)
from identity_companies where name='Amina Store';
update public.companies set public_whatsapp_number='+254714000019' where id=(select id from identity_companies where name='Amina Store');
insert into public.customers(id,company_id,first_name,phone,is_supplier,supplier_active,notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled)
select '94000000-0000-4000-8000-000000000011',id,'Supplier','+254714000011',true,true,true,true,true
from identity_companies where name='Amina Store';
create temp table doc_subjects(kind text,id uuid);
insert into doc_subjects values('receipt',gen_random_uuid()),('invoice',gen_random_uuid()),('proforma',gen_random_uuid()),('purchase_order',gen_random_uuid());
insert into public.orders(id,company_id,location_id,customer_id,code,status,total,is_credit_sale,completed_at,expires_at)
select d.id,c.id,l.id,'94000000-0000-4000-8000-000000000010','REF-'||d.kind,
 case when d.kind='proforma' then 'draft' else 'completed' end,2500,d.kind='invoice',
 case when d.kind<>'proforma' then now() end,now()+interval '7 days'
from doc_subjects d cross join identity_companies c join public.stock_locations l on l.company_id=c.id and l.code='MAIN'
where c.name='Amina Store' and d.kind<>'purchase_order';
insert into public.payments(company_id,order_id,method_code,amount,status)
select c.id,d.id,'cash',2500,'settled' from doc_subjects d cross join identity_companies c where d.kind='receipt' and c.name='Amina Store';
insert into public.purchases(id,company_id,supplier_id,reference,total_cost,is_credit,purchase_date)
select d.id,c.id,'94000000-0000-4000-8000-000000000011','PO-1',2500,true,current_date
from doc_subjects d cross join identity_companies c where d.kind='purchase_order' and c.name='Amina Store';
create temp table doc_outputs(kind text,channel text,preview jsonb,result jsonb);
do $$ declare d record;ch text;v_preview jsonb;begin
 for d in select * from doc_subjects loop
  foreach ch in array array['sms','whatsapp'] loop
   v_preview:=public.preview_external_document(d.kind,d.id,ch,d.kind in ('invoice','purchase_order'));
   insert into doc_outputs values(d.kind,ch,v_preview,public.send_external_document(d.kind,d.id,ch,d.kind in ('invoice','purchase_order')));
  end loop;
 end loop;
end $$;
select is((select count(*)::integer from doc_outputs),8,'every document kind renders through send RPC on both channels');
select is(regexp_replace(o.body,'https://store.test/document/[a-f0-9]+','[secure document link]','g'),
 d.preview->>'body',d.kind||' '||d.channel||' preview matches queue')
from doc_outputs d join public.outbox o on o.id=(d.result->>'outbox_id')::uuid;
select ok(o.company_name_snapshot=l.snapshot->>'company_name'
 and public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body),
 d.kind||' '||d.channel||' captures document company identity')
from doc_outputs d join public.outbox o on o.id=(d.result->>'outbox_id')::uuid
join public.external_document_links l on l.id=o.external_document_link_id;
select ok(o.body like E'Amina Store\n\n%Company copy of % for %'
 and o.body not like '%sent to%',d.kind||' company copy makes no delivery claim')
from doc_outputs d join public.outbox o on o.id=(d.result->>'company_copy_outbox_id')::uuid;
select is(public.render_external_document_message(jsonb_build_object('channel','sms','company_name','Amina Store',
 'document_type','proforma','document_number','PF-1','total',2500,'balance',2500), 'https://store.test/document/1',false)->>'body',
 'Amina Store: Pro forma invoice PF-1. Total: KES 2,500. View your pro forma invoice: https://store.test/document/1',
 'absent pro forma validity disappears without broken punctuation or extra whitespace');
select is(public.render_external_document_message(jsonb_build_object('channel','whatsapp','company_name','Amina Store',
 'document_type','proforma','document_number','PF-1','total',2500,'balance',2500), 'https://store.test/document/1',false)->>'body',
 E'Amina Store\n\n*Pro forma invoice PF-1*\n\nTotal: *KES 2,500*.\n\nView or print your pro forma invoice:\nhttps://store.test/document/1',
 'optional WhatsApp details leave clean paragraphs');
-- Real ledger postings supply statement activity and the reminder's combined due amount.
select testkit.ensure_open_session();
insert into public.products(id,company_id,name)
select '94000000-0000-4000-8000-000000000020',id,'Message fixture service'
from identity_companies where name='Amina Store';
insert into public.product_variants(id,company_id,product_id,name,sku,kind,price,wholesale_price,track_inventory)
select '94000000-0000-4000-8000-000000000021',id,'94000000-0000-4000-8000-000000000020','Default','IDENTITY-SERVICE','service',1000,1000,false
from identity_companies where name='Amina Store';
create temp table reminder_sales as select public.post_sale('94000000-0000-4000-8000-000000000010',
 '[{"variant_id":"94000000-0000-4000-8000-000000000021","quantity":1,"unit_price":1000}]','[]') id
from generate_series(1,2);
create temp table reminder_outputs(channel text,stage integer,id uuid);
do $$ declare ch text;d integer;v_company uuid;begin
 select id into v_company from identity_companies where name='Amina Store';
 foreach ch in array array['sms','whatsapp'] loop
  update public.companies set payment_reminders_enabled=true,payment_reminder_channel=ch,payment_reminder_sms_fallback=true where id=v_company;
  foreach d in array array[0,3,7,14] loop
   update public.orders set credit_due_at=(now() at time zone 'Africa/Nairobi')::date-d where id in(select id from reminder_sales);
   delete from public.credit_notification_checkpoints where company_id=v_company;
   perform public.credit_reminder_scan();
   insert into reminder_outputs select ch,d,id from public.outbox
    where company_id=v_company and template_key like 'payment-%' and id not in(select id from reminder_outputs);
  end loop;
 end loop;
end $$;
select is((select count(*)::integer from reminder_outputs),8,'all payment reminder stages render through scanner on both channels');
select ok(public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body)
 and o.body like '%Amount currently due: %KES 2,000%'
 and o.body like '%Oldest unpaid due date: '||to_char((now() at time zone 'Africa/Nairobi')::date-r.stage,'DD Mon YYYY')||'.%'
 and o.body not like '%today%' and o.body not like '%days overdue%',
 'payment stage '||r.stage||' '||r.channel||' uses aggregate amount and absolute oldest due date')
from reminder_outputs r join public.outbox o using(id);
create temp table reminder_fallbacks as select r.stage,o.fallback_body,public.queue_sms_fallback(o.id) id
from reminder_outputs r join public.outbox o using(id) where r.channel='whatsapp';
select is(o.body,r.fallback_body,'payment stage '||r.stage||' fallback preserves formatted SMS')
from reminder_fallbacks r left join public.outbox o using(id);

create temp table statement_outputs(channel text,preview jsonb,result jsonb);
do $$ declare ch text;p jsonb;begin
 foreach ch in array array['sms','whatsapp'] loop
  update public.outbox set created_at=now()-interval '2 minutes' where source='manual_statement'
   and company_id=(select id from identity_companies where name='Amina Store');
  p:=public.preview_customer_statement('94000000-0000-4000-8000-000000000010',ch);
  insert into statement_outputs values(ch,p,public.send_customer_statement('94000000-0000-4000-8000-000000000010',ch));
 end loop;
end $$;
select is(regexp_replace(o.body,'https://store.test/statement/[a-f0-9]+','[secure statement link]','g'),
 s.preview->>'body','statement preview matches complete queued '||s.channel)
from statement_outputs s join public.outbox o on o.id=(s.result->>'outbox_id')::uuid;
select ok(o.body like '%expires on '||to_char(l.expires_at at time zone 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' EAT.%',
 'statement '||s.channel||' shows the actual link expiry')
from statement_outputs s join public.outbox o on o.id=(s.result->>'outbox_id')::uuid
join public.customer_statement_links l on l.id=o.customer_statement_link_id;

-- Exercise every fulfillment milestone, collection/delivery language and SMS fallback.
create temp table fulfillment_subjects as select gen_random_uuid() id,gen_random_uuid() order_id,kind
from unnest(array['pickup','delivery']) kind;
insert into public.orders(id,company_id,location_id,customer_id,code,status,total)
select f.order_id,c.id,l.id,'94000000-0000-4000-8000-000000000010','FUL-'||f.kind,'draft',100
from fulfillment_subjects f cross join identity_companies c join public.stock_locations l on l.company_id=c.id and l.code='MAIN'
where c.name='Amina Store';
insert into public.order_fulfillments(id,company_id,location_id,order_id,fulfillment_type,recipient_name,phone_normalized,
 address_line,transactional_message_consent,tracking_token_hash,tracking_expires_at,pin_hash)
select f.id,o.company_id,o.location_id,o.id,f.kind,'Amina','+254714000010','Main Road',true,
 encode(extensions.digest(f.id::text,'sha256'),'hex'),now()+interval '7 days','fixture-pin'
from fulfillment_subjects f join public.orders o on o.id=f.order_id;
insert into public.fulfillment_settings(company_id,location_id)
select c.id,l.id from identity_companies c join public.stock_locations l on l.company_id=c.id
where c.name='Amina Store' on conflict(company_id,location_id) do nothing;
create temp table fulfillment_outputs(kind text,channel text,milestone text,id uuid);
do $$ declare f record;ch text;m text;e uuid;begin
 foreach ch in array array['sms','whatsapp'] loop
  update public.fulfillment_settings set notification_channel=ch,sms_fallback=true,
   notify_ready=true,notify_in_transit=true,notify_failed=true,notify_fulfilled=true
   where company_id=(select id from identity_companies where name='Amina Store');
  for f in select * from fulfillment_subjects loop
   foreach m in array array['initial','ready','in_transit','failed','fulfilled'] loop
    insert into public.fulfillment_events(company_id,fulfillment_id,event_kind)
    select company_id,f.id,m from public.order_fulfillments where id=f.id returning id into e;
    insert into fulfillment_outputs values(f.kind,ch,m,public.queue_fulfillment_message_core(f.id,e,m,'tracking-token','1234'));
   end loop;
  end loop;
 end loop;
end $$;
select is((select count(*)::int from fulfillment_outputs where id is not null),20,'all fulfillment milestone/channel/type combinations queue');
select ok(public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body),
 f.kind||' '||f.milestone||' '||f.channel||' includes company identity')
from fulfillment_outputs f join public.outbox o using(id);
select ok(o.body like '%'||case when f.kind='pickup' then 'Collection PIN' else 'Delivery PIN' end||'%'
 and o.body not like '%will contact%',f.kind||' PIN label describes the actual handoff')
from fulfillment_outputs f join public.outbox o using(id) where f.milestone='initial';
select ok(o.body like '%ready for '||case when f.kind='pickup' then 'collection' else 'dispatch' end||'.%',
 f.kind||' readiness is precise') from fulfillment_outputs f join public.outbox o using(id) where f.milestone='ready';
create temp table fulfillment_fallbacks as select f.kind,f.milestone,o.fallback_body,public.queue_sms_fallback(o.id) id
from fulfillment_outputs f join public.outbox o using(id) where f.channel='whatsapp';
select is(o.body,f.fallback_body,f.kind||' '||f.milestone||' fallback preserves fully rendered SMS')
from fulfillment_fallbacks f left join public.outbox o using(id);

-- Opening/closing summaries are generated independently for SMS and WhatsApp.
create temp table cashier_outputs(channel text,session_id uuid);
do $$ declare ch text;s uuid;begin
 foreach ch in array array['sms','whatsapp_sms_fallback'] loop
  perform public.set_primary_contact_notification_preferences(ch,true,true);
  s:=testkit.ensure_open_session();
  perform public.queue_cashier_session_notification(s,'opened');
  perform testkit.close_open_session();
  perform public.queue_cashier_session_notification(s,'closed');
  insert into cashier_outputs values(ch,s);
 end loop;
end $$;
select is((select count(*)::int from public.outbox o join cashier_outputs c on c.session_id=o.cashier_session_id),4,
 'cashier opened and closed producers cover both channels');
select ok(public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body)
 and o.body like '%Cashier session '||o.cashier_session_event||'%' and o.body like '%Main%',
 'cashier '||o.channel||' '||o.cashier_session_event||' identifies company and branch')
from public.outbox o join cashier_outputs c on c.session_id=o.cashier_session_id;
select ok(o.body not like '%*%' and position(E'\n' in o.body)=0,'cashier SMS is a concise plain-text summary')
from public.outbox o join cashier_outputs c on c.session_id=o.cashier_session_id where o.channel='sms';
create temp table cashier_fallbacks as select o.cashier_session_event,o.fallback_body,public.queue_sms_fallback(o.id) id
from public.outbox o join cashier_outputs c on c.session_id=o.cashier_session_id where o.channel='whatsapp';
select is(o.body,c.fallback_body,'cashier '||c.cashier_session_event||' fallback uses its prepared SMS summary')
from cashier_fallbacks c left join public.outbox o using(id);

-- Real invitation and acceptance producers, including both primary-contact channels.
select testkit.create_user('94000000-0000-4000-8000-000000000004','identity-staff-one@test.local','254714000004');
select testkit.create_user('94000000-0000-4000-8000-000000000005','identity-staff-two@test.local','254714000005');
update public.subscription_tiers set max_team_members=100;
create temp table team_role as select testkit.add_member(id,'94000000-0000-4000-8000-000000000002',
 'Operations and accounts',array['ManageTeam']) id from identity_companies where name='Amina Store';
update public.company_staff_profiles set display_name='Lina' where company_id=(select id from identity_companies where name='Amina Store')
 and user_id='94000000-0000-4000-8000-000000000002';
create temp table team_outputs(channel text,invitation_id uuid);
do $$ declare ch text;i integer:=3;v_user uuid;v_company uuid;begin
 select id into v_company from identity_companies where name='Amina Store';
 foreach ch in array array['sms','whatsapp_sms_fallback'] loop
  i:=i+1;v_user:=('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  perform set_config('request.jwt.claims',testkit.claims(v_company,'94000000-0000-4000-8000-000000000002','Operations and accounts'),true);
  perform public.set_primary_contact_notification_preferences(ch,true,true);
  perform public.invite_team_member('25471400000'||i::text,(select id from team_role),'Team member '||i::text);
  insert into team_outputs select ch,id from public.team_invitations where company_id=v_company and phone='25471400000'||i::text;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  perform public.claim_team_invitations();
 end loop;
end $$;
select is((select count(*)::int from public.outbox o join team_outputs t on t.invitation_id=o.team_invitation_id),6,
 'invitation, primary invitation and acceptance each generate two real deliveries');
select ok(public.outbound_message_valid(o.channel,o.company_name_snapshot,o.body)
 and o.body like '%Operations and accounts%',o.template_key||' '||o.channel||' identifies the company and arbitrary role')
from public.outbox o join team_outputs t on t.invitation_id=o.team_invitation_id;
select ok(o.body like '%Lina has invited%' and o.body like '%Sign in using this phone number%' and o.body like '%{{app_url}}/login%',
 'invitee keeps inviter and sign-in instructions') from public.outbox o join team_outputs t on t.invitation_id=o.team_invitation_id
where template_key='team-invitation';
create temp table team_fallbacks as select o.template_key,o.fallback_body,public.queue_sms_fallback(o.id) id
from public.outbox o join team_outputs t on t.invitation_id=o.team_invitation_id where o.fallback_body is not null;
select is(o.body,t.fallback_body,t.template_key||' fallback keeps company identity and role copy')
from team_fallbacks t left join public.outbox o using(id);

-- A PDF claim and retry keep the same document identity after a company rename.
select set_config('request.jwt.claims',testkit.claims(id,'94000000-0000-4000-8000-000000000001','Admin'),true)
from identity_companies where name='Amina Store';
create temp table pdf_output as select public.request_sale_document((select id from doc_subjects where kind='receipt'),
 '94000000-0000-4000-8000-000000000090') result;
update public.companies set name='Renamed Store' where id=(select id from identity_companies where name='Amina Store');
create temp table pdf_claim as select public.claim_sale_document_delivery((select (result->>'outbox_id')::uuid from pdf_output)) result;
select is((select result->>'company_name_snapshot' from pdf_claim),'Amina Store','PDF worker receives frozen identity after rename');
select is((select result#>>'{snapshot,company_name}' from pdf_claim),'Amina Store','PDF document and caption use the same original company');
select ok((select result->>'caption' like E'Amina Store\n\nHi Amina,\n\nYour receipt REF-receipt is attached.%' from pdf_claim),
 'PDF caption has a clean greeting, company and document reference');
select public.finish_sale_document_delivery((result->>'id')::uuid,(result->>'claim_token')::uuid,'retry',null,'temporary') from pdf_claim;
update public.outbox set scheduled_after=now() where id=(select (result->>'id')::uuid from pdf_claim);
select is(public.claim_sale_document_delivery((select (result->>'id')::uuid from pdf_claim))->>'caption',
 (select result->>'caption' from pdf_claim),'PDF retry retains exact caption after rename');

-- Execute the direct SQL authentication hook; pg_net is transactional, so rollback sends nothing.
select vault.create_secret('fixture-key','TEXTSMS_API_KEY');
select vault.create_secret('fixture-partner','TEXTSMS_PARTNER_ID');
select vault.create_secret('fixture-shortcode','TEXTSMS_SHORTCODE');
select vault.create_secret('https://provider.test','OPENWA_BASE_URL');
select vault.create_secret('fixture-key','OPENWA_API_KEY');
select public.send_sms_hook('{"user":{"phone":"+254714000099"},"sms":{"otp":"123456"}}');
select is((select convert_from(body,'UTF8')::jsonb->>'message' from net.http_request_queue
 where url like '%/sendotp/' and convert_from(body,'UTF8')::jsonb->>'mobile'='254714000099'),
 'Dukarun: Your verification code is 123456. Do not share this code.','real OTP SMS uses the platform envelope');
select is((select convert_from(body,'UTF8')::jsonb->>'text' from net.http_request_queue
 where url like '%/send-text' and convert_from(body,'UTF8')::jsonb->>'chatId'='254714000099@c.us'),
 E'Dukarun\n\nYour verification code is 123456. Do not share this code.','real OTP WhatsApp uses matching platform copy');
select * from finish();
rollback;
