# Deployment Runbook — Dukarun on Coolify Supabase

Instance: `https://supa.dukarun.com` (Kong; behind Cloudflare proxy — HTTP only)
DB: `***REMOVED***:5432` (direct IP; Cloudflare does NOT proxy TCP/Postgres — use the IP, always with `?sslmode=disable`)

## Done

- [x] 28 migrations applied (`supabase db push --db-url …`)
- [x] Verified: 5 cron jobs, product-images bucket, 4 role templates
- [x] Subscription tiers seeded (trial / standard)

## Remaining (ordered)

### 1. GoTrue env vars (Coolify → auth service)

```
GOTRUE_SMS_ENABLE_SIGNUP=true
GOTRUE_SMS_ENABLE_CONFIRMATIONS=true
GOTRUE_HOOK_SEND_SMS_ENABLED=true
GOTRUE_HOOK_SEND_SMS_URI=pg-functions://postgres/public/send_sms_hook
GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true
GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook
GOTRUE_SMS_TEST_OTP=***REMOVED***   # remove once real SMS is proven
```

### 2. Vault secrets (Studio SQL editor)

```sql
select vault.create_secret('TEXTSMS_API_KEY', '…');
select vault.create_secret('TEXTSMS_PARTNER_ID', '…');
select vault.create_secret('TEXTSMS_SHORTCODE', '…');
select vault.create_secret('PAYSTACK_SECRET_KEY', 'sk_live_…');
select vault.create_secret('PAYSTACK_WEBHOOK_SECRET', '…');
select vault.create_secret('NOTIFY_FLUSH_URL', 'https://supa.dukarun.com/functions/v1/notification-flush');
```

### 3. Edge functions

Sources: `supabase/functions/{paystack-charge,paystack-webhook,notification-flush}/index.ts`
Deploy into the edge-runtime (Coolify template includes it — functions were confirmed live at `/functions/v1/`). Either copy the files into its functions volume, or deploy via the Supabase management API with the service key.
Env on the edge-runtime service: `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `TEXTSMS_API_KEY`, `TEXTSMS_PARTNER_ID`, `TEXTSMS_SHORTCODE`, `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`.

### 4. Paystack dashboard

Webhook URL → `https://supa.dukarun.com/functions/v1/paystack-webhook` (uses PAYSTACK_WEBHOOK_SECRET for HMAC).

### 5. Frontends (Cloudflare Pages, one project each)

Env for all: `SUPABASE_URL=https://supa.dukarun.com`, `SUPABASE_ANON_KEY=<anon key from Coolify env>`

| App | Build command | Output dir |
|---|---|---|
| admin | `npm run build:web` | `apps/web/dist/web` |
| storefront | `npm run build:storefront-new` | `apps/storefront-new/dist/storefront-new` |
| super-admin | `npm run build:super-admin-new` | `apps/super-admin-new/dist/super-admin-new` |

### 6. Smoke test

1. `0700000001` / `123456` (test OTP) → register a company → full sale → check ledger in Studio.
2. Remove `GOTRUE_SMS_TEST_OTP`, request OTP to a real phone → verify TextSMS delivery via the send_sms hook.
3. Kenyan-network latency check on a phone over 4G.

## CI/CD (target state)

Self-hosted GitHub Actions runner on the Coolify host (repo Settings → Actions → Runners → New). Then `.github/workflows/supabase.yml` deploys on merge with `SUPABASE_DB_URL` pointing at `127.0.0.1:5432` — Postgres never exposed publicly.
Interim manual deploys: `scripts/deploy-db.sh` (SSH tunnel, always closes).

## Lint findings (accepted, by design)

- `security_definer_view` on `rpt_daily_*` (4): MVs cannot have RLS; definer
  views with the JWT company filter in WHERE are the tenant boundary
  (pgTAP-proven isolation; direct MV reads revoked). Do not "fix".
- `security_definer_view` on `public_storefronts`: intended public projection
  (approved+opted-in, 5 columns only). An RLS policy on companies would leak
  billing columns to anon.
- `function_search_path_mutable` on the 3 JWT helpers: FIXED in
  `20260801024000_0028_search_path_hardening.sql`.

## Re-run notes

- Migrations are append-only; `supabase db push` applies only new files.
- Do NOT run `supabase db reset` against production.
