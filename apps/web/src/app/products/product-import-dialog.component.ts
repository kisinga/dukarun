import { Component, inject, model, output, signal } from '@angular/core';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  ProductTransferService,
  type ProductWorkbookPreview,
  type ProductWorkbookResult,
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
              <h2 class="type-title">Upload Products workbook</h2>
              <p class="type-caption mt-1">
                Review new products, selling options, prices and stock before applying.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              aria-label="Close"
              [disabled]="busy()"
              (click)="close()"
            >
              <app-icon name="heroXMark" />
            </button>
          </header>
          <div class="modal-body space-y-4 p-4">
            @if (error()) {
              <div role="alert" class="alert alert-error text-sm">{{ error() }}</div>
            }
            <div>
              <label class="block text-sm font-semibold" for="product-import-file"
                >Products workbook (.xlsx)</label
              >
              <input
                id="product-import-file"
                class="file-input file-input-bordered mt-2 w-full"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                [disabled]="busy()"
                (change)="chooseFile($event)"
              />
              <p class="type-caption mt-2">
                Use the same workbook for new entries and edits. Missing rows leave saved products
                unchanged.
              </p>
            </div>
            @if (preview(); as data) {
              <p class="text-sm">
                {{ data.rows }} selling-option rows · {{ data.lines.length }} changes to review
              </p>
              @if (!data.lines.length && !data.errors.length && !data.conflicts.length) {
                <div role="status" class="rounded-field bg-base-200 p-3">No changes to apply.</div>
              }
              @if (data.lines.length) {
                <div class="space-y-3 lg:hidden">
                  @for (line of data.lines; track $index) {
                    <article data-workbook-change class="rounded-field border border-base-300 p-3">
                      <h3 class="font-semibold">{{ line.product }}</h3>
                      <p class="type-caption">
                        {{ line.option }} · {{ line.sheet }} row {{ line.row }}
                      </p>
                      <p class="mt-2 text-sm font-medium">{{ line.field }}</p>
                      <dl class="mt-1 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt class="type-caption">Current</dt>
                          <dd>{{ line.before }}</dd>
                        </div>
                        <div>
                          <dt class="type-caption">Proposed</dt>
                          <dd>{{ line.after }}</dd>
                        </div>
                      </dl>
                    </article>
                  }
                </div>
                <div class="hidden overflow-x-auto rounded-field border border-base-300 lg:block">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Product / selling option</th>
                        <th>Change</th>
                        <th>Current</th>
                        <th>Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (line of data.lines; track $index) {
                        <tr data-workbook-change>
                          <td>
                            <div class="font-semibold">{{ line.product }}</div>
                            <div class="type-caption">{{ line.option }}</div>
                            <div class="type-caption">{{ line.sheet }} · row {{ line.row }}</div>
                          </td>
                          <td>{{ line.field }}</td>
                          <td>{{ line.before }}</td>
                          <td>{{ line.after }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              @if (data.conflicts.length) {
                <div role="alert" class="rounded-field border border-warning/40 bg-warning/5 p-3">
                  <h3 class="text-sm font-semibold">Download a fresh workbook</h3>
                  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
                    @for (message of data.conflicts; track $index) {
                      <li>{{ message }}</li>
                    }
                  </ul>
                </div>
              }
              @if (data.errors.length) {
                <div role="alert" class="rounded-field border border-error/40 bg-error/5 p-3">
                  <h3 class="text-sm font-semibold">Fix workbook errors</h3>
                  <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
                    @for (message of data.errors; track $index) {
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
              Apply workbook
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
      this.error.set(error instanceof Error ? error.message : 'Could not read workbook.');
    } finally {
      this.busy.set(false);
    }
  }
  protected canImport(): boolean {
    const p = this.preview();
    return !!p && !this.busy() && !p.errors.length && !p.conflicts.length && !!p.lines.length;
  }
  protected async apply(): Promise<void> {
    const preview = this.preview();
    if (!preview || !this.canImport()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.imported.emit(await this.transfer.apply(preview));
      this.open.set(false);
      this.preview.set(null);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      this.busy.set(false);
    }
  }
  protected close(): void {
    if (!this.busy()) {
      this.open.set(false);
      this.preview.set(null);
      this.error.set(null);
    }
  }
}
