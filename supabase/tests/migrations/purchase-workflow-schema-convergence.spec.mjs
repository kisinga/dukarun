import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Pool } = pg;
const supabase = './node_modules/.bin/supabase';
const cliOptions = {
  cwd: process.cwd(),
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true' },
  stdio: 'inherit',
};

const migration =
  'supabase/migrations/20260821000005_0141_purchase_workflow_schema_convergence.sql';
const userId = 'a9400000-0000-4000-8000-000000000001';
const productId = 'a9400000-0000-4000-8000-000000000010';
const variantId = 'a9400000-0000-4000-8000-000000000020';
const supplierId = 'a9400000-0000-4000-8000-000000000030';
const legacySupplierId = 'a9400000-0000-4000-8000-000000000031';
const legacyNonClaimId = 'a9400000-0000-4000-8000-000000000040';
const legacyClaimId = 'a9400000-0000-4000-8000-000000000041';

function localDatabaseUrl() {
  const output = execFileSync(supabase, ['status', '-o', 'env'], {
    ...cliOptions,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = output.split('\n').find(value => value.startsWith('DB_URL='));
  if (!line) throw new Error('Local Supabase DB_URL unavailable. Run npm run sb:start first.');
  return line.slice('DB_URL='.length).replace(/^"|"$/g, '');
}

async function applyTargetMigration(pool) {
  const sql = readFileSync(migration, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function createFixture(pool) {
  const client = await pool.connect();
  try {
    await client.query(
      `insert into auth.users(
         id,instance_id,aud,role,email,phone,encrypted_password,
         confirmation_token,recovery_token,email_change,email_change_token_current,
         email_change_token_new,phone_change,phone_change_token,reauthentication_token,
         created_at,updated_at
       ) values(
         $1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         'purchase-migration@test.local',null,'','','','','','','','','',now(),now()
       )`,
      [userId]
    );
    await client.query(`select set_config('request.jwt.claims',$1,false)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const provisioned = await client.query(
      `select public.provision_company('Purchase migration test','Main','KES') company_id`
    );

    const companyId = provisioned.rows[0]?.company_id;
    assert.ok(companyId, 'fixture company was not provisioned');

    await client.query(
      `update public.companies
          set status='approved',subscription_status='active',
              subscription_started_at=coalesce(subscription_started_at,now()),
              subscription_expires_at=now()+interval '1 year',billing_cycle='yearly'
        where id=$1`,
      [companyId]
    );
    const location = await client.query(
      `select id from public.stock_locations
        where company_id=$1 and is_active
        order by is_default desc,created_at,id limit 1`,
      [companyId]
    );
    const locationId = location.rows[0]?.id;
    assert.ok(locationId, 'fixture stock location was not provisioned');
    await client.query(`select set_config('request.jwt.claims',$1,false)`, [
      JSON.stringify({
        sub: userId,
        role: 'authenticated',
        company_id: companyId,
        user_role: 'Admin',
      }),
    ]);
    await client.query(`select set_config('app.business_location_id',$1,false)`, [locationId]);

    await client.query(
      `insert into public.products(id,company_id,name,tax_category_id)
       values($1,$2,'Migration product',null)`,
      [productId, companyId]
    );
    await client.query(
      `insert into public.product_variants(
         id,product_id,company_id,name,sku,kind,price,wholesale_price,track_inventory
       ) values($1,$2,$3,'Default','MIGRATION-VAT','good',116,116,true)`,
      [variantId, productId, companyId]
    );
    await client.query(
      `update public.product_tax_treatment_versions
          set effective_from=now()-interval '1 day'
        where product_id=$1`,
      [productId]
    );
    await client.query(
      `insert into public.customers(
         id,company_id,first_name,is_supplier,supplier_credit_limit,tax_registration_number
       ) values
         ($1,$3,'Migration supplier',true,100000,'P009999999Z'),
         ($2,$3,'Historical supplier',true,100000,'P008888888Z')`,
      [supplierId, legacySupplierId, companyId]
    );

    // Seed legacy snapshot inputs without manufacturing unrelated historical
    // journals; the live RPC below separately proves current ledger integrity.
    await client.query(`set session_replication_role='replica'`);
    try {
      await client.query(
        `insert into public.purchases(
           id,company_id,supplier_id,reference,total_cost,goods_subtotal,is_credit,created_by,
           purchase_date,stock_location_id,gross_total,net_total,goods_net_total,input_tax_total,
           claim_input_vat,tax_snapshot_status
         ) values
           ($1,$3,$4,'LEGACY-NONCLAIM',116,116,true,$5,current_date,$6,116,116,116,0,false,'final'),
           ($2,$3,$4,'LEGACY-CLAIM',116,116,true,$5,current_date,$6,116,100,100,16,true,'final')`,
        [legacyNonClaimId, legacyClaimId, companyId, legacySupplierId, userId, locationId]
      );
    } finally {
      await client.query(`set session_replication_role='origin'`);
    }

    return { companyId, locationId };
  } finally {
    await client.query('reset role').catch(() => {});
    client.release();
  }
}

async function recordNonClaimPurchase(pool, fixture) {
  const client = await pool.connect();
  try {
    await client.query(`select set_config('request.jwt.claims',$1,false)`, [
      JSON.stringify({
        sub: userId,
        role: 'authenticated',
        company_id: fixture.companyId,
        user_role: 'Admin',
      }),
    ]);
    await client.query('set role authenticated');
    const result = await client.query(
      `select public.record_purchase_complete_with_tax(
         $1::uuid,$2::jsonb,'[]'::jsonb,0::bigint,'UPGRADE-NONCLAIM'::text,
         'CASH_ON_HAND'::text,null::text,current_date,$3::uuid,false,
         null::text,null::text,null::date
       ) purchase_id`,
      [
        supplierId,
        JSON.stringify([
          {
            variant_id: variantId,
            quantity: 1,
            unit_cost: 116,
            line_total: 116,
            value_source: 'unit',
            price_entry_basis: 'inclusive',
          },
        ]),
        fixture.locationId,
      ]
    );
    return result.rows[0]?.purchase_id;
  } finally {
    await client.query('reset role').catch(() => {});
    client.release();
  }
}

let databaseWasReset = false;
let pool;

try {
  execFileSync(
    supabase,
    ['db', 'reset', '--local', '--version', '20260821000004', '--no-seed', '--yes'],
    cliOptions
  );
  databaseWasReset = true;
  pool = new Pool({ connectionString: localDatabaseUrl(), max: 2 });

  const before = await pool.query(
    `select count(*)::int count
           from information_schema.columns
          where table_schema='public' and table_name='purchases'
            and column_name in ('invoice_net_total','invoice_tax_total')`
  );
  assert.equal(before.rows[0]?.count, 0, '0140 schema must reproduce the missing columns');

  const fixture = await createFixture(pool);
  await applyTargetMigration(pool);

  const columns = await pool.query(
    `select column_name,is_nullable,column_default
           from information_schema.columns
          where table_schema='public' and table_name='purchases'
            and column_name in ('invoice_net_total','invoice_tax_total')
          order by column_name`
  );
  assert.deepEqual(
    columns.rows,
    [
      { column_name: 'invoice_net_total', is_nullable: 'NO', column_default: '0' },
      { column_name: 'invoice_tax_total', is_nullable: 'NO', column_default: '0' },
    ],
    '0141 must install both non-null snapshot columns'
  );

  const backfill = await pool.query(
    `select reference,invoice_net_total::int,invoice_tax_total::int
           from public.purchases
          where id in ($1,$2)
          order by reference`,
    [legacyNonClaimId, legacyClaimId]
  );
  assert.deepEqual(backfill.rows, [
    { reference: 'LEGACY-CLAIM', invoice_net_total: 100, invoice_tax_total: 16 },
    { reference: 'LEGACY-NONCLAIM', invoice_net_total: 116, invoice_tax_total: 0 },
  ]);

  const historyColumns = await pool.query(
    `select count(*)::int count
           from information_schema.columns
          where table_schema='public' and table_name='purchase_history'
            and column_name in ('invoice_net_total','invoice_tax_total')`
  );
  assert.equal(historyColumns.rows[0]?.count, 2, 'purchase history must expose repaired snapshots');

  const purchaseId = await recordNonClaimPurchase(pool, fixture);
  assert.ok(purchaseId, 'public purchase RPC did not return a purchase');

  const purchase = await pool.query(
    `select gross_total::int,net_total::int,input_tax_total::int,
                invoice_net_total::int,invoice_tax_total::int,claim_input_vat,
                purchase_posting_version
           from public.purchases where id=$1`,
    [purchaseId]
  );
  assert.deepEqual(purchase.rows[0], {
    gross_total: 116,
    net_total: 116,
    input_tax_total: 0,
    invoice_net_total: 100,
    invoice_tax_total: 16,
    claim_input_vat: false,
    purchase_posting_version: 'ap_invoice_v2',
  });

  const inventory = await pool.query(
    `select l.tax_category_code,l.net_total::int,l.tax_total::int,
                b.original_cost::int,b.remaining_cost::int
           from public.purchase_lines l
           join public.inventory_batches b on b.id=l.inventory_batch_id
          where l.purchase_id=$1`,
    [purchaseId]
  );
  assert.deepEqual(inventory.rows[0], {
    tax_category_code: 'STANDARD',
    net_total: 100,
    tax_total: 16,
    original_cost: 116,
    remaining_cost: 116,
  });

  const journal = await pool.query(
    `select a.code,sum(l.debit)::int debit,sum(l.credit)::int credit
           from public.ledger_journal_entries e
           join public.ledger_journal_lines l on l.entry_id=e.id
           join public.ledger_accounts a on a.id=l.account_id
          where e.source_type='InventoryPurchase' and e.source_id=$1
          group by a.code order by a.code`,
    [purchaseId]
  );
  assert.deepEqual(journal.rows, [
    { code: 'ACCOUNTS_PAYABLE', debit: 0, credit: 116 },
    { code: 'INVENTORY', debit: 116, credit: 0 },
  ]);
  assert.equal(
    journal.rows.reduce((sum, line) => sum + line.debit, 0),
    journal.rows.reduce((sum, line) => sum + line.credit, 0),
    'purchase journal must balance'
  );
  console.log('purchase workflow convergence: exact migration and purchase ledger passed');
} finally {
  if (pool) await pool.end();
  if (databaseWasReset) {
    execFileSync(supabase, ['db', 'reset', '--local', '--yes'], cliOptions);
  }
}
