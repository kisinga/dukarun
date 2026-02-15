import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/** Minimal variant shape shared by ProductSearchResult and products table */
export interface VariantListItem {
  name: string;
  sku: string;
  priceWithTax: number;
  stockOnHand?: number;
  trackInventory?: boolean;
  /** When true, row is not selectable (e.g. out of stock when restrictToInStock). */
  isDisabled?: boolean;
}

/**
 * Presentational list of variants. Two display modes:
 * - list: simple list (name, SKU, price; optional stock)
 * - table: products-page-style panel (border-l, table with Variant/SKU/Price/Stock, stock badges).
 * Optional variantSelected output for selectable rows (e.g. sell page).
 */
@Component({
  selector: 'app-variant-list',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (display() === 'table') {
      <div class="border-l-2 border-primary/20 pl-4 my-2" [class]="wrapperClass()">
        <table class="table table-xs w-full">
          <thead>
            <tr class="text-xs text-base-content/50 uppercase tracking-wider">
              <th class="font-medium pb-1.5">Variant</th>
              <th class="font-medium pb-1.5">SKU</th>
              <th class="font-medium pb-1.5 text-right">Price</th>
              <th class="font-medium pb-1.5 text-right w-16">Stock</th>
            </tr>
          </thead>
          <tbody>
            @for (v of variants(); track v.sku) {
              @let disabled = v.isDisabled === true;
              @if (selectable()) {
                <tr
                  class="border-base-300/50 transition-colors"
                  [class.cursor-pointer]="!disabled"
                  [class.hover:bg-base-300]="!disabled"
                  [class.cursor-not-allowed]="disabled"
                  [class.opacity-60]="disabled"
                  (click)="!disabled && onSelect(v)"
                >
                  <td class="py-1.5 text-sm">{{ v.name }}</td>
                  <td class="py-1.5 text-xs text-base-content/50 font-mono">{{ v.sku }}</td>
                  <td class="py-1.5 text-sm text-right font-mono tabular-nums">
                    {{ currencyService.format(v.priceWithTax, false) }}
                  </td>
                  <td class="py-1.5 text-right">
                    <span
                      class="badge badge-xs"
                      [class.badge-info]="v.trackInventory === false"
                      [class.badge-success]="
                        v.trackInventory !== false && (v.stockOnHand ?? 0) > 20
                      "
                      [class.badge-warning]="
                        v.trackInventory !== false &&
                        (v.stockOnHand ?? 0) > 0 &&
                        (v.stockOnHand ?? 0) <= 20
                      "
                      [class.badge-error]="v.trackInventory !== false && (v.stockOnHand ?? 0) === 0"
                    >
                      {{ v.trackInventory === false ? '∞' : (v.stockOnHand ?? 0) }}
                    </span>
                  </td>
                </tr>
              } @else {
                <tr class="border-base-300/50">
                  <td class="py-1.5 text-sm">{{ v.name }}</td>
                  <td class="py-1.5 text-xs text-base-content/50 font-mono">{{ v.sku }}</td>
                  <td class="py-1.5 text-sm text-right font-mono tabular-nums">
                    {{ currencyService.format(v.priceWithTax, false) }}
                  </td>
                  <td class="py-1.5 text-right">
                    <span
                      class="badge badge-xs"
                      [class.badge-info]="v.trackInventory === false"
                      [class.badge-success]="
                        v.trackInventory !== false && (v.stockOnHand ?? 0) > 20
                      "
                      [class.badge-warning]="
                        v.trackInventory !== false &&
                        (v.stockOnHand ?? 0) > 0 &&
                        (v.stockOnHand ?? 0) <= 20
                      "
                      [class.badge-error]="v.trackInventory !== false && (v.stockOnHand ?? 0) === 0"
                    >
                      {{ v.trackInventory === false ? '∞' : (v.stockOnHand ?? 0) }}
                    </span>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    } @else {
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
    }
  `,
})
export class VariantListComponent {
  readonly currencyService = inject(CurrencyService);
  readonly variants = input.required<VariantListItem[]>();
  readonly showStock = input<boolean>(false);
  /** 'list' = simple list; 'table' = products-page-style panel with stock badges */
  readonly display = input<'list' | 'table'>('list');
  /** Optional extra classes on the wrapper (table mode). E.g. "ml-[6.5rem] mr-4" for products table. */
  readonly wrapperClass = input<string>('');
  /** When true, rows are clickable and variantSelected is emitted (table mode). */
  readonly selectable = input<boolean>(false);
  readonly variantSelected = output<VariantListItem>();

  onSelect(v: VariantListItem): void {
    this.variantSelected.emit(v);
  }
}
