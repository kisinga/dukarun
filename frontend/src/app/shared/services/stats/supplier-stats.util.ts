/**
 * Supplier Stats Utility
 *
 * Pure functions for calculating supplier statistics from supplier data.
 */

export interface SupplierStats {
  totalSuppliers: number;
  verifiedSuppliers: number;
  suppliersWithAddresses: number;
  recentSuppliers: number;
}

export interface Supplier {
  id: string;
  user?: {
    verified?: boolean;
  };
  addresses?: Array<any>;
  createdAt: string;
}

/**
 * Calculate supplier stats from an array of suppliers
 * Pure function - no side effects
 *
 * @param suppliers - Array of suppliers (typically last X items from page or filtered data)
 * @returns SupplierStats object with calculated metrics
 */
export function calculateSupplierStats(suppliers: Supplier[]): SupplierStats {
  const totalSuppliers = suppliers.length;
  const verifiedSuppliers = suppliers.filter((s) => s.user?.verified).length;
  const suppliersWithAddresses = suppliers.filter(
    (s) => s.addresses && s.addresses.length > 0,
  ).length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSuppliers = suppliers.filter((s) => {
    if (!s.createdAt) return false;
    const createdAt = new Date(s.createdAt);
    return createdAt >= thirtyDaysAgo;
  }).length;

  return { totalSuppliers, verifiedSuppliers, suppliersWithAddresses, recentSuppliers };
}
