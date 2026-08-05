import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { MoneyService } from '../money/money.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { IconComponent } from '../shared/ui/icon.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { LocationContextService } from '../core/location-context.service';
import {
  StockAdjustmentsService,
  type StockAdjustmentHistoryRow,
} from './stock-adjustments.service';

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
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    ButtonComponent,
    PageLayoutComponent,
    IconComponent,
    EmptyStateComponent,
    PaginationComponent,
  ],
  template: `
    <app-page
      title="Adjust stock"
      subtitle="Correct inventory from a physical count. Selling prices are never changed here."
      [wide]="true"
    >
      <div class="space-y-3">
        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ error() }}</span>
          </div>
        }
        @if (notice()) {
          <div role="status" class="alert alert-success text-sm">
            <app-icon name="heroCheckCircle" />
            <span>{{ notice() }}</span>
          </div>
        }

        <section class="card overflow-hidden bg-base-100">
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
              <div>
                <div class="relative">
                  <input
                    type="search"
                    class="input input-bordered min-h-11 w-full"
                    placeholder="Search product, SKU, or barcode"
                    autocomplete="off"
                    aria-label="Search product, SKU, or barcode"
                    [formControl]="search"
                  />
                  @if (searching()) {
                    <span
                      class="loading loading-spinner loading-sm absolute right-3 top-1/2 -translate-y-1/2"
                      aria-label="Searching"
                    ></span>
                  }
                </div>
                @if (results().length > 0) {
                  <ul
                    class="mt-2 max-h-64 w-full divide-y divide-base-300 overflow-auto rounded-field border border-base-300 bg-base-100"
                    aria-label="Product search results"
                  >
                    @for (variant of results(); track variant.variant_id) {
                      <li>
                        <button
                          type="button"
                          class="flex min-h-14 w-full items-center px-3 py-2 text-left transition-colors hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none"
                          (click)="pick(variant)"
                        >
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
            <form
              class="lg:grid lg:grid-cols-2"
              (submit)="$event.preventDefault(); saveAdjustment()"
            >
              <div class="border-b border-base-300/70 p-4 sm:p-6 lg:border-r lg:border-base-300/70">
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
                class="flex flex-col gap-3 border-t border-base-300/70 bg-base-200/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:col-span-2"
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
          }
        </section>

        <section class="card bg-base-100">
          <div class="border-b border-base-300/70 p-4 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="section-title">Adjustment history</h2>
                  <span class="badge badge-ghost badge-sm">{{ historyTotal() }}</span>
                </div>
                <p class="type-caption mt-1">
                  {{ locations.active()?.name ?? 'Working location' }} · grouped by adjustment
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                size="sm"
                type="button"
                [iconOnly]="true"
                [loading]="historyLoading()"
                title="Refresh adjustment history"
                aria-label="Refresh adjustment history"
                (click)="loadHistory()"
              >
                <app-icon name="heroArrowPath" />
              </button>
            </div>

            <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                class="input input-bordered input-sm min-h-10 w-full sm:max-w-md"
                placeholder="Search product, SKU, or reason"
                aria-label="Search adjustment history"
                [formControl]="historySearch"
              />
              @if (historyVariantId()) {
                <button
                  appButton
                  variant="outline"
                  size="sm"
                  type="button"
                  (click)="showAllHistory()"
                >
                  {{ selected() ? 'Showing this product' : 'Product filter' }} · Show all
                </button>
              }
            </div>
          </div>

          <div class="p-4 sm:p-6">
            @if (historyError()) {
              <div role="alert" class="alert alert-error mb-3 text-sm">
                <app-icon name="heroExclamationTriangle" />
                <span>{{ historyError() }}</span>
              </div>
            }

            @if (historyLoading() && historyRows().length === 0) {
              <div
                class="flex min-h-32 items-center justify-center gap-2 text-sm text-base-content/60"
              >
                <span class="loading loading-spinner loading-sm"></span> Loading adjustments
              </div>
            } @else if (historyRows().length === 0) {
              <app-empty-state
                [embedded]="true"
                [compact]="true"
                icon="heroArchiveBox"
                title="No stock adjustments yet"
                description="Completed count corrections for this location will appear here."
              />
            } @else {
              <div class="space-y-2 lg:hidden">
                @for (row of historyRows(); track row.adjustment_id) {
                  <article class="rounded-box border border-base-300 p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold">{{ historyProduct(row) }}</p>
                        <p class="type-caption mt-0.5">{{ time(row.adjusted_at) }}</p>
                      </div>
                      <span
                        class="font-bold tabular-nums"
                        [class.text-success]="row.quantity_change > 0"
                        [class.text-error]="row.quantity_change < 0"
                        >{{ formatDifference(row.quantity_change) }}</span
                      >
                    </div>
                    <p class="mt-2 text-sm">{{ row.reason }}</p>
                    <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 type-caption">
                      @if (row.quantity_before !== null && row.quantity_after !== null) {
                        <span
                          >{{ formatQuantity(row.quantity_before) }} →
                          {{ formatQuantity(row.quantity_after) }}</span
                        >
                      }
                      <span>{{ row.actor_name }}</span>
                      <span>{{ signedValue(row) }}</span>
                    </div>
                  </article>
                }
              </div>

              <div class="hidden overflow-x-auto lg:block">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Product</th>
                      <th class="text-right">Change</th>
                      <th class="text-right">Count</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th class="text-right">Stock value</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of historyRows(); track row.adjustment_id) {
                      <tr>
                        <td class="whitespace-nowrap text-xs">{{ time(row.adjusted_at) }}</td>
                        <td>
                          <p class="font-medium">{{ historyProduct(row) }}</p>
                          <p class="type-caption font-mono">{{ row.sku }}</p>
                        </td>
                        <td
                          class="text-right font-bold tabular-nums"
                          [class.text-success]="row.quantity_change > 0"
                          [class.text-error]="row.quantity_change < 0"
                        >
                          {{ formatDifference(row.quantity_change) }}
                        </td>
                        <td class="whitespace-nowrap text-right tabular-nums">
                          @if (row.quantity_before !== null && row.quantity_after !== null) {
                            {{ formatQuantity(row.quantity_before) }} →
                            {{ formatQuantity(row.quantity_after) }}
                          } @else {
                            —
                          }
                        </td>
                        <td class="max-w-72">
                          <span class="line-clamp-2">{{ row.reason }}</span>
                        </td>
                        <td>{{ row.actor_name }}</td>
                        <td class="whitespace-nowrap text-right tabular-nums">
                          {{ signedValue(row) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <app-pagination
                class="mt-4 block"
                [currentPage]="historyPage()"
                [totalPages]="historyTotalPages()"
                [totalItems]="historyTotal()"
                [itemsPerPage]="historyPageSize"
                itemLabel="adjustments"
                (pageChange)="changeHistoryPage($event)"
              />
            }
          </div>
        </section>
      </div>
    </app-page>
  `,
})
export class StockAdjustmentsComponent implements OnInit {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly route = inject(ActivatedRoute);
  private readonly history = inject(StockAdjustmentsService);
  protected readonly locations = inject(LocationContextService);
  private searchRequest = 0;
  private initialized = false;

  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly newQuantity = new FormControl(0, { nonNullable: true });
  protected readonly unitCost = new FormControl('', { nonNullable: true });
  protected readonly reason = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly historySearch = new FormControl('', { nonNullable: true });

