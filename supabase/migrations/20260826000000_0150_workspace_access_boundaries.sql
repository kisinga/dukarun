-- Keep application workspaces and their underlying data aligned to the same
-- permission-derived access decision. Fulfillment-only roles must use the
-- narrow fulfillment RPC projections rather than broad operational tables.

create or replace function public.current_user_can_access_scope(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_scope
      when 'data.sales' then r.permissions && array[
        'SettleOrder', 'ReverseOrder', 'ManageApprovals', 'ViewFinancials',
        'ViewStaffPerformance', 'ManageCommissions'
      ]
      when 'data.customers' then r.permissions && array[
        'SettleOrder', 'ManageCustomers', 'ApproveCustomerCredit',
        'ManageCustomerCreditLimit', 'OverrideCustomerBalance',
        'ManageSupplierCreditPurchases', 'ViewFinancials',
        'ManageCommunications', 'ManageReconciliation'
      ]
      when 'data.catalog' then r.permissions && array[
        'SettleOrder', 'ManageCatalog', 'ManageStockAdjustments',
        'ManageSupplierCreditPurchases', 'ViewFinancials'
      ]
      when 'data.purchasing' then r.permissions && array[
        'ManageSupplierCreditPurchases', 'ManageStockAdjustments',
        'ViewFinancials', 'ManageReconciliation'
      ]
      when 'workspace.dashboard' then r.permissions && array[
        'SettleOrder', 'ReverseOrder', 'ManageApprovals', 'ManageCatalog',
        'ManageStockAdjustments', 'ManageCustomers', 'ApproveCustomerCredit',
        'ManageCustomerCreditLimit', 'OverrideCustomerBalance',
        'ManageSupplierCreditPurchases', 'ViewFinancials',
        'ManageReconciliation', 'ManageCompanySettings', 'ManageTeam'
      ]
      when 'workspace.sell' then 'SettleOrder' = any(r.permissions)
      when 'workspace.sales' then r.permissions && array[
        'SettleOrder', 'ReverseOrder', 'ManageApprovals', 'ViewFinancials',
        'ViewStaffPerformance', 'ManageCommissions'
      ]
      when 'workspace.inventory' then r.permissions && array[
        'ManageCatalog', 'ManageStockAdjustments'
      ]
      when 'workspace.customers' then r.permissions && array[
        'ManageCustomers', 'ApproveCustomerCredit',
        'ManageCustomerCreditLimit', 'OverrideCustomerBalance',
        'ViewFinancials', 'ManageCommunications', 'ManageReconciliation'
      ]
      when 'workspace.purchasing' then r.permissions && array[
        'ManageSupplierCreditPurchases', 'ManageStockAdjustments',
        'ViewFinancials', 'ManageReconciliation'
      ]
      when 'workspace.fulfillment' then r.permissions && array[
        'ProcessFulfillments', 'CompleteFulfillments',
        'ManageFulfillments', 'SettleOrder'
      ]
      else false
    end
    from public.company_memberships m
    join public.roles r on r.id = m.role_id and r.company_id = m.company_id
    where m.company_id = (select public.current_company_id())
      and m.user_id = auth.uid()
      and m.authorization_status = 'approved'
  ), false)
$$;

revoke execute on function public.current_user_can_access_scope(text) from public, anon;
grant execute on function public.current_user_can_access_scope(text) to authenticated, service_role;

create or replace function public.current_access_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_permissions text[] := '{}'::text[];
  v_workspaces text[] := '{}'::text[];
  v_reversal text;
  v_overdraft text;
  v_customer_credit text;
