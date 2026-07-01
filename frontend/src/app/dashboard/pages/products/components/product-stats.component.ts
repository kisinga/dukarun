import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../components/shared/stat-bar.component';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
}

/**
 * Product summary — a compact inline stat line. Only "low stock" is an interactive
 * (single-toggle) filter and the sole coloured (warning) metric; the rest are plain
 * totals. (The Analytics link was removed — navigation belongs in a page action, not
 * inside the stat bar.)
 */
@Component({
  selector: 'app-product-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onLowStockClick()" />`,
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
  readonly lowStockActive = input<boolean>(false);
  readonly lowStockClick = output<void>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    return [
      { label: 'products', value: s.totalProducts },
      { label: 'variants', value: s.totalVariants },
      { label: 'in stock', value: s.totalStock },
      {
        label: 'low stock',
        value: s.lowStock,
        tone: s.lowStock > 0 ? 'warning' : 'neutral',
        filter: 'lowStock',
        active: this.lowStockActive(),
      },
    ];
  });

  onLowStockClick(): void {
    this.lowStockClick.emit();
  }
}
