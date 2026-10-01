import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { PosService, rpcError, variantLabel, type Variant } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { PermissionsService } from '../core/permissions.service';
import { siteUrl } from '../core/public-url';
import {
  BarcodeLabelPrintService,
  BarcodeLabelRenderError,
  type BarcodeLabelLayout,
} from './barcode-label-print.service';
import { BARCODE_LABEL_PRESETS } from './barcode-label-presets';
import { batchLabels, classifyBarcodeLabels, generateDukarunBarcode } from './barcode-labels';

const LABEL_LAYOUT_KEY = 'dukarun-barcode-label-layout';

@Component({
  selector: 'app-barcode-label-dialog',
  imports: [FormsModule, ButtonComponent, IconComponent],
  template: `
    <dialog class="modal modal-open" (cancel)="$event.preventDefault(); closed.emit()">
      <section class="modal-box modal-box-task p-0 md:w-full md:max-w-2xl">
        <header class="flex items-start gap-3 border-b border-base-300 p-4">
          <div>
            <h2 class="type-title">
              {{
                mode() === 'single'
                  ? 'Print barcode label'
                  : mode() === 'selection'
                    ? 'Print selected labels'
                    : 'Print catalogue labels'
              }}
            </h2>
            <p class="type-caption mt-1">
              Labels contain the item name, variant, SKU, and barcode. Prices are not printed.
            </p>
            <a
              [href]="hardwareGuideUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="link link-primary mt-1 inline-flex min-h-11 items-center text-xs font-medium"
            >
              Printer and paper setup
            </a>
          </div>
          <button
            appButton
            type="button"
            variant="ghost"
            [iconOnly]="true"
            class="ml-auto"
            aria-label="Close label dialog"
            (click)="closed.emit()"
          >
            <app-icon name="heroXMark" />
          </button>
        </header>

        <div class="modal-body p-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-field bg-success/10 p-3">
              <p class="type-caption">Ready</p>
              <p class="mt-1 text-xl font-semibold">{{ ready().length }}</p>
            </div>
            <div class="rounded-field bg-warning/10 p-3">
              <p class="type-caption">Missing</p>
              <p class="mt-1 text-xl font-semibold">{{ missing().length }}</p>
            </div>
            <div class="rounded-field bg-error/10 p-3">
              <p class="type-caption">Ambiguous</p>
              <p class="mt-1 text-xl font-semibold">{{ ambiguous().length }}</p>
            </div>
          </div>

          @if (mode() === 'single' && unitOptions().length > 1) {
            <label class="mt-4 block">
              <span class="form-field-label">Label for</span>
              <select
                class="select select-bordered min-h-11 w-full"
                [ngModel]="selectedPackId()"
                (ngModelChange)="selectedPackId.set($event)"
              >
                @for (option of unitOptions(); track option.variant.selected_pack_id) {
                  <option [value]="option.variant.selected_pack_id || ''">
                    {{ option.variant.variant_name || 'item' }}
                  </option>
                }
              </select>
            </label>
          }
          @if (mode() === 'single' && selected(); as selected) {
            <div class="mt-4 rounded-field border border-base-300 p-3">
              <p class="font-semibold">{{ label(selected.variant) }}</p>
              <p class="type-caption mt-1">
                {{ selected.variant.manufacturer_name || 'Manufacturer not set' }}
              </p>
              <p class="type-caption mt-1 font-mono">
                {{ selected.variant.barcode || 'No barcode' }}
              </p>
              @if (selected.state !== 'ready') {
                <p class="mt-2 text-sm text-warning">
                  This item needs an individual, unambiguous barcode before it can be printed.
                </p>
              }
            </div>
          }

          @if (missing().length || ambiguous().length) {
            <div class="mt-4 rounded-field border border-warning/40 bg-warning/5 p-3">
              <p class="font-medium">Some variants need individual barcodes</p>
              <p class="type-caption mt-1">
                Missing codes and shared duplicate codes are excluded from ready labels.
              </p>
              @if (mode() === 'selection') {
                <p class="type-caption mt-2">
                  Edit barcodes individually before printing these entries.
                </p>
              } @else if (!perms.has('ManageStockAdjustments')) {
                <p class="mt-2 text-sm text-warning">
                  You can print ready labels, but barcode generation requires catalog edit access.
                </p>
              } @else if (needsCodes().length === 0) {
                <p class="type-caption mt-2">
                  Set pack barcodes in the product editor before printing these labels.
                </p>
              } @else if (!confirmGenerate()) {
                <button
                  appButton
                  type="button"
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  data-learning-anchor="barcode-generate"
                  [disabled]="busy()"
                  (click)="confirmGenerate.set(true)"
                >
                  Generate missing barcodes
                </button>
              } @else {
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <span class="text-sm"
                    >Generate Dukarun codes for {{ needsCodes().length }} variants?</span
                  >
                  <button
                    appButton
                    type="button"
                    variant="primary"
                    size="sm"
                    data-learning-anchor="barcode-generate-confirm"
                    [loading]="busy()"
                    (click)="generateMissing()"
                  >
                    Confirm
                  </button>
                  <button
                    appButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (click)="confirmGenerate.set(false)"
                  >
                    Cancel
                  </button>
                </div>
              }
            </div>
          }

          @if (mode() === 'selection') {
            <div class="mt-4 space-y-2">
              <p class="font-medium">Choose labels ({{ selectedReadyCount() }} selected)</p>
              <p class="type-caption">
                Active base variants and priced packs are selected by default.
              </p>
              @for (item of visibleClassified(); track unitKey(item.variant)) {
                <label
                  class="flex min-h-11 items-center gap-3 rounded-field border border-base-300 p-2"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [checked]="item.state === 'ready' && !deselected().has(unitKey(item.variant))"
                    [disabled]="item.state !== 'ready' || printing()"
                    (change)="toggleLabel(item.variant)"
                  />
                  <span class="min-w-0 flex-1"
                    >{{ label(item.variant)
                    }}<span class="type-caption block font-mono">{{
                      item.variant.barcode || 'No barcode'
                    }}</span></span
                  >
                  @if (item.state !== 'ready') {
                    <span class="text-sm text-warning">{{ item.state }} — excluded</span>
                  }
                </label>
              }
              @for (item of excluded(); track unitKey(item.variant)) {
                <p class="rounded-field border border-base-300 p-2 text-sm">
                  {{ label(item.variant) }} — {{ item.reason }} (excluded)
                </p>
              }
              @if (!visibleClassified().length && !excluded().length) {
                <p class="type-caption">No variants were found for the selected products.</p>
              }
            </div>
          }

          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span class="type-heading block">Print layout</span>
              <select
                class="select select-bordered mt-1 w-full"
                [ngModel]="layout()"
                (ngModelChange)="setLayout($event)"
              >
                @for (preset of labelPresets; track preset.id) {
                  <option [value]="preset.id">{{ preset.label }}</option>
                }
              </select>
              <p class="type-caption mt-1">
                Choose the same paper size in the system print dialog.
              </p>
            </label>
            @if (mode() !== 'catalogue') {
              <label>
                <span class="type-heading block">{{
                  mode() === 'selection' ? 'Copies per label' : 'Copies'
                }}</span>
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="500"
                  class="input input-bordered mt-1 w-full"
                  [ngModel]="copies()"
                  (ngModelChange)="setCopies($event)"
                />
              </label>
            }
          </div>

          @if (error()) {
            <div class="alert alert-error mt-4 text-sm">{{ error() }}</div>
          }
          @if (renderFailures().length) {
            <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-error">
              @for (failure of renderFailures(); track failure) {
                <li>{{ failure }}</li>
              }
            </ul>
          }
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-base-300 p-4">
          <button
            appButton
            type="button"
            variant="outline"
            [loading]="testPrinting()"
            [disabled]="printing() || testPrinting()"
            (click)="printTestLabel()"
          >
            Print test label
          </button>
          <button appButton type="button" variant="ghost" (click)="closed.emit()">Close</button>
          <button
            appButton
            type="button"
            variant="primary"
            data-learning-anchor="barcode-print"
            [loading]="printing()"
            [disabled]="printBatches().length === 0 || printing()"
            (click)="printCurrentBatch()"
          >
            <app-icon name="heroPrinter" />
            @if (mode() === 'catalogue') {
              Print ready labels only
            } @else if (mode() === 'selection') {
              Print selected labels
            } @else {
              Print label
            }
            @if (printBatches().length > 1) {
              (batch {{ batchIndex() + 1 }} of {{ printBatches().length }})
            }
          </button>
        </footer>
      </section>
      <form method="dialog" class="modal-backdrop">
        <button type="button" aria-label="Close" (click)="closed.emit()">close</button>
      </form>
    </dialog>
  `,
})
export class BarcodeLabelDialogComponent {
  private readonly pos = inject(PosService);
  private readonly cache = inject(CatalogCacheService);
  private readonly labels = inject(BarcodeLabelPrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly hardwareGuideUrl = siteUrl('/docs/hardware');

  readonly mode = input.required<'catalogue' | 'single' | 'selection'>();
  readonly variants = input.required<Variant[]>();
  readonly variantId = input<string | null>(null);
  readonly closed = output<void>();

  protected readonly layout = signal<BarcodeLabelLayout>(this.loadLayout());
  protected readonly labelPresets = BARCODE_LABEL_PRESETS;
  protected readonly copies = signal(1);
  protected readonly busy = signal(false);
  protected readonly printing = signal(false);
  protected readonly testPrinting = signal(false);
  protected readonly confirmGenerate = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly renderFailures = signal<string[]>([]);
  protected readonly batchIndex = signal(0);

  protected readonly deselected = signal<Set<string>>(new Set());
  protected readonly excluded = computed(() =>
    this.variants().flatMap(variant => {
      const inactive = !variant.product_active || !variant.variant_active;
      const entries: Array<{ variant: Variant; reason: string }> = inactive
        ? [{ variant, reason: !variant.product_active ? 'Inactive product' : 'Inactive variant' }]
        : [];
      for (const pack of variant.packs ?? []) {
        if (inactive || !pack.active || pack.sale_price === null)
          entries.push({
            variant: {
              ...variant,
              selected_pack_id: pack.id,
              variant_name: [variant.variant_name, pack.name].filter(Boolean).join(' · '),
            },
            reason: inactive
              ? 'Inactive product or variant'
              : !pack.active
                ? 'Inactive pack'
                : 'Pack has no sale price',
          });
      }
      return entries;
    })
  );
  protected readonly selectedReadyCount = computed(
    () => this.ready().filter(item => !this.deselected().has(this.unitKey(item.variant))).length
  );
  protected readonly selectedPackId = signal('');
  protected readonly classified = computed(() =>
    classifyBarcodeLabels(
      this.variants().flatMap(variant => [
        {
          ...variant,
          selected_pack_id: null,
          variant_name: [
            variant.variant_name === 'Default' ? '' : variant.variant_name,
            variant.stock_unit || 'item',
          ]
            .filter(Boolean)
            .join(' · '),
        },
        ...(variant.packs ?? [])
          .filter(pack => pack.active && pack.sale_price !== null)
          .map(pack => ({
            ...variant,
            selected_pack_id: pack.id,
            barcode: pack.barcode,
            variant_name: [
              variant.variant_name === 'Default' ? '' : variant.variant_name,
              `${pack.name} (${pack.units_per_pack} ${variant.stock_unit || 'item'})`,
            ]
              .filter(Boolean)
              .join(' · '),
          })),
      ])
    )
  );
  protected readonly unitOptions = computed(() =>
    this.classified().filter(item => item.variant.variant_id === this.variantId())
  );
  protected readonly visibleClassified = computed(() => {
    if (this.mode() !== 'single') return this.classified();
    return this.classified().filter(item => item.variant.variant_id === this.variantId());
  });
  protected readonly ready = computed(() =>
    this.visibleClassified().filter(item => item.state === 'ready')
  );
  protected readonly missing = computed(() =>
    this.visibleClassified().filter(item => item.state === 'missing')
  );
  protected readonly ambiguous = computed(() =>
    this.visibleClassified().filter(item => item.state === 'ambiguous')
  );
  protected readonly selected = computed(() =>
    this.classified().find(
      item =>
        item.variant.variant_id === this.variantId() &&
        (item.variant.selected_pack_id || '') === this.selectedPackId()
    )
  );
  protected readonly needsCodes = computed(() => {
    const candidates = [...this.missing(), ...this.ambiguous()].filter(
      item => !item.variant.selected_pack_id
    );
    if (this.mode() === 'catalogue') return candidates;
    return candidates.filter(item => item.variant.variant_id === this.variantId());
  });
  protected readonly printBatches = computed(() => {
    if (this.mode() === 'single') {
      const selected = this.selected();
      return selected?.state === 'ready'
        ? batchLabels(Array.from({ length: this.copies() }, () => selected.variant))
        : [];
    }
    if (this.mode() === 'selection')
      return batchLabels(
        this.ready()
          .filter(item => !this.deselected().has(this.unitKey(item.variant)))
          .flatMap(item => Array.from({ length: this.copies() }, () => item.variant))
      );
    return batchLabels(this.ready().map(item => item.variant));
  });

  constructor() {
    effect(() => {
      this.mode();
      this.variants();
      this.deselected.set(new Set());
    });
    effect(() => {
      this.mode();
      this.variantId();
      this.variants();
      this.copies();
      this.deselected();
      this.batchIndex.set(0);
    });
  }

  protected unitKey(variant: Variant): string {
    return `${variant.variant_id}:${variant.selected_pack_id || ''}`;
  }

  protected toggleLabel(variant: Variant): void {
    if (this.printing()) return;
    const key = this.unitKey(variant);
    this.deselected.update(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected label(variant: Variant): string {
    return variantLabel(variant);
  }

  protected setCopies(value: number | string): void {
    const parsed = Math.trunc(Number(value));
    this.copies.set(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 1);
  }

  protected setLayout(layout: BarcodeLabelLayout): void {
    this.layout.set(layout);
    try {
      localStorage.setItem(LABEL_LAYOUT_KEY, layout);
    } catch {
      // Private mode: keep the choice for this session only.
    }
  }

  protected async printTestLabel(): Promise<void> {
    if (this.testPrinting()) return;
    this.testPrinting.set(true);
    this.error.set(null);
    try {
      await this.labels.printTestLabel(this.layout());
    } catch (error) {
      this.error.set(this.friendlyError(error));
    } finally {
      this.testPrinting.set(false);
    }
  }

  protected async generateMissing(): Promise<void> {
    if (this.mode() === 'selection') return;
    const targets = this.needsCodes();
    if (targets.length === 0 || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      for (const batch of batchLabels(targets)) {
        await this.assignWithCollisionRetry(
          batch.map(item => ({
            variant_id: item.variant.variant_id!,
            barcode: generateDukarunBarcode(),
          }))
        );
      }
      const refreshed = await this.cache.refresh();
      if (!refreshed) {
        throw new Error(
          'Barcodes were assigned, but the catalogue could not refresh. Reconnect and refresh before printing.'
        );
      }
      this.confirmGenerate.set(false);
    } catch (error) {
      this.error.set(this.friendlyError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async printCurrentBatch(): Promise<void> {
    const batches = this.printBatches();
    const index = Math.min(this.batchIndex(), Math.max(batches.length - 1, 0));
    const batch = batches[index];
    if (!batch || this.printing()) return;
    this.printing.set(true);
    this.error.set(null);
    this.renderFailures.set([]);
    try {
      await this.labels.printLabels(batch, this.layout(), index + 1, batches.length);
      if (index + 1 < batches.length) this.batchIndex.set(index + 1);
    } catch (error) {
      if (error instanceof BarcodeLabelRenderError) {
        this.renderFailures.set(
          error.failures.map(failure => `${variantLabel(failure.variant)}: ${failure.message}`)
        );
      } else {
        this.error.set(this.friendlyError(error));
      }
    } finally {
      this.printing.set(false);
    }
  }

  private async assignWithCollisionRetry(
    assignments: Array<{ variant_id: string; barcode: string }>
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.pos.assignMissingVariantBarcodes(assignments);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.toLowerCase().includes('duplicate') || attempt === 2) throw error;
        assignments = assignments.map(assignment => ({
          ...assignment,
          barcode: generateDukarunBarcode(),
        }));
      }
    }
  }

  private friendlyError(error: unknown): string {
    const normalized =
      error && typeof error === 'object' && 'message' in error
        ? rpcError(error as { message: string; code?: string }).message
        : 'Barcode labels could not be prepared.';
    return normalized.includes('duplicate')
      ? 'A generated barcode collided with an existing value. Try again.'
      : normalized;
  }

  private loadLayout(): BarcodeLabelLayout {
    try {
      const saved = localStorage.getItem(LABEL_LAYOUT_KEY);
      if (BARCODE_LABEL_PRESETS.some(preset => preset.id === saved)) {
        return saved as BarcodeLabelLayout;
      }
    } catch {
      // Fall through to the default.
    }
    return 'a4-grid';
  }
}
