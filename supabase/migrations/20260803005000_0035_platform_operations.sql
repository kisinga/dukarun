-- 0035_platform_operations.sql
-- Focused production diagnostics and an audited in-app platform broadcast.

create or replace function public.platform_operations_snapshot()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_unbalanced bigint; v_failed bigint; v_pending bigint; v_members bigint;
begin
  perform public.assert_platform_admin();
  select count(*) into v_pending from public.companies where status='unapproved';
  select count(*) into v_failed from public.outbox where status='failed';
  select count(*) into v_members from public.company_memberships where authorization_status='approved';
  select count(*) into v_unbalanced from (
    select entry_id from public.ledger_journal_lines group by entry_id
    having sum(debit) <> sum(credit)
  ) broken;
  return jsonb_build_object('pending_companies',v_pending,'failed_outbox',v_failed,
    'active_memberships',v_members,'unbalanced_journals',v_unbalanced);
end;
$$;

create or replace function public.platform_broadcast(p_title text,p_body text,p_link text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint;
begin
  perform public.assert_platform_admin();
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_body,'')))=0
    then raise exception 'title_and_body_required'; end if;
  insert into public.notifications(company_id,user_id,type,title,body,link)
  select distinct m.company_id,null::uuid,'system',trim(p_title),trim(p_body),nullif(trim(coalesce(p_link,'')),'')
  from public.company_memberships m join public.companies c on c.id=m.company_id
  where m.authorization_status='approved' and c.status='approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.platform_operations_snapshot() from anon,public;
revoke execute on function public.platform_broadcast(text,text,text) from anon,public;
grant execute on function public.platform_operations_snapshot() to authenticated;
grant execute on function public.platform_broadcast(text,text,text) to authenticated;
