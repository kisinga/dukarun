import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessClockService } from '../core/business-clock.service';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { RestockIntelligenceComponent } from '../reports/restock-intelligence.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../shared/ui/searchable-filter.component';
import { DateRangePresetControlComponent } from './date-range-preset-control.component';
import { presetDateRange, type AppliedDateRange } from './date-range';
import { InsightsService } from './insights.service';
import {
  insightCopy,
  type DateRangePreset,
  type ProductDemandSummary,
  type ProductIntelligenceSummary,
} from './insights.models';

type InventoryView = 'priorities' | 'sources';

const EMPTY_SUMMARY: ProductIntelligenceSummary = {
  trackedVariants: 0,
  needsAttention: 0,
  stockouts: 0,
  unitsSold: 0,
  stockOnHand: 0,
  stockValue: null,
  netRevenue: null,
  margin: null,
};

@Component({
  selector: 'app-products-insights',
  imports: [
    DecimalPipe,
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    SearchableFilterComponent,
    DateRangePresetControlComponent,
    RestockIntelligenceComponent,
  ],
  template: `
    <section class="space-y-4">
      <section class="card overflow-hidden bg-base-100">
        <div class="card-body gap-4 p-4 sm:p-5">
          <header class="flex items-start justify-between gap-3">
            <div class="max-w-2xl">
              <h2 id="inventory-workspace-title" class="section-title">Inventory decisions</h2>
              <p class="type-caption mt-1">
                Start with stock risk and replenishment. Switch to source analysis when deciding
                what to buy from a supplier or how a manufacturer's range is performing.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Refresh inventory intelligence"
              aria-label="Refresh inventory intelligence"
              [loading]="loading()"
              (click)="refreshActiveView()"
            >
              <app-icon name="heroArrowPath" />
            </button>
          </header>

          <app-date-range-preset-control
            [value]="periodPreset()"
            [from]="rangeFrom()"
            [to]="rangeTo()"
            [maxDate]="businessToday()"
            [advanced]="true"
            [loading]="loading()"
            (valueChange)="setWindow($event)"
            (rangeChange)="setCustomRange($event)"
          />

          @if (permissions.has('ViewFinancials')) {
            <div role="tablist" aria-label="Inventory analysis view" class="section-tabs">
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="view() === 'priorities'"
                [attr.aria-selected]="view() === 'priorities'"
                (click)="setView('priorities')"
              >
                Priorities
              </button>
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="view() === 'sources'"
                [attr.aria-selected]="view() === 'sources'"
                (click)="setView('sources')"
              >
                Supplier & manufacturer
              </button>
            </div>
          }
        </div>
      </section>

      @if (view() === 'sources' && permissions.has('ViewFinancials')) {
        @if (rangeFrom() && rangeTo()) {
          <app-restock-intelligence
            [since]="rangeFrom()"
            [until]="rangeTo()"
            [refreshToken]="sourceRefreshToken()"
          />
        }
      } @else {
        <section aria-label="Inventory summary" class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Needs action</span>
              <strong
                class="text-2xl tabular-nums"
                [class.text-error]="summary().needsAttention > 0"
                >{{ summary().needsAttention }}</strong
              >
              <span class="text-xs text-base-content/60">{{ summary().stockouts }} stockouts</span>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Units sold</span>
              <strong class="text-2xl tabular-nums">{{
                summary().unitsSold | number: '1.0-3'
              }}</strong>
              <span class="text-xs text-base-content/60">selected period</span>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Stock on hand</span>
              <strong class="text-2xl tabular-nums">{{
                summary().stockOnHand | number: '1.0-3'
              }}</strong>
              <span class="text-xs text-base-content/60"
                >{{ summary().trackedVariants }} tracked variants</span
              >
            </div>
          </div>
          @if (financialsIncluded()) {
            <div class="card bg-base-100">
              <div class="card-body gap-1 p-3 sm:p-4">
                <span class="type-caption">Stock at cost</span>
                <strong class="text-2xl tabular-nums">{{ fmt(summary().stockValue ?? 0) }}</strong>
                <span class="text-xs text-base-content/60"
                  >Net sales {{ fmt(summary().netRevenue ?? 0) }} · margin
                  {{ fmt(summary().margin ?? 0) }}</span
                >
              </div>
            </div>
          } @else {
            <div class="card bg-base-100">
              <div class="card-body gap-1 p-3 sm:p-4">
                <span class="type-caption">Tracked range</span>
                <strong class="text-2xl tabular-nums">{{ summary().trackedVariants }}</strong>
                <span class="text-xs text-base-content/60">active inventory variants</span>
              </div>
            </div>
          }
        </section>

        <section class="card bg-base-100">
          <div class="card-body gap-3 p-4">
            <div class="flex flex-wrap items-end gap-3">
              @if (locations.isMultiLocation()) {
                <label class="form-control min-w-48">
                  <span class="label-text text-xs">Location</span>
                  <select
                    class="select select-bordered min-h-11 w-full"
                    [value]="locations.activeId()"
                    (change)="setLocation($event)"
                  >
                    @for (location of locations.locations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </label>
              }
              <div class="form-control min-w-48 flex-1 sm:max-w-64">
                <span class="label-text text-xs">Supplier</span>
                <app-searchable-filter
                  class="mt-1"
                  ariaLabel="Filter inventory by supplier"
                  placeholder="All suppliers"
                  searchPlaceholder="Search suppliers…"
                  controlSize="md"
                  [options]="supplierOptions()"
                  [value]="supplierFilter()"
                  (valueChange)="setSupplier($event)"
                />
              </div>
              <div class="form-control min-w-48 flex-1 sm:max-w-64">
                <span class="label-text text-xs">Manufacturer</span>
                <app-searchable-filter
                  class="mt-1"
                  ariaLabel="Filter inventory by manufacturer"
                  placeholder="All manufacturers"
                  searchPlaceholder="Search manufacturers…"
                  controlSize="md"
                  [options]="manufacturerOptions()"
                  [value]="manufacturerFilter()"
                  (valueChange)="setManufacturer($event)"
                />
              </div>
              <label class="input input-bordered flex min-h-11 min-w-56 flex-1 items-center gap-2">
                <app-icon name="heroMagnifyingGlass" />
                <input
                  class="grow"
                  type="search"
                  aria-label="Search inventory"
                  placeholder="Product, variant, or SKU"
                  [value]="search()"
                  (input)="updateSearch($event)"
                  (keyup.enter)="load()"
                />
              </label>
              @if (filterCount() > 0) {
                <button appButton variant="ghost" type="button" (click)="clearFilters()">
                  Clear {{ filterCount() }}
                </button>
              }
            </div>
            <p class="type-caption">
              Ordered by urgency, then stock cover and demand. Supplier means the latest matching
              posted purchase source.
            </p>
          </div>
        </section>

        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />{{ error() }}
          </div>
        } @else if (loading() && products().length === 0) {
          <div class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner"></span>Loading inventory decisions
          </div>
        } @else if (products().length === 0) {
          <app-empty-state
            icon="heroCube"
            title="No inventory matches these filters"
            description="Clear a source filter or search another product. New stock signals normally appear within two minutes."
          />
        } @else {
          <div class="card overflow-hidden bg-base-100">
            <div class="hidden overflow-x-auto lg:block">
              <table class="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Decision</th>
                    <th class="text-right">Sold</th>
                    <th class="text-right">Change</th>
                    <th class="text-right">On hand</th>
                    <th class="text-right">Cover</th>
                    <th class="text-right">Reorder</th>
                    @if (financialsIncluded()) {
                      <th class="text-right">Net sales</th>
                      <th class="text-right">Margin</th>
                    }
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of products(); track item.variant_id) {
                    <tr>
                      <td class="max-w-72">
                        <p class="truncate font-semibold">{{ item.product_name }}</p>
                        <p class="type-caption truncate">
                          {{ item.variant_name }} · {{ item.stock_unit }}
                        </p>
                        <p class="type-caption truncate">{{ sourceContext(item) }}</p>
                      </td>
                      <td class="max-w-56">
                        <span class="badge" [class]="signalClass(item.signal)">{{
                          signalLabel(item.signal)
                        }}</span>
                        <p class="type-caption mt-1">{{ copy(item.reason_code) }}</p>
                      </td>
                      <td class="text-right tabular-nums">
                        {{ item.current_quantity | number: '1.0-3' }}
                      </td>
                      <td
                        class="text-right tabular-nums"
                        [class.text-success]="change(item) > 0"
                        [class.text-error]="change(item) < 0"
                      >
                        {{ change(item) > 0 ? '+' : '' }}{{ change(item) | number: '1.0-1' }}%
                      </td>
                      <td class="text-right tabular-nums">
                        {{ item.current_stock | number: '1.0-3' }}
                      </td>
                      <td class="text-right tabular-nums">{{ cover(item) }}</td>
                      <td class="text-right font-semibold tabular-nums">{{ reorder(item) }}</td>
                      @if (financialsIncluded()) {
                        <td class="text-right tabular-nums">{{ fmt(item.net_revenue ?? 0) }}</td>
                        <td
                          class="text-right tabular-nums"
                          [class.text-success]="(item.margin ?? 0) > 0"
                          [class.text-error]="(item.margin ?? 0) < 0"
                        >
                          {{ fmt(item.margin ?? 0) }}
                        </td>
                      }
                      <td>
                        <a
                          class="btn btn-ghost btn-sm min-h-11"
                          [routerLink]="['/insights/inventory', item.variant_id]"
                          >Profile</a
                        >
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="divide-y divide-base-200 lg:hidden">
              @for (item of products(); track item.variant_id) {
                <article class="space-y-3 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ item.product_name }}</p>
                      <p class="type-caption truncate">
                        {{ item.variant_name }} · {{ sourceContext(item) }}
                      </p>
                    </div>
                    <span class="badge shrink-0" [class]="signalClass(item.signal)">{{
                      signalLabel(item.signal)
                    }}</span>
                  </div>
                  <p class="text-sm">{{ copy(item.reason_code) }}</p>
                  <dl class="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt class="type-caption">Sold</dt>
                      <dd class="font-semibold tabular-nums">
                        {{ item.current_quantity | number: '1.0-3' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">On hand</dt>
                      <dd class="font-semibold tabular-nums">
                        {{ item.current_stock | number: '1.0-3' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">Cover</dt>
                      <dd class="font-semibold tabular-nums">{{ cover(item) }}</dd>
                    </div>
                  </dl>
                  <div class="flex items-center justify-between gap-3">
                    <p class="type-caption">
                      Reorder <strong>{{ reorder(item) }}</strong>
                    </p>
                    <a
                      class="btn btn-ghost btn-sm min-h-11"
                      [routerLink]="['/insights/inventory', item.variant_id]"
                      >Profile</a
                    >
                  </div>
                </article>
              }
            </div>
          </div>

          @if (nextOffset() !== null) {
            <div class="flex justify-center">
              <button
                appButton
                variant="ghost"
                type="button"
                [loading]="loadingMore()"
                (click)="loadMore()"
              >
                Load more
              </button>
            </div>
          }
        }
      }
    </section>
  `,
})
export class ProductsInsightsComponent implements OnInit {
  protected readonly locations = inject(LocationContextService);
  protected readonly permissions = inject(PermissionsService);
  private readonly insights = inject(InsightsService);
  private readonly businessClock = inject(BusinessClockService);
  private readonly catalog = inject(CatalogCacheService);
  private readonly parties = inject(PartyCacheService);

