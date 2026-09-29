begin;
set local timezone to 'UTC';
select no_plan();
select testkit.create_user('a1360000-0000-4000-8000-000000000001','vat-review-regressions@test.local');
create temp table vat_boundary_fixture as select testkit.provision(
  'a1360000-0000-4000-8000-000000000001','VAT invoice and provider dates') company_id;
grant select on vat_boundary_fixture to authenticated;
insert into public.products(id,company_id,name)
select 'a1360000-0000-4000-8000-000000000010',company_id,'Boundary service' from vat_boundary_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1360000-0000-4000-8000-000000000020','a1360000-0000-4000-8000-000000000010',
  company_id,'Default','VAT-BOUNDARY','service',116,116,false from vat_boundary_fixture;
create function pg_temp.change_vat(enabled boolean,starts date default null)
returns uuid language sql as $$
  select public.schedule_company_tax_profile(j.id,enabled,'',starts,c.id)
  from public.tax_jurisdictions j join public.tax_categories c on c.jurisdiction_id=j.id
  where j.country_code='KE' and c.code='STANDARD'
$$;
select testkit.as_user((select company_id from vat_boundary_fixture),
  'a1360000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

select pg_temp.change_vat(true);
create temp table reviewed_order as select public.post_sale_at_location(
 (select id from public.stock_locations where company_id=(select company_id from vat_boundary_fixture) and is_default limit 1),null,
 '[{"variant_id":"a1360000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
 '[]',true,'vat-review-provider') result;
reset role;
update public.orders set pending_owner='payment_provider' where id=(select (result->>'order_id')::uuid from reviewed_order);
create temp table reviewed_account as with x as (
 insert into public.payment_provider_accounts(company_id,provider,environment,display_name,status,ledger_account_code)
 select company_id,'mpesa','sandbox','Review rollback fixture','active','MPESA' from vat_boundary_fixture returning id
) select id from x;
create temp table reviewed_collection as with x as (
 insert into public.payment_collections(company_id,provider_account_id,provider,environment,provider_receipt,amount,occurred_at,source,verification_status)
 select company_id,(select id from reviewed_account),'mpesa','sandbox','REVIEW-ROLLBACK-'||gen_random_uuid()::text,116,now()-interval '1 day','c2b','provider_verified' from vat_boundary_fixture returning id
) select id from x;
create temp table reviewed_allocation as with x as (
 insert into public.payment_collection_allocations(collection_id,company_id,amount,order_id)
 select (select id from reviewed_collection),company_id,116,(select (result->>'order_id')::uuid from reviewed_order) from vat_boundary_fixture returning id
) select id from x;
select public.mpesa_post_reserved_allocation((select id from reviewed_collection),(select id from reviewed_allocation),
 row(f.company_id,l.id,'a1360000-0000-4000-8000-000000000001'::uuid,s.id,now()-interval '1 day',
 ((now()-interval '1 day') at time zone 'Africa/Nairobi')::date,'mpesa_provider',null)::public.posting_context)
 from vat_boundary_fixture f join public.stock_locations l on l.company_id=f.company_id and l.is_default
 join public.cashier_sessions s on s.company_id=f.company_id and s.location_id=l.id and s.status='open';

select is(a.posting_date,o.accounting_posting_date,
  'delayed provider allocation uses the sale posting business date')
 from reviewed_allocation r join public.payment_collection_allocations a on a.id=r.id
 join public.orders o on o.id=a.order_id;
select is(a.posted_at,o.posted_at,'allocation and sale share the authoritative posting instant')
 from reviewed_allocation r join public.payment_collection_allocations a on a.id=r.id
 join public.orders o on o.id=a.order_id;
select ok(not exists(select 1 from public.ledger_journal_entries e
 where e.company_id=(select company_id from vat_boundary_fixture)
 and e.entry_date<>(now() at time zone 'Africa/Nairobi')::date),
 'payment and VAT journals agree with the allocation posting date');
select is(c.occurred_at,now()-interval '1 day','the provider occurrence instant is unchanged')
 from public.payment_collections c join reviewed_collection r on r.id=c.id;
select results_eq(
 $$select total,net_total,tax_total from public.orders where client_ref='vat-review-provider'$$,
 $$values (116::bigint,100::bigint,16::bigint)$$,
 'delayed provider settlement uses current VAT and retains gross payment');

-- Simulate a shop that enabled VAT at noon yesterday. Supplier documents carry
-- a business date, not an issue time, so their last effective daily treatment
-- must not revert to the midnight profile when entered on a later date.
update public.company_tax_profiles set
 effective_to_at=(((now() at time zone 'Africa/Nairobi')::date-1)::timestamp+interval '12 hours') at time zone 'Africa/Nairobi',
 effective_to=(now() at time zone 'Africa/Nairobi')::date-1
 where company_id=(select company_id from vat_boundary_fixture) and not vat_registered;
update public.company_tax_profiles set
 effective_from_at=(((now() at time zone 'Africa/Nairobi')::date-1)::timestamp+interval '12 hours') at time zone 'Africa/Nairobi',
 effective_from=(now() at time zone 'Africa/Nairobi')::date-1
 where company_id=(select company_id from vat_boundary_fixture) and vat_registered;
insert into public.product_variants(id,product_id,company_id,name,sku,kind,price,wholesale_price)
select 'a1360000-0000-4000-8000-000000000021','a1360000-0000-4000-8000-000000000010',
 company_id,'Goods','VAT-REVIEW-GOODS','good',116,116 from vat_boundary_fixture;
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1360000-0000-4000-8000-000000000001','Admin');
select is((public.purchase_tax_context(array['a1360000-0000-4000-8000-000000000021'::uuid],
 (now() at time zone 'Africa/Nairobi')::date-1)->>'vat_registered')::boolean,true,
 'yesterday supplier context includes its noon VAT activation');
select is((public.purchase_tax_context('{}',
 (now() at time zone 'Africa/Nairobi')::date-2)->>'vat_registered')::boolean,false,
 'an earlier invoice date retains the VAT-off treatment');
reset role;
select is((public.calculate_purchase_invoice_tax((select company_id from vat_boundary_fixture),
 '[{"variant_id":"a1360000-0000-4000-8000-000000000021","quantity":1,"unit_cost":116}]','[]',
 (now() at time zone 'Africa/Nairobi')::date-1)->>'vat_registered')::boolean,true,
 'purchase posting uses the same date-only profile as its preview');
select is((public.calculate_purchase_invoice_tax((select company_id from vat_boundary_fixture),
 '[{"variant_id":"a1360000-0000-4000-8000-000000000021","quantity":1,"unit_cost":116}]','[]',
 (now() at time zone 'Africa/Nairobi')::date-1)->>'tax_total')::bigint,16::bigint,
 'purchase posting calculates input VAT using that profile');
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1360000-0000-4000-8000-000000000001','Admin');
create temp table reviewed_expense as select public.post_expense_with_tax(116,'CASH_ON_HAND','other',
 'Yesterday supplier invoice',(now() at time zone 'Africa/Nairobi')::date-1,true,'P001','I001',
 (now() at time zone 'Africa/Nairobi')::date-1) id;
select is((select input_tax_total from public.expense_documents
 where id=(select id from reviewed_expense)),16::bigint,
 'late entry of an activation-day expense can claim input VAT');
select pg_temp.change_vat(false);
select is((select input_tax_total from public.expense_documents
 where id=(select id from reviewed_expense)),16::bigint,
 'a subsequent VAT change never recalculates finalized expense evidence');
select is((public.purchase_tax_context('{}',
 (now() at time zone 'Africa/Nairobi')::date-1)->>'vat_registered')::boolean,true,
 'today VAT-off does not change yesterday invoice treatment');
select is((public.purchase_tax_context('{}',
 (now() at time zone 'Africa/Nairobi')::date)->>'vat_registered')::boolean,false,
 'today invoice context sees the current VAT-off profile');
select * from finish();
rollback;
