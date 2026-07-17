/**
 * Payment Method Codes - Single Source of Truth
 *
 * All payment method handler codes used in the system are defined here.
 * This ensures consistency across handlers, mappings, and configurations.
 *
 * DO NOT use string literals for payment method codes elsewhere.
 * Always import and use these constants.
 *
 * ## Naming Convention
 *
 * **Handler Code vs Payment Method Code:**
 *
 * - **Handler Code**: The base code defined here (e.g., 'cash', 'mpesa', 'credit')
 *   - Used in PaymentMethodHandler.code
 *   - Used in Payment.handler.code
 *   - Used in Payment.method (the method field on payment entities)
 *
 * - **Payment Method Code**: Channel-specific code stored in database
 *   - Format: `${handlerCode}-${channelId}` (e.g., 'cash-1', 'mpesa-2')
 *   - Created by PaymentProvisionerService: `code: \`${handlerCode}-${channelId}\``
 *   - Stored in PaymentMethod.code (the database entity)
 *
 * **Important:**
 * - When processing payments, use `Payment.method` which contains the handler code
 * - When querying payment methods, use `PaymentMethod.code` which contains the full code
 * - The mapping functions receive handler codes, not full payment method codes
 *
 * **Example:**
 * ```typescript
 * // Handler code (from constants)
 * const handlerCode = PAYMENT_METHOD_CODES.CASH; // 'cash'
 *
 * // Payment method code in database (channel-specific)
 * const paymentMethodCode = `${handlerCode}-${channelId}`; // 'cash-1'
 *
 * // Payment entity uses handler code
 * payment.method === 'cash' // handler code
 *
 * // PaymentMethod entity uses full code
 * paymentMethod.code === 'cash-1' // full code
 * ```
 */
export const PAYMENT_METHOD_CODES = {
  /** Cash payment handler code */
  CASH: 'cash',
  /** M-Pesa payment handler code */
  MPESA: 'mpesa',
  /** Bank transfer payment handler code */
  BANK: 'bank',
  /** Credit payment handler code */
  CREDIT: 'credit',
} as const;

/**
 * Type for payment method code values
 */
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[keyof typeof PAYMENT_METHOD_CODES];

/**
 * Type guard to check if a string is a valid payment method code
 */
export function isValidPaymentMethodCode(code: string): code is PaymentMethodCode {
  return Object.values(PAYMENT_METHOD_CODES).includes(code as PaymentMethodCode);
}

/**
 * Get all payment method codes as an array
 */
export function getAllPaymentMethodCodes(): PaymentMethodCode[] {
  return Object.values(PAYMENT_METHOD_CODES);
}
