-- Non-blocking shell navigation and durable Team snapshot support.

-- Role claims identify the login context but can outlive a role reassignment.
-- Permission enforcement must read the current approved membership so a
-- revocation takes effect without waiting for the next token refresh.
create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    where m.company_id = (select public.current_company_id())
      and m.user_id = auth.uid()
      and m.authorization_status = 'approved'
      and p_permission = any(r.permissions)
  )
$$;

create or replace function public.current_access_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_permissions text[] := '{}'::text[];
  v_reversal text;
  v_overdraft text;
  v_customer_credit text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce(r.permissions, '{}'::text[])
  into v_permissions
  from public.company_memberships m
  join public.roles r on r.id = m.role_id and r.company_id = m.company_id
  where m.company_id = v_company_id
    and m.user_id = auth.uid()
    and m.authorization_status = 'approved';
  v_permissions := coalesce(v_permissions, '{}'::text[]);
  v_reversal := case when 'ReverseOrder' = any(v_permissions) then 'execute'
    when 'SettleOrder' = any(v_permissions) then 'request' else 'blocked' end;
  v_overdraft := case when 'ApproveCustomerCredit' = any(v_permissions) then 'execute'
    when 'SettleOrder' = any(v_permissions) then 'request' else 'blocked' end;
  v_customer_credit := case when 'ManageCustomerCreditLimit' = any(v_permissions) then 'execute'
    when 'ManageCustomers' = any(v_permissions) then 'request' else 'blocked' end;
  return jsonb_build_object(
    'company_id', v_company_id,
    'user_id', auth.uid(),
    'permissions', to_jsonb(v_permissions),
    'actions', jsonb_build_object(
      'sale.void', v_reversal,
      'sale.refund', v_reversal,
      'payment.reverse', v_reversal,
      'sale.credit_over_limit', v_overdraft,
      'customer.credit.update', v_customer_credit
    )
  );
end;
$$;

revoke execute on function public.current_access_snapshot() from public, anon;
grant execute on function public.current_access_snapshot() to authenticated;

-- One authoritative read replaces the Team page's memberships/profile, roles,
-- active locations, and membership-location fan-out. The explicit permission
-- check is required because SECURITY DEFINER bypasses the underlying RLS.
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
  v_roles jsonb;
  v_locations jsonb;
  v_assignments jsonb;
begin
  if v_company_id is null or auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select coalesce(jsonb_agg(member order by member -> 'staff_profile' ->> 'display_name', member ->> 'user_id'), '[]'::jsonb)
  into v_members
  from (
    select to_jsonb(m) || jsonb_build_object(
      'roles', case when r.id is null then null else jsonb_build_object(
        'name', r.name,
        'permissions', r.permissions
      ) end,
      'staff_profile', case when p.id is null then null else jsonb_build_object(
        'display_name', p.display_name,
        'last_role_name', p.last_role_name,
        'avatar_path', p.avatar_path
      ) end
    ) as member
    from public.company_memberships m
    left join public.roles r
      on r.id = m.role_id and r.company_id = m.company_id
    left join public.company_staff_profiles p
      on p.company_id = m.company_id and p.user_id = m.user_id
    where m.company_id = v_company_id
  ) rows;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.name, r.id), '[]'::jsonb)
  into v_roles
  from public.roles r
  where r.company_id = v_company_id and not r.is_template;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.is_default desc, l.name, l.id), '[]'::jsonb)
  into v_locations
  from public.stock_locations l
  where l.company_id = v_company_id and l.is_active;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.membership_id, a.is_primary desc, a.location_id), '[]'::jsonb)
  into v_assignments
  from public.company_membership_locations a
  where a.company_id = v_company_id;

  return jsonb_build_object(
    'company_id', v_company_id,
    'members', v_members,
    'roles', v_roles,
    'locations', v_locations,
    'membership_locations', v_assignments,
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.team_management_snapshot() from public, anon;
grant execute on function public.team_management_snapshot() to authenticated, service_role;

-- These tables are part of the consolidated Team projection and must wake its
-- durable journal consumer just like roles and memberships already do.
create trigger staff_profiles_team_cache_change
after insert or update or delete on public.company_staff_profiles
for each row execute function public.cache_change_trigger('team', 'staff_profile', 'user_id');

create trigger membership_locations_team_cache_change
after insert or update or delete on public.company_membership_locations
for each row execute function public.cache_change_trigger(
  'team', 'membership_location', 'membership_id', 'location_id', '', 'upsert'
);

-- Legal status is company-scoped in the client cache. Acceptance changes only
-- one company; publishing/superseding a document can affect every company.
-- Legal releases are rare and this transactional fan-out gives every company
-- an ordered, reconnect-safe event in its existing settings stream.
create or replace function public.legal_document_cache_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if tg_op = 'INSERT' and new.publication_state <> 'published' then return new; end if;
  if tg_op = 'UPDATE'
     and new.publication_state = old.publication_state
     and new.effective_at = old.effective_at
     and new.enforcement_at is not distinct from old.enforcement_at
     and new.requires_company_acceptance = old.requires_company_acceptance then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.publication_state <> 'published'
     and old.publication_state <> 'published' then return new; end if;

  for v_company_id in select c.id from public.companies c loop
    perform public.emit_cache_change(
      v_company_id,
      'settings',
      'legal_document',
      new.id::text,
      'upsert'
    );
  end loop;
  return new;
end;
$$;

revoke execute on function public.legal_document_cache_change_trigger()
  from public, anon, authenticated;

create trigger legal_documents_cache_change
after insert or update on public.legal_document_versions
for each row execute function public.legal_document_cache_change_trigger();

create trigger legal_acceptances_cache_change
after insert on public.company_legal_acceptances
for each row execute function public.cache_change_trigger(
  'settings', 'legal_acceptance', 'document_version_id'
);
