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
  imports: [RouterLink, EmptyStateComponent, IconComponent, RestockTrendChartComponent],
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

          <button
            type="button"
            class="btn btn-ghost btn-square min-h-11 min-w-11"
            title="Refresh restocking data"
            aria-label="Refresh restocking data"
            [disabled]="loading() || !hasScope()"
            (click)="load()"
          >
            <app-icon name="heroArrowPath" />
          </button>
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

        <div class="grid grid-cols-2 border-y border-base-300 bg-base-100 xl:grid-cols-5">
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
                  <app-restock-trend-chart [points]="data.trend" [metric]="trendMetric()" />
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

          <div
            class="mt-4 overflow-hidden border-y border-base-300 bg-base-100 lg:rounded-box lg:border"
          >
            <div
              class="flex flex-wrap items-end justify-between gap-2 border-b border-base-300 px-4 py-3"
            >
              <div>
                <h3 class="section-title">Restocking decisions</h3>
                <p class="type-caption mt-1">
                  Urgent products first, based on stock and recent demand.
                </p>
              </div>
              <span class="type-caption">Top {{ data.products.length }} products</span>
            </div>

            <div class="divide-y divide-base-200 lg:hidden">
              @for (product of displayProducts(); track product.variantId) {
                <a
                  class="block p-4 hover:bg-base-200/40"
                  routerLink="/inventory/products"
                  [queryParams]="{ product: product.productId, variant: product.variantId }"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ product.label }}</p>
                      <p class="type-caption mt-1 truncate">
                        {{ productContext(product) }}
                      </p>
                    </div>
                    <span class="badge badge-sm shrink-0" [class]="decisionClass(product)">
                      {{ product.decision.label }}
                    </span>
                  </div>
                  <div class="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p class="type-caption">Sold</p>
                      <p class="font-semibold tabular-nums">
                        {{ quantity(product.currentQuantity) }}
                      </p>
                      <p
                        class="text-xs"
                        [class.text-success]="product.currentQuantity > product.previousQuantity"
                        [class.text-error]="product.currentQuantity < product.previousQuantity"
                      >
                        {{ product.changeLabel }}
                      </p>
                    </div>
                    <div>
                      <p class="type-caption">In stock</p>
                      <p class="font-semibold tabular-nums">{{ quantity(product.stock) }}</p>
                      @if (scopeMode() === 'supplier') {
                        <p class="text-xs text-base-content/60">
                          {{ quantity(product.supplierStock) }} sourced here
                        </p>
                      }
                    </div>
                    <div>
                      <p class="type-caption">Cover</p>
                      <p class="font-semibold tabular-nums">{{ daysCover(product.daysCover) }}</p>
                    </div>
                  </div>
                </a>
              }
            </div>

            <div class="hidden overflow-x-auto lg:block">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Demand trend</th>
                    <th class="text-right">Units sold</th>
                    <th class="text-right">Stock</th>
                    <th class="text-right">Cover</th>
                    <th class="text-right">Last cost</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  @for (product of displayProducts(); track product.variantId) {
                    <tr>
                      <td class="max-w-64">
                        <a
                          class="link block truncate font-medium"
                          routerLink="/inventory/products"
                          [queryParams]="{ product: product.productId, variant: product.variantId }"
                        >
                          {{ product.label }}
                        </a>
                        <p class="type-caption truncate">
                          {{ productContext(product) }}
                          @if (product.lastSoldOn) {
                            · sold {{ shortDate(product.lastSoldOn) }}
                          }
                        </p>
                      </td>
                      <td class="w-36">
                        <div
                          class="flex h-9 items-end gap-0.5"
                          role="img"
                          [attr.aria-label]="product.label + ' daily sales trend'"
                        >
                          @for (height of product.trendHeights; track $index) {
                            <span
                              class="min-w-1 flex-1 rounded-t-field bg-primary/70"
                              [style.height.%]="height"
                            ></span>
                          }
                        </div>
                      </td>
                      <td class="text-right">
                        <p class="font-medium tabular-nums">
                          {{ quantity(product.currentQuantity) }}
                        </p>
                        <p
                          class="text-xs tabular-nums"
                          [class.text-success]="product.currentQuantity > product.previousQuantity"
                          [class.text-error]="product.currentQuantity < product.previousQuantity"
                        >
                          {{ product.changeLabel }}
                        </p>
                      </td>
                      <td class="text-right">
                        <p class="font-medium tabular-nums">{{ quantity(product.stock) }}</p>
                        @if (scopeMode() === 'supplier') {
                          <p class="text-xs text-base-content/60">
                            {{ quantity(product.supplierStock) }} from supplier
                          </p>
                        } @else {
                          <p class="text-xs text-base-content/60">
                            {{ fmt(product.stockValue) }} value
                          </p>
                        }
                      </td>
                      <td class="text-right font-medium tabular-nums">
                        {{ daysCover(product.daysCover) }}
                      </td>
                      <td class="text-right">
                        <p class="font-medium tabular-nums">
                          {{ product.lastUnitCost === null ? '—' : fmt(product.lastUnitCost) }}
                        </p>
                        <p class="type-caption">
                          {{
                            product.lastPurchaseDate
                              ? shortDate(product.lastPurchaseDate)
                              : 'No receipt'
                          }}
                        </p>
                      </td>
                      <td>
                        <span class="badge badge-sm" [class]="decisionClass(product)">
                          {{ product.decision.label }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class RestockIntelligenceComponent implements OnInit {
  readonly since = input.required<string>();
  readonly until = input.required<string>();

  private readonly reports = inject(ReportsService);
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
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly ready = signal(false);
  private request = 0;

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
    this.selectedLocation.set((event.target as HTMLSelectElement).value);
    void this.load();
  }

  protected async load(since = this.since(), until = this.until()): Promise<void> {
    const locationId = this.selectedLocation();
    const supplierId = this.scopeMode() === 'supplier' ? this.selectedSupplier() : null;
    const manufacturerId = this.scopeMode() === 'manufacturer' ? this.selectedManufacturer() : null;
    const request = ++this.request;
    if (!locationId || (!supplierId && !manufacturerId)) {
      this.loading.set(false);
      this.error.set(null);
      this.report.set(null);
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
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(error instanceof Error ? error.message : 'Could not load restocking data');
    } finally {
      if (request === this.request) this.loading.set(false);
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
}
