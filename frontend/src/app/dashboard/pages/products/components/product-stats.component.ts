import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface ProductStats {
  totalProducts: number;
  totalVariants: number;
  totalStock: number;
  lowStock: number;
}

/**
 * Product statistics cards component
 * Displays key metrics in a responsive grid
 */
@Component({
  selector: 'app-product-stats',
  imports: [CommonModule],
  templateUrl: './product-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductStatsComponent {
  readonly stats = input.required<ProductStats>();
}
