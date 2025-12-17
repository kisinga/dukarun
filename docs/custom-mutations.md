# Custom GraphQL Mutations Reference

> Complete list of all custom mutations not part of Vendure's built-in API.  
> These must be called via custom GraphQL API, NOT AdminUI.

---

## Authentication (6 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `requestRegistrationOTP` | Public | `phoneNumber`, `registrationData` |
| `requestEmailRegistrationOTP` | Public | `email`, `registrationData` |
| `verifyRegistrationOTP` | Public | `phoneNumber`, `otp`, `sessionId` |
| `verifyEmailRegistrationOTP` | Public | `email`, `otp`, `sessionId` |
| `requestLoginOTP` | Public | `phoneNumber` |
| `verifyLoginOTP` | Public | `phoneNumber`, `otp` |

**Side Effects:** Full store provisioning (Channel, Seller, Admin, Role creation)

---

## Channel Management (8 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `updateChannelSettings` | UpdateSettings | `input: { cashierFlowEnabled, cashierOpen, enablePrinter, companyLogoAssetId }` |
| `updateChannelStatus` | UpdateSettings | `channelId`, `status` |
| `inviteChannelAdministrator` | CreateAdministrator | `input: { phoneNumber, firstName, lastName, ... }` |
| `createChannelAdmin` | CreateAdministrator | `input: { firstName, lastName, phoneNumber, ... }` |
| `updateChannelAdmin` | UpdateAdministrator | `id`, `permissions[]` |
| `disableChannelAdmin` | UpdateAdministrator | `id` |
| `createChannelPaymentMethod` | CreatePaymentMethod | `input` |
| `updateChannelPaymentMethod` | UpdatePaymentMethod | `input` |

**Side Effects:** SMS notifications, ChannelStatusEvent, audit logs

---

## Customer Credit (4 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `approveCustomerCredit` | ApproveCustomerCredit | `input: { customerId, approved, creditLimit?, creditDuration? }` |
| `updateCustomerCreditLimit` | ManageCustomerCreditLimit | `input: { customerId, creditLimit, creditDuration? }` |
| `updateCreditDuration` | ManageCustomerCreditLimit | `input: { customerId, creditDuration }` |
| `createOrder` | CreateOrder | `input` (credit order) |

**Side Effects:** CustomerNotificationEvent, balance change notifications

---

## Supplier Credit (3 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `approveSupplierCredit` | ManageSupplierCreditPurchases | `input: { supplierId, approved, supplierCreditLimit?, supplierCreditDuration? }` |
| `updateSupplierCreditLimit` | ManageSupplierCreditPurchases | `input: { supplierId, supplierCreditLimit, supplierCreditDuration? }` |
| `updateSupplierCreditDuration` | ManageSupplierCreditPurchases | `input: { supplierId, supplierCreditDuration }` |

---

## Payment Allocation (3 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `allocateBulkPayment` | UpdateOrder | `input: PaymentAllocationInput` |
| `paySingleOrder` | UpdateOrder | `input: { orderId, paymentAmount?, paymentMethodCode?, referenceNumber? }` |
| `allocateBulkSupplierPayment` | ManageSupplierCreditPurchases | `input: SupplierPaymentAllocationInput` |

---

## Subscriptions (3 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `initiateSubscriptionPurchase` | UpdateSettings | `channelId`, `tierId`, `billingCycle`, `phoneNumber`, `email`, `paymentMethod?` |
| `verifySubscriptionPayment` | UpdateSettings | `channelId`, `reference` |
| `cancelSubscription` | UpdateSettings | `channelId` |

**Side Effects:** Paystack integration, SubscriptionAlertEvent

---

## Stock Management (2 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `recordPurchase` | UpdateProduct, ManageSupplierCreditPurchases | `input: { supplierId, purchaseDate, lines[], isCreditPurchase? }` |
| `recordStockAdjustment` | ManageStockAdjustments | `input: { reason, notes?, lines[] }` |

---

## ML Training (6 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `linkMlModelAssets` | UpdateProduct | `channelId`, `modelJsonId`, `modelBinId`, `metadataId` |
| `setMlModelStatus` | UpdateProduct | `channelId`, `status` |
| `clearMlModel` | UpdateProduct | `channelId` |
| `extractPhotosForTraining` | UpdateProduct | `channelId` |
| `updateTrainingStatus` | UpdateProduct | `channelId`, `status`, `progress?`, `error?` |
| `completeTraining` | UpdateProduct | `channelId`, `modelJson`, `weightsFile`, `metadata` |

