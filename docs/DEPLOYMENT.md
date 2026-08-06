# Deployment Runbook — Dukarun on Coolify Supabase

Instance: `https://supa.dukarun.com` (Kong; behind Cloudflare proxy — HTTP only).
DB: reachable only via SSH tunnel to the host (Cloudflare does NOT proxy
TCP/Postgres; always `?sslmode=disable`). Host address lives in the gitignored
`.env.deploy` (copy `.env.deploy.example`) — never commit it.

## Deploy commands (first-party)

| Command                        | What it does                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run deploy`               | Apply pending DB migrations via SSH tunnel (`scripts/deploy-db.sh`)                                                           |
| `npm run deploy:functions`     | Migrations + sync edge functions into the edge-runtime volume                                                                 |
| `npm run deploy:apps`          | Build + ship `web` (dukarun.com) and `super-admin` (admin.dukarun.com), container swap with backup (`scripts/deploy-apps.sh`) |
| `npm run deploy:apps:rollback` | Restore the previous app container                                                                                            |

All secrets (PG password, anon key) are fetched from the host at deploy time;
nothing sensitive is stored in the repo.

## Done

- [x] Migrations tracked and applied via `supabase db push`
- [x] GoTrue hooks + SMS provider env (send_sms → TextSMS via vault, custom_access_token)
- [x] Vault secrets: `TEXTSMS_API_KEY`, `TEXTSMS_PARTNER_ID`, `TEXTSMS_SHORTCODE`,
      `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFY_FLUSH_URL`
- [x] Edge functions deployed: paystack-charge, paystack-webhook, notification-flush, _shared
- [x] Edge-runtime env: `PAYSTACK_SECRET_KEY`, `TEXTSMS_*`, `OPENWA_*`, `EMAIL_API_*`
- [x] Env managed in Coolify UI (survives redeploys)
- [x] Commissioning hardening migration `0023` applied (2026-08-06)
- [x] R2 restore drill completed in a disposable Supabase Postgres container
      (11 companies, 1,516 orders, balanced ledger)

## Remaining

### 1. Paystack webhook

Dashboard → Settings → API Keys & Webhooks: set webhook URL to
`https://supa.dukarun.com/functions/v1/paystack-webhook`. Signature verification uses
`PAYSTACK_SECRET_KEY` itself (Paystack signs webhooks with the secret key — there is no
separate webhook secret). Verify with a dashboard test webhook (edge function log should
show a 200 and the company row updating).

### 2. Email

- **Auth emails (GoTrue)**: wired to the v1 SMTP relay (`rs1.hpcnoc.com:465`,
  `hello@dukarun.com`) — container reachability verified. Test with a real
  recovery/invite email from the app.
- **Outbox emails (notification-flush)**: `EMAIL_API_URL` / `EMAIL_API_KEY` /
  `EMAIL_FROM` are configured. Run one controlled delivery before commissioning;
  SMS/WhatsApp are independent.

### 3. Storefront

v2 `apps/storefront` is a placeholder; v1 keeps serving the tenant storefront
domains until it ships. Do not redeploy storefront.

## CI/CD

`.github/workflows/supabase.yml`: lint + pgTAP + type-freshness on GitHub
runners; deploy job on the self-hosted runner on the Coolify host
(migrations + functions, hot-reload via volume, docker-cp fallback). Its smoke
checks now fail the deployment on unexpected REST/function status codes.
`.github/workflows/test.yml`: design guard + builds for all three apps.

## Lint findings (accepted, by design)

- `security_definer_view` on `rpt_daily_*` (4): MVs cannot have RLS; definer
  views with the JWT company filter in WHERE are the tenant boundary
  (pgTAP-proven isolation; direct MV reads revoked). Do not "fix".
- `security_definer_view` on `public_storefronts`: intended public projection
  (approved+opted-in, 5 columns only). An RLS policy on companies would leak
  billing columns to anon.

## Re-run notes

- Migrations are append-only; `supabase db push` applies only new files.
- Do NOT run `supabase db reset` against production.
- App deploys keep the previous container as `<name>-backup-<ts>`; prune old
  backups occasionally.

## Backups

Host cron runs `/opt/backups/backup-dukarun.sh` nightly at 00:17 UTC (03:17 EAT):
custom-format `pg_dump` of the Supabase DB and (until cutover completes) the v1
Vendure DB into `/opt/backups/`, restore-verified with `pg_restore --list`,
14-day rotation, append log at `/opt/backups/backup.log`.

- Manual run: `ssh <host> /opt/backups/backup-dukarun.sh`
- Restore drill: `docker run --rm -v /opt/backups:/b postgres:17 pg_restore --list /b/<file>`
  (verify), then restore into a scratch DB — never over the live one.
- Offsite: each run also `rclone copy`s dumps to Cloudflare R2 (`r2:dukarun-backups`,
  config at `/root/.config/rclone/rclone.conf` on the host). Retention: 14 days local,
  364 days in R2 (bucket lifecycle rule, managed in the Cloudflare dashboard). The API
  token is bucket-scoped (object R/W only; a `CreateBucket` 403 in logs is expected
  and harmless).
- Restore drill, 2026-08-06: `supabase-20260806-0017.dump` streamed from R2 into a
  disposable `supabase/postgres:15.8.1.085` container and restored with PostgreSQL 17
  client tools. The PG17-only `SET transaction_timeout = 0` header must be removed when
  restoring to PG15. Integrity checks: 11 companies, 1,516 orders, ledger delta 0.
