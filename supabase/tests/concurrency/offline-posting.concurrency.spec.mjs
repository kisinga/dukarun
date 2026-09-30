import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 3,
});
const [first, second] = await Promise.all([pool.connect(), pool.connect()]);
const userId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
let companyId;
let locationId;
let pending;
let waitingClient;
const begin = async client => {
  await client.query('begin');
  await client.query("set local statement_timeout='10s'");
  await client.query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
};
const submit = (client, request) =>
  client
    .query('select public.submit_offline_sale($1::jsonb) result', [JSON.stringify(request)])
    .then(r => r.rows[0].result);
const requestFor = async age => {
  await begin(first);
  const request = (
    await first.query(
      `select testkit.offline_request($1,null,$2::jsonb,$3::jsonb,$4,
    clock_timestamp()-$5::interval,'race-device') request`,
      [
        locationId,
        JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 116 }]),
        JSON.stringify([{ method: 'cash', amount: 116 }]),
        crypto.randomUUID(),
        age,
      ]
    )
  ).rows[0].request;
  await first.query('commit');
  return request;
};
const waitForLock = async client => {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const row = (
      await pool.query('select wait_event_type from pg_stat_activity where pid=$1', [
        client.processID,
      ])
    ).rows[0];
    if (row?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Expected the competing request to wait on the logical sale lock');
};
const confirm = (client, id, key, review, destination, crossover = false, cash) =>
  client
    .query('select public.confirm_offline_sale_review($1,$2,$3,$4,$5,null,$6,$7::jsonb) result', [
      id,
      key,
      review.review_fingerprint,
      destination,
      'Reviewed original captured sale',
      crossover,
      cash ? JSON.stringify(cash) : null,
    ])
    .then(r => r.rows[0].result);
try {
  await first.query('begin');
  await first.query('select testkit.create_user($1,$2)', [
    userId,
    `offline-race-${userId}@test.local`,
  ]);
  companyId = (
    await first.query("select testkit.provision($1,'Offline posting race') id", [userId])
  ).rows[0].id;
  await first.query('reset role');
  await first.query('insert into public.products(id,company_id,name) values($1,$2,$3)', [
    productId,
    companyId,
    'Race service',
  ]);
  await first.query(
    "insert into public.product_variants(id,company_id,product_id,name,sku,kind,track_inventory,price,wholesale_price) values($1,$2,$3,'Default',$4,'service',false,116,116)",
    [variantId, companyId, productId, variantId]
  );
  await first.query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
  await first.query('select testkit.ensure_open_session()');
  locationId = (
    await first.query('select id from public.stock_locations where company_id=$1 and is_default', [
      companyId,
    ])
  ).rows[0].id;
  await first.query('commit');

  // Lost response and concurrent replay: both receive the one committed result.
  const original = await requestFor('0 seconds');
  await begin(first);
  const completed = await submit(first, original);
  assert.equal(completed.status, 'completed');
  await begin(second);
  pending = submit(second, original);
  waitingClient = second;
  void pending.catch(() => undefined);
  await waitForLock(second);
  await first.query('commit');
  assert.deepEqual(await pending, completed);
  pending = undefined;
  await second.query('rollback');
  await begin(second);
  const correctionAfterLostResponse = await confirm(
    second,
    completed.review_id,
    crypto.randomUUID(),
    { review_fingerprint: 'outdated' },
    original.originating_session_id
  );
  assert.deepEqual(correctionAfterLostResponse, completed);
  await second.query('rollback');

  // Two review confirmations race, with one immutable revision and one payment.
  const old = await requestFor('25 hours');
  await begin(first);
  const held = await submit(first, old);
  assert.equal(held.status, 'review');
  const review = (
    await first.query('select public.get_offline_sale_review($1) result', [held.review_id])
  ).rows[0].result;
  await first.query('commit');
  const key = crypto.randomUUID();
  await begin(first);
  const reviewed = await confirm(first, held.review_id, key, review, old.originating_session_id);
  assert.equal(reviewed.status, 'completed');
  await begin(second);
  pending = confirm(second, held.review_id, key, review, old.originating_session_id);
  waitingClient = second;
  void pending.catch(() => undefined);
  await waitForLock(second);
  await first.query('commit');
  assert.deepEqual(await pending, reviewed);
  pending = undefined;
  await second.query('rollback');
  await first.query('reset role');
  const counts = (
    await first.query(
      `select
    (select count(*) from public.payments where order_id=$1) payments,
    (select count(*) from public.offline_sale_revisions where request_id=$2) revisions,
    (select count(*) from public.orders where offline_request_id=$2 and status='completed') orders`,
      [reviewed.order_id, held.review_id]
    )
  ).rows[0];
  assert.deepEqual(counts, { payments: '1', revisions: '1', orders: '1' });

  // VAT activation during a reviewed posting invalidates that approval atomically.
  const vatRequest = await requestFor('25 hours');
  await begin(first);
  const vatHeld = await submit(first, vatRequest);
  const vatReview = (
    await first.query('select public.get_offline_sale_review($1) result', [vatHeld.review_id])
  ).rows[0].result;
  await first.query('commit');
  await begin(second);
  await second.query(`select public.schedule_company_tax_profile(j.id,true,'',null,c.id)
    from public.tax_jurisdictions j join public.tax_categories c on c.jurisdiction_id=j.id
    where j.country_code='KE' and c.code='STANDARD'`);
  await begin(first);
  pending = confirm(
    first,
    vatHeld.review_id,
    crypto.randomUUID(),
    vatReview,
    vatRequest.originating_session_id
  );
  waitingClient = first;
  void pending.catch(() => undefined);
  await waitForLock(first);
  await second.query('commit');
  const taxChanged = await pending;
  pending = undefined;
  assert.equal(taxChanged.status, 'review');
  assert.match(taxChanged.blockers[0].message, /offline_review_changed/);
  assert.equal(
    (
      await first.query('select count(*) from public.orders where offline_request_id=$1', [
        vatHeld.review_id,
      ])
    ).rows[0].count,
    '0'
  );
  const refreshedVat = (
    await first.query('select public.get_offline_sale_review($1) result', [vatHeld.review_id])
  ).rows[0].result;
  assert.equal(refreshedVat.vat.active_profile.vat_registered, true);
  assert.equal(refreshedVat.lines[0].current.tax_treatment.tax_total, 16);
  const withVat = await confirm(
    first,
    vatHeld.review_id,
    crypto.randomUUID(),
    refreshedVat,
    vatRequest.originating_session_id
  );
  assert.equal(withVat.status, 'completed');
  assert.equal(
    Number(
      (await first.query('select tax_total from public.orders where id=$1', [withVat.order_id]))
        .rows[0].tax_total
    ),
    16
  );
  await first.query('commit');

  // Closing waits for the posting's session lock; it cannot close between
  // the open-session check and committing the sale.
  const closingRequest = await requestFor('0 seconds');
  await begin(first);
  assert.equal((await submit(first, closingRequest)).status, 'completed');
  await begin(second);
  pending = second.query('select testkit.close_open_session()');
  waitingClient = second;
  void pending.catch(() => undefined);
  await waitForLock(second);
  await first.query('commit');
  await pending;
  pending = undefined;
  await second.query('rollback');

  // A destination closing after review cannot be replaced with its successor.
  const crossing = await requestFor('0 seconds');
  await begin(first);
  await first.query('select testkit.close_open_session()');
  const destination = (await first.query('select testkit.ensure_open_session() id')).rows[0].id;
  const crossover = await submit(first, crossing);
  assert.equal(crossover.status, 'waiting');
  const crossoverReview = (
    await first.query('select public.get_offline_sale_review($1,$2) result', [
      crossover.review_id,
      destination,
    ])
  ).rows[0].result;
  await first.query('commit');
  await begin(second);
  await second.query('select testkit.close_open_session()');
  const successor = (await second.query('select testkit.ensure_open_session() id')).rows[0].id;
  await second.query('commit');
  await begin(first);
  const changed = await confirm(
    first,
    crossover.review_id,
    crypto.randomUUID(),
    crossoverReview,
    destination,
    true,
    { included_amount: 0, reason: 'Cash was not in the closing count' }
  );
  assert.equal(changed.status, 'review');
  assert.equal(changed.blockers[0].code, 'review_changed');
  assert.equal(
    (
      await first.query('select count(*) from public.orders where offline_request_id=$1', [
        crossover.review_id,
      ])
    ).rows[0].count,
    '0'
  );
  assert.equal(
    (await first.query('select status from public.cashier_sessions where id=$1', [successor]))
      .rows[0].status,
    'open'
  );
  await first.query('rollback');
  console.log(
    'Offline concurrency: one sale/payment across retries and revisions; VAT changes and closed destinations require renewed review.'
  );
} finally {
  if (pending && waitingClient) {
    await pool.query('select pg_cancel_backend($1)', [waitingClient.processID]);
    await pending.catch(() => undefined);
  }
  await first.query('rollback').catch(() => undefined);
  await second.query('rollback').catch(() => undefined);
  await first.query('reset role');
  if (companyId) {
    await first.query('begin');
    // Only generated fixture rows. Immutable audit triggers intentionally have no
    // production deletion API; bypass them within this isolated cleanup transaction.
    await first.query("set local session_replication_role='replica'");
    for (const table of [
      'offline_cash_corrections',
      'offline_sale_events',
      'offline_sale_revisions',
      'offline_sale_requests',
      'offline_sale_contexts',
      'tax_document_lines',
      'tax_documents',
    ]) {
      await first.query(`delete from public.${table} where company_id=$1`, [companyId]);
    }
    await first.query("set local session_replication_role='origin'");
    await first.query("select set_config('app.allow_ledger_mutation','on',true)");
    await first.query('delete from public.companies where id=$1', [companyId]);
    await first.query('delete from auth.users where id=$1', [userId]);
    await first.query('commit');
  }
  first.release();
  second.release();
  await pool.end();
}
