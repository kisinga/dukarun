-- Customer deletion/restoration is a privileged lifecycle operation.

alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ManageCustomers',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions'
]::text[]);

update public.roles
set permissions = array_append(permissions, 'ManageCustomers'),
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ManageCustomers' = any(permissions));

-- New companies receive the permission through their provisioned Admin role.
do $$
declare
  v_definition text;
  v_old text := '''ManageCustomerCreditLimit''';
  v_new text := '''ManageCustomerCreditLimit'', ''ManageCustomers''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text,text,text)'::regprocedure)
    into v_definition;

  if position('''ManageCustomers''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add ManageCustomers to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

create or replace function public.set_customer_deleted(
  p_customer_id uuid,
  p_deleted boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ManageCustomers') then
    raise exception 'permission_denied: ManageCustomers required';
  end if;

  update public.customers
  set deleted_at = case when p_deleted then coalesce(deleted_at, now()) else null end,
      deleted_by = case when p_deleted then coalesce(deleted_by, auth.uid()) else null end,
      updated_at = now()
  where id = p_customer_id
    and company_id = v_company_id
    and not is_supplier;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

revoke execute on function public.set_customer_deleted(uuid, boolean) from anon, public;
grant execute on function public.set_customer_deleted(uuid, boolean) to authenticated;
