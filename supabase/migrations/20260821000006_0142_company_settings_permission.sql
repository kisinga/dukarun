-- Company settings are an explicit administrative capability. Specialist
-- settings retain their existing domain permissions inside the gated page.

alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals','OverridePrice','ManageStockAdjustments','ApproveCustomerCredit',
  'ManageCustomerCreditLimit','ManageCustomers','ManageCatalog','ManageCommunications',
  'ManageMpesaIntegration','ManageCompanySettings','ReverseOrder','OverrideCustomerBalance',
  'SettleOrder','ManageSupplierCreditPurchases','ViewFinancials','ManageReconciliation',
  'CloseAccountingPeriod','CreateInterAccountTransfer','ManageTeam','ViewAuditTrail',
  'ViewStaffPerformance','ManageCommissions'
]::text[]);

-- Preserve the access existing administrators and managers had before the
-- page gained an explicit permission, including the platform templates.
update public.roles
set permissions = array_append(permissions, 'ManageCompanySettings'), updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ManageCompanySettings' = any(permissions));

drop trigger if exists roles_apply_company_settings_permission_default on public.roles;
drop function if exists public.apply_company_settings_permission_default();

-- Manager is copied from the updated platform template. Admin is inserted
-- directly by provision_company_base, so patch only that canonical default;
-- user-created roles must receive exactly the permissions explicitly supplied.
do $$
declare
  v_definition text;
  v_old text := '''ManageCommunications''';
  v_new text := '''ManageCommunications'', ''ManageCompanySettings''';
begin
  select pg_get_functiondef(
    'public.provision_company_base(text,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position('''ManageCompanySettings''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add ManageCompanySettings to provision_company_base';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- Direct company patches are limited to granted columns, the active approved
-- company, and now an explicit application permission.
drop policy if exists "companies updatable by members" on public.companies;
drop policy if exists "companies updatable by settings managers" on public.companies;
create policy "companies updatable by settings managers"
  on public.companies for update
  using (
    id = (select public.current_company_id())
    and status = 'approved'
    and (select public.current_user_has_permission('ManageCompanySettings'))
  )
  with check (
    id = (select public.current_company_id())
    and status = 'approved'
    and (select public.current_user_has_permission('ManageCompanySettings'))
  );

-- Public reads remain unchanged; every write under a company prefix requires
-- the same permission as the company row that references the logo.
drop policy if exists "members write their company logo prefix" on storage.objects;
drop policy if exists "settings managers write their company logo prefix" on storage.objects;
create policy "settings managers write their company logo prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageCompanySettings'))
  );

drop policy if exists "members update their company logo prefix" on storage.objects;
drop policy if exists "settings managers update their company logo prefix" on storage.objects;
create policy "settings managers update their company logo prefix"
  on storage.objects for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageCompanySettings'))
  )
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageCompanySettings'))
  );

drop policy if exists "members delete their company logo prefix" on storage.objects;
drop policy if exists "settings managers delete their company logo prefix" on storage.objects;
create policy "settings managers delete their company logo prefix"
  on storage.objects for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
    and (select public.current_user_has_permission('ManageCompanySettings'))
  );
