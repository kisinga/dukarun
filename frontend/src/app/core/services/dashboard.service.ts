import { computed, inject, Injectable, signal } from '@angular/core';
import {
  GET_DASHBOARD_STATS,
  GET_PRODUCT_STATS,
  GET_PRODUCTS,
  GET_RECENT_ORDERS,
} from '../graphql/operations.graphql';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';
import { CurrencyService } from './currency.service';
import { PurchaseMetricsService } from './dashboard/purchase-metrics.service';
import { SalesMetricsService } from './dashboard/sales-metrics.service';
import { OrderMapperService } from './order-mapper.service';

/**
 * Dashboard statistics aggregated from Vendure data
 */
export interface DashboardStats {
  sales: PeriodStats;
  purchases: PeriodStats;
  expenses: PeriodStats;
  productCount: number;
  activeUsers: number;
  averageSale: number;
  profitMargin: number;
}

/**
 * Statistics for a specific category (Sales/Purchases/Expenses) across time periods
 */
export interface PeriodStats {
  today: number;
  week: number;
  month: number;
  accounts: AccountBreakdown[];
}

/**
 * Breakdown by account type (e.g., Cash Sales, M-Pesa, Credit)
 */
export interface AccountBreakdown {
  label: string;
  value: number;
  icon: string;
}

/**
 * Recent activity item for the dashboard feed
 */
export interface RecentActivity {
  id: string;
  type: 'Sale' | 'Purchase' | 'Expense';
  description: string;
  amount: string;
  time: string;
}

