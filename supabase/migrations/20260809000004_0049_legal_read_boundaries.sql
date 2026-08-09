revoke select on public.legal_document_versions from anon, authenticated;

create or replace function public.platform_legal_documents()
returns setof public.legal_document_versions
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  select d.* from public.legal_document_versions d order by d.created_at desc;
end;
$$;

revoke execute on function public.platform_legal_documents() from public, anon;
grant execute on function public.platform_legal_documents() to authenticated, service_role;
