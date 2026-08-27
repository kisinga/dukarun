import { Component, ElementRef, effect, inject, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { BarcodeScannerComponent } from '../shared/ui/barcode-scanner.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { ProductEditorStore } from './product-editor.store';
import { ProductEditorVariantsComponent } from './product-editor-variants.component';
import {
  ProductPhotoControlComponent,
  type PendingProductImage,
} from './product-photo-control.component';
import type {
  ProductEditorCloseResult,
  ProductEditorRequest,
  ProductEditorResult,
} from './product-editor.types';

/** Dialog boundary for the product aggregate; the catalogue page sees only request/result values. */
@Component({
  selector: 'app-product-editor',
  providers: [ProductEditorStore],
  imports: [
    ReactiveFormsModule,
    BarcodeScannerComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    ProductEditorVariantsComponent,
    ProductPhotoControlComponent,
  ],
  template: `
    <dialog class="modal modal-open" (cancel)="$event.preventDefault(); requestClose()">
      <form
        class="modal-box modal-box-task p-0 md:w-full md:max-w-3xl"
        (submit)="$event.preventDefault(); save()"
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-base-300 px-4 py-3 sm:px-6 sm:py-4"
        >
          <div class="min-w-0">
            <h2 class="type-title truncate">
              {{ store.mode() === 'create' ? 'New product' : 'Edit ' + store.product()?.name }}
            </h2>
            <p class="type-caption mt-0.5">Details and variants save together.</p>
          </div>
          <button
            appButton
            type="button"
            variant="ghost"
            [iconOnly]="true"
            aria-label="Close product editor"
            (click)="requestClose()"
          >
            <app-icon name="heroXMark" />
          </button>
        </header>

        <nav
          class="grid shrink-0 grid-cols-2 border-b border-base-300 px-4 sm:px-6"
          aria-label="Product editor steps"
        >
          <button
            type="button"
            class="flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors"
            [class.border-primary]="store.step() === 1"
            [class.text-primary]="store.step() === 1"
            [class.border-transparent]="store.step() !== 1"
            [attr.aria-current]="store.step() === 1 ? 'step' : null"
            (click)="store.setStep(1)"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              [class.bg-primary]="store.step() === 1"
              [class.text-primary-content]="store.step() === 1"
              [class.bg-base-200]="store.step() !== 1"
              >1</span
            >
            Details
          </button>
          <button
            type="button"
            class="flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            [class.border-primary]="store.step() === 2"
            [class.text-primary]="store.step() === 2"
            [class.border-transparent]="store.step() !== 2"
            [disabled]="store.name.value.trim().length === 0"
            [attr.aria-current]="store.step() === 2 ? 'step' : null"
            (click)="store.setStep(2)"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full text-xs"
              [class.bg-primary]="store.step() === 2"
              [class.text-primary-content]="store.step() === 2"
              [class.bg-base-200]="store.step() !== 2"
              >2</span
            >
            Variants
            <span class="type-caption">{{ store.rows().length }}</span>
          </button>
        </nav>

        <div class="modal-body product-editor-body p-4 pb-6 sm:p-6">
          @if (store.error()) {
            <div role="alert" class="alert alert-error mb-4 py-2 text-sm">
              <app-icon name="heroExclamationTriangle" />
              <span>{{ store.error() }}</span>
            </div>
          }
          @if (store.notice()) {
            <div role="status" class="alert alert-success mb-4 py-2 text-sm">
              <app-icon name="heroCheckCircle" />
              <span>{{ store.notice() }}</span>
            </div>
          }

          @if (store.step() === 1) {
            <section class="grid gap-5 sm:grid-cols-2">
              <app-form-field label="Product name" [required]="true">
                <input
                  data-editor-field="name"
                  type="text"
                  class="input input-bordered w-full"
                  autocomplete="off"
                  [formControl]="store.name"
                />
              </app-form-field>
              <app-form-field
                label="Manufacturer"
                hint="Optional. Select an existing manufacturer or type a new one."
              >
                <input
                  type="text"
                  class="input input-bordered w-full"
                  autocomplete="off"
                  list="manufacturer-options"
                  placeholder="Optional"
                  [formControl]="store.manufacturer"
                />
                <datalist id="manufacturer-options">
                  @for (manufacturer of store.manufacturers(); track manufacturer.id) {
                    <option [value]="manufacturer.name"></option>
                  }
                </datalist>
              </app-form-field>
              <app-form-field
                label="Shared barcode"
                hint="Best for products with one variant. Variant barcodes take precedence."
              >
                <div class="flex gap-2">
                  <input
                    type="text"
                    class="input input-bordered min-w-0 flex-1 font-mono"
                    autocomplete="off"
                    placeholder="Scan or enter barcode"
                    [maxLength]="store.barcodeMaxLength"
                    [formControl]="store.barcode"
                    (keydown.enter)="$event.preventDefault()"
                  />
                  <button
                    appButton
                    type="button"
                    variant="outline"
                    size="sm"
                    class="shrink-0"
                    title="Scan barcode with camera"
                    aria-label="Scan shared product barcode"
                    (click)="store.openFamilyScanner()"
                  >
                    <app-icon name="heroCamera" /> Scan
                  </button>
                </div>
              </app-form-field>
              <app-form-field
                label="VAT treatment"
                hint="Use the shop default unless this product has a special treatment."
              >
                <select
                  class="select select-bordered w-full"
                  [formControl]="store.taxCategory"
                  [disabled]="!store.permissions.has('ManageCatalog')"
                >
                  <option value="">Use shop default</option>
                  @for (category of store.taxCategories(); track category.id) {
                    <option [value]="category.id">{{ category.name }}</option>
                  }
                </select>
              </app-form-field>
            </section>

            @if (store.pendingBarcode(); as replacement) {
              <div class="mt-4 rounded-field border border-warning/50 bg-warning/5 p-3">
                <p class="text-sm font-medium">Replace the shared barcode?</p>
                <p class="mt-1 break-all text-xs">
                  <span class="font-mono">{{ store.barcode.value.trim() }}</span>
                  <span class="mx-1.5" aria-hidden="true">-&gt;</span>
                  <span class="font-mono">{{ replacement }}</span>
                </p>
                <div class="mt-2 flex gap-2">
                  <button appButton type="button" size="sm" (click)="store.confirmFamilyBarcode()">
                    Replace
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    (click)="store.cancelFamilyBarcode()"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            }

            @if (store.barcode.value.trim() && store.rows().length > 1) {
              <div class="alert alert-warning mt-4 text-sm">
                <app-icon name="heroExclamationTriangle" />
                <span>Assign individual barcodes when variants use different packages.</span>
              </div>
            }

            <app-product-photo-control
              [previewUrl]="store.imagePreview()"
              [alt]="store.name.value.trim() || 'Product photo preview'"
              [mode]="store.mode() ?? 'create'"
              [busy]="store.imageBusy()"
              [disabled]="store.busy()"
              [pending]="store.pendingImage() !== null"
              (imageSelected)="selectImage($event)"
              (selectionFailed)="store.imageSelectionFailed($event)"
              (retryUpload)="store.retryImageUpload()"
              (removePhoto)="store.removeImage()"
              (imageBroken)="store.markImageBroken()"
            />

            @if (store.mode() === 'create') {
              <div
                class="mt-5 flex items-start gap-3 rounded-field border border-base-300/70 bg-base-200/60 p-3"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-100 text-primary"
                  aria-hidden="true"
                >
                  <app-icon name="heroQueueList" />
                </span>
                <div>
                  <p class="text-sm font-semibold">Next: pricing and stock</p>
                  <p class="type-caption mt-0.5">Add a selling price and optional opening stock.</p>
                </div>
              </div>
            } @else {
              <section class="mt-5 border-t border-base-300 pt-4">
                <label class="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span class="type-heading block">Product available for sale</span>
                    <span class="type-caption block"
                      >Turn this off to hide every variant from Sell.</span
                    >
                  </span>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="store.active"
                  />
                </label>
              </section>

              <section class="mt-5 border-t border-base-300 pt-4">
                <h3 class="section-title">Categories</h3>
                @if (store.canEditCategories()) {
                  <label class="input input-bordered input-sm mt-3 flex items-center gap-2">
                    <app-icon name="heroMagnifyingGlass" class="text-base-content/50" />
                    <input
                      type="search"
                      class="min-w-0 grow"
                      placeholder="Search categories..."
                      [value]="store.categoryQuery()"
                      (input)="store.setCategoryQuery($any($event.target).value)"
                    />
                  </label>
                  <div class="mt-2 max-h-56 overflow-y-auto rounded-box border border-base-300">
                    @for (category of store.visibleCategories(); track category.id) {
                      <label
                        class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-base-200 px-3 last:border-0 hover:bg-base-200"
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="store.familyCategories().has(category.id)"
                          (change)="store.toggleCategory(category.id)"
                        />
                        <span class="min-w-0 flex-1 truncate text-sm">{{ category.name }}</span>
                      </label>
                    } @empty {
                      <p class="p-4 text-center text-sm text-base-content/60">
                        No categories match.
                      </p>
                    }
                  </div>
                  @if (store.matchingCategories().length > store.visibleCategories().length) {
                    <p class="type-caption mt-2">Keep typing to narrow the category list.</p>
                  }
                } @else if (store.categoryMembershipsComplete()) {
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    @for (name of store.productCategoryNames(); track name) {
                      <span class="badge badge-ghost">{{ name }}</span>
                    } @empty {
                      <p class="type-caption">Uncategorized</p>
                    }
                  </div>
                  @if (store.permissions.has('ManageCatalog') && !store.connectivity.online()) {
                    <p class="type-caption mt-2">Reconnect to change categories.</p>
                  }
                } @else {
                  <p class="type-caption mt-2">{{ store.categoryDataStatusLabel() }}</p>
                }
              </section>
            }
          } @else {
            <app-product-editor-variants
              class="product-editor-variants"
              [rows]="store.rows()"
              [loading]="store.loading()"
              [barcodeMaxLength]="store.barcodeMaxLength"
              [familyBarcode]="store.barcode.value"
              [stockLocations]="store.stockLocations()"
              [batchExpiryEnabled]="store.preferences.batchExpiryEnabled()"
              [duplicateLabels]="store.duplicateLabels()"
              [barcodeConflict]="store.barcodeConflict()"
              [stockLookup]="stockLookup"
              (rowMutation)="store.mutateRow($event)"
              (removeRow)="store.removeRow($event)"
              (scanBarcode)="store.openVariantScanner($event)"
              (generateBarcode)="store.generateBarcode($event)"
              (confirmBarcode)="store.confirmRowBarcode($event)"
              (cancelBarcode)="store.cancelRowBarcode($event)"
              (addRow)="store.addRow()"
            />
          }
        </div>

        <footer
          class="grid shrink-0 grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] gap-2 border-t border-base-300 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-4"
        >
          @if (store.step() === 1) {
            <button
              appButton
              type="button"
              variant="outline"
              class="w-full sm:w-auto"
              (click)="requestClose()"
            >
              Cancel
            </button>
            <button
              appButton
              type="button"
              class="w-full sm:w-auto"
              [disabled]="store.name.value.trim().length === 0"
              (click)="store.setStep(2)"
            >
              <span class="sm:hidden">Next: variants</span>
              <span class="hidden sm:inline">Continue to variants</span>
            </button>
          } @else {
            <button
              appButton
              type="button"
              variant="outline"
              class="w-full sm:w-auto"
              (click)="store.setStep(1)"
            >
              <span class="sm:hidden">Details</span>
              <span class="hidden sm:inline">Back to details</span>
            </button>
            <button
              appButton
              type="submit"
              class="w-full sm:w-auto"
              [loading]="store.busy()"
              [disabled]="store.loading() || store.duplicateLabels() || store.barcodeConflict()"
            >
              {{ store.mode() === 'create' ? 'Create product' : 'Save product' }}
            </button>
          }
        </footer>
      </form>
      <form method="dialog" class="modal-backdrop">
        <button type="button" aria-label="Close" (click)="requestClose()">close</button>
      </form>
    </dialog>

    @if (store.scannerTarget() !== null) {
      <app-barcode-scanner (scanned)="store.scanned($event)" (close)="store.closeScanner()" />
    }
  `,
  styles: `
    .product-editor-body {
      scrollbar-width: thin;
      scrollbar-color: color-mix(in oklab, var(--color-base-content) 22%, transparent) transparent;
    }
    .product-editor-body::-webkit-scrollbar {
      width: 0.375rem;
    }
    .product-editor-body::-webkit-scrollbar-thumb {
      border-radius: var(--radius-selector);
      background: color-mix(in oklab, var(--color-base-content) 22%, transparent);
    }
  `,
})
export class ProductEditorComponent {
  readonly request = input.required<ProductEditorRequest>();
  readonly saved = output<ProductEditorResult>();
  readonly closed = output<ProductEditorCloseResult>();
  protected readonly store = inject(ProductEditorStore);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly stockLookup = (variantId: string) => this.store.stockOf(variantId);

  constructor() {
    effect(() => void this.store.initialize(this.request()));
  }

  protected requestClose(): void {
    if (this.store.busy() || this.store.imageBusy()) return;
    if (this.store.isDirty() && !window.confirm('Discard unsaved product changes?')) return;
    this.closed.emit({ refreshCatalog: this.store.photoPersisted() });
  }

  protected async save(): Promise<void> {
    const result = await this.store.save();
    if (result) {
      this.saved.emit(result);
      return;
    }
    setTimeout(() => {
      const target =
        this.store.validationTarget() === 'details'
          ? this.element.nativeElement.querySelector<HTMLElement>('[data-editor-field="name"]')
          : this.element.nativeElement.querySelector<HTMLElement>('.product-editor-variants input');
      target?.focus();
    });
  }

  protected selectImage(image: PendingProductImage): void {
    void this.store.selectImage(image);
  }
}
