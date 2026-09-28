import {
  DataTableShellComponent,
  TableRowsDirective,
  type TableColumn,
} from '../shared/ui/data-table-shell.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { StatBarComponent, type StatItem } from '../shared/ui/stat-bar.component';
import { ListStateService } from '../shared/list/list-state';
import { DecimalPipe, formatNumber } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
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
import { SectionTabsComponent } from '../shared/ui/section-tabs.component';
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
  type ProductDecisionFilter,
  type ProductDecisionCounts,
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
    DataTableShellComponent,
    TableRowsDirective,
    ListSearchBarComponent,
    StatBarComponent,
    DecimalPipe,
    RouterLink,
    ButtonComponent,
    DemandConfidenceIndicatorComponent,
    EmptyStateComponent,
    IconComponent,
    SectionTabsComponent,
    SearchableFilterComponent,
    DateRangePresetControlComponent,
    RestockIntelligenceComponent,
  ],
  template: `
    <section class="space-y-4">
      <section class="space-y-3" aria-label="Inventory analysis controls">
        <div class="flex items-center justify-between gap-3">
          <app-section-tabs
            class="min-w-0 flex-1"
            [items]="inventoryViews()"
            [value]="view()"
            ariaLabel="Inventory analysis view"
            (valueChange)="setView($event)"
          />
          <div class="flex items-center gap-2">
            @if (loading()) {
              <span class="type-caption" role="status">Updating</span>
            }
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
          </div>
        </div>

        @if (locations.isMultiLocation() && view() !== 'sources') {
          <label class="flex min-w-0 items-center gap-3">
            <span class="label-text text-xs">Location</span>
            <select
              class="select select-bordered min-h-11 min-w-0 flex-1"
              [value]="locations.activeId()"
              (change)="setLocation($event)"
            >
              @for (location of locations.locations(); track location.id) {
                <option [value]="location.id">{{ location.name }}</option>
              }
            </select>
          </label>
        }
        <section
          class="rounded-box border border-base-300 bg-base-100 p-3 sm:px-4"
          aria-label="Sales period"
        >
          <p class="text-sm font-medium mb-2">Sales in selected period</p>
          <p class="type-caption mb-3">
            Sales evidence uses this period. Stock cover and suggested reorder are current planning
            estimates.
          </p>
          <div class="flex flex-wrap items-end gap-3 pb-3">
            <app-date-range-preset-control
              class="min-w-0 flex-1 md:min-w-[28rem]"
              [value]="periodPreset()"
              [from]="rangeFrom()"
              [to]="rangeTo()"
              [maxDate]="businessToday()"
              [advanced]="view() !== 'performance'"
              [loading]="loading()"
              (valueChange)="setWindow($event)"
              (rangeChange)="setCustomRange($event)"
            />
            @if (view() === 'performance') {
              <label class="form-control w-full sm:w-52">
                <span class="label-text text-xs">Rank by</span>
                <select
                  class="select select-bordered mt-1 min-h-11 w-full"
                  [value]="performanceCategory()"
                  (change)="setPerformanceCategory($event)"
                >
                  @for (category of performanceCategories(); track category) {
                    <option [value]="category">{{ performanceLabel(category) }}</option>
                  }
                </select>
              </label>
            }
          </div>
        </section>
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
            <h2 id="performance-title" class="section-title">
              {{ performanceHeading(performanceCategory()) }}
            </h2>
            <p class="type-caption mt-1">
              Rankings adjust unusual spikes while keeping factual sales visible.
            </p>
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
            <div class="flex flex-wrap items-center gap-3 p-4 sm:p-5">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/30"
              >
                <app-icon name="heroChartBar" size="lg" />
              </div>
              <div class="min-w-52 flex-1">
                <h3 class="text-sm font-semibold">
                  No {{ performanceLabel(performanceCategory()).toLowerCase() }} products yet
                </h3>
                <p class="type-caption mt-0.5">
                  Products need repeat orders across multiple selling days to qualify. Try a longer
                  period.
                </p>
              </div>
              @if (periodPreset() === 30) {
                <button appButton variant="soft" type="button" (click)="setWindow(180)">
                  Use 6 months
                </button>
              } @else if (periodPreset() === 180) {
                <button appButton variant="soft" type="button" (click)="setWindow(365)">
                  Use 12 months
                </button>
              }
            </div>
          } @else {
            <div class="grid gap-3 p-4 lg:grid-cols-2">
              @for (item of performanceRows(); track item.variant_id) {
                <article
                  [attr.data-list-record]="item.variant_id"
                  class="rounded-box border border-base-300 p-4"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <a
                        class="link block truncate font-semibold"
                        [routerLink]="['/insights/inventory', item.variant_id]"
                        [queryParams]="reviewParams()"
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
        <app-list-search-bar
          searchLabel="Search products"
          placeholder="Search products, variants, or SKUs…"
          [searchQuery]="query()"
          (searchQueryChange)="setQuery($event)"
          [filtersEnabled]="true"
          [activeFilterCount]="filterCount()"
          [activeFilters]="filterChips()"
          (removeFilter)="removeFilter($event)"
          (clearFilters)="clearFilters()"
        >
          <div summary class="grid gap-4 lg:grid-cols-[2fr_3fr_3fr]">
            <section class="min-w-0" aria-label="Priority overview">
              <p class="type-caption mb-2 lg:min-h-8">
                Priorities · {{ decisionCounts().all }} variants before priority filtering
              </p>
              <app-stat-bar [stats]="priorityStats()" (select)="toggleDecision($event)" />
            </section>
            <section class="min-w-0" aria-label="Matching inventory summary">
              <p class="type-caption mb-2 lg:min-h-8">Current inventory · matching results</p>
              <app-stat-bar [stats]="inventoryStats()" />
            </section>
            <section class="min-w-0" aria-label="Matching sales summary">
              <p class="type-caption mb-2 lg:min-h-8">Sales · selected period · matching results</p>
              <app-stat-bar [stats]="salesStats()" />
            </section>
          </div>
          <div filters class="flex flex-wrap items-end gap-3">
            <label class="form-control min-w-48 flex-1 sm:max-w-56">
              <span class="label-text text-xs">Decision</span>
              <select
                class="select select-bordered mt-1 min-h-11 w-full"
                [value]="decisionFilter()"
                (change)="setDecision($event)"
              >
                <option value="">All decisions</option>
                <option value="needs_attention">Needs attention</option>
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
          </div>
        </app-list-search-bar>
        <p class="type-caption">
          Current planning estimates: stock cover and reorder use up to 90 days of demand. Ordered
          by urgency, then stock cover and demand. Supplier means the latest matching posted
          purchase source.
        </p>
        @if (decisionFilter()) {
          <p class="type-caption" role="status">
            Matching results after priority filtering: {{ summary().trackedVariants }} variants ·
            {{ summary().needsAttention }} need attention · {{ summary().stockouts }} stockouts.
          </p>
        }

        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />{{ error() }}
            <button appButton variant="ghost" (click)="load()">Retry</button>
          </div>
        }
        @if (loading() && products().length === 0) {
          <div class="flex min-h-56 items-center justify-center gap-2 text-sm text-base-content/60">
            <span class="loading loading-spinner"></span>Loading inventory decisions
          </div>
        } @else if (products().length === 0 && !error()) {
          <app-empty-state
            icon="heroCube"
            [title]="emptyStateTitle()"
            [description]="emptyStateDescription()"
          />
        } @else if (products().length > 0) {
          <div class="bg-base-100 rounded-box">
            <div class="hidden lg:block">
              <app-data-table-shell
                heading="Stock priorities"
                [columns]="priorityColumns"
                tableClass="list-priority-table"
              >
                <ng-template tableRows>
                  @for (item of products(); track item.variant_id) {
                    <tr [attr.data-list-record]="item.variant_id" class="align-top">
                      <td class="max-w-72">
                        <a
                          class="block whitespace-normal break-words font-semibold link link-hover"
                          routerLink="/inventory/products"
                          [queryParams]="{ product: item.product_id, variant: item.variant_id }"
                          >{{ item.product_name }}</a
                        >
                        <p
                          class="mt-0.5 whitespace-normal break-words text-sm text-base-content/70"
                        >
                          {{ manufacturerName(item) }}
                        </p>
                        <p class="whitespace-normal break-words text-xs text-base-content/60">
                          {{ productContext(item) }}
                        </p>
                        @if (item.preferred_supplier_name) {
                          <p
                            class="mt-0.5 whitespace-normal break-words text-xs text-base-content/60"
                          >
                            Supplier: {{ item.preferred_supplier_name }}
                          </p>
                        }
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
                        <p class="font-medium">
                          {{ item.current_quantity | number: '1.0-3' }} {{ item.stock_unit }}
                        </p>
                        <p class="type-caption whitespace-normal">{{ salesChange(item) }}</p>
                      </td>
                      <td class="text-right tabular-nums">{{ cover(item) }}</td>
                      <td class="text-right tabular-nums">
                        {{ item.current_stock | number: '1.0-3' }} {{ item.stock_unit }}
                      </td>
                      <td class="text-right font-semibold tabular-nums">{{ reorder(item) }}</td>
                      <td>
                        <a
                          class="btn btn-ghost btn-sm min-h-11 whitespace-nowrap px-2"
                          [routerLink]="['/insights/inventory', item.variant_id]"
                          [queryParams]="reviewParams()"
                          >Review</a
                        >
                      </td>
                    </tr>
                  }
                </ng-template>
              </app-data-table-shell>
            </div>

            <div class="divide-y divide-base-200 lg:hidden">
              @for (item of products(); track item.variant_id) {
                <article [attr.data-list-record]="item.variant_id" class="space-y-3 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <a
                        class="block whitespace-normal break-words font-semibold link link-hover"
                        routerLink="/inventory/products"
                        [queryParams]="{ product: item.product_id, variant: item.variant_id }"
                        >{{ item.product_name }}</a
                      >
                      <p class="mt-0.5 whitespace-normal break-words text-sm text-base-content/70">
                        {{ manufacturerName(item) }}
                      </p>
                      <p class="whitespace-normal break-words text-xs text-base-content/60">
                        {{ productContext(item) }}
                      </p>
                      @if (item.preferred_supplier_name) {
                        <p
                          class="mt-0.5 whitespace-normal break-words text-xs text-base-content/60"
                        >
                          Supplier: {{ item.preferred_supplier_name }}
                        </p>
                      }
                    </div>
                    <span class="badge shrink-0" [class]="signalClass(item.signal)">{{
                      signalLabel(item.signal)
                    }}</span>
                  </div>
                  <p class="text-sm">
                    <span class="font-medium">Sales in selected period:</span>
                    {{ item.current_quantity | number: '1.0-3' }} {{ item.stock_unit }} ·
                    {{ salesChange(item) }}
                  </p>
                  <dl class="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt class="type-caption">Suggested reorder</dt>
                      <dd class="font-semibold tabular-nums">{{ reorder(item) }}</dd>
                    </div>
                    <div>
                      <dt class="type-caption">On hand</dt>
                      <dd class="font-semibold tabular-nums">
                        {{ item.current_stock | number: '1.0-3' }} {{ item.stock_unit }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">Planning cover</dt>
                      <dd class="text-base-content/70 tabular-nums">{{ cover(item) }}</dd>
                    </div>
                  </dl>
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

                  <div class="flex items-center justify-end gap-3">
                    <a
                      class="btn btn-ghost btn-sm min-h-11"
                      [routerLink]="['/insights/inventory', item.variant_id]"
                      [queryParams]="reviewParams()"
                      >Review</a
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
export class ProductsInsightsComponent implements OnInit, OnDestroy {
  protected readonly priorityColumns: TableColumn[] = [
    { key: 'product', label: 'Product', pinned: true, width: '22%' },
    { key: 'priority', label: 'Priority', width: '23%' },
    { key: 'sales', label: 'Period sales', align: 'right', width: '15%' },
    { key: 'cover', label: 'Cover (days)', align: 'right', width: '8%' },
    { key: 'stock', label: 'On hand', align: 'right', width: '9%' },
    { key: 'reorder', label: 'Suggested reorder', align: 'right', width: '13%' },
    { key: 'review', label: 'Review', width: '10%' },
  ];
  private readonly listState = inject(ListStateService);
  protected readonly query = signal('');
  protected readonly decisionCounts = signal<ProductDecisionCounts>({
    all: 0,
    needsAttention: 0,
    stockouts: 0,
  });
  protected readonly priorityStats = computed<StatItem[]>(() => [
    {
      label: 'Needs attention',
      value: this.decisionCounts().needsAttention,
      tone: 'warning',
      emphasis: 'primary',
      filter: 'needs_attention',
      active: this.decisionFilter() === 'needs_attention',
    },
    {
      label: 'Stockouts',
      value: this.decisionCounts().stockouts,
      tone: 'error',
      emphasis: 'primary',
      filter: 'stockout',
      active: this.decisionFilter() === 'stockout',
    },
  ]);
  protected readonly inventoryStats = computed<StatItem[]>(() => [
    {
      label: 'Matching variants',
      value: this.summary().trackedVariants,
    },
    {
      label: 'Stock on hand',
      value: formatNumber(this.summary().stockOnHand, 'en', '1.0-3'),
    },
    ...(this.financialsIncluded()
      ? [
          {
            label: 'Stock at cost',
            value: this.fmt(this.summary().stockValue ?? 0),
          },
        ]
      : []),
  ]);
  protected readonly salesStats = computed<StatItem[]>(() => [
    {
      label: 'Units sold',
      value: formatNumber(this.summary().unitsSold, 'en', '1.0-3'),
    },
    ...(this.financialsIncluded()
      ? [
          {
            label: 'Net sales',
            value: this.fmt(this.summary().netRevenue ?? 0),
          },
          {
            label: 'Margin',
            value: this.fmt(this.summary().margin ?? 0),
            tone: (this.summary().margin ?? 0) < 0 ? ('error' as const) : undefined,
          },
        ]
      : []),
  ]);
  protected readonly filterChips = computed(() => [
    ...(this.decisionFilter()
      ? [{ key: 'decision', label: this.decisionLabel(this.decisionFilter()) }]
      : []),
    ...(this.supplierFilter()
      ? [
          {
            key: 'supplier',
            label:
              this.supplierOptions().find(o => o.value === this.supplierFilter())?.label ??
              'Supplier',
          },
        ]
      : []),
    ...(this.manufacturerFilter()
      ? [
          {
            key: 'manufacturer',
            label:
              this.manufacturerOptions().find(o => o.value === this.manufacturerFilter())?.label ??
              'Manufacturer',
          },
        ]
      : []),
    ...(this.productFilter()
      ? [
          {
            key: 'product',
            label:
              this.productOptions().find(o => o.value === this.productFilter())?.label ??
              'Exact product',
          },
        ]
      : []),
  ]);
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
  protected readonly decisionFilter = signal<ProductDecisionFilter | ''>('');
  protected readonly products = signal<ProductDemandSummary[]>([]);
  protected readonly performance = signal<ProductPerformanceResponse>(EMPTY_PRODUCT_PERFORMANCE);
  protected readonly performanceCategory = signal<ProductPerformanceCategory>('trending');
  protected readonly summary = signal<ProductIntelligenceSummary>(EMPTY_SUMMARY);
  protected readonly financialsIncluded = signal(false);
  protected readonly nextOffset = signal<number | null>(null);
  protected readonly sourceRefreshToken = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly copy = insightCopy;
  protected readonly fmt = formatKes;
  private request = 0;
  private currentListUrl = '';
  private snapshotScope = '';

  protected readonly performanceCategories = computed<ProductPerformanceCategory[]>(() =>
    this.permissions.has('ViewFinancials')
      ? ['trending', 'volume', 'margin', 'consistent']
      : ['trending', 'volume', 'consistent']
  );
  protected readonly inventoryViews = computed(() => [
    { value: 'priorities', label: 'Stock priorities' },
    { value: 'performance', label: 'Product performance' },
    ...(this.permissions.has('ViewFinancials')
      ? [{ value: 'sources', label: 'Supplier performance' }]
      : []),
  ]);
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
      Number(Boolean(this.query())) +
      Number(Boolean(this.productFilter())) +
      Number(Boolean(this.supplierFilter())) +
      Number(Boolean(this.manufacturerFilter())) +
      Number(Boolean(this.decisionFilter()))
  );
  protected readonly emptyStateTitle = computed(() =>
    this.decisionFilter()
      ? `No ${this.decisionLabel(this.decisionFilter()).toLowerCase()} products match`
      : this.filterCount()
        ? 'No inventory matches these filters'
        : 'No tracked inventory yet'
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
      this.snapshotScope = this.listState.scopeToken();
      this.businessToday.set(today);
      this.restoreViewFromUrl();
      this.currentListUrl = this.router.url;
      const cached = this.listState.read<{
        items: ProductDemandSummary[];
        summary: ProductIntelligenceSummary;
        decisionCounts: ProductDecisionCounts;
        nextOffset: number | null;
        financialsIncluded: boolean;
      }>(this.router.url);
      if (cached && this.view() === 'priorities') {
        this.products.set(cached.items);
        this.summary.set(cached.summary);
        this.decisionCounts.set(cached.decisionCounts);
        this.nextOffset.set(cached.nextOffset);
        this.financialsIncluded.set(cached.financialsIncluded);
        this.loading.set(false);
      } else await this.load();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not prepare inventory intelligence.'
      );
      this.loading.set(false);
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
    this.syncViewToUrl();
    if (this.view() !== 'sources') void this.load();
  }

  protected setCustomRange(range: AppliedDateRange): void {
    if (this.view() === 'performance') return;
    this.periodPreset.set(null);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    this.syncViewToUrl();
    if (this.view() === 'priorities') void this.load();
  }

  protected refreshActiveView(): void {
    if (this.view() === 'sources') {
      this.sourceRefreshToken.update(value => value + 1);
    } else {
      void this.load();
    }
  }

  protected setView(value: string): void {
    if (value !== 'priorities' && value !== 'performance' && value !== 'sources') return;
    if (value === 'sources' && !this.permissions.has('ViewFinancials')) return;
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

  protected setPerformanceCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as ProductPerformanceCategory;
    if (!this.performanceCategories().includes(value)) return;
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
    this.syncViewToUrl();
    this.loadingMore.set(false);
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
        search: this.query() || null,
        variantId: this.productFilter() || null,
        decision: this.decisionFilter() || null,
      });
      if (request !== this.request) return;
      this.snapshotScope = this.listState.scopeToken();
      this.products.set(data.items);
      this.summary.set(data.summary);
      this.decisionCounts.set(data.decisionCounts);
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
    if (!locationId || offset === null || this.loadingMore() || this.loading()) return;
    const request = this.request;
    this.loadingMore.set(true);
    try {
      const data = await this.insights.products({
        windowDays: this.windowDays(),
        ...(this.periodPreset() === null ? { since: this.rangeFrom(), until: this.rangeTo() } : {}),
        locationId,
        supplierId: this.supplierFilter() || null,
        manufacturerId: this.manufacturerFilter() || null,
        search: this.query() || null,
        variantId: this.productFilter() || null,
        decision: this.decisionFilter() || null,
        offset,
      });
      if (request !== this.request) return;
      this.snapshotScope = this.listState.scopeToken();
      this.products.update(items => [...items, ...data.items]);
      this.nextOffset.set(data.nextOffset);
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load more inventory.');
    } finally {
      if (request === this.request) this.loadingMore.set(false);
    }
  }

  protected salesChange(item: ProductDemandSummary): string {
    if (item.previous_quantity === 0)
      return item.current_quantity === 0 ? 'No sales in either period' : 'No previous sales';
    const change = this.change(item);
    return `${change > 0 ? '+' : ''}${change.toLocaleString('en-KE', { maximumFractionDigits: 1 })}% vs previous period`;
  }

  protected change(item: ProductDemandSummary): number {
    if (item.previous_quantity === 0) return item.current_quantity > 0 ? 100 : 0;
    return ((item.current_quantity - item.previous_quantity) / item.previous_quantity) * 100;
  }

  protected cover(item: ProductDemandSummary): string {
    return item.days_of_cover === null ? '—' : `${item.days_of_cover.toFixed(1)}d`;
  }

  protected reorder(item: ProductDemandSummary): string {
    return item.reorder_quantity === null
      ? 'Review history'
      : `${item.reorder_quantity} ${item.stock_unit}`;
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
    if (value === 'volume') return 'Top volume';
    if (value === 'margin') return 'Best margin';
    return 'Most consistent';
  }

  protected performanceHeading(value: ProductPerformanceCategory): string {
    if (value === 'trending') return 'Trending products';
    if (value === 'volume') return 'Top-volume products';
    if (value === 'margin') return 'Best-margin products';
    return 'Most consistent products';
  }

  protected manufacturerName(item: {
    manufacturer_name?: string | null;
    identity_resolution?: 'resolved' | 'unresolved';
  }): string {
    return manufacturerLabel(item);
  }

  protected productContext(item: ProductDemandSummary): string {
    return [item.variant_name, item.sku, item.stock_unit].filter(Boolean).join(' · ');
  }

  protected decisionLabel(value: ProductDecisionFilter | ''): string {
    if (value === 'needs_attention') return 'Needs attention';
    if (value === 'stockout') return 'Stockout';
    if (value === 'reorder') return 'Restock now';
    if (value === 'low_cover') return 'Plan reorder';
    if (value === 'slow') return 'Slow-moving';
    if (value === 'insufficient_history') return 'Insufficient history';
    if (value === 'healthy') return 'Stock healthy';
    return 'All decisions';
  }

  protected setQuery(value: string): void {
    this.query.set(value);
    void this.load();
  }
  protected toggleDecision(value: string): void {
    this.decisionFilter.set(
      this.decisionFilter() === value ? '' : (value as ProductDecisionFilter)
    );
    void this.load();
  }
  protected removeFilter(key: string): void {
    if (key === 'query') this.query.set('');
    if (key === 'decision') this.decisionFilter.set('');
    if (key === 'supplier') this.supplierFilter.set('');
    if (key === 'manufacturer') this.manufacturerFilter.set('');
    if (key === 'product') this.productFilter.set('');
    void this.load();
  }
  protected reviewParams(): Record<string, string | number | null> {
    return {
      returnTo: this.router.url,
      period: this.periodPreset(),
      from: this.rangeFrom(),
      to: this.rangeTo(),
    };
  }
  ngOnDestroy(): void {
    this.request++;
    if (this.view() === 'priorities' && this.products().length && !this.loading() && !this.error())
      this.listState.save(
        this.currentListUrl,
        {
          items: this.products(),
          summary: this.summary(),
          decisionCounts: this.decisionCounts(),
          nextOffset: this.nextOffset(),
          financialsIncluded: this.financialsIncluded(),
        },
        this.snapshotScope
      );
  }

  private restoreViewFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    this.query.set(params.get('search') ?? '');
    this.productFilter.set(params.get('product') ?? params.get('variant') ?? '');
    this.supplierFilter.set(params.get('supplier') ?? '');
    this.manufacturerFilter.set(params.get('manufacturer') ?? '');
    const period = Number(params.get('period') ?? 30);
    const validPeriod: DateRangePreset =
      period === 7 || period === 180 || period === 365 ? period : 30;
    this.periodPreset.set(validPeriod);
    this.windowDays.set(validPeriod);
    const range = presetDateRange(this.businessToday(), validPeriod);
    const from = params.get('from'),
      to = params.get('to');
    if (
      from &&
      to &&
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to) &&
      from <= to &&
      to <= this.businessToday()
    ) {
      this.periodPreset.set(null);
      this.rangeFrom.set(from);
      this.rangeTo.set(to);
    } else {
      this.rangeFrom.set(range.from);
      this.rangeTo.set(range.to);
    }
    const view = params.get('view');
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

  private isProductDecision(value: string): value is ProductDecisionFilter {
    return (
      value === 'needs_attention' ||
      value === 'stockout' ||
      value === 'reorder' ||
      value === 'low_cover' ||
      value === 'slow' ||
      value === 'insufficient_history' ||
      value === 'healthy'
    );
  }

  private syncViewToUrl(): void {
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        search: this.query() || null,
        product: this.productFilter() || null,
        supplier: this.supplierFilter() || null,
        manufacturer: this.manufacturerFilter() || null,
        period: this.periodPreset() === 30 ? null : this.periodPreset(),
        from: this.periodPreset() === null ? this.rangeFrom() : null,
        to: this.periodPreset() === null ? this.rangeTo() : null,
        view: this.view() === 'priorities' ? null : this.view(),
        leader: this.view() === 'performance' ? this.performanceCategory() : null,
        decision:
          this.view() === 'priorities' && this.decisionFilter() ? this.decisionFilter() : null,
      },
      queryParamsHandling: 'merge',
    });
    this.currentListUrl = tree.toString();
    if (this.currentListUrl !== this.router.url)
      void this.router.navigateByUrl(tree, { replaceUrl: true });
  }
}
