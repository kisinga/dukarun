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
// Money is integer cents in the SOURCE (Vendure). The app now stores integer shillings:
// if this ETL is ever re-run against a live target, divide all money values by 100 first.
// int8 is parsed to Number (all values << 2^53).
// SOURCE is read-only; TARGET writes bypass RPCs deliberately (migration, not app traffic).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SRC_DSN =
  process.env.SOURCE_DB_URL ?? 'postgres://vendure:changeme-secure-password@localhost:5432/vendure';
const TGT_DSN =
  process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

// Supabase API config for the --prod auth branch and asset uploads.
// SUPABASE_SERVICE_ROLE_KEY is required for --prod/asset uploads — get the
// local one from `npx supabase status -o env`; never hardcode a real key.
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
// Vendure asset store root (asset.source is relative to this).
const VENDURE_ASSET_DIR =
  process.env.VENDURE_ASSET_DIR ??
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'archive',
    'vendure',
    'backend',
    'static',
    'assets'
  );
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
  console.error(
    'usage: node scripts/etl/migrate.mjs --channel <id> [--apply] [--name "..."] [--prod]'
  );
  process.exit(1);
}

const src = new pg.Client(SRC_DSN);
const tgt = new pg.Client(TGT_DSN);
await src.connect();
await tgt.connect();

const stats = {}; // step -> {inserted, skippedExisting, ...}
const warnings = [];
const skippedParked = [];
const warn = m => {
  warnings.push(m);
  console.log('  WARN: ' + m);
};
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
    [type, String(oldId), companyId]
  );
  return rows[0]?.new_id ?? null;
}
async function mapAll(companyId, type) {
  const { rows } = await tgt.query(
    'select old_id, new_id from public.etl_id_map where old_type=$1 and company_id=$2',
    [type, companyId]
  );
  return new Map(rows.map(r => [r.old_id, r.new_id]));
}
async function mapPut(companyId, type, oldId, newId) {
  await tgt.query(
    'insert into public.etl_id_map (old_type, old_id, new_id, company_id) values ($1,$2,$3,$4) on conflict do nothing',
    [type, String(oldId), newId, companyId]
  );
}

