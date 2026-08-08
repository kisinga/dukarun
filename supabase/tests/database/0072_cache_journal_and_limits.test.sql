begin;
select plan(36);

select testkit.create_user('72727272-7272-4727-8727-727272727271', 'cache-admin@local.test');
select testkit.create_user('72727272-7272-4727-8727-727272727272', 'cache-peer@local.test');
select testkit.create_user('72727272-7272-4727-8727-727272727273', 'cache-other@local.test');

insert into public.subscription_tiers(
  code,name,price_monthly,price_yearly,multiple_locations_enabled,
  staff_performance_enabled,commissions_available,max_products
) values ('cache-two','Cache Two',0,0,false,false,false,2);

create temp table cache_company as
select testkit.provision('72727272-7272-4727-8727-727272727271','Cache Journal Co') company_id;
create temp table other_company as
select testkit.provision('72727272-7272-4727-8727-727272727273','Other Cache Co') company_id;
grant select on pg_temp.cache_company, pg_temp.other_company to authenticated;
select testkit.add_member(
  (select company_id from cache_company),
  '72727272-7272-4727-8727-727272727272',
  'Cache Peer', array['SettleOrder']
);
update public.companies set subscription_tier_id=(select id from public.subscription_tiers where code='cache-two')
where id=(select company_id from cache_company);

select is(
  (select max_products from public.subscription_tiers where code='standard'),
  5000,
  'Standard remains capped at 5,000 active variants'
);
select is(
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='subscription_tiers' and column_name='max_products'),
  '10000',
  'new tier product limit defaults to 10,000'
);
select throws_ok(
  $$insert into public.subscription_tiers(
    code,name,price_monthly,price_yearly,multiple_locations_enabled,
    staff_performance_enabled,commissions_available,max_products
  ) values ('too-large','Too Large',0,0,false,false,false,10001)$$,
  'P0001',
  'enterprise_required: product limits above 10,000 require Enterprise',
  'limits above 10,000 require Enterprise'
);

select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
create temp table quota_products as
select public.create_catalog_product('Quota One','[{"sku":"QUOTA-1","price":10}]') first_id;
alter table quota_products add column second_id uuid;
update quota_products set second_id=public.create_catalog_product('Quota Two','[{"sku":"QUOTA-2","price":20}]');

select is(
  (select active_variants from public.company_usage_counters
   where company_id=(select company_id from cache_company)),
  2,
  'transactional counter tracks active variants'
);
select throws_ok(
  $$select public.create_catalog_product('Quota Three','[{"sku":"QUOTA-3","price":30}]')$$,
  'P0001','limit_reached: product limit (2); upgrade your plan',
  'tier quota rejects the next active variant'
);
select is(
  (select active_variants from public.company_usage_counters
   where company_id=(select company_id from cache_company)),
  2,
  'failed product transaction does not drift the counter'
);

reset role;
select throws_ok(
  format(
    'update public.product_variants set company_id=%L where product_id=%L',
    (select company_id from other_company),
    (select first_id from quota_products)
  ),
  'P0001',
  'invalid_company_change: product variants cannot move between companies',
  'variant company changes cannot bypass quota counters'
);
update public.companies set subscription_exempt_until=now()+interval '1 day'
where id=(select company_id from cache_company);
update public.company_usage_counters set active_variants=9999
where company_id=(select company_id from cache_company);
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
create temp table ceiling_product as
select public.create_catalog_product('Ceiling','[{"sku":"CEILING-1","price":1}]') id;
select is(
  (select active_variants from public.company_usage_counters
   where company_id=(select company_id from cache_company)),
  10000,
  'subscription exemption can reach but not exceed the technical ceiling'
);
select throws_ok(
  $$select public.create_catalog_product('Over Ceiling','[{"sku":"CEILING-2","price":1}]')$$,
  'P0001','enterprise_required: the non-Enterprise catalogue limit is 10,000 active variants',
  'subscription exemption does not bypass the 10,000 ceiling'
);

reset role;
update public.company_usage_counters set active_variants=3
where company_id=(select company_id from cache_company);
update public.subscription_tiers set max_products=100
where code='cache-two';
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
select is(public.reconcile_company_usage((select company_id from cache_company)),3,
  'explicit reconciliation repairs usage from variant rows');
