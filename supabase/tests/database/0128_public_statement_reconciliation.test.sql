begin;
select plan(10);

select testkit.create_user(
  '92800000-0000-4000-8000-000000000001',
  'public-statement-reconciliation@test.local'
);
create temp table statement_reconciliation_fixture as
select testkit.provision(
  '92800000-0000-4000-8000-000000000001',
  'Statement Reconciliation Store'
) company_id;
grant select on pg_temp.statement_reconciliation_fixture to authenticated;

insert into public.customers(
  id,company_id,first_name,phone,notifications_enabled,is_credit_approved,credit_limit
)
select '92800000-0000-4000-8000-000000000010'::uuid,company_id,'Receipt customer',
  '+254700000128',true,true,1000
from statement_reconciliation_fixture
union all
select '92800000-0000-4000-8000-000000000011'::uuid,company_id,'Credit note customer',
  '+254700000129',true,true,1000
from statement_reconciliation_fixture
union all
select '92800000-0000-4000-8000-000000000014'::uuid,company_id,'COD customer',
  '+254700000130',true,false,0
from statement_reconciliation_fixture;

insert into public.products(id,company_id,name)
select '92800000-0000-4000-8000-000000000012',company_id,'Statement service'
from statement_reconciliation_fixture;

update public.companies set business_timezone='Pacific/Honolulu'
where id=(select company_id from statement_reconciliation_fixture);

select set_config(
  'request.jwt.claims',
  testkit.claims(
    (select company_id from statement_reconciliation_fixture),
    '92800000-0000-4000-8000-000000000001',
    'Admin'
  ),
  true
);

insert into public.orders(
  id,company_id,code,customer_id,status,total,is_credit_sale,receivable_kind,completed_at
)
select '92800000-0000-4000-8000-000000000015',company_id,'COD-STATEMENT-0128',
  '92800000-0000-4000-8000-000000000014','completed',100,false,'cod',
  '2026-09-26 01:00:00+00'::timestamptz
from statement_reconciliation_fixture;

insert into public.order_fulfillments(
  id,company_id,location_id,order_id,fulfillment_type,status,collection_kind,
  customer_id,recipient_name,phone_normalized,address_line,tracking_token_hash,
  tracking_expires_at,pin_hash
)
select '92800000-0000-4000-8000-000000000016',f.company_id,l.id,
  '92800000-0000-4000-8000-000000000015','delivery','ready','cod',
  '92800000-0000-4000-8000-000000000014','COD customer','+254700000130',
  'Statement fixture address',repeat('a',64),now()+interval '1 day','fixture-pin'
from statement_reconciliation_fixture f
join lateral (
  select id from public.stock_locations where company_id=f.company_id order by created_at limit 1
) l on true;

select public.post_journal_entry(
  (select company_id from statement_reconciliation_fixture),
  'CodReceivable','92800000-0000-4000-8000-000000000015',
  'COD statement reconciliation fixture',
  jsonb_build_array(
    jsonb_build_object(
      'account_code','ACCOUNTS_RECEIVABLE','debit',100,
      'order_id','92800000-0000-4000-8000-000000000015',
      'meta',jsonb_build_object(
        'customerId','92800000-0000-4000-8000-000000000014',
        'orderCode','COD-STATEMENT-0128','method','cod'
      )
    ),
    jsonb_build_object(
      'account_code','SALES','credit',100,
      'order_id','92800000-0000-4000-8000-000000000015',
      'meta',jsonb_build_object(
        'customerId','92800000-0000-4000-8000-000000000014',
        'orderCode','COD-STATEMENT-0128'
      )
    )
  )
);
insert into public.product_variants(
  id,product_id,company_id,name,sku,price,wholesale_price,kind,track_inventory
)
select '92800000-0000-4000-8000-000000000013',
  '92800000-0000-4000-8000-000000000012',company_id,'Default','STATEMENT-RECON',
  100,100,'service',false
from statement_reconciliation_fixture;

select testkit.as_user(
  (select company_id from statement_reconciliation_fixture),
  '92800000-0000-4000-8000-000000000001',
  'Admin'
);
select testkit.ensure_open_session();

select public.post_sale(
  '92800000-0000-4000-8000-000000000010',
  '[{"variant_id":"92800000-0000-4000-8000-000000000013","quantity":1,"unit_price":100}]',
  '[]'
);
select public.post_customer_receipt(
  null,'92800000-0000-4000-8000-000000000010',40,'cash',
  'RECEIPT-REF-0128','statement-reference-0128'
);

create temp table credited_order as
select public.post_sale(
  '92800000-0000-4000-8000-000000000011',
  '[{"variant_id":"92800000-0000-4000-8000-000000000013","quantity":1,"unit_price":100}]',
  '[]'
) id;
select public.post_full_refund(
  (select id from credited_order),'cash','Statement reconciliation test','write_off'
);

reset role;
create temp table statement_reconciliation_tokens as
select 'receipt' kind,public.issue_customer_statement_link(
  (select company_id from statement_reconciliation_fixture),
  '92800000-0000-4000-8000-000000000010'
) token
union all
select 'credit_note',public.issue_customer_statement_link(
  (select company_id from statement_reconciliation_fixture),
  '92800000-0000-4000-8000-000000000011'
)
union all
select 'cod',public.issue_customer_statement_link(
  (select company_id from statement_reconciliation_fixture),
  '92800000-0000-4000-8000-000000000014'
);
grant select on pg_temp.statement_reconciliation_tokens to anon;

set local role anon;
create temp table statement_reconciliation_results as
select kind,public.public_customer_statement(token,null,null,25) body
from statement_reconciliation_tokens;

select ok(
  nullif((select body->>'generated_at' from statement_reconciliation_results
    where kind='receipt'),'') is not null,
  'public statement identifies when its live balance was generated'
);
select is(
  (select (body->>'amount_due')::bigint from statement_reconciliation_results
    where kind='receipt'),
  60::bigint,
  'headline amount due follows the receivables ledger after a partial receipt'
);
select is(
  (select (body->'orders'->0->>'balance')::bigint from statement_reconciliation_results
    where kind='receipt'),
  60::bigint,
  'open invoice balance follows the per-order receivables ledger'
);
select is(
  (select activity->>'reference'
   from statement_reconciliation_results,
     lateral jsonb_array_elements(body->'activities') activity
   where kind='receipt' and activity->>'kind'='customer_receipt'),
  'RECEIPT-REF-0128',
  'payment activity exposes the actual customer receipt reference'
);
select is(
  (select (body->>'amount_due')::bigint from statement_reconciliation_results
    where kind='credit_note'),
  0::bigint,
  'a full credit note clears the statement amount due'
);
select is(
  (select jsonb_array_length(body->'orders') from statement_reconciliation_results
    where kind='credit_note'),
  0,
  'a fully credited sale is not presented as an open invoice'
);
select is(
  (select (body->>'amount_due')::bigint from statement_reconciliation_results
    where kind='cod'),
  100::bigint,
  'COD receivable contributes to the statement amount due'
);
select is(
  (select body->'orders'->0->>'code' from statement_reconciliation_results
    where kind='cod'),
  'COD-STATEMENT-0128',
  'COD receivable is presented in the open invoice list'
);
select is(
  (select body->'orders'->0->>'due_date' from statement_reconciliation_results
    where kind='cod'),
  null,
  'COD receivable retains its null due date'
);
select is(
  (select body->'orders'->0->>'sale_date' from statement_reconciliation_results
    where kind='cod'),
  '2026-09-25',
  'sale date uses the company business timezone'
);
select * from finish();
rollback;
