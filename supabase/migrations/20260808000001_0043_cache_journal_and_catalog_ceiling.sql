-- Durable client-cache coherence and the non-Enterprise catalogue ceiling.

-- ---------------------------------------------------------------------------
-- Subscription product limits are always explicit and bounded. Standard keeps
-- its existing 5,000 limit; null/unbounded legacy tiers become the platform
-- maximum and values above it are brought back inside the supported contract.
-- ---------------------------------------------------------------------------
do $$
declare
  v_affected text;
begin
  select string_agg(format('%s=%s', code, coalesce(max_products::text, 'null')), ', ' order by code)
    into v_affected
  from public.subscription_tiers
  where max_products is null or max_products > 10000;

  if v_affected is not null then
    raise notice 'Normalizing subscription tier product limits: %', v_affected;
  end if;
end;
$$;

update public.subscription_tiers
set max_products = 10000, updated_at = now()
where max_products is null or max_products > 10000;

alter table public.subscription_tiers
  alter column max_products set default 10000,
  alter column max_products set not null,
  drop constraint if exists subscription_tiers_max_products_check;

alter table public.subscription_tiers
  add constraint subscription_tiers_max_products_check
  check (max_products between 0 and 10000);

create or replace function public.validate_subscription_tier_product_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.max_products := coalesce(new.max_products, 10000);
  if new.max_products > 10000 then
    raise exception 'enterprise_required: product limits above 10,000 require Enterprise';
  end if;
  if new.max_products < 0 then
    raise exception 'invalid_tier: product limit must be between 0 and 10,000';
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_tiers_validate_product_limit on public.subscription_tiers;
create trigger subscription_tiers_validate_product_limit
before insert or update of max_products on public.subscription_tiers
for each row execute function public.validate_subscription_tier_product_limit();

revoke execute on function public.validate_subscription_tier_product_limit()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Transactional usage counter. The trigger owns this value; reconciliation is
-- an explicit repair tool, not part of the product write hot path.
-- ---------------------------------------------------------------------------
create table public.company_usage_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  active_variants integer not null default 0 check (active_variants >= 0),
  reconciled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_usage_counters(company_id, active_variants)
select c.id, count(v.id)::integer
from public.companies c
left join public.product_variants v on v.company_id = c.id and v.active
group by c.id;

do $$
declare
  v_over text;
begin
  select string_agg(format('%s=%s', c.code, u.active_variants), ', ' order by c.code)
    into v_over
  from public.company_usage_counters u
  join public.companies c on c.id = u.company_id
  where u.active_variants > 10000;
  if v_over is not null then
    raise exception 'enterprise_required: existing companies exceed 10,000 active variants: %', v_over;
  end if;
end;
$$;

alter table public.company_usage_counters
  add constraint company_usage_counters_active_variants_ceiling
  check (active_variants <= 10000);

alter table public.company_usage_counters enable row level security;
grant select on public.company_usage_counters to authenticated;
grant all on public.company_usage_counters to service_role;

create policy "company usage readable by members"
  on public.company_usage_counters for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create or replace function public.enforce_product_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_delta integer := 0;
  v_limit integer;
  v_exempt boolean;
  v_bypass boolean := current_setting('app.bypass_business_limits', true) = 'on';
  v_used integer;
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'invalid_company_change: product variants cannot move between companies';
  end if;

  if tg_op = 'INSERT' then
    v_company_id := new.company_id;
    v_delta := case when new.active then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_delta := case when old.active then -1 else 0 end;
  else
    v_company_id := new.company_id;
    v_delta := (case when new.active then 1 else 0 end)
             - (case when old.active then 1 else 0 end);
  end if;

  if v_delta = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  insert into public.company_usage_counters(company_id, active_variants)
  select v_company_id, count(*)::integer
  from public.product_variants
  where company_id = v_company_id and active
  on conflict (company_id) do nothing;

  if v_delta < 0 then
    update public.company_usage_counters
    set active_variants = greatest(active_variants - 1, 0), updated_at = now()
    where company_id = v_company_id;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select
    coalesce(c.subscription_exempt_until > now(), false),
    least(10000, coalesce(t.max_products, 10000))
  into v_exempt, v_limit
  from public.companies c
  left join public.subscription_tiers t on t.id = c.subscription_tier_id
  where c.id = v_company_id;

  if not found then raise exception 'company_not_found: %', v_company_id; end if;
  if v_exempt or v_bypass then v_limit := 10000; end if;

  update public.company_usage_counters
  set active_variants = active_variants + 1, updated_at = now()
  where company_id = v_company_id and active_variants < v_limit
  returning active_variants into v_used;

  if not found then
    select active_variants into v_used
    from public.company_usage_counters where company_id = v_company_id;
    if v_limit = 10000 then
      raise exception 'enterprise_required: the non-Enterprise catalogue limit is 10,000 active variants';
    end if;
    raise exception 'limit_reached: product limit (%); upgrade your plan', v_limit;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists product_variants_enforce_limit on public.product_variants;
