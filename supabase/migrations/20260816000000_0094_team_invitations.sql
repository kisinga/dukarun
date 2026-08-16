-- Team invitations bridge company administration and first-time phone auth.
-- An administrator reserves a seat for a normalized phone number; the owner
-- of that phone claims the invitation after OTP verification.

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone text not null check (phone ~ '^254[17][0-9]{8}$'),
  role_id uuid not null references public.roles(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by uuid not null,
  accepted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create unique index team_invitations_one_pending_phone_idx
  on public.team_invitations(company_id, phone)
  where status = 'pending';
create index team_invitations_phone_pending_idx
  on public.team_invitations(phone, created_at)
  where status = 'pending';
create index team_invitations_company_pending_idx
  on public.team_invitations(company_id, created_at)
  where status = 'pending';

alter table public.team_invitations enable row level security;
grant all on public.team_invitations to service_role;

-- Company deletion cascades child rows after the parent is no longer visible
-- to their AFTER DELETE triggers. Do not recreate a cache stream for a tenant
-- that is being removed.
create or replace function public.cache_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_company_id uuid;
  v_entity_id text;
  v_location_id uuid;
  v_user_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_company_id := nullif(v_row ->> 'company_id', '')::uuid;
  if v_company_id is null
     or not exists (select 1 from public.companies c where c.id = v_company_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_entity_id := v_row ->> coalesce(nullif(tg_argv[2], ''), 'id');
  if coalesce(tg_nargs, 0) > 3 and nullif(tg_argv[3], '') is not null then
    v_location_id := nullif(v_row ->> tg_argv[3], '')::uuid;
  end if;
  if coalesce(tg_nargs, 0) > 4 and nullif(tg_argv[4], '') is not null then
    v_user_id := nullif(v_row ->> tg_argv[4], '')::uuid;
  end if;
  perform public.emit_cache_change(
    v_company_id, tg_argv[0], tg_argv[1], v_entity_id,
    case
      when coalesce(tg_nargs, 0) > 5 and tg_argv[5] = 'upsert' then 'upsert'
      when tg_op = 'DELETE' then 'delete'
      else 'upsert'
    end,
    v_location_id, v_user_id
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.cache_change_trigger() from public, anon, authenticated;

create trigger team_invitations_audit
  after insert or update or delete on public.team_invitations
  for each row execute function public.audit_trigger();

create trigger team_invitations_cache_change
  after insert or update or delete on public.team_invitations
  for each row execute function public.cache_change_trigger('team', 'invitation', 'id');

create or replace function public.normalize_team_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_phone ~ '^0[17][0-9]{8}$' then
    v_phone := '254' || substr(v_phone, 2);
  elsif v_phone ~ '^[17][0-9]{8}$' then
    v_phone := '254' || v_phone;
  end if;
  if v_phone !~ '^254[17][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  return v_phone;
end;
$$;

revoke execute on function public.normalize_team_phone(text) from public, anon, authenticated;

create or replace function public.assert_team_invitation_capacity(
  p_company_id uuid,
  p_exclude_phone text default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_members integer;
  v_pending integer;
begin
  select t.max_team_members into v_limit
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id;

  if v_limit is null then return; end if;

  select
    (select count(*) from public.company_memberships m
      where m.company_id = p_company_id and m.authorization_status = 'approved'),
    (select count(*) from public.team_invitations i
      where i.company_id = p_company_id
        and i.status = 'pending'
        and i.expires_at > now()
        and (p_exclude_phone is null or i.phone <> p_exclude_phone))
  into v_members, v_pending;
  v_used := v_members + v_pending;

  if v_used >= v_limit then
    if v_pending > 0 then
      raise exception 'limit_reached: team member limit (%); cancel an invitation or upgrade your plan',
        v_limit;
    end if;
    raise exception 'limit_reached: team member limit (%); upgrade your plan', v_limit;
  end if;
end;
$$;

revoke execute on function public.assert_team_invitation_capacity(uuid, text)
  from public, anon, authenticated;

create or replace function public.invite_team_member(
  p_phone text,
  p_role_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_phone text;
  v_name text := trim(coalesce(p_display_name, ''));
  v_user_id uuid;
  v_membership_id uuid;
  v_invitation_id uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);
  if length(v_name) not between 1 and 120 then raise exception 'invalid_display_name'; end if;
  if not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.company_id = v_company_id and not r.is_template
  ) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  v_phone := public.normalize_team_phone(p_phone);
  perform 1 from public.companies c where c.id = v_company_id for update;

  -- Reassigning a person who is already a member remains immediate. Everyone
  -- else must prove phone ownership by claiming an invitation after OTP login.
  select u.id into v_user_id
  from auth.users u
  join public.company_memberships m
    on m.user_id = u.id and m.company_id = v_company_id
  where regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_phone
  limit 1;

  if v_user_id is not null then
    select m.id into v_membership_id
    from public.company_memberships m
    where m.company_id = v_company_id and m.user_id = v_user_id;

    if not exists (
      select 1 from public.company_memberships m
      where m.id = v_membership_id and m.authorization_status = 'approved'
    ) then
      perform public.assert_team_invitation_capacity(v_company_id, v_phone);
    end if;

    update public.company_memberships
    set role_id = p_role_id, authorization_status = 'approved', updated_at = now()
    where id = v_membership_id;
    update public.company_staff_profiles
    set display_name = v_name, updated_at = now()
    where company_id = v_company_id and user_id = v_user_id;
    update public.team_invitations
    set status = 'cancelled', updated_at = now()
    where company_id = v_company_id and phone = v_phone and status = 'pending';
    return jsonb_build_object('status', 'updated', 'membership_id', v_membership_id);
  end if;

  select i.id into v_invitation_id
  from public.team_invitations i
  where i.company_id = v_company_id and i.phone = v_phone and i.status = 'pending'
  for update;

  if v_invitation_id is null then
    perform public.assert_team_invitation_capacity(v_company_id, null);
    insert into public.team_invitations(
      company_id, phone, role_id, display_name, invited_by
    ) values (
      v_company_id, v_phone, p_role_id, v_name, auth.uid()
    ) returning id into v_invitation_id;
  else
    if not exists (
      select 1 from public.team_invitations i
      where i.id = v_invitation_id and i.expires_at > now()
    ) then
      perform public.assert_team_invitation_capacity(v_company_id, v_phone);
    end if;
    update public.team_invitations
    set role_id = p_role_id,
        display_name = v_name,
        invited_by = auth.uid(),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where id = v_invitation_id;
  end if;

  return jsonb_build_object(
    'status', 'invited',
    'invitation_id', v_invitation_id,
    'expires_at', (select expires_at from public.team_invitations where id = v_invitation_id)
  );
end;
$$;

revoke execute on function public.invite_team_member(text, uuid, text) from public, anon;
grant execute on function public.invite_team_member(text, uuid, text) to authenticated, service_role;

-- Keep cached clients safe during rollout: the legacy call only handles an
-- already-verified auth user, but now shares the company lock and invitation-
-- aware capacity check. A matching invitation is consumed as the same seat.
create or replace function public.add_team_member(p_phone text, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid;
  v_membership_id uuid;
  v_phone text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);
  if not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.company_id = v_company_id and not r.is_template
  ) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  v_phone := public.normalize_team_phone(p_phone);
  perform 1 from public.companies c where c.id = v_company_id for update;
  select u.id into v_user_id
  from auth.users u
  where regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_phone
  limit 1;
  if v_user_id is null then
    raise exception 'user_not_registered: % must log in once before being added', p_phone;
  end if;

  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = v_company_id
      and m.user_id = v_user_id
      and m.authorization_status = 'approved'
  ) then
    perform public.assert_team_invitation_capacity(v_company_id, v_phone);
  end if;

  insert into public.company_memberships(company_id, user_id, role_id, authorization_status)
  values(v_company_id, v_user_id, p_role_id, 'approved')
  on conflict(company_id, user_id) do update
  set role_id = excluded.role_id,
      authorization_status = 'approved',
      updated_at = now()
  returning id into v_membership_id;

  update public.team_invitations
  set status = 'cancelled', updated_at = now()
  where company_id = v_company_id and phone = v_phone and status = 'pending';
  return v_membership_id;
end;
$$;

revoke execute on function public.add_team_member(text, uuid) from public, anon;
grant execute on function public.add_team_member(text, uuid) to authenticated;

-- Re-enabling a disabled membership also consumes a reserved team seat. Lock
-- the company first so every capacity-changing path uses one lock order.
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

  perform 1 from public.companies c where c.id = v_company_id for update;
  select authorization_status, role_id into v_current_status, v_current_role_id
  from public.company_memberships
  where id = p_membership_id and company_id = v_company_id for update;
  if v_current_status is null then raise exception 'membership_not_found: %', p_membership_id; end if;

  v_new_role_id := coalesce(p_role_id, v_current_role_id);
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
    perform public.assert_team_invitation_capacity(v_company_id, null);
  end if;

  update public.company_memberships
  set role_id = v_new_role_id,
      authorization_status = coalesce(p_authorization_status, authorization_status),
      updated_at = now()
  where id = p_membership_id and company_id = v_company_id;
  return p_membership_id;
end;
$$;

create or replace function public.cancel_team_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  update public.team_invitations
  set status = 'cancelled', updated_at = now()
  where id = p_invitation_id and company_id = v_company_id and status = 'pending'
  returning id into v_id;
  if v_id is null then raise exception 'invitation_not_found: %', p_invitation_id; end if;
  return v_id;
end;
$$;

revoke execute on function public.cancel_team_invitation(uuid) from public, anon;
grant execute on function public.cancel_team_invitation(uuid) to authenticated, service_role;

create or replace function public.claim_team_invitations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_invitation record;
  v_first_company_id uuid;
  v_claimed integer := 0;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select public.normalize_team_phone(u.phone) into v_phone
  from auth.users u where u.id = v_user_id and u.phone_confirmed_at is not null;
  if v_phone is null then
    return jsonb_build_object('claimed_count', 0, 'company_id', null);
  end if;

  update public.team_invitations
  set status = 'expired', updated_at = now()
  where phone = v_phone and status = 'pending' and expires_at <= now();

  -- invite_team_member locks company then invitation. Pre-lock every matching
  -- company in a stable order before locking invitations to prevent deadlocks.
  perform c.id
  from public.companies c
  where c.status = 'approved'
    and exists (
      select 1 from public.team_invitations i
      where i.company_id = c.id
        and i.phone = v_phone
        and i.status = 'pending'
        and i.expires_at > now()
    )
  order by c.id
  for update;

  for v_invitation in
    select i.*
    from public.team_invitations i
    join public.companies c on c.id = i.company_id and c.status = 'approved'
    where i.phone = v_phone and i.status = 'pending' and i.expires_at > now()
    order by i.created_at, i.id
    for update of i
  loop
    if not exists (
      select 1 from public.company_memberships m
      where m.company_id = v_invitation.company_id
        and m.user_id = v_user_id
        and m.authorization_status = 'approved'
    ) then
      perform public.assert_team_invitation_capacity(v_invitation.company_id, v_phone);
    end if;

    insert into public.company_memberships(company_id, user_id, role_id, authorization_status)
    values(v_invitation.company_id, v_user_id, v_invitation.role_id, 'approved')
    on conflict(company_id, user_id) do update
    set role_id = excluded.role_id,
        authorization_status = 'approved',
        updated_at = now();

    insert into public.company_staff_profiles(company_id, user_id, display_name)
    values(v_invitation.company_id, v_user_id, v_invitation.display_name)
    on conflict(company_id, user_id) do update
    set display_name = excluded.display_name, updated_at = now();

    update public.team_invitations
    set status = 'accepted', accepted_by = v_user_id, accepted_at = now(), updated_at = now()
    where id = v_invitation.id;

    v_first_company_id := coalesce(v_first_company_id, v_invitation.company_id);
    v_claimed := v_claimed + 1;
  end loop;

  if v_first_company_id is not null and not exists (
    select 1
    from public.user_preferences p
    join public.company_memberships m
      on m.user_id = p.user_id and m.company_id = p.active_company_id
    join public.companies c on c.id = m.company_id
    where p.user_id = v_user_id
      and m.authorization_status = 'approved'
      and c.status = 'approved'
  ) then
    insert into public.user_preferences(user_id, active_company_id)
    values(v_user_id, v_first_company_id)
    on conflict(user_id) do update
    set active_company_id = excluded.active_company_id, updated_at = now();
  end if;

  return jsonb_build_object('claimed_count', v_claimed, 'company_id', v_first_company_id);
end;
$$;

revoke execute on function public.claim_team_invitations() from public, anon;
grant execute on function public.claim_team_invitations() to authenticated, service_role;

create or replace function public.team_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_members jsonb;
  v_invitations jsonb;
  v_roles jsonb;
  v_locations jsonb;
  v_assignments jsonb;
  v_primary uuid;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select primary_contact_user_id into v_primary from public.companies where id = v_company_id;
  select coalesce(jsonb_agg(member order by member->'staff_profile'->>'display_name', member->>'user_id'), '[]')
  into v_members from (
    select to_jsonb(m) || jsonb_build_object(
      'roles', case when r.id is null then null else jsonb_build_object('name', r.name, 'permissions', r.permissions) end,
      'staff_profile', case when p.id is null then null else jsonb_build_object(
        'display_name', p.display_name, 'last_role_name', p.last_role_name, 'avatar_path', p.avatar_path
      ) end
    ) member
    from public.company_memberships m
    left join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    left join public.company_staff_profiles p on p.company_id = m.company_id and p.user_id = m.user_id
    where m.company_id = v_company_id
  ) rows;
  select coalesce(jsonb_agg(invitation order by invitation->>'display_name', invitation->>'created_at'), '[]')
  into v_invitations from (
    select jsonb_build_object(
      'id', i.id,
      'phone', '+' || i.phone,
      'display_name', i.display_name,
      'role_id', i.role_id,
      'role_name', r.name,
      'created_at', i.created_at,
      'expires_at', i.expires_at
    ) invitation
    from public.team_invitations i
    join public.roles r on r.id = i.role_id and r.company_id = i.company_id
    where i.company_id = v_company_id and i.status = 'pending' and i.expires_at > now()
  ) rows;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.name, r.id), '[]') into v_roles
  from public.roles r where r.company_id = v_company_id and not r.is_template;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.is_default desc, l.name, l.id), '[]') into v_locations
  from public.stock_locations l where l.company_id = v_company_id and l.is_active;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.membership_id, a.is_primary desc, a.location_id), '[]') into v_assignments
  from public.company_membership_locations a where a.company_id = v_company_id;
  return jsonb_build_object(
    'company_id', v_company_id,
    'primary_contact_user_id', v_primary,
    'members', v_members,
    'invitations', v_invitations,
    'roles', v_roles,
    'locations', v_locations,
    'membership_locations', v_assignments,
    'generated_at', now()
  );
end;
$$;
