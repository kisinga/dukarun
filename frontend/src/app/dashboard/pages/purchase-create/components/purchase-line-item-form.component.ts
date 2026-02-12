import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PurchaseLineItem } from '../../../../core/services/purchase.service.types';

/**
 * Purchase Line Item Form Component
 *
 * Displays selected variant and qty/cost inputs for adding a line item.
 * Product search is handled by the parent via the shared product search view.
 */
@Component({
  selector: 'app-purchase-line-item-form',
  imports: [CommonModule],
  template: `
    <div class="space-y-3">
      @if (!lineItem().variantId) {
        <p class="text-sm text-base-content/60">Search above to add a product.</p>
      }
      <!-- Selected product info + Qty/Cost inputs -->
      @if (lineItem().variantId) {
        <div class="flex items-end gap-2">
          <div class="flex-1 text-sm truncate">
            <span class="font-medium">{{ getVariantDisplayName(lineItem().variant) }}</span>
          </div>
          <div class="w-24">
            <label class="label py-0">
              <span class="label-text text-xs">Qty</span>
            </label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              placeholder="Qty"
              step="0.01"
              min="0.01"
              [value]="lineItem().quantity || ''"
              (input)="
                onLineItemFieldChange('quantity', parseFloat($any($event.target).value) || 0)
              "
            />
          </div>
          <div class="w-28">
            <label class="label py-0">
              <span class="label-text text-xs">Unit Cost</span>
            </label>
            <input
              type="number"
              class="input input-bordered input-sm w-full"
              placeholder="Cost"
              step="0.01"
              min="0"
              [value]="lineItem().unitCost || ''"
              (input)="
                onLineItemFieldChange('unitCost', parseFloat($any($event.target).value) || 0)
              "
            />
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            [disabled]="!canAddItem()"
            (click)="onAddItem()"
          >
            Add
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseLineItemFormComponent {
  readonly lineItem = input.required<Partial<PurchaseLineItem>>();

  readonly lineItemFieldChange = output<{ field: keyof PurchaseLineItem; value: any }>();
  readonly addItem = output<void>();

  onLineItemFieldChange(field: keyof PurchaseLineItem, value: any): void {
    this.lineItemFieldChange.emit({ field, value });
  }

  onAddItem(): void {
    this.addItem.emit();
  }

  canAddItem(): boolean {
    const item = this.lineItem();
    return !!(item.variantId && item.quantity && item.unitCost);
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

  parseFloat(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }
}
