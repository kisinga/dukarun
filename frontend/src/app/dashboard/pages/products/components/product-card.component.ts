import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  ProductLabelComponent,
  type ProductLabelFacetValue,
} from '../../shared/components/product-label.component';

export interface ProductCardData {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  featuredAsset?: { preview?: string };
  facetValues?: ProductLabelFacetValue[];
  variants?: Array<{
    id: string;
    name: string;
    sku: string;
    priceWithTax: number;
    stockOnHand: number;
    trackInventory?: boolean;
  }>;
}

export type ProductAction = 'view' | 'edit' | 'purchase' | 'delete';

/**
 * Reusable product card component for mobile view
 * Displays product summary with collapsible details
 */
@Component({
  selector: 'app-product-card',
  imports: [CommonModule, ProductLabelComponent],
  templateUrl: './product-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly product = input.required<ProductCardData>();
  readonly action = output<{ action: ProductAction; productId: string }>();

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

    const prices = variants.map((v) => v.priceWithTax);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) {
      return this.formatPrice(minPrice);
    }

    return `${this.formatPrice(minPrice)} - ${this.formatPrice(maxPrice)}`;
  }

  getThumbnail(): string | null {
    return this.product().featuredAsset?.preview || null;
  }

  private formatPrice(price: number): string {
    return this.currencyService.format(price, false); // Amount only
  }

  onAction(actionType: ProductAction): void {
    this.action.emit({ action: actionType, productId: this.product().id });
  }
}
