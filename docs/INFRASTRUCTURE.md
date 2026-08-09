# Infrastructure and Local Development

This guide covers the active Angular + Supabase system. The former Vendure Compose stack and
its environment reference live in `archive/vendure/`.

## Prerequisites

- Node.js 22.22 or newer
- npm (from the Node installation)
- Docker Desktop/Engine
- Supabase CLI (provided by the root npm dependencies; use `npm run sb:*`)

## First setup

```bash
npm ci
cp .env.example .env
npm run sb:start
npm run sb:test
npm run dev
```

Local endpoints:

| Service           | URL                                                       |
| ----------------- | --------------------------------------------------------- |
| Public site       | `http://localhost:4202`                                   |
| Dashboard/POS     | `http://localhost:4203`                                   |
| Public storefront | `http://localhost:4204`                                   |
| Platform admin    | `http://localhost:4205`                                   |
| Supabase API      | `http://127.0.0.1:54321`                                  |
| Supabase Studio   | `http://127.0.0.1:54323`                                  |
| Local PostgreSQL  | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`npm run dev` starts only the dashboard. Use `npm run dev:all` for all four Angular apps.
The Supabase CLI manages its own local containers; the old root Docker Compose stack is not
part of active development.

## Database workflow

Migrations are append-only.

```bash
npm run sb:start
npm run sb:reset        # local only: rebuild from migrations + seed
npm run sb:lint
npm run sb:test
npm run sb:types
```

Never run `sb:reset` against production. Add behavior and permission tests in
`supabase/tests/database` with every financial or tenant-boundary change. Regenerate
`packages/shared-types/database.types.ts` after schema changes.

### Cashier-session boundary

An open cashier session is a database invariant for completed sales and money movement, not a
frontend convention. Migration `20260803001000_0031_cashier_session_enforcement.sql` enforces the
boundary on order completion and journal posting, while the dashboard mirrors it with shared
Realtime state and a 30-second fallback refresh.

| Allowed with till closed | Requires an open session                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| Build or park a sale     | Complete or settle a sale, including credit sales                      |
| Save a proforma/draft    | Collect customer debt or pay a supplier                                |
| Record a credit purchase | Record a paid purchase, expense, transfer, refund, or payment reversal |

Governed journal lines receive `meta.openSessionId`; completed orders receive
`cashier_session_id`. RPCs and service-role integrations must not try to supply or bypass those
values—the database derives them from the company's single open session. Closing the session
locks against concurrent governed posting, so a transaction either belongs to that session in
full or rolls back.

## Frontend environment generation

Angular cannot read deployment environment variables directly at runtime. Each active app has
a `prebuild` script that calls `scripts/generate-environment.mjs`. It writes an ignored
`environment.generated.ts` containing only:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SITE_PUBLIC_URL`, `APP_PUBLIC_URL`, `STOREFRONT_PUBLIC_URL`
- `PUBLIC_DATA_MODE` (`fixture` in CI, `live` in production)

Local builds fall back to the local Supabase URL and public demo anon key. Production build
providers must set both variables. The generator validates the URL and JSON-escapes values
before writing TypeScript.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, database URLs, Paystack secrets, SMS credentials, or
Vault values to a frontend build. Those belong on the Supabase/Coolify side.

## Build and quality gates

```bash
npm run check:web       # The Counter guard + dashboard build
npm run build:active    # all four production apps
npm test                # current root merge build alias
```

Expected outputs:

| App            | Output directory                            |
| -------------- | ------------------------------------------- |
| Public site    | `apps/site/dist/site/browser`               |
| Dashboard      | `apps/web/dist/web/browser`                 |
| Storefront     | `apps/storefront/dist/storefront/browser`   |
| Platform admin | `apps/super-admin/dist/super-admin/browser` |

## Production topology

```text
Coolify / Nginx
  ├─ public site
  ├─ authenticated dashboard/POS
  ├─ storefront
  └─ platform admin
          |
          v
https://supa.dukarun.com (Coolify-hosted Supabase)
  ├─ Kong / Auth / REST / Realtime / Storage
  ├─ PostgreSQL
  └─ Edge Runtime
```

GitHub Actions has separate responsibilities:

- `test.yml`: design guard + production builds for active Angular apps.
- `supabase.yml`: ephemeral database lint/pgTAP/type check, then protected database/function
  deployment from a self-hosted Coolify runner.

Coolify owns frontend deployment. See `docs/DEPLOYMENT.md` for current production
variables, outputs, auth hooks, provider secrets, and smoke tests.

## Vendure migration source

The old Angular dashboard is frozen under `archive/vendure/frontend`. Generated outputs and
dependencies were intentionally removed; they can be regenerated from its `package.json` if a
historical build is required.

The complete Vendure source remains available for migration rehearsal, targeted compatibility
changes, and read-only retention. It has its own package workspace so none of its commands or
dependencies leak into the active root:

```bash
cd archive/vendure
npm install
npm run build:backend
npm run test:backend
npm run services:up
npm run dev:backend
```

Legacy Compose files and their original environment template are under `archive/vendure/`.
The archive is intentionally absent from root workspaces and active CI. Its lifecycle and removal
gate are defined by `docs/V1_V2_MIGRATION.md`.

## Common failures

### Frontend points at localhost after deployment

The Pages project did not supply `SUPABASE_URL`/`SUPABASE_ANON_KEY`, or it reused an old build
cache. Confirm the build log contains `[env:<app>] wrote ...environment.generated.ts`, clear the
Pages cache, and rebuild.

### Generated database types are stale

Start the local stack, run `npm run sb:types`, and commit the generated type change with the
migration.

### Dashboard does not update immediately

Confirm the write RPC committed, then inspect the Realtime subscription and background refresh.
Offline sales remain in the outbox and intentionally do not affect server aggregates until sync.

### Supabase local stack will not start

Check Docker is running, then use `npx supabase status` and inspect conflicting ports. Stop the
stack with `npm run sb:stop`; do not delete Docker volumes unless local data loss is acceptable.