/**
 * Dashboard Service - Main Orchestrator
 *
 * ARCHITECTURE:
 * - Orchestrates data fetching from specialized metric services
 * - Manages state and signals for reactive UI updates
 * - Delegates domain-specific logic to focused services
 * - Automatically scoped to active company via CompanyService
 *
 * COMPOSITION:
 * - SalesMetricsService: Sales data and payment clustering
 * - PurchaseMetricsService: Purchase data aggregation
 * - Product stats: Fetched directly (simple query)
 * - Recent activity: Transformed from orders
 *
 * Single Responsibility: State management and orchestration only
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly currencyService = inject(CurrencyService);
  private readonly orderMapper = inject(OrderMapperService);
  private readonly salesMetricsService = inject(SalesMetricsService);
  private readonly purchaseMetricsService = inject(PurchaseMetricsService);

  // State signals
  private readonly statsSignal = signal<DashboardStats | null>(null);
  private readonly recentActivitySignal = signal<RecentActivity[]>([]);
  private readonly lowStockCountSignal = signal<number>(0);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly stats = this.statsSignal.asReadonly();
  readonly recentActivity = this.recentActivitySignal.asReadonly();
  readonly lowStockCount = this.lowStockCountSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  // Computed: Check if we have data
  readonly hasData = computed(() => this.statsSignal() !== null);

  /**
   * Fetch all dashboard data
   * This is the main entry point - call this when dashboard loads or refreshes
   *
   * Data is automatically scoped to active channel (no location parameter needed)
   */
  async fetchDashboardData(): Promise<void> {
    // Don't fetch if no company is active
    if (!this.companyService.activeCompanyId()) {
      console.warn('No active company - skipping dashboard data fetch');
      return;
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      // Fetch data in parallel for performance
      const [salesMetrics, products, recentOrders, purchaseMetrics, lowStockCount, expenseMetrics] =
        await Promise.all([
          this.salesMetricsService.fetchSalesMetrics(),
          this.fetchProductStats(),
          this.fetchRecentOrders(),
          this.purchaseMetricsService.fetchPurchaseMetrics(),
          this.fetchLowStockCount(),
          this.fetchExpenseMetrics(),
        ]);

      // Aggregate into dashboard stats
      const stats: DashboardStats = {
        sales: salesMetrics.periodStats,
        purchases: purchaseMetrics,
        expenses: expenseMetrics,
        productCount: products.productCount,
        activeUsers: 1, // Placeholder - would need custom tracking
        averageSale: salesMetrics.averageOrderValue,
        profitMargin: 0, // Placeholder - needs cost data
      };

      this.statsSignal.set(stats);
      this.recentActivitySignal.set(
        this.orderMapper.toRecentActivities(
          recentOrders,
          (c) => this.currencyService.format(c),
          (d) => this.getTimeDifference(d),
        ),
      );
      this.lowStockCountSignal.set(lowStockCount);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      this.errorSignal.set('Failed to load dashboard data. Please try again.');
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Fetch product statistics from Vendure
   *
   * Data is automatically scoped to active channel
   */
  private async fetchProductStats(): Promise<{ productCount: number; variantCount: number }> {
    const client = this.apolloService.getClient();

    try {
      const result = await client.query<{
        products: { totalItems: number };
        productVariants: { totalItems: number };
      }>({
        query: GET_PRODUCT_STATS,
      });

      return {
        productCount: result.data?.products?.totalItems || 0,
        variantCount: result.data?.productVariants?.totalItems || 0,
      };
    } catch (error) {
      console.error('Failed to fetch product stats:', error);
      return { productCount: 0, variantCount: 0 };
    }
  }

  /**
   * Fetch recent orders for activity feed
   *
   * @param locationId - Optional location ID for filtering (currently not supported in Vendure standard API)
   * NOTE: Location filtering requires custom order fields or custom resolver
   */
  private async fetchRecentOrders(): Promise<any[]> {
    const client = this.apolloService.getClient();

    try {
      const result = await client.query<{
        orders: {
          items: Array<{
            id: string;
            code: string;
            total: number;
            totalWithTax: number;
            state: string;
            createdAt: string;
            currencyCode: string;
            customer?: {
              firstName?: string;
              lastName?: string;
            };
            lines: Array<{
              id: string;
              quantity: number;
              productVariant: {
                id: string;
                name: string;
                sku: string;
                product: {
                  id: string;
                  name: string;
                };
              };
            }>;
          }>;
        };
      }>({
        query: GET_RECENT_ORDERS,
      });

      return result.data?.orders?.items || [];
    } catch (error) {
      console.error('Failed to fetch recent orders:', error);
      return [];
    }
  }

  /**
   * Fetch low stock count
   * Products with any variant having stockOnHand < 10
   */
  private async fetchLowStockCount(): Promise<number> {
    const client = this.apolloService.getClient();
    const LOW_STOCK_THRESHOLD = 10;

    try {
      // Fetch all products with their variants and stock levels
      const result = await client.query<{
        products: {
          items: Array<{
            id: string;
            variants: Array<{
              stockOnHand: number;
            }>;
          }>;
        };
      }>({
        query: GET_PRODUCTS,
        variables: {
          options: {
            take: 100, // Limited to prevent list-query-limit-exceeded errors
          },
        },
      });

      const products = result.data?.products?.items || [];

      // Count products with at least one variant below threshold
      const lowStockProducts = products.filter((product) =>
        product.variants?.some((variant) => (variant.stockOnHand || 0) < LOW_STOCK_THRESHOLD),
      );

      return lowStockProducts.length;
    } catch (error) {
      console.error('Failed to fetch low stock count:', error);
      return 0;
    }
  }

  /**
   * Fetch expense metrics from ledger
   */
  private async fetchExpenseMetrics(): Promise<PeriodStats> {
    const client = this.apolloService.getClient();

    try {
      // Fetch dashboard stats from ledger (all periods calculated server-side)
      const result = await client.query<{
        dashboardStats: {
          expenses: {
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
        query: GET_DASHBOARD_STATS,
        fetchPolicy: 'network-only', // Always fetch fresh data from ledger
      });

      const expenses = result.data?.dashboardStats?.expenses;
      if (!expenses) {
        return {
          today: 0,
          week: 0,
          month: 0,
          accounts: [
            { label: 'Rent', value: 0, icon: '🏠' },
            { label: 'Salaries', value: 0, icon: '👥' },
            { label: 'Other', value: 0, icon: '📋' },
          ],
        };
      }

      return {
        today: expenses.today,
        week: expenses.week,
        month: expenses.month,
        accounts: expenses.accounts.map((acc) => ({
          label: acc.label,
          value: acc.value,
          icon: acc.icon,
        })),
      };
    } catch (error) {
      console.error('Failed to fetch expense metrics from ledger:', error);
      return {
        today: 0,
        week: 0,
        month: 0,
        accounts: [
          { label: 'Rent', value: 0, icon: '🏠' },
          { label: 'Salaries', value: 0, icon: '👥' },
          { label: 'Other', value: 0, icon: '📋' },
        ],
      };
    }
  }

  /**
   * Format currency value (deprecated - use CurrencyService instead)
   * Kept for backward compatibility but uses CurrencyService internally
   */
  private formatCurrency(amount: number, currencyCode: string = 'KES'): string {
    // Amount is in cents, CurrencyService handles conversion
    const formatted = this.currencyService.format(amount);
    // Add + prefix for positive amounts
    const prefix = amount >= 0 ? '+' : '';
    return formatted.startsWith('-') ? formatted : `${prefix}${formatted}`;
  }

  /**
   * Calculate human-readable time difference
   */
  private getTimeDifference(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  /**
   * Refresh dashboard data
   * Useful for pull-to-refresh or manual refresh
   */
  async refresh(): Promise<void> {
    return this.fetchDashboardData();
  }

  /**
   * Clear dashboard data (useful for logout)
   */
  clearData(): void {
    this.statsSignal.set(null);
    this.recentActivitySignal.set([]);
    this.lowStockCountSignal.set(0);
    this.errorSignal.set(null);
  }
}
