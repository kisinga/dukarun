-- Git-authored Markdown, pasted and published through the platform console.

alter table public.legal_document_versions
  add column content_markdown text,
  add column created_by uuid,
  add column published_by uuid,
  add column published_at timestamptz;

create or replace function public.normalize_legal_markdown(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(replace(coalesce(p_content, ''), chr(13) || chr(10), chr(10)), chr(13), chr(10), 'g');
$$;

create or replace function public.legal_markdown_sha256(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(public.normalize_legal_markdown(p_content), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.prevent_published_legal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.publication_state <> 'draft' then
      raise exception 'published_legal_documents_are_immutable';
    end if;
    return old;
  end if;

  if old.publication_state = 'published'
     and new.publication_state = 'superseded'
     and new.id = old.id
     and new.document_type = old.document_type
     and new.version = old.version
     and new.content_sha256 = old.content_sha256
     and new.effective_at = old.effective_at
     and new.enforcement_at is not distinct from old.enforcement_at
     and new.requires_company_acceptance = old.requires_company_acceptance
     and new.content_markdown is not distinct from old.content_markdown
     and new.created_by is not distinct from old.created_by
     and new.published_by is not distinct from old.published_by
     and new.published_at is not distinct from old.published_at then
    return new;
  end if;

  if old.publication_state <> 'draft' then
    raise exception 'published_legal_documents_are_immutable';
  end if;
  return new;
end;
$$;

create trigger legal_document_versions_immutable
before update or delete on public.legal_document_versions
for each row execute function public.prevent_published_legal_mutation();

create or replace function public.platform_save_legal_draft(
  p_id uuid,
  p_document_type text,
  p_version text,
  p_content_markdown text,
  p_effective_at timestamptz,
  p_enforcement_at timestamptz default null,
  p_requires_company_acceptance boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_content text := public.normalize_legal_markdown(p_content_markdown);
begin
  perform public.assert_platform_admin();
  if p_document_type not in ('privacy', 'terms', 'dpa', 'subprocessors') then
    raise exception 'invalid_document_type';
  end if;
  if not public.is_valid_legal_document_version(p_version) then
    raise exception 'invalid_version';
  end if;
  if length(btrim(v_content)) < 40 then raise exception 'legal_content_required'; end if;
  if v_content ~ '<[A-Za-z/!][^>]*>' then raise exception 'raw_html_not_allowed'; end if;
  if p_requires_company_acceptance and p_document_type <> 'terms' then
    raise exception 'only_terms_require_acceptance';
  end if;
  if p_enforcement_at is not null and p_enforcement_at < p_effective_at then
    raise exception 'invalid_enforcement_date';
  end if;

  if p_id is null then
    insert into public.legal_document_versions (
      document_type, version, content_sha256, content_markdown, effective_at,
      enforcement_at, publication_state, requires_company_acceptance, created_by
    ) values (
      p_document_type, p_version, public.legal_markdown_sha256(v_content), v_content,
      p_effective_at, p_enforcement_at, 'draft', p_requires_company_acceptance, auth.uid()
    ) returning id into v_id;
  else
    update public.legal_document_versions
    set document_type = p_document_type,
        version = p_version,
        content_sha256 = public.legal_markdown_sha256(v_content),
        content_markdown = v_content,
        effective_at = p_effective_at,
        enforcement_at = p_enforcement_at,
        requires_company_acceptance = p_requires_company_acceptance,
        updated_at = now()
    where id = p_id and publication_state = 'draft'
    returning id into v_id;
    if v_id is null then raise exception 'editable_draft_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.platform_publish_legal_document(
  p_id uuid,
  p_expected_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.legal_document_versions%rowtype;
  v_current_version text;
  v_hash text;
begin
  perform public.assert_platform_admin();
  select * into v_document from public.legal_document_versions where id = p_id for update;
  if v_document.id is null or v_document.publication_state <> 'draft' then
    raise exception 'publishable_draft_not_found';
  end if;
  if length(btrim(coalesce(v_document.content_markdown, ''))) < 40 then
    raise exception 'legal_content_required';
  end if;
  if v_document.content_markdown ~* '(\mTBD\M|TO BE VERIFIED|counsel must|before publication|\[[A-Z][A-Z _-]{2,}\])' then
    raise exception 'unresolved_review_marker';
  end if;
  if v_document.content_markdown ~ '<[A-Za-z/!][^>]*>' then
    raise exception 'raw_html_not_allowed';
  end if;
  if v_document.requires_company_acceptance and v_document.enforcement_at is null then
    raise exception 'enforcement_date_required';
  end if;
  if v_document.requires_company_acceptance
     and v_document.enforcement_at < now() + interval '14 days' then
    raise exception 'legal_notice_period_required';
  end if;
  if v_document.effective_at > now() then raise exception 'effective_date_in_future'; end if;

  v_hash := public.legal_markdown_sha256(v_document.content_markdown);
  if lower(coalesce(p_expected_sha256, '')) <> v_hash then raise exception 'git_hash_mismatch'; end if;

  select version into v_current_version
  from public.legal_document_versions
  where document_type = v_document.document_type
    and publication_state = 'published'
  for update;

  if v_current_version is not null and v_document.version <= v_current_version then
    raise exception 'legal_version_must_increase';
  end if;

  update public.legal_document_versions
  set publication_state = 'superseded', updated_at = now()
  where document_type = v_document.document_type and publication_state = 'published';

  update public.legal_document_versions
  set publication_state = 'published', content_sha256 = v_hash,
      published_by = auth.uid(), published_at = now(), updated_at = now()
  where id = v_document.id;

  return jsonb_build_object('id', v_document.id, 'version', v_document.version, 'content_sha256', v_hash);
end;
$$;

create or replace function public.platform_discard_legal_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  delete from public.legal_document_versions where id = p_id and publication_state = 'draft';
  if not found then raise exception 'discardable_draft_not_found'; end if;
end;
$$;

create or replace function public.published_legal_document(p_document_type text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(d) - 'created_by' - 'published_by'
  from public.legal_document_versions d
  where d.document_type = p_document_type
    and d.publication_state = 'published'
    and d.effective_at <= now()
  order by d.effective_at desc, d.created_at desc
  limit 1;
$$;

revoke execute on function public.normalize_legal_markdown(text) from public, anon, authenticated;
revoke execute on function public.legal_markdown_sha256(text) from public, anon, authenticated;
revoke execute on function public.platform_save_legal_draft(uuid, text, text, text, timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.platform_publish_legal_document(uuid, text) from public, anon;
revoke execute on function public.platform_discard_legal_draft(uuid) from public, anon;
revoke execute on function public.published_legal_document(text) from public;
grant execute on function public.platform_save_legal_draft(uuid, text, text, text, timestamptz, timestamptz, boolean) to authenticated, service_role;
grant execute on function public.platform_publish_legal_document(uuid, text) to authenticated, service_role;
grant execute on function public.platform_discard_legal_draft(uuid) to authenticated, service_role;
grant execute on function public.published_legal_document(text) to anon, authenticated, service_role;
