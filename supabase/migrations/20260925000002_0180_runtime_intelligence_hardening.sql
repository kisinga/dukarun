-- Harden runtime intelligence boundaries and keep derived projections coherent.

-- Credit-note receivable credits settle customer documents even when no cash
-- payment exists. The ledger is authoritative because historical cash-only
-- refunds must not be mistaken for receivable credits.
create or replace function public.apply_refund_credit_to_credit_performance()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_credit bigint;
  v_applied bigint;
  v_credit_on date;
  v_factor_sum numeric;
  v_principal_days numeric;
  v_credit_factor numeric;
begin
  if new.side<>'customer' then return new; end if;

  select coalesce(sum(l.credit),0)::bigint,max(e.entry_date),
    coalesce(sum(l.credit*(case
      when e.entry_date<=new.due_on then 1
      when e.entry_date<=new.due_on+7 then .8
      when e.entry_date<=new.due_on+30 then .5
      when e.entry_date<=new.due_on+60 then .2 else 0 end)),0),
    coalesce(sum(l.credit*greatest(e.entry_date-new.due_on,0)),0)
  into v_credit,v_credit_on,v_factor_sum,v_principal_days
  from public.refunds r
  join public.ledger_journal_entries e on e.company_id=r.company_id
    and e.source_type='Refund' and e.source_id=r.id::text
  join public.ledger_journal_lines l on l.entry_id=e.id and l.company_id=e.company_id
    and l.order_id=r.order_id and l.credit>0
  join public.ledger_accounts a on a.id=l.account_id and a.company_id=l.company_id
    and a.code='ACCOUNTS_RECEIVABLE'
  where r.company_id=new.company_id and r.order_id=new.document_id;

  v_applied:=least(v_credit,new.outstanding_amount);
  if v_applied<=0 then return new; end if;
  v_credit_factor:=v_factor_sum/nullif(v_credit,0);
  new.punctuality_factor:=case
    when new.punctuality_factor is null then v_credit_factor
    else (new.punctuality_factor*new.settled_amount+v_credit_factor*v_applied)
      /nullif(new.settled_amount+v_applied,0)
  end;
  new.settled_principal_days:=new.settled_principal_days
    +(v_principal_days*v_applied/nullif(v_credit,0));
  new.settled_amount:=new.settled_amount+v_applied;
  new.outstanding_amount:=new.outstanding_amount-v_applied;
  new.settled_on:=greatest(new.settled_on,v_credit_on);
  if new.outstanding_amount=0 then
    new.settled_days_late:=greatest(new.settled_on-new.due_on,0);
    new.next_refresh_on:=null;
  end if;
  return new;
end;
$$;
revoke execute on function public.apply_refund_credit_to_credit_performance()
  from public,anon,authenticated;
create trigger credit_performance_apply_refund_credit
before insert on public.credit_document_performance
for each row execute function public.apply_refund_credit_to_credit_performance();

create or replace function public.enqueue_credit_from_refund()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_order record;
begin
  if tg_op in ('UPDATE','DELETE') then
    select company_id,customer_id into v_order from public.orders where id=old.order_id;
    perform public.enqueue_credit_party(v_order.company_id,'customer',v_order.customer_id,'refund');
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select company_id,customer_id into v_order from public.orders where id=new.order_id;
    perform public.enqueue_credit_party(v_order.company_id,'customer',v_order.customer_id,'refund');
  end if;
  return coalesce(new,old);
end;
$$;
revoke execute on function public.enqueue_credit_from_refund()
  from public,anon,authenticated;
create trigger refunds_enqueue_credit
after insert or update or delete on public.refunds
for each row execute function public.enqueue_credit_from_refund();