  protected readonly results = signal<Variant[]>([]);
  protected readonly selected = signal<Variant | null>(null);
  protected readonly currentQuantity = signal(0);
  protected readonly searching = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly historyRows = signal<StockAdjustmentHistoryRow[]>([]);
  protected readonly historyTotal = signal(0);
  protected readonly historyPage = signal(1);
  protected readonly historyVariantId = signal<string | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal<string | null>(null);
  protected readonly historyPageSize = 20;
  protected readonly historyTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.historyTotal() / this.historyPageSize))
  );
  protected readonly label = variantLabel;

  constructor() {
    effect(() => {
      const activeId = this.locations.activeId();
      // Track only the location; reloadForLocation reads/writes other signals
      // (selected, historyVariantId, ...) which must not re-trigger this effect.
      if (this.initialized && activeId) untracked(() => void this.reloadForLocation());
    });
    this.search.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(query => void this.onSearch(query));
    this.historySearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        this.historyPage.set(1);
        void this.loadHistory();
      });
  }

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    const variantId = this.route.snapshot.queryParamMap.get('variant');
    if (variantId) {
      try {
        const variant = await this.pos.variantById(variantId);
        if (variant?.track_inventory && variant.kind !== 'service') {
          await this.pick(variant);
          return;
        }
        this.error.set('This product does not have tracked stock to adjust.');
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Could not load that product.');
      }
    }
    await this.loadHistory();
  }

  private async reloadForLocation(): Promise<void> {
    const variantId = this.selected()?.variant_id;
    if (!variantId) {
      await this.loadHistory();
      return;
    }
    try {
      const variant = await this.pos.variantById(variantId);
      if (variant) await this.pick(variant);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not refresh location stock.');
    }
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
    this.historyVariantId.set(variant.variant_id);

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
    this.historyPage.set(1);
    void this.loadHistory();
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
    this.historyVariantId.set(null);
    this.historyPage.set(1);
    void this.loadHistory();
  }

  protected validNewQuantity(): number | null {
    // Cleared number inputs yield null at runtime; Number(null) === 0 would
    // mean "set stock to 0" — treat empty as invalid.
    const raw = this.newQuantity.value as number | null;
    if (raw === null || String(raw).trim() === '') return null;
    const value = Number(raw);
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
      const cost = parseKes(this.unitCost.value);
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
    const unitCost = difference > 0 ? parseKes(this.unitCost.value) : undefined;
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
      await this.loadHistory();
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

  protected async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const result = await this.history.history({
        variantId: this.historyVariantId(),
        search: this.historySearch.value,
        page: this.historyPage(),
        pageSize: this.historyPageSize,
      });
      this.historyRows.set(result.rows);
      this.historyTotal.set(result.total);
    } catch (err) {
      this.historyError.set(err instanceof Error ? err.message : 'Adjustment history failed');
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected showAllHistory(): void {
    this.historyVariantId.set(null);
    this.historyPage.set(1);
    void this.loadHistory();
  }

  protected changeHistoryPage(page: number): void {
    this.historyPage.set(page);
    void this.loadHistory();
  }

  protected historyProduct(row: StockAdjustmentHistoryRow): string {
    return row.variant_name && row.variant_name !== 'Default'
      ? `${row.product_name} · ${row.variant_name}`
      : row.product_name;
  }

  protected time(value: string): string {
    return new Date(value).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected signedValue(row: StockAdjustmentHistoryRow): string {
    const prefix = row.quantity_change < 0 ? '−' : '+';
    return `${prefix}${formatKes(row.stock_value)}`;
  }
}
