/**
 * Date-only expiry helpers.
 *
 * Expiry datetimes represent whole calendar days. Comparing dates by their
 * calendar value avoids off-by-one errors when the timestamp falls near
 * midnight (e.g. a batch expiring today showing as expired 1 day ago).
 */

/**
 * Return the number of whole days from today until the nearest expiry date.
 * Null if none of the batches have an expiry date.
 * 0 means the batch expires today; negative means it expired on a previous day.
 */
export function getNearestExpiryDays(
  batches?: Array<{ expiryDate?: string | null }> | null,
): number | null {
  if (!batches?.length) return null;

  const today = startOfLocalDay(new Date());

  const daysList = batches
    .map((b) => (b.expiryDate ? startOfLocalDay(new Date(b.expiryDate)) : null))
    .filter((d): d is Date => d !== null)
    .map((d) => Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  if (!daysList.length) return null;
  return Math.min(...daysList);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
