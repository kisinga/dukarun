import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PurchaseLineItem } from '../../../../core/services/purchase.service.types';

/**
 * Purchase Line Items Table Component
 *
 * Displays line items with inline editing, pricing comparison,
 * and profit margin indicators.
 */
@Component({
  selector: 'app-purchase-line-items-table',
  imports: [CommonModule],
  template: `
    @if (lineItems().length > 0) {
      <!-- Mobile card layout -->
      <div class="space-y-2">
        @for (line of lineItems(); track $index) {
          <div class="card bg-base-200 p-3">
            <div class="flex items-start justify-between gap-2">
              <div class="flex gap-2 flex-1 min-w-0">
                @if (line.variant?.featuredAsset) {
                  <img
                    [src]="line.variant!.featuredAsset!.preview"
                    [alt]="getVariantDisplayName(line.variant)"
                    class="w-10 h-10 rounded object-cover shrink-0"
                  />
                } @else {
                  <div
                    class="w-10 h-10 rounded bg-base-300 flex items-center justify-center shrink-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5 text-primary"
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
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate">
                    {{ getVariantDisplayName(line.variant) || line.variantId }}
                  </div>
                  @if (line.variant?.sku) {
                    <div class="text-xs text-base-content/50">{{ line.variant!.sku }}</div>
                  }
                </div>
              </div>
              <button
                type="button"
                class="btn btn-ghost btn-xs text-error"
                (click)="onLineItemRemove($index)"
                aria-label="Remove item"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>

            <!-- Qty + Cost row -->
            <div class="flex items-center gap-2 mt-2">
              <div class="w-20">
                <label class="text-xs opacity-60">Qty</label>
                <input
                  type="number"
                  class="input input-bordered input-xs w-full"
                  step="0.01"
                  min="0.01"
                  [value]="line.quantity"
                  (change)="
                    onLineItemUpdate($index, 'quantity', parseFloat($any($event.target).value))
                  "
                />
              </div>
              <div class="w-24">
                <label class="text-xs opacity-60">Unit Cost</label>
                <input
                  type="number"
                  class="input input-bordered input-xs w-full"
                  step="0.01"
                  min="0"
                  [value]="line.unitCost"
                  (change)="
                    onLineItemUpdate($index, 'unitCost', parseFloat($any($event.target).value))
                  "
                />
              </div>
              <div class="flex-1 text-right">
                <label class="text-xs opacity-60">Line Total</label>
                <div class="text-sm font-semibold">
                  {{ formatCurrency(line.quantity * line.unitCost) }}
                </div>
              </div>
            </div>

            <!-- Optional: Batch number & Expiry date -->
            <div class="flex flex-wrap items-end gap-2 mt-2 pt-2 border-t border-base-300">
              <div class="flex flex-col gap-0.5 min-w-0 flex-1 max-w-[140px]">
                <label class="text-xs opacity-60">Batch / lot</label>
                <input
                  type="text"
                  class="input input-bordered input-xs w-full"
                  [value]="line.batchNumber ?? ''"
                  placeholder="Optional"
                  (change)="
                    onLineItemUpdate($index, 'batchNumber', $any($event.target).value || null)
                  "
                />
              </div>
              <div class="flex flex-col gap-0.5 min-w-0 flex-1 max-w-[120px]">
                <label class="text-xs opacity-60">Expiry date</label>
                <input
                  type="date"
                  class="input input-bordered input-xs w-full"
                  [value]="line.expiryDate ?? ''"
                  (change)="
                    onLineItemUpdate($index, 'expiryDate', $any($event.target).value || null)
                  "
                />
              </div>
            </div>

            <!-- Pricing comparison -->
            @if (line.variant && line.unitCost > 0) {
              <div class="flex flex-wrap gap-2 mt-2 pt-2 border-t border-base-300">
                @if (getWholesalePrice(line); as wp) {
                  <div class="flex items-center gap-1">
                    <span class="text-xs opacity-60">Wholesale:</span>
                    <span class="text-xs">{{ formatCurrency(wp) }}</span>
                    <span
                      class="badge badge-xs"
                      [class.badge-success]="getMargin(line.unitCost, wp) > 0"
                      [class.badge-error]="getMargin(line.unitCost, wp) < 0"
                      [class.badge-ghost]="getMargin(line.unitCost, wp) === 0"
                    >
                      {{ formatMargin(getMargin(line.unitCost, wp)) }}
                    </span>
                  </div>
                }
                @if (getRetailPrice(line); as rp) {
                  <div class="flex items-center gap-1">
                    <span class="text-xs opacity-60">Retail:</span>
                    <span class="text-xs">{{ formatCurrency(rp) }}</span>
                    <span
                      class="badge badge-xs"
                      [class.badge-success]="getMargin(line.unitCost, rp) > 0"
                      [class.badge-error]="getMargin(line.unitCost, rp) < 0"
                      [class.badge-ghost]="getMargin(line.unitCost, rp) === 0"
                    >
                      {{ formatMargin(getMargin(line.unitCost, rp)) }}
                    </span>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    } @else {
      <div class="text-center py-6 text-base-content/50">
        <p class="text-sm">No items added yet. Search for a product above.</p>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLineItemsTableComponent {
  readonly lineItems = input.required<PurchaseLineItem[]>();

  readonly lineItemUpdate = output<{ index: number; field: keyof PurchaseLineItem; value: any }>();
  readonly lineItemRemove = output<number>();

  onLineItemUpdate(index: number, field: keyof PurchaseLineItem, value: any): void {
    this.lineItemUpdate.emit({ index, field, value });
  }

  onLineItemRemove(index: number): void {
    this.lineItemRemove.emit(index);
  }

  /**
   * Get wholesale price in base currency (convert from cents).
   * Returns null if not available.
   */
  getWholesalePrice(line: PurchaseLineItem): number | null {
    const wp = line.variant?.customFields?.wholesalePrice;
    if (wp == null || wp <= 0) return null;
    return wp / 100;
  }

  /**
   * Get retail price in base currency (convert from cents).
   * Returns null if not available.
   */
  getRetailPrice(line: PurchaseLineItem): number | null {
    const rp = line.variant?.priceWithTax;
    if (rp == null || rp <= 0) return null;
    return rp / 100;
  }

  getVariantDisplayName(v: { name?: string; productName?: string } | null | undefined): string {
    if (!v) return '';
    const productName = v.productName?.trim();
    const variantName = v.name?.trim();
    if (productName && variantName && variantName !== productName) {
      return `${productName} – ${variantName}`;
    }
    return productName || variantName || '';
  }

  /**
   * Calculate profit margin percentage: (sellingPrice - costPrice) / costPrice * 100
   */
  getMargin(unitCost: number, sellingPrice: number): number {
    if (unitCost <= 0) return 0;
    return ((sellingPrice - unitCost) / unitCost) * 100;
  }

  formatMargin(margin: number): string {
    const sign = margin > 0 ? '+' : '';
    return `${sign}${margin.toFixed(1)}%`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  parseFloat(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }
}
