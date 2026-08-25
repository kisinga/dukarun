-- Customer-requested trial access.
--
-- Access remains enforced by the existing companies.subscription_exempt_until
-- field. This table only adds a request/review workflow around that exemption.

create table public.trial_access_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_days integer not null check (requested_days between 1 and 30),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decision_note text,
  granted_until timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_access_decision_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved','rejected','cancelled') and reviewed_at is not null)
  ),
  constraint trial_access_grant_consistent check (
    (status = 'approved' and granted_until is not null)
    or (status <> 'approved' and granted_until is null)
  )
);

create unique index trial_access_one_pending_company_idx
  on public.trial_access_requests(company_id)
  where status = 'pending';
create index trial_access_requests_company_time_idx
  on public.trial_access_requests(company_id, created_at desc);
create index trial_access_requests_status_time_idx
  on public.trial_access_requests(status, created_at desc);

alter table public.trial_access_requests enable row level security;

create policy "company members read own trial requests"
  on public.trial_access_requests for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.trial_access_requests to authenticated;
grant all on public.trial_access_requests to service_role;

create trigger trial_access_requests_audit
  after insert or update or delete on public.trial_access_requests
  for each row execute function public.audit_trigger();

create or replace function public.request_trial_access(
  p_requested_days integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_requested_days not between 1 and 30 then raise exception 'invalid_trial_days'; end if;
  if length(v_reason) not between 10 and 1000 then raise exception 'trial_reason_required'; end if;

  select * into v_company
  from public.companies
  where id = public.current_company_id()
  for update;
  if v_company.id is null then raise exception 'company_not_found'; end if;
  if v_company.status <> 'approved' then raise exception 'company_not_approved'; end if;
  if v_company.subscription_exempt_until is not null and v_company.subscription_exempt_until > now() then
    raise exception 'trial_access_already_available';
  end if;
  if v_company.subscription_status = 'active'
     and v_company.subscription_expires_at is not null
     and v_company.subscription_expires_at > now() then
    raise exception 'subscription_already_active';
  end if;
  if v_company.subscription_status = 'expired'
     and v_company.subscription_grace_period_end is not null
     and v_company.subscription_grace_period_end > now() then
    raise exception 'subscription_grace_period_active';
  end if;
  if exists (
    select 1 from public.trial_access_requests
    where company_id = v_company.id and status = 'pending'
  ) then
    raise exception 'trial_request_already_pending';
  end if;

  insert into public.trial_access_requests(company_id, requested_by, requested_days, reason)
  values (v_company.id, auth.uid(), p_requested_days, v_reason)
  returning id into v_request_id;

  return v_request_id;
exception when unique_violation then
  raise exception 'trial_request_already_pending';
end;
$$;

revoke execute on function public.request_trial_access(integer,text) from public, anon;
grant execute on function public.request_trial_access(integer,text) to authenticated;

create or replace function public.current_trial_access_request()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(r)
  from (
    select id, company_id, requested_days, reason, status, decision_note, granted_until,
      reviewed_at, created_at, updated_at
    from public.trial_access_requests
    where company_id = public.current_company_id()
    order by
      case status when 'pending' then 0 when 'approved' then 1 else 2 end,
      created_at desc
    limit 1
  ) r
$$;

revoke execute on function public.current_trial_access_request() from public, anon;
grant execute on function public.current_trial_access_request() to authenticated;

create or replace function public.platform_trial_access_requests(
  p_status text default 'pending',
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  if p_status is not null and p_status not in ('pending','approved','rejected','cancelled') then
    raise exception 'invalid_trial_request_status';
  end if;
  if p_limit not between 1 and 200 then raise exception 'invalid_trial_request_limit'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'company_id', r.company_id,
      'company_name', c.name,
      'company_code', c.code,
      'company_status', c.status,
      'subscription_status', c.subscription_status,
      'subscription_exempt_until', c.subscription_exempt_until,
      'subscription_tier_name', t.name,
      'subscription_tier_code', t.code,
      'requested_days', r.requested_days,
      'reason', r.reason,
      'status', r.status,
      'decision_note', r.decision_note,
      'granted_until', r.granted_until,
      'reviewed_at', r.reviewed_at,
      'created_at', r.created_at
    ) order by r.created_at desc)
    from (
      select *
      from public.trial_access_requests
      where p_status is null or status = p_status
      order by created_at desc
      limit p_limit
    ) r
    join public.companies c on c.id = r.company_id
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.platform_trial_access_requests(text,integer) from public, anon;
grant execute on function public.platform_trial_access_requests(text,integer) to authenticated, service_role;

create or replace function public.platform_review_trial_access_request(
  p_request_id uuid,
  p_decision text,
  p_tier_id uuid default null,
  p_granted_until timestamptz default null,
  p_decision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.trial_access_requests%rowtype;
  v_note text := nullif(trim(coalesce(p_decision_note, '')), '');
  v_exempt_reason text;
begin
  perform public.assert_platform_admin();
  if p_decision not in ('approved','rejected') then raise exception 'invalid_trial_decision'; end if;

  select * into v_request
  from public.trial_access_requests
  where id = p_request_id
  for update;
  if v_request.id is null then raise exception 'trial_request_not_found: %', p_request_id; end if;
  if v_request.status <> 'pending' then raise exception 'trial_request_already_reviewed'; end if;

  if p_decision = 'approved' then
    if p_tier_id is null then raise exception 'trial_tier_required'; end if;
    if p_granted_until is null or p_granted_until <= now() then
      raise exception 'trial_grant_must_be_future';
    end if;
    if p_granted_until > now() + interval '90 days' then
      raise exception 'trial_grant_too_long';
    end if;
    if not exists (
      select 1 from public.subscription_tiers where id = p_tier_id and is_active
    ) then raise exception 'trial_tier_not_active'; end if;

    v_exempt_reason := left(
      'trial_request:' || p_request_id::text || coalesce(' ' || v_note, ''),
      500
    );

    update public.companies
    set subscription_tier_id = p_tier_id,
        subscription_exempt_until = p_granted_until,
        subscription_exempt_reason = v_exempt_reason,
        updated_at = now()
    where id = v_request.company_id;

    update public.trial_access_requests
    set status = 'approved',
        decision_note = v_note,
        granted_until = p_granted_until,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_request_id;
  else
    update public.trial_access_requests
    set status = 'rejected',
        decision_note = v_note,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_request_id;
  end if;

  return p_request_id;
end;
$$;

revoke execute on function public.platform_review_trial_access_request(uuid,text,uuid,timestamptz,text)
  from public, anon;
grant execute on function public.platform_review_trial_access_request(uuid,text,uuid,timestamptz,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
