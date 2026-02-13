import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
}

/**
 * Product statistics cards component
 * Compact label-first stats cards with colored left border accent.
 */
@Component({
  selector: 'app-product-stats',
  templateUrl: './product-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
  readonly lowStockActive = input<boolean>(false);
  readonly lowStockClick = output<void>();

  onLowStockClick(): void {
    this.lowStockClick.emit();
  }
}
