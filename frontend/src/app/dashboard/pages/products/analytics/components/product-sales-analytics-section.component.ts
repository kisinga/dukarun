import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AnalyticsService } from '../../../../../core/services/analytics.service';
import { CurrencyService } from '../../../../../core/services/currency.service';
import { RankedCardComponent } from '../../../../components/shared/charts/ranked-card.component';
import type { RankedItem } from '../../../../components/shared/charts/ranked-list.component';
import {
  PeriodSelectorComponent,
  type AnalyticsPeriod,
} from '../../../../components/shared/charts/period-selector.component';
import type { AnalyticsTableRow } from './analytics-results-table.component';

export type SalesCardSource = 'topSelling' | 'highestRevenue' | 'highestMargin' | 'trending';

export interface ShowInTablePayload {
  source: SalesCardSource;
  rows: AnalyticsTableRow[];
  valueColumnLabel: string;
  title: string;
}

/**
 * Sales analytics section: period selector + four ranked cards (Top Selling, Highest Revenue, Highest Margin, Trending).
 * Does not fetch on init; reads from AnalyticsService. Parent page triggers fetch on header refresh.
 */
@Component({
  selector: 'app-product-sales-analytics-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
      <div
        class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-base-300/60"
      >
        <h2 class="text-sm font-bold text-base-content/70">Sales performance</h2>
        <app-period-selector
          [selected]="selectedPeriod()"
          (selectedChange)="onPeriodChange($event)"
        />
      </div>
      <div class="px-4 py-4">
        @if (stats() === null && !loading()) {
          <p class="text-sm text-base-content/50">Product analytics load on demand.</p>
        } @else if (loading()) {
          <div class="flex items-center justify-center py-6">
            <span class="loading loading-spinner loading-sm text-primary"></span>
          </div>
        } @else {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            @for (block of cardBlocks; track block.source) {
              <div
                class="rounded-xl border transition-all duration-200"
                [class.ring-2]="activeCard() === block.source"
                [class.ring-primary]="activeCard() === block.source"
                [class.ring-offset-2]="activeCard() === block.source"
                [class.ring-offset-base-100]="activeCard() === block.source"
                [class.border-base-300]="activeCard() !== block.source"
                [class.border-primary]="activeCard() === block.source"
              >
                <app-ranked-card
                  [title]="block.title"
                  [items]="block.items()"
                  [emptyMessage]="block.emptyMessage"
                  [barColor]="block.barColor"
                />
                <div class="px-3 pb-3 pt-0">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs w-full"
                    [disabled]="block.rows().length === 0"
                    (click)="emitShowInTable(block)"
                  >
                    Show in table
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  imports: [PeriodSelectorComponent, RankedCardComponent],
})
export class ProductSalesAnalyticsSectionComponent {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly currencyService = inject(CurrencyService);

  readonly selectedPeriod = input<AnalyticsPeriod>('30d');
  readonly periodChange = output<AnalyticsPeriod>();
  readonly activeCard = input<SalesCardSource | null>(null);
  readonly showInTable = output<ShowInTablePayload>();

  readonly stats = this.analyticsService.stats;
  readonly loading = this.analyticsService.isLoading;

  readonly topSellingItems = computed<RankedItem[]>(() =>
    (this.stats()?.topSelling ?? []).map((p) => ({
      label: p.productName,
      sublabel: p.variantName ?? undefined,
      value: p.totalQuantity,
      displayValue: p.totalQuantity.toLocaleString() + ' units',
    })),
  );
  readonly topSellingRows = computed<AnalyticsTableRow[]>(() =>
    (this.stats()?.topSelling ?? []).map((p, i) => ({
      rank: i + 1,
      productName: p.productName,
      variantName: p.variantName ?? null,
      displayValue: p.totalQuantity.toLocaleString() + ' units',
    })),
  );

  readonly highestRevenueItems = computed<RankedItem[]>(() =>
    (this.stats()?.highestRevenue ?? []).map((p) => ({
      label: p.productName,
      sublabel: p.variantName ?? undefined,
      value: p.totalRevenue,
      displayValue: this.currencyService.format(p.totalRevenue),
    })),
  );
  readonly highestRevenueRows = computed<AnalyticsTableRow[]>(() =>
    (this.stats()?.highestRevenue ?? []).map((p, i) => ({
      rank: i + 1,
      productName: p.productName,
      variantName: p.variantName ?? null,
      displayValue: this.currencyService.format(p.totalRevenue),
    })),
  );

  readonly highestMarginItems = computed<RankedItem[]>(() =>
    (this.stats()?.highestMargin ?? []).map((p) => ({
      label: p.productName,
      sublabel: p.variantName ?? undefined,
      value: p.marginPercent ?? 0,
      displayValue: (p.marginPercent ?? 0).toFixed(1) + '%',
    })),
  );
  readonly highestMarginRows = computed<AnalyticsTableRow[]>(() =>
    (this.stats()?.highestMargin ?? []).map((p, i) => ({
      rank: i + 1,
      productName: p.productName,
      variantName: p.variantName ?? null,
      displayValue: (p.marginPercent ?? 0).toFixed(1) + '%',
    })),
  );

  readonly trendingItems = computed<RankedItem[]>(() =>
    (this.stats()?.trending ?? []).map((p) => {
      const change = p.quantityChangePercent ?? 0;
      return {
        label: p.productName,
        sublabel: p.variantName ?? undefined,
        value: Math.abs(change),
        displayValue: (change >= 0 ? '+' : '') + change.toFixed(1) + '%',
      };
    }),
  );
  readonly trendingRows = computed<AnalyticsTableRow[]>(() =>
    (this.stats()?.trending ?? []).map((p, i) => {
      const change = p.quantityChangePercent ?? 0;
      return {
        rank: i + 1,
        productName: p.productName,
        variantName: p.variantName ?? null,
        displayValue: (change >= 0 ? '+' : '') + change.toFixed(1) + '%',
      };
    }),
  );

  protected readonly cardBlocks: Array<{
    source: SalesCardSource;
    title: string;
    emptyMessage: string;
    barColor: 'primary' | 'secondary' | 'success' | 'warning';
    items: () => RankedItem[];
    rows: () => AnalyticsTableRow[];
    valueColumnLabel: string;
    tableTitle: string;
  }> = [
    {
      source: 'topSelling',
      title: 'Top Selling',
      emptyMessage: 'No sales data',
      barColor: 'primary',
      items: () => this.topSellingItems(),
      rows: () => this.topSellingRows(),
      valueColumnLabel: 'Quantity',
      tableTitle: 'Top Selling',
    },
    {
      source: 'highestRevenue',
      title: 'Highest Revenue',
      emptyMessage: 'No revenue data',
      barColor: 'primary',
      items: () => this.highestRevenueItems(),
      rows: () => this.highestRevenueRows(),
      valueColumnLabel: 'Revenue',
      tableTitle: 'Highest Revenue',
    },
    {
      source: 'highestMargin',
      title: 'Highest Margin',
      emptyMessage: 'No margin data',
      barColor: 'success',
      items: () => this.highestMarginItems(),
      rows: () => this.highestMarginRows(),
      valueColumnLabel: 'Margin %',
      tableTitle: 'Highest Margin',
    },
    {
      source: 'trending',
      title: 'Trending',
      emptyMessage: 'No trend data',
      barColor: 'secondary',
      items: () => this.trendingItems(),
      rows: () => this.trendingRows(),
      valueColumnLabel: 'Change %',
      tableTitle: 'Trending',
    },
  ];

  emitShowInTable(block: (typeof this.cardBlocks)[0]): void {
    this.showInTable.emit({
      source: block.source,
      rows: block.rows(),
      valueColumnLabel: block.valueColumnLabel,
      title: block.tableTitle,
    });
  }

  onPeriodChange(period: AnalyticsPeriod): void {
    this.periodChange.emit(period);
  }
}
