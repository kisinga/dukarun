export type CashierCountGuidance = 'close' | 'recount' | 'large-difference';

/** Classify a till count using the company's existing absolute variance threshold. */
export function cashierCountGuidance(
  declared: number,
  expected: number,
  threshold: number
): CashierCountGuidance {
  const difference = Math.abs(declared - expected);
  const tolerance = Math.max(0, threshold);
  if (difference <= tolerance) return 'close';
  if (difference <= tolerance * 3) return 'recount';
  return 'large-difference';
}
