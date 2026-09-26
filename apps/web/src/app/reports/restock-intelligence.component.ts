import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogCacheService } from '../core/catalog-cache.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { InsightsService } from '../insights/insights.service';
import type { ProductProfile } from '../insights/insights.models';
import { ProductActivityChartComponent } from '../insights/product-activity-chart.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import {
  coverWidth,
  quantityChangeLabel,
  restockDecision,
  sparklineHeights,
} from './restock-intelligence';
import { RestockTrendChartComponent } from './restock-trend-chart.component';
import {
  ReportsService,
  type RestockIntelligence,
  type RestockProductRow,
} from './reports.service';

type ScopeMode = 'supplier' | 'manufacturer';
type TrendMetric = 'quantity' | 'revenue';

type DisplayProduct = RestockProductRow & {
  label: string;
  decision: ReturnType<typeof restockDecision>;
  changeLabel: string;
  trendHeights: number[];
};

@Component({
  selector: 'app-restock-intelligence',
  imports: [
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    ProductActivityChartComponent,
    RestockTrendChartComponent,
  ],
  template: `
    <section aria-labelledby="restock-title">
      <div class="border-y border-base-300 bg-base-100 px-3 py-3 sm:px-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <span class="label-text text-xs">Product source</span>
            <div class="mt-1 flex min-h-11 rounded-field border border-base-300 bg-base-200/40 p-1">
              <button
                type="button"
                class="flex min-w-28 items-center justify-center gap-2 rounded-field px-3 text-sm"
                [class.bg-base-100]="scopeMode() === 'supplier'"
                [class.font-semibold]="scopeMode() === 'supplier'"
                [attr.aria-pressed]="scopeMode() === 'supplier'"
                [disabled]="loading() || supplierOptions().length === 0"
                (click)="setScopeMode('supplier')"
              >
                <app-icon name="heroTruck" /> Supplier
              </button>
              <button
                type="button"
                class="flex min-w-32 items-center justify-center gap-2 rounded-field px-3 text-sm"
                [class.bg-base-100]="scopeMode() === 'manufacturer'"
                [class.font-semibold]="scopeMode() === 'manufacturer'"
                [attr.aria-pressed]="scopeMode() === 'manufacturer'"
                [disabled]="loading() || manufacturerOptions().length === 0"
                (click)="setScopeMode('manufacturer')"
              >
                <app-icon name="heroCube" /> Manufacturer
              </button>
            </div>
          </div>

          <label class="form-control min-w-56 flex-1 sm:max-w-80">
            <span class="label-text text-xs">
              {{ scopeMode() === 'supplier' ? 'Supplier' : 'Manufacturer' }}
            </span>
            @if (scopeMode() === 'supplier') {
              <select
                class="select select-bordered min-h-11 w-full"
                [value]="selectedSupplier()"
                [disabled]="loading()"
                (change)="setSupplier($event)"
              >
                @for (supplier of supplierOptions(); track supplier.id) {
                  <option [value]="supplier.id">{{ supplier.label }}</option>
                }
              </select>
            } @else {
              <select
                class="select select-bordered min-h-11 w-full"
                [value]="selectedManufacturer()"
                [disabled]="loading()"
                (change)="setManufacturer($event)"
              >
                @for (manufacturer of manufacturerOptions(); track manufacturer.id) {
                  <option [value]="manufacturer.id">{{ manufacturer.name }}</option>
                }
              </select>
            }
          </label>

          <label class="form-control min-w-52 sm:max-w-64">
            <span class="label-text text-xs">Stock location</span>
            <select
              class="select select-bordered min-h-11 w-full"
              [value]="selectedLocation()"
              [disabled]="loading()"
              (change)="setLocation($event)"
            >
              @for (location of locations.locations(); track location.id) {
                <option [value]="location.id">{{ location.name }}</option>
              }
            </select>
          </label>
        </div>
      </div>

      @if (!hasAnySource()) {
        <app-empty-state
          [compact]="true"
          icon="heroTruck"
          title="Add a supplier or manufacturer first"
          description="Restocking performance is grouped by the source you buy from."
        />
      } @else if (error()) {
        <div role="alert" class="alert alert-error my-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="load()">Retry</button>
        </div>
      } @else if (loading() && !report()) {
        <div role="status" class="flex min-h-72 items-center justify-center gap-2 text-sm">
          <span class="loading loading-spinner loading-sm"></span>
          Loading restocking performance
        </div>
      } @else if (report(); as data) {
        <header class="flex flex-wrap items-end justify-between gap-2 py-4">
          <div>
            <h2 id="restock-title" class="type-title">{{ selectedScopeName() }}</h2>
            <p class="type-caption mt-1">
              {{ selectedLocationName() }} · {{ data.days }} days · compared with the previous equal
              period
            </p>
          </div>
          @if (loading()) {
            <span class="flex items-center gap-2 text-xs text-base-content/60">
              <span class="loading loading-spinner loading-xs"></span> Refreshing
            </span>
          }
        </header>

        <div
          class="grid grid-cols-2 border-y border-base-300 bg-base-100 lg:grid-cols-3 xl:grid-cols-6"
        >
          <div class="border-b border-r border-base-300 px-4 py-3 xl:border-b-0">
            <p class="type-caption">Products</p>
            <p class="type-title mt-1 tabular-nums">{{ data.summary.products }}</p>
          </div>
          <div class="border-b border-base-300 px-4 py-3 xl:border-b-0 xl:border-r">
            <p class="type-caption">Units sold</p>
            <p class="type-title mt-1 tabular-nums">{{ quantity(data.summary.unitsSold) }}</p>
          </div>
          <div class="border-b border-r border-base-300 px-4 py-3 xl:border-b-0">
            <p class="type-caption">Sales</p>
            <p class="type-title mt-1 tabular-nums">{{ fmt(data.summary.sales) }}</p>
          </div>
          <div class="border-b border-base-300 px-4 py-3 xl:border-b-0 xl:border-r">
            <p class="type-caption">Stock on hand</p>
            <p class="type-title mt-1 tabular-nums">{{ quantity(data.summary.stock) }}</p>
          </div>
          <div class="border-b border-r border-base-300 px-4 py-3 xl:border-b-0">
            <p class="type-caption">Stock at cost</p>
            <p class="type-title mt-1 tabular-nums">{{ fmt(data.summary.stockValue) }}</p>
          </div>
          <div class="col-span-2 px-4 py-3 xl:col-span-1">
            <p class="type-caption">Needs attention</p>
            <p
              class="type-title mt-1 tabular-nums"
              [class.text-error]="data.summary.restockRisks > 0"
            >
              {{ data.summary.restockRisks }}
            </p>
          </div>
        </div>

        @if (data.products.length === 0) {
          <app-empty-state
            [compact]="true"
            icon="heroCube"
            title="No stocked products for this source"
            description="Try another location, supplier, manufacturer, or reporting period."
          />
        } @else {
          <div class="mt-4 grid items-start gap-4 xl:grid-cols-12">
            <article class="card overflow-hidden bg-base-100 xl:col-span-8">
              <div
                class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
              >
                <div>
                  <h3 class="section-title">Demand trend</h3>
                  <p class="type-caption mt-1">Completed sales for the selected product source.</p>
                </div>
                <div class="flex rounded-field border border-base-300 bg-base-200/40 p-1">
                  <button
                    type="button"
                    class="min-h-11 rounded-field px-3 text-xs"
                    [class.bg-base-100]="trendMetric() === 'quantity'"
                    [class.font-semibold]="trendMetric() === 'quantity'"
                    (click)="trendMetric.set('quantity')"
                  >
                    Units
                  </button>
                  <button
                    type="button"
                    class="min-h-11 rounded-field px-3 text-xs"
                    [class.bg-base-100]="trendMetric() === 'revenue'"
                    [class.font-semibold]="trendMetric() === 'revenue'"
                    (click)="trendMetric.set('revenue')"
                  >
                    Sales
                  </button>
                </div>
              </div>
              <div class="p-4">
                @if (trendHasData()) {
                  <app-restock-trend-chart
                    [points]="data.trend"
                    [metric]="trendMetric()"
                    [loading]="loading()"
                  />
                } @else {
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroChartBar"
                    title="No sales in these periods"
                    description="Stock remains visible while demand data builds from completed sales."
                  />
                }
              </div>
            </article>

            <article class="card overflow-hidden bg-base-100 xl:col-span-4">
              <div class="border-b border-base-300 px-4 py-3">
                <h3 class="section-title">Stock coverage</h3>
                <p class="type-caption mt-1">Days on hand at the current sales pace.</p>
              </div>
              @if (coverageProducts().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroCube"
                  title="No recent demand"
                  description="Coverage appears after products begin selling."
                />
              } @else {
                <div class="divide-y divide-base-200 px-4">
                  @for (product of coverageProducts(); track product.variantId) {
                    <div class="py-3">
                      <div class="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span class="truncate font-medium">{{ product.label }}</span>
                        <span class="shrink-0 tabular-nums">{{
                          daysCover(product.daysCover)
                        }}</span>
                      </div>
                      <div class="relative h-2 overflow-hidden rounded-field bg-base-200">
                        <span
                          class="absolute inset-y-0 left-[23.33%] z-10 border-l border-error/70"
                        ></span>
                        <span
                          class="block h-full rounded-field"
                          [class.bg-error]="product.decision.tone === 'error'"
                          [class.bg-warning]="product.decision.tone === 'warning'"
                          [class.bg-info]="product.decision.tone === 'info'"
                          [class.bg-success]="product.decision.tone === 'success'"
                          [style.width.%]="coverageWidth(product.daysCover)"
                        ></span>
                      </div>
                    </div>
                  }
                </div>
                <p class="border-t border-base-300 px-4 py-2 text-xs text-base-content/60">
                  Marker shows 14 days of cover.
                </p>
              }
            </article>
          </div>

          <article class="card mt-4 bg-base-100" aria-labelledby="product-focus-title">
            <div class="card-body gap-4 p-4 sm:p-5">
              <header class="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="product-focus-title" class="section-title">Product explorer</h3>
                  <p class="type-caption mt-1">
                    Inspect one item's demand and stock without leaving this source analysis.
                  </p>
                </div>
                <label class="form-control w-full sm:w-auto sm:min-w-80">
                  <span class="label-text text-xs">Product</span>
                  <select
                    class="select select-bordered min-h-11 w-full"
                    [value]="focusedVariantId()"
                    [disabled]="focusLoading()"
                    (change)="setFocusedProduct($event)"
                  >
                    @for (product of displayProducts(); track product.variantId) {
                      <option [value]="product.variantId">{{ product.label }}</option>
                    }
                  </select>
                </label>
              </header>

              @if (focusedProduct(); as product) {
                <div
                  class="flex flex-wrap items-start justify-between gap-3 rounded-box border border-base-300 bg-base-200/30 p-3"
                >
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="font-semibold">{{ product.label }}</h4>
                      <span class="badge badge-sm" [class]="decisionClass(product)">
                        {{ product.decision.label }}
                      </span>
                    </div>
                    <p class="type-caption mt-1">{{ decisionExplanation(product) }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a
                      class="btn btn-primary btn-sm min-h-11"
                      [routerLink]="['/insights/inventory', product.variantId]"
                    >
                      View full insight
                    </a>
                    <a
                      class="btn btn-ghost btn-sm min-h-11"
                      routerLink="/inventory/products"
                      [queryParams]="{ product: product.productId, variant: product.variantId }"
                    >
                      Inventory record
                    </a>
                  </div>
                </div>
              }

              @if (focusError()) {
                <div role="alert" class="alert alert-error text-sm">
                  <app-icon name="heroExclamationTriangle" />{{ focusError() }}
                </div>
              } @else if (focusLoading() && !focusedProfile()) {
                <div class="flex min-h-56 items-center justify-center gap-2 text-sm">
                  <span class="loading loading-spinner loading-sm"></span>Loading product activity
                </div>
              } @else if (focusedProfile(); as profile) {
                <app-product-activity-chart
                  [trend]="profile.trend"
                  [positions]="profile.positions"
                  [loading]="focusLoading()"
                />
              }
            </div>
          </article>

          <section class="mt-4" aria-labelledby="restocking-decisions-title">
            <header class="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="restocking-decisions-title" class="section-title">Restocking decisions</h3>
                <p class="type-caption mt-1">
                  Urgent products first. Each card explains the signal and opens its own insight.
                </p>
              </div>
              <span class="type-caption">Top {{ data.products.length }} products</span>
            </header>

            <div class="grid gap-3 lg:grid-cols-2">
              @for (product of displayProducts(); track product.variantId) {
                <article
                  class="card border border-base-300 bg-base-100"
                  [class.border-primary]="focusedVariantId() === product.variantId"
                >
                  <div class="card-body gap-4 p-4">
                    <header class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <a
                          class="link block truncate font-semibold"
                          [routerLink]="['/insights/inventory', product.variantId]"
                        >
                          {{ product.label }}
                        </a>
                        <p class="type-caption mt-1 truncate">
                          {{ productContext(product) }}
                          @if (product.lastSoldOn) {
                            · last sold {{ shortDate(product.lastSoldOn) }}
                          }
                        </p>
                      </div>
                      <span class="badge badge-sm shrink-0" [class]="decisionClass(product)">
                        {{ product.decision.label }}
                      </span>
                    </header>

                    <div
                      class="flex h-16 items-end gap-1 rounded-field bg-base-200/40 px-3 pt-2"
                      role="img"
                      [attr.aria-label]="product.label + ' daily units sold'"
                    >
                      @for (height of product.trendHeights; track $index) {
                        <span
                          class="min-w-1 flex-1 rounded-t-field bg-primary/70"
                          [style.height.%]="height"
                        ></span>
                      }
                    </div>

                    <p class="text-sm">{{ decisionExplanation(product) }}</p>

                    <dl class="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt class="type-caption">Sold</dt>
                        <dd class="font-semibold tabular-nums">
                          {{ quantity(product.currentQuantity) }}
                        </dd>
                        <dd
                          class="text-xs"
                          [class.text-success]="product.currentQuantity > product.previousQuantity"
                          [class.text-error]="product.currentQuantity < product.previousQuantity"
                        >
                          {{ product.changeLabel }}
                        </dd>
                      </div>
                      <div>
                        <dt class="type-caption">In stock</dt>
                        <dd class="font-semibold tabular-nums">{{ quantity(product.stock) }}</dd>
                        <dd class="text-xs text-base-content/55">
                          {{ fmt(product.stockValue) }} at cost
                        </dd>
                      </div>
                      <div>
                        <dt class="type-caption">Cover</dt>
                        <dd class="font-semibold tabular-nums">
                          {{ daysCover(product.daysCover) }}
                        </dd>
                        <dd class="text-xs text-base-content/55">
                          Cost
                          {{
                            product.lastUnitCost === null ? 'unknown' : fmt(product.lastUnitCost)
                          }}
                        </dd>
                      </div>
                    </dl>

                    <footer
                      class="flex flex-wrap items-center justify-between gap-2 border-t border-base-200 pt-3"
                    >
                      <span class="type-caption">
                        {{
                          product.lastPurchaseDate
                            ? 'Last receipt ' + shortDate(product.lastPurchaseDate)
                            : 'No posted receipt'
                        }}
                      </span>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm min-h-11"
                          [disabled]="focusLoading() && focusedVariantId() === product.variantId"
                          (click)="focusProduct(product.variantId)"
                        >
                          Show graph
                        </button>
                        <a
                          class="btn btn-ghost btn-sm min-h-11"
                          [routerLink]="['/insights/inventory', product.variantId]"
                        >
                          Insight
                        </a>
                      </div>
                    </footer>
                  </div>
                </article>
              }
            </div>
          </section>
        }
      }
    </section>
  `,
})
export class RestockIntelligenceComponent implements OnInit {
  readonly since = input.required<string>();
  readonly until = input.required<string>();
  readonly refreshToken = input(0);

