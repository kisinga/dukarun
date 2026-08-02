// TIE-OUT driver: Vendure (old) backend. Runs the canonical op sequence a-j
// on channel 2 and captures ledger journals per op. Writes out/vendure.json.
// Usage: node scripts/etl/tieout/vendure.mjs
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://localhost:3000/admin-api';
const CHANNEL_TOKEN = 'tieout-9160';
const CHANNEL_ID = 8;
const STOCK_LOCATION_ID = '2';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });

const db = new pg.Client('postgres://vendure:changeme-secure-password@localhost:5432/vendure');
await db.connect();

let bearer = '';
async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'vendure-token': CHANNEL_TOKEN,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const authTok = res.headers.get('vendure-auth-token');
  if (authTok) bearer = authTok;
  const body = await res.json();
  if (body.errors) throw new Error('GQL: ' + JSON.stringify(body.errors));
  return body.data;
}

// --- journal capture -------------------------------------------------------
const seen = new Set(
  (await db.query('select id from ledger_journal_entry where "channelId"=$1', [CHANNEL_ID])).rows.map(
    r => r.id
  )
);
async function capture(op) {
  const { rows } = await db.query(
    `select e.id, e."sourceType", e."sourceId", e."entryDate", e.memo, a.code as account, l.debit::text, l.credit::text
     from ledger_journal_entry e
     join ledger_journal_line l on l."entryId" = e.id
     join ledger_account a on a.id = l."accountId"
     where e."channelId" = $1
     order by e."postedAt", e.id, a.code`,
    [CHANNEL_ID]
  );
  const fresh = rows.filter(r => !seen.has(r.id));
  fresh.forEach(r => seen.add(r.id));
  const entries = {};
  for (const r of fresh) {
    entries[r.id] ??= {
      id: r.id, sourceType: r.sourceType, sourceId: r.sourceId, entryDate: r.entryDate, memo: r.memo, lines: [],
    };
    entries[r.id].lines.push({ account: r.account, debit: Number(r.debit), credit: Number(r.credit) });
  }
  return { op, entries: Object.values(entries) };
}

async function balances() {
  const { rows } = await db.query(
    `select a.code, coalesce(sum(l.debit - l.credit),0)::text as bal
     from ledger_account a
     left join ledger_journal_line l on l."accountId" = a.id
     where a."channelId" = $1 and a.code in ('CASH_ON_HAND','CLEARING_MPESA')
     group by a.code`,
    [CHANNEL_ID]
  );
  return Object.fromEntries(rows.map(r => [r.code, Number(r.bal)]));
}

const out = { system: 'vendure', channelId: CHANNEL_ID, ops: [] };
const ts = Date.now();
const nairobiDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

// --- auth ------------------------------------------------------------------
await gql(`mutation { login(username:"superadmin", password:"changeme-secure-password") {
  ... on CurrentUser { id } ... on ErrorResult { errorCode message } } }`);

// --- pre: close any lingering open session with exact declarations ---------
{
  const { rows } = await db.query(
    `select id from cashier_session where "channelId"=$1 and status='open'`, [CHANNEL_ID]);
  for (const s of rows) {
    const bal = await balances();
    await gql(`mutation($input: CloseCashierSessionInput!) { closeCashierSession(input:$input) { sessionId status } }`, {
      input: {
        sessionId: s.id,
        closingBalances: [
          { accountCode: 'CASH_ON_HAND', amountCents: bal.CASH_ON_HAND ?? 0 },
          { accountCode: 'CLEARING_MPESA', amountCents: bal.CLEARING_MPESA ?? 0 },
        ],
        notes: 'tie-out pre-close',
      },
    });
  }
  out.ops.push(await capture('pre-close-lingering-session'));
}

