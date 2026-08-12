begin;
select plan(45);

select testkit.create_user('90000000-0000-0000-0000-000000000001', 'blog-platform@test.local');
select testkit.create_user('90000000-0000-0000-0000-000000000002', 'blog-outsider@test.local');
select testkit.create_user('90000000-0000-0000-0000-000000000003', 'auto-founder@test.local');
select testkit.create_user('90000000-0000-0000-0000-000000000004', 'manual-founder@test.local');
insert into public.platform_admins(user_id) values ('90000000-0000-0000-0000-000000000001');

select is(
  (select automatic_company_approval_enabled from public.platform_registration_settings where singleton),
  false,
  'automatic approval is off by default'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.platform_registration_config()$$,
  'P0001', 'platform_admin_required', 'tenant users cannot read platform registration controls'
);
select throws_ok(
  $$select public.platform_save_blog_draft(null, 'outsider-post', 'No', 'No access', '# No', 'Outsider')$$,
  'P0001', 'platform_admin_required', 'tenant users cannot create blog drafts'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
create temp table saved_blog as
select public.platform_save_blog_draft(
  null,
  'stock-and-cash-basics',
  'Stock and cash basics',
  'A practical guide for Kenyan merchants.',
  '# Stock and cash' || chr(10) || chr(10) || 'Keep both records in step.',
  'Dukarun team',
  null,
  null,
  array['stock','cash-flow'],
  'Stock and cash basics | Dukarun',
  'Keep stock and cash records in step.'
) result;
grant select on pg_temp.saved_blog to authenticated, anon, service_role;

select ok((select (result->>'post_id')::uuid from saved_blog) is not null,
  'platform admin creates a blog draft');
select is(public.public_blog_post('stock-and-cash-basics'), null::jsonb,
  'draft content is not public');
select throws_ok(
  $$select public.platform_save_blog_draft(null, 'unsafe-post', 'Unsafe', 'Unsafe body', '<script>alert(1)</script>', 'Dukarun')$$,
  'P0001', 'raw_html_not_allowed', 'raw HTML is rejected by the publishing boundary'
);

create temp table published_blog as
select public.platform_publish_blog_post((select (result->>'post_id')::uuid from saved_blog)) result;
grant select on pg_temp.published_blog to authenticated, anon, service_role;
select is(
  (select result->>'post_id' from published_blog),
  (select result->>'post_id' from saved_blog),
  'draft publishes as an immutable revision'
);
select is(public.public_blog_post('stock-and-cash-basics')->>'title', 'Stock and cash basics',
  'published article is public');
select is(jsonb_array_length(public.public_blog_posts()), 1,
  'public article listing contains the publication');
select is(jsonb_array_length(public.public_blog_sitemap()), 1,
  'public sitemap projection contains every publication without pagination');
select is((select count(*)::integer from public.public_site_deploy_requests
  where reason='blog_publish'), 0, 'publishing needs no frontend deployment');
select throws_ok(
  $$select public.platform_save_blog_draft(
    (select (result->>'post_id')::uuid from saved_blog), 'renamed-after-publish',
    'Renamed', 'Renamed excerpt', '# Renamed', 'Dukarun')$$,
  'P0001', 'published_blog_slug_immutable', 'a published article keeps its canonical slug'
);

select public.platform_save_blog_draft(
  (select (result->>'post_id')::uuid from saved_blog), 'stock-and-cash-basics',
  'Stock and cash basics v2', 'Updated practical guide.', '# Updated draft', 'Dukarun team'
);
select is((select (item->>'version_number')::integer
  from jsonb_array_elements(public.platform_blog_posts()) item
  where item->>'post_id'=(select result->>'post_id' from saved_blog)), 2,
  'editing a publication creates a second draft revision');
select ok(not (select item ? 'content_markdown'
  from jsonb_array_elements(public.platform_blog_posts()) item
  where item->>'post_id'=(select result->>'post_id' from saved_blog)),
  'admin article lists do not load every markdown body');
select is(public.platform_blog_post((select (result->>'post_id')::uuid from saved_blog))->>'content_markdown',
  '# Updated draft', 'admin loads the selected article body separately');
select ok((public.platform_schedule_blog_post(
  (select (result->>'post_id')::uuid from saved_blog), now()+interval '1 day')->>'scheduled_for') is not null,
  'draft revision can be scheduled');
select is(public.public_blog_post('stock-and-cash-basics')->>'title', 'Stock and cash basics',
  'scheduled revision does not replace the current public revision early');
select is(public.platform_cancel_scheduled_blog_post(
  (select (result->>'post_id')::uuid from saved_blog)), true,
  'scheduled publication can return to draft');
reset role;

set local role anon;
select is(public.record_blog_event(
  '90000000-0000-4000-8000-000000000010',
  (select (result->>'post_id')::uuid from saved_blog),
  '90000000-0000-4000-8000-000000000011','post_view','{}'), true,
  'anonymous readers can record a first-party page view');
select is(public.record_blog_event(
  '90000000-0000-4000-8000-000000000012',
  (select (result->>'post_id')::uuid from saved_blog),
  '90000000-0000-4000-8000-000000000011','post_view','{}'), false,
  'daily engagement signals are de-duplicated per visitor');
select is(public.record_blog_event(
  '90000000-0000-4000-8000-000000000013',
  (select (result->>'post_id')::uuid from saved_blog),
  '90000000-0000-4000-8000-000000000011','cta_click','{"placement":"article_footer"}'), true,
  'CTA clicks receive durable event identifiers for attribution');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is((public.platform_blog_metrics()->>'views')::integer, 1,
  'platform metrics report the recorded view');
select is((public.platform_update_registration_config(true, 7, 21)
  ->>'automatic_company_approval_enabled')::boolean, true,
  'platform admin enables automatic registration approval');
select is((public.platform_registration_config()->>'hourly_alert_threshold')::integer, 7,
  'registration alert thresholds are configurable');
reset role;

update public.legal_document_versions set publication_state='superseded'
where document_type='terms' and publication_state='published';
insert into public.legal_document_versions(
  document_type,version,content_markdown,content_sha256,effective_at,publication_state,requires_company_acceptance
) values ('terms','2099-01-01','# Registration Terms',repeat('c',64),now()-interval '1 day','published',true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';
create temp table auto_registration as
select public.provision_company_registration(
  'Automatic Company','Main','KES',null,null,null,'2099-01-01',repeat('c',64),'Auto Founder',
  '90000000-0000-4000-8000-000000000013'
) result;
grant select on pg_temp.auto_registration to authenticated, service_role;
select is((select result->>'company_status' from auto_registration), 'approved',
  'automatic registration returns approved status immediately');
reset role;
select is((select status from public.companies where id=(select (result->>'company_id')::uuid from auto_registration)),
  'approved', 'automatic registration persists the approved company state');
select is((select subscription_status from public.companies where id=
  (select (result->>'company_id')::uuid from auto_registration)), 'trial',
  'automatic approval starts the trial exactly at approval');
select is((select count(*)::integer from public.company_registration_attributions where company_id=
  (select (result->>'company_id')::uuid from auto_registration)), 1,
  'registration is attributed to the blog CTA click');
select is((select approval_mode from public.company_approval_events where company_id=
  (select (result->>'company_id')::uuid from auto_registration)), 'automatic',
  'automatic approval is recorded separately for audit and alerting');

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select public.platform_update_registration_config(true, 1, 1);
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.scan_registration_volume_alerts(), 2,
  'volume scanner creates hourly and daily threshold alerts');
update public.blog_events set occurred_at=now()-interval '100 days',event_day=(now()-interval '100 days')::date
  where id='90000000-0000-4000-8000-000000000013';
select lives_ok($$select public.refresh_blog_daily_metrics()$$,
  'metrics retention does not fail on attributed CTA events');
select is((select count(*)::integer from public.blog_events
  where id='90000000-0000-4000-8000-000000000013'), 0,
  'expired raw CTA events are removed');
select is((select count(*)::integer from public.company_registration_attributions where company_id=
  (select (result->>'company_id')::uuid from auto_registration)), 1,
  'registration attribution remains after its raw click event expires');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is(jsonb_array_length(public.platform_registration_alerts()), 2,
  'platform admin sees durable registration alerts');
select is(public.platform_acknowledge_registration_alert(
  (select id from public.platform_registration_alerts order by created_at limit 1)), true,
  'platform admin can acknowledge a volume alert');
select is((public.platform_update_registration_config(false, 7, 21)
  ->>'automatic_company_approval_enabled')::boolean, false,
  'platform admin can restore manual registration review');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000004","role":"authenticated"}';
create temp table manual_registration as
select public.provision_company_registration(
  'Manual Company','Main','KES',null,null,null,'2099-01-01',repeat('c',64),'Manual Founder',null
) result;
grant select on pg_temp.manual_registration to authenticated, service_role;
select is((select result->>'company_status' from manual_registration), 'unapproved',
  'manual mode returns pending status');
reset role;
select is((select status from public.companies where id=(select (result->>'company_id')::uuid from manual_registration)),
  'unapproved', 'manual registration remains pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select public.platform_update_registration_config(true, 7, 21);
reset role;
select is((select status from public.companies where id=(select (result->>'company_id')::uuid from manual_registration)),
  'unapproved', 'enabling automation does not approve the existing backlog');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.public_site_deploy_requests(reason,resource_type)
values('manual','frontend');
create temp table deploy_claim as select public.claim_public_site_deployment() result;
grant select on pg_temp.deploy_claim to authenticated, service_role;
select ok((select (result->>'deployment_id')::uuid from deploy_claim) is not null,
  'deploy worker atomically claims pending build work');
select is((select max(attempt_count) from public.public_site_deploy_requests), 1,
  'claiming deployment work increments its bounded retry counter');
select is(public.finalize_public_site_deployment(
  (select (result->>'deployment_id')::uuid from deploy_claim),'failed','test failure'), true,
  'deployment and claimed requests finalize atomically');
select is((select status from public.public_site_deployments
  where id=(select (result->>'deployment_id')::uuid from deploy_claim)), 'failed',
  'failed deployment reaches a terminal state');
select is((select count(*)::integer from public.public_site_deploy_requests where status='pending'), 1,
  'failed first attempt returns the request to the retry queue');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is(jsonb_array_length(public.platform_site_deployments()), 1,
  'platform admin can inspect deployment status');
reset role;

select * from finish();
rollback;
