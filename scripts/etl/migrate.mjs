// MIGRATE: one Vendure channel -> one Supabase company.
// Usage: node scripts/etl/migrate.mjs --channel <id> [--apply] [--name "Company Name"] [--prod]
//   default   dry-run: prints the plan + per-entity counts, writes nothing.
//   --apply   writes to the TARGET in a single transaction.
//   --prod    switches auth-user creation to the Supabase Admin API
//             (POST /auth/v1/admin/users, phone_confirm). Without it, rehearsal
//             inserts auth.users directly, mirroring testkit.create_user.
//
// Idempotent: public.etl_id_map (old_type, old_id, company_id) -> new_id is consulted
// before every insert; ledger entries additionally rely on
// unique(company_id, source_type, source_id) with ON CONFLICT skip.
//
// Money is integer cents everywhere. int8 is parsed to Number (all values << 2^53).
// SOURCE is read-only; TARGET writes bypass RPCs deliberately (migration, not app traffic).
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC_DSN = 'postgres://vendure:changeme-secure-password@localhost:5432/vendure';
const TGT_DSN = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

// Supabase API config for the --prod auth branch and asset uploads.
// Defaults are the LOCAL dev stack (demo keys, per `npx supabase status -o env`);
// override via env for real environments.
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
// Vendure asset store root (asset.source is relative to this).
const VENDURE_ASSET_DIR = process.env.VENDURE_ASSET_DIR
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', 'static', 'assets');
const ETL_DIR = path.dirname(fileURLToPath(import.meta.url));

// int8 -> Number, float8 -> Number (source creditLimit etc. are float8 cents)
pg.types.setTypeParser(20, v => (v === null ? null : Number(v)));
pg.types.setTypeParser(701, v => (v === null ? null : Number(v)));

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const FLAGS = {
  apply: args.includes('--apply'),
  prod: args.includes('--prod'),
  channel: null,
  name: null,
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--channel') FLAGS.channel = Number(args[++i]);
  if (args[i] === '--name') FLAGS.name = args[++i];
}
if (!FLAGS.channel) {
  console.error('usage: node scripts/etl/migrate.mjs --channel <id> [--apply] [--name "..."] [--prod]');
  process.exit(1);
}

const src = new pg.Client(SRC_DSN);
const tgt = new pg.Client(TGT_DSN);
await src.connect();
await tgt.connect();

const stats = {}; // step -> {inserted, skippedExisting, ...}
const warnings = [];
const skippedParked = [];
const warn = m => { warnings.push(m); console.log('  WARN: ' + m); };
const stat = k => (stats[k] ??= { inserted: 0, existing: 0, skipped: 0 });

// ---------------------------------------------------------------------------
// etl_id_map helpers
// ---------------------------------------------------------------------------
await tgt.query(`
  create table if not exists public.etl_id_map (
    old_type text not null,
    old_id text not null,
    new_id uuid not null,
    company_id uuid not null,
    created_at timestamptz not null default now(),
    primary key (old_type, old_id, company_id)
  )`);

async function mapGet(companyId, type, oldId) {
  const { rows } = await tgt.query(
    'select new_id from public.etl_id_map where old_type=$1 and old_id=$2 and company_id=$3',
    [type, String(oldId), companyId]);
  return rows[0]?.new_id ?? null;
}
async function mapAll(companyId, type) {
  const { rows } = await tgt.query(
    'select old_id, new_id from public.etl_id_map where old_type=$1 and company_id=$2',
    [type, companyId]);
  return new Map(rows.map(r => [r.old_id, r.new_id]));
}
async function mapPut(companyId, type, oldId, newId) {
  await tgt.query(
    'insert into public.etl_id_map (old_type, old_id, new_id, company_id) values ($1,$2,$3,$4) on conflict do nothing',
    [type, String(oldId), newId, companyId]);
}

// ---------------------------------------------------------------------------
// Supabase API helpers (service role). Used by the --prod auth branch and by
// copyAssets(). 429 -> exponential backoff retry.
// ---------------------------------------------------------------------------
async function supaApi(pathname, init = {}, attempt = 0) {
  const res = await fetch(SUPABASE_URL + pathname, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init.body && !init.headers?.['content-type'] ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 429 && attempt < 5) {
    const wait = 1000 * 2 ** attempt;
    console.log(`  WARN: Supabase API rate-limited (429); retrying in ${wait}ms`);
    await new Promise(r => setTimeout(r, wait));
    return supaApi(pathname, init, attempt + 1);
  }
  return res;
}

// --prod: create an auth user via the GoTrue Admin API. Falls back to an
// admin-API lookup when the user is already registered.
async function createAuthUserProd(u) {
  const res = await supaApi('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      phone: u.identifier,
      phone_confirm: true,
      ...(u.email ? { email: u.email, email_confirm: true } : {}),
      user_metadata: { migrated_from: 'vendure', vendure_identifier: u.identifier },
    }),
  });
  if (res.ok) return (await res.json()).id;
  const body = await res.text();
  if (res.status === 422 || /already|exists/i.test(body)) {
    const found = await findAuthUserByPhone(u.identifier);
    if (found) return found;
  }
  throw new Error(`admin create user failed: ${res.status} ${body}`);
}

