/**
 * Posted totals and selling prices use integer shillings. Buying-cost rates may
 * have up to two decimal places; use the separate unit-cost helpers for those.
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

/** Parse a nonnegative buying-cost rate without rounding invalid precision. */
export function parseUnitCost(raw: string): number | null {
  const normalized = raw.replace(/,/g, '').trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

/** Derived rates follow the database's two-decimal rate precision. */
export function roundUnitCost(amount: number): number {
  // Intl's decimal rounding avoids binary toFixed ties such as 1.005 -> 1.00.
  return Number(amount.toLocaleString('en-KE', { useGrouping: false, maximumFractionDigits: 2 }));
}

/** Editable buying-cost rate; totals must continue using formatKesInput. */
export function formatUnitCostInput(amount: number): string {
  return String(roundUnitCost(amount));
}

/** Numeric buying-cost display, retaining meaningful fractional shillings. */
export function formatUnitCostAmount(amount: number): string {
  return amount.toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

export function formatUnitCost(amount: number): string {
  return `KES ${formatUnitCostAmount(amount)}`;
}
