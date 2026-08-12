begin;
select plan(11);

select testkit.create_user('93000000-0000-0000-0000-000000000001', 'feature-admin@test.local');
select testkit.create_user('93000000-0000-0000-0000-000000000002', 'feature-outsider@test.local');
insert into public.platform_admins(user_id) values ('93000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.platform_feature_blog_post('93000000-0000-0000-0000-000000000099')$$,
  'P0001', 'platform_admin_required', 'tenant users cannot choose the featured story'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
create temp table first_post as
select public.platform_save_blog_draft(
  null, 'first-feature-test', 'First feature test', 'First excerpt', '# First', 'Dukarun team'
) result;
create temp table second_post as
select public.platform_save_blog_draft(
  null, 'second-feature-test', 'Second feature test', 'Second excerpt', '# Second', 'Dukarun team'
) result;
grant select on pg_temp.first_post,pg_temp.second_post to authenticated,anon,service_role;

select public.platform_publish_blog_post((select (result->>'post_id')::uuid from first_post));
select public.platform_publish_blog_post((select (result->>'post_id')::uuid from second_post));

select ok(
  public.platform_feature_blog_post((select (result->>'post_id')::uuid from first_post)),
  'an admin can feature a published article'
);
select is(
  public.public_featured_blog_post()->>'post_id',
  (select result->>'post_id' from first_post),
  'the public featured projection returns the editorial choice'
);
select ok(
  public.platform_feature_blog_post((select (result->>'post_id')::uuid from second_post)),
  'an admin can replace the featured article'
);
select is(
  public.public_featured_blog_post()->>'post_id',
  (select result->>'post_id' from second_post),
  'the public projection changes with the editorial choice'
);
select is(
  (select count(*)::integer
   from jsonb_array_elements(public.platform_blog_posts()) item
   where item->>'featured_at' is not null),
  1,
  'only one article is featured'
);
select ok(
  (select (item->>'featured_at') is not null
   from jsonb_array_elements(public.platform_blog_posts()) item
   where item->>'post_id'=(select result->>'post_id' from second_post)),
  'the editorial list identifies the featured article'
);
select ok(
  (select (item->>'has_published_version')::boolean
   from jsonb_array_elements(public.platform_blog_posts()) item
   where item->>'post_id'=(select result->>'post_id' from second_post)),
  'the editorial list exposes feature eligibility'
);
select ok(
  public.platform_archive_blog_post((select (result->>'post_id')::uuid from second_post)),
  'the featured article can be archived'
);
select is(
  (select count(*)::integer
   from jsonb_array_elements(public.platform_blog_posts()) item
   where item->>'featured_at' is not null),
  0,
  'archiving clears the editorial choice'
);
select is(
  public.public_featured_blog_post()->>'post_id',
  (select result->>'post_id' from first_post),
  'the newest published article is the fallback'
);

select * from finish();
rollback;
