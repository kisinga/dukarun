/**
 * Money helpers. All money in state is integer cents (bigint on the backend);
 * format to KES only at display time.
 */
export function formatKes(cents: number): string {
  return `KES ${formatMoneyAmount(cents)}`;
}

/** Numeric money display for places where the surrounding UI already establishes KES. */
export function formatMoneyAmount(cents: number): string {
  const hasSubunits = Math.abs(Math.round(cents)) % 100 !== 0;
  return (cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: hasSubunits ? 2 : 0,
    maximumFractionDigits: hasSubunits ? 2 : 0,
  });
}

/** Money text for editable/computed fields: whole KES unless real cents must be preserved. */
export function formatKesInput(cents: number): string {
  const amount = cents / 100;
  return Math.abs(Math.round(cents)) % 100 === 0 ? String(Math.round(amount)) : amount.toFixed(2);
}

/** Parse a user-typed KES amount ("2450", "2,450.50") into cents. Null when invalid. */
export function parseKesToCents(raw: string): number | null {
  const value = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
