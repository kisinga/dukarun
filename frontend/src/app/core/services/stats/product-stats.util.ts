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
}

/**
 * The one low-stock line for the whole app: at or below this quantity a tracked
 * variant reads as low stock. The header stat, the list filter, and the badge
 * tone all key off this so they can never disagree.
 */
export const LOW_STOCK_THRESHOLD = 10;

/** True when a tracked quantity is at/under the low-stock line (0 = out, still low). */
export function isLowStock(qty: number): boolean {
  return qty <= LOW_STOCK_THRESHOLD;
}

export interface ProductVariant {
  stockOnHand?: number;
}

export interface Product {
  id: string;
  variants?: ProductVariant[];
}

/**
 * Calculate product stats from an array of products
 * Pure function - no side effects
 * Single-pass algorithm for better performance
 *
 * @param products - Array of products (typically last X items from page or filtered data)
 * @returns ProductStats object with calculated metrics
 */
export function calculateProductStats(products: Product[]): ProductStats {
  let totalVariants = 0;
  let totalStock = 0;
  let lowStock = 0;

  // Single-pass calculation: compute all metrics in one iteration
  for (const product of products) {
    const variants = product.variants || [];
    totalVariants += variants.length;

    let hasLowStock = false;
    for (const variant of variants) {
      const stock = variant.stockOnHand || 0;
      totalStock += stock;
      if (isLowStock(stock)) {
        hasLowStock = true;
      }
    }

    if (hasLowStock) {
      lowStock++;
    }
  }

  return {
    totalProducts: products.length,
    totalVariants,
    totalStock,
    lowStock,
  };
}
