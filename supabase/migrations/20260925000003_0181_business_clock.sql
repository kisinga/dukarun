-- Expose the tenant's current business date from the database clock. Clients
-- must not infer posting dates from a device clock or a hard-coded timezone.
create or replace function public.current_business_date()
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_business_date date;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  select (now() at time zone c.business_timezone)::date
  into v_business_date
  from public.companies c
  where c.id = v_company_id;

  if v_business_date is null then raise exception 'company_not_found'; end if;
  return v_business_date;
end;
$$;

revoke execute on function public.current_business_date() from public, anon;
grant execute on function public.current_business_date() to authenticated;