create trigger product_variants_enforce_limit
before insert or update of active, company_id or delete on public.product_variants
for each row execute function public.enforce_product_limit();

revoke execute on function public.enforce_product_limit() from public, anon, authenticated;

create or replace function public.reconcile_company_usage(p_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := coalesce(p_company_id, public.current_company_id());
  v_actual integer;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if not public.is_platform_admin()
     and (v_company_id <> public.current_company_id()
       or not public.current_user_has_permission('ManageCatalog')) then
    raise exception 'permission_denied: ManageCatalog required';
  end if;

  insert into public.company_usage_counters(company_id, active_variants)
  values(v_company_id, 0)
  on conflict(company_id) do nothing;
  perform 1 from public.company_usage_counters
  where company_id = v_company_id for update;

  select count(*)::integer into v_actual
  from public.product_variants
  where company_id = v_company_id and active;
  if v_actual > 10000 then
    raise exception 'enterprise_required: the non-Enterprise catalogue limit is 10,000 active variants';
  end if;

  insert into public.company_usage_counters(company_id, active_variants, reconciled_at, updated_at)
  values(v_company_id, v_actual, now(), now())
  on conflict(company_id) do update
    set active_variants = excluded.active_variants,
        reconciled_at = excluded.reconciled_at,
        updated_at = excluded.updated_at;
  return v_actual;
end;
$$;

revoke execute on function public.reconcile_company_usage(uuid) from public, anon;
grant execute on function public.reconcile_company_usage(uuid) to authenticated, service_role;

create or replace function public.reconcile_all_company_usage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_actual integer;
  v_count integer := 0;
begin
  for v_company_id in select id from public.companies order by id loop
    insert into public.company_usage_counters(company_id, active_variants)
    values(v_company_id, 0)
    on conflict(company_id) do nothing;
    perform 1 from public.company_usage_counters
    where company_id = v_company_id for update;
    select count(*)::integer into v_actual
    from public.product_variants
    where company_id = v_company_id and active;
    if v_actual > 10000 then
      raise exception 'enterprise_required: company % exceeds 10,000 active variants', v_company_id;
    end if;
    update public.company_usage_counters
    set active_variants = v_actual, reconciled_at = now(), updated_at = now()
    where company_id = v_company_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_all_company_usage()
  from public, anon, authenticated;

select cron.schedule(
  'reconcile-company-usage',
  '23 2 * * *',
  $$select public.reconcile_all_company_usage()$$
);

-- Keep the entitlement response cheap by reading the transactional counter.
create or replace function public.current_entitlements()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid:=public.current_company_id(); v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object('companyId',c.id,'status',c.subscription_status,'tierCode',t.code,'tierName',t.name,
    'features',jsonb_build_object('multipleLocations',coalesce(t.multiple_locations_enabled,false),
      'staffPerformance',coalesce(t.staff_performance_enabled,false),'commissions',coalesce(t.commissions_available,false),
      'storefront',coalesce(t.storefront_available,false),'customerCampaigns',coalesce(t.customer_campaigns_available,false),
      'paymentReminders',coalesce(t.payment_reminders_available,false)),
    'settings',jsonb_build_object('commissionsEnabled',c.commissions_enabled,'paymentRemindersEnabled',c.payment_reminders_enabled,
      'paymentReminderChannel',c.payment_reminder_channel,'paymentReminderSmsFallback',c.payment_reminder_sms_fallback),
    'limits',jsonb_strip_nulls(jsonb_build_object('maxTeamMembers',t.max_team_members,'maxProducts',coalesce(t.max_products,10000),
      'maxStockLocations',t.max_stock_locations,'maxOrdersPerMonth',t.max_orders_per_month,
      'smsPerPeriod',t.sms_per_period,'whatsappPerPeriod',t.whatsapp_per_period)),
    'usage',jsonb_build_object('stockLocations',(select count(*) from public.stock_locations l where l.company_id=c.id and l.is_active),
      'products',coalesce(u.active_variants,0),
      'ordersThisMonth',(select count(*) from public.orders o where o.company_id=c.id and o.created_at>=date_trunc('month',now()) and o.status<>'voided'),
      'teamMembers',(select count(*) from public.company_memberships m where m.company_id=c.id and m.authorization_status='approved'),
      'sms',jsonb_build_object('used',c.sms_used_this_period,'reserved',c.sms_reserved_this_period,
        'remaining',case when t.sms_per_period is null then null else greatest(t.sms_per_period-c.sms_used_this_period-c.sms_reserved_this_period,0) end),
      'whatsapp',jsonb_build_object('used',c.whatsapp_used_this_period,'reserved',c.whatsapp_reserved_this_period,
        'remaining',case when t.whatsapp_per_period is null then null else greatest(t.whatsapp_per_period-c.whatsapp_used_this_period-c.whatsapp_reserved_this_period,0) end),
      'periodEnd',c.communication_period_end)) into v_result
  from public.companies c
  left join public.subscription_tiers t on t.id=c.subscription_tier_id
  left join public.company_usage_counters u on u.company_id=c.id
  where c.id=v_company;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durable, company-scoped cache change streams. Entries deliberately carry no
-- entity payload; clients batch-fetch authoritative projections after sync.
-- ---------------------------------------------------------------------------
create table public.cache_stream_heads (
  company_id uuid not null references public.companies(id) on delete cascade,
  stream text not null check (stream in ('catalog','parties','sales','settings','inbox','team')),
  head_sequence bigint not null default 0 check (head_sequence >= 0),
  pruned_through_sequence bigint not null default 0 check (pruned_through_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key(company_id, stream),
  check (pruned_through_sequence <= head_sequence)
);

create table public.cache_change_log (
  company_id uuid not null,
  stream text not null,
  sequence bigint not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert','delete','reset')),
  location_id uuid,
  user_id uuid,
  changed_at timestamptz not null default clock_timestamp(),
  primary key(company_id, stream, sequence),
  foreign key(company_id, stream) references public.cache_stream_heads(company_id, stream) on delete cascade
);

create index cache_change_log_lookup_idx
  on public.cache_change_log(company_id, stream, sequence);
create index cache_change_log_target_idx
  on public.cache_change_log(company_id, user_id, stream, sequence)
  where user_id is not null;

alter table public.cache_stream_heads enable row level security;
alter table public.cache_change_log enable row level security;

create policy "cache stream heads readable by company"
  on public.cache_stream_heads for select to authenticated
  using (company_id = (select public.current_company_id()) or (select public.is_platform_admin()));

create policy "cache changes readable by company target"
  on public.cache_change_log for select to authenticated
  using (
    (company_id = (select public.current_company_id())
      and (user_id is null or user_id = (select auth.uid())))
    or (select public.is_platform_admin())
  );

grant select on public.cache_stream_heads, public.cache_change_log to authenticated;
grant all on public.cache_stream_heads, public.cache_change_log to service_role;

create or replace function public.emit_cache_change(
  p_company_id uuid,
  p_stream text,
  p_entity_type text,
  p_entity_id text,
  p_operation text default 'upsert',
  p_location_id uuid default null,
  p_user_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_pruned bigint;
begin
  if current_setting('app.cache_change_suppressed', true) = 'on' then return null; end if;
  if p_stream not in ('catalog','parties','sales','settings','inbox','team') then
    raise exception 'invalid_cache_stream: %', p_stream;
  end if;
  if p_operation not in ('upsert','delete','reset') then
    raise exception 'invalid_cache_operation: %', p_operation;
  end if;
  if p_company_id is null or nullif(p_entity_type, '') is null or nullif(p_entity_id, '') is null then
    raise exception 'invalid_cache_change';
  end if;

  insert into public.cache_stream_heads(company_id, stream, head_sequence)
  values(p_company_id, p_stream, 1)
  on conflict(company_id, stream) do update
    set head_sequence = public.cache_stream_heads.head_sequence + 1,
        updated_at = now()
  returning head_sequence into v_sequence;

  insert into public.cache_change_log(
    company_id, stream, sequence, entity_type, entity_id, operation, location_id, user_id
  ) values(
    p_company_id, p_stream, v_sequence, p_entity_type, p_entity_id,
    p_operation, p_location_id, p_user_id
  );

  v_pruned := greatest(v_sequence - 512, 0);
  if v_pruned > 0 then
    delete from public.cache_change_log
    where company_id = p_company_id and stream = p_stream and sequence <= v_pruned;
    update public.cache_stream_heads
    set pruned_through_sequence = greatest(pruned_through_sequence, v_pruned)
    where company_id = p_company_id and stream = p_stream;
  end if;
  return v_sequence;
end;
$$;

revoke execute on function public.emit_cache_change(uuid,text,text,text,text,uuid,uuid)
  from public, anon, authenticated;

create or replace function public.emit_cache_reset(p_company_id uuid, p_stream text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.emit_cache_change(p_company_id, p_stream, p_stream, '*', 'reset', null, null)
$$;

revoke execute on function public.emit_cache_reset(uuid,text) from public, anon, authenticated;

-- Existing browsers may already hold pre-journal snapshots. Seed every stream
-- with a reset so their first reconciliation replaces those snapshots instead
-- of treating watermark zero as current forever.
do $$
declare
  v_company_id uuid;
  v_stream text;
begin
  for v_company_id in select id from public.companies loop
    foreach v_stream in array array['catalog','parties','sales','settings','inbox','team'] loop
      perform public.emit_cache_reset(v_company_id, v_stream);
    end loop;
  end loop;
end;
$$;

create or replace function public.sync_cache_stream(
  p_stream text,
  p_after_sequence bigint default 0,
  p_limit integer default 512
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_user_id uuid := auth.uid();
  v_head bigint := 0;
  v_floor bigint := 0;
  v_changes jsonb := '[]'::jsonb;
begin
  if v_company_id is null or v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_stream not in ('catalog','parties','sales','settings','inbox','team') then
    raise exception 'invalid_cache_stream: %', p_stream;
  end if;
  if p_after_sequence < 0 then raise exception 'invalid_cache_sequence'; end if;
  if p_limit < 1 or p_limit > 512 then raise exception 'invalid_cache_page_size'; end if;

  select head_sequence, pruned_through_sequence into v_head, v_floor
  from public.cache_stream_heads
  where company_id = v_company_id and stream = p_stream;

  if not found then
    return jsonb_build_object(
      'stream', p_stream, 'headSequence', 0, 'prunedThroughSequence', 0,
      'resetRequired', false, 'nextSequence', 0, 'hasMore', false, 'changes', '[]'::jsonb
    );
  end if;

  if p_after_sequence >= v_floor then
    select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', c.sequence,
      'entityType', c.entity_type,
      'entityId', c.entity_id,
      'operation', c.operation,
      'locationId', c.location_id,
      'userId', c.user_id,
      'changedAt', c.changed_at
    ) order by c.sequence), '[]'::jsonb)
    into v_changes
    from (
      select * from public.cache_change_log
      where company_id = v_company_id and stream = p_stream
        and sequence > p_after_sequence
        and (user_id is null or user_id = v_user_id)
      order by sequence
      limit p_limit
    ) c;
  end if;

  return jsonb_build_object(
    'stream', p_stream,
    'headSequence', v_head,
    'prunedThroughSequence', v_floor,
    'resetRequired', p_after_sequence < v_floor,
    'nextSequence', case
      when p_after_sequence < v_floor then v_head
      when jsonb_array_length(v_changes) < p_limit then v_head
      else coalesce((select max((x ->> 'sequence')::bigint) from jsonb_array_elements(v_changes) x), v_head)
    end,
    'hasMore', case
      when p_after_sequence < v_floor then false
      when jsonb_array_length(v_changes) < p_limit then false
      else coalesce((select max((x ->> 'sequence')::bigint) from jsonb_array_elements(v_changes) x), p_after_sequence) < v_head
    end,
    'changes', v_changes
  );
end;
$$;

revoke execute on function public.sync_cache_stream(text,bigint,integer) from public, anon;
grant execute on function public.sync_cache_stream(text,bigint,integer) to authenticated;

create or replace function public.cache_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_company_id uuid;
  v_entity_id text;
  v_location_id uuid;
  v_user_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_company_id := nullif(v_row ->> 'company_id', '')::uuid;
  if v_company_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_entity_id := v_row ->> coalesce(nullif(tg_argv[2], ''), 'id');
  if coalesce(tg_nargs, 0) > 3 and nullif(tg_argv[3], '') is not null then
    v_location_id := nullif(v_row ->> tg_argv[3], '')::uuid;
  end if;
  if coalesce(tg_nargs, 0) > 4 and nullif(tg_argv[4], '') is not null then
    v_user_id := nullif(v_row ->> tg_argv[4], '')::uuid;
  end if;
  perform public.emit_cache_change(
    v_company_id, tg_argv[0], tg_argv[1], v_entity_id,
    case
      when coalesce(tg_nargs, 0) > 5 and tg_argv[5] = 'upsert' then 'upsert'
      when tg_op = 'DELETE' then 'delete'
      else 'upsert'
    end,
    v_location_id, v_user_id
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.cache_change_trigger() from public, anon, authenticated;

create or replace function public.cache_ledger_party_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id text;
begin
  v_id := v_row -> 'meta' ->> 'customerId';
  if nullif(v_id, '') is not null then
    perform public.emit_cache_change((v_row ->> 'company_id')::uuid, 'parties', 'customer', v_id);
  end if;
  v_id := v_row -> 'meta' ->> 'supplierId';
  if nullif(v_id, '') is not null then
    perform public.emit_cache_change((v_row ->> 'company_id')::uuid, 'parties', 'supplier', v_id);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.cache_ledger_party_change_trigger()
  from public, anon, authenticated;

-- Catalogue projections.
create trigger products_cache_change after insert or update or delete on public.products
for each row execute function public.cache_change_trigger('catalog','product','id');
create trigger variants_cache_change after insert or update or delete on public.product_variants
for each row execute function public.cache_change_trigger('catalog','variant','id');
create trigger batches_cache_change after insert or update or delete on public.inventory_batches
for each row execute function public.cache_change_trigger('catalog','stock','variant_id','stock_location_id','','upsert');
create trigger manufacturers_cache_change after insert or update or delete on public.manufacturers
for each row execute function public.cache_change_trigger('catalog','manufacturer','id');
create trigger collections_cache_change after insert or update or delete on public.collections
for each row execute function public.cache_change_trigger('catalog','collection','id');
create trigger product_collections_cache_change after insert or update or delete on public.product_collections
for each row execute function public.cache_change_trigger('catalog','product_collection','product_id','','','upsert');

-- Party directories and derived AR/AP balances.
create trigger customers_cache_change after insert or update or delete on public.customers
for each row execute function public.cache_change_trigger('parties','party','id');
create trigger ledger_party_cache_change after insert or update or delete on public.ledger_journal_lines
for each row execute function public.cache_ledger_party_change_trigger();
create trigger purchases_party_cache_change after insert or update or delete on public.purchases
for each row execute function public.cache_change_trigger('parties','supplier','supplier_id','','','upsert');

-- Recent sales. Related writes identify the owning order so one projection is fetched.
create trigger orders_cache_change after insert or update or delete on public.orders
for each row execute function public.cache_change_trigger('sales','order','id','location_id');
create trigger order_lines_cache_change after insert or update or delete on public.order_lines
for each row execute function public.cache_change_trigger('sales','order','order_id','','','upsert');
create trigger payments_cache_change after insert or update or delete on public.payments
for each row execute function public.cache_change_trigger('sales','order','order_id','location_id','','upsert');
create trigger refunds_cache_change after insert or update or delete on public.refunds
for each row execute function public.cache_change_trigger('sales','order','order_id','location_id','','upsert');

-- Settings, inbox, and team snapshots.
create trigger companies_cache_change after update on public.companies
for each row execute function public.cache_change_trigger('settings','company','id');
create trigger payment_methods_cache_change after insert or update or delete on public.payment_methods
for each row execute function public.cache_change_trigger('settings','payment_method','id');
create trigger stock_locations_cache_change after insert or update or delete on public.stock_locations
for each row execute function public.cache_change_trigger('settings','location','id');
create trigger cashier_sessions_cache_change after insert or update or delete on public.cashier_sessions
for each row execute function public.cache_change_trigger('settings','cashier_session','id','location_id');
create trigger notifications_cache_change after insert or update or delete on public.notifications
for each row execute function public.cache_change_trigger('inbox','notification','id','','user_id');
create trigger approvals_cache_change after insert or update or delete on public.approvals
for each row execute function public.cache_change_trigger('inbox','approval','id');
create trigger roles_cache_change after insert or update or delete on public.roles
for each row execute function public.cache_change_trigger('team','role','id');
create trigger memberships_cache_change after insert or update or delete on public.company_memberships
for each row execute function public.cache_change_trigger('team','membership','id');

-- One public Realtime source replaces raw-table cache listeners.
alter publication supabase_realtime add table public.cache_change_log;
alter publication supabase_realtime drop table public.products;
alter publication supabase_realtime drop table public.product_variants;
alter publication supabase_realtime drop table public.inventory_batches;
alter publication supabase_realtime drop table public.customers;
alter publication supabase_realtime drop table public.orders;
alter publication supabase_realtime drop table public.payments;
alter publication supabase_realtime drop table public.notifications;
alter publication supabase_realtime drop table public.approvals;
alter publication supabase_realtime drop table public.purchases;
alter publication supabase_realtime drop table public.purchase_payments;

create index if not exists orders_company_location_recent_idx
  on public.orders(company_id, location_id, created_at desc);

-- Lightweight active catalogue projection: stock is fetched once per location,
-- not recomputed inside every paged catalogue query.
create or replace function public.catalog_cache_page(
  p_after_variant_id uuid default null,
  p_limit integer default 1000
)
returns table (
  variant_id uuid,
  company_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  kind text,
  sku text,
  barcode text,
  price bigint,
  wholesale_price bigint,
  allow_fractional boolean,
  track_inventory boolean,
  variant_active boolean,
  product_active boolean,
  image_path text,
  stock numeric,
  manufacturer_id uuid,
  manufacturer_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'invalid_catalog_page_size'; end if;
  return query
  select v.id, v.company_id, p.id, p.name, v.name, v.kind, v.sku,
    coalesce(v.barcode, p.barcode), v.price, v.wholesale_price,
    v.allow_fractional, v.track_inventory, v.active, p.active, p.image_path,
    0::numeric, m.id, m.name
  from public.product_variants v
  join public.products p on p.id = v.product_id and p.company_id = v.company_id
  left join public.manufacturers m on m.id = p.manufacturer_id
  where v.company_id = v_company_id and v.active and p.active
    and (p_after_variant_id is null or v.id > p_after_variant_id)
  order by v.id
  limit p_limit;
end;
$$;

revoke execute on function public.catalog_cache_page(uuid,integer) from public, anon;
grant execute on function public.catalog_cache_page(uuid,integer) to authenticated;

create or replace function public.catalog_cache_families(
  p_after_product_id uuid default null,
  p_limit integer default 1000
)
returns setof public.products
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_limit < 1 or p_limit > 1000 then raise exception 'invalid_catalog_page_size'; end if;
  return query
  select p.*
  from public.products p
  where p.company_id = v_company_id and p.active
    and (p_after_product_id is null or p.id > p_after_product_id)
  order by p.id
  limit p_limit;
end;
$$;

revoke execute on function public.catalog_cache_families(uuid,integer) from public, anon;
grant execute on function public.catalog_cache_families(uuid,integer) to authenticated;

create or replace function public.catalog_cache_entities(
  p_variant_ids uuid[] default '{}'::uuid[],
  p_product_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if coalesce(cardinality(p_variant_ids), 0) + coalesce(cardinality(p_product_ids), 0) > 512 then
    raise exception 'invalid_catalog_patch_size';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'variant_id',v.id,'company_id',v.company_id,'product_id',p.id,
      'product_name',p.name,'variant_name',v.name,'kind',v.kind,'sku',v.sku,
      'barcode',coalesce(v.barcode,p.barcode),'price',v.price,
      'wholesale_price',v.wholesale_price,'allow_fractional',v.allow_fractional,
      'track_inventory',v.track_inventory,'variant_active',v.active,
      'product_active',p.active,'image_path',p.image_path,'stock',0,
      'manufacturer_id',m.id,'manufacturer_name',m.name
    ) order by v.id)
    from public.product_variants v
    join public.products p on p.id = v.product_id and p.company_id = v.company_id
    left join public.manufacturers m on m.id = p.manufacturer_id
    where v.company_id = v_company_id and v.active and p.active
      and (v.id = any(p_variant_ids) or p.id = any(p_product_ids))
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.catalog_cache_entities(uuid[],uuid[]) from public, anon;
grant execute on function public.catalog_cache_entities(uuid[],uuid[]) to authenticated;

create or replace function public.location_stock_for_variants(
  p_location_id uuid,
  p_variant_ids uuid[]
)
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
  if coalesce(cardinality(p_variant_ids), 0) > 1000 then
    raise exception 'invalid_stock_patch_size';
  end if;
  return query
  select v.id,
    coalesce(sum(b.remaining), 0)::numeric,
    coalesce(sum(b.remaining * b.unit_cost), 0)::bigint
  from public.product_variants v
  left join public.inventory_batches b
    on b.variant_id = v.id and b.stock_location_id = v_location_id and b.remaining > 0
  where v.company_id = v_company_id and v.id = any(p_variant_ids)
  group by v.id;
end;
$$;

revoke execute on function public.location_stock_for_variants(uuid,uuid[]) from public, anon;
grant execute on function public.location_stock_for_variants(uuid,uuid[]) to authenticated;

-- Exact, server-paged management query. The offline cache intentionally omits
-- inactive history, so non-active views never infer totals from cached rows.
create or replace function public.catalog_management_page(
  p_status text default 'active',
  p_stock_status text default 'all',
  p_manufacturer text default 'all',
  p_search text default null,
  p_sort text default 'name',
  p_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 25,
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
  v_location_id uuid := public.resolve_business_location(p_location_id);
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('all','active','inactive') then raise exception 'invalid_product_status'; end if;
  if p_stock_status not in ('all','in_stock','out_of_stock','not_tracked') then
    raise exception 'invalid_stock_status';
  end if;
  if p_sort not in ('name','manufacturer','stock','cost_value','wholesale_value','retail_value','variants')
     or p_direction not in ('asc','desc') then raise exception 'invalid_catalog_sort'; end if;
  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then raise exception 'invalid_page'; end if;

  with variant_rows as (
    select v.*, coalesce(sum(b.remaining),0)::numeric as stock,
      coalesce(sum(b.remaining*b.unit_cost),0)::bigint as stock_value
    from public.product_variants v
    left join public.inventory_batches b
      on b.variant_id=v.id and b.stock_location_id=v_location_id and b.remaining>0
    where v.company_id=v_company_id
    group by v.id
  ), matched as (
    select p.*, m.name as manufacturer_name,
      count(v.id)::integer as variant_count,
      coalesce(sum(v.stock),0)::numeric as total_stock,
      coalesce(sum(v.stock_value),0)::bigint as cost_value,
      coalesce(sum(v.stock*coalesce(v.wholesale_price,0)),0)::numeric as wholesale_value,
      coalesce(sum(v.stock*v.price),0)::numeric as retail_value,
      count(v.id) filter(where v.kind<>'service' and v.track_inventory)::integer as tracked_count,
      bool_or(v.kind<>'service' and v.track_inventory and v.stock>0) as any_in_stock,
      bool_or(v.kind<>'service' and v.track_inventory and v.stock<=0) as any_out_of_stock
    from public.products p
    left join public.manufacturers m on m.id=p.manufacturer_id
    left join variant_rows v on v.product_id=p.id
    where p.company_id=v_company_id
      and (p_status='all' or p.active=(p_status='active'))
      and (
        nullif(btrim(coalesce(p_search,'')),'') is null
        or p.name ilike '%'||btrim(p_search)||'%'
        or coalesce(p.barcode,'') ilike '%'||btrim(p_search)||'%'
        or coalesce(m.name,'') ilike '%'||btrim(p_search)||'%'
        or exists (
          select 1 from variant_rows sv where sv.product_id=p.id and (
            sv.name ilike '%'||btrim(p_search)||'%'
            or sv.sku ilike '%'||btrim(p_search)||'%'
            or coalesce(sv.barcode,'') ilike '%'||btrim(p_search)||'%'
          )
        )
      )
      and (p_manufacturer='all'
        or (p_manufacturer='unassigned' and p.manufacturer_id is null)
        or p.manufacturer_id::text=p_manufacturer)
    group by p.id,m.name
    having p_stock_status='all'
      or (p_stock_status='not_tracked' and count(v.id) filter(where v.kind<>'service' and v.track_inventory)=0)
      or (p_stock_status='in_stock' and bool_or(v.kind<>'service' and v.track_inventory and v.stock>0))
      or (p_stock_status='out_of_stock' and bool_or(v.kind<>'service' and v.track_inventory and v.stock<=0))
  ), page_rows as (
    select ranked.* from (
      select matched.*, row_number() over(order by
          case when p_direction='asc' and p_sort='name' then name end asc,
          case when p_direction='desc' and p_sort='name' then name end desc,
          case when p_direction='asc' and p_sort='manufacturer' then manufacturer_name end asc nulls last,
          case when p_direction='desc' and p_sort='manufacturer' then manufacturer_name end desc nulls last,
          case when p_direction='asc' and p_sort='stock' then total_stock end asc,
          case when p_direction='desc' and p_sort='stock' then total_stock end desc,
          case when p_direction='asc' and p_sort='cost_value' then cost_value end asc,
          case when p_direction='desc' and p_sort='cost_value' then cost_value end desc,
          case when p_direction='asc' and p_sort='wholesale_value' then wholesale_value end asc,
          case when p_direction='desc' and p_sort='wholesale_value' then wholesale_value end desc,
          case when p_direction='asc' and p_sort='retail_value' then retail_value end asc,
          case when p_direction='desc' and p_sort='retail_value' then retail_value end desc,
          case when p_direction='asc' and p_sort='variants' then variant_count end asc,
          case when p_direction='desc' and p_sort='variants' then variant_count end desc,
          name,id
        ) as page_position
      from matched
    ) ranked
    order by page_position
    offset (p_page-1)*p_page_size limit p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family', to_jsonb(pr) - 'manufacturer_name' - 'variant_count' - 'total_stock'
          - 'cost_value' - 'wholesale_value' - 'retail_value' - 'tracked_count'
          - 'any_in_stock' - 'any_out_of_stock' - 'page_position',
        'variants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'variant_id',v.id,'company_id',v.company_id,'product_id',v.product_id,
            'product_name',pr.name,'variant_name',v.name,'kind',v.kind,'sku',v.sku,
            'barcode',coalesce(v.barcode,pr.barcode),'price',v.price,
            'wholesale_price',v.wholesale_price,'allow_fractional',v.allow_fractional,
            'track_inventory',v.track_inventory,'variant_active',v.active,
            'product_active',pr.active,'image_path',pr.image_path,'stock',v.stock,
            'stock_value',v.stock_value,
            'manufacturer_id',pr.manufacturer_id,'manufacturer_name',pr.manufacturer_name
          ) order by v.name,v.id) from variant_rows v where v.product_id=pr.id
        ),'[]'::jsonb)
      ) order by pr.page_position) from page_rows pr
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.catalog_management_page(text,text,text,text,text,text,integer,integer,uuid)
  from public, anon;
grant execute on function public.catalog_management_page(text,text,text,text,text,text,integer,integer,uuid)
  to authenticated;
