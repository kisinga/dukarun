import { CommonModule } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { ProductLabelComponent } from '../../shared/components/product-label.component';
import {
  PriceModificationService,
  PriceOverrideData,
} from '../services/price-modification.service';

/**
 * Modal for confirming product and selecting variant/quantity
 */
@Component({
  selector: 'app-product-confirm-modal',
  imports: [CommonModule, ProductLabelComponent],
  template: `
    @if (isOpen() && product()) {
      <div class="modal modal-open modal-bottom sm:modal-middle modal-backdrop-anim">
        <div class="modal-box max-w-xl p-0 modal-box-anim">
          <!-- Header -->
          <div class="bg-success/10 p-3 border-b border-base-300">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-success"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 class="font-bold">✓ Product Found</h3>
              </div>
              <button class="btn btn-ghost btn-sm btn-circle" (click)="closeModal.emit()">✕</button>
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
                  <span class="text-2xl">📦</span>
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

            <!-- Variant Selection -->
            @if (product()!.variants.length > 1) {
              <div class="space-y-1">
                <p class="text-xs font-medium text-base-content/70 px-1 mb-1">Select variant:</p>
                @for (variant of product()!.variants; track variant.id) {
                  <button
                    class="w-full flex items-center justify-between gap-2 p-3 rounded-lg transition-all border-2"
                    [class.bg-base-200]="variant.stockLevel === 'IN_STOCK'"
                    [class.bg-error/10]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [class.border-transparent]="variant.stockLevel === 'IN_STOCK'"
                    [class.border-error/30]="variant.stockLevel === 'OUT_OF_STOCK'"
                    [class.hover:bg-base-300]="variant.stockLevel === 'IN_STOCK'"
                    [class.hover:border-primary]="variant.stockLevel === 'IN_STOCK'"
                    [class.active:scale-[0.98]]="variant.stockLevel === 'IN_STOCK'"
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
                      @if (canOverridePrices() && variant.stockLevel === 'IN_STOCK') {
                        <!-- Price Controls -->
                        <div class="flex items-center gap-1" (click)="$event.stopPropagation()">
                          @if (editingPriceVariantId() !== variant.id) {
                            <button
                              class="btn btn-square btn-xs btn-ghost"
                              (click)="decreaseVariantPrice(variant)"
                              aria-label="Decrease price by 3%"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="text-base font-bold text-tabular min-w-[4rem] text-center cursor-pointer hover:underline"
                              (click)="enterPriceEdit(variant)"
                              aria-label="Edit price"
                            >
                              {{ getVariantPrice(variant) }}
                            </button>
                            <button
                              class="btn btn-square btn-xs btn-ghost"
                              (click)="increaseVariantPrice(variant)"
                              aria-label="Increase price by 3%"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M5 15l7-7 7 7"
                                />
                              </svg>
                            </button>
                          } @else {
                            <input
                              type="text"
                              inputmode="decimal"
                              class="input input-xs input-bordered text-base font-bold text-tabular min-w-[4rem] text-center price-edit-input"
                              [value]="priceEditInputValue()"
                              (input)="priceEditInputValue.set($any($event.target).value)"
                              (blur)="commitPriceEdit(variant)"
                              (keydown.enter)="commitPriceEdit(variant)"
                              (keydown.escape)="cancelPriceEdit()"
                              aria-label="Price"
                            />
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              (click)="resetPriceEdit(variant)"
                              aria-label="Reset price to default"
                            >
                              Reset
                            </button>
                          }
                        </div>
                      } @else {
                        <div class="text-base font-bold text-tabular">
                          {{ currencyService.format(variant.priceWithTax) }}
                        </div>
                      }
                      <div
                        class="badge badge-sm"
                        [class.badge-success]="variant.stockLevel === 'IN_STOCK'"
                        [class.badge-error]="variant.stockLevel === 'OUT_OF_STOCK'"
                      >
                        @if (variant.stockLevel === 'IN_STOCK') {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3 w-3 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Available
                        } @else {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-3 w-3 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
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
                    @if (canOverridePrices() && product()!.variants[0].stockLevel === 'IN_STOCK') {
                      <!-- Price Controls -->
                      <div class="flex items-center gap-1">
                        @if (editingPriceVariantId() !== product()!.variants[0].id) {
                          <button
                            class="btn btn-square btn-xs btn-ghost"
                            (click)="decreaseSingleVariantPrice()"
                            aria-label="Decrease price by 3%"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            class="text-xl font-bold text-primary text-tabular min-w-[5rem] text-center cursor-pointer hover:underline"
                            (click)="enterPriceEdit(product()!.variants[0])"
                            aria-label="Edit price"
                          >
                            {{ getSingleVariantPrice() }}
                          </button>
                          <button
                            class="btn btn-square btn-xs btn-ghost"
                            (click)="increaseSingleVariantPrice()"
                            aria-label="Increase price by 3%"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              class="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          </button>
                        } @else {
                          <input
                            type="text"
                            inputmode="decimal"
                            class="input input-xs input-bordered text-xl font-bold text-primary text-tabular min-w-[5rem] text-center price-edit-input"
                            [value]="priceEditInputValue()"
                            (input)="priceEditInputValue.set($any($event.target).value)"
                            (blur)="commitPriceEdit(product()!.variants[0])"
                            (keydown.enter)="commitPriceEdit(product()!.variants[0])"
                            (keydown.escape)="cancelPriceEdit()"
                            aria-label="Price"
                          />
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            (click)="resetPriceEdit(product()!.variants[0])"
                            aria-label="Reset price to default"
                          >
                            Reset
                          </button>
                        }
                      </div>
                    } @else {
                      <div class="text-xl font-bold text-primary text-tabular">
                        {{ currencyService.format(product()!.variants[0].priceWithTax) }}
                      </div>
                    }
                    <div
                      class="badge badge-sm"
                      [class.badge-success]="product()!.variants[0].stockLevel === 'IN_STOCK'"
                      [class.badge-error]="product()!.variants[0].stockLevel === 'OUT_OF_STOCK'"
                    >
                      @if (product()!.variants[0].stockLevel === 'IN_STOCK') {
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3 w-3 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Available
                      } @else {
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3 w-3 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
                        </svg>
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Add to Cart Button -->
                <button
                  type="button"
                  class="btn btn-primary btn-block min-h-[3rem] hover:scale-105 active:scale-95 transition-transform"
                  (click)="handleSingleVariantAdd()"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  Add to Cart
                </button>
              } @else {
                <!-- Out of Stock Message -->
                <div class="alert alert-error">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
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
  private readonly injector = inject(Injector);
  readonly currencyService = inject(CurrencyService);
  readonly priceModificationService = inject(PriceModificationService);

  readonly isOpen = input.required<boolean>();
  readonly product = input.required<ProductSearchResult | null>();
  readonly canOverridePrices = input<boolean>(false);

  readonly variantSelected = output<{
    variant: ProductVariant;
    quantity: number;
    priceOverride?: PriceOverrideData;
    facetValues?: { name: string; facetCode?: string; facet?: { code: string } }[];
  }>();
  readonly closeModal = output<void>();

  /** Bumped after each price change so template re-reads from service */
  private readonly priceVersion = signal(0);

  /** Quantity for single-variant add (bound to input, reset when product changes) */
  readonly quantity = signal(1);

  /** Variant id when price is in direct-edit mode; null otherwise */
  readonly editingPriceVariantId = signal<string | null>(null);
  /** Current input value while editing price (numeric string, currency units) */
  readonly priceEditInputValue = signal('');

  constructor() {
    effect(() => {
      const prod = this.product();
      if (prod) {
        prod.variants.forEach((v) => this.priceModificationService.clearStacks(v.id));
        this.quantity.set(1);
      }
      this.priceVersion.update((v) => v + 1);
    });
  }

  getVariantPrice(variant: ProductVariant): string {
    this.priceVersion();
    const base = Math.round(variant.priceWithTax);
    const current = this.priceModificationService.getCurrentPrice(variant.id, 'unit', base);
    return this.currencyService.format(current, false);
  }

  getSingleVariantPrice(): string {
    const variant = this.product()?.variants[0];
    if (!variant) return '';
    return this.getVariantPrice(variant);
  }

  increaseVariantPrice(variant: ProductVariant): void {
    const base = Math.round(variant.priceWithTax);
    const currentPrice = this.priceModificationService.getCurrentPrice(variant.id, 'unit', base);
    const result = this.priceModificationService.increasePrice(variant.id, currentPrice, 'unit');
    if (!result) return;
    this.priceVersion.update((v) => v + 1);
  }

  decreaseVariantPrice(variant: ProductVariant): void {
    const base = Math.round(variant.priceWithTax);
    const currentPrice = this.priceModificationService.getCurrentPrice(variant.id, 'unit', base);
    const wholesalePrice = variant.customFields?.wholesalePrice ?? 0;
    const result = this.priceModificationService.decreasePrice(
      variant.id,
      currentPrice,
      1,
      wholesalePrice,
      'unit',
    );
    if (!result) return;
    this.priceVersion.update((v) => v + 1);
  }

  increaseSingleVariantPrice(): void {
    const variant = this.product()?.variants[0];
    if (variant) {
      this.increaseVariantPrice(variant);
    }
  }

  decreaseSingleVariantPrice(): void {
    const variant = this.product()?.variants[0];
    if (variant) {
      this.decreaseVariantPrice(variant);
    }
  }

  enterPriceEdit(variant: ProductVariant): void {
    this.editingPriceVariantId.set(variant.id);
    this.priceEditInputValue.set(this.getVariantPrice(variant));
    afterNextRender(() => document.querySelector<HTMLInputElement>('.price-edit-input')?.focus(), {
      injector: this.injector,
    });
  }

  commitPriceEdit(variant: ProductVariant): void {
    const raw = this.priceEditInputValue().trim();
    const units = parseFloat(raw);
    if (Number.isNaN(units) || units < 0) {
      this.editingPriceVariantId.set(null);
      return;
    }
    const base = Math.round(variant.priceWithTax);
    const parsedCents = Math.round(units * 100);
    this.priceModificationService.setCustomPrice(variant.id, 'unit', base, parsedCents);
    this.editingPriceVariantId.set(null);
    this.priceVersion.update((v) => v + 1);
  }

  resetPriceEdit(variant: ProductVariant): void {
    this.priceModificationService.clearStacks(variant.id);
    this.editingPriceVariantId.set(null);
    this.priceVersion.update((v) => v + 1);
  }

  cancelPriceEdit(): void {
    this.editingPriceVariantId.set(null);
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
    const basePrice = Math.round(variant.priceWithTax);
    const currentPrice = this.priceModificationService.getCurrentPrice(
      variant.id,
      'unit',
      basePrice,
    );
    const priceOverride: PriceOverrideData | undefined =
      currentPrice !== basePrice
        ? { variantId: variant.id, customLinePrice: currentPrice, reason: 'Price adjusted' }
        : undefined;
    const facetValues = this.product()?.facetValues?.map((fv) => ({
      name: fv.name,
      facetCode: fv.facetCode,
      facet: fv.facetCode ? { code: fv.facetCode } : undefined,
    }));
    this.variantSelected.emit({ variant, quantity: 1, priceOverride, facetValues });
  }

  handleSingleVariantAdd(): void {
    const variant = this.product()?.variants[0];
    if (!variant) return;
    const qty = this.quantity();
    const basePrice = Math.round(variant.priceWithTax);
    const currentPrice = this.priceModificationService.getCurrentPrice(
      variant.id,
      'unit',
      basePrice,
    );
    const priceOverride: PriceOverrideData | undefined =
      currentPrice !== basePrice
        ? { variantId: variant.id, customLinePrice: currentPrice, reason: 'Price adjusted' }
        : undefined;
    const facetValues = this.product()?.facetValues?.map((fv) => ({
      name: fv.name,
      facetCode: fv.facetCode,
      facet: fv.facetCode ? { code: fv.facetCode } : undefined,
    }));
    this.variantSelected.emit({ variant, quantity: qty, priceOverride, facetValues });
  }
}
