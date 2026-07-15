import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { MoneyComponent } from '../../../../core/components/money.component';
import { ProductLabelComponent } from '../../shared/components/product-label.component';
import { ProductAction, ProductCardData } from './product-card.component';
import {
  isServiceProduct,
  priceRange,
  stockBadgeClass,
  stockDisplay,
  totalStock,
} from '../utils/product-presentation';

/**
 * Product table row (desktop). Compact columnar row; the variant detail rows are
 * rendered by the parent table so they align under the same columns. Stock tone
 * and price come from the shared presentation util (see the mobile card).
 */
@Component({
  selector: '[app-product-table-row]',
  imports: [RouterLink, NgIcon, MoneyComponent, ProductLabelComponent],
  host: {
    class: 'hover cursor-pointer',
    '(click)': 'onExpandClick()',
  },
  templateUrl: './product-table-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductTableRowComponent {
  readonly product = input.required<ProductCardData>();
  readonly canEdit = input<boolean>(true);
  readonly batchExpiryEnabled = input<boolean>(false);
  readonly expanded = input<boolean>(false);
  readonly action = output<{ action: ProductAction; productId: string }>();
  readonly toggleExpand = output<void>();

  readonly variants = computed(() => this.product().variants ?? []);
  readonly variantCount = computed(() => this.variants().length);
  readonly isService = computed(() => isServiceProduct(this.variants()));
  readonly stockTotal = computed(() => totalStock(this.variants()));
  readonly stockLabel = computed(() => stockDisplay(this.stockTotal(), this.isService()));
  readonly stockBadge = computed(() => stockBadgeClass(this.stockTotal(), this.isService()));
  readonly price = computed(() => priceRange(this.variants()));

  getThumbnail(): string | null {
    return this.product().featuredAsset?.preview || null;
  }

  nearestExpiryDays(): number | null {
    const batches = this.variants()
      .flatMap((v) => v.inventoryBatches ?? [])
      .filter((b) => b.expiryDate);
    if (!batches.length) return null;
    const now = new Date().getTime();
    const times = batches.map((b) => new Date(b.expiryDate!).getTime());
    return Math.floor((Math.min(...times) - now) / (1000 * 60 * 60 * 24));
  }

  expiryLabel(): string | null {
    const days = this.nearestExpiryDays();
    if (days === null) return null;
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return 'Expires today';
    return `Expires in ${days}d`;
  }

  onAction(actionType: ProductAction): void {
    this.action.emit({ action: actionType, productId: this.product().id });
  }

  onExpandClick(): void {
    this.toggleExpand.emit();
  }
}
