/**
 * Money helpers. All money in state is integer shillings (bigint on the backend);
 * format to KES only at display time.
 */
export function formatKes(amount: number): string {
  return `KES ${formatMoneyAmount(amount)}`;
}

/** Numeric money display for places where the surrounding UI already establishes KES. */
export function formatMoneyAmount(amount: number): string {
  return Math.round(amount).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Money text for editable/computed fields: whole shillings. */
export function formatKesInput(amount: number): string {
  return String(Math.round(amount));
}

/** Parse a user-typed KES amount ("2450", "2,450") into integer shillings. Null when invalid. */
export function parseKes(raw: string): number | null {
  const value = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
