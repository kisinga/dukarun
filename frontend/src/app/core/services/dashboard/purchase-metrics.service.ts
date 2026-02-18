import { Injectable, inject } from '@angular/core';
import { GET_DASHBOARD_STATS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { PeriodStats } from '../dashboard.service';

/**
 * Purchase Metrics Service
 *
 * Handles all purchase-related data fetching from ledger.
 * Single responsibility: purchase metrics computation from ledger (single source of truth).
 */
@Injectable({
  providedIn: 'root',
})
export class PurchaseMetricsService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Fetch and calculate purchase metrics for dashboard from ledger
   */
  async fetchPurchaseMetrics(): Promise<PeriodStats> {
    const client = this.apolloService.getClient();

    try {
      // Fetch dashboard stats from ledger (all periods calculated server-side)
      const result = await client.query<{
        dashboardStats: {
          purchases: {
            today: number;
            week: number;
            month: number;
            accounts: Array<{
              label: string;
              value: number;
              icon: string;
            }>;
          };
        };
      }>({
        query: GET_DASHBOARD_STATS as import('graphql').DocumentNode,
        fetchPolicy: 'network-only', // Always fetch fresh data from ledger
      });

      const purchases = result.data?.dashboardStats?.purchases;
      if (!purchases) {
        return {
          today: 0,
          week: 0,
          month: 0,
          accounts: [{ label: 'Inventory', value: 0, icon: '📦' }],
        };
      }

      return {
        today: purchases.today,
        week: purchases.week,
        month: purchases.month,
        accounts: purchases.accounts.map((acc) => ({
          label: acc.label,
          value: acc.value,
          icon: acc.icon,
        })),
      };
    } catch (error) {
      console.error('Failed to fetch purchase metrics from ledger:', error);
      return {
        today: 0,
        week: 0,
        month: 0,
        accounts: [{ label: 'Inventory', value: 0, icon: '📦' }],
      };
    }
  }
}
