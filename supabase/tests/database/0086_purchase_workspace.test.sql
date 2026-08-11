begin;
select plan(27);

select has_table('public','purchase_expenses','purchase expenses are durable');
select has_column('public','purchases','goods_subtotal','goods subtotal is retained');
select has_column('public','inventory_batches','remaining_cost','batch remaining value is authoritative');
select has_column('public','purchase_expenses','custom_label','other expense labels are retained');
select has_column('public','stock_transfer_lines','total_cost','transfers retain their exact value');
select has_function('public','record_purchase_complete',
  array['uuid','jsonb','jsonb','bigint','text','text','text','date','uuid'],
  'complete purchase RPC exists');

select testkit.create_user('86000000-0000-4000-8000-000000000001','purchase-workspace@test.local');
create temp table workspace_fixture as select testkit.provision(
  '86000000-0000-4000-8000-000000000001','Purchase Workspace Store') company_id;
grant select on pg_temp.workspace_fixture to authenticated;

insert into public.products(id,company_id,name)
select '86000000-0000-4000-8000-000000000002',company_id,'Workspace Tea' from workspace_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '86000000-0000-4000-8000-000000000003','86000000-0000-4000-8000-000000000002',
  company_id,'Default','WORK-TEA',1000,500 from workspace_fixture;
insert into public.products(id,company_id,name)
select '86000000-0000-4000-8000-000000000006'::uuid,company_id,'Transfer Tea' from workspace_fixture
union all select '86000000-0000-4000-8000-000000000008'::uuid,company_id,'Reversal Tea' from workspace_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,price,wholesale_price)
select '86000000-0000-4000-8000-000000000007'::uuid,'86000000-0000-4000-8000-000000000006'::uuid,
  company_id,'Default','TRANSFER-TEA',1000,500 from workspace_fixture
union all
select '86000000-0000-4000-8000-000000000009'::uuid,'86000000-0000-4000-8000-000000000008'::uuid,
  company_id,'Default','REVERSAL-TEA',1000,500 from workspace_fixture;
insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
select '86000000-0000-4000-8000-000000000004',company_id,'Workspace Supplier',true,700
from workspace_fixture;
insert into public.stock_locations(id,company_id,name,code,is_default)
select '86000000-0000-4000-8000-000000000005',company_id,'Overflow','OVERFLOW',false
from workspace_fixture;
insert into public.company_membership_locations(company_id,membership_id,location_id,is_primary)
select f.company_id,m.id,'86000000-0000-4000-8000-000000000005',false
from workspace_fixture f join public.company_memberships m on m.company_id=f.company_id
  and m.user_id='86000000-0000-4000-8000-000000000001'
on conflict (membership_id,location_id) do nothing;

create function pg_temp.consume_fifo_as_owner(
  p_company_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reference text
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.consume_fifo(p_company_id,p_variant_id,p_quantity,'Test',p_reference)
$$;
grant execute on function pg_temp.consume_fifo_as_owner(uuid,uuid,numeric,text) to authenticated;

create function pg_temp.restore_fifo_as_owner(
  p_batch_id uuid,
  p_quantity numeric,
  p_total_cost bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_batch public.inventory_batches%rowtype;
begin
  update public.inventory_batches set remaining=remaining+p_quantity
  where id=p_batch_id returning * into v_batch;
  insert into public.inventory_movements(company_id,variant_id,batch_id,stock_location_id,type,
    quantity,unit_cost,total_cost,source_type,source_id)
  values(v_batch.company_id,v_batch.variant_id,v_batch.id,v_batch.stock_location_id,'reversal',
    p_quantity,v_batch.unit_cost,p_total_cost,'OrderReversal','test-reversal');
end;
$$;
grant execute on function pg_temp.restore_fifo_as_owner(uuid,numeric,bigint) to authenticated;

select testkit.as_user((select company_id from workspace_fixture),
  '86000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

create temp table exact_purchase as select public.record_purchase_complete(
  '86000000-0000-4000-8000-000000000004',
  '[{"variant_id":"86000000-0000-4000-8000-000000000003","quantity":3,"unit_cost":333,"line_total":1000,"value_source":"total"}]',
  '[{"category":"other","custom_label":"Port handling","amount":100,"settlement":"supplier_bill"},{"category":"loading","amount":50,"settlement":"separate","account_code":"CASH_ON_HAND"}]',
  400,'WORK-1') purchase_id;

select is((select goods_subtotal from public.purchases where id=(select purchase_id from exact_purchase)),
  1000::bigint,'exact merchandise total is preserved');
select is((select total_cost from public.purchases where id=(select purchase_id from exact_purchase)),
  1100::bigint,'supplier expense is included in invoice total');
select is((select original_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from exact_purchase)),
  1000::bigint,'batch original value uses exact line total');
select is((select count(*)::int from public.purchase_expenses
  where purchase_id=(select purchase_id from exact_purchase)),2,'expense rows are linked');
select is((select custom_label from public.purchase_expenses
  where purchase_id=(select purchase_id from exact_purchase) and category='other'),
  'Port handling','custom expense label is preserved separately from its category');
select is((select coalesce(sum(credit)-sum(debit),0)::bigint from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id where l.company_id=(select company_id from workspace_fixture)
  and a.code='ACCOUNTS_PAYABLE' and l.meta->>'purchaseId'=(select purchase_id::text from exact_purchase)),
  700::bigint,'partial payment leaves only the projected supplier balance');
select is((select coalesce(sum(debit),0)::bigint from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id where l.company_id=(select company_id from workspace_fixture)
  and a.code='EXPENSES' and l.meta->>'purchaseId'=(select purchase_id::text from exact_purchase)),
  150::bigint,'all associated costs debit expenses');

create temp table fifo_one as select pg_temp.consume_fifo_as_owner((select company_id from workspace_fixture),
  '86000000-0000-4000-8000-000000000003',1,'fifo-1') result;
create temp table fifo_two as select pg_temp.consume_fifo_as_owner((select company_id from workspace_fixture),
  '86000000-0000-4000-8000-000000000003',1,'fifo-2') result;
create temp table fifo_three as select pg_temp.consume_fifo_as_owner((select company_id from workspace_fixture),
  '86000000-0000-4000-8000-000000000003',1,'fifo-3') result;
select is(((select result->>'total_cogs' from fifo_one)::bigint
  +(select result->>'total_cogs' from fifo_two)::bigint
  +(select result->>'total_cogs' from fifo_three)::bigint),1000::bigint,
  'successive FIFO depletion consumes the exact batch value');
select is((select remaining_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from exact_purchase)),
  0::bigint,'final depletion leaves no value residual');

create temp table transfer_purchase as select public.record_purchase_complete(
  '86000000-0000-4000-8000-000000000004',
  '[{"variant_id":"86000000-0000-4000-8000-000000000007","quantity":3,"unit_cost":333,"line_total":1000,"value_source":"total"}]',
  '[]',1000,'TRANSFER-EXACT') purchase_id;
create temp table exact_transfer as select public.transfer_stock(
  (select stock_location_id from public.purchases where id=(select purchase_id from transfer_purchase)),
  '86000000-0000-4000-8000-000000000005',
  '[{"variant_id":"86000000-0000-4000-8000-000000000007","quantity":1}]','Exact transfer') transfer_id;
select is((select total_cost from public.stock_transfer_lines
  where transfer_id=(select transfer_id from exact_transfer)),333::bigint,
  'partial transfer records its exact proportional cost');
select is((select remaining_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from transfer_purchase)),
  667::bigint,'partial transfer leaves the exact residual at source');
