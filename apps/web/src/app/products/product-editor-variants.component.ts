import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BusinessLocation } from '../core/location-context.service';
import { parseKes } from '../core/money';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import type {
  ProductEditorRow,
  ProductEditorRowMutation,
  ProductEditorStockInfo,
} from './product-editor.types';

/**
 * Variant-editing step inside the coupled product editor.
 *
 * Product details, category membership, image upload, and final save payloads stay with the
 * editor owner. This component owns the dense variant form surface: labels, prices, barcodes,
 * inventory flags, opening stock fields, and inline validation warnings.
 */
@Component({
  selector: 'app-product-editor-variants',
  imports: [FormsModule, ButtonComponent, FormFieldComponent, IconComponent, MoneyComponent],
  template: `
    <section>
      <div class="mb-4">
        <h3 class="section-title">Sellable variants</h3>
        <p class="type-caption mt-1">
          Use one variant for a simple item, or add sizes and pack options.
        </p>
      </div>

      @if (loading()) {
        <div class="flex min-h-32 items-center justify-center gap-2 text-sm text-base-content/60">
          <span class="loading loading-spinner loading-sm"></span>
          Loading variants...
        </div>
      } @else {
        <div class="space-y-2">
          @for (row of rows(); track row.key; let index = $index) {
            <section class="rounded-box bg-base-200/60 p-3">
              <div class="mb-3 flex min-h-11 items-center justify-between gap-3">
                <h4 class="type-heading">
                  {{
                    row.name.trim() ||
                      (rows().length === 1 ? 'Default variant' : 'Variant ' + (index + 1))
                  }}
                </h4>
                @if (row.variantId) {
                  <label class="flex cursor-pointer items-center gap-2">
                    <span class="type-caption">
                      {{ row.active ? 'Available' : 'Hidden' }}
                    </span>
                    <input
                      type="checkbox"
                      class="toggle toggle-primary toggle-sm"
                      [ngModel]="row.active"
                      (ngModelChange)="patch(index, { active: $event })"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </label>
                } @else {
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    [iconOnly]="true"
                    [disabled]="rows().length === 1"
                    aria-label="Remove variant"
                    (click)="removeRow.emit(index)"
                  >
                    <app-icon name="heroXMark" />
                  </button>
                }
              </div>

              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <app-form-field label="Variant label">
                  <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="{{ rows().length === 1 ? 'Default' : 'e.g. 1 kg' }}"
                    [ngModel]="row.name"
                    (ngModelChange)="patch(index, { name: $event })"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </app-form-field>
                <app-form-field label="Retail price (KES)" [required]="true">
                  <input
                    type="text"
                    inputmode="numeric"
                    class="input input-bordered w-full"
                    placeholder="0"
                    [ngModel]="row.price"
                    (ngModelChange)="patch(index, { price: $event })"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </app-form-field>
                <app-form-field label="Item type">
                  <select
                    class="select select-bordered w-full"
                    [ngModel]="row.kind"
                    (ngModelChange)="patch(index, { kind: $event })"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    <option value="good">Physical good</option>
                    <option value="service">Service</option>
                  </select>
                </app-form-field>
              </div>

              <details class="mt-3 border-t border-base-300/70">
                <summary
                  class="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 py-2 text-sm font-medium"
                >
                  More options
                  <span class="type-caption font-mono">
                    SKU {{ row.sku || 'auto' }}
                    @if (row.barcode) {
                      &middot; barcode set
                    }
                    @if (row.wholesale) {
                      &middot; wholesale set
                    }
                  </span>
                </summary>
                <div class="grid gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                  <app-form-field label="SKU" hint="Leave blank to generate one.">
                    <input
                      type="text"
                      class="input input-bordered w-full font-mono"
                      placeholder="Auto"
                      [ngModel]="row.sku"
                      (ngModelChange)="patch(index, { sku: $event })"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </app-form-field>
                  <app-form-field label="Variant barcode" hint="Overrides the shared barcode.">
                    <div class="flex gap-1.5">
                      <input
                        type="text"
                        class="input input-bordered min-w-0 flex-1 font-mono"
                        placeholder="Optional"
                        [maxLength]="barcodeMaxLength()"
                        [ngModel]="row.barcode"
                        (ngModelChange)="patch(index, { barcode: $event })"
                        [ngModelOptions]="{ standalone: true }"
                        (keydown.enter)="$event.preventDefault()"
                      />
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        title="Scan barcode"
                        aria-label="Scan variant barcode"
                        (click)="scanBarcode.emit(index)"
                      >
                        <app-icon name="heroCamera" />
                      </button>
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        (click)="generateBarcode.emit(index)"
                      >
                        Generate
                      </button>
                    </div>
                  </app-form-field>
                  <app-form-field label="Wholesale price (KES)" hint="Optional">
                    <input
                      type="text"
                      inputmode="numeric"
                      class="input input-bordered w-full"
                      placeholder="0"
                      [ngModel]="row.wholesale"
                      (ngModelChange)="patch(index, { wholesale: $event })"
                      [ngModelOptions]="{ standalone: true }"
                    />
                  </app-form-field>
                </div>
                @if (row.pendingBarcode; as replacement) {
                  <div class="mt-2 rounded-field border border-warning/50 bg-warning/5 p-3">
                    <p class="text-sm font-medium">Replace this variant's barcode?</p>
                    <p class="mt-1 break-all text-xs">
                      <span class="font-mono">{{ effectiveBarcode(row) }}</span>
                      <span class="mx-1.5" aria-hidden="true">-&gt;</span>
                      <span class="font-mono">{{ replacement }}</span>
                    </p>
                    <div class="mt-2 flex gap-2">
                      <button
                        appButton
                        type="button"
                        variant="primary"
                        size="sm"
                        (click)="confirmBarcode.emit(index)"
                      >
                        Replace
                      </button>
                      <button
                        appButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        (click)="cancelBarcode.emit(index)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                }
              </details>

              @if (row.kind !== 'service') {
                <div class="flex flex-wrap gap-x-6 gap-y-1 border-t border-base-300/70 pt-2">
                  <label class="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [ngModel]="row.trackInventory"
                      (ngModelChange)="patch(index, { trackInventory: $event })"
                      [ngModelOptions]="{ standalone: true }"
                    />
                    <span class="text-sm">Track stock</span>
                  </label>
                  <label class="flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      [ngModel]="row.allowFractional"
                      (ngModelChange)="patch(index, { allowFractional: $event })"
                      [ngModelOptions]="{ standalone: true }"
                    />
                    <span class="text-sm">Allow fractional quantities</span>
                  </label>
                  @if (row.variantId && row.trackInventory) {
                    <span class="ml-auto self-center text-sm text-base-content/60">
                      Current stock {{ stockOf(row.variantId)?.stock ?? 0 }}
                    </span>
                  }
                </div>
              }

              @if (!row.variantId && row.kind !== 'service' && row.trackInventory) {
                <details class="mt-3 border-t border-base-300 pt-3">
                  <summary class="min-h-11 cursor-pointer py-3 text-sm font-medium">
                    Opening stock
                    <span class="font-normal text-base-content/60">(optional)</span>
                  </summary>
                  <div class="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                    <app-form-field label="Quantity">
                      <input
                        type="text"
                        inputmode="decimal"
                        class="input input-bordered w-full"
                        placeholder="0"
                        [ngModel]="row.openingQuantity"
                        (ngModelChange)="patch(index, { openingQuantity: $event })"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    <app-form-field label="Unit cost (KES)">
                      <input
                        type="text"
                        inputmode="numeric"
                        class="input input-bordered w-full"
                        placeholder="0"
                        [ngModel]="row.openingUnitCost"
                        (ngModelChange)="patch(index, { openingUnitCost: $event })"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    <app-form-field label="Stock location">
                      <select
                        class="select select-bordered w-full"
                        [ngModel]="row.openingLocationId"
                        (ngModelChange)="patch(index, { openingLocationId: $event })"
                        [ngModelOptions]="{ standalone: true }"
                      >
                        @for (location of stockLocations(); track location.id) {
                          <option [value]="location.id">{{ location.name }}</option>
                        }
                      </select>
                    </app-form-field>
                    <app-form-field label="Batch number" hint="Optional">
                      <input
                        type="text"
                        class="input input-bordered w-full"
                        [ngModel]="row.batchNumber"
                        (ngModelChange)="patch(index, { batchNumber: $event })"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </app-form-field>
                    @if (batchExpiryEnabled()) {
                      <app-form-field label="Expiry date" hint="Optional">
                        <input
                          type="date"
                          class="input input-bordered w-full"
                          [ngModel]="row.expiryDate"
                          (ngModelChange)="patch(index, { expiryDate: $event })"
                          [ngModelOptions]="{ standalone: true }"
                        />
                      </app-form-field>
                    }
                    @if (row.openingQuantity && row.openingUnitCost) {
                      <div class="self-end pb-3 text-sm text-base-content/60">
                        Opening value
                        <strong class="ml-1 text-base-content">
                          <app-money
                            [amount]="
                              +row.openingQuantity * (parseAmount(row.openingUnitCost) ?? 0)
                            "
                          />
                        </strong>
                      </div>
                    }
                  </div>
                </details>
              }
            </section>
          }
        </div>
        <button
          appButton
          type="button"
          variant="outline"
          class="mt-3 w-full"
          [disabled]="loading()"
          (click)="addRow.emit()"
        >
          <app-icon name="heroPlus" /> Add variant
        </button>
        @if (duplicateLabels()) {
          <p class="mt-3 text-sm text-warning">Variant labels must be unique.</p>
        }
        @if (barcodeConflict()) {
          <p class="mt-3 text-sm text-warning">
            Each variant needs a unique effective barcode. Clear the shared barcode or assign
            individual variant barcodes before saving.
          </p>
        }
      }
    </section>
  `,
})
export class ProductEditorVariantsComponent {
  readonly rows = input.required<ProductEditorRow[]>();
  readonly loading = input.required<boolean>();
  readonly barcodeMaxLength = input.required<number>();
  readonly familyBarcode = input.required<string>();
  readonly stockLocations = input.required<BusinessLocation[]>();
  readonly batchExpiryEnabled = input.required<boolean>();
  readonly duplicateLabels = input.required<boolean>();
  readonly barcodeConflict = input.required<boolean>();
  readonly stockLookup =
    input.required<(variantId: string) => ProductEditorStockInfo | undefined>();

  readonly removeRow = output<number>();
  readonly scanBarcode = output<number>();
  readonly generateBarcode = output<number>();
  readonly confirmBarcode = output<number>();
  readonly cancelBarcode = output<number>();
  readonly addRow = output<void>();
  readonly rowMutation = output<ProductEditorRowMutation>();

  protected patch(index: number, changes: ProductEditorRowMutation['changes']): void {
    this.rowMutation.emit({ index, changes });
  }

  protected effectiveBarcode(row: ProductEditorRow): string {
    return row.barcode.trim() || this.familyBarcode().trim();
  }

  protected stockOf(variantId: string): ProductEditorStockInfo | undefined {
    return this.stockLookup()(variantId);
  }

  protected parseAmount(value: string): number | null {
    return parseKes(value);
  }
}
