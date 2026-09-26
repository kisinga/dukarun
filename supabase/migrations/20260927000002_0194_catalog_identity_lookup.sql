-- Bounded identity-only lookup for inactive or historical variants that are not
-- present in the active journal-backed catalog snapshot. Commercial and stock
-- fields are intentionally excluded.

create or replace function public.catalog_identity_lookup(p_variant_ids uuid[])
returns table(
  variant_id uuid,
  company_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  kind text,
  sku text,
  stock_unit text,
  variant_active boolean,
  product_active boolean,
  manufacturer_id uuid,
  manufacturer_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if public.current_company_id() is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce(cardinality(p_variant_ids), 0) > 100 then
    raise exception 'identity_batch_too_large';
  end if;

  return query
  select
    v.id,
    v.company_id,
    p.id,
    p.name,
    v.name,
    v.kind,
    v.sku,
    v.stock_unit,
    v.active,
    p.active,
    m.id,
    m.name
  from public.product_variants v
  join public.products p
    on p.id = v.product_id
   and p.company_id = v.company_id
  left join public.manufacturers m
    on m.id = p.manufacturer_id
   and m.company_id = p.company_id
  where v.company_id = public.current_company_id()
    and v.id = any(coalesce(p_variant_ids, '{}'::uuid[]));
end;
$$;

revoke execute on function public.catalog_identity_lookup(uuid[]) from public, anon;
grant execute on function public.catalog_identity_lookup(uuid[]) to authenticated, service_role;

comment on function public.catalog_identity_lookup(uuid[]) is
  'Returns bounded display identity for active or historical variants without commercial or stock state.';

-- Keep operational priorities aligned with the active catalog. Deactivating a
-- product does not itself enqueue analytics cleanup, so filtering at read time
-- prevents stale attention rows from recommending discontinued stock.
create or replace function public.insight_attention_feed_with_identity(
  p_domain text default 'all',
  p_location_id uuid default null,
  p_limit integer default 30,
  p_cursor integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid := public.current_company_id();
  v_finance boolean;
  v_result jsonb;
begin
  if v_company is null then raise exception 'not_authenticated'; end if;
  if p_domain not in ('all','credit','products') then raise exception 'invalid_insight_domain'; end if;
  v_finance := public.current_user_has_permission('ViewFinancials');
  if p_location_id is not null and not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;

  with items as (
    select case when p.band in ('high_risk','restricted') then 'critical' else 'plan' end urgency,
      'credit' domain,p.side entity_type,p.party_id entity_id,p.party_name title,p.band signal,
      p.reason_codes[1] reason_code,p.recommendation_code consequence_code,
      case when v_finance then p.overdue_amount end amount,null::numeric stock,
      p.oldest_overdue_days sort_metric,p.refreshed_at,
      '/insights/credit/'||p.side||'/'||p.party_id::text href
    from public.party_credit_profile p
    where v_finance and p.company_id=v_company and p_domain in ('all','credit')
      and p.band in ('high_risk','restricted','watch')
    union all
    select case when a.signal='stockout' then 'critical' else 'plan' end,
      'products','product',a.variant_id,
      pr.name||case when v.name<>'Default' then ' · '||v.name else '' end,
      a.signal,a.reason_code,
      case when a.reorder_quantity is null then 'review_demand_history' else 'review_reorder' end,
      null,a.current_stock,coalesce(a.days_of_cover,999999),a.refreshed_at,
      '/insights/inventory/'||a.variant_id::text
    from public.product_attention a
    join public.product_variants v on v.id=a.variant_id and v.company_id=a.company_id
    join public.products pr on pr.id=v.product_id and pr.company_id=v.company_id
    where a.company_id=v_company and p_domain in ('all','products')
      and v.active and pr.active
      and public.current_user_can_access_location(a.location_id)
      and (p_location_id is null or a.location_id=p_location_id)
      and a.signal in ('stockout','reorder','low_cover','insufficient_history')
  ), ranked as (
    select *,row_number() over(order by case urgency when 'critical' then 1 else 2 end,
      case signal when 'high_risk' then 1 when 'restricted' then 2 when 'stockout' then 3
        when 'watch' then 4 when 'reorder' then 5 else 6 end,sort_metric,entity_id) rn
    from items
  ), page as (
    select * from ranked where rn>greatest(p_cursor,0)
    order by rn limit least(greatest(p_limit,1),100)
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(to_jsonb(page) order by rn),'[]'::jsonb),
    'nextCursor',case when count(*)=least(greatest(p_limit,1),100) then max(rn) end,
    'generatedAt',now()
  ) into v_result from page;
  return v_result;
end;
$$;

revoke execute on function public.insight_attention_feed_with_identity(text,uuid,integer,integer)
  from public, anon, authenticated;
