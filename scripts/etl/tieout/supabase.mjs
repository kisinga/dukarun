// TIE-OUT driver: Supabase (new) backend. Runs the canonical op sequence a-j
// against the freshly provisioned "TieOut Co" company and captures ledger
// journals per op. Writes out/supabase.json.
// Usage: node scripts/etl/tieout/supabase.mjs
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const COMPANY_ID = '22ea6e9e-9794-4f67-9cc9-8f87f57e80d3'; // TieOut Co (fresh)
const TOKEN = fs.readFileSync('/tmp/sb-tok.txt', 'utf8').trim();
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });

const db = new pg.Client('postgres://postgres:postgres@127.0.0.1:54322/postgres');
await db.connect();

async function rpc(name, payload = {}) {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${name} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

// --- journal capture -------------------------------------------------------
const seen = new Set(
  (await db.query('select id from ledger_journal_entries where company_id=$1', [COMPANY_ID])).rows.map(r => r.id)
);
async function capture(op) {
  const { rows } = await db.query(
    `select e.id, e.source_type, e.source_id, e.entry_date, e.memo, a.code as account, l.debit::text, l.credit::text
     from ledger_journal_entries e
     join ledger_journal_lines l on l.entry_id = e.id
     join ledger_accounts a on a.id = l.account_id
     where e.company_id = $1
     order by e.posted_at, e.id, a.code`,
    [COMPANY_ID]
  );
  const fresh = rows.filter(r => !seen.has(r.id));
  fresh.forEach(r => seen.add(r.id));
  const entries = {};
  for (const r of fresh) {
    entries[r.id] ??= {
      id: r.id, sourceType: r.source_type, sourceId: r.source_id, entryDate: r.entry_date, memo: r.memo, lines: [],
    };
    entries[r.id].lines.push({ account: r.account, debit: Number(r.debit), credit: Number(r.credit) });
  }
  return { op, entries: Object.values(entries) };
}

async function balances() {
  const { rows } = await db.query(
    `select a.code, coalesce(sum(l.debit - l.credit),0)::text as bal
     from ledger_accounts a
     left join ledger_journal_lines l on l.account_id = a.id
     where a.company_id = $1 and a.code in ('CASH_ON_HAND','CLEARING_MPESA')
     group by a.code`,
    [COMPANY_ID]
  );
  return Object.fromEntries(rows.map(r => [r.code, Number(r.bal)]));
}

const out = { system: 'supabase', companyId: COMPANY_ID, ops: [] };
const fixture = {};

// --- fixture ---------------------------------------------------------------
{
  fixture.productWidget = await rpc('create_product_with_variants', {
    p_name: 'TieOut Widget', p_variants: [{ price: 20000, sku: 'TIE-W1' }],
  });
  fixture.productService = await rpc('create_product_with_variants', {
    p_name: 'TieOut Service', p_variants: [{ price: 5000, sku: 'TIE-S1', kind: 'service' }],
  });
  const { rows: vs } = await db.query(
    `select v.id, v.sku from product_variants v where v.company_id=$1`, [COMPANY_ID]);
  fixture.variantWidget = vs.find(v => v.sku === 'TIE-W1').id;
  fixture.variantService = vs.find(v => v.sku === 'TIE-S1').id;

  fixture.customerId = await rpc('create_customer', {
    p_first_name: 'Tie', p_last_name: 'Customer', p_phone: '+254722000001',
  });
  await rpc('update_customer_credit', {
    p_customer_id: fixture.customerId, p_credit_limit: 100000000, p_is_approved: true, p_terms_days: 30,
  });
  fixture.supplierId = await rpc('create_customer', {
    p_first_name: 'Tie', p_last_name: 'Supplier', p_phone: '+254722000002', p_is_supplier: true,
  });

  out.fixture = fixture;
  out.ops.push(await capture('fixture'));
}

// --- session open -----------------------------------------------------------
{
  const bal = await balances();
  fixture.sessionId = await rpc('open_cashier_session', {
    p_declarations: [
      // Opening float 500000 over ledger -> identical VarianceAdjustment overage both systems
      { account_code: 'CASH_ON_HAND', declared: (bal.CASH_ON_HAND ?? 0) + 500000 },
      { account_code: 'CLEARING_MPESA', declared: bal.CLEARING_MPESA ?? 0 },
    ],
  });
  out.ops.push(await capture('i1-session-open'));
}

// --- a. purchase batches (credit + immediate full payment, mirrors Vendure) -
for (const [qty, cost] of [[10, 10000], [10, 15000]]) {
  await rpc('record_purchase', {
    p_supplier_id: fixture.supplierId,
    p_lines: [{ variant_id: fixture.variantWidget, quantity: qty, unit_cost: cost }],
    p_is_credit: true,
  });
  await rpc('pay_supplier', {
    p_supplier_id: fixture.supplierId, p_amount: qty * cost, p_account_code: 'CASH_ON_HAND',
  });
}
out.ops.push(await capture('a-purchase-batches'));

// --- b. cash sale 12@20000 + 1 service @5000 = 245000, split 200000/45000 ---
{
  fixture.orderB = await rpc('post_sale', {
    p_customer_id: null,
    p_lines: [
      { variant_id: fixture.variantWidget, quantity: 12, unit_price: 20000 },
      { variant_id: fixture.variantService, quantity: 1, unit_price: 5000 },
    ],
    p_payments: [
      { method: 'cash', amount: 200000 },
      { method: 'mpesa', amount: 45000 },
    ],
    p_client_ref: crypto.randomUUID(),
  });
  out.ops.push(await capture('b-cash-sale-split'));
}

// --- c. credit sale 2 service units @5000 -----------------------------------
{
  fixture.orderC = await rpc('post_sale', {
    p_customer_id: fixture.customerId,
    p_lines: [{ variant_id: fixture.variantService, quantity: 2, unit_price: 5000 }],
    p_payments: [],
    p_client_ref: crypto.randomUUID(),
  });
  out.ops.push(await capture('c-credit-sale'));
}

// --- d. AR repayment 3000 cash ----------------------------------------------
{
  await rpc('post_payment_allocation', {
    p_order_id: fixture.orderC, p_amount: 3000, p_method_code: 'cash',
  });
  out.ops.push(await capture('d-ar-repayment'));
}

// --- e. expense 5000 from CASH_ON_HAND --------------------------------------
{
  await rpc('post_expense', {
    p_amount: 5000, p_source_account_code: 'CASH_ON_HAND', p_category: 'operations', p_memo: 'tie-out expense',
  });
  out.ops.push(await capture('e-expense'));
}

// --- f. transfer CASH_ON_HAND -> BANK_MAIN 30000 fee 500 --------------------
{
  await rpc('post_transfer', {
    p_from_account_code: 'CASH_ON_HAND', p_to_account_code: 'BANK_MAIN',
    p_principal: 30000, p_fee: 500, p_transfer_id: `tieout-transfer-${Date.now()}`, p_memo: 'tie-out transfer',
  });
  out.ops.push(await capture('f-transfer'));
}

// --- g. credit purchase 8@9000 + supplier payment 36000 ---------------------
{
  fixture.purchaseG = await rpc('record_purchase', {
    p_supplier_id: fixture.supplierId,
    p_lines: [{ variant_id: fixture.variantWidget, quantity: 8, unit_cost: 9000 }],
    p_is_credit: true,
  });
  await rpc('pay_supplier', {
    p_supplier_id: fixture.supplierId, p_amount: 36000, p_account_code: 'CASH_ON_HAND',
  });
  out.ops.push(await capture('g-credit-purchase-and-payment'));
}

// --- h. write-off 1 unit damaged --------------------------------------------
{
  await rpc('post_inventory_write_off', {
    p_variant_id: fixture.variantWidget, p_quantity: 1, p_reason: 'damaged',
  });
  out.ops.push(await capture('h-write-off'));
}

// --- i. close session 1000 short --------------------------------------------
{
  const bal = await balances();
  await rpc('close_cashier_session', {
    p_session_id: fixture.sessionId,
    p_declarations: [
      { account_code: 'CASH_ON_HAND', declared: (bal.CASH_ON_HAND ?? 0) - 1000 },
      { account_code: 'CLEARING_MPESA', declared: bal.CLEARING_MPESA ?? 0 },
    ],
  });
  out.ops.push(await capture('i2-session-close-short'));
}

// --- j. void sale (b) --------------------------------------------------------
{
  fixture.voidResult = await rpc('void_sale', { p_order_id: fixture.orderB, p_reason: 'tie-out void' });
  out.ops.push(await capture('j-void-sale-b'));
}

fs.writeFileSync(path.join(OUT, 'supabase.json'), JSON.stringify(out, null, 2));
console.log('OK — wrote out/supabase.json with', out.ops.length, 'op captures');
await db.end();
