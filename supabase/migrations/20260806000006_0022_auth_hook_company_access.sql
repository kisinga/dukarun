-- 0022_auth_hook_company_access.sql
-- Migration 0021 made the token hook validate company lifecycle state. GoTrue
-- invokes that hook as supabase_auth_admin, so the role also needs RLS-safe
-- read access to companies (matching its existing hook access to memberships,
-- roles, preferences, and platform_admins).

grant select on public.companies to supabase_auth_admin;

drop policy if exists "auth admin reads companies for token hook" on public.companies;
create policy "auth admin reads companies for token hook"
  on public.companies for select
  to supabase_auth_admin
  using (true);
