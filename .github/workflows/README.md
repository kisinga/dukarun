# GitHub Actions

Two workflows protect the active Supabase system:

- `test.yml` installs the root workspace, runs the web design guard, and production-builds
  `apps/web`, `apps/storefront-new`, and `apps/super-admin-new`.
- `supabase.yml` starts an ephemeral Supabase stack, lints migrations, runs pgTAP, checks
  generated database types, and deploys migrations/functions from protected branches.

The archived Vendure frontend is intentionally outside the root workspace and CI. Its last
coverage badges and implementation live under `archive/vendure/`; they are historical
evidence, not current merge gates.

## Required branch checks

Protect `main` with these checks:

1. `Active apps / Build + design guard`
2. `Supabase / Lint + pgTAP`

The Supabase deploy job runs only after its database checks pass and only on configured
self-hosted production runners.

All jobs use Node 22, matching the root `package.json` engine.
