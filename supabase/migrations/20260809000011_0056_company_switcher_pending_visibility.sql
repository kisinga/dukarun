-- Keep pending companies visible in the company switcher without granting
-- them tenant scope. Authorization helpers and the token hook continue to
-- accept approved companies only.

drop function public.my_companies();

create function public.my_companies()
returns table (
  company_id uuid,
  name text,
  code text,
  role_name text,
  is_active boolean,
  status text
)
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
    coalesce(c.id = (select public.current_company_id()), false),
    c.status
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  left join public.roles r on r.id = m.role_id
  where m.user_id = (select auth.uid())
    and m.authorization_status = 'approved'
    and c.status in ('unapproved', 'approved')
  order by c.name
$$;

revoke execute on function public.my_companies() from anon, public;
grant execute on function public.my_companies() to authenticated;
