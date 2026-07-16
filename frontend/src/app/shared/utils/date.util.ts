/**
 * Single source of truth for date display formatting.
 *
 * Replaces the ~20 per-component `formatDate()` copies that each hand-rolled
 * `toLocaleDateString`/`toLocaleString` with divergent locales (en-KE, en-US, undefined).
 * Uses one locale (en-KE) so identical fields render identically across the app.
 */
const LOCALE = 'en-KE';

export type DateStyle = 'medium' | 'datetime' | 'short';

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  // "Jul 1, 2026"
  medium: { year: 'numeric', month: 'short', day: 'numeric' },
  // "Jul 1, 2026, 09:30"
  datetime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  // "01/07/2026"
  short: { dateStyle: 'short' },
};

/**
 * Format a date value for display. Returns '' for empty/invalid input.
 *
 * @param value ISO string, epoch, or Date
 * @param style 'medium' (default), 'datetime', or 'short'
 */
export function toDisplayDate(
  value: string | number | Date | null | undefined,
  style: DateStyle = 'medium',
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return style === 'datetime'
    ? date.toLocaleString(LOCALE, OPTIONS[style])
    : date.toLocaleDateString(LOCALE, OPTIONS[style]);
}
