import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BusinessClockService } from '../core/business-clock.service';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKes } from '../core/money';
import { manufacturerLabel } from '../core/product-identity';
import {
  EMPTY_PRODUCT_PERFORMANCE,
  type ProductPerformanceCategory,
  type ProductPerformanceResponse,
} from '../core/product-performance.models';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { variantLabel } from '../pos/pos.service';
import { RestockIntelligenceComponent } from '../reports/restock-intelligence.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { DemandConfidenceIndicatorComponent } from '../shared/ui/demand-confidence-indicator.component';
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
  type ProductDecision,
  type ProductIntelligenceSummary,
} from './insights.models';

type InventoryView = 'priorities' | 'performance' | 'sources';

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
    DemandConfidenceIndicatorComponent,
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
            [advanced]="view() !== 'performance'"
            [loading]="loading()"
            (valueChange)="setWindow($event)"
            (rangeChange)="setCustomRange($event)"
          />

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
              [class.section-tab-active]="view() === 'performance'"
              [attr.aria-selected]="view() === 'performance'"
              (click)="setView('performance')"
            >
              Performance
            </button>
            @if (permissions.has('ViewFinancials')) {
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="view() === 'sources'"
                [attr.aria-selected]="view() === 'sources'"
                (click)="setView('sources')"
              >
                Sources
              </button>
            }
          </div>
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
      } @else if (view() === 'performance') {
        <section class="card overflow-hidden bg-base-100" aria-labelledby="performance-title">
          <div class="border-b border-base-300 p-4">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="performance-title" class="section-title">Product performance</h3>
                <p class="type-caption mt-1">
                  Separate, explainable leaders. Factual sales stay visible while unusual spikes are
                  adjusted for ranking.
                </p>
              </div>
              @if (locations.isMultiLocation()) {
                <label class="form-control min-w-48">
                  <span class="label-text text-xs">Location</span>
                  <select
                    class="select select-bordered min-h-11"
                    [value]="locations.activeId()"
                    (change)="setLocation($event)"
                  >
                    @for (location of locations.locations(); track location.id) {
                      <option [value]="location.id">{{ location.name }}</option>
                    }
                  </select>
                </label>
              }
            </div>
            <div role="tablist" aria-label="Performance category" class="section-tabs mt-4">
              @for (category of performanceCategories(); track category) {
                <button
                  role="tab"
                  type="button"
                  class="section-tab"
                  [class.section-tab-active]="performanceCategory() === category"
                  [attr.aria-selected]="performanceCategory() === category"
                  (click)="setPerformanceCategory(category)"
                >
                  {{ performanceLabel(category) }}
                </button>
              }
            </div>
          </div>

          @if (error()) {
            <div role="alert" class="alert alert-error m-4 text-sm">
              <app-icon name="heroExclamationTriangle" />{{ error() }}
            </div>
          } @else if (loading() && performanceRows().length === 0) {
            <div
              class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60"
            >
              <span class="loading loading-spinner"></span>Loading performance
            </div>
          } @else if (performanceRows().length === 0) {
            <app-empty-state
              [embedded]="true"
              icon="heroChartBar"
              title="No eligible leaders yet"
              description="This category needs repeat orders and selling days before a product can lead."
            />
          } @else {
            <div class="grid gap-3 p-4 lg:grid-cols-2">
              @for (item of performanceRows(); track item.variant_id) {
                <article class="rounded-box border border-base-300 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <a
                        class="link block truncate font-semibold"
                        [routerLink]="['/insights/inventory', item.variant_id]"
                      >
                        {{ item.product_name }}
                      </a>
                      <p class="mt-0.5 text-sm text-base-content/70">
                        {{ manufacturerName(item) }}
                      </p>
                      <p class="text-xs text-base-content/50">
                        {{ item.variant_name }} · {{ item.stock_unit }}
                      </p>
                    </div>
                    <app-demand-confidence
                      [value]="item.confidence ?? item.demandConfidence ?? 'low'"
                    />
                  </div>
                  @if (item.outlier_detected) {
                    <span class="badge badge-warning badge-soft badge-sm mt-2"
                      >Unusual spike adjusted</span
                    >
                  }
                  <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt class="type-caption">Factual units</dt>
                      <dd class="font-semibold">{{ item.current_quantity | number: '1.0-3' }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">Adjusted units</dt>
                      <dd class="font-semibold">{{ item.robust_quantity | number: '1.0-3' }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">Previous adjusted</dt>
                      <dd class="font-semibold">
                        {{ item.previous_robust_quantity | number: '1.0-3' }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">Breadth</dt>
                      <dd class="font-semibold">
                        {{ item.order_count }} orders · {{ item.active_days }} days
                      </dd>
                    </div>
                  </dl>
                  <div
                    class="mt-3 flex flex-wrap justify-between gap-2 border-t border-base-200 pt-3 text-xs text-base-content/70"
                  >
                    <span
                      >{{ item.stock | number: '1.0-3' }} on hand · Planning pace · up to 90 days ·
                      {{
                        item.days_of_cover === null
                          ? 'no cover'
                          : (item.days_of_cover | number: '1.0-1') + ' days cover'
                      }}</span
                    >
                    @if (performance().financialsIncluded && permissions.has('ViewFinancials')) {
                      <span
                        >Margin {{ fmt(item.margin ?? 0) }} · sales
                        {{ fmt(item.revenue ?? 0) }}</span
                      >
                    }
                  </div>
                </article>
              }
            </div>
          }
        </section>
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
              <label class="form-control min-w-48 flex-1 sm:max-w-56">
                <span class="label-text text-xs">Decision</span>
                <select
                  class="select select-bordered mt-1 min-h-11 w-full"
                  [value]="decisionFilter()"
                  (change)="setDecision($event)"
                >
                  <option value="">All decisions</option>
                  <option value="stockout">Stockout</option>
                  <option value="reorder">Restock now</option>
                  <option value="low_cover">Plan reorder</option>
                  <option value="slow">Slow-moving</option>
                  <option value="insufficient_history">Insufficient history</option>
                  <option value="healthy">Stock healthy</option>
                </select>
              </label>
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
              <div class="form-control min-w-56 flex-1 sm:max-w-72">
                <span class="label-text text-xs">Product</span>
                <app-searchable-filter
                  class="mt-1"
                  ariaLabel="Filter inventory by product"
                  placeholder="All products"
                  searchPlaceholder="Search products, variants, or SKUs…"
                  controlSize="md"
                  [maxResults]="20"
                  [options]="productOptions()"
                  [value]="productFilter()"
                  (valueChange)="setProduct($event)"
                />
              </div>
              @if (filterCount() > 0) {
                <button appButton variant="ghost" type="button" (click)="clearFilters()">
                  Clear {{ filterCount() }}
                </button>
              }
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
              @if (decisionFilter()) {
                <span class="badge badge-neutral badge-soft badge-sm">
                  Showing {{ decisionLabel(decisionFilter()) }}
                </span>
              }
              @if (loading() && products().length > 0) {
                <span class="inline-flex items-center gap-1.5" role="status">
                  <span class="loading loading-spinner loading-xs"></span>Updating results
                </span>
              }
              <span>
                Ordered by urgency, then stock cover and demand. Cover and reorder use Planning pace
                · up to 90 days. Supplier means the latest matching posted purchase source.
              </span>
            </div>
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
            [title]="emptyStateTitle()"
            [description]="emptyStateDescription()"
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
                    <th class="text-right">Planning cover</th>
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
                    <tr class="align-top">
                      <td class="max-w-72">
                        <a
                          class="block truncate font-semibold link link-hover"
                          routerLink="/inventory/products"
                          [queryParams]="{ product: item.product_id, variant: item.variant_id }"
                          >{{ item.product_name }}</a
                        >
                        <p class="mt-0.5 truncate text-sm text-base-content/70">
                          {{ manufacturerName(item) }}
                        </p>
                        <p class="truncate text-xs text-base-content/50">
                          {{ productContext(item) }}
                        </p>
                      </td>
                      <td class="max-w-56">
                        <span class="badge" [class]="signalClass(item.signal)">{{
                          signalLabel(item.signal)
                        }}</span>
                        <p class="mt-1 text-xs leading-relaxed text-base-content/60">
                          {{ copy(item.reason_code) }}
                        </p>
                        <div class="mt-1 flex flex-wrap gap-1">
                          @if (item.demand_confidence) {
                            <app-demand-confidence [value]="item.demand_confidence" />
                          }
                          @if (item.outlier_detected) {
                            <span class="badge badge-warning badge-soft badge-xs"
                              >Unusual spike adjusted</span
                            >
                          }
                        </div>
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
                      <td class="text-right font-semibold tabular-nums">
                        {{ item.current_stock | number: '1.0-3' }}
                      </td>
                      <td class="text-right text-base-content/65 tabular-nums">
                        {{ cover(item) }}
                      </td>
                      <td class="text-right font-semibold tabular-nums">{{ reorder(item) }}</td>
                      @if (financialsIncluded()) {
                        <td class="text-right text-base-content/70 tabular-nums">
                          {{ fmt(item.net_revenue ?? 0) }}
                        </td>
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
                      <a
                        class="block truncate font-semibold link link-hover"
                        routerLink="/inventory/products"
                        [queryParams]="{ product: item.product_id, variant: item.variant_id }"
                        >{{ item.product_name }}</a
                      >
                      <p class="mt-0.5 truncate text-sm text-base-content/70">
                        {{ manufacturerName(item) }}
                      </p>
                      <p class="truncate text-xs text-base-content/50">
                        {{ productContext(item) }}
                      </p>
                    </div>
                    <span class="badge shrink-0" [class]="signalClass(item.signal)">{{
                      signalLabel(item.signal)
                    }}</span>
                  </div>
                  <p class="text-sm text-base-content/65">{{ copy(item.reason_code) }}</p>
                  <div class="flex flex-wrap gap-1">
                    @if (item.demand_confidence) {
                      <app-demand-confidence [value]="item.demand_confidence" />
                    }
                    @if (item.outlier_detected) {
                      <span class="badge badge-warning badge-soft badge-xs"
                        >Unusual spike adjusted</span
                      >
                    }
                  </div>
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
                      <dt class="type-caption">Planning cover</dt>
                      <dd class="text-base-content/70 tabular-nums">{{ cover(item) }}</dd>
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly view = signal<InventoryView>('priorities');
  protected readonly businessToday = signal('');
  protected readonly periodPreset = signal<DateRangePreset | null>(30);
  protected readonly windowDays = signal<DateRangePreset>(30);
  protected readonly rangeFrom = signal('');
  protected readonly rangeTo = signal('');
  protected readonly productFilter = signal('');
  protected readonly supplierFilter = signal('');
  protected readonly manufacturerFilter = signal('');
  protected readonly decisionFilter = signal<ProductDecision | ''>('');
  protected readonly products = signal<ProductDemandSummary[]>([]);
  protected readonly performance = signal<ProductPerformanceResponse>(EMPTY_PRODUCT_PERFORMANCE);
  protected readonly performanceCategory = signal<ProductPerformanceCategory>('trending');
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

  protected readonly performanceCategories = computed<ProductPerformanceCategory[]>(() =>
    this.permissions.has('ViewFinancials')
      ? ['trending', 'volume', 'margin', 'consistent']
      : ['trending', 'volume', 'consistent']
  );
  protected readonly performanceRows = computed(() =>
    this.performanceCategory() === 'margin' && !this.permissions.has('ViewFinancials')
      ? []
      : this.performance().leaders[this.performanceCategory()]
  );

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
  protected readonly productOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.catalog
      .catalog()
      .filter(
        variant =>
          !!variant.variant_id &&
          variant.variant_active &&
          variant.product_active &&
          variant.track_inventory &&
          variant.kind !== 'service'
      )
      .map(variant => ({
        value: variant.variant_id!,
        label: variantLabel(variant),
        description: [variant.sku, variant.stock_unit].filter(Boolean).join(' · '),
        searchText: [variant.barcode, variant.manufacturer_name].filter(Boolean).join(' '),
      }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.description.localeCompare(b.description))
  );
  protected readonly filterCount = computed(
    () =>
      Number(Boolean(this.productFilter())) +
      Number(Boolean(this.supplierFilter())) +
      Number(Boolean(this.manufacturerFilter())) +
      Number(Boolean(this.decisionFilter()))
  );
  protected readonly emptyStateTitle = computed(() =>
    this.decisionFilter()
      ? `No ${this.decisionLabel(this.decisionFilter()).toLowerCase()} products match`
      : 'No inventory matches these filters'
  );
  protected readonly emptyStateDescription = computed(() =>
    this.decisionFilter()
      ? 'Try another decision or clear a source filter. New stock signals normally appear within two minutes.'
      : 'Clear a source filter or search another product. New stock signals normally appear within two minutes.'
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
      this.restoreViewFromUrl();
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
    if (this.view() !== 'sources') void this.load();
  }

  protected setCustomRange(range: AppliedDateRange): void {
    if (this.view() === 'performance') return;
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
    if (value === 'performance' && this.periodPreset() === null) {
      const today = this.businessToday();
      const range = presetDateRange(today, 30);
      this.periodPreset.set(30);
      this.windowDays.set(30);
      this.rangeFrom.set(range.from);
      this.rangeTo.set(range.to);
    }
    this.view.set(value);
    this.syncViewToUrl();
    if (value !== 'sources') void this.load();
  }

  protected setPerformanceCategory(value: ProductPerformanceCategory): void {
    if (value === 'margin' && !this.permissions.has('ViewFinancials')) return;
    this.performanceCategory.set(value);
    this.syncViewToUrl();
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

  protected setProduct(value: string): void {
    this.productFilter.set(value);
    void this.load();
  }

  protected setDecision(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.decisionFilter.set(this.isProductDecision(value) ? value : '');
    this.syncViewToUrl();
    void this.load();
  }

  protected clearFilters(): void {
    this.productFilter.set('');
    this.supplierFilter.set('');
    this.manufacturerFilter.set('');
    this.decisionFilter.set('');
    this.syncViewToUrl();
    void this.load();
  }

  protected async load(): Promise<void> {
    const locationId = this.locations.activeId();
    if (!locationId) return;
    if (this.view() === 'performance') {
      await this.loadPerformance(locationId);
      return;
    }
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
        search: this.selectedProductSearch(),
        decision: this.decisionFilter() || null,
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

  private async loadPerformance(locationId: string): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const performance = await this.insights.productPerformance(this.windowDays(), locationId, 25);
      if (request !== this.request) return;
      this.performance.set(performance);
      if (this.performanceCategory() === 'margin' && !performance.financialsIncluded) {
        this.performanceCategory.set('trending');
      }
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(
        error instanceof Error ? error.message : 'Could not load product performance.'
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
        search: this.selectedProductSearch(),
        decision: this.decisionFilter() || null,
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
    return value && this.isProductDecision(value) ? this.decisionLabel(value) : 'Updating';
  }

  protected signalClass(value: string | null): string {
    if (value === 'stockout') return 'badge-error';
    if (value === 'reorder' || value === 'low_cover') return 'badge-warning';
    if (value === 'slow') return 'badge-info';
    if (value === 'insufficient_history') return 'badge-neutral';
    if (value === 'healthy') return 'badge-success';
    return 'badge-ghost';
  }

  protected performanceLabel(value: ProductPerformanceCategory): string {
    if (value === 'trending') return 'Trending';
    if (value === 'volume') return 'Volume';
    if (value === 'margin') return 'Margin';
    return 'Consistency';
  }

  protected manufacturerName(item: {
    manufacturer_name?: string | null;
    identity_resolution?: 'resolved' | 'unresolved';
  }): string {
    return manufacturerLabel(item);
  }

  protected productContext(item: ProductDemandSummary): string {
    return [
      item.variant_name,
      item.sku,
      item.stock_unit,
      item.preferred_supplier_name ? `Supplier: ${item.preferred_supplier_name}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected decisionLabel(value: ProductDecision | ''): string {
    if (value === 'stockout') return 'Stockout';
    if (value === 'reorder') return 'Restock now';
    if (value === 'low_cover') return 'Plan reorder';
    if (value === 'slow') return 'Slow-moving';
    if (value === 'insufficient_history') return 'Insufficient history';
    if (value === 'healthy') return 'Stock healthy';
    return 'All decisions';
  }

  private selectedProductSearch(): string | null {
    const variantId = this.productFilter();
    if (!variantId) return null;
    return (
      this.catalog
        .catalog()
        .find(variant => variant.variant_id === variantId)
        ?.sku?.trim() || null
    );
  }

  private restoreViewFromUrl(): void {
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view === 'performance' || view === 'priorities') this.view.set(view);
    if (view === 'sources' && this.permissions.has('ViewFinancials')) this.view.set(view);
    const leader = this.route.snapshot.queryParamMap.get('leader');
    if (
      leader === 'trending' ||
      leader === 'volume' ||
      leader === 'consistent' ||
      (leader === 'margin' && this.permissions.has('ViewFinancials'))
    ) {
      this.performanceCategory.set(leader);
    }
    const decision = this.route.snapshot.queryParamMap.get('decision');
    if (decision && this.isProductDecision(decision)) this.decisionFilter.set(decision);
  }

  private isProductDecision(value: string): value is ProductDecision {
    return (
      value === 'stockout' ||
      value === 'reorder' ||
      value === 'low_cover' ||
      value === 'slow' ||
      value === 'insufficient_history' ||
      value === 'healthy'
    );
  }

  private syncViewToUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        view: this.view() === 'priorities' ? null : this.view(),
        leader: this.view() === 'performance' ? this.performanceCategory() : null,
        decision:
          this.view() === 'priorities' && this.decisionFilter() ? this.decisionFilter() : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