  protected readonly view = signal<InventoryView>('priorities');
  protected readonly businessToday = signal('');
  protected readonly periodPreset = signal<DateRangePreset | null>(30);
  protected readonly windowDays = signal<DateRangePreset>(30);
  protected readonly rangeFrom = signal('');
  protected readonly rangeTo = signal('');
  protected readonly search = signal('');
  protected readonly supplierFilter = signal('');
  protected readonly manufacturerFilter = signal('');
  protected readonly products = signal<ProductDemandSummary[]>([]);
  protected readonly summary = signal<ProductIntelligenceSummary>(EMPTY_SUMMARY);
  protected readonly financialsIncluded = signal(false);
  protected readonly nextOffset = signal<number | null>(null);
  protected readonly sourceRefreshToken = signal(0);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;
  private request = 0;

  protected readonly supplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.parties
      .suppliers()
      .filter(supplier => supplier.supplier_active && !supplier.deleted_at)
      .map(supplier => ({
        value: supplier.id,
        label: [supplier.first_name, supplier.last_name].filter(Boolean).join(' '),
        description: supplier.phone || undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  protected readonly manufacturerOptions = computed<readonly SearchableFilterOption[]>(() =>
    [...this.catalog.manufacturers()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(manufacturer => ({ value: manufacturer.id, label: manufacturer.name }))
  );
  protected readonly filterCount = computed(
    () =>
      Number(Boolean(this.search().trim())) +
      Number(Boolean(this.supplierFilter())) +
      Number(Boolean(this.manufacturerFilter()))
  );

  async ngOnInit(): Promise<void> {
    try {
      const [, , , today] = await Promise.all([
        this.locations.load(),
        this.catalog.ensureLoaded(),
        this.parties.ensureLoaded(),
        this.businessClock.today(),
      ]);
      this.businessToday.set(today);
      const range = presetDateRange(today, 30);
      this.rangeFrom.set(range.from);
      this.rangeTo.set(range.to);
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not prepare inventory intelligence.'
      );
    }
  }

  protected setWindow(value: DateRangePreset): void {
    const today = this.businessToday();
    if (!today) return;
    const range = presetDateRange(today, value);
    this.periodPreset.set(value);
    this.windowDays.set(value);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    if (this.view() === 'priorities') void this.load();
  }

  protected setCustomRange(range: AppliedDateRange): void {
    this.periodPreset.set(null);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    if (this.view() === 'priorities') void this.load();
  }

  protected refreshActiveView(): void {
    if (this.view() === 'sources') {
      this.sourceRefreshToken.update(value => value + 1);
    } else {
      void this.load();
    }
  }

  protected setView(value: InventoryView): void {
    if (this.view() === value) return;
    this.view.set(value);
    if (value === 'priorities') void this.load();
  }

  protected setLocation(event: Event): void {
    this.locations.select((event.target as HTMLSelectElement).value);
    void this.load();
  }

  protected setSupplier(value: string): void {
    this.supplierFilter.set(value);
    void this.load();
  }

  protected setManufacturer(value: string): void {
    this.manufacturerFilter.set(value);
    void this.load();
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.supplierFilter.set('');
    this.manufacturerFilter.set('');
    void this.load();
  }

  protected async load(): Promise<void> {
    const locationId = this.locations.activeId();
    if (!locationId) return;
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.insights.products({
        windowDays: this.windowDays(),
        ...(this.periodPreset() === null ? { since: this.rangeFrom(), until: this.rangeTo() } : {}),
        locationId,
        supplierId: this.supplierFilter() || null,
        manufacturerId: this.manufacturerFilter() || null,
        search: this.search().trim() || null,
      });
      if (request !== this.request) return;
      this.products.set(data.items);
      this.summary.set(data.summary);
      this.nextOffset.set(data.nextOffset);
      this.financialsIncluded.set(data.financialsIncluded);
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(
        error instanceof Error ? error.message : 'Could not load inventory intelligence.'
      );
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const locationId = this.locations.activeId();
    const offset = this.nextOffset();
    if (!locationId || offset === null) return;
    const request = this.request;
    this.loadingMore.set(true);
    try {
      const data = await this.insights.products({
        windowDays: this.windowDays(),
        ...(this.periodPreset() === null ? { since: this.rangeFrom(), until: this.rangeTo() } : {}),
        locationId,
        supplierId: this.supplierFilter() || null,
        manufacturerId: this.manufacturerFilter() || null,
        search: this.search().trim() || null,
        offset,
      });
      if (request !== this.request) return;
      this.products.update(items => [...items, ...data.items]);
      this.nextOffset.set(data.nextOffset);
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load more inventory.');
    } finally {
      if (request === this.request) this.loadingMore.set(false);
    }
  }

  protected change(item: ProductDemandSummary): number {
    if (item.previous_quantity === 0) return item.current_quantity > 0 ? 100 : 0;
    return ((item.current_quantity - item.previous_quantity) / item.previous_quantity) * 100;
  }

  protected cover(item: ProductDemandSummary): string {
    return item.days_of_cover === null ? '—' : `${item.days_of_cover.toFixed(1)}d`;
  }

  protected reorder(item: ProductDemandSummary): string {
    return item.reorder_quantity === null ? 'Review' : String(item.reorder_quantity);
  }

  protected signalLabel(value: string | null): string {
    return value ? value.replaceAll('_', ' ') : 'Updating';
  }

  protected signalClass(value: string | null): string {
    if (value === 'stockout') return 'badge-error';
    if (value === 'reorder' || value === 'low_cover') return 'badge-warning';
    if (value === 'healthy') return 'badge-success';
    return 'badge-ghost';
  }

  protected sourceContext(item: ProductDemandSummary): string {
    return (
      [item.manufacturer_name, item.preferred_supplier_name].filter(Boolean).join(' · ') ||
      'Source not set'
    );
  }
}
