-- Serialize invitation sends per salesperson so concurrent admin requests cannot
-- both pass the resend cooldown. The attempt audit row is the durable claim.

create or replace function public.claim_platform_sales_invitation_send(
  p_salesperson_id uuid,
  p_actor uuid,
  p_recipient_suffix text,
  p_invitation_code text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = p_actor
  ) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-sales-invitation:' || p_salesperson_id::text, 0)
  );

  if exists (
    select 1
    from public.audit_log a
    where a.table_name = 'platform_sales_invitation_send'
      and a.operation = 'INSERT'
      and a.row_id = p_salesperson_id::text
      and a.changed_at >= pg_catalog.clock_timestamp() - interval '30 seconds'
  ) then
    return false;
  end if;

  insert into public.audit_log (
    actor,
    table_name,
    operation,
    row_id,
    new_data
  ) values (
    p_actor,
    'platform_sales_invitation_send',
    'INSERT',
    p_salesperson_id::text,
    jsonb_build_object(
      'recipient_suffix', right(p_recipient_suffix, 4),
      'invitation_code', p_invitation_code,
      'outcome', 'attempted'
    )
  );

  return true;
end;
$$;

revoke all on function public.claim_platform_sales_invitation_send(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_platform_sales_invitation_send(uuid, uuid, text, text)
  to service_role;
