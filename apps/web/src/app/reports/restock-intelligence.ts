import type { RestockProductRow } from './reports.service';

export type RestockDecisionTone = 'error' | 'warning' | 'info' | 'success' | 'neutral';

export interface RestockDecision {
  label: string;
  tone: RestockDecisionTone;
  priority: number;
}

export function restockDecision(
  product: Pick<RestockProductRow, 'currentQuantity' | 'previousQuantity' | 'stock' | 'daysCover'>,
  lowStockThreshold: number
): RestockDecision {
  const hasRecentDemand = product.currentQuantity > 0 || product.previousQuantity > 0;
  if (hasRecentDemand && product.stock <= lowStockThreshold) {
    return { label: 'Restock now', tone: 'error', priority: 0 };
  }
  if (product.currentQuantity <= 0) {
    return { label: 'Slow-moving', tone: 'neutral', priority: 4 };
  }
  if (product.daysCover !== null && product.daysCover <= 14) {
    return { label: 'Restock soon', tone: 'warning', priority: 1 };
  }
  if (
    product.currentQuantity > product.previousQuantity &&
    product.daysCover !== null &&
    product.daysCover <= 30
  ) {
    return { label: 'Demand rising', tone: 'info', priority: 2 };
  }
  return { label: 'Stock healthy', tone: 'success', priority: 3 };
}

export function quantityChangeLabel(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'New demand' : 'No change';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change > 0 ? '+' : ''}${change.toLocaleString('en-KE', {
    maximumFractionDigits: 1,
  })}%`;
}

export function sparklineHeights(values: number[], maximumBars = 18): number[] {
  const selected = values.slice(-maximumBars);
  const maximum = Math.max(...selected, 1);
  return selected.map(value => (value <= 0 ? 4 : Math.max(12, (value / maximum) * 100)));
}

export function coverWidth(daysCover: number | null, maximumDays = 60): number {
  if (daysCover === null) return 0;
  return Math.min(Math.max((daysCover / maximumDays) * 100, 0), 100);
}
