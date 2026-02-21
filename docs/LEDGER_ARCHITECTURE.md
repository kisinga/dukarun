# Ledger Architecture: Single Source of Truth

## Overview

The Dukarun financial system uses a **double-entry ledger** as the single source of truth for all financial transactions. This ensures data integrity, auditability, and accurate financial reporting.

## Core Principles

### 1. Ledger as Single Source of Truth

- **All financial data** (balances, outstanding amounts, totals) comes from the ledger
- **No local calculations** - backend `FinancialService` provides all financial data
- **No fallbacks** - if ledger is unavailable, operations fail gracefully with clear errors
- **Atomic transactions** - domain changes and ledger postings occur in the same database transaction

### 2. Double-Entry Accounting

Every financial transaction creates balanced journal entries:

- **Debits = Credits** (always balanced)
- Each entry has at least two lines (debit and credit)
- Accounts are categorized (Asset, Liability, Revenue, Expense)

### 3. Channel-Specific Ledger

Each Vendure channel (business) has its own:

- **Chart of Accounts (CoA)** - predefined accounts required for operations
- **Journal entries** - all entries are channel-scoped
- **Account balances** - computed per channel

### 4. Expected balance and reconciliation

All reconciliation "expected" balance must come from a single API so that ledger-derived values are never mixed with values from other sources (e.g. reconciliation or session tables).

- **Use `LedgerQueryService.getExpectedBalanceForReconciliation(channelId, scope, scopeRefId, accountCode, asOfDate?)`** for any reconciliation expected balance. For `scope === 'cash-session'` this returns the session-scoped ledger balance; for `scope === 'manual'` it returns the full ledger balance as of `asOfDate`.
- **Do not compute expected** as "value from reconciliation/session table + ledger value." That pattern causes double-counting (e.g. session balance already includes opening variance, so adding opening float again is wrong).

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Angular)                     │
│  • CustomerCreditService                                 │
│  • OrderService                                          │
│  • PaymentAllocationService                              │
│  • No financial calculations - only display              │
└────────────────────┬────────────────────────────────────┘
                     │ GraphQL API
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Backend Financial Facade                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │         FinancialService                          │  │
│  │  • getCustomerBalance()                           │  │
│  │  • getSupplierBalance()                           │  │
│  │  • recordPayment()                                 │  │
│  │  • recordSale()                                    │  │
│  │  • recordPurchase()                               │  │
│  │  • recordSupplierPayment()                        │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                    │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │      LedgerQueryService                           │  │
│  │  • Aggregates balances from journal_lines         │  │
│  │  • Caches balances for performance                │  │
│  │  • Invalidates cache on new entries               │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                    │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │      LedgerPostingService                        │  │
│  │  • Maps domain events to journal entries         │  │
│  │  • Validates Chart of Accounts                   │  │
│  │  • Checks period locks                           │  │
│  │  • Builds journal lines from policies            │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Core Ledger Services                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │         PostingService                           │  │
│  │  • Creates journal entries                       │  │
│  │  • Validates balance (debits = credits)          │  │
│  │  • Enforces idempotency                          │  │
│  │  • Checks period locks                           │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                    │
│  ┌──────────────────┴───────────────────────────────┐  │
│  │      ChartOfAccountsService                      │  │
│  │  • Initializes required accounts per channel     │  │
│  │  • Validates account existence                   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Database (PostgreSQL)                       │
│  • ledger_account (Chart of Accounts)                    │
│  • ledger_journal_entry (Journal entries)                │
│  • ledger_journal_line (Journal lines)                   │
│  • purchase_payment (Supplier payment audit trail)      │
└─────────────────────────────────────────────────────────┘
```

## Key Services

### FinancialService (Facade)

The main facade that abstracts all ledger interactions. Provides a clean API without accounting terminology.

**All amounts returned are in smallest currency unit (cents).** See [CURRENCY_CONVENTION.md](CURRENCY_CONVENTION.md).

```typescript
// Customer operations - amounts in cents
getCustomerBalance(customerId: string, channelId: string): Promise<number>
recordPayment(paymentId: string, channelId: string): Promise<void>
recordPaymentAllocation(input: PaymentAllocationInput): Promise<PaymentAllocationResult>
recordSale(orderId: string, channelId: string): Promise<void>

