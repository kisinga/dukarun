# Accounting Page Refactor Plan

Full refactor of the Accounting page: single sources of truth, composable data flow, and fixes for balances, tabs, and reconciliation. No backward-compatibility constraints; favor simplicity and composition.

---

## 1. Desired outcomes

- **Current balances** show correct ledger values (Accounts tab and Reconciliation “Current” column), not 0.
- **Accounts tab** activates on click and shows the account list (cards/table), not only section titles.
- **Single data source at root:** Accounting parent loads accounts and shared data once; tabs receive data via inputs and optionally enrich (e.g. reconciliation tab fetches its own list and details).
- **Reconciliation** is a single **as-of date** (non-editable, current date). No date range; snapshot semantics only.
- **Consistent patterns:** One way to get balances, one way to drive tab content, minimal duplication.

---

## 2. Root causes (concise)

| Problem | Cause |
|--------|--------|
| Balances always 0 | Accounts tab: uses `ledgerAccounts` (all-time balance). If channel/context is wrong or no journal lines, backend returns 0. Reconciliation “Current”: `accountBalancesAsOf` is only called when a date is set; with fixed reconciliation date (current date) this runs on load. |
| Accounts tab “doesn’t activate” | Tab content is gated by `activeTab() === 'accounts'` from `route.queryParams`. If the router doesn’t emit when only query params change, or link doesn’t navigate, tab doesn’t switch. |
| Accounts tab only shows “Assets 5 accounts” | Section title comes from `hierarchicalAccounts()[type].length`; list is inside collapse. Likely causes: collapse closed by default in some setups, or child components (account-card/account-row) failing to render (e.g. invalid self-import in `imports` array). |
| Reconciliation list empty | Reconciliations loaded with `channelId` from `companyService.activeCompanyId()`. Wrong or missing channelId, or backend returning no rows, yields empty list. |
| Shifts expand no details | `getSessionReconciliationDetails(session.id)` called with invalid or non-UUID id (e.g. -1), or backend has no reconciliation rows for that session. |

---

## 3. Architecture (single sources of truth)

- **Tab content visibility:** `activeTab` is the only source; derived from `route.queryParams['tab']` in the parent. Tabs are links that set `?tab=accounts` (or overview, transactions, reconciliation). No duplicate state.
- **Accounts and entries:** Parent (`AccountingComponent`) owns `loadData()` → `ledgerService.loadAccounts()` and `loadJournalEntries()`. All tabs receive `accounts()`, `entries()`, or derived computeds (`hierarchicalAccounts`, `filteredEntries`, etc.). Reconciliation tab additionally fetches reconciliations list and per-reconciliation details; manual form uses `reconciliationDate` (current date) and `accountBalancesAsOf(reconciliationDate)`.
- **Balances:**  
  - **List/overview:** From `ledgerAccounts` (all-time) for the current channel.  
  - **Reconciliation “Current”:** From `accountBalancesAsOf(channelId, reconciliationDate)`; reconciliation date is fixed (current date), so effect runs on init.
- **Eligible accounts:** One API (e.g. `eligibleDebitAccounts`) for payment destination, expense source, purchase pay-from. Same validation rules everywhere.

---

## 4. Implementation (concise)

**4.1 Reconciliation date (done)**  
- Single signal: `reconciliationDate = signal(getTodayIsoDate())`, non-editable. UI shows read-only “Reconciliation date: YYYY-MM-DD”. Submit uses `rangeStart = rangeEnd = reconciliationDate()`. Balances effect runs on `reconciliationDate()` so “Current” loads on init.

**4.2 Tab activation**  
- Ensure tab links use `routerLink` with `queryParams: { tab: path }`. Ensure parent subscribes to `route.queryParams` and sets `activeTab`; if the router reuses the same route and doesn’t emit, consider `route.queryParams.pipe(startWith(route.snapshot.queryParams))` or equivalent so initial and subsequent param changes both update `activeTab`.

**4.3 Accounts tab content**  
- Remove self-import from `AccountCardComponent` and `AccountRowComponent` (e.g. `imports: [CommonModule]` only).  
- Ensure collapse is open by default (e.g. `checked` on the checkbox or use `details`/`summary` with `open`).  
- Verify `hierarchicalAccounts()` from parent is passed correctly and that account nodes have `id` for `track`.

**4.4 Data at root**  
- Keep `loadData()` in parent; tabs receive only what they need (accounts, hierarchicalAccounts, formatCurrency, etc.). Optionally introduce one “accounting context” object (accounts, entries, hierarchicalAccounts, formatCurrency, loading, error) and pass `[context]="accountingContext()"` to reduce prop count. Avoid duplicate loading of accounts/entries inside tabs.

**4.5 Current balances**  
- **Accounts tab:** Confirm `ledgerAccounts` is called with correct channel (from active company/channel). No date filter for this view; all-time balance is correct.  
- **Reconciliation “Current”:** Already correct once `reconciliationDate()` is set (current date) and effect runs; no change beyond 4.1.

**4.6 Reconciliations list**  
- Verify `channelId` passed to `getReconciliations` is the active channel. Log or handle empty response; show “No reconciliations” when list is empty. Ensure expand calls `getReconciliationDetails(reconciliationId)` with the reconciliation id (not session id).

**4.7 Shifts expand**  
- Guard: before calling `getSessionReconciliationDetails(sessionId)`, ensure `sessionId` is a non-empty, non-’-1’, valid UUID. In `CashierSessionService.getSessionReconciliationDetails`, if `sessionId` is invalid, return `of([])` and do not call the API. Backend: ensure closing a session creates a reconciliation with `scope = 'cash-session'` and `scopeRefId = session.id` so details exist for closed sessions.

---

## 5. What to avoid

- Do not add a second source for “which tab is active” (e.g. local state that can diverge from the URL).
- Do not load accounts or journal entries inside tab components; load at root only.
- Do not use editable date range for manual reconciliation; keep a single read-only as-of date (current date).
- Do not duplicate balance-fetch logic across tabs; one balance API per use case (ledgerAccounts for list, accountBalancesAsOf for reconciliation).

---

## 6. Order of work

1. Reconciliation date: non-editable, current date (done).
2. Tab activation: fix queryParams subscription / link so Accounts tab activates.
3. Accounts tab content: fix card/row self-import and collapse open state.
4. Reconciliations list and expand: verify channelId and API; fix empty list or expand.
5. Shifts expand: guard sessionId; ensure backend creates reconciliation on session close.
6. Optional: single “accounting context” object at root to reduce inputs to tabs.
