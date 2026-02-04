# Shift and reconciliation

Every closed cashier session (shift) must have a reconciliation history entry. Closing a session creates that entry in the same transaction; if something failed in the past, you can detect and repair it.

## Reconciliation history = any event

**Reconciliation history** is any reconciliation event: opening a shift (you enter real account values), closing a shift, or creating a **manual reconciliation** that records actual values for all accounts. All of these appear in the same history list.

- **Shift** = one cashier session (open → close).
- **Shift entry** = the snapshot at close: session marked closed, closing cash count, and a **closing reconciliation** record.
- **Reconciliation history** (UI) lives under **Accounting → Reconciliation** tab. It lists all events: opening recon (`scope=cash-session`, same-day range), closing recon (per session), and manual recons (`scope=manual`).

Opening a shift creates an **opening** reconciliation (real account values entered). Closing creates a **closing** reconciliation. Manual reconciliation (Accounting → Reconciliation → Create manual reconciliation) records real account values for **all** ledger accounts for a date range.

Primary way to get a session reconciliation is to close via `closeCashierSession`. The mutation `createCashierSessionReconciliation` is for **recovery/backfill** only (e.g. after a past bug or manual fix).

## Detecting missing reconciliations

Use the admin query:

```graphql
query ClosedSessionsMissingReconciliation($channelId: Int!, $startDate: DateTime, $endDate: DateTime) {
  closedSessionsMissingReconciliation(channelId: $channelId, startDate: $startDate, endDate: $endDate) {
    sessionId
    closedAt
  }
}
```

Requires `ManageReconciliation` permission. Returns closed sessions that have no closing reconciliation record (optional `startDate`/`endDate` filter by session `openedAt`; `take`/`skip` for paging).

## Repairing missing reconciliations

For each session returned by `closedSessionsMissingReconciliation`:

1. Call `createCashierSessionReconciliation(sessionId: <id>, notes: "Repair: missing closing reconciliation")`.
2. The mutation is idempotent: if a closing recon already exists for that session, it returns the existing record and does not create a duplicate.

You can script repair by querying `closedSessionsMissingReconciliation` and then calling `createCashierSessionReconciliation` for each `sessionId`. Safe to run multiple times.
