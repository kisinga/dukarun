import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { ProductLabelComponent } from '../../shared/components/product-label.component';

/**
 * Combined modal for variant selection + quantity/cost entry when adding a purchase line item.
 *
 * Two-phase flow in a single modal:
 * - Phase A: Variant selection (multi-variant products only)
 * - Phase B: Qty/cost entry form with product context
 */
@Component({
  selector: 'app-purchase-item-entry-modal',
  imports: [CommonModule, ProductLabelComponent],
  template: `
    @if (isOpen() && product()) {
      <div class="modal modal-open modal-bottom sm:modal-middle animate-in">
        <div class="modal-box max-w-xl p-0 max-h-[90vh] flex flex-col">
          <!-- Header -->
          <div class="bg-primary/10 p-3 border-b border-base-300 flex-shrink-0">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-base">Add Purchase Item</h3>
              <button
                class="btn btn-ghost btn-sm btn-circle"
                (click)="closeModal.emit()"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div class="p-3 space-y-3 flex-1 overflow-y-auto">
            <!-- Product Info -->
            <div class="flex gap-3">
              @if (product()!.featuredAsset) {
                <img
                  [src]="product()!.featuredAsset!.preview"
                  [alt]="product()!.name"
                  class="w-14 h-14 rounded-lg object-cover shrink-0"
                />
              } @else {
                <div
                  class="w-14 h-14 rounded-lg bg-base-300 flex items-center justify-center shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
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

            <!-- Phase A: Variant Selection (multi-variant, no selection yet) -->
            @if (!selectedVariant() && product()!.variants.length > 1) {
              <div class="space-y-1">
                <p class="text-xs font-medium text-base-content/70 px-1">Select variant:</p>
                @for (v of product()!.variants; track v.id) {
                  <button
                    type="button"
                    class="w-full flex items-center justify-between gap-2 p-3 rounded-lg bg-base-200 hover:bg-base-300 active:scale-[0.98] transition-all cursor-pointer"
                    (click)="selectVariant(v)"
                  >
                    <div class="text-left min-w-0 flex-1">
                      <div class="font-semibold text-sm truncate">{{ v.name }}</div>
                      <div class="text-xs text-base-content/70">{{ v.sku }}</div>
                    </div>
                    <div class="text-right flex items-center gap-2">
                      <div class="text-sm font-bold text-tabular">
                        {{ formatCurrency(v.priceWithTax / 100) }}
                      </div>
                      <div
                        class="badge badge-sm"
                        [class.badge-success]="v.stockLevel === 'IN_STOCK'"
                        [class.badge-warning]="v.stockLevel === 'OUT_OF_STOCK'"
                      >
                        @if (v.stockOnHand != null) {
                          {{ v.stockOnHand }} in stock
                        } @else if (v.stockLevel === 'IN_STOCK') {
                          In Stock
                        } @else {
                          Out of Stock
                        }
                      </div>
                    </div>
                  </button>
                }
              </div>
            }

            <!-- Phase B: Entry Form (variant selected) -->
            @if (selectedVariant(); as sv) {
              <!-- Selected variant info -->
              <div class="rounded-lg bg-base-200 p-3">
                <div class="flex justify-between items-center">
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold text-sm">{{ sv.name }}</div>
                    <div class="text-xs text-base-content/70">{{ sv.sku }}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <div
                      class="badge badge-sm"
                      [class.badge-success]="sv.stockLevel === 'IN_STOCK'"
                      [class.badge-warning]="sv.stockLevel === 'OUT_OF_STOCK'"
                    >
                      @if (sv.stockOnHand != null) {
                        {{ sv.stockOnHand }} in stock
                      } @else if (sv.stockLevel === 'IN_STOCK') {
                        In Stock
                      } @else {
                        Out of Stock
                      }
                    </div>
                    @if (product()!.variants.length > 1) {
                      <button class="btn btn-ghost btn-xs" (click)="selectedVariant.set(null)">
                        Change
                      </button>
                    }
                  </div>
                </div>

                <!-- Reference prices -->
                <div class="flex flex-wrap gap-3 mt-2 pt-2 border-t border-base-300">
                  @if (
                    sv.customFields?.wholesalePrice != null && sv.customFields!.wholesalePrice! > 0
                  ) {
                    <div class="text-xs">
                      <span class="opacity-60">Wholesale:</span>
                      <span class="font-medium ml-1">{{
                        formatCurrency(sv.customFields!.wholesalePrice! / 100)
                      }}</span>
                    </div>
                  }
                  @if (sv.priceWithTax > 0) {
                    <div class="text-xs">
                      <span class="opacity-60">Retail:</span>
                      <span class="font-medium ml-1">{{
                        formatCurrency(sv.priceWithTax / 100)
                      }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Qty, Unit cost, Total — one row -->
              <div
                class="flex flex-wrap items-end gap-3 rounded-lg bg-base-100 p-3 border border-base-300"
              >
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="text-xs font-medium text-base-content/70">Qty</span>
                  <div class="flex items-center gap-1">
                    <button
                      class="btn btn-sm btn-circle btn-ghost"
                      (click)="decrementQty()"
                      [disabled]="quantity() <= (allowFractional() ? 0.5 : 1)"
                      type="button"
                      aria-label="Decrease quantity"
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
                      [min]="allowFractional() ? 0.01 : 1"
                      [step]="allowFractional() ? '0.5' : '1'"
                      class="input input-sm input-bordered text-center text-tabular w-20"
                      (input)="quantity.set(parseNum($any($event.target).value) || 1)"
                    />
                    <button
                      class="btn btn-sm btn-circle btn-ghost"
                      (click)="incrementQty()"
                      type="button"
                      aria-label="Increase quantity"
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
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="text-xs font-medium text-base-content/70">Unit cost (KES)</span>
                  <input
                    type="number"
                    [value]="unitCost()"
                    min="0"
                    step="0.01"
                    class="input input-sm input-bordered text-right text-tabular w-28"
                    (input)="unitCost.set(parseNum($any($event.target).value) || 0)"
                  />
                </div>
                <div class="flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial">
                  <span class="text-xs font-medium text-base-content/70">Total</span>
                  <span class="text-lg font-bold text-tabular">{{
                    formatCurrency(lineTotal())
                  }}</span>
                </div>
              </div>

              <!-- Add Button -->
              <button
                class="btn btn-primary btn-block min-h-[3rem] hover:scale-[1.02] active:scale-95 transition-transform"
                [disabled]="!canAdd()"
                (click)="handleAdd()"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add to Purchase
              </button>
            }
          </div>
        </div>
        <div class="modal-backdrop" (click)="closeModal.emit()"></div>
      </div>
    }
  `,
  styles: `
    .animate-in {
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

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
export class PurchaseItemEntryModalComponent {
  readonly isOpen = input.required<boolean>();
  readonly product = input.required<ProductSearchResult | null>();
  readonly variant = input<ProductVariant | null>(null);

  readonly itemAdded = output<{
    variant: ProductVariant;
    quantity: number;
    unitCost: number;
  }>();
  readonly closeModal = output<void>();

  readonly selectedVariant = signal<ProductVariant | null>(null);
  readonly quantity = signal<number>(1);
  readonly unitCost = signal<number>(0);
  readonly lineTotal = computed(() => this.quantity() * this.unitCost());

  constructor() {
    // React to input changes: pre-select variant for single-variant products
    effect(() => {
      const v = this.variant();
      const p = this.product();
      if (v) {
        this.selectedVariant.set(v);
        this.unitCost.set(
          v.customFields?.wholesalePrice != null ? v.customFields.wholesalePrice / 100 : 0,
        );
        this.quantity.set(1);
      } else if (p) {
        this.selectedVariant.set(null);
        this.quantity.set(1);
        this.unitCost.set(0);
      }
    });
  }

  selectVariant(variant: ProductVariant): void {
    this.selectedVariant.set(variant);
    this.unitCost.set(
      variant.customFields?.wholesalePrice != null ? variant.customFields.wholesalePrice / 100 : 0,
    );
    this.quantity.set(1);
  }

  allowFractional(): boolean {
    return this.selectedVariant()?.customFields?.allowFractionalQuantity ?? false;
  }

  incrementQty(): void {
    const step = this.allowFractional() ? 0.5 : 1;
    this.quantity.update((q) => q + step);
  }

  decrementQty(): void {
    const step = this.allowFractional() ? 0.5 : 1;
    const min = this.allowFractional() ? 0.5 : 1;
    this.quantity.update((q) => Math.max(min, q - step));
  }

  canAdd(): boolean {
    return !!this.selectedVariant() && this.quantity() > 0 && this.unitCost() > 0;
  }

  handleAdd(): void {
    const sv = this.selectedVariant();
    if (!sv) return;
    this.itemAdded.emit({
      variant: sv,
      quantity: this.quantity(),
      unitCost: this.unitCost(),
    });
  }

  parseNum(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
