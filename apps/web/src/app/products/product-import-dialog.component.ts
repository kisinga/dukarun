import { Component, inject, model, output, signal } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ProductTransferService,
  type ProductWorkbookPreview,
  type ProductWorkbookResult,
} from './product-transfer.service';
import { formatKes } from '../core/money';

@Component({
  selector: 'app-product-import-dialog',
  imports: [ButtonComponent, IconComponent],
  template: `
    @if (open()) {
      <dialog class="modal modal-open" (cancel)="$event.preventDefault(); close()">
        <div class="modal-box modal-box-task p-0 md:w-full md:max-w-3xl">
          <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
            <div>
              <h2 class="type-title">Upload edited workbook</h2>
              <p class="type-caption mt-1">
                Review updates, new rows, and removed rows before anything is applied.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              aria-label="Close"
              (click)="close()"
            >
              <app-icon name="heroXMark" />
            </button>
          </header>

          <div class="modal-body space-y-4 p-4">
            @if (error()) {
              <div role="alert" class="alert alert-error text-sm">
                <app-icon name="heroExclamationTriangle" /><span>{{ error() }}</span>
              </div>
            }

            <div class="rounded-field border border-base-300 p-4">
              <label class="block text-sm font-semibold" for="product-import-file"
                >Edited products and stock workbook</label
              >
              <input
                id="product-import-file"
                class="file-input file-input-bordered mt-2 w-full"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                [disabled]="busy()"
                (change)="chooseFile($event)"
              />
            </div>

            @if (preview(); as data) {
              @if (data.kind === 'price_update') {
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Rows</p>
                    <p class="font-semibold">{{ data.rows }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Retail</p>
                    <p class="font-semibold">{{ data.retailChanges }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Wholesale</p>
                    <p class="font-semibold">{{ data.wholesaleChanges }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Stock</p>
                    <p class="font-semibold">{{ data.stockChanges }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Manufacturers</p>
                    <p class="font-semibold">{{ data.manufacturerChanges }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">New products</p>
                    <p class="font-semibold">{{ data.creationPreview?.creates ?? 0 }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Will disable</p>
                    <p class="font-semibold">
                      {{ data.disabledVariants }}
                      {{ data.disabledVariants === 1 ? 'variant' : 'variants' }}
                    </p>
                    <p class="type-caption">
                      {{ data.disabledProducts }}
                      {{ data.disabledProducts === 1 ? 'product' : 'products' }}
                    </p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Unchanged</p>
                    <p class="font-semibold">{{ data.unchangedRows }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Issues</p>
                    <p class="font-semibold">{{ data.errors.length + data.conflicts.length }}</p>
                  </div>
                </div>

                @if (data.productChanges.length) {
                  <div class="rounded-field border border-base-300 p-3">
                    <h3 class="text-sm font-semibold">Product detail changes</h3>
                    <div class="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
                      @for (change of data.productChanges; track change.productId) {
                        <div class="border-b border-base-200 pb-2 last:border-0">
                          <p class="font-medium">{{ change.productName }}</p>
                          <p>
                            Manufacturer: {{ change.currentManufacturer || 'Not set' }} →
                            {{ change.newManufacturer || 'Not set' }}
                          </p>
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (data.disableChanges.length) {
                  <div class="rounded-field border border-warning/50 bg-warning/5 p-3">
                    <h3 class="text-sm font-semibold">Will be disabled</h3>
                    <p class="type-caption mt-1">
                      These entire table rows were present in the export and removed from the
                      workbook. No history will be deleted.
                    </p>
                    <div class="mt-2 max-h-56 space-y-2 overflow-y-auto lg:hidden">
                      @for (change of data.disableChanges; track change.variantId) {
                        <div class="rounded-field border border-warning/30 bg-base-100 p-2 text-xs">
                          <p class="font-medium">{{ change.productName }}</p>
                          <p>
                            {{ change.variantName || 'Default' }} · {{ change.sku || 'No SKU' }}
                          </p>
                          <p class="mt-1 text-base-content/70">
                            {{
                              change.disableProduct
                                ? 'Disable variant and product'
                                : 'Disable variant'
                            }}
                          </p>
                        </div>
                      }
                    </div>
                    <div class="mt-2 hidden max-h-56 overflow-auto lg:block">
                      <table class="table table-xs">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Variant</th>
                            <th>SKU</th>
                            <th>Effect</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (change of data.disableChanges; track change.variantId) {
                            <tr>
                              <td>{{ change.productName }}</td>
                              <td>{{ change.variantName || 'Default' }}</td>
                              <td>{{ change.sku || '—' }}</td>
                              <td>
                                {{
                                  change.disableProduct
                                    ? 'Disable variant and product'
                                    : 'Disable variant'
                                }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                }

                @if (data.creationPreview; as creation) {
                  <div class="rounded-field border border-base-300 p-3">
                    <h3 class="text-sm font-semibold">New products</h3>
                    <div class="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
                      @for (product of creation.products; track product.product_key) {
                        <p>
                          <span class="font-medium">{{ product.name }}</span>
                          · {{ product.variants.length }}
                          {{ product.variants.length === 1 ? 'variant' : 'variants' }}
                          @if (product.manufacturer_name) {
                            · {{ product.manufacturer_name }}
                          }
                        </p>
                      }
                    </div>
                  </div>
                }

                @if (data.changes.length) {
                  <div class="rounded-field border border-base-300 p-3">
                    <h3 class="text-sm font-semibold">Product changes</h3>
                    <div class="mt-2 max-h-56 space-y-2 overflow-y-auto text-xs">
                      @for (change of data.changes; track change.variantId) {
                        <div class="border-b border-base-200 pb-2 last:border-0">
                          <p class="font-medium">
                            {{ change.productName }}
                            @if (change.variantName) {
                              <span class="text-base-content/60">— {{ change.variantName }}</span>
                            }
                          </p>
                          @if (change.newRetailPrice !== undefined) {
                            <p>
                              Retail: {{ fmt(change.currentRetailPrice) }} →
                              {{ fmt(change.newRetailPrice) }}
                            </p>
                          }
                          @if (change.newWholesalePrice !== undefined) {
                            <p>
                              Wholesale: {{ nullableMoney(change.currentWholesalePrice) }} →
                              {{ nullableMoney(change.newWholesalePrice) }}
                            </p>
                          }
                          @if (change.newStockQuantity !== undefined) {
                            <p>
                              Stock at {{ change.stockLocationName }}:
                              {{ qty(change.currentStockQuantity ?? 0) }} →
                              {{ qty(change.newStockQuantity) }}
                            </p>
                            @if (change.stockUnitCost !== undefined) {
                              <p>Increase unit cost: {{ fmt(change.stockUnitCost) }}</p>
                            }
                          }
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (data.conflicts.length) {
                  <div class="rounded-field border border-warning/40 bg-warning/5 p-3">
                    <h3 class="text-sm font-semibold">Re-export these changed products</h3>
                    <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
                      @for (message of data.conflicts; track message) {
                        <li>{{ message }}</li>
                      }
                    </ul>
                  </div>
                }
              } @else {
                <div class="grid grid-cols-3 gap-2">
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Rows</p>
                    <p class="font-semibold">{{ data.rows }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Create</p>
                    <p class="font-semibold">{{ data.creates }}</p>
                  </div>
                  <div class="rounded-field bg-base-200 p-3">
                    <p class="type-caption">Errors</p>
                    <p class="font-semibold">{{ data.errors.length }}</p>
                  </div>
                </div>
              }

              @if (data.errors.length) {
                <div class="rounded-field border border-error/40 bg-error/5 p-3">
                  <h3 class="text-sm font-semibold text-error">Fix workbook errors</h3>
                  <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
                    @for (message of data.errors; track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                </div>
              }
            }
          </div>

          <footer class="flex justify-end gap-2 border-t border-base-300 p-4">
            <button appButton variant="ghost" type="button" [disabled]="busy()" (click)="close()">
              Cancel
            </button>
            <button
              appButton
              variant="primary"
              type="button"
              [loading]="busy()"
              [disabled]="!canImport()"
              (click)="apply()"
            >
              {{ preview()?.kind === 'price_update' ? 'Apply workbook' : 'Create products' }}
            </button>
          </footer>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="close()">Close</button>
        </form>
      </dialog>
    }
  `,
})
export class ProductImportDialogComponent {
  private readonly transfer = inject(ProductTransferService);

