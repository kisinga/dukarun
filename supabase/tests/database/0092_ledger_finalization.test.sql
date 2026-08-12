begin;
select plan(34);

select testkit.create_user(
  '92000000-0000-4000-8000-000000000001',
  'ledger-finalization@test.local'
);

create temp table finalization_fixture as
select testkit.provision(
  '92000000-0000-4000-8000-000000000001',
  'Ledger Finalization Store'
) as company_id;
grant select on pg_temp.finalization_fixture to authenticated;

select testkit.as_user(
  (select company_id from finalization_fixture),
  '92000000-0000-4000-8000-000000000001',
  'Admin'
);
reset role;

select has_column('public','ledger_journal_entries','finalized_at',
  'journal entries expose explicit finalization state');

create temp table stable_entry as
select public.post_journal_entry(
  (select company_id from finalization_fixture),
  'SealTest','stable-source','Stable sealed journal',
  '[{"account_code":"EXPENSES","debit":10,"meta":{"reason":"original"}},
    {"account_code":"BALANCE_ADJUSTMENT","credit":10}]'::jsonb,
  current_date-2
) as entry_id;

select ok((select entry_id from stable_entry) is not null,
  'normal posting creates an entry');
select ok((select finalized_at is not null from public.ledger_journal_entries
  where id=(select entry_id from stable_entry)),
  'normal posting seals its entry');
select is((select payload_hash from public.ledger_journal_entries
  where id=(select entry_id from stable_entry)),
  public.journal_entry_payload_hash((select entry_id from stable_entry)),
  'sealed entry hash matches persisted lines');

select throws_ok(
  $$insert into public.ledger_journal_lines(entry_id,company_id,account_id,debit,credit)
    select (select entry_id from stable_entry),f.company_id,a.id,1,0
    from finalization_fixture f
    join public.ledger_accounts a on a.company_id=f.company_id and a.code='EXPENSES'$$,
  'P0001','ledger_immutable: finalized journal lines cannot be modified',
  'sealed entries reject appended lines'
);

select throws_ok(
  $$update public.ledger_journal_lines
    set meta=meta||'{"reason":"rewritten"}'::jsonb
    where entry_id=(select entry_id from stable_entry) and debit>0$$,
  'P0001','ledger_immutable: finalized journal lines cannot be modified',
  'sealed entries reject metadata rewrites'
);

select throws_ok(
  $$update public.ledger_journal_lines set debit=debit+1
    where entry_id=(select entry_id from stable_entry) and debit>0$$,
  'P0001','ledger_immutable: finalized journal lines cannot be modified',
  'sealed entries reject amount rewrites'
);

select throws_ok(
  $$delete from public.ledger_journal_lines
    where entry_id=(select entry_id from stable_entry)$$,
  'P0001','ledger_immutable: posted journal lines cannot be deleted',
  'sealed entries reject line deletion'
);

insert into public.ledger_journal_entries(
  company_id,entry_date,source_type,source_id,memo,payload_hash,finalized_at
)
select company_id,current_date,'SealTest','unfinished-source','Unfinished journal',repeat('0',64),null
from finalization_fixture;
create temp table unfinished_entry as
select id as entry_id from public.ledger_journal_entries
where company_id=(select company_id from finalization_fixture)
  and source_type='SealTest' and source_id='unfinished-source';
insert into public.ledger_journal_lines(entry_id,company_id,account_id,debit,credit)
select u.entry_id,f.company_id,a.id,10,0
from unfinished_entry u cross join finalization_fixture f
join public.ledger_accounts a on a.company_id=f.company_id and a.code='EXPENSES'
union all
select u.entry_id,f.company_id,a.id,0,10
from unfinished_entry u cross join finalization_fixture f
join public.ledger_accounts a on a.company_id=f.company_id and a.code='BALANCE_ADJUSTMENT';

select throws_ok(
  $$set constraints ledger_journal_entries_balanced immediate$$,
  'P0001',
  format('ledger_unfinalized: entry %s must be finalized before commit',
    (select entry_id from unfinished_entry)),
  'balanced direct entries cannot commit without finalization'
);

select set_config('app.allow_ledger_mutation','on',true);
delete from public.ledger_journal_entries where id=(select entry_id from unfinished_entry);

create temp table etl_entry as
with inserted as (
  insert into public.ledger_journal_entries(
    company_id,entry_date,source_type,source_id,memo
  )
  select company_id,current_date-1,'EtlTest','etl-source','ETL repaired journal'
  from finalization_fixture
  returning id
)
select id as entry_id from inserted;

