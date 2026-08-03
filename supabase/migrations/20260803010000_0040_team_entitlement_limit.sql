-- Complete the existing tier-limit coverage by enforcing maxAdmins on team additions.

create or replace function public.assert_entitled(p_company_id uuid, p_check text default null)
returns void
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_company record;
  v_limits jsonb;
  v_now timestamptz := now();
begin
  select * into v_company from public.companies where id = p_company_id;
  if v_company is null then raise exception 'company_not_found: %', p_company_id; end if;

  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > v_now then
    return;
  end if;
  if v_company.subscription_status not in ('trial', 'active') then
    if not (v_company.subscription_status = 'expired'
      and v_company.subscription_grace_period_end is not null
      and v_company.subscription_grace_period_end > v_now) then
      raise exception 'subscription_expired: renew to continue selling';
    end if;
  end if;
  if p_check is null then return; end if;

  select t.limits into v_limits from public.subscription_tiers t
  where t.id = v_company.subscription_tier_id;
  if v_limits is null then return; end if;

  if p_check = 'order' and (v_limits ->> 'maxOrdersPerMonth') is not null
     and (select count(*) from public.orders o where o.company_id = p_company_id
       and o.created_at >= date_trunc('month', v_now) and o.status <> 'voided')
       >= (v_limits ->> 'maxOrdersPerMonth')::int then
    raise exception 'limit_reached: monthly order limit (%); upgrade your plan',
      v_limits ->> 'maxOrdersPerMonth';
  end if;

  if p_check = 'product' and (v_limits ->> 'maxProducts') is not null
     and (select count(*) from public.product_variants v
       where v.company_id = p_company_id and v.active) >= (v_limits ->> 'maxProducts')::int then
    raise exception 'limit_reached: product limit (%); upgrade your plan', v_limits ->> 'maxProducts';
  end if;

  if p_check = 'team' and (v_limits ->> 'maxAdmins') is not null
     and (select count(*) from public.company_memberships m
       where m.company_id = p_company_id and m.authorization_status = 'approved')
       >= (v_limits ->> 'maxAdmins')::int then
    raise exception 'limit_reached: team member limit (%); upgrade your plan', v_limits ->> 'maxAdmins';
  end if;
end;
$$;

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
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  v_phone := regexp_replace(p_phone, '[^\d]', '', 'g');
  v_phone := case when v_phone like '0%' then '254' || substr(v_phone, 2) else v_phone end;
  select u.id into v_user_id from auth.users u where u.phone = v_phone limit 1;
  if v_user_id is null then
    raise exception 'user_not_registered: % must log in once before being added', p_phone;
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and company_id = v_company_id) then
    raise exception 'role_not_found: %', p_role_id;
  end if;

  if not exists (
    select 1 from public.company_memberships
    where company_id = v_company_id and user_id = v_user_id and authorization_status = 'approved'
  ) then
    perform public.assert_entitled(v_company_id, 'team');
  end if;

  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (v_company_id, v_user_id, p_role_id, 'approved')
  on conflict (company_id, user_id) do update
    set role_id = p_role_id, authorization_status = 'approved', updated_at = now()
  returning id into v_membership_id;
  return v_membership_id;
end;
$$;

