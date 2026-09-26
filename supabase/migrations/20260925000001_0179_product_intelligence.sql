-- Sparse, incremental product and inventory intelligence. Preset directories
-- read one row per variant; stock history expands only for a selected profile.

alter table public.companies
  add column default_reorder_lead_days integer not null default 7
    check(default_reorder_lead_days between 0 and 365),
  add column default_reorder_safety_days integer not null default 7
    check(default_reorder_safety_days between 0 and 365);

alter table public.product_variants
  add column reorder_lead_days integer check(reorder_lead_days between 0 and 365),
  add column reorder_safety_days integer check(reorder_safety_days between 0 and 365);

create table public.product_daily_facts (
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  day date not null,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  gross_quantity numeric(18,3) not null default 0,
  returned_quantity numeric(18,3) not null default 0,
  net_quantity numeric(18,3) not null default 0,
  gross_revenue bigint not null default 0,
  refund_amount bigint not null default 0,
  net_revenue bigint not null default 0,
  corrected_cogs bigint not null default 0,
  margin bigint not null default 0,
  order_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key(company_id,location_id,day,variant_id)
);
create index product_daily_facts_variant_day_idx on public.product_daily_facts
  (company_id,location_id,variant_id,day desc);

create table public.product_window_metrics (
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  window_days integer not null check(window_days in (7,30,180,365)),
  current_quantity numeric(18,3) not null default 0,
  previous_quantity numeric(18,3) not null default 0,
  gross_revenue bigint not null default 0,
  refund_amount bigint not null default 0,
  net_revenue bigint not null default 0,
  corrected_cogs bigint not null default 0,
  margin bigint not null default 0,
  previous_net_revenue bigint not null default 0,
  current_from date not null,
  current_to date not null,
  refreshed_at timestamptz not null default now(),
  primary key(company_id,location_id,variant_id,window_days)
);
create index product_window_directory_idx on public.product_window_metrics
  (company_id,location_id,window_days,current_quantity desc,variant_id);

create table public.inventory_position_days (
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  day date not null,
  closing_quantity numeric(18,3) not null,
  closing_value bigint,
  quality text not null check(quality in ('estimated','exact','reconciled')),
  refreshed_at timestamptz not null default now(),
  primary key(company_id,location_id,variant_id,day)
);
create index inventory_position_profile_idx on public.inventory_position_days
  (company_id,location_id,variant_id,day desc);

create table public.product_attention (
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  signal text not null check(signal in ('stockout','reorder','low_cover','healthy','slow','insufficient_history')),
  current_stock numeric(18,3) not null default 0,
  current_value bigint,
  average_daily_demand numeric(18,5),
  days_of_cover numeric(18,2),
  reorder_quantity numeric(18,3),
  last_sale_date date,
  reason_code text not null,
  refreshed_at timestamptz not null default now(),
  primary key(company_id,location_id,variant_id)
);
create index product_attention_directory_idx on public.product_attention
  (company_id,location_id,signal,days_of_cover,variant_id);

create table public.analytics_dirty_buckets (
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  day date not null,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  sales_dirty boolean not null default false,
  attention_dirty boolean not null default true,
  position_dirty boolean not null default false,
  reason text not null default 'activity',
  dirty_since timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  primary key(company_id,location_id,day,variant_id)
);
create index analytics_dirty_ready_idx on public.analytics_dirty_buckets(available_at,dirty_since);

alter table public.product_daily_facts enable row level security;
alter table public.product_window_metrics enable row level security;
alter table public.inventory_position_days enable row level security;
alter table public.product_attention enable row level security;
alter table public.analytics_dirty_buckets enable row level security;
revoke all on public.product_daily_facts,public.product_window_metrics,
  public.inventory_position_days,public.product_attention,public.analytics_dirty_buckets
  from public,anon,authenticated;
grant all on public.product_daily_facts,public.product_window_metrics,
  public.inventory_position_days,public.product_attention,public.analytics_dirty_buckets
  to service_role;

create or replace function public.enqueue_analytics_bucket(
  p_company_id uuid,p_location_id uuid,p_day date,p_variant_id uuid,
  p_sales_dirty boolean default true,p_attention_dirty boolean default true,
  p_position_dirty boolean default false,p_reason text default 'activity'
)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_company_id is null or p_location_id is null or p_day is null or p_variant_id is null then return; end if;
  insert into public.analytics_dirty_buckets(company_id,location_id,day,variant_id,
    sales_dirty,attention_dirty,position_dirty,reason)
  values(p_company_id,p_location_id,p_day,p_variant_id,p_sales_dirty,p_attention_dirty,
    p_position_dirty,coalesce(nullif(p_reason,''),'activity'))
  on conflict(company_id,location_id,day,variant_id) do update set
    sales_dirty=public.analytics_dirty_buckets.sales_dirty or excluded.sales_dirty,
    attention_dirty=public.analytics_dirty_buckets.attention_dirty or excluded.attention_dirty,
    position_dirty=public.analytics_dirty_buckets.position_dirty or excluded.position_dirty,
    reason=excluded.reason,dirty_since=least(public.analytics_dirty_buckets.dirty_since,now()),
    available_at=least(public.analytics_dirty_buckets.available_at,now()),last_error=null;
