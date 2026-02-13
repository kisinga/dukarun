# Plan: Manual reconciliation updates the ledger

**Principles:** Composition over new abstractions. Reuse existing posting path (same as shift close). No backdating. Only post for accounts the user submitted. No overengineering.

---

## 1. Behaviour

- **Manual reconciliation** = snapshot: record declared amounts and **post variance to the ledger** so ledger matches declared. Same function as shift close, but for all (or a subset of) accounts.
- **Snapshot = now.** No backdating. Server uses today for range and for expected balances. One reconciliation = one snapshot; multiple rows are fine.
- **Only submitted accounts.** Post variance only for accounts the user explicitly edited (unlocked and entered a value). Other accounts are unchanged.

---

## 2. Backend

**Compose existing pieces.** No new posting type, no new service. `ReconciliationService` already has `AccountBalanceService`; add `FinancialService` and reuse `postVarianceAdjustment`.

### 2.1 ReconciliationService.createReconciliation (scope = manual)

- **When `input.scope === 'manual'`:**
  - Force `rangeStart` and `rangeEnd` to **today** (server date, e.g. `new Date().toISOString().slice(0, 10)`). Ignore client-supplied range for manual.
  - Run the whole flow in **one transaction** (`connection.withTransaction(ctx, async (txCtx) => { ... })`):
    1. Create and save `Reconciliation` (with today for range; header expected/actual/variance can be derived from the accounts we process).
    2. Create and save `ReconciliationAccount` rows for `input.accountIds` / `input.accountDeclaredAmounts` (unchanged).
    3. For **each** `accountId` in `input.accountIds`:
       - Resolve `accountId` → `Account` (need `code`).
       - `expectedCents` = `accountBalanceService.getAccountBalance(txCtx, code, channelId, today).balance`.
       - `declaredCents` = from `input.accountDeclaredAmounts[accountId]` (parse to number).
       - `varianceCents` = declaredCents - expectedCents.
       - If `varianceCents !== 0`: `financialService.postVarianceAdjustment(txCtx, 'manual', code, varianceCents, 'Manual reconciliation', saved.id)`.
  - Use existing idempotency: `sourceId` = `'manual-' + accountCode + '-' + reconciliationId` (same pattern as shift close with synthetic sessionId `'manual'`).

- **When `input.scope !== 'manual'`:** Keep current behaviour (no posting). Shift open/close already post in `OpenSessionService`.

### 2.2 Dependencies

- Inject `FinancialService` into `ReconciliationService` (constructor). Both are in the same plugin; no new modules.

### 2.3 Header expected/actual/variance

- For manual, we can compute header `expectedBalance` / `actualBalance` / `varianceAmount` from the same loop (sum expected, sum declared, difference). Optional: set them on the reconciliation before save so list views show totals. If left as-is, backend can keep current logic (input.expectedBalance optional; actualBalance = sum declared; variance = expected - actual). Minimal change: keep existing header calculation but use today when scope is manual.

### 2.4 GraphQL / DateTime

- Schema has `rangeStart`/`rangeEnd` as `DateTime!`. Frontend must send full ISO (e.g. `today + 'T00:00:00.000Z'` and `today + 'T23:59:59.999Z'`). Resolver passes through; for manual, backend overwrites with today anyway. Fix in frontend so the mutation doesn’t fail (see below).

---

## 3. Frontend

### 3.1 Only submit edited accounts

- **Track “edited” accounts:** e.g. a signal `manualEditedAccountIds: Set<string>` (or a record of accountId → true). When the user **unlocks** an account and **enters or confirms** a value, add that account to the edited set.
- **Submit payload:** Build `accountIds` and `accountDeclaredAmounts` **only from** `manualEditedAccountIds`. Do not include accounts the user never touched. So we only send accounts for which “new values have been submitted.”

### 3.2 Unlock-per-account

