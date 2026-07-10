# Finances Reorg — Plan

Full reorganization of the accounting pages into an owner-first, permission-gated **Finances** section, built on a small set of shared, drift-resistant primitives. Planning doc; no implementation yet.

> **Sequencing note (concurrency).** The app-wide icon migration (`@ng-icons`) and the shared stat components are being changed by a parallel effort. To avoid collisions and rework, the shared UI primitives (`<app-money>`, `activity-mapping`) and the page-level rewrites in this plan are sequenced **after** that settles. The one piece that is safe to land independently is the `ViewFinancials` permission — but only in the **grant-before-gate** order below (never flip the resolver gates before the grant migration ships, or every non-superadmin owner is locked out).

## Goal & principles
1. **Owner-first, accountant-deep.** Plain money on the surface; full journal/debit-credit behind an "Accountant view."
2. **One level of navigation.** Kill the two stacked tab bars (route tabs + query-param tabs).
3. **Money-in / money-out, never debit/credit** on primary screens. Green ↓ in, red ↑ out.
4. **Number → list → transaction.** One consistent drill path.
5. **Icons carry meaning** (@ng-icons/heroicons outline), color reserved for semantics (green in / red out / amber attention).
6. **Consistency + no duplication without overengineering.** One display primitive, one icon set, one view-gate — not a per-field ACL framework.
7. **Mobile-first** (cards, not wide tables).

## Naming
Section = **"Finances"** (plain enough for owners, scales to hold reports + accountant view; unambiguous vs payments/"Money"). Landing surface = the Finances home.

## Target information architecture
Before: `Accounting → [Ledger | Expenses | Transfers] → Ledger:[Overview | Accounts | Transactions | Reconciliation]` — 2 levels, 2 tab systems, 7 surfaces.

After — one level, gated by `ViewFinancials`:
```
Finances                      ← section, requires ViewFinancials (route guard)
 ├─ Overview   money buckets (Cash / Bank / Owed to me / I owe) + period strip + attention + quick actions
 ├─ Activity   one money-in/out feed (ng-icons + filters) → transaction detail (journal collapsed)
 ├─ Accounts   balances by bucket → drill into an account's activity
 └─ Expenses   money-out lens + Record expense
      actions:  Transfer · Count cash          ← demoted from tabs to buttons
      Accountant view (toggle) ← requires ManageReconciliation/CloseAccountingPeriod: journal, codes, period close, trial balance, manual reconciliation
```

## Shared primitives (the whole new layer — deliberately small)
- **`<app-money [value] [direction] [sensitive]>`** — the ONE way to render any amount, app-wide (Finances, Sell, Orders, Customers). Owns: currency formatting (`CurrencyService`), money-in green ↓ / money-out red ↑, and **built-in masking** — when `sensitive` and `!canViewFinancials`, renders `•••` + a `heroLockClosed` glyph instead of the number. Guarantees formatting + gating can never drift.
- **`canViewFinancials`** signal (frontend) backed by **`ViewFinancialsPermission`** (backend) — the single view-gate.
- **`activity-mapping` util** — `sourceType → { icon (heroicons name), label, direction }`. Turns cryptic "Source Type / Source ID" into a friendly icon + label in one place; reused by Activity, transaction detail, and any recent-activity preview.
- **Reuse** `stat-card.component` for buckets; **@ng-icons/heroicons** for icons.

