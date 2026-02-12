/**
 * Phone number utilities for Kenyan phone numbers
 *
 * Standard format: 0XXXXXXXXX (10 digits starting with 0)
 * - Mobile (07...) and landlines (020..., 041..., etc.) are valid
 * - Input can accept: 0XXXXXXXXX, +254XXXXXXXX (254+9 digits), 254XXXXXXXX, 7XXXXXXXX (→ 07XXXXXXXX)
 * - Storage/Output: Always normalized to 0XXXXXXXXX
 */

/**
 * Normalize a phone number to standard format: 0XXXXXXXXX
 *
 * Accepts various input formats:
 * - 0XXXXXXXXX (already correct)
 * - +254XXXXXXXX or 254XXXXXXXX (254 + 9 digits → 0 + 9 digits)
 * - 7XXXXXXXX (missing leading 0, mobile only → 07XXXXXXXX)
 *
 * @param phoneNumber - Phone number in any format
 * @returns Normalized phone number in format 0XXXXXXXXX
 * @throws Error if phone number cannot be normalized
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Phone number is required');
  }

  // Remove all whitespace and non-digit characters except + at the start
  let cleaned = phoneNumber.trim().replace(/[\s-]/g, '');

  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // 254 + 9 digits (11 or 12 chars) → 0 + 9 digits
  if (cleaned.startsWith('254') && (cleaned.length === 11 || cleaned.length === 12)) {
    cleaned = '0' + cleaned.substring(3);
  }
  // 7XXXXXXXX (9 digits, mobile) → 07XXXXXXXX
  else if (cleaned.startsWith('7') && cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }
  // 0XXXXXXXXX (10 digits) → already correct
  else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Already in correct format
  } else {
    throw new Error(
      `Invalid phone number format. Expected 0XXXXXXXXX (10 digits starting with 0). Received: ${phoneNumber}`,
    );
  }

  // Final validation: must be exactly 10 digits starting with 0
  if (!/^0\d{9}$/.test(cleaned)) {
    throw new Error(
      `Phone number must be in format 0XXXXXXXXX (10 digits starting with 0). Received: ${phoneNumber}`,
    );
  }

  return cleaned;
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
    return /^0\d{9}$/.test(normalized);
  } catch {
    return false;
  }
}

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
