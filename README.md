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
npm run dev:all              # dashboard + storefront + platform admin
npm run build:active         # production-build all active Angular apps
npm run check:web            # design guard + dashboard production build
npm run sb:test              # pgTAP database suite
npm run sb:lint              # lint public database objects
npm run sb:types             # refresh checked-in database TypeScript types
```

## Deploy (manual, first-party)

Target host config lives in `.env.deploy` (gitignored — `cp .env.deploy.example .env.deploy`
and fill in). Passwords/keys are fetched from the host at deploy time; nothing sensitive
is committed.

```bash
npm run deploy               # apply pending DB migrations (SSH tunnel)
npm run deploy:functions     # migrations + sync edge functions (hot-reload)
npm run deploy:apps          # build + ship web + super-admin, container swap with backup
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

See [V1 → V2 migration](docs/V1_V2_MIGRATION.md) for phases, gates, and wave plan.

## Active structure

```text
apps/
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
[V1 → V2 migration](docs/V1_V2_MIGRATION.md).

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Local infrastructure](docs/INFRASTRUCTURE.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Transaction workflows](docs/TRANSACTION_WORKFLOWS.md)
- [Migration runbook](docs/V1_V2_MIGRATION.md)
- [Documentation index](docs/README.md)

## Production boundary

- Self-hosted Supabase on Coolify runs PostgreSQL, Auth, Storage, Realtime, and Edge Runtime.
- The Angular apps are static builds deployed to the same host (`npm run deploy:apps`);
  caddy routes dukarun.com → web, admin.dukarun.com → super-admin.
- CI production-builds all active apps and runs the web design guard.
- Database CI starts an ephemeral stack, runs lint + pgTAP, and verifies generated types;
  a self-hosted runner on the host can also apply migrations + functions on push.

Production frontend builds require `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the shared prebuild
script generates an ignored Angular environment file. Service-role, provider, and database
credentials must never enter frontend build variables.

## License

Proprietary.
