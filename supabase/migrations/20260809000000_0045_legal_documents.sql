-- Versioned legal documents and company-level Terms acceptance.
--
-- Documents are created and published through super-admin. This migration does
-- not seed content, so an unreviewed draft cannot be mistaken for a release.

create or replace function public.is_valid_legal_document_version(p_version text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_version !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform pg_catalog.make_date(
    substring(p_version, 1, 4)::integer,
    substring(p_version, 6, 2)::integer,
    substring(p_version, 9, 2)::integer
  );
  return true;
exception when others then
  return false;
end;
$$;

create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_type text not null
    check (document_type in ('privacy', 'terms', 'dpa', 'subprocessors')),
  version text not null check (public.is_valid_legal_document_version(version)),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz not null,
  enforcement_at timestamptz,
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'published', 'superseded')),
  requires_company_acceptance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, version),
  check (not requires_company_acceptance or document_type = 'terms'),
  check (enforcement_at is null or enforcement_at >= effective_at)
);

create unique index legal_document_one_published_type_idx
  on public.legal_document_versions (document_type)
  where publication_state = 'published';

create table public.company_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  document_version_id uuid not null references public.legal_document_versions(id),
  accepted_by uuid not null,
  source text not null check (source in ('registration', 'account')),
  accepted_at timestamptz not null default now(),
  unique (company_id, document_version_id)
);

create index company_legal_acceptances_company_idx
  on public.company_legal_acceptances (company_id, accepted_at desc);

create or replace function public.prevent_legal_acceptance_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'legal_acceptances_are_immutable';
end;
$$;

create trigger company_legal_acceptances_immutable
before update or delete on public.company_legal_acceptances
for each row execute function public.prevent_legal_acceptance_mutation();

alter table public.legal_document_versions enable row level security;
alter table public.company_legal_acceptances enable row level security;

create policy "published legal metadata is public"
  on public.legal_document_versions for select
  using (publication_state = 'published' or (select public.is_platform_admin()));

create policy "company legal acceptances are tenant visible"
  on public.company_legal_acceptances for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );

grant select on public.legal_document_versions to anon, authenticated;
grant select on public.company_legal_acceptances to authenticated;
grant all on public.legal_document_versions, public.company_legal_acceptances to service_role;

-- Legal and approval status must remain reachable when normal tenant scope is
-- blocked. This private helper reads a valid claimed company without granting
-- that company normal tenant scope.
create or replace function public.current_company_id_unchecked()
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

create or replace function public.user_has_company_permission_unchecked(
  p_company_id uuid,
  p_permission text
)
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
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.authorization_status = 'approved'
      and p_permission = any(r.permissions)
  )
$$;

create or replace function public.latest_required_company_terms()
returns setof public.legal_document_versions
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.legal_document_versions d
  where d.document_type = 'terms'
    and d.publication_state in ('published', 'superseded')
    and d.requires_company_acceptance
    and d.effective_at <= now()
  order by d.version desc, d.effective_at desc, d.created_at desc
  limit 1
$$;

create or replace function public.current_published_company_terms()
returns setof public.legal_document_versions
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.legal_document_versions d
  where d.document_type = 'terms'
    and d.publication_state = 'published'
    and d.effective_at <= now()
  order by d.version desc, d.effective_at desc, d.created_at desc
  limit 1
$$;

create or replace function public.company_has_terms_acceptance_at_or_after(
  p_company_id uuid,
  p_required_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_legal_acceptances a
    join public.legal_document_versions accepted on accepted.id = a.document_version_id
    where a.company_id = p_company_id
      and accepted.document_type = 'terms'
      and accepted.version >= p_required_version
  )
$$;

create or replace function public.company_terms_access_allowed(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.latest_required_company_terms() d
    where (d.enforcement_at is null or d.enforcement_at <= now())
      and not public.company_has_terms_acceptance_at_or_after(
        p_company_id,
        d.version
      )
  )
