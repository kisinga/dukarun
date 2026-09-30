import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 3,
});
const userId = crypto.randomUUID();
let companyId;
const clients = await Promise.all([pool.connect(), pool.connect()]);
try {
  await clients[0].query('select testkit.create_user($1,$2)', [
    userId,
    `design-race-${userId}@test.local`,
  ]);
  companyId = (
    await clients[0].query("select testkit.provision($1,'Document save race') id", [userId])
  ).rows[0].id;
  const save = async (client, kind, layout) => {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("set local statement_timeout='10s'");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: userId,
          company_id: companyId,
          role: 'authenticated',
          user_role: 'Admin',
        }),
      ]);
      await client.query('select public.save_document_design($1,$2::jsonb)', [
        kind,
        JSON.stringify({
          version: 1,
          layout,
          message: kind,
          custom: { label: '', value: '', display: 'text' },
        }),
      ]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  };
  await Promise.all([
    save(clients[0], 'receipt', 'compact'),
    save(clients[1], 'invoice', 'modern'),
  ]);
  const { document_designs: designs } = (
    await clients[0].query('select document_designs from public.companies where id=$1', [companyId])
  ).rows[0];
  assert.equal(designs.receipt.layout, 'compact');
  assert.equal(designs.invoice.layout, 'modern');
  console.log('document design concurrency: both simultaneous per-document saves survive');
} finally {
  for (const c of clients) {
    await c.query('rollback').catch(() => undefined);
    await c.query('reset role').catch(() => undefined);
  }
  if (companyId) await clients[0].query('delete from public.companies where id=$1', [companyId]);
  await clients[0].query('delete from auth.users where id=$1', [userId]);
  clients.forEach(c => c.release());
  await pool.end();
}
