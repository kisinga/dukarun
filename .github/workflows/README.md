# GitHub Actions

Three workflows protect the active Supabase system:

- `test.yml` runs static, unit, component, contract, build, and mocked-browser checks.
- `supabase.yml` starts a minimal ephemeral Supabase stack and owns migration lint, pgTAP, API,
  concurrency, and generated-type checks.
- `full-stack-smoke.yml` runs the real Supabase browser smoke after merges to `main`, nightly, or
  on manual request. It stays off the pull-request critical path.

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
