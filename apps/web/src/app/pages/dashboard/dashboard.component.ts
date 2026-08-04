import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes } from '../../core/money';
import { Company, SupabaseService } from '../../core/supabase.service';
import { PermissionsService } from '../../core/permissions.service';
import { SyncService } from '../../pos/offline/sync.service';
import { PosService, variantLabel, type Variant } from '../../pos/pos.service';
import {
  DailyProductSales,
  DailySummary,
  DashboardLocationSummary,
  DashboardPeriodComparison,
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

type TopVariant = {
  variantId: string;
  label: string;
  quantity: number;
  revenue: number;
  margin: number;
};
type SalesChartPoint = DailySummary & { day: string; revenue: number; heightPercent: number };

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
  ],
  template: `
    <app-page title="Dashboard" [subtitle]="dashboardSubtitle()" [wide]="true">
      <span
        actions
        class="badge gap-1.5"
        [class.badge-success]="liveConnected()"
        [class.badge-warning]="!liveConnected()"
      >
        <app-icon
          [name]="liveConnected() ? 'heroSignal' : 'heroSignalSlash'"
          size="sm"
          [class.animate-pulse]="!liveConnected()"
        />
        {{ liveConnected() ? 'Live' : 'Connecting' }}
      </span>
      <button
        actions
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
          actions
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
            <div class="table-scroll rounded-box border border-base-300 bg-base-100">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th class="text-right">Orders</th>
                    <th class="text-right">Volume</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  @for (location of locationRows(); track location.location_id) {
                    <tr class="cursor-pointer hover" (click)="showLocation(location.location_id)">
                      <td class="font-medium">{{ location.location_name }}</td>
                      <td class="text-right">{{ location.orders }}</td>
                      <td class="text-right">{{ quantity(location.quantity) }}</td>
                      <td class="text-right"><app-money [amount]="location.revenue" /></td>
                      <td class="text-right"><app-money [amount]="location.margin" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (canViewFinancials()) {
          <section aria-label="Sales performance" class="grid gap-4 xl:grid-cols-12">
            <article class="card h-full overflow-hidden bg-base-100 xl:col-span-7">
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
                    <div class="table-scroll mt-3 border-t border-base-300/70 pt-2">
                      <table class="table table-xs">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th class="text-right">Sales</th>
                            <th class="text-right">Revenue</th>
                            <th class="text-right">Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (day of week(); track day.day) {
                            <tr>
                              <td>{{ shortDay(day.day) }}</td>
                              <td class="text-right">{{ day.orders ?? 0 }}</td>
                              <td class="text-right"><app-money [amount]="day.revenue ?? 0" /></td>
                              <td class="text-right"><app-money [amount]="day.margin ?? 0" /></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              }
            </article>

            <article class="card h-full overflow-hidden bg-base-100 xl:col-span-5">
              <div
                class="flex flex-wrap items-end justify-between gap-2 border-b border-base-300 px-4 py-3"
              >
                <div>
                  <h2 class="section-title">Best margin</h2>
                  <p class="type-caption mt-1">Top-performing variants over 7 days.</p>
                </div>
                <span class="type-caption">Top 5</span>
              </div>

              @if (initialLoading()) {
                <div
                  role="status"
                  class="flex min-h-52 items-center justify-center gap-2 text-sm text-base-content/60"
                >
                  <span class="loading loading-spinner loading-sm"></span>
                  Loading products
                </div>
              } @else if (topVariants().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  [compact]="true"
                  icon="heroCube"
                  title="Nothing sold yet"
                  description="Products rank here once completed sales have stock cost."
                />
              } @else {
                <div class="table-scroll">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Variant</th>
                        <th class="text-right">Qty</th>
                        <th class="text-right">Revenue</th>
                        <th class="text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (variant of topVariants(); track variant.variantId) {
                        <tr>
                          <td>
                            <span class="font-medium">{{ variant.label }}</span>
                            <span class="type-caption ml-2">#{{ $index + 1 }}</span>
                          </td>
                          <td class="text-right">{{ quantity(variant.quantity) }}</td>
                          <td class="text-right font-medium">
                            <app-money [amount]="variant.revenue" />
                          </td>
                          <td
                            class="text-right font-medium"
                            [class.text-success]="variant.margin > 0"
                            [class.text-error]="variant.margin < 0"
                          >
                            <app-money [amount]="variant.margin" />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
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
            @if (preferences.batchExpiryEnabled()) {
              <article class="card h-full bg-base-100">
                <div class="card-body p-4">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <app-icon name="heroCube" />
                      <h3 class="section-title">Low stock</h3>
                    </div>
                    @if (lowStock().length > 0) {
                      <span class="badge badge-warning badge-sm">{{ lowStock().length }}</span>
                    }
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
                        <div class="flex items-center gap-3 py-3">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ item.product_name }}</p>
                            <p class="type-caption truncate">{{ item.variant_name }}</p>
                          </div>
                          <div class="text-right">
                            <p class="font-medium tabular-nums text-warning">{{ item.stock }}</p>
                            <p class="type-caption">threshold {{ item.low_stock_threshold }}</p>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </article>
            }

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
                          <p class="type-caption truncate">{{ batch.variant_name }}</p>
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
  protected readonly canViewFinancials = computed(() => this.perms.has('ViewFinancials'));

  protected readonly fmt = formatKes;
  protected readonly String = String;

  protected readonly company = signal<Company | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly liveConnected = signal(false);
  protected readonly lastUpdated = signal<Date | null>(null);
  protected readonly salesChartExpanded = signal(false);

  protected readonly summary = signal<DailySummary[]>([]);
  protected readonly productSales = signal<DailyProductSales[]>([]);
  protected readonly topVariants = signal<TopVariant[]>([]);
  protected readonly lowStock = signal<LowStockVariant[]>([]);
  protected readonly expiring = signal<ExpiringBatch[]>([]);
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
  protected readonly week = computed<DailySummary[]>(() => {
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
  protected readonly todayQuantity = computed(() =>
    this.productSales()
      .filter(row => row.day === this.todayIso())
      .reduce((total, row) => total + Number(row.quantity ?? 0), 0)
  );
  protected readonly weekQuantity = computed(() =>
    this.productSales().reduce((total, row) => total + Number(row.quantity ?? 0), 0)
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

  private liveChannel: RealtimeChannel | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private loadQueued = false;

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
      this.connectLiveUpdates(company.id);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load company');
      return;
    }

    void this.loadReports();
    this.fallbackTimer = setInterval(() => void this.loadReports(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.liveChannel) void this.supabase.client.removeChannel(this.liveChannel);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
  }

  protected refresh(): void {
    void this.loadReports();
  }

  protected reviewSync(): void {
    void this.router.navigate(['/pos/sync']);
  }

  protected changeDashboardLocation(event: Event): void {
    this.dashboardLocationId.set((event.target as HTMLSelectElement).value || null);
    void this.loadReports();
  }

  protected showLocation(locationId: string): void {
    this.dashboardLocationId.set(locationId);
    void this.loadReports();
  }

  protected changeLabel(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? '0%' : 'New';
    const value = ((current - previous) / Math.abs(previous)) * 100;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  private async loadReports(): Promise<void> {
    if (this.loading()) {
      this.loadQueued = true;
      return;
    }

    this.loading.set(true);
    try {
      const since = this.daysAgoIso(6);
      const canView = this.canViewFinancials();
      const [sales, lowStock, expiring] = await Promise.all([
        canView
          ? this.reports.dashboardSales(since, this.dashboardLocationId())
          : Promise.resolve(null),
        this.reports.lowStock(),
        this.preferences.batchExpiryEnabled()
          ? this.reports.expiringBatches()
          : Promise.resolve([]),
      ]);
      if (sales) {
        this.summary.set(sales.summary);
        this.productSales.set(sales.productSales);
        this.locationRows.set(sales.locations);
        this.comparison.set(sales.comparison);
        await this.computeTopVariants(sales.productSales);
      }
      this.lowStock.set(lowStock);
      this.expiring.set(expiring);
      this.lastUpdated.set(new Date());
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      this.loading.set(false);
      if (this.loadQueued) {
        this.loadQueued = false;
        void this.loadReports();
      }
    }
  }

  private connectLiveUpdates(companyId: string): void {
    this.liveChannel = this.supabase.client
      .channel(`dashboard-live-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        () => this.queueLiveRefresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchases',
          filter: `company_id=eq.${companyId}`,
        },
        () => this.queueLiveRefresh()
      )
      .subscribe(status => this.liveConnected.set(status === 'SUBSCRIBED'));
  }

  private queueLiveRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.loadReports();
    }, 250);
  }

  private async computeTopVariants(rows: DailyProductSales[]): Promise<void> {
    const byVariant = new Map<string, { quantity: number; revenue: number; margin: number }>();
    for (const row of rows) {
      if (!row.variant_id) continue;
      const current = byVariant.get(row.variant_id) ?? { quantity: 0, revenue: 0, margin: 0 };
      current.quantity += Number(row.quantity ?? 0);
      current.revenue += row.revenue ?? 0;
      current.margin += (row.revenue ?? 0) - (row.cogs ?? 0);
      byVariant.set(row.variant_id, current);
    }

    const top = [...byVariant.entries()].sort((a, b) => b[1].margin - a[1].margin).slice(0, 5);
    const variants = await this.pos.variantsByIds(top.map(([id]) => id));
    const byId = new Map(variants.map(variant => [variant.variant_id, variant]));
    this.topVariants.set(
      top.map(([variantId, totals]) => ({
        variantId,
        label: byId.has(variantId)
          ? variantLabel(byId.get(variantId) as Variant)
          : variantId.slice(0, 8),
        quantity: totals.quantity,
        revenue: totals.revenue,
        margin: totals.margin,
      }))
    );
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
