import { Component, inject, model, output, signal } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ProductTransferService,
  type CatalogImportPreview,
  type CatalogImportResult,
  type ProductImportMode,
} from './product-transfer.service';

@Component({
  selector: 'app-product-import-dialog',
  imports: [ButtonComponent, IconComponent],
  template: `
    @if (open()) {
      <dialog class="modal modal-open" (cancel)="$event.preventDefault(); close()">
        <div class="modal-box modal-box-task p-0 md:w-full md:max-w-3xl">
          <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
            <div>
              <h2 class="type-title">Import products</h2>
              <p class="type-caption mt-1">Preview every change before applying it.</p>
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
                >Excel workbook</label
              >
              <input
                id="product-import-file"
                class="file-input file-input-bordered mt-2 w-full"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                [disabled]="busy()"
                (change)="chooseFile($event)"
              />
              <button
                class="link mt-2 text-xs"
                type="button"
                [disabled]="busy()"
                (click)="downloadTemplate()"
              >
                Download blank template
              </button>
            </div>

            @if (preview(); as data) {
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div class="rounded-field bg-base-200 p-3">
                  <p class="type-caption">Rows</p>
                  <p class="font-semibold">{{ data.rows }}</p>
                </div>
                <div class="rounded-field bg-base-200 p-3">
                  <p class="type-caption">Create</p>
                  <p class="font-semibold">{{ data.creates }}</p>
                </div>
                <div class="rounded-field bg-base-200 p-3">
                  <p class="type-caption">Update</p>
                  <p class="font-semibold">{{ data.updates }}</p>
                </div>
                <div class="rounded-field bg-base-200 p-3">
                  <p class="type-caption">Errors</p>
                  <p class="font-semibold">{{ data.errors.length }}</p>
                </div>
              </div>

              @if (data.errors.length) {
                <div class="rounded-field border border-error/40 bg-error/5 p-3">
                  <h3 class="text-sm font-semibold text-error">Fix workbook errors</h3>
                  <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
                    @for (message of data.errors.slice(0, 20); track message) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                </div>
              }

              <fieldset class="space-y-2">
                <legend class="text-sm font-semibold">Import mode</legend>
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-field border border-base-300 p-3"
                >
                  <input
                    class="radio radio-primary radio-sm mt-0.5"
                    type="radio"
                    name="import-mode"
                    value="merge"
                    [checked]="mode() === 'merge'"
                    (change)="mode.set('merge')"
                  />
                  <span
                    ><span class="block text-sm font-medium">Merge</span
                    ><span class="type-caption"
                      >Create and update supplied rows. Missing items stay active.</span
                    ></span
                  >
                </label>
                <label
                  class="flex items-start gap-3 rounded-field border border-base-300 p-3"
                  [class.opacity-50]="!data.replaceEligible"
                >
                  <input
                    class="radio radio-warning radio-sm mt-0.5"
                    type="radio"
                    name="import-mode"
                    value="replace"
                    [disabled]="!data.replaceEligible"
                    [checked]="mode() === 'replace'"
                    (change)="mode.set('replace')"
                  />
                  <span
                    ><span class="block text-sm font-medium">Replace catalog</span
                    ><span class="type-caption"
                      >Deactivate {{ data.missingProducts }} missing products and
                      {{ data.missingVariants }} missing variants.</span
                    ></span
                  >
                </label>
                @if (!data.replaceEligible) {
                  <p class="type-caption">Replace requires a full export from this company.</p>
                }
              </fieldset>

              @if (mode() === 'replace') {
                <div class="rounded-field border border-warning/50 bg-warning/10 p-3">
                  <label class="text-sm font-medium" for="replace-confirmation"
                    >Type <strong>{{ confirmationPhrase(data) }}</strong> to confirm.</label
                  >
                  <input
                    id="replace-confirmation"
                    class="input input-bordered mt-2 w-full"
                    [value]="confirmation()"
                    (input)="confirmation.set(inputValue($event))"
                  />
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
              Import products
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
  readonly imported = output<CatalogImportResult>();
  protected readonly preview = signal<CatalogImportPreview | null>(null);
  protected readonly mode = signal<ProductImportMode>('merge');
  protected readonly confirmation = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async chooseFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.busy.set(true);
    this.error.set(null);
    this.preview.set(null);
    this.mode.set('merge');
    this.confirmation.set('');
    try {
      this.preview.set(await this.transfer.preview(file));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read workbook');
    } finally {
      this.busy.set(false);
    }
  }

  protected async downloadTemplate(): Promise<void> {
    this.busy.set(true);
    try {
      await this.transfer.downloadTemplate();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not create template');
    } finally {
      this.busy.set(false);
    }
  }

  protected confirmationPhrase(preview: CatalogImportPreview): string {
    return `DEACTIVATE ${preview.missingProducts} PRODUCTS`;
  }

  protected canImport(): boolean {
    const preview = this.preview();
    if (!preview || preview.errors.length || this.busy()) return false;
    if (this.mode() === 'replace') {
      return preview.replaceEligible && this.confirmation() === this.confirmationPhrase(preview);
    }
    return true;
  }

  protected async apply(): Promise<void> {
    const preview = this.preview();
    if (!preview || !this.canImport()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.transfer.apply(preview, this.mode());
      this.imported.emit(result);
      this.close();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Import failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected close(): void {
    if (this.busy()) return;
    this.open.set(false);
    this.preview.set(null);
    this.error.set(null);
    this.confirmation.set('');
    this.mode.set('merge');
  }
}
