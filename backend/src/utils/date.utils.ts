const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
 * Whole calendar days from `start` to `end`.
 * Positive when `end` is after `start`.
 */
export function diffCalendarDays(end: Date, start: Date): number {
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / MS_PER_DAY);
}

/**
 * Return a new date `days` calendar days after `date`.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
