-- Some upgraded databases lost the export-marker relation and its referencing
-- column while retaining the staged import RPCs. Restore the original contract
-- without changing existing imports or touching catalog/stock data.
create table if not exists public.catalog_export_markers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  exported_at timestamptz not null default clock_timestamp(),
  unique (company_id, id)
);

alter table public.catalog_export_markers enable row level security;
grant all on public.catalog_export_markers to service_role;

alter table public.catalog_imports
  add column if not exists source_export_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.catalog_imports'::regclass
      and conname = 'catalog_imports_source_export_id_fkey'
  ) then
    alter table public.catalog_imports
      add constraint catalog_imports_source_export_id_fkey
      foreign key (source_export_id) references public.catalog_export_markers(id);
  end if;
end;
$$;

create or replace function public.start_catalog_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_exported_at timestamptz;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required';
  end if;

  insert into public.catalog_export_markers (company_id, actor)
  values (v_company_id, auth.uid())
  returning id, exported_at into v_id, v_exported_at;

  return jsonb_build_object('export_id', v_id, 'exported_at', v_exported_at);
end;
$$;

revoke execute on function public.start_catalog_export() from anon, public;
grant execute on function public.start_catalog_export() to authenticated;
