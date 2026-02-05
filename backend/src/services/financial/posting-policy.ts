/**
 * Posting Policy
 *
 * Maps business domain events to accounting journal entry templates.
 * This abstracts accounting terminology from business logic.
 */

import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { mapPaymentMethodToAccount } from './payment-method-mapping.config';

export interface JournalEntryTemplate {
  lines: Array<{
    accountCode: string;
    debit?: number;
    credit?: number;
    meta?: Record<string, any>;
  }>;
  memo?: string;
}

export interface PaymentPostingContext {
  amount: number; // in cents
  method: string; // payment method code
  orderId: string;
  orderCode: string;
  customerId?: string;
  openSessionId?: string; // Active open session for reconciliation
  resolvedAccountCode?: string; // Pre-resolved from PaymentMethod custom fields (takes priority over method-based mapping)
}

export interface SalePostingContext {
  amount: number; // in cents
  orderId: string;
  orderCode: string;
  customerId: string;
  isCreditSale: boolean;
}

export interface PurchasePostingContext {
  amount: number; // in cents
  purchaseId: string;
  purchaseReference: string;
  supplierId: string;
  isCreditPurchase: boolean;
}

export interface SupplierPaymentPostingContext {
  amount: number; // in cents
  purchaseId: string;
  purchaseReference: string;
  supplierId: string;
  method: string; // payment method code
  resolvedAccountCode?: string; // Pre-resolved from PaymentMethod custom fields
}

export interface RefundPostingContext {
  amount: number; // in cents
  orderId: string;
  orderCode: string;
  originalPaymentId: string;
  method: string; // original payment method
  resolvedAccountCode?: string; // Pre-resolved from PaymentMethod custom fields
}

/** Expense: debit expense account, credit source-of-funds (asset) account */
export interface ExpensePostingContext {
  amount: number; // in cents
  sourceAccountCode: string; // asset account to credit (source of funds)
  memo?: string;
}

export interface InventoryPurchasePostingContext {
  purchaseId: string;
  purchaseReference: string;
  supplierId: string;
  totalCost: number; // in cents
  isCreditPurchase: boolean;
  batchAllocations: Array<{ batchId: string; quantity: number; unitCost: number }>;
}

export interface InventorySalePostingContext {
  orderId: string;
  orderCode: string;
  customerId: string;
  cogsAllocations: Array<{
    batchId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalCogs: number; // in cents
}

export interface InventoryWriteOffPostingContext {
  adjustmentId: string;
  reason: string;
  batchAllocations: Array<{
    batchId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalLoss: number; // in cents
}

/**
 * Generate journal entry template for customer payment settlement
 *
 * Debits: Cash/Clearing account (asset increase)
 * Credits: Sales account (income increase)
 */
export function createPaymentEntry(context: PaymentPostingContext): JournalEntryTemplate {
  // Use pre-resolved account if provided, otherwise fall back to method-based mapping
  const clearingAccount = context.resolvedAccountCode || mapPaymentMethodToAccount(context.method);

  // Build meta with optional openSessionId
  const baseMeta = {
    orderId: context.orderId,
    orderCode: context.orderCode,
    method: context.method,
    customerId: context.customerId,
  };

  const debitMeta = context.openSessionId
    ? { ...baseMeta, openSessionId: context.openSessionId }
    : baseMeta;

  return {
    lines: [
      {
        accountCode: clearingAccount,
        debit: context.amount,
        meta: debitMeta,
      },
      {
        accountCode: ACCOUNT_CODES.SALES,
        credit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          method: context.method,
          openSessionId: context.openSessionId,
        },
      },
    ],
    memo: `Payment received for order ${context.orderCode}`,
  };
}

/**
 * Generate journal entry template for credit sale (order fulfilled without payment)
 *
 * Debits: Accounts Receivable (asset increase - customer owes us)
 * Credits: Sales account (income increase)
 */
export function createCreditSaleEntry(context: SalePostingContext): JournalEntryTemplate {
  if (!context.isCreditSale) {
    throw new Error('createCreditSaleEntry called for non-credit sale');
  }

  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        debit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          customerId: context.customerId,
        },
      },
      {
        accountCode: 'SALES',
        credit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          customerId: context.customerId,
        },
      },
    ],
    memo: `Credit sale for order ${context.orderCode}`,
  };
}

