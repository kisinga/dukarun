import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ProductVariant } from '../../../../core/services/product/product-search.service';
import { StockAdjustmentLineItem } from '../../../../core/services/stock-adjustment.service.types';

/**
 * Extended line item with current stock and new stock for display
 */
export interface StockAdjustmentLineItemDisplay extends StockAdjustmentLineItem {
  currentStock?: number;
  newStock?: number;
  variant?: ProductVariant;
}

/**
 * Stock Adjustment Line Items Table Component
 *
 * Displays line items in an expansion-panel layout (like accounting transactions):
 * summary row (product, difference, expand), expanded row (current stock, new stock,
 * difference, edit new stock, remove). Location is implicit from active company.
 */
@Component({
  selector: 'app-stock-adjustment-line-items-table',
  imports: [CommonModule],
  template: `
    @if (lineItems().length > 0) {
      <div class="card bg-base-100 shadow">
        <div class="card-body p-0">
          <div class="flex justify-end gap-2 px-4 pt-3">
            <button class="btn btn-sm btn-ghost" (click)="expandAll()">Expand All</button>
            <button class="btn btn-sm btn-ghost" (click)="collapseAll()">Collapse All</button>
          </div>
          <div class="overflow-x-auto">
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th class="w-12"></th>
                  <th>Product</th>
                  <th class="text-right">Difference</th>
                  <th class="w-12"></th>
                </tr>
              </thead>
              <tbody>
                @for (line of lineItems(); track $index) {
                  <tr>
                    <td>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs"
                        (click)="toggleExpanded($index); $event.stopPropagation()"
                        [attr.aria-expanded]="isExpanded($index)"
                        aria-label="Toggle details"
                      >
                        @if (isExpanded($index)) {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
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
                        } @else {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
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
                        }
                      </button>
                    </td>
                    <td>
                      <div class="font-medium">{{ getProductName(line) }}</div>
                    </td>
                    <td class="text-right">
                      <span
                        class="text-tabular font-semibold"
                        [class.text-success]="getDifference(line) > 0"
                        [class.text-error]="getDifference(line) < 0"
                        [class.text-base-content]="getDifference(line) === 0"
                      >
                        {{ formatDifference(getDifference(line)) }}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-xs btn-error"
                        (click)="onLineItemRemove($index)"
                        aria-label="Remove item"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  @if (isExpanded($index)) {
                    <tr>
                      <td colspan="4" class="bg-base-200 p-0">
                        <div class="p-4">
                          <h4 class="font-semibold mb-2 text-sm">Details</h4>
                          <div class="flex flex-wrap items-center gap-6">
                            <div>
                              <span class="text-xs text-base-content/60 block">Current stock</span>
                              <span class="text-lg font-semibold text-tabular">{{
                                getCurrentStock(line)
                              }}</span>
                            </div>
                            <div>
                              <span class="label-text text-xs font-semibold block mb-1"
                                >New stock</span
                              >
                              <input
                                type="number"
                                class="input input-bordered input-sm w-28 text-right text-tabular"
                                step="0.01"
                                min="0"
                                [value]="getNewStock(line)"
                                (change)="
                                  onNewStockUpdate(
                                    $index,
                                    parseFloat($any($event.target).value) || 0
                                  )
                                "
                              />
                            </div>
                            <div>
                              <span class="text-xs text-base-content/60 block">Difference</span>
                              <span
                                class="text-lg font-semibold text-tabular"
                                [class.text-success]="getDifference(line) > 0"
                                [class.text-error]="getDifference(line) < 0"
                                [class.text-base-content]="getDifference(line) === 0"
                              >
                                {{ formatDifference(getDifference(line)) }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
              <tfoot>
                <tr>
                  <th></th>
                  <th>Total changes</th>
                  <th class="text-right text-tabular font-semibold">
                    {{ formatTotalChanges() }}
                  </th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    } @else {
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <div class="text-center py-12 text-base-content/60">
            <div
              class="w-14 h-14 mx-auto mb-3 rounded-full bg-base-200 flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-7 w-7 text-base-content/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M20 7l-8 8-8-8m0 0l8-8 8 8m-8 8V3"
                />
              </svg>
            </div>
            <p class="font-semibold">No items added yet</p>
            <p class="text-sm mt-2">Add items above to get started</p>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAdjustmentLineItemsTableComponent {
  readonly lineItems = input.required<StockAdjustmentLineItemDisplay[]>();

  readonly lineItemUpdate = output<{
    index: number;
    field: keyof StockAdjustmentLineItem;
    value: any;
  }>();
  readonly lineItemRemove = output<number>();

  /** Keyed by row index; true = expanded. New object on each toggle so change detection runs. */
  readonly expandedIndices = signal<Record<number, boolean>>({});

  readonly totalChanges = computed(() =>
    this.lineItems().reduce((sum, line) => sum + this.getDifference(line), 0),
  );

  isExpanded(index: number): boolean {
    return !!this.expandedIndices()[index];
  }

  toggleExpanded(index: number): void {
    this.expandedIndices.update((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  expandAll(): void {
    const keys = this.lineItems().reduce<Record<number, boolean>>((acc, _, i) => {
      acc[i] = true;
      return acc;
    }, {});
    this.expandedIndices.set(keys);
  }

  collapseAll(): void {
    this.expandedIndices.set({});
  }

  /** Product name · Variant name (SKU) for display */
  getProductName(line: StockAdjustmentLineItemDisplay): string {
    const v = line.variant;
    if (!v) return line.variantId || 'Unknown';
    const productName = (v as { productName?: string }).productName?.trim();
    const variantName = v.name?.trim();
    const sku = v.sku?.trim();
    const parts: string[] = [];
    if (productName) parts.push(productName);
    if (variantName && variantName !== productName) parts.push(variantName);
    const main = parts.length
      ? parts.join(' · ')
      : variantName || sku || line.variantId || 'Unknown';
    return sku ? `${main} (${sku})` : main;
  }

  getCurrentStock(line: StockAdjustmentLineItemDisplay): number {
    if (line.currentStock !== undefined && line.currentStock !== null) return line.currentStock;
    return 0;
  }

  getNewStock(line: StockAdjustmentLineItemDisplay): number {
    if (line.newStock !== undefined && line.newStock !== null) return line.newStock;
    return this.getCurrentStock(line) + (line.quantityChange || 0);
  }

  getDifference(line: StockAdjustmentLineItemDisplay): number {
    return this.getNewStock(line) - this.getCurrentStock(line);
  }

  onNewStockUpdate(index: number, value: number): void {
    const line = this.lineItems()[index];
    const quantityChange = value - this.getCurrentStock(line);
    this.lineItemUpdate.emit({ index, field: 'quantityChange', value: quantityChange });
  }

  onLineItemRemove(index: number): void {
    this.lineItemRemove.emit(index);
  }

  formatDifference(diff: number): string {
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return String(diff);
    return '0';
  }

  formatTotalChanges(): string {
    return this.formatDifference(this.totalChanges());
  }

  parseFloat(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }
}