// Supplier operations
getSupplierBalance(supplierId: string, channelId: string): Promise<number>
recordPurchase(purchaseId: string, channelId: string): Promise<void>
recordSupplierPayment(input: SupplierPaymentAllocationInput): Promise<SupplierPaymentAllocationResult>
```

### LedgerQueryService

Aggregates balances from journal lines:

```typescript
getAccountBalance(accountCode: string, channelId: string, asOfDate?: Date): Promise<number>
getCustomerBalance(customerId: string, channelId: string): Promise<number>
getSupplierBalance(supplierId: string, channelId: string): Promise<number>
invalidateBalanceCache(accountCode: string, channelId: string): void
```

### LedgerPostingService

Maps domain events to journal entries using posting policies:

```typescript
postPayment(paymentId: string, channelId: string): Promise<void>
postSale(orderId: string, channelId: string): Promise<void>
postPurchase(purchaseId: string, channelId: string): Promise<void>
postSupplierPayment(input: SupplierPaymentAllocationInput): Promise<void>
```

### PostingService (Core)

The core service that creates journal entries:

```typescript
post(
  channelId: string,
  lines: JournalLineInput[],
  sourceType: string,
  sourceId: string,
  entryDate?: Date
): Promise<JournalEntry>
```

**Features:**

- Validates balance (debits = credits)
- Enforces idempotency (same sourceType + sourceId = same entry)
- Checks period locks
- Creates entries atomically

## Chart of Accounts

Each channel requires these accounts:

### Asset Accounts

- `CASH_ON_HAND` - Physical cash
- `CLEARING_MPESA` - M-Pesa clearing account
- `CLEARING_CREDIT` - Credit clearing account
- `ACCOUNTS_RECEIVABLE` - Customer outstanding amounts (AR)
- `INVENTORY` - Current inventory value (FIFO/COGS framework)

### Liability Accounts

- `ACCOUNTS_PAYABLE` - Supplier outstanding amounts (AP)

### Revenue Accounts

- `SALES` - Sales revenue

### Expense Accounts

- `PURCHASES` - Purchase costs
- `DISCOUNTS` - Discounts given
- `RETURNS` - Returns/refunds
- `COGS` - Cost of goods sold (FIFO/COGS framework)
- `INVENTORY_WRITE_OFF` - Inventory losses (damage, theft, etc.)
- `EXPIRY_LOSS` - Expired inventory losses

### Setup

Accounts are initialized per channel via:

1. **Automated**: `ChartOfAccountsService.initializeChannelAccounts(channelId)`
2. **Manual**: SQL script (see `CUSTOMER_PROVISIONING.md`)

## Transaction Flow Examples

### Customer Payment (Cash)

```
1. OrderService.completeOrderPayment()
   └─> OrderPaymentService.addManualPayment()
       └─> FinancialService.recordPayment()
           └─> LedgerPostingService.postPayment()
               └─> PostingService.post()
                   ├─> Debit: CASH_ON_HAND (+amount)
                   └─> Credit: SALES (revenue)
```

### Credit Sale

```
1. OrderCreationService.handleCreditSale()
   └─> FinancialService.recordSale()
       └─> LedgerPostingService.postSale()
           └─> PostingService.post()
               ├─> Debit: ACCOUNTS_RECEIVABLE (+orderTotal)
               └─> Credit: SALES (-orderTotal)
```

### Bulk Payment Allocation

```
1. PaymentAllocationService.allocateBulkPayment()
   └─> FinancialService.recordPaymentAllocation()
       └─> For each order:
           └─> LedgerPostingService.postPaymentAllocation()
               └─> PostingService.post()
                   ├─> Debit: CASH_ON_HAND (+amount)
                   └─> Credit: ACCOUNTS_RECEIVABLE (-amount)
```

### Supplier Payment

```
1. SupplierPaymentAllocationService.allocateSupplierPayment()
   └─> FinancialService.recordSupplierPayment()
       └─> Creates PurchasePayment records
       └─> LedgerPostingService.postSupplierPayment()
           └─> PostingService.post()
               ├─> Debit: ACCOUNTS_PAYABLE (-amount)
               └─> Credit: CASH_ON_HAND (+amount)
```

### Inventory Purchase (FIFO Framework)

```
1. InventoryService.recordPurchase()
   └─> Creates inventory batches
   └─> LedgerPostingService.postInventoryPurchase()
       └─> PostingService.post()
           ├─> Debit: INVENTORY (+totalCost)
           └─> Credit: ACCOUNTS_PAYABLE or CASH_ON_HAND (+totalCost)
```

### Inventory Sale COGS (FIFO Framework)

```
1. InventoryService.recordSale()
   └─> Allocates costs using FIFO strategy
   └─> LedgerPostingService.postInventorySaleCogs()
       └─> PostingService.post()
           ├─> Debit: COGS (+totalCogs)
           └─> Credit: INVENTORY (-totalCogs)
```

### Inventory Write-Off (FIFO Framework)

```
1. InventoryService.recordWriteOff()
   └─> Allocates costs for write-off
   └─> LedgerPostingService.postInventoryWriteOff()
       └─> PostingService.post()
           ├─> Debit: INVENTORY_WRITE_OFF or EXPIRY_LOSS (+totalLoss)
           └─> Credit: INVENTORY (-totalLoss)
```

## Balance Calculation

### Customer Balance (Outstanding Amount)

```sql
SELECT COALESCE(SUM(amount), 0)
FROM ledger_journal_line
WHERE account_code = 'ACCOUNTS_RECEIVABLE'
  AND channel_id = :channelId
  AND meta->>'customerId' = :customerId
  AND entry_date <= :asOfDate