- **Default:** Declared column is read-only (or disabled) for each row.
- **Unlock:** Per-row control (e.g. “Edit” button or icon). On unlock, that account’s input becomes editable; add account to `manualEditedAccountIds` when they unlock (or when they first change value—product choice).
- **System accounts:** Remain non-editable (no unlock). Already excluded from submit.

### 3.3 Warning

- **Copy:** Clear warning near the form, e.g. “If a transaction is posted before you apply, the snapshot may be stale and applying can cause inconsistency. Submit in a quiet moment.”
- No extra “locking” of the ledger for this iteration unless we already have a pattern.

### 3.4 Snapshot date = today

- **No date picker** for manual reconciliation. Show “Snapshot as of [today]” (read-only). Use `getTodayIsoDate()` for display and for `rangeStart`/`rangeEnd` when calling the API.
- **DateTime fix:** Send full ISO: `rangeStart: \`${today}T00:00:00.000Z\``, `rangeEnd: \`${today}T23:59:59.999Z\`` (or same instant) so the mutation satisfies `DateTime!`.

### 3.5 actualBalance on submit

- `actualBalance` = sum of declared (in cents) for **edited accounts only**. Matches backend’s view of “only these accounts were reconciled.”

---

## 4. Out of scope (no overengineering)

- **Schema change:** Keep `rangeStart`/`rangeEnd`. For manual we force them to today. A future refactor to a single `asOfDate`/`snapshotAt` is not in this plan.
- **One manual recon per day:** Not required. Multiple snapshots are valid.
- **Double-submit:** Not a correctness issue (second submit sees updated ledger; variance 0 for same declared). Duplicate rows are acceptable. No server-side dedup.
- **New posting type or new service:** Reuse `postVarianceAdjustment` and `FinancialService` only.

---

## 5. Negatives in opening/closing (double-entry)

**Accounting:** In our ledger, balance = debits − credits for every account. So a **negative** balance means credits exceed debits. For **CASH_ON_HAND** (asset), negative = we’ve credited more than we’ve debited (e.g. refunds, or prior shortage adjustments). So “negative cash” is a valid state: the drawer is short relative to the books. For **liability/clearing** accounts, the same convention applies; sign is consistent.

**Expected (prefill):** Must show the true ledger balance. So **expected can be negative**. Backend already returns signed `balanceCents`; frontend should display it as-is (e.g. `-10.00` or `(10.00)`). Do not clamp expected to zero anywhere.

**Declared:** For physical cash, the cashier counts what’s in the drawer, so declared is usually ≥ 0. Allowing `min="0"` on the declared input is reasonable. If the business ever allows “declared negative” (e.g. IOU), the same formula still holds.

**Variance and posting:** We use **variance = declared − expected**. Examples:
- Expected = −1000, declared = 0 → variance = 1000 → we **debit** the account 1000, **credit** CASH_SHORT_OVER → account moves from −1000 to 0. Correct.
- Expected = 5000, declared = 4000 → variance = −1000 → we **credit** the account 1000, **debit** CASH_SHORT_OVER → shortage. Correct.

`postVarianceAdjustment` already uses the sign of `varianceCents` to choose debit/credit; no change needed there. Ensure **display** of expected and variance in the shift modal never clamps or hides negative values (use signed format or parentheses).

---

## 6. Summary

| Layer   | Change |
|--------|--------|
| Backend | ReconciliationService: inject FinancialService; for scope=manual force range to today, run create + post variance in one transaction; per input account with variance ≠ 0 call postVarianceAdjustment(ctx, 'manual', code, variance, 'Manual reconciliation', recon.id). |
| Frontend | Track edited accounts (unlock + value); submit only those in accountIds/accountDeclaredAmounts; unlock-per-account UI; warning copy; snapshot date = today only, send range as full ISO. |
| Negatives | Show expected and variance as signed (no clamp to zero). Posting formula variance = declared − expected is correct for negative expected. |
