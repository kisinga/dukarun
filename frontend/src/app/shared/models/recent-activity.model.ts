/**
 * Recent activity item for the dashboard feed.
 *
 * Lives in shared/models because it is produced from order data by
 * `domains/order/services/order-mapper.service` and consumed by
 * `domains/analytics/services/dashboard.service`. Keeping it here avoids a
 * circular domain dependency.
 */
export interface RecentActivity {
  id: string;
  type: 'Sale' | 'Purchase' | 'Expense';
  description: string;
  amount: string;
  time: string;
}
