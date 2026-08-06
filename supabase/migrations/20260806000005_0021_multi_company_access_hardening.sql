-- 0021_multi_company_access_hardening.sql
-- Company selection is membership + lifecycle state. A disabled/banned
-- company must stop working immediately, including for an access token issued
-- before the platform action. Unapproved companies remain accessible for
-- onboarding; approval controls public/managed rollout separately.

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.companies c
  where c.id = nullif(auth.jwt() ->> 'company_id', '')::uuid
    and c.status in ('unapproved', 'approved')
$$;

revoke execute on function public.current_company_id() from public;
-- Anonymous reads still evaluate tenant RLS policies; the helper safely
-- returns null without a company claim.
grant execute on function public.current_company_id() to anon, authenticated, service_role, supabase_auth_admin;

create or replace function public.is_approved_member(p_company_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and m.authorization_status = 'approved'
      and c.status in ('unapproved', 'approved')
  );
$$;

revoke execute on function public.is_approved_member(uuid, uuid) from anon, public;
grant execute on function public.is_approved_member(uuid, uuid) to authenticated;

create or replace function public.my_companies()
returns table (company_id uuid, name text, code text, role_name text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.code,
    coalesce(r.name, ''),
    up.active_company_id = c.id
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up on up.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and m.authorization_status = 'approved'
    and c.status in ('unapproved', 'approved')
  order by c.name;
$$;

revoke execute on function public.my_companies() from anon, public;
grant execute on function public.my_companies() to authenticated;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  v_claims := v_claims - 'company_id' - 'user_role' - 'is_platform_admin';

  select m.company_id, r.name
    into v_company_id, v_role_name
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  left join public.user_preferences up
    on up.user_id = m.user_id and up.active_company_id = m.company_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
    and c.status in ('unapproved', 'approved')
  order by (up.user_id is not null) desc, m.created_at asc
  limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role_name, '')));
  end if;

  select exists (
    select 1 from public.platform_admins p
    where p.user_id = (event ->> 'user_id')::uuid
  ) into v_is_platform_admin;

  if v_is_platform_admin then
    v_claims := jsonb_set(v_claims, '{is_platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$function$;

revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
