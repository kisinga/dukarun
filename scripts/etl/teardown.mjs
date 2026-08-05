// TEARDOWN: undo one migrated Vendure channel -> Supabase company.
// Usage: node scripts/etl/teardown.mjs --channel <id> [--apply]
//   default   dry-run: runs the exact deletes in a transaction, prints
//             per-table deletion counts, then ROLLS BACK (nothing written).
//   --apply   same deletes, COMMIT.
//
// Deletes every row migrate.mjs wrote for the company, in FK-safe order,
// plus auth.users rows created for the company's memberships (only when not
// shared with another company) and the etl_id_map rows for the company.
// SOURCE (Vendure) is only used to resolve the channel code; never written.
import pg from 'pg';

const SRC_DSN =
  process.env.SOURCE_DB_URL ?? 'postgres://vendure:changeme-secure-password@localhost:5432/vendure';
const TGT_DSN =
  process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const FLAGS = { apply: args.includes('--apply'), channel: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--channel') FLAGS.channel = Number(args[++i]);
}
if (!FLAGS.channel) {
  console.error('usage: node scripts/etl/teardown.mjs --channel <id> [--apply]');
  process.exit(1);
}

const src = new pg.Client(SRC_DSN);
const tgt = new pg.Client(TGT_DSN);
await src.connect();
await tgt.connect();

const { rows: chRows } = await src.query('select id, code from channel where id=$1', [
  FLAGS.channel,
]);
const channel = chRows[0];
if (!channel) {
  console.error(`channel ${FLAGS.channel} not found`);
  process.exit(1);
}

// Delete the company's uploaded assets via the Storage API (service role).
// Best-effort: runs after COMMIT, so a failure must not crash the teardown.
async function deleteStoragePrefix(companyId) {
  try {
    const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      console.log('  storage: SUPABASE_SERVICE_ROLE_KEY unset; skipping storage cleanup');
      return;
    }
    const headers = {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    };
    const list = await fetch(`${url}/storage/v1/object/list/product-images`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: `${companyId}/`, limit: 1000 }),
    });
    if (!list.ok) {
      console.log(`  storage: list failed (${list.status}); skipping storage cleanup`);
      return;
    }
    const objs = (await list.json()).filter(o => o.id); // folders have null id
    if (!objs.length) {
      console.log('  storage: 0 objects');
      return;
    }
    const del = await fetch(`${url}/storage/v1/object/product-images`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: objs.map(o => `${companyId}/${o.name}`) }),
    });
    console.log(
      `  storage: ${del.ok ? objs.length : `delete failed (${del.status})`} object(s) deleted`
    );
  } catch (err) {
    console.log(
      `  storage: cleanup failed (${err.message}); objects under ${companyId}/ may remain`
    );
  }
}

// Company lookup: etl_id_map first, companies table by code as fallback.
let companyId = null;
{
  const { rows } = await tgt.query(
    `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`,
    [String(channel.id)]
  );
  companyId = rows[0]?.new_id ?? null;
}
if (!companyId) {
  const { rows } = await tgt.query('select id from public.companies where code=$1', [channel.code]);
  companyId = rows[0]?.id ?? null;
  if (companyId)
    console.log(`  WARN: no etl_id_map channel row; fell back to companies.code '${channel.code}'`);
}
if (!companyId) {
  console.log(`channel ${channel.id} (${channel.code}) is not migrated — nothing to tear down.`);
  await src.end();
  await tgt.end();
  process.exit(0);
}

console.log(
  `\n=== TEARDOWN channel ${channel.id} (${channel.code}) -> company ${companyId} ${FLAGS.apply ? '-- APPLY' : '-- DRY RUN'} ===`
);

// FK-safe order: children before parents. Every table migrate.mjs writes.
const STEPS = [
  [
    'reconciliation_accounts',
    'delete from public.reconciliation_accounts where reconciliation_id in (select id from public.reconciliations where company_id=$1)',
  ],
  ['reconciliations', 'delete from public.reconciliations where company_id=$1'],
  ['cash_drawer_counts', 'delete from public.cash_drawer_counts where company_id=$1'],
  ['payments', 'delete from public.payments where company_id=$1'],
  ['order_lines', 'delete from public.order_lines where company_id=$1'],
  ['ledger_journal_lines', 'delete from public.ledger_journal_lines where company_id=$1'],
  ['ledger_journal_entries', 'delete from public.ledger_journal_entries where company_id=$1'],
  ['orders', 'delete from public.orders where company_id=$1'],
  ['inventory_batches', 'delete from public.inventory_batches where company_id=$1'],
  ['cashier_sessions', 'delete from public.cashier_sessions where company_id=$1'],
  ['product_variants', 'delete from public.product_variants where company_id=$1'],
  ['products', 'delete from public.products where company_id=$1'],
  ['payment_methods', 'delete from public.payment_methods where company_id=$1'],
  ['ledger_accounts', 'delete from public.ledger_accounts where company_id=$1'],
  ['stock_locations', 'delete from public.stock_locations where company_id=$1'],
  ['customers', 'delete from public.customers where company_id=$1'],
  ['company_memberships', 'delete from public.company_memberships where company_id=$1'],
  ['roles', 'delete from public.roles where company_id=$1'],
  ['companies', 'delete from public.companies where id=$1'],
];

await tgt.query('begin');
// Ledger rows are immutable without this escape (guard_ledger_*_immutable).
await tgt.query(`select set_config('app.allow_ledger_mutation', 'on', true)`);
try {
  console.log('\n--- deletions ---');
  for (const [label, sql] of STEPS) {
    const r = await tgt.query(sql, [companyId]);
    console.log(`  ${label}: ${r.rowCount}`);
  }

  // auth.users created for this company's memberships. Users SHARED with
  // another company (reused by phone/email, or mapped there too) are kept.
  const { rows: mapped } = await tgt.query(
    `select new_id from public.etl_id_map where old_type='user' and company_id=$1`,
    [companyId]
  );
  const userIds = mapped.map(r => r.new_id);
  let deletedUsers = 0;
  if (userIds.length) {
    await tgt.query(
      `delete from auth.identities where user_id = any($1::uuid[])
         and not exists (select 1 from public.company_memberships m where m.user_id = identities.user_id)
         and not exists (select 1 from public.etl_id_map x
                         where x.old_type='user' and x.new_id = identities.user_id and x.company_id <> $2)`,
      [userIds, companyId]
    );
    const r = await tgt.query(
      `delete from auth.users where id = any($1::uuid[])
         and not exists (select 1 from public.company_memberships m where m.user_id = users.id)
         and not exists (select 1 from public.etl_id_map x
                         where x.old_type='user' and x.new_id = users.id and x.company_id <> $2)`,
      [userIds, companyId]
    );
    deletedUsers = r.rowCount;
  }
  console.log(`  auth.users: ${deletedUsers} (${userIds.length - deletedUsers} shared/kept)`);

  const r = await tgt.query('delete from public.etl_id_map where company_id=$1', [companyId]);
  console.log(`  etl_id_map: ${r.rowCount}`);

  if (FLAGS.apply) {
    await tgt.query('commit');
    console.log('\nCOMMITTED.');
    // Storage cleanup: direct deletes on storage.objects are blocked
    // (storage.protect_delete) — must go through the Storage API.
    await deleteStoragePrefix(companyId);
  } else {
    await tgt.query('rollback');
    console.log('\nDRY RUN — rolled back, nothing written.');
  }
} catch (err) {
  await tgt.query('rollback');
  console.error('\nFAILED, rolled back:', err.message);
  throw err;
} finally {
  await src.end();
  await tgt.end();
}
