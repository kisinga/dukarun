// TIE-OUT: Supabase side. Creates a fresh auth user + company via provision_company,
// runs the shared operation sequence through RPCs, and dumps the resulting journal
// lines to scripts/etl/tie-out/out/supabase-journal.json.
//
// Usage: node scripts/etl/tie-out/supabase-run.mjs
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC } from './spec.mjs';

const API = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const RUN_ID = process.env.RUN_ID || `r${Date.now().toString(36)}`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });

const results = []; // { op, detail } log lines for the report
function log(op, msg) {
  results.push({ op, msg });
  console.log(`[${op}] ${msg}`);
}

async function rpc(token, fn, params) {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  // 1. Fresh auth user (email/password) so provision_company gets a pristine tenant.
  const email = `tieout-${RUN_ID}@tieout.local`;
  const password = 'tieout-password-123';
  const adminRes = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!adminRes.ok) throw new Error(`admin create user failed: ${await adminRes.text()}`);
  const authUser = await adminRes.json();
  log('fixture', `auth user ${authUser.id} (${email})`);

  const supa = createClient(API, ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await supa.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  // 2. Provision a fresh company, then refresh so JWT carries company_id/user_role.
  const token1 = (await supa.auth.getSession()).data.session.access_token;
  const newCompanyId = await rpc(token1, 'provision_company', {
    p_company_name: `TieOut Co ${RUN_ID}`,
    p_store_name: 'Main Store',
  });
  const { data: refreshed, error: refErr } = await supa.auth.refreshSession();
  if (refErr) throw refErr;
  const token = refreshed.session.access_token;
  log('fixture', `company ${newCompanyId} provisioned`);

  // Helper to read a REST table as the user
  async function rest(table, query) {
    const res = await fetch(`${API}/rest/v1/${table}?${query}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`REST ${table} failed: ${await res.text()}`);
    return res.json();
  }

  // 3. Fixture: products, customer (credit-approved), supplier.
  const goodsProductId = await rpc(token, 'create_product_with_variants', {
    p_name: SPEC.product.name,
    p_variants: [{ name: SPEC.product.variantName, price: SPEC.product.price, sku: SPEC.product.sku }],
  });
  const svcProductId = await rpc(token, 'create_product_with_variants', {
    p_name: SPEC.serviceProduct.name,
    p_variants: [
      { name: SPEC.serviceProduct.variantName, price: SPEC.serviceProduct.price, sku: SPEC.serviceProduct.sku, kind: 'service' },
    ],
  });
  const variants = await rest('product_variants', `product_id=in.(${goodsProductId},${svcProductId})&select=id,product_id,kind`);
  const goodsVariantId = variants.find(v => v.product_id === goodsProductId).id;
  const svcVariantId = variants.find(v => v.product_id === svcProductId).id;
  log('fixture', `variants goods=${goodsVariantId} service=${svcVariantId}`);

  const customerId = await rpc(token, 'create_customer', {
    p_first_name: SPEC.customer.firstName,
    p_last_name: SPEC.customer.lastName,
    p_phone: SPEC.customer.phone,
  });
  await rpc(token, 'update_customer_credit', {
    p_customer_id: customerId,
    p_credit_limit: SPEC.customer.creditLimit,
    p_is_approved: true,
  });
  const supplierId = await rpc(token, 'create_customer', {
    p_first_name: SPEC.supplier.firstName,
    p_last_name: SPEC.supplier.lastName,
    p_phone: SPEC.supplier.phone,
    p_is_supplier: true,
  });
  log('fixture', `customer=${customerId} supplier=${supplierId}`);

  // (a) two purchase batches, paid cash
  const p1 = await rpc(token, 'record_purchase', {
    p_supplier_id: supplierId,
    p_lines: [{ variant_id: goodsVariantId, quantity: SPEC.ops.a1.qty, unit_cost: SPEC.ops.a1.unitCost }],
    p_is_credit: false,
    p_reference: `tieout-a1-${RUN_ID}`,
    p_account_code: 'CASH_ON_HAND',
  });
  log('a1', `purchase ${p1}`);
  const p2 = await rpc(token, 'record_purchase', {
    p_supplier_id: supplierId,
    p_lines: [{ variant_id: goodsVariantId, quantity: SPEC.ops.a2.qty, unit_cost: SPEC.ops.a2.unitCost }],
    p_is_credit: false,
    p_reference: `tieout-a2-${RUN_ID}`,
    p_account_code: 'CASH_ON_HAND',
  });
  log('a2', `purchase ${p2}`);

  // (b) cash sale, split payment
  const saleB = await rpc(token, 'post_sale', {
    p_customer_id: null,
    p_lines: [{ variant_id: goodsVariantId, quantity: SPEC.ops.b.qty, unit_price: SPEC.ops.b.unitPrice }],
    p_payments: SPEC.ops.b.payments,
    p_client_ref: `tieout-b-${RUN_ID}`,
  });
  log('b', `order ${saleB}`);

  // (c) credit sale of service to approved customer
  const saleC = await rpc(token, 'post_sale', {
    p_customer_id: customerId,
    p_lines: [{ variant_id: svcVariantId, quantity: SPEC.ops.c.qty, unit_price: SPEC.ops.c.unitPrice }],
    p_payments: [],
    p_client_ref: `tieout-c-${RUN_ID}`,
  });
  log('c', `order ${saleC}`);

  // (d) AR repayment on the credit order
  const payD = await rpc(token, 'post_payment_allocation', {
    p_order_id: saleC,
    p_amount: SPEC.ops.d.amount,
    p_method_code: SPEC.ops.d.method,
    p_reference: `tieout-d-${RUN_ID}`,
  });
  log('d', `payment ${payD}`);

  // (e) expense from CASH_ON_HAND
  const expE = await rpc(token, 'post_expense', {
    p_amount: SPEC.ops.e.amount,
    p_source_account_code: SPEC.ops.e.account,
    p_category: SPEC.ops.e.category,
    p_memo: `tieout-e-${RUN_ID}`,
  });
  log('e', `expense entry ${expE}`);

  // cashier session OPEN (before transfer, mirroring Vendure's open-session requirement)
  const bal = async code => Number(await rpc(token, 'account_balance', { p_company_id: newCompanyId, p_code: code }));
  const openDecl = [
    { account_code: 'CASH_ON_HAND', declared: await bal('CASH_ON_HAND') },
    { account_code: 'CLEARING_MPESA', declared: await bal('CLEARING_MPESA') },
  ];
  const sessionId = await rpc(token, 'open_cashier_session', { p_declarations: openDecl });
  log('i(open)', `session ${sessionId} opened, declarations ${JSON.stringify(openDecl)}`);

  // (f) transfer with fee
  const xferF = await rpc(token, 'post_transfer', {
    p_from_account_code: SPEC.ops.f.from,
    p_to_account_code: SPEC.ops.f.to,
    p_principal: SPEC.ops.f.principal,
    p_fee: SPEC.ops.f.fee,
    p_transfer_id: `tieout-f-${RUN_ID}`,
    p_memo: 'tie-out transfer',
  });
  log('f', `transfer entry ${xferF}`);

  // (g) credit purchase + supplier payment
  const p3 = await rpc(token, 'record_purchase', {
    p_supplier_id: supplierId,
    p_lines: [{ variant_id: goodsVariantId, quantity: SPEC.ops.g.qty, unit_cost: SPEC.ops.g.unitCost }],
    p_is_credit: true,
    p_reference: `tieout-g-${RUN_ID}`,
  });
  log('g', `credit purchase ${p3}`);
  const supPay = await rpc(token, 'pay_supplier', {
    p_supplier_id: supplierId,
    p_amount: SPEC.ops.g.payment,
    p_account_code: SPEC.ops.g.account,
  });
  log('g', `supplier payment ${supPay}`);

  // (h) write-off 1 unit damaged
  const woH = await rpc(token, 'post_inventory_write_off', {
    p_variant_id: goodsVariantId,
    p_quantity: SPEC.ops.h.qty,
    p_reason: SPEC.ops.h.reason,
  });
  log('h', `write-off entry ${woH}`);

  // (i) close session with declared cash 1000 short
  const cashExpected = await bal('CASH_ON_HAND');
  const mpesaExpected = await bal('CLEARING_MPESA');
  const closeDecl = [
    { account_code: 'CASH_ON_HAND', declared: cashExpected - SPEC.ops.i.shortBy },
    { account_code: 'CLEARING_MPESA', declared: mpesaExpected },
  ];
  await rpc(token, 'close_cashier_session', { p_session_id: sessionId, p_declarations: closeDecl });
  log('i(close)', `closed; cash expected ${cashExpected}, declared ${cashExpected - SPEC.ops.i.shortBy}`);

  // (j) void sale (b)
  const voidRes = await rpc(token, 'void_sale', { p_order_id: saleB, p_reason: 'tie-out void' });
  log('j', `void result ${JSON.stringify(voidRes)}`);

  // 4. Dump the company journal.
  const client = new pg.Client(DB_URL);
  await client.connect();
  const { rows } = await client.query(
    `select e.source_type, e.source_id, e.entry_date, e.reversal_of, a.code as account_code,
            l.debit::text, l.credit::text, l.order_id, l.meta
       from ledger_journal_entries e
       join ledger_journal_lines l on l.entry_id = e.id
       join ledger_accounts a on a.id = l.account_id
      where e.company_id = $1
      order by e.posted_at, e.id, a.code`,
    [newCompanyId]
  );
  await client.end();
  writeFileSync(
    join(OUT, 'supabase-journal.json'),
    JSON.stringify({ runId: RUN_ID, companyId: newCompanyId, ops: { saleB, saleC, p1, p2, p3, sessionId }, lines: rows, log: results }, null, 2)
  );
  log('dump', `${rows.length} journal lines written to out/supabase-journal.json`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
