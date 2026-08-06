# Documentation

Current system documentation:

| Topic                          | Document                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| Architecture and boundaries    | [`../ARCHITECTURE.md`](../ARCHITECTURE.md)                            |
| Local setup and infrastructure | [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md)                              |
| Production deployment          | [`DEPLOYMENT.md`](DEPLOYMENT.md)                                      |
| Dashboard design language      | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)                                |
| Detail-surface rollout scope   | [`DETAIL_SURFACES_ROLLOUT.md`](DETAIL_SURFACES_ROLLOUT.md)            |
| Transaction workflows          | [`TRANSACTION_WORKFLOWS.md`](TRANSACTION_WORKFLOWS.md)                |
| Vendure → Supabase cutover     | `V1_V2_MIGRATION.md` — internal, gitignored (references real tenants) |
| Troubleshooting                | [`GENERAL_TROUBLESHOOTING.md`](GENERAL_TROUBLESHOOTING.md)            |

## Source-of-truth map

- Database behavior: `supabase/migrations` + `supabase/tests/database`
- Generated database contract: `packages/shared-types/database.types.ts`
- Business dashboard: `apps/web`
- Public storefront: `apps/storefront`
- Platform operations: `apps/super-admin`
- Provider integrations: `supabase/functions`
- Migration tooling: `scripts/etl`

## Historical material

`archive/` is intentionally outside active workspaces and CI. In particular,
`archive/vendure/` contains the former dashboard, Compose files, deployment notes, and coverage
artifacts, including the former Vendure feature catalog. Historical documents may contain paths
and commands from their original repository layout; do not treat them as current instructions.

When a current document becomes obsolete, move it into a dated archive location instead of
leaving two apparently authoritative versions in `docs/`.
