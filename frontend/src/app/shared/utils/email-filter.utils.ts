/**
 * Email Filter Utilities
 *
 * Read-only utilities for identifying sentinel/placeholder emails in the UI.
 * Mirrors the backend logic defined in `backend/src/utils/email.utils.ts`.
 *
 * NOTE: The frontend NEVER generates sentinel emails.
 * Generation is strictly handled by the backend.
 */

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
 * Check if email is the specific walk-in customer email
 *
 * @param email - Email to check
 * @returns true if email is walkin@pos.local
 */
export function isWalkInEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return email.toLowerCase().trim() === `walkin@${SENTINEL_DOMAIN}`;
}
