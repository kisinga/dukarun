import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';

function localDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const output = execFileSync('./node_modules/.bin/supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = output.split('\n').find(value => value.startsWith('DB_URL='));
  if (!line) throw new Error('Local Supabase DB_URL unavailable.');
  return line.slice('DB_URL='.length).replace(/^"|"$/g, '');
}

const connectionString = localDatabaseUrl();
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname),
  'Schema convergence tests must run against a local disposable database'
);
const client = new pg.Client({ connectionString });
const value = async (sql, params = []) => (await client.query(sql, params)).rows[0].value;
const migration = readFileSync(
  new URL(
    '../../migrations/20260921000001_0175_catalog_import_schema_convergence.sql',
    import.meta.url
  ),
  'utf8'
);
const userId = crypto.randomUUID();
await client.connect();
try {
  // The simulated legacy DDL and fictional company are both rolled back.
  await client.query('begin');
  await client.query(migration);
  await client.query(
    `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,
       confirmation_token,recovery_token,email_change,email_change_token_current,
       email_change_token_new,phone_change,phone_change_token,reauthentication_token)
     values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       $2,'','','','','','','','','')`,
    [userId, `catalog-upgrade-${userId}@test.local`]
  );
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  const companyId = await value(
    "select public.provision_company('Catalog schema upgrade','Main') value"
  );
  await client.query(
    `update public.companies set status='approved',subscription_status='active',
       subscription_started_at=now(),subscription_expires_at=now()+interval '1 year',
       billing_cycle='yearly' where id=$1`,
    [companyId]
  );
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: userId, role: 'authenticated', company_id: companyId }),
  ]);
  await client.query(
    `select public.accept_company_terms(d.version,d.content_sha256)
       from public.current_published_company_terms() d`
  );
  await client.query('set local role authenticated');
  const marker = await value('select public.start_catalog_export() value');
  const original = await value("select public.begin_catalog_import('replace',$1,$2) value", [
    crypto.randomUUID(),
    marker.export_id,
  ]);
  await client.query('reset role');
  const history = () =>
    value('select to_jsonb(i) value from public.catalog_imports i where id=$1', [
      original.import_id,
    ]);
  const originalRow = await history();
  await client.query(migration);
  assert.deepEqual(
    await history(),
    originalRow,
    'healthy replay preserves import history and export links'
  );
  assert.equal(
    await value('select count(*)::int value from public.catalog_export_markers where id=$1', [
      marker.export_id,
    ]),
    1,
    'healthy replay preserves export markers'
  );

  // Reproduce the actual backup failure without relying on a clean db reset.
  await client.query('alter table public.catalog_imports drop column source_export_id');
  await client.query('drop function public.start_catalog_export()');
  await client.query('drop table public.catalog_export_markers');
  const before = await history();
  await client.query('savepoint broken_import');
  await assert.rejects(
    client.query("select public.begin_catalog_import('merge',$1)", [crypto.randomUUID()]),
    /column "source_export_id" of relation "catalog_imports" does not exist/
  );
  await client.query('rollback to savepoint broken_import');
  await client.query(migration);
  assert.deepEqual(
    await history(),
    { ...before, source_export_id: null },
    'legacy history survives repair'
  );
  assert.equal(
    await value(
      "select relrowsecurity value from pg_class where oid='public.catalog_export_markers'::regclass"
    ),
    true,
    'export markers retain row-level security'
  );
  assert.equal(
    await value(
      "select has_function_privilege('anon','public.start_catalog_export()','execute') value"
    ),
    false,
    'anonymous users cannot export'
  );
  assert.equal(
    await value(
      "select count(*)::int value from pg_constraint where conrelid='public.catalog_imports'::regclass and conname='catalog_imports_source_export_id_fkey' and contype='f'"
    ),
    1,
    'export links retain their foreign key'
  );
  await client.query('set local role authenticated');
  const mergeKey = crypto.randomUUID();
  const beginMerge = () =>
    value("select public.begin_catalog_import('merge',$1) value", [mergeKey]);
  const merged = await beginMerge();
  assert.equal(merged.status, 'processing', 'merge works after repair');
  assert.deepEqual(await beginMerge(), merged, 'retry returns the same import');
  const restoredMarker = await value('select public.start_catalog_export() value');
  const replaced = await value("select public.begin_catalog_import('replace',$1,$2) value", [
    crypto.randomUUID(),
    restoredMarker.export_id,
  ]);
  assert.equal(replaced.status, 'processing', 'replace works with new server-issued markers');
  console.log(
    'catalog import schema convergence: healthy replay, missing-object repair, history, grants, merge, replace and retries passed'
  );
} finally {
  await client.query('rollback');
  await client.end();
}
