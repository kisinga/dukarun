begin;
select plan(2);
select has_function('public','platform_operations_snapshot',array[]::text[],'operations snapshot RPC exists');
select has_function('public','platform_broadcast',array['text','text','text'],'platform broadcast RPC exists');
select * from finish();
rollback;