  private readonly reports = inject(ReportsService);
  private readonly insights = inject(InsightsService);
  private readonly catalog = inject(CatalogCacheService);
  private readonly parties = inject(PartyCacheService);
  protected readonly locations = inject(LocationContextService);

  protected readonly fmt = formatKes;
  protected readonly scopeMode = signal<ScopeMode>('supplier');
  protected readonly trendMetric = signal<TrendMetric>('quantity');
  protected readonly selectedSupplier = signal('');
  protected readonly selectedManufacturer = signal('');
  protected readonly selectedLocation = signal('');
  protected readonly report = signal<RestockIntelligence | null>(null);
  protected readonly focusedVariantId = signal('');
  protected readonly focusedProfile = signal<ProductProfile | null>(null);
  protected readonly focusLoading = signal(false);
  protected readonly focusError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly ready = signal(false);
  private request = 0;
  private focusRequest = 0;

  protected readonly supplierOptions = computed(() =>
    this.parties
      .suppliers()
      .filter(supplier => supplier.supplier_active && !supplier.deleted_at)
      .map(supplier => ({
        id: supplier.id,
        label: [supplier.first_name, supplier.last_name].filter(Boolean).join(' '),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  protected readonly manufacturerOptions = computed(() =>
    [...this.catalog.manufacturers()].sort((a, b) => a.name.localeCompare(b.name))
  );
  protected readonly hasAnySource = computed(
    () => this.supplierOptions().length > 0 || this.manufacturerOptions().length > 0
  );
  protected readonly hasScope = computed(() =>
    this.scopeMode() === 'supplier' ? !!this.selectedSupplier() : !!this.selectedManufacturer()
  );
  protected readonly selectedScopeName = computed(() => {
    if (this.scopeMode() === 'supplier') {
      return (
        this.supplierOptions().find(item => item.id === this.selectedSupplier())?.label ??
        'Supplier'
      );
    }
    return (
      this.manufacturerOptions().find(item => item.id === this.selectedManufacturer())?.name ??
      'Manufacturer'
    );
  });
  protected readonly selectedLocationName = computed(
    () =>
      this.locations.locations().find(item => item.id === this.selectedLocation())?.name ??
      'Location'
  );
  protected readonly displayProducts = computed<DisplayProduct[]>(() => {
    const data = this.report();
    if (!data) return [];
    return data.products.map(product => ({
      ...product,
      label:
        !product.variantName || product.variantName === 'Default'
          ? product.productName
          : `${product.productName} — ${product.variantName}`,
      decision: restockDecision(product, data.lowStockThreshold),
      changeLabel: quantityChangeLabel(product.currentQuantity, product.previousQuantity),
      trendHeights: sparklineHeights(product.trend),
    }));
  });
  protected readonly coverageProducts = computed(() =>
    this.displayProducts()
      .filter(product => product.currentQuantity > 0 && product.daysCover !== null)
      .sort((a, b) => (a.daysCover ?? Infinity) - (b.daysCover ?? Infinity))
      .slice(0, 8)
  );
  protected readonly focusedProduct = computed(
    () =>
      this.displayProducts().find(product => product.variantId === this.focusedVariantId()) ?? null
  );
  protected readonly trendHasData = computed(() => {
    const data = this.report();
    if (!data) return false;
    return data.trend.some(point =>
      this.trendMetric() === 'quantity'
        ? point.currentQuantity > 0 || point.previousQuantity > 0
        : point.currentRevenue > 0 || point.previousRevenue > 0
    );
  });

  constructor() {
    effect(() => {
      const since = this.since();
      const until = this.until();
      this.refreshToken();
      if (!this.ready()) return;
      untracked(() => void this.load(since, until));
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.catalog.ensureLoaded(),
      this.parties.ensureLoaded(),
      this.locations.load(),
    ]);
    const suppliers = this.supplierOptions();
    const manufacturers = this.manufacturerOptions();
    if (suppliers.length > 0) {
      this.selectedSupplier.set(suppliers[0].id);
    } else if (manufacturers.length > 0) {
      this.scopeMode.set('manufacturer');
      this.selectedManufacturer.set(manufacturers[0].id);
    }
    if (manufacturers.length > 0 && !this.selectedManufacturer()) {
      this.selectedManufacturer.set(manufacturers[0].id);
    }
    this.selectedLocation.set(this.locations.activeId() ?? this.locations.locations()[0]?.id ?? '');
    this.ready.set(true);
  }

  protected setScopeMode(mode: ScopeMode): void {
    if (this.scopeMode() === mode) return;
    this.scopeMode.set(mode);
    if (mode === 'supplier' && !this.selectedSupplier()) {
      this.selectedSupplier.set(this.supplierOptions()[0]?.id ?? '');
    }
    if (mode === 'manufacturer' && !this.selectedManufacturer()) {
      this.selectedManufacturer.set(this.manufacturerOptions()[0]?.id ?? '');
    }
    void this.load();
  }

  protected setSupplier(event: Event): void {
    this.selectedSupplier.set((event.target as HTMLSelectElement).value);
    void this.load();
  }

  protected setManufacturer(event: Event): void {
    this.selectedManufacturer.set((event.target as HTMLSelectElement).value);
    void this.load();
  }

  protected setLocation(event: Event): void {
    const locationId = (event.target as HTMLSelectElement).value;
    this.selectedLocation.set(locationId);
    this.locations.select(locationId);
    void this.load();
  }

  protected setFocusedProduct(event: Event): void {
    this.focusProduct((event.target as HTMLSelectElement).value);
  }

  protected focusProduct(variantId: string): void {
    if (!variantId) return;
    this.focusedVariantId.set(variantId);
    void this.loadFocusedProfile(variantId, this.since(), this.until());
  }

  protected async load(since = this.since(), until = this.until()): Promise<void> {
    const locationId = this.selectedLocation();
    const supplierId = this.scopeMode() === 'supplier' ? this.selectedSupplier() : null;
    const manufacturerId = this.scopeMode() === 'manufacturer' ? this.selectedManufacturer() : null;
    const request = ++this.request;
    if (!locationId || (!supplierId && !manufacturerId)) {
      this.focusRequest += 1;
      this.loading.set(false);
      this.error.set(null);
      this.report.set(null);
      this.focusedVariantId.set('');
      this.focusedProfile.set(null);
      this.focusLoading.set(false);
      this.focusError.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const report = await this.reports.restockIntelligence(
        since,
        until,
        locationId,
        { supplierId, manufacturerId },
        50
      );
      if (request !== this.request) return;
      this.report.set(report);
      const focused = report.products.some(product => product.variantId === this.focusedVariantId())
        ? this.focusedVariantId()
        : (report.products[0]?.variantId ?? '');
      this.focusedVariantId.set(focused);
      if (focused) {
        void this.loadFocusedProfile(focused, since, until);
      } else {
        this.focusRequest += 1;
        this.focusedProfile.set(null);
        this.focusLoading.set(false);
        this.focusError.set(null);
      }
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load restocking data');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  private async loadFocusedProfile(variantId: string, since: string, until: string): Promise<void> {
    const locationId = this.selectedLocation();
    if (!variantId || !locationId) return;
    const request = ++this.focusRequest;
    if (this.focusedProfile()?.variant.id !== variantId) {
      this.focusedProfile.set(null);
    }
    this.focusLoading.set(true);
    this.focusError.set(null);
    try {
      const profile = await this.insights.productProfile(variantId, locationId, since, until);
      if (request !== this.focusRequest || variantId !== this.focusedVariantId()) return;
      this.focusedProfile.set(profile);
    } catch (error) {
      if (request !== this.focusRequest) return;
      this.focusedProfile.set(null);
      this.focusError.set(
        error instanceof Error ? error.message : 'Could not load this product activity.'
      );
    } finally {
      if (request === this.focusRequest) this.focusLoading.set(false);
    }
  }

  protected quantity(value: number): string {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  }

  protected daysCover(value: number | null): string {
    if (value === null) return 'No pace';
    if (value > 365) return '365+ days';
    return `${value.toLocaleString('en-KE', { maximumFractionDigits: 1 })} days`;
  }

  protected coverageWidth(value: number | null): number {
    return coverWidth(value);
  }

  protected shortDate(value: string): string {
    return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(
      new Date(`${value}T00:00:00Z`)
    );
  }

  protected productContext(product: DisplayProduct): string {
    if (this.scopeMode() === 'manufacturer' && product.lastSupplierName) {
      return `Last supplied by ${product.lastSupplierName}`;
    }
    return product.manufacturerName || 'Manufacturer not set';
  }

  protected decisionClass(product: DisplayProduct): string {
    return `badge-${product.decision.tone}`;
  }

  protected decisionExplanation(product: DisplayProduct): string {
    const stock = this.quantity(product.stock);
    const sold = this.quantity(product.currentQuantity);
    switch (product.decision.tone) {
      case 'error':
        return `${sold} units sold in the period with ${stock} left. Replenish before the next likely sale.`;
      case 'warning':
        return `${this.daysCover(product.daysCover)} remains at the current pace. Prepare the next purchase.`;
      case 'info':
        return `Demand is ${product.changeLabel} versus the previous period; watch cover as sales accelerate.`;
      case 'success':
        return `${this.daysCover(product.daysCover)} remains and demand is supported by current stock.`;
      default:
        return `No meaningful recent demand. Hold purchasing until the sales pattern becomes clearer.`;
    }
  }
}
