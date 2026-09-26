import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessClockService } from '../core/business-clock.service';
import { formatKes } from '../core/money';
import { DateRangePresetControlComponent } from '../insights/date-range-preset-control.component';
import { presetDateRange, type AppliedDateRange } from '../insights/date-range';
import type { DateRangePreset } from '../insights/insights.models';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { DailySummary, ReportsService } from './reports.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';

type Tab = 'sales' | 'customers';

type CustomerRow = {
  customerId: string;
  name: string;
  orders: number;
  revenue: number;
  arDelta: number;
};
@Component({
  selector: 'app-reports',
  imports: [
    DateRangePresetControlComponent,
    EmptyStateComponent,
    PaginationComponent,
    ButtonComponent,
    IconComponent,
    MobileListComponent,
    RouterLink,
  ],
  template: `
    <section class="space-y-4">
      <section class="card bg-base-100" aria-labelledby="sales-workspace-title">
        <div class="card-body gap-4 p-4 sm:p-5">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 id="sales-workspace-title" class="section-title">Sales performance</h2>
              <p class="type-caption mt-1">
                Compare revenue and margin, then see which customers contributed.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              title="Refresh sales performance"
              aria-label="Refresh sales performance"
              [loading]="loading()"
              (click)="load()"
            >
              <app-icon name="heroArrowPath" />
            </button>
          </header>

          <app-date-range-preset-control
            [value]="periodPreset()"
            [from]="from()"
            [to]="to()"
            [maxDate]="businessToday()"
            [advanced]="true"
            [loading]="loading()"
            (valueChange)="setPeriodPreset($event)"
            (rangeChange)="setCustomRange($event)"
          />

          <div class="flex flex-wrap items-end justify-between gap-3">
            <div role="tablist" aria-label="Sales analysis view" class="section-tabs">
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="tab() === 'sales'"
                [attr.aria-selected]="tab() === 'sales'"
                (click)="tab.set('sales')"
              >
                Sales trend
              </button>
              <button
                role="tab"
                type="button"
                class="section-tab"
                [class.section-tab-active]="tab() === 'customers'"
                [attr.aria-selected]="tab() === 'customers'"
                (click)="tab.set('customers')"
              >
                Customers
              </button>
            </div>
            <span class="type-caption">Figures refresh hourly.</span>
          </div>
        </div>
      </section>

      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }

      @if (summary().length > 0) {
        <section aria-label="Sales summary" class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Revenue</span>
              <strong class="text-2xl tabular-nums">{{ fmt(totals().revenue) }}</strong>
              <span class="text-xs text-base-content/60">selected period</span>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Margin</span>
              <strong
                class="text-2xl tabular-nums"
                [class.text-success]="totals().margin > 0"
                [class.text-error]="totals().margin < 0"
                >{{ fmt(totals().margin) }}</strong
              >
              <span class="text-xs text-base-content/60">after cost of goods</span>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Sales</span>
              <strong class="text-2xl tabular-nums">{{ totals().orders }}</strong>
              <span class="text-xs text-base-content/60">completed transactions</span>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body gap-1 p-3 sm:p-4">
              <span class="type-caption">Average sale</span>
              <strong class="text-2xl tabular-nums">{{ fmt(averageSale()) }}</strong>
              <span class="text-xs text-base-content/60">revenue per sale</span>
            </div>
          </div>
        </section>
      }

      <!-- Sales tab -->
      @if (tab() === 'sales') {
        @if (!loading() && summary().length === 0) {
          <app-empty-state
            [compact]="true"
            icon="heroBanknotes"
            title="No sales in this range"
            description="Daily revenue, COGS, and margin appear here."
          />
        } @else {
          <app-mobile-list>
            @for (d of pagedSummary(); track d.day) {
              <div mobileListRow class="flex min-h-20 items-center gap-3 p-3">
                <div class="min-w-0 flex-1">
                  <p class="font-semibold">{{ d.day }}</p>
                  <p class="type-caption mt-1">
                    {{ d.orders }} sales · COGS {{ fmt(d.cogs ?? 0) }}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-semibold tabular-nums">{{ fmt(d.revenue ?? 0) }}</p>
                  <p
                    class="type-caption tabular-nums"
                    [class.text-success]="(d.margin ?? 0) > 0"
                    [class.text-error]="(d.margin ?? 0) < 0"
                  >
                    margin {{ fmt(d.margin ?? 0) }}
                  </p>
                </div>
              </div>
            }
          </app-mobile-list>
          <div class="card bg-base-100" data-learning-anchor="financial-revenue-margin">
            <div class="hidden lg:block">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th class="text-right">Sales</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">COGS</th>
                    <th class="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of pagedSummary(); track d.day) {
                    <tr>
                      <td class="text-sm">{{ d.day }}</td>
                      <td class="text-right">{{ d.orders }}</td>
                      <td class="text-right">{{ fmt(d.revenue ?? 0) }}</td>
                      <td class="text-right">{{ fmt(d.cogs ?? 0) }}</td>
                      <td
                        class="text-right font-medium"
                        [class.text-success]="(d.margin ?? 0) > 0"
                        [class.text-error]="(d.margin ?? 0) < 0"
                      >
                        {{ fmt(d.margin ?? 0) }}
                      </td>
                    </tr>
                  }
                  <tr class="font-semibold">
                    <td>Total</td>
                    <td class="text-right">{{ totals().orders }}</td>
                    <td class="text-right">{{ fmt(totals().revenue) }}</td>
                    <td class="text-right">{{ fmt(totals().cogs) }}</td>
                    <td
                      class="text-right"
                      [class.text-success]="totals().margin > 0"
                      [class.text-error]="totals().margin < 0"
                    >
                      {{ fmt(totals().margin) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="p-3">
              <app-pagination
                [currentPage]="page()"
                [totalPages]="totalPages()"
                [totalItems]="summary().length"
                [itemsPerPage]="pageSize"
                itemLabel="days"
                (pageChange)="page.set($event)"
              />
            </div>
          </div>
        }
      }

      <!-- Customers tab -->
      @if (tab() === 'customers') {
        @if (!loading() && customers().length === 0) {
          <app-empty-state
            [compact]="true"
            icon="heroUsers"
            title="No customer sales in this range"
            description="Customers rank here by revenue, with their AR movement."
          />
        } @else {
          <app-mobile-list>
            @for (c of customers(); track c.customerId) {
              <a
                mobileListRow
                class="flex min-h-20 items-center gap-3 p-3"
                routerLink="/customers"
                [queryParams]="{ customer: c.customerId }"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ c.name }}</p>
                  <p class="type-caption mt-1">{{ c.orders }} sales</p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-semibold tabular-nums">{{ fmt(c.revenue) }}</p>
                  <p
                    class="type-caption tabular-nums"
                    [class.text-error]="c.arDelta > 0"
                    [class.text-success]="c.arDelta < 0"
                  >
                    AR Δ {{ fmt(c.arDelta) }}
                  </p>
                </div>
              </a>
            }
          </app-mobile-list>
          <div class="hidden bg-base-100 lg:block lg:rounded-box">
            <div class="hidden lg:block">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th class="text-right">Sales</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">AR Δ</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of customers(); track c.customerId) {
                    <tr>
                      <td class="text-sm font-medium">
                        <a
                          class="link"
                          routerLink="/customers"
                          [queryParams]="{ customer: c.customerId }"
                          >{{ c.name }}</a
                        >
                      </td>
                      <td class="text-right">{{ c.orders }}</td>
                      <td class="text-right">{{ fmt(c.revenue) }}</td>
                      <td
                        class="text-right font-medium"
                        [class.text-error]="c.arDelta > 0"
                        [class.text-success]="c.arDelta < 0"
                      >
                        {{ fmt(c.arDelta) }}
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
export class ReportsComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly businessClock = inject(BusinessClockService);

  protected readonly fmt = formatKes;
  protected readonly tab = signal<Tab>('sales');
  protected readonly businessToday = signal('');
  protected readonly periodPreset = signal<DateRangePreset | null>(30);
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly summary = signal<DailySummary[]>([]);
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = 15;
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.summary().length / this.pageSize))
  );
  protected readonly pagedSummary = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.summary().slice((page - 1) * this.pageSize, page * this.pageSize);
  });

  protected readonly totals = computed(() =>
    this.summary().reduce(
      (acc, d) => ({
        orders: acc.orders + (d.orders ?? 0),
        revenue: acc.revenue + (d.revenue ?? 0),
        cogs: acc.cogs + (d.cogs ?? 0),
        margin: acc.margin + (d.margin ?? 0),
      }),
      { orders: 0, revenue: 0, cogs: 0, margin: 0 }
    )
  );
  protected readonly averageSale = computed(() =>
    this.totals().orders > 0 ? Math.round(this.totals().revenue / this.totals().orders) : 0
  );
  async ngOnInit(): Promise<void> {
    try {
      const today = await this.businessClock.today();
      this.businessToday.set(today);
      const range = presetDateRange(today, 30);
      this.from.set(range.from);
      this.to.set(range.to);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Failed to load the business date');
    }
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    this.page.set(1);
    if (!this.validRange(this.from(), this.to())) {
      return;
    }
    this.loading.set(true);
    try {
      const since = this.from();
      const until = this.to();
      const [summary, customerStats] = await Promise.all([
        this.reports.salesSummary(since, until),
        this.reports.customerStats(since, until),
      ]);
      this.summary.set(summary);
      await this.aggregateCustomers(customerStats);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      this.loading.set(false);
    }
  }

  protected setPeriodPreset(value: DateRangePreset): void {
    const today = this.businessToday();
    if (!today) return;
    const range = presetDateRange(today, value);
    this.periodPreset.set(value);
    this.from.set(range.from);
    this.to.set(range.to);
    void this.load();
  }

  protected setCustomRange(range: AppliedDateRange): void {
    if (!this.validRange(range.from, range.to)) return;
    this.periodPreset.set(null);
    this.from.set(range.from);
    this.to.set(range.to);
    void this.load();
  }

  private validRange(from: string, to: string): boolean {
    if (!from || !to || from > to) {
      this.error.set('The start date must be before the end date.');
      return false;
    }
    if (this.businessToday() && to > this.businessToday()) {
      this.error.set('The period cannot extend beyond the current business date.');
      return false;
    }
    const days =
      Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) +
      1;
    if (days > 365) {
      this.error.set('Choose a period of up to 12 months.');
      return false;
    }
    return true;
  }

  private async aggregateCustomers(
    rows: import('./reports.service').DailyCustomerStats[]
  ): Promise<void> {
    const byCustomer = new Map<string, { orders: number; revenue: number; arDelta: number }>();
    for (const r of rows) {
      if (!r.customer_id) continue;
      const acc = byCustomer.get(r.customer_id) ?? { orders: 0, revenue: 0, arDelta: 0 };
      acc.orders += r.orders ?? 0;
      acc.revenue += r.revenue ?? 0;
      acc.arDelta += r.ar_delta ?? 0;
      byCustomer.set(r.customer_id, acc);
    }
    const top = [...byCustomer.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 20);
    const names = await this.reports.customerNames(top.map(([id]) => id));
    this.customers.set(
      top.map(([customerId, acc]) => ({
        customerId,
        name: names.get(customerId) ?? 'Walk-in',
        orders: acc.orders,
        revenue: acc.revenue,
        arDelta: acc.arDelta,
      }))
    );
  }
}
