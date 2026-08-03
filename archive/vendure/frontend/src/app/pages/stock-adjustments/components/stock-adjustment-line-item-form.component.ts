import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ProductVariant } from '@dukarun/product';

/**
 * Stock Adjustment Line Item Form Component
 *
 * Add-item form for an already-selected variant: one line showing current stock,
 * new stock input, difference. Location is implicit from active company (global state).
 * Product search is handled by the parent via ProductSearchViewComponent.
 */
@Component({
  selector: 'app-stock-adjustment-line-item-form',
  imports: [CommonModule, NgIcon],
  template: `
    <div class="card bg-base-200 shadow">
      <div class="card-body p-4">
        <h3 class="font-semibold text-base mb-2">Add Item</h3>
        @if (lineItem().variant; as variant) {
          <p class="text-sm text-base-content/70 mb-3">
            {{ getVariantDisplayLabel(variant) }}
          </p>
        }

        <!-- One line: Current stock | New stock | Difference | Add -->
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[6rem]">
            <span class="label-text text-xs text-base-content/60 block mb-1">Current</span>
            <span class="text-lg font-semibold text-tabular">{{ currentStock() ?? '–' }}</span>
          </div>
          <div class="flex-1 min-w-[8rem] max-w-[10rem]">
            <label class="label py-0">
              <span class="label-text text-xs font-semibold">New stock *</span>
            </label>
            <input
              type="number"
              class="input input-bordered w-full input-sm"
              placeholder="Counted"
              step="0.01"
              min="0"
              [value]="lineItem().newStock ?? ''"
              (input)="onNewStockChange(parseFloat($any($event.target).value) || 0)"
            />
          </div>
          <div class="flex-1 min-w-[7rem] max-w-[9rem]">
            <label class="label py-0">
              <span class="label-text text-xs font-semibold">
                Unit cost {{ unitCostRequired() ? '*' : '(optional)' }}
              </span>
            </label>
            <input
              type="number"
              class="input input-bordered w-full input-sm"
              placeholder="0.00"
              step="0.01"
              min="0"
              [value]="unitCostDisplay()"
              (input)="onUnitCostChange($any($event.target).value)"
            />
          </div>
          <div class="min-w-[5rem]">
            <span class="label-text text-xs text-base-content/60 block mb-1">Difference</span>
            <span
              class="text-lg font-semibold text-tabular"
              [class.text-success]="difference() > 0"
              [class.text-error]="difference() < 0"
              [class.text-base-content]="difference() === 0"
            >
              {{ formatDifference(difference()) }}
            </span>
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm gap-1"
            [disabled]="!canAddItem()"
            (click)="onAddItem()"
          >
            <ng-icon name="heroPlus" size="1rem" />
            Add
          </button>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockAdjustmentLineItemFormComponent {
  readonly lineItem = input.required<{
    variantId?: string;
    variant?: ProductVariant;
    stockLocationId?: string;
    newStock?: number;
    currentStock?: number;
    /** Unit cost in cents (optional; backend requires it when the variant has no stock) */
    unitCost?: number;
  }>();

  readonly newStockChange = output<number>();
  readonly unitCostChange = output<number | undefined>();
  readonly addItem = output<void>();

  readonly currentStock = computed(() => this.lineItem().currentStock ?? null);

  /** Cost is required in the UI when the variant has no stock (backend enforces the real rule). */
  readonly unitCostRequired = computed(() => this.currentStock() === 0);

  /** Display value in major currency units; internal value is cents. */
  readonly unitCostDisplay = computed(() => {
    const cents = this.lineItem().unitCost;
    return cents === undefined || cents === null ? '' : (cents / 100).toFixed(2);
  });

  readonly difference = computed(() => {
    const item = this.lineItem();
    const current = item.currentStock ?? null;
    const newStock = item.newStock;
    if (current === null || newStock === undefined || newStock === null) return 0;
    return newStock - current;
  });

  onNewStockChange(value: number): void {
    this.newStockChange.emit(value);
  }

  onUnitCostChange(raw: string): void {
    if (raw === '' || raw === null || raw === undefined) {
      this.unitCostChange.emit(undefined);
      return;
    }
    const major = parseFloat(raw);
    this.unitCostChange.emit(isNaN(major) ? undefined : Math.round(major * 100));
  }

  onAddItem(): void {
    this.addItem.emit();
  }

  canAddItem(): boolean {
    const item = this.lineItem();
    const hasBasics = !!(
      item.variantId &&
      item.newStock !== undefined &&
      item.newStock !== null &&
      item.newStock >= 0
    );
    if (!hasBasics) return false;
    if (this.unitCostRequired() && (item.unitCost === undefined || item.unitCost === null)) {
      return false;
    }
    return true;
  }

  formatDifference(diff: number): string {
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return String(diff);
    return '0';
  }

  /** Product name · Variant name (SKU) */
  getVariantDisplayLabel(variant: ProductVariant): string {
    const productName = variant.productName?.trim();
    const variantName = variant.name?.trim();
    const sku = variant.sku?.trim();
    const parts: string[] = [];
    if (productName) parts.push(productName);
    if (variantName && variantName !== productName) parts.push(variantName);
    const main = parts.length ? parts.join(' · ') : variantName || sku || '—';
    return sku ? `${main} (${sku})` : main;
  }

  parseFloat(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }
}
