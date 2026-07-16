import { endOfDay, startOfDay } from '../../../utils/date.utils';

/**
 * Date-only expiry helpers.
 *
 * Expiry dates are stored as UTC datetimes but represent whole calendar days.
 * Comparing them as date-only values ensures stock remains usable through the
 * end of its use-by day and is only considered expired from the following day.
 */

export { endOfDay, startOfDay };

/**
 * True when the expiry date is strictly before the start of today.
 * Batches expiring today are not yet expired.
 */
export function isExpired(expiryDate: Date, today: Date = new Date()): boolean {
  return expiryDate < startOfDay(today);
}
