import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { AnalyticsService } from '../../../../core/services/analytics.service';
import { computed } from '@angular/core';
import {
  RankedListComponent,
  RankedItem,
} from '../../../components/shared/charts/ranked-list.component';
import {
  PeriodSelectorComponent,
  AnalyticsPeriod,
} from '../../../components/shared/charts/period-selector.component';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
}

/**
 * Product statistics cards component
 * Compact label-first stats cards with colored left border accent.
 * Includes collapsible analytics section (lazy-loaded on first expand).
 */
@Component({
  selector: 'app-product-stats',
  standalone: true,
  templateUrl: './product-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RankedListComponent, PeriodSelectorComponent],
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
  readonly lowStockActive = input<boolean>(false);
  readonly lowStockClick = output<void>();

  private readonly analyticsService = inject(AnalyticsService);

  readonly analyticsStats = this.analyticsService.stats;
  readonly analyticsLoading = this.analyticsService.isLoading;

  readonly analyticsOpen = signal(false);
  readonly selectedPeriod = signal<AnalyticsPeriod>('30d');
  private fetched = false;

  readonly topSellingItems = computed<RankedItem[]>(() =>
    (this.analyticsStats()?.topSelling ?? []).map((p) => ({
      label: p.productName,
      sublabel: p.variantName ?? undefined,
      value: p.totalQuantity,
      displayValue: p.totalQuantity.toLocaleString() + ' units',
    })),
  );

  readonly highestMarginItems = computed<RankedItem[]>(() =>
    (this.analyticsStats()?.highestMargin ?? []).map((p) => ({
      label: p.productName,
      sublabel: p.variantName ?? undefined,
      value: p.marginPercent ?? 0,
      displayValue: (p.marginPercent ?? 0).toFixed(1) + '%',
    })),
  );

  onLowStockClick(): void {
    this.lowStockClick.emit();
  }

  toggleAnalytics(): void {
    const opening = !this.analyticsOpen();
    this.analyticsOpen.set(opening);
    if (opening && !this.fetched) {
      this.fetched = true;
      this.analyticsService.fetch(this.selectedPeriod());
    }
  }

  onPeriodChange(period: AnalyticsPeriod): void {
    this.selectedPeriod.set(period);
    this.analyticsService.fetch(period);
  }
}
