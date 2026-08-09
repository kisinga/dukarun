begin;
select plan(29);

select testkit.create_user('74000000-0000-0000-0000-000000000001', 'legal-publisher@test.local');
select testkit.create_user('74000000-0000-0000-0000-000000000002', 'legal-outsider@test.local');
insert into public.platform_admins(user_id) values ('74000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"74000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.platform_save_legal_draft(null, 'privacy', '2026-08-01',
    '# Privacy' || chr(10) || chr(10) || repeat('Safe privacy text. ', 4),
    '2026-08-01', null, false)$$,
  'P0001', 'platform_admin_required', 'tenant user cannot create a legal draft'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
create temp table legal_markdown_draft as
select public.platform_save_legal_draft(
  null, 'privacy', '2026-08-01',
  '# Privacy Notice' || chr(13) || chr(10) || chr(13) || chr(10) ||
    'Dukarun Solutions explains how personal data is handled.' || chr(13) || chr(10),
  '2026-08-01', null, false
) id;
grant select on pg_temp.legal_markdown_draft to authenticated;

select ok((select id from legal_markdown_draft) is not null, 'platform admin creates a draft');
select is(
  (select content_markdown from public.platform_legal_documents() where id=(select id from legal_markdown_draft)),
  '# Privacy Notice' || chr(10) || chr(10) ||
    'Dukarun Solutions explains how personal data is handled.' || chr(10),
  'draft save normalizes line endings'
);
reset role;
select is(
  (select content_sha256 from public.legal_document_versions where id=(select id from legal_markdown_draft)),
  public.legal_markdown_sha256((select content_markdown from public.legal_document_versions where id=(select id from legal_markdown_draft))),
  'draft hash matches normalized Markdown'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is(public.published_legal_document('privacy'), null::jsonb, 'draft content is not public');

select throws_ok(
  $$select public.platform_save_legal_draft(null, 'privacy', '2026-09-02',
    '# Privacy' || chr(10) || chr(10) || '<script>unsafe</script>' || repeat(' text', 8),
    '2026-09-02', null, false)$$,
  'P0001', 'raw_html_not_allowed', 'raw HTML is rejected'
);

select throws_ok(
  $$select public.platform_save_legal_draft(null, 'privacy', '2026-02-30',
    '# Privacy' || chr(10) || chr(10) || repeat('Approved privacy wording. ', 3),
    '2026-02-28', null, false)$$,
  'P0001', 'invalid_version', 'impossible calendar dates are rejected as versions'
);

create temp table marked_draft as
select public.platform_save_legal_draft(
  null, 'terms', '2026-09-03',
  '# Terms' || chr(10) || chr(10) || 'Counsel must complete this document before publication.',
  '2026-09-03', '2026-09-17', true
) id;
grant select on pg_temp.marked_draft to authenticated;
select throws_ok(
  $$select public.platform_publish_legal_document(
    (select id from marked_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from marked_draft)))$$,
  'P0001', 'unresolved_review_marker', 'review markers block publication'
);

create temp table tbd_draft as
select public.platform_save_legal_draft(
  null, 'terms', '2026-08-04',
  '# Terms' || chr(10) || chr(10) || repeat('Approved wording. ', 3) || 'TBD',
  '2026-08-04', '2026-08-18', true
) id;
grant select on pg_temp.tbd_draft to authenticated;
select throws_ok(
  $$select public.platform_publish_legal_document(
    (select id from tbd_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from tbd_draft)))$$,
  'P0001', 'unresolved_review_marker', 'standalone TBD blocks publication'
);

select throws_ok(
  $$select public.platform_publish_legal_document((select id from legal_markdown_draft), repeat('f',64))$$,
  'P0001', 'git_hash_mismatch', 'expected Git hash must match pasted Markdown'
);

create temp table future_draft as
select public.platform_save_legal_draft(
  null, 'dpa', '2026-12-01',
  '# Data Processing Addendum' || chr(10) || chr(10) || repeat('Approved processing terms. ', 3),
  now() + interval '30 days', null, false
) id;
grant select on pg_temp.future_draft to authenticated;
select throws_ok(
  $$select public.platform_publish_legal_document(
    (select id from future_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from future_draft)))$$,
  'P0001', 'effective_date_in_future', 'future effective dates cannot be published early'
);

