-- 0008_team_admin_guard.sql
-- Prevent a shop from orphaning its team management: the last approved member
-- whose role carries ManageTeam cannot be demoted, disabled, or set pending.
-- Self-removal was already blocked in remove_team_member (0001); this closes
-- the equivalent hole in update_team_member.
create or replace function public.update_team_member(
  p_membership_id uuid,
  p_role_id uuid default null,
  p_authorization_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_current_status text;
  v_current_role_id uuid;
  v_new_role_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  if p_authorization_status is not null
     and p_authorization_status not in ('pending', 'approved', 'disabled') then
    raise exception 'invalid_status';
  end if;
  if p_role_id is not null and not exists (
    select 1 from public.roles where id = p_role_id and company_id = v_company_id
  ) then raise exception 'role_not_found: %', p_role_id; end if;

  select authorization_status, role_id into v_current_status, v_current_role_id
  from public.company_memberships
  where id = p_membership_id and company_id = v_company_id for update;
  if v_current_status is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  v_new_role_id := coalesce(p_role_id, v_current_role_id);

  -- Last-admin guard: if this membership is currently an approved team
  -- manager and the update would strip that (role without ManageTeam or a
  -- non-approved status), require another approved team manager to remain.
  if v_current_status = 'approved'
     and exists (
       select 1 from public.roles
       where id = v_current_role_id and 'ManageTeam' = any(permissions)
     )
     and (
       not exists (
         select 1 from public.roles
         where id = v_new_role_id and 'ManageTeam' = any(permissions)
       )
       or coalesce(p_authorization_status, v_current_status) <> 'approved'
     )
     and not exists (
       select 1
       from public.company_memberships m
       join public.roles r on r.id = m.role_id
       where m.company_id = v_company_id
         and m.id <> p_membership_id
         and m.authorization_status = 'approved'
         and 'ManageTeam' = any(r.permissions)
     ) then
    raise exception 'last_team_admin: keep at least one active member with team management rights';
  end if;

  if p_authorization_status = 'approved' and v_current_status <> 'approved' then
    perform public.assert_entitled(v_company_id, 'team');
  end if;

  update public.company_memberships
  set role_id = v_new_role_id,
      authorization_status = coalesce(p_authorization_status, authorization_status),
      updated_at = now()
  where id = p_membership_id and company_id = v_company_id;
  return p_membership_id;
end;
$$;

revoke execute on function public.update_team_member(uuid, uuid, text) from anon, public;
grant execute on function public.update_team_member(uuid, uuid, text) to authenticated;
