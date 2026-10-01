begin;
select no_plan();
select testkit.create_user('94200000-0000-4000-8000-000000000001','campaign-valid@test.local','+254714200001');
select testkit.create_user('94200000-0000-4000-8000-000000000002','campaign-invalid@test.local','+254714200002');
select testkit.create_user('94200000-0000-4000-8000-000000000003','campaign-admin@test.local');
create temp table campaign_identity_companies as
select testkit.provision('94200000-0000-4000-8000-000000000001','Z Valid Store') id,true valid
union all select testkit.provision('94200000-0000-4000-8000-000000000002',E'A\nStore'),false;
insert into public.platform_admins(user_id) values('94200000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"94200000-0000-4000-8000-000000000003","role":"authenticated","is_platform_admin":true}',true);

-- The invalid company sorts before the valid sample and must not block review.
create temp table campaign_identity_results(label text,channel text,id uuid,preview jsonb,result jsonb);
do $$ declare v_case record;ch text;v_id uuid;v_preview jsonb;v_companies uuid[];begin
  select array_agg(id) into v_companies from campaign_identity_companies;
  for v_case in select * from (values
    ('newline',E'A\nStore'),('placeholder','A {{merchant_name}}'),('blank','   ')
  ) cases(label,name) loop
    update public.companies set name=v_case.name where id=(select id from campaign_identity_companies where not valid);
    foreach ch in array array['sms','whatsapp'] loop
      v_id:=public.platform_save_campaign_draft('Identity regression',ch,'Update for {{merchant_name}}',
        'Please review your account.','selected',null,null,v_companies,null,null,null);
      v_preview:=public.platform_review_campaign(v_id);
      insert into campaign_identity_results values(v_case.label,ch,v_id,v_preview,public.platform_launch_campaign(v_id,null));
    end loop;
  end loop;
end $$;
select is((preview->>'eligible')::int,1,label||' '||channel||' review excludes invalid identity') from campaign_identity_results;
select is((preview->>'skipped')::int,1,label||' '||channel||' review counts skipped company') from campaign_identity_results;
select is(preview#>>'{sample,merchant_name}','Z Valid Store',label||' '||channel||' review chooses a valid sample') from campaign_identity_results;
select is((result->>'queued')::int,1,label||' '||channel||' queues the valid recipient') from campaign_identity_results;
select is((result->>'skipped')::int,1,label||' '||channel||' skips only the invalid recipient') from campaign_identity_results;
select is(r.status||':'||r.skip_reason,'skipped:invalid_company_name',c.label||' '||c.channel||' records the rejection')
from campaign_identity_results c join public.campaign_recipients r on r.campaign_id=c.id
where r.company_id=(select id from campaign_identity_companies where not valid);
select is((select count(*)::int from public.outbox o where o.campaign_id=c.id),1,c.label||' '||c.channel||' creates exactly one delivery')
from campaign_identity_results c;
select is(o.body,c.preview->>'rendered_body',c.label||' '||c.channel||' preview agrees with delivery')
from campaign_identity_results c join public.outbox o on o.campaign_id=c.id;
select is(m.status||':'||m.recipient_count||':'||m.skipped_count,'queued:2:1',c.label||' '||c.channel||' campaign counts agree')
from campaign_identity_results c join public.message_campaigns m on m.id=c.id;
select public.dispatch_platform_campaign(id) from campaign_identity_results;
select is((select count(*)::int from public.outbox where campaign_id in(select id from campaign_identity_results)),6,
  'repeat dispatch does not duplicate valid deliveries');

-- A company can become invalid after a scheduled campaign was reviewed.
do $$ declare ch text;v_id uuid;v_preview jsonb;v_companies uuid[];begin
  select array_agg(id) into v_companies from campaign_identity_companies;
  foreach ch in array array['sms','whatsapp'] loop
    update public.companies set name='A Valid Store' where id=(select id from campaign_identity_companies where not valid);
    v_id:=public.platform_save_campaign_draft('Scheduled identity regression',ch,'Account update',
      'Please review your account.','selected',null,null,v_companies,null,null,null);
    v_preview:=public.platform_review_campaign(v_id);
    perform public.platform_launch_campaign(v_id,now()+interval '1 hour');
    update public.companies set name=E'A\nStore' where id=(select id from campaign_identity_companies where not valid);
    update public.message_campaigns set scheduled_for=now()-interval '1 minute' where id=v_id;
    insert into campaign_identity_results values('scheduled',ch,v_id,v_preview,public.dispatch_platform_campaign(v_id));
  end loop;
end $$;
select is((preview->>'eligible')::int,2,channel||' initially reviews both valid companies') from campaign_identity_results where label='scheduled';
select is((result->>'queued')::int,1,channel||' scheduled dispatch survives a later invalid name') from campaign_identity_results where label='scheduled';
select is(r.skip_reason,'invalid_company_name',c.channel||' scheduled dispatch records invalid identity')
from campaign_identity_results c join public.campaign_recipients r on r.campaign_id=c.id
where c.label='scheduled' and r.company_id=(select id from campaign_identity_companies where not valid);

-- No valid external recipients yields an empty preview and no outbound work.
do $$ declare v_id uuid;v_preview jsonb;begin
  v_id:=public.platform_save_campaign_draft('Invalid audience','sms','Account update','Please review your account.',
    'selected',null,null,array[(select id from campaign_identity_companies where not valid)],null,null,null);
  v_preview:=public.platform_review_campaign(v_id);
  insert into campaign_identity_results values('all-invalid','sms',v_id,v_preview,public.platform_launch_campaign(v_id,null));
end $$;
select is((preview->>'eligible')::int,0,'all-invalid audience has no eligible recipients') from campaign_identity_results where label='all-invalid';
select is(preview->'sample','null'::jsonb,'all-invalid audience has no rendered sample') from campaign_identity_results where label='all-invalid';
select is((result->>'queued')::int,0,'all-invalid campaign queues nothing') from campaign_identity_results where label='all-invalid';
select is(m.status,'failed','all-invalid campaign terminates without pending work')
from campaign_identity_results c join public.message_campaigns m on m.id=c.id where c.label='all-invalid';

-- In-app messages do not use the external identity contract.
do $$ declare v_id uuid;v_preview jsonb;begin
  v_id:=public.platform_save_campaign_draft('In-app audience','in_app','Account update','Please review your account.',
    'selected',null,null,array[(select id from campaign_identity_companies where not valid)],null,null,null);
  v_preview:=public.platform_review_campaign(v_id);
  insert into campaign_identity_results values('in-app','in_app',v_id,v_preview,public.platform_launch_campaign(v_id,null));
end $$;
select is((preview->>'eligible')::int,1,'in-app eligibility is unchanged') from campaign_identity_results where label='in-app';
select is(r.status,'sent','in-app delivery is unchanged') from campaign_identity_results c
join public.campaign_recipients r on r.campaign_id=c.id where c.label='in-app';
select * from finish();
rollback;