-- Snapshot the authoritative server-side profile. Callers may only attach the
-- acknowledgement that belongs to the checkout interaction.
drop function public.record_credit_advisory_snapshot(
  uuid,numeric,text,text,text[],text,timestamptz,text
);
create function public.record_credit_advisory_snapshot(
  p_order_id uuid,p_acknowledgement_reason text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_company uuid:=public.current_company_id();
  v_order public.orders%rowtype;
  v_profile public.party_credit_profile%rowtype;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('SettleOrder') then
    raise exception 'permission_denied: SettleOrder required'; end if;
  select * into v_order from public.orders where id=p_order_id and company_id=v_company;
  if v_order.id is null or v_order.customer_id is null then raise exception 'sale_not_found'; end if;
  select * into v_profile from public.party_credit_profile
  where company_id=v_company and side='customer' and party_id=v_order.customer_id;
  insert into public.sale_credit_advisory_snapshots(company_id,order_id,customer_id,score,band,
    confidence,reason_codes,recommendation_code,score_refreshed_at,acknowledgement_reason,acknowledged_by)
  values(v_company,v_order.id,v_order.customer_id,v_profile.score,
    coalesce(v_profile.band,'unrated'),coalesce(v_profile.confidence,'unrated'),
    coalesce(v_profile.reason_codes,array['profile_updating']::text[]),
    coalesce(v_profile.recommendation_code,'establish_limit'),v_profile.refreshed_at,
    nullif(btrim(p_acknowledgement_reason),''),auth.uid())
  on conflict(order_id) do nothing;
end;
$$;
revoke execute on function public.record_credit_advisory_snapshot(uuid,text)
  from public,anon;
grant execute on function public.record_credit_advisory_snapshot(uuid,text)
  to authenticated;

-- Credit scores are part of the offline party projection. Emit only when a
-- cached advisory field changes so daily no-op refreshes stay quiet.
create or replace function public.party_credit_profile_cache_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.score is distinct from old.score
    or new.band is distinct from old.band
    or new.confidence is distinct from old.confidence
    or new.reason_codes is distinct from old.reason_codes
    or new.recommendation_code is distinct from old.recommendation_code then
    perform public.emit_cache_change(new.company_id,'parties',new.side,new.party_id::text,'upsert');
  end if;
  return new;
end;
$$;
revoke execute on function public.party_credit_profile_cache_change()
  from public,anon,authenticated;
create trigger party_credit_profile_cache_change
after insert or update on public.party_credit_profile
for each row execute function public.party_credit_profile_cache_change();

-- Service and non-tracked variants do not have meaningful stock cover.
create or replace function public.refresh_product_attention(
  p_company_id uuid,p_location_id uuid,p_variant_id uuid
)
returns void language plpgsql security definer set search_path='' as $$
declare v_stock numeric;v_value bigint;v_demand numeric;v_cover numeric;v_reorder numeric;
  v_last date;v_lead integer;v_safety integer;v_signal text;v_reason text;v_eligible boolean;
begin
  select v.active and v.kind<>'service' and v.track_inventory,
    coalesce(v.reorder_lead_days,c.default_reorder_lead_days),
    coalesce(v.reorder_safety_days,c.default_reorder_safety_days)
  into v_eligible,v_lead,v_safety
  from public.product_variants v join public.companies c on c.id=v.company_id
  where v.id=p_variant_id and v.company_id=p_company_id;
  if not coalesce(v_eligible,false) then
    delete from public.product_attention where company_id=p_company_id
      and location_id=p_location_id and variant_id=p_variant_id;
    return;
  end if;
  select coalesce(sum(b.remaining),0),coalesce(sum(b.remaining_cost),0)::bigint
    into v_stock,v_value from public.inventory_batches b
  where b.company_id=p_company_id and b.stock_location_id=p_location_id
    and b.variant_id=p_variant_id and b.remaining>0;
  select m.current_quantity/30.0 into v_demand from public.product_window_metrics m
  where m.company_id=p_company_id and m.location_id=p_location_id
    and m.variant_id=p_variant_id and m.window_days=30;
  select max(day) into v_last from public.product_daily_facts where company_id=p_company_id
    and location_id=p_location_id and variant_id=p_variant_id and net_quantity>0;
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

-- A null location means all locations the caller can access, never all tenant
-- locations unconditionally.
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
      '/insights/inventory/'||a.variant_id::text
    from public.product_attention a join public.product_variants v on v.id=a.variant_id
    join public.products pr on pr.id=v.product_id
    where a.company_id=v_company and p_domain in ('all','products')
      and public.current_user_can_access_location(a.location_id)
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

-- One settings RPC keeps the form's four values atomic and enqueues the
-- derived attention refresh in the same transaction.
create or replace function public.update_inventory_settings(
  p_low_stock_threshold integer,p_batch_expiry_enabled boolean,
  p_default_lead_days integer,p_default_safety_days integer
)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_today date;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if not public.current_user_has_permission('ManageCompanySettings') then
    raise exception 'permission_denied: ManageCompanySettings required'; end if;
  if p_low_stock_threshold is null or p_low_stock_threshold<0
    or p_batch_expiry_enabled is null
    or p_default_lead_days not between 0 and 365
    or p_default_safety_days not between 0 and 365 then
    raise exception 'invalid_inventory_settings'; end if;
  update public.companies set low_stock_threshold=p_low_stock_threshold,
    batch_expiry_enabled=p_batch_expiry_enabled,
    default_reorder_lead_days=p_default_lead_days,
    default_reorder_safety_days=p_default_safety_days,updated_at=now()
  where id=v_company;
  select (now() at time zone business_timezone)::date into v_today
  from public.companies where id=v_company;
  insert into public.analytics_dirty_buckets(company_id,location_id,day,variant_id,
    sales_dirty,attention_dirty,position_dirty,reason)
  select v.company_id,l.id,v_today,v.id,false,true,false,'inventory_setting'
  from public.product_variants v join public.stock_locations l
    on l.company_id=v.company_id and l.is_active
  where v.company_id=v_company and v.active and v.kind<>'service' and v.track_inventory
  on conflict(company_id,location_id,day,variant_id) do update set attention_dirty=true,
    available_at=least(public.analytics_dirty_buckets.available_at,now());
end;
$$;
revoke execute on function public.update_inventory_settings(integer,boolean,integer,integer)
  from public,anon;
grant execute on function public.update_inventory_settings(integer,boolean,integer,integer)
  to authenticated;
