-- Re-enabling a disabled membership consumes the same tier capacity as adding one.
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

  select authorization_status into v_current_status
  from public.company_memberships
  where id = p_membership_id and company_id = v_company_id for update;
  if v_current_status is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  if p_authorization_status = 'approved' and v_current_status <> 'approved' then
    perform public.assert_entitled(v_company_id, 'team');
  end if;

  update public.company_memberships
  set role_id = coalesce(p_role_id, role_id),
      authorization_status = coalesce(p_authorization_status, authorization_status),
      updated_at = now()
  where id = p_membership_id and company_id = v_company_id;
  return p_membership_id;
end;
$$;

