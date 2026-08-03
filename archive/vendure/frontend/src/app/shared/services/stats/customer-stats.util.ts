/**
 * Customer Stats Utility
 *
 * Pure functions for calculating customer statistics from customer data.
 */

export interface CustomerStats {
  totalCustomers: number;
  verifiedCustomers: number;
  creditApprovedCustomers: number;
  frozenCustomers: number;
  recentCustomers: number;
}

export interface Customer {
  id: string;
  user?: {
    verified?: boolean;
  };
  customFields?: {
    isCreditApproved?: boolean;
  };
  outstandingAmount?: number;
  createdAt: string;
}

/** Frozen = not approved and outstanding ≠ 0 (inferred, not stored). */
export function isCustomerCreditFrozen(c: Customer): boolean {
  return c.customFields?.isCreditApproved !== true && (c.outstandingAmount ?? 0) !== 0;
}

/**
 * Calculate customer stats from an array of customers
 * Pure function - no side effects
 *
 * @param customers - Array of customers (typically last X items from page or filtered data)
 * @returns CustomerStats object with calculated metrics
 */
export function calculateCustomerStats(customers: Customer[]): CustomerStats {
  const totalCustomers = customers.length;
  const verifiedCustomers = customers.filter((c) => c.user?.verified).length;
  const creditApprovedCustomers = customers.filter((c) => c.customFields?.isCreditApproved).length;
  const frozenCustomers = customers.filter(isCustomerCreditFrozen).length;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCustomers = customers.filter((c) => {
    if (!c.createdAt) return false;
    const createdAt = new Date(c.createdAt);
    return createdAt >= thirtyDaysAgo;
  }).length;

  return {
    totalCustomers,
    verifiedCustomers,
    creditApprovedCustomers,
    frozenCustomers,
    recentCustomers,
  };
}
