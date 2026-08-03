/**
 * Presentation source of truth for the product list — how the same product is
 * surfaced as stock tone/label and a price range across the desktop table row
 * and the mobile card, so the two templates can't drift. The low-stock line
 * itself (`LOW_STOCK_THRESHOLD` / `isLowStock`) lives in shared so the header
 * stat, the filter, and the badge tone here all agree.
 */
import { LOW_STOCK_THRESHOLD } from '../../../shared/services/stats/product-stats.util';

/** Minimal variant shape these helpers read. */
export interface PresentationVariant {
  priceWithTax: number;
  stockOnHand?: number;
  trackInventory?: boolean;
}

export type StockTone = 'success' | 'warning' | 'error' | 'info';

/** Tone for one stock quantity. Untracked (service) items are always `info` (∞). */
export function stockTone(
  qty: number,
  isService: boolean,
  lowStockThreshold = LOW_STOCK_THRESHOLD,
): StockTone {
  if (isService) return 'info';
  if (qty <= 0) return 'error';
  if (qty <= lowStockThreshold) return 'warning';
  return 'success';
}

// Full literal class strings (Tailwind v4 purges interpolated fragments).
const BADGE_CLASS: Record<StockTone, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
};

const TEXT_CLASS: Record<StockTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

export function stockBadgeClass(
  qty: number,
  isService: boolean,
  lowStockThreshold = LOW_STOCK_THRESHOLD,
): string {
  return BADGE_CLASS[stockTone(qty, isService, lowStockThreshold)];
}

export function stockTextClass(
  qty: number,
  isService: boolean,
  lowStockThreshold = LOW_STOCK_THRESHOLD,
): string {
  return TEXT_CLASS[stockTone(qty, isService, lowStockThreshold)];
}

/** '∞' for services, else the integer with thousands separators. */
export function stockDisplay(qty: number, isService: boolean): string {
  return isService ? '∞' : qty.toLocaleString('en-KE');
}

export function totalStock(variants: readonly PresentationVariant[] | undefined): number {
  return variants?.reduce((sum, v) => sum + (v.stockOnHand || 0), 0) ?? 0;
}

/** A product is a "service" when any variant opts out of inventory tracking. */
export function isServiceProduct(variants: readonly PresentationVariant[] | undefined): boolean {
  return variants?.some((v) => v.trackInventory === false) ?? false;
}

export interface PriceRange {
  /** Cheapest variant price, in cents. */
  minCents: number;
  /** Priciest variant price, in cents. */
  maxCents: number;
  /** Only one distinct price across variants. */
  single: boolean;
  /** No variants at all. */
  empty: boolean;
}

/** Min/max variant price (cents) — feed the cents straight into `<app-money>`. */
export function priceRange(variants: readonly PresentationVariant[] | undefined): PriceRange {
  if (!variants || variants.length === 0) {
    return { minCents: 0, maxCents: 0, single: true, empty: true };
  }
  const prices = variants.map((v) => v.priceWithTax);
  const minCents = Math.min(...prices);
  const maxCents = Math.max(...prices);
  return { minCents, maxCents, single: minCents === maxCents, empty: false };
}
