/**
 * Email generation utilities for Paystack payments
 *
 * Generates unique email addresses from phone numbers for Paystack transactions
 * to prevent anti-fraud detection issues from using a shared email address.
 */

import { formatPhoneNumber } from './phone.utils';

/** Sentinel domain - all placeholder emails use this */
const SENTINEL_DOMAIN = 'pos.local';

/**
 * Check if email is a sentinel (@pos.local) address
 *
 * @param email - Email to check
 * @returns true if email ends with @pos.local
 */
export function isSentinelEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return email.toLowerCase().trim().endsWith(`@${SENTINEL_DOMAIN}`);
}

/**
 * Check if email should receive notifications
 *
 * @param email - Email to check
 * @returns true if email is NOT a sentinel address
 */
export function shouldSendEmail(email: string | null | undefined): boolean {
  return !isSentinelEmail(email);
}

/**
 * Generate sentinel email from phone number
 *
 * @param phoneNumber - Phone number (required for customers/suppliers)
 * @param entity - Entity type ('customer' | 'supplier' | 'admin')
 * @returns {entity}.{phone}@pos.local
 */
export function generateSentinelEmailFromPhone(
  phoneNumber: string,
  entity: 'customer' | 'supplier' | 'admin' = 'customer'
): string {
  const normalized = formatPhoneNumber(phoneNumber);
  return `${entity}.${normalized}@${SENTINEL_DOMAIN}`;
}

/**
 * Get walk-in customer email
 *
 * @returns walkin@pos.local
 */
export function getWalkInEmail(): string {
  return `walkin@${SENTINEL_DOMAIN}`;
}

/**
 * Get sentinel domain
 */
export function getSentinelDomain(): string {
  return SENTINEL_DOMAIN;
}

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

/**
 * Mask email addresses for privacy-safe logging
 * Example: john.doe@example.com -> j***e@example.com
 *
 * @param email - Email address to mask
 * @returns Masked email address safe for logging
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '[invalid-email]';
  }

  const [localPart, domain] = email.split('@');

  if (localPart.length <= 2) {
    // For very short local parts, just show first char
    return `${localPart[0]}***@${domain}`;
  }

  // Show first and last char of local part
  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
}
