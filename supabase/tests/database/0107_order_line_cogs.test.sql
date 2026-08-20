begin;
select plan(5);

select testkit.create_user(
  'a1070000-0000-4000-8000-000000000001',
  'line-cogs-owner@test.local'
);

create temp table line_cogs_company as
select testkit.provision(
  'a1070000-0000-4000-8000-000000000001',
  'Line COGS Co'
) as company_id;
grant select on pg_temp.line_cogs_company to authenticated;

insert into public.products(id,company_id,name)
select 'a1070000-0000-4000-8000-000000000010'::uuid,company_id,'Tracked item'
from line_cogs_company
union all
select 'a1070000-0000-4000-8000-000000000011'::uuid,company_id,'Installation service'
from line_cogs_company;

insert into public.product_variants(
  id,product_id,company_id,name,kind,sku,price,track_inventory
)
select
  'a1070000-0000-4000-8000-000000000020'::uuid,
  'a1070000-0000-4000-8000-000000000010'::uuid,company_id,
  'Default','good','LINE-COGS-GOOD',300,true
from line_cogs_company
union all
select
  'a1070000-0000-4000-8000-000000000021'::uuid,
  'a1070000-0000-4000-8000-000000000011'::uuid,company_id,
  'Default','service','LINE-COGS-SERVICE',200,false
from line_cogs_company;

insert into public.inventory_batches(
  id,company_id,variant_id,quantity,remaining,unit_cost,purchased_at
)
select
  'a1070000-0000-4000-8000-000000000030'::uuid,company_id,
  'a1070000-0000-4000-8000-000000000020'::uuid,2,2,100,now()-interval '2 days'
from line_cogs_company
union all
select
  'a1070000-0000-4000-8000-000000000031'::uuid,company_id,
  'a1070000-0000-4000-8000-000000000020'::uuid,2,2,150,now()-interval '1 day'
from line_cogs_company;

select testkit.as_user(
  (select company_id from line_cogs_company),
  'a1070000-0000-4000-8000-000000000001',
  'Admin'
);
select testkit.ensure_open_session();

create temp table exact_line_sale as
select public.post_sale(
  null,
  '[
    {"variant_id":"a1070000-0000-4000-8000-000000000020","quantity":3,"unit_price":300},
    {"variant_id":"a1070000-0000-4000-8000-000000000021","quantity":1,"unit_price":200}
  ]',
  '[{"method":"cash","amount":1100}]'
) as order_id;
grant select on pg_temp.exact_line_sale to authenticated;

select is(
  (select cogs_total from public.order_lines
   where order_id=(select order_id from exact_line_sale)
     and variant_id='a1070000-0000-4000-8000-000000000020'),
  350::bigint,
  'tracked line stores its exact FIFO cost across batches'
);

select is(
  (select cogs_total from public.order_lines
   where order_id=(select order_id from exact_line_sale)
     and variant_id='a1070000-0000-4000-8000-000000000021'),
  0::bigint,
  'untracked service line has zero inventory COGS'
);

select is(
  (select sum(cogs_total)::bigint from public.order_lines
   where order_id=(select order_id from exact_line_sale)),
  (select cogs_total from public.orders where id=(select order_id from exact_line_sale)),
  'line COGS reconciles exactly to order COGS'
);

select is(
  (select net_total-cogs_total from public.orders where id=(select order_id from exact_line_sale)),
  (select sum(net_total-coalesce(cogs_total,0))::bigint from public.order_lines
   where order_id=(select order_id from exact_line_sale)),
  'VAT-exclusive line profit reconciles to order profit'
);

select ok(
  not exists(
    select 1 from public.order_lines
    where order_id=(select order_id from exact_line_sale) and cogs_total is null
  ),
  'every newly completed line receives an explicit COGS value'
);

select * from finish();
rollback;
