# Backend Plugins

Each directory here is a Vendure plugin that adds a domain to the Dukarun GraphQL API.

## Plugin Index

| Plugin | Purpose | Key Resolvers / Services |
|--------|---------|--------------------------|
| `approval` | User and channel approval workflows | `approval.plugin.ts` |
| `audit` | Audit logging and user context | `audit.resolver.ts`, `user-context.resolver.ts` |
| `auth` | Phone/email OTP registration and login | `phone-auth.resolvers.ts` |
| `channels` | Channel settings, status, and admin invitations | `channel-settings.resolver.ts` |
| `credit` | Customer/supplier credit, payment allocation, orders, statements, reversals | `credit.resolver.ts`, `payment-allocation.resolver.ts`, `supplier-payment-allocation.resolver.ts`, `order.resolver.ts`, `customer-statement.resolver.ts`, `supplier-credit.resolver.ts` |
| `customers` | Customer management extensions | `customer.resolver.ts` |
| `inventory` | FIFO/COGS inventory and fractional quantities | `fractional-quantity.resolver.ts` |
| `ledger` | Double-entry ledger, reconciliation, period management, divergence scans, stats | `reconciliation.resolver.ts`, `period-management.resolver.ts`, `ledger-divergence.resolver.ts`, `ledger-viewer.resolver.ts`, `stock-value-stats.resolver.ts`, `dashboard-stats.resolver.ts` |
| `notifications` | Push/in-app notifications | `notification.resolver.ts` |
| `pricing` | Price override permissions | `price-override.resolver.ts` |
| `stock` | Purchase and stock adjustment recording | `stock.resolver.ts` |
| `storefront` | Public storefront queries | `storefront-public.resolver.ts` |
| `subscriptions` | Subscription tiers, purchases, and status | `subscription.resolver.ts`, `subscription-public.resolver.ts` |
| `super-admin` | Super-admin operations | `super-admin.resolver.ts` |

## Custom Mutations

All custom mutations are defined in the resolver files above. They extend the Vendure Admin API and are protected by `@Allow()` decorators. See each resolver for the exact permission and input shape.

High-level domains:

- **Authentication & registration** — `requestRegistrationOTP`, `verifyRegistrationOTP`, `requestLoginOTP`, `verifyLoginOTP`
- **Channel management** — `updateChannelSettings`, `updateChannelStatus`, `inviteChannelAdministrator`, `createChannelAdmin`
- **Customer credit** — `approveCustomerCredit`, `updateCustomerCreditLimit`, `createOrder` (credit)
- **Supplier credit** — `approveSupplierCredit`, `updateSupplierCreditLimit`, `allocateBulkSupplierPayment`
- **Payments** — `allocateBulkPayment`, `paySingleOrder`
- **Subscriptions** — `createSubscriptionTier`, `updateSubscriptionTier`, `initiateSubscriptionPurchase`, `verifySubscriptionPayment`, `cancelSubscription`
- **Stock** — `recordPurchase`, `recordStockAdjustment`
- **Ledger & cashier** — `createReconciliation`, `openCashierSession`, `closeCashierSession`, `createInterAccountTransfer`, `closeAccountingPeriod`
- **Pricing** — `setOrderLineCustomPrice`
- **Inventory** — `updateOrderLineQuantity`
- **Notifications** — `markNotificationAsRead`, `subscribeToPush`, `unsubscribeToPush`

## Permissions

Custom permissions are defined next to their plugins (e.g. `credit/permissions.ts`, `ledger/permissions.ts`). Import them from the plugin when authorizing new operations.
