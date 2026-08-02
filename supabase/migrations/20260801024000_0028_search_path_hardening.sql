-- 0028_search_path_hardening.sql
-- Lint fix (function_search_path_mutable): pin search_path on the three
-- JWT claim helpers (0001 predates the convention).

create or replace function public.current_company_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'company_id', '')::uuid
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'user_role', '')
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_platform_admin')::boolean, false)
$$;
