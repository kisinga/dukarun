# Changelog

## Unreleased — Supabase system

### Architecture

- Replaced the Vendure/Apollo dashboard runtime with Angular 21 applications backed directly by
  Supabase Auth, PostgreSQL/RPC, RLS, Realtime, Storage, and Edge Functions.
- Added append-only SQL migrations, pgTAP database behavior tests, generated TypeScript database
  types, and Vendure-to-Supabase ETL/tie-out tooling.
- Moved the former dashboard and Vendure infrastructure documentation to
  `archive/vendure/`; active root scripts and CI now target `apps/*` and `supabase/`.
- Added build-time public Supabase environment generation for Cloudflare Pages.

### Product

- Rebuilt POS, inventory, purchases, customers, suppliers, accounting, approvals, reporting,
  platform administration, and public storefront foundations on the new data model.
- Added offline cart/outbox support and live dashboard refresh after committed sales, purchases,
  stock changes, and payment events.
- Standardized the dashboard design language as “The Counter,” including shared page, money,
  field, icon, status, and button primitives.
- Added configurable new-company offers: Super Admin selects a plan, paid months, and free bonus
  months; verified payment assigns the plan and grants the combined access period.

### Migration

- Production migration remains a per-company hard cutover with verification and a read-only
  Vendure retention window. See `docs/V1_V2_MIGRATION.md`; this release is not complete until its
  production-readiness gates pass.

Retired-system history and lessons are summarized in `archive/REFERENCE.md`.
