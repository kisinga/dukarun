/**
 * Money helpers. All money in state is integer cents (bigint on the backend);
 * format to KES only at display time.
 */
export function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a user-typed KES amount ("2450", "2,450.50") into cents. Null when invalid. */
export function parseKesToCents(raw: string): number | null {
  const value = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
