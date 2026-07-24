import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { Router, RouterModule } from '@angular/router';
import { CashierSessionService } from '@dukarun/cashier-session';
import { CompanyService } from '@dukarun/company';
import { CurrencyService } from '../../shared/services/currency.service';
import { DashboardService, AnalyticsService, PeriodProfit } from '@dukarun/analytics';
import { type PeriodStats } from '../../shared/models/stats.model';
import { AuthPermissionsService } from '@dukarun/auth';
import { OrderTableRowComponent, OrderCardComponent } from '@dukarun/order/components';
import { EchartContainerComponent } from '../../shared/components/dashboard/charts/echart-container.component';
import { PageHeaderComponent } from '../../shared/components/dashboard/page-header.component';

type Period = 'today' | 'week' | 'month';

interface CategoryStat {
  period: Period;
  label: string;
  amount: string;
}

interface AccountDetail {
  label: string;
  value: string;
}

interface CategoryData {
  name: string;
  type: 'purchases' | 'sales' | 'expenses';
  stats: CategoryStat[];
  accounts: AccountDetail[];
}

@Component({
  selector: 'app-overview',
  imports: [
    RouterModule,
    OrderTableRowComponent,
    OrderCardComponent,
    EchartContainerComponent,
    PageHeaderComponent,
    NgIcon,
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly companyService = inject(CompanyService);
  protected readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  private readonly cashierSessionService = inject(CashierSessionService);

  protected readonly selectedPeriod = signal<Period>('today');
  protected readonly expandedCategory = signal<string | null>(null);

  /** Sales (revenue) chart section: collapsed by default so it never reserves space when sparse. */
  protected readonly salesChartExpanded = signal(false);

  protected toggleSalesChartExpanded(): void {
    this.salesChartExpanded.update((v) => !v);
  }

  protected readonly isLoading = this.dashboardService.isLoading;
  protected readonly error = this.dashboardService.error;
  protected readonly lowStockCount = this.dashboardService.lowStockCount;
  protected readonly expiringSoonCount = this.dashboardService.expiringSoonCount;
  protected readonly expiredCount = this.dashboardService.expiredCount;

  protected readonly periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
  ];

  protected readonly categories = computed(() => {
    const stats = this.dashboardService.stats();
    if (!stats) {
      return this.getDefaultCategories();
    }

    return [
      this.createCategoryData('Sales', 'sales', stats.sales),
      this.createCategoryData('Purchases', 'purchases', stats.purchases),
      this.createCategoryData('Expenses', 'expenses', stats.expenses),
    ];
  });

  protected readonly recentOrders = this.dashboardService.recentOrders;

  protected readonly productCount = computed(() => {
    return this.dashboardService.stats()?.productCount || 0;
  });
  protected readonly variantCount = computed(() => {
    return this.dashboardService.stats()?.variantCount || 0;
  });

  /** Order count for selected period from salesSummary */
  protected readonly periodOrderCount = computed(() => {
    const summary = this.dashboardService.stats()?.salesSummary;
    const period = this.selectedPeriod();
    return summary?.[period]?.orderCount ?? null;
  });

  // Analytics (30D) feeds the sales chart + its loading state.
  private readonly analyticsService = inject(AnalyticsService);
  protected readonly analyticsStats = this.analyticsService.stats;
  protected readonly analyticsLoading = this.analyticsService.isLoading;

  /** Date range [start, end] (YYYY-MM-DD) for the selected period — matches backend period boundaries */
  private readonly periodDateRange = computed(() => {
    const period = this.selectedPeriod();
    const end = new Date();
    const endStr = end.toISOString().slice(0, 10);
    if (period === 'today') return { start: endStr, end: endStr };
    if (period === 'week') {
      const start = new Date(end);
      start.setDate(end.getDate() - end.getDay());
      start.setHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: endStr };
    }
    // month
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start: start.toISOString().slice(0, 10), end: endStr };
  });

  /** Sales revenue chart filtered by selected period; values are in cents, formatters display as currency */
  protected readonly salesChartOption = computed(() => {
    const trend = this.analyticsStats()?.salesTrend ?? [];
    const { start, end } = this.periodDateRange();
    const filtered = trend.filter((p) => p.date >= start && p.date <= end);
    const dates = filtered.map((p) => p.date);
    const values = filtered.map((p) => p.value); // cents
    const currencyService = this.currencyService;
    return {
      xAxis: { type: 'category' as const, data: dates },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (value: number) => currencyService.format(value),
        },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = Array.isArray(params)
            ? (params as { name: string; value: number }[])[0]
            : (params as { name: string; value: number });
          return p ? `${p.name}<br/>${currencyService.format(p.value)}` : '';
        },
      },
      series: [{ type: 'line' as const, data: values, smooth: true }],
      grid: { left: '3%', right: '4%', bottom: '3%', top: '4%', containLabel: true },
    };
  });

  /** Whether chart has any data for the selected period (for empty state) */
  protected readonly salesChartHasData = computed(() => {
    const trend = this.analyticsStats()?.salesTrend ?? [];
    const { start, end } = this.periodDateRange();
    return trend.some((p) => p.date >= start && p.date <= end);
  });

  protected readonly stockValueStats = this.dashboardService.stockValueStats;
  protected readonly stockValueLoading = this.dashboardService.stockValueLoading;

  private readonly authPermissions = inject(AuthPermissionsService);

  /**
   * Admin-only stats gate.
   * Minimum permission: UpdateSettings
   * Hides: Gross profit, Profit margin %, Stock value (Retail/Wholesale/Cost)
   * Everyone else sees: Revenue, Orders, Sales/Purchases/Expenses, Sales graph,
   *   Product count, Variant count, Low stock, Recent orders.
   */
  protected readonly hasAdminStats = computed(() =>
    this.authPermissions.hasUpdateSettingsPermission(),
  );

  /** Net profit for the selected period (admin-only; tax-exclusive margin basis). */
  protected readonly periodProfit = signal<PeriodProfit | null>(null);
  protected readonly periodProfitLoading = signal(false);

  constructor() {
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          this.dashboardService.fetchDashboardData();
          void this.analyticsService.fetch('30d'); // 30d for profit margin + sales chart
          // Stock value is admin-only — skip the query for non-admins
          if (this.hasAdminStats()) {
            void this.dashboardService.loadStockValueStats();
          }
        }
      },
      { allowSignalWrites: true },
    );

    // Net profit follows the period tabs (admin-only stat)
    effect(() => {
      const companyId = this.companyService.activeCompanyId();
      const { start, end } = this.periodDateRange();
      if (!companyId || !this.hasAdminStats()) {
        this.periodProfit.set(null);
        return;
      }
      void this.loadPeriodProfit(start, end);
    });
  }

  private async loadPeriodProfit(start: string, end: string): Promise<void> {
    this.periodProfitLoading.set(true);
    try {
      this.periodProfit.set(await this.dashboardService.getPeriodProfit(start, end));
    } finally {
      this.periodProfitLoading.set(false);
    }
  }

  private createCategoryData(
    name: string,
    type: 'purchases' | 'sales' | 'expenses',
    periodStats: PeriodStats,
  ): CategoryData {
    return {
      name,
      type,
      stats: [
        { period: 'today', label: 'Today', amount: this.formatCurrency(periodStats.today) },
        { period: 'week', label: 'Week', amount: this.formatCurrency(periodStats.week) },
        { period: 'month', label: 'Month', amount: this.formatCurrency(periodStats.month) },
      ],
      accounts: periodStats.accounts.map((account) => ({
        label: account.label,
        value: this.formatCurrency(account.value),
      })),
    };
  }

  private getDefaultCategories(): CategoryData[] {
    const emptyStats: PeriodStats = {
      today: 0,
      week: 0,
      month: 0,
      accounts: [],
    };

    return [
      this.createCategoryData('Sales', 'sales', emptyStats),
      this.createCategoryData('Purchases', 'purchases', emptyStats),
      this.createCategoryData('Expenses', 'expenses', emptyStats),
    ];
  }

  private formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  getAmountForPeriod(category: CategoryData): string {
    const stat = category.stats.find((s) => s.period === this.selectedPeriod());
    return stat?.amount || '0';
  }

  getSecondaryStats(category: CategoryData): CategoryStat[] {
    return category.stats.filter((s) => s.period !== this.selectedPeriod());
  }

  selectPeriod(period: Period): void {
    this.selectedPeriod.set(period);
  }

  getActivePeriodLabel(): string {
    return this.periods.find((p) => p.key === this.selectedPeriod())?.label ?? '';
  }

  toggleCategory(categoryType: string): void {
    if (this.expandedCategory() === categoryType) {
      this.expandedCategory.set(null);
    } else {
      this.expandedCategory.set(categoryType);
    }
  }

  navigateToLowStock(): void {
    this.router.navigate(['/dashboard/products'], {
      queryParams: { lowStock: 'true' },
    });
  }

  navigateToExpiringSoon(): void {
    this.router.navigate(['/dashboard/products'], {
      queryParams: { expiringSoon: 'true' },
    });
  }

  navigateToExpired(): void {
    this.router.navigate(['/dashboard/products'], {
      queryParams: { expired: 'true' },
    });
  }

  async refresh(): Promise<void> {
    await this.dashboardService.refresh();
    void this.analyticsService.fetch('30d');
    if (this.hasAdminStats()) {
      void this.dashboardService.loadStockValueStats(true);
      const { start, end } = this.periodDateRange();
      void this.loadPeriodProfit(start, end);
    }
    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        this.cashierSessionService.getCurrentSession(channelId).subscribe();
      }
    }
  }

  getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  getCurrentDate(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    };
    return now.toLocaleDateString('en-US', options);
  }
}
