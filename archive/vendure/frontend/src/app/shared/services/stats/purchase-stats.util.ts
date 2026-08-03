/**
 * Purchase Stats Utility
 *
 * Pure functions for calculating purchase statistics from purchase data.
 * Used by both dashboard services (time-bound stats) and page components (data-bound stats).
 */

import { type AccountBreakdown, type PeriodStats } from '../../models/stats.model';
import { type PeriodDates, filterByPeriod } from '../../utils/period.utils';

export interface PurchaseStats {
  totalPurchases: number;
  totalValue: number; // In cents
  thisMonth: number;
  pendingPayments: number;
  overdue: number;
}

export interface Purchase {
  id: string;
  totalCost: number; // In cents
  purchaseDate: string;
  paymentStatus?: string;
  isOverdue?: boolean;
}

/**
 * Calculate purchase stats from an array of purchases
 * Pure function - no side effects, no assumptions about data source
 *
 * @param purchases - Array of purchases (typically last X items from page or filtered data)
 * @returns PurchaseStats object with calculated metrics
 */
export function calculatePurchaseStats(purchases: Purchase[]): PurchaseStats {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalPurchases = purchases.length;
  const totalValue = purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);

  const thisMonth = purchases.filter((p) => {
    if (!p.purchaseDate) return false;
    const purchaseDate = new Date(p.purchaseDate);
    return purchaseDate >= startOfMonth;
  }).length;

  const pendingPayments = purchases.filter((p) => {
    const status = p.paymentStatus?.toLowerCase() || '';
    return status === 'pending' || status === 'partial';
  }).length;

  const overdue = purchases.filter((p) => p.isOverdue).length;

  return { totalPurchases, totalValue, thisMonth, pendingPayments, overdue };
}

/**
 * Calculate period-based purchase stats for dashboard
 * Filters purchases by time periods and calculates totals
 *
 * @param purchases - Array of purchases (should include all purchases for the period range)
 * @param periods - Period date boundaries
 * @returns PeriodStats with today/week/month totals and account breakdown
 */
export function calculatePurchasePeriodStats(
  purchases: Purchase[],
  periods: PeriodDates,
): PeriodStats {
  // Filter by period
  const todayPurchases = filterByPeriod(purchases, periods.startOfToday);
  const weekPurchases = filterByPeriod(purchases, periods.startOfWeek);

  // Calculate totals in cents, then convert to currency units
  const todayTotalCents = todayPurchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
  const weekTotalCents = weekPurchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);
  const monthTotalCents = purchases.reduce((sum, p) => sum + (p.totalCost || 0), 0);

  const today = todayTotalCents / 100;
  const week = weekTotalCents / 100;
  const month = monthTotalCents / 100;

  // For breakdown, since only inventory records exist, show all as inventory
  const accounts: AccountBreakdown[] =
    month > 0 ? [{ label: 'Inventory', value: month, icon: '📦' }] : []; // Empty if no purchases

  return {
    today,
    week,
    month,
    accounts,
  };
}
