-- 0048_tenant_audit_trail.sql
-- A permission-gated, tenant-facing activity feed over the generic audit log
-- and the immutable inventory movement trail.

-- ---------------------------------------------------------------------------
-- 1. Dedicated permission. Admin and Manager roles get it by default, while
--    custom roles can be granted or denied access independently.
-- ---------------------------------------------------------------------------
alter table public.roles drop constraint if exists roles_permissions_check;
alter table public.roles add constraint roles_permissions_check check (permissions <@ array[
  'ManageApprovals',
  'OverridePrice',
  'ManageStockAdjustments',
  'ApproveCustomerCredit',
  'ManageCustomerCreditLimit',
  'ReverseOrder',
  'OverrideCustomerBalance',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail'
]::text[]);

update public.roles
set permissions = array_append(permissions, 'ViewAuditTrail'),
    updated_at = now()
where lower(name) in ('admin', 'manager')
  and not ('ViewAuditTrail' = any(permissions));

-- provision_company was defined earlier with a literal Admin permission list.
-- Patch that stored function body so companies provisioned after this migration
-- receive the same secure default without duplicating the entire function here.
do $$
declare
  v_definition text;
  v_old text := '''CreateInterAccountTransfer'', ''ManageTeam''';
  v_new text := '''CreateInterAccountTransfer'', ''ManageTeam'', ''ViewAuditTrail''';
begin
  select pg_get_functiondef('public.provision_company(text,text,text)'::regprocedure)
    into v_definition;

  if position('''ViewAuditTrail''' in v_definition) = 0 then
    if position(v_old in v_definition) = 0 then
      raise exception 'Could not add ViewAuditTrail to provision_company';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$$;

-- Raw audit rows are no longer readable by every company member. Platform
-- administrators retain their existing cross-company support access.
drop policy if exists "audit log readable by members" on public.audit_log;
drop policy if exists "audit log readable with permission" on public.audit_log;
create policy "audit log readable with permission"
  on public.audit_log for select
  using (
    (company_id = (select public.current_company_id())
      and (select public.current_user_has_permission('ViewAuditTrail'))
      and (select public.current_user_has_permission('ViewFinancials')))
    or (select public.is_platform_admin())
  );

-- Capture the responsible user for new immutable stock movements. Existing
-- rows remain valid and appear as system activity when no actor was recorded.
alter table public.inventory_movements
  add column actor uuid default auth.uid();

