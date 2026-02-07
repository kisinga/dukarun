import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import { ProductLabelComponent } from '../../shared/components/product-label.component';
import { ProductAction, ProductCardData } from './product-card.component';

/**
 * Product table row component for desktop view
 * Compact row representation with action buttons
 */
@Component({
  selector: '[app-product-table-row]',
  imports: [CommonModule, ProductLabelComponent],
  host: {
    class: 'hover',
  },
  templateUrl: './product-table-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTableRowComponent {
  private readonly currencyService = inject(CurrencyService);

  readonly product = input.required<ProductCardData>();
  readonly expanded = input<boolean>(false);
  readonly action = output<{ action: ProductAction; productId: string }>();
  readonly toggleExpand = output<void>();

  variantCount(): number {
    return this.product().variants?.length || 0;
  }

  totalStock(): number {
    return this.product().variants?.reduce((sum, v) => sum + (v.stockOnHand || 0), 0) || 0;
  }

  isService(): boolean {
    return this.product().variants?.some((v) => v.trackInventory === false) || false;
  }

  getStockDisplay(): string {
    if (this.isService()) {
      return '∞';
    }
    return this.totalStock().toString();
  }

  priceRange(): string {
    const variants = this.product().variants;
    if (!variants || variants.length === 0) return 'N/A';

    // Prices are in cents (currency service will convert them)
    const prices = variants.map((v) => v.priceWithTax);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) {
      return this.currencyService.format(minPrice, false); // Amount only
    }

    return `${this.currencyService.format(minPrice, false)} - ${this.currencyService.format(maxPrice, false)}`;
  }

  getThumbnail(): string | null {
    return this.product().featuredAsset?.preview || null;
  }

  onAction(actionType: ProductAction): void {
    this.action.emit({ action: actionType, productId: this.product().id });
  }

  onExpandClick(): void {
    this.toggleExpand.emit();
  }
}
