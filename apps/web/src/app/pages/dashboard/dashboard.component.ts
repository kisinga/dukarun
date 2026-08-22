import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes } from '../../core/money';
import { Company, SupabaseService } from '../../core/supabase.service';
import { PermissionsService } from '../../core/permissions.service';
import { SyncService } from '../../pos/offline/sync.service';
import { PosService, variantLabel, type Variant } from '../../pos/pos.service';
import {
  DashboardDailySummary,
  DashboardLocationSummary,
  DashboardPeriodComparison,
  DashboardProductSignals,
  DashboardTopVariant,
  ExpiringBatch,
  LowStockVariant,
  ReportsService,
} from '../../reports/reports.service';
import { LocationContextService } from '../../core/location-context.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { CompanyPreferencesService } from '../../core/company-preferences.service';
import { offlineDb, offlineScopeKey, type NamedSnapshot } from '../../pos/offline/offline-db';
import { CacheJournalService, type CacheStreamHandler } from '../../core/cache-journal.service';
import { PageActionsComponent } from '../../shared/ui/page-actions.component';
import { selectDashboardSignalCandidates } from '../../reports/product-intelligence';

type TopVariant = {
  variantId: string;
  label: string;
  manufacturer: string;
  quantity: number;
  revenue: number;
  margin: number;
};
type ProductSignal = TopVariant & {
  productId: string | null;
  kind: 'restock' | 'margin' | 'movement';
  stock: number | null;
};
type LowStockDisplay = LowStockVariant & {
  manufacturer_name: string | null;
  product_id: string | null;
};
type ExpiringDisplay = ExpiringBatch & { manufacturer_name: string | null };
type SalesChartPoint = DashboardDailySummary & {
  day: string;
  revenue: number;
  heightPercent: number;
};
type DashboardSection = 'sales' | 'attention';

