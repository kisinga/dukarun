import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ProductSearchResult,
  ProductVariant,
} from '../../../../core/services/product/product-search.service';
import { ProductLabelComponent } from '../../shared/components/product-label.component';

/** Modal: variant selection + qty/cost entry for adding a purchase line. */
@Component({
  selector: 'app-purchase-item-entry-modal',
  imports: [CommonModule, ReactiveFormsModule, ProductLabelComponent],
  template: `
    @if (isOpen() && product(); as p) {
      <div class="modal modal-open modal-bottom sm:modal-middle">
        <div class="modal-box max-w-xl p-0 max-h-[90vh] flex flex-col">
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
            <div class="flex gap-3">
              @if (p.featuredAsset) {
                <img
                  [src]="p.featuredAsset.preview"
                  [alt]="p.name"
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
                <app-product-label [productName]="p.name" [facetValues]="p.facetValues ?? []" />
                <p class="text-xs text-base-content/70 mt-0.5">
                  {{ p.variants.length }} variant{{ p.variants.length > 1 ? 's' : '' }}
                </p>
              </div>
            </div>

            @if (!selectedVariant() && p.variants.length > 1) {
              <div class="space-y-1">
                <p class="text-xs font-medium text-base-content/70 px-1">Select variant:</p>
                @for (v of p.variants; track v.id) {
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

            @if (selectedVariant(); as sv) {
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
                    @if (p.variants.length > 1) {
                      <button class="btn btn-ghost btn-xs" (click)="selectedVariant.set(null)">
                        Change
                      </button>
                    }
                  </div>
                </div>

                <div class="flex flex-wrap gap-3 mt-2 pt-2 border-t border-base-300">
                  @if ((sv.customFields?.wholesalePrice ?? 0) > 0) {
                    <div class="text-xs">
                      <span class="opacity-60">Wholesale:</span>
                      <span class="font-medium ml-1">{{
                        formatCurrency((sv.customFields?.wholesalePrice ?? 0) / 100)
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

              <p class="text-xs text-base-content/50 mb-1">
                Editing unit cost or line total updates the other based on qty.
              </p>
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
                      (input)="onQuantityInput($any($event.target).value)"
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
                  <label class="text-xs font-medium text-base-content/70">Unit cost (KES)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-sm input-bordered text-right text-tabular w-28"
                    [formControl]="unitCostControl"
                    placeholder="0.00"
                  />
                </div>
                <div class="flex flex-col gap-1 min-w-0 flex-1 sm:flex-initial">
                  <label class="text-xs font-medium text-base-content/70">Line total (KES)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    class="input input-sm input-bordered text-right text-tabular w-28"
                    [formControl]="lineTotalControl"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div
                class="flex flex-wrap items-end gap-3 rounded-lg bg-base-100 p-3 border border-base-300"
              >
                <div class="flex flex-col gap-1 min-w-0 flex-1">
                  <label class="text-xs font-medium text-base-content/70" for="batch-number">
                    Batch / lot number
                  </label>
                  <input
                    id="batch-number"
                    type="text"
                    [value]="batchNumber()"
                    placeholder="Optional (auto-generated on save if blank)"
                    class="input input-sm input-bordered w-full"
                    (input)="batchNumber.set($any($event.target).value)"
                  />
                </div>
                <div class="flex flex-col gap-1 min-w-0 flex-1">
                  <label class="text-xs font-medium text-base-content/70" for="expiry-date">
                    Expiry / use-by date
                  </label>
                  <input
                    id="expiry-date"
                    type="date"
                    [value]="expiryDate()"
                    class="input input-sm input-bordered w-full"
                    (input)="expiryDate.set($any($event.target).value)"
                  />
                </div>
              </div>

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
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isOpen = input.required<boolean>();
  readonly product = input.required<ProductSearchResult | null>();
  readonly variant = input<ProductVariant | null>(null);

  readonly itemAdded = output<{
    variant: ProductVariant;
    quantity: number;
    unitCost: number;
    batchNumber?: string | null;
    expiryDate?: string | null;
  }>();
  readonly closeModal = output<void>();

  readonly selectedVariant = signal<ProductVariant | null>(null);
  readonly quantity = signal<number>(1);
  readonly batchNumber = signal<string>('');
  readonly expiryDate = signal<string>('');

  readonly unitCostControl = this.fb.control<string>('0.00', [Validators.required]);
  readonly lineTotalControl = this.fb.control<string>('0.00', [Validators.required]);

  constructor() {
    effect(() => {
      const v = this.variant();
      const prod = this.product();
      if (v) this.resetFormForVariant(v);
      else if (prod) this.resetFormForVariant(null);
    });

    this.unitCostControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const qty = this.quantity();
      if (qty <= 0) return;
      const unit = this.parseDecimal(this.unitCostControl.value);
      if (unit === null) return;
      this.lineTotalControl.setValue((Math.round(unit * qty * 100) / 100).toFixed(2), {
        emitEvent: false,
      });
    });

    this.lineTotalControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const qty = this.quantity();
      if (qty <= 0) return;
      const total = this.parseDecimal(this.lineTotalControl.value);
      if (total === null || total < 0) return;
      this.unitCostControl.setValue((Math.round((total / qty) * 100) / 100).toFixed(2), {
        emitEvent: false,
      });
    });
  }

  selectVariant(variant: ProductVariant): void {
    this.resetFormForVariant(variant);
  }

  private resetFormForVariant(variant: ProductVariant | null): void {
    this.selectedVariant.set(variant);
    this.quantity.set(1);
    this.batchNumber.set('');
    this.expiryDate.set('');
    const unit =
      variant?.customFields?.wholesalePrice != null ? variant.customFields.wholesalePrice / 100 : 0;
    const s = unit.toFixed(2);
    this.unitCostControl.setValue(s);
    this.lineTotalControl.setValue(s, { emitEvent: false });
  }

  onQuantityInput(value: string | number): void {
    const qty = parseFloat(String(value)) || 1;
    const min = this.allowFractional() ? 0.01 : 1;
    this.quantity.set(Math.max(min, qty));
    this.syncLineTotalFromUnitAndQty();
  }

  private parseDecimal(value: string | null | undefined): number | null {
    const raw = value?.toString().trim();
    if (raw === '' || raw == null) return null;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? null : n;
  }

  allowFractional(): boolean {
    return this.selectedVariant()?.customFields?.allowFractionalQuantity ?? false;
  }

  incrementQty(): void {
    const step = this.allowFractional() ? 0.5 : 1;
    this.quantity.update((q) => q + step);
    this.syncLineTotalFromUnitAndQty();
  }

  decrementQty(): void {
    const step = this.allowFractional() ? 0.5 : 1;
    const min = this.allowFractional() ? 0.5 : 1;
    this.quantity.update((q) => Math.max(min, q - step));
    this.syncLineTotalFromUnitAndQty();
  }

  private syncLineTotalFromUnitAndQty(): void {
    const qty = this.quantity();
    if (qty <= 0) return;
    const unit = this.parseDecimal(this.unitCostControl.value);
    if (unit === null) return;
    this.lineTotalControl.setValue((Math.round(unit * qty * 100) / 100).toFixed(2), {
      emitEvent: false,
    });
  }

  canAdd(): boolean {
    const unit = this.parseDecimal(this.unitCostControl.value);
    return !!this.selectedVariant() && this.quantity() > 0 && unit !== null && unit > 0;
  }

  handleAdd(): void {
    const sv = this.selectedVariant();
    if (!sv) return;
    const unit = this.parseDecimal(this.unitCostControl.value);
    if (unit === null || unit <= 0) return;
    // Blank batch → backend autogenerates (B-YYYYMMDD-{variantId}-suffix).
    const bnRaw = this.batchNumber().trim();
    const ed = this.expiryDate().trim() || null;
    this.itemAdded.emit({
      variant: sv,
      quantity: this.quantity(),
      unitCost: unit,
      batchNumber: bnRaw || undefined,
      expiryDate: ed ?? undefined,
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
