begin;
select plan(2);
select has_function('public','platform_operations_snapshot',array[]::text[],'operations snapshot RPC exists');
select hasnt_function('public','platform_broadcast',array['text','text','text'],'legacy broadcast RPC is removed');
select * from finish();
rollback;