async function findAuthUserByPhone(phone) {
  for (let page = 1; page <= 50; page++) {
    const res = await supaApi(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) throw new Error(`admin list users failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    const users = Array.isArray(j) ? j : j.users ?? [];
    const hit = users.find(x => x.phone === phone);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

const parseJsonText = (v, label) => {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { warn(`${label}: unparseable JSON text, set null`); return null; }
};
const prettify = code => code.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ---------------------------------------------------------------------------
// load source channel
// ---------------------------------------------------------------------------
const { rows: chRows } = await src.query('select * from channel where id=$1', [FLAGS.channel]);
const channel = chRows[0];
if (!channel) { console.error(`channel ${FLAGS.channel} not found`); process.exit(1); }
console.log(`\n=== MIGRATE channel ${channel.id} (${channel.code}) ${FLAGS.apply ? '-- APPLY' : '-- DRY RUN'} ===`);

// Resume: company already migrated?
let companyId = null;
{
  const { rows } = await tgt.query(
    `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`, [String(channel.id)]);
  companyId = rows[0]?.new_id ?? null;
}
const resumed = companyId != null;
const DRY = !FLAGS.apply;
// In a fresh dry-run, use the zero uuid (has no map rows, so all counts are "planned").
if (!companyId && DRY) companyId = '00000000-0000-0000-0000-000000000000';

if (FLAGS.apply) await tgt.query('begin');

try {
  // -------------------------------------------------------------------------
  // 1. company
  // -------------------------------------------------------------------------
  {
    const s = stat('company');
    if (resumed) {
      s.existing++;
    } else if (DRY) {
      s.inserted++;
      console.log(`  plan company: code=${channel.code} name=${FLAGS.name ?? prettify(channel.code)}`);
    } else {
      // tier: source subscription_tier.id -> code -> target tier by code, else null
      let tierId = null;
      if (channel.customFieldsSubscriptiontierid) {
        const st = await src.query('select code from subscription_tier where id=$1', [channel.customFieldsSubscriptiontierid]);
        if (st.rows[0]) {
          const tt = await tgt.query('select id from public.subscription_tiers where code=$1', [st.rows[0].code]);
          tierId = tt.rows[0]?.id ?? null;
          if (!tierId) warn(`tier code '${st.rows[0].code}' not found in target; subscription_tier_id null`);
        } else {
          warn(`source tier ${channel.customFieldsSubscriptiontierid} not found; subscription_tier_id null`);
        }
      }
      const status = (channel.customFieldsStatus ?? 'unapproved').toLowerCase();
      if (!['unapproved', 'approved', 'disabled', 'banned'].includes(status)) {
        warn(`unknown channel status '${channel.customFieldsStatus}' -> 'unapproved'`);
      }
      const subStatus = channel.customFieldsSubscriptionstatus?.toLowerCase() ?? null;
      if (subStatus && !['trial', 'active', 'expired', 'cancelled'].includes(subStatus)) {
        warn(`unknown subscription status '${subStatus}' -> null`);
      }
      const billing = channel.customFieldsBillingcycle?.toLowerCase() ?? null;
      if (billing && !['monthly', 'yearly'].includes(billing)) warn(`unknown billing cycle '${billing}' -> null`);
      // public_slug is unique in target; drop it if another company took it
      let slug = channel.customFieldsPublicslug ?? null;
      if (slug) {
        const clash = await tgt.query('select 1 from public.companies where public_slug=$1', [slug]);
        if (clash.rows.length) { warn(`public_slug '${slug}' already taken in target -> null`); slug = null; }
      }
      const name = FLAGS.name ?? prettify(channel.code);
      const { rows } = await tgt.query(
        `insert into public.companies (
           code, name, currency, status,
           public_storefront_enabled, public_slug, public_whatsapp_number,
           cashier_flow_enabled, batch_expiry_enabled, low_stock_threshold,
           cash_control_enabled, require_opening_count, variance_notification_threshold,
           enable_printer, notification_category_preferences,
           subscription_tier_id, subscription_status, trial_ends_at,
           subscription_started_at, subscription_expires_at, billing_cycle,
           paystack_customer_code, paystack_subscription_code,
           last_payment_date, last_payment_amount,
           subscription_expired_reminder_sent_at, subscription_exempt_until,
           subscription_exempt_reason, subscription_grace_period_end,
           sms_used_this_period, sms_period_end, sms_usage_by_category
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         returning id`,
        [
          channel.code, name, channel.defaultCurrencyCode ?? 'KES',
          ['unapproved', 'approved', 'disabled', 'banned'].includes(status) ? status : 'unapproved',
          channel.customFieldsPublicstorefrontenabled ?? false, slug,
          channel.customFieldsPublicwhatsappnumber ?? null,
          channel.customFieldsCashierflowenabled ?? false, channel.customFieldsBatchexpiryenabled ?? false,
          channel.customFieldsLowstockthreshold ?? 10,
          channel.customFieldsCashcontrolenabled ?? true, channel.customFieldsRequireopeningcount ?? true,
          channel.customFieldsVariancenotificationthreshold ?? 100,
          channel.customFieldsEnableprinter ?? true,
          parseJsonText(channel.customFieldsNotificationcategorypreferences, 'notificationCategoryPreferences'),
          tierId, ['trial', 'active', 'expired', 'cancelled'].includes(subStatus) ? subStatus : null,
          channel.customFieldsTrialendsat, channel.customFieldsSubscriptionstartedat,
          channel.customFieldsSubscriptionexpiresat, ['monthly', 'yearly'].includes(billing) ? billing : null,
          channel.customFieldsPaystackcustomercode, channel.customFieldsPaystacksubscriptioncode,
          channel.customFieldsLastpaymentdate, channel.customFieldsLastpaymentamount,
          channel.customFieldsSubscriptionexpiredremindersentat, channel.customFieldsSubscriptionexemptuntil,
          channel.customFieldsSubscriptionexemptreason, channel.customFieldsSubscriptiongraceperiodend,
          channel.customFieldsSmsusedthisperiod ?? 0, channel.customFieldsSmsperiodend,
          parseJsonText(channel.customFieldsSmsusagebycategory, 'smsUsageByCategory'),
        ]);
      companyId = rows[0].id;
      await mapPut(companyId, 'channel', channel.id, companyId);
      s.inserted++;
      console.log(`  company inserted: ${companyId} (${channel.code} / ${name})`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. users + roles + memberships
  //    superadmin (role __super_admin_role__) gets an auth user (sessions etc.
  //    reference it) but NO company membership — it is platform-level.
  // -------------------------------------------------------------------------
  const userMap = new Map(); // vendure user id (string) -> auth uuid
  let firstMemberAuthId = null;
  {
    const { rows: admins } = await src.query(
      `select a.id as admin_id, u.id as user_id, u.identifier, u.verified,
              a."emailAddress", a."firstName", a."lastName", r.code as role_code
       from administrator a
       join "user" u on u.id = a."userId"
       join user_roles_role ur on ur."userId" = u.id
       join role r on r.id = ur."roleId"
       join role_channels_channel rc on rc."roleId" = r.id
       where rc."channelId" = $1 and a."deletedAt" is null and u."deletedAt" is null
       order by a.id`, [channel.id]);

    async function ensureAuthUser(u) {
      // keyed by phone = vendure user.identifier
      const found = await tgt.query('select id from auth.users where phone=$1', [u.identifier]);
      if (found.rows.length) return found.rows[0].id;
      if (u.email) {
        const byEmail = await tgt.query('select id from auth.users where email=$1', [u.email]);
        if (byEmail.rows.length) return byEmail.rows[0].id;
      }
      if (FLAGS.prod) {
        // Supabase Admin API (service role). Existing users were already
        // matched by phone/email above; createAuthUserProd additionally
        // resolves already-registered conflicts via an admin-API lookup.
        return await createAuthUserProd(u);
      }
      const id = crypto.randomUUID();
      // mirrors testkit.create_user (supabase/tests/database/0000_testkit.test.sql)
      await tgt.query(
        `insert into auth.users (
           id, instance_id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
           confirmation_token, recovery_token, email_change, email_change_token_current,
           email_change_token_new, phone_change, phone_change_token, reauthentication_token,
           created_at, updated_at
         ) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
                   $2,$3, now(), '', '', '', '', '', '', '', '', '', now(), now())
         on conflict (id) do nothing`,
        [id, u.email ?? null, u.identifier]);
      return id;
    }

    const s = stat('users');
    const sm = stat('memberships');
    const mapped = await mapAll(companyId, 'user');
    const members = admins.filter(a => a.role_code !== '__super_admin_role__');
    for (const a of admins) {
      const key = String(a.user_id);
      let authId = mapped.get(key) ?? null;
      if (authId) { s.existing++; }
      else if (DRY) { s.inserted++; authId = crypto.randomUUID(); }
      else {
        authId = await ensureAuthUser({ identifier: a.identifier, email: a.emailAddress });
        await mapPut(companyId, 'user', key, authId);
        s.inserted++;
      }
      userMap.set(key, authId);
    }
    // roles: get-or-create by (company_id, name)
    async function ensureRole(name, permissions) {
      if (DRY) return crypto.randomUUID();
      const f = await tgt.query('select id from public.roles where company_id=$1 and name=$2', [companyId, name]);
      if (f.rows.length) return f.rows[0].id;
      const { rows } = await tgt.query(
        'insert into public.roles (company_id, name, permissions) values ($1,$2,$3) returning id',
        [companyId, name, permissions]);
      return rows[0].id;
    }
    // The full 14-permission set (0016 added ManageTeam) — same as the
    // 'Admin' role template and provision_company.
    const ALL_PERMS = [
      'ManageApprovals', 'OverridePrice', 'ManageStockAdjustments',
      'ApproveCustomerCredit', 'ManageCustomerCreditLimit', 'ReverseOrder',
      'OverrideCustomerBalance', 'SettleOrder', 'ManageSupplierCreditPurchases',
      'ViewFinancials', 'ManageReconciliation', 'CloseAccountingPeriod',
      'CreateInterAccountTransfer', 'ManageTeam',
    ];
    const adminRoleId = members.length ? await ensureRole('Admin', ALL_PERMS) : null;
    const cashierRoleId = members.length > 1 ? await ensureRole('Cashier', ['SettleOrder']) : null;

    for (let i = 0; i < members.length; i++) {
      const authId = userMap.get(String(members[i].user_id));
      if (!firstMemberAuthId) firstMemberAuthId = authId;
      if (DRY) { sm.inserted++; continue; }
      const roleId = i === 0 ? adminRoleId : cashierRoleId;
      const r = await tgt.query(
        `insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
         values ($1,$2,$3,'approved') on conflict (company_id, user_id) do nothing`,
        [companyId, authId, roleId]);
      r.rowCount ? sm.inserted++ : sm.existing++;
    }
    if (!members.length) warn('no non-superadmin administrators on channel; no memberships created');
  }
  const mapUser = uid => (uid == null ? null : userMap.get(String(uid)) ?? firstMemberAuthId ?? null);

  // -------------------------------------------------------------------------
  // 3. chart of accounts + payment methods + stock location
  //    (same shapes as provision_company, inserted directly: the RPC needs
  //    auth claims and would also create a duplicate company)
  // -------------------------------------------------------------------------
  const accountByCode = new Map(); // code -> uuid
  {
    if (!DRY) {
      const s = stat('ledger_accounts');
      const { rows: cash } = await tgt.query(
        `insert into public.ledger_accounts (company_id, code, name, type, is_parent, is_system)
         values ($1,'CASH','Cash','asset',true,true)
         on conflict (company_id, code) do nothing returning id`, [companyId]);
      let cashId = cash[0]?.id;
      if (!cashId) {
        cashId = (await tgt.query(
          'select id from public.ledger_accounts where company_id=$1 and code=\'CASH\'', [companyId])).rows[0].id;
        s.existing++;
      } else s.inserted++;
      const LEAVES = [
        ['CASH_ON_HAND', 'Cash on Hand', 'asset', 'CASH'], ['BANK_MAIN', 'Bank - Main', 'asset', 'CASH'],
        ['CLEARING_MPESA', 'Clearing - M-Pesa', 'asset', 'CASH'],
        ['CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', null],
        ['CLEARING_GENERIC', 'Clearing - Generic', 'asset', null],
        ['ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', null],
        ['INVENTORY', 'Inventory', 'asset', null],
        ['SALES', 'Sales Revenue', 'income', null], ['SALES_RETURNS', 'Sales Returns', 'income', null],
        ['ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', null],
        ['TAX_PAYABLE', 'Taxes Payable', 'liability', null],
        ['PURCHASES', 'Inventory Purchases', 'expense', null],
        ['EXPENSES', 'General Expenses', 'expense', null],
        ['PROCESSOR_FEES', 'Payment Processor Fees', 'expense', null],
        ['CASH_SHORT_OVER', 'Cash Short/Over', 'expense', null],
        ['COGS', 'Cost of Goods Sold', 'expense', null],
        ['INVENTORY_WRITE_OFF', 'Inventory Write-Off', 'expense', null],
        ['EXPIRY_LOSS', 'Expiry Loss', 'expense', null],
        ['INVENTORY_ADJUSTMENT', 'Inventory Adjustment', 'expense', null],
        ['BALANCE_ADJUSTMENT', 'Balance Adjustment', 'equity', null],
      ];
      for (const [code, name, type, parent] of LEAVES) {
        const r = await tgt.query(
          `insert into public.ledger_accounts (company_id, code, name, type, parent_id, is_system)
           values ($1,$2,$3,$4,$5,true) on conflict (company_id, code) do nothing`,
          [companyId, code, name, type, parent === 'CASH' ? cashId : null]);
        r.rowCount ? s.inserted++ : s.existing++;
      }
      const pm = stat('payment_methods');
      const METHODS = [
        ['cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true],
        ['mpesa', 'M-Pesa', 'CLEARING_MPESA', 'transaction_verification', true],
        ['bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false],
        ['credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false],
      ];
      for (const [code, name, acct, recType, cashierControlled] of METHODS) {
        const r = await tgt.query(
          `insert into public.payment_methods (company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled)
           values ($1,$2,$3,$4,$5,$6) on conflict (company_id, code) do nothing`,
          [companyId, code, name, acct, recType, cashierControlled]);
        r.rowCount ? pm.inserted++ : pm.existing++;
      }
    } else { stat('ledger_accounts').inserted = 21; stat('payment_methods').inserted = 4; }
    // stock location: source location name for this channel, else 'Main Store'
    const { rows: locs } = await src.query(
      `select sl.name from stock_location sl
       join stock_location_channels_channel c on c."stockLocationId" = sl.id
       where c."channelId"=$1 order by sl.id limit 1`, [channel.id]);
    const locName = locs[0]?.name ?? 'Main Store';
    if (!DRY) {
      const sl = stat('stock_locations');
      const r = await tgt.query(
        `insert into public.stock_locations (company_id, code, name) values ($1,'MAIN',$2)
         on conflict (company_id, code) do nothing`, [companyId, locName]);
      r.rowCount ? sl.inserted++ : sl.existing++;
    } else stat('stock_locations').inserted = 1;

    if (!DRY) {
      const { rows } = await tgt.query(
        'select code, id from public.ledger_accounts where company_id=$1', [companyId]);
      for (const r of rows) accountByCode.set(r.code, r.id);
    }
  }

  // -------------------------------------------------------------------------
  // 4. customers: channel members ∪ customers referenced by this channel's
  //    orders / ledger meta (cross-channel references observed in demo data).
  // -------------------------------------------------------------------------
  {
    const s = stat('customers');
    const { rows: custs } = await src.query(
      `with ids as (
         select "customerId" as id from customer_channels_channel where "channelId"=$1
         union
         select o."customerId" from "order" o
           join order_channels_channel occ on occ."orderId"=o.id
           where occ."channelId"=$1 and o."customerId" is not null
         union
         select (meta->>'customerId')::int from ledger_journal_line
           where "channelId"=$1 and meta ? 'customerId'
         union
         select (meta->>'supplierId')::int from ledger_journal_line
           where "channelId"=$1 and meta ? 'supplierId'
       )
       select c.* from customer c join ids on ids.id = c.id
       where c."deletedAt" is null order by c.id`, [channel.id]);
    const mapped = await mapAll(companyId, 'customer');
    for (const c of custs) {
      const key = String(c.id);
      if (mapped.has(key)) { s.existing++; continue; }
      if (DRY) { s.inserted++; continue; }
      const { rows } = await tgt.query(
        `insert into public.customers (
           company_id, first_name, last_name, phone, email, is_supplier,
           credit_limit, credit_terms_days, is_credit_approved,
           last_repayment_date, last_repayment_amount, payment_terms,
           notifications_enabled, notes,
           supplier_credit_limit, supplier_credit_terms_days, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
        [
          companyId,
          (c.firstName ?? '').trim() || c.phoneNumber || `Customer ${c.id}`,
          c.lastName || null, c.phoneNumber || null, c.emailAddress || null,
          c.customFieldsIssupplier ?? false,
          Math.round(c.customFieldsCreditlimit ?? 0),
          c.customFieldsCreditduration ?? null,
          c.customFieldsIscreditapproved ?? false,
          c.customFieldsLastrepaymentdate ?? null,
          c.customFieldsLastrepaymentamount == null ? null : Math.round(c.customFieldsLastrepaymentamount),
          c.customFieldsPaymentterms ?? null,
          c.customFieldsNotificationsenabled ?? true,
          c.customFieldsNotes ?? null,
          Math.round(c.customFieldsSuppliercreditlimit ?? 0),
          c.customFieldsSuppliercreditduration ?? null,
          c.createdAt,
        ]);
      await mapPut(companyId, 'customer', key, rows[0].id);
      s.inserted++;
    }
    const { rows: deleted } = await src.query(
      `select count(*)::int n from customer c join customer_channels_channel cc on cc."customerId"=c.id
       where cc."channelId"=$1 and c."deletedAt" is not null`, [channel.id]);
    if (deleted[0].n) { s.skipped = deleted[0].n; warn(`${deleted[0].n} soft-deleted customers skipped`); }
  }

  // -------------------------------------------------------------------------
  // 5. products + variants
  // -------------------------------------------------------------------------
  {
    const sp = stat('products');
    const sv = stat('variants');
    const { rows: products } = await src.query(
      `select p.*, t.name as tname from product p
       join product_channels_channel pcc on pcc."productId"=p.id
       left join product_translation t on t."baseId"=p.id and t."languageCode"='en'
       where pcc."channelId"=$1 and p."deletedAt" is null order by p.id`, [channel.id]);
    const mappedP = await mapAll(companyId, 'product');
    const mappedV = await mapAll(companyId, 'variant');
    const seenBarcodes = new Set();

    for (const p of products) {
      let productId = mappedP.get(String(p.id)) ?? null;
      if (productId) sp.existing++;
      else if (DRY) { sp.inserted++; productId = crypto.randomUUID(); }
      else {
        let barcode = p.customFieldsBarcode || null;
        if (barcode && seenBarcodes.has(barcode)) {
          warn(`duplicate product barcode '${barcode}' (product ${p.id}) -> null`);
          barcode = null;
        }
        const { rows } = await tgt.query(
          `insert into public.products (company_id, name, barcode, active, created_at)
           values ($1,$2,$3,$4,$5) returning id`,
          [companyId, (p.tname ?? `Product ${p.id}`).trim(), barcode, p.enabled ?? true, p.createdAt]);
        productId = rows[0].id;
        await mapPut(companyId, 'product', p.id, productId);
        sp.inserted++;
      }
      if (p.customFieldsBarcode) seenBarcodes.add(p.customFieldsBarcode);

      const { rows: variants } = await src.query(
        `select v.*, pvp.price as channel_price from product_variant v
         join product_variant_channels_channel vcc on vcc."productVariantId"=v.id
         left join product_variant_price pvp
           on pvp."variantId"=v.id and pvp."channelId"=$1 and pvp."currencyCode"=$2
         where vcc."channelId"=$1 and v."productId"=$3 and v."deletedAt" is null
         order by v.id`, [channel.id, channel.defaultCurrencyCode ?? 'KES', p.id]);
      if (!variants.length) warn(`product ${p.id} ('${p.tname}') has no variants — violates new-system rules`);

      for (const v of variants) {
        if (mappedV.has(String(v.id))) { sv.existing++; continue; }
        if (DRY) { sv.inserted++; continue; }
        // variant name: option labels joined, else 'Default'
        const { rows: opts } = await src.query(
          `select coalesce(ot.name, o.code) as label
           from product_variant_options_product_option vo
           join product_option o on o.id = vo."productOptionId"
           left join product_option_translation ot
             on ot."baseId"=o.id and ot."languageCode"='en'
           where vo."productVariantId"=$1 order by o.id`, [v.id]);
        const vname = variants.length === 1 || !opts.length
          ? 'Default'
          : opts.map(o => o.label).join(' / ');
        const track = v.trackInventory === 'INHERIT' ? channel.trackInventory : v.trackInventory === 'TRUE';
        const kind = track ? 'good' : 'service';
        let barcode = v.customFieldsBarcode || null; // variants have no barcode custom field in source; reserved
        const r = await tgt.query(
          `insert into public.product_variants (
             product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
             allow_fractional, track_inventory, active, created_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (company_id, sku) do nothing returning id`,
          [
            productId, companyId, vname, kind, v.sku, barcode,
            v.channel_price ?? 0, v.customFieldsWholesaleprice ?? null,
            v.customFieldsAllowfractionalquantity ?? false, track, v.enabled ?? true, v.createdAt,
          ]);
        if (!r.rows.length) {
          warn(`variant sku '${v.sku}' already exists in target company; mapped by sku`);
          const existing = await tgt.query(
            'select id from public.product_variants where company_id=$1 and sku=$2', [companyId, v.sku]);
          await mapPut(companyId, 'variant', v.id, existing.rows[0].id);
        } else {
          await mapPut(companyId, 'variant', v.id, r.rows[0].id);
        }
        if (v.channel_price == null) warn(`variant ${v.id} (${v.sku}) has no channel price; inserted as 0`);
        sv.inserted++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. inventory_batches (old quantity IS remaining; only quantity > 0)
  // -------------------------------------------------------------------------
  {
    const s = stat('inventory_batches');
    const { rows: batches } = await src.query(
      `select * from inventory_batch where "channelId"=$1 and quantity > 0 order by "createdAt"`, [channel.id]);
    const mappedB = await mapAll(companyId, 'batch');
    const mappedV = await mapAll(companyId, 'variant');
    const mappedC = await mapAll(companyId, 'customer');
    let mainLoc = null;
    if (!DRY) mainLoc = (await tgt.query(
      'select id from public.stock_locations where company_id=$1 and code=\'MAIN\'', [companyId])).rows[0]?.id;
    for (const b of batches) {
      if (mappedB.has(b.id)) { s.existing++; continue; }
      if (DRY) { s.inserted++; continue; }
      const variantId = mappedV.get(String(b.productVariantId));
      if (!variantId) { warn(`batch ${b.id}: variant ${b.productVariantId} not migrated; skipped`); s.skipped++; continue; }
      // supplier via the originating purchase, when traceable
      let supplierId = null;
      if (b.sourceType === 'Purchase' && b.sourceId) {
        const { rows: pl } = await src.query(
          'select p."supplierId" from stock_purchase p where p.id=$1', [b.sourceId]);
        if (pl[0]) supplierId = mappedC.get(String(pl[0].supplierId)) ?? null;
      }
      const { rows } = await tgt.query(
        `insert into public.inventory_batches (
           company_id, variant_id, stock_location_id, supplier_id,
           quantity, remaining, unit_cost, purchased_at, expiry_date, created_at
         ) values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9) returning id`,
        [companyId, variantId, mainLoc, supplierId,
         b.quantity, b.unitCost, b.createdAt, b.expiryDate ?? null, b.createdAt]);
      await mapPut(companyId, 'batch', b.id, rows[0].id);
      s.inserted++;
    }
  }

  // -------------------------------------------------------------------------
  // 7. orders + lines + payments
  // -------------------------------------------------------------------------
  const COMPLETED_STATES = ['Fulfilled', 'Shipped', 'Delivered', 'PartiallyShipped', 'PaymentSettled'];
  {
    const so = stat('orders');
    const sl = stat('order_lines');
    const spay = stat('payments');
    const { rows: orders } = await src.query(
      `select o.* from "order" o join order_channels_channel occ on occ."orderId"=o.id
       where occ."channelId"=$1 and o.type='Regular' order by o.id`, [channel.id]);
    const mappedO = await mapAll(companyId, 'order');
    const mappedV = await mapAll(companyId, 'variant');
    const mappedC = await mapAll(companyId, 'customer');

    for (const o of orders) {
      const reversed = o.customFieldsReversedat != null;
      const isVoided = reversed || o.state === 'Cancelled';
      const isCompleted = !isVoided && COMPLETED_STATES.includes(o.state);
      if (!isVoided && !isCompleted) {
        // draft / ArrangingPayment parked — close before cutover
        skippedParked.push({ id: o.id, code: o.code, state: o.state, total: o.subTotalWithTax });
        so.skipped++;
        continue;
      }
      if (mappedO.has(String(o.id))) { so.existing++; continue; }
      if (DRY) { so.inserted++; continue; }

      const { rows: lines } = await src.query(
        'select * from order_line where "orderId"=$1 order by id', [o.id]);
      const { rows: pays } = await src.query(
        'select * from payment where "orderId"=$1 order by id', [o.id]);
      const settledSum = pays.filter(p => p.state === 'Settled').reduce((a, p) => a + p.amount, 0);

      // Voided orders: Vendure zeroes line quantities on cancel; use
      // orderPlacedQuantity and derive the pre-cancel total from the lines.
      let total = o.subTotalWithTax;
      const lineRows = [];
      for (const l of lines) {
        const qty = isVoided && l.quantity === 0 ? l.orderPlacedQuantity : l.quantity;
        if (!qty || qty <= 0) { warn(`order ${o.id} line ${l.id}: zero quantity; line skipped`); continue; }
        const variantId = mappedV.get(String(l.productVariantId));
        if (!variantId) { warn(`order ${o.id} line ${l.id}: variant ${l.productVariantId} not migrated; line skipped`); continue; }
        const customUnit = l.customFieldsCustomlineprice != null
          ? Math.round(l.customFieldsCustomlineprice / qty) : null;
        const lineTotal = l.customFieldsCustomlineprice != null
          ? (isVoided && l.quantity === 0 ? customUnit * qty : l.customFieldsCustomlineprice)
          : Math.round(qty * l.listPrice);
        lineRows.push({ variantId, qty, listPrice: l.listPrice, customUnit, lineTotal,
                        reason: l.customFieldsPriceoverridereason ?? null });
      }
      if (isVoided) total = lineRows.reduce((a, r) => a + r.lineTotal, 0);

      const { rows: orow } = await tgt.query(
        `insert into public.orders (
           company_id, code, customer_id, status, total, is_credit_sale,
           cashier_pending_at, created_by, voided_at, voided_by, void_reason, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [
          companyId, o.code,
          o.customerId == null ? null : mappedC.get(String(o.customerId)) ?? null,
          isVoided ? 'voided' : 'completed',
          total,
          isCompleted && total > settledSum, // outstanding AR => credit sale
          o.customFieldsCashierpendingat ?? null,
          mapUser(o.customFieldsCreatedbyuseridid),
          isVoided ? o.customFieldsReversedat ?? o.updatedAt : null,
          isVoided ? mapUser(o.customFieldsReversedbyuseridid) : null,
          isVoided ? 'Migrated void (Vendure reversal)' : null,
          o.createdAt,
        ]);
      const orderId = orow[0].id;
      await mapPut(companyId, 'order', o.id, orderId);
      so.inserted++;

      for (const lr of lineRows) {
        await tgt.query(
          `insert into public.order_lines (
             order_id, company_id, variant_id, quantity, unit_price, custom_price,
             price_override_reason, line_total
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [orderId, companyId, lr.variantId, lr.qty, lr.listPrice, lr.customUnit, lr.reason, lr.lineTotal]);
        sl.inserted++;
      }
      for (const p of pays) {
        if (p.amount == null || p.amount <= 0) { warn(`payment ${p.id}: non-positive amount ${p.amount}; skipped`); spay.skipped++; continue; }
        const method = String(p.method).replace(/-\d+$/, '');
        if (!['cash', 'mpesa', 'bank', 'credit'].includes(method)) {
          warn(`payment ${p.id}: unknown method '${p.method}' -> kept as '${method}'`);
        }
        const state = p.state === 'Settled' ? 'settled' : 'cancelled';
        if (p.state !== 'Settled' && p.state !== 'Cancelled') {
          warn(`payment ${p.id}: state '${p.state}' -> 'cancelled'`);
        }
        await tgt.query(
          `insert into public.payments (company_id, order_id, method_code, amount, reference, mpesa_receipt, status, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [companyId, orderId, method, p.amount, p.transactionId ?? null,
           method === 'mpesa' ? p.transactionId ?? null : null, state, p.createdAt]);
        spay.inserted++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. cashier_sessions + cash_drawer_counts + reconciliations
  //    (migrated BEFORE the ledger so meta.openSessionId can be remapped)
  // -------------------------------------------------------------------------
  {
    const ss = stat('cashier_sessions');
    const sd = stat('cash_drawer_counts');
    const sr = stat('reconciliations');
    const { rows: sessions } = await src.query(
      'select * from cashier_session where "channelId"=$1 order by "openedAt"', [channel.id]);
    const mappedS = await mapAll(companyId, 'session');
    for (const sess of sessions) {
      let newSessionId = mappedS.get(sess.id) ?? null;
      if (newSessionId) ss.existing++;
      else if (DRY) { ss.inserted++; newSessionId = crypto.randomUUID(); }
      else {
        const cashier = mapUser(sess.cashierUserId);
        if (!cashier) warn(`session ${sess.id}: cashier user ${sess.cashierUserId} unmappable; cashier_user_id null violates not-null — using first admin`);
        const { rows } = await tgt.query(
          `insert into public.cashier_sessions (company_id, cashier_user_id, status, opened_at, closed_at, closing_declared, created_at)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [companyId, cashier ?? firstMemberAuthId, sess.status === 'open' ? 'open' : 'closed',
           sess.openedAt, sess.closedAt, sess.closingDeclared, sess.openedAt]);
        newSessionId = rows[0].id;
        await mapPut(companyId, 'session', sess.id, newSessionId);
        ss.inserted++;
      }

      const { rows: counts } = await src.query(
        'select * from cash_drawer_count where "sessionId"=$1 order by "takenAt"', [sess.id]);
      const mappedD = await mapAll(companyId, 'drawer_count');
      for (const d of counts) {
        if (mappedD.has(d.id)) { sd.existing++; continue; }
        if (DRY) { sd.inserted++; continue; }
        const ct = String(d.countType).toLowerCase();
        if (!['opening', 'closing', 'mid_shift'].includes(ct)) {
          warn(`drawer count ${d.id}: unknown type '${d.countType}'; skipped`); sd.skipped++; continue;
        }
        const { rows } = await tgt.query(
          `insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [newSessionId, companyId, ct, d.declaredCash, d.expectedCash, d.variance,
           mapUser(d.countedByUserId), d.takenAt]);
        await mapPut(companyId, 'drawer_count', d.id, rows[0].id);
        sd.inserted++;
      }
    }

    const { rows: recons } = await src.query(
      'select * from reconciliation where "channelId"=$1 order by "snapshotAt"', [channel.id]);
    const mappedR = await mapAll(companyId, 'reconciliation');
    const sessionMap = await mapAll(companyId, 'session');
    for (const r of recons) {
      if (mappedR.has(r.id)) { sr.existing++; continue; }
      if (DRY) { sr.inserted++; continue; }
      const scope = ['cash-session', 'manual', 'method'].includes(r.scope) ? r.scope : 'manual';
      if (scope !== r.scope) warn(`reconciliation ${r.id}: scope '${r.scope}' -> 'manual'`);
      // target check: ('verified','recorded'); source 'draft' -> 'recorded'
      const status = r.status === 'verified' ? 'verified' : 'recorded';
      if (r.status !== 'verified' && r.status !== 'recorded') {
        warn(`reconciliation ${r.id}: status '${r.status}' -> 'recorded'`);
      }
      // scopeRefId like '<session uuid>:closing' — remap the session prefix
      let ref = r.scopeRefId;
      const m = /^([0-9a-f-]{36})(:.*)?$/i.exec(ref ?? '');
      if (m && sessionMap.has(m[1])) ref = sessionMap.get(m[1]) + (m[2] ?? '');
      const { rows } = await tgt.query(
        `insert into public.reconciliations (company_id, scope, scope_ref_id, status, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [companyId, scope, ref, status, mapUser(r.createdBy), r.snapshotAt]);
      const newReconId = rows[0].id;
      await mapPut(companyId, 'reconciliation', r.id, newReconId);
      const { rows: accts } = await src.query(
        `select ra.*, la.code from reconciliation_account ra
         join ledger_account la on la.id = ra."accountId" where ra."reconciliationId"=$1`, [r.id]);
      for (const a of accts) {
        let expected = a.expectedAmountCents;
        let variance = a.varianceCents;
        if (expected == null || variance == null) {
          // Source leaves expected/variance NULL on opening reconciliations.
          // Reconstruct from the ledger: the old variance-adjustment sourceId
          // is '<sessionId>-<accountCode>-<reconciliationId>'; the net on the
          // counted account IS the variance (declared - expected).
          const { rows: v } = await src.query(
            `select coalesce(sum(l.debit - l.credit),0)::text as net
             from ledger_journal_entry e
             join ledger_journal_line l on l."entryId" = e.id
             join ledger_account la on la.id = l."accountId"
             where e."channelId"=$1 and e."sourceType"='variance-adjustment'
               and e."sourceId" like $2 and la.code=$3`,
            [channel.id, `%-${a.code}-${r.id}`, a.code]);
          variance = Number(v[0].net);
          expected = a.declaredAmountCents - variance;
          warn(`reconciliation ${r.id} account ${a.code}: null expected/variance reconstructed from ledger (variance=${variance})`);
        }
        await tgt.query(
          `insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
           values ($1,$2,$3,$4,$5)`,
          [newReconId, a.code, a.declaredAmountCents, expected, variance]);
      }
      sr.inserted++;
    }
  }

  // -------------------------------------------------------------------------
  // 9. ledger — verbatim. Idempotent via (company_id, source_type, source_id).
  //    meta remapped: customerId/supplierId -> new customer uuid,
  //    openSessionId -> new session uuid, orderId -> order_id column.
  // -------------------------------------------------------------------------
  {
    const se = stat('ledger_entries');
    const sl = stat('ledger_lines');
    const orderMap = await mapAll(companyId, 'order');
    const custMap = await mapAll(companyId, 'customer');
    const sessMap = await mapAll(companyId, 'session');
    const orderSession = new Map(); // new order uuid -> new session uuid (backfill)

    if (!DRY) {
      const { rows: entries } = await src.query(
        'select * from ledger_journal_entry where "channelId"=$1 order by "postedAt", id', [channel.id]);
      const entryIdMap = new Map(); // old entry uuid -> new entry uuid

      // pass 1: entries
      const newEntryOldIds = new Set(); // old uuids inserted THIS run
      for (const e of entries) {
        const ins = await tgt.query(
          `insert into public.ledger_journal_entries (company_id, entry_date, posted_at, source_type, source_id, memo)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (company_id, source_type, source_id) do nothing returning id`,
          [companyId, e.entryDate, e.postedAt, e.sourceType, e.sourceId, e.memo]);
        if (!ins.rows.length) {
          const ex = await tgt.query(
            'select id from public.ledger_journal_entries where company_id=$1 and source_type=$2 and source_id=$3',
            [companyId, e.sourceType, e.sourceId]);
          entryIdMap.set(e.id, ex.rows[0]?.id ?? null);
          se.existing++;
        } else {
          entryIdMap.set(e.id, ins.rows[0].id);
          newEntryOldIds.add(e.id);
          se.inserted++;
        }
      }
      // reversal_of via entry map (all entries now exist)
      for (const e of entries) {
        if (e.reversalOf && entryIdMap.get(e.reversalOf)) {
          await tgt.query('update public.ledger_journal_entries set reversal_of=$1 where id=$2 and reversal_of is null',
            [entryIdMap.get(e.reversalOf), entryIdMap.get(e.id)]);
        }
      }

      // pass 2: lines, only for entries inserted this run (their lines were
      // written atomically with them, so pre-existing entries are done)
      const { rows: lines } = await src.query(
        `select l.*, a.code as account_code from ledger_journal_line l
         join ledger_account a on a.id = l."accountId"
         where l."channelId"=$1 order by l."entryId", l.id`, [channel.id]);
      for (const l of lines) {
        if (!newEntryOldIds.has(l.entryId)) { sl.existing++; continue; }
        const newEntryId = entryIdMap.get(l.entryId);
        const meta = { ...(l.meta ?? {}) };
        let orderId = null;
        if (meta.orderId != null) {
          const mapped = orderMap.get(String(meta.orderId));
          if (mapped) { orderId = mapped; delete meta.orderId; }
          else warn(`ledger line ${l.id}: orderId ${meta.orderId} not migrated (parked/draft?); kept in meta`);
        }
        for (const k of ['customerId', 'supplierId']) {
          if (meta[k] != null) {
            const mapped = custMap.get(String(meta[k]));
            if (mapped) meta[k] = mapped;
            else warn(`ledger line ${l.id}: ${k} ${meta[k]} not migrated; kept as-is`);
          }
        }
        if (meta.openSessionId != null) {
          const mapped = sessMap.get(String(meta.openSessionId));
          if (mapped) {
            meta.openSessionId = mapped;
            if (orderId && !orderSession.has(orderId)) orderSession.set(orderId, mapped);
          } else warn(`ledger line ${l.id}: openSessionId ${meta.openSessionId} not migrated; kept as-is`);
        }
        const accountId = accountByCode.get(l.account_code);
        if (!accountId) { warn(`ledger line ${l.id}: account '${l.account_code}' missing in target; line skipped`); sl.skipped++; continue; }
        if (l.debit > 0 && l.credit > 0) {
          // Old reversals wrote swapped totals on ONE line (both sides set).
          // Target enforces single-sided lines (debit=0 or credit=0): split
          // into two lines — per-account totals are identical.
          warn(`ledger line ${l.id}: double-sided (D${l.debit}/C${l.credit}) split into two single-sided lines`);
          await tgt.query(
            `insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
             values ($1,$2,$3,$4,$5,0,$7), ($1,$2,$3,$4,0,$6,$7)`,
            [newEntryId, companyId, accountId, orderId, l.debit, l.credit, JSON.stringify(meta)]);
          sl.inserted += 2;
        } else {
          await tgt.query(
            `insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [newEntryId, companyId, accountId, orderId, l.debit, l.credit, JSON.stringify(meta)]);
          sl.inserted++;
        }
      }

      // backfill orders.cashier_session_id from remapped meta (new-system link)
      for (const [oid, sid] of orderSession) {
        await tgt.query(
          'update public.orders set cashier_session_id=$1 where id=$2 and cashier_session_id is null',
          [sid, oid]);
      }
    } else {
      const { rows: c } = await src.query(
        `select (select count(*)::int from ledger_journal_entry where "channelId"=$1) as entries,
                (select count(*)::int from ledger_journal_line where "channelId"=$1) as lines,
                (select count(*)::int from ledger_journal_line where "channelId"=$1 and debit>0 and credit>0) as doubles`,
        [channel.id]);
      se.inserted = c[0].entries; sl.inserted = c[0].lines + c[0].doubles;
    }
  }

  // -------------------------------------------------------------------------
  // 10. assets: disk (Vendure asset store) -> Supabase Storage bucket
  //     'product-images' under <company_id>/, then set products.image_path /
  //     companies.logo_path. v2 keeps ONE image per product family: the
  //     featured asset (else position 0); gallery extras and variant-level
  //     assets have no v2 target field and are noted + skipped.
  //     Skip-safe: a missing source file or failed upload warns + continues.
  // -------------------------------------------------------------------------
  {
    const s = stat('assets');
    const { rows: prodAssets } = await src.query(
      `select pa."productId", pa."assetId", pa.position,
              (p."featuredAssetId" = pa."assetId") as featured,
              a.source, a."mimeType"
       from product_asset pa
       join product_channels_channel pcc on pcc."productId" = pa."productId"
       join product p on p.id = pa."productId"
       join asset a on a.id = pa."assetId"
       where pcc."channelId"=$1 and p."deletedAt" is null
       order by pa."productId", pa.position`, [channel.id]);
    const { rows: varAssets } = await src.query(
      `select pva."assetId" from product_variant_asset pva
       join product_variant_channels_channel vcc on vcc."productVariantId"=pva."productVariantId"
       where vcc."channelId"=$1`, [channel.id]);
    const { rows: logoRows } = await src.query(
      `select a.id, a.source, a."mimeType" from channel c
       join asset a on a.id = c."customFieldsCompanylogoassetid" where c.id=$1`, [channel.id]);

    // chosen upload per product: featured asset, else lowest position
    const byProduct = new Map(); // productId -> {assetId, source, mimeType, extras}
    for (const a of prodAssets) {
      const cur = byProduct.get(a.productId);
      if (!cur) byProduct.set(a.productId, { ...a, extras: 0 });
      else if (a.featured && !cur.featured) { cur.extras++; byProduct.set(a.productId, { ...a, extras: cur.extras }); }
      else cur.extras++;
    }
    const logo = logoRows[0] ?? null;
    if (varAssets.length) {
      s.skipped += varAssets.length;
      console.log(`  assets: ${varAssets.length} variant-level asset(s) have no v2 target field; skipped`);
    }

    const storagePath = asset => `${companyId}/asset-${asset.assetId ?? asset.id}${path.extname(asset.source)}`;
    const filePath = asset => path.join(VENDURE_ASSET_DIR, asset.source);

    if (DRY) {
      for (const [pid, a] of byProduct) {
        if (fs.existsSync(filePath(a))) { s.inserted++; console.log(`  plan asset: product ${pid} <- ${a.source} -> ${storagePath(a)}`); }
        else { s.skipped++; console.log(`  WARN: asset file missing on disk: ${filePath(a)}`); }
        if (a.extras) console.log(`  NOTE: product ${pid} has ${a.extras} gallery image(s) beyond the featured one; no v2 field, skipped`);
      }
      if (logo) {
        if (fs.existsSync(filePath(logo))) { s.inserted++; console.log(`  plan asset: company logo <- ${logo.source} -> ${storagePath(logo)}`); }
        else { s.skipped++; console.log(`  WARN: asset file missing on disk: ${filePath(logo)}`); }
      }
      if (!byProduct.size && !logo) console.log('  assets: none in source');
    } else {
      const mappedP = await mapAll(companyId, 'product');
      // bucket is provisioned by migration 0022; create if missing (e.g. fresh env)
      const bk = await supaApi('/storage/v1/bucket', {
        method: 'POST',
        body: JSON.stringify({ id: 'product-images', name: 'product-images', public: true }),
      });
      if (!bk.ok) {
        const body = await bk.text();
        if (!/already|duplicate|exist/i.test(body)) warn(`bucket create: ${bk.status} ${body}`);
      }

      async function copyAsset(asset, setPath, label) {
        const file = filePath(asset);
        if (!fs.existsSync(file)) { warn(`${label}: source file missing on disk (${file}); skipped`); s.skipped++; return; }
        const target = storagePath(asset);
        const up = await supaApi(`/storage/v1/object/product-images/${target}`, {
          method: 'POST',
          headers: { 'content-type': asset.mimeType ?? 'application/octet-stream', 'x-upsert': 'true' },
          body: fs.readFileSync(file),
        });
        if (!up.ok) { warn(`${label}: storage upload failed (${up.status} ${await up.text()}); skipped`); s.skipped++; return; }
        const changed = await setPath(target);
        changed ? s.inserted++ : s.existing++;
      }

      for (const [pid, a] of byProduct) {
        const newPid = mappedP.get(String(pid));
        if (!newPid) { warn(`asset ${a.assetId}: product ${pid} not migrated; skipped`); s.skipped++; continue; }
        await copyAsset(a, async target => {
          const r = await tgt.query(
            'update public.products set image_path=$1 where id=$2 and image_path is distinct from $1',
            [target, newPid]);
          return r.rowCount > 0;
        }, `asset ${a.assetId} (product ${pid})`);
        if (a.extras) {
          s.skipped += a.extras;
          console.log(`  NOTE: product ${pid} has ${a.extras} gallery image(s) beyond the featured one; no v2 field, skipped`);
        }
      }
      if (logo) {
        await copyAsset(logo, async target => {
          const r = await tgt.query(
            'update public.companies set logo_path=$1 where id=$2 and logo_path is distinct from $1',
            [target, companyId]);
          return r.rowCount > 0;
        }, `asset ${logo.id} (company logo)`);
      }
      if (!byProduct.size && !logo) console.log('  assets: none in source');
    }
  }

  // -------------------------------------------------------------------------
  // done
  // -------------------------------------------------------------------------
  if (FLAGS.apply) {
    await tgt.query('commit');
    console.log('\nCOMMITTED.');
    // audit: export this company's etl_id_map (scripts/etl/export-map.mjs)
    try {
      const out = execFileSync(process.execPath,
        [path.join(ETL_DIR, 'export-map.mjs'), '--channel', String(channel.id)],
        { encoding: 'utf8' });
      process.stdout.write(out);
    } catch (e) {
      warn('etl_id_map export failed: ' + e.message);
    }
  } else {
    console.log('\nDRY RUN — nothing written.');
  }
} catch (err) {
  if (FLAGS.apply) await tgt.query('rollback');
  console.error('\nFAILED, rolled back:', err.message);
  throw err;
} finally {
  // report
  console.log('\n--- counts ---');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: inserted/planned=${v.inserted} existing=${v.existing} skipped=${v.skipped}`);
  }
  if (skippedParked.length) {
    console.log('\n--- skipped draft/parked orders (close before cutover) ---');
    for (const o of skippedParked) console.log(`  order ${o.id} ${o.code} state=${o.state} total=${o.total}`);
  }
  if (warnings.length) {
    console.log(`\n--- ${warnings.length} warning(s) above ---`);
  }
  await src.end();
  await tgt.end();
}