  readonly open = model(false);
  readonly imported = output<ProductWorkbookResult>();
  protected readonly preview = signal<ProductWorkbookPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async chooseFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.busy.set(true);
    this.error.set(null);
    this.preview.set(null);
    try {
      this.preview.set(await this.transfer.preview(file));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read workbook');
    } finally {
      this.busy.set(false);
    }
  }

  protected canImport(): boolean {
    const preview = this.preview();
    if (!preview || preview.errors.length || this.busy()) return false;
    return preview.kind === 'price_update'
      ? preview.conflicts.length === 0 &&
          (preview.changes.length > 0 ||
            preview.productChanges.length > 0 ||
            preview.disableChanges.length > 0 ||
            !!preview.creationPreview?.products.length)
      : preview.products.length > 0;
  }

  protected async apply(): Promise<void> {
    const preview = this.preview();
    if (!preview || !this.canImport()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.transfer.apply(preview);
      this.imported.emit(result);
      this.close();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Import failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected fmt(amount: number): string {
    return formatKes(amount);
  }

  protected nullableMoney(amount: number | null): string {
    return amount === null ? 'Not set' : formatKes(amount);
  }

  protected qty(amount: number): string {
    return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(amount);
  }

  protected close(): void {
    if (this.busy()) return;
    this.open.set(false);
    this.preview.set(null);
    this.error.set(null);
  }
}