-- ---------------------------------------------------------------------------
-- 2. Safe tenant read model. This deliberately returns a curated payload,
--    strips infrastructure/billing identifiers, and never exposes auth.users
--    directly to the browser.
-- ---------------------------------------------------------------------------
create or replace function public.list_audit_events(
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default null,
  p_action text default null,
  p_area text default null,
  p_actor uuid default null,
  p_from timestamptz default null
)
returns table (
  event_id text,
  event_source text,
  occurred_at timestamptz,
  area text,
  entity_type text,
  entity_id text,
  operation text,
  actor_id uuid,
  actor_phone text,
  actor_role text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_can_view_financials boolean := public.current_user_has_permission('ViewFinancials');
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ViewAuditTrail') then
    raise exception 'permission_denied: ViewAuditTrail required';
  end if;

  return query
  with events as (
    select
      'audit:' || a.id::text as event_id,
      'audit'::text as event_source,
      a.changed_at as occurred_at,
      case
        when a.table_name in ('orders', 'order_lines', 'payments', 'refunds', 'approvals') then 'sales'
        when a.table_name in ('products', 'product_variants', 'purchases', 'purchase_payments', 'stock_locations') then 'inventory'
        when a.table_name in ('cashier_sessions', 'cash_drawer_counts', 'reconciliations', 'accounting_periods') then 'cash'
        when a.table_name in ('customers') then 'people'
        when a.table_name in ('roles', 'company_memberships') then 'team'
        else 'settings'
      end as area,
      a.table_name as entity_type,
      a.row_id as entity_id,
      a.operation,
      a.actor as actor_id,
      coalesce(a.old_data, '{}'::jsonb) - array[
        'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'decided_by',
        'voided_by', 'paystack_customer_code', 'paystack_subscription_code',
        'sms_usage_by_category'
      ]::text[] - (case when v_can_view_financials then array[]::text[] else array[
        'amount', 'total', 'paid', 'balance', 'credit_limit', 'supplier_credit_limit',
        'price', 'wholesale_price', 'custom_price', 'unit_cost', 'total_cost',
        'declared_cash', 'expected_cash', 'variance', 'last_payment_amount'
      ]::text[] end) as before_data,
      coalesce(a.new_data, '{}'::jsonb) - array[
        'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'decided_by',
        'voided_by', 'paystack_customer_code', 'paystack_subscription_code',
        'sms_usage_by_category'
      ]::text[] - (case when v_can_view_financials then array[]::text[] else array[
        'amount', 'total', 'paid', 'balance', 'credit_limit', 'supplier_credit_limit',
        'price', 'wholesale_price', 'custom_price', 'unit_cost', 'total_cost',
        'declared_cash', 'expected_cash', 'variance', 'last_payment_amount'
      ]::text[] end) as after_data,
      coalesce(
        a.new_data ->> 'decision_reason', a.new_data ->> 'void_reason',
        a.new_data ->> 'reason', a.new_data ->> 'notes', a.new_data ->> 'memo',
        a.old_data ->> 'decision_reason', a.old_data ->> 'void_reason',
        a.old_data ->> 'reason', a.old_data ->> 'notes', a.old_data ->> 'memo'
      ) as reason
    from public.audit_log a
    where a.company_id = v_company_id
      -- Line-level sale writes are implementation detail; the parent sale and
      -- payment events carry the useful business history without the noise.
      and a.table_name <> 'order_lines'
      and (
        a.operation <> 'UPDATE'
        or (a.old_data - 'updated_at') is distinct from (a.new_data - 'updated_at')
      )

    union all

    select
      'inventory:' || m.id::text,
      'inventory'::text,
      m.created_at,
      'inventory'::text,
      'inventory_movements'::text,
      coalesce(m.source_id, m.id::text),
      upper(m.type),
      m.actor,
      '{}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'product', p.name,
        'variant', v.name,
        'sku', v.sku,
        'quantity', m.quantity,
        'unit_cost', case when v_can_view_financials then m.unit_cost end,
        'total_cost', case when v_can_view_financials then m.total_cost end,
        'movement_type', m.type,
        'source_type', m.source_type,
        'previous_quantity', m.meta -> 'previousQuantity',
        'new_quantity', m.meta -> 'newQuantity'
      )),
      coalesce(m.meta ->> 'reason', m.meta ->> 'notes')
    from public.inventory_movements m
    left join public.product_variants v on v.id = m.variant_id
    left join public.products p on p.id = v.product_id
    where m.company_id = v_company_id
      and m.type in ('adjustment', 'reversal')
  ),
  enriched as (
    select
      e.*,
      case
        when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
          then '••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
        else nullif(u.phone, '')
      end as actor_phone,
      r.name as actor_role
    from events e
    left join auth.users u on u.id = e.actor_id
    left join public.company_memberships cm
      on cm.company_id = v_company_id and cm.user_id = e.actor_id
    left join public.roles r on r.id = cm.role_id
  ),
  filtered as (
    select e.*
    from enriched e
    where (p_from is null or e.occurred_at >= p_from)
      and (p_actor is null or e.actor_id = p_actor)
      and (
        p_action is null
        or (p_action = 'created' and e.operation = 'INSERT')
        or (p_action = 'updated' and e.operation = 'UPDATE')
        or (p_action = 'deleted' and e.operation = 'DELETE')
        or (p_action = 'stock' and e.event_source = 'inventory')
      )
      and (p_area is null or e.area = p_area)
      and (
        v_search is null
        or concat_ws(' ', e.entity_type, e.operation, e.actor_phone, e.actor_role,
          e.reason, e.before_data::text, e.after_data::text) ilike '%' || v_search || '%'
      )
  )
  select
    e.event_id, e.event_source, e.occurred_at, e.area, e.entity_type,
    e.entity_id, e.operation, e.actor_id, e.actor_phone, e.actor_role,
    e.before_data, e.after_data, e.reason,
    count(*) over() as total_count
  from filtered e
  order by e.occurred_at desc, e.event_id desc
  limit v_limit offset v_offset;
end;
$$;

revoke execute on function public.list_audit_events(integer, integer, text, text, text, uuid, timestamptz)
  from anon, public;
grant execute on function public.list_audit_events(integer, integer, text, text, text, uuid, timestamptz)
  to authenticated;

create or replace function public.list_audit_actors()
returns table (user_id uuid, phone text, role_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;
  if not public.current_user_has_permission('ViewAuditTrail') then
    raise exception 'permission_denied: ViewAuditTrail required';
  end if;

  return query
  select
    m.user_id,
    case
      when length(regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g')) > 4
        then '••• ' || right(regexp_replace(u.phone, '\\D', '', 'g'), 4)
      else nullif(u.phone, '')
    end,
    r.name
  from public.company_memberships m
  left join auth.users u on u.id = m.user_id
  left join public.roles r on r.id = m.role_id
  where m.company_id = v_company_id
  order by r.name nulls last, u.phone nulls last, m.user_id;
end;
$$;

revoke execute on function public.list_audit_actors() from anon, public;
grant execute on function public.list_audit_actors() to authenticated;