begin
  if v_company_id is null or auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce(r.permissions, '{}'::text[])
  into v_permissions
  from public.company_memberships m
  join public.roles r on r.id = m.role_id and r.company_id = m.company_id
  where m.company_id = v_company_id
    and m.user_id = auth.uid()
    and m.authorization_status = 'approved';
  v_permissions := coalesce(v_permissions, '{}'::text[]);

  select coalesce(array_agg(scope order by ordinal), '{}'::text[])
  into v_workspaces
  from unnest(array[
    'dashboard', 'sell', 'sales', 'inventory', 'customers',
    'purchasing', 'fulfillment'
  ]) with ordinality as candidate(scope, ordinal)
  where public.current_user_can_access_scope('workspace.' || scope);

  v_reversal := case when 'ReverseOrder' = any(v_permissions) then 'execute'
    when 'SettleOrder' = any(v_permissions) then 'request' else 'blocked' end;
  v_overdraft := case when 'ApproveCustomerCredit' = any(v_permissions) then 'execute'
    when 'SettleOrder' = any(v_permissions) then 'request' else 'blocked' end;
  v_customer_credit := case when 'ManageCustomerCreditLimit' = any(v_permissions) then 'execute'
    when 'ManageCustomers' = any(v_permissions) then 'request' else 'blocked' end;
  return jsonb_build_object(
    'company_id', v_company_id,
    'user_id', auth.uid(),
    'permissions', to_jsonb(v_permissions),
    'workspaces', to_jsonb(v_workspaces),
    'actions', jsonb_build_object(
      'sale.void', v_reversal,
      'sale.refund', v_reversal,
      'payment.reverse', v_reversal,
      'sale.credit_over_limit', v_overdraft,
      'customer.credit.update', v_customer_credit
    )
  );
end;
$$;

revoke execute on function public.current_access_snapshot() from public, anon;
grant execute on function public.current_access_snapshot() to authenticated;

drop policy if exists "customers readable by members" on public.customers;
create policy "customers readable with operational access"
  on public.customers for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.customers')))
    or (select public.is_platform_admin())
  );

drop policy if exists "products readable by members" on public.products;
create policy "products readable with catalog access"
  on public.products for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.catalog')))
    or (select public.is_platform_admin())
  );

drop policy if exists "variants readable by members" on public.product_variants;
create policy "variants readable with catalog access"
  on public.product_variants for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.catalog')))
    or (select public.is_platform_admin())
  );

drop policy if exists "inventory_batches readable by members" on public.inventory_batches;
create policy "inventory batches readable with catalog access"
  on public.inventory_batches for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.catalog')))
    or (select public.is_platform_admin())
  );

drop policy if exists "inventory_movements readable by members" on public.inventory_movements;
create policy "inventory movements readable with catalog access"
  on public.inventory_movements for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.catalog')))
    or (select public.is_platform_admin())
  );

drop policy if exists "orders readable by members" on public.orders;
create policy "orders readable with sales access"
  on public.orders for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.sales')))
    or (select public.is_platform_admin())
  );

drop policy if exists "order_lines readable by members" on public.order_lines;
create policy "order lines readable with sales access"
  on public.order_lines for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.sales')))
    or (select public.is_platform_admin())
  );

drop policy if exists "payments readable by members" on public.payments;
create policy "payments readable with sales access"
  on public.payments for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.sales')))
    or (select public.is_platform_admin())
  );

drop policy if exists "purchases readable by members" on public.purchases;
create policy "purchases readable with purchasing access"
  on public.purchases for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.purchasing')))
    or (select public.is_platform_admin())
  );

drop policy if exists "purchase lines readable by members" on public.purchase_lines;
create policy "purchase lines readable with purchasing access"
  on public.purchase_lines for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.purchasing')))
    or (select public.is_platform_admin())
  );

drop policy if exists "purchase payments readable by members" on public.purchase_payments;
create policy "purchase payments readable with purchasing access"
  on public.purchase_payments for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.purchasing')))
    or (select public.is_platform_admin())
  );

drop policy if exists "purchase drafts readable by members" on public.purchase_drafts;
create policy "purchase drafts readable with purchasing access"
  on public.purchase_drafts for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_can_access_scope('data.purchasing')))
    or (select public.is_platform_admin())
  );

-- save_draft is the common order-creation core for counter, held, credit, and
-- fulfillment sales. Gate it once so UI omissions cannot become sale access.
do $migration$
declare
  v_definition text;
  v_anchor text := 'if v_company_id is null then raise exception ''not_authenticated''; end if;';
  v_guard text := v_anchor || E'\n  if not public.current_user_has_permission(''SettleOrder'') then\n    raise exception ''permission_denied: SettleOrder required'';\n  end if;';
begin
  select pg_get_functiondef('public.save_draft(uuid,jsonb,uuid)'::regprocedure)
  into v_definition;
  if position('permission_denied: SettleOrder required' in v_definition) = 0 then
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Could not add SettleOrder guard to save_draft';
    end if;
    execute replace(v_definition, v_anchor, v_guard);
  end if;
end;
$migration$;
