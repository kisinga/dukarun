-- Cashier session tests (migration 0009): opening/closing declarations,
-- blind-count variance, one-open rule, order session tagging, M-Pesa records.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@cashier.local', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
create temp table cs_company as select public.provision_company('Cashier Co', 'Main') as company_id;
reset role;

insert into public.products (id, company_id, name, sku, price, track_inventory)
select 'a0000000-0000-0000-0000-0000000000dd', company_id, 'Service', 'SVC', 10000, false from cs_company;

create temp table cs_claims as
select format('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","company_id":"%s","user_role":"Admin"}', company_id) as claims
from cs_company;
grant select on pg_temp.cs_claims to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', (select claims from cs_claims), true);

-- 1. Opening without declaring all cashier-controlled accounts fails
--    (cash + mpesa are cashier-controlled by provisioning).
select throws_ok(
  $$select public.open_cashier_session('[{"account_code":"CASH_ON_HAND","declared":0}]')$$,
  'P0001', 'missing_declaration: CLEARING_MPESA',
  'opening requires declarations for all cashier-controlled accounts'
);

-- 2. Clean open (zero balances, zero declarations) — no variance entries.
create temp table sess1 as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":0},
  {"account_code":"CLEARING_MPESA","declared":0}
]') as session_id;

select ok((select session_id from sess1) is not null, 'session opens');

select is(
  (select count(*)::int from public.ledger_journal_entries where source_type = 'VarianceAdjustment'),
  0,
  'matching declarations post no variance'
);

-- 3. One open session per company.
select throws_ok(
  $$select public.open_cashier_session('[
    {"account_code":"CASH_ON_HAND","declared":0},
    {"account_code":"CLEARING_MPESA","declared":0}
  ]')$$,
  'P0001', 'session_already_open',
  'cannot open a second session while one is open'
);

-- 4. Sale during the session gets tagged with the session id.
create temp table cs_sale as
select public.post_sale(null,
  '[{"product_id":"a0000000-0000-0000-0000-0000000000dd","quantity":1,"unit_price":10000}]',
  '[{"method":"cash","amount":10000}]') as order_id;

select is(
  (select cashier_session_id from public.orders where id = (select order_id from cs_sale)),
  (select session_id from sess1),
  'completed order tagged with the open session'
);

-- 5-8. Close with a 1000 shortage (expected 10000, declared 9000).
select public.close_cashier_session((select session_id from sess1), '[
  {"account_code":"CASH_ON_HAND","declared":9000},
  {"account_code":"CLEARING_MPESA","declared":0}
]');

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'VarianceAdjustment'
    order by a.code$$,
  $$values
    ('CASH_ON_HAND', 0::bigint, 1000::bigint),
    ('CASH_SHORT_OVER', 1000::bigint, 0::bigint)$$,
  'shortage posts DR CASH_SHORT_OVER / CR CASH_ON_HAND'
);

select is(
  (select variance from public.cash_drawer_counts
   where session_id = (select session_id from sess1) and count_type = 'closing'),
  -1000::bigint,
  'closing drawer count records the variance'
);

select is(
  (select status from public.cashier_sessions where id = (select session_id from sess1)),
  'closed',
  'session is closed'
);

-- 9. Opening overage: new session declaring 9500 vs balance 9000.
create temp table sess2 as
select public.open_cashier_session('[
  {"account_code":"CASH_ON_HAND","declared":9500},
  {"account_code":"CLEARING_MPESA","declared":0}
]') as session_id;

select results_eq(
  $$select a.code::text, l.debit, l.credit
    from public.ledger_journal_lines l
    join public.ledger_accounts a on a.id = l.account_id
    join public.ledger_journal_entries e on e.id = l.entry_id
    where e.source_type = 'VarianceAdjustment'
      and e.source_id like (select session_id::text from sess2) || '%'
    order by a.code$$,
  $$values
    ('CASH_ON_HAND', 500::bigint, 0::bigint),
    ('CASH_SHORT_OVER', 0::bigint, 500::bigint)$$,
  'opening overage posts DR CASH_ON_HAND / CR CASH_SHORT_OVER'
);

-- 10-11. M-Pesa verification is record-only.
create temp table entry_count as
select count(*)::int as n from public.ledger_journal_entries;

select public.record_mpesa_verification((select session_id from sess2), true, '[]', 'all matched');
select is(
  (select count(*)::int from public.mpesa_verifications where session_id = (select session_id from sess2)),
  1,
  'mpesa verification recorded'
);

select is(
  (select count(*)::int from public.ledger_journal_entries),
  (select n from entry_count),
  'mpesa verification posts no ledger entries'
);

-- 12. Global invariant.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits across all entries'
);

select * from finish();
rollback;
