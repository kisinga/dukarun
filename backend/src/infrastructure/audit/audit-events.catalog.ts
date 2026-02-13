/**
 * Centralized catalog of all audit event types.
 * Use these constants for type safety and consistency.
 */
export const AUDIT_EVENTS = {
  // Financial operations
  EXPENSE_RECORDED: 'expense.recorded',
  INTER_ACCOUNT_TRANSFER: 'inter_account_transfer.created',
  RECONCILIATION_CREATED: 'reconciliation.created',
  RECONCILIATION_VERIFIED: 'reconciliation.verified',
  PERIOD_CLOSED: 'period.closed',
  PERIOD_OPENED: 'period.opened',
  INVENTORY_RECONCILIATION_CREATED: 'inventory_reconciliation.created',

  // Payment operations
  PAYMENT_ALLOCATED: 'payment.allocated',
  PAYMENT_SINGLE_ORDER: 'payment.single_order',
  SUPPLIER_PAYMENT_ALLOCATED: 'supplier_payment.allocated',
  SUPPLIER_PAYMENT_SINGLE_PURCHASE: 'supplier_payment.single_purchase',

  // Price operations
  PRICE_OVERRIDE_APPLIED: 'price_override.applied',

  // Credit operations
  CUSTOMER_CREDIT_APPROVED: 'customer.credit.approved',
  CUSTOMER_CREDIT_LIMIT_CHANGED: 'customer.credit.limit_changed',
  CUSTOMER_CREDIT_DURATION_CHANGED: 'customer.credit.duration_changed',

  // Shift operations
  CASHIER_SESSION_OPENED: 'cashier_session.opened',
  CASHIER_SESSION_CLOSED: 'cashier_session.closed',
  CASH_COUNT_RECORDED: 'cash_count.recorded',
  VARIANCE_EXPLAINED: 'variance.explained',
  CASH_COUNT_REVIEWED: 'cash_count.reviewed',
  MPESA_VERIFIED: 'mpesa.verified',
  CASHIER_SESSION_RECONCILIATION_CREATED: 'cashier_session_reconciliation.created',

  // Admin operations
  ADMIN_INVITED: 'admin.invited',
  ADMIN_UPDATED: 'admin.updated',
  ADMIN_DISABLED: 'admin.disabled',
  ROLE_CREATED: 'role.created',

  // Order operations
  ORDER_CREATED: 'order.created',
  ORDER_STATE_CHANGED: 'order.state_changed',

  // Product operations
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',

  // Stock operations
  STOCK_MOVEMENT: 'stock.movement',
  PURCHASE_RECORDED: 'purchase.recorded',
  STOCK_ADJUSTMENT_RECORDED: 'stock.adjustment.recorded',

  // Channel operations
  CHANNEL_SETTINGS_UPDATED: 'channel.settings.updated',
  CHANNEL_STATUS_UPDATED: 'channel.status.updated',
} as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
