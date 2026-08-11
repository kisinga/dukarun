# Archive reference

This is the short history and lessons record for retired Dukarun systems. Current decisions live
in the root documentation.

## System history

- **Pre-v1:** PocketBase, Go templates, Alpine.js, and browser product recognition. It proved the
  basic sales and inventory idea but did not provide the operating model needed for growth.
- **v1:** Vendure, PostgreSQL, GraphQL, and Angular. It introduced stronger inventory, accounting,
  approvals, subscriptions, and tenant controls, but the number of services and custom layers made
  change and recovery expensive.
- **v2:** Angular and Supabase. This is the active system. The v1 backend and primary dashboard are
  retained only for migration checks and recovery.

## Lessons kept

- Build sales, stock, credit, purchasing, and reporting before experimental features.
- Keep one financial source of truth. Post balanced entries, make retries idempotent, and reconcile
  cash, mobile money, customer balances, supplier balances, and stock explicitly.
- Put tenant isolation, permissions, and account status checks on the server. UI checks are only a
  convenience.
- Make onboarding transactional. Create related records in a clear order and verify role and tenant
  assignments before reporting success.
- Use stable identifiers consistently. Vendure integer IDs and custom UUIDs should not share the
  same GraphQL handling.
- Treat migrations as permanent history. Make them safe to rerun where possible and test behavior,
  not only schema shape.
- Generated API types prevent drift, but they also couple builds to code generation. Keep the
  generation path reproducible.
- Keep the merchant UI plain, mobile-first, and clear about success, failure, and pending work.
  Hide accounting detail until it is needed.
- Prefer fewer deployable parts with clear owners. Separate apps are useful only when their release
  and security boundaries justify the cost.
- Keep secrets outside the repository and keep recovery steps short, tested, and dependency-locked.

## Retired paths

- Browser product recognition and its training pipeline were dropped. The operational value did not
  justify model, asset, and deployment complexity.
- The early packs-and-variants design was dropped because stock units, pricing, and conversion rules
  were not defined well enough.
- The PocketBase source, research datasets, v1 storefront, v1 platform-admin app, screenshots, and
  old working notes were removed in August 2026. They remain available in Git history.

## Journal

Keep future entries short:

### YYYY-MM-DD — change

- **Why:** one sentence.
- **Lesson:** one sentence worth carrying forward.
- **Follow-up:** one action, or `None`.

### 2026-08-11 — archive cleanup

- **Why:** the archive had duplicate apps, experiments, binaries, and long planning notes that were
  no longer useful to v2 work.
- **Lesson:** preserve decisions and recovery material, not every intermediate artifact.
- **Follow-up:** remove the retained Vendure backend and dashboard after the migration retention
  window closes.
