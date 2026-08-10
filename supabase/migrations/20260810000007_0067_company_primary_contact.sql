-- Explicit company primary contact for platform communication and future workflows.

alter table public.companies add column primary_contact_user_id uuid;

update public.companies c set primary_contact_user_id=(
  select m.user_id from public.company_memberships m join public.roles r on r.id=m.role_id
  where m.company_id=c.id and m.authorization_status='approved' and 'ManageTeam'=any(r.permissions)
  order by m.created_at limit 1
);

create or replace function public.set_company_primary_contact(p_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();
begin
  if not public.current_user_has_permission('ManageTeam') then raise exception 'permission_denied: ManageTeam required'; end if;
  if not exists(select 1 from public.company_memberships m join public.roles r on r.id=m.role_id
    where m.company_id=v_company and m.user_id=p_user_id and m.authorization_status='approved'
      and 'ManageTeam'=any(r.permissions)) then raise exception 'primary_contact_must_be_approved_admin'; end if;
  update public.companies set primary_contact_user_id=p_user_id where id=v_company;
  return p_user_id;
end;
$$;
revoke execute on function public.set_company_primary_contact(uuid) from public,anon;
grant execute on function public.set_company_primary_contact(uuid) to authenticated;

create or replace function public.clear_invalid_primary_contact()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    update public.companies set primary_contact_user_id=null
    where id=old.company_id and primary_contact_user_id=old.user_id;
    return old;
  end if;
  if new.authorization_status<>'approved' or not exists(
    select 1 from public.roles r where r.id=new.role_id and 'ManageTeam'=any(r.permissions)
  ) then
    update public.companies set primary_contact_user_id=null
    where id=old.company_id and primary_contact_user_id=old.user_id;
  end if;
  return new;
end;
$$;
create trigger company_membership_primary_contact_guard after update of authorization_status,role_id or delete
  on public.company_memberships for each row execute function public.clear_invalid_primary_contact();

create or replace function public.team_management_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id uuid:=public.current_company_id();v_members jsonb;v_roles jsonb;v_locations jsonb;
  v_assignments jsonb;v_primary uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then raise exception 'permission_denied: ManageTeam required'; end if;
  select primary_contact_user_id into v_primary from public.companies where id=v_company_id;
  select coalesce(jsonb_agg(member order by member->'staff_profile'->>'display_name',member->>'user_id'),'[]') into v_members from (
    select to_jsonb(m)||jsonb_build_object('roles',case when r.id is null then null else jsonb_build_object('name',r.name,'permissions',r.permissions) end,
      'staff_profile',case when p.id is null then null else jsonb_build_object('display_name',p.display_name,'last_role_name',p.last_role_name,'avatar_path',p.avatar_path) end) member
    from public.company_memberships m left join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    left join public.company_staff_profiles p on p.company_id=m.company_id and p.user_id=m.user_id where m.company_id=v_company_id
  ) rows;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name,r.id),'[]') into v_roles from public.roles r where r.company_id=v_company_id and not r.is_template;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.is_default desc,l.name,l.id),'[]') into v_locations from public.stock_locations l where l.company_id=v_company_id and l.is_active;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.membership_id,a.is_primary desc,a.location_id),'[]') into v_assignments from public.company_membership_locations a where a.company_id=v_company_id;
  return jsonb_build_object('company_id',v_company_id,'primary_contact_user_id',v_primary,'members',v_members,'roles',v_roles,
    'locations',v_locations,'membership_locations',v_assignments,'generated_at',now());
end;
$$;

-- Both platform target resolvers already order candidate admins by membership
-- creation. Prefer explicit primary contact before retaining that fallback.
do $$
declare v_name regprocedure;v_definition text;
begin
  foreach v_name in array array[
    'public.platform_campaign_preview(text,text,uuid,text,uuid[])'::regprocedure,
    'public.dispatch_platform_campaign(uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_name) into v_definition;
    v_definition:=replace(v_definition,'ORDER BY m.created_at','ORDER BY (m.user_id = c.primary_contact_user_id) DESC, m.created_at');
    execute v_definition;
  end loop;
end $$;
