// TEST_DB_CONTAINER=<local disposable postgres container> node supabase/tests/migrations/outbound-identity-cutover.spec.mjs
// All fixtures, DDL and the real migration cancellation block roll back together.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error('Set TEST_DB_CONTAINER to an isolated local test database.');
const migration = readFileSync(
  new URL('../../migrations/20261001000002_0207_outbound_company_identity.sql', import.meta.url),
  'utf8'
);
const cutover = migration.match(/do \$\$[\s\S]*?end \$\$;/i)?.[0];
assert.ok(cutover, 'migration contains its legacy cancellation block');
const sql = `begin;
select no_plan();
select testkit.create_user('94100000-0000-4000-8000-000000000001','cutover@test.local');
create temp table cutover_company as select testkit.provision('94100000-0000-4000-8000-000000000001','Cutover Store') id;
update public.subscription_tiers set sms_per_period=1000,whatsapp_per_period=1000;
create temp table cutover_messages as select label,public.queue_message((select id from cutover_company),channel,'+254714100001','Original body: '||label) id
from (values('unattempted','sms'),('uncertain','sms'),('document-queued','whatsapp'),('document-sending','whatsapp'),('history','sms'),('email','email')) t(label,channel);
update public.outbox set attempts=1,error='provider_acceptance_unknown' where id in(select id from cutover_messages where label in('uncertain','document-sending'));
update public.outbox set document_delivery_state='queued' where id=(select id from cutover_messages where label='document-queued');
update public.outbox set document_delivery_state='sending',document_claim_token=gen_random_uuid(),document_lease_until=now()-interval '1 minute'
where id=(select id from cutover_messages where label='document-sending');
select public.finalize_message_quota((select id from cutover_messages where label='history'),true);
update public.outbox set status='sent',sent_at=now() where id=(select id from cutover_messages where label='history');
insert into public.delivery_attempts(outbox_id,provider,attempt_number,accepted,error)
select id,'sms',1,true,'provider_acceptance_unknown' from cutover_messages where label='uncertain';
-- Simulate the pre-contract schema and pending anonymous records inside this transaction.
alter table public.outbox drop constraint outbox_pending_identity_check;
update public.outbox set company_name_snapshot=null where id in(select id from cutover_messages);
insert into public.message_campaigns(id,scope,name,audience,audience_config,channel,title,body,status,recipient_count)
values('94100000-0000-4000-8000-000000000002','platform','Legacy campaign','all','{}','sms','Title','Legacy campaign body','queued',1);
insert into public.campaign_recipients(id,campaign_id,company_id,recipient,rendered_body,status)
select '94100000-0000-4000-8000-000000000003','94100000-0000-4000-8000-000000000002',id,'+254714100001','Legacy campaign body','queued' from cutover_company;
insert into public.outbox(id,company_id,channel,recipient,body,source,quota_state,campaign_id,campaign_recipient_id)
select '94100000-0000-4000-8000-000000000004',id,'sms','+254714100001','Legacy campaign body','platform','released',
'94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000003' from cutover_company;
update public.campaign_recipients set outbox_id='94100000-0000-4000-8000-000000000004' where id='94100000-0000-4000-8000-000000000003';
create temp table cutover_before as select * from public.outbox where company_id=(select id from cutover_company);
${cutover}
select is((select count(*)::int from public.outbox where company_id=(select id from cutover_company)),7,'cutover never creates replacement deliveries');
select ok((select bool_and(o.body=b.body and o.company_name_snapshot is null) from public.outbox o join cutover_before b using(id)),
 'cutover never rewrites legacy bodies or backfills identity');
select is((select status||':'||quota_state from public.outbox where id=(select id from cutover_messages where label='unattempted')),
 'cancelled:released','unattempted legacy SMS is cancelled and reservation released');
select is((select status||':'||quota_state from public.outbox where id=(select id from cutover_messages where label='uncertain')),
 'cancelled:used','attempted legacy SMS remains accounted for conservatively');
select is((select error from public.outbox where id=(select id from cutover_messages where label='uncertain')),
 'outbound_contract_cutover_delivery_uncertain','uncertainty remains visible');
select is((select count(*)::int from public.delivery_attempts where outbox_id=(select id from cutover_messages where label='uncertain') and accepted),1,
 'provider acceptance evidence is preserved');
select is((select status||':'||document_delivery_state||':'||quota_state from public.outbox where id=(select id from cutover_messages where label='document-sending')),
 'failed:unknown:used','in-flight document becomes unknown and is never replayed');
select is((select status||':'||document_delivery_state||':'||quota_state from public.outbox where id=(select id from cutover_messages where label='document-queued')),
 'cancelled:cancelled:released','unsent document is cancelled and quota released');
select is((select status||':'||quota_state from public.outbox where id=(select id from cutover_messages where label='history')),'sent:used','sent history remains intact');
select is((select status from public.outbox where id=(select id from cutover_messages where label='email')),'pending','email is outside cutover');
select is((select status from public.message_campaigns where id='94100000-0000-4000-8000-000000000002'),'cancelled','legacy campaign is no longer dispatchable');
select is((select status from public.campaign_recipients where id='94100000-0000-4000-8000-000000000003'),'cancelled','campaign recipient state agrees with outbox');
select is((select sms_reserved_this_period+whatsapp_reserved_this_period from public.companies where id=(select id from cutover_company)),0,'cutover leaves no orphan quota reservations');
select is((select sms_used_this_period+whatsapp_used_this_period from public.companies where id=(select id from cutover_company)),3,'only sent and uncertain deliveries count as used');
${cutover}
select is((select sms_used_this_period+whatsapp_used_this_period from public.companies where id=(select id from cutover_company)),3,'cancellation block is idempotent');
select * from finish();
rollback;`;
const output = execFileSync(
  'docker',
  [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
  ],
  { input: sql, encoding: 'utf8' }
);
assert.doesNotMatch(output, /^not ok|^# Looks like/m, output);
console.log(
  output
    .split('\n')
    .filter(line => /^(ok |1\.\.)/.test(line))
    .join('\n')
);