// --- fixture ---------------------------------------------------------------
const fixture = {};
{
  const p1 = await gql(
    `mutation($input: CreateProductInput!) { createProduct(input:$input) { id } }`,
    { input: { translations: [{ languageCode: 'en', name: 'TieOut Widget', slug: `tieout-widget-${ts}`, description: '' }] } }
  );
  const v1 = await gql(
    `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input:$input) { id sku } }`,
    { input: [{ productId: p1.createProduct.id, translations: [{ languageCode: 'en', name: 'Widget' }],
      sku: `TIE-W1-${ts}`, price: 20000, stockLevels: [{ stockLocationId: STOCK_LOCATION_ID, stockOnHand: 0 }] }] }
  );
  fixture.variantWidget = v1.createProductVariants[0].id;

  const p2 = await gql(
    `mutation($input: CreateProductInput!) { createProduct(input:$input) { id } }`,
    { input: { translations: [{ languageCode: 'en', name: 'TieOut Service', slug: `tieout-service-${ts}`, description: '' }] } }
  );
  const v2 = await gql(
    `mutation($input: [CreateProductVariantInput!]!) { createProductVariants(input:$input) { id sku } }`,
    { input: [{ productId: p2.createProduct.id, translations: [{ languageCode: 'en', name: 'Service' }],
      sku: `TIE-S1-${ts}`, price: 5000, trackInventory: 'FALSE',
      stockLevels: [{ stockLocationId: STOCK_LOCATION_ID, stockOnHand: 0 }] }] }
  );
  fixture.variantService = v2.createProductVariants[0].id;

  const cust = await gql(
    `mutation($input: CreateCustomerInput!) { createCustomerSafe(input:$input, isWalkIn:false) { id } }`,
    { input: { firstName: 'Tie', lastName: 'Customer', phoneNumber: `+25472${String(ts).slice(-7)}`, emailAddress: `tie-cust-${ts}@example.com` } }
  );
  fixture.customerId = cust.createCustomerSafe.id;
  await gql(`mutation($input: ApproveCustomerCreditInput!) { approveCustomerCredit(input:$input) { customerId } }`,
    { input: { customerId: fixture.customerId, approved: true, creditLimit: 100000000, creditDuration: 30 } });

  const sup = await gql(
    `mutation($input: CreateCustomerInput!) { createCustomerSafe(input:$input, isWalkIn:false) { id } }`,
    { input: { firstName: 'Tie', lastName: 'Supplier', phoneNumber: `+25473${String(ts).slice(-7)}`, emailAddress: `tie-sup-${ts}@example.com`,
      customFields: { isSupplier: true } } }
  );
  fixture.supplierId = sup.createCustomerSafe.id;
  await gql(`mutation($input: ApproveSupplierCreditInput!) { approveSupplierCredit(input:$input) { supplierId } }`,
    { input: { supplierId: fixture.supplierId, approved: true, supplierCreditLimit: 100000000, supplierCreditDuration: 30 } });

  out.fixture = fixture;
  out.ops.push(await capture('fixture'));
}

// --- session open (needed for b, d, f) --------------------------------------
{
  const bal = await balances();
  const r = await gql(`mutation($input: OpenCashierSessionInput!) { openCashierSession(input:$input) { id status } }`, {
    input: { channelId: CHANNEL_ID, openingBalances: [
      // Opening float 500000 over ledger -> identical VarianceAdjustment overage both systems
      { accountCode: 'CASH_ON_HAND', amountCents: (bal.CASH_ON_HAND ?? 0) + 500000 },
      { accountCode: 'CLEARING_MPESA', amountCents: bal.CLEARING_MPESA ?? 0 },
    ] },
  });
  fixture.sessionId = r.openCashierSession.id;
  out.ops.push(await capture('i1-session-open'));
}

// --- a. purchase batches 10@10000 + 10@15000 (fully paid inline) ------------
for (const [qty, cost] of [[10, 10000], [10, 15000]]) {
  await gql(`mutation($input: RecordPurchaseInput!) { recordPurchase(input:$input) { id } }`, {
    input: {
      supplierId: fixture.supplierId,
      purchaseDate: new Date().toISOString(),
      paymentStatus: 'paid',
      lines: [{ variantId: fixture.variantWidget, quantity: qty, unitCost: cost, stockLocationId: STOCK_LOCATION_ID }],
      payment: { amount: qty * cost, debitAccountCode: 'CASH_ON_HAND' },
    },
  });
}
out.ops.push(await capture('a-purchase-batches'));

// --- b. cash sale 12@20000 + 1 service @5000 = 245000, split 200000/45000 ---
{
  const order = await gql(`mutation($input: CreateOrderInput!) { createOrder(input:$input) { id code } }`, {
    input: {
      cartItems: [
        { variantId: fixture.variantWidget, quantity: 12, customLinePrice: 240000 },
        { variantId: fixture.variantService, quantity: 1, customLinePrice: 5000 },
      ],
      paymentMethodCode: 'cash',
      isCashierFlow: true,
    },
  });
  fixture.orderB = order.createOrder.id;
  await gql(`mutation($input: SettleOrderPaymentsInput!) { settleOrderPayments(input:$input) { orderId } }`, {
    input: {
      orderId: fixture.orderB,
      tenders: [
        { paymentMethodCode: 'cash', amount: 200000 },
        { paymentMethodCode: 'mpesa', amount: 45000 },
      ],
    },
  });
  out.ops.push(await capture('b-cash-sale-split'));
}

