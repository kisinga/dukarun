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
import { SparklineComponent } from '../../components/shared/charts/sparkline.component';
import { AnimatedCounterComponent } from '../../components/shared/charts/animated-counter.component';
import { OrderTableRowComponent } from '../orders/components/order-table-row.component';
import { OrderCardComponent } from '../orders/components/order-card.component';

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
    SparklineComponent,
    AnimatedCounterComponent,
    OrderTableRowComponent,
    OrderCardComponent,
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly companyService = inject(CompanyService);
  private readonly currencyService = inject(CurrencyService);
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

  /** MV-backed 7D KPIs */
  protected readonly orders7d = computed(() => this.analyticsStats()?.totalOrders ?? 0);
  protected readonly revenue7dFormatted = computed(() =>
    this.currencyService.format(this.analyticsStats()?.totalRevenue ?? 0),
  );
  protected readonly avgOrderValueFormatted = computed(() => {
    const stats = this.analyticsStats();
    if (!stats || stats.totalOrders === 0) return this.currencyService.format(0);
    return this.currencyService.format(Math.round(stats.totalRevenue / stats.totalOrders));
  });
  protected readonly avgDailyOrders = computed(() => {
    const stats = this.analyticsStats();
    if (!stats) return 0;
    const days = stats.salesTrend?.length || 1;
    return Math.round(stats.totalOrders / days);
  });

  protected readonly sessionOpen = this.cashierSessionService.hasActiveSession;

  // Business Insights (analytics — lazy)
  private readonly analyticsService = inject(AnalyticsService);
  protected readonly insightsOpen = signal(false);
  private insightsFetched = false;
  protected readonly analyticsStats = this.analyticsService.stats;
  protected readonly analyticsLoading = this.analyticsService.isLoading;

  protected readonly salesSparklineData = computed(() =>
    (this.analyticsStats()?.salesTrend ?? []).map((p) => p.value),
  );
  protected readonly avgMarginTarget = computed(() =>
    Math.round(this.analyticsStats()?.averageProfitMargin ?? 0),
  );
  protected readonly totalRevenueTarget = computed(() =>
    Math.round((this.analyticsStats()?.totalRevenue ?? 0) / 100),
  );

  constructor() {
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          this.dashboardService.fetchDashboardData();
          void this.analyticsService.fetch('7d');
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    // Data fetching handled by constructor effect
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

  toggleInsights(): void {
    const opening = !this.insightsOpen();
    this.insightsOpen.set(opening);
    if (opening && !this.insightsFetched) {
      this.insightsFetched = true;
      this.analyticsService.fetch('7d');
    }
  }

  async refresh(): Promise<void> {
    await this.dashboardService.refresh();
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

  readonly formatPercent = (v: number): string => `${v.toFixed(1)}%`;
  readonly formatRevenue = (v: number): string => this.currencyService.format(v * 100);
}