// ---------------------------------------------------------------------------
// Supabase API helpers (service role). Used by the --prod auth branch and by
// copyAssets(). 429 -> exponential backoff retry.
// ---------------------------------------------------------------------------
async function supaApi(pathname, init = {}, attempt = 0) {
  if (!SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env required (local: `npx supabase status -o env`)');
  let res;
  try {
    res = await fetch(SUPABASE_URL + pathname, {
      ...init,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        ...(init.body && !init.headers?.['content-type']
          ? { 'content-type': 'application/json' }
          : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    // Transient network failure (ETIMEDOUT, ECONNRESET, EHOSTUNREACH...) —
    // safe to retry: user creation resolves conflicts via lookup afterwards.
    if (attempt < 5) {
      const wait = 1000 * 2 ** attempt;
      console.log(
        `  WARN: Supabase API network error (${err.cause?.code ?? err.message}); retrying in ${wait}ms`
      );
      await new Promise(r => setTimeout(r, wait));
      return supaApi(pathname, init, attempt + 1);
    }
    throw err;
  }
  if (res.status === 429 && attempt < 5) {
    const wait = 1000 * 2 ** attempt;
    console.log(`  WARN: Supabase API rate-limited (429); retrying in ${wait}ms`);
    await new Promise(r => setTimeout(r, wait));
    return supaApi(pathname, init, attempt + 1);
  }
  return res;
}

// Vendure stores money in integer CENTS; v2 uses integer SHILLINGS
// (see apps/web/src/app/core/money.ts). Convert every money field with M().
// Quantities, days, counts, thresholds in units, and ids are NOT money.
// A nonzero source amount must never round to zero (v2 has a nonzero line
// check): sub-shilling amounts floor to 1.
const M = v => {
  if (v == null) return null;
  const n = Number(v);
  if (n === 0) return 0;
  const r = Math.round(n / 100);
  return r === 0 ? (n > 0 ? 1 : -1) : r;
};

// Vendure identifiers are Kenyan local phones ('0712345678') or usernames
// ('superadmin'); v2 auth is phone-OTP with E.164-minus-plus ('2547...',
// see seed.sql). Returns null for non-phone identifiers.
function normalizePhone(identifier) {
  const d = String(identifier ?? '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return '254' + d.slice(1);
  if (/^254\d{9}$/.test(d)) return d;
  if (/^[17]\d{8}$/.test(d)) return '254' + d;
  return null;
}
// Non-phone identifiers (platform superadmin) can't be GoTrue phone users;
// they get an email-identity row so FK references (sessions, counts, audit
// actors) resolve. Login for them happens out-of-band (platform provisioning).
const syntheticEmail = identifier =>
  `v1-${String(identifier)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')}@migrated.dukarun.invalid`;

// --prod: create an auth user via the GoTrue Admin API. Falls back to an
// admin-API lookup when the user is already registered.
async function createAuthUserProd(u, phone) {
  // Source "emails" are often login identifiers (phone/username), not real
  // addresses — GoTrue 400s on invalid formats. Only pass email through when
  // it is actually email-shaped.
  const email = u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) ? u.email : null;
  if (u.email && !email)
    warn(`user ${u.identifier}: email '${u.email}' not email-shaped; not carried over`);
  const payload = phone
    ? { phone, phone_confirm: true }
    : (warn(
        `user ${u.identifier}: not a phone number; creating email-identity auth user (no phone login)`
      ),
      { email: syntheticEmail(u.identifier), email_confirm: true });
  if (phone && email) Object.assign(payload, { email, email_confirm: true });
  payload.user_metadata = { migrated_from: 'vendure', vendure_identifier: u.identifier };
  const res = await supaApi('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.ok) return (await res.json()).id;
  const body = await res.text();
  if (res.status === 422 || /already|exists/i.test(body)) {
    const found = phone
      ? await findAuthUserBy('phone', phone)
      : await findAuthUserBy('email', syntheticEmail(u.identifier));
    if (found) return found;
  }
  throw new Error(`admin create user failed: ${res.status} ${body}`);
}

async function findAuthUserBy(field, value) {
  for (let page = 1; page <= 50; page++) {
    const res = await supaApi(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) throw new Error(`admin list users failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    const users = Array.isArray(j) ? j : (j.users ?? []);
    const hit = users.find(x => x[field] === value);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

const parseJsonText = (v, label) => {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    warn(`${label}: unparseable JSON text, set null`);
    return null;
  }
};
const prettify = code => code.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ---------------------------------------------------------------------------
// load source channel
// ---------------------------------------------------------------------------
const { rows: chRows } = await src.query('select * from channel where id=$1', [FLAGS.channel]);
const channel = chRows[0];
if (!channel) {
  console.error(`channel ${FLAGS.channel} not found`);
  process.exit(1);
}
console.log(
  `\n=== MIGRATE channel ${channel.id} (${channel.code}) ${FLAGS.apply ? '-- APPLY' : '-- DRY RUN'} ===`
);

// Resume: company already migrated?
let companyId = null;
{
  const { rows } = await tgt.query(
    `select new_id from public.etl_id_map where old_type='channel' and old_id=$1`,
    [String(channel.id)]
  );
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
    const { rows: standardTiers } = await tgt.query(
      "select id from public.subscription_tiers where code='standard' and is_active limit 1"
    );
    const standardTierId = standardTiers[0]?.id ?? null;
    if (!standardTierId) {
      throw new Error("target subscription tier 'standard' is missing or inactive");
    }
    if (resumed) {
      if (!DRY) {
        await tgt.query(
          `update public.companies
           set subscription_tier_id=$2, updated_at=now()
           where id=$1 and subscription_tier_id is distinct from $2`,
          [companyId, standardTierId]
        );
      }
      s.existing++;
    } else if (DRY) {
      s.inserted++;
      console.log(
        `  plan company: code=${channel.code} name=${FLAGS.name ?? prettify(channel.code)}`
      );
    } else {
      const status = (channel.customFieldsStatus ?? 'unapproved').toLowerCase();
      if (!['unapproved', 'approved', 'disabled', 'banned'].includes(status)) {
        warn(`unknown channel status '${channel.customFieldsStatus}' -> 'unapproved'`);
      }
      const subStatus = channel.customFieldsSubscriptionstatus?.toLowerCase() ?? null;
      if (subStatus && !['trial', 'active', 'expired', 'cancelled'].includes(subStatus)) {
        warn(`unknown subscription status '${subStatus}' -> null`);
      }
      const billing = channel.customFieldsBillingcycle?.toLowerCase() ?? null;
      if (billing && !['monthly', 'yearly'].includes(billing))
        warn(`unknown billing cycle '${billing}' -> null`);
      // public_slug is unique in target; drop it if another company took it
      let slug = channel.customFieldsPublicslug ?? null;
      if (slug) {
        const clash = await tgt.query('select 1 from public.companies where public_slug=$1', [
          slug,
        ]);
        if (clash.rows.length) {
          warn(`public_slug '${slug}' already taken in target -> null`);
          slug = null;
        }
      }
      const name = FLAGS.name ?? prettify(channel.code);
      // Every imported company receives the Standard capability bundle. A
      // company without a live paid subscription still gets a time-limited
      // trial status; tier controls capabilities, while status controls access
      // duration. Live subscribers keep their verbatim subscription state.
      const subExpiry = channel.customFieldsSubscriptionexpiresat
        ? new Date(channel.customFieldsSubscriptionexpiresat)
        : null;
      const hasLiveSub = subStatus === 'active' && subExpiry !== null && subExpiry > new Date();
      const launchTrialEnd = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      if (!hasLiveSub) {
        console.log(
          `  launch trial: Standard tier for 1 week (expires ${launchTrialEnd.toISOString().slice(0, 10)})`
        );
      }
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
          channel.code,
          name,
          channel.defaultCurrencyCode ?? 'KES',
          ['unapproved', 'approved', 'disabled', 'banned'].includes(status) ? status : 'unapproved',
          channel.customFieldsPublicstorefrontenabled ?? false,
          slug,
          channel.customFieldsPublicwhatsappnumber ?? null,
          channel.customFieldsCashierflowenabled ?? false,
          channel.customFieldsBatchexpiryenabled ?? false,
          channel.customFieldsLowstockthreshold ?? 10,
          channel.customFieldsCashcontrolenabled ?? true,
          channel.customFieldsRequireopeningcount ?? true,
          M(channel.customFieldsVariancenotificationthreshold ?? 10000),
          channel.customFieldsEnableprinter ?? true,
          parseJsonText(
            channel.customFieldsNotificationcategorypreferences,
            'notificationCategoryPreferences'
          ),
          standardTierId,
          hasLiveSub
            ? ['trial', 'active', 'expired', 'cancelled'].includes(subStatus)
              ? subStatus
              : null
            : 'trial',
          hasLiveSub ? channel.customFieldsTrialendsat : launchTrialEnd,
          hasLiveSub ? channel.customFieldsSubscriptionstartedat : null,
          hasLiveSub ? channel.customFieldsSubscriptionexpiresat : launchTrialEnd,
          hasLiveSub && ['monthly', 'yearly'].includes(billing) ? billing : null,
          channel.customFieldsPaystackcustomercode,
          channel.customFieldsPaystacksubscriptioncode,
          channel.customFieldsLastpaymentdate,
          M(channel.customFieldsLastpaymentamount),
          channel.customFieldsSubscriptionexpiredremindersentat,
          channel.customFieldsSubscriptionexemptuntil,
          channel.customFieldsSubscriptionexemptreason,
          hasLiveSub ? channel.customFieldsSubscriptiongraceperiodend : null,
          channel.customFieldsSmsusedthisperiod ?? 0,
          channel.customFieldsSmsperiodend,
          parseJsonText(channel.customFieldsSmsusagebycategory, 'smsUsageByCategory'),
        ]
      );
      companyId = rows[0].id;
      await mapPut(companyId, 'channel', channel.id, companyId);
      s.inserted++;
      console.log(`  company inserted: ${companyId} (${channel.code} / ${name})`);
    }
  }

  // Post-squash triggers (assign_operational_location on orders/lines/payments)
  // resolve tenant + location via JWT claims (current_company_id(),
  // current_user_can_access_location()). The ETL connects as superuser with no
  // JWT, so impersonate a platform admin for the rest of the transaction.
  // set_config(..., true) is transaction-local; no-op in dry runs.
  if (FLAGS.apply && companyId) {
    await tgt.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({
        sub: crypto.randomUUID(),
        company_id: companyId,
        user_role: 'Admin',
        is_platform_admin: true,
        role: 'service_role',
      }),
    ]);
    // Layaway orders insert as pending_payment, which enforce_order_cashier_flow
    // blocks when the company has the cashier queue off (jutik). The external
    // hold flag is the designed bypass for parked orders from outside that flow.
    await tgt.query(`select set_config('app.external_payment_hold', 'on', true)`);
    // Rounding-drift repair (cents→shillings) adjusts ledger lines post-insert;
    // the immutability guard only permits that with this flag.
    await tgt.query(`select set_config('app.allow_ledger_mutation', 'on', true)`);
    await tgt.query(`select set_config('app.bypass_business_limits', 'on', true)`);
  }

  // -------------------------------------------------------------------------
  // 2. users + roles + memberships
  //    A Vendure user may hold roles in several channels. Every channel run
  //    resolves the same phone/email to the same GoTrue user, then adds the
  //    company-specific membership. Legacy Vendure superadmins are deliberately
  //    excluded: v2 platform admins are provisioned explicitly in Supabase.
  // -------------------------------------------------------------------------
  const userMap = new Map(); // vendure user id (string) -> auth uuid
  let firstMemberAuthId = null;
  {
    const { rows: admins } = await src.query(
      `select a.id as admin_id, u.id as user_id, u.identifier, u.verified,
              a."emailAddress", a."firstName", a."lastName"
       from administrator a
       join "user" u on u.id = a."userId"
       join user_roles_role ur on ur."userId" = u.id
       join role r on r.id = ur."roleId"
       where r.code <> '__super_admin_role__'
         and exists (
           select 1 from role_channels_channel rc
           where rc."roleId" = r.id and rc."channelId" = $1
         )
         and a."deletedAt" is null and u."deletedAt" is null
       group by a.id, u.id, u.identifier, u.verified,
                a."emailAddress", a."firstName", a."lastName"
       order by a.id`,
      [channel.id]
    );

    async function ensureAuthUser(u) {
      // keyed by phone = normalized vendure user.identifier (E.164-minus-plus)
      const phone = normalizePhone(u.identifier);
      if (phone) {
        const found = await tgt.query('select id from auth.users where phone=$1', [phone]);
        if (found.rows.length) return found.rows[0].id;
      }
      if (u.email) {
        const byEmail = await tgt.query('select id from auth.users where email=$1', [u.email]);
        if (byEmail.rows.length) return byEmail.rows[0].id;
      }
      if (!phone) {
        const bySynthetic = await tgt.query('select id from auth.users where email=$1', [
          syntheticEmail(u.identifier),
        ]);
        if (bySynthetic.rows.length) return bySynthetic.rows[0].id;
      }
      if (FLAGS.prod) {
        // Supabase Admin API (service role). Existing users were already
        // matched by phone/email above; createAuthUserProd additionally
        // resolves already-registered conflicts via an admin-API lookup.
        return await createAuthUserProd(u, phone);
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
        [id, u.email ?? null, phone ?? u.identifier]
      );
      return id;
    }

    const s = stat('users');
    const sm = stat('memberships');
    const mapped = await mapAll(companyId, 'user');
    const members = admins;
    for (const a of admins) {
      const key = String(a.user_id);
      let authId = mapped.get(key) ?? null;
      if (authId) {
        s.existing++;
      } else if (DRY) {
        s.inserted++;
        authId = crypto.randomUUID();
      } else {
        authId = await ensureAuthUser({ identifier: a.identifier, email: a.emailAddress });
        await mapPut(companyId, 'user', key, authId);
        s.inserted++;
      }
      userMap.set(key, authId);
    }
    // roles: get-or-create by (company_id, name); on re-runs, top up the
    // template-managed roles' permissions (audit/staff/commissions were added
    // after the first prod import) without touching custom roles.
    async function ensureRole(name, permissions) {
      if (DRY) return crypto.randomUUID();
      const f = await tgt.query(
        'select id, permissions from public.roles where company_id=$1 and name=$2',
        [companyId, name]
      );
      if (f.rows.length) {
        const missing = permissions.filter(p => !f.rows[0].permissions.includes(p));
        if (missing.length && ['Admin', 'Cashier'].includes(name)) {
          await tgt.query('update public.roles set permissions=$2 where id=$1', [
            f.rows[0].id,
            [...f.rows[0].permissions, ...missing],
          ]);
          warn(`role '${name}': added permissions ${missing.join(', ')}`);
        }
        return f.rows[0].id;
      }
      const { rows } = await tgt.query(
        'insert into public.roles (company_id, name, permissions) values ($1,$2,$3) returning id',
        [companyId, name, permissions]
      );
      return rows[0].id;
    }
    // Admin gets ALL permissions the schema allows (parsed from the roles
    // check constraint) — independent of any role-name mapping, and future
    // permissions flow to migrated Admins automatically. Hardcoded fallback
    // for dry runs / older schemas.
    const FALLBACK_PERMS = [
      'ManageApprovals',
      'OverridePrice',
      'ManageStockAdjustments',
      'ApproveCustomerCredit',
      'ManageCustomerCreditLimit',
      'ReverseOrder',
      'OverrideCustomerBalance',
      'SettleOrder',
      'ManageSupplierCreditPurchases',
      'ViewFinancials',
      'ManageReconciliation',
      'CloseAccountingPeriod',
      'CreateInterAccountTransfer',
      'ManageTeam',
      'ViewAuditTrail',
      'ViewStaffPerformance',
      'ManageCommissions',
    ];
    let ALL_PERMS = FALLBACK_PERMS;
    if (!DRY) {
      const { rows: pc } = await tgt.query(
        `select pg_get_constraintdef(oid) as def from pg_constraint
         where conrelid='public.roles'::regclass and contype='c'
           and pg_get_constraintdef(oid) like '%permissions <@%'`
      );
      const parsed = [...(pc[0]?.def ?? '').matchAll(/'([^']+)'::text/g)].map(m => m[1]);
      if (parsed.length) ALL_PERMS = parsed;
    }
    const adminRoleId = members.length ? await ensureRole('Admin', ALL_PERMS) : null;
    const cashierRoleId = members.length > 1 ? await ensureRole('Cashier', ['SettleOrder']) : null;

    for (let i = 0; i < members.length; i++) {
      const authId = userMap.get(String(members[i].user_id));
      if (!firstMemberAuthId) firstMemberAuthId = authId;
      if (DRY) {
        sm.inserted++;
        continue;
      }
      const roleId = i === 0 ? adminRoleId : cashierRoleId;
      const r = await tgt.query(
        `insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
         values ($1,$2,$3,'approved') on conflict (company_id, user_id) do nothing`,
        [companyId, authId, roleId]
      );
      r.rowCount ? sm.inserted++ : sm.existing++;
    }
    if (!members.length)
      warn('no non-superadmin administrators on channel; no memberships created');
  }
  const mapUser = uid =>
    uid == null ? null : (userMap.get(String(uid)) ?? firstMemberAuthId ?? null);

  // -------------------------------------------------------------------------
  // 3. chart of accounts + payment methods + stock location
  //    (same shapes as provision_company, inserted directly: the RPC needs
  //    auth claims and would also create a duplicate company)
  // -------------------------------------------------------------------------
  const accountByCode = new Map(); // code -> uuid
  {
    if (!DRY) {
      const s = stat('ledger_accounts');
      // The target schema treats M-Pesa as a real money account. Older ETL
      // runs used the pre-0029 clearing-account code, so normalize it before
      // the idempotent inserts below.
      await tgt.query(
        `update public.ledger_accounts
         set code='MPESA', name='M-Pesa', updated_at=now()
         where company_id=$1 and code='CLEARING_MPESA'`,
        [companyId]
      );
      await tgt.query(
        `update public.payment_methods
         set ledger_account_code='MPESA', updated_at=now()
         where company_id=$1 and ledger_account_code='CLEARING_MPESA'`,
        [companyId]
      );
      const { rows: cash } = await tgt.query(
        `insert into public.ledger_accounts (company_id, code, name, type, is_parent, is_system)
         values ($1,'CASH','Cash','asset',true,true)
         on conflict (company_id, code) do nothing returning id`,
        [companyId]
      );
      let cashId = cash[0]?.id;
      if (!cashId) {
        cashId = (
          await tgt.query(
            "select id from public.ledger_accounts where company_id=$1 and code='CASH'",
            [companyId]
          )
        ).rows[0].id;
        s.existing++;
      } else s.inserted++;
      const LEAVES = [
        ['CASH_ON_HAND', 'Cash on Hand', 'asset', 'CASH'],
        ['BANK_MAIN', 'Bank - Main', 'asset', 'CASH'],
        ['MPESA', 'M-Pesa', 'asset', 'CASH'],
        ['CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', null],
        ['CLEARING_GENERIC', 'Clearing - Generic', 'asset', null],
        ['ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', null],
        ['INVENTORY', 'Inventory', 'asset', null],
        ['SALES', 'Sales Revenue', 'income', null],
        ['SALES_RETURNS', 'Sales Returns', 'income', null],
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
          [companyId, code, name, type, parent === 'CASH' ? cashId : null]
        );
        r.rowCount ? s.inserted++ : s.existing++;
      }
      // These are the only accounts that users may choose for expenses,
      // transfers, and supplier payments. The column defaults to false, so
      // direct ETL inserts must explicitly apply the same rule as provisioning.
      await tgt.query(
        `update public.ledger_accounts
         set allow_manual_posting=(code in ('CASH_ON_HAND','BANK_MAIN','MPESA')),
             updated_at=now()
         where company_id=$1
           and allow_manual_posting<>(code in ('CASH_ON_HAND','BANK_MAIN','MPESA'))`,
        [companyId]
      );
      const pm = stat('payment_methods');
      const METHODS = [
        ['cash', 'Cash', 'CASH_ON_HAND', 'blind_count', true],
        ['mpesa', 'M-Pesa', 'MPESA', 'transaction_verification', true],
        ['bank', 'Bank Transfer', 'BANK_MAIN', 'statement_match', false],
        ['credit', 'Customer Credit', 'CLEARING_CREDIT', 'credit_ledger', false],
      ];
      for (const [code, name, acct, recType, cashierControlled] of METHODS) {
        const r = await tgt.query(
          `insert into public.payment_methods (company_id, code, name, ledger_account_code, reconciliation_type, is_cashier_controlled)
           values ($1,$2,$3,$4,$5,$6) on conflict (company_id, code) do nothing`,
          [companyId, code, name, acct, recType, cashierControlled]
        );
        r.rowCount ? pm.inserted++ : pm.existing++;
      }
    } else {
      stat('ledger_accounts').inserted = 21;
      stat('payment_methods').inserted = 4;
    }
    // stock location: source location name for this channel, else 'Main Store'
    const { rows: locs } = await src.query(
      `select sl.name from stock_location sl
       join stock_location_channels_channel c on c."stockLocationId" = sl.id
       where c."channelId"=$1 order by sl.id limit 1`,
      [channel.id]
    );
    const locName = locs[0]?.name ?? 'Main Store';
    if (!DRY) {
      const sl = stat('stock_locations');
      const r = await tgt.query(
        `insert into public.stock_locations (company_id, code, name) values ($1,'MAIN',$2)
         on conflict (company_id, code) do nothing`,
        [companyId, locName]
      );
      r.rowCount ? sl.inserted++ : sl.existing++;

      // Point the assign_operational_location trigger at MAIN: it reads the
      // app.business_location_id GUC, and resolve_business_location accepts it
      // (platform-admin claims set above pass the access check).
      const { rows: mainLoc } = await tgt.query(
        "select id from public.stock_locations where company_id=$1 and code='MAIN'",
        [companyId]
      );
      if (mainLoc[0]) {
        await tgt.query(`select set_config('app.business_location_id', $1, true)`, [mainLoc[0].id]);
        // Method-at-location availability (validate_payment_location trigger on
        // payments). Mirrors the RPC seeding in 0006_platform.
        await tgt.query(
          `insert into public.location_payment_methods(company_id, location_id, payment_method_id)
           select $1, $2, pm.id from public.payment_methods pm
           where pm.company_id = $1
           on conflict (location_id, payment_method_id) do nothing`,
          [companyId, mainLoc[0].id]
        );
      }
    } else stat('stock_locations').inserted = 1;

    if (!DRY) {
      const { rows } = await tgt.query(
        'select code, id from public.ledger_accounts where company_id=$1',
        [companyId]
      );
      for (const r of rows) accountByCode.set(r.code, r.id);
      // Vendure history uses the old clearing-account name. In v2 M-Pesa is a
      // real money account, but historical lines must still land on it.
      const mpesaAccountId = accountByCode.get('MPESA');
      if (mpesaAccountId) accountByCode.set('CLEARING_MPESA', mpesaAccountId);
    }
  }

  // -------------------------------------------------------------------------
  // 4. customers: channel members ∪ customers referenced by this channel's
  //    orders / ledger meta (cross-channel references observed in demo data).
  //    Soft-deleted customers that are still referenced (AR balances, order
  //    history) migrate too — v2 has no archived flag, so they're inserted as
  //    normal customers with a notes marker; unreferenced deleted members skip.
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
       ),
       referenced as (
         select o."customerId" as id from "order" o
           join order_channels_channel occ on occ."orderId"=o.id
           where occ."channelId"=$1 and o."customerId" is not null
         union
         select (meta->>'customerId')::int from ledger_journal_line
           where "channelId"=$1 and meta ? 'customerId'
         union
         select (meta->>'supplierId')::int from ledger_journal_line
           where "channelId"=$1 and meta ? 'supplierId'
       )
       select c.*, (c."deletedAt" is not null) as resurrected
       from customer c join ids on ids.id = c.id
       where c."deletedAt" is null or c.id in (select id from referenced)
       order by c.id`,
      [channel.id]
    );
    const mapped = await mapAll(companyId, 'customer');
    for (const c of custs) {
      const key = String(c.id);
      if (mapped.has(key)) {
        s.existing++;
        continue;
      }
      if (DRY) {
        s.inserted++;
        continue;
      }
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
          c.lastName || null,
          c.phoneNumber || null,
          c.emailAddress || null,
          c.customFieldsIssupplier ?? false,
          M(c.customFieldsCreditlimit ?? 0),
          c.customFieldsCreditduration ?? null,
          c.customFieldsIscreditapproved ?? false,
          c.customFieldsLastrepaymentdate ?? null,
          M(c.customFieldsLastrepaymentamount),
          c.customFieldsPaymentterms ?? null,
          c.customFieldsNotificationsenabled ?? true,
          c.resurrected
            ? [c.customFieldsNotes, 'v1: soft-deleted; migrated for AR/history']
                .filter(Boolean)
                .join(' | ')
            : (c.customFieldsNotes ?? null),
          M(c.customFieldsSuppliercreditlimit ?? 0),
          c.customFieldsSuppliercreditduration ?? null,
          c.createdAt,
        ]
      );
      if (c.resurrected)
        warn(
          `customer ${c.id} ('${c.firstName} ${c.lastName}') soft-deleted but referenced; migrated with notes marker`
        );
      await mapPut(companyId, 'customer', key, rows[0].id);
      s.inserted++;
    }
    const { rows: deleted } = await src.query(
      `select count(*)::int n from customer c join customer_channels_channel cc on cc."customerId"=c.id
       where cc."channelId"=$1 and c."deletedAt" is not null
         and not exists (
           select 1 from "order" o join order_channels_channel occ on occ."orderId"=o.id
           where occ."channelId"=$1 and o."customerId"=c.id)
         and not exists (
           select 1 from ledger_journal_line l
           where l."channelId"=$1
             and ((l.meta->>'customerId')::int = c.id or (l.meta->>'supplierId')::int = c.id))`,
      [channel.id]
    );
    if (deleted[0].n) {
      s.skipped = deleted[0].n;
      warn(`${deleted[0].n} unreferenced soft-deleted customers skipped`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. products + variants
  // -------------------------------------------------------------------------
  {
    const sp = stat('products');
    const sv = stat('variants');
    // Soft-deleted variants that are still referenced — by remaining stock or by
    // lines of migratable orders (completed/voided) — must migrate too, or their
    // batches and order lines silently vanish. They are inserted inactive with a
    // suffixed sku (`--archived-<id>`) so the live catalog keeps the clean sku.
    const MIGRATED_ORDER_STATES = [
      'Fulfilled',
      'Shipped',
      'Delivered',
      'PartiallyShipped',
      'PaymentSettled',
      'Cancelled',
      'ArrangingPayment', // layaway sales migrate as pending_payment (see orders step)
    ];
    const { rows: refDel } = await src.query(
      `select v.id, v."productId" from product_variant v
       where v."deletedAt" is not null and (
         exists (select 1 from inventory_batch b
                 where b."productVariantId"=v.id and b."channelId"=$1 and b.quantity>0)
         or exists (select 1 from order_line l
                    join "order" o on o.id = l."orderId" and o.type='Regular'
                    join order_channels_channel occ on occ."orderId"=o.id
                    where l."productVariantId"=v.id and occ."channelId"=$1
                      and (o.state = any($2) or o."customFieldsReversedat" is not null)))`,
      [channel.id, MIGRATED_ORDER_STATES]
    );
    const refDelIds = refDel.map(r => r.id);
    const refDelProductIds = [...new Set(refDel.map(r => r.productId))];
    if (refDelIds.length)
      console.log(
        `  ${refDelIds.length} soft-deleted variant(s) still referenced; migrating inactive`
      );
    const { rows: products } = await src.query(
      `select p.*, t.name as tname, false as resurrected from product p
       join product_channels_channel pcc on pcc."productId"=p.id
       left join product_translation t on t."baseId"=p.id and t."languageCode"='en'
       where pcc."channelId"=$1 and p."deletedAt" is null
       union
       select p.*, t.name as tname, true as resurrected from product p
       left join product_translation t on t."baseId"=p.id and t."languageCode"='en'
       where p."deletedAt" is not null and p.id = any($2)
       order by 1`,
      [channel.id, refDelProductIds.length ? refDelProductIds : [0]]
    );
    const mappedP = await mapAll(companyId, 'product');
    const mappedV = await mapAll(companyId, 'variant');
    const seenBarcodes = new Set();
    const productIds = products.map(p => p.id);
    const { rows: manufacturerRows } = productIds.length
      ? await src.query(
          `select pf."productId" as product_id,
                  coalesce(nullif(btrim(fvt.name), ''), fv.code) as manufacturer
           from product_facet_values_facet_value pf
           join facet_value fv on fv.id = pf."facetValueId"
           join facet f on f.id = fv."facetId" and lower(f.code) = 'manufacturer'
           left join facet_value_translation fvt
             on fvt."baseId" = fv.id and fvt."languageCode" = 'en'
           where pf."productId" = any($1::int[])
           order by pf."productId", fv.id`,
          [productIds]
        )
      : { rows: [] };
    const manufacturerByProduct = new Map();
    for (const row of manufacturerRows) {
      if (manufacturerByProduct.has(row.product_id)) {
        throw new Error(`product ${row.product_id} has multiple manufacturer facets`);
      }
      manufacturerByProduct.set(row.product_id, row.manufacturer);
    }
    const manufacturerIds = new Map();

    async function manufacturerIdFor(productId) {
      const name = manufacturerByProduct.get(productId);
      if (!name || DRY) return null;
      if (manufacturerIds.has(name.toLowerCase())) return manufacturerIds.get(name.toLowerCase());
      const { rows } = await tgt.query(
        `insert into public.manufacturers (company_id, name)
         values ($1, btrim($2))
         on conflict (company_id, normalized_name)
         do update set active=true, updated_at=now()
         returning id`,
        [companyId, name]
      );
      manufacturerIds.set(name.toLowerCase(), rows[0].id);
      return rows[0].id;
    }

    for (const p of products) {
      let productId = mappedP.get(String(p.id)) ?? null;
      const manufacturerId = await manufacturerIdFor(p.id);
      if (productId) {
        sp.existing++;
        if (!DRY) {
          await tgt.query(
            `update public.products set manufacturer_id=$1, updated_at=now()
             where id=$2 and company_id=$3`,
            [manufacturerId, productId, companyId]
          );
        }
      } else if (DRY) {
        sp.inserted++;
        productId = crypto.randomUUID();
      } else {
        let barcode = p.customFieldsBarcode || null;
        if (barcode && seenBarcodes.has(barcode)) {
          warn(`duplicate product barcode '${barcode}' (product ${p.id}) -> null`);
          barcode = null;
        }
        const { rows } = await tgt.query(
          `insert into public.products (company_id, name, barcode, active, created_at, manufacturer_id)
           values ($1,$2,$3,$4,$5,$6) returning id`,
          [
            companyId,
            (p.tname ?? `Product ${p.id}`).trim(),
            barcode,
            p.resurrected ? false : (p.enabled ?? true),
            p.createdAt,
            manufacturerId,
          ]
        );
        if (p.resurrected)
          warn(`product ${p.id} ('${p.tname}') soft-deleted but referenced; migrating inactive`);
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
         where vcc."channelId"=$1 and v."productId"=$3 and v."deletedAt" is null and not $5
         union
         select v.*, pvp.price as channel_price from product_variant v
         left join product_variant_price pvp
           on pvp."variantId"=v.id and pvp."channelId"=$1 and pvp."currencyCode"=$2
         where v."productId"=$3 and v.id = any($4)`,
        [
          channel.id,
          channel.defaultCurrencyCode ?? 'KES',
          p.id,
          refDelIds.length ? refDelIds : [0],
          p.resurrected,
        ]
      );
      // live variants first (they keep the clean sku), referenced-deleted last
      variants.sort((a, b) => (a.deletedAt ? 1 : 0) - (b.deletedAt ? 1 : 0) || a.id - b.id);
      if (!variants.length)
        warn(`product ${p.id} ('${p.tname}') has no variants — violates new-system rules`);

      for (const v of variants) {
        if (mappedV.has(String(v.id))) {
          sv.existing++;
          continue;
        }
        if (DRY) {
          sv.inserted++;
          continue;
        }
        // variant name: option labels joined, else 'Default'
        const { rows: opts } = await src.query(
          `select coalesce(ot.name, o.code) as label
           from product_variant_options_product_option vo
           join product_option o on o.id = vo."productOptionId"
           left join product_option_translation ot
             on ot."baseId"=o.id and ot."languageCode"='en'
           where vo."productVariantId"=$1 order by o.id`,
          [v.id]
        );
        const vname =
          variants.length === 1 || !opts.length ? 'Default' : opts.map(o => o.label).join(' / ');
        const track =
          v.trackInventory === 'INHERIT' ? channel.trackInventory : v.trackInventory === 'TRUE';
        const kind = track ? 'good' : 'service';
        let barcode = v.customFieldsBarcode || null; // variants have no barcode custom field in source; reserved
        const resurrected = v.deletedAt != null;
        const sku = resurrected ? `${v.sku}--archived-${v.id}` : v.sku;
        if (resurrected)
          warn(
            `variant ${v.id} (${v.sku}) soft-deleted but referenced; migrating inactive as '${sku}'`
          );
        const r = await tgt.query(
          `insert into public.product_variants (
             product_id, company_id, name, kind, sku, barcode, price, wholesale_price,
             allow_fractional, track_inventory, active, created_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (company_id, sku) do nothing returning id`,
          [
            productId,
            companyId,
            vname,
            kind,
            sku,
            barcode,
            M(v.channel_price ?? 0),
            M(v.customFieldsWholesaleprice),
            v.customFieldsAllowfractionalquantity ?? false,
            track,
            resurrected ? false : p.resurrected ? false : (v.enabled ?? true),
            v.createdAt,
          ]
        );
        if (!r.rows.length) {
          warn(`variant sku '${sku}' already exists in target company; mapped by sku`);
          const existing = await tgt.query(
            'select id from public.product_variants where company_id=$1 and sku=$2',
            [companyId, sku]
          );
          await mapPut(companyId, 'variant', v.id, existing.rows[0].id);
        } else {
          await mapPut(companyId, 'variant', v.id, r.rows[0].id);
        }
        if (v.channel_price == null)
          warn(`variant ${v.id} (${v.sku}) has no channel price; inserted as 0`);
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
      `select * from inventory_batch where "channelId"=$1 and quantity > 0 order by "createdAt"`,
      [channel.id]
    );
    const mappedB = await mapAll(companyId, 'batch');
    const mappedV = await mapAll(companyId, 'variant');
    const mappedC = await mapAll(companyId, 'customer');
    let mainLoc = null;
    if (!DRY)
      mainLoc = (
        await tgt.query(
          "select id from public.stock_locations where company_id=$1 and code='MAIN'",
          [companyId]
        )
      ).rows[0]?.id;
    for (const b of batches) {
      if (mappedB.has(b.id)) {
        s.existing++;
        continue;
      }
      if (DRY) {
        s.inserted++;
        continue;
      }
      const variantId = mappedV.get(String(b.productVariantId));
      if (!variantId) {
        warn(`batch ${b.id}: variant ${b.productVariantId} not migrated; skipped`);
        s.skipped++;
        continue;
      }
      // supplier via the originating purchase, when traceable
      let supplierId = null;
      if (b.sourceType === 'Purchase' && b.sourceId) {
        const { rows: pl } = await src.query(
          'select p."supplierId" from stock_purchase p where p.id=$1',
          [b.sourceId]
        );
        if (pl[0]) supplierId = mappedC.get(String(pl[0].supplierId)) ?? null;
      }
      const { rows } = await tgt.query(
        `insert into public.inventory_batches (
           company_id, variant_id, stock_location_id, supplier_id,
           quantity, remaining, unit_cost, purchased_at, expiry_date, created_at
         ) values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9) returning id`,
        [
          companyId,
          variantId,
          mainLoc,
          supplierId,
          b.quantity,
          M(b.unitCost),
          b.createdAt,
          b.expiryDate ?? null,
          b.createdAt,
        ]
      );
      await mapPut(companyId, 'batch', b.id, rows[0].id);
      s.inserted++;
    }
  }

  // -------------------------------------------------------------------------
  // 7. orders + lines + payments
  // -------------------------------------------------------------------------
  const COMPLETED_STATES = [
    'Fulfilled',
    'Shipped',
    'Delivered',
    'PartiallyShipped',
    'PaymentSettled',
  ];
  {
    const so = stat('orders');
    const sl = stat('order_lines');
    const spay = stat('payments');
    const { rows: orders } = await src.query(
      `select o.* from "order" o join order_channels_channel occ on occ."orderId"=o.id
       where occ."channelId"=$1 and o.type='Regular' order by o.id`,
      [channel.id]
    );
    const mappedO = await mapAll(companyId, 'order');
    const mappedV = await mapAll(companyId, 'variant');
    const mappedC = await mapAll(companyId, 'customer');

    for (const o of orders) {
      const reversed = o.customFieldsReversedat != null;
      const isVoided = reversed || o.state === 'Cancelled';
      const isCompleted = !isVoided && COMPLETED_STATES.includes(o.state);
      // Real-data finding (rehearsal tenant): ArrangingPayment orders with settled payments
      // or ledger postings are partial-payment ("layaway") sales — goods gone,
      // balance owed, 2-3 ledger entries posted. They migrate as COMPLETED credit
      // sales (not pending_payment): v1's own books route them through AR, so the
      // outstanding balance belongs on the customer's credit, visible in aging —
      // not in the cashier queue. ArrangingPayment with NEITHER is an abandoned checkout.
      let isLayaway = false;
      if (!isVoided && !isCompleted && o.state === 'ArrangingPayment') {
        const { rows: lp } = await src.query(
          `select (select coalesce(sum(amount),0) from payment where "orderId"=$1 and state='Settled')::float8 as settled,
                  (select count(*)::int from ledger_journal_entry where "channelId"=$2 and "sourceId"=$1::text) as ledger_n`,
          [o.id, channel.id]
        );
        isLayaway = lp[0].settled > 0 || lp[0].ledger_n > 0;
      }
      if (!isVoided && !isCompleted && !isLayaway) {
        // draft / abandoned checkout — not migrated
        skippedParked.push({ id: o.id, code: o.code, state: o.state, total: o.subTotalWithTax });
        so.skipped++;
        continue;
      }
      if (isLayaway)
        console.log(`  layaway: order ${o.id} (${o.code}) -> completed credit sale (AR)`);
      if (mappedO.has(String(o.id))) {
        so.existing++;
        continue;
      }
      if (DRY) {
        so.inserted++;
        // count lines/payments for planning visibility (approximate: skip rules
        // like unmapped variants only apply in --apply)
        const { rows: lc } = await src.query(
          'select count(*)::int c from order_line where "orderId"=$1',
          [o.id]
        );
        sl.inserted += lc[0].c;
        const { rows: pc } = await src.query(
          'select count(*)::int c from payment where "orderId"=$1',
          [o.id]
        );
        spay.inserted += pc[0].c;
        continue;
      }

      const { rows: lines } = await src.query(
        'select * from order_line where "orderId"=$1 order by id',
        [o.id]
      );
      const { rows: pays } = await src.query(
        'select * from payment where "orderId"=$1 order by id',
        [o.id]
      );
      const settledSum = pays
        .filter(p => p.state === 'Settled')
        .reduce((a, p) => a + M(p.amount), 0);

      // Voided orders: Vendure zeroes line quantities on cancel; use
      // orderPlacedQuantity and derive the pre-cancel total from the lines.
      let total = M(o.subTotalWithTax);
      const lineRows = [];
      for (const l of lines) {
        const qty = isVoided && l.quantity === 0 ? l.orderPlacedQuantity : l.quantity;
        if (!qty || qty <= 0) {
          warn(`order ${o.id} line ${l.id}: zero quantity; line skipped`);
          continue;
        }
        const variantId = mappedV.get(String(l.productVariantId));
        if (!variantId) {
          warn(
            `order ${o.id} line ${l.id}: variant ${l.productVariantId} not migrated; line skipped`
          );
          continue;
        }
        const customUnit =
          l.customFieldsCustomlineprice != null
            ? M(Math.round(l.customFieldsCustomlineprice / qty))
            : null;
        const lineTotal =
          l.customFieldsCustomlineprice != null
            ? isVoided && l.quantity === 0
              ? customUnit * qty
              : M(l.customFieldsCustomlineprice)
            : M(Math.round(qty * l.listPrice));
        lineRows.push({
          variantId,
          qty,
          listPrice: M(l.listPrice),
          customUnit,
          lineTotal,
          reason: l.customFieldsPriceoverridereason ?? null,
        });
      }
      if (isVoided) total = lineRows.reduce((a, r) => a + r.lineTotal, 0);

      const { rows: orow } = await tgt.query(
        `insert into public.orders (
           company_id, code, customer_id, status, total, is_credit_sale,
           cashier_pending_at, created_by, voided_at, voided_by, void_reason, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [
          companyId,
          o.code,
          o.customerId == null ? null : (mappedC.get(String(o.customerId)) ?? null),
          isVoided ? 'voided' : 'completed',
          total,
          (isCompleted || isLayaway) && total > settledSum, // outstanding AR => credit sale
          o.customFieldsCashierpendingat ?? null,
          mapUser(o.customFieldsCreatedbyuseridid),
          isVoided ? (o.customFieldsReversedat ?? o.updatedAt) : null,
          isVoided ? mapUser(o.customFieldsReversedbyuseridid) : null,
          isVoided ? 'Migrated void (Vendure reversal)' : null,
          o.createdAt,
        ]
      );
      const orderId = orow[0].id;
      await mapPut(companyId, 'order', o.id, orderId);
      so.inserted++;

      for (const lr of lineRows) {
        await tgt.query(
          `insert into public.order_lines (
             order_id, company_id, variant_id, quantity, unit_price, custom_price,
             price_override_reason, line_total
           ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            orderId,
            companyId,
            lr.variantId,
            lr.qty,
            lr.listPrice,
            lr.customUnit,
            lr.reason,
            lr.lineTotal,
          ]
        );
        sl.inserted++;
      }
      for (const p of pays) {
        if (p.amount == null || p.amount <= 0) {
          warn(`payment ${p.id}: non-positive amount ${p.amount}; skipped`);
          spay.skipped++;
          continue;
        }
        // v1 recorded order reconciliations as pseudo-payments ("trust ledger").
        // Not a tender — the ledger captures the adjustment; skip in v2.
        if (String(p.method) === 'reconciliation') {
          warn(
            `payment ${p.id}: v1 reconciliation artifact (order ${p.orderId}, ${p.amount}); skipped (kept in ledger)`
          );
          spay.skipped++;
          continue;
        }
        // v1 method spellings vary across channels: strip the channel suffix
        // (mpesa-10 -> mpesa) and alias variants (cash-payment -> cash).
        const METHOD_ALIASES = { 'cash-payment': 'cash', 'mpesa-payment': 'mpesa' };
        const rawMethod = String(p.method).replace(/-\d+$/, '');
        const method = METHOD_ALIASES[rawMethod] ?? rawMethod;
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
          [
            companyId,
            orderId,
            method,
            M(p.amount),
            p.transactionId ?? null,
            method === 'mpesa' ? (p.transactionId ?? null) : null,
            state,
            p.createdAt,
          ]
        );
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
      'select * from cashier_session where "channelId"=$1 order by "openedAt"',
      [channel.id]
    );
    const mappedS = await mapAll(companyId, 'session');
    for (const sess of sessions) {
      let newSessionId = mappedS.get(sess.id) ?? null;
      if (newSessionId) ss.existing++;
      else if (DRY) {
        ss.inserted++;
        newSessionId = crypto.randomUUID();
      } else {
        const cashier = mapUser(sess.cashierUserId);
        if (!cashier)
          warn(
            `session ${sess.id}: cashier user ${sess.cashierUserId} unmappable; cashier_user_id null violates not-null — using first admin`
          );
        const { rows } = await tgt.query(
          `insert into public.cashier_sessions (company_id, cashier_user_id, status, opened_at, closed_at, closing_declared, created_at)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [
            companyId,
            cashier ?? firstMemberAuthId,
            sess.status === 'open' ? 'open' : 'closed',
            sess.openedAt,
            sess.closedAt,
            M(sess.closingDeclared),
            sess.openedAt,
          ]
        );
        newSessionId = rows[0].id;
        await mapPut(companyId, 'session', sess.id, newSessionId);
        ss.inserted++;
      }

      const { rows: counts } = await src.query(
        'select * from cash_drawer_count where "sessionId"=$1 order by "takenAt"',
        [sess.id]
      );
      const mappedD = await mapAll(companyId, 'drawer_count');
      for (const d of counts) {
        if (mappedD.has(d.id)) {
          sd.existing++;
          continue;
        }
        if (DRY) {
          sd.inserted++;
          continue;
        }
        const ct = String(d.countType).toLowerCase();
        if (!['opening', 'closing', 'mid_shift'].includes(ct)) {
          warn(`drawer count ${d.id}: unknown type '${d.countType}'; skipped`);
          sd.skipped++;
          continue;
        }
        const { rows } = await tgt.query(
          `insert into public.cash_drawer_counts (session_id, company_id, count_type, declared_cash, expected_cash, variance, created_by, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [
            newSessionId,
            companyId,
            ct,
            M(d.declaredCash),
            M(d.expectedCash),
            M(d.variance),
            mapUser(d.countedByUserId),
            d.takenAt,
          ]
        );
        await mapPut(companyId, 'drawer_count', d.id, rows[0].id);
        sd.inserted++;
      }
    }

    const { rows: recons } = await src.query(
      'select * from reconciliation where "channelId"=$1 order by "snapshotAt"',
      [channel.id]
    );
    const mappedR = await mapAll(companyId, 'reconciliation');
    const sessionMap = await mapAll(companyId, 'session');
    for (const r of recons) {
      if (mappedR.has(r.id)) {
        sr.existing++;
        continue;
      }
      if (DRY) {
        sr.inserted++;
        continue;
      }
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
        [companyId, scope, ref, status, mapUser(r.createdBy), r.snapshotAt]
      );
      const newReconId = rows[0].id;
      await mapPut(companyId, 'reconciliation', r.id, newReconId);
      const { rows: accts } = await src.query(
        `select ra.*, la.code from reconciliation_account ra
         join ledger_account la on la.id = ra."accountId" where ra."reconciliationId"=$1`,
        [r.id]
      );
      for (const a of accts) {
        let expected = M(a.expectedAmountCents);
        let variance = M(a.varianceCents);
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
            [channel.id, `%-${a.code}-${r.id}`, a.code]
          );
          variance = M(Number(v[0].net));
          expected = M(a.declaredAmountCents) - variance;
          warn(
            `reconciliation ${r.id} account ${a.code}: null expected/variance reconstructed from ledger (variance=${variance})`
          );
        }
        await tgt.query(
          `insert into public.reconciliation_accounts (reconciliation_id, account_code, declared, expected, variance)
           values ($1,$2,$3,$4,$5)`,
          [newReconId, a.code, M(a.declaredAmountCents), expected, variance]
        );
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
      // The squashed schema's enforce_journal_entry_cashier_session trigger
      // demands an OPEN session for operational entry types — historical data
      // has only closed ones. Temporarily disarm it at the company level for
      // the ledger insert, then restore (same transaction, so the migrated
      // value is what commits).
      await tgt.query('update public.companies set cash_control_enabled=false where id=$1', [
        companyId,
      ]);
      const { rows: entries } = await src.query(
        'select * from ledger_journal_entry where "channelId"=$1 order by "postedAt", id',
        [channel.id]
      );
      const entryIdMap = new Map(); // old entry uuid -> new entry uuid

      // Zero-amount lines (v1 posted InventorySaleCogs lines with unitCost=0)
      // violate the nonzero line check in v2. They carry no money, so drop
      // them; entries whose lines are ALL zero are dropped whole.
      const { rows: nzRows } = await src.query(
        `select "entryId", count(*) filter (where debit>0 or credit>0)::int as nz
         from ledger_journal_line where "channelId"=$1 group by 1`,
        [channel.id]
      );
      const nzByEntry = new Map(nzRows.map(r => [r.entryId, r.nz]));
      const deadEntries = entries.filter(e => (nzByEntry.get(e.id) ?? 0) === 0);
      if (deadEntries.length)
        warn(
          `${deadEntries.length} ledger entr(ies) with only zero-amount lines skipped (v1 zero-cost COGS)`
        );

      // pass 1: entries
      const newEntryOldIds = new Set(); // old uuids inserted THIS run
      for (const e of entries) {
        if ((nzByEntry.get(e.id) ?? 0) === 0) {
          se.skipped++;
          continue;
        }
        const ins = await tgt.query(
          `insert into public.ledger_journal_entries (company_id, entry_date, posted_at, source_type, source_id, memo)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (company_id, source_type, source_id) do nothing returning id`,
          [companyId, e.entryDate, e.postedAt, e.sourceType, e.sourceId, e.memo]
        );
        if (!ins.rows.length) {
          const ex = await tgt.query(
            'select id from public.ledger_journal_entries where company_id=$1 and source_type=$2 and source_id=$3',
            [companyId, e.sourceType, e.sourceId]
          );
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
          await tgt.query(
            'update public.ledger_journal_entries set reversal_of=$1 where id=$2 and reversal_of is null',
            [entryIdMap.get(e.reversalOf), entryIdMap.get(e.id)]
          );
        }
      }

      // pass 2: lines, only for entries inserted this run (their lines were
      // written atomically with them, so pre-existing entries are done)
      const { rows: lines } = await src.query(
        `select l.*, a.code as account_code from ledger_journal_line l
         join ledger_account a on a.id = l."accountId"
         where l."channelId"=$1 order by l."entryId", l.id`,
        [channel.id]
      );
      for (const l of lines) {
        if (!newEntryOldIds.has(l.entryId)) {
          sl.existing++;
          continue;
        }
        if (!(l.debit > 0 || l.credit > 0)) {
          sl.skipped++; // zero-amount v1 line (zero-cost COGS); carries no money
          continue;
        }
        const newEntryId = entryIdMap.get(l.entryId);
        const meta = { ...(l.meta ?? {}) };
        let orderId = null;
        if (meta.orderId != null) {
          const mapped = orderMap.get(String(meta.orderId));
          if (mapped) {
            orderId = mapped;
            delete meta.orderId;
          } else
            warn(
              `ledger line ${l.id}: orderId ${meta.orderId} not migrated (parked/draft?); kept in meta`
            );
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
          } else
            warn(
              `ledger line ${l.id}: openSessionId ${meta.openSessionId} not migrated; kept as-is`
            );
        }
        const accountId = accountByCode.get(l.account_code);
        if (!accountId) {
          warn(`ledger line ${l.id}: account '${l.account_code}' missing in target; line skipped`);
          sl.skipped++;
          continue;
        }
        if (l.debit > 0 && l.credit > 0) {
          // Old reversals wrote swapped totals on ONE line (both sides set).
          // Target enforces single-sided lines (debit=0 or credit=0): split
          // into two lines — per-account totals are identical.
          warn(
            `ledger line ${l.id}: double-sided (D${l.debit}/C${l.credit}) split into two single-sided lines`
          );
          await tgt.query(
            `insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
             values ($1,$2,$3,$4,$5,0,$7), ($1,$2,$3,$4,0,$6,$7)`,
            [
              newEntryId,
              companyId,
              accountId,
              orderId,
              M(l.debit),
              M(l.credit),
              JSON.stringify(meta),
            ]
          );
          sl.inserted += 2;
        } else {
          await tgt.query(
            `insert into public.ledger_journal_lines (entry_id, company_id, account_id, order_id, debit, credit, meta)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [
              newEntryId,
              companyId,
              accountId,
              orderId,
              M(l.debit),
              M(l.credit),
              JSON.stringify(meta),
            ]
          );
          sl.inserted++;
        }
      }

      // cents→shillings rounding can drift an entry off balance (e.g. 10.50→11
      // while 10.25+10.25→10+10). The balance trigger is deferred to commit, so
      // repair here: bump the largest line on the deficient side by the delta.
      const { rows: imbalanced } = await tgt.query(
        `select entry_id, sum(debit)::bigint d, sum(credit)::bigint c
         from public.ledger_journal_lines where company_id=$1 group by entry_id
         having sum(debit) <> sum(credit)`,
        [companyId]
      );
      for (const e of imbalanced) {
        const delta = Number(e.c) - Number(e.d);
        const side = delta > 0 ? 'debit' : 'credit';
        await tgt.query(
          `update public.ledger_journal_lines set ${side} = ${side} + $1
           where id = (select id from public.ledger_journal_lines
                       where entry_id=$2 order by greatest(debit, credit) desc limit 1)`,
          [Math.abs(delta), e.entry_id]
        );
        warn(`entry ${e.entry_id}: rounding drift ${delta} repaired on largest ${side} line`);
      }

      // backfill orders.cashier_session_id from remapped meta (new-system link)
      for (const [oid, sid] of orderSession) {
        await tgt.query(
          'update public.orders set cashier_session_id=$1 where id=$2 and cashier_session_id is null',
          [sid, oid]
        );
      }

      // restore the migrated cash-control setting (temporarily disarmed for
      // the ledger insert — see above)
      await tgt.query('update public.companies set cash_control_enabled=$2 where id=$1', [
        companyId,
        channel.customFieldsCashcontrolenabled ?? true,
      ]);
    } else {
      const { rows: c } = await src.query(
        `select (select count(*)::int from ledger_journal_entry where "channelId"=$1) as entries,
                (select count(*)::int from ledger_journal_line where "channelId"=$1) as lines,
                (select count(*)::int from ledger_journal_line where "channelId"=$1 and debit>0 and credit>0) as doubles`,
        [channel.id]
      );
      se.inserted = c[0].entries;
      sl.inserted = c[0].lines + c[0].doubles;
    }
  }

  // -------------------------------------------------------------------------
  // 9b. purchases + lines + payments — supply side. Additive: rows are
  // idempotent via etl_id_map, so re-runs only pick up new v1 activity
  // (live-ops syncs; no teardown needed for these tables).
  // -------------------------------------------------------------------------
  {
    const sp = stat('purchases');
    const spl = stat('purchase_lines');
    const spp = stat('purchase_payments');
    const mappedV2 = await mapAll(companyId, 'variant');
    const batchMap2 = await mapAll(companyId, 'batch');
    const custMap2 = await mapAll(companyId, 'customer');
    let mainLocId = null;
    if (!DRY) {
      const { rows: ml } = await tgt.query(
        "select id from public.stock_locations where company_id=$1 and code='MAIN'",
        [companyId]
      );
      mainLocId = ml[0]?.id ?? null;
    }

    const { rows: purchases } = await src.query(
      'select * from stock_purchase where "channelId"=$1 order by id',
      [channel.id]
    );
    for (const p of purchases) {
      const key = String(p.id);
      let purchaseId = await mapGet(companyId, 'purchase', key);
      if (purchaseId) sp.existing++;
      else if (DRY) {
        sp.inserted++;
        purchaseId = crypto.randomUUID();
      } else {
        const supplierId =
          p.supplierId != null ? (custMap2.get(String(p.supplierId)) ?? null) : null;
        if (p.supplierId != null && !supplierId)
          warn(`purchase ${p.id}: supplier ${p.supplierId} not migrated; supplier_id null`);
        const { rows } = await tgt.query(
          `insert into public.purchases (
             company_id, supplier_id, reference, total_cost, is_credit, created_by,
             created_at, purchase_date, notes, stock_location_id
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
          [
            companyId,
            supplierId,
            p.referenceNumber ?? null,
            M(p.totalCost),
            p.isCreditPurchase ?? false,
            firstMemberAuthId,
            p.createdAt,
            p.purchaseDate ?? p.createdAt,
            p.notes ?? null,
            mainLocId,
          ]
        );
        purchaseId = rows[0].id;
        await mapPut(companyId, 'purchase', key, purchaseId);
        sp.inserted++;
      }

      const { rows: lines } = await src.query(
        'select * from stock_purchase_line where "purchaseId"=$1 order by id',
        [p.id]
      );
      for (const l of lines) {
        const lKey = String(l.id);
        if (await mapGet(companyId, 'purchase_line', lKey)) {
          spl.existing++;
          continue;
        }
        if (DRY) {
          spl.inserted++;
          continue;
        }
        const variantId = mappedV2.get(String(l.variantId));
        if (!variantId) {
          warn(`purchase line ${l.id}: variant ${l.variantId} not migrated; line skipped`);
          spl.skipped++;
          continue;
        }
        // link the line to its migrated batch (variant + this purchase as source)
        let lineBatchId = null;
        const { rows: b } = await src.query(
          `select id from inventory_batch
           where "productVariantId"=$1 and "sourceType"='Purchase' and "sourceId"=$2
           order by "createdAt" limit 1`,
          [l.variantId, String(p.id)]
        );
        if (b[0]) lineBatchId = batchMap2.get(String(b[0].id)) ?? null;
        const { rows: ins } = await tgt.query(
          `insert into public.purchase_lines (
             company_id, purchase_id, variant_id, inventory_batch_id,
             quantity, unit_cost, line_total, created_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [
            companyId,
            purchaseId,
            variantId,
            lineBatchId,
            l.quantity,
            M(l.unitCost),
            M(l.totalCost),
            p.createdAt,
          ]
        );
        await mapPut(companyId, 'purchase_line', lKey, ins[0].id);
        spl.inserted++;
      }
    }

    const ACCOUNT_FOR = { cash: 'CASH_ON_HAND', bank: 'BANK_MAIN', mpesa: 'MPESA' };
    const { rows: ppays } = await src.query(
      'select * from purchase_payment where "channelId"=$1 order by id',
      [channel.id]
    );
    const purchaseMap = await mapAll(companyId, 'purchase');
    for (const pp of ppays) {
      const key = String(pp.id);
      if (await mapGet(companyId, 'purchase_payment', key)) {
        spp.existing++;
        continue;
      }
      if (DRY) {
        spp.inserted++;
        continue;
      }
      const purchaseId =
        pp.purchaseId != null ? (purchaseMap.get(String(pp.purchaseId)) ?? null) : null;
      if (pp.purchaseId != null && !purchaseId) {
        warn(`purchase_payment ${pp.id}: purchase ${pp.purchaseId} not migrated; skipped`);
        spp.skipped++;
        continue;
      }
      const account = ACCOUNT_FOR[pp.method] ?? null;
      if (!account)
        warn(`purchase_payment ${pp.id}: unknown method '${pp.method}' -> account null`);
      const { rows: ins } = await tgt.query(
        `insert into public.purchase_payments (company_id, purchase_id, amount, account_code, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [
          companyId,
          purchaseId,
          M(pp.amount),
          account,
          firstMemberAuthId,
          pp.paidAt ?? pp.createdAt ?? null,
        ]
      );
      await mapPut(companyId, 'purchase_payment', key, ins[0].id);
      spp.inserted++;
    }
  }

  // -------------------------------------------------------------------------
  // 9c. inventory movements — full stock history (sales consumption, purchase
  // receipts, adjustments, opening stock, reversals). Also covers the v1
  // stock_adjustment entities (sourceType='StockAdjustment').
  // -------------------------------------------------------------------------
  {
    const sm = stat('inventory_movements');
    const mappedV2 = await mapAll(companyId, 'variant');
    const batchMap2 = await mapAll(companyId, 'batch');
    let mainLocId = null;
    if (!DRY) {
      const { rows: ml } = await tgt.query(
        "select id from public.stock_locations where company_id=$1 and code='MAIN'",
        [companyId]
      );
      mainLocId = ml[0]?.id ?? null;
    }
    const TYPE = { SALE: 'sale', PURCHASE: 'purchase', ADJUSTMENT: 'adjustment' };
    // Adjustment actors: movement.sourceId -> inventory_stock_adjustment.id
    // -> adjustedByUserId (v1 user id, remapped below).
    const { rows: adjUsers } = await src.query(
      'select id, "adjustedByUserId" from inventory_stock_adjustment where "channelId"=$1',
      [channel.id]
    );
    const adjUserById = new Map(adjUsers.map(a => [String(a.id), a.adjustedByUserId]));
    const { rows: mvts } = await src.query(
      'select * from inventory_movement where "channelId"=$1 order by id',
      [channel.id]
    );
    for (const m of mvts) {
      const key = String(m.id);
      const actorFor = () => {
        if (m.sourceType === 'StockAdjustment') {
          const v1User = adjUserById.get(String(m.sourceId));
          if (v1User != null) {
            const mapped = mapUser(v1User);
            if (mapped) return mapped;
            warn(`movement ${m.id}: adjustedBy user ${v1User} not migrated; actor = first admin`);
          }
        }
        return firstMemberAuthId;
      };
      const existingId = await mapGet(companyId, 'movement', key);
      if (existingId) {
        sm.existing++;
        // Retroactive actor fix: adjustments inserted before the mapping existed
        // got the first admin; correct them on re-run.
        if (m.sourceType === 'StockAdjustment' && !DRY) {
          const actor = actorFor();
          await tgt.query(
            `update public.inventory_movements set actor=$1 where id=$2 and actor is distinct from $1`,
            [actor, existingId]
          );
        }
        continue;
      }
      if (DRY) {
        sm.inserted++;
        continue;
      }
      const variantId = mappedV2.get(String(m.productVariantId));
      if (!variantId) {
        warn(`movement ${m.id}: variant ${m.productVariantId} not migrated; skipped`);
        sm.skipped++;
        continue;
      }
      const type = m.sourceType === 'OrderReversal' ? 'reversal' : TYPE[m.movementType];
      if (!type) {
        warn(`movement ${m.id}: unknown type '${m.movementType}'; skipped`);
        sm.skipped++;
        continue;
      }
      const batchId = m.batchId ? (batchMap2.get(String(m.batchId)) ?? null) : null;
      const meta = {
        v1_id: m.id,
        ...(m.metadata ?? {}),
        ...(m.orderLineId ? { v1_orderLineId: m.orderLineId } : {}),
        ...(m.batchId && !batchId ? { v1_batch_id: m.batchId } : {}),
        ...(m.reversesMovementId ? { v1_reverses: m.reversesMovementId } : {}),
      };
      const { rows: ins } = await tgt.query(
        `insert into public.inventory_movements (
           company_id, batch_id, type, quantity, unit_cost, total_cost,
           source_type, source_id, meta, variant_id, actor, stock_location_id, created_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [
          companyId,
          batchId,
          type,
          m.quantity,
          M(m.unitCostCents),
          M(m.totalCostCents),
          m.sourceType,
          String(m.sourceId ?? ''),
          JSON.stringify(meta),
          variantId,
          actorFor(),
          mainLocId,
          m.createdAt,
        ]
      );
      await mapPut(companyId, 'movement', key, ins[0].id);
      sm.inserted++;
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
       order by pa."productId", pa.position`,
      [channel.id]
    );
    const { rows: varAssets } = await src.query(
      `select pva."assetId" from product_variant_asset pva
       join product_variant_channels_channel vcc on vcc."productVariantId"=pva."productVariantId"
       where vcc."channelId"=$1`,
      [channel.id]
    );
    const { rows: logoRows } = await src.query(
      `select a.id, a.source, a."mimeType" from channel c
       join asset a on a.id = c."customFieldsCompanylogoassetid" where c.id=$1`,
      [channel.id]
    );

    // chosen upload per product: featured asset, else lowest position
    const byProduct = new Map(); // productId -> {assetId, source, mimeType, extras}
    for (const a of prodAssets) {
      const cur = byProduct.get(a.productId);
      if (!cur) byProduct.set(a.productId, { ...a, extras: 0 });
      else if (a.featured && !cur.featured) {
        cur.extras++;
        byProduct.set(a.productId, { ...a, extras: cur.extras });
      } else cur.extras++;
    }
    const logo = logoRows[0] ?? null;
    if (varAssets.length) {
      s.skipped += varAssets.length;
      console.log(
        `  assets: ${varAssets.length} variant-level asset(s) have no v2 target field; skipped`
      );
    }

    const storagePath = asset =>
      `${companyId}/asset-${asset.assetId ?? asset.id}${path.extname(asset.source)}`;
    const filePath = asset => path.join(VENDURE_ASSET_DIR, asset.source);

    if (DRY) {
      for (const [pid, a] of byProduct) {
        if (fs.existsSync(filePath(a))) {
          s.inserted++;
          console.log(`  plan asset: product ${pid} <- ${a.source} -> ${storagePath(a)}`);
        } else {
          s.skipped++;
          console.log(`  WARN: asset file missing on disk: ${filePath(a)}`);
        }
        if (a.extras)
          console.log(
            `  NOTE: product ${pid} has ${a.extras} gallery image(s) beyond the featured one; no v2 field, skipped`
          );
      }
      if (logo) {
        if (fs.existsSync(filePath(logo))) {
          s.inserted++;
          console.log(`  plan asset: company logo <- ${logo.source} -> ${storagePath(logo)}`);
        } else {
          s.skipped++;
          console.log(`  WARN: asset file missing on disk: ${filePath(logo)}`);
        }
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
        if (!fs.existsSync(file)) {
          warn(`${label}: source file missing on disk (${file}); skipped`);
          s.skipped++;
          return;
        }
        const target = storagePath(asset);
        const up = await supaApi(`/storage/v1/object/product-images/${target}`, {
          method: 'POST',
          headers: {
            'content-type': asset.mimeType ?? 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: fs.readFileSync(file),
        });
        if (!up.ok) {
          warn(`${label}: storage upload failed (${up.status} ${await up.text()}); skipped`);
          s.skipped++;
          return;
        }
        const changed = await setPath(target);
        changed ? s.inserted++ : s.existing++;
      }

      for (const [pid, a] of byProduct) {
        const newPid = mappedP.get(String(pid));
        if (!newPid) {
          warn(`asset ${a.assetId}: product ${pid} not migrated; skipped`);
          s.skipped++;
          continue;
        }
        await copyAsset(
          a,
          async target => {
            const r = await tgt.query(
              'update public.products set image_path=$1 where id=$2 and image_path is distinct from $1',
              [target, newPid]
            );
            return r.rowCount > 0;
          },
          `asset ${a.assetId} (product ${pid})`
        );
        if (a.extras) {
          s.skipped += a.extras;
          console.log(
            `  NOTE: product ${pid} has ${a.extras} gallery image(s) beyond the featured one; no v2 field, skipped`
          );
        }
      }
      if (logo) {
        await copyAsset(
          logo,
          async target => {
            const r = await tgt.query(
              'update public.companies set logo_path=$1 where id=$2 and logo_path is distinct from $1',
              [target, companyId]
            );
            return r.rowCount > 0;
          },
          `asset ${logo.id} (company logo)`
        );
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
      const out = execFileSync(
        process.execPath,
        [path.join(ETL_DIR, 'export-map.mjs'), '--channel', String(channel.id)],
        { encoding: 'utf8' }
      );
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
    console.log(
      `  ${k}: inserted/planned=${v.inserted} existing=${v.existing} skipped=${v.skipped}`
    );
  }
  if (skippedParked.length) {
    console.log('\n--- skipped draft/parked orders (close before cutover) ---');
    for (const o of skippedParked)
      console.log(`  order ${o.id} ${o.code} state=${o.state} total=${o.total}`);
  }
  if (warnings.length) {
    console.log(`\n--- ${warnings.length} warning(s) above ---`);
  }
  await src.end();
  await tgt.end();
}
