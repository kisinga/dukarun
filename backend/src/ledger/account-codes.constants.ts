/**
 * Ledger Account Codes - Single Source of Truth
 *
 * All account codes used in the ledger system are defined here.
 * This ensures consistency across the entire codebase and prevents
 * typos and magic strings.
 *
 * DO NOT use string literals for account codes elsewhere.
 * Always import and use these constants.
 */

/**
 * Asset Account Codes
 */
export const ASSET_ACCOUNTS = {
  CASH: 'CASH', // Parent account for cash-based payment methods
  CASH_ON_HAND: 'CASH_ON_HAND',
  BANK_MAIN: 'BANK_MAIN',
  CLEARING_MPESA: 'CLEARING_MPESA',
  CLEARING_CREDIT: 'CLEARING_CREDIT',
  CLEARING_GENERIC: 'CLEARING_GENERIC',
  ACCOUNTS_RECEIVABLE: 'ACCOUNTS_RECEIVABLE',
  INVENTORY: 'INVENTORY',
} as const;

/**
 * Liability Account Codes
 */
export const LIABILITY_ACCOUNTS = {
  ACCOUNTS_PAYABLE: 'ACCOUNTS_PAYABLE',
  TAX_PAYABLE: 'TAX_PAYABLE',
} as const;

/**
 * Income Account Codes
 */
export const INCOME_ACCOUNTS = {
  SALES: 'SALES',
  SALES_RETURNS: 'SALES_RETURNS',
} as const;

/**
 * Expense Account Codes
 */
export const EXPENSE_ACCOUNTS = {
  PURCHASES: 'PURCHASES',
  EXPENSES: 'EXPENSES',
  PROCESSOR_FEES: 'PROCESSOR_FEES',
  CASH_SHORT_OVER: 'CASH_SHORT_OVER',
  COGS: 'COGS',
  INVENTORY_WRITE_OFF: 'INVENTORY_WRITE_OFF',
  EXPIRY_LOSS: 'EXPIRY_LOSS',
} as const;

/**
 * Equity Account Codes
 */
export const EQUITY_ACCOUNTS = {
  BALANCE_ADJUSTMENT: 'BALANCE_ADJUSTMENT',
} as const;

/**
 * All account codes as a single object for easy access
 */
export const ACCOUNT_CODES = {
  ...ASSET_ACCOUNTS,
  ...LIABILITY_ACCOUNTS,
  ...INCOME_ACCOUNTS,
  ...EXPENSE_ACCOUNTS,
  ...EQUITY_ACCOUNTS,
} as const;

/**
 * Type for account code values
 */
export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

/**
 * Type guard to check if a string is a valid account code
 */
export function isValidAccountCode(code: string): code is AccountCode {
  return Object.values(ACCOUNT_CODES).includes(code as AccountCode);
}
