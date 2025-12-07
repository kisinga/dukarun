# Cashier Flow and Cash Control Integration

## Overview

This document explains the relationship between **Cash Control** and **Cashier Flow** systems, their current independent operation, and how they integrate.

## Key Concepts

### Cash Control

**Cash Control** is a financial management feature that provides:
- Blind counts for cash reconciliation
- Variance tracking and reconciliation
- Transaction verification (e.g., M-Pesa)
- Statement matching (e.g., bank transfers)

**Key Insight**: Cash control can work with **ANY payment method** that has a ledger account, not just cashier-controlled ones.

### Cashier Flow

**Cashier Flow** is an order approval workflow that:
- Keeps orders in `ArrangingPayment` state until approved
- Requires cashier approval before order completion
- Tracks cashier session status (`cashierOpen`)

## Current State

### Independent Operation

Currently, Cash Control and Cashier Flow operate **independently**:

- **Cash Control** can be enabled without Cashier Flow
- **Cashier Flow** can be enabled without Cash Control
- They can also work together

### Channel Settings

```typescript
interface ChannelCustomFields {
  cashControlEnabled: boolean;  // Enables cash control features
  cashierFlowEnabled: boolean;  // Enables cashier approval workflow
  cashierOpen: boolean;         // Real-time cashier serving status
}
```

## Payment Method Participation

### Eligibility Criteria

A payment method can participate in cash control if it has:

1. **Valid `ledgerAccountCode`** - Maps to a ledger account
2. **`requiresReconciliation: true`** - Must be reconciled
3. **Reconciliation type other than 'none'** - One of:
   - `blind_count` - For cash (physical count)
   - `transaction_verification` - For M-Pesa (verify transactions)
   - `statement_match` - For bank transfers (match statements)

### Examples

| Payment Method | Ledger Account | Reconciliation Type | Participates in Cash Control? |
|---------------|----------------|---------------------|------------------------------|
| Cash | `CASH_ON_HAND` | `blind_count` | ✅ Yes |
| M-Pesa | `CLEARING_MPESA` | `transaction_verification` | ✅ Yes |
| Bank Transfer | `CLEARING_BANK` | `statement_match` | ✅ Yes |
| Credit | `CLEARING_CREDIT` | `none` | ❌ No |

### Difference from `isCashierControlled`

- **`isCashierControlled`**: Session-specific feature (blind counts during cashier sessions)
- **Cash Control Participation**: Account-based feature (any payment method with ledger account can be reconciled)

## Architecture

### Services

#### CashControlService

Encapsulates all cash control logic:

```typescript
class CashControlService {
  isEnabled(ctx, channelId): Promise<boolean>
  requiresOpeningCount(paymentMethod): boolean
  getVarianceThreshold(ctx, channelId): number | null
  getPaymentMethodsForCashControl(ctx, channelId): Promise<PaymentMethod[]>
  getPaymentMethodConfigs(ctx, channelId): Promise<PaymentMethodReconciliationConfig[]>
}
```

#### CashierFlowIntegrationService

Provides integration points between cash control and cashier flow:

```typescript
class CashierFlowIntegrationService {
  shouldEnforceCashControl(ctx, channelId): Promise<boolean>
  getPaymentMethodsForCashControl(ctx, channelId): Promise<PaymentMethod[]>
  isCashierFlowEnabled(ctx, channelId): Promise<boolean>
  isCashierOpen(ctx, channelId): Promise<boolean>
}
```

#### ReconciliationValidatorService

Validates reconciliation completeness:

```typescript
class ReconciliationValidatorService {
  validatePeriodReconciliation(ctx, channelId, periodEndDate): Promise<ValidationResult>
  getRequiredReconciliations(ctx, channelId): Promise<PaymentMethodReconciliationConfig[]>
  // Uses isCashControlEnabled() instead of isCashierFlowEnabled()
}
```

### Payment Method Configuration

The `payment-method-mapping.config.ts` provides helper functions:

```typescript
// Check if payment method can participate in cash control
canParticipateInCashControl(paymentMethod): boolean

// Get reconciliation type
getReconciliationTypeFromPaymentMethod(paymentMethod): ReconciliationType

// Check if cashier-controlled (session-specific)
isCashierControlledPaymentMethod(paymentMethod): boolean
```

## Integration Points (Future)

When cashier flow is fully implemented, these are the connection points:

### 1. Session Opening

**Cash Control** can require opening count when cashier session starts:

```typescript
// When cashier session opens
if (cashControlService.isEnabled(ctx, channelId)) {
  const requiresOpening = paymentMethods.some(pm => 
    cashControlService.requiresOpeningCount(pm)
  );
  if (requiresOpening) {
    // Enforce opening count
  }
}
```