@Component({
  selector: 'app-dashboard',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    RouterLink,
    StatCardComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page title="Dashboard" [subtitle]="dashboardSubtitle()" [wide]="true">
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          [loading]="loading()"
          type="button"
          title="Refresh dashboard"
          aria-label="Refresh dashboard"
          (click)="refresh()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        @if (canViewFinancials() && locations.isMultiLocation()) {
          <select
            overflowAction
            class="select select-bordered select-sm"
            aria-label="Dashboard location"
            [value]="dashboardLocationId() ?? ''"
            (change)="changeDashboardLocation($event)"
          >
            <option value="">All locations</option>
            @for (location of locations.locations(); track location.id) {
              <option [value]="location.id">{{ location.name }}</option>
            }
          </select>
        }
      </app-page-actions>

      <div class="space-y-6">
        @if (loadError()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />
            <span class="flex-1">{{ loadError() }}</span>
            <button appButton variant="ghost" size="sm" (click)="refresh()">Try again</button>
          </div>
        }

        <section aria-labelledby="today-heading" class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="today-heading" class="section-title">Today</h2>
              <p class="type-caption mt-1">
                {{
                  canViewFinancials()
                    ? 'Completed sales in Africa/Nairobi time.'
                    : 'Jump back into work.'
                }}
              </p>
            </div>
            @if (lastUpdated(); as updated) {
              <p class="type-caption">Updated {{ updatedTime(updated) }}</p>
            }
          </div>

          @if (canViewFinancials()) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <app-stat-card
                label="Revenue"
                [value]="initialLoading() ? '—' : fmt(today()?.revenue ?? 0)"
                sub="Completed sales"
              />
              <app-stat-card
                label="Sales"
                [value]="initialLoading() ? '—' : String(today()?.orders ?? 0)"
                sub="Completed checkouts"
              />
              <app-stat-card
                label="Sales volume"
                [value]="initialLoading() ? '—' : quantity(todayQuantity())"
                sub="Net item quantity sold"
              />
              <app-stat-card
                label="Margin"
                [value]="initialLoading() ? '—' : fmt(today()?.margin ?? 0)"
                sub="Revenue less stock cost"
                [tone]="
                  (today()?.margin ?? 0) > 0
                    ? 'success'
                    : (today()?.margin ?? 0) < 0
                      ? 'error'
                      : 'neutral'
                "
              />
              <app-stat-card
                label="Sales to sync"
                [value]="String(pendingCount())"
                [sub]="
                  sync.failedCount() > 0 ? sync.failedCount() + ' need attention' : 'Offline queue'
                "
                [tone]="
                  sync.failedCount() > 0 ? 'error' : pendingCount() > 0 ? 'warning' : 'neutral'
                "
              />
            </div>
          } @else {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <a routerLink="/pos/sell" class="card bg-base-100 transition-shadow hover:shadow-md">
                <div class="card-body flex-row items-center gap-3 p-4">
                  <span
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
                  >
                    <app-icon name="heroShoppingCart" size="lg" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold">Start selling</span>
                    <span class="type-caption">Open the Sell screen</span>
                  </span>
                </div>
              </a>
              @if (preferences.cashierFlowEnabled()) {
                <a
                  routerLink="/pos/cashier"
                  class="card bg-base-100 transition-shadow hover:shadow-md"
                >
                  <div class="card-body flex-row items-center gap-3 p-4">
                    <span
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"
                    >
                      <app-icon name="heroQueueList" size="lg" />
                    </span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold">Cashier queue</span>
                      <span class="type-caption">Take waiting payments</span>
                    </span>
                  </div>
                </a>
              }
              <app-stat-card
                label="Sales to sync"
                [value]="String(pendingCount())"
                [sub]="
                  sync.failedCount() > 0 ? sync.failedCount() + ' need attention' : 'Offline queue'
                "
                [tone]="
                  sync.failedCount() > 0 ? 'error' : pendingCount() > 0 ? 'warning' : 'neutral'
                "
              />
            </div>
          }

          @if (pendingCount() > 0) {
            <div
              role="status"
              class="alert text-sm"
              [class.alert-error]="sync.failedCount() > 0"
              [class.alert-warning]="sync.failedCount() === 0"
            >
              <app-icon
                [name]="sync.failedCount() > 0 ? 'heroExclamationTriangle' : 'heroArrowPath'"
              />
              <span class="flex-1">
                {{ pendingCount() }} sale(s) are waiting to sync.
                @if (sync.failedCount() > 0) {
                  {{ sync.failedCount() }} failed and need attention.
                }
              </span>
              <button appButton variant="ghost" size="sm" (click)="reviewSync()">
                Review sync
              </button>
            </div>
          }
        </section>

        @if (canViewFinancials() && locations.isMultiLocation() && !dashboardLocationId()) {
          <section aria-labelledby="locations-heading" class="space-y-3">
            <div>
              <h2 id="locations-heading" class="section-title">Location performance</h2>
              <p class="type-caption mt-1">All business locations you can access.</p>
            </div>
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <app-stat-card
                label="Revenue change"
                [value]="changeLabel(comparison().current_revenue, comparison().previous_revenue)"
                sub="Versus previous 7 days"
                [tone]="
                  comparison().current_revenue >= comparison().previous_revenue
                    ? 'success'
                    : 'warning'
                "
              />
              <app-stat-card
                label="Volume change"
                [value]="changeLabel(comparison().current_quantity, comparison().previous_quantity)"
                sub="Units versus previous period"
                [tone]="
                  comparison().current_quantity >= comparison().previous_quantity
                    ? 'success'
                    : 'warning'
                "
              />
              <app-stat-card
                label="Order change"
                [value]="changeLabel(comparison().current_orders, comparison().previous_orders)"
                sub="Checkouts versus previous period"
                [tone]="
                  comparison().current_orders >= comparison().previous_orders
                    ? 'success'
                    : 'warning'
                "
              />
            </div>
            <div class="divide-y divide-base-200 rounded-box border border-base-300 bg-base-100">
              @for (location of locationRows(); track location.location_id) {
                <button
                  type="button"
                  class="flex min-h-20 w-full items-center gap-3 p-3 text-left hover:bg-base-200/40"
                  (click)="showLocation(location.location_id)"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{{ location.location_name }}</p>
                    <p class="type-caption mt-1">
                      {{ location.orders }} orders · {{ quantity(location.quantity) }} units
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-semibold"><app-money [amount]="location.revenue" /></p>
                    <p class="type-caption">margin <app-money [amount]="location.margin" /></p>
                  </div>
                </button>
              }
            </div>
          </section>
        }

        @if (canViewFinancials()) {
          <section aria-label="Sales performance" class="grid items-start gap-4 xl:grid-cols-12">
            <article class="card overflow-hidden bg-base-100 xl:col-span-7">
              <div
                class="flex flex-wrap items-end justify-between gap-2 border-b border-base-300 px-4 py-3"
              >
                <div>
                  <h2 class="section-title">Sales trend</h2>
                  <p class="type-caption mt-1">Live completed-sale revenue · last 7 days.</p>
                </div>
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  [attr.aria-expanded]="salesChartExpanded()"
                  (click)="salesChartExpanded.set(!salesChartExpanded())"
                >
                  {{ salesChartExpanded() ? 'Show less' : 'Expand' }}
                </button>
              </div>

              @if (initialLoading()) {
                <div
                  role="status"
                  class="flex min-h-52 items-center justify-center gap-2 text-sm text-base-content/60"
                >
                  <span class="loading loading-spinner loading-sm"></span>
                  Loading sales
                </div>
              } @else if (!salesChartHasData()) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroBanknotes"
                  title="No sales this week"
                  description="Revenue and margin appear after the first completed sale."
                />
              } @else {
                <div class="px-4 pb-3 pt-2">
                  <div class="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p class="type-caption">7-day revenue</p>
                      <p class="type-title tabular-nums">{{ fmt(weekRevenue()) }}</p>
                    </div>
                    <p class="type-caption text-right">
                      {{ weekOrders() }} sales · {{ quantity(weekQuantity()) }} items ·
                      {{ fmt(weekMargin()) }} margin
                    </p>
                  </div>

                  <div
                    class="relative overflow-hidden rounded-box border border-base-300/70 bg-base-200/30"
                    [class.h-32]="!salesChartExpanded()"
                    [class.h-60]="salesChartExpanded()"
                  >
                    @if (salesChartExpanded()) {
                      <span class="absolute inset-x-0 top-1/3 border-t border-base-300/60"></span>
                      <span class="absolute inset-x-0 top-2/3 border-t border-base-300/60"></span>
                    }
                    <div
                      class="relative grid h-full grid-cols-7 items-end gap-2 px-4 pb-2 pt-3 sm:gap-3 sm:px-6"
                      role="img"
                      aria-label="Sales revenue for the last seven days"
                    >
                      @for (point of salesChartPoints(); track point.day) {
                        <div class="group flex h-full min-w-0 items-end justify-center">
                          <div
                            class="w-full max-w-12 rounded-t-field bg-primary/80 transition-all group-hover:bg-primary"
                            [style.height.%]="point.heightPercent"
                            [attr.title]="shortDay(point.day) + ': ' + fmt(point.revenue)"
                          ></div>
                        </div>
                      }
                    </div>
                  </div>

                  <div class="mt-2 grid grid-cols-7 gap-1 text-center">
                    @for (point of salesChartPoints(); track point.day) {
                      <div class="min-w-0">
                        <p class="truncate text-xs font-medium text-base-content/60">
                          {{ chartDay(point.day) }}
                        </p>
                        @if (salesChartExpanded()) {
                          <p class="mt-0.5 truncate text-xs tabular-nums">
                            {{ compactKes(point.revenue) }}
                          </p>
                        }
                      </div>
                    }
                  </div>

                  @if (salesChartExpanded()) {
                    <div class="mt-3 divide-y divide-base-200 border-t border-base-300/70 pt-2">
                      @for (day of week(); track day.day) {
                        <div class="flex items-center gap-3 py-2 text-sm">
                          <div class="min-w-0 flex-1">
                            <p class="font-medium">{{ shortDay(day.day) }}</p>
                            <p class="type-caption">{{ day.orders }} sales</p>
                          </div>
                          <div class="shrink-0 text-right">
                            <p class="font-semibold"><app-money [amount]="day.revenue" /></p>
                            <p class="type-caption">margin <app-money [amount]="day.margin" /></p>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </article>

            <article class="card overflow-hidden bg-base-100 xl:col-span-5">
              <div
                class="flex flex-wrap items-end justify-between gap-2 border-b border-base-300 px-4 py-3"
              >
                <div>
                  <h2 class="section-title">Product signals</h2>
                  <p class="type-caption mt-1">Useful product movement over 7 days.</p>
                </div>
                <a
                  class="link text-xs"
                  routerLink="/inventory/products"
                  [queryParams]="{ stock: 'needs_restock' }"
                  >View restock list</a
                >
              </div>

              @if (initialLoading()) {
                <div
                  role="status"
                  class="flex min-h-52 items-center justify-center gap-2 text-sm text-base-content/60"
                >
                  <span class="loading loading-spinner loading-sm"></span>
                  Loading products
                </div>
              } @else if (productSignals().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroCube"
                  title="No product signals yet"
                  description="Product movement appears here after completed sales."
                />
              } @else {
                <div class="divide-y divide-base-200">
                  @for (signal of productSignals(); track signal.kind + signal.variantId) {
                    <a
                      class="flex min-h-20 items-center gap-3 px-4 py-3 hover:bg-base-200/40"
                      [routerLink]="signal.productId ? '/inventory/products' : null"
                      [queryParams]="{ product: signal.productId, variant: signal.variantId }"
                    >
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium">{{ signal.label }}</p>
                        <p class="type-caption truncate">
                          {{ signal.manufacturer }} · {{ quantity(signal.quantity) }} sold
                          @if (signal.stock !== null) {
                            · {{ quantity(signal.stock) }} in stock
                          }
                        </p>
                      </div>
                      <div class="shrink-0 text-right">
                        <p class="text-xs font-semibold uppercase text-base-content/70">
                          {{ signalLabel(signal.kind) }}
                        </p>
                        @if (signal.kind === 'margin') {
                          <p
                            class="type-caption"
                            [class.text-success]="signal.margin > 0"
                            [class.text-error]="signal.margin < 0"
                          >
                            <app-money [amount]="signal.margin" /> margin
                          </p>
                        } @else if (signal.kind === 'movement') {
                          <p class="type-caption"><app-money [amount]="signal.revenue" /> sales</p>
                        } @else {
                          <p class="type-caption">Needs attention</p>
                        }
                      </div>
                    </a>
                  }
                </div>
              }
            </article>
          </section>
        }

        <section aria-labelledby="attention-heading" class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="attention-heading" class="section-title">Needs attention</h2>
              <p class="type-caption mt-1">Inventory exceptions that may affect the next sale.</p>
            </div>
            <span class="type-caption">Updates with stock activity</span>
          </div>

          <div class="grid gap-4" [class.lg:grid-cols-2]="preferences.batchExpiryEnabled()">
            <article class="card h-full bg-base-100">
              <div class="card-body p-4">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <app-icon name="heroCube" />
                    <div>
                      <h3 class="section-title">Needs restock</h3>
                      <p class="type-caption">{{ attentionLocationName() }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    @if (lowStock().length > 0) {
                      <span class="badge badge-warning badge-sm">{{ lowStockTotal() }}</span>
                    }
                    <a
                      routerLink="/inventory/products"
                      [queryParams]="{ stock: 'needs_restock' }"
                      class="link text-xs"
                      >View all</a
                    >
                  </div>
                </div>

                @if (initialLoading()) {
                  <div
                    role="status"
                    class="flex min-h-32 items-center justify-center gap-2 text-sm text-base-content/60"
                  >
                    <span class="loading loading-spinner loading-sm"></span>
                    Loading stock
                  </div>
                } @else if (lowStock().length === 0) {
                  <app-empty-state
                    [embedded]="true"
                    [compact]="true"
                    icon="heroCheckCircle"
                    title="All stocked up"
                    description="Nothing is below its low-stock threshold."
                  />
                } @else {
                  <div class="mt-2 flex flex-col divide-y divide-base-200">
                    @for (item of lowStock(); track item.variant_id) {
                      <a
                        class="flex items-center gap-3 py-3 hover:text-primary"
                        routerLink="/inventory/products"
                        [queryParams]="{
                          product: item.product_id,
                          variant: item.variant_id,
                        }"
                      >
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium">{{ item.product_name }}</p>
                          <p class="type-caption truncate">
                            {{ item.manufacturer_name || 'Manufacturer not set' }} ·
                            {{ item.variant_name }}
                          </p>
                        </div>
                        <div class="text-right">
                          <p class="font-medium tabular-nums text-warning">{{ item.stock }}</p>
                          <p class="type-caption">threshold {{ item.low_stock_threshold }}</p>
                        </div>
                      </a>
                    }
                  </div>
                }
              </div>
            </article>

            @if (preferences.batchExpiryEnabled()) {
              <article class="card h-full bg-base-100">
                <div class="card-body p-4">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <app-icon name="heroCalendarDays" />
                      <h3 class="section-title">Expiring batches</h3>
                    </div>
                    @if (expiring().length > 0) {
                      <span class="badge badge-warning badge-sm">{{ expiring().length }}</span>
                    }
                  </div>

                  @if (initialLoading()) {
                    <div
                      role="status"
                      class="flex min-h-32 items-center justify-center gap-2 text-sm text-base-content/60"
                    >
                      <span class="loading loading-spinner loading-sm"></span>
                      Loading batches
                    </div>
                  } @else if (expiring().length === 0) {
                    <app-empty-state
                      [embedded]="true"
                      [compact]="true"
                      icon="heroCheckCircle"
                      title="Nothing expiring"
                      description="No batches expire in the next 30 days."
                    />
                  } @else {
                    <div class="mt-2 flex flex-col divide-y divide-base-200">
                      @for (batch of expiring(); track batch.batch_id) {
                        <div class="flex items-center gap-3 py-3">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ batch.product_name }}</p>
                            <p class="type-caption truncate">
                              {{ batch.manufacturer_name || 'Manufacturer not set' }} ·
                              {{ batch.variant_name }}
                            </p>
                          </div>
                          <div class="text-right">
                            <p class="font-medium tabular-nums text-warning">
                              {{ batch.remaining }} left
                            </p>
                            <p class="type-caption">expires {{ batch.expiry_date }}</p>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </article>
            }
          </div>
        </section>
      </div>
    </app-page>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly reports = inject(ReportsService);
  private readonly pos = inject(PosService);
  protected readonly sync = inject(SyncService);
  protected readonly locations = inject(LocationContextService);
  protected readonly preferences = inject(CompanyPreferencesService);
  private readonly perms = inject(PermissionsService);
  private readonly journal = inject(CacheJournalService);
  protected readonly canViewFinancials = computed(() => this.perms.has('ViewFinancials'));

  protected readonly fmt = formatKes;
  protected readonly String = String;

  protected readonly company = signal<Company | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly liveConnected = signal(false);
  protected readonly lastUpdated = signal<Date | null>(null);
  protected readonly salesChartExpanded = signal(false);

  protected readonly summary = signal<DashboardDailySummary[]>([]);
  protected readonly topVariants = signal<TopVariant[]>([]);
  protected readonly productSignals = signal<ProductSignal[]>([]);
  protected readonly lowStock = signal<LowStockDisplay[]>([]);
  protected readonly lowStockTotal = signal(0);
  protected readonly expiring = signal<ExpiringDisplay[]>([]);
  protected readonly locationRows = signal<DashboardLocationSummary[]>([]);
  protected readonly comparison = signal<DashboardPeriodComparison>({
    current_revenue: 0,
    current_quantity: 0,
    current_orders: 0,
    previous_revenue: 0,
    previous_quantity: 0,
    previous_orders: 0,
  });
  protected readonly dashboardLocationId = signal<string | null>(null);
  protected readonly attentionLocationName = computed(
    () =>
      this.locations.locations().find(location => location.id === this.locations.activeId())
        ?.name ?? 'Active location'
  );

  protected readonly dashboardSubtitle = computed(() => {
    const company = this.company();
    const scope = this.dashboardLocationId()
      ? this.locations.locations().find(location => location.id === this.dashboardLocationId())
          ?.name
      : this.locations.isMultiLocation()
        ? 'All locations'
        : null;
    return company
      ? `${company.name}${scope ? ` · ${scope}` : ''} · Live trading and stock overview`
      : 'Live trading and stock overview';
  });
  protected readonly pendingCount = computed(
    () => this.sync.queuedCount() + this.sync.failedCount()
  );
  protected readonly today = computed(() =>
    this.summary().find(day => day.day === this.todayIso())
  );
  protected readonly week = computed<DashboardDailySummary[]>(() => {
    const byDay = new Map(
      this.summary()
        .filter(row => row.day)
        .map(row => [row.day!, row])
    );
    return Array.from({ length: 7 }, (_, index) => {
      const day = this.daysAgoIso(6 - index);
      return (
        byDay.get(day) ?? {
          day,
          company_id: this.company()?.id ?? null,
          orders: 0,
          revenue: 0,
          cogs: 0,
          margin: 0,
          quantity: 0,
        }
      );
    });
  });
  protected readonly weekRevenue = computed(() =>
    this.week().reduce((total, day) => total + (day.revenue ?? 0), 0)
  );
  protected readonly weekMargin = computed(() =>
    this.week().reduce((total, day) => total + (day.margin ?? 0), 0)
  );
  protected readonly weekOrders = computed(() =>
    this.week().reduce((total, day) => total + (day.orders ?? 0), 0)
  );
  protected readonly todayQuantity = computed(() => Number(this.today()?.quantity ?? 0));
  protected readonly weekQuantity = computed(() =>
    this.week().reduce((total, row) => total + Number(row.quantity ?? 0), 0)
  );
  protected readonly salesChartHasData = computed(() => this.weekRevenue() > 0);
  protected readonly salesChartPoints = computed<SalesChartPoint[]>(() => {
    const days = this.week();
    const max = Math.max(...days.map(day => day.revenue ?? 0), 1);
    return days.map(day => ({
      ...day,
      day: day.day!,
      revenue: day.revenue ?? 0,
      heightPercent: ((day.revenue ?? 0) / max) * 100,
    }));
  });
  protected readonly initialLoading = computed(() => this.loading() && !this.lastUpdated());

  private liveChannels: RealtimeChannel[] = [];
  private readonly queuedSections = new Set<DashboardSection>();
  private readonly loadWaiters: Array<() => void> = [];
  private lastLoadSucceeded = false;
  private salesCacheHandler: CacheStreamHandler | null = null;
  private catalogCacheHandler: CacheStreamHandler | null = null;
  private journalScope: string | null = null;
  private readonly connectedConsumers = new Set<string>();
  private serverLoadVersion = 0;
  private salesJournalTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly salesJournalWaiters: Array<{
    resolve: () => void;
    reject: (reason: unknown) => void;
  }> = [];
  private snapshotRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotRefreshAt = 0;
  private reportsReady = false;

  constructor() {
    effect(() => {
      const canView = this.canViewFinancials();
      if (!canView) untracked(() => this.clearFinancials());
    });
    let attentionLocationId = this.locations.activeId();
    effect(() => {
      const nextLocationId = this.locations.activeId();
      if (nextLocationId === attentionLocationId) return;
      attentionLocationId = nextLocationId;
      if (!this.reportsReady || !nextLocationId) return;
      untracked(() => {
        // Do not show the previous location's stock under the new location label.
        this.lowStock.set([]);
        this.lowStockTotal.set(0);
        void this.loadReports(['attention']);
      });
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const company = await this.supabase.currentCompany();
      if (!company) {
        await this.router.navigate(['/register']);
        return;
      }
      this.company.set(company);
      if (this.locations.locations().length === 0) await this.locations.load();
      await this.preferences.refresh();
      if (!this.locations.isMultiLocation())
        this.dashboardLocationId.set(this.locations.activeId());
      await this.restoreDashboard();
      this.connectLiveUpdates(company.id);
      this.reportsReady = true;
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load company');
      return;
    }

    void this.loadReports();
  }

  ngOnDestroy(): void {
    this.reportsReady = false;
    this.cancelSalesJournalRefresh();
    this.clearSnapshotRefresh();
    for (const channel of this.liveChannels) void this.supabase.client.removeChannel(channel);
    if (this.journalScope && this.salesCacheHandler) {
      this.journal.unsubscribe(
        'sales',
        this.journalScope,
        this.salesCacheHandler,
        'dashboard-sales'
      );
    }
    if (this.journalScope && this.catalogCacheHandler) {
      this.journal.unsubscribe(
        'catalog',
        this.journalScope,
        this.catalogCacheHandler,
        'dashboard-catalog'
      );
    }
    this.journalScope = null;
    this.connectedConsumers.clear();
    this.liveConnected.set(false);
  }

  protected refresh(): void {
    void this.loadReports();
  }

  protected reviewSync(): void {
    void this.router.navigate(['/pos/sync']);
  }

  protected changeDashboardLocation(event: Event): void {
    this.dashboardLocationId.set((event.target as HTMLSelectElement).value || null);
    void this.restoreThenLoad();
  }

  protected showLocation(locationId: string): void {
    this.dashboardLocationId.set(locationId);
    void this.restoreThenLoad();
  }

  private async restoreThenLoad(): Promise<void> {
    await this.restoreDashboard();
    await this.loadReports();
  }

  protected changeLabel(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? '0%' : 'New';
    const value = ((current - previous) / Math.abs(previous)) * 100;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  private async loadReports(
    sections: readonly DashboardSection[] = ['sales', 'attention']
  ): Promise<void> {
    for (const section of sections) this.queuedSections.add(section);
    if (this.loading()) {
      return new Promise(resolve => this.loadWaiters.push(resolve));
    }

    this.loading.set(true);
    this.lastLoadSucceeded = true;
    try {
      while (this.queuedSections.size > 0) {
        const requestedSections = new Set(this.queuedSections);
        this.queuedSections.clear();
        ++this.serverLoadVersion;
        const requestedLocationId = this.dashboardLocationId();
        const canView = this.canViewFinancials();
        if (!canView) this.clearFinancials();

        const salesPromise =
          requestedSections.has('sales') && canView
            ? this.reports.dashboardSales(this.daysAgoIso(6), requestedLocationId)
            : Promise.resolve(null);
        const attentionLocationId = requestedSections.has('attention')
          ? this.locations.requireActiveId()
          : null;
        const attentionPromise = attentionLocationId
          ? Promise.all([
              this.reports.lowStock(attentionLocationId),
              this.preferences.batchExpiryEnabled()
                ? this.reports.expiringBatches()
                : Promise.resolve([]),
            ])
          : Promise.resolve(null);
        const [sales, attention] = await Promise.all([salesPromise, attentionPromise]);

        if (
          requestedLocationId !== this.dashboardLocationId() ||
          (requestedSections.has('attention') && attentionLocationId !== this.locations.activeId())
        ) {
          for (const section of requestedSections) this.queuedSections.add(section);
          continue;
        }

        await Promise.all([
          sales && this.canViewFinancials() ? this.applySalesReport(sales) : Promise.resolve(),
          attention && attentionLocationId
            ? this.applyAttentionReport(attention[0], attention[1], attentionLocationId)
            : Promise.resolve(),
        ]);
        if (
          requestedSections.has('attention') &&
          attentionLocationId !== this.locations.activeId()
        ) {
          this.queuedSections.add('attention');
          continue;
        }
        // A role update can land while report data is in flight. Never let an
        // old authorization decision restore financial data afterward.
        if (!this.canViewFinancials()) this.clearFinancials();
        this.lastUpdated.set(new Date());
        this.loadError.set(null);
        await this.persistDashboard(requestedLocationId);
      }
    } catch (err) {
      this.lastLoadSucceeded = false;
      this.queuedSections.clear();
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      this.loading.set(false);
      for (const resolve of this.loadWaiters.splice(0)) resolve();
    }
  }

  private async applySalesReport(
    sales: Awaited<ReturnType<ReportsService['dashboardSales']>>
  ): Promise<void> {
    this.summary.set(sales.summary);
    this.locationRows.set(sales.locations);
    this.comparison.set(sales.comparison);
    await this.computeProductPerformance(sales.topVariants, sales.productSignals);
    if (sales.refreshAfter) this.scheduleSnapshotRefresh(sales.refreshAfter);
    else this.clearSnapshotRefresh();
  }

  private async applyAttentionReport(
    lowStockResult: Awaited<ReturnType<ReportsService['lowStock']>>,
    expiring: ExpiringBatch[],
    locationId: string
  ): Promise<void> {
    const lowStock = lowStockResult.rows;
    const attentionIds = [
      ...new Set(
        [...lowStock, ...expiring].map(item => item.variant_id).filter((id): id is string => !!id)
      ),
    ];
    const attentionVariants = await this.pos.variantsByIds(attentionIds);
    if (this.locations.activeId() !== locationId) return;
    const manufacturerByVariant = new Map(
      attentionVariants.map(variant => [variant.variant_id, variant.manufacturer_name])
    );
    const productByVariant = new Map(
      attentionVariants.map(variant => [variant.variant_id, variant.product_id])
    );
    this.lowStock.set(
      lowStock.map(item => ({
        ...item,
        manufacturer_name: manufacturerByVariant.get(item.variant_id) ?? null,
        product_id: productByVariant.get(item.variant_id) ?? null,
      }))
    );
    this.lowStockTotal.set(lowStockResult.total);
    this.expiring.set(
      expiring.map(item => ({
        ...item,
        manufacturer_name: manufacturerByVariant.get(item.variant_id) ?? null,
      }))
    );
  }

  private connectLiveUpdates(companyId: string): void {
    const identity = this.supabase.offlineIdentity();
    if (!identity) return;
    const scope = offlineScopeKey(identity, this.dashboardLocationId() ?? 'all');
    this.journalScope = scope;
    this.connectedConsumers.clear();
    this.liveConnected.set(false);
    this.salesCacheHandler = {
      apply: async () => {
        await this.scheduleSalesJournalRefresh();
      },
      reset: async () => {
        this.cancelSalesJournalRefresh();
        await this.loadReports(['sales']);
        return this.lastLoadSucceeded;
      },
      purge: () => {
        this.clearFinancials();
        this.lastUpdated.set(null);
      },
    };
    this.catalogCacheHandler = {
      apply: async () => {
        await this.loadReports(['sales', 'attention']);
        if (!this.lastLoadSucceeded) throw new Error('dashboard_refresh_failed');
      },
      reset: async () => {
        await this.loadReports(['sales', 'attention']);
        return this.lastLoadSucceeded;
      },
    };
    const subscriptions = [
      { stream: 'sales' as const, consumer: 'dashboard-sales', handler: this.salesCacheHandler },
      {
        stream: 'catalog' as const,
        consumer: 'dashboard-catalog',
        handler: this.catalogCacheHandler,
      },
    ];
    this.liveChannels = subscriptions.map(({ stream, consumer, handler }) =>
      this.journal.subscribe(stream, scope, companyId, handler, consumer, status => {
        if (scope !== this.journalScope) return;
        if (status === 'SUBSCRIBED') this.connectedConsumers.add(consumer);
        else this.connectedConsumers.delete(consumer);
        this.liveConnected.set(this.connectedConsumers.size === subscriptions.length);
      })
    );
  }

  private async restoreDashboard(): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity || !this.canViewFinancials()) return;
    const serverLoadVersion = this.serverLoadVersion;
    const scope = offlineScopeKey(identity, this.dashboardLocationId() ?? 'all');
    const cached = await (await offlineDb()).get('snapshots', `${scope}:dashboard`);
    const currentIdentity = this.supabase.offlineIdentity();
    const currentScope = currentIdentity
      ? offlineScopeKey(currentIdentity, this.dashboardLocationId() ?? 'all')
      : null;
    if (
      !cached ||
      currentScope !== scope ||
      serverLoadVersion !== this.serverLoadVersion ||
      !this.canViewFinancials()
    ) {
      return;
    }
    const value = cached.value as {
      summary: DashboardDailySummary[];
      topVariants: TopVariant[];
      productSignals?: ProductSignal[];
      lowStock: LowStockDisplay[];
      lowStockTotal?: number;
      attentionLocationId?: string;
      expiring: ExpiringDisplay[];
      locationRows: DashboardLocationSummary[];
      comparison: DashboardPeriodComparison;
    };
    this.summary.set(value.summary);
    this.topVariants.set(value.topVariants);
    this.productSignals.set(value.productSignals ?? []);
    if (value.attentionLocationId === this.locations.activeId()) {
      this.lowStock.set(value.lowStock);
      this.lowStockTotal.set(value.lowStockTotal ?? value.lowStock.length);
    }
    this.expiring.set(value.expiring);
    this.locationRows.set(value.locationRows);
    this.comparison.set(value.comparison);
    this.lastUpdated.set(new Date(cached.fetched_at));
  }

  private async persistDashboard(locationId: string | null): Promise<void> {
    const identity = this.supabase.offlineIdentity();
    if (!identity || !this.canViewFinancials()) return;
    if (locationId !== this.dashboardLocationId()) return;
    const scope = offlineScopeKey(identity, locationId ?? 'all');
    const snapshot: NamedSnapshot = {
      key: `${scope}:dashboard`,
      name: 'dashboard',
      company_id: identity.companyId,
      user_id: identity.userId,
      location_id: locationId ?? undefined,
      value: {
        summary: this.summary(),
        topVariants: this.topVariants(),
        productSignals: this.productSignals(),
        lowStock: this.lowStock(),
        lowStockTotal: this.lowStockTotal(),
        attentionLocationId: this.locations.activeId(),
        expiring: this.expiring(),
        locationRows: this.locationRows(),
        comparison: this.comparison(),
      },
      fetched_at: new Date().toISOString(),
    };
    const db = await offlineDb();
    const currentIdentity = this.supabase.offlineIdentity();
    const currentScope = currentIdentity
      ? offlineScopeKey(currentIdentity, this.dashboardLocationId() ?? 'all')
      : null;
    if (!this.canViewFinancials() || currentScope !== scope) return;
    await db.put('snapshots', snapshot);
    // IndexedDB writes cannot be cancelled. Remove the just-written snapshot
    // if permission or identity changed while the transaction was committing.
    const committedIdentity = this.supabase.offlineIdentity();
    const committedScope = committedIdentity
      ? offlineScopeKey(committedIdentity, this.dashboardLocationId() ?? 'all')
      : null;
    if (!this.canViewFinancials() || committedScope !== scope) {
      await db.delete('snapshots', snapshot.key);
    }
  }

  private clearFinancials(): void {
    this.summary.set([]);
    this.topVariants.set([]);
    this.productSignals.set([]);
    this.locationRows.set([]);
    this.comparison.set({
      current_revenue: 0,
      current_quantity: 0,
      current_orders: 0,
      previous_revenue: 0,
      previous_quantity: 0,
      previous_orders: 0,
    });
  }

  private async computeProductPerformance(
    rows: DashboardTopVariant[],
    signals: DashboardProductSignals
  ): Promise<void> {
    const variantIds = [
      ...new Set([
        ...rows.map(row => row.variant_id),
        ...signals.fastVariants.map(row => row.variant_id),
        ...signals.restockRisks.map(row => row.variant_id),
      ]),
    ];
    let variants: Variant[] = [];
    try {
      variants = await this.pos.variantsByIds(variantIds);
    } catch {
      // Snapshot totals remain useful when catalog metadata is temporarily unavailable.
    }
    const byId = new Map(variants.map(variant => [variant.variant_id, variant]));
    const displayRow = (row: DashboardTopVariant): TopVariant => ({
      variantId: row.variant_id,
      label: byId.has(row.variant_id)
        ? variantLabel(byId.get(row.variant_id) as Variant)
        : row.variant_id.slice(0, 8),
      manufacturer: byId.get(row.variant_id)?.manufacturer_name || 'Manufacturer not set',
      quantity: Number(row.quantity),
      revenue: row.revenue,
      margin: row.margin,
    });
    const top = rows.map(displayRow);
    this.topVariants.set(top);

    const result = selectDashboardSignalCandidates(
      rows,
      signals,
      variantId => byId.get(variantId)?.product_id ?? variantId
    ).map(candidate => {
      const variant = byId.get(candidate.row.variant_id);
      if (candidate.kind === 'restock') {
        return {
          variantId: candidate.row.variant_id,
          productId: variant?.product_id ?? null,
          label: variant ? variantLabel(variant) : candidate.row.variant_id.slice(0, 8),
          manufacturer: variant?.manufacturer_name || 'Manufacturer not set',
          quantity: Number(candidate.row.quantity),
          revenue: 0,
          margin: 0,
          kind: candidate.kind,
          stock: Number(candidate.row.stock),
        } satisfies ProductSignal;
      }
      return {
        ...displayRow(candidate.row),
        productId: variant?.product_id ?? null,
        kind: candidate.kind,
        stock: null,
      } satisfies ProductSignal;
    });
    this.productSignals.set(result);
  }

  protected signalLabel(kind: ProductSignal['kind']): string {
    if (kind === 'restock') return 'Restock risk';
    if (kind === 'margin') return 'Margin leader';
    return 'Fast mover';
  }

  /** Coalesce a burst of sale invalidations before asking for the shared snapshot. */
  private scheduleSalesJournalRefresh(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.salesJournalWaiters.push({ resolve, reject });
      if (this.salesJournalTimer) clearTimeout(this.salesJournalTimer);
      this.salesJournalTimer = setTimeout(() => {
        this.salesJournalTimer = null;
        void this.runSalesJournalRefresh();
      }, 10_000);
    });
  }

  private async runSalesJournalRefresh(): Promise<void> {
    const waiters = this.salesJournalWaiters.splice(0);
    try {
      await this.loadReports(['sales']);
      if (!this.lastLoadSucceeded) throw new Error('dashboard_refresh_failed');
      for (const waiter of waiters) waiter.resolve();
    } catch (error) {
      for (const waiter of waiters) waiter.reject(error);
    }
  }

  private cancelSalesJournalRefresh(): void {
    if (this.salesJournalTimer) clearTimeout(this.salesJournalTimer);
    this.salesJournalTimer = null;
    for (const waiter of this.salesJournalWaiters.splice(0)) waiter.resolve();
  }

  /** A changed shared snapshot may be stale for 60s; retry only when it expires. */
  private scheduleSnapshotRefresh(refreshAfter: string): void {
    const refreshAt = Date.parse(refreshAfter);
    if (!Number.isFinite(refreshAt)) return;
    if (this.snapshotRefreshTimer && this.snapshotRefreshAt <= refreshAt) return;
    this.clearSnapshotRefresh();
    this.snapshotRefreshAt = refreshAt;
    this.snapshotRefreshTimer = setTimeout(
      () => {
        this.snapshotRefreshTimer = null;
        this.snapshotRefreshAt = 0;
        if (this.canViewFinancials()) void this.loadReports(['sales']);
      },
      Math.max(0, refreshAt - Date.now() + 100)
    );
  }

  private clearSnapshotRefresh(): void {
    if (this.snapshotRefreshTimer) clearTimeout(this.snapshotRefreshTimer);
    this.snapshotRefreshTimer = null;
    this.snapshotRefreshAt = 0;
  }

  protected quantity(value: number): string {
    return Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 });
  }

  protected shortDay(day: string | null): string {
    if (!day) return '—';
    return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  protected chartDay(day: string): string {
    return new Date(`${day}T12:00:00+03:00`).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'narrow',
    });
  }

  protected compactKes(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace('.0', '')}m`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace('.0', '')}k`;
    return Math.round(amount).toLocaleString('en-KE');
  }

  protected updatedTime(value: Date): string {
    return value.toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private todayIso(): string {
    return this.nairobiDate(new Date());
  }

  private daysAgoIso(days: number): string {
    return this.nairobiDate(new Date(Date.now() - days * 86_400_000));
  }

  private nairobiDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
}
