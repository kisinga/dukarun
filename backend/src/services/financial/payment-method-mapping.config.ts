/**
 * Payment Method to Ledger Account Mapping Configuration
 *
 * This configuration defines how payment method handler codes map to ledger account codes.
 * It supports both exact matches and pattern-based matching for extensibility.
 *
 * ## Important: Handler Codes vs Payment Method Codes
 *
 * This mapping function receives **handler codes** (e.g., 'cash', 'mpesa', 'credit'),
 * NOT full payment method codes (e.g., 'cash-1', 'mpesa-2').
 *
 * Payment entities store the handler code in `Payment.method`, which is what gets
 * passed to this mapping function. The full payment method code (with channel ID)
 * is only used for the PaymentMethod database entity.
 *
 * See: `payment-method-codes.constants.ts` for the naming convention documentation.
 */

import { PaymentMethod } from '@vendure/core';
import { ACCOUNT_CODES, isValidAccountCode, type AccountCode } from '../../ledger/account-codes.constants';
import { PAYMENT_METHOD_CODES } from '../payments/payment-method-codes.constants';

/**
 * Payment method code patterns
 */
export enum PaymentMethodPattern {
  CASH = 'cash',
  MPESA = 'mpesa',
  CREDIT = 'credit',
}

/**
 * Payment method mapping rule
 */
interface PaymentMethodMappingRule {
  /** Exact payment method code match (highest priority) */
  exactCode?: string;
  /** Pattern to match in payment method code (case-insensitive) */
  pattern?: PaymentMethodPattern;
  /** Target ledger account code */
  accountCode: AccountCode;
}

/**
 * Payment method to ledger account mapping configuration
 *
 * Rules are evaluated in order - first match wins.
 * Exact matches take precedence over pattern matches.
 */
const PAYMENT_METHOD_MAPPINGS: PaymentMethodMappingRule[] = [
  // Exact matches (highest priority) - use constants from single source of truth
  {
    exactCode: PAYMENT_METHOD_CODES.CASH,
    accountCode: ACCOUNT_CODES.CASH_ON_HAND,
  },
  {
    exactCode: PAYMENT_METHOD_CODES.MPESA,
    accountCode: ACCOUNT_CODES.CLEARING_MPESA,
  },
  {
    exactCode: PAYMENT_METHOD_CODES.CREDIT,
    accountCode: ACCOUNT_CODES.CLEARING_CREDIT,
  },
  // Pattern-based matches (fallback)
  {
    pattern: PaymentMethodPattern.MPESA,
    accountCode: ACCOUNT_CODES.CLEARING_MPESA,
  },
  {
    pattern: PaymentMethodPattern.CASH,
    accountCode: ACCOUNT_CODES.CASH_ON_HAND,
  },
  {
    pattern: PaymentMethodPattern.CREDIT,
    accountCode: ACCOUNT_CODES.CLEARING_CREDIT,
  },
];

/**
 * Maps a payment method handler code to a ledger account code
 *
 * **Important:** This function receives handler codes (e.g., 'cash', 'mpesa', 'credit'),
 * NOT full payment method codes (e.g., 'cash-1', 'mpesa-2').
 *
 * The handler code comes from `Payment.method` or `PaymentMethod.handler.code`.
 *
 * @param handlerCode Payment method handler code (e.g., 'cash', 'mpesa', 'credit', 'marki-mpesa')
 *                   Can also be a full payment method code (e.g., 'cash-1') - pattern matching will extract the handler
 * @returns Ledger account code
 */
export function mapPaymentMethodToAccount(handlerCode: string): AccountCode {
  const normalizedCode = handlerCode.toLowerCase().trim();

  // First, try exact matches against handler codes
  const exactMatch = PAYMENT_METHOD_MAPPINGS.find(
    rule => rule.exactCode && rule.exactCode.toLowerCase() === normalizedCode
  );
  if (exactMatch) {
    return exactMatch.accountCode;
  }

  // Then, try pattern matches
  // This handles both handler codes ('mpesa') and full codes ('marki-mpesa', 'mpesa-1')
  const patternMatch = PAYMENT_METHOD_MAPPINGS.find(rule => {
    if (!rule.pattern) return false;
    return normalizedCode.includes(rule.pattern.toLowerCase());
  });
  if (patternMatch) {
    return patternMatch.accountCode;
  }

  // Default fallback
  return ACCOUNT_CODES.CLEARING_GENERIC;
}

