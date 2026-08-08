-- Structural regression checks for guarantees that require competing sessions
-- to exercise fully. Behavioral outcomes live in the domain tests above.
begin;
select plan(5);

select ok(
  position('FOR UPDATE' in upper(pg_get_functiondef('public.consume_fifo(uuid,uuid,numeric,text,text,text)'::regprocedure)))
    < position('SUM(B.REMAINING)' in upper(pg_get_functiondef('public.consume_fifo(uuid,uuid,numeric,text,text,text)'::regprocedure))),
  'FIFO locks eligible batches before calculating availability'
);

select matches(
  pg_get_functiondef('public.consume_fifo(uuid,uuid,numeric,text,text,text)'::regprocedure),
  'fifo_invariant_failed',
  'FIFO asserts that the requested quantity was fully consumed'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.ledger_journal_lines'::regclass
      and tgname = 'ledger_lines_serialize_credit' and tgenabled <> 'D'
  ),
  'AR/AP serialization trigger is enabled'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.product_variants'::regclass
      and tgname = 'product_variants_enforce_limit' and tgenabled <> 'D'
  ),
  'product limit serialization trigger is enabled'
);

select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cache_change_log'
  ),
  'durable cache changes are the Realtime hydration source'
);

select * from finish();
rollback;
