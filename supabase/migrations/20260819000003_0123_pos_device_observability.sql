-- Keep POS heartbeats operationally useful without flooding the tenant audit
-- trail, and expose fleet health to platform administrators.

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_company_id uuid;
  v_row_id text;
begin
  v_old := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) end;
  v_new := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) end;

  -- A POS heartbeat normally changes only these timestamps. Retain changes to
  -- queue size, assignment, or retirement state, but do not store telemetry
  -- churn as business activity.
  if TG_TABLE_NAME = 'pos_devices' and TG_OP = 'UPDATE'
    and (v_old - array['last_seen_at', 'last_synced_at']::text[])
      is not distinct from
        (v_new - array['last_seen_at', 'last_synced_at']::text[])
  then
    return NEW;
  end if;

  v_company_id := coalesce(
    nullif(coalesce(v_new, v_old) ->> 'company_id', '')::uuid,
    null
  );
  v_row_id := coalesce(v_new, v_old) ->> 'id';

  insert into public.audit_log (company_id, table_name, operation, row_id, actor, old_data, new_data)
  values (v_company_id, TG_TABLE_NAME, TG_OP, v_row_id, auth.uid(), v_old, v_new);

  return coalesce(NEW, OLD);
end;
$$;

revoke execute on function public.audit_trigger() from authenticated, anon, public;

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
      and a.table_name <> 'order_lines'
      and (
        a.operation <> 'UPDATE'
        or (a.old_data - 'updated_at') is distinct from (a.new_data - 'updated_at')
      )
      -- Also hides heartbeat-only rows already captured before this migration.
      and not (
        a.table_name = 'pos_devices'
        and a.operation = 'UPDATE'
        and (a.old_data - array['last_seen_at', 'last_synced_at']::text[])
          is not distinct from
            (a.new_data - array['last_seen_at', 'last_synced_at']::text[])
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

create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz :=
    date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
begin
  perform public.assert_platform_admin();

  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_approved', (select count(*) from public.companies where status = 'approved'),
    'companies_pending', (select count(*) from public.companies where status = 'unapproved'),
    'subscriptions_active', (select count(*) from public.companies where subscription_status = 'active'),
    'subscriptions_trial', (select count(*) from public.companies where subscription_status = 'trial'),
    'subscriptions_expired', (select count(*) from public.companies where subscription_status = 'expired'),
    'users_total', (select count(*) from auth.users),
    'monthly_active_users', (
      select count(*) from auth.users where last_sign_in_at >= v_month_start
    ),
    'orders_today', (
      select count(*) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date =
        (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date =
        (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'mrr_estimate', (
      select coalesce(sum(
        case when c.billing_cycle = 'yearly' then t.price_yearly / 12 else t.price_monthly end
      ), 0)
      from public.companies c
      join public.subscription_tiers t on t.id = c.subscription_tier_id
      where c.subscription_status = 'active'
    ),
    'pos_devices_total', (
      select count(*) from public.pos_devices where retired_at is null
    ),
    'pos_devices_recent_30d', (
      select count(*) from public.pos_devices
      where retired_at is null and last_seen_at >= now() - interval '30 days'
    ),
    'pos_devices_active_24h', (
      select count(*) from public.pos_devices
      where retired_at is null and last_seen_at >= now() - interval '24 hours'
    ),
    'pos_devices_stale_30d', (
      select count(*) from public.pos_devices
      where retired_at is null
        and last_seen_at < now() - interval '24 hours'
        and last_seen_at >= now() - interval '30 days'
    ),
    'pos_devices_dormant_30d', (
      select count(*) from public.pos_devices
      where retired_at is null and last_seen_at < now() - interval '30 days'
    ),
    'pos_devices_with_last_reported_pending', (
      select count(*) from public.pos_devices
      where retired_at is null and pending_count > 0
    ),
    'offline_sales_last_reported_pending', (
      select coalesce(sum(pending_count), 0) from public.pos_devices where retired_at is null
    ),
    'companies_with_active_pos_30d', (
      select count(distinct company_id) from public.pos_devices
      where retired_at is null and last_seen_at >= now() - interval '30 days'
    )
  );
end;
$$;

revoke execute on function public.platform_stats() from anon, public;
grant execute on function public.platform_stats() to authenticated;
