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
  imports: [RouterModule, OrderTableRowComponent, OrderCardComponent],
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

  /** Period-driven: revenue (sales) for selected period */
  protected readonly periodRevenueFormatted = computed(() => {
    const categories = this.categories();
    const sales = categories.find((c) => c.type === 'sales');
    if (!sales) return this.currencyService.format(0);
    const stat = sales.stats.find((s) => s.period === this.selectedPeriod());
    return stat?.amount ?? this.currencyService.format(0);
  });

  /** Profit margin from analytics MV (order-line margin: revenue - wholesale cost). Not period-driven; 7D. */
  private readonly analyticsService = inject(AnalyticsService);
  protected readonly analyticsStats = this.analyticsService.stats;
  protected readonly analyticsLoading = this.analyticsService.isLoading;
  protected readonly profitMarginPercent = computed(() => {
    const margin = this.analyticsStats()?.averageProfitMargin;
    return margin != null ? Math.round(margin * 10) / 10 : null;
  });

  protected readonly sessionOpen = this.cashierSessionService.hasActiveSession;

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
}
