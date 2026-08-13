begin;
select plan(18);

select testkit.create_user('92000000-0000-4000-8000-000000000001','statement-admin@test.local');
select testkit.create_user('92000000-0000-4000-8000-000000000002','statement-comms@test.local');
create temp table statement_send_fixture as select testkit.provision(
  '92000000-0000-4000-8000-000000000001','Statement Send Store') company_id;
grant select on pg_temp.statement_send_fixture to authenticated,anon;
select testkit.add_member((select company_id from statement_send_fixture),
  '92000000-0000-4000-8000-000000000002','Communications only',array['ManageCommunications']);
insert into public.customers(id,company_id,first_name,last_name,phone,notifications_enabled,
  sms_notifications_enabled,whatsapp_notifications_enabled)
select '92000000-0000-4000-8000-000000000010',company_id,'Amina','Buyer','+254700000010',true,true,true
from statement_send_fixture;

select ok(position('recipient' in pg_get_function_arguments(
  'public.send_customer_statement(uuid,text,boolean)'::regprocedure))=0,
  'statement send API accepts no caller-supplied recipient');

select testkit.as_user((select company_id from statement_send_fixture),
  '92000000-0000-4000-8000-000000000001','Admin');
select public.post_balance_adjustment('92000000-0000-4000-8000-000000000010',100,'Opening balance');
do $$ begin
  for i in 1..26 loop
    perform public.post_balance_adjustment('92000000-0000-4000-8000-000000000010',1,'Activity '||i);
  end loop;
end $$;

select is(public.preview_customer_statement('92000000-0000-4000-8000-000000000010','sms')->>'recipient',
  '+254700000010','preview resolves the customer record');
select matches(public.preview_customer_statement('92000000-0000-4000-8000-000000000010','sms')->>'body',
  'expires in 7 days','preview discloses the fixed link lifetime');
select is((public.preview_customer_statement('92000000-0000-4000-8000-000000000010','sms')
  ->>'account_balance')::bigint,126::bigint,'preview uses the whole customer account balance');
reset role;

select testkit.as_user((select company_id from statement_send_fixture),
  '92000000-0000-4000-8000-000000000002','Communications only');
select throws_ok(
  $$select public.preview_customer_statement('92000000-0000-4000-8000-000000000010','sms')$$,
  'P0001','permission_denied: ViewFinancials and ManageCommunications required',
  'manual statements require finance and communications permissions');
reset role;

create temp table previous_statement as select public.issue_customer_statement_link(
  (select company_id from statement_send_fixture),'92000000-0000-4000-8000-000000000010') token;
select ok((select expires_at between now()+interval '6 days 23 hours' and now()+interval '7 days 1 hour'
  from public.customer_statement_links where token_hash=encode(extensions.digest(
    (select token from previous_statement),'sha256'),'hex')),'new statement links expire after seven days');

select vault.create_secret('https://storefront-statements.test','STOREFRONT_PUBLIC_URL');
select testkit.as_user((select company_id from statement_send_fixture),
  '92000000-0000-4000-8000-000000000001','Admin');
select ok((public.send_customer_statement('92000000-0000-4000-8000-000000000010','sms')->>'queued')::boolean,
  'manual customer statement queues successfully');
select is((select count(*)::integer from public.outbox where source='manual_statement'
  and customer_id='92000000-0000-4000-8000-000000000010'),1,
  'manual statement is linked in the controlled outbox');
select ok((select customer_statement_link_id is not null from public.outbox
  where source='manual_statement' and customer_id='92000000-0000-4000-8000-000000000010'),
  'delivery references its statement link directly');
select ok((select created_by='92000000-0000-4000-8000-000000000001' and link_source='manual'
  from public.customer_statement_links where id=(select customer_statement_link_id from public.outbox
    where source='manual_statement' limit 1)),'manual link records its actor and source');
select throws_ok(
  $$select public.send_customer_statement('92000000-0000-4000-8000-000000000010','sms')$$,
  'P0001','statement_send_cooldown','rapid duplicate statement sends are blocked');
select throws_ok(
  $$select public.send_customer_statement('92000000-0000-4000-8000-000000000010','whatsapp')$$,
  'P0001','statement_send_cooldown','rapid cross-channel sends cannot revoke the queued link');
reset role;
select ok((select revoked_at is not null from public.customer_statement_links
  where token_hash=encode(extensions.digest((select token from previous_statement),'sha256'),'hex')),
  'a new statement replaces the previous customer link');

create temp table paged_statement as select public.issue_customer_statement_link(
  (select company_id from statement_send_fixture),'92000000-0000-4000-8000-000000000010') token;
grant select on pg_temp.paged_statement to anon;
set local role anon;
create temp table first_statement_page as select public.public_customer_statement(
  (select token from paged_statement),null,null,10) body;
select is(jsonb_array_length((select body->'activities' from first_statement_page)),10,
  'public statement returns a bounded activity page');
select ok(((select body->>'activity_has_more' from first_statement_page))::boolean,
  'first public page reports older activity');
create temp table second_statement_page as
select public.public_customer_statement((select token from paged_statement),
  ((select body->'activities'->9->>'date' from first_statement_page))::timestamptz,
  ((select body->'activities'->9->>'id' from first_statement_page))::uuid,10) body;
select is(jsonb_array_length((select body->'activities' from second_statement_page)),10,
  'cursor loads the next statement activity page');
reset role;
select is((select open_count from public.customer_statement_links where token_hash=encode(
  extensions.digest((select token from paged_statement),'sha256'),'hex')),1,
  'pagination does not inflate initial-open metrics');

update public.customers set sms_notifications_enabled=false
where id='92000000-0000-4000-8000-000000000010';
select testkit.as_user((select company_id from statement_send_fixture),
  '92000000-0000-4000-8000-000000000001','Admin');
select throws_ok(
  $$select public.preview_customer_statement('92000000-0000-4000-8000-000000000010','sms')$$,
  'P0001','recipient_opted_out','manual send enforces customer channel consent');
reset role;

select * from finish();
rollback;