## Permission model
Financial *read* resolvers currently use `@Allow(Permission.ReadOrder)` with `// TODO: Use custom permission` ([period-management.resolver.ts](../backend/src/plugins/ledger/period-management.resolver.ts#L92), [stock-value-stats.resolver.ts](../backend/src/plugins/ledger/stock-value-stats.resolver.ts#L13)). `ReadOrder` is too coarse (operational staff hold it) — no existing permission is a real financial-view gate. So:

### Rollout order — grant-before-gate (mandatory)
**Verified:** role templates are DB-seeded once ([9000000000006](../backend/src/migrations/9000000000006-CreateRoleTemplateTableAndSeed.ts)); [role-template.service.ts](../backend/src/services/channels/role-template.service.ts) has **no boot-time permission sync**. So adding `ViewFinancials` does not auto-grant it to existing roles, and every role that holds `ReadOrder` today (admin, accountant, manager, **and cashier**) currently sees financial figures. Flipping the resolver gates before granting would 403 every non-superadmin owner. Do these **in order, in one deploy**:

1. **Define + register** `ViewFinancialsPermission` in [permissions.ts](../backend/src/plugins/ledger/permissions.ts) (alongside `ManageReconciliation`) and register in [ledger.plugin.ts](../backend/src/plugins/ledger/ledger.plugin.ts); add it to the assignable set in `RoleProvisionerService.getAssignablePermissionStrings()`. *(Additive, no behavior change.)*
2. **Grant it** — a new migration that adds `'ViewFinancials'` to the `role_template` rows and to existing linked `role` rows for **admin / accountant / manager only** (NOT cashier/attendant); also add it to those templates' seed permission arrays for future provisioning.
3. **Only then gate** — swap the read-resolver `@Allow(Permission.ReadOrder)` → `@Allow(ViewFinancialsPermission.Permission)` on the *read* endpoints (balances, totals, breakdowns, account lists) in [period-management.resolver.ts](../backend/src/plugins/ledger/period-management.resolver.ts) + [stock-value-stats.resolver.ts](../backend/src/plugins/ledger/stock-value-stats.resolver.ts) (resolves the `// TODO: Use custom permission` markers). Leave action permissions (`ManageReconciliation`, `CloseAccountingPeriod`, `AccountTransfer`) unchanged.

- **Frontend:** add `canViewFinancials` computed to [auth-permissions.service.ts](../frontend/src/app/core/services/auth/auth-permissions.service.ts) (`roles.some(r => r.permissions.includes('ViewFinancials' as any))`); expose via `AuthService`. **Route guard** `/dashboard/finances` requires it (`canActivate`).

**Sensitive vs operational (one boundary, not per-field):**
- **Gated (`ViewFinancials`):** the whole Finances section — cash/bank balances, profit/net, receivables & payables totals, ledger/journal, account balances, sales/expense totals, reconciliation variances.
- **Always visible (operational, needed to do the job):** cart/order totals, the amount a cashier is collecting at settlement, a customer's outstanding on their own page, your own shift's cash count. These render via `<app-money>` with `sensitive=false`.

Backend `@Allow` is the real lock; `<app-money>` masking is the UX.

## Icon strategy (@ng-icons/heroicons, outline)
The app standardized on **@ng-icons/core + @ng-icons/heroicons (outline)** — installed, registered once in `frontend/src/app/core/icons/app-icons.ts` (the `APP_ICONS` map), provided globally in `app.config.ts` (`provideIcons(APP_ICONS)`), used as `<ng-icon name="heroWallet" />`. Import outline names from the `@ng-icons/heroicons/outline` subpath; size via `size="1.25rem"` (NOT Tailwind `h-4 w-4`); color via `text-*` (currentColor). No emoji, no inline SVG. Register each new glyph once in `APP_ICONS` — see [[icon-system-ngicons]].

Suggested semantic → glyph map (confirm each name exists in the registered `@ng-icons/heroicons/outline` set before use):

| Concept | ng-icon | Concept | ng-icon |
|---|---|---|---|
| Cash on hand | `heroWallet` | Money in | `heroArrowDownLeft` (green) |
| Bank | `heroBuildingLibrary` | Money out | `heroArrowUpRight` (red) |
| Owed to me (receivable) | `heroInboxArrowDown` | Transfer | `heroArrowsRightLeft` |
| I owe (payable) | `heroArrowUpTray` | Attention | `heroExclamationTriangle` |
| Sales / income | `heroArrowTrendingUp` | Verified | `heroCheckBadge` |
| Expense | `heroReceiptPercent` | Pending/unverified | `heroClock` |
| Inventory | `heroCube` | Reconcile / count cash | `heroCalculator` |
| Filter | `heroFunnel` | Export | `heroArrowDownTray` |
| Refund | `heroReceiptRefund` | Masked / gated | `heroLockClosed` |

Do not add a custom `<app-icon>` facade — `<ng-icon>` + `APP_ICONS` is already the single source of truth.

## Per-surface content plan (what shows, sourced from where)
- **Overview** (replaces `overview-tab`): balance buckets (from "Key Accounts"), period strip (`accounting-stats`), attention alerts, quick actions, recent-activity preview → Activity.
- **Activity** (replaces `transactions-tab` + overview recent): money-in/out rows with type icon + plain label + `<app-money direction>`; filters (`accounting-filters` + type + account); tap → transaction detail with journal lines collapsed under "Accounting detail".
- **Accounts** (refactor `accounts-tab`): grouped by bucket with icons, codes hidden by default; tap → the account's Activity; full COA tree + codes in accountant view.
- **Expenses** (keep): money-out lens + Record expense.
- **Transfers / Count cash:** actions (buttons) + filtered Activity views, not top tabs.
- **Accountant view:** journal (debit/credit), source types, account codes, manual reconciliation, period close, trial balance — behind `ManageReconciliation`/`CloseAccountingPeriod`.

## Component & file plan
- **New:** `finances/overview`, `finances/activity-feed` + `activity-row`, `finances/transaction-detail` (refactor of `transaction-detail-modal`), shared `<app-money>`, `activity-mapping.util`, finances route + guard; backend `ViewFinancialsPermission`.
- **Refactor:** `accounting-layout` → single nav row; `accounts-tab` → bucketed; `accounting-filters` → + type filter; financial read resolvers → `ViewFinancials`.
- **Delete/merge:** `accounting-tabs.component` (inner tab bar), `overview-tab` (folds into overview), `transfers-placeholder`.
- **Keep:** data layer (`accounting-list-state.service`, `accounting-context`, derived/formatting utils).

## Migration phases
- **P0 — Foundation:** `ViewFinancialsPermission` via the **grant-before-gate** order above (define+register → grant migration → gate swap) + `canViewFinancials` signal + route guard. Build `<app-money>` + `activity-mapping.util` **after** the parallel `@ng-icons`/stat-component migration settles (avoids collision).
- **P1 — Flatten nav:** collapse two tab bars to one level; gate the Finances section; overview becomes the landing.
- **P2 — Overview landing:** buckets + period + attention + actions, all figures via `<app-money>`.
- **P3 — Activity feed:** money-in/out + ng-icons + filters; retire the debit/credit table from the primary surface.
- **P4 — Accounts reframe + transaction detail:** bucketed accounts; detail = summary + collapsed journal.
- **P5 — Accountant view:** move journal/period/manual-reconciliation there; unify reconcile with the cashier shift-close flow.
- **P6 — Polish:** mobile, empty states, accessibility.

## Open items
- Confirm the exact role templates that receive `ViewFinancials` (proposed: admin / accountant / manager — NOT cashier/attendant), then write the grant migration before the gate swap.
- Sequence the `<app-money>` / `activity-mapping` primitives and page-level rewrites after the parallel `@ng-icons` + stat-component migration lands, to avoid conflicts.
