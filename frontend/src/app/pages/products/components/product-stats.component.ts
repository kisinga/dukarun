import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StatBarComponent, type StatItem } from '../../../shared/components/dashboard/stat-bar.component';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
  expiringSoon: number;
  expired: number;
}

/**
 * Product summary — a compact inline stat line. Inventory-alert stats are
 * interactive filters; plain totals are not.
 */
@Component({
  selector: 'app-product-stats',
  standalone: true,
  imports: [StatBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stat-bar [stats]="items()" (select)="onSelect($event)" />`,
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
  readonly lowStockActive = input<boolean>(false);
  readonly expiringSoonActive = input<boolean>(false);
  readonly expiredActive = input<boolean>(false);
  readonly lowStockClick = output<void>();
  readonly expiringSoonClick = output<void>();
  readonly expiredClick = output<void>();

  readonly items = computed<StatItem[]>(() => {
    const s = this.stats();
    const n = (v: number) => v.toLocaleString('en-KE');
    return [
      { label: 'products', value: n(s.totalProducts) },
      { label: 'variants', value: n(s.totalVariants) },
      { label: 'in stock', value: n(s.totalStock) },
      {
        label: 'low stock',
        value: n(s.lowStock),
        tone: s.lowStock > 0 ? 'warning' : 'neutral',
        filter: 'lowStock',
        active: this.lowStockActive(),
      },
      {
        label: 'expiring',
        value: n(s.expiringSoon),
        tone: s.expiringSoon > 0 ? 'warning' : 'neutral',
        filter: 'expiringSoon',
        active: this.expiringSoonActive(),
      },
      {
        label: 'expired',
        value: n(s.expired),
        tone: s.expired > 0 ? 'error' : 'neutral',
        filter: 'expired',
        active: this.expiredActive(),
      },
    ];
  });

  onSelect(filter: string): void {
    if (filter === 'lowStock') this.lowStockClick.emit();
    if (filter === 'expiringSoon') this.expiringSoonClick.emit();
    if (filter === 'expired') this.expiredClick.emit();
  }
}