insert into public.ledger_journal_lines(entry_id,company_id,account_id,debit,credit)
select e.entry_id,f.company_id,a.id,14,0
from etl_entry e cross join finalization_fixture f
join public.ledger_accounts a on a.company_id=f.company_id and a.code='EXPENSES'
union all
select e.entry_id,f.company_id,a.id,0,13
from etl_entry e cross join finalization_fixture f
join public.ledger_accounts a on a.company_id=f.company_id and a.code='BALANCE_ADJUSTMENT';

update public.ledger_journal_lines set credit=14
where entry_id=(select entry_id from etl_entry) and credit>0;
update public.ledger_journal_entries e
set payload_hash=public.journal_entry_payload_hash(e.id),finalized_at=now()
where e.id=(select entry_id from etl_entry);
select set_config('app.allow_ledger_mutation','off',true);

select is((select sum(debit)-sum(credit) from public.ledger_journal_lines
  where entry_id=(select entry_id from etl_entry)),0::numeric,
  'simulated ETL repairs imported lines before finalization');
select ok((select finalized_at is not null
    and payload_hash=public.journal_entry_payload_hash(id)
  from public.ledger_journal_entries where id=(select entry_id from etl_entry)),
  'simulated ETL hashes and finalizes its imported entry');
select lives_ok(
  $$set constraints ledger_journal_entries_balanced immediate$$,
  'simulated ETL entry passes the deferred commit invariant'
);
set constraints ledger_journal_entries_balanced deferred;

select testkit.as_user(
  (select company_id from finalization_fixture),
  '92000000-0000-4000-8000-000000000001',
  'Admin'
);

create temp table seal_location as
select id as location_id from public.stock_locations
where company_id=(select company_id from finalization_fixture) and is_default limit 1;
grant select on pg_temp.seal_location to authenticated;

create temp table seal_session as
select public.open_cashier_session_at_location(
  (select location_id from seal_location),
  '[{"account_code":"CASH_ON_HAND","declared":100},
    {"account_code":"MPESA","declared":0}]'::jsonb
) as session_id;
grant select on pg_temp.seal_session to authenticated;

select ok((select session_id from seal_session) is not null,
  'cashier session opens for posting-time tagging');
reset role;

create temp table paid_purchase_entry as
select public.post_journal_entry(
  (select company_id from finalization_fixture),
  'InventoryPurchase','paid-purchase-source','Paid purchase tagging',
  '[{"account_code":"INVENTORY","debit":50,"meta":{"purchaseId":"92000000-0000-4000-8000-000000000099"}},
    {"account_code":"CASH_ON_HAND","credit":50,"meta":{"isCreditPurchase":false}}]'::jsonb,
  current_date
) as entry_id;

select ok((select entry_id from paid_purchase_entry) is not null,
  'paid inventory purchase posts while unfinalized');
select ok((select bool_and(meta->>'openSessionId'=(select session_id::text from seal_session))
  from public.ledger_journal_lines where entry_id=(select entry_id from paid_purchase_entry)),
  'posting-time trigger tags every paid purchase line before sealing');
select ok((select finalized_at is not null from public.ledger_journal_entries
  where id=(select entry_id from paid_purchase_entry)),
  'paid inventory purchase is sealed after tagging');
select is((select payload_hash from public.ledger_journal_entries
  where id=(select entry_id from paid_purchase_entry)),
  public.journal_entry_payload_hash((select entry_id from paid_purchase_entry)),
  'session enrichment does not stale the persisted payload hash');

select testkit.as_user(
  (select company_id from finalization_fixture),
  '92000000-0000-4000-8000-000000000001',
  'Admin'
);
select is(public.close_cashier_session(
  (select session_id from seal_session),
  '[{"account_code":"CASH_ON_HAND","declared":50},
    {"account_code":"MPESA","declared":0}]'::jsonb
), (select session_id from seal_session),
  'cashier session closes at the location balance');
reset role;

create temp table reversal_entry as
select public.post_reversal_entry(
  (select company_id from finalization_fixture),
  'SealReversal','stable-source-reversal','Reverse stable sealed journal',
  '[{"account_code":"BALANCE_ADJUSTMENT","debit":10},
    {"account_code":"EXPENSES","credit":10}]'::jsonb,
  (select entry_id from stable_entry)
) as entry_id;

