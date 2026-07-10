# Payment allocation flow – validation and polish

## Implementation status

- **Partial payment fix (customer orders):** Implemented. `PaymentAllocationService` now uses a private helper `addAllocatedPaymentToOrder` that calls `PaymentService.createPayment` (so the handler runs and `Payment.amount` equals the allocated amount), then settles if needed. Both `allocatePaymentToOrders` and `paySingleOrder` use this helper. Specs updated (debit-account-and-payments, session-gate, cashier-ledger-flows) to mock `createPayment`/`settlePayment`; all 23 tests pass.

## Current system (post-fix)

**Customer orders (sales):**

- **allocatePaymentToOrders:** Uses private helper `addAllocatedPaymentToOrder`, which calls `PaymentService.createPayment(ctx, order, amount, method, metadata)` so the payment handler runs and the created `Payment` has `amount` equal to the allocated amount. Then settles if not already Settled, then `financialService.recordPaymentAllocation(..., amountToAllocate, ...)` and `creditService.recordRepayment(ctx, customerId, 'customer', totalAllocated)`.
- **paySingleOrder:** Same helper: `addAllocatedPaymentToOrder` then `recordPaymentAllocation`. No more find-payment-by-metadata or fallbacks.

**Important (post-fix):** The handler (cash/credit/mpesa) is invoked via `createPayment` and uses `metadata?.allocatedAmount` when valid, so partial payments create a Payment with the correct amount and the order stays in ArrangingPayment until fully paid.
**Supplier purchases:** Unchanged: `allocatePaymentToPurchases` writes `PurchasePayment` rows and updates `paymentStatus`; `paySinglePurchase` delegates to it with `purchaseIds: [id]`. No Vendure Payment involved; partial payments work.

---

## Flow validation summary

### What works

- **Customer balance after payment:** Ledger is the source of truth. `recordPaymentAllocation` is called with the **allocated amount** (`amountToAllocate`) and posts a credit to AR, so the customer’s balance (from `getCustomerBalance`) decreases by the amount paid. So “customer not owing the amount entered” is correct at the ledger level.
- **Supplier side:** Uses `PurchasePayment` records and `paymentStatus`; paid amount and balance are consistent. `recordRepayment(ctx, supplierId, 'supplier', totalAllocated)` and ledger postings are correct.
- **Unified credit service:** `CreditService.recordRepayment(ctx, entityId, partyType, amount)` with `partyType` (`'customer' | 'supplier'`) and shared field maps is a good composition; both allocation services use it correctly.
- **Supplier “pay single”:** `paySinglePurchase` delegates to `allocatePaymentToPurchases` with `purchaseIds: [purchaseId]` – single code path, no duplication.

### What’s wrong or inconsistent

1. ~~**Partial payment bug (customer orders)**~~ **Fixed.** Both paths now use `addAllocatedPaymentToOrder` → `createPayment` (handler runs) → settle → `recordPaymentAllocation`. Payment amount equals allocated amount; order stays in ArrangingPayment until fully paid.

2. **Reference number never persisted in bulk flow**  
   `CustomerPaymentService.recordBulkPayment` accepts `referenceNumber` but never adds it to the `input` sent to `allocateBulkPayment`. The schema `PaymentAllocationInput` also has no `referenceNumber`. So the bulk-payment modal’s reference is never stored.  
   **Fix:** Add `referenceNumber` (and, if desired, `debitAccountCode`) to `PaymentAllocationInput` and to the payload in `recordBulkPayment`; in `allocatePaymentToOrders`, pass reference into payment metadata (and use it in ledger memo if applicable).

3. **Two customer payment paths**  
   We still have two entry points: `allocateBulkPayment` (credit-only, no method/reference in input) and `paySingleOrder` (method, reference, debit account). The pay-order modal and order-detail use `paySingleOrder`. So we don’t yet have “one hook” where providing the order is just `orderIds: [orderId]`.

---

## Polish and consistency

| Area | Issue | Recommendation |
|------|--------|----------------|
| **payment-handlers.ts** | Comment says “caller (e.g. paySingleOrder, allocation loop)” | Update to “caller (e.g. allocation flow)” or “allocation / paySingleOrder” depending on whether you keep paySingleOrder. |
| **recordBulkPayment** | Doesn’t send `referenceNumber` or `debitAccountCode` in input | Add both to the mutation input when extending the schema; pass them from the bulk-payment modal. |
| **allocateBulkPayment result** | Backend returns `excessPayment`; frontend operation may not request it | Add `excessPayment` to the `allocateBulkPayment` selection in `operations.graphql` if the UI or types should show it (keeps contract aligned). |
| **PayOrderModalData** | No `customerId` | Add `customerId` so the modal can call a single allocation API with `orderIds: [orderId]` and optional method/reference/debit (when you unify on one mutation). |
| **Single allocation hook** | Plan not applied: paySingleOrder and paySinglePurchase still exist; allocation input has no method/reference | When ready: extend `PaymentAllocationInput` with `paymentMethodCode?`, `referenceNumber?`; use them in `allocatePaymentToOrders`; remove `paySingleOrder` and have modal/order-detail call `allocateBulkPayment` with `orderIds: [orderId]`. Mirror suppliers by removing `paySinglePurchase` and having pay-purchase modal call `allocateBulkSupplierPayment` with `purchaseIds: [purchaseId]`. |
| **CustomerPaymentService** | TODO: “Store reference number in payment metadata if backend supports it” | Resolve by adding reference to backend input and metadata (and optionally remove the TODO once done). |

---

## Recommended order of work

1. **Fix partial payment (customer orders):** Done. Both paths use `addAllocatedPaymentToOrder` (createPayment + settle) so Payment amount equals allocated amount.
2. **Persist reference (and optional debit) in bulk:** Add `referenceNumber` (and `debitAccountCode` if not already in input) to `PaymentAllocationInput`, pass from `recordBulkPayment`, and store reference in payment metadata in the allocation loop.
3. **Unify on one allocation hook (optional):** Extend input with `paymentMethodCode?`/`referenceNumber?`, use in allocation only, remove `paySingleOrder`/`paySinglePurchase`, and have all UIs call the single allocation mutation with the appropriate id list.

After (1), the flow is correct: amount entered is deducted from the customer balance (already true from ledger) and the order stays partially paid until the sum of payments reaches the order total.
