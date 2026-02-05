import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import {
  CashierSessionService,
  type PaymentMethodReconciliationConfig,
} from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { DashboardService, PeriodStats } from '../../../core/services/dashboard.service';
import { RecordExpenseModalComponent } from '../shifts/record-expense-modal.component';

interface CategoryStat {
  period: string;
  amount: string;
}

interface AccountDetail {
  label: string;
  value: string;
  icon: string;
}

interface CategoryData {
  name: string;
  type: 'purchases' | 'sales' | 'expenses';
  color: string;
  lightColor: string;
  stats: CategoryStat[];
  accounts: AccountDetail[];
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  amount: string;
  time: string;
}

/**
 * Dashboard Overview Component
 *
 * Displays key business metrics: Sales, Purchases, Expenses
 * Shows real-time data from Vendure backend via DashboardService
 *
 * Features:
 * - Real-time sales data from orders
 * - Period breakdowns (Today/Week/Month)
 * - Recent activity feed
 * - Product and user statistics
 */
@Component({
  selector: 'app-overview',
  imports: [CommonModule, FormsModule, RouterModule, RecordExpenseModalComponent],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly companyService = inject(CompanyService);
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  protected readonly cashierSessionService = inject(CashierSessionService);

  private readonly recordExpenseModal = viewChild(RecordExpenseModalComponent);

  protected readonly expandedCategory = signal<string | null>(null);
  protected readonly showRecentActivity = signal(false);
  protected readonly showQuickActions = signal(false);

  private resizeListener?: () => void;

  // Reactive data from service
  protected readonly isLoading = this.dashboardService.isLoading;
  protected readonly error = this.dashboardService.error;
  protected readonly lowStockCount = this.dashboardService.lowStockCount;

  // Computed categories from real data
  protected readonly categories = computed(() => {
    const stats = this.dashboardService.stats();
    if (!stats) {
      return this.getDefaultCategories();
    }

    return [
      this.createCategoryData('Purchases', 'purchases', '#4361ee', stats.purchases),
      this.createCategoryData('Sales', 'sales', '#36b37e', stats.sales),
      this.createCategoryData('Expenses', 'expenses', '#ff5c75', stats.expenses),
    ];
  });

  // Recent activity from service
  protected readonly recentActivity = computed(() => {
    return this.dashboardService.recentActivity() || [];
  });

  // Secondary stats computed from service data
  protected readonly productCount = computed(() => {
    return this.dashboardService.stats()?.productCount || 0;
  });

  protected readonly activeUsers = computed(() => {
    return this.dashboardService.stats()?.activeUsers || 0;
  });

  protected readonly averageSale = computed(() => {
    const avg = this.dashboardService.stats()?.averageSale || 0;
    return this.formatCurrency(avg);
  });

  protected readonly profitMargin = computed(() => {
    return this.dashboardService.stats()?.profitMargin || 0;
  });

  /** Session open = real session state from backend */
  protected readonly sessionOpen = this.cashierSessionService.hasActiveSession;

  protected readonly quickActions = [
    { label: 'New Sale', icon: '💰', action: 'sell' },
    { label: 'Add Product', icon: '📦', action: 'add-product' },
    { label: 'Products', icon: '📦', action: 'products' },
    { label: 'Reports', icon: '📈', action: 'reports' },
  ];

  /** 'open' | 'close' when modal is open, null when closed. */
  protected readonly dayModalMode = signal<'open' | 'close' | null>(null);
  /** Cashier-controlled accounts (same for open and close). */
  protected readonly dayModalConfig = signal<PaymentMethodReconciliationConfig[]>([]);
  /** Per-account amount in sh (key = ledgerAccountCode). */
  protected readonly dayModalBalances = signal<Record<string, string>>({});
  /** Notes (close only). */
  protected readonly dayModalNotes = signal('');

  constructor() {
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          this.dashboardService.fetchDashboardData();
          const channelId = parseInt(companyId, 10);
          if (!isNaN(channelId)) {
            this.cashierSessionService.getCurrentSession(channelId).subscribe();
          }
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        this.cashierSessionService.getCurrentSession(channelId).subscribe();
      }
    }
    this.dashboardService.fetchDashboardData();
    this.autoExpandSalesOnDesktop();
  }

  /**
   * Automatically expand sales breakdown on desktop screens
   */
  private autoExpandSalesOnDesktop(): void {
    // Check if we're on desktop (1024px and above, matching lg breakpoint)
    const isDesktop = window.innerWidth >= 1024;

    if (isDesktop) {
      this.expandedCategory.set('sales');
    }

    // Also listen for window resize to handle orientation changes
    this.resizeListener = () => {
      const isDesktopNow = window.innerWidth >= 1024;
      // Only auto-expand if we're on desktop and nothing is currently expanded
      if (isDesktopNow && !this.expandedCategory()) {
        this.expandedCategory.set('sales');
      }
    };

    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy(): void {
    // Clean up resize listener
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  /**
   * Create category data from period stats
   */
  private createCategoryData(
    name: string,
    type: 'purchases' | 'sales' | 'expenses',
    color: string,
    periodStats: PeriodStats,
  ): CategoryData {
    return {
      name,
      type,
      color,
      lightColor: this.hexToRgba(color, 0.1),
      stats: [
        { period: 'Today', amount: this.formatCurrency(periodStats.today) },
        { period: 'Week', amount: this.formatCurrency(periodStats.week) },
        { period: 'Month', amount: this.formatCurrency(periodStats.month) },
      ],
      accounts: periodStats.accounts.map((account) => ({
        label: account.label,
        value: this.formatCurrency(account.value),
        icon: account.icon,
      })),
    };
  }

  /**
   * Get default categories with zero values (used during loading)
   */
  private getDefaultCategories(): CategoryData[] {
    const emptyStats: PeriodStats = {
      today: 0,
      week: 0,
      month: 0,
      accounts: [],
    };

    return [
      this.createCategoryData('Purchases', 'purchases', '#4361ee', emptyStats),
      this.createCategoryData('Sales', 'sales', '#36b37e', emptyStats),
      this.createCategoryData('Expenses', 'expenses', '#ff5c75', emptyStats),
    ];
  }

  /**
   * Format currency for display (amount in cents)
   */
  private formatCurrency(amountInCents: number): string {
    return this.currencyService.format(amountInCents);
  }

  /**
   * Convert hex color to rgba
   */
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  toggleCategory(categoryType: string): void {
    if (this.expandedCategory() === categoryType) {
      this.expandedCategory.set(null);
    } else {
      this.expandedCategory.set(categoryType);
    }
  }

  toggleRecentActivity(): void {
    this.showRecentActivity.update((v) => !v);
  }

  toggleQuickActions(): void {
    this.showQuickActions.update((v) => !v);
  }

  handleQuickAction(action: string): void {
    const routes: Record<string, string> = {
      sell: '/dashboard/sell',
      'add-product': '/dashboard/products',
      products: '/dashboard/products',
      reports: '/dashboard/reports',
    };

    const route = routes[action];
    if (route) {
      this.router.navigate([route]);
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

  openOpenDayModal(): void {
    const companyId = this.companyService.activeCompanyId();
    if (!companyId) return;
    const channelId = parseInt(companyId, 10);
    if (isNaN(channelId)) return;
    this.cashierSessionService.error.set(null);
    this.dayModalMode.set('open');
    this.dayModalBalances.set({});
    this.dayModalNotes.set('');
    this.cashierSessionService.getChannelReconciliationConfig(channelId).subscribe((config) => {
      const cashierControlled = config.filter((c) => c.isCashierControlled);
      this.dayModalConfig.set(cashierControlled);
      const balances: Record<string, string> = {};
      cashierControlled.forEach((c) => (balances[c.ledgerAccountCode] = ''));
      this.dayModalBalances.set(balances);
    });
  }

  openCloseDayModal(): void {
    const session = this.cashierSessionService.currentSession();
    if (!session) return;
    this.cashierSessionService.error.set(null);
    const channelId =
      typeof session.channelId === 'number'
        ? session.channelId
        : parseInt(String(session.channelId), 10);
    this.dayModalMode.set('close');
    this.dayModalBalances.set({});
    this.dayModalNotes.set('');
    this.cashierSessionService.getChannelReconciliationConfig(channelId).subscribe((config) => {
      const cashierControlled = config.filter((c) => c.isCashierControlled);
      this.dayModalConfig.set(cashierControlled);
      const balances: Record<string, string> = {};
      cashierControlled.forEach((c) => (balances[c.ledgerAccountCode] = ''));
      this.dayModalBalances.set(balances);
    });
  }

  closeDayModal(): void {
    this.dayModalMode.set(null);
    this.dayModalConfig.set([]);
    this.dayModalBalances.set({});
    this.cashierSessionService.error.set(null);
  }

  openRecordExpense(): void {
    this.recordExpenseModal()?.show();
  }

  onExpenseRecorded(): void {
    this.refresh();
  }

  onExpenseCancelled(): void {}

  setDayModalBalance(accountCode: string, value: string | number): void {
    const str = value != null && value !== '' ? String(value) : '';
    this.dayModalBalances.update((prev) => ({ ...prev, [accountCode]: str }));
  }

  async submitDayModal(): Promise<void> {
    const mode = this.dayModalMode();
    const config = this.dayModalConfig();
    const balances = this.dayModalBalances();
    if (!mode || config.length === 0) return;

    if (mode === 'open') {
      const companyId = this.companyService.activeCompanyId();
      if (!companyId) return;
      const channelId = parseInt(companyId, 10);
      if (isNaN(channelId)) return;
      const openingBalances: { accountCode: string; amountCents: number }[] = [];
      for (const c of config) {
        const raw = balances[c.ledgerAccountCode];
        const str = (raw != null ? String(raw) : '').trim();
        const amountCents = Math.round(parseFloat(str || '0') * 100);
        if (isNaN(amountCents) || amountCents < 0) return;
        openingBalances.push({ accountCode: c.ledgerAccountCode, amountCents });
      }
      this.cashierSessionService.openSession(channelId, openingBalances).subscribe((session) => {
        if (session) this.closeDayModal();
      });
      return;
    }

    const session = this.cashierSessionService.currentSession();
    if (!session) return;
    const id = typeof session.id === 'string' ? session.id.trim() : '';
    if (!id || id === '-1') return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return;
    const closingBalances: Array<{ accountCode: string; amountCents: number }> = [];
    for (const c of config) {
      const raw = balances[c.ledgerAccountCode];
      const str = (raw != null ? String(raw) : '').trim();
      const amountCents = Math.round(parseFloat(str || '0') * 100);
      if (isNaN(amountCents) || amountCents < 0) return;
      closingBalances.push({ accountCode: c.ledgerAccountCode, amountCents });
    }
    const channelId =
      typeof session.channelId === 'number'
        ? session.channelId
        : parseInt(String(session.channelId), 10);
    this.cashierSessionService
      .closeSession(
        id,
        closingBalances,
        this.dayModalNotes().trim() || undefined,
        Number.isNaN(channelId) ? undefined : channelId,
      )
      .subscribe((summary) => {
        if (summary) this.closeDayModal();
      });
  }

  get channelId(): number {
    const id = this.companyService.activeCompanyId();
    return id ? parseInt(id, 10) : 0;
  }

  /**
   * Get current date formatted for display
   */
  getCurrentDate(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return now.toLocaleDateString('en-US', options);
  }

  /**
   * Format value in compact form for mobile (e.g., 1.5k, 2.3M)
   */
  formatCompactValue(amount: string): string {
    const numStr = amount.replace('KES ', '').replace(/,/g, '');
    const num = parseFloat(numStr);

    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }

  /**
   * Calculate bar width based on category performance
   * Returns percentage for visual indicator
   */
  getBarWidth(categoryType: 'purchases' | 'sales' | 'expenses'): number {
    const stats = this.dashboardService.stats();
    if (!stats) return 0;

    const categoryData = stats[categoryType];
    const todayValue = categoryData.today;
    const weekValue = categoryData.week;

    // Calculate as percentage of week average
    const weekAverage = weekValue / 7;
    if (weekAverage === 0) return 0;

    const percentage = (todayValue / weekAverage) * 100;
    return Math.min(Math.max(percentage, 10), 100); // Clamp between 10-100%
  }
}
