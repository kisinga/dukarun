-- Keep the company-wide recipient explicitly typed for plpgsql_check and PG.
create or replace function public.platform_broadcast(p_title text,p_body text,p_link text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
  perform public.assert_platform_admin();
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_body,'')))=0
    then raise exception 'title_and_body_required'; end if;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  select distinct m.company_id,null::uuid,'system',trim(p_title),trim(p_body),
    nullif(trim(coalesce(p_link,'')),'')
  from public.company_memberships m join public.companies c on c.id=m.company_id
  where m.authorization_status='approved' and c.status='approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
