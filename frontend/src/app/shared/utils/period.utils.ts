/**
 * Period date boundaries used for time-bucketed stats.
 * Lives in shared/utils because it is domain-agnostic date math.
 */
export interface PeriodDates {
  startOfToday: Date;
  startOfWeek: Date;
  startOfMonth: Date;
}

/**
 * Calculate period boundaries from a given date.
 */
export function calculatePeriods(fromDate: Date = new Date()): PeriodDates {
  const startOfMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);

  const startOfWeek = new Date(fromDate);
  startOfWeek.setDate(fromDate.getDate() - fromDate.getDay()); // Start of week (Sunday)
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfToday = new Date(fromDate);
  startOfToday.setHours(0, 0, 0, 0);

  return {
    startOfToday,
    startOfWeek,
    startOfMonth,
  };
}

/**
 * Filter items by date period. Accepts order, purchase, or generic created timestamps.
 */
export function filterByPeriod<
  T extends { orderPlacedAt?: string; purchaseDate?: string; createdAt?: string },
>(items: T[], periodStart: Date): T[] {
  return items.filter((item) => {
    const dateStr = item.orderPlacedAt || item.purchaseDate || item.createdAt;
    if (!dateStr) return false;
    const itemDate = new Date(dateStr);
    return itemDate >= periodStart;
  });
}
