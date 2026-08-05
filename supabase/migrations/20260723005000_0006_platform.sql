-- ===========================================================================
-- 20260723005000_0006_platform.sql
-- ===========================================================================
-- Platform: subscription billing, comms/notifications, storefront,
-- media collections, audit trail queries, location entitlements/foundation,
-- live dashboard, reporting/analytics views.
--
-- Split from the squashed baseline migration by domain. Statements are
-- verbatim; [squashed] markers note the original migration each chunk
-- came from. Chunks appear in original chronological order.


-- ---------------------------------------------------------------------------
-- [squashed] 0012_reporting_views (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0012_reporting_views.sql
-- Small additions to support the money screens: AR/AP balance views,
-- customer credit management RPC, supplier flag on create_customer.

-- ---------------------------------------------------------------------------
-- Balance views (RLS-scoped reads; balances derived from journal lines).
-- ---------------------------------------------------------------------------
create view public.customer_ar_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.company_id,
  coalesce(sum(l.debit) - sum(l.credit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE'
) l on l.company_id = c.company_id and l.meta ->> 'customerId' = c.id::text
group by c.id, c.company_id;

create view public.supplier_ap_balances
with (security_invoker = true) as
select
  c.id as supplier_id,
  c.company_id,
  coalesce(sum(l.credit) - sum(l.debit), 0)::bigint as balance
from public.customers c
left join (
  select l.* from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_PAYABLE'
) l on l.company_id = c.company_id and l.meta ->> 'supplierId' = c.id::text
where c.is_supplier
group by c.id, c.company_id;

grant select on public.customer_ar_balances to authenticated;
grant select on public.supplier_ap_balances to authenticated;

-- ---------------------------------------------------------------------------
-- update_customer_credit: credit management (limit, approval, terms).
-- ---------------------------------------------------------------------------
create or replace function public.update_customer_credit(
  p_customer_id uuid,
  p_credit_limit bigint,
  p_is_approved boolean,
  p_terms_days integer default null
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

  if not public.current_user_has_permission('ManageCustomerCreditLimit') then
    raise exception 'permission_denied: ManageCustomerCreditLimit required';
  end if;

  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'invalid_credit_limit';
  end if;

  update public.customers
  set credit_limit = p_credit_limit,
      is_credit_approved = p_is_approved,
      credit_approved_by = case when p_is_approved then auth.uid() else credit_approved_by end,
      credit_terms_days = coalesce(p_terms_days, credit_terms_days),
      updated_at = now()
  where id = p_customer_id and company_id = v_company_id;

  if not found then
    raise exception 'customer_not_found: %', p_customer_id;
  end if;

  return p_customer_id;
end;
$$;

revoke execute on function public.update_customer_credit(uuid, bigint, boolean, integer) from anon, public;
grant execute on function public.update_customer_credit(uuid, bigint, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- create_customer: supplier flag. Drop first to avoid overload ambiguity.
-- ---------------------------------------------------------------------------
drop function public.create_customer(text, text, text, text);

create or replace function public.create_customer(
  p_first_name text,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_is_supplier boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.customers (company_id, first_name, last_name, phone, email, is_supplier)
  values (
    v_company_id,
    trim(p_first_name),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    p_is_supplier
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_customer(text, text, text, text, boolean) from anon, public;
grant execute on function public.create_customer(text, text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0015_audit_log (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Attach to mutable business tables.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'roles', 'company_memberships', 'payment_methods', 'stock_locations',
    'customers', 'products', 'orders', 'order_lines', 'payments', 'refunds',
    'purchases', 'purchase_payments', 'cashier_sessions', 'cash_drawer_counts',
    'reconciliations', 'accounting_periods', 'subscription_tiers', 'platform_admins'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- [squashed] 0018_analytics (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0018_analytics.sql
-- Analytics: 4 materialized views (recreated over the new flat schema),
-- hourly refresh via pg_cron, plus low-stock and expiring-batch views for
-- the dashboard. Old system: 4 MVs refreshed hourly by a worker task.

create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- mv_daily_sales_summary: per company/day — orders, revenue, COGS, margin.
-- Revenue from completed orders (gross, as posted); COGS from COGS journal
-- lines tagged with the order.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_sales_summary as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(c.cogs), 0)::bigint as cogs,
  (coalesce(sum(o.total), 0) - coalesce(sum(c.cogs), 0))::bigint as margin
from public.orders o
left join lateral (
  select sum(l.debit) as cogs
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'COGS' and l.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date;

create unique index mv_daily_sales_summary_idx on public.mv_daily_sales_summary (company_id, day);

-- ---------------------------------------------------------------------------
-- mv_daily_product_sales: per company/day/variant — qty, revenue, COGS share.
-- COGS allocated per line proportionally to the order's line totals.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_product_sales as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  l.variant_id,
  coalesce(sum(l.quantity), 0) as quantity,
  coalesce(sum(l.line_total), 0)::bigint as revenue,
  coalesce(sum(round(c.cogs * l.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
from public.orders o
join public.order_lines l on l.order_id = o.id
left join lateral (
  select sum(jl.debit) as cogs
  from public.ledger_journal_lines jl
  join public.ledger_accounts a on a.id = jl.account_id
  where a.code = 'COGS' and jl.order_id = o.id
) c on true
where o.status = 'completed'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, l.variant_id;

create unique index mv_daily_product_sales_idx
  on public.mv_daily_product_sales (company_id, day, variant_id);

-- ---------------------------------------------------------------------------
-- mv_daily_customer_stats: per company/day/customer — orders, spend, AR delta.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_customer_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.customer_id,
  count(*)::int as orders,
  coalesce(sum(o.total), 0)::bigint as revenue,
  coalesce(sum(ar.delta), 0)::bigint as ar_delta
from public.orders o
left join lateral (
  select sum(l.debit) - sum(l.credit) as delta
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id = o.id
) ar on true
where o.status = 'completed' and o.customer_id is not null
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.customer_id;

create unique index mv_daily_customer_stats_idx
  on public.mv_daily_customer_stats (company_id, day, customer_id);

-- ---------------------------------------------------------------------------
-- mv_daily_order_stats: per company/day — by status and payment method.
-- ---------------------------------------------------------------------------
create materialized view public.mv_daily_order_stats as
select
  o.company_id,
  (o.created_at at time zone 'Africa/Nairobi')::date as day,
  o.status,
  p.method_code,
  count(distinct o.id)::int as orders,
  coalesce(sum(o.total), 0)::bigint as total,
  coalesce(sum(p.amount), 0)::bigint as method_total
from public.orders o
left join public.payments p on p.order_id = o.id and p.status = 'settled'
group by o.company_id, (o.created_at at time zone 'Africa/Nairobi')::date, o.status, p.method_code;

create unique index mv_daily_order_stats_idx
  on public.mv_daily_order_stats (company_id, day, status, method_code);

-- ---------------------------------------------------------------------------
-- Tenant isolation: MVs cannot have RLS, so clients never read them directly.
-- These security_invoker views filter by the JWT company claim (platform
-- admins see everything) and are the only granted read surface.
-- ---------------------------------------------------------------------------
create view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_customer_stats as
select * from public.mv_daily_customer_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

create view public.rpt_daily_order_stats as
select * from public.mv_daily_order_stats
where company_id = (select public.current_company_id()) or (select public.is_platform_admin());

grant select on public.rpt_daily_sales_summary to authenticated;
grant select on public.rpt_daily_product_sales to authenticated;
grant select on public.rpt_daily_customer_stats to authenticated;
grant select on public.rpt_daily_order_stats to authenticated;
revoke all on public.mv_daily_sales_summary from authenticated, anon;
revoke all on public.mv_daily_product_sales from authenticated, anon;
revoke all on public.mv_daily_customer_stats from authenticated, anon;
revoke all on public.mv_daily_order_stats from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dashboard helpers: low stock + expiring batches (plain views, always fresh).
-- ---------------------------------------------------------------------------
create view public.low_stock_variants
with (security_invoker = true) as
select
  v.company_id,
  v.id as variant_id,
  p.name as product_name,
  v.name as variant_name,
  coalesce(s.stock, 0) as stock,
  c.low_stock_threshold
from public.product_variants v
join public.products p on p.id = v.product_id
join public.companies c on c.id = v.company_id
left join (
  select variant_id, sum(remaining) as stock
  from public.inventory_batches
  where remaining > 0
  group by variant_id
) s on s.variant_id = v.id
where v.track_inventory and v.active and p.active
  and coalesce(s.stock, 0) <= c.low_stock_threshold;

create view public.expiring_batches
with (security_invoker = true) as
select
  b.company_id,
  b.id as batch_id,
  b.variant_id,
  p.name as product_name,
  v.name as variant_name,
  b.remaining,
  b.expiry_date
from public.inventory_batches b
join public.product_variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.companies c on c.id = b.company_id
where b.remaining > 0
  and b.expiry_date is not null
  and b.expiry_date <= (now() at time zone 'Africa/Nairobi')::date + 30
  and c.batch_expiry_enabled
order by b.expiry_date asc;

grant select on public.low_stock_variants to authenticated;
grant select on public.expiring_batches to authenticated;

-- ---------------------------------------------------------------------------
-- Refresh function + hourly cron (was a worker task in the old stack).
-- ---------------------------------------------------------------------------
create or replace function public.refresh_analytics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.mv_daily_sales_summary;
  refresh materialized view concurrently public.mv_daily_product_sales;
  refresh materialized view concurrently public.mv_daily_customer_stats;
  refresh materialized view concurrently public.mv_daily_order_stats;
end;
$$;

revoke execute on function public.refresh_analytics() from authenticated, anon, public;
grant execute on function public.refresh_analytics() to service_role;

select cron.schedule(
  'refresh-analytics',
  '7 * * * *',
  $$select public.refresh_analytics()$$
);

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0022_media_collections (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0022_media_collections.sql
-- Sprint 5: product images (Storage) + collections.

-- ---------------------------------------------------------------------------
-- Collections (storefront categories; old: Vendure collections/facets-lite)
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table public.product_collections (
  product_id uuid not null references public.products (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, collection_id)
);

create index product_collections_collection_idx on public.product_collections (collection_id);

alter table public.collections enable row level security;
alter table public.product_collections enable row level security;

create policy "collections readable by members"
  on public.collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "product collections readable by members"
  on public.product_collections for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.collections to authenticated;
grant select on public.product_collections to authenticated;
grant all on public.collections to service_role;
grant all on public.product_collections to service_role;

create trigger collections_audit
  after insert or update or delete on public.collections
  for each row execute function public.audit_trigger();

create trigger product_collections_audit
  after insert or update or delete on public.product_collections
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Collection RPCs (writes via RPC, as everywhere).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_collection(
  p_name text,
  p_slug text default null,
  p_description text default null,
  p_collection_id uuid default null,
  p_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_slug text;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  end if;

  if p_collection_id is not null then
    update public.collections
    set name = trim(p_name), slug = v_slug,
        description = coalesce(p_description, description),
        active = coalesce(p_active, active),
        updated_at = now()
    where id = p_collection_id and company_id = v_company_id
    returning id into v_id;

    if v_id is null then
      raise exception 'collection_not_found: %', p_collection_id;
    end if;
  else
    insert into public.collections (company_id, name, slug, description)
    values (v_company_id, trim(p_name), v_slug, p_description)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_product_collections(
  p_product_id uuid,
  p_collection_ids uuid[]
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

  if not exists (select 1 from public.products where id = p_product_id and company_id = v_company_id) then
    raise exception 'product_not_found: %', p_product_id;
  end if;

  delete from public.product_collections
  where product_id = p_product_id and company_id = v_company_id;

  insert into public.product_collections (product_id, collection_id, company_id)
  select p_product_id, c.id, v_company_id
  from public.collections c
  where c.id = any (p_collection_ids) and c.company_id = v_company_id;

  return p_product_id;
end;
$$;

revoke execute on function public.upsert_collection(text, text, text, uuid, boolean) from anon, public;
revoke execute on function public.set_product_collections(uuid, uuid[]) from anon, public;
grant execute on function public.upsert_collection(text, text, text, uuid, boolean) to authenticated;
grant execute on function public.set_product_collections(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product-images bucket (public), tenant-scoped by path prefix
-- (company_id/...). Members write their own company's prefix; the world reads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Policies survive a public-schema reset (storage schema is separate), so
-- drop-if-exists first for idempotency.
drop policy if exists "product images readable by everyone" on storage.objects;
drop policy if exists "members write their company image prefix" on storage.objects;
drop policy if exists "members update their company image prefix" on storage.objects;
drop policy if exists "members delete their company image prefix" on storage.objects;

create policy "product images readable by everyone"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "members write their company image prefix"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members update their company image prefix"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

create policy "members delete their company image prefix"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select public.current_company_id()::text)
  );

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0023_aging_settings (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0023_aging_settings.sql
-- Sprint 6: credit aging views (customer AR + supplier AP) and the
-- payment-method settings RPC.

-- ---------------------------------------------------------------------------
-- customer_credit_aging: per customer — balance, oldest unpaid credit order,
-- days outstanding, bucket. Per-order AR balances from journal lines
-- (order_id column), oldest by entry_date.
-- ---------------------------------------------------------------------------
create view public.customer_credit_aging
with (security_invoker = true) as
with per_order as (
  select
    l.company_id,
    l.meta ->> 'customerId' as customer_id,
    l.order_id,
    sum(l.debit) - sum(l.credit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id is not null
  group by l.company_id, l.meta ->> 'customerId', l.order_id
)
select
  company_id,
  customer_id::uuid as customer_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_order
where balance > 0
group by company_id, customer_id;

-- ---------------------------------------------------------------------------
-- supplier_ap_aging: mirror for AP (per purchase, meta purchaseId).
-- ---------------------------------------------------------------------------
create view public.supplier_ap_aging
with (security_invoker = true) as
with per_purchase as (
  select
    l.company_id,
    l.meta ->> 'supplierId' as supplier_id,
    l.meta ->> 'purchaseId' as purchase_id,
    sum(l.credit) - sum(l.debit) as balance,
    min(e.entry_date) as oldest_date
  from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id = l.account_id
  join public.ledger_journal_entries e on e.id = l.entry_id
  where a.code = 'ACCOUNTS_PAYABLE'
    and l.meta ? 'purchaseId'
  group by l.company_id, l.meta ->> 'supplierId', l.meta ->> 'purchaseId'
)
select
  company_id,
  supplier_id::uuid as supplier_id,
  sum(balance)::bigint as balance,
  min(oldest_date) as oldest_unpaid_date,
  ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date))::int as days_outstanding,
  case
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 7 then 'current'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 30 then '8-30'
    when ((now() at time zone 'Africa/Nairobi')::date - min(oldest_date)) <= 60 then '31-60'
    else '60+'
  end as bucket
from per_purchase
where balance > 0
group by company_id, supplier_id;

grant select on public.customer_credit_aging to authenticated;
grant select on public.supplier_ap_aging to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0023_role_templates (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- Report wrapper views: add the ViewFinancials check (they are definer views
-- over RLS-less MVs, so the check lives in the view itself).
create or replace view public.rpt_daily_sales_summary as
select * from public.mv_daily_sales_summary
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_customer_stats as
select * from public.mv_daily_customer_stats
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

create or replace view public.rpt_daily_order_stats as
select * from public.mv_daily_order_stats
where (company_id = (select public.current_company_id()) and (select public.current_user_has_permission('ViewFinancials')))
   or (select public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- [squashed] 0024_billing (statements belonging to this domain)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- activate_subscription: called by the paystack-webhook edge function after a
-- verified charge.success. Idempotent on the Paystack reference.
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription(
  p_company_id uuid,
  p_tier_id uuid,
  p_billing_cycle text,
  p_reference text,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company record;
  v_now timestamptz := now();
  v_base timestamptz;
begin
  select * into v_company from public.companies where id = p_company_id for update;

  if v_company is null then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  -- Webhook replay: same reference = already processed.
  if v_company.last_payment_reference = p_reference then
    return p_company_id;
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid_billing_cycle';
  end if;

  if not exists (select 1 from public.subscription_tiers where id = p_tier_id and is_active) then
    raise exception 'tier_not_found: %', p_tier_id;
  end if;

  -- Extend from current expiry when still active, else from now.
  v_base := case
    when v_company.subscription_expires_at is not null and v_company.subscription_expires_at > v_now
      then v_company.subscription_expires_at
    else v_now
  end;

  update public.companies
  set subscription_tier_id = p_tier_id,
      subscription_status = 'active',
      subscription_started_at = coalesce(subscription_started_at, v_now),
      subscription_expires_at = v_base + (case when p_billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end),
      subscription_grace_period_end = null,
      billing_cycle = p_billing_cycle,
      last_payment_date = v_now,
      last_payment_amount = p_amount,
      last_payment_reference = p_reference,
      updated_at = now()
  where id = p_company_id;

  return p_company_id;
end;
$$;

revoke execute on function public.activate_subscription(uuid, uuid, text, text, bigint) from authenticated, anon, public;
grant execute on function public.activate_subscription(uuid, uuid, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Enforce in the creation RPCs (order creation + product creation points).
-- ---------------------------------------------------------------------------
create or replace function public.save_draft(
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_order_id uuid;
  v_line jsonb;
  v_total bigint := 0;
  v_qty numeric;
  v_price bigint;
  v_has_override boolean := false;
  v_below jsonb := '[]'::jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_entitled(v_company_id, 'order');

  if exists (
    select 1 from jsonb_array_elements(p_lines) l
    where l ->> 'custom_price' is not null
      and (l ->> 'custom_price')::bigint <> (l ->> 'unit_price')::bigint
  ) then
    v_has_override := true;
  end if;

  if v_has_override and not public.current_user_has_permission('OverridePrice') then
    raise exception 'permission_denied: OverridePrice required';
  end if;

  if p_draft_id is not null then
    update public.orders
    set customer_id = p_customer_id, updated_at = now()
    where id = p_draft_id and company_id = v_company_id and status = 'draft'
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'draft_not_found: %', p_draft_id;
    end if;

    delete from public.order_lines where order_id = v_order_id;
    delete from public.approvals
    where company_id = v_company_id and type = 'below_wholesale' and status = 'pending'
      and metadata ->> 'order_id' = p_draft_id::text;
  else
    insert into public.orders (company_id, code, customer_id, status, created_by)
    values (
      v_company_id,
      'SO-' || nextval('public.order_code_seq'),
      p_customer_id, 'draft', auth.uid()
    )
    returning id into v_order_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'quantity')::numeric;
    v_price := coalesce((v_line ->> 'custom_price')::bigint, (v_line ->> 'unit_price')::bigint);

    if v_qty <> trunc(v_qty) and not exists (
      select 1 from public.product_variants fv
      where fv.id = (v_line ->> 'variant_id')::uuid and fv.allow_fractional
    ) then
      raise exception 'fractional_not_allowed: variant %', v_line ->> 'variant_id';
    end if;

    insert into public.order_lines (
      order_id, company_id, variant_id, quantity, unit_price,
      custom_price, price_override_reason, line_total
    )
    values (
      v_order_id, v_company_id, (v_line ->> 'variant_id')::uuid, v_qty,
      (v_line ->> 'unit_price')::bigint,
      nullif(v_line ->> 'custom_price', '')::bigint,
      v_line ->> 'override_reason',
      round(v_qty * v_price)
    );

    v_total := v_total + round(v_qty * v_price);

    if (v_line ->> 'custom_price') is not null then
      if exists (
        select 1 from public.product_variants fv
        where fv.id = (v_line ->> 'variant_id')::uuid
          and fv.wholesale_price is not null
          and (v_line ->> 'custom_price')::bigint < fv.wholesale_price
      ) then
        v_below := v_below || jsonb_build_object(
          'variant_id', v_line ->> 'variant_id',
          'custom_price', (v_line ->> 'custom_price')::bigint,
          'reason', v_line ->> 'override_reason'
        );
      end if;
    end if;
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;

  if jsonb_array_length(v_below) > 0 then
    perform public.create_approval(
      v_company_id, 'below_wholesale',
      jsonb_build_object('order_id', v_order_id, 'lines', v_below)
    );
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_draft(uuid, jsonb, uuid) from anon, public;
grant execute on function public.save_draft(uuid, jsonb, uuid) to authenticated;

-- create_product_with_variants: product limit gate.
create or replace function public.create_product_with_variants(
  p_name text,
  p_variants jsonb,
  p_barcode text default null,
  p_image_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_product_id uuid;
  v_variant jsonb;
  v_label text;
  v_kind text;
  v_sku text;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  if p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    raise exception 'variants_required: a product needs at least one variant';
  end if;

  perform public.assert_entitled(v_company_id, 'product');

  insert into public.products (company_id, name, barcode, image_path)
  values (v_company_id, trim(p_name), nullif(trim(coalesce(p_barcode, '')), ''), p_image_path)
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(p_variants)
  loop
    v_count := v_count + 1;

    v_label := nullif(trim(coalesce(v_variant ->> 'name', '')), '');
    if v_label is null then
      v_label := case when jsonb_array_length(p_variants) = 1 then 'Default'
                      else 'Variant ' || v_count end;
    end if;

    v_kind := coalesce(v_variant ->> 'kind', 'good');
    if v_kind not in ('good', 'service') then
      raise exception 'invalid_kind';
    end if;

    if (v_variant ->> 'price') is null then
      raise exception 'invalid_price: every variant needs a price';
    end if;

    v_sku := nullif(trim(coalesce(v_variant ->> 'sku', '')), '');
    if v_sku is null then
      v_sku := left(upper(regexp_replace(p_name || v_label, '[^A-Za-z0-9]', '', 'g')), 8)
               || upper(substr(md5(v_company_id::text || v_product_id::text || v_label), 1, 4));
    end if;

    insert into public.product_variants (
      product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
      allow_fractional, track_inventory
    )
    values (
      v_product_id, v_company_id, v_label, v_kind, v_sku,
      nullif(trim(coalesce(v_variant ->> 'barcode', '')), ''),
      (v_variant ->> 'price')::bigint,
      nullif(v_variant ->> 'wholesale_price', '')::bigint,
      coalesce((v_variant ->> 'allow_fractional')::boolean, false),
      case when v_kind = 'service' then false
           else coalesce((v_variant ->> 'track_inventory')::boolean, true) end
    );
  end loop;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_variants(text, jsonb, text, text) from anon, public;
grant execute on function public.create_product_with_variants(text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- subscription_expiry_scan: daily. trial/active past expiry -> expired + 3-day
-- grace; grace passed -> suspension is enforced by assert_entitled (grace end).
-- Reminder flags set for Phase 6 delivery.
-- ---------------------------------------------------------------------------
create or replace function public.subscription_expiry_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int := 0;
  v_now timestamptz := now();
begin
  -- Flip to expired + set grace (3 days) once.
  update public.companies
  set subscription_status = 'expired',
      subscription_grace_period_end = subscription_expires_at + interval '3 days',
      updated_at = v_now
  where subscription_status in ('trial', 'active')
    and subscription_expires_at is not null
    and subscription_expires_at < v_now
    and subscription_grace_period_end is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke execute on function public.subscription_expiry_scan() from authenticated, anon, public;
grant execute on function public.subscription_expiry_scan() to service_role;

select cron.schedule(
  'subscription-expiry-scan',
  '13 3 * * *', -- 06:13 EAT daily
  $$select public.subscription_expiry_scan()$$
);

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0025_comms (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0025_comms.sql
-- Phase 6 backend: in-app notifications (realtime) + external outbox with
-- quiet-hours, SMS metering, credit reminders with dedupe, batch messaging.

-- ---------------------------------------------------------------------------
-- In-app notifications (free, instant — the default channel).
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid, -- null = company-wide
  type text not null, -- 'credit_reminder' | 'subscription' | 'approval' | 'stock' | 'system'
  title text not null,
  body text,
  link text, -- app route, e.g. '/money/credit'
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_company_idx on public.notifications (company_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications readable by members"
  on public.notifications for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "members mark read"
  on public.notifications for update
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Outbox: external messages (sms/whatsapp/email) flushed by pg_cron ->
-- notification-flush edge function.
-- ---------------------------------------------------------------------------
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  scheduled_after timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index outbox_flush_idx on public.outbox (status, scheduled_after) where status = 'pending';

alter table public.outbox enable row level security;

create policy "outbox readable by members"
  on public.outbox for select
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

grant select on public.outbox to authenticated;
grant all on public.outbox to service_role;

-- ---------------------------------------------------------------------------
-- notify(): in-app notification helper.
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_company_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (company_id, user_id, type, title, body, link)
  values (p_company_id, p_user_id, p_type, p_title, p_body, p_link)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, uuid) from authenticated, anon, public;
grant execute on function public.notify(uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_message(): outbox helper with WhatsApp quiet-hours (08:00-19:00 EAT)
-- and SMS period metering.
-- ---------------------------------------------------------------------------
create or replace function public.queue_message(
  p_company_id uuid,
  p_channel text,
  p_recipient text,
  p_body text,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_scheduled timestamptz := now();
  v_eat_hour int;
  v_limit int;
  v_used int;
begin
  -- WhatsApp: outside 08:00-19:00 EAT, defer to next 08:00 EAT.
  if p_channel = 'whatsapp' then
    v_eat_hour := extract(hour from v_scheduled at time zone 'Africa/Nairobi')::int;
    if v_eat_hour >= 19 or v_eat_hour < 8 then
      v_scheduled := ((v_scheduled at time zone 'Africa/Nairobi')::date
        + case when v_eat_hour >= 19 then interval '1 day' else interval '0' end
        + interval '8 hours') at time zone 'Africa/Nairobi';
    end if;
  end if;

  -- SMS metering: cap at the tier's smsPerPeriod.
  if p_channel = 'sms' then
    select (t.limits ->> 'smsPerPeriod')::int, c.sms_used_this_period
      into v_limit, v_used
    from public.companies c
    left join public.subscription_tiers t on t.id = c.subscription_tier_id
    where c.id = p_company_id;

    if v_limit is not null and coalesce(v_used, 0) >= v_limit then
      raise exception 'sms_limit_reached: % of % used this period', v_used, v_limit;
    end if;
  end if;

  insert into public.outbox (company_id, channel, recipient, subject, body, scheduled_after)
  values (p_company_id, p_channel, p_recipient, p_subject, p_body, v_scheduled)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.queue_message(uuid, text, text, text, text) from authenticated, anon, public;
grant execute on function public.queue_message(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Credit reminder checkpoints (dedupe): one notification per customer per
-- bucket per 10 days.
-- ---------------------------------------------------------------------------
create table public.credit_notification_checkpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  bucket text not null,
  notified_at timestamptz not null default now(),
  unique (company_id, customer_id, bucket)
);

alter table public.credit_notification_checkpoints enable row level security;
grant all on public.credit_notification_checkpoints to service_role;
-- no client read needed; service role only

-- Daily scan: in-app notification + SMS for customers entering/overdue in a
-- bucket, deduped via checkpoints (10-day freeze per bucket).
create or replace function public.credit_reminder_scan()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select a.company_id, a.customer_id, a.balance, a.days_outstanding, a.bucket,
           c.first_name, c.phone, c.notifications_enabled
    from public.customer_credit_aging a
    join public.customers c on c.id = a.customer_id
    where a.bucket in ('8-30', '31-60', '60+')
  loop
    -- dedupe: skip if this bucket was notified within 10 days
    if exists (
      select 1 from public.credit_notification_checkpoints cp
      where cp.company_id = v_row.company_id
        and cp.customer_id = v_row.customer_id
        and cp.bucket = v_row.bucket
        and cp.notified_at > now() - interval '10 days'
    ) then
      continue;
    end if;

    perform public.notify(
      v_row.company_id, 'credit_reminder',
      'Credit overdue: ' || v_row.first_name,
      format('Balance KES %s, %s days outstanding (%s).',
             (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding, v_row.bucket),
      '/money/credit'
    );

    if v_row.phone is not null and v_row.notifications_enabled then
      begin
        perform public.queue_message(
          v_row.company_id, 'sms', v_row.phone,
          format('Reminder: your balance of KES %s is %s days overdue. Please pay to keep your credit active.',
                 (v_row.balance / 100.0)::numeric(12,2), v_row.days_outstanding)
        );
      exception when others then
        -- sms limit reached etc. — in-app notification already sent; continue
        null;
      end;
    end if;

    insert into public.credit_notification_checkpoints (company_id, customer_id, bucket)
    values (v_row.company_id, v_row.customer_id, v_row.bucket)
    on conflict (company_id, customer_id, bucket) do update set notified_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.credit_reminder_scan() from authenticated, anon, public;
grant execute on function public.credit_reminder_scan() to service_role;

select cron.schedule(
  'credit-reminder-scan',
  '22 3 * * *', -- 06:22 EAT daily
  $$select public.credit_reminder_scan()$$
);

-- Outbox flush every minute via pg_net -> notification-flush edge function.
-- Function URL + service key are read from Vault secrets set at deploy time
-- (NOTIFY_FLUSH_URL, set in CI/deploy). Skipped when the secret is absent
-- (local dev without functions serving).
create or replace function public.flush_outbox_trigger()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select max(case when name = 'NOTIFY_FLUSH_URL' then decrypted_secret end),
         max(case when name = 'SUPABASE_SERVICE_ROLE_KEY' then decrypted_secret end)
    into v_url, v_key
  from vault.decrypted_secrets
  where name in ('NOTIFY_FLUSH_URL', 'SUPABASE_SERVICE_ROLE_KEY');

  if v_url is null then
    return; -- not configured (local dev); nothing to call
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_key, '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.flush_outbox_trigger() from authenticated, anon, public;
grant execute on function public.flush_outbox_trigger() to service_role;

select cron.schedule(
  'outbox-flush',
  '* * * * *',
  $$select public.flush_outbox_trigger()$$
);

-- ---------------------------------------------------------------------------
-- increment_sms_usage: called by notification-flush per delivered SMS.
-- ---------------------------------------------------------------------------
create or replace function public.increment_sms_usage(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies
  set sms_used_this_period = sms_used_this_period + 1
  where id = p_company_id;
end;
$$;

revoke execute on function public.increment_sms_usage(uuid) from authenticated, anon, public;
grant execute on function public.increment_sms_usage(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- queue_batch_message: staff-facing batch messaging (customer groups).
-- p_audience: 'all' | 'credit_overdue'
-- ---------------------------------------------------------------------------
create or replace function public.queue_batch_message(
  p_channel text,
  p_body text,
  p_audience text default 'all'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_customer record;
  v_count int := 0;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_channel not in ('sms', 'whatsapp') then
    raise exception 'invalid_channel: batch messaging supports sms/whatsapp';
  end if;

  if p_body is null or length(trim(p_body)) < 3 then
    raise exception 'invalid_body';
  end if;

  for v_customer in
    select c.phone from public.customers c
    where c.company_id = v_company_id
      and c.phone is not null
      and c.notifications_enabled
      and not c.is_supplier
      and (
        p_audience = 'all'
        or (p_audience = 'credit_overdue' and exists (
          select 1 from public.customer_credit_aging a
          where a.company_id = v_company_id and a.customer_id = c.id
        ))
      )
  loop
    begin
      perform public.queue_message(v_company_id, p_channel, v_customer.phone, p_body);
      v_count := v_count + 1;
    exception when others then
      -- sms limit mid-batch: stop expanding, report what was queued
      raise;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.queue_batch_message(text, text, text) from anon, public;
grant execute on function public.queue_batch_message(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0026_storefront_platform (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0026_storefront_platform.sql
-- Phase 7 backend: public storefront read surface (anon) + platform
-- (super-admin) RPCs.

-- ---------------------------------------------------------------------------
-- Storefront visibility rule (old storefront-public.resolver.ts):
-- public when approved + opted in; CATALOGUE only while subscription is
-- active/trial/in-grace/exempt (identity stays visible when lapsed).
-- ---------------------------------------------------------------------------
create or replace function public.storefront_catalogue_visible(c public.companies)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.status = 'approved'
    and c.public_storefront_enabled
    and (
      c.subscription_status in ('trial', 'active')
      or (c.subscription_status = 'expired'
          and c.subscription_grace_period_end is not null
          and c.subscription_grace_period_end > now())
      or (c.subscription_exempt_until is not null and c.subscription_exempt_until > now())
    )
$$;

-- Public storefront directory (anon).
create view public.public_storefronts as
select
  id,
  name,
  public_slug as slug,
  logo_path,
  public_whatsapp_number,
  public.storefront_catalogue_visible(c) as catalogue_visible
from public.companies c
where c.status = 'approved' and c.public_storefront_enabled;

grant select on public.public_storefronts to anon, authenticated;

-- Public catalog for a slug (anon). Products only when catalogue_visible.
create or replace function public.storefront_catalog(p_slug text)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
$$;

revoke execute on function public.storefront_catalog(text) from public;
grant execute on function public.storefront_catalog(text) to anon, authenticated;

-- Public collections for a slug.
create or replace function public.storefront_collections(p_slug text)
returns setof public.collections
language sql
stable
security definer
set search_path = ''
as $$
  select col.*
  from public.collections col
  join public.companies c on c.id = col.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and col.active
$$;

revoke execute on function public.storefront_collections(text) from public;
grant execute on function public.storefront_collections(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform (super-admin) RPCs. All gated on is_platform_admin().
-- ---------------------------------------------------------------------------
create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;
end;
$$;

revoke execute on function public.assert_platform_admin() from authenticated, anon, public;
grant execute on function public.assert_platform_admin() to authenticated, service_role;

-- Company lifecycle: approve / disable / ban.
create or replace function public.platform_set_company_status(p_company_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  if p_status not in ('unapproved', 'approved', 'disabled', 'banned') then
    raise exception 'invalid_status';
  end if;

  update public.companies
  set status = p_status, updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Subscription override: tier, exemption, grace extension.
create or replace function public.platform_update_subscription(
  p_company_id uuid,
  p_tier_id uuid default null,
  p_subscription_status text default null,
  p_exempt_until timestamptz default null,
  p_exempt_reason text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  update public.companies
  set subscription_tier_id = coalesce(p_tier_id, subscription_tier_id),
      subscription_status = coalesce(p_subscription_status, subscription_status),
      subscription_exempt_until = coalesce(p_exempt_until, subscription_exempt_until),
      subscription_exempt_reason = coalesce(p_exempt_reason, subscription_exempt_reason),
      subscription_expires_at = coalesce(p_expires_at, subscription_expires_at),
      updated_at = now()
  where id = p_company_id;

  if not found then
    raise exception 'company_not_found: %', p_company_id;
  end if;

  return p_company_id;
end;
$$;

-- Tier management.
create or replace function public.platform_upsert_tier(
  p_code text,
  p_name text,
  p_price_monthly bigint,
  p_price_yearly bigint,
  p_limits jsonb default '{}',
  p_features jsonb default '{}',
  p_tier_id uuid default null,
  p_is_active boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.assert_platform_admin();

  if p_tier_id is not null then
    update public.subscription_tiers
    set code = coalesce(p_code, code),
        name = coalesce(p_name, name),
        price_monthly = coalesce(p_price_monthly, price_monthly),
        price_yearly = coalesce(p_price_yearly, price_yearly),
        limits = coalesce(p_limits, limits),
        features = coalesce(p_features, features),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_tier_id
    returning id into v_id;

    if v_id is null then
      raise exception 'tier_not_found: %', p_tier_id;
    end if;
  else
    insert into public.subscription_tiers (code, name, price_monthly, price_yearly, limits, features)
    values (p_code, p_name, p_price_monthly, p_price_yearly, coalesce(p_limits, '{}'), coalesce(p_features, '{}'))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Platform stats (dashboard).
create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();

  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_approved', (select count(*) from public.companies where status = 'approved'),
    'companies_pending', (select count(*) from public.companies where status = 'unapproved'),
    'subscriptions_active', (select count(*) from public.companies where subscription_status = 'active'),
    'subscriptions_trial', (select count(*) from public.companies where subscription_status = 'trial'),
    'subscriptions_expired', (select count(*) from public.companies where subscription_status = 'expired'),
    'orders_today', (
      select count(*) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'revenue_today', (
      select coalesce(sum(total), 0) from public.orders
      where (created_at at time zone 'Africa/Nairobi')::date = (now() at time zone 'Africa/Nairobi')::date
        and status = 'completed'
    ),
    'mrr_estimate', (
      select coalesce(sum(case when c.billing_cycle = 'yearly' then t.price_yearly / 12 else t.price_monthly end), 0)
      from public.companies c join public.subscription_tiers t on t.id = c.subscription_tier_id
      where c.subscription_status = 'active'
    )
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'platform_set_company_status(uuid, text)',
    'platform_update_subscription(uuid, uuid, text, timestamptz, text, timestamptz)',
    'platform_upsert_tier(text, text, bigint, bigint, jsonb, jsonb, uuid, boolean)',
    'platform_stats()'
  ]
  loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0027_storefront_collection_filter (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0027_storefront_collection_filter.sql
-- storefront_catalog gains an optional collection filter so the public
-- storefront can filter by collection without exposing product_collections.

drop function public.storefront_catalog(text);

create or replace function public.storefront_catalog(
  p_slug text,
  p_collection_id uuid default null
)
returns setof public.variant_catalog
language sql
stable
security definer
set search_path = ''
as $$
  select vc.*
  from public.variant_catalog vc
  join public.companies c on c.id = vc.company_id
  where c.public_slug = p_slug
    and public.storefront_catalogue_visible(c)
    and vc.variant_active and vc.product_active
    and (
      p_collection_id is null
      or exists (
        select 1 from public.product_collections pc
        where pc.product_id = vc.product_id and pc.collection_id = p_collection_id
      )
    )
$$;

revoke execute on function public.storefront_catalog(text, uuid) from public;
grant execute on function public.storefront_catalog(text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0030_live_dashboard (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 0030_live_dashboard.sql
-- The reporting MVs remain the source for heavier report screens and refresh
-- hourly. The operational dashboard needs read-after-write consistency, so it
-- gets a small, tenant-scoped live snapshot built from the source tables.

create or replace function public.dashboard_sales_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_result jsonb;
begin
  if v_company_id is null then
    raise exception 'not_authenticated';
  end if;

  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;

  with completed_orders as (
    select
      o.id,
      o.company_id,
      (o.created_at at time zone 'Africa/Nairobi')::date as day,
      o.total
    from public.orders o
    where o.company_id = v_company_id
      and o.status = 'completed'
      and (o.created_at at time zone 'Africa/Nairobi')::date >= v_since
  ),
  order_costs as (
    select
      o.id,
      o.company_id,
      o.day,
      o.total,
      coalesce(sum(l.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs
    from completed_orders o
    left join public.ledger_journal_lines l
      on l.company_id = o.company_id and l.order_id = o.id
    left join public.ledger_accounts a
      on a.id = l.account_id and a.company_id = o.company_id
    group by o.id, o.company_id, o.day, o.total
  ),
  summary as (
    select
      company_id,
      day,
      count(*)::int as orders,
      coalesce(sum(total), 0)::bigint as revenue,
      coalesce(sum(cogs), 0)::bigint as cogs,
      (coalesce(sum(total), 0) - coalesce(sum(cogs), 0))::bigint as margin
    from order_costs
    group by company_id, day
  ),
  product_sales as (
    select
      o.company_id,
      o.day,
      l.variant_id,
      coalesce(sum(l.quantity), 0) as quantity,
      coalesce(sum(l.line_total), 0)::bigint as revenue,
      coalesce(
        sum(round(o.cogs * l.line_total::numeric / nullif(o.total, 0))),
        0
      )::bigint as cogs
    from order_costs o
    join public.order_lines l on l.order_id = o.id and l.company_id = o.company_id
    group by o.company_id, o.day, l.variant_id
  )
  select jsonb_build_object(
    'summary', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.day) from summary s),
      '[]'::jsonb
    ),
    'productSales', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_sales_snapshot(date) from anon, public;
grant execute on function public.dashboard_sales_snapshot(date) to authenticated;

-- Keep supplier screens in sync across tabs/users. Local writes already reload
-- after their RPC completes; these publications cover external changes too.
alter publication supabase_realtime add table public.purchases;
alter publication supabase_realtime add table public.purchase_payments;


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0035_platform_operations (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0036_platform_broadcast_type (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0038_location_entitlements (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Central entitlement read model plus gated stock-location management.

alter table public.stock_locations
  add column if not exists is_default boolean not null default false;

with ranked as (
  select id, row_number() over (partition by company_id order by created_at, id) as position
  from public.stock_locations
)
update public.stock_locations l
set is_default = true
from ranked r
where r.id = l.id and r.position = 1
  and not exists (
    select 1 from public.stock_locations existing
    where existing.company_id = l.company_id and existing.is_default
  );

create unique index if not exists stock_locations_one_default_idx
  on public.stock_locations (company_id) where is_default;

update public.subscription_tiers
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'multipleLocations', case
    when features ? 'multipleLocations' then (features ->> 'multipleLocations')::boolean
    else coalesce((limits ->> 'maxStockLocations')::int, 1) > 1
  end
);

create or replace function public.feature_enabled(p_company_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.features ? p_feature then coalesce((t.features ->> p_feature)::boolean, false)
    when p_feature = 'multipleLocations'
      then coalesce((t.limits ->> 'maxStockLocations')::int, 1) > 1
    else false
  end
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = p_company_id
$$;

revoke execute on function public.feature_enabled(uuid, text) from public, anon, authenticated;
grant execute on function public.feature_enabled(uuid, text) to service_role;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', coalesce(t.features, '{}'::jsonb),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;

  return v_result;
end;
$$;

revoke execute on function public.current_entitlements() from public, anon;
grant execute on function public.current_entitlements() to authenticated, service_role;

create or replace function public.create_stock_location(
  p_code text,
  p_name text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_count int;
  v_limit int;
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  perform public.assert_entitled(v_company_id, null);

  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;

  perform 1 from public.companies where id = v_company_id for update;
  select count(*) into v_count from public.stock_locations where company_id = v_company_id;

  if v_count > 0 and not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;

  select nullif(t.limits ->> 'maxStockLocations', '')::int into v_limit
  from public.companies c left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'limit_reached: stock location limit (%); upgrade your plan', v_limit;
  end if;

  if p_is_default or v_count = 0 then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;

  insert into public.stock_locations (company_id, code, name, is_default)
  values (v_company_id, v_code, trim(p_name), p_is_default or v_count = 0)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

create or replace function public.update_stock_location(
  p_location_id uuid,
  p_code text,
  p_name text,
  p_is_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_code text;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'invalid_location_name'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]+', '-', 'g'));
  if v_code = '' then raise exception 'invalid_location_code'; end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id and company_id = v_company_id)
    then raise exception 'stock_location_not_found: %', p_location_id; end if;

  if p_is_default then
    update public.stock_locations set is_default = false where company_id = v_company_id;
  end if;
  update public.stock_locations
  set code = v_code, name = trim(p_name), is_default = is_default or p_is_default, updated_at = now()
  where id = p_location_id and company_id = v_company_id;
  return p_location_id;
exception
  when unique_violation then raise exception 'location_code_exists: %', v_code;
end;
$$;

create or replace function public.delete_stock_location(p_location_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location public.stock_locations%rowtype;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  select * into v_location from public.stock_locations
  where id = p_location_id and company_id = v_company_id for update;
  if v_location.id is null then raise exception 'stock_location_not_found: %', p_location_id; end if;
  if v_location.is_default then raise exception 'default_location_cannot_be_deleted'; end if;
  if exists (select 1 from public.inventory_batches where stock_location_id = p_location_id)
     or exists (select 1 from public.purchases where stock_location_id = p_location_id) then
    raise exception 'location_in_use: move or retain its stock history';
  end if;

  delete from public.stock_locations where id = p_location_id and company_id = v_company_id;
  return p_location_id;
end;
$$;

revoke execute on function public.create_stock_location(text, text, boolean) from public, anon;
revoke execute on function public.update_stock_location(uuid, text, text, boolean) from public, anon;
revoke execute on function public.delete_stock_location(uuid) from public, anon;
grant execute on function public.create_stock_location(text, text, boolean) to authenticated, service_role;
grant execute on function public.update_stock_location(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.delete_stock_location(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0039_location_default_invariant (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Every creation path, including company provisioning, makes the first location default.
create or replace function public.ensure_first_stock_location_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.stock_locations where company_id = new.company_id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_locations_first_default on public.stock_locations;
create trigger stock_locations_first_default
  before insert on public.stock_locations
  for each row execute function public.ensure_first_stock_location_default();


-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0048_tenant_audit_trail (statements belonging to this domain)
-- ---------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0050_location_foundation (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Business-location foundation. Single-location companies remain automatic;
-- multi-location companies get explicit staff scope and operational ownership.

-- Use insertion time for records that can be created repeatedly inside one
-- transaction. This keeps "latest" ordering deterministic.
alter table public.reconciliations
  alter column created_at set default clock_timestamp();

alter table public.inventory_batches
  alter column created_at set default clock_timestamp();

alter table public.companies
  add column if not exists commissions_enabled boolean not null default false;

grant update (commissions_enabled) on public.companies to authenticated;

comment on table public.stock_locations is
  'Business locations. A location may be a selling site, kiosk, warehouse, or office.';

alter table public.stock_locations
  add column if not exists is_active boolean not null default true;

-- Staff may work in one or many locations. Existing memberships keep their
-- current company-wide behaviour through an explicit assignment backfill.
create table public.company_membership_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (membership_id, location_id)
);

create index company_membership_locations_location_idx
  on public.company_membership_locations(company_id, location_id, membership_id);
create unique index company_membership_locations_one_primary_idx
  on public.company_membership_locations(membership_id) where is_primary;

alter table public.company_membership_locations enable row level security;
create policy "location assignments readable by company members"
  on public.company_membership_locations for select
  using (
    company_id = (select public.current_company_id())
    or (select public.is_platform_admin())
  );
grant select on public.company_membership_locations to authenticated;
grant all on public.company_membership_locations to service_role;

insert into public.company_membership_locations (
  company_id, membership_id, location_id, is_primary
)
select
  m.company_id,
  m.id,
  l.id,
  l.is_default
from public.company_memberships m
join public.stock_locations l on l.company_id = m.company_id
where m.authorization_status = 'approved'
on conflict (membership_id, location_id) do nothing;

create or replace function public.current_user_can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.company_memberships m
      join public.company_membership_locations ml on ml.membership_id = m.id
      join public.stock_locations l on l.id = ml.location_id
      where m.company_id = public.current_company_id()
        and m.user_id = auth.uid()
        and m.authorization_status = 'approved'
        and ml.location_id = p_location_id
        and ml.company_id = m.company_id
        and l.company_id = m.company_id
        and l.is_active
    )
$$;

revoke execute on function public.current_user_can_access_location(uuid) from anon, public;
grant execute on function public.current_user_can_access_location(uuid) to authenticated, service_role;

create or replace function public.resolve_business_location(p_location_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;

  if p_location_id is not null then
    select l.id into v_location_id
    from public.stock_locations l
    where l.id = p_location_id and l.company_id = v_company_id and l.is_active;
    if v_location_id is null or not public.current_user_can_access_location(v_location_id) then
      raise exception 'location_access_denied';
    end if;
    return v_location_id;
  end if;

  -- Compatibility path for single-location clients and old queued sales.
  -- New multi-location UI always sends an explicit location.
  select l.id into v_location_id
  from public.stock_locations l
  join public.company_memberships m
    on m.company_id = l.company_id and m.user_id = auth.uid()
  join public.company_membership_locations ml
    on ml.membership_id = m.id and ml.location_id = l.id
  where l.company_id = v_company_id and l.is_active
    and m.authorization_status = 'approved'
  order by ml.is_primary desc, l.is_default desc, l.created_at
  limit 1;

  if v_location_id is null then raise exception 'business_location_required'; end if;
  return v_location_id;
end;
$$;

revoke execute on function public.resolve_business_location(uuid) from anon, public;
grant execute on function public.resolve_business_location(uuid) to authenticated, service_role;

create or replace function public.accessible_business_locations()
returns table (
  id uuid,
  code text,
  name text,
  is_default boolean,
  is_primary boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.code, l.name, l.is_default, ml.is_primary
  from public.company_memberships m
  join public.company_membership_locations ml on ml.membership_id = m.id
  join public.stock_locations l on l.id = ml.location_id and l.company_id = m.company_id
  where m.company_id = public.current_company_id()
    and m.user_id = auth.uid()
    and m.authorization_status = 'approved'
    and l.is_active
  order by ml.is_primary desc, l.is_default desc, l.name
$$;

revoke execute on function public.accessible_business_locations() from anon, public;
grant execute on function public.accessible_business_locations() to authenticated, service_role;

create or replace function public.set_membership_locations(
  p_membership_id uuid,
  p_location_ids uuid[],
  p_primary_location_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageTeam') then
    raise exception 'permission_denied: ManageTeam required';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.id = p_membership_id and m.company_id = v_company_id
  ) then raise exception 'membership_not_found'; end if;
  if coalesce(cardinality(p_location_ids), 0) = 0 then
    raise exception 'at_least_one_location_required';
  end if;
  if p_primary_location_id is null or not (p_primary_location_id = any(p_location_ids)) then
    raise exception 'primary_location_must_be_selected';
  end if;
  if exists (
    select 1 from unnest(p_location_ids) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  delete from public.company_membership_locations where membership_id = p_membership_id;
  insert into public.company_membership_locations(
    company_id, membership_id, location_id, is_primary
  )
  select v_company_id, p_membership_id, x.id, x.id = p_primary_location_id
  from unnest(p_location_ids) x(id);
  return p_membership_id;
end;
$$;

revoke execute on function public.set_membership_locations(uuid, uuid[], uuid) from anon, public;
grant execute on function public.set_membership_locations(uuid, uuid[], uuid) to authenticated;

-- Company-level definitions, location-level availability and optional overrides.
alter table public.payment_methods
  add column if not exists availability_scope text not null default 'all_locations'
    check (availability_scope in ('all_locations', 'selected_locations'));

create table public.location_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  enabled boolean not null default true,
  ledger_account_code varchar(64),
  is_cashier_controlled boolean,
  requires_reconciliation boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, payment_method_id)
);

create index location_payment_methods_company_location_idx
  on public.location_payment_methods(company_id, location_id);
alter table public.location_payment_methods enable row level security;
create policy "location payment methods readable by company members"
  on public.location_payment_methods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(location_id))
    or (select public.is_platform_admin())
  );
grant select on public.location_payment_methods to authenticated;
grant all on public.location_payment_methods to service_role;

insert into public.location_payment_methods(company_id, location_id, payment_method_id)
select l.company_id, l.id, pm.id
from public.stock_locations l
join public.payment_methods pm on pm.company_id = l.company_id
on conflict (location_id, payment_method_id) do nothing;

create or replace function public.available_payment_methods(p_location_id uuid default null)
returns table (
  code text,
  name text,
  ledger_account_code varchar,
  is_cashier_controlled boolean,
  requires_reconciliation boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select
    pm.code,
    pm.name,
    coalesce(lpm.ledger_account_code, pm.ledger_account_code),
    coalesce(lpm.is_cashier_controlled, pm.is_cashier_controlled),
    coalesce(lpm.requires_reconciliation, pm.requires_reconciliation)
  from public.payment_methods pm
  join public.location_payment_methods lpm
    on lpm.payment_method_id = pm.id and lpm.location_id = v_location_id
  where pm.company_id = v_company_id and pm.enabled and lpm.enabled
  order by pm.name;
end;
$$;

revoke execute on function public.available_payment_methods(uuid) from anon, public;
grant execute on function public.available_payment_methods(uuid) to authenticated, service_role;

create or replace function public.set_payment_method_locations(
  p_code text,
  p_location_ids uuid[],
  p_all_locations boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_method_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageReconciliation') then
    raise exception 'permission_denied: ManageReconciliation required';
  end if;

  select id into v_method_id from public.payment_methods
  where company_id = v_company_id and code = p_code for update;
  if v_method_id is null then raise exception 'payment_method_not_found: %', p_code; end if;

  if exists (
    select 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) x(id)
    where not exists (
      select 1 from public.stock_locations l
      where l.id = x.id and l.company_id = v_company_id and l.is_active
    )
  ) then raise exception 'invalid_business_location'; end if;

  update public.payment_methods
  set availability_scope = case when p_all_locations then 'all_locations' else 'selected_locations' end,
      updated_at = now()
  where id = v_method_id;

  delete from public.location_payment_methods where payment_method_id = v_method_id;
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select v_company_id, l.id, v_method_id
  from public.stock_locations l
  where l.company_id = v_company_id and l.is_active
    and (p_all_locations or l.id = any(coalesce(p_location_ids, '{}'::uuid[])));

  return v_method_id;
end;
$$;

revoke execute on function public.set_payment_method_locations(text, uuid[], boolean)
  from anon, public;
grant execute on function public.set_payment_method_locations(text, uuid[], boolean)
  to authenticated;

-- New locations inherit company-wide methods and are assigned to existing
-- approved staff. Managers can narrow assignments later without changing data ownership.
create or replace function public.bootstrap_business_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location_payment_methods(company_id, location_id, payment_method_id)
  select new.company_id, new.id, pm.id
  from public.payment_methods pm
  where pm.company_id = new.company_id and pm.availability_scope = 'all_locations'
  on conflict (location_id, payment_method_id) do nothing;

  insert into public.company_membership_locations(company_id, membership_id, location_id, is_primary)
  select new.company_id, m.id, new.id, false
  from public.company_memberships m
  where m.company_id = new.company_id and m.authorization_status = 'approved'
  on conflict (membership_id, location_id) do nothing;
  return new;
end;
$$;

create trigger stock_locations_bootstrap_business_location
  after insert on public.stock_locations
  for each row execute function public.bootstrap_business_location();

create or replace function public.bootstrap_membership_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
begin
  if new.authorization_status <> 'approved' then return new; end if;
  select l.id into v_location_id
  from public.stock_locations l
  where l.company_id = new.company_id and l.is_active
  order by l.is_default desc, l.created_at
  limit 1;
  if v_location_id is not null then
    insert into public.company_membership_locations(
      company_id, membership_id, location_id, is_primary
    ) values (new.company_id, new.id, v_location_id, true)
    on conflict (membership_id, location_id) do update set is_primary = true;
  end if;
  return new;
end;
$$;

create trigger company_memberships_bootstrap_location
  after insert or update of authorization_status on public.company_memberships
  for each row execute function public.bootstrap_membership_location();

create or replace function public.bootstrap_payment_method_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.availability_scope = 'all_locations' then
    insert into public.location_payment_methods(company_id, location_id, payment_method_id)
    select new.company_id, l.id, new.id
    from public.stock_locations l
    where l.company_id = new.company_id and l.is_active
    on conflict (location_id, payment_method_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger payment_methods_bootstrap_locations
  after insert on public.payment_methods
  for each row execute function public.bootstrap_payment_method_locations();
alter table public.payments add column if not exists location_id uuid references public.stock_locations(id);
alter table public.refunds add column if not exists location_id uuid references public.stock_locations(id);
alter table public.cashier_sessions add column if not exists location_id uuid references public.stock_locations(id);
alter table public.reconciliations add column if not exists location_id uuid references public.stock_locations(id);
alter table public.mpesa_verifications add column if not exists location_id uuid references public.stock_locations(id);
alter table public.inventory_movements add column if not exists stock_location_id uuid references public.stock_locations(id);

update public.orders o
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = o.company_id order by l.is_default desc, l.created_at limit 1
)
where o.location_id is null;
update public.payments p set location_id = o.location_id
from public.orders o where o.id = p.order_id and p.location_id is null;
update public.refunds r set location_id = o.location_id
from public.orders o where o.id = r.order_id and r.location_id is null;
update public.cashier_sessions s
set location_id = (
  select l.id from public.stock_locations l
  where l.company_id = s.company_id order by l.is_default desc, l.created_at limit 1
)
where s.location_id is null;
update public.reconciliations r set location_id = s.location_id
from public.cashier_sessions s
where r.scope = 'cash-session' and split_part(r.scope_ref_id, ':', 1) = s.id::text
  and r.location_id is null;
update public.mpesa_verifications m set location_id = s.location_id
from public.cashier_sessions s where s.id = m.session_id and m.location_id is null;
update public.inventory_movements m set stock_location_id = b.stock_location_id
from public.inventory_batches b where b.id = m.batch_id and m.stock_location_id is null;
update public.purchases p
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = p.company_id order by l.is_default desc, l.created_at limit 1
)
where p.stock_location_id is null;
update public.inventory_batches b
set stock_location_id = (
  select l.id from public.stock_locations l
  where l.company_id = b.company_id order by l.is_default desc, l.created_at limit 1
)
where b.stock_location_id is null;

alter table public.orders alter column location_id set not null;
alter table public.payments alter column location_id set not null;
alter table public.refunds alter column location_id set not null;
alter table public.cashier_sessions alter column location_id set not null;
alter table public.purchases alter column stock_location_id set not null;
alter table public.inventory_batches alter column stock_location_id set not null;

create index orders_company_location_completed_idx
  on public.orders(company_id, location_id, completed_at desc);
create index cashier_sessions_company_location_idx
  on public.cashier_sessions(company_id, location_id, status);
create index inventory_batches_location_variant_idx
  on public.inventory_batches(company_id, stock_location_id, variant_id, purchased_at)
  where remaining > 0;

drop index if exists public.cashier_sessions_one_open;
create unique index cashier_sessions_one_open_per_location
  on public.cashier_sessions(company_id, location_id) where status = 'open';

create or replace function public.assign_operational_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if tg_table_name = 'payments' or tg_table_name = 'refunds' then
    select o.location_id into new.location_id
    from public.orders o where o.id = new.order_id and o.company_id = new.company_id;
  elsif tg_table_name = 'inventory_movements' then
    if nullif(to_jsonb(new) ->> 'batch_id', '') is not null then
      select b.stock_location_id into new.stock_location_id
      from public.inventory_batches b
      where b.id = (to_jsonb(new) ->> 'batch_id')::uuid and b.company_id = new.company_id;
    end if;
  elsif tg_table_name = 'purchases' then
    if new.stock_location_id is null then
      new.stock_location_id := public.resolve_business_location(null);
    elsif not public.current_user_can_access_location(new.stock_location_id) then
      raise exception 'location_access_denied';
    end if;
  else
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    new.location_id := public.resolve_business_location(coalesce(new.location_id, v_requested));
  end if;
  return new;
end;
$$;

create trigger orders_assign_operational_location
  before insert on public.orders
  for each row execute function public.assign_operational_location();
create trigger payments_assign_operational_location
  before insert on public.payments
  for each row execute function public.assign_operational_location();
create trigger refunds_assign_operational_location
  before insert on public.refunds
  for each row execute function public.assign_operational_location();
create trigger cashier_sessions_assign_operational_location
  before insert on public.cashier_sessions
  for each row execute function public.assign_operational_location();
create trigger purchases_assign_operational_location
  before insert on public.purchases
  for each row execute function public.assign_operational_location();
create trigger inventory_movements_assign_operational_location
  before insert on public.inventory_movements
  for each row execute function public.assign_operational_location();

-- Legacy imports/tests may insert valuation layers directly. They still land
-- in a real location: explicit context first, then company default.
create or replace function public.assign_inventory_batch_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested uuid;
begin
  if new.stock_location_id is null then
    begin
      v_requested := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_requested := null;
    end;
    if v_requested is not null and exists (
      select 1 from public.stock_locations l
      where l.id = v_requested and l.company_id = new.company_id and l.is_active
    ) then
      new.stock_location_id := v_requested;
    else
      select l.id into new.stock_location_id
      from public.stock_locations l
      where l.company_id = new.company_id and l.is_active
      order by l.is_default desc, l.created_at
      limit 1;
    end if;
  elsif not exists (
    select 1 from public.stock_locations l
    where l.id = new.stock_location_id and l.company_id = new.company_id and l.is_active
  ) then
    raise exception 'invalid_business_location';
  end if;
  if new.stock_location_id is null then raise exception 'business_location_required'; end if;
  return new;
end;
$$;

create trigger inventory_batches_assign_location
  before insert on public.inventory_batches
  for each row execute function public.assign_inventory_batch_location();

create or replace function public.save_draft_at_location(
  p_location_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_draft_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_order_id uuid;
begin
  perform set_config('app.business_location_id', v_location_id::text, true);
  v_order_id := public.save_draft(p_customer_id, p_lines, p_draft_id);
  if not exists (
    select 1 from public.orders o where o.id = v_order_id and o.location_id = v_location_id
  ) then raise exception 'draft_belongs_to_another_location'; end if;
  return v_order_id;
end;
$$;

revoke execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  from anon, public;
grant execute on function public.save_draft_at_location(uuid, uuid, jsonb, uuid)
  to authenticated;

-- Location-aware FIFO while preserving the established internal signature.
create or replace function public.consume_fifo(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_source_type text,
  p_source_id text,
  p_movement_type text default 'sale'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_cost bigint;
  v_total bigint := 0;
  v_allocations jsonb := '[]'::jsonb;
  v_available numeric;
  v_location_id uuid;
begin
  if p_source_type = 'Sale' then
    select o.location_id into v_location_id
    from public.orders o
    where o.id = p_source_id::uuid and o.company_id = p_company_id;
  end if;
  if v_location_id is null then
    begin
      v_location_id := nullif(current_setting('app.business_location_id', true), '')::uuid;
    exception when invalid_text_representation then
      v_location_id := null;
    end;
  end if;
  if v_location_id is null then
    select l.id into v_location_id from public.stock_locations l
    where l.company_id = p_company_id and l.is_active
    order by l.is_default desc, l.created_at limit 1;
  end if;

  select coalesce(sum(remaining), 0) into v_available
  from public.inventory_batches
  where company_id = p_company_id and variant_id = p_variant_id
    and stock_location_id = v_location_id and remaining > 0;

  if v_available < p_quantity then
    raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
      p_variant_id, v_available, p_quantity;
  end if;

  for v_batch in
    select id, remaining, unit_cost
    from public.inventory_batches
    where company_id = p_company_id and variant_id = p_variant_id
      and stock_location_id = v_location_id and remaining > 0
    order by purchased_at, created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.remaining, v_remaining);
    v_cost := round(v_take * v_batch.unit_cost);
    v_total := v_total + v_cost;
    v_remaining := v_remaining - v_take;
    update public.inventory_batches set remaining = remaining - v_take where id = v_batch.id;
    insert into public.inventory_movements (
      company_id, variant_id, batch_id, stock_location_id, type, quantity,
      unit_cost, total_cost, source_type, source_id
    ) values (
      p_company_id, p_variant_id, v_batch.id, v_location_id, p_movement_type,
      -v_take, v_batch.unit_cost, v_cost, p_source_type, p_source_id
    );
    v_allocations := v_allocations || jsonb_build_object(
      'batch_id', v_batch.id, 'quantity', v_take,
      'unit_cost', v_batch.unit_cost, 'total_cost', v_cost,
      'location_id', v_location_id
    );
  end loop;
  return jsonb_build_object('allocations', v_allocations, 'total_cogs', v_total);
end;
$$;

-- Validate sale payment availability at the order's location.
create or replace function public.validate_payment_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payment_methods pm
    join public.location_payment_methods lpm
      on lpm.payment_method_id = pm.id and lpm.location_id = new.location_id
    where pm.company_id = new.company_id and pm.code = new.method_code
      and pm.enabled and lpm.enabled
  ) then
    raise exception 'payment_method_unavailable_at_location: %', new.method_code;
  end if;
  return new;
end;
$$;

create trigger payments_validate_location
  before insert on public.payments
  for each row execute function public.validate_payment_location();

-- Feature preferences. Tier capability and company opt-in stay separate.
create or replace function public.set_commissions_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCommissions') then
    raise exception 'permission_denied: ManageCommissions required';
  end if;
  if p_enabled and not coalesce(public.feature_enabled(v_company_id, 'commissions'), false) then
    raise exception 'feature_unavailable: commissions; upgrade your plan';
  end if;
  update public.companies set commissions_enabled = p_enabled, updated_at = now()
  where id = v_company_id;
  return p_enabled;
end;
$$;

revoke execute on function public.set_commissions_enabled(boolean) from anon, public;
grant execute on function public.set_commissions_enabled(boolean) to authenticated;

create or replace function public.current_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'companyId', c.id,
    'status', c.subscription_status,
    'tierCode', t.code,
    'tierName', t.name,
    'features', coalesce(t.features, '{}'::jsonb),
    'settings', jsonb_build_object('commissionsEnabled', c.commissions_enabled),
    'limits', coalesce(t.limits, '{}'::jsonb),
    'usage', jsonb_build_object(
      'stockLocations', (select count(*) from public.stock_locations l where l.company_id = c.id and l.is_active),
      'products', (select count(*) from public.product_variants v where v.company_id = c.id and v.active),
      'ordersThisMonth', (select count(*) from public.orders o where o.company_id = c.id
        and o.created_at >= date_trunc('month', now()) and o.status <> 'voided'),
      'teamMembers', (select count(*) from public.company_memberships m where m.company_id = c.id
        and m.authorization_status = 'approved')
    )
  ) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;
  return v_result;
end;
$$;

-- Live dashboard: same detail data plus location comparison and prior-period totals.
create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date - 6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_since date := coalesce(p_since, (now() at time zone 'Africa/Nairobi')::date - 6);
  v_location_id uuid := p_location_id;
  v_days int;
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ViewFinancials') then
    raise exception 'permission_denied: ViewFinancials required';
  end if;
  if v_location_id is not null and not public.current_user_can_access_location(v_location_id) then
    raise exception 'location_access_denied';
  end if;
  v_days := greatest(((now() at time zone 'Africa/Nairobi')::date - v_since) + 1, 1);

  with accessible as (
    select id from public.accessible_business_locations()
  ), scoped_orders as (
    select o.*, (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date as day
    from public.orders o
    where o.company_id = v_company_id and o.status = 'completed'
      and o.location_id in (select id from accessible)
      and (v_location_id is null or o.location_id = v_location_id)
      and (coalesce(o.completed_at, o.created_at) at time zone 'Africa/Nairobi')::date >= v_since - v_days
  ), order_costs as (
    select o.id, o.location_id, o.day, o.total,
      coalesce(sum(jl.debit) filter (where a.code = 'COGS'), 0)::bigint as cogs,
      coalesce((select sum(ol.quantity) from public.order_lines ol where ol.order_id = o.id), 0) as quantity
    from scoped_orders o
    left join public.ledger_journal_lines jl on jl.order_id = o.id and jl.company_id = o.company_id
    left join public.ledger_accounts a on a.id = jl.account_id
    group by o.id, o.location_id, o.day, o.total
  ), current_orders as (
    select * from order_costs where day >= v_since
  ), summary as (
    select day, count(*)::int as orders, sum(total)::bigint as revenue,
      sum(cogs)::bigint as cogs, (sum(total) - sum(cogs))::bigint as margin
    from current_orders group by day
  ), product_sales as (
    select o.day, ol.variant_id, sum(ol.quantity) as quantity,
      sum(ol.line_total)::bigint as revenue,
      coalesce(sum(round(o.cogs * ol.line_total::numeric / nullif(o.total, 0))), 0)::bigint as cogs
    from current_orders o join public.order_lines ol on ol.order_id = o.id
    group by o.day, ol.variant_id
  ), locations as (
    select l.id as location_id, l.name as location_name,
      count(o.id)::int as orders,
      coalesce(sum(o.total), 0)::bigint as revenue,
      coalesce(sum(o.quantity), 0) as quantity,
      coalesce(sum(o.cogs), 0)::bigint as cogs,
      (coalesce(sum(o.total), 0) - coalesce(sum(o.cogs), 0))::bigint as margin
    from public.stock_locations l
    join accessible x on x.id = l.id
    left join current_orders o on o.location_id = l.id
    where l.company_id = v_company_id and l.is_active
    group by l.id, l.name
  ), comparison as (
    select
      coalesce(sum(total) filter (where day >= v_since), 0)::bigint as current_revenue,
      coalesce(sum(quantity) filter (where day >= v_since), 0) as current_quantity,
      count(*) filter (where day >= v_since)::int as current_orders,
      coalesce(sum(total) filter (where day < v_since), 0)::bigint as previous_revenue,
      coalesce(sum(quantity) filter (where day < v_since), 0) as previous_quantity,
      count(*) filter (where day < v_since)::int as previous_orders
    from order_costs
  )
  select jsonb_build_object(
    'summary', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from summary s), '[]'::jsonb),
    'productSales', coalesce((select jsonb_agg(to_jsonb(p) order by p.day, p.variant_id) from product_sales p), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.revenue desc, l.location_name) from locations l), '[]'::jsonb),
    'comparison', coalesce((select to_jsonb(c) from comparison c), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.dashboard_location_snapshot(date, uuid) from anon, public;
grant execute on function public.dashboard_location_snapshot(date, uuid) to authenticated;

create or replace function public.location_stock_snapshot(p_location_id uuid default null)
returns table (variant_id uuid, stock numeric, stock_value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  return query
  select v.id,
    coalesce(sum(b.remaining), 0)::numeric,
    coalesce(sum(b.remaining * b.unit_cost), 0)::bigint
  from public.product_variants v
  left join public.inventory_batches b
    on b.variant_id = v.id and b.stock_location_id = v_location_id and b.remaining > 0
  where v.company_id = v_company_id
  group by v.id;
end;
$$;

revoke execute on function public.location_stock_snapshot(uuid) from anon, public;
grant execute on function public.location_stock_snapshot(uuid) to authenticated, service_role;

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
  v_total bigint;
  v_batch_id uuid;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    return public.post_inventory_write_off(p_variant_id, abs(v_change), trim(p_reason));
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

revoke execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  from anon, public;
grant execute on function public.post_stock_adjustment_at_location(uuid, uuid, numeric, numeric, text, bigint)
  to authenticated;

-- Stock transfers preserve valuation layers and never post a ledger entry:
-- company inventory value is unchanged; only physical custody moves.
alter table public.inventory_movements
  drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_type_check
  check (type in ('purchase', 'sale', 'adjustment', 'reversal', 'transfer_out', 'transfer_in'));

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_location_id uuid not null references public.stock_locations(id),
  to_location_id uuid not null references public.stock_locations(id),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  source_batch_id uuid not null references public.inventory_batches(id),
  destination_batch_id uuid not null references public.inventory_batches(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost bigint not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index stock_transfers_company_created_idx
  on public.stock_transfers(company_id, created_at desc);
create index stock_transfer_lines_transfer_idx
  on public.stock_transfer_lines(transfer_id, variant_id);

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;
create policy "stock transfers readable in assigned locations"
  on public.stock_transfers for select
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_can_access_location(from_location_id))
    and (select public.current_user_can_access_location(to_location_id))
    or (select public.is_platform_admin())
  );
create policy "stock transfer lines readable with transfer"
  on public.stock_transfer_lines for select
  using (
    exists (
      select 1 from public.stock_transfers t
      where t.id = stock_transfer_lines.transfer_id
        and t.company_id = stock_transfer_lines.company_id
    )
    or (select public.is_platform_admin())
  );
grant select on public.stock_transfers, public.stock_transfer_lines to authenticated;
grant all on public.stock_transfers, public.stock_transfer_lines to service_role;

create trigger stock_transfers_audit
  after insert or update or delete on public.stock_transfers
  for each row execute function public.audit_trigger();

create or replace function public.transfer_stock(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_transfer_id uuid;
  v_line jsonb;
  v_variant_id uuid;
  v_requested numeric;
  v_remaining numeric;
  v_available numeric;
  v_take numeric;
  v_cost bigint;
  v_source record;
  v_destination_batch_id uuid;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if not coalesce(public.feature_enabled(v_company_id, 'multipleLocations'), false) then
    raise exception 'feature_unavailable: multiple locations; upgrade your plan';
  end if;
  if p_from_location_id = p_to_location_id then raise exception 'transfer_locations_must_differ'; end if;
  if not public.current_user_can_access_location(p_from_location_id)
    or not public.current_user_can_access_location(p_to_location_id) then
    raise exception 'location_access_denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'transfer_lines_required';
  end if;

  insert into public.stock_transfers(
    company_id, from_location_id, to_location_id, notes, created_by
  ) values (
    v_company_id, p_from_location_id, p_to_location_id,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into v_transfer_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant_id := nullif(v_line ->> 'variant_id', '')::uuid;
    v_requested := nullif(v_line ->> 'quantity', '')::numeric;
    if v_variant_id is null or v_requested is null or v_requested <= 0 then
      raise exception 'invalid_transfer_line';
    end if;
    if not exists (
      select 1 from public.product_variants v
      where v.id = v_variant_id and v.company_id = v_company_id and v.track_inventory
    ) then raise exception 'invalid_transfer_variant'; end if;

    perform 1 from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0
    order by b.purchased_at, b.created_at for update;

    select coalesce(sum(b.remaining), 0) into v_available
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = v_variant_id
      and b.stock_location_id = p_from_location_id and b.remaining > 0;
    if v_available < v_requested then
      raise exception 'insufficient_stock_at_location: variant % has % available, % requested',
        v_variant_id, v_available, v_requested;
    end if;

    v_remaining := v_requested;
    for v_source in
      select b.* from public.inventory_batches b
      where b.company_id = v_company_id and b.variant_id = v_variant_id
        and b.stock_location_id = p_from_location_id and b.remaining > 0
      order by b.purchased_at, b.created_at
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_source.remaining, v_remaining);
      v_cost := round(v_take * v_source.unit_cost);
      update public.inventory_batches set remaining = remaining - v_take where id = v_source.id;

      insert into public.inventory_batches(
        company_id, variant_id, stock_location_id, supplier_id, quantity, remaining,
        unit_cost, purchased_at, expiry_date, batch_number
      ) values (
        v_company_id, v_variant_id, p_to_location_id, v_source.supplier_id, v_take, v_take,
        v_source.unit_cost, v_source.purchased_at, v_source.expiry_date, v_source.batch_number
      ) returning id into v_destination_batch_id;

      insert into public.stock_transfer_lines(
        company_id, transfer_id, variant_id, source_batch_id,
        destination_batch_id, quantity, unit_cost
      ) values (
        v_company_id, v_transfer_id, v_variant_id, v_source.id,
        v_destination_batch_id, v_take, v_source.unit_cost
      );

      insert into public.inventory_movements(
        company_id, variant_id, batch_id, stock_location_id, type, quantity,
        unit_cost, total_cost, source_type, source_id, meta
      ) values
        (v_company_id, v_variant_id, v_source.id, p_from_location_id, 'transfer_out',
         -v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('toLocationId', p_to_location_id)),
        (v_company_id, v_variant_id, v_destination_batch_id, p_to_location_id, 'transfer_in',
         v_take, v_source.unit_cost, v_cost, 'StockTransfer', v_transfer_id::text,
         jsonb_build_object('fromLocationId', p_from_location_id));
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;
  return v_transfer_id;
end;
$$;

revoke execute on function public.transfer_stock(uuid, uuid, jsonb, text) from anon, public;
grant execute on function public.transfer_stock(uuid, uuid, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- [squashed] 0050_staff_sales_performance (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- reversals, refunds and voids become dated negative events.
-- ---------------------------------------------------------------------------
create or replace function public.sales_collection_events(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  event_key text,
  event_type text,
  occurred_on date,
  staff_user_id uuid,
  order_id uuid,
  basis_amount bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'payment:' || p.id::text,
    'payment'::text,
    (p.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    p.amount::bigint
  from public.payments p
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where p.company_id = p_company_id
    and (p.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'payment_reversal:' || p.id::text,
    'payment_reversal'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -p.amount::bigint
  from public.ledger_journal_entries e
  join public.payments p on e.source_id = p.id::text || '-reversal'
  join public.orders o on o.id = p.order_id and o.company_id = p.company_id
  where e.company_id = p_company_id
    and e.source_type = 'PaymentReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'refund:' || r.id::text,
    'refund'::text,
    (r.created_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -r.amount::bigint
  from public.refunds r
  join public.orders o on o.id = r.order_id and o.company_id = r.company_id
  where r.company_id = p_company_id
    and (r.created_at at time zone 'Africa/Nairobi')::date between p_from and p_to

  union all

  select
    'void:' || o.id::text,
    'void'::text,
    (e.posted_at at time zone 'Africa/Nairobi')::date,
    o.created_by,
    o.id,
    -greatest(
      coalesce((
        select sum(p.amount)
        from public.payments p
        where p.order_id = o.id
          and not exists (
            select 1 from public.ledger_journal_entries pr
            where pr.company_id = o.company_id
              and pr.source_type = 'PaymentReversal'
              and pr.source_id = p.id::text || '-reversal'
          )
      ), 0)
      - coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
      0
    )::bigint
  from public.ledger_journal_entries e
  join public.orders o
    on e.company_id = o.company_id
   and e.source_id = o.id::text || '-reversal'
  where e.company_id = p_company_id
    and e.source_type = 'OrderReversal'
    and (e.posted_at at time zone 'Africa/Nairobi')::date between p_from and p_to
$$;

revoke execute on function public.sales_collection_events(uuid, date, date)
  from authenticated, anon, public;
grant execute on function public.sales_collection_events(uuid, date, date) to service_role;

-- ---------------------------------------------------------------------------
-- [squashed] 0051_commissions (statements belonging to this domain)
-- ---------------------------------------------------------------------------

create or replace function public.commissions_available(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.feature_enabled(p_company_id, 'commissions'), false)
    and coalesce((select c.commissions_enabled from public.companies c where c.id = p_company_id), false)
$$;

revoke execute on function public.commissions_available(uuid) from anon, public;
grant execute on function public.commissions_available(uuid) to authenticated, service_role;

create policy "commission plans readable by managers or assignees"
  on public.commission_plans for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_assignments a
        where a.plan_id = commission_plans.id and a.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission assignments readable by managers or assignee"
  on public.commission_assignments for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

create policy "commission periods readable by managers or included staff"
  on public.commission_periods for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      (select public.current_user_has_permission('ManageCommissions'))
      or exists (
        select 1 from public.commission_lines l
        where l.period_id = commission_periods.id and l.staff_user_id = auth.uid()
      )
    )
    or (select public.is_platform_admin())
  );

create policy "commission lines readable by managers or recipient"
  on public.commission_lines for select
  using (
    company_id = (select public.current_company_id())
    and (select public.commissions_available(company_id))
    and (
      staff_user_id = auth.uid()
      or (select public.current_user_has_permission('ManageCommissions'))
    )
    or (select public.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- [squashed] 0053_stock_adjustment_history (statements belonging to this domain)
-- ---------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- Readable, location-scoped stock-adjustment history. FIFO write-offs may
-- create several movements, so the feed groups them into one user action.

create or replace function public.post_stock_adjustment_at_location(
  p_location_id uuid,
  p_variant_id uuid,
  p_expected_quantity numeric,
  p_new_quantity numeric,
  p_reason text,
  p_unit_cost bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_adjustment_id uuid := gen_random_uuid();
  v_current numeric;
  v_change numeric;
  v_allow_fractional boolean;
  v_unit_cost bigint;
  v_total bigint;
  v_batch_id uuid;
  v_entry_id uuid;
  v_source_id text;
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;
  if p_expected_quantity is null or p_expected_quantity < 0 then raise exception 'invalid_expected_quantity'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then raise exception 'new_quantity_must_be_zero_or_more'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'adjustment_reason_required'; end if;

  select v.allow_fractional into v_allow_fractional
  from public.product_variants v
  where v.id = p_variant_id and v.company_id = v_company_id
    and v.track_inventory and v.kind <> 'service';
  if not found then raise exception 'variant_does_not_track_inventory'; end if;
  if not v_allow_fractional and p_new_quantity <> trunc(p_new_quantity) then
    raise exception 'fractional_quantity_not_allowed';
  end if;

  perform 1 from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id
  order by b.id for update;
  select coalesce(sum(b.remaining), 0) into v_current
  from public.inventory_batches b
  where b.company_id = v_company_id and b.variant_id = p_variant_id
    and b.stock_location_id = v_location_id;
  if v_current <> p_expected_quantity then
    raise exception 'stock_changed: expected %, current %; refresh and recount',
      p_expected_quantity, v_current;
  end if;

  v_change := p_new_quantity - v_current;
  if v_change = 0 then return null; end if;
  perform set_config('app.business_location_id', v_location_id::text, true);
  if v_change < 0 then
    v_entry_id := public.post_inventory_write_off(
      p_variant_id, abs(v_change), trim(p_reason)
    );
    select e.source_id into v_source_id
    from public.ledger_journal_entries e where e.id = v_entry_id;
    update public.inventory_movements m
    set meta = coalesce(m.meta, '{}'::jsonb) || jsonb_build_object(
      'reason', trim(p_reason),
      'previousQuantity', v_current,
      'newQuantity', p_new_quantity,
      'locationId', v_location_id
    )
    where m.company_id = v_company_id
      and m.source_type = 'InventoryWriteOff'
      and m.source_id = v_source_id;
    return v_entry_id;
  end if;

  v_unit_cost := p_unit_cost;
  if v_unit_cost is null then
    select b.unit_cost into v_unit_cost
    from public.inventory_batches b
    where b.company_id = v_company_id and b.variant_id = p_variant_id
      and b.stock_location_id = v_location_id
    order by (b.remaining > 0) desc, b.purchased_at desc, b.created_at desc limit 1;
  end if;
  if v_unit_cost is null or v_unit_cost <= 0 then raise exception 'unit_cost_required_for_stock_increase'; end if;
  v_total := round(v_change * v_unit_cost)::bigint;

  insert into public.inventory_batches(
    company_id, variant_id, stock_location_id, quantity, remaining, unit_cost, purchased_at
  ) values (
    v_company_id, p_variant_id, v_location_id, v_change, v_change, v_unit_cost, clock_timestamp()
  ) returning id into v_batch_id;
  insert into public.inventory_movements(
    company_id, variant_id, batch_id, stock_location_id, type, quantity,
    unit_cost, total_cost, source_type, source_id, meta
  ) values (
    v_company_id, p_variant_id, v_batch_id, v_location_id, 'adjustment', v_change,
    v_unit_cost, v_total, 'StockAdjustment', v_adjustment_id::text,
    jsonb_build_object('reason', trim(p_reason), 'previousQuantity', v_current,
      'newQuantity', p_new_quantity, 'locationId', v_location_id)
  );
  return public.post_journal_entry(
    v_company_id, 'StockAdjustment', v_adjustment_id::text,
    'Stock adjustment · ' || trim(p_reason),
    jsonb_build_array(
      jsonb_build_object('account_code', 'INVENTORY', 'debit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason))),
      jsonb_build_object('account_code', 'INVENTORY_ADJUSTMENT', 'credit', v_total,
        'meta', jsonb_build_object('adjustmentId', v_adjustment_id, 'variantId', p_variant_id,
          'batchId', v_batch_id, 'locationId', v_location_id, 'reason', trim(p_reason)))
    )
  );
end;
$$;

create or replace function public.stock_adjustment_history(
  p_location_id uuid,
  p_variant_id uuid default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  adjustment_id text,
  adjusted_at timestamptz,
  variant_id uuid,
  product_name text,
  variant_name text,
  sku text,
  location_id uuid,
  location_name text,
  quantity_change numeric,
  quantity_before numeric,
  quantity_after numeric,
  stock_value bigint,
  reason text,
  actor_id uuid,
  actor_name text,
  batch_movements integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_location_id uuid := public.resolve_business_location(p_location_id);
begin
  if not public.current_user_has_permission('ManageStockAdjustments') then
    raise exception 'permission_denied: ManageStockAdjustments required';
  end if;

  return query
  with grouped as (
    select
      m.source_id as adjustment_id,
      max(m.created_at) as adjusted_at,
      m.variant_id,
      p.name::text as product_name,
      v.name::text as variant_name,
      v.sku::text,
      m.stock_location_id as location_id,
      l.name::text as location_name,
      sum(m.quantity)::numeric as quantity_change,
      max(nullif(m.meta ->> 'previousQuantity', '')::numeric) as quantity_before,
      max(nullif(m.meta ->> 'newQuantity', '')::numeric) as quantity_after,
      coalesce(sum(m.total_cost), 0)::bigint as stock_value,
      coalesce(
        max(nullif(m.meta ->> 'reason', '')),
        regexp_replace(max(e.memo), '^Stock adjustment · ', '')
      )::text as reason,
      max(m.actor::text)::uuid as actor_id,
      coalesce(
        max(sp.display_name),
        case when max(m.actor::text) is not null then 'User …' || right(max(m.actor::text), 6) end,
        'System'
      )::text as actor_name,
      count(*)::integer as batch_movements
    from public.inventory_movements m
    join public.product_variants v on v.id = m.variant_id and v.company_id = m.company_id
    join public.products p on p.id = v.product_id and p.company_id = m.company_id
    join public.stock_locations l on l.id = m.stock_location_id
    left join public.ledger_journal_entries e
      on e.company_id = m.company_id and e.source_id = m.source_id
      and e.source_type in ('StockAdjustment', 'InventoryWriteOff')
    left join public.company_staff_profiles sp
      on sp.company_id = m.company_id and sp.user_id = m.actor
    where m.company_id = v_company_id
      and m.stock_location_id = v_location_id
      and m.source_type in ('StockAdjustment', 'InventoryWriteOff')
      and (p_variant_id is null or m.variant_id = p_variant_id)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', p.name, v.name, v.sku, m.meta ->> 'reason', e.memo)
          ilike '%' || trim(p_search) || '%'
      )
    group by m.source_id, m.variant_id, p.name, v.name, v.sku,
      m.stock_location_id, l.name
  )
  select g.*, count(*) over()::bigint as total_count
  from grouped g
  order by g.adjusted_at desc, g.adjustment_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  from anon, public;
grant execute on function public.stock_adjustment_history(uuid, uuid, text, integer, integer)
  to authenticated;

-- ----------------------------------------------------------------------------
