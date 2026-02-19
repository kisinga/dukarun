import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
}

/**
 * Product statistics cards component.
 * Compact label-first stats cards with colored left border accent.
 * Analytics moved to dedicated Product Analytics page; link provided below stats.
 */
@Component({
  selector: 'app-product-stats',
  standalone: true,
  templateUrl: './product-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
  readonly lowStockActive = input<boolean>(false);
  readonly lowStockClick = output<void>();

  onLowStockClick(): void {
    this.lowStockClick.emit();
  }
}
