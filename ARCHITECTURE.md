# Dukarun Architecture

This document describes the active Supabase system. Vendure-era architecture is frozen at
`archive/vendure/ARCHITECTURE.md`.

## System shape

```text
Four static Angular apps on Coolify/Nginx
        |
        | supabase-js / HTTPS / WebSocket
        v
Kong gateway on supa.dukarun.com
        |
        +-- Auth (phone OTP + JWT claims)
        +-- PostgREST (RLS-protected reads)
        +-- PostgreSQL RPCs (transactional writes)
        +-- Realtime (targeted invalidation/live state)
        +-- Storage (company-scoped assets)
        +-- Edge Functions (Paystack and outbound notifications)
```

PostgreSQL is the source of truth. The browser never recreates accounting, inventory, credit,
or payment posting rules. A user action calls one RPC; that function validates permissions and
company scope, changes operational rows, posts balanced ledger entries, and commits or rolls
back as one transaction.

## Applications

| Path               | Responsibility                                                   | Local port |
| ------------------ | ---------------------------------------------------------------- | ---------: |
| `apps/site`        | Marketing, pricing, docs, and public legal content               |       4202 |
| `apps/web`         | Authenticated dashboard, POS, stock, customers, suppliers, money |       4203 |
| `apps/storefront`  | Public merchant catalog/storefront                               |       4204 |
| `apps/super-admin` | Platform operations                                              |       4205 |

All applications are Angular 21 standalone applications. Site prerenders its eight public
routes. Storefront prerenders its directory and known public shop identities while loading
catalog data live. Token pages stay client-only. The dashboard uses the normative
design language in `docs/DESIGN_SYSTEM.md` and shared primitives in
`apps/web/src/app/shared/ui`.

## Data and security

- Every tenant-owned row carries `company_id`.
- Auth hooks add company/role context to JWTs.
- RLS is the read and write isolation boundary; UI permission checks are only affordances.
- Privileged writes use security-definer RPCs with explicit company and permission checks.
- Currency is stored as integer shillings. Quantities may be fractional where the variant allows.
- Ledger entries are double-entry and balanced in the same transaction as their source event.
- Generated database types live at `packages/shared-types/database.types.ts` and are checked by
  CI against a fresh local database.

## Core write flow: sale

```text
Product selection -> persisted local cart -> post_sale RPC
    -> validate stock, price overrides, customer credit, payments
    -> create order + lines + payment rows
    -> consume inventory batches and post COGS
    -> post revenue/cash-or-receivable journal entries
    -> commit -> invalidate live dashboard/report consumers
```

The POS keeps the in-progress cart and offline product snapshot in IndexedDB. Offline sales go
to an exactly-once outbox with a client reference and replay in FIFO order. A queued sale is not
reported as completed or included in live stats until PostgreSQL accepts it.

## Read models and refresh behavior

Operational pages read RLS-protected views/RPCs. Dashboard/report aggregates use SQL read models
and targeted Realtime invalidation. The UI preserves the last successful data during background
refresh, shows the refresh timestamp, and exposes errors instead of replacing good data with
zeroes. Database changes remain the authority; Realtime is a prompt to refetch, not a second
source of truth.

## Edge boundary

Edge Functions are reserved for integrations that need provider secrets or webhook handling:

- `paystack-charge`
- `paystack-webhook`
- `notification-flush`

SMS auth hooks and scheduled database work run from PostgreSQL where appropriate. Provider
secrets live in the Supabase deployment/Vault, never Angular build variables.

## Repository boundaries

- `supabase/migrations` is append-only. Never edit an applied migration.
- `supabase/tests/database` proves posting rules, permissions, and tenant isolation.
- `scripts/etl` may read the Vendure source and write Supabase only during an explicit migration.
- `archive/` is frozen historical context and is excluded from root workspaces and active CI.
- The Vendure stack is preserved under `archive/vendure/` only for migration retention and
  recovery during the window in `docs/V1_V2_MIGRATION.md`.

## Deployment

Coolify builds each static Angular app into Nginx. A build pre-step generates
`environment.generated.ts` from public `SUPABASE_URL` and `SUPABASE_ANON_KEY` values. Coolify
hosts Supabase; GitHub Actions runs migrations and synchronizes Edge Functions from a protected
self-hosted runner. See `docs/DEPLOYMENT.md` for the exact runbook.
