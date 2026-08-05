-- Security hardening tests: cross-tenant order RPC denial, server-side
-- pricing in save_draft, money-op permission gates, ledger immutability,
-- commit-time balance invariant, anon execute cleanup, settle_order
-- idempotent replay, and atomic proforma consumption in post_sale.
begin;
select plan(26);

select testkit.create_user('d7000000-0000-0000-0000-0000000000a1', 'owner@hard-a.local');
select testkit.create_user('d7000000-0000-0000-0000-0000000000b1', 'owner@hard-b.local');
select testkit.create_user('d7000000-0000-0000-0000-0000000000c1', 'cashier@hard-a.local');

create temp table sh_company_a as
select testkit.provision('d7000000-0000-0000-0000-0000000000a1', 'Hardening Co A') as company_id;
create temp table sh_company_b as
select testkit.provision('d7000000-0000-0000-0000-0000000000b1', 'Hardening Co B') as company_id;
grant select on pg_temp.sh_company_a to authenticated;
grant select on pg_temp.sh_company_b to authenticated;

select testkit.add_member(
  (select company_id from sh_company_a),
  'd7000000-0000-0000-0000-0000000000c1', 'Till', '{SettleOrder}'
);

-- Catalog fixtures in both companies (variant list price 100000).
insert into public.products (id, company_id, name)
select 'd7a00000-0000-0000-0000-000000000001', company_id, 'Widget A' from sh_company_a;
insert into public.product_variants (id, product_id, company_id, name, sku, price, wholesale_price)
select 'd7aa0000-0000-0000-0000-000000000001', 'd7a00000-0000-0000-0000-000000000001',
       company_id, 'Default', 'WID-A', 100000, 80000 from sh_company_a;

insert into public.products (id, company_id, name)
select 'd7a00000-0000-0000-0000-000000000002', company_id, 'Widget B' from sh_company_b;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'd7aa0000-0000-0000-0000-000000000002', 'd7a00000-0000-0000-0000-000000000002',
       company_id, 'Default', 'WID-B', 50000 from sh_company_b;

insert into public.customers (id, company_id, first_name)
select 'd7c00000-0000-0000-0000-000000000001', company_id, 'Cust A' from sh_company_a;
insert into public.customers (id, company_id, first_name)
select 'd7c00000-0000-0000-0000-000000000002', company_id, 'Cust B' from sh_company_b;

insert into public.inventory_batches (company_id, variant_id, quantity, remaining, unit_cost)
select company_id, 'd7aa0000-0000-0000-0000-000000000001', 100, 100, 50000 from sh_company_a;

-- ---------------------------------------------------------------------------
-- Company A orders: one open draft, one completed sale, one draft to consume.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from sh_company_a), 'd7000000-0000-0000-0000-0000000000a1', 'Admin');
select testkit.ensure_open_session();

create temp table sh_draft as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]') as order_id;

create temp table sh_done as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]') as order_id;
select public.convert_draft((select order_id from sh_done),
  '[{"method":"cash","amount":100000}]');

create temp table sh_consume as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]') as order_id;

-- Company B: a draft (target for the cross-tenant p_draft_id probe).
-- (clear the location GUC left over from company A's session above)
select testkit.as_user((select company_id from sh_company_b), 'd7000000-0000-0000-0000-0000000000b1', 'Admin');
select set_config('app.business_location_id', '', true);
create temp table sh_draft_b as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000002","quantity":1,"unit_price":50000
}]') as order_id;

-- ---------------------------------------------------------------------------
-- 1-3. Cross-tenant order RPCs: B's owner cannot complete, settle, or void
-- company A's orders (B holds every permission in B — the denial must come
-- from company scoping, not from the permission gate).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.convert_draft((select order_id from sh_draft), '[{"method":"cash","amount":100000}]')$$,
  'P0001', 'order_not_found: ' || (select order_id from sh_draft)::text,
  'convert_draft on another company''s order is denied'
);

select throws_ok(
  $$select public.settle_order((select order_id from sh_draft), '[{"method":"cash","amount":100000}]')$$,
  'P0001', 'order_not_found: ' || (select order_id from sh_draft)::text,
  'settle_order on another company''s order is denied'
);

