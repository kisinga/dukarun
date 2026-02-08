import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ProductVariant } from '../../../../core/services/product/product-search.service';
import { PurchaseLineItem } from '../../../../core/services/purchase.service.types';

/**
 * Purchase Line Item Form Component
 *
 * Handles product search and adding new line items.
 * Location is auto-selected by the parent component.
 */
@Component({
  selector: 'app-purchase-line-item-form',
  imports: [CommonModule],
  template: `
    <div class="space-y-3">
      <!-- Product Search -->
      <div class="relative">
        <input
          type="text"
          class="input input-bordered input-sm w-full"
          placeholder="Search product by name or SKU..."
          [value]="productSearchTerm()"
          (input)="onProductSearch($any($event.target).value)"
        />
        @if (productSearchResults().length > 0) {
          <div
            class="absolute z-20 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          >
            @for (variant of getDropdownVariants(); track variant.id) {
              <button
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-base-200 border-b border-base-200 last:border-b-0"
                (click)="onProductSelect(variant)"
              >
                <div class="text-sm font-medium">
                  {{ variant.productName || variant.name || variant.sku }}
                </div>
                @if (variant.name && variant.name !== variant.productName) {
                  <div class="text-xs opacity-70">{{ variant.name }}</div>
                }
                <div class="text-xs opacity-50">SKU: {{ variant.sku }}</div>
              </button>
            }
            <div class="p-2 border-t border-base-200 bg-base-200/50">
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-block"
                (click)="onOpenVariantPickerModal()"
              >
                View all {{ productSearchResults().length }} variant{{
                  productSearchResults().length !== 1 ? 's' : ''
                }}
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Selected product info + Qty/Cost inputs -->
      @if (lineItem().variantId) {
        <div class="flex items-end gap-2">
          <div class="flex-1 text-sm truncate">
            <span class="font-medium">{{
              lineItem().variant?.productName || lineItem().variant?.name
            }}</span>
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
  readonly productSearchTerm = input<string>('');
  readonly productSearchResults = input<ProductVariant[]>([]);
  readonly lineItem = input.required<Partial<PurchaseLineItem>>();

  readonly productSearch = output<string>();
  readonly productSelect = output<ProductVariant>();
  readonly openVariantPickerModal = output<void>();
  readonly lineItemFieldChange = output<{ field: keyof PurchaseLineItem; value: any }>();
  readonly addItem = output<void>();

  private static readonly DROPDOWN_MAX_ITEMS = 5;

  /** Show first N variants in dropdown; modal shows all. */
  getDropdownVariants(): ProductVariant[] {
    const all = this.productSearchResults();
    if (all.length <= PurchaseLineItemFormComponent.DROPDOWN_MAX_ITEMS) return all;
    return all.slice(0, PurchaseLineItemFormComponent.DROPDOWN_MAX_ITEMS);
  }

  onProductSearch(term: string): void {
    this.productSearch.emit(term);
  }

  onProductSelect(variant: ProductVariant): void {
    this.productSelect.emit(variant);
  }

  onOpenVariantPickerModal(): void {
    this.openVariantPickerModal.emit();
  }

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

  parseFloat(value: string | number): number {
    return parseFloat(String(value)) || 0;
  }
}
