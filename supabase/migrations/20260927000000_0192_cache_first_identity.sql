-- Collection intelligence responses carry metric identifiers only. Authenticated
-- clients hydrate display identity from the journal-backed local caches.

alter function public.product_performance(integer,uuid,integer)
  rename to product_performance_with_identity;
revoke execute on function public.product_performance_with_identity(integer,uuid,integer)
  from public,anon,authenticated;

create function public.product_performance(
  p_window_days integer default 30,
  p_location_id uuid default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_source jsonb;
  v_leaders jsonb;
begin
  v_source:=public.product_performance_with_identity(p_window_days,p_location_id,p_limit);
  select coalesce(jsonb_object_agg(category,coalesce((
    select jsonb_agg(item-'product_id'-'product_name'-'variant_name'-'stock_unit')
    from jsonb_array_elements(rows) item
  ),'[]'::jsonb)),'{}'::jsonb)
  into v_leaders
  from jsonb_each(v_source->'leaders') entry(category,rows);
  return jsonb_set(v_source,'{leaders}',v_leaders,true);
end;
$$;
revoke execute on function public.product_performance(integer,uuid,integer) from public,anon;
grant execute on function public.product_performance(integer,uuid,integer) to authenticated;

alter function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  rename to product_intelligence_with_identity;
revoke execute on function public.product_intelligence_with_identity(
  integer,uuid,uuid,uuid,text,integer,integer,date,date
) from public,anon,authenticated;

create function public.product_intelligence(
  p_window_days integer default 30,
  p_location_id uuid default null,
  p_supplier_id uuid default null,
  p_manufacturer_id uuid default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_since date default null,
  p_until date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_source jsonb;
  v_items jsonb;
begin
  v_source:=public.product_intelligence_with_identity(
    p_window_days,p_location_id,p_supplier_id,p_manufacturer_id,p_search,
    p_limit,p_offset,p_since,p_until
  );
  select coalesce(jsonb_agg(
    item-'product_id'-'product_name'-'variant_name'-'stock_unit'
      -'manufacturer_id'-'manufacturer_name'
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_source->'items') item;
  return jsonb_set(v_source,'{items}',v_items,true);
end;
$$;
revoke execute on function public.product_intelligence(
  integer,uuid,uuid,uuid,text,integer,integer,date,date
) from public,anon;
grant execute on function public.product_intelligence(
  integer,uuid,uuid,uuid,text,integer,integer,date,date
) to authenticated;

alter function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  rename to restock_product_intelligence_with_identity;
revoke execute on function public.restock_product_intelligence_with_identity(
  date,date,uuid,uuid,uuid,integer
) from public,anon,authenticated,service_role;

create function public.restock_product_intelligence(
  p_since date,
  p_until date,
  p_location_id uuid,
  p_supplier_id uuid default null,
  p_manufacturer_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_source jsonb;
  v_products jsonb;
begin
  v_source:=public.restock_product_intelligence_with_identity(
    p_since,p_until,p_location_id,p_supplier_id,p_manufacturer_id,p_limit
  );
  select coalesce(jsonb_agg(
    item-'productId'-'productName'-'variantName'-'manufacturerId'-'manufacturerName'
  ),'[]'::jsonb)
  into v_products
  from jsonb_array_elements(v_source->'products') item;
  return jsonb_set(v_source,'{products}',v_products,true);
end;
$$;
revoke execute on function public.restock_product_intelligence(
  date,date,uuid,uuid,uuid,integer
) from public,anon;
grant execute on function public.restock_product_intelligence(
  date,date,uuid,uuid,uuid,integer
) to authenticated,service_role;

alter function public.insight_attention_feed(text,uuid,integer,integer)
  rename to insight_attention_feed_with_identity;
revoke execute on function public.insight_attention_feed_with_identity(text,uuid,integer,integer)
  from public,anon,authenticated;

create function public.insight_attention_feed(
  p_domain text default 'all',
  p_location_id uuid default null,
  p_limit integer default 30,
  p_cursor integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_source jsonb;
  v_items jsonb;
begin
  v_source:=public.insight_attention_feed_with_identity(
    p_domain,p_location_id,p_limit,p_cursor
  );
  select coalesce(jsonb_agg(
    case when item->>'domain'='products' then item-'title'-'href' else item end
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_source->'items') item;
  return jsonb_set(v_source,'{items}',v_items,true);
end;
$$;
revoke execute on function public.insight_attention_feed(text,uuid,integer,integer)
  from public,anon;
grant execute on function public.insight_attention_feed(text,uuid,integer,integer)
  to authenticated;

-- The financial dashboard source is permission-gated. Non-financial inventory
-- users still receive redacted performance leaders from the same single RPC.
create or replace function public.dashboard_location_snapshot(
  p_since date default ((now() at time zone 'Africa/Nairobi')::date-6),
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base jsonb:='{}'::jsonb;
begin
  if public.current_company_id() is null then raise exception 'not_authenticated'; end if;
  if p_location_id is not null and not public.current_user_can_access_location(p_location_id) then
    raise exception 'location_access_denied';
  end if;
  if public.current_user_has_permission('ViewFinancials') then
    v_base:=public.dashboard_location_snapshot_legacy(p_since,p_location_id);
  end if;
  return v_base||jsonb_build_object(
    'productPerformance',public.product_performance(7,p_location_id,10)
  );
end;
$$;
revoke execute on function public.dashboard_location_snapshot(date,uuid) from public,anon;
grant execute on function public.dashboard_location_snapshot(date,uuid) to authenticated;

comment on function public.product_performance(integer,uuid,integer) is
  'Returns product performance metrics keyed by variant id; clients hydrate display identity.';
comment on function public.product_intelligence(integer,uuid,uuid,uuid,text,integer,integer,date,date)
  is 'Returns product intelligence metrics keyed by variant id; clients hydrate display identity.';
comment on function public.restock_product_intelligence(date,date,uuid,uuid,uuid,integer)
  is 'Returns restock metrics keyed by variant id; clients hydrate product display identity.';
