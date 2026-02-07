import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/** Minimal variant shape shared by ProductSearchResult and ProductCardData */
export interface VariantListItem {
  name: string;
  sku: string;
  priceWithTax: number;
  stockOnHand?: number;
}

/**
 * Presentational list of variants: name, SKU, price; optionally stock.
 * Used in search results, Quick Select, and products table detail row.
 */
@Component({
  selector: 'app-variant-list',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list list-none p-0 m-0 text-sm">
      @for (v of variants(); track v.sku) {
        <li
          class="flex items-center gap-x-3 px-2 py-1.5 border-b border-base-300 last:border-b-0 min-w-0"
        >
          <span class="font-medium truncate min-w-0 flex-1">{{ v.name }}</span>
          <span class="text-base-content/60 text-xs truncate w-24 shrink-0">{{ v.sku }}</span>
          <span class="font-mono text-right w-20 shrink-0">{{
            currencyService.format(v.priceWithTax, false)
          }}</span>
          @if (showStock() && v.stockOnHand !== undefined) {
            <span class="text-right text-xs tabular-nums w-12 shrink-0">{{ v.stockOnHand }}</span>
          }
        </li>
      }
    </ul>
  `,
})
export class VariantListComponent {
  readonly currencyService = inject(CurrencyService);
  readonly variants = input.required<VariantListItem[]>();
  readonly showStock = input<boolean>(false);
}
