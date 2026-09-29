import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 3,
});
const clients = await Promise.all([pool.connect(), pool.connect()]);
const userId = crypto.randomUUID();
const orderIds = [crypto.randomUUID(), crypto.randomUUID()];
const keys = [crypto.randomUUID(), crypto.randomUUID()];
let companyId;
let secretId;
async function asOwner(client, query, values) {
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
    const result = await client.query(query, values);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
try {
  secretId = (
    await clients[0].query(
      "select vault.create_secret('https://receipt.example.test','STOREFRONT_PUBLIC_URL') id where not exists(select 1 from vault.secrets where name='STOREFRONT_PUBLIC_URL')"
    )
  ).rows[0]?.id;
  await clients[0].query('select testkit.create_user($1,$2)', [
    userId,
    `pdf-race-${userId}@test.local`,
  ]);
  companyId = (
    await clients[0].query("select testkit.provision($1,'Receipt concurrency') id", [userId])
  ).rows[0].id;
  await clients[0].query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: userId,
      company_id: companyId,
      role: 'authenticated',
      user_role: 'Admin',
    }),
  ]);
  for (const id of orderIds) {
    await clients[0].query(
      "insert into public.orders(id,company_id,location_id,code,status,total,is_credit_sale,completed_at) select $1::uuid,$2::uuid,id,($1::uuid)::text,'completed',1000,false,now() from public.stock_locations where company_id=$2 and code='MAIN'",
      [id, companyId]
    );
    await clients[0].query(
      "insert into public.payments(company_id,order_id,method_code,amount,status) values($1,$2,'cash',1000,'settled')",
      [companyId, id]
    );
  }
  const send = i =>
    asOwner(
      clients[i],
      "select public.request_sale_document($1,$2,'0712345678','Amina','') result",
      [orderIds[i], keys[i]]
    );
  const settled = await Promise.allSettled([send(0), send(1)]);
  for (const result of settled) if (result.status === 'rejected') throw result.reason;
  const results = settled.map(result => result.value);
  const outboxIds = results.map(r => r.rows[0].result.outbox_id);
  const contacts = await clients[0].query(
    'select customer_id from public.orders where id=any($1::uuid[])',
    [orderIds]
  );
  assert.equal(
    contacts.rows[0].customer_id,
    contacts.rows[1].customer_id,
    'concurrent captures reuse one customer'
  );
  const replay = await send(0);
  assert.equal(
    replay.rows[0].result.outbox_id,
    outboxIds[0],
    'lost response retry reuses its original delivery'
  );
  const claims = await Promise.all(
    clients.map(c => c.query('select public.claim_sale_document_delivery($1) job', [outboxIds[0]]))
  );
  assert.equal(
    claims.filter(r => r.rows[0].job).length,
    1,
    'only one concurrent worker claims a PDF'
  );
  const job = claims.find(r => r.rows[0].job).rows[0].job;
  const dispatches = await Promise.all(
    clients.map(c =>
      c.query('select public.begin_sale_document_dispatch($1,$2) allowed', [
        job.id,
        job.claim_token,
      ])
    )
  );
  assert.equal(
    dispatches.filter(r => r.rows[0].allowed).length,
    1,
    'only one worker can begin provider dispatch'
  );
  const inserts = await Promise.allSettled(
    clients.map(c =>
      c.query(
        "insert into public.customers(company_id,first_name,phone) values($1,'Race','0712345679')",
        [companyId]
      )
    )
  );
  assert.equal(
    inserts.filter(r => r.status === 'fulfilled').length,
    1,
    'unique phone enforced against racing profile writes'
  );
  assert.equal(inserts.find(r => r.status === 'rejected').reason.code, '23505');
  console.log(
    'receipt concurrency: one phone identity, idempotent acceptance, exclusive claims/dispatch, unique write races passed'
  );
} finally {
  for (const client of clients) {
    await client.query('rollback').catch(() => {});
    await client.query('reset role').catch(() => {});
  }
  if (companyId) {
    // Never dispatch test messages: remove only this fixture's pending records first.
    await clients[0].query('delete from public.outbox where company_id=$1', [companyId]);
    await clients[0].query('delete from public.payments where company_id=$1', [companyId]);
    await clients[0].query('delete from public.orders where company_id=$1', [companyId]);
    await clients[0].query('delete from public.customers where company_id=$1', [companyId]);
    await clients[0].query('delete from public.companies where id=$1', [companyId]);
  }
  if (secretId) await clients[0].query('delete from vault.secrets where id=$1', [secretId]);
  await clients[0].query('delete from auth.users where id=$1', [userId]);
  clients.forEach(c => c.release());
  await pool.end();
}
