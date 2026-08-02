// TIE-OUT: Vendure side. Registers a fresh channel (OTP fetched from redis), approves it
// as superadmin, logs in as the channel admin, runs the shared operation sequence through
// admin-api GraphQL, and dumps the channel's journal to out/vendure-journal.json.
//
// Usage: node scripts/etl/tie-out/vendure-run.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';
import pg from 'pg';
import { SPEC, nairobiToday } from './spec.mjs';

const API = 'http://localhost:3000/admin-api';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const RUN_ID = process.env.RUN_ID || `r${Date.now().toString(36)}`;

// Superadmin creds from repo-root .env (never printed).
const envText = readFileSync(join(HERE, '../../../.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const SA_USER = env.SUPERADMIN_USERNAME;
const SA_PASS = env.SUPERADMIN_PASSWORD;
if (!SA_USER || !SA_PASS) throw new Error('SUPERADMIN_USERNAME/PASSWORD missing in root .env');

const redis = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: false });
const pgClient = new pg.Client({
  host: '127.0.0.1',
  port: env.DB_PORT || 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

const results = [];
function log(op, msg) {
  results.push({ op, msg });
  console.log(`[${op}] ${msg}`);
}

async function gql(query, variables = {}, { token, channelToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (channelToken) headers['vendure-token'] = channelToken;
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
  const authToken = res.headers.get('vendure-auth-token');
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors.map(e => e.message).join(' | ')} [query: ${query.slice(0, 80)}]`);
  return { data: body.data, authToken };
}

async function getOtp(phone) {
  const local = phone.replace(/^\+254/, '0'); // backend normalizes E.164 to Kenyan local format
  for (let i = 0; i < 20; i++) {
    const otp = (await redis.get(`otp:phone:${local}`)) || (await redis.get(`otp:phone:${phone}`));
    if (otp) return otp;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`OTP for ${phone} not found in redis`);
}

async function main() {
  await pgClient.connect();

  // 1. Superadmin login.
  const sa = await gql(`mutation { login(username: "${SA_USER}", password: "${SA_PASS}") { ... on CurrentUser { id } ... on InvalidCredentialsError { message } } }`);
  const saToken = sa.authToken;
  if (!saToken) throw new Error('superadmin login failed: ' + JSON.stringify(sa.data));
  log('fixture', 'superadmin logged in');

  // 2. Register a fresh channel via OTP flow.
  const phone = `+2547${String(Math.floor(10000000 + Math.random() * 89999999))}`;
  const reg = await gql(
    `mutation Reg($phone: String!, $data: RegistrationInput!) {
       requestRegistrationOTP(phoneNumber: $phone, registrationData: $data) { success message sessionId }
     }`,
    {
      phone,
      data: {
        companyName: `TieOut Co ${RUN_ID}`,
        currency: 'KES',
        adminFirstName: 'Tie',
        adminLastName: 'Out',
        adminPhoneNumber: phone,
        adminEmail: `tieout-${RUN_ID}@tieout.local`,
        storeName: 'Main Store',
        storeAddress: 'Nairobi',
      },
    }
  );
  const sessionId = reg.data.requestRegistrationOTP.sessionId;
  if (!reg.data.requestRegistrationOTP.success) throw new Error('requestRegistrationOTP: ' + reg.data.requestRegistrationOTP.message);
  const otp1 = await getOtp(phone);
  const ver = await gql(
    `mutation Verify($phone: String!, $otp: String!, $sid: String!) {
       verifyRegistrationOTP(phoneNumber: $phone, otp: $otp, sessionId: $sid) { success userId message }
     }`,
    { phone, otp: otp1, sid: sessionId }
  );
  if (!ver.data.verifyRegistrationOTP.success) throw new Error('verifyRegistrationOTP: ' + ver.data.verifyRegistrationOTP.message);
  const userId = ver.data.verifyRegistrationOTP.userId;
  log('fixture', `registered user ${userId} phone ${phone}`);

  // 3. Approve as superadmin, then log in as the channel admin via OTP.
  await gql(`mutation { approveUser(userId: "${userId}") { id authorizationStatus } }`, {}, { token: saToken });
  // Find MY newly created channel (code derived from company name, contains RUN_ID) and approve it.
  const channels = await gql(`{ channels(options: { take: 100 }) { items { id code token createdAt } } }`, {}, { token: saToken });
  const newChannel = channels.data.channels.items.find(c => c.code.includes(RUN_ID.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
  if (!newChannel) throw new Error('could not find newly registered channel for run ' + RUN_ID);
  await gql(
    `mutation { updateChannelStatusPlatform(channelId: "${newChannel.id}", status: "APPROVED") { id } }`,
    {},
    { token: saToken }
  );
  log('fixture', `channel ${newChannel.id} (${newChannel.code}) approved`);
  await gql(`mutation { requestLoginOTP(phoneNumber: "${phone}") { success message } }`);
  const otp2 = await getOtp(phone);
  const login = await gql(
    `mutation { verifyLoginOTP(phoneNumber: "${phone}", otp: "${otp2}") { success token message authorizationStatus } }`
  );
  if (!login.data.verifyLoginOTP.success) throw new Error('verifyLoginOTP: ' + login.data.verifyLoginOTP.message);
  const otpSession = login.data.verifyLoginOTP.token;
  // Exchange the OTP session token for a real Vendure session (OtpTokenAuthStrategy:
  // login with password = otp_session token).
  const localPhone = phone.replace(/^\+254/, '0');
  let adminToken = null;
  for (const uname of [localPhone, phone]) {
    const r = await gql(
      `mutation { login(username: "${uname}", password: "${otpSession}") { ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`
    );
    if (r.authToken) {
      adminToken = r.authToken;
      break;
    }
  }
  if (!adminToken) throw new Error('OTP session token exchange failed');
  const channelToken = newChannel.token || (
    await gql(`{ channel(id: "${newChannel.id}") { token } }`, {}, { token: saToken })
  ).data.channel.token;
  const ch = await gql(`{ activeChannel { id code token } }`, {}, { token: adminToken, channelToken });
  const channelId = Number(ch.data.activeChannel.id);
  log('fixture', `channel ${channelId} (${ch.data.activeChannel.code}), admin logged in`);
  const asAdmin = (q, v) => gql(q, v, { token: adminToken, channelToken });

  // 4. Prereqs: payment methods, stock location, supplier, customer, products.
  const pm = await asAdmin(`{ paymentMethods(options: { take: 100 }) { items { code } } }`);
  const pmCodes = pm.data.paymentMethods.items.map(i => i.code);
  const cashPm = pmCodes.find(c => c.startsWith('cash'));
  const mpesaPm = pmCodes.find(c => c.startsWith('mpesa'));
  log('fixture', `payment methods: ${pmCodes.join(', ')}`);
  const sl = await asAdmin(`{ stockLocations(options: { take: 10 }) { items { id name } } }`);
  const stockLocationId = sl.data.stockLocations.items[0].id;

  const supplier = await asAdmin(
    `mutation ($input: CreateCustomerInput!) { createCustomerSafe(input: $input) { id } }`,
    { input: { firstName: SPEC.supplier.firstName, lastName: SPEC.supplier.lastName, phoneNumber: SPEC.supplier.phone, customFields: { isSupplier: true } } }
  );
  const supplierId = supplier.data.createCustomerSafe.id;
  await asAdmin(
    `mutation ($input: ApproveSupplierCreditInput!) { approveSupplierCredit(input: $input) { supplierId approved } }`,
    { input: { supplierId, approved: true, supplierCreditLimit: SPEC.supplier.creditLimit } }
  );
  const customer = await asAdmin(
    `mutation ($input: CreateCustomerInput!) { createCustomerSafe(input: $input) { id } }`,
    { input: { firstName: SPEC.customer.firstName, lastName: SPEC.customer.lastName, phoneNumber: SPEC.customer.phone } }
  );
  const customerId = customer.data.createCustomerSafe.id;
  await asAdmin(
    `mutation ($input: ApproveCustomerCreditInput!) { approveCustomerCredit(input: $input) { customerId approved } }`,
    { input: { customerId, approved: true, creditLimit: SPEC.customer.creditLimit } }
  );
  log('fixture', `supplier=${supplierId} customer=${customerId} (credit approved)`);

  async function createProductWithVariant(name, sku, price, service) {
    const p = await asAdmin(
      `mutation ($input: CreateProductInput!) { createProduct(input: $input) { id } }`,
      { input: { translations: [{ languageCode: 'en', name, slug: `${sku.toLowerCase()}-${RUN_ID}`, description: 'tie-out' }] } }
    );
    const productId = p.data.createProduct.id;
    const v = await asAdmin(
      `mutation ($input: [CreateProductVariantInput!]!) { createProductVariants(input: $input) { id } }`,
      {
        input: [
          {
            productId,
            sku: `${sku}-${RUN_ID}`,
            price,
            translations: [{ languageCode: 'en', name }],
            stockOnHand: 0,
            ...(service ? { trackInventory: 'IGNORE' } : {}),
          },
        ],
      }
    );
    return v.data.createProductVariants[0].id;
  }
  const goodsVariantId = await createProductWithVariant(SPEC.product.name, SPEC.product.sku, SPEC.product.price, false);
  const svcVariantId = await createProductWithVariant(SPEC.serviceProduct.name, SPEC.serviceProduct.sku, SPEC.serviceProduct.price, true);
  log('fixture', `variants goods=${goodsVariantId} service=${svcVariantId}`);

  // (a) two paid purchase batches
  async function recordPurchase({ qty, unitCost, isCredit, ref, payment }) {
    const r = await asAdmin(
      `mutation ($input: RecordPurchaseInput!) { recordPurchase(input: $input) { id status } }`,
      {
        input: {
          supplierId,
          purchaseDate: new Date().toISOString(),
          referenceNumber: ref,
          paymentStatus: isCredit ? 'pending' : 'paid',
          isCreditPurchase: isCredit,
          ...(payment ? { payment } : {}),
          lines: [{ variantId: goodsVariantId, quantity: qty, unitCost, stockLocationId }],
        },
      }
    );
    return r.data.recordPurchase.id;
  }
  const p1 = await recordPurchase({
    qty: SPEC.ops.a1.qty, unitCost: SPEC.ops.a1.unitCost, isCredit: false, ref: `tieout-a1-${RUN_ID}`,
    payment: { amount: SPEC.ops.a1.qty * SPEC.ops.a1.unitCost, debitAccountCode: 'CASH_ON_HAND', reference: `tieout-a1-${RUN_ID}` },
  });
  log('a1', `purchase ${p1}`);
  const p2 = await recordPurchase({
    qty: SPEC.ops.a2.qty, unitCost: SPEC.ops.a2.unitCost, isCredit: false, ref: `tieout-a2-${RUN_ID}`,
    payment: { amount: SPEC.ops.a2.qty * SPEC.ops.a2.unitCost, debitAccountCode: 'CASH_ON_HAND', reference: `tieout-a2-${RUN_ID}` },
  });
  log('a2', `purchase ${p2}`);

  // (b) cashier-flow sale settled with split tender
  const orderB = await asAdmin(
    `mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id code state } }`,
    { input: { cartItems: [{ variantId: goodsVariantId, quantity: SPEC.ops.b.qty }], isCashierFlow: true } }
  );
  const saleB = orderB.data.createOrder.id;
  const settle = await asAdmin(
    `mutation ($input: SettleOrderPaymentsInput!) { settleOrderPayments(input: $input) { orderId amountSettled fullySettled } }`,
    {
      input: {
        orderId: saleB,
        tenders: [
          { paymentMethodCode: cashPm, amount: SPEC.ops.b.payments[0].amount },
          { paymentMethodCode: mpesaPm, amount: SPEC.ops.b.payments[1].amount },
        ],
      },
    }
  );
  log('b', `order ${saleB} settled ${JSON.stringify(settle.data.settleOrderPayments)}`);

  // (c) credit sale of service
  const orderC = await asAdmin(
    `mutation ($input: CreateOrderInput!) { createOrder(input: $input) { id code state } }`,
    { input: { cartItems: [{ variantId: svcVariantId, quantity: SPEC.ops.c.qty }], customerId, isCreditSale: true } }
  );
  const saleC = orderC.data.createOrder.id;
  log('c', `order ${saleC} state ${orderC.data.createOrder.state}`);

  // (d) AR repayment
  let methodForRecordPayment = 'cash';
  try {
    await asAdmin(
      `mutation ($input: RecordPaymentInput!) { recordPayment(input: $input) { totalAllocated remainingBalance } }`,
      { input: { customerId, paymentAmount: SPEC.ops.d.amount, paymentMethodCode: methodForRecordPayment, orderId: saleC, referenceNumber: `tieout-d-${RUN_ID}` } }
    );
  } catch (e) {
    methodForRecordPayment = cashPm;
    await asAdmin(
      `mutation ($input: RecordPaymentInput!) { recordPayment(input: $input) { totalAllocated remainingBalance } }`,
      { input: { customerId, paymentAmount: SPEC.ops.d.amount, paymentMethodCode: methodForRecordPayment, orderId: saleC, referenceNumber: `tieout-d-${RUN_ID}` } }
    );
  }
  log('d', `repayment recorded (method code '${methodForRecordPayment}')`);

  // (e) expense
  await asAdmin(
    `mutation ($input: RecordExpenseInput!) { recordExpense(input: $input) { sourceId } }`,
    { input: { amount: SPEC.ops.e.amount, sourceAccountCode: SPEC.ops.e.account, category: SPEC.ops.e.category, memo: `tieout-e-${RUN_ID}` } }
  );
  log('e', 'expense recorded');

  // Ledger balance helper (read-only SQL for session declarations).
  async function balance(code) {
    const { rows } = await pgClient.query(
      `select coalesce(sum(l.debit),0) - coalesce(sum(l.credit),0) as bal
         from ledger_journal_line l join ledger_account a on a.id = l."accountId"
        where l."channelId" = $1 and a.code = $2`,
      [channelId, code]
    );
    return Number(rows[0].bal);
  }

  // (i-open) cashier session with exact-balance declarations (zero variance)
  const openDecl = [
    { accountCode: 'CASH_ON_HAND', amountCents: await balance('CASH_ON_HAND') },
    { accountCode: 'CLEARING_MPESA', amountCents: await balance('CLEARING_MPESA') },
  ];
  const opened = await asAdmin(
    `mutation ($input: OpenCashierSessionInput!) { openCashierSession(input: $input) { id status } }`,
    { input: { channelId, openingBalances: openDecl } }
  );
  const sessionGqlId = opened.data.openCashierSession.id;
  log('i(open)', `session ${sessionGqlId} declarations ${JSON.stringify(openDecl)}`);

  // (f) transfer with fee
  await asAdmin(
    `mutation ($input: InterAccountTransferInput!) { createInterAccountTransfer(input: $input) { id sourceId } }`,
    {
      input: {
        channelId,
        transferId: `tieout-f-${RUN_ID}`,
        fromAccountCode: SPEC.ops.f.from,
        toAccountCode: SPEC.ops.f.to,
        amount: String(SPEC.ops.f.principal),
        entryDate: nairobiToday(),
        memo: 'tie-out transfer',
        feeAmount: String(SPEC.ops.f.fee),
      },
    }
  );
  log('f', 'transfer posted');

  // (g) credit purchase + supplier payment
  const p3 = await recordPurchase({ qty: SPEC.ops.g.qty, unitCost: SPEC.ops.g.unitCost, isCredit: true, ref: `tieout-g-${RUN_ID}` });
  await asAdmin(
    `mutation ($input: SupplierPaymentAllocationInput!) { allocateBulkSupplierPayment(input: $input) { totalAllocated remainingBalance } }`,
    { input: { supplierId, paymentAmount: SPEC.ops.g.payment, purchaseIds: [p3], debitAccountCode: SPEC.ops.g.account, reference: `tieout-g-${RUN_ID}` } }
  );
  log('g', `credit purchase ${p3} + supplier payment ${SPEC.ops.g.payment}`);

  // (h) write-off
  await asAdmin(
    `mutation ($input: RecordStockAdjustmentInput!) { recordStockAdjustment(input: $input) { id } }`,
    { input: { reason: SPEC.ops.h.reason, notes: `tieout-h-${RUN_ID}`, lines: [{ variantId: goodsVariantId, quantityChange: -SPEC.ops.h.qty, stockLocationId }] } }
  );
  log('h', 'write-off recorded');

  // (i-close) declared cash 1000 short
  const cashExpected = await balance('CASH_ON_HAND');
  const mpesaExpected = await balance('CLEARING_MPESA');
  await asAdmin(
    `mutation ($input: CloseCashierSessionInput!) { closeCashierSession(input: $input) { sessionId status } }`,
    {
      input: {
        sessionId: sessionGqlId,
        channelId,
        closingBalances: [
          { accountCode: 'CASH_ON_HAND', amountCents: cashExpected - SPEC.ops.i.shortBy },
          { accountCode: 'CLEARING_MPESA', amountCents: mpesaExpected },
        ],
        notes: `tieout-i-${RUN_ID}`,
      },
    }
  );
  log('i(close)', `closed; cash expected ${cashExpected}, declared ${cashExpected - SPEC.ops.i.shortBy}`);

  // (j) void sale (b)
  const voidRes = await asAdmin(`mutation { voidOrder(orderId: "${saleB}") { order { id state } hadPayments } }`);
  log('j', `void ${JSON.stringify(voidRes.data.voidOrder)}`);

  // 5. Dump the channel journal.
  const { rows } = await pgClient.query(
    `select e."sourceType" as source_type, e."sourceId" as source_id, e."entryDate"::text as entry_date,
            e."reversalOf" as reversal_of, a.code as account_code, l.debit::text, l.credit::text, l.meta
       from ledger_journal_entry e
       join ledger_journal_line l on l."entryId" = e.id
       join ledger_account a on a.id = l."accountId"
      where e."channelId" = $1
      order by e."postedAt", e.id, a.code`,
    [channelId]
  );
  writeFileSync(
    join(OUT, 'vendure-journal.json'),
    JSON.stringify({ runId: RUN_ID, channelId, ops: { saleB, saleC, p1, p2, p3, sessionGqlId }, lines: rows, log: results }, null, 2)
  );
  log('dump', `${rows.length} journal lines written to out/vendure-journal.json`);

  await pgClient.end();
  redis.disconnect();
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