select throws_ok(
  $$select public.void_sale((select order_id from sh_done), 'not mine')$$,
  'P0001', 'order_not_found: ' || (select order_id from sh_done)::text,
  'void_sale on another company''s order is denied'
);

-- ---------------------------------------------------------------------------
-- 4-9. save_draft: server-side pricing + ownership validation, as the
-- SettleOrder-only cashier of company A.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from sh_company_a), 'd7000000-0000-0000-0000-0000000000c1', 'Till');

create temp table sh_fake_price as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":1
}]') as order_id;

select is(
  (select unit_price from public.order_lines
   where order_id = (select order_id from sh_fake_price)),
  100000::bigint,
  'a lying client unit_price is replaced by the server list price'
);

select is(
  (select total from public.orders where id = (select order_id from sh_fake_price)),
  100000::bigint,
  'draft total is computed from the server list price'
);

select throws_ok(
  $$select public.save_draft(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,
    "unit_price":100000,"custom_price":90000,"override_reason":"mate rates"
  }]')$$,
  'P0001', 'permission_denied: OverridePrice required',
  'price override without OverridePrice is denied (server-side comparison)'
);

select throws_ok(
  $$select public.save_draft('d7c00000-0000-0000-0000-000000000002', '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
  }]')$$,
  'P0001', 'invalid_customer: d7c00000-0000-0000-0000-000000000002',
  'cross-tenant customer id is rejected'
);

select throws_ok(
  $$select public.save_draft(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000002","quantity":1,"unit_price":50000
  }]')$$,
  'P0001', 'invalid_variant: line references a variant outside this company',
  'cross-tenant variant id is rejected'
);

select throws_ok(
  $$select public.post_expense(1000, 'CASH_ON_HAND', 'test')$$,
  'P0001', 'permission_denied: CreateInterAccountTransfer required',
  'post_expense denied without the money-movement permission'
);

-- ---------------------------------------------------------------------------
-- 10-12. Money-op gates as the cashier, then owner success.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.pay_supplier('d7c00000-0000-0000-0000-000000000001', 1000, 'CASH_ON_HAND')$$,
  'P0001', 'permission_denied: ManageSupplierCreditPurchases required',
  'pay_supplier denied without ManageSupplierCreditPurchases'
);

select throws_ok(
  $$select public.pay_purchase(gen_random_uuid(), 1000, 'CASH_ON_HAND')$$,
  'P0001', 'permission_denied: ManageSupplierCreditPurchases required',
  'pay_purchase denied without ManageSupplierCreditPurchases'
);

select testkit.as_user((select company_id from sh_company_a), 'd7000000-0000-0000-0000-0000000000a1', 'Admin');

select lives_ok(
  $$select public.post_expense(1000, 'CASH_ON_HAND', 'utilities', 'power')$$,
  'post_expense succeeds with the money-movement permission'
);

-- ---------------------------------------------------------------------------
-- 13-15. Ledger immutability (superuser context; the triggers fire for any
-- role). The GUC escape hatch allows a deliberate backfill.
-- ---------------------------------------------------------------------------
reset role;

select throws_ok(
  $$update public.ledger_journal_entries set memo = 'rewrite history'
    where id = (select id from public.ledger_journal_entries
                where company_id = (select company_id from sh_company_a) limit 1)$$,
  'P0001', 'ledger_immutable: posted journal entries cannot be modified',
  'posted journal entries reject UPDATE'
);

select throws_ok(
  $$delete from public.ledger_journal_lines
    where entry_id in (select id from public.ledger_journal_entries
                       where company_id = (select company_id from sh_company_a))$$,
  'P0001', 'ledger_immutable: posted journal lines cannot be deleted',
  'posted journal lines reject DELETE'
);

select set_config('app.allow_ledger_mutation', 'on', true);
select lives_ok(
  $$update public.ledger_journal_entries set memo = 'backfilled'
    where company_id = (select company_id from sh_company_a)$$,
  'the app.allow_ledger_mutation GUC permits a deliberate backfill'
);
select set_config('app.allow_ledger_mutation', 'off', true);

