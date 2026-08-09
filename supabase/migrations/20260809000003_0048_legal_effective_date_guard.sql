create or replace function public.prevent_future_legal_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publication_state = 'draft'
     and new.publication_state = 'published'
     and new.effective_at > now() then
    raise exception 'effective_date_in_future';
  end if;
  return new;
end;
$$;

create trigger legal_document_effective_date_guard
before update on public.legal_document_versions
for each row execute function public.prevent_future_legal_publication();