// --- c. credit sale 2 service units @5000 -----------------------------------
{
  const order = await gql(`mutation($input: CreateOrderInput!) { createOrder(input:$input) { id code } }`, {
    input: {
      cartItems: [{ variantId: fixture.variantService, quantity: 2, customLinePrice: 10000 }],
      paymentMethodCode: 'credit',
      customerId: fixture.customerId,
      isCreditSale: true,
    },
  });
  fixture.orderC = order.createOrder.id;
  out.ops.push(await capture('c-credit-sale'));
}

// --- d. AR repayment 3000 cash ----------------------------------------------
{
  await gql(`mutation($input: RecordPaymentInput!) { recordPayment(input:$input) { ordersPaid { orderId } } }`, {
    input: { customerId: fixture.customerId, paymentAmount: 3000, paymentMethodCode: 'cash', orderId: fixture.orderC },
  });
  out.ops.push(await capture('d-ar-repayment'));
}

// --- e. expense 5000 from CASH_ON_HAND --------------------------------------
{
  await gql(`mutation($input: RecordExpenseInput!) { recordExpense(input:$input) { sourceId } }`, {
    input: { amount: 5000, sourceAccountCode: 'CASH_ON_HAND', category: 'operations', memo: 'tie-out expense' },
  });
  out.ops.push(await capture('e-expense'));
}

// --- f. transfer CASH_ON_HAND -> BANK_MAIN 30000 fee 500 --------------------
{
  await gql(`mutation($input: InterAccountTransferInput!) { createInterAccountTransfer(input:$input) { id } }`, {
    input: {
      channelId: CHANNEL_ID,
      transferId: `tieout-transfer-${ts}`,
      fromAccountCode: 'CASH_ON_HAND',
      toAccountCode: 'BANK_MAIN',
      amount: '30000',
      entryDate: nairobiDate,
      feeAmount: '500',
      memo: 'tie-out transfer',
    },
  });
  out.ops.push(await capture('f-transfer'));
}

// --- g. credit purchase 8@9000 + supplier payment 36000 ---------------------
{
  const p = await gql(`mutation($input: RecordPurchaseInput!) { recordPurchase(input:$input) { id } }`, {
    input: {
      supplierId: fixture.supplierId,
      purchaseDate: new Date().toISOString(),
      paymentStatus: 'unpaid',
      lines: [{ variantId: fixture.variantWidget, quantity: 8, unitCost: 9000, stockLocationId: STOCK_LOCATION_ID }],
    },
  });
  fixture.purchaseG = p.recordPurchase.id;
  await gql(`mutation($input: PaySinglePurchaseInput!) { paySinglePurchase(input:$input) { purchaseId } }`, {
    input: { purchaseId: fixture.purchaseG, paymentAmount: 36000, debitAccountCode: 'CASH_ON_HAND' },
  });
  out.ops.push(await capture('g-credit-purchase-and-payment'));
}

// --- h. write-off 1 unit damaged --------------------------------------------
{
  await gql(`mutation($input: RecordStockAdjustmentInput!) { recordStockAdjustment(input:$input) { id } }`, {
    input: {
      reason: 'damaged',
      lines: [{ variantId: fixture.variantWidget, quantityChange: -1, stockLocationId: STOCK_LOCATION_ID }],
    },
  });
  out.ops.push(await capture('h-write-off'));
}

// --- i. close session 1000 short --------------------------------------------
{
  const bal = await balances();
  await gql(`mutation($input: CloseCashierSessionInput!) { closeCashierSession(input:$input) { sessionId status } }`, {
    input: {
      sessionId: fixture.sessionId,
      closingBalances: [
        { accountCode: 'CASH_ON_HAND', amountCents: (bal.CASH_ON_HAND ?? 0) - 1000 },
        { accountCode: 'CLEARING_MPESA', amountCents: bal.CLEARING_MPESA ?? 0 },
      ],
      notes: 'tie-out close 1000 short',
    },
  });
  out.ops.push(await capture('i2-session-close-short'));
}

// --- j. void sale (b) --------------------------------------------------------
{
  const r = await gql(`mutation($orderId: ID!) { voidOrder(orderId:$orderId) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`, {
    orderId: fixture.orderB,
  });
  fixture.voidResult = r.voidOrder;
  out.ops.push(await capture('j-void-sale-b'));
}

fs.writeFileSync(path.join(OUT, 'vendure.json'), JSON.stringify(out, null, 2));
console.log('OK — wrote out/vendure.json with', out.ops.length, 'op captures');
await db.end();
