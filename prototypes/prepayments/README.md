# Customer deposits and supplier advances prototype

Executable database mockup for validating prepayment accounting before changing
the production Supabase schema.

Run:

```sh
npm run prototype:prepayments
```

Expected result:

```text
prepayment prototype: 39 correctness checks passed
```

## Design proved by this prototype

Customer deposits and supplier advances are separate operational subledgers:

- Customer deposit receipt: debit money account, credit `CUSTOMER_DEPOSITS` liability.
- Supplier advance payment: debit `SUPPLIER_ADVANCES` asset, credit money account.
- Applications link deposits to sales and advances to purchases.
- Existing `payments` and `purchase_payments` remain document-settlement records.
  Internal applications are identified separately from real cash movement.
- Only residual sale credit enters AR. Only residual purchase credit enters AP.
- Refunds and reversals restore both operational availability and ledger balances.

Core tables proposed:

- `customer_deposits`
- `customer_deposit_allocations`
- `customer_deposit_refunds`
- `supplier_advances`
- `supplier_advance_allocations`
- `supplier_advance_refunds`

## Invariants exercised

- Deposits and advances can exist before any sale or purchase.
- Every posted journal is balanced and immutable.
- Operational subledger totals tie to their general-ledger control accounts.
- Unapplied funds do not distort AR or AP.
- Applications cannot exceed available funds or document balance.
- Funds cannot cross companies, customers, or suppliers.
- Receipt creation is idempotent through company-scoped client references.
- Sale reversal restores customer deposit availability and AR.
- Supplier-application reversal restores advance availability and AP.
- Refunds cannot exceed unapplied balances.
- Credit limits apply only to residual AR/AP.

## Why SQLite only for the mockup

SQLite makes the accounting model executable without touching production
migrations. It does not prove PostgreSQL-specific behavior. Production work must
add and test:

- RLS and company-scoped `security definer` RPCs.
- `FOR UPDATE` locking and concurrent-allocation tests.
- Cashier session, location access, payment-method reconciliation, and approvals.
- Append-only reversal RPCs and existing sale-refund ceiling changes.
- Audit and cache-change triggers.
- Customer/supplier statement and reporting updates.
- pgTAP tests against the real Supabase PostgreSQL schema.

`schema.sql` contains the isolated model. `verify.mjs` acts like transactional
RPCs and runs the correctness scenarios.
