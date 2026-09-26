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
  ],
  template: `
    @if (loading()) {
      <div class="flex min-h-64 items-center justify-center gap-2 text-sm text-base-content/60">
        <span class="loading loading-spinner"></span>Loading product profile
      </div>
    } @else if (error()) {
      <div role="alert" class="alert alert-error">
        <app-icon name="heroExclamationTriangle" />{{ error() }}
      </div>
    } @else if (profile(); as item) {
      <section class="space-y-4">
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
          <div class="card-body p-4 sm:p-6">
            <div class="flex flex-wrap items-start justify-between gap-3">
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
              <span
                class="badge badge-lg"
                [class.badge-error]="signal(item) === 'stockout'"
                [class.badge-warning]="signal(item) === 'reorder' || signal(item) === 'low_cover'"
                >{{ signal(item).replaceAll('_', ' ') }}</span
              >
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Current stock</p>
                <p class="text-lg font-bold">
                  {{ attentionNumber(item, 'current_stock') | number: '1.0-3' }}
                </p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Days of cover</p>
                <p class="text-lg font-bold">
                  @if (attentionNumber(item, 'days_of_cover') !== null) {
                    {{ attentionNumber(item, 'days_of_cover') | number: '1.0-1' }}
                  } @else {
                    —
                  }
                </p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Units sold</p>
                <p class="text-lg font-bold">{{ item.summary.unitsSold | number: '1.0-3' }}</p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Average stock</p>
                <p class="text-lg font-bold">{{ item.summary.averageStock | number: '1.0-3' }}</p>
              </div>
              <div class="rounded-box bg-base-200 p-3">
                <p class="type-caption">Stockout days</p>
                <p class="text-lg font-bold">{{ item.summary.stockoutDays }}</p>
              </div>
              @if (item.summary.netRevenue !== null) {
                <div class="rounded-box bg-base-200 p-3">
                  <p class="type-caption">Net sales / margin</p>
                  <p class="text-lg font-bold">{{ fmt(item.summary.netRevenue) }}</p>
                  <p class="type-caption">{{ fmt(item.summary.margin ?? 0) }} margin</p>
                </div>
              }
            </div>
            @if (reorderQuantity(item); as quantity) {
              <div
                class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-field bg-warning/10 p-3"
              >
                <p class="text-sm">
                  Suggested reorder: <strong>{{ quantity | number: '1.0-3' }}</strong>
                  {{ item.variant.stockUnit }}
                  @if (item.variant.supplierName) {
                    from {{ item.variant.supplierName }}
                  }
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
          </div>
        </article>
        <div class="grid items-start gap-4 xl:grid-cols-3">
          <article class="card bg-base-100 xl:col-span-2">
            <div class="card-body p-0">
              <header class="border-b border-base-200 p-4">
                <h3 class="section-title">Demand trend</h3>
                <p class="type-caption">Gross sales, returns, and net demand remain separate.</p>
              </header>
              <div class="hidden overflow-x-auto lg:block">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th class="text-right">Gross units</th>
                      <th class="text-right">Returns</th>
                      <th class="text-right">Net units</th>
                      @if (item.summary.netRevenue !== null) {
                        <th class="text-right">Net sales</th>
                        <th class="text-right">Margin</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (point of item.trend; track point['day']) {
                      <tr>
                        <td>{{ point['day'] | date: 'mediumDate' }}</td>
                        <td class="text-right">{{ point['gross_quantity'] | number: '1.0-3' }}</td>
                        <td class="text-right">
                          {{ point['returned_quantity'] | number: '1.0-3' }}
                        </td>
                        <td class="text-right font-semibold">
                          {{ point['net_quantity'] | number: '1.0-3' }}
                        </td>
                        @if (item.summary.netRevenue !== null) {
                          <td class="text-right">{{ fmtNumber(point['net_revenue']) }}</td>
                          <td class="text-right">{{ fmtNumber(point['margin']) }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="divide-y divide-base-200 lg:hidden">
                @for (point of item.trend; track point['day']) {
                  <article class="space-y-2 p-4">
                    <p class="font-semibold">{{ point['day'] | date: 'mediumDate' }}</p>
                    <dl class="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt class="type-caption">Gross</dt>
                        <dd class="tabular-nums">
                          {{ point['gross_quantity'] | number: '1.0-3' }}
                        </dd>
                      </div>
                      <div>
                        <dt class="type-caption">Returns</dt>
                        <dd class="tabular-nums">
                          {{ point['returned_quantity'] | number: '1.0-3' }}
                        </dd>
                      </div>
                      <div>
                        <dt class="type-caption">Net</dt>
                        <dd class="font-semibold tabular-nums">
                          {{ point['net_quantity'] | number: '1.0-3' }}
                        </dd>
                      </div>
                    </dl>
                    @if (item.summary.netRevenue !== null) {
                      <p class="type-caption">
                        Net sales {{ fmtNumber(point['net_revenue']) }} · margin
                        {{ fmtNumber(point['margin']) }}
                      </p>
                    }
                  </article>
                }
              </div>
            </div>
          </article>
          <article class="card bg-base-100">
            <div class="card-body p-4">
              <h3 class="section-title">Stock coverage</h3>
              <p class="type-caption">
                {{ item.coverage.from | date: 'mediumDate' }}–{{
                  item.coverage.to | date: 'mediumDate'
                }}
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <app-data-coverage-badge
                  [quality]="item.coverage.estimatedDays > 0 ? 'estimated' : 'exact'"
                /><span class="type-caption">{{ item.coverage.estimatedDays }} estimated days</span>
              </div>
              <p class="mt-3 text-sm">
                Historical value is omitted when cost evidence is incomplete.
              </p>
            </div>
          </article>
        </div>
        <article class="card bg-base-100">
          <div class="card-body p-0">
            <header class="border-b border-base-200 p-4">
              <h3 class="section-title">Sparse stock positions</h3>
              <p class="type-caption">
                Expanded only for this product; the selected range never exceeds 366 days.
              </p>
            </header>
            <div class="hidden overflow-x-auto lg:block">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th class="text-right">Closing stock</th>
                    <th class="text-right">Closing value</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  @for (position of item.positions; track position.day) {
                    <tr>
                      <td>{{ position.day | date: 'mediumDate' }}</td>
                      <td class="text-right">
                        {{
                          position.closing_quantity === null
                            ? '—'
                            : (position.closing_quantity | number: '1.0-3')
                        }}
                      </td>
                      <td class="text-right">
                        {{ position.closing_value === null ? '—' : fmt(position.closing_value) }}
                      </td>
                      <td><app-data-coverage-badge [quality]="position.quality" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="divide-y divide-base-200 lg:hidden">
              @for (position of item.positions; track position.day) {
                <article class="space-y-2 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="font-semibold">{{ position.day | date: 'mediumDate' }}</p>
                    <app-data-coverage-badge [quality]="position.quality" />
                  </div>
                  <dl class="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt class="type-caption">Closing stock</dt>
                      <dd class="font-semibold tabular-nums">
                        {{
                          position.closing_quantity === null
                            ? '—'
                            : (position.closing_quantity | number: '1.0-3')
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt class="type-caption">Closing value</dt>
                      <dd class="font-semibold tabular-nums">
                        {{ position.closing_value === null ? '—' : fmt(position.closing_value) }}
                      </dd>
                    </div>
                  </dl>
                </article>
              }
            </div>
          </div>
        </article>
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
    if (!id || !location) {
      this.error.set('A product and location are required.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.profile.set(
        await this.insights.productProfile(id, location, this.rangeFrom(), this.rangeTo())
      );
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not load this product profile.'
      );
    } finally {
      this.loading.set(false);
    }
  }
  protected signal(item: ProductProfile): string {
    return String(item.attention?.['signal'] ?? 'updating');
  }
  protected reorderQuantity(item: ProductProfile): number | null {
    const value = Number(item.attention?.['reorder_quantity'] ?? 0);
    return value > 0 ? value : null;
  }
  protected attentionNumber(item: ProductProfile, key: string): number | null {
    const value = item.attention?.[key];
    return value === null || value === undefined ? null : Number(value);
  }
  protected fmtNumber(value: number | string | null): string {
    return formatKes(Number(value ?? 0));
  }
}
