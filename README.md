# Dukarun

Mobile-first point of sale, inventory, credit, purchasing, and accounting for Kenyan small
businesses.

The active system is Angular 21 on Supabase. PostgreSQL functions own transactional business
logic; Row Level Security owns tenant isolation; Angular applications consume the database,
Auth, Storage, Realtime, and Edge Functions through `supabase-js`.

## Start locally

Prerequisites: Node 22, Docker, and the Supabase CLI.

```bash
npm ci
npm run setup        # healthcheck + guided fixes (node, docker, stack, env files)
npm run sb:start     # local Supabase stack (Postgres, Auth, Studio, Storage, Realtime)
npm run dev          # dashboard on http://localhost:4203
```

Open the dashboard at `http://localhost:4203`. Supabase Studio: `npm run sb:studio`
(or `http://localhost:54323`).

Useful commands:

```bash
npm run dev:all              # site + dashboard + storefront + platform admin
npm run build:active         # production-build all active Angular apps
npm run check:web            # design guard + dashboard production build
npm run sb:test              # pgTAP database suite
npm run sb:lint              # lint public database objects
npm run sb:types             # reset local DB, then refresh checked-in database types
```

## Deploy (manual, first-party)

Target host config lives in `.env.deploy` (gitignored — `cp .env.deploy.example .env.deploy`
and fill in). Passwords/keys are fetched from the host at deploy time; nothing sensitive
is committed.

```bash
npm run deploy               # apply pending DB migrations (SSH tunnel)
npm run deploy:functions     # migrations + sync edge functions (hot-reload)
npm run deploy:apps          # build + ship all four frontends
npm run deploy:apps:rollback # restore previous app container
```

Full runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Migration (v1 → v2)

```bash
npm run etl:migrate -- --channel <id> [--apply] [--prod]
npm run etl:verify -- --channel <id>     # row counts + ledger/stock/AR tie-out (gate)
npm run etl:diff -- <channelId>          # deep line-by-line ledger comparison
npm run etl:teardown -- --channel <id>   # per-company undo (dry-run default)
```

The migration runbook (`docs/V1_V2_MIGRATION.md`) is internal — gitignored because it references real tenants. Ask for it if you need it.

## Active structure

```text
apps/
  site/                Static marketing, docs, and public legal pages
  web/                 Business dashboard and POS
  storefront/          Public merchant storefront
  super-admin/         Platform administration
packages/
  shared-types/        Generated Supabase database contract
supabase/
  migrations/          Append-only schema and RPC history
  functions/           Edge Functions for provider integrations
  tests/database/      pgTAP behavior and isolation tests
scripts/etl/           Vendure-to-Supabase migration and verification
docs/                  Current architecture, operations, and design language
archive/vendure/       Frozen Vendure-era dashboard, infra, and documentation
```

The complete Vendure stack is preserved under `archive/vendure/` for migration rehearsal,
read-only retention, and incident recovery. It is not part of the active workspace or CI. See
the internal migration runbook (gitignored — references real tenants).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Local infrastructure](docs/INFRASTRUCTURE.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Transaction workflows](docs/TRANSACTION_WORKFLOWS.md)
- Migration runbook — internal, gitignored (references real tenants)
- [Documentation index](docs/README.md)

## Production boundary

- Self-hosted Supabase on Coolify runs PostgreSQL, Auth, Storage, Realtime, and Edge Runtime.
- The four Angular apps are static Nginx builds deployed on Coolify. Caddy routes
  `dukarun.com` to site, `app.dukarun.com` to web, merchant domains to storefront,
  and `admin.dukarun.com` to super-admin.
- CI production-builds all active apps and runs public and web design guards.
- Database CI starts a minimal ephemeral stack, runs database/API checks, and verifies generated
  types. The real-stack browser smoke runs after merges to `main` and nightly.
- Database migrations and Edge Functions are deployed explicitly with `npm run deploy` or
  `npm run deploy:functions`; the Git-connected Coolify app does not apply them.

Production frontend builds require `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the shared prebuild
script generates an ignored Angular environment file. Service-role, provider, and database
credentials must never enter frontend build variables.

## License

Proprietary.
