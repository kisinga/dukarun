begin;
select plan(9);

select has_function('public', 'record_purchase_with_payment',
  array['uuid','jsonb','bigint','text','text','text','date','uuid'],
  'purchase can be received with an initial payment');
select has_function('public', 'confirm_purchase_draft_with_payment',
  array['uuid','bigint','text','uuid'],
  'draft can be confirmed with an initial payment');

select testkit.create_user('44444444-4444-4444-4444-444444444444','partial-purchase@test.local');
create temp table pp_company as select testkit.provision(
  '44444444-4444-4444-4444-444444444444','Partial Purchase Co') company_id;
grant select on pg_temp.pp_company to authenticated;

insert into public.products(id,company_id,name) select
  '44000000-0000-0000-0000-000000000001',company_id,'Tea' from pp_company;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '44000000-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000001',
  company_id,'Default','TEA',15000,10000 from pp_company;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit) select
  '44000000-0000-0000-0000-000000000003',company_id,'Tea Supplier',true,500000 from pp_company;

select testkit.as_user((select company_id from pp_company),
  '44444444-4444-4444-4444-444444444444','Admin');
select testkit.ensure_open_session();

create temp table pp_purchase as select public.record_purchase_with_payment(
  '44000000-0000-0000-0000-000000000003',
  '[{"variant_id":"44000000-0000-0000-0000-000000000002","quantity":10,"unit_cost":10000}]',
  40000,'PART-1') purchase_id;

select is((select total_cost from public.purchases where id=(select purchase_id from pp_purchase)),
  100000::bigint,'full purchase value is recorded');
select ok((select is_credit from public.purchases where id=(select purchase_id from pp_purchase)),
  'part-paid purchase remains a credit purchase');
select is((select coalesce(sum(amount),0)::bigint from public.purchase_payments
  where purchase_id=(select purchase_id from pp_purchase)),40000::bigint,
  'initial payment is allocated to the purchase');
select is((select coalesce(sum(l.credit)-sum(l.debit),0)::bigint
  from public.ledger_journal_lines l join public.ledger_accounts a on a.id=l.account_id
  where l.company_id=(select company_id from pp_company) and a.code='ACCOUNTS_PAYABLE'
    and l.meta ->> 'supplierId'='44000000-0000-0000-0000-000000000003'),60000::bigint,
  'only the unpaid balance remains in accounts payable');
select is((select b.remaining from public.inventory_batches b
  join public.purchase_lines pl on pl.inventory_batch_id=b.id
  where pl.purchase_id=(select purchase_id from pp_purchase)),10::numeric,'stock is received once');

select throws_ok(
  $$select public.record_purchase_with_payment(
    '44000000-0000-0000-0000-000000000003',
    '[{"variant_id":"44000000-0000-0000-0000-000000000002","quantity":1,"unit_cost":10000}]',
    10001,'PART-OVER')$$,'P0001','ap_overpayment','initial payment cannot exceed total');
select is((select count(*)::int from public.purchases where reference='PART-OVER'),0,
  'invalid initial payment leaves no purchase behind');

select * from finish();
rollback;