**Side Effects:** MLStatusEvent

---

## Pricing (1 mutation)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `setOrderLineCustomPrice` | OverridePrice | `input: { orderId, orderLineId, customPrice, reason? }` |

---

## Inventory (1 mutation)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `updateOrderLineQuantity` | UpdateOrder | `orderLineId`, `quantity` |

---

## Notifications (4 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `markNotificationAsRead` | — | `id` |
| `markAllAsRead` | — | — |
| `subscribeToPush` | — | `subscription: { endpoint, keys }` |
| `unsubscribeToPush` | — | — |

---

## Ledger & Cashier (13 mutations)

| Mutation | Permission | Parameters |
|----------|------------|------------|
| `createReconciliation` | ManageReconciliation | `input` |
| `verifyReconciliation` | ManageReconciliation | `reconciliationId` |
| `closeAccountingPeriod` | CloseAccountingPeriod | `channelId`, `periodEndDate` |
| `openAccountingPeriod` | CloseAccountingPeriod | `channelId`, `periodStartDate` |
| `createInventoryReconciliation` | ManageReconciliation | `input` |
| `createInterAccountTransfer` | ManageReconciliation | `input: { channelId, fromAccountCode, toAccountCode, amount, entryDate }` |
| `openCashierSession` | ManageReconciliation | `input: { channelId, openingFloat }` |
| `closeCashierSession` | ManageReconciliation | `input: { sessionId, closingDeclared, notes? }` |
| `createCashierSessionReconciliation` | ManageReconciliation | `sessionId`, `notes?` |
| `recordCashCount` | UpdateOrder | `input: { sessionId, declaredCash, countType }` |
| `explainVariance` | UpdateOrder | `countId`, `reason` |
| `reviewCashCount` | ManageReconciliation | `countId`, `notes?` |
| `verifyMpesaTransactions` | UpdateOrder | `input: { sessionId, allConfirmed, flaggedTransactionIds?, notes? }` |

---

## Summary

| Domain | Count |
|--------|-------|
| Authentication | 6 |
| Channel | 8 |
| Credit (Customer + Supplier) | 7 |
| Payment Allocation | 3 |
| Subscriptions | 3 |
| Stock | 2 |
| ML Training | 6 |
| Pricing | 1 |
| Inventory | 1 |
| Notifications | 4 |
| Ledger/Cashier | 13 |
| **Total** | **54** |

---

## Sample GQL Queries (Admin-Only Operations)

> [!WARNING]
> These operations have NO frontend UI currently. Execute via GraphQL Playground with superadmin token.

### Channel Approval Status

```graphql
# Approve a channel (triggers SMS notification)
mutation ApproveChannel {
  updateChannelStatus(
    channelId: "2"
    status: "APPROVED"
  ) {
    id
    code
    customFields {
      status
    }
  }
}

# Disable a channel
mutation DisableChannel {
  updateChannelStatus(
    channelId: "2"
    status: "DISABLED"
  ) {
    id
    customFields {
      status
    }
  }
}

# Ban a channel
mutation BanChannel {
  updateChannelStatus(
    channelId: "2"
    status: "BANNED"
  ) {
    id
    customFields {
      status
    }
  }
}
```

### Subscription Tiers (Direct DB via TypeORM - No GQL mutations exist)

> [!CAUTION]
> No GraphQL mutations exist for tier CRUD. Use these service methods directly via a custom resolver or database tool.

**Current Service Methods (in `SubscriptionService`):**
- `createSubscriptionTier(ctx, { code, name, priceMonthly, priceYearly, ... })`
- `updateSubscriptionTier(ctx, id, { name?, priceMonthly?, ... })`
- `deleteSubscriptionTier(ctx, id)`
- `getAllSubscriptionTiers()` ← Query available

**Query to list tiers:**
```graphql
query GetTiers {
  getSubscriptionTiers {
    id
    code
    name
    priceMonthly
    priceYearly
    features
    isActive
  }
}
```

**To add tier mutations, create a resolver with:**
```typescript
@Mutation()
@Allow(Permission.SuperAdmin)
async createSubscriptionTier(
  @Ctx() ctx: RequestContext,
  @Args('input') input: CreateSubscriptionTierInput
) {
  return this.subscriptionService.createSubscriptionTier(ctx, input);
}
```

