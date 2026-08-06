begin;
select plan(7);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'platform\_%' escape '\'
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'authenticated can enter every platform RPC'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'platform\_%' escape '\'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anonymous users cannot execute any platform RPC'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'platform\_%' escape '\'
     and not p.prosecdef),
  0,
  'every platform RPC is security definer'
);

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'platform\_%' escape '\'
     and position('assert_platform_admin' in pg_get_functiondef(p.oid)) = 0),
  0,
  'every platform RPC enforces the platform-admin assertion'
);

insert into public.subscription_tiers (
  id, code, name, price_monthly, price_yearly,
  multiple_locations_enabled, staff_performance_enabled, commissions_available
) values (
  '64646464-6464-6464-6464-646464646464',
  'grant-test', 'Grant Test', 100, 1000, false, false, false
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}';

select lives_ok(
  $$select public.platform_upsert_tier(
      p_code => 'grant-test',
      p_name => 'Grant Test Updated',
      p_price_monthly => 2500,
      p_price_yearly => 25000,
      p_multiple_locations_enabled => false,
      p_staff_performance_enabled => true,
      p_commissions_available => false,
      p_max_stock_locations => 1,
      p_tier_id => '64646464-6464-6464-6464-646464646464'
    )$$,
  'platform admin can update a tier through the authenticated role'
);

select is(
  (select name from public.subscription_tiers
   where id = '64646464-6464-6464-6464-646464646464'),
  'Grant Test Updated',
  'platform tier update is persisted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.platform_upsert_tier(
      p_code => 'grant-test',
      p_name => 'Unauthorized Update',
      p_price_monthly => 1,
      p_price_yearly => 1,
      p_multiple_locations_enabled => false,
      p_staff_performance_enabled => false,
      p_commissions_available => false,
      p_tier_id => '64646464-6464-6464-6464-646464646464'
    )$$,
  'P0001',
  'platform_admin_required',
  'ordinary authenticated users remain rejected by the platform check'
);

select * from finish();
rollback;
