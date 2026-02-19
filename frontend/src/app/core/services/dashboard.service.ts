import { computed, inject, Injectable, signal } from '@angular/core';
import {
  GET_DASHBOARD_STATS,
  GET_PRODUCT_STATS,
  GET_PRODUCTS,
  GET_RECENT_ORDERS,
  GET_STOCK_VALUE_STATS,
} from '../graphql/operations.graphql';
import type { CacheSyncEntityHandler } from './cache/cache-sync-handler.interface';
import { CacheSyncService } from './cache/cache-sync.service';
import { ApolloService } from './apollo.service';
import { CompanyService } from './company.service';
import { CurrencyService } from './currency.service';
import { OrderMapperService } from './order-mapper.service';

/** COGS-derived period totals (cents; from mv_daily_sales_summary + order stats) */
export interface SalesSummaryPeriod {
  revenue: number;
  cogs: number;
  margin: number;
  orderCount: number;
}

/** COGS-derived sales summary for dashboard (today / week / month) */
export interface SalesSummary {
  today: SalesSummaryPeriod;
  week: SalesSummaryPeriod;
  month: SalesSummaryPeriod;
}

/**
 * Dashboard statistics aggregated from Vendure data
 */
export interface DashboardStats {
  sales: PeriodStats;
  purchases: PeriodStats;
  expenses: PeriodStats;
  /** COGS-derived revenue, cogs, margin, orderCount per period (when available) */
  salesSummary: SalesSummary | null;
  productCount: number;
  variantCount: number;
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

/** Stock value at retail, wholesale, and cost (cents). Cached per channel. */
export interface StockValueStats {
  retail: number;
  wholesale: number;
  cost: number;
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
 * - Single GET_DASHBOARD_STATS for sales, purchases, expenses (ledger)
 * - Product stats: Fetched directly (simple query)
 * - Recent activity: Transformed from orders
 *
 * Single Responsibility: State management and orchestration only
 */
/** Raw dashboard stats response from ledger + COGS sales summary */
interface DashboardStatsResponse {
  sales?: {
    today: number;
    week: number;
    month: number;
    accounts: Array<{ label: string; value: number; icon: string }>;
  };
  purchases?: {
    today: number;
    week: number;
    month: number;
    accounts: Array<{ label: string; value: number; icon: string }>;
  };
  expenses?: {
    today: number;
    week: number;
    month: number;
    accounts: Array<{ label: string; value: number; icon: string }>;
  };
  salesSummary?: SalesSummary | null;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly apolloService = inject(ApolloService);
  private readonly companyService = inject(CompanyService);
  private readonly currencyService = inject(CurrencyService);
  private readonly orderMapper = inject(OrderMapperService);
  private readonly cacheSyncService = inject(CacheSyncService);

  private readonly orderSyncHandler: CacheSyncEntityHandler = {
    entityType: 'order',
    invalidateOne: (channelId: string) => {
      if (this.companyService.activeCompanyId() === channelId) {
        void this.refetchRecentOrdersOnly();
      }
    },
  };

  constructor() {
    this.cacheSyncService.registerHandler(this.orderSyncHandler);
  }

  // State signals
  private readonly statsSignal = signal<DashboardStats | null>(null);
  private readonly recentActivitySignal = signal<RecentActivity[]>([]);
  private readonly recentOrdersSignal = signal<any[]>([]);
  private readonly lowStockCountSignal = signal<number>(0);
  private readonly stockValueStatsSignal = signal<StockValueStats | null>(null);
  private readonly stockValueLoadingSignal = signal(false);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  // Public readonly signals
  readonly stats = this.statsSignal.asReadonly();
  readonly recentActivity = this.recentActivitySignal.asReadonly();
  readonly recentOrders = this.recentOrdersSignal.asReadonly();
  readonly lowStockCount = this.lowStockCountSignal.asReadonly();
  readonly stockValueStats = this.stockValueStatsSignal.asReadonly();
  readonly stockValueLoading = this.stockValueLoadingSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  // Computed: Check if we have data
  readonly hasData = computed(() => this.statsSignal() !== null);

