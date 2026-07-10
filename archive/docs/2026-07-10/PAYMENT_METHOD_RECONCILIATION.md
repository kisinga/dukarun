# Payment Method Reconciliation Integration

## Overview

This document describes the tight integration between payment methods, the reconciliation process, and ledger accounts in the dukarun system. The system is designed for **maximum accuracy** and **theft prevention** in retail POS environments.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  PaymentMethod      │────▶│ ReconciliationValidator │──▶│ CashierSession  │
│  customFields       │     │ (queries PM config)     │   │ (enforces flow) │
│  - reconciliationType│     │ - what needs recon     │   │ - blind counts  │
│  - ledgerAccountCode│     │ - validation rules     │   │ - verification  │
│  - isCashierControlled    └──────────────────────┘   └─────────────────┘
│  - requiresReconciliation          │
└──────────┬──────────┘              │
           │                         ▼
           │               ┌─────────────────┐
           └──────────────▶│  PostingPolicy  │
                           │  - maps PM→acct │
                           │  - creates entry│
                           └─────────────────┘
```

## Reconciliation Types

| Type | Payment Method | Description | Cashier Responsibility |
|------|---------------|-------------|------------------------|
| `blind_count` | Cash | Cashier declares cash amount WITHOUT seeing expected | Count physical cash |
| `transaction_verification` | M-Pesa | Cashier confirms M-Pesa transactions received | Verify each txn |
| `statement_match` | Bank Transfer | Match bank statement to ledger | N/A (Manager task) |
| `none` | Credit/AR | No reconciliation needed | N/A |

## Payment Method Configuration

Each PaymentMethod entity has these custom fields:

```typescript
{
  reconciliationType: 'blind_count' | 'transaction_verification' | 'statement_match' | 'none';
  ledgerAccountCode: string;        // e.g., 'CASH_ON_HAND', 'CLEARING_MPESA'
  isCashierControlled: boolean;     // Include in session reconciliation?
  requiresReconciliation: boolean;  // Must reconcile before period close?
}
```

### Default Configuration

| Handler | Reconciliation Type | Account | Cashier Controlled | Requires Recon |
|---------|-------------------|---------|-------------------|----------------|
| `cash` | `blind_count` | CASH_ON_HAND | ✅ Yes | ✅ Yes |
| `mpesa` | `transaction_verification` | CLEARING_MPESA | ✅ Yes | ✅ Yes |
| `credit` | `none` | CLEARING_CREDIT | ❌ No | ❌ No |

## Reconciliation Flow

### 1. Session Opening

```
┌─────────────────────────────────────────────────────────────┐
│  OPEN SESSION                                               │
├─────────────────────────────────────────────────────────────┤
│  1. Manager/Previous cashier hands over cash drawer         │
│  2. Cashier counts physical cash (opening float)            │
│  3. System records opening count (blind count)              │
│  4. Session begins - all payments tagged with sessionId     │
└─────────────────────────────────────────────────────────────┘
```

### 2. During Session

- **Cash payments**: Debit CASH_ON_HAND, Credit SALES
- **M-Pesa payments**: Debit CLEARING_MPESA, Credit SALES
- **Credit sales**: Debit ACCOUNTS_RECEIVABLE, Credit SALES

All journal lines include `meta.cashierSessionId` for reconciliation.

### 3. Interim Reconciliation (Optional)

Cashier can perform blind count at any time:
- Declares cash amount (doesn't see expected)
- System calculates variance internally
- If variance exists: Prompt for explanation, notify manager
- Recording continues (non-blocking)

### 4. Session Closing

```
┌─────────────────────────────────────────────────────────────┐
│  CLOSE SESSION                                              │
├─────────────────────────────────────────────────────────────┤
│  1. Mandatory: Blind cash count (closing count)             │
│     - Cashier enters cash amount without hints              │
│     - System calculates: expected = opening + cash_sales    │
│     - Variance recorded                                     │
│                                                             │
│  2. Optional: M-Pesa verification (if configured)           │
│     - Cashier confirms each M-Pesa txn was received         │
│     - Can flag disputed transactions                        │
│                                                             │
│  3. Manager review (if variance)                            │
│     - Manager sees full variance details                    │
│     - Can add review notes                                  │
│                                                             │
│  4. Formal reconciliation record created                    │
│  5. Session status set to 'closed'                          │
└─────────────────────────────────────────────────────────────┘
```

## Ledger Integration

### Account Mapping Priority

1. **PaymentMethod.customFields.ledgerAccountCode** (if set and valid)
2. **Handler-based mapping** (fallback)

```typescript
// Example: Override via custom field
paymentMethod.customFields.ledgerAccountCode = 'BANK_MAIN';

