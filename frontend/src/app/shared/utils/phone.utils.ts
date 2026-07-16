import type { ValidatorFn } from '@angular/forms';

/**
 * Kenyan phone format: 0XXXXXXXXX (10 digits).
 * Leading 0 is trunk prefix mapping to +254 internationally.
 * Accepts mobile (07xx) and landlines (01xx, 02xx, etc.).
 */
export const PHONE_PATTERN = /^0\d{9}$/;

/**
 * Phone number utilities for Kenyan phone numbers
 *
 * Standard format: 0XXXXXXXXX (10 digits starting with 0)
 * - Input can accept: 0XXXXXXXXX, +254XXXXXXXXX, 254XXXXXXXXX, XXXXXXXXX
 * - Storage/Output: Always normalized to 0XXXXXXXXX
 * - Accepts mobile (07xx) and landlines (01xx, 02xx, etc.)
 */

/**
 * Normalize a phone number to standard format: 0XXXXXXXXX
 *
 * Accepts various input formats:
 * - 0XXXXXXXXX (already correct)
 * - +254XXXXXXXXX (international format)
 * - 254XXXXXXXXX (international without +)
 * - XXXXXXXXX (9 digits, missing leading 0)
 *
 * @param phoneNumber - Phone number in any format
 * @returns Normalized phone number in format 0XXXXXXXXX
 * @throws Error if phone number cannot be normalized
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Phone number is required');
  }

  // Remove all whitespace and non-digit characters
  let cleaned = phoneNumber.trim().replace(/\D/g, '');

  // Handle different formats:
  // 254XXXXXXXXX (12 digits) -> 0XXXXXXXXX
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(3);
  }
  // XXXXXXXXX (9 digits starting with 1-9) -> 0XXXXXXXXX
  else if (cleaned.length === 9 && /^[1-9]/.test(cleaned)) {
    cleaned = '0' + cleaned;
  }
  // 0XXXXXXXXX (10 digits) -> already correct
  else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Already in correct format
  } else {
    throw new Error(
      `Invalid phone number format. Expected 0XXXXXXXXX (10 digits, mobile or landline). Received: ${phoneNumber}`,
    );
  }

  // Final validation: must be exactly 10 digits starting with 0
  if (!PHONE_PATTERN.test(cleaned)) {
    throw new Error(
      `Phone number must be in format 0XXXXXXXXX (10 digits starting with 0). Received: ${phoneNumber}`,
    );
  }

  return cleaned;
}

/**
 * Format phone number, returning null instead of throwing on invalid input.
 *
 * @param phoneNumber - Phone number in any format
 * @returns Normalized phone number or null if invalid
 */
export function formatPhoneNumberOrNull(phoneNumber: string): string | null {
  try {
    return formatPhoneNumber(phoneNumber);
  } catch {
    return null;
  }
}

/**
 * Validate if a phone number is in the correct format: 0XXXXXXXXX
 *
 * @param phoneNumber - Phone number to validate
 * @returns true if valid, false otherwise
 */
export function validatePhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  try {
    const normalized = formatPhoneNumber(phoneNumber);
    return PHONE_PATTERN.test(normalized);
  } catch {
    return false;
  }
}

/**
 * Angular ValidatorFn for phone number format.
 * Use in Reactive Forms: Validators.compose([Validators.required, phoneValidator])
 */
export const phoneValidator: ValidatorFn = (control) => {
  const value = control.value;
  if (value == null || value === '') {
    return null; // Let Validators.required handle empty
  }
  return validatePhoneNumber(value) ? null : { phoneFormat: true };
};

/**
 * Generate a random alphanumeric string
 * @param length - Length of the string
 * @returns Random string
 */
function generateRandomString(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate company code from company name
 * Sanitizes company name and optionally appends random suffix
 *
 * @param companyName - Company name
 * @param includeRandomSuffix - Whether to append random suffix (default: true for backward compatibility)
 * @returns Company code in format: company-name-random4 (if includeRandomSuffix is true) or company-name (if false)
 */
export function generateCompanyCode(
  companyName: string,
  includeRandomSuffix: boolean = true,
): string {
  const sanitized = companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!includeRandomSuffix) {
    return sanitized || generateRandomString(4);
  }

  const randomSuffix = generateRandomString(4);
  return sanitized ? `${sanitized}-${randomSuffix}` : randomSuffix;
}
