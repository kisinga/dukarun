import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 3,
});
const [admin, poster] = await Promise.all([pool.connect(), pool.connect()]);
const userId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
let companyId;
let pending;
let waitingClient;
try {
  await admin.query('begin');
  await admin.query('select testkit.create_user($1,$2)', [userId, `vat-race-${userId}@test.local`]);
  companyId = (await admin.query("select testkit.provision($1,'VAT posting race') id", [userId]))
    .rows[0].id;
  await admin.query('reset role');
  await admin.query('insert into public.products(id,company_id,name) values($1,$2,$3)', [
    productId,
    companyId,
    'VAT race service',
  ]);
  await admin.query(
    "insert into public.product_variants(id,company_id,product_id,name,sku,kind,track_inventory,price,wholesale_price) values($1,$2,$3,'Default',$4,'service',false,116,116)",
    [variantId, companyId, productId, `VAT-${variantId}`]
  );
  await admin.query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
  await admin.query('select testkit.ensure_open_session()');
  await admin.query('commit');
  const locationId = (
    await admin.query('select id from public.stock_locations where company_id=$1 and is_default', [
      companyId,
    ])
  ).rows[0].id;
  const tax = (
    await admin.query(
      "select j.id jurisdiction,c.id category from public.tax_jurisdictions j join public.tax_categories c on c.jurisdiction_id=j.id where j.country_code='KE' and c.code='STANDARD'"
    )
  ).rows[0];
  const begin = async client => {
    await client.query('begin');
    await client.query("set local statement_timeout='10s'");
    await client.query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
  };
  const activate = (client, enabled) =>
    client.query('select public.schedule_company_tax_profile($1,$2,$3,null,$4)', [
      tax.jurisdiction,
      enabled,
      '',
      tax.category,
    ]);
  const sell = client =>
    client.query(
      'select public.post_sale_at_location($1,null,$2::jsonb,$3::jsonb,false,$4) result',
      [
        locationId,
        JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 116 }]),
        JSON.stringify([{ method: 'cash', amount: 116 }]),
        crypto.randomUUID(),
      ]
    );
  const waitingForAdvisory = async client => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const state = await pool.query(
        "select wait_event='advisory' waiting from pg_stat_activity where pid=$1",
        [client.processID]
      );
      if (state.rows[0]?.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('expected the VAT/posting critical section to wait for the company lock');
  };

  // Activation wins: a waiting posting must see the committed profile, even though its
  // transaction and request began before activation was committed.
  await begin(poster);
  await begin(admin);
  await activate(admin, true);
  pending = sell(poster);
  waitingClient = poster;
  void pending.catch(() => undefined);
  await waitingForAdvisory(poster);
  await admin.query('commit');
  const id = (await pending).rows[0].result.order_id;
  pending = undefined;
  const sale = (
    await poster.query(
      'select tax_total,posted_at,net_total,total from public.orders where id=$1',
      [id]
    )
  ).rows[0];
  assert.equal(Number(sale.tax_total), 16);
  assert.equal(Number(sale.net_total), 100);
  assert.equal(Number(sale.total), 116);
  await poster.query('rollback');

  // Posting wins: a subsequent VAT change waits until all fiscal facts finish together.
  await begin(poster);
  const before = (await sell(poster)).rows[0].result.order_id;
  await begin(admin);
  pending = activate(admin, false);
  waitingClient = admin;
  void pending.catch(() => undefined);
  await waitingForAdvisory(admin);
  assert.equal(
    Number(
      (await poster.query('select tax_total from public.orders where id=$1', [before])).rows[0]
        .tax_total
    ),
    16
  );
  await poster.query('rollback');
  await pending;
  pending = undefined;
  await admin.query('commit');

  // A transaction's start timestamp is never the posting timestamp.
  await begin(poster);
  const transactionStart = (await poster.query('select now() time')).rows[0].time;
  await begin(admin);
  await activate(admin, true);
  await admin.query('commit');
  const after = (await sell(poster)).rows[0].result.order_id;
  const current = (
    await poster.query('select posted_at,tax_total from public.orders where id=$1', [after])
  ).rows[0];
  assert.ok(current.posted_at > transactionStart);
  assert.equal(Number(current.tax_total), 16);
  await poster.query('rollback');
  console.log(
    'VAT concurrency: activation and posting serialize in both orders; waiting posts use current VAT.'
  );
} finally {
  // Cancel only our own outstanding test query before enqueueing rollback on that connection.
  if (pending && waitingClient) {
    await pool.query('select pg_cancel_backend($1)', [waitingClient.processID]);
    await pending.catch(() => undefined);
  }
  await poster.query('rollback').catch(() => undefined);
  await admin.query('rollback').catch(() => undefined);
  await admin.query('reset role');
  await poster.query('reset role');
  if (companyId) {
    await admin.query('begin');
    await admin.query("select set_config('app.allow_ledger_mutation','on',true)");
    await admin.query('delete from public.companies where id=$1', [companyId]);
    await admin.query('delete from auth.users where id=$1', [userId]);
    await admin.query('commit');
  }
  admin.release();
  poster.release();
  await pool.end();
}
