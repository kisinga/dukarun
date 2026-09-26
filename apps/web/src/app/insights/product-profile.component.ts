import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BusinessClockService } from '../core/business-clock.service';
import { formatKes } from '../core/money';
import { LocationContextService } from '../core/location-context.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { DataCoverageBadgeComponent } from './data-coverage-badge.component';
import { DateRangePresetControlComponent } from './date-range-preset-control.component';
import { presetDateRange, type AppliedDateRange } from './date-range';
import { InsightsService } from './insights.service';
import { insightCopy, type DateRangePreset, type ProductProfile } from './insights.models';
import { ProductActivityChartComponent } from './product-activity-chart.component';

@Component({
  selector: 'app-product-profile',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    DataCoverageBadgeComponent,
    DateRangePresetControlComponent,
    ProductActivityChartComponent,
  ],
  template: `
    @if (loading() && !profile()) {
      <div class="flex min-h-64 items-center justify-center gap-2 text-sm text-base-content/60">
        <span class="loading loading-spinner"></span>Loading product profile
      </div>
    } @else if (error() && !profile()) {
      <div role="alert" class="alert alert-error">
        <app-icon name="heroExclamationTriangle" />{{ error() }}
      </div>
    } @else if (profile(); as item) {
      <section class="space-y-4">
        @if (error()) {
          <div role="alert" class="alert alert-error text-sm">
            <app-icon name="heroExclamationTriangle" />{{ error() }} The previous period remains
            visible.
          </div>
        }
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <a routerLink="/insights/inventory" class="btn btn-ghost btn-sm min-h-11"
              ><app-icon name="heroChevronLeft" />Inventory</a
            >
            <a
              class="btn btn-outline btn-sm min-h-11"
              routerLink="/inventory/products"
              [queryParams]="{ product: item.variant.productId, variant: item.variant.id }"
            >
              <app-icon name="heroCube" />View in inventory
            </a>
          </div>
          <app-date-range-preset-control
            class="w-full lg:w-auto lg:min-w-[36rem]"
            [value]="periodPreset()"
            [from]="rangeFrom()"
            [to]="rangeTo()"
            [maxDate]="businessToday()"
            [advanced]="true"
            [loading]="loading()"
            (valueChange)="setWindow($event)"
            (rangeChange)="setCustomRange($event)"
          />
        </div>
        <article class="card bg-base-100">
          <div class="card-body gap-5 p-4 sm:p-6">
            <header class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="type-caption">{{ item.variant.sku }}</p>
                <h2 class="text-xl font-bold">
                  {{ item.variant.productName }} · {{ item.variant.variantName }}
                </h2>
                <p class="type-caption mt-1">
                  {{ item.variant.stockUnit }}
                  @if (item.variant.manufacturerName) {
                    · {{ item.variant.manufacturerName }}
                  }
                </p>
              </div>
              <span class="badge badge-lg" [class]="signalClass(item)">{{
                signalLabel(item)
              }}</span>
            </header>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
              <section
                class="rounded-box border p-4 sm:col-span-2 xl:col-span-4"
                [class.border-error/30]="signal(item) === 'stockout'"
                [class.bg-error/5]="signal(item) === 'stockout'"
                [class.border-warning/30]="
                  signal(item) === 'reorder' || signal(item) === 'low_cover'
                "
                [class.bg-warning/5]="signal(item) === 'reorder' || signal(item) === 'low_cover'"
                [class.border-base-300]="
                  signal(item) !== 'stockout' &&
                  signal(item) !== 'reorder' &&
                  signal(item) !== 'low_cover'
                "
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-base-content/55">
                  Recommended next step
                </p>
                <p class="mt-2 font-semibold">{{ decisionHeadline(item) }}</p>
                <p class="mt-1 text-sm text-base-content/70">{{ decisionReason(item) }}</p>
                @if (reorderQuantity(item); as quantity) {
                  <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm">
                      Suggested order:
                      <strong>{{ quantity | number: '1.0-3' }} {{ item.variant.stockUnit }}</strong>
                    </p>
                    <a
                      class="btn btn-primary btn-sm min-h-11"
                      routerLink="/purchases/new"
                      [queryParams]="{
                        supplier: item.variant.supplierId,
                        variant: item.variant.id,
                        quantity: quantity,
                      }"
                      >Start purchase</a
                    >
                  </div>
                }
              </section>

              <section class="rounded-box border border-base-300 p-4 xl:col-span-2">
                <p class="type-caption">Stock health</p>
                <div class="mt-1 flex items-end justify-between gap-2">
                  <p class="text-2xl font-bold tabular-nums">
                    {{ attentionNumber(item, 'current_stock') | number: '1.0-3' }}
                  </p>
                  <p class="text-xs text-base-content/60">{{ coverLabel(item) }}</p>
                </div>
                <div class="relative mt-3 h-2 overflow-hidden rounded-field bg-base-200">
                  <span
                    class="absolute inset-y-0 left-[23.33%] z-10 border-l border-warning"
                  ></span>
                  <span
                    class="block h-full rounded-field bg-primary"
                    [style.width.%]="coverageWidth(item)"
                  ></span>
                </div>
                <p class="mt-2 text-xs text-base-content/55">Marker: 14 days cover</p>
              </section>

              <section class="rounded-box border border-base-300 p-4 xl:col-span-2">
                <p class="type-caption">Demand</p>
                <p class="mt-1 text-2xl font-bold tabular-nums">
                  {{ item.summary.unitsSold | number: '1.0-3' }}
                </p>
                <p class="mt-1 text-xs text-base-content/60">
                  {{ activeDays(item) }} active days · {{ averageDailyDemand(item) }} per day
                </p>
              </section>

              <section class="rounded-box border border-base-300 p-4 xl:col-span-2">
                <p class="type-caption">Availability</p>
                <p
                  class="mt-1 text-2xl font-bold tabular-nums"
                  [class.text-error]="item.summary.stockoutDays > 0"
                >
                  {{ item.summary.stockoutDays }} days
                </p>
                <p class="mt-1 text-xs text-base-content/60">
                  {{ stockoutShare(item) }} of the selected period out of stock
                </p>
              </section>

              @if (item.summary.netRevenue !== null) {
                <section class="rounded-box border border-base-300 p-4 xl:col-span-2">
                  <p class="type-caption">Sales contribution</p>
                  <p class="mt-1 text-xl font-bold tabular-nums">
                    {{ fmt(item.summary.netRevenue) }}
                  </p>
                  <p class="mt-1 text-xs text-base-content/60">
                    {{ fmt(item.summary.margin ?? 0) }} margin · {{ marginRate(item) }}
                  </p>
                </section>
              }
            </div>
          </div>
        </article>

        <article class="card bg-base-100">
          <div class="card-body gap-4 p-4 sm:p-5">
            <header class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 class="section-title">Product activity</h3>
                <p class="type-caption mt-1">
                  Demand and stock movement for this item—not its manufacturer or supplier group.
                </p>
              </div>
              <span class="type-caption">
                {{ item.coverage.from | date: 'mediumDate' }}–{{
                  item.coverage.to | date: 'mediumDate'
                }}
              </span>
            </header>

            <app-product-activity-chart
              [trend]="item.trend"
              [positions]="item.positions"
              [loading]="loading()"
            />

            <footer
              class="flex flex-wrap items-center justify-between gap-3 border-t border-base-200 pt-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <app-data-coverage-badge
                  [quality]="item.coverage.estimatedDays > 0 ? 'estimated' : 'exact'"
                />
                <span class="type-caption">
                  {{ item.coverage.estimatedDays }} of {{ item.coverage.days }} stock days estimated
                </span>
              </div>
              <p class="type-caption">
                Historical value is omitted when cost evidence is incomplete.
              </p>
            </footer>
          </div>
        </article>

        <section class="grid gap-3 sm:grid-cols-3" aria-label="Product context">
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-4">
              <p class="type-caption">Preferred supplier</p>
              <p class="font-semibold">{{ item.variant.supplierName || 'Not established' }}</p>
              <p class="text-xs text-base-content/55">Latest posted purchase source</p>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-4">
              <p class="type-caption">Manufacturer</p>
              <p class="font-semibold">{{ item.variant.manufacturerName || 'Not assigned' }}</p>
              <p class="text-xs text-base-content/55">Used for range-level comparison</p>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-4">
              <p class="type-caption">Average stock</p>
              <p class="font-semibold tabular-nums">
                {{ item.summary.averageStock ?? 0 | number: '1.0-3' }} {{ item.variant.stockUnit }}
              </p>
              <p class="text-xs text-base-content/55">Across the selected period</p>
            </div>
          </div>
        </section>
      </section>
    } @else {
      <app-empty-state
        icon="heroCube"
        title="Product profile is updating"
        description="The first product summary normally appears within two minutes."
      />
    }
  `,
})
export class ProductProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly businessClock = inject(BusinessClockService);
  private readonly insights = inject(InsightsService);
  private readonly locations = inject(LocationContextService);
  protected readonly profile = signal<ProductProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly businessToday = signal('');
  protected readonly periodPreset = signal<DateRangePreset | null>(30);
  protected readonly rangeFrom = signal('');
  protected readonly rangeTo = signal('');
  protected readonly fmt = formatKes;
  protected readonly copy = insightCopy;
  private readonly variantId = computed(() => this.route.snapshot.paramMap.get('variantId'));
  private request = 0;
  async ngOnInit(): Promise<void> {
    const [, today] = await Promise.all([this.locations.load(), this.businessClock.today()]);
    this.businessToday.set(today);
    const range = presetDateRange(today, 30);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    await this.load();
  }
  protected setWindow(value: DateRangePreset): void {
    const today = this.businessToday();
    if (!today) return;
    const range = presetDateRange(today, value);
    this.periodPreset.set(value);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    void this.load();
  }
  protected setCustomRange(range: AppliedDateRange): void {
    this.periodPreset.set(null);
    this.rangeFrom.set(range.from);
    this.rangeTo.set(range.to);
    void this.load();
  }
  private async load(): Promise<void> {
    const id = this.variantId();
    const location = this.locations.activeId();
    const request = ++this.request;
    if (!id || !location) {
      this.error.set('A product and location are required.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const profile = await this.insights.productProfile(
        id,
        location,
        this.rangeFrom(),
        this.rangeTo()
      );
      if (request !== this.request) return;
      this.profile.set(profile);
    } catch (error) {
      if (request !== this.request) return;
      this.error.set(
        error instanceof Error ? error.message : 'Could not load this product profile.'
      );
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  protected signal(item: ProductProfile): string {
    return String(item.attention?.['signal'] ?? 'updating');
  }
  protected signalLabel(item: ProductProfile): string {
    return this.signal(item).replaceAll('_', ' ');
  }
  protected signalClass(item: ProductProfile): string {
    const signal = this.signal(item);
    if (signal === 'stockout') return 'badge-error';
    if (signal === 'reorder' || signal === 'low_cover') return 'badge-warning';
    if (signal === 'healthy') return 'badge-success';
    return 'badge-ghost';
  }
  protected decisionHeadline(item: ProductProfile): string {
    switch (this.signal(item)) {
      case 'stockout':
        return 'Replenish before the next sale';
      case 'reorder':
        return 'Prepare the next purchase';
      case 'low_cover':
        return 'Stock may run out during lead time';
      case 'slow':
        return 'Hold purchasing and watch demand';
      case 'healthy':
        return 'Stock is currently healthy';
      default:
        return 'Build more demand history';
    }
  }
  protected decisionReason(item: ProductProfile): string {
    return this.copy(String(item.attention?.['reason_code'] ?? 'insufficient_demand_history'));
  }
  protected reorderQuantity(item: ProductProfile): number | null {
    const value = Number(item.attention?.['reorder_quantity'] ?? 0);
    return value > 0 ? value : null;
  }
  protected attentionNumber(item: ProductProfile, key: string): number | null {
    const value = item.attention?.[key];
    return value === null || value === undefined ? null : Number(value);
  }
  protected coverLabel(item: ProductProfile): string {
    const cover = this.attentionNumber(item, 'days_of_cover');
    return cover === null
      ? 'No demand pace'
      : `${cover.toLocaleString('en-KE', { maximumFractionDigits: 1 })} days cover`;
  }
  protected coverageWidth(item: ProductProfile): number {
    const cover = this.attentionNumber(item, 'days_of_cover');
    return cover === null ? 0 : Math.min(Math.max((cover / 60) * 100, 0), 100);
  }
  protected activeDays(item: ProductProfile): number {
    return item.trend.filter(
      point => Number(point.net_quantity) !== 0 || Number(point.returned_quantity) > 0
    ).length;
  }
  protected averageDailyDemand(item: ProductProfile): string {
    const days = Math.max(item.coverage.days, 1);
    return (item.summary.unitsSold / days).toLocaleString('en-KE', {
      maximumFractionDigits: 2,
    });
  }
  protected stockoutShare(item: ProductProfile): string {
    if (item.coverage.days <= 0) return '0%';
    return `${Math.round((item.summary.stockoutDays / item.coverage.days) * 100)}%`;
  }
  protected marginRate(item: ProductProfile): string {
    const revenue = item.summary.netRevenue ?? 0;
    if (revenue <= 0) return '0% margin';
    return `${Math.round(((item.summary.margin ?? 0) / revenue) * 100)}% margin`;
  }
}
