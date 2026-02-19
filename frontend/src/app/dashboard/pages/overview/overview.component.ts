import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CashierSessionService } from '../../../core/services/cashier-session/cashier-session.service';
import { ShiftModalTriggerService } from '../../../core/services/cashier-session/shift-modal-trigger.service';
import { CompanyService } from '../../../core/services/company.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { DashboardService, PeriodStats } from '../../../core/services/dashboard.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { OrderTableRowComponent } from '../orders/components/order-table-row.component';
import { OrderCardComponent } from '../orders/components/order-card.component';
import { EchartContainerComponent } from '../../components/shared/charts/echart-container.component';

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
  imports: [RouterModule, OrderTableRowComponent, OrderCardComponent, EchartContainerComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly companyService = inject(CompanyService);
  protected readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  protected readonly cashierSessionService = inject(CashierSessionService);
  protected readonly shiftModalTrigger = inject(ShiftModalTriggerService);

  protected readonly selectedPeriod = signal<Period>('today');
  protected readonly expandedCategory = signal<string | null>(null);

  protected readonly isLoading = this.dashboardService.isLoading;
  protected readonly error = this.dashboardService.error;
  protected readonly lowStockCount = this.dashboardService.lowStockCount;

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

  /** Period-driven revenue: prefer COGS-derived (salesSummary) when available, else ledger sales */
  protected readonly periodRevenueFormatted = computed(() => {
    const stats = this.dashboardService.stats();
    const period = this.selectedPeriod();
    const summary = stats?.salesSummary;
    if (summary) {
      const revenue = summary[period]?.revenue ?? 0;
      return this.currencyService.format(revenue);
    }
    const categories = this.categories();
    const sales = categories.find((c) => c.type === 'sales');
    if (!sales) return this.currencyService.format(0);
    const stat = sales.stats.find((s) => s.period === period);
    return stat?.amount ?? this.currencyService.format(0);
  });

  /** Gross profit (margin in currency) for selected period from COGS-derived salesSummary */
  protected readonly periodGrossProfitFormatted = computed(() => {
    const summary = this.dashboardService.stats()?.salesSummary;
    const period = this.selectedPeriod();
    const margin = summary?.[period]?.margin ?? 0;
    return this.currencyService.format(margin);
  });

  /** Order count for selected period from salesSummary */
  protected readonly periodOrderCount = computed(() => {
    const summary = this.dashboardService.stats()?.salesSummary;
    const period = this.selectedPeriod();
    return summary?.[period]?.orderCount ?? null;
  });

  /** Profit margin %: period-driven from salesSummary when available, else analytics (e.g. 30D) */
  private readonly analyticsService = inject(AnalyticsService);
  protected readonly analyticsStats = this.analyticsService.stats;
  protected readonly analyticsLoading = this.analyticsService.isLoading;
  protected readonly profitMarginPercent = computed(() => {
    const stats = this.dashboardService.stats();
    const period = this.selectedPeriod();
    const summary = stats?.salesSummary;
    if (summary) {
      const p = summary[period];
      if (p && p.revenue > 0) {
        return Math.round((p.margin / p.revenue) * 1000) / 10;
      }
      return null;
    }
    const margin = this.analyticsStats()?.averageProfitMargin;
    return margin != null ? Math.round(margin * 10) / 10 : null;
  });

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

  protected readonly sessionOpen = this.cashierSessionService.hasActiveSession;

  protected readonly stockValueStats = this.dashboardService.stockValueStats;
  protected readonly stockValueLoading = this.dashboardService.stockValueLoading;

  constructor() {
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          this.dashboardService.fetchDashboardData();
          void this.analyticsService.fetch('30d'); // 30d for profit margin + sales chart
          void this.dashboardService.loadStockValueStats();
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    // Data fetching handled by constructor effect
  }

  refreshStockValue(): void {
    void this.dashboardService.loadStockValueStats(true);
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

  navigateToInventory(): void {
    this.router.navigate(['/dashboard/products'], {
      queryParams: { lowStock: 'true' },
    });
  }

  async refresh(): Promise<void> {
    await this.dashboardService.refresh();
    void this.analyticsService.fetch('30d');
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
