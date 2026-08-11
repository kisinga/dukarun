begin;
select plan(9);

select testkit.create_user('83838383-8383-4383-8383-838383838381','primary-owner@test.local','+254700000831');
select testkit.create_user('83838383-8383-4383-8383-838383838382','primary-admin@test.local','+254700000832');
select testkit.create_user('83838383-8383-4383-8383-838383838389','primary-platform@test.local','+254700000839');
create temp table primary_fixture as select testkit.provision('83838383-8383-4383-8383-838383838381','Primary Contact Store') company_id;
grant select on pg_temp.primary_fixture to authenticated;
select testkit.add_member((select company_id from primary_fixture),'83838383-8383-4383-8383-838383838382','Second Admin',array['ManageTeam']);
insert into public.platform_admins(user_id) values('83838383-8383-4383-8383-838383838389');

select testkit.as_user((select company_id from primary_fixture),'83838383-8383-4383-8383-838383838381','Admin');
select is(public.set_company_primary_contact('83838383-8383-4383-8383-838383838382'),
  '83838383-8383-4383-8383-838383838382'::uuid,'admin sets approved primary contact');
select is(public.team_management_snapshot()->>'primary_contact_user_id','83838383-8383-4383-8383-838383838382','team snapshot exposes primary contact');
select throws_ok($$select public.set_company_primary_contact('83838383-8383-4383-8383-838383838389')$$,
  'P0001','primary_contact_must_be_approved_admin','non-member cannot become primary contact');
reset role;

set local role authenticated;
set local request.jwt.claims='{"sub":"83838383-8383-4383-8383-838383838389","role":"authenticated","is_platform_admin":true}';
create temp table primary_campaign as select public.platform_save_campaign_draft(
  'Primary target','in_app','Primary','Hello','selected',null,null,
  array[(select company_id from primary_fixture)],null,null,null
) id;
select public.platform_review_campaign((select id from primary_campaign));
select public.platform_launch_campaign((select id from primary_campaign),null);
reset role;
select is((select user_id from public.notifications where title='Primary'),'83838383-8383-4383-8383-838383838382'::uuid,'platform campaign prefers primary contact');

update public.roles set permissions=array_remove(permissions,'ManageTeam')
where id=(select role_id from public.company_memberships where company_id=(select company_id from primary_fixture)
  and user_id='83838383-8383-4383-8383-838383838382');
select is((select primary_contact_user_id from public.companies where id=(select company_id from primary_fixture)),null,'removing admin permission clears primary contact');
update public.roles set permissions=array_append(permissions,'ManageTeam')
where id=(select role_id from public.company_memberships where company_id=(select company_id from primary_fixture)
  and user_id='83838383-8383-4383-8383-838383838382');
select testkit.as_user((select company_id from primary_fixture),'83838383-8383-4383-8383-838383838381','Admin');
select public.set_company_primary_contact('83838383-8383-4383-8383-838383838382');
reset role;
update public.company_memberships set authorization_status='disabled'
where company_id=(select company_id from primary_fixture) and user_id='83838383-8383-4383-8383-838383838382';
select is((select primary_contact_user_id from public.companies where id=(select company_id from primary_fixture)),null,'disabling primary contact clears selection');
select ok((select primary_contact_user_id is not null from public.companies where id=(select company_id from primary_fixture))=false,'fallback remains implicit after clear');

update public.roles set permissions=array_remove(permissions,'ManageTeam')
where id=(select role_id from public.company_memberships where company_id=(select company_id from primary_fixture)
  and user_id='83838383-8383-4383-8383-838383838381');
set local role authenticated;
set local request.jwt.claims='{"sub":"83838383-8383-4383-8383-838383838389","role":"authenticated","is_platform_admin":true}';
create temp table no_admin_campaign as select public.platform_save_campaign_draft(
  'No admin target','in_app','No admin','Hello','selected',null,null,
  array[(select company_id from primary_fixture)],null,null,null
) id;
select is((public.platform_review_campaign((select id from no_admin_campaign))->>'eligible')::integer,0,'preview skips companies without a selected primary contact');
select public.platform_launch_campaign((select id from no_admin_campaign),null);
reset role;
select is((select skip_reason from public.campaign_recipients where campaign_id=(select id from no_admin_campaign)),'missing_primary','dispatch never falls back when primary contact is missing');

select * from finish();
rollback;