```

**Note:** AR is an asset account, so:

- **Debit** = Customer owes us (positive balance)
- **Credit** = Customer paid us (negative balance)
- **Outstanding** = Sum of all lines (debits - credits)

### Supplier Balance (Outstanding Amount)

```sql
SELECT COALESCE(SUM(amount), 0)
FROM ledger_journal_line
WHERE account_code = 'ACCOUNTS_PAYABLE'
  AND channel_id = :channelId
  AND meta->>'supplierId' = :supplierId
  AND entry_date <= :asOfDate
```

**Note:** AP is a liability account, so:

- **Credit** = We owe supplier (positive balance)
- **Debit** = We paid supplier (negative balance)
- **Outstanding** = Sum of all lines (credits - debits)

## Idempotency

All ledger postings are **idempotent**:

- Key: `(sourceType, sourceId)`
- Same source = same journal entry (no duplicates)
- Example: `('payment', 'payment-123')` always creates the same entry

This ensures:

- Safe retries on network errors
- No duplicate postings
- Eventual consistency

## Period Locks

Periods can be locked to prevent modifications:

- **Locked periods** cannot have new entries
- **Current period** is always unlocked
- **Historical periods** can be locked for reconciliation

## Frontend Integration

### No Local Calculations

Frontend services **never** calculate financial data locally:

```typescript
// ❌ WRONG - Local calculation
const availableCredit = creditLimit - outstandingAmount;

// ✅ CORRECT - Use backend
const summary = await customerCreditService.getCreditSummary(customerId);
const availableCredit = summary.availableCredit; // From ledger
```

### Error Handling

If backend fails, show clear errors - **no fallbacks**:

```typescript
try {
  const summary = await customerCreditService.getCreditSummary(customerId);
} catch (error) {
  // Show error to user - don't calculate locally
  throw new Error('Unable to retrieve credit information. Please try again.');
}
```

### Display vs Validation

- **Display**: Can use snapshot data from list queries (may be stale)
- **Validation**: Always use `getCreditSummary()` which queries ledger directly

## Migration Strategy

### Phase 1: Backend Migration ✅

1. ✅ Create `FinancialService` facade
2. ✅ Create `LedgerQueryService` and `LedgerPostingService`
3. ✅ Migrate all backend services to use `FinancialService`
4. ✅ Ensure atomic transactions (domain + ledger in same tx)

### Phase 2: Frontend Migration ✅

1. ✅ Remove fallback calculations
2. ✅ Update error handling (no local fallbacks)
3. ✅ Add documentation comments
4. ✅ Verify GraphQL queries include ledger-based fields

### Phase 3: Data Migration (Future)

1. Backfill ledger entries from existing orders/payments
2. Verify ledger totals match operational totals
3. Remove deprecated calculation methods

## Performance Considerations

### Caching

- **Balance cache**: `LedgerQueryService` caches account balances
- **Invalidation**: Cache invalidated on new journal entries
- **TTL**: Cache expires after 5 minutes or on invalidation

### Indexes

- `ledger_journal_line(account_id, channel_id)` - Balance queries
- `ledger_journal_line(meta)` - GIN index for customer/supplier lookups
- `ledger_journal_entry(channel_id, entry_date)` - Date range queries
- `ledger_journal_entry(source_type, source_id)` - Idempotency checks

## Troubleshooting

### "Missing accounts" Error

**Problem**: Required Chart of Accounts accounts don't exist for channel.

**Solution**: Run `ChartOfAccountsService.initializeChannelAccounts(channelId)` or use manual SQL (see `CUSTOMER_PROVISIONING.md`).

### Balance Shows Zero/Incorrect

**Problem**: Balance calculation returns wrong value.

**Possible Causes**:

1. Accounts not initialized for channel
2. Journal entries not posted (check `PostingService` logs)
3. Wrong account code used in query
4. Cache not invalidated (restart server)

**Solution**:

1. Verify accounts exist: `SELECT * FROM ledger_account WHERE channel_id = :channelId`
2. Check journal entries: `SELECT * FROM ledger_journal_entry WHERE channel_id = :channelId`
3. Verify account codes match CoA definitions
4. Clear cache or restart server

### Duplicate Postings

**Problem**: Same transaction posted multiple times.

**Solution**: Idempotency should prevent this. Check:

1. `sourceType` and `sourceId` are consistent
2. `PostingService.post()` is called with same parameters
3. Database constraint on `(source_type, source_id)` exists

## Related Documentation

- `CUSTOMER_PROVISIONING.md` - Channel setup including CoA initialization
- `ARCHITECTURE.md` - Overall system architecture
- Backend code: `backend/src/services/financial/`
- Frontend code: `frontend/src/app/core/services/customer/customer-credit.service.ts`
