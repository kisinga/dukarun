import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { MoneyComponent } from '../../../../core/components/money.component';
import {
  ProductLabelComponent,
  type ProductLabelFacetValue,
} from '../../shared/components/product-label.component';
import {
  isServiceProduct,
  priceRange,
  stockBadgeClass,
  stockDisplay,
  stockTextClass,
  totalStock,
} from '../utils/product-presentation';

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
 * Mobile product list item. Collapsed shows identity + one key line (variants ·
 * stock · price); expanded shows the actual variants (the thing you can't see
 * collapsed) + actions. Stock tone / price come from the shared presentation
 * util so this can't drift from the desktop table row.
 */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink, NgIcon, MoneyComponent, ProductLabelComponent],
  templateUrl: './product-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<ProductCardData>();
  readonly canEdit = input<boolean>(true);
  readonly action = output<{ action: ProductAction; productId: string }>();

  readonly variants = computed(() => this.product().variants ?? []);
  readonly variantCount = computed(() => this.variants().length);
  readonly isService = computed(() => isServiceProduct(this.variants()));
  readonly stockTotal = computed(() => totalStock(this.variants()));
  readonly stockLabel = computed(() => stockDisplay(this.stockTotal(), this.isService()));
  readonly stockText = computed(() => stockTextClass(this.stockTotal(), this.isService()));
  readonly price = computed(() => priceRange(this.variants()));

  getThumbnail(): string | null {
    return this.product().featuredAsset?.preview || null;
  }

  variantBadgeClass(v: { stockOnHand?: number; trackInventory?: boolean }): string {
    return stockBadgeClass(v.stockOnHand ?? 0, v.trackInventory === false);
  }

  variantStock(v: { stockOnHand?: number; trackInventory?: boolean }): string {
    return stockDisplay(v.stockOnHand ?? 0, v.trackInventory === false);
  }

  onAction(actionType: ProductAction): void {
    this.action.emit({ action: actionType, productId: this.product().id });
  }
}
