-- A company may sign off the current business day after local midnight even
-- while the database session remains on the preceding UTC date.

create or replace function public.sign_off_business_day(p_business_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_business_date date;
  v_summary jsonb;
  v_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation')
    and not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: ManageReconciliation or CloseAccountingPeriod required';
  end if;

  select (now() at time zone c.business_timezone)::date
  into v_business_date
  from public.companies c
  where c.id = v_company_id;

  if p_business_date > v_business_date then raise exception 'invalid_business_date'; end if;
  if exists (
    select 1 from public.cashier_sessions
    where company_id = v_company_id and status = 'open'
  ) then raise exception 'open_sessions_exist'; end if;
  if exists (
    select 1 from public.pos_devices
    where company_id = v_company_id and retired_at is null and pending_count > 0
  ) then raise exception 'offline_sales_pending'; end if;
  if exists (
    select 1 from public.late_sale_reviews
    where company_id = v_company_id and status = 'pending'
  ) then raise exception 'late_sales_pending'; end if;

  v_summary := public.daily_close_status(p_business_date);
  insert into public.daily_business_closes (
    company_id,
    business_date,
    status,
    summary,
    signed_off_by,
    signed_off_at,
    invalidated_at,
    invalidation_reason
  ) values (
    v_company_id,
    p_business_date,
    'signed_off',
    v_summary,
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (company_id, business_date) do update
  set status = 'signed_off',
      summary = excluded.summary,
      signed_off_by = excluded.signed_off_by,
      signed_off_at = now(),
      invalidated_at = null,
      invalidation_reason = null
  returning id into v_id;

  return v_id;
end;
$$;
