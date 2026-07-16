import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../shared/services/currency.service';
import { ProductSearchResult, ProductVariant } from '@dukarun/product';
import { ProductLabelComponent } from '../../../shared/components/dashboard-shared/components/product-label.component';

/**
 * Modal for confirming a scanned/selected product and choosing variant/quantity.
 *
 * Price editing is NOT supported here — prices are read-only.
 * Price adjustments happen exclusively in the cart (via up/down buttons on each line item).
 */
@Component({
  selector: 'app-product-confirm-modal',
  imports: [CommonModule, NgIcon, ProductLabelComponent],
  template: `
    @if (isOpen() && product()) {
      <div class="modal modal-open modal-bottom sm:modal-middle modal-backdrop-anim">
        <div class="modal-box max-w-xl p-0 modal-box-anim">
          <!-- Header -->
          <div class="bg-success/10 p-3 border-b border-base-300">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                  <ng-icon name="heroCheck" size="1.25rem" class="text-success" />
                </div>
                <h3 class="font-bold">Product Found</h3>
              </div>
              <button
                class="btn btn-ghost btn-sm btn-circle"
                (click)="closeModal.emit()"
                aria-label="Close"
              >
                <ng-icon name="heroXMark" size="1.25rem" />
              </button>
            </div>
          </div>

          <div class="p-3">
            <!-- Product Info -->
            <div class="flex gap-3 mb-3">
              @if (product()!.featuredAsset) {
                <img
                  [src]="product()!.featuredAsset!.preview"
                  [alt]="product()!.name"
                  class="w-16 h-16 rounded-lg object-cover"
                />
              } @else {
                <div class="w-16 h-16 rounded-lg bg-base-300 flex items-center justify-center">
                  <ng-icon name="heroCube" size="1.5rem" class="text-base-content/60" />
                </div>
              }
              <div class="flex-1 min-w-0">
                <app-product-label
                  [productName]="product()!.name"
                  [facetValues]="product()!.facetValues ?? []"
                />
                <p class="text-xs text-base-content/70 mt-0.5">
                  {{ product()!.variants.length }} variant{{
                    product()!.variants.length > 1 ? 's' : ''
                  }}
                </p>
              </div>
            </div>

            <!-- Variant Selection (multiple variants) -->
            @if (product()!.variants.length > 1) {
              <div class="space-y-1">
                <p class="text-xs font-medium text-base-content/70 px-1 mb-1">Select variant:</p>
                @for (variant of product()!.variants; track variant.id) {
                  <button
                    class="w-full flex items-center justify-between gap-2 p-3 rounded-lg transition-all border-2 interactive-ripple"
                    [class.bg-base-200]="variant.stockLevel === 'IN_STOCK'"
                    [class.bg-error/10]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [class.border-transparent]="variant.stockLevel === 'IN_STOCK'"
                    [class.border-error/30]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [class.interactive-press]="variant.stockLevel === 'IN_STOCK'"
                    [class.cursor-pointer]="variant.stockLevel === 'IN_STOCK'"
                    [class.cursor-not-allowed]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [class.opacity-60]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [disabled]="variant.stockLevel === 'OUT_OF_STOCK'"
                    (click)="variant.stockLevel === 'IN_STOCK' && handleVariantClick(variant)"
                  >
                    <div class="text-left min-w-0 flex-1">
                      <div class="font-semibold text-sm truncate">{{ variant.name }}</div>
                      <div class="text-xs text-base-content/70">{{ variant.sku }}</div>
                      @if (variant.stockLevel === 'OUT_OF_STOCK') {
                        <div class="text-xs text-error font-medium mt-1">Out of Stock</div>
                      }
                    </div>
                    <div class="text-right flex items-center gap-2">
                      <div class="text-base font-bold text-tabular">
                        {{ currencyService.format(variant.priceWithTax) }}
                      </div>
                      <div
                        class="badge badge-sm"
                        [class.badge-success]="variant.stockLevel === 'IN_STOCK'"
                        [class.badge-error]="variant.stockLevel === 'OUT_OF_STOCK'"
                      >
                        @if (variant.stockLevel === 'IN_STOCK') {
                          <ng-icon name="heroCheck" size="0.75rem" class="mr-1" />
                          Available
                        } @else {
                          <ng-icon name="heroXMark" size="0.75rem" class="mr-1" />
                          Unavailable
                        }
                      </div>
                    </div>
                  </button>
                }
              </div>
            } @else if (product()!.variants.length === 1) {
              <!-- Single Variant -->
              <div
                class="rounded-lg p-3 mb-3 border-2"
                [class.bg-base-200]="product()!.variants[0].stockLevel === 'IN_STOCK'"
                [class.bg-error/10]="product()!.variants[0].stockLevel === 'OUT_OF_STOCK'"
                [class.border-transparent]="product()!.variants[0].stockLevel === 'IN_STOCK'"
                [class.border-error/30]="product()!.variants[0].stockLevel === 'OUT_OF_STOCK'"
              >
                <div class="flex justify-between items-center">
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-sm">{{ product()!.variants[0].name }}</div>
                    <div class="text-xs text-base-content/70">{{ product()!.variants[0].sku }}</div>
                    @if (product()!.variants[0].stockLevel === 'OUT_OF_STOCK') {
                      <div class="text-xs text-error font-medium mt-1">Out of Stock</div>
                    }
                  </div>
                  <div class="text-right flex items-center gap-2">
                    <div class="text-xl font-bold text-primary text-tabular">
                      {{ currencyService.format(product()!.variants[0].priceWithTax) }}
                    </div>
                    <div
                      class="badge badge-sm"
                      [class.badge-success]="product()!.variants[0].stockLevel === 'IN_STOCK'"
                      [class.badge-error]="product()!.variants[0].stockLevel === 'OUT_OF_STOCK'"
                    >
                      @if (product()!.variants[0].stockLevel === 'IN_STOCK') {
                        <ng-icon name="heroCheck" size="0.75rem" class="mr-1" />
                        Available
                      } @else {
                        <ng-icon name="heroXMark" size="0.75rem" class="mr-1" />
                        Unavailable
                      }
                    </div>
                  </div>
                </div>
              </div>

              @if (product()!.variants[0].stockLevel === 'IN_STOCK') {
                <!-- Quantity Selector -->
                <div class="bg-base-100 rounded-lg p-3 mb-3">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-medium">Quantity</span>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="btn btn-sm btn-circle btn-ghost"
                        (click)="decrementQuantity()"
                      >
                        <ng-icon name="heroMinus" size="1rem" />
                      </button>
                      <input
                        type="number"
                        [value]="quantity()"
                        min="1"
                        class="input input-sm input-bordered text-center text-tabular w-16"
                        (input)="onQuantityInput($event)"
                      />
                      <button
                        type="button"
                        class="btn btn-sm btn-circle btn-ghost"
                        (click)="incrementQuantity()"
                      >
                        <ng-icon name="heroPlus" size="1rem" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Add to Cart Button -->
                <button
                  type="button"
                  class="btn btn-primary btn-block min-h-[3rem] interactive-press"
                  (click)="handleSingleVariantAdd()"
                >
                  <ng-icon name="heroShoppingCart" size="1.25rem" />
                  Add to Cart
                </button>
              } @else {
                <!-- Out of Stock Message -->
                <div class="alert alert-error">
                  <ng-icon name="heroXMark" size="1.25rem" />
                  <div>
                    <div class="font-semibold">Product Unavailable</div>
                    <div class="text-sm">
                      This item is currently out of stock and cannot be added to cart.
                    </div>
                  </div>
                </div>
              }
            } @else {
              <!-- No Variants -->
              <div class="alert alert-error">
                <ng-icon name="heroExclamationCircle" size="1.25rem" />
                <span class="text-sm">No variants available</span>
              </div>
            }
          </div>
        </div>
        <div class="modal-backdrop" (click)="closeModal.emit()"></div>
      </div>
    }
  `,
  styles: `
    @media (max-width: 639px) {
      .modal-bottom .modal-box {
        width: 100%;
        max-width: 100%;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductConfirmModalComponent {
  readonly currencyService = inject(CurrencyService);

  readonly isOpen = input.required<boolean>();
  readonly product = input.required<ProductSearchResult | null>();

  readonly variantSelected = output<{
    variant: ProductVariant;
    quantity: number;
    facetValues?: { name: string; facetCode?: string; facet?: { code: string } }[];
  }>();
  readonly closeModal = output<void>();

  /** Quantity for single-variant add (reset when product changes) */
  readonly quantity = signal(1);

  constructor() {
    effect(() => {
      // Reset quantity when product changes
      this.product();
      this.quantity.set(1);
    });
  }

  incrementQuantity(): void {
    this.quantity.update((q) => Math.max(1, q + 1));
  }

  decrementQuantity(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  onQuantityInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const parsed = parseInt(value, 10);
    this.quantity.set(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
  }

  handleVariantClick(variant: ProductVariant): void {
    const facetValues = this.product()?.facetValues?.map((fv) => ({
      name: fv.name,
      facetCode: fv.facetCode,
      facet: fv.facetCode ? { code: fv.facetCode } : undefined,
    }));
    this.variantSelected.emit({ variant, quantity: 1, facetValues });
  }

  handleSingleVariantAdd(): void {
    const variant = this.product()?.variants[0];
    if (!variant) return;
    const facetValues = this.product()?.facetValues?.map((fv) => ({
      name: fv.name,
      facetCode: fv.facetCode,
      facet: fv.facetCode ? { code: fv.facetCode } : undefined,
    }));
    this.variantSelected.emit({ variant, quantity: this.quantity(), facetValues });
  }
}