/**
 * Get all payment method codes that map to a specific account
 * Useful for queries and reporting
 */
export function getPaymentMethodsForAccount(accountCode: AccountCode): string[] {
  return PAYMENT_METHOD_MAPPINGS.filter(rule => rule.accountCode === accountCode)
    .map(rule => rule.exactCode || rule.pattern || '')
    .filter(code => code !== '');
}

/**
 * Resolve ledger account code from a PaymentMethod entity
 *
 * Priority:
 * 1. Custom field `ledgerAccountCode` if set and valid
 * 2. Handler-based mapping (fallback)
 *
 * This allows admin to override the default account mapping per payment method.
 *
 * @param paymentMethod PaymentMethod entity
 * @returns Ledger account code
 */
export function getAccountCodeFromPaymentMethod(paymentMethod: PaymentMethod): AccountCode {
  // 1. Check custom field override
  const customFields = (paymentMethod as any).customFields;
  const customCode = customFields?.ledgerAccountCode;

  if (customCode && typeof customCode === 'string' && customCode.trim() !== '') {
    const trimmedCode = customCode.trim();
    if (isValidAccountCode(trimmedCode)) {
      return trimmedCode as AccountCode;
    }
  }

  // 2. Fall back to handler-based mapping
  // Extract handler code from payment method code (e.g., 'cash-1' -> 'cash')
  const handlerCode = paymentMethod.code.split('-')[0];
  return mapPaymentMethodToAccount(handlerCode);
}

/**
 * Get reconciliation type from PaymentMethod custom fields
 *
 * @param paymentMethod PaymentMethod entity
 * @returns Reconciliation type or 'none' as default
 */
export function getReconciliationTypeFromPaymentMethod(
  paymentMethod: PaymentMethod
): 'blind_count' | 'transaction_verification' | 'statement_match' | 'none' {
  const customFields = (paymentMethod as any).customFields;
  const reconType = customFields?.reconciliationType;

  if (
    reconType === 'blind_count' ||
    reconType === 'transaction_verification' ||
    reconType === 'statement_match'
  ) {
    return reconType;
  }

  return 'none';
}

/**
 * Check if a PaymentMethod is cashier-controlled
 *
 * @param paymentMethod PaymentMethod entity
 * @returns true if payment method should be included in cashier session reconciliation
 */
export function isCashierControlledPaymentMethod(paymentMethod: PaymentMethod): boolean {
  const customFields = (paymentMethod as any).customFields;
  return customFields?.isCashierControlled === true;
}

/**
 * Check if a PaymentMethod requires reconciliation
 *
 * @param paymentMethod PaymentMethod entity
 * @returns true if payment method must be reconciled before period close
 */
export function requiresReconciliation(paymentMethod: PaymentMethod): boolean {
  const customFields = (paymentMethod as any).customFields;
  // Default to true if not explicitly set to false
  return customFields?.requiresReconciliation !== false;
}

/**
 * Check if a PaymentMethod can participate in cash control
 *
 * A payment method can participate in cash control if it has:
 * - A valid ledger account code (ledgerAccountCode)
 * - Requires reconciliation (requiresReconciliation: true)
 * - Has a reconciliation type other than 'none'
 *
 * This allows ANY payment method with a ledger account to participate in cash control,
 * not just cashier-controlled ones.
 *
 * @param paymentMethod PaymentMethod entity
 * @returns true if payment method can participate in cash control
 */
export function canParticipateInCashControl(paymentMethod: PaymentMethod): boolean {
  const customFields = (paymentMethod as any).customFields;

  // Must have a ledger account code
  const ledgerAccountCode = customFields?.ledgerAccountCode;
  if (!ledgerAccountCode || typeof ledgerAccountCode !== 'string' || ledgerAccountCode.trim() === '') {
    // Fallback: check if handler-based mapping would provide an account
    const accountCode = getAccountCodeFromPaymentMethod(paymentMethod);
    if (!accountCode || accountCode === 'CLEARING_GENERIC') {
      return false;
    }
  }

  // Must require reconciliation
  if (!requiresReconciliation(paymentMethod)) {
    return false;
  }

  // Must have a reconciliation type other than 'none'
  const reconType = getReconciliationTypeFromPaymentMethod(paymentMethod);
  return reconType !== 'none';
}
