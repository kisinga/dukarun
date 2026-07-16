/**
 * Statistics for a specific category (Sales/Purchases/Expenses) across time periods.
 * Lives in shared/models because it is consumed by dashboard services, page components,
 * and shared stats utilities without owning any one domain.
 */
export interface PeriodStats {
  today: number;
  week: number;
  month: number;
  accounts: AccountBreakdown[];
}

/**
 * Breakdown by account type (e.g., Cash Sales, M-Pesa, Credit).
 */
export interface AccountBreakdown {
  label: string;
  value: number;
  icon: string;
}
