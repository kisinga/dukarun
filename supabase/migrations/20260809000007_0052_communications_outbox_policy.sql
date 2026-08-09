-- The communications page is gated by ManageCommunications and reads delivery
-- history from outbox. Keep finance access for existing reporting surfaces while
-- allowing the permission advertised by the route to read the same company rows.
drop policy "outbox readable by finance or platform admins" on public.outbox;
create policy "outbox readable by authorized members or platform admins"
  on public.outbox for select
  using (
    (select public.is_platform_admin())
    or (
      company_id = (select public.current_company_id())
      and (
        (select public.current_user_has_permission('ViewFinancials'))
        or (select public.current_user_has_permission('ManageCommunications'))
      )
    )
  );