select matches(
  pg_get_functiondef('public.enforce_product_limit()'::regprocedure),
  'active_variants < v_limit',
  'concurrent quota admission uses one atomic conditional counter update'
);
reset role;
select ok(
  exists(select 1 from cron.job where jobname='reconcile-company-usage'),
  'usage counters are periodically reconciled against active variant rows'
);

create temp table journal_before as
select coalesce(max(sequence),0) sequence from public.cache_change_log
where company_id=(select company_id from cache_company) and stream='catalog';
savepoint rolled_back_catalog;
update public.products set name='Rolled Back Name' where id=(select first_id from quota_products);
rollback to rolled_back_catalog;
select is(
  (select coalesce(max(sequence),0) from public.cache_change_log
   where company_id=(select company_id from cache_company) and stream='catalog'),
  (select sequence from journal_before),
  'journal changes roll back with the domain transaction'
);

update public.products set name='Quota One A' where id=(select first_id from quota_products);
update public.products set name='Quota One B' where id=(select first_id from quota_products);
select ok(
  (select bool_and(sequence>lag_sequence) from (
    select sequence,lag(sequence) over(order by sequence) lag_sequence
    from public.cache_change_log
    where company_id=(select company_id from cache_company) and stream='catalog'
  ) ordered where lag_sequence is not null),
  'journal sequence is strictly ordered'
);

