# Documentation

This directory contains the living documentation for Dukarun. Implementation details live in code comments and TSDoc; these files only index topics and link to source.

## For operators

- [Infrastructure & Deployment](./INFRASTRUCTURE.md) — Docker, environment variables, network setup, and deployment.
- [Troubleshooting](./GENERAL_TROUBLESHOOTING.md) — Common fixes and reset procedures.

## For customers and non-engineers

- [Feature Catalog](./customer-features/FEATURE_CATALOG.md) — Business-facing capability map.

## For engineers

- [System Architecture](../ARCHITECTURE.md) — High-level design and technology choices.
- [Design System](./DESIGN_SYSTEM.md) — UI/UX rules for the dashboard.
- [Backend plugins](../backend/src/plugins/README.md) — Custom GraphQL mutations and permissions by domain.
- [Root README](../README.md) — Quick start and project overview.

### Key source directories

| Topic | Source |
|-------|--------|
| Ledger / accounting | `backend/src/services/financial/`, `backend/src/plugins/ledger/` |
| Inventory / FIFO / COGS | `backend/src/services/inventory/`, `backend/src/plugins/inventory/` |
| Authorization & approvals | `backend/src/services/auth/`, `backend/src/plugins/approval/` |
| Cashier sessions | `backend/src/services/cashier/`, `backend/src/plugins/ledger/` |
| Subscriptions | `backend/src/services/subscriptions/`, `backend/src/plugins/subscriptions/` |
| Notifications | `backend/src/services/notifications/`, `backend/src/plugins/notifications/` |
| Channels & provisioning | `backend/src/services/channels/`, `backend/src/services/provisioning/` |
| Orders & payments | `backend/src/services/orders/`, `backend/src/services/payments/`, `backend/src/plugins/credit/` |
| Product recognition | `frontend/src/app/core/services/ml-model/` (embedder/matcher/enrollment) |

## Historical context

Older plans, decisions, and superseded specs are archived under `archive/docs/2026-07-10/`.
