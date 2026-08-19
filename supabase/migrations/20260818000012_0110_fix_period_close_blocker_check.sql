-- PostgreSQL exposes jsonb_object_keys(), not jsonb_object_length(). Treat a
-- readiness object as blocked when it has at least one top-level key.

create or replace function public.close_accounting_period(p_end_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_period public.accounting_periods%rowtype;
  v_readiness jsonb;
  v_period_id uuid;
  v_pack jsonb;
  v_next_start date;
  v_next_end date;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('CloseAccountingPeriod') then
    raise exception 'permission_denied: CloseAccountingPeriod required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));
  select * into v_period
  from public.accounting_periods
  where company_id = v_company_id and status = 'open'
  for update;
  if v_period.id is null then
    raise exception 'open_period_not_found';
  end if;

  v_readiness := public.period_close_readiness(p_end_date);
  if exists (
    select 1 from jsonb_object_keys(coalesce(v_readiness -> 'blockers', '{}'::jsonb))
  ) then
    raise exception 'period_not_ready: %', v_readiness -> 'blockers';
  end if;

  delete from public.accounting_periods where id = v_period.id;
  v_period_id := public.close_accounting_period_legacy(p_end_date);
  update public.accounting_periods
  set closed_at = now(), closed_by = auth.uid()
  where id = v_period_id;

  v_pack := public.build_period_closing_pack(v_period_id, v_period.start_date, p_end_date);
  insert into public.period_closing_packs(company_id, accounting_period_id, snapshot, created_by)
  values(v_company_id, v_period_id, v_pack, auth.uid());

  v_next_start := p_end_date + 1;
  v_next_end := (date_trunc('month', v_next_start) + interval '1 month - 1 day')::date;
  insert into public.accounting_periods(company_id, start_date, end_date, status, created_by)
  values(v_company_id, v_next_start, v_next_end, 'open', auth.uid());
  return v_period_id;
end;
$$;
