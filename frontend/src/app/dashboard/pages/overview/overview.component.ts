import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CompanyService } from '../../../core/services/company.service';
import { DashboardService, PeriodStats } from '../../../core/services/dashboard.service';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { CurrencyService } from '../../../core/services/currency.service';

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
  imports: [CommonModule, RouterModule],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly companyService = inject(CompanyService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);

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

  /**
   * Cashier flow enabled (from location settings)
   * Controls whether to show cashier-specific UI elements
   */
  protected readonly cashierFlowEnabled = this.stockLocationService.cashierFlowEnabled;

  /**
   * Cashier status (from location settings)
   * Shows whether the cashier is currently open
   */
  protected readonly cashierOpen = this.stockLocationService.cashierOpen;

  protected readonly quickActions = [
    { label: 'New Sale', icon: '💰', action: 'sell' },
    { label: 'Add Product', icon: '📦', action: 'add-product' },
    { label: 'Products', icon: '📦', action: 'products' },
    { label: 'Reports', icon: '📈', action: 'reports' },
  ];

  constructor() {
    // React to company changes and refresh dashboard
    effect(
      () => {
        const companyId = this.companyService.activeCompanyId();
        if (companyId) {
          console.log(`📊 Dashboard fetching data for company: ${companyId}`);
          this.dashboardService.fetchDashboardData();
        }
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    // Fetch stock locations with cashier status
    this.stockLocationService.fetchStockLocationsWithCashier();

    // Fetch dashboard data (channel-scoped)
    this.dashboardService.fetchDashboardData();

    // Auto-expand sales breakdown on desktop
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
   * Format currency for display
   * Note: PeriodStats values are in currency units (not cents), so we convert to cents for CurrencyService
   */
  private formatCurrency(amount: number): string {
    // Convert currency units to cents for CurrencyService
    const amountInCents = Math.round(amount * 100);
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

  /**
   * Refresh dashboard data
   */
  async refresh(): Promise<void> {
    await this.dashboardService.refresh();
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