end;
$$;
revoke execute on function public.enqueue_analytics_bucket(uuid,uuid,date,uuid,boolean,boolean,boolean,text)
  from public,anon,authenticated;
grant execute on function public.enqueue_analytics_bucket(uuid,uuid,date,uuid,boolean,boolean,boolean,text)
  to service_role;

create or replace function public.rebuild_product_daily_fact(
  p_company_id uuid,p_location_id uuid,p_day date,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.product_daily_facts where company_id=p_company_id and location_id=p_location_id
    and day=p_day and variant_id=p_variant_id;
  insert into public.product_daily_facts(company_id,location_id,day,variant_id,
    gross_quantity,returned_quantity,net_quantity,gross_revenue,refund_amount,
    net_revenue,corrected_cogs,margin,order_count)
  with eligible_orders as (
    select o.id,o.company_id,o.location_id,o.total,
      least(coalesce((select sum(r.amount) from public.refunds r where r.order_id=o.id),0),o.total) refunds,
      coalesce((select sum(jl.debit-case when e.source_type='InventorySaleCogsCorrection'
        then jl.credit else 0 end)
        from public.ledger_journal_lines jl join public.ledger_accounts a on a.id=jl.account_id
        join public.ledger_journal_entries e on e.id=jl.entry_id
        where jl.order_id=o.id and a.code='COGS'),o.cogs_total,0)::bigint corrected_cogs
    from public.orders o join public.companies c on c.id=o.company_id
    where o.company_id=p_company_id and o.location_id=p_location_id and o.status='completed'
      and o.completed_at is not null and (o.completed_at at time zone c.business_timezone)::date=p_day
  ), lines as (
    select o.*,l.stock_quantity,l.line_total,
      case when o.total>0 then round(o.refunds*l.line_total::numeric/o.total)::bigint else 0 end line_refund,
      case when o.total>0 then o.refunds::numeric/o.total else 0 end refund_ratio,
      case when o.total>0 then round(o.corrected_cogs*l.line_total::numeric/o.total)::bigint else 0 end line_cogs
    from eligible_orders o join public.order_lines l on l.order_id=o.id
    where l.variant_id=p_variant_id
  )
  select p_company_id,p_location_id,p_day,p_variant_id,
    sum(stock_quantity),sum(stock_quantity*refund_ratio),sum(stock_quantity*(1-refund_ratio)),
    sum(line_total)::bigint,sum(line_refund)::bigint,
    sum(line_total-line_refund)::bigint,sum(round(line_cogs*(1-refund_ratio)))::bigint,
    (sum(line_total-line_refund)-sum(round(line_cogs*(1-refund_ratio))))::bigint,
    count(distinct id)::integer
  from lines having count(*)>0;
end;
$$;
revoke execute on function public.rebuild_product_daily_fact(uuid,uuid,date,uuid)
  from public,anon,authenticated;
grant execute on function public.rebuild_product_daily_fact(uuid,uuid,date,uuid) to service_role;

create or replace function public.refresh_product_window_metrics(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date;v_timezone text;
begin
  select business_timezone into v_timezone from public.companies where id=p_company_id;
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  insert into public.product_window_metrics(company_id,location_id,variant_id,window_days,
    current_quantity,previous_quantity,gross_revenue,refund_amount,net_revenue,corrected_cogs,
    margin,previous_net_revenue,current_from,current_to,refreshed_at)
  select p_company_id,p_location_id,p_variant_id,w.days,
    coalesce(sum(f.net_quantity) filter(where f.day between v_today-(w.days-1) and v_today),0),
    coalesce(sum(f.net_quantity) filter(where f.day between v_today-(w.days*2-1) and v_today-w.days),0),
    coalesce(sum(f.gross_revenue) filter(where f.day between v_today-(w.days-1) and v_today),0)::bigint,
    coalesce(sum(f.refund_amount) filter(where f.day between v_today-(w.days-1) and v_today),0)::bigint,
    coalesce(sum(f.net_revenue) filter(where f.day between v_today-(w.days-1) and v_today),0)::bigint,
    coalesce(sum(f.corrected_cogs) filter(where f.day between v_today-(w.days-1) and v_today),0)::bigint,
    coalesce(sum(f.margin) filter(where f.day between v_today-(w.days-1) and v_today),0)::bigint,
    coalesce(sum(f.net_revenue) filter(where f.day between v_today-(w.days*2-1) and v_today-w.days),0)::bigint,
    v_today-(w.days-1),v_today,now()
  from (values(7),(30),(180),(365)) w(days)
  left join public.product_daily_facts f on f.company_id=p_company_id and f.location_id=p_location_id
    and f.variant_id=p_variant_id and f.day between v_today-729 and v_today
  group by w.days
  on conflict(company_id,location_id,variant_id,window_days) do update set
    current_quantity=excluded.current_quantity,previous_quantity=excluded.previous_quantity,
    gross_revenue=excluded.gross_revenue,refund_amount=excluded.refund_amount,
    net_revenue=excluded.net_revenue,corrected_cogs=excluded.corrected_cogs,
    margin=excluded.margin,previous_net_revenue=excluded.previous_net_revenue,
    current_from=excluded.current_from,current_to=excluded.current_to,refreshed_at=now();
end;
$$;
revoke execute on function public.refresh_product_window_metrics(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_product_window_metrics(uuid,uuid,uuid) to service_role;

create or replace function public.capture_inventory_position(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid,p_quality text default 'exact'
)
returns void language plpgsql security definer set search_path='' as $$
declare v_today date;v_timezone text;v_qty numeric;v_value bigint;
begin
  select business_timezone into v_timezone from public.companies where id=p_company_id;
  v_today:=(now() at time zone coalesce(v_timezone,'Africa/Nairobi'))::date;
  select coalesce(sum(remaining),0),coalesce(sum(remaining_cost),0)::bigint into v_qty,v_value
  from public.inventory_batches where company_id=p_company_id and stock_location_id=p_location_id
    and variant_id=p_variant_id and remaining>0;
  insert into public.inventory_position_days(company_id,location_id,variant_id,day,
    closing_quantity,closing_value,quality)
  values(p_company_id,p_location_id,p_variant_id,v_today,v_qty,v_value,p_quality)
  on conflict(company_id,location_id,variant_id,day) do update set
    closing_quantity=excluded.closing_quantity,closing_value=excluded.closing_value,
    quality=case when public.inventory_position_days.quality='reconciled' then 'reconciled'
      else excluded.quality end,refreshed_at=now();
end;
$$;
revoke execute on function public.capture_inventory_position(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.capture_inventory_position(uuid,uuid,uuid,text) to service_role;

create or replace function public.refresh_product_attention(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_stock numeric;v_value bigint;v_demand numeric;v_cover numeric;v_reorder numeric;
  v_last date;v_lead integer;v_safety integer;v_signal text;v_reason text;
begin
  select coalesce(sum(b.remaining),0),coalesce(sum(b.remaining_cost),0)::bigint
    into v_stock,v_value from public.inventory_batches b
  where b.company_id=p_company_id and b.stock_location_id=p_location_id
    and b.variant_id=p_variant_id and b.remaining>0;
  select m.current_quantity/30.0 into v_demand from public.product_window_metrics m
  where m.company_id=p_company_id and m.location_id=p_location_id
    and m.variant_id=p_variant_id and m.window_days=30;
  select max(day) into v_last from public.product_daily_facts where company_id=p_company_id
    and location_id=p_location_id and variant_id=p_variant_id and net_quantity>0;
  select coalesce(v.reorder_lead_days,c.default_reorder_lead_days),
    coalesce(v.reorder_safety_days,c.default_reorder_safety_days) into v_lead,v_safety
  from public.product_variants v join public.companies c on c.id=v.company_id
  where v.id=p_variant_id and v.company_id=p_company_id;
  if coalesce(v_demand,0)<=0 then
    v_cover:=null;v_reorder:=null;
    if v_stock>0 then v_signal:='slow';v_reason:='no_recent_demand';
    else v_signal:='insufficient_history';v_reason:='insufficient_demand_history'; end if;
  else
    v_cover:=round(v_stock/v_demand,2);
    v_reorder:=greatest(0,ceil(v_demand*(v_lead+v_safety)-v_stock));
    if v_stock<=0 then v_signal:='stockout';v_reason:='demand_without_stock';
    elsif v_reorder>0 and v_cover<=v_lead then v_signal:='reorder';v_reason:='below_lead_time_cover';
    elsif v_reorder>0 then v_signal:='low_cover';v_reason:='below_target_cover';
    else v_signal:='healthy';v_reason:='stock_covers_target'; end if;
  end if;
  insert into public.product_attention(company_id,location_id,variant_id,signal,current_stock,
    current_value,average_daily_demand,days_of_cover,reorder_quantity,last_sale_date,reason_code)
  values(p_company_id,p_location_id,p_variant_id,v_signal,v_stock,v_value,v_demand,v_cover,
    v_reorder,v_last,v_reason)
  on conflict(company_id,location_id,variant_id) do update set signal=excluded.signal,
    current_stock=excluded.current_stock,current_value=excluded.current_value,
    average_daily_demand=excluded.average_daily_demand,days_of_cover=excluded.days_of_cover,
    reorder_quantity=excluded.reorder_quantity,last_sale_date=excluded.last_sale_date,
    reason_code=excluded.reason_code,refreshed_at=now();
end;
$$;
revoke execute on function public.refresh_product_attention(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_product_attention(uuid,uuid,uuid) to service_role;

create or replace function public.process_analytics_dirty_buckets(p_limit integer default 200)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row record;v_count integer:=0;
begin
  for v_row in select * from public.analytics_dirty_buckets where available_at<=now()
    order by dirty_since limit least(greatest(p_limit,1),1000) for update skip locked
  loop
    begin
      if v_row.sales_dirty then
        perform public.rebuild_product_daily_fact(v_row.company_id,v_row.location_id,v_row.day,v_row.variant_id);
        perform public.refresh_product_window_metrics(v_row.company_id,v_row.location_id,v_row.variant_id);
      end if;
      if v_row.position_dirty then
        perform public.capture_inventory_position(v_row.company_id,v_row.location_id,v_row.variant_id,'exact');
      end if;
      if v_row.attention_dirty then
        perform public.refresh_product_attention(v_row.company_id,v_row.location_id,v_row.variant_id);
      end if;
      delete from public.analytics_dirty_buckets where company_id=v_row.company_id
        and location_id=v_row.location_id and day=v_row.day and variant_id=v_row.variant_id;
      v_count:=v_count+1;
    exception when others then
      update public.analytics_dirty_buckets set attempts=attempts+1,last_error=sqlerrm,
        available_at=now()+least(interval '30 minutes',interval '1 minute'*power(2,least(attempts,5)))
      where company_id=v_row.company_id and location_id=v_row.location_id
        and day=v_row.day and variant_id=v_row.variant_id;
    end;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.process_analytics_dirty_buckets(integer)
  from public,anon,authenticated;
grant execute on function public.process_analytics_dirty_buckets(integer) to service_role;

create or replace function public.enqueue_analytics_from_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare v record;v_timezone text;v_day date;
begin
  if tg_op<>'INSERT' then
    select business_timezone into v_timezone from public.companies where id=old.company_id;
    v_day:=(coalesce(old.completed_at,old.created_at) at time zone v_timezone)::date;
    for v in select variant_id from public.order_lines where order_id=old.id loop
      perform public.enqueue_analytics_bucket(old.company_id,old.location_id,v_day,v.variant_id,true,true,false,'sale');
    end loop;
  end if;
  if tg_op<>'DELETE' then
    select business_timezone into v_timezone from public.companies where id=new.company_id;
    v_day:=(coalesce(new.completed_at,new.created_at) at time zone v_timezone)::date;
    for v in select variant_id from public.order_lines where order_id=new.id loop
      perform public.enqueue_analytics_bucket(new.company_id,new.location_id,v_day,v.variant_id,true,true,false,'sale');
    end loop;
  end if;
  return coalesce(new,old);
end;
$$;
create trigger orders_enqueue_analytics after insert or update or delete on public.orders
for each row execute function public.enqueue_analytics_from_order();

create or replace function public.enqueue_analytics_from_order_line()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_line public.order_lines%rowtype;v_order record;v_timezone text;v_day date;
begin
  v_line:=case when tg_op='DELETE' then old else new end;
  select o.*,c.business_timezone into v_order from public.orders o
    join public.companies c on c.id=o.company_id where o.id=v_line.order_id;
  if v_order.id is not null then
    v_day:=(coalesce(v_order.completed_at,v_order.created_at) at time zone v_order.business_timezone)::date;
    perform public.enqueue_analytics_bucket(v_order.company_id,v_order.location_id,v_day,
      v_line.variant_id,true,true,false,'sale_line');
  end if;
  if tg_op='UPDATE' and old.variant_id is distinct from new.variant_id then
    perform public.enqueue_analytics_bucket(v_order.company_id,v_order.location_id,v_day,
      old.variant_id,true,true,false,'sale_line');
  end if;
  return coalesce(new,old);
end;
$$;
create trigger order_lines_enqueue_analytics after insert or update or delete on public.order_lines
for each row execute function public.enqueue_analytics_from_order_line();

create or replace function public.enqueue_analytics_from_refund()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_refund public.refunds%rowtype;v_order record;v_timezone text;v_day date;v record;
begin
  v_refund:=case when tg_op='DELETE' then old else new end;
  select o.*,c.business_timezone into v_order from public.orders o join public.companies c on c.id=o.company_id
    where o.id=v_refund.order_id;
  v_day:=(coalesce(v_order.completed_at,v_order.created_at) at time zone v_order.business_timezone)::date;
  for v in select variant_id from public.order_lines where order_id=v_refund.order_id loop
    perform public.enqueue_analytics_bucket(v_order.company_id,v_order.location_id,v_day,
      v.variant_id,true,true,false,'refund');
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger refunds_enqueue_analytics after insert or update or delete on public.refunds
for each row execute function public.enqueue_analytics_from_refund();

create or replace function public.enqueue_analytics_from_ledger_line()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_line public.ledger_journal_lines%rowtype;v_order record;v_timezone text;v_day date;v record;
begin
  v_line:=case when tg_op='DELETE' then old else new end;
  if v_line.order_id is null or not exists(select 1 from public.ledger_accounts a
    where a.id=v_line.account_id and a.code='COGS') then return coalesce(new,old); end if;
  select o.*,c.business_timezone into v_order from public.orders o join public.companies c on c.id=o.company_id
    where o.id=v_line.order_id;
  v_day:=(coalesce(v_order.completed_at,v_order.created_at) at time zone v_order.business_timezone)::date;
  for v in select variant_id from public.order_lines where order_id=v_line.order_id loop
    perform public.enqueue_analytics_bucket(v_order.company_id,v_order.location_id,v_day,
      v.variant_id,true,true,false,'cogs');
  end loop;
  return coalesce(new,old);
end;
$$;
create trigger ledger_lines_enqueue_analytics
after insert or update or delete on public.ledger_journal_lines
for each row execute function public.enqueue_analytics_from_ledger_line();

create or replace function public.enqueue_analytics_from_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_row public.inventory_movements%rowtype;v_timezone text;v_day date;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  select business_timezone into v_timezone from public.companies where id=v_row.company_id;
  v_day:=(v_row.created_at at time zone v_timezone)::date;
  perform public.enqueue_analytics_bucket(v_row.company_id,v_row.stock_location_id,v_day,
    v_row.variant_id,false,true,true,'inventory');
  return coalesce(new,old);
end;
$$;
create trigger inventory_movements_enqueue_analytics
after insert or update or delete on public.inventory_movements
for each row execute function public.enqueue_analytics_from_movement();

create or replace function public.enqueue_analytics_from_reorder_setting()
returns trigger language plpgsql security definer set search_path='' as $$
declare v record;v_location record;v_timezone text;v_today date;
begin
  select business_timezone into v_timezone from public.companies where id=new.company_id;
  v_today:=(now() at time zone v_timezone)::date;
  for v_location in select id from public.stock_locations where company_id=new.company_id and is_active loop
    perform public.enqueue_analytics_bucket(new.company_id,v_location.id,v_today,new.id,false,true,false,'reorder_setting');
  end loop;
  return new;
end;
$$;
create trigger product_variants_enqueue_reorder_attention
after update of reorder_lead_days,reorder_safety_days on public.product_variants
for each row execute function public.enqueue_analytics_from_reorder_setting();

create or replace function public.update_reorder_settings(
  p_default_lead_days integer,p_default_safety_days integer
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_today date;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required'; end if;
  if p_default_lead_days not between 0 and 365 or p_default_safety_days not between 0 and 365 then
    raise exception 'invalid_reorder_settings'; end if;
  update public.companies set default_reorder_lead_days=p_default_lead_days,
    default_reorder_safety_days=p_default_safety_days,updated_at=now() where id=v_company;
  select (now() at time zone business_timezone)::date into v_today from public.companies where id=v_company;
  insert into public.analytics_dirty_buckets(company_id,location_id,day,variant_id,
    sales_dirty,attention_dirty,position_dirty,reason)
  select v.company_id,l.id,v_today,v.id,false,true,false,'reorder_setting'
  from public.product_variants v join public.stock_locations l on l.company_id=v.company_id and l.is_active
  where v.company_id=v_company and v.active and v.kind<>'service' and v.track_inventory
  on conflict(company_id,location_id,day,variant_id) do update set attention_dirty=true,
    available_at=least(public.analytics_dirty_buckets.available_at,now());
end;
$$;
revoke execute on function public.update_reorder_settings(integer,integer) from public,anon;
grant execute on function public.update_reorder_settings(integer,integer) to authenticated;

create or replace function public.update_variant_reorder_settings(
  p_variant_id uuid,p_lead_days integer,p_safety_days integer
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCatalog') then
    raise exception 'permission_denied: ManageCatalog required'; end if;
  if (p_lead_days is not null and p_lead_days not between 0 and 365)
    or (p_safety_days is not null and p_safety_days not between 0 and 365) then
    raise exception 'invalid_reorder_settings'; end if;
  update public.product_variants set reorder_lead_days=p_lead_days,
    reorder_safety_days=p_safety_days,updated_at=now()
  where id=p_variant_id and company_id=v_company;
  if not found then raise exception 'variant_not_found'; end if;
end;
$$;
revoke execute on function public.update_variant_reorder_settings(uuid,integer,integer)
  from public,anon;
grant execute on function public.update_variant_reorder_settings(uuid,integer,integer)
  to authenticated;

-- Initial daily facts, corrected COGS and proportional refunds. The runtime
-- path thereafter only rebuilds dirty day/location/variant buckets.
insert into public.product_daily_facts(company_id,location_id,day,variant_id,
  gross_quantity,returned_quantity,net_quantity,gross_revenue,refund_amount,
  net_revenue,corrected_cogs,margin,order_count)
with eligible_orders as (
  select o.id,o.company_id,o.location_id,
    (o.completed_at at time zone c.business_timezone)::date as day,o.total,
    least(coalesce((select sum(r.amount) from public.refunds r where r.order_id=o.id),0),o.total) refunds,
    coalesce((select sum(jl.debit-case when e.source_type='InventorySaleCogsCorrection' then jl.credit else 0 end)
      from public.ledger_journal_lines jl join public.ledger_accounts a on a.id=jl.account_id
      join public.ledger_journal_entries e on e.id=jl.entry_id
      where jl.order_id=o.id and a.code='COGS'),o.cogs_total,0)::bigint corrected_cogs
  from public.orders o join public.companies c on c.id=o.company_id
  where o.status='completed' and o.completed_at is not null
), line_facts as (
  select o.company_id,o.location_id,o.day,l.variant_id,o.id,l.stock_quantity,l.line_total,
    case when o.total>0 then round(o.refunds*l.line_total::numeric/o.total)::bigint else 0 end line_refund,
    case when o.total>0 then o.refunds::numeric/o.total else 0 end refund_ratio,
    case when o.total>0 then round(o.corrected_cogs*l.line_total::numeric/o.total)::bigint else 0 end line_cogs
  from eligible_orders o join public.order_lines l on l.order_id=o.id
)
select company_id,location_id,day,variant_id,sum(stock_quantity),sum(stock_quantity*refund_ratio),
  sum(stock_quantity*(1-refund_ratio)),sum(line_total)::bigint,sum(line_refund)::bigint,
  sum(line_total-line_refund)::bigint,sum(round(line_cogs*(1-refund_ratio)))::bigint,
  (sum(line_total-line_refund)-sum(round(line_cogs*(1-refund_ratio))))::bigint,
  count(distinct id)::integer
from line_facts group by company_id,location_id,day,variant_id;

-- Reverse signed movements from current stock, emitting rows only on movement
-- dates. Historical valuation is intentionally omitted where evidence is weak.
insert into public.inventory_position_days(company_id,location_id,variant_id,day,
  closing_quantity,closing_value,quality)
with daily as (
  select m.company_id,m.stock_location_id location_id,m.variant_id,
    (m.created_at at time zone c.business_timezone)::date as day,sum(m.quantity) as delta
  from public.inventory_movements m join public.companies c on c.id=m.company_id
  where m.stock_location_id is not null
  group by m.company_id,m.stock_location_id,m.variant_id,
    (m.created_at at time zone c.business_timezone)::date
), current_stock as (
  select company_id,stock_location_id location_id,variant_id,coalesce(sum(remaining),0) quantity
  from public.inventory_batches group by company_id,stock_location_id,variant_id
), positions as (
  select d.*,coalesce(s.quantity,0)-coalesce(sum(d.delta) over(
    partition by d.company_id,d.location_id,d.variant_id order by d.day desc
    rows between unbounded preceding and 1 preceding),0) closing_quantity
  from daily d left join current_stock s using(company_id,location_id,variant_id)
)
select company_id,location_id,variant_id,day,closing_quantity,null,'estimated' from positions
on conflict do nothing;

-- Seed one coalesced target per active variant/location. The worker creates all
-- four preset rows and exact current positions without blocking this migration.
insert into public.analytics_dirty_buckets(company_id,location_id,day,variant_id,
  sales_dirty,attention_dirty,position_dirty,reason)
select v.company_id,l.id,(now() at time zone c.business_timezone)::date,v.id,
  true,true,true,'baseline'
from public.product_variants v join public.companies c on c.id=v.company_id
join public.stock_locations l on l.company_id=v.company_id and l.is_active
where v.active and v.kind<>'service' and v.track_inventory
on conflict do nothing;

-- Compatibility names become cheap projections over incremental facts. The
-- legacy restock RPC continues to work without an hourly full refresh.
drop view public.rpt_daily_product_sales;
drop materialized view public.mv_daily_product_sales;
drop materialized view public.mv_daily_location_product_sales;

create view public.mv_daily_location_product_sales as
select company_id,location_id,day,variant_id,net_quantity quantity,
  net_revenue revenue,corrected_cogs cogs from public.product_daily_facts;
create view public.mv_daily_product_sales as
select company_id,day,variant_id,sum(net_quantity) quantity,
  sum(net_revenue)::bigint revenue,sum(corrected_cogs)::bigint cogs
from public.product_daily_facts group by company_id,day,variant_id;
revoke all on public.mv_daily_location_product_sales,public.mv_daily_product_sales
  from public,anon,authenticated;

create view public.rpt_daily_product_sales as
select * from public.mv_daily_product_sales
where (company_id=(select public.current_company_id())
  and (select public.current_user_has_permission('ViewFinancials')))
  or (select public.is_platform_admin());
revoke all on public.rpt_daily_product_sales from public,anon,authenticated;
grant select on public.rpt_daily_product_sales to authenticated;

create or replace function public.refresh_analytics()
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Compatibility for explicit administrative refreshes: drain a bounded
  -- amount of already-enqueued product work, never rescan product history.
  perform public.process_analytics_dirty_buckets(1000);
  refresh materialized view concurrently public.mv_daily_sales_summary;
  refresh materialized view concurrently public.mv_daily_customer_stats;
  refresh materialized view concurrently public.mv_daily_order_stats;
end;
$$;
revoke execute on function public.refresh_analytics() from authenticated,anon,public;
grant execute on function public.refresh_analytics() to service_role;

create or replace function public.enqueue_product_window_rollover()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  insert into public.analytics_dirty_buckets(company_id,location_id,day,variant_id,
    sales_dirty,attention_dirty,position_dirty,reason)
  select distinct f.company_id,f.location_id,(now() at time zone c.business_timezone)::date,
    f.variant_id,true,true,false,'window_rollover'
  from public.product_daily_facts f join public.companies c on c.id=f.company_id
  where f.day in ((now() at time zone c.business_timezone)::date,
    (now() at time zone c.business_timezone)::date-7,
    (now() at time zone c.business_timezone)::date-14,
    (now() at time zone c.business_timezone)::date-30,
    (now() at time zone c.business_timezone)::date-60,
    (now() at time zone c.business_timezone)::date-180,
    (now() at time zone c.business_timezone)::date-360,
    (now() at time zone c.business_timezone)::date-365,
    (now() at time zone c.business_timezone)::date-730)
  on conflict(company_id,location_id,day,variant_id) do update set sales_dirty=true,
    attention_dirty=true,available_at=least(public.analytics_dirty_buckets.available_at,now());
  get diagnostics v_count=row_count;return v_count;
end;
$$;
revoke execute on function public.enqueue_product_window_rollover() from public,anon,authenticated;
grant execute on function public.enqueue_product_window_rollover() to service_role;

create or replace function public.product_intelligence(
  p_window_days integer default 30,p_location_id uuid default null,p_supplier_id uuid default null,
  p_manufacturer_id uuid default null,p_search text default null,p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_finance boolean;v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_window_days not in (7,30,180,365) then raise exception 'invalid_product_window'; end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  v_finance:=public.current_user_has_permission('ViewFinancials');
  with rows as (
    select v.id variant_id,v.product_id,p.name product_name,v.name variant_name,v.stock_unit,
      p.manufacturer_id,mf.name manufacturer_name,w.current_quantity,w.previous_quantity,
      case when v_finance then w.gross_revenue end gross_revenue,
      case when v_finance then w.refund_amount end refund_amount,
      case when v_finance then w.net_revenue end net_revenue,
      case when v_finance then w.corrected_cogs end corrected_cogs,
      case when v_finance then w.margin end margin,a.signal,a.current_stock,
      case when v_finance then a.current_value end current_value,a.days_of_cover,
      a.reorder_quantity,a.last_sale_date,a.reason_code,
      greatest(w.refreshed_at,a.refreshed_at) refreshed_at
    from public.product_variants v join public.products p on p.id=v.product_id
    left join public.manufacturers mf on mf.id=p.manufacturer_id
    left join public.product_window_metrics w on w.company_id=v.company_id
      and w.location_id=p_location_id and w.variant_id=v.id and w.window_days=p_window_days
    left join public.product_attention a on a.company_id=v.company_id
      and a.location_id=p_location_id and a.variant_id=v.id
    where v.company_id=v_company and v.active and p.active and v.kind<>'service'
      and (p_search is null or p.name ilike '%'||p_search||'%' or v.name ilike '%'||p_search||'%'
        or v.sku ilike '%'||p_search||'%')
      and (p_manufacturer_id is null or p.manufacturer_id=p_manufacturer_id)
      and (p_supplier_id is null or exists(select 1 from public.purchase_lines pl
        join public.purchases pu on pu.id=pl.purchase_id where pl.variant_id=v.id
          and pu.supplier_id=p_supplier_id and pu.status='posted'))
    order by case a.signal when 'stockout' then 1 when 'reorder' then 2 when 'low_cover' then 3
      when 'insufficient_history' then 4 when 'slow' then 5 else 6 end,
      a.days_of_cover nulls last,w.current_quantity desc,v.id
    limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
  )
  select jsonb_build_object('windowDays',p_window_days,'items',coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb),
    'nextOffset',case when count(*)=least(greatest(p_limit,1),100) then greatest(p_offset,0)+count(*) end,
    'financialsIncluded',v_finance) into v_result from rows;
  return v_result;
end;
$$;
revoke execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer)
  from public,anon;
grant execute on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer)
  to authenticated;

create or replace function public.product_profile(
  p_variant_id uuid,p_location_id uuid,p_since date default null,p_until date default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_timezone text;v_today date;v_from date;v_to date;
  v_finance boolean;v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_location_id is null or not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  select business_timezone into v_timezone from public.companies where id=v_company;
  v_today:=(now() at time zone v_timezone)::date;v_to:=coalesce(p_until,v_today);
  v_from:=coalesce(p_since,v_to-29);
  if v_from>v_to or v_to-v_from>365 then raise exception 'product_profile_range_too_large'; end if;
  v_finance:=public.current_user_has_permission('ViewFinancials');
  with days as (select generate_series(v_from,v_to,interval '1 day')::date as day),
  positions as (
    select d.day,pos.closing_quantity,
      case when v_finance then pos.closing_value end closing_value,
      coalesce(pos.quality,'estimated') quality
    from days d left join lateral (
      select i.closing_quantity,i.closing_value,i.quality from public.inventory_position_days i
      where i.company_id=v_company and i.location_id=p_location_id and i.variant_id=p_variant_id
        and i.day<=d.day order by i.day desc limit 1) pos on true
  ), trend as (
    select d.day,coalesce(f.gross_quantity,0) gross_quantity,
      coalesce(f.returned_quantity,0) returned_quantity,coalesce(f.net_quantity,0) net_quantity,
      case when v_finance then coalesce(f.gross_revenue,0) end gross_revenue,
      case when v_finance then coalesce(f.refund_amount,0) end refund_amount,
      case when v_finance then coalesce(f.net_revenue,0) end net_revenue,
      case when v_finance then coalesce(f.corrected_cogs,0) end corrected_cogs,
      case when v_finance then coalesce(f.margin,0) end margin
    from days d left join public.product_daily_facts f on f.company_id=v_company
      and f.location_id=p_location_id and f.variant_id=p_variant_id and f.day=d.day
  )
  select jsonb_build_object('variant',jsonb_build_object('id',v.id,'productId',p.id,
      'productName',p.name,'variantName',v.name,'sku',v.sku,'stockUnit',v.stock_unit,
      'manufacturerId',p.manufacturer_id,'manufacturerName',mf.name,
      'supplierId',preferred.supplier_id,'supplierName',preferred.supplier_name),
    'attention',to_jsonb(a)-case when v_finance then '' else 'current_value' end,
    'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.day) from trend t),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from positions s),'[]'::jsonb),
    'coverage',jsonb_build_object('from',v_from,'to',v_to,'days',v_to-v_from+1,
      'estimatedDays',(select count(*) from positions where quality='estimated')),
    'summary',jsonb_build_object('averageStock',(select round(avg(closing_quantity),3) from positions),
      'stockoutDays',(select count(*) from positions where closing_quantity<=0),
      'unitsSold',(select coalesce(sum(net_quantity),0) from trend),
      'netRevenue',case when v_finance then (select coalesce(sum(net_revenue),0) from trend) end,
      'cogs',case when v_finance then (select coalesce(sum(corrected_cogs),0) from trend) end,
      'margin',case when v_finance then (select coalesce(sum(margin),0) from trend) end))
  into v_result from public.product_variants v join public.products p on p.id=v.product_id
  left join public.manufacturers mf on mf.id=p.manufacturer_id
  left join lateral (
    select pu.supplier_id,trim(concat_ws(' ',s.first_name,s.last_name)) supplier_name
    from public.purchase_lines pl join public.purchases pu on pu.id=pl.purchase_id
    join public.customers s on s.id=pu.supplier_id
    where pl.variant_id=v.id and pu.company_id=v_company and pu.status='posted'
    order by pu.purchase_date desc,pu.created_at desc,pu.id desc limit 1
  ) preferred on true
  left join public.product_attention a on a.company_id=v.company_id and a.location_id=p_location_id
    and a.variant_id=v.id
  where v.company_id=v_company and v.id=p_variant_id;
  return v_result;
end;
$$;
revoke execute on function public.product_profile(uuid,uuid,date,date) from public,anon;
grant execute on function public.product_profile(uuid,uuid,date,date) to authenticated;

create or replace function public.insight_attention_feed(
  p_domain text default 'all',p_location_id uuid default null,p_limit integer default 30,p_cursor integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_finance boolean;v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_domain not in ('all','credit','products') then raise exception 'invalid_insight_domain'; end if;
  v_finance:=public.current_user_has_permission('ViewFinancials');
  if p_location_id is not null and not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied'; end if;
  with items as (
    select case when p.band in ('high_risk','restricted') then 'critical' else 'plan' end urgency,
      'credit' domain,p.side entity_type,p.party_id entity_id,p.party_name title,p.band signal,
      p.reason_codes[1] reason_code,p.recommendation_code consequence_code,
      case when v_finance then p.overdue_amount end amount,null::numeric stock,p.oldest_overdue_days sort_metric,
      p.refreshed_at,'/insights/credit/'||p.side||'/'||p.party_id::text href
    from public.party_credit_profile p where v_finance and p.company_id=v_company
      and p_domain in ('all','credit') and p.band in ('high_risk','restricted','watch')
    union all
    select case when a.signal='stockout' then 'critical' else 'plan' end,'products','product',a.variant_id,
      pr.name||case when v.name<>'Default' then ' · '||v.name else '' end,a.signal,a.reason_code,
      case when a.reorder_quantity is null then 'review_demand_history' else 'review_reorder' end,
      null,a.current_stock,coalesce(a.days_of_cover,999999),a.refreshed_at,
      '/insights/products/'||a.variant_id::text
    from public.product_attention a join public.product_variants v on v.id=a.variant_id
    join public.products pr on pr.id=v.product_id
    where a.company_id=v_company and p_domain in ('all','products')
      and (p_location_id is null or a.location_id=p_location_id)
      and a.signal in ('stockout','reorder','low_cover','insufficient_history')
  ), ranked as (
    select *,row_number() over(order by case urgency when 'critical' then 1 else 2 end,
      case signal when 'high_risk' then 1 when 'restricted' then 2 when 'stockout' then 3
        when 'watch' then 4 when 'reorder' then 5 else 6 end,sort_metric,entity_id) rn from items
  ), page as (select * from ranked where rn>greatest(p_cursor,0)
    order by rn limit least(greatest(p_limit,1),100))
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by rn),'[]'::jsonb),
    'nextCursor',case when count(*)=least(greatest(p_limit,1),100) then max(rn) end,
    'generatedAt',now()) into v_result from page;
  return v_result;
end;
$$;
revoke execute on function public.insight_attention_feed(text,uuid,integer,integer) from public,anon;
grant execute on function public.insight_attention_feed(text,uuid,integer,integer) to authenticated;

select cron.schedule('product-intelligence-worker','* * * * *',
  $$select public.process_analytics_dirty_buckets(500)$$);
select cron.schedule('product-window-rollover','7 0 * * *',
  $$select public.enqueue_product_window_rollover()$$);

comment on table public.inventory_position_days is
  'Sparse closing positions only on stock/value change dates; expand at most 366 days for one profile.';
comment on table public.product_window_metrics is
  'Precomputed preset windows; product directories must not scan raw order history.';
