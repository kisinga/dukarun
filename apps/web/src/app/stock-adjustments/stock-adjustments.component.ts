import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { formatKesInput, parseKesToCents } from '../core/money';
import { MoneyService } from '../money/money.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';

const ADJUSTMENT_REASONS = [
  'Stock count correction',
  'Damaged stock',
  'Expired stock',
  'Loss or theft',
  'Found stock',
  'Customer return',
  'Other',
] as const;

@Component({
  selector: 'app-stock-adjustments',
  imports: [ReactiveFormsModule, FormFieldComponent, ButtonComponent, PageLayoutComponent],
  template: `
    <app-page
      title="Adjust stock"
      subtitle="Correct inventory from a physical count. Selling prices are never changed here."
    >
      <div class="mx-auto max-w-2xl space-y-3">
        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <span>{{ error() }}</span>
          </div>
        }
        @if (notice()) {
          <div role="status" class="alert alert-success text-sm">
            <span>{{ notice() }}</span>
          </div>
        }

        <section class="card overflow-visible bg-base-100">
          <div class="border-b border-base-300/70 p-4 sm:p-6">
            <div class="mb-3 flex items-start gap-3">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content"
                >1</span
              >
              <div>
                <h2 class="section-title">Choose product</h2>
                <p class="type-caption mt-1">Select the exact inventory variant you counted.</p>
              </div>
            </div>

            @if (selected(); as variant) {
              <div class="flex flex-wrap items-center gap-3 rounded-field bg-base-200 p-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold">{{ label(variant) }}</p>
                  <p class="type-caption mt-0.5">
                    {{ variant.sku }}
                    @if (variant.allow_fractional) {
                      · Fractional quantities enabled
                    }
                  </p>
                </div>
                <button appButton variant="ghost" type="button" (click)="changeProduct()">
                  Change
                </button>
              </div>
            } @else {
              <div class="relative">
                <input
                  type="search"
                  class="input input-bordered min-h-11 w-full"
                  placeholder="Search product, SKU, or barcode"
                  autocomplete="off"
                  [formControl]="search"
                />
                @if (searching()) {
                  <span
                    class="loading loading-spinner loading-sm absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label="Searching"
                  ></span>
                }
                @if (results().length > 0) {
                  <ul
                    class="menu absolute inset-x-0 z-20 mt-1 max-h-64 overflow-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-overlay"
                  >
                    @for (variant of results(); track variant.variant_id) {
                      <li>
                        <button type="button" (click)="pick(variant)">
                          <span class="min-w-0 flex-1 text-left">
                            <span class="block truncate text-sm font-medium">{{
                              label(variant)
                            }}</span>
                            <span class="type-caption block">
                              {{ variant.sku }} · {{ formatQuantity(variant.stock ?? 0) }} currently
                            </span>
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                } @else if (hasSearched() && !searching()) {
                  <p class="type-caption mt-2">No inventory products found.</p>
                }
              </div>
            }
          </div>

          @if (selected()) {
            <form (submit)="$event.preventDefault(); saveAdjustment()">
              <div class="border-b border-base-300/70 p-4 sm:p-6">
                <div class="mb-4 flex items-start gap-3">
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content"
                    >2</span
                  >
                  <div>
                    <h2 class="section-title">Enter the counted quantity</h2>
                    <p class="type-caption mt-1">
                      We calculate the stock movement from your count.
                    </p>
                  </div>
                </div>

                <div class="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div>
                    <p class="form-field-label">Current quantity</p>
                    <div
                      class="mt-1.5 flex min-h-11 items-center rounded-field bg-base-200 px-3 text-lg font-semibold tabular-nums"
                    >
                      {{ formatQuantity(currentQuantity()) }}
                    </div>
                  </div>
                  <span class="hidden pb-3 text-base-content/35 sm:block">→</span>
                  <app-form-field label="New quantity" [required]="true">
                    <input
                      type="number"
                      min="0"
                      [step]="selected()?.allow_fractional ? 'any' : '1'"
                      class="input input-bordered min-h-11 w-full text-lg font-semibold tabular-nums"
                      [formControl]="newQuantity"
                    />
                  </app-form-field>
                </div>

                <div
                  class="mt-3 flex items-center justify-between gap-3 rounded-field px-3 py-2"
                  [class.bg-success/10]="quantityDifference() > 0"
                  [class.bg-error/10]="quantityDifference() < 0"
                  [class.bg-base-200]="quantityDifference() === 0"
                  aria-live="polite"
                >
                  <span class="text-sm text-base-content/65">Stock movement</span>
                  <span
                    class="font-semibold tabular-nums"
                    [class.text-success]="quantityDifference() > 0"
                    [class.text-error]="quantityDifference() < 0"
                  >
                    {{ formatDifference(quantityDifference()) }} · {{ changeDescription() }}
                  </span>
                </div>

                @if (quantityDifference() > 0) {
                  <div class="mt-4 rounded-field bg-info/10 p-3">
                    <app-form-field
                      label="Unit cost (KES)"
                      hint="Values only the added stock; retail and wholesale prices stay unchanged."
                      [required]="true"
                    >
                      <input
                        type="text"
                        inputmode="numeric"
                        class="input input-bordered min-h-11 w-full sm:max-w-xs"
                        placeholder="0"
                        [formControl]="unitCost"
                      />
                    </app-form-field>
                  </div>
                }
              </div>

              <div class="p-4 sm:p-6">
                <div class="mb-4 flex items-start gap-3">
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content"
                    >3</span
                  >
                  <div>
                    <h2 class="section-title">Explain the correction</h2>
                    <p class="type-caption mt-1">The reason is saved in the audit trail.</p>
                  </div>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <app-form-field label="Reason" [required]="true">
                    <select class="select select-bordered min-h-11 w-full" [formControl]="reason">
                      <option value="">Select a reason</option>
                      @for (option of reasons; track option) {
                        <option [value]="option">{{ option }}</option>
                      }
                    </select>
                  </app-form-field>
                  <app-form-field label="Notes" hint="Optional detail for later review.">
                    <input
                      type="text"
                      class="input input-bordered min-h-11 w-full"
                      placeholder="What happened?"
                      [formControl]="notes"
                    />
                  </app-form-field>
                </div>
              </div>

              <div
                class="flex flex-col gap-3 border-t border-base-300/70 bg-base-200/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <p class="text-sm text-base-content/65">
                  Final count:
                  <span class="font-semibold tabular-nums">{{
                    formatQuantity(validNewQuantity() ?? currentQuantity())
                  }}</span>
                </p>
                <button
                  appButton
                  size="md"
                  type="submit"
                  [variant]="quantityDifference() < 0 ? 'error' : 'primary'"
                  [loading]="busy()"
                  [disabled]="!canSave()"
                >
                  {{ submitLabel() }}
                </button>
              </div>
            </form>
          } @else {
            <div class="p-6 text-center text-sm text-base-content/55">
              Search for a product to continue.
            </div>
          }
        </section>
      </div>
    </app-page>
  `,
})
export class StockAdjustmentsComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private searchRequest = 0;

  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly newQuantity = new FormControl(0, { nonNullable: true });
  protected readonly unitCost = new FormControl('', { nonNullable: true });
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });

  protected readonly results = signal<Variant[]>([]);
  protected readonly selected = signal<Variant | null>(null);
  protected readonly currentQuantity = signal(0);
  protected readonly searching = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly label = variantLabel;

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(query => void this.onSearch(query));
  }

  ngOnInit(): void {
    // Search drives the product picker; no catalog preload is needed.
  }

  protected async onSearch(query: string): Promise<void> {
    const request = ++this.searchRequest;
    const q = query.trim();
    this.hasSearched.set(false);
    if (q.length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    try {
      const variants = await this.pos.searchVariants(q);
      if (request !== this.searchRequest) return;
      this.results.set(
        variants.filter(variant => variant.track_inventory && variant.kind !== 'service')
      );
      this.hasSearched.set(true);
    } catch (err) {
      if (request === this.searchRequest) {
        this.error.set(err instanceof Error ? err.message : 'Search failed');
      }
    } finally {
      if (request === this.searchRequest) this.searching.set(false);
    }
  }

  protected async pick(variant: Variant): Promise<void> {
    const stock = Number(variant.stock ?? 0);
    this.selected.set(variant);
    this.currentQuantity.set(stock);
    this.newQuantity.setValue(stock);
    this.search.setValue('', { emitEvent: false });
    this.results.set([]);
    this.hasSearched.set(false);
    this.reason.setValue('');
    this.notes.setValue('');
    this.unitCost.setValue('');
    this.error.set(null);
    this.notice.set(null);

    if (!variant.variant_id) return;
    try {
      const batches = await this.pos.variantBatches(variant.variant_id);
      const latestCost = batches.find(batch => batch.unit_cost > 0)?.unit_cost;
      if (latestCost !== undefined && this.unitCost.value === '') {
        this.unitCost.setValue(formatKesInput(latestCost));
      }
    } catch {
      // A cost can still be entered manually if stock is increased.
    }
  }

  protected changeProduct(): void {
    this.selected.set(null);
    this.currentQuantity.set(0);
    this.newQuantity.setValue(0);
    this.unitCost.setValue('');
    this.reason.setValue('');
    this.notes.setValue('');
    this.error.set(null);
    this.notice.set(null);
  }

  protected validNewQuantity(): number | null {
    const value = Number(this.newQuantity.value);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  protected quantityDifference(): number {
    const next = this.validNewQuantity();
    return next === null ? 0 : next - this.currentQuantity();
  }

  protected canSave(): boolean {
    const variant = this.selected();
    const next = this.validNewQuantity();
    if (!variant?.variant_id || next === null || this.quantityDifference() === 0) return false;
    if (!variant.allow_fractional && !Number.isInteger(next)) return false;
    if (this.reason.value.length === 0) return false;
    if (this.quantityDifference() > 0) {
      const cost = parseKesToCents(this.unitCost.value);
      if (cost === null || cost <= 0) return false;
    }
    return true;
  }

  protected changeDescription(): string {
    const difference = this.quantityDifference();
    if (difference > 0) return `${this.formatQuantity(difference)} added`;
    if (difference < 0) return `${this.formatQuantity(Math.abs(difference))} removed`;
    return 'No change';
  }

  protected submitLabel(): string {
    const difference = this.quantityDifference();
    if (difference > 0) return `Add ${this.formatQuantity(difference)} to stock`;
    if (difference < 0) return `Remove ${this.formatQuantity(Math.abs(difference))} from stock`;
    return 'No changes to save';
  }

  protected formatQuantity(value: number): string {
    return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(Number(value));
  }

  protected formatDifference(value: number): string {
    if (value > 0) return `+${this.formatQuantity(value)}`;
    if (value < 0) return `−${this.formatQuantity(Math.abs(value))}`;
    return '0';
  }

  protected async saveAdjustment(): Promise<void> {
    const variant = this.selected();
    const next = this.validNewQuantity();
    if (!variant?.variant_id || next === null || !this.canSave()) return;

    const previous = this.currentQuantity();
    const difference = next - previous;
    const unitCost = difference > 0 ? parseKesToCents(this.unitCost.value) : undefined;
    const details = this.notes.value.trim();
    const adjustmentReason = details ? `${this.reason.value}: ${details}` : this.reason.value;

    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.money.postStockAdjustment(
        variant.variant_id,
        previous,
        next,
        adjustmentReason,
        unitCost ?? undefined
      );
      this.currentQuantity.set(next);
      this.newQuantity.setValue(next);
      this.selected.set({ ...variant, stock: next });
      this.reason.setValue('');
      this.notes.setValue('');
      this.notice.set(
        `${this.label(variant)} updated: ${this.formatQuantity(previous)} → ${this.formatQuantity(next)}.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stock adjustment failed';
      if (message.startsWith('stock_changed:')) {
        try {
          const refreshed = (await this.pos.productStock()).get(variant.variant_id);
          if (refreshed) {
            this.currentQuantity.set(refreshed.stock);
            this.selected.set({ ...variant, stock: refreshed.stock });
          }
        } catch {
          // Keep the original stale-count message if refresh is unavailable.
        }
        this.error.set(
          'Stock changed while you were editing. The current quantity was refreshed; review the new quantity and save again.'
        );
      } else {
        this.error.set(message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