// Example: Default handler mapping
cash → CASH_ON_HAND
mpesa → CLEARING_MPESA
credit → CLEARING_CREDIT
unknown → CLEARING_GENERIC
```

### Journal Entry Tagging

All payment entries include cashier session ID in metadata:

```typescript
{
  lines: [
    {
      accountCode: 'CASH_ON_HAND',
      debit: 5000,
      meta: {
        orderId: 'order-123',
        method: 'cash',
        cashierSessionId: 'session-456'  // ← Tagged for reconciliation
      }
    }
  ]
}
```

## API Reference

### Queries

```graphql
# Get reconciliation requirements for a session
query sessionReconciliationRequirements($sessionId: ID!) {
  sessionReconciliationRequirements(sessionId: $sessionId) {
    blindCountRequired
    verificationRequired
    paymentMethods {
      paymentMethodId
      paymentMethodCode
      reconciliationType
      ledgerAccountCode
      isCashierControlled
    }
  }
}

# Get channel reconciliation config
query channelReconciliationConfig($channelId: Int!) {
  channelReconciliationConfig(channelId: $channelId) {
    paymentMethodId
    paymentMethodCode
    reconciliationType
    ledgerAccountCode
    isCashierControlled
    requiresReconciliation
  }
}
```

---

## Blind Spots & Recommendations

### 1. 🔴 M-Pesa Transaction Matching

**Current State**: M-Pesa verification is manual confirmation only.

**Blind Spot**: No automatic matching of M-Pesa transactions to orders. Cashier could confirm without actually verifying.

**Recommendation**:
- Integrate with M-Pesa API to fetch transaction history
- Auto-match transactions by amount and timestamp
- Flag unmatched transactions for manual review

### 2. 🟡 Payout/Expense Tracking

**Current State**: Cash payouts (expenses paid from drawer) are not explicitly tracked in the session.

**Blind Spot**: Expected cash formula is `opening + cash_sales` but doesn't account for payouts.

**Recommendation**:
- Add `CashPayout` entity linked to session
- Formula becomes: `expected = opening + cash_sales - payouts`
- Require manager approval for payouts above threshold

### 3. 🟡 Split Payments

**Current State**: Split payments (part cash, part M-Pesa) are supported but reconciliation treats them separately.

**Blind Spot**: A single order split across methods could have reconciliation issues if one part fails.

**Recommendation**:
- Link split payment parts with common order reference
- Reconciliation should validate all parts of split payments

### 4. 🟡 Refund Handling

**Current State**: Refunds create journal entries but may not be properly attributed to session.

**Blind Spot**: Refund from cash drawer reduces expected amount but might not be captured if processed outside session.

**Recommendation**:
- Enforce refunds must reference active session
- Include refund amount in expected cash calculation: `expected = opening + cash_sales - payouts - cash_refunds`

### 5. 🔴 Bank Settlement Gap

**Current State**: `statement_match` reconciliation type exists but not implemented.

**Blind Spot**: M-Pesa settlement to bank is not tracked. Gap between M-Pesa clearing and bank deposit.

**Recommendation**:
- Implement bank reconciliation workflow
- Track M-Pesa → Bank settlement timeline
- Alert on settlement delays

### 6. 🟡 Variance Tolerance

**Current State**: Any non-zero variance is flagged.

**Blind Spot**: Small variances (e.g., rounding) cause noise; large variances might be explained by legitimate reasons.

**Recommendation**:
- Configure variance tolerance per channel (currently exists as `varianceTolerance`)
- Implement variance classification: `minor`, `moderate`, `critical`
- Different notification thresholds for each

### 7. 🟢 Audit Trail (Implemented)

**Current State**: All counts and reviews create permanent records.

**Status**: ✅ Good coverage

### 8. 🟡 Session Handover

**Current State**: Only one session can be open per channel.

**Blind Spot**: No formal handover process between shifts.

**Recommendation**:
- Implement shift handover reconciliation
- Both outgoing and incoming cashiers sign off on count
- Create handover record with dual verification

---

## Security Considerations

### Principle: Defense in Depth

1. **Blind Counts**: Cashier never sees expected amount
2. **Session Isolation**: Payments tagged to specific session
3. **Manager Oversight**: Variance visible only to managers
4. **Immutable Audit**: All counts are permanent records
5. **Time-Bounded**: Sessions must close; no indefinite sessions

### Access Control

| Role | Can Record Count | See Variance | Review Count |
|------|-----------------|--------------|--------------|
| Cashier | ✅ | ❌ | ❌ |
| Manager | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ |

---

## Database Schema

### New Tables

```sql
-- Payment method reconciliation fields (migration 8000000000010)
ALTER TABLE payment_method ADD COLUMN customFieldsReconciliationtype varchar(32);
ALTER TABLE payment_method ADD COLUMN customFieldsLedgeraccountcode varchar(64);
ALTER TABLE payment_method ADD COLUMN customFieldsIscashiercontrolled boolean;
ALTER TABLE payment_method ADD COLUMN customFieldsRequiresreconciliation boolean;