select ok((select entry_id from reversal_entry) is not null,
  'reversal posting remains available');
select is((select reversal_of from public.ledger_journal_entries
  where id=(select entry_id from reversal_entry)),
  (select entry_id from stable_entry),
  'sealed reversal retains its original-entry link');
select ok((select finalized_at is not null from public.ledger_journal_entries
  where id=(select entry_id from reversal_entry)),
  'reversal entry is finalized');

update public.payment_methods set requires_reconciliation=false
where company_id=(select company_id from finalization_fixture);
select testkit.as_user(
  (select company_id from finalization_fixture),
  '92000000-0000-4000-8000-000000000001',
  'Admin'
);

create temp table closed_period as
select public.close_accounting_period(current_date) as period_id;
grant select on pg_temp.closed_period to authenticated;
select ok((select period_id from closed_period) is not null,
  'first accounting period closes');
select is((select start_date from public.accounting_periods
  where id=(select period_id from closed_period)),current_date-2,
  'first period starts at the earliest finalized journal date');
reset role;

select is(public.post_journal_entry(
  (select company_id from finalization_fixture),
  'SealTest','stable-source','Stable sealed journal',
  '[{"account_code":"EXPENSES","debit":10,"meta":{"reason":"original"}},
    {"account_code":"BALANCE_ADJUSTMENT","credit":10}]'::jsonb,
  current_date-2
), (select entry_id from stable_entry),
  'identical replay succeeds after its period is closed');

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from finalization_fixture),
    'SealTest','stable-source','Changed sealed journal',
    '[{"account_code":"EXPENSES","debit":10,"meta":{"reason":"original"}},
      {"account_code":"BALANCE_ADJUSTMENT","credit":10}]'::jsonb,
    current_date-2)$$,
  'P0001',
  'journal_idempotency_conflict: source SealTest/stable-source was already posted with a different payload',
  'changed replay reports an idempotency conflict before the period lock'
);

select throws_ok(
  $$select public.post_journal_entry(
    (select company_id from finalization_fixture),
    'SealTest','new-locked-source','New locked journal',
    '[{"account_code":"EXPENSES","debit":10},
      {"account_code":"BALANCE_ADJUSTMENT","credit":10}]'::jsonb,
    current_date-2)$$,
  'P0001',
  'period_locked: entry date '||(current_date-2)||' is within a locked period',
  'new backdated journals remain blocked'
);

select has_trigger('public','ledger_journal_entries','ledger_entries_enforce_period_lock',
  'period enforcement is installed at the journal-entry boundary');
select ok(exists(
  select 1 from information_schema.triggers
  where event_object_schema='public' and event_object_table='ledger_journal_lines'
    and trigger_name='ledger_lines_immutable' and event_manipulation='INSERT'
), 'line immutability guard covers inserts');
select ok(strpos(pg_get_functiondef('public.enforce_journal_entry_period_lock()'::regprocedure),
  'pg_advisory_xact_lock_shared(hashtextextended(new.company_id::text,0))')>0,
  'new journal entries acquire the shared period lock');
select ok(strpos(pg_get_functiondef('public.close_accounting_period(date)'::regprocedure),
  'pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0))')>0,
  'period closing retains the matching exclusive lock');

select is((select count(*)::int from public.ledger_journal_entries
  where company_id=(select company_id from finalization_fixture) and finalized_at is null),0,
  'no committed scenario leaves an entry unfinalized');
select is((select count(*)::int from public.ledger_journal_entries
  where company_id=(select company_id from finalization_fixture)
    and finalized_at is not null and payload_hash is null),0,
  'every finalized scenario has a payload hash');
select ok(not exists(
  select 1 from public.ledger_journal_entries e
  join lateral(select coalesce(sum(l.debit),0) debit,coalesce(sum(l.credit),0) credit
    from public.ledger_journal_lines l where l.entry_id=e.id) totals on true
  where e.company_id=(select company_id from finalization_fixture)
    and (totals.debit<>totals.credit or totals.debit=0)
), 'every finalized scenario remains balanced');
select ok(not exists(
  select 1 from public.ledger_journal_entries e
  where e.company_id=(select company_id from finalization_fixture)
    and e.payload_hash is distinct from public.journal_entry_payload_hash(e.id)
), 'every finalized scenario hash matches its persisted lines');

select * from finish();
rollback;
