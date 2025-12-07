/**
 * Email generation utilities for Paystack payments
 *
 * Generates unique email addresses from phone numbers for Paystack transactions
 * to prevent anti-fraud detection issues from using a shared email address.
 */

import { formatPhoneNumber } from './phone.utils';

/**
 * Generate a unique Paystack email address from a phone number
 *
 * Format: customer.{normalizedPhone}@dukahub.com
 * Example: customer.0712345678@dukahub.com
 *
 * This ensures each customer has a unique email address for Paystack,
 * preventing anti-fraud detection from flagging multiple transactions
 * from the same email address.
 *
 * @param phoneNumber - Phone number in any format (will be normalized)
 * @returns Generated email address in format customer.{phone}@dukahub.com
 * @throws Error if phone number cannot be normalized
 */
export function generatePaystackEmailFromPhone(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Phone number is required to generate Paystack email');
  }

  // Normalize phone number to ensure consistency (format: 07XXXXXXXX)
  const normalizedPhone = formatPhoneNumber(phoneNumber);

  // Generate email: customer.{normalizedPhone}@dukahub.com
  // The normalized phone already includes the leading 0 (e.g., 0712345678)
  const emailLocalPart = `customer.${normalizedPhone}`;

  return `${emailLocalPart}@dukahub.com`;
}
