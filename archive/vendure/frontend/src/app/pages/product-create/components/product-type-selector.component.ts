import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ItemType, ProductType } from '../types/product-creation.types';

/**
 * Product Type Selector Component
 *
 * Handles measured vs discrete selection for products.
 * Only visible when itemType is 'product'.
 */
@Component({
  selector: 'app-product-type-selector',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (itemType() === 'product') {
      <div class="card bg-base-100 shadow">
        <div class="card-body p-3">
          <h3 class="font-bold text-sm">How is this sold?</h3>
          <div class="space-y-2 mt-2">
            <button
              type="button"
              class="btn btn-block justify-start text-left h-auto py-3"
              [class.btn-primary]="productType() === 'measured'"
              (click)="onProductTypeChange('measured')"
            >
              <div class="flex-1">
                <div class="font-semibold">Measured (by weight/volume/length)</div>
                <div class="text-xs opacity-70">Customers buy any amount: 2.5kg, 1.3L, 0.8m</div>
              </div>
            </button>

            <button
              type="button"
              class="btn btn-block justify-start text-left h-auto py-3"
              [class.btn-primary]="productType() === 'discrete'"
              (click)="onProductTypeChange('discrete')"
            >
              <div class="flex-1">
                <div class="font-semibold">Discrete (by unit/package)</div>
                <div class="text-xs opacity-70">
                  Customers buy whole units: 3 bags, 2 bottles, 1 item
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProductTypeSelectorComponent {
  // Inputs
  readonly itemType = input.required<ItemType>();
  readonly productType = input<ProductType | null>(null);

  // Outputs
  readonly productTypeChange = output<ProductType>();

  /**
   * Handle product type selection
   */
  onProductTypeChange(type: ProductType): void {
    this.productTypeChange.emit(type);
  }
}
