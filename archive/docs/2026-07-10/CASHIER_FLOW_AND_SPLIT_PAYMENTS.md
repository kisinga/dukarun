# Cashier Flow & Split (Multi-Tender) Payments

Status: **implemented** (2026-07-02). Frontend needs the codegen/activation step below.

## What it does

A salesperson rings up a sale on the Sell screen and taps **Send to cashier**. Instead of
settling immediately, the order is **parked**: fulfilled, marked owing, and placed on the
**Cashier** queue. A cashier opens the queue, taps **Collect payment**, and settles the
order — optionally **splitting the amount across several tenders** (e.g. part cash, part
M‑Pesa) in a single atomic transaction.

Before this change `isCashierFlow` was dead: "Send to cashier" produced a fully‑paid order.

## Model

A cashier‑parked order is **ledger‑identical to a credit sale** — `DR ACCOUNTS_RECEIVABLE /
CR SALES` at fulfilment — but:

- it is **not** subject to credit approval (walk‑in customers aren't credit‑approved), and
- it carries a `cashierPendingAt` marker so it shows on the cashier queue.

Settlement is therefore uniformly a **payment allocation against AR** (`DR <tender> / CR AR`),
the same primitive credit repayment already uses — so a split is just N allocations against the
one receivable, posted atomically.

### Backend

| Concern | Where |
| --- | --- |
| Park branch (`isCashierFlow`) | `order-creation.service.ts` → `handleCashierFlow` / `postFulfilledUnpaidSale` / `markCashierPending` |
| Marker custom field | `entity.custom-fields.ts` → `Order.cashierPendingAt`; column via migration `9930000000000` |
| Settle engine (multi‑tender) | `payment-allocation.service.ts` → `settleOrderPayments(orderId, tenders[])` |
| Cashier queue | `payment-allocation.service.ts` → `getPendingCashierOrders` |
| Permission | `credit/permissions.ts` → `SettleOrderPermission`; registered in `credit.plugin.ts` |
| Role seeding | `role-provisioner.service.ts` (admin + cashier + `ALL_ADMIN_PERMISSIONS`) |
| Grant‑before‑gate | migration `9940000000000` (grants `SettleOrder` to `UpdateOrder` holders = admin + cashier) |
| GraphQL | `credit.plugin.ts` schema + `payment-allocation.resolver.ts` (`settleOrderPayments`, `pendingCashierOrders`) |
| Safety‑net fix | `payment-events.adapter.ts` skips `paymentType: 'cashier-settlement'` (see below) |

`settleOrderPayments` is **strictly order‑scoped**: it reads the amount owing from the ledger by
`orderId` (never by customer), so concurrent orders on the shared walk‑in customer never bleed
into each other. It validates each tender is a positive integer of cents and that the total does
not exceed the amount owing; the ledger's AR invariant is the backstop against overpay. Every
tender settles inside one `withTransaction` — all tenders post or none do. The `fullySettled`
flag and marker‑clear are computed from a **post‑commit** ledger read (ledger queries use a
non‑transactional connection, so an in‑transaction read wouldn't see the just‑posted lines);
this also makes the marker‑clear correct under concurrent partial settlements.

Tenders are tagged `metadata.paymentType: 'cashier-settlement'` so the `PaymentEventsAdapter`
safety net does **not** re‑post them as a phantom cash sale (which would double‑book revenue —
the allocation's `PaymentAllocation` entry does not collide with the adapter's `Payment` entry
on the `(sourceType, sourceId)` idempotency key).

### Frontend

- `PENDING_CASHIER_ORDERS` query + `SETTLE_ORDER_PAYMENTS` mutation in `operations.graphql.ts`
- `cashier-settlement.service.ts` (queue + settle)
- `pages/cashier/cashier.component.ts` — the queue
- `pages/cashier/components/settle-order-modal.component.ts` — the split‑tender modal (add a
  payment, pick a method + amount, "Rest" fills the remainder; live "left to allocate")
- `guards/cashier.guard.ts` + `auth-permissions.service.ts#canSettleOrders` (`SettleOrder`)
- `/dashboard/cashier` route + **Cashier** nav item (visible only to settlers)

The Sell‑screen "Send to cashier" flow already existed and needs no change.

## Scope (v1) & follow‑ups

- **In:** cash + M‑Pesa splits, "collect at counter", full or partial settlement.
- **Deferred (not needed for the common case):**
  - EFT / cheque tenders (Vendure `Authorized` lifecycle + a `CLEARING_EFT` account) — see the
    ledger countercheck notes.
  - Un‑hardcoding `getCashierSessionTotals` / `getSalesBreakdown` (R4) so a **third** cash‑drawer
    tender is reconciled. v1 tenders (cash + M‑Pesa) are already covered by those functions.
  - Clearing the marker on order void/reversal (today the queue simply hides zero‑owing orders,
    so a voided‑but‑marked order never appears — harmless).

## Activation (required after deploy)

The backend adds a DB column, a permission, and two GraphQL operations. Run, in order:

1. **Backend build + migrate** — applies `9930…` (adds `customFieldsCashierpendingat`) and
   `9940…` (grants `SettleOrder` to admin + cashier). Existing non‑SuperAdmin users **must**
   get the grant before the resolver gate applies, which `9940…` handles.
2. **Codegen** — `cd frontend && npm run codegen` against the running backend so the generated
   types include `pendingCashierOrders` / `settleOrderPayments`. Until then
   `cashier-settlement.service.ts` uses a local cast to keep the app compiling; codegen restores
   full type inference.
3. **Frontend build.**

Smoke test: Sell → Send to cashier → order appears on **Cashier** → Collect payment with a
cash+M‑Pesa split → order leaves the queue, AR nets to zero, session totals reflect the cash and
M‑Pesa collected.
