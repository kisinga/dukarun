import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';

/**
 * SKU List Editor Component
 *
 * Displays and allows editing of generated SKUs.
 * Handles field validation and error display.
 */
@Component({
  selector: 'app-sku-list-editor',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card bg-base-100 shadow">
      <div class="card-body p-3">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-bold text-sm">Generated SKUs</h3>
          <button type="button" class="btn btn-xs btn-secondary" (click)="onRegenerate()">
            🔄 Regenerate
          </button>
        </div>

        @if (skus().length === 0) {
          <div class="text-center py-4 text-xs opacity-60">
            Configure options above to generate SKUs
          </div>
        } @else {
          <div class="text-xs opacity-60 mb-2">{{ skus().length }} SKU(s) will be created</div>
        }

        <!-- SKU List -->
        <div class="space-y-3">
          @for (sku of skus().controls; track $index) {
            <div [formGroup]="$any(sku)" class="p-3 bg-base-200 rounded">
              <!-- SKU Name (read-only, auto-generated) -->
              <div class="mb-2">
                <div class="text-xs opacity-70 mb-1">SKU Name</div>
                <div class="font-semibold">{{ sku.get('name')?.value }}</div>
                @if (sku.get('allowFractionalQuantity')?.value) {
                  <div class="badge badge-xs badge-primary mt-1">Fractional</div>
                }
              </div>

              <!-- Hidden fields -->
              <input type="hidden" formControlName="name" />
              <input type="hidden" formControlName="sku" />
              <input type="hidden" formControlName="allowFractionalQuantity" />

              <!-- Price -->
              <div class="mb-2">
                <label class="text-xs opacity-70 mb-1 block">Price</label>
                <input
                  type="number"
                  formControlName="price"
                  placeholder="1"
                  step="1"
                  min="1"
                  class="input input-sm input-bordered w-full"
                  [class.input-error]="skuFieldHasError($index, 'price')"
                />
                @if (skuFieldHasError($index, 'price')) {
                  <p class="text-error text-xs mt-1">{{ getSkuFieldError($index, 'price') }}</p>
                }
              </div>

              <!-- Opening stock -->
              <div class="mb-2">
                <label class="text-xs opacity-70 mb-1 block">Opening stock</label>
                <input
                  type="number"
                  formControlName="stockOnHand"
                  placeholder="0"
                  min="0"
                  class="input input-sm input-bordered w-full"
                  [class.input-error]="skuFieldHasError($index, 'stockOnHand')"
                />
                @if (skuFieldHasError($index, 'stockOnHand')) {
                  <p class="text-error text-xs mt-1">
                    {{ getSkuFieldError($index, 'stockOnHand') }}
                  </p>
                }
              </div>

              <!-- Wholesale Price -->
              <div>
                <label class="text-xs opacity-70 mb-1 block">Wholesale Price (Optional)</label>
                <input
                  type="number"
                  formControlName="wholesalePrice"
                  placeholder="0"
                  step="1"
                  min="0"
                  class="input input-sm input-bordered w-full"
                  [class.input-warning]="isWholesalePriceHigher($index)"
                />
                @if (isWholesalePriceHigher($index)) {
                  <div class="alert alert-warning py-1.5 px-2 mt-1.5">
                    <svg
                      class="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="text-xs"
                      >Wholesale price should be lower than the regular price</span
                    >
                  </div>
                } @else {
                  <p class="text-xs opacity-60 mt-1">Discount limit guardrail</p>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class SkuListEditorComponent {
  // Inputs
  readonly skus = input.required<FormArray>();
  readonly canRegenerate = input<boolean>(true);

  // Outputs
  readonly regenerate = output<void>();

  /**
   * Handle regenerate SKUs
   */
  onRegenerate(): void {
    this.regenerate.emit();
  }

  /**
   * Check if a SKU field has an error
   */
  skuFieldHasError(skuIndex: number, fieldName: string): boolean {
    const control = this.skus().at(skuIndex)?.get(fieldName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  /**
   * Get error message for a SKU field
   */
  getSkuFieldError(skuIndex: number, fieldName: string): string {
    const control = this.skus().at(skuIndex)?.get(fieldName);
    if (!control?.errors) return '';

    const errors = control.errors;
    if (errors['required']) return 'Required';
    if (errors['minlength']) return `Min ${errors['minlength'].requiredLength} chars`;
    if (errors['maxlength']) return `Max ${errors['maxlength'].requiredLength} chars`;
    if (errors['min']) return `Min value: ${errors['min'].min}`;

    return 'Invalid';
  }

  /**
   * Check if wholesale price is higher than regular price
   */
  isWholesalePriceHigher(skuIndex: number): boolean {
    const skuGroup = this.skus().at(skuIndex);
    if (!skuGroup) return false;

    const priceControl = skuGroup.get('price');
    const wholesalePriceControl = skuGroup.get('wholesalePrice');

    if (!priceControl || !wholesalePriceControl) return false;

    const price = Number(priceControl.value) || 0;
    const wholesalePrice = Number(wholesalePriceControl.value) || 0;

    // Only show warning if wholesale price is greater than 0 and higher than regular price
    return wholesalePrice > 0 && wholesalePrice > price;
  }
}
