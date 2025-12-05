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
      if (stock < 10) {
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
