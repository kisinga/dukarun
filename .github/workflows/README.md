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

Protect `main` with the pull-request jobs from `test.yml` and `supabase.yml`. Do not require
`Full-stack smoke`; it runs after merge and nightly by design.

All jobs use Node 22, matching the root `package.json` engine.
