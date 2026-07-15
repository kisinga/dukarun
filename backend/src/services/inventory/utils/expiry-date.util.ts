/**
 * Date-only expiry helpers.
 *
 * Expiry dates are stored as UTC datetimes but represent whole calendar days.
 * Comparing them as date-only values ensures stock remains usable through the
 * end of its use-by day and is only considered expired from the following day.
 */

/**
 * Return a Date representing the start of the given calendar day (00:00:00.000).
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Return a Date representing the end of the given calendar day (23:59:59.999).
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * True when the expiry date is strictly before the start of today.
 * Batches expiring today are not yet expired.
 */
export function isExpired(expiryDate: Date, today: Date = new Date()): boolean {
  return expiryDate < startOfDay(today);
}