  /**
   * Fetch all dashboard data
   * This is the main entry point - call this when dashboard loads or refreshes.
   * Uses a single GET_DASHBOARD_STATS call for sales, purchases, and expenses (ledger).
   *
   * Data is automatically scoped to active channel (no location parameter needed)
   */
  async fetchDashboardData(): Promise<void> {
    if (!this.companyService.activeCompanyId()) {
      console.warn('No active company - skipping dashboard data fetch');
      return;
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const [ledgerStats, products, recentOrders, lowStockCount] = await Promise.all([
        this.fetchDashboardStats(),
        this.fetchProductStats(),
        this.fetchRecentOrders(),
        this.fetchLowStockCount(),
      ]);

      const stats: DashboardStats = {
        sales: this.mapToPeriodStats(ledgerStats?.sales, [
          { label: 'Cash Sales', value: 0, icon: '💵' },
          { label: 'Credit', value: 0, icon: '🏦' },
        ]),
        purchases: this.mapToPeriodStats(ledgerStats?.purchases, [
          { label: 'Inventory', value: 0, icon: '📦' },
        ]),
        expenses: this.mapToPeriodStats(ledgerStats?.expenses, [
          { label: 'Rent', value: 0, icon: '🏠' },
          { label: 'Salaries', value: 0, icon: '👥' },
          { label: 'Other', value: 0, icon: '📋' },
        ]),
        salesSummary: ledgerStats?.salesSummary ?? null,
        productCount: products.productCount,
        variantCount: products.variantCount,
        activeUsers: 0, // Replaced by MV-based strip on overview
        averageSale: 0,
        profitMargin: 0,
      };

      this.statsSignal.set(stats);
      this.recentOrdersSignal.set(recentOrders);
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
   * Single ledger request: sales, purchases, expenses in one call.
   */
  private async fetchDashboardStats(): Promise<DashboardStatsResponse | null> {
    const client = this.apolloService.getClient();
    try {
      const result = await client.query<{ dashboardStats: DashboardStatsResponse }>({
        query: GET_DASHBOARD_STATS as import('graphql').DocumentNode,
        fetchPolicy: 'network-only',
      });
      return result.data?.dashboardStats ?? null;
    } catch (error) {
      console.error('Failed to fetch dashboard stats from ledger:', error);
      return null;
    }
  }

  private mapToPeriodStats(
    raw: DashboardStatsResponse['sales'],
    defaultAccounts: AccountBreakdown[],
  ): PeriodStats {
    if (!raw) {
      return { today: 0, week: 0, month: 0, accounts: defaultAccounts };
    }
    return {
      today: raw.today,
      week: raw.week,
      month: raw.month,
      accounts: raw.accounts?.length
        ? raw.accounts.map((acc) => ({ label: acc.label, value: acc.value, icon: acc.icon }))
        : defaultAccounts,
    };
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
   * Fetch stock value stats (retail, wholesale, cost in cents). Cached per channel; use forceRefresh to recompute.
   */
  async loadStockValueStats(forceRefresh = false): Promise<void> {
    if (!this.companyService.activeCompanyId()) return;
    this.stockValueLoadingSignal.set(true);
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{ stockValueStats: StockValueStats }>({
        query: GET_STOCK_VALUE_STATS as import('graphql').DocumentNode,
        variables: { forceRefresh },
        fetchPolicy: 'network-only',
      });
      this.stockValueStatsSignal.set(result.data?.stockValueStats ?? null);
    } catch (error) {
      console.error('Failed to fetch stock value stats:', error);
      this.stockValueStatsSignal.set(null);
    } finally {
      this.stockValueLoadingSignal.set(false);
    }
  }

  /**
   * Refetch only recent orders and activity (called when SSE order event arrives).
   * Updates recentOrders and recentActivity signals without touching other dashboard data.
   */
  async refetchRecentOrdersOnly(): Promise<void> {
    if (!this.companyService.activeCompanyId()) return;
    try {
      const recentOrders = await this.fetchRecentOrders();
      this.recentOrdersSignal.set(recentOrders);
      this.recentActivitySignal.set(
        this.orderMapper.toRecentActivities(
          recentOrders,
          (c) => this.currencyService.format(c),
          (d) => this.getTimeDifference(d),
        ),
      );
    } catch (error) {
      console.error('Failed to refetch recent orders:', error);
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
    this.recentOrdersSignal.set([]);
    this.lowStockCountSignal.set(0);
    this.errorSignal.set(null);
  }
}
