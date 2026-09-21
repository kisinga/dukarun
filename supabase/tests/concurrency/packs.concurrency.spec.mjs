import assert from 'node:assert/strict';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  max: 3,
});
const userId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
const packId = crypto.randomUUID();
const clients = await Promise.all([pool.connect(), pool.connect()]);
let companyId;
try {
  await clients[0].query('begin');
  await clients[0].query('select testkit.create_user($1,$2)', [
    userId,
    `pack-race-${userId}@test.local`,
  ]);
  companyId = (
    await clients[0].query("select testkit.provision($1,'Pack stock race') id", [userId])
  ).rows[0].id;
  await clients[0].query('reset role');
  await clients[0].query('insert into public.products(id,company_id,name) values($1,$2,$3)', [
    productId,
    companyId,
    'Race eggs',
  ]);
  await clients[0].query(
    "insert into public.product_variants(id,company_id,product_id,sku,price,wholesale_price,stock_unit,name) values($1,$2,$3,$4,20,17,'egg','Default')",
    [variantId, companyId, productId, `RACE-${variantId}`]
  );
  await clients[0].query(
    "insert into public.variant_packs(id,company_id,variant_id,name,units_per_pack,sale_price) values($1,$2,$3,'Tray',30,480)",
    [packId, companyId, variantId]
  );
  await clients[0].query(
    'insert into public.inventory_batches(company_id,variant_id,quantity,remaining,unit_cost,original_cost,remaining_cost) values($1,$2,30,30,14,425,425)',
    [companyId, variantId]
  );
  await clients[0].query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
  await clients[0].query('select testkit.ensure_open_session()');
  await clients[0].query('reset role');
  await clients[0].query('commit');
  const sell = async (client, pack) => {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: userId,
          role: 'authenticated',
          company_id: companyId,
          user_role: 'Admin',
        }),
      ]);
      const result = await client.query('select public.post_sale(null,$1::jsonb,$2::jsonb) id', [
        JSON.stringify([{ variant_id: variantId, pack_id: pack ? packId : null, quantity: 1 }]),
        JSON.stringify([{ method: 'cash', amount: pack ? 480 : 20 }]),
      ]);
      await client.query('commit');
      return result.rows[0].id;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  };
  const results = await Promise.allSettled([sell(clients[0], true), sell(clients[1], false)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.match(rejected.reason.message, /insufficient_stock_at_location/);
  const state = (
    await clients[0].query(
      `select b.remaining,b.remaining_cost,
    (select coalesce(sum(l.cogs_total),0) from public.order_lines l join public.orders o on o.id=l.order_id where l.company_id=$1 and o.status='completed') cogs
    from public.inventory_batches b where b.company_id=$1`,
      [companyId]
    )
  ).rows[0];
  assert.ok([0, 29].includes(Number(state.remaining)));
  assert.equal(Number(state.remaining_cost) + Number(state.cogs), 425);
  console.log(
    'pack concurrency: pieces and packs compete for one stock balance; cost is conserved'
  );

  // Leave enough stock for each rollback-only checkout scenario below.
  await clients[0].query(
    'insert into public.inventory_batches(company_id,variant_id,quantity,remaining,unit_cost) values($1,$2,60,60,14)',
    [companyId, variantId]
  );
  const locationId = (
    await clients[0].query(
      "select id from public.stock_locations where company_id=$1 and code='MAIN'",
      [companyId]
    )
  ).rows[0].id;
  const saleLines = JSON.stringify([
    { variant_id: variantId, pack_id: packId, quantity: 1, units_per_unit: 30 },
  ]);
  const salePayments = JSON.stringify([{ method: 'cash', amount: 480 }]);
  const beginSaleTest = async client => {
    await client.query('begin');
    await client.query("set local statement_timeout='10s'");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: userId,
        role: 'authenticated',
        company_id: companyId,
        user_role: 'Admin',
      }),
    ]);
  };
  const waitForAdvisory = async (pid, label) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await pool.query(
        "select wait_event='advisory' waiting from pg_stat_activity where pid=$1",
        [pid]
      );
      if (result.rows[0]?.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail(`${label} must wait before locking rows or writing the catalog journal`);
  };
  await beginSaleTest(clients[0]);
  const saleDraftId = (
    await clients[0].query('select public.save_draft(null,$1::jsonb) id', [saleLines])
  ).rows[0].id;
  await clients[0].query('commit');
  const saleScenarios = [
    {
      name: 'pack checkout',
      sql: 'select public.post_sale(null,$1::jsonb,$2::jsonb) id',
      args: [saleLines, salePayments],
    },
    {
      name: 'base-unit checkout',
      sql: 'select public.post_sale(null,$1::jsonb,$2::jsonb) id',
      args: [
        JSON.stringify([{ variant_id: variantId, quantity: 1 }]),
        JSON.stringify([{ method: 'cash', amount: 20 }]),
      ],
    },
    {
      name: 'held checkout',
      sql: 'select public.post_sale(null,$1::jsonb,$2::jsonb,p_draft_id=>$3) id',
      args: [saleLines, salePayments, saleDraftId],
    },
    {
      name: 'offline held checkout',
      sql: 'select public.post_offline_sale_at_location($1,null,$2::jsonb,$3::jsonb,$4,now(),$5,p_draft_id=>$6) id',
      args: [
        locationId,
        saleLines,
        salePayments,
        crypto.randomUUID(),
        'pack-lock-test',
        saleDraftId,
      ],
    },
    {
      name: 'edit held sale',
      sql: 'select public.save_draft(null,$1::jsonb,$2) id',
      args: [saleLines, saleDraftId],
    },
  ];
  for (const scenario of saleScenarios) {
    for (const client of clients) await beginSaleTest(client);
    await clients[1].query(
      "select pg_advisory_xact_lock(hashtextextended('catalog-units:'||$1,0))",
      [companyId]
    );
    const pid = (await clients[0].query('select pg_backend_pid() pid')).rows[0].pid;
    await clients[0].query('set local role authenticated');
    const pending = (async () => {
      try {
        return { result: await clients[0].query(scenario.sql, scenario.args), error: null };
      } catch (error) {
        return { result: null, error };
      } finally {
        await clients[0].query('rollback');
      }
    })();
    await waitForAdvisory(pid, scenario.name);
    // In particular, prepare_sale_order_core must wait before locking its source draft.
    await clients[1].query('select id from public.orders where id=$1 for update nowait', [
      saleDraftId,
    ]);
    await clients[1].query('select id from public.product_variants where id=$1 for update nowait', [
      variantId,
    ]);
    await clients[1].query('select id from public.variant_packs where id=$1 for update nowait', [
      packId,
    ]);
    await clients[1].query('select public.update_catalog_product($1,$2,$3::jsonb)', [
      productId,
      `Race eggs: ${scenario.name}`,
      JSON.stringify([{ variant_id: variantId, price: 20 }]),
    ]);
    await clients[1].query('rollback');
    const result = await pending;
    assert.equal(result.error, null, scenario.name);
    assert.ok(result.result.rows[0].id, scenario.name);
  }

  // Reverse the overlap: pause a sale after unit resolution and draft creation.
  // Catalog writers must wait before taking either the journal or variant locks.
  // A second sale can still resolve units while the first holds its shared lock.
  for (const legacyWriter of [false, true]) {
    for (const client of clients) await beginSaleTest(client);
    const clientRef = crypto.randomUUID();
    await clients[0].query('select public.prepare_sale_order_core(null,$1::jsonb,$2)', [
      saleLines,
      clientRef,
    ]);
    await clients[1].query("set local lock_timeout='1s'");
    await clients[1].query('select public.resolve_sale_units($1::jsonb)', [saleLines]);
    await clients[1].query('rollback');
    await beginSaleTest(clients[1]);
    const pid = (await clients[1].query('select pg_backend_pid() pid')).rows[0].pid;
    const pending = (async () => {
      try {
        return {
          result: await clients[1].query(
            legacyWriter
              ? 'select public.upsert_variant($1,$2,20,p_variant_id=>$3) id'
              : 'select public.save_catalog_product_units($1::jsonb,$2::jsonb,$3) id',
            legacyWriter
              ? [productId, 'Default', variantId]
              : [
                  JSON.stringify({ product_id: productId, name: 'Race eggs edited' }),
                  JSON.stringify([
                    {
                      variant_id: variantId,
                      price: 20,
                      stock_unit: 'egg',
                      packs: [
                        {
                          id: packId,
                          name: 'Tray',
                          units_per_pack: 30,
                          sale_price: 480,
                          active: true,
                        },
                      ],
                    },
                  ]),
                  crypto.randomUUID(),
                ]
          ),
          error: null,
        };
      } catch (error) {
        return { result: null, error };
      } finally {
        await clients[1].query('rollback');
      }
    })();
    await waitForAdvisory(pid, legacyWriter ? 'legacy catalog writer' : 'pack editor');
    await clients[0].query('select public.post_sale(null,$1::jsonb,$2::jsonb,p_client_ref=>$3)', [
      saleLines,
      salePayments,
      clientRef,
    ]);
    await clients[0].query('rollback');
    const result = await pending;
    assert.equal(result.error, null, 'catalog writer completes after the sale');
    assert.ok(result.result.rows[0].id);
  }
  console.log(
    'pack concurrency: sales, held drafts, offline replay and catalog edits use a consistent lock order'
  );

  // Purchases and drafts must wait before holding variant/pack rows, including
  // stock-only receipts. The catalog editor also writes the stock cache journal.
  await clients[0].query('reset role');
  const supplierId = crypto.randomUUID();
  await clients[0].query(
    `insert into public.customers(id,company_id,first_name,is_supplier,supplier_credit_limit)
     values($1,$2,'Lock order supplier',true,100000)`,
    [supplierId, companyId]
  );
  const purchaseLines = (changes = {}) =>
    JSON.stringify([
      {
        variant_id: variantId,
        pack_id: packId,
        units_per_unit: changes.pack_id === null ? 1 : 30,
        quantity: 1,
        unit_cost: 400,
        ...changes,
      },
    ]);
  await clients[0].query('begin');
  await clients[0].query('select testkit.as_user($1,$2,$3)', [companyId, userId, 'Admin']);
  const draftId = (
    await clients[0].query('select public.save_purchase_workspace_draft($1,$2::jsonb) id', [
      supplierId,
      purchaseLines(),
    ])
  ).rows[0].id;
  await clients[0].query('commit');
  const scenarios = [
    { name: 'pack price update', changes: { new_pack_sale_price: 490 } },
    { name: 'retail price update', changes: { new_retail_price: 21 } },
    { name: 'pack receipt without price changes', changes: {} },
    { name: 'base-unit receipt without price changes', changes: { pack_id: null } },
    { name: 'save purchase draft', operation: 'save' },
    { name: 'edit saved purchase draft', operation: 'edit' },
    { name: 'finalize saved purchase draft', operation: 'finalize' },
  ];
  for (const scenario of scenarios) {
    for (const client of clients) {
      await client.query('begin');
      await client.query("set local statement_timeout='10s'");
      await client.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: userId,
          role: 'authenticated',
          company_id: companyId,
          user_role: 'Admin',
        }),
      ]);
    }
    await clients[1].query(
      "select pg_advisory_xact_lock(hashtextextended('catalog-units:'||$1,0))",
      [companyId]
    );
    const purchasePid = (await clients[0].query('select pg_backend_pid() pid')).rows[0].pid;
    await clients[0].query('set local role authenticated');
    const purchase = (async () => {
      try {
        const result =
          scenario.operation === 'finalize'
            ? await clients[0].query('select public.finalize_purchase_draft($1) id', [draftId])
            : scenario.operation === 'edit'
              ? await clients[0].query(
                  'select public.save_purchase_workspace_draft($1,$2::jsonb,p_draft_id=>$3) id',
                  [supplierId, purchaseLines(), draftId]
                )
              : await clients[0].query(
                  scenario.operation === 'save'
                    ? 'select public.save_purchase_workspace_draft($1,$2::jsonb) id'
                    : "select public.record_purchase_complete($1,$2::jsonb,'[]'::jsonb,0) id",
                  [supplierId, purchaseLines(scenario.changes)]
                );
        // Posting completed; roll back this fixture so immutable purchase tax
        // snapshots do not prevent the company's cleanup below.
        await clients[0].query('rollback');
        return { id: result.rows[0].id, error: null };
      } catch (error) {
        await clients[0].query('rollback');
        return { id: null, error };
      }
    })();
    let waiting = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const state = await pool.query(
        "select wait_event='advisory' waiting from pg_stat_activity where pid=$1",
        [purchasePid]
      );
      if (state.rows[0]?.waiting) {
        waiting = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(waiting, `${scenario.name} waits for the catalog advisory lock`);
    await clients[1].query('select id from public.purchase_drafts where id=$1 for update nowait', [
      draftId,
    ]);
    await clients[1].query(`select public.save_catalog_product_units($1::jsonb,$2::jsonb,$3)`, [
      JSON.stringify({ product_id: productId, name: `Race eggs: ${scenario.name}` }),
      JSON.stringify([
        {
          variant_id: variantId,
          price: 20,
          wholesale_price: 17,
          sku: `RACE-${variantId}`,
          stock_unit: 'egg',
          packs: [{ id: packId, name: 'Tray', units_per_pack: 30, sale_price: 480, active: true }],
        },
      ]),
      crypto.randomUUID(),
    ]);
    await clients[1].query('commit');
    const result = await purchase;
    assert.equal(result.error, null, scenario.name);
    assert.ok(result.id, `${scenario.name} and catalog edit both complete`);
  }
  console.log(
    'pack concurrency: catalog edits serialize with all purchase, draft, and finalization paths'
  );
} finally {
  for (const client of clients) await client.query('rollback').catch(() => undefined);
  await clients[0].query('reset role').catch(() => undefined);
  if (companyId) {
    await clients[0].query('begin');
    await clients[0].query("select set_config('app.allow_ledger_mutation','on',true)");
    await clients[0].query('delete from public.companies where id=$1', [companyId]);
    await clients[0].query('commit');
  }
  await clients[0].query('delete from auth.users where id=$1', [userId]);
  clients.forEach(client => client.release());
  await pool.end();
}
