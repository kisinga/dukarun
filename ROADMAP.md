# Roadmap

The active priority is a safe Vendure → Supabase production cutover. Detailed sequencing,
verification, rollback, and sign-off gates live in `docs/V1_V2_MIGRATION.md`.

## Before production cutover

- [ ] Complete production Auth user migration path and rate-limit handling.
- [ ] Copy company/product assets into Supabase Storage and verify policies.
- [ ] Finalize the historical-order void policy.
- [ ] Prove teardown and a second messy-company rehearsal.
- [ ] Export and retain `etl_id_map` audit mappings per company.
- [ ] Finish Paystack repointing runbook and owner communications.
- [ ] Clear remaining dashboard bundle-budget warning.

## Product hardening

- [ ] Gate order and order-line COGS behind `ViewFinancials` at the database/API boundary; replace
      broad `orders.*` reads, purge/version cached sales snapshots, and normalize dashboard/report
      margin calculations to VAT-exclusive revenue.
- [ ] Add browser-level smoke coverage for sale, purchase, supplier payment, and credit flows.
- [ ] Finish public storefront and platform-admin production journeys.
- [ ] Add bulk catalog import and stock transfer workflows.
- [ ] Expand reconciliation, exports, and scheduled owner reporting.
- [ ] Validate offline outbox recovery on low-memory Android devices and long disconnects.
- [ ] Add accessible confirmation for destructive cart/list actions.

## After all companies pass retention

- [ ] Export final Vendure database and asset snapshots.
- [ ] Remove legacy npm workspaces, Dockerfiles, and migration-only dependencies.
- [ ] Close the Vendure infrastructure and update the archive with final recovery instructions.

## Later

- Loyalty and promotions
- Multi-currency and tax expansion
- Voice and camera-assisted catalog workflows
- Model-assisted product categorization and price suggestions
- Public API/webhook integrations
