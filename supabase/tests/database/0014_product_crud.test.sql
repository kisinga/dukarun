-- Product CRUD tests (migration 0014, remodeled by 0017): products are
-- family rows; sellable fields live on product_variants via upsert_variant.
begin;
select plan(15);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@prod.local');

create temp table pr_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Prod Co') as company_id;
grant select on pg_temp.pr_company to authenticated;

select testkit.as_user((select company_id from pr_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- 1. create_product creates the family row (no sellable fields).
create temp table prod1 as
select public.create_product('Sugar 1kg', '6001234567890') as id;

select is(
  (select name from public.products where id = (select id from prod1)),
  'Sugar 1kg',
  'create_product stores the family row'
);

-- 2. upsert_variant creates the sellable variant (explicit sku).
create temp table var1 as
select public.upsert_variant((select id from prod1), 'Default', 20000, null, 'SUG1', '6001234567890', 18000) as id;

select is(
  (select sku from public.product_variants where id = (select id from var1)),
  'SUG1',
  'upsert_variant stores the sku'
);

-- 3. Auto-generated sku when blank.
create temp table prod_auto as
select public.create_product('Mandazi') as id;

create temp table var_auto as
select public.upsert_variant((select id from prod_auto), 'Default', 2000) as id;

select ok(
  (select sku is not null and length(sku) >= 4 from public.product_variants where id = (select id from var_auto)),
  'upsert_variant auto-generates a sku when blank'
);

-- 4. Invalid price rejected.
select throws_ok(
  format($$select public.upsert_variant('%s', 'Bad', -5)$$, (select id from prod1)),
  'P0001', 'invalid_price',
  'negative price rejected'
);

-- 5-6. Variant update changes the price, keeps other fields.
select public.upsert_variant((select id from prod1), 'Default', 22000, (select id from var1));

select is(
  (select price from public.product_variants where id = (select id from var1)),
  22000::bigint,
  'upsert_variant updates the price'
);

select is(
  (select sku from public.product_variants where id = (select id from var1)),
  'SUG1',
  'upsert_variant update keeps untouched fields'
);

-- 7. update_product renames the family row.
select public.update_product((select id from prod1), 'Sugar 1kg (new)');

select is(
  (select name from public.products where id = (select id from prod1)),
  'Sugar 1kg (new)',
  'update_product changes the family name'
);

-- 8. product_stock view derives from batches, per variant.
reset role;
insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, (select id from var1), 10, 4, 15000 from pr_company;
select testkit.as_user((select company_id from pr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select is(
  (select stock from public.product_stock where variant_id = (select id from var1)),
  4::numeric,
  'product_stock derives remaining stock per variant'
);

-- 9. kind = 'service' forces track_inventory off.
create temp table svc_prod as
select public.create_product('Delivery') as id;

create temp table svc_var as
select public.upsert_variant((select id from svc_prod), 'Default', 5000, null, 'DEL', null, null, null, true, null, 'service') as id;

select is(
  (select track_inventory from public.product_variants where id = (select id from svc_var)),
  false,
  'service variant is never stocked (track_inventory forced false)'
);

-- 10. record_purchase rejects service variants.
reset role;
insert into public.customers (id, company_id, first_name, is_supplier)
select 'c0000000-0000-0000-0000-0000000000aa', company_id, 'Supplier', true from pr_company;
select testkit.as_user((select company_id from pr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select throws_ok(
  format(
    $$select public.record_purchase('c0000000-0000-0000-0000-0000000000aa',
      '[{"variant_id":"%s","quantity":1,"unit_cost":1000}]', false)$$,
    (select id from svc_var)
  ),
  'P0001', 'cannot_stock_service: variant ' || (select id from svc_var),
  'record_purchase rejects service variants'
);

-- 11-12. Two variants (sizes) on one product family.
create temp table shirt as
select public.create_product('T-Shirt') as id;

create temp table shirt_s as
select public.upsert_variant((select id from shirt), 'S', 1500, null, 'TSH-S') as id;
create temp table shirt_m as
select public.upsert_variant((select id from shirt), 'M', 1500, null, 'TSH-M') as id;

select is(
  (select count(*)::int from public.product_variants where product_id = (select id from shirt)),
  2,
  'one product family holds multiple variants'
);

select is(
  (select count(*)::int from public.variant_catalog where product_id = (select id from shirt)),
  2,
  'variant_catalog exposes both variants'
);

-- 13-14. Fractional sale on an allow_fractional variant: integer-safe COGS
--        (rounded per batch), numeric batch remainder.
create temp table flour as
select public.create_product('Flour') as id;

create temp table flour_var as
select public.upsert_variant((select id from flour), '1kg', 12000, null, 'FLR1', null, null, true) as id;

reset role;
insert into public.inventory_batches (id, company_id, variant_id, quantity, remaining, unit_cost)
select 'b0000000-0000-0000-0000-0000000000aa', company_id, (select id from flour_var), 10, 10, 10000 from pr_company;
select testkit.as_user((select company_id from pr_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table frac_sale as
select public.post_sale(null,
  format('[{"variant_id":"%s","quantity":2.5,"unit_price":12000}]', (select id from flour_var))::jsonb,
  '[{"method":"cash","amount":30000}]') as order_id;

select is(
  (select l.debit from public.ledger_journal_lines l
   join public.ledger_accounts a on a.id = l.account_id
   join public.ledger_journal_entries e on e.id = l.entry_id
   where e.source_type = 'InventorySaleCogs' and e.source_id = (select order_id::text from frac_sale)
     and a.code = 'COGS'),
  25000::bigint,
  'fractional sale posts integer COGS (rounded per batch)'
);

select is(
  (select remaining from public.inventory_batches where id = 'b0000000-0000-0000-0000-0000000000aa'),
  7.5::numeric,
  'fractional sale leaves a numeric batch remainder'
);

-- 15. Fractional quantity rejected on a non-fractional variant.
select throws_ok(
  format(
    $$select public.save_draft(null,
      '[{"variant_id":"%s","quantity":0.5,"unit_price":22000}]')$$,
    (select id from var1)
  ),
  'P0001', 'fractional_not_allowed: variant ' || (select id from var1),
  'fractional quantity rejected on a non-fractional variant'
);

select * from finish();
rollback;