insert into public.inventory_batches(
  company_id,variant_id,stock_location_id,quantity,remaining,unit_cost
)
select (select company_id from cache_company),v.id,l.id,1,1,10
from public.product_variants v
cross join lateral (
  select id from public.stock_locations
  where company_id=(select company_id from cache_company)
  order by is_default desc,id limit 1
) l
where v.product_id=(select first_id from quota_products)
limit 1;
select is(
  (select entity_type from public.cache_change_log
   where company_id=(select company_id from cache_company) and stream='catalog'
   order by sequence desc limit 1),
  'stock',
  'stock writes emit a narrow variant-stock invalidation'
);
select is(
  (jsonb_path_query_first(
    public.catalog_management_page('all','all','all',null,'name','asc',1,100,null),
    '$.groups[*].variants[*] ? (@.sku == "QUOTA-1").stock_value'
  ) #>> '{}')::bigint,
  10::bigint,
  'server-paged catalogue variants include stock value'
);

create temp table empty_active_family as
select public.create_catalog_product('Active Empty Family','[{"sku":"EMPTY-FAMILY","price":1}]') id;
update public.product_variants set active=false
where product_id=(select id from empty_active_family);
select is(
  (select count(*)::integer from public.catalog_cache_families(null,1000)
   where id=(select id from empty_active_family)),
  1,
  'active product families remain manageable without an active variant'
);

reset role;
select public.emit_cache_change(
  (select company_id from cache_company),'catalog','product',gen_random_uuid()::text
) from generate_series(1,520);
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
select is(
  (select count(*)::integer from public.cache_change_log
   where company_id=(select company_id from cache_company) and stream='catalog'),
  512,
  'each company stream retains exactly 512 entries'
);
select is(
  (select head_sequence-pruned_through_sequence from public.cache_stream_heads
   where company_id=(select company_id from cache_company) and stream='catalog'),
  512::bigint,
  'stream head records the retention floor'
);
select is(
  (public.sync_cache_stream('catalog',0,512)->>'resetRequired')::boolean,
  true,
  'a reconnect older than retention is told to reset'
);
select is(
  (public.sync_cache_stream(
    'catalog',
    (select pruned_through_sequence from public.cache_stream_heads
     where company_id=(select company_id from cache_company) and stream='catalog'),
    512
  )->>'resetRequired')::boolean,
  false,
  'a reconnect inside retention receives incremental changes'
);

reset role;
insert into public.notifications(company_id,user_id,type,title,body)
values(
  (select company_id from cache_company),
  '72727272-7272-4727-8727-727272727272',
  'system','Peer only','Targeted cache test'
);
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
select is(
  (select count(*)::integer from public.cache_change_log
   where company_id=(select company_id from cache_company) and stream='inbox'
     and entity_type='notification'),
  0,
  'RLS hides another user targeted journal rows'
);
select is(
  jsonb_array_length(public.sync_cache_stream('inbox',0,512)->'changes'),
  0,
  'sync RPC also hides another user targeted changes'
);

reset role;
select testkit.as_user((select company_id from other_company),
  '72727272-7272-4727-8727-727272727273','Admin');
select is(
  (select count(*)::integer from public.cache_change_log
   where company_id=(select company_id from cache_company)),
  0,
  'journal RLS isolates companies'
);

reset role;
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
reset role;
update public.roles
set permissions=array_remove(permissions,'ViewFinancials')
where company_id=(select company_id from cache_company) and name='Admin';
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
select ok(
  not public.current_user_has_permission('ViewFinancials'),
  'a role permission revocation is authoritative immediately'
);
select ok(
  exists(
    select 1 from jsonb_array_elements(public.sync_cache_stream('team',0,512)->'changes') change
    where change->>'entityType'='role'
  ),
  'permission revocation emits a durable team cache invalidation'
);

create temp table staged_import as
select public.begin_catalog_import('merge','72727272-7272-4727-8727-727272727210') result;
select is(
  (public.append_catalog_import_chunk(
    (select (result->>'import_id')::uuid from staged_import),0,
    '[{"name":"Staged Flour","variants":[{"sku":"STAGED-1","price":90}]}]'
  )->>'product_count')::integer,
  1,
  'bounded import chunk is staged'
);
select is(
  public.append_catalog_import_chunk(
    (select (result->>'import_id')::uuid from staged_import),0,
    '[{"name":"Staged Flour","variants":[{"sku":"STAGED-1","price":90}]}]'
  )->>'idempotent',
  'true',
  'replaying an identical chunk is idempotent'
);
create temp table reset_before as
select count(*)::integer count from public.cache_change_log
where company_id=(select company_id from cache_company) and stream='catalog' and operation='reset';
select is(
  public.finalize_catalog_import((select (result->>'import_id')::uuid from staged_import))->>'status',
  'completed',
  'staged import finalizes atomically'
);
select is(
  (select count(*)::integer from public.cache_change_log
   where company_id=(select company_id from cache_company) and stream='catalog' and operation='reset'),
  (select count+1 from reset_before),
  'finalization emits one catalogue reset event'
);
select is(
  (select count(*)::integer from public.catalog_import_chunks
   where import_id=(select (result->>'import_id')::uuid from staged_import)),
  0,
  'completed import staging is removed'
);
select ok(
  exists(
    select 1
    from pg_proc p
    cross join lateral unnest(p.proconfig) config
    where p.oid='public.finalize_catalog_import(uuid)'::regprocedure
      and config='statement_timeout=120s'
  ),
  'atomic finalize has a bounded timeout above the authenticated role default'
);

create temp table oversize_import as
select public.begin_catalog_import('merge','72727272-7272-4727-8727-727272727211') result;
select throws_ok(
  format($sql$select public.append_catalog_import_chunk(%L,0,
    (select jsonb_agg(jsonb_build_object('name','P'||n,'variants',jsonb_build_array(jsonb_build_object('sku','S'||n,'price',1))))
     from generate_series(1,501)n))$sql$,
    (select result->>'import_id' from oversize_import)),
  'P0001','chunk_product_limit: each chunk must contain 1..500 products',
  'import product chunks are capped at 500'
);

create temp table aggregate_import as
select public.begin_catalog_import('merge','72727272-7272-4727-8727-727272727212') result;
grant select on pg_temp.aggregate_import to authenticated;
reset role;
insert into public.catalog_import_chunks(
  import_id,company_id,chunk_index,products,product_count,variant_count
)
select (select (result->>'import_id')::uuid from aggregate_import),
  (select company_id from cache_company),n,'[]'::jsonb,500,500
from generate_series(0,19) n;
select testkit.as_user((select company_id from cache_company),
  '72727272-7272-4727-8727-727272727271','Admin');
select throws_ok(
  format($sql$select public.append_catalog_import_chunk(%L,20,
    '[{"name":"One Too Many","variants":[{"sku":"OVER-AGGREGATE","price":1}]}]')$sql$,
    (select result->>'import_id' from aggregate_import)),
  'P0001','import_product_limit: each import may contain at most 10,000 products',
  'aggregate import product count is bounded across chunks'
);

reset role;
select ok(
  exists(select 1 from pg_indexes where schemaname='public'
    and indexname='orders_company_location_recent_idx'),
  'recent sales has a company/location/time index'
);
select ok(
  not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename in (
      'products','product_variants','inventory_batches','customers','orders','payments',
      'notifications','approvals','purchases','purchase_payments'
    )
  ),
  'raw cache tables are no longer Realtime sources'
);

select * from finish();
rollback;