$$;

revoke execute on function public.current_company_id_unchecked() from public, anon, authenticated;
revoke execute on function public.user_has_company_permission_unchecked(uuid, text) from public, anon, authenticated;
revoke execute on function public.latest_required_company_terms() from public, anon, authenticated;
revoke execute on function public.current_published_company_terms() from public, anon, authenticated;
revoke execute on function public.company_has_terms_acceptance_at_or_after(uuid, text) from public, anon, authenticated;
revoke execute on function public.company_terms_access_allowed(uuid) from public, anon, authenticated;

-- Every tenant RLS policy and business RPC resolves its scope through this
-- function. Returning no scope after enforcement blocks direct API clients as
-- well as the web application until the current Terms are accepted.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.companies c
  where c.id = public.current_company_id_unchecked()
    and c.status = 'approved'
    and (
      public.is_platform_admin()
      or public.company_terms_access_allowed(c.id)
    )
$$;

create or replace function public.current_company_legal_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id_unchecked();
  v_company_status text;
  v_required_document public.legal_document_versions%rowtype;
  v_current_document public.legal_document_versions%rowtype;
  v_accepted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_company_id is null then
    select c.id, c.status into v_company_id, v_company_status
    from public.company_memberships m
    join public.companies c on c.id = m.company_id
    where m.user_id = auth.uid()
      and m.authorization_status = 'approved'
      and c.status = 'unapproved'
    order by c.created_at desc
    limit 1;
    if v_company_id is null then
      return jsonb_build_object(
        'required', false, 'accepted', true, 'can_accept', false, 'company_status', null
      );
    end if;
  else
    select c.status into v_company_status from public.companies c where c.id = v_company_id;
  end if;

  if v_company_status = 'unapproved' then
    return jsonb_build_object(
      'required', false, 'accepted', true, 'can_accept', false,
      'company_status', v_company_status
    );
  end if;

  select * into v_required_document
  from public.latest_required_company_terms();

  if v_required_document.id is null then
    return jsonb_build_object(
      'required', false, 'accepted', true, 'can_accept', false,
      'company_status', v_company_status
    );
  end if;

  select * into v_current_document
  from public.current_published_company_terms();

  if v_current_document.id is null or v_current_document.version < v_required_document.version then
    v_current_document := v_required_document;
  end if;

  select a.accepted_at into v_accepted_at
  from public.company_legal_acceptances a
  join public.legal_document_versions accepted on accepted.id = a.document_version_id
  where a.company_id = v_company_id
    and accepted.document_type = 'terms'
    and accepted.version >= v_required_document.version
  order by a.accepted_at desc
  limit 1;

  return jsonb_build_object(
    'required', true,
    'accepted', v_accepted_at is not null,
    'can_accept', public.user_has_company_permission_unchecked(v_company_id, 'ManageTeam'),
    'company_status', v_company_status,
    'document_type', v_current_document.document_type,
    'required_version', v_required_document.version,
    'version', v_current_document.version,
    'content_sha256', v_current_document.content_sha256,
    'effective_at', v_current_document.effective_at,
    'enforcement_at', v_required_document.enforcement_at,
    'enforcement_started', v_required_document.enforcement_at is null or now() >= v_required_document.enforcement_at,
    'accepted_at', v_accepted_at
  );
end;
$$;

revoke execute on function public.current_company_legal_status() from public, anon;
grant execute on function public.current_company_legal_status() to authenticated;

