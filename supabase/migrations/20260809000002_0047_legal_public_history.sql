create or replace function public.published_legal_document_version(
  p_document_type text,
  p_version text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(d) - 'created_by' - 'published_by'
  from public.legal_document_versions d
  where d.document_type = p_document_type
    and d.version = p_version
    and d.publication_state in ('published', 'superseded')
  limit 1;
$$;

create or replace function public.published_legal_document_history(p_document_type text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version', d.version,
    'effective_at', d.effective_at,
    'publication_state', d.publication_state
  ) order by d.effective_at desc), '[]'::jsonb)
  from public.legal_document_versions d
  where d.document_type = p_document_type
    and d.publication_state in ('published', 'superseded');
$$;

revoke execute on function public.published_legal_document_version(text, text) from public;
revoke execute on function public.published_legal_document_history(text) from public;
grant execute on function public.published_legal_document_version(text, text) to anon, authenticated, service_role;
grant execute on function public.published_legal_document_history(text) to anon, authenticated, service_role;