### 2. Order Approval

**Cashier Flow** can check cash control status before approving orders:

```typescript
// Before approving order
if (cashControlService.isEnabled(ctx, channelId)) {
  const variance = await checkVariance(ctx, channelId);
  const threshold = cashControlService.getVarianceThreshold(ctx, channelId);
  if (threshold && variance > threshold) {
    // Block approval
  }
}
```

### 3. Session Closing

**Cash Control** can enforce closing count when cashier session ends:

```typescript
// When cashier session closes
if (cashControlService.isEnabled(ctx, channelId)) {
  const paymentMethods = await cashControlService.getPaymentMethodsForCashControl(ctx, channelId);
  for (const pm of paymentMethods) {
    if (cashControlService.requiresOpeningCount(pm)) {
      // Require closing count
    }
  }
}
```

### 4. Variance Handling

**Cashier Flow** can block session closure if variance exceeds threshold:

```typescript
// Before closing session
const variance = await calculateVariance(ctx, sessionId);
const threshold = cashControlService.getVarianceThreshold(ctx, channelId);
if (threshold && variance > threshold) {
  throw new Error('Variance exceeds threshold. Cannot close session.');
}
```

## Code Examples

### Check if Cash Control is Enabled

```typescript
const cashControlService = new CashControlService(connection);
const isEnabled = await cashControlService.isEnabled(ctx, channelId);
```

### Get Payment Methods for Cash Control

```typescript
const paymentMethods = await cashControlService.getPaymentMethodsForCashControl(ctx, channelId);
// Returns all payment methods that can participate in cash control
```

### Check Payment Method Eligibility

```typescript
import { canParticipateInCashControl } from './payment-method-mapping.config';

const eligible = canParticipateInCashControl(paymentMethod);
// Returns true if payment method has ledger account and requires reconciliation
```

### Integration Service Usage

```typescript
const integrationService = new CashierFlowIntegrationService(connection, cashControlService);

// Check if cash control should be enforced
const shouldEnforce = await integrationService.shouldEnforceCashControl(ctx, channelId);

// Get eligible payment methods
const methods = await integrationService.getPaymentMethodsForCashControl(ctx, channelId);
```

## Validation and Warnings

The `ChannelSettingsService` logs a warning when:
- `cashControlEnabled = true` AND
- `cashierFlowEnabled = false`

This is a **warning, not an error** - cash control can work independently, but it's typically used together with cashier flow.

## Testing Strategy

### Test Scenarios

1. **Cash Control Only**
   - Enable `cashControlEnabled = true`
   - Disable `cashierFlowEnabled = false`
   - Verify cash control works independently

2. **Cashier Flow Only**
   - Enable `cashierFlowEnabled = true`
   - Disable `cashControlEnabled = false`
   - Verify cashier flow works independently

3. **Both Enabled**
   - Enable both settings
   - Verify integration points work correctly

4. **Payment Method Eligibility**
   - Test with payment methods that have ledger accounts
   - Test with payment methods without ledger accounts
   - Verify `canParticipateInCashControl()` returns correct results

### Test Cases

```typescript
describe('CashControlService', () => {
  it('should return true when cashControlEnabled is true', async () => {
    // Test implementation
  });

  it('should return eligible payment methods', async () => {
    // Test implementation
  });
});

describe('canParticipateInCashControl', () => {
  it('should return true for payment method with ledger account', () => {
    // Test implementation
  });

  it('should return false for payment method without reconciliation', () => {
    // Test implementation
  });
});
```

## Migration Notes

### Breaking Changes

None. This refactoring maintains backward compatibility.

### Changes Made

1. **ReconciliationValidatorService**
   - Renamed `isCashierFlowEnabled()` → `isCashControlEnabled()`
   - Removed dependency on cashier flow concepts
   - Now purely checks `cashControlEnabled` channel setting

2. **New Services**
   - `CashControlService` - Encapsulates cash control logic
   - `CashierFlowIntegrationService` - Provides integration points

3. **Payment Method Mapping**
   - Added `canParticipateInCashControl()` helper function

4. **Channel Settings**
   - Added validation warning for independent operation

## Future Enhancements

1. **Variance Threshold Configuration**
   - Add channel-level variance threshold setting
   - Enforce threshold in cashier flow integration

2. **Opening Count Enforcement**
   - Automatically require opening count when session starts
   - Block session operations until count is complete

3. **Closing Count Enforcement**
   - Automatically require closing count when session ends
   - Block period close until all counts are verified

4. **Real-time Variance Tracking**
   - Track variance during cashier sessions
   - Display warnings when approaching threshold