select is((select remaining_cost from public.inventory_batches b join public.stock_transfer_lines l
  on l.destination_batch_id=b.id where l.transfer_id=(select transfer_id from exact_transfer)),
  333::bigint,'transfer destination receives the exact allocated value');
select is((select stock_value from public.product_stock where variant_id='86000000-0000-4000-8000-000000000007'),
  1000::bigint,'company valuation remains exact across locations');
select is((select stock_value from public.location_stock_snapshot('86000000-0000-4000-8000-000000000005')
  where variant_id='86000000-0000-4000-8000-000000000007'),333::bigint,
  'location valuation reads authoritative remaining cost');

create temp table reversal_purchase as select public.record_purchase_complete(
  '86000000-0000-4000-8000-000000000004',
  '[{"variant_id":"86000000-0000-4000-8000-000000000009","quantity":3,"unit_cost":333,"line_total":1000,"value_source":"total"}]',
  '[]',1000,'REVERSAL-EXACT') purchase_id;
create temp table reversal_fifo as select pg_temp.consume_fifo_as_owner((select company_id from workspace_fixture),
  '86000000-0000-4000-8000-000000000009',3,'reversal-fifo') result;
select is((select result->>'total_cogs' from reversal_fifo)::bigint,1000::bigint,
  'full depletion takes the entire exact value before reversal');
select is((select remaining_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from reversal_purchase)),
  0::bigint,'fully depleted reversal fixture has no residual value');
select pg_temp.restore_fifo_as_owner((select inventory_batch_id from public.purchase_lines
  where purchase_id=(select purchase_id from reversal_purchase)),3,1000);
select is((select remaining_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from reversal_purchase)),
  1000::bigint,'reversal restores the exact recorded allocation');

create temp table draft_result as select public.save_purchase_draft_complete(
  '86000000-0000-4000-8000-000000000004',
  '[{"variant_id":"86000000-0000-4000-8000-000000000003","quantity":3,"unit_cost":333,"line_total":1000,"value_source":"total"}]',
  '[{"category":"transport","amount":100,"settlement":"supplier_bill"}]',
  'DRAFT-EXACT',null,current_date,(select id from public.stock_locations
    where company_id=(select company_id from workspace_fixture) and is_default limit 1),
  'later',0,null,null) draft_id;
select is((select total_cost from public.purchase_drafts where id=(select draft_id from draft_result)),
  1100::bigint,'draft total preserves exact goods and supplier expenses');
select is((select expenses from public.purchase_drafts where id=(select draft_id from draft_result))->0->>'category',
  'transport','draft retains associated expenses');

select throws_ok($$select public.record_purchase_complete(
  '86000000-0000-4000-8000-000000000004',
  '[{"variant_id":"86000000-0000-4000-8000-000000000003","quantity":1,"unit_cost":100}]',
  '[{"category":"transport","amount":0,"settlement":"supplier_bill"}]',0)$$,
  'P0001','invalid_purchase_expense','invalid expense rolls the purchase back');
select is((select count(*)::int from public.purchases where reference is null),0,
  'failed complete purchase leaves no purchase');

select * from finish();
rollback;
