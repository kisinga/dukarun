begin;
select plan(18);
create temp table ux_company as select id from public.companies where name='Mama Mboga Stores';

select is((select count(*) from public.product_variants v join ux_company c on c.id=v.company_id
  where sku like 'UX-%'),72::bigint,'catalog and stock priorities exceed one page');
select is((select count(*) from public.products p join public.product_variants v on v.product_id=p.id
  join ux_company c on c.id=p.company_id where v.sku like 'UX-%' and p.manufacturer_id is not null),
  72::bigint,'every added product has a manufacturer');
select cmp_ok((select count(distinct p.manufacturer_id) from public.products p
  join public.product_variants v on v.product_id=p.id join ux_company c on c.id=p.company_id
  where v.sku like 'UX-%'),'>=',8::bigint,'manufacturer filtering has varied choices');
select is((select count(*) from public.customers p join ux_company c on c.id=p.company_id
  where notes='list-ux-v1: fictional UI test account'),52::bigint,'customers and suppliers have multiple pages');
select cmp_ok((select count(*) from public.orders o join ux_company c on c.id=o.company_id
  where client_ref like 'list-ux-v1-sale-%' and status='completed'),'>=',600::bigint,'sales and staff reports have substantial history');
select is((select count(distinct created_by) from public.orders o join ux_company c on c.id=o.company_id
  where client_ref like 'list-ux-v1-sale-%'),3::bigint,'staff performance compares three personas');
select is((select count(*) from public.orders o join ux_company c on c.id=o.company_id
  where client_ref like 'list-ux-v1-pending-%' and status='pending_payment'),12::bigint,'cashier queue has actionable waiting records');
select is((select count(distinct status) from public.orders o join ux_company c on c.id=o.company_id
  where client_ref like 'list-ux-v1-pending-%' and status in('draft','expired')),2::bigint,'proformas cover valid and expired records');
select is((select count(*) from public.purchases p join ux_company c on c.id=p.company_id
  where reference like 'UX-PO-%'),36::bigint,'purchase history exceeds one page');
select is((select count(distinct a.status) from public.approvals a join ux_company c on c.id=a.company_id
  join public.orders o on o.id=(a.metadata->>'order_id')::uuid
  where o.client_ref like 'list-ux-v1-approval-%'),3::bigint,'approvals cover pending, approved and denied');
select is((select count(distinct f.status) from public.order_fulfillments f join public.orders o on o.id=f.order_id
  where o.client_ref like 'list-ux-v1-fulfillment-%'),3::bigint,'fulfillment covers pending, processing and ready lanes');
select is((select count(distinct signal) from public.product_attention a
  join public.product_variants v on v.id=a.variant_id join public.stock_locations l on l.id=a.location_id
  where v.sku like 'UX-%' and l.code='MAIN'),6::bigint,'stock fixtures cover all six individual decisions');
select is((select count(*) from public.outbox o where o.status='pending' and (
  o.id::text like 'dc180000-%' or exists(select 1 from public.order_fulfillments f
  join public.orders s on s.id=f.order_id where f.id=o.fulfillment_id
    and s.client_ref like 'list-ux-v1-fulfillment-%'))),0::bigint,'fixtures leave no deliverable messages');
select ok(not exists(select e.id from public.ledger_journal_entries e join ux_company c on c.id=e.company_id
  join public.ledger_journal_lines l on l.entry_id=e.id group by e.id having sum(l.debit)<>sum(l.credit)),
  'hydrated ledger remains balanced entry by entry');
select lives_ok($$select public.assert_order_receivable_evidence(id) from public.orders
  where client_ref like 'list-ux-v1-%'$$,'seeded receivables have matching payment evidence');
select is((select count(distinct (o.completed_at at time zone c.business_timezone)::date)
  from public.orders o join public.companies c on c.id=o.company_id
  where o.client_ref like 'list-ux-v1-sale-%'),10::bigint,
  'historical sale fixtures retain ten selling days');
select is((select tgenabled::text from pg_trigger
  where tgrelid='public.orders'::regclass and tgname='orders_preserve_capture_times'),'O',
  'seed restores the posting evidence guard');
select throws_ok($$update public.orders set completed_at=completed_at+interval '1 second'
  where client_ref='list-ux-v1-sale-1-1'$$,'P0001','sale_posting_evidence_immutable',
  'posted fixture evidence is immutable after hydration');
select * from finish();
rollback;
