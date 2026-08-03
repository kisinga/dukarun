-- Counted stock adjustment: explicit old/new quantities, FIFO decreases and valued increases.
begin;
select plan(15);

select has_function(
  'public',
  'post_stock_adjustment',
  array['uuid', 'numeric', 'numeric', 'text', 'bigint'],
  'counted stock adjustment RPC exists'
);

select is(
  to_regprocedure('public.post_inventory_adjustment(uuid,bigint,text)')::text,
  null::text,
  'ambiguous value-only adjustment RPC is removed'
);

select testkit.create_user(
  '11111111-1111-1111-1111-111111111111',
  'counted-stock@adjustment.local'
);

create temp table counted_stock_company as
select testkit.provision(
  '11111111-1111-1111-1111-111111111111',
  'Counted Stock Co'
) as company_id;
grant select on pg_temp.counted_stock_company to authenticated;

insert into public.products (id, company_id, name)
select
  'a0000000-0000-0000-0000-000000000046',
  company_id,
  'Tea'
from counted_stock_company;

insert into public.product_variants (
  id, product_id, company_id, name, sku, price, track_inventory
)
select
  'aa000000-0000-0000-0000-000000000046',
  'a0000000-0000-0000-0000-000000000046',
  company_id,
  '500g',
  'TEA500',
  600,
  true
from counted_stock_company;

insert into public.inventory_batches (
  company_id, variant_id, quantity, remaining, unit_cost
)
select
  company_id,
  'aa000000-0000-0000-0000-000000000046',
  10,
  10,
  300
from counted_stock_company;

select testkit.as_user(
  (select company_id from counted_stock_company),
  '11111111-1111-1111-1111-111111111111',
  'Admin'
);

select is(
  (select stock from public.product_stock
   where variant_id = 'aa000000-0000-0000-0000-000000000046'),
  10::numeric,
  'starting quantity is visible from batch stock'
);

create temp table counted_stock_decrease as
select public.post_stock_adjustment(
  'aa000000-0000-0000-0000-000000000046',
  10,
  7,
  'Expired stock'
) as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from counted_stock_decrease)
    order by a.code$$,
  $$values
    ('EXPIRY_LOSS', 900::bigint, 0::bigint),
    ('INVENTORY', 0::bigint, 900::bigint)$$,
  'a decrease consumes FIFO value and posts the appropriate loss'
);

select is(
  (select stock from public.product_stock
   where variant_id = 'aa000000-0000-0000-0000-000000000046'),
  7::numeric,
  'new lower quantity becomes batch stock'
);

create temp table counted_stock_increase as
select public.post_stock_adjustment(
  'aa000000-0000-0000-0000-000000000046',
  7,
  12,
  'Found stock',
  400
) as entry_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    where l.entry_id = (select entry_id from counted_stock_increase)
    order by a.code$$,
  $$values
    ('INVENTORY', 2000::bigint, 0::bigint),
    ('INVENTORY_ADJUSTMENT', 0::bigint, 2000::bigint)$$,
  'an increase posts the added batch value to inventory'
);

select is(
  (select stock from public.product_stock
   where variant_id = 'aa000000-0000-0000-0000-000000000046'),
  12::numeric,
  'new higher quantity becomes batch stock'
);

select is(
  (select stock_value from public.product_stock
   where variant_id = 'aa000000-0000-0000-0000-000000000046'),
  4100::bigint,
  'stock value equals the remaining FIFO layers'
);

select results_eq(
  $$select quantity::text, unit_cost::text, total_cost::text,
           meta ->> 'previousQuantity', meta ->> 'newQuantity'
    from public.inventory_movements
    where source_type = 'StockAdjustment'
      and variant_id = 'aa000000-0000-0000-0000-000000000046'$$,
  $$values ('5.000'::text, '400'::text, '2000'::text, '7.000'::text, '12'::text)$$,
  'increase movement keeps the old and new quantities in its audit metadata'
);

select public.post_stock_adjustment(
  'aa000000-0000-0000-0000-000000000046',
  12,
  14,
  'Stock count correction'
);

select is(
  (select stock from public.product_stock
   where variant_id = 'aa000000-0000-0000-0000-000000000046'),
  14::numeric,
  'increase can reuse the most recent batch cost when cost is omitted'
);

select is(
  (select unit_cost from public.inventory_batches
   where variant_id = 'aa000000-0000-0000-0000-000000000046'
   order by created_at desc, id desc limit 1),
  400::bigint,
  'the fallback increase uses the most recent cost layer'
);

select throws_ok(
  $$select public.post_stock_adjustment(
      'aa000000-0000-0000-0000-000000000046', 12, 15, 'Stale count')$$,
  'P0001',
  'stock_changed: expected 12, current 14.000; refresh and recount',
  'a stale old quantity cannot overwrite newer stock'
);

select ok(
  public.post_stock_adjustment(
    'aa000000-0000-0000-0000-000000000046', 14, 14, 'No change'
  ) is null,
  'an unchanged count is a no-op'
);

select throws_ok(
  $$select public.post_stock_adjustment(
      'aa000000-0000-0000-0000-000000000046', 14, -1, 'Invalid count')$$,
  'P0001',
  'new_quantity_must_be_zero_or_more',
  'negative counted quantities are rejected'
);

select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'all stock-adjustment entries remain balanced'
);

select * from finish();
rollback;
