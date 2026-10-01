begin;
select no_plan();
select testkit.create_user('a1380000-0000-4000-8000-000000000001','receipt-store-url@test.local');
create temp table store_url_fixture as select testkit.provision(
  'a1380000-0000-4000-8000-000000000001','Receipt URL Store') company_id;
grant select on store_url_fixture to authenticated;
select set_config('request.jwt.claims',testkit.claims(company_id,
  'a1380000-0000-4000-8000-000000000001','Admin'),true) from store_url_fixture;
-- All configuration and queued messages in this test are rolled back; no worker can see them.
select vault.update_secret(id,'https://storefront.test///') from vault.secrets where name='STOREFRONT_PUBLIC_URL';
select vault.create_secret('https://storefront.test///','STOREFRONT_PUBLIC_URL')
  where not exists(select 1 from vault.secrets where name='STOREFRONT_PUBLIC_URL');
update public.companies set public_storefront_enabled=true,public_slug='receipt-url-store',
  storefront_entitlement_grace_end=now()+interval '1 day',website_url='https://merchant.test'
  where id=(select company_id from store_url_fixture);
insert into public.customers(id,company_id,first_name,phone)
select 'a1380000-0000-4000-8000-000000000002',company_id,'Amina','0712345138' from store_url_fixture;
create temp table store_url_orders as select i,gen_random_uuid() id from generate_series(1,4) i;
grant select on store_url_orders to authenticated;
insert into public.orders(id,company_id,location_id,customer_id,code,status,total,is_credit_sale,completed_at)
select o.id,f.company_id,l.id,'a1380000-0000-4000-8000-000000000002','STORE-URL-'||o.i,
  'completed',100,false,now() from store_url_orders o cross join store_url_fixture f
  join public.stock_locations l on l.company_id=f.company_id and l.code='MAIN';
insert into public.payments(company_id,order_id,method_code,amount,status)
select f.company_id,o.id,'cash',100,'settled' from store_url_orders o cross join store_url_fixture f;
select testkit.as_user(company_id,'a1380000-0000-4000-8000-000000000001','Admin') from store_url_fixture;
select public.request_sale_document((select id from store_url_orders where i=1),'a1380000-0000-4000-8000-000000000011');
reset role;
create temp table issued_store_url as select o.id,o.body,l.snapshot from public.outbox o
  join public.external_document_links l on l.id=o.external_document_link_id
  where o.document_request_key='a1380000-0000-4000-8000-000000000011';
select ok((select body like E'%\nShop online: https://storefront.test/receipt-url-store' from issued_store_url),
  'WhatsApp caption includes the canonical available shop URL without duplicate slashes');
select ok((select body like E'%\nView online: https://storefront.test/document/%' from issued_store_url),
  'the secure receipt link remains separate from the public shop link');
select is((select snapshot->>'store_url' from issued_store_url),'https://storefront.test/receipt-url-store',
  'the PDF and secure webpage snapshot retain the same public shop URL');
select is((select snapshot->>'company_website' from issued_store_url),'https://merchant.test',
  'the business website is preserved alongside the shop link');
update public.companies set public_slug='renamed-store',public_storefront_enabled=false
  where id=(select company_id from store_url_fixture);
select testkit.as_user(company_id,'a1380000-0000-4000-8000-000000000001','Admin') from store_url_fixture;
select public.request_sale_document((select id from store_url_orders where i=1),'a1380000-0000-4000-8000-000000000011');
select public.request_sale_document((select id from store_url_orders where i=2),'a1380000-0000-4000-8000-000000000012');
reset role;
select is((select body from public.outbox where id=(select id from issued_store_url)),
  (select body from issued_store_url),'an uncertain retry retains the original caption after shop settings change');
select is((select snapshot from public.external_document_links where subject_id=(select id from store_url_orders where i=1)),
  (select snapshot from issued_store_url),'an issued receipt retains its original shop URL');
select ok((select body not like '%Shop online:%' from public.outbox
  where document_request_key='a1380000-0000-4000-8000-000000000012'),'disabled shops add no public link to the caption');
select is((select snapshot->>'store_url' from public.external_document_links where subject_id=(select id from store_url_orders where i=2)),
  null,'disabled shops add no public link to the document');
update public.companies set public_storefront_enabled=true,public_slug=null
  where id=(select company_id from store_url_fixture);
select testkit.as_user(company_id,'a1380000-0000-4000-8000-000000000001','Admin') from store_url_fixture;
select public.request_sale_document((select id from store_url_orders where i=3),'a1380000-0000-4000-8000-000000000013');
reset role;
select is((select snapshot->>'store_url' from public.external_document_links where subject_id=(select id from store_url_orders where i=3)),
  null,'a missing public address adds no shop link');
update public.companies set public_slug='expired-shop',subscription_status='expired',
  subscription_grace_period_end=now()-interval '1 day',subscription_exempt_until=null
  where id=(select company_id from store_url_fixture);
select testkit.as_user(company_id,'a1380000-0000-4000-8000-000000000001','Admin') from store_url_fixture;
-- Messaging and catalogue visibility are separate; inspect the available storefront target directly.
select is((select catalogue_visible from public.public_storefronts where id=(select company_id from store_url_fixture)),
  false,'the public availability check excludes shops with expired access');
reset role;
select * from finish();
rollback;