/**
 * Generate journal entry template for customer payment allocation (paying off credit)
 *
 * Debits: Clearing account (asset increase - cash received)
 * Credits: Accounts Receivable (asset decrease - customer debt reduced)
 */
export function createPaymentAllocationEntry(context: PaymentPostingContext): JournalEntryTemplate {
  // Use pre-resolved account if provided, otherwise fall back to method-based mapping
  const clearingAccount = context.resolvedAccountCode || mapPaymentMethodToAccount(context.method);

  // Build meta with optional openSessionId
  const baseMeta = {
    orderId: context.orderId,
    orderCode: context.orderCode,
    method: context.method,
    customerId: context.customerId,
  };

  const debitMeta = context.openSessionId
    ? { ...baseMeta, openSessionId: context.openSessionId }
    : baseMeta;

  return {
    lines: [
      {
        accountCode: clearingAccount,
        debit: context.amount,
        meta: debitMeta,
      },
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        credit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          customerId: context.customerId,
          openSessionId: context.openSessionId,
        },
      },
    ],
    memo: `Payment allocation for order ${context.orderCode}`,
  };
}

/**
 * Generate journal entry template for supplier purchase (credit or cash)
 *
 * Debits: Purchases account (expense increase)
 * Credits:
 *   - Accounts Payable (liability increase - we owe supplier) for credit purchases
 *   - Cash on Hand (asset decrease - cash paid out) for cash purchases
 */
export function createSupplierPurchaseEntry(context: PurchasePostingContext): JournalEntryTemplate {
  const creditAccount = context.isCreditPurchase
    ? ACCOUNT_CODES.ACCOUNTS_PAYABLE
    : ACCOUNT_CODES.CASH_ON_HAND;

  const memo = context.isCreditPurchase
    ? `Credit purchase ${context.purchaseReference}`
    : `Cash purchase ${context.purchaseReference}`;

  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.PURCHASES,
        debit: context.amount,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
        },
      },
      {
        accountCode: creditAccount,
        credit: context.amount,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
        },
      },
    ],
    memo,
  };
}

/**
 * Generate journal entry template for supplier payment
 *
 * Debits: Accounts Payable (liability decrease - debt paid)
 * Credits: Cash account (asset decrease - cash paid out)
 */
export function createSupplierPaymentEntry(
  context: SupplierPaymentPostingContext
): JournalEntryTemplate {
  // Use pre-resolved account if provided, otherwise fall back to method-based mapping
  const cashAccount = context.resolvedAccountCode || mapPaymentMethodToAccount(context.method);

  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        debit: context.amount,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
        },
      },
      {
        accountCode: cashAccount,
        credit: context.amount,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
          method: context.method,
        },
      },
    ],
    memo: `Payment to supplier for purchase ${context.purchaseReference}`,
  };
}

/**
 * Generate journal entry template for expense
 *
 * Debits: EXPENSES (expense increase)
 * Credits: sourceAccountCode (asset decrease - source of funds)
 */
export function createExpenseEntry(context: ExpensePostingContext): JournalEntryTemplate {
  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.EXPENSES,
        debit: context.amount,
        meta: { sourceAccountCode: context.sourceAccountCode },
      },
      {
        accountCode: context.sourceAccountCode,
        credit: context.amount,
        meta: {},
      },
    ],
    memo: context.memo ?? `Expense (source: ${context.sourceAccountCode})`,
  };
}