-- ---------------------------------------------------------------------------
-- 16. Commit-time balance invariant: an entry with no/unbalanced lines is
-- rejected when deferred constraints are checked.
-- ---------------------------------------------------------------------------
insert into public.ledger_journal_entries (company_id, entry_date, source_type, source_id, memo)
values ((select company_id from sh_company_a), current_date, 'Manual', 'unbalanced-1', 'probe');

select throws_ok(
  $$set constraints all immediate$$,
  'P0001', null,
  'unbalanced direct entry insert fails the deferred balance check'
);

-- ---------------------------------------------------------------------------
-- 17. account_balance is not executable by anon.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.account_balance((select company_id from sh_company_a), 'CASH_ON_HAND')$$,
  '42501', null,
  'account_balance is not executable by anon'
);
reset role;

-- ---------------------------------------------------------------------------
-- 18-20. settle_order idempotent replay with p_client_ref.
-- ---------------------------------------------------------------------------
select testkit.as_user((select company_id from sh_company_a), 'd7000000-0000-0000-0000-0000000000a1', 'Admin');

create temp table sh_parked as
select public.post_sale(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]', '[]'::jsonb, true) as order_id;

select is(
  public.settle_order((select order_id from sh_parked),
    '[{"method":"cash","amount":100000}]', 'settle-ref-1'),
  (select order_id from sh_parked),
  'first settle with a client_ref completes the order'
);

select is(
  public.settle_order((select order_id from sh_parked),
    '[{"method":"cash","amount":100000}]', 'settle-ref-1'),
  (select order_id from sh_parked),
  'replayed settle with the same client_ref returns the original result'
);

select is(
  (select count(*)::int from public.payments
   where order_id = (select order_id from sh_parked)),
  1,
  'the replayed settle did not double-post payments'
);

-- ---------------------------------------------------------------------------
-- 21-23. post_sale p_draft_id: atomic proforma consumption.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.post_sale(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
  }]', '[{"method":"cash","amount":100000}]', false, null,
    (select order_id from sh_consume))$$,
  'post_sale with p_draft_id completes'
);

select is(
  (select count(*)::int from public.orders where id = (select order_id from sh_consume)),
  0,
  'the source proforma is deleted in the same transaction'
);

select throws_ok(
  $$select public.post_sale(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
  }]', '[{"method":"cash","amount":100000}]', false, null,
    (select order_id from sh_draft_b))$$,
  'P0001', 'draft_not_found: ' || (select order_id from sh_draft_b)::text,
  'post_sale rejects another company''s draft id'
);

-- ---------------------------------------------------------------------------
-- 24. Replay with p_draft_id: the original call consumed the draft, so a
-- replay must short-circuit on client_ref before draft validation.
-- ---------------------------------------------------------------------------
create temp table sh_consume_replay as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]') as order_id;

create temp table sh_replay_sale as
select public.post_sale(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]', '[{"method":"cash","amount":100000}]', false, 'sh-replay-1',
  (select order_id from sh_consume_replay)) as order_id;

select is(
  public.post_sale(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
  }]', '[{"method":"cash","amount":100000}]', false, 'sh-replay-1',
    (select order_id from sh_consume_replay)),
  (select order_id from sh_replay_sale),
  'replayed post_sale with the same client_ref and a consumed draft returns the original order'
);

-- ---------------------------------------------------------------------------
-- 25-26. Parked/held sales retire the proforma too: the order row supersedes
-- it, so leaving it convertible would allow a duplicate sale.
-- ---------------------------------------------------------------------------
create temp table sh_consume_park as
select public.save_draft(null, '[{
  "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
}]') as order_id;

select lives_ok(
  $$select public.post_sale(null, '[{
    "variant_id":"d7aa0000-0000-0000-0000-000000000001","quantity":1,"unit_price":100000
  }]', '[]', true, null, (select order_id from sh_consume_park))$$,
  'parked post_sale with p_draft_id completes'
);

select is(
  (select count(*)::int from public.orders where id = (select order_id from sh_consume_park)),
  0,
  'a parked sale retires the source proforma in the same transaction'
);

select * from finish();
rollback;
