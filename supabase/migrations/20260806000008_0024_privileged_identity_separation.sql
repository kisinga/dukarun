-- 0024_privileged_identity_separation.sql
-- Platform operators and tenant members are deliberately separate auth
-- principals. A platform principal has global read authority; allowing that
-- same principal to enter the tenant app defeats active-company isolation.

create or replace function public.enforce_privileged_identity_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'platform_admins' then
    if exists (
      select 1 from public.company_memberships m where m.user_id = new.user_id
    ) then
      raise exception 'platform_identity_cannot_have_company_memberships';
    end if;
  elsif exists (
    select 1 from public.platform_admins p where p.user_id = new.user_id
  ) then
    raise exception 'tenant_identity_cannot_be_platform_admin';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_privileged_identity_separation() from public, anon, authenticated;

drop trigger if exists platform_admins_identity_separation on public.platform_admins;
create trigger platform_admins_identity_separation
before insert or update of user_id on public.platform_admins
for each row execute function public.enforce_privileged_identity_separation();

drop trigger if exists company_memberships_identity_separation on public.company_memberships;
create trigger company_memberships_identity_separation
before insert or update of user_id on public.company_memberships
for each row execute function public.enforce_privileged_identity_separation();