create temp table short_notice_draft as
select public.platform_save_legal_draft(
  null, 'terms', '2026-08-05',
  '# Terms' || chr(10) || chr(10) || repeat('Approved legal wording. ', 3),
  now() - interval '1 day', now() + interval '1 day', true
) id;
grant select on pg_temp.short_notice_draft to authenticated;
select throws_ok(
  $$select public.platform_publish_legal_document(
    (select id from short_notice_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from short_notice_draft)))$$,
  'P0001', 'legal_notice_period_required',
  'material Terms require at least 14 days before enforcement'
);

select is(
  public.platform_publish_legal_document(
    (select id from legal_markdown_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from legal_markdown_draft))
  )->>'version',
  '2026-08-01',
  'matching hash publishes the draft'
);
select is(
  (public.published_legal_document('privacy')->>'version'),
  '2026-08-01',
  'published content is available through the public RPC'
);
select ok(
  public.published_legal_document('privacy')->>'content_markdown' like '# Privacy Notice%',
  'public RPC returns published Markdown'
);
select ok(
  (select published_by from public.platform_legal_documents() where id=(select id from legal_markdown_draft)) =
    '74000000-0000-0000-0000-000000000001',
  'publication records the platform administrator'
);

reset role;
select throws_ok(
  $$update public.legal_document_versions set content_markdown='changed'
    where id=(select id from legal_markdown_draft)$$,
  'P0001', 'published_legal_documents_are_immutable', 'published Markdown is immutable'
);
select throws_ok(
  $$delete from public.legal_document_versions where id=(select id from legal_markdown_draft)$$,
  'P0001', 'published_legal_documents_are_immutable', 'published documents cannot be deleted'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
create temp table replacement_draft as
select public.platform_save_legal_draft(
  null, 'privacy', '2026-08-02',
  '# Privacy Notice' || chr(10) || chr(10) || repeat('Updated privacy wording. ', 3),
  '2026-08-02', null, false
) id;
grant select on pg_temp.replacement_draft to authenticated;
select lives_ok(
  $$select public.platform_publish_legal_document(
    (select id from replacement_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from replacement_draft)))$$,
  'publishing a replacement succeeds atomically'
);
select is(
  (select publication_state from public.platform_legal_documents() where id=(select id from legal_markdown_draft)),
  'superseded', 'previous published version becomes superseded'
);
select is(public.published_legal_document('privacy')->>'version', '2026-08-02',
  'public RPC returns the replacement version');

create temp table older_draft as
select public.platform_save_legal_draft(
  null, 'privacy', '2026-07-31',
  '# Privacy Notice' || chr(10) || chr(10) || repeat('Older privacy wording. ', 3),
  '2026-07-31', null, false
) id;
grant select on pg_temp.older_draft to authenticated;
select throws_ok(
  $$select public.platform_publish_legal_document(
    (select id from older_draft),
    (select content_sha256 from public.platform_legal_documents() where id=(select id from older_draft)))$$,
  'P0001', 'legal_version_must_increase',
  'an older draft cannot replace the current published document'
);
set local role anon;
select is(
  public.published_legal_document('privacy')->>'version',
  '2026-08-02', 'anonymous callers can read the current published document'
);
select ok(
  not (public.published_legal_document('privacy') ? 'published_by'),
  'public documents do not expose the publishing administrator'
);
select throws_ok(
  $$select * from public.legal_document_versions$$,
  '42501', null, 'anonymous callers cannot bypass the public legal RPCs'
);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","is_platform_admin":true}';
select is(
  jsonb_array_length(public.published_legal_document_history('privacy')),
  2, 'public history lists published and superseded versions'
);
select is(
  public.published_legal_document_version('privacy', '2026-08-01')->>'publication_state',
  'superseded', 'a retained historical version remains readable'
);

select lives_ok(
  $$select public.platform_discard_legal_draft((select id from marked_draft))$$,
  'drafts may be discarded'
);
select is(
  (select count(*)::int from public.platform_legal_documents() where id=(select id from marked_draft)),
  0, 'discard removes only the draft'
);

select * from finish();
rollback;