-- Indexes for efficient queries
CREATE INDEX IDX_payment_method_reconciliation_type ON payment_method(customFieldsReconciliationtype);
CREATE INDEX IDX_payment_method_cashier_controlled ON payment_method(customFieldsIscashiercontrolled);
```

### Entity Relationships

```
Channel
  └── PaymentMethod[] (with reconciliation config)
  └── CashierSession[]
        └── CashDrawerCount[] (blind counts)
        └── MpesaVerification[] (M-Pesa confirmations)
        └── JournalLine[] (via meta.cashierSessionId)
```

---

## Configuration

### Channel-Level Settings

```typescript
// In vendure-config.ts, Channel customFields
{
  name: 'cashControlEnabled',
  type: 'boolean',
  defaultValue: true,
}
{
  name: 'varianceTolerance',
  type: 'int',
  defaultValue: 0,  // Strict by default (in cents)
}
{
  name: 'varianceNotificationThreshold',
  type: 'int',
  defaultValue: 100,  // 1 KES
}
```

### Payment Method Configuration (Admin UI)

1. Navigate to Settings → Payment Methods
2. Select a payment method
3. Go to "Reconciliation" tab
4. Configure:
   - Reconciliation Type
   - Ledger Account Code (optional override)
   - Cashier Controlled toggle
   - Requires Reconciliation toggle

---

## Testing

Run reconciliation-specific tests:

```bash
npm test -- --testPathPattern="payment-method-reconciliation|cashier-session-reconciliation"
```

### Test Coverage

- ✅ Static mapping (handler → account)
- ✅ Dynamic mapping (custom field override)
- ✅ Reconciliation type detection
- ✅ Cashier-controlled filtering
- ✅ Session requirements calculation
- ✅ Flow documentation tests

---

## Future Enhancements

1. **M-Pesa API Integration**: Auto-fetch and match transactions
2. **Bank Reconciliation**: Implement statement_match workflow
3. **Cash Payout Module**: Track expenses from drawer
4. **Shift Handover**: Dual-verification handover process
5. **Mobile App**: Cashier-facing count interface
6. **AI Anomaly Detection**: Flag unusual patterns

