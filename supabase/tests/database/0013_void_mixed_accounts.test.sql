-- Void with mixed-account orders (migration 0013): credit sale + partial
-- repayment, then void — the constraint-violation case from production.
begin;
select plan(5);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@void.local');

create temp table vd_company as select testkit.provision('11111111-1111-1111-1111-111111111111', 'Void Co') as company_id;
grant select on pg_temp.vd_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000dd', company_id, 'Service' from vd_company;
insert into public.product_variants (id, product_id, company_id, name, kind, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000dd', 'a0000000-0000-0000-0000-0000000000dd', company_id, 'Default', 'service', 'SVC', 13000, false from vd_company;

insert into public.customers (id, company_id, first_name, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000dd', company_id, 'Credit Jane', true, 0 from vd_company;

select testkit.as_user((select company_id from vd_company), '11111111-1111-1111-1111-111111111111', 'Admin');
select testkit.ensure_open_session();

-- Credit sale 13000 + partial repayment 5000 -> AR has D 13000 AND C 5000.
create temp table vd_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000dd',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000dd","quantity":1,"unit_price":13000}]', '[]') as order_id;

select public.post_payment_allocation((select order_id from vd_sale), 5000, 'cash', null);

-- 1. Void succeeds (previously: check-constraint violation).
select lives_ok(
  $$select public.void_sale((select order_id from vd_sale), 'customer dispute')$$,
  'void of an order with a two-sided account succeeds'
);

-- 2. Reversal lines are single-sided.
select is(
  (select count(*)::int from public.ledger_journal_lines l
   join public.ledger_journal_entries e on e.id = l.entry_id
   where e.source_type = 'OrderReversal'
     and e.source_id = (select order_id::text from vd_sale) || '-reversal'
     and l.debit > 0 and l.credit > 0),
  0,
  'no two-sided reversal lines'
);

-- 3. AR nets to zero for the order after the void.
select is(
  (select coalesce(sum(l.debit) - sum(l.credit), 0) from public.ledger_journal_lines l
   join public.ledger_accounts a on a.id = l.account_id
   where a.code = 'ACCOUNTS_RECEIVABLE' and l.order_id = (select order_id from vd_sale)),
  0::numeric,
  'AR nets to zero after void (debt fully reversed)'
);

-- 4. SALES nets to zero too.
select is(
  (select coalesce(sum(l.credit) - sum(l.debit), 0) from public.ledger_journal_lines l
   join public.ledger_accounts a on a.id = l.account_id
   where a.code = 'SALES' and l.order_id = (select order_id from vd_sale)),
  0::numeric,
  'revenue nets to zero after void'
);

-- 5. Global invariant.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits across all entries'
);

select * from finish();
rollback;