/**
 * Generate journal entry template for refund
 *
 * Reverses the original payment entry
 * Debits: Sales Returns (income decrease)
 * Credits: Cash/Clearing account (asset decrease - money returned)
 */
export function createRefundEntry(context: RefundPostingContext): JournalEntryTemplate {
  // Use pre-resolved account if provided, otherwise fall back to method-based mapping
  const clearingAccount = context.resolvedAccountCode || mapPaymentMethodToAccount(context.method);

  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.SALES_RETURNS,
        debit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          originalPaymentId: context.originalPaymentId,
        },
      },
      {
        accountCode: clearingAccount,
        credit: context.amount,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          originalPaymentId: context.originalPaymentId,
          method: context.method,
        },
      },
    ],
    memo: `Refund for order ${context.orderCode}`,
  };
}

/**
 * Generate journal entry template for inventory purchase
 *
 * Debits: Inventory (asset increase)
 * Credits: Accounts Payable (if credit) or Cash (if cash purchase)
 */
export function createInventoryPurchaseEntry(
  context: InventoryPurchasePostingContext
): JournalEntryTemplate {
  const creditAccount = context.isCreditPurchase
    ? ACCOUNT_CODES.ACCOUNTS_PAYABLE
    : ACCOUNT_CODES.CASH_ON_HAND;

  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        debit: context.totalCost,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
          batchCount: context.batchAllocations.length,
          batchAllocations: context.batchAllocations,
        },
      },
      {
        accountCode: creditAccount,
        credit: context.totalCost,
        meta: {
          purchaseId: context.purchaseId,
          purchaseReference: context.purchaseReference,
          supplierId: context.supplierId,
          isCreditPurchase: context.isCreditPurchase,
        },
      },
    ],
    memo: `Inventory purchase ${context.purchaseReference}`,
  };
}

/**
 * Generate journal entry template for inventory sale COGS
 *
 * Debits: COGS (expense increase)
 * Credits: Inventory (asset decrease)
 */
export function createInventorySaleCogsEntry(
  context: InventorySalePostingContext
): JournalEntryTemplate {
  return {
    lines: [
      {
        accountCode: ACCOUNT_CODES.COGS,
        debit: context.totalCogs,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          customerId: context.customerId,
          batchCount: context.cogsAllocations.length,
          cogsAllocations: context.cogsAllocations,
        },
      },
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        credit: context.totalCogs,
        meta: {
          orderId: context.orderId,
          orderCode: context.orderCode,
          customerId: context.customerId,
          batchCount: context.cogsAllocations.length,
        },
      },
    ],
    memo: `COGS for order ${context.orderCode}`,
  };
}

/**
 * Generate journal entry template for inventory write-off
 *
 * Debits: Inventory Write-Off or Expiry Loss (expense increase)
 * Credits: Inventory (asset decrease)
 */
export function createInventoryWriteOffEntry(
  context: InventoryWriteOffPostingContext
): JournalEntryTemplate {
  // Determine if this is an expiry loss or general write-off
  const isExpiry =
    context.reason.toLowerCase().includes('expir') ||
    context.reason.toLowerCase().includes('expired');
  const expenseAccount = isExpiry ? ACCOUNT_CODES.EXPIRY_LOSS : ACCOUNT_CODES.INVENTORY_WRITE_OFF;

  return {
    lines: [
      {
        accountCode: expenseAccount,
        debit: context.totalLoss,
        meta: {
          adjustmentId: context.adjustmentId,
          reason: context.reason,
          batchCount: context.batchAllocations.length,
          batchAllocations: context.batchAllocations,
        },
      },
      {
        accountCode: ACCOUNT_CODES.INVENTORY,
        credit: context.totalLoss,
        meta: {
          adjustmentId: context.adjustmentId,
          reason: context.reason,
          batchCount: context.batchAllocations.length,
        },
      },
    ],
    memo: `Inventory write-off: ${context.reason}`,
  };
}