create or replace function public.accept_company_terms(
  p_version text,
  p_content_sha256 text,
  p_source text default 'account'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id_unchecked();
  v_required_version text;
  v_document_id uuid;
  v_acceptance_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_company_id is null then raise exception 'company_context_required'; end if;
  if p_source <> 'account' then raise exception 'invalid_acceptance_source'; end if;
  if not public.user_has_company_permission_unchecked(v_company_id, 'ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;

  select version into v_required_version
  from public.latest_required_company_terms();

  select id into v_document_id
  from public.current_published_company_terms()
  where version = p_version
    and content_sha256 = lower(p_content_sha256)
    and version >= v_required_version;

  if v_document_id is null then raise exception 'legal_document_mismatch'; end if;

  insert into public.company_legal_acceptances (
    company_id, document_version_id, accepted_by, source
  ) values (v_company_id, v_document_id, auth.uid(), 'account')
  on conflict (company_id, document_version_id) do nothing
  returning id into v_acceptance_id;

  if v_acceptance_id is null then
    select id into v_acceptance_id
    from public.company_legal_acceptances
    where company_id = v_company_id and document_version_id = v_document_id;
  end if;
  return v_acceptance_id;
end;
$$;

revoke execute on function public.accept_company_terms(text, text, text) from public, anon;
grant execute on function public.accept_company_terms(text, text, text) to authenticated;

create or replace function public.provision_company_with_terms(
  p_company_name text,
  p_store_name text default 'Main Store',
  p_currency text default 'KES',
  p_email text default null,
  p_address text default null,
  p_trial_tier_code text default null,
  p_terms_version text default null,
  p_terms_content_sha256 text default null,
  p_owner_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_document_id uuid;
  v_owner_name text := nullif(trim(coalesce(p_owner_name, '')), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_owner_name is not null and (v_owner_name is null or length(v_owner_name) > 120) then
    raise exception 'invalid_owner_name';
  end if;

  select id into v_document_id
  from public.legal_document_versions
  where document_type = 'terms'
    and publication_state = 'published'
    and effective_at <= now()
    and version = p_terms_version
    and content_sha256 = lower(p_terms_content_sha256);

  if v_document_id is null then raise exception 'legal_document_mismatch'; end if;

  v_company_id := public.provision_company(
    p_company_name, p_store_name, p_currency, p_email, p_address, p_trial_tier_code
  );

  if v_owner_name is not null then
    insert into public.company_staff_profiles (company_id, user_id, display_name)
    values (v_company_id, auth.uid(), v_owner_name)
    on conflict (company_id, user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
  end if;

  insert into public.company_legal_acceptances (
    company_id, document_version_id, accepted_by, source
  ) values (v_company_id, v_document_id, auth.uid(), 'registration');

  return v_company_id;
end;
$$;

revoke execute on function public.provision_company_with_terms(
  text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.provision_company_with_terms(
  text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.platform_company_legal_status()
returns table (
  company_id uuid,
  company_name text,
  terms_version text,
  legal_status text,
  accepted_at timestamptz,
  accepted_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  with current_terms as (
    select d.id, d.version, d.enforcement_at
    from public.latest_required_company_terms() d
  )
  select c.id, c.name, d.version,
    case
      when d.id is null then 'not_required'
      when a.accepted_at is not null then 'accepted'
      when d.enforcement_at is null or now() >= d.enforcement_at then 'blocked'
      else 'grace_period'
    end,
    a.accepted_at,
    a.accepted_by
  from public.companies c
  left join current_terms d on true
  left join lateral (
    select acceptance.accepted_at, acceptance.accepted_by
    from public.company_legal_acceptances acceptance
    join public.legal_document_versions accepted
      on accepted.id = acceptance.document_version_id
    where acceptance.company_id = c.id
      and accepted.document_type = 'terms'
      and accepted.version >= d.version
    order by acceptance.accepted_at desc
    limit 1
  ) a on true
  order by c.created_at desc;
end;
$$;

revoke execute on function public.platform_company_legal_status() from public, anon;
grant execute on function public.platform_company_legal_status() to authenticated, service_role;

-- Registration must use the atomic Terms-aware function. The internal function
-- remains available to service_role and to the wrapper running as its owner.
revoke execute on function public.provision_company(
  text, text, text, text, text, text
) from authenticated;
grant execute on function public.provision_company(
  text, text, text, text, text, text
) to service_role;
