import { Injectable, inject } from '@angular/core';
import { GET_DASHBOARD_STATS } from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import { PeriodStats } from '../dashboard.service';

/**
 * Sales Metrics Service
 *
 * Handles all sales-related data fetching from ledger.
 * Single responsibility: sales metrics computation from ledger (single source of truth).
 */
@Injectable({
  providedIn: 'root',
})
export class SalesMetricsService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Fetch and calculate sales metrics for dashboard from ledger
   * Returns both summary metrics and period breakdown with account breakdown
   */
  async fetchSalesMetrics(): Promise<{
    orderTotal: number;
    orderCount: number;
    averageOrderValue: number;
    periodStats: PeriodStats;
  }> {
    const client = this.apolloService.getClient();

    try {
      // Fetch dashboard stats from ledger (all periods calculated server-side)
      const result = await client.query<{
        dashboardStats: {
          sales: {
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

      const sales = result.data?.dashboardStats?.sales;
      if (!sales) {
        return {
          orderTotal: 0,
          orderCount: 0,
          averageOrderValue: 0,
          periodStats: this.getEmptyPeriodStats(),
        };
      }

      // Use month total as orderTotal (ledger doesn't track order count)
      const orderTotal = sales.month;
      const orderCount = 0; // Ledger doesn't track order count, would need separate query
      const averageOrderValue = 0; // Cannot calculate without order count

      const periodStats: PeriodStats = {
        today: sales.today,
        week: sales.week,
        month: sales.month,
        accounts: sales.accounts.map((acc) => ({
          label: acc.label,
          value: acc.value,
          icon: acc.icon,
        })),
      };

      return {
        orderTotal,
        orderCount,
        averageOrderValue,
        periodStats,
      };
    } catch (error) {
      console.error('Failed to fetch sales metrics from ledger:', error);
      return {
        orderTotal: 0,
        orderCount: 0,
        averageOrderValue: 0,
        periodStats: this.getEmptyPeriodStats(),
      };
    }
  }

  /**
   * Get empty period stats (fallback)
   * Always include empty accounts array so breakdown structure is consistent
   */
  private getEmptyPeriodStats(): PeriodStats {
    return {
      today: 0,
      week: 0,
      month: 0,
      accounts: [
        { label: 'Cash Sales', value: 0, icon: '💵' },
        { label: 'Credit', value: 0, icon: '🏦' },
      ],
    };
  }
}
