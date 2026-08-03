# Deployment Runbook — Dukarun on Coolify Supabase

Instance: `https://supa.dukarun.com` (Kong; behind Cloudflare proxy — HTTP only)
DB: `***REMOVED***:5432` (direct IP; Cloudflare does NOT proxy TCP/Postgres — use the IP, always with `?sslmode=disable`)

## Done

- [x] 31 migration files tracked (`supabase db push --db-url …` applies pending files)
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

Env for all: `SUPABASE_URL=https://supa.dukarun.com`,
`SUPABASE_ANON_KEY=<anon key from Coolify env>`. Each app's `prebuild` invokes
`scripts/generate-environment.mjs`; verify that line appears in the Pages build log. Do not add
service-role or provider secrets to Pages.

| App         | Build command               | Output dir                                  |
| ----------- | --------------------------- | ------------------------------------------- |
| admin       | `npm run build:web`         | `apps/web/dist/web/browser`                 |
| storefront  | `npm run build:storefront`  | `apps/storefront/dist/storefront/browser`   |
| super-admin | `npm run build:super-admin` | `apps/super-admin/dist/super-admin/browser` |

### 6. Smoke test

1. `0700000001` / `123456` (test OTP) → register a company → full sale → check ledger in Studio.
2. Remove `GOTRUE_SMS_TEST_OTP`, request OTP to a real phone → verify TextSMS delivery via the send_sms hook.
3. Kenyan-network latency check on a phone over 4G.

## CI/CD (implemented)

`.github/workflows/supabase.yml`: tests on GitHub runners (lint + pgTAP +
type-freshness), deploy on a **self-hosted runner on the Coolify host**
(`runs-on: [self-hosted, coolify]`, `environment: production`) on every push
to `pilot/supabase`/`main`: applies migrations via `localhost` and syncs edge
functions into the edge-runtime volume (hot-reload; docker-cp fallback).

### One-time runner setup (on the Coolify host)

1. GitHub → repo **Settings → Actions → Runners → New self-hosted runner** →
   Linux x64 → follow the download/config steps on the host.
2. During `config.sh`, add labels `self-hosted,coolify`, default work folder.
3. Install as a service: `sudo ./svc.sh install && sudo ./svc.sh start`.
4. Repo **Settings → Secrets and variables → Actions**:
   - secret `SUPABASE_DB_URL` = `postgresql://postgres:<password>@127.0.0.1:5432/postgres?sslmode=disable`
   - variable `FUNCTIONS_VOLUME` = the edge-runtime functions dir on the host
     (Coolify → Supabase service → volumes; e.g. `/data/coolify/services/<id>/storage/functions`)
   - (optional) variable `EDGE_RUNTIME_CONTAINER` for the docker-cp fallback.
5. Protect `main`: require `Active apps / Build + design guard` and
   `Supabase / Lint + pgTAP`, plus `environment: production`
   approval for deploys if you want a manual gate.

Frontends stay on Cloudflare Pages auto-builds — no CI needed there.

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
