# Detail Surfaces — Rollout Scope

Companion to `DESIGN_SYSTEM.md` → "Detail & edit surfaces (the three surfaces)". This doc
scopes where the drawer / drawer-edit / modal-route rule applies across `apps/web`, so each
area can be implemented independently. Status legend: ✅ done · 📋 scoped · ⛔ explicitly out.

Each phase is independently shippable and must end green on:
`npm run design-guard -w @dukarun/web`, `npm run offline-safety-guard -w @dukarun/web`,
`npm run build:web`.

## ✅ Phase 0 — Foundation (done)

- `shared/ui/drawer.component.ts` (`app-drawer`): two-phase slide/fade, `(closed)` output,
  `[leading]`/`[actions]` slots, reduced-motion, 480px desktop / full-width mobile.
- Customers drawer: profile, credit, repayments, sales history, statement.
- Suppliers drawer: stats, purchases, payments, AP balance, credit terms.
- Design language encoded in `DESIGN_SYSTEM.md`.

## ✅ Phase 1 — Orders drawer (`/sales`) (done)

`orders/orders.component.ts`. The richest `tr.row-detail` in the app moved into the drawer:
line items, payment chips with per-payment **Reverse**, print receipt, refund form
(amount/method/reason), void-with-reason form. `expandedFor` and both expansion variants
(desktop + mobile) are gone; row click opens the drawer; the selected row stays
highlighted. The drawer's lines/payments refresh on realtime reloads while open, and a
successful void closes the drawer (approval-required keeps it open with the warning).
The drawer shell also gained body scroll-lock while open (restored on close/destroy).

## ✅ Phase 2 — Purchases detail drawer (`/purchases`) (done)

`suppliers/suppliers.component.ts`, purchase-page side only. The purchases table's inline
`tr.row-detail` payment form moved into a purchase drawer (supplier, lines, totals,
payment history via the new `MoneyService.purchasePayments()`, pay flow reusing
`payPurchaseId`/`payPurchase`). Purchase **recording** stays a page-level panel —
it's a line-item editor (surface 3). Suppliers side untouched.

## ✅ Phase 3 — Proformas preview drawer (`/pos/proformas`) (done)

`pos/proformas/proformas.component.ts`. Row click now opens a read-only preview drawer:
lines, customer, totals, validity. Edit keeps routing to `/pos/sell?draft=id`; the
drawer's actions slot carries Edit / Print / Delete, with Convert in the body (all close
the preview first). Row actions unchanged.

## ✅ Phase 4 — Staff performance drill-down (`/staff-performance`) (done)

`performance/staff-performance.component.ts`. The hand-rolled `div.modal.modal-open`
(`max-w-4xl` per-day sales table) is retired — the drawer now shows a stat summary
(net/collected) plus two-line daily rows. Row click opens it; stale-fetch guards added.

## ✅ Phase 5 — Drawer edit mode (tier 2) (done)

Drawer edit mode landed per the design language, retiring the "close drawer → scroll to
top panel" flow:

- **Customers** — the 5-field create/edit form moved into the drawer ("Edit customer" /
  "New customer"); the inline top card and `formOpen` plumbing are gone.
- **Suppliers** — same for the supplier create/edit form.
- The `app-drawer` shell needed no changes — parents swap the projected body on an
  `editing`/`creating` signal and drive the title.

## ✅ Phase 6 — Products detail drawer (`/products`) (done)

`products/products.component.ts`. Row click opens the detail drawer: variant list with
stock, batch/expiry drill-down (the `expandedFamily`/`batchesFor` content restacked into
drawer patterns; `expandedFamily` and both expansion variants removed). The two-step
product-editor **modal stays a modal** — the drawer's Edit action closes the drawer and
opens it. The drawer reads from the loaded `families`/`catalog`/`stock` signals, so list
reloads stay live while open. Categories panel untouched.

## ✅ Phase 7 — Audit event drawer (`/settings/audit-trail`) (done)

`audit/audit.component.ts`. The `expanded` row-detail (desktop + mobile + shared
`#details` template) moved into a read-only drawer: entity/actor/time header, reason
callout, field-level before→after diff rows, record meta, and an "Open {area}" action.
Ledger/journal and the cashier queue keep `row-detail`.

## ⛔ Out of scope (with reasons)

- **Checkout, cashier session open/close** — blocking transaction steps; modals by design.
- **POS cashier queue** — speed-critical queue; lightweight `row-detail` stays.
- **Ledger / journal / approvals** — read-only accounting and request metadata; with the
  cashier queue, the remaining sanctioned `row-detail` cases.
- **Money → Credit** — deliberately delegates to the customers/suppliers drawers.
- **Commissions, stock adjustments, stock transfers, expenses, money transfers** —
  form-first or dashboard pages with no per-row detail worth a surface.
- **Team** — per-member content is thin today (role select + locations modal); revisit if
  member detail grows. The locations modal is a convergence candidate, not a drawer one.
- **Sell workspace customer peek** — workspace modal; unify markup only if touched.

## Cross-cutting follow-up (unscheduled)

Hand-rolled modals exist in three styles (`<dialog class="modal modal-open">`,
`div.modal.modal-open`, shared `delete-confirmation-modal`). Converging them on one shared
modal component is worthwhile but separate from drawer adoption; do it when touching a
modal for another reason.
