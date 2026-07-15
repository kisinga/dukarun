/**
 * Product Stats Utility
 *
 * Pure functions for calculating product statistics from product data.
 */

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
  expiringSoon: number;
  expired: number;
}

/**
 * Default low-stock threshold. The actual threshold is configurable per channel;
 * this default is used when no channel setting is available.
 */
export const LOW_STOCK_THRESHOLD = 10;

/** True when a tracked quantity is at/under the given low-stock threshold. */
export function isLowStock(qty: number, threshold = LOW_STOCK_THRESHOLD): boolean {
  return qty <= threshold;
}

export interface InventoryBatch {
  expiryDate?: string | null;
}

export interface ProductVariant {
  stockOnHand?: number;
  inventoryBatches?: InventoryBatch[];
}

export interface Product {
  id: string;
  variants?: ProductVariant[];
}

function getBatchExpiryDays(batches?: InventoryBatch[]): number | null {
  if (!batches?.length) return null;
  const now = new Date().getTime();
  const times = batches
    .map((b) => (b.expiryDate ? new Date(b.expiryDate).getTime() : null))
    .filter((t): t is number => t !== null);
  if (!times.length) return null;
  return Math.floor((Math.min(...times) - now) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate product stats from an array of products
 * Pure function - no side effects
 * Single-pass algorithm for better performance
 *
 * @param products - Array of products (typically last X items from page or filtered data)
 * @param lowStockThreshold - Threshold at or below which a variant is low stock
 * @param expiryThresholdDays - Days within which a batch is considered expiring soon
 * @returns ProductStats object with calculated metrics
 */
export function calculateProductStats(
  products: Product[],
  lowStockThreshold = LOW_STOCK_THRESHOLD,
  expiryThresholdDays = 30,
): ProductStats {
  let totalVariants = 0;
  let totalStock = 0;
  let lowStock = 0;
  let expiringSoon = 0;
  let expired = 0;

  // Single-pass calculation: compute all metrics in one iteration
  for (const product of products) {
    const variants = product.variants || [];
    totalVariants += variants.length;

    let hasLowStock = false;
    let hasExpiringSoon = false;
    let hasExpired = false;
    for (const variant of variants) {
      const stock = variant.stockOnHand || 0;
      totalStock += stock;
      if (isLowStock(stock, lowStockThreshold)) {
        hasLowStock = true;
      }
      const days = getBatchExpiryDays(variant.inventoryBatches);
      if (days !== null) {
        if (days < 0) {
          hasExpired = true;
        } else if (days <= expiryThresholdDays) {
          hasExpiringSoon = true;
        }
      }
    }

    if (hasLowStock) lowStock++;
    if (hasExpiringSoon) expiringSoon++;
    if (hasExpired) expired++;
  }

  return {
    totalProducts: products.length,
    totalVariants,
    totalStock,
    lowStock,
    expiringSoon,
    expired,
  };
}
