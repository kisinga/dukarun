import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  DashboardService,
  type StockValuationType,
} from '../../../../core/services/dashboard.service';
import type { AnalyticsPeriod } from '../../../components/shared/charts';
import { PageHeaderComponent } from '../../../components/shared/page-header.component';
import type { AnalyticsTableRow } from './components/analytics-results-table.component';
import { AnalyticsResultsTableComponent } from './components/analytics-results-table.component';
import type { SalesCardSource } from './components/product-sales-analytics-section.component';
import { ProductSalesAnalyticsSectionComponent } from './components/product-sales-analytics-section.component';
import { StockValueRankingSectionComponent } from './components/stock-value-ranking-section.component';

const VALUATION_LABELS: Record<StockValuationType, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  COST: 'Cost',
};

/**
 * Product Analytics page. Data loads on demand only when the user clicks Refresh.
 * No auto-fetch on init or route enter.
 * "Top by value" and "Show in table" populate a shared results table and highlight the source card.
 */
@Component({
  selector: 'app-product-analytics-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-5 anim-stagger">
      <app-page-header
        title="Product Analytics"
        subtitle="Sales performance and stock value at hand"
        [showRefresh]="true"
        [isLoading]="isLoading()"
        refreshTitle="Refresh analytics"
        (refresh)="onRefresh()"
      />

      @if (error()) {
        <div role="alert" class="alert alert-error alert-sm rounded-xl">
          <span class="text-xs font-medium flex-1">{{ error() }}</span>
          <button type="button" class="btn btn-error btn-xs" (click)="onRefresh()">Retry</button>
        </div>
      }

      @if (lastUpdated(); as updated) {
        <p class="text-xs text-base-content/40">Updated {{ updated }}</p>
      }

      <app-product-sales-analytics-section
        [selectedPeriod]="selectedPeriod()"
        [activeCard]="salesActiveCard()"
        (periodChange)="onPeriodChange($event)"
        (showInTable)="onShowInTable($event)"
      />

      <app-stock-value-ranking-section
        [activeCard]="stockActiveCard()"
        (topByValueClick)="onTopByValueClick($event)"
      />

      @if (tableRows().length > 0) {
        <app-analytics-results-table
          [title]="tableTitle()"
          [valueColumnLabel]="valueColumnLabel()"
          [rows]="tableRows()"
        />
      }
    </div>
  `,
  imports: [
    PageHeaderComponent,
    ProductSalesAnalyticsSectionComponent,
    StockValueRankingSectionComponent,
    AnalyticsResultsTableComponent,
  ],
})
export class ProductAnalyticsPageComponent {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly dashboardService = inject(DashboardService);
  private readonly currencyService = inject(CurrencyService);

  readonly selectedPeriod = signal<AnalyticsPeriod>('30d');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastUpdated = signal<string | null>(null);
  private hasLoadedOnce = false;

  /** Active source for the table: stock type (RETAIL/WHOLESALE/COST) or sales card key. */
  readonly activeSource = signal<string | null>(null);
  readonly tableRows = signal<AnalyticsTableRow[]>([]);
  readonly tableTitle = signal<string>('');
  readonly valueColumnLabel = signal<string>('Value');

  readonly isLoading = computed(() => this.loading());

  /** For sales section: highlight card when activeSource is a sales key. */
  readonly salesActiveCard = computed<SalesCardSource | null>(() => {
    const s = this.activeSource();
    if (!s) return null;
    if (s === 'topSelling' || s === 'highestRevenue' || s === 'highestMargin' || s === 'trending') {
      return s;
    }
    return null;
  });

  /** For stock section: highlight card when activeSource is retail/wholesale/cost. */
  readonly stockActiveCard = computed<StockValuationType | null>(() => {
    const s = this.activeSource();
    if (s === 'RETAIL' || s === 'WHOLESALE' || s === 'COST') return s;
    return null;
  });

  onShowInTable(payload: {
    source: SalesCardSource;
    rows: AnalyticsTableRow[];
    valueColumnLabel: string;
    title: string;
  }): void {
    this.activeSource.set(payload.source);
    this.tableRows.set(payload.rows);
    this.tableTitle.set(payload.title);
    this.valueColumnLabel.set(payload.valueColumnLabel);
  }

  async onTopByValueClick(type: StockValuationType): Promise<void> {
    this.activeSource.set(type);
    this.tableRows.set([]);
    this.tableTitle.set('Top 20 by ' + (VALUATION_LABELS[type]?.toLowerCase() ?? '') + ' value');
    this.valueColumnLabel.set('Value (' + (VALUATION_LABELS[type] ?? type) + ')');
    try {
      const result = await this.dashboardService.loadStockValueRanking(type, 20);
      const rows: AnalyticsTableRow[] = result.items.map((item, i) => ({
        rank: i + 1,
        productName: item.productName,
        variantName: item.variantName,
        displayValue: this.currencyService.format(item.value),
      }));
      this.tableRows.set(rows);
    } catch (err) {
      console.error('Failed to load stock value ranking:', err);
      this.tableRows.set([]);
    }
  }

  async onRefresh(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await Promise.all([
        this.analyticsService.fetch(this.selectedPeriod()),
        this.dashboardService.loadStockValueStats(true),
      ]);
      this.hasLoadedOnce = true;
      this.lastUpdated.set('just now');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      this.loading.set(false);
    }
  }

  onPeriodChange(period: AnalyticsPeriod): void {
    this.selectedPeriod.set(period);
    if (this.hasLoadedOnce) {
      void this.analyticsService.fetch(period);
    }
  }
}
