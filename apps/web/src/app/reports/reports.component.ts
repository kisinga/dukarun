import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { PosService, variantLabel } from '../pos/pos.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { DailySummary, ReportsService } from './reports.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MobileListComponent } from '../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../shared/ui/page-actions.component';
import { RestockIntelligenceComponent } from './restock-intelligence.component';

type Tab = 'sales' | 'products' | 'customers' | 'inventory';

type CustomerRow = {
  customerId: string;
  name: string;
  orders: number;
  revenue: number;
  arDelta: number;
};
type InventoryRow = {
  variantId: string;
  label: string;
  manufacturer: string;
  stock: number;
  value: number;
  retailValue: number;
  potentialMargin: number;
};

@Component({
  selector: 'app-reports',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    EmptyStateComponent,
    PaginationComponent,
    ButtonComponent,
    DrawerComponent,
    FormFieldComponent,
    IconComponent,
    MobileListComponent,
    PageActionsComponent,
    RestockIntelligenceComponent,
  ],
  template: `
    <app-page title="Reports" [wide]="true">
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          type="button"
          title="Refresh reports"
          aria-label="Refresh reports"
          [loading]="loading()"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
        <button
          primaryAction
          appButton
          type="button"
          class="md:hidden"
          (click)="filtersOpen.set(true)"
        >
          <app-icon name="heroFunnel" /> Period
        </button>
      </app-page-actions>
      <!-- Date range -->
      <div class="card mb-4 hidden bg-base-100 md:block">
        <div class="card-body flex-row flex-wrap items-end gap-3 p-4">
          <label class="form-control">
            <span class="label-text text-xs">From</span>
            <input type="date" class="input input-bordered input-sm" [formControl]="from" />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">To</span>
            <input type="date" class="input input-bordered input-sm" [formControl]="to" />
          </label>
          <button class="btn btn-primary btn-sm min-h-11" [disabled]="loading()" (click)="load()">
            {{ loading() ? 'Loading…' : 'Apply' }}
          </button>
          <span class="type-caption ml-auto">Figures refresh hourly.</span>
        </div>
      </div>

      @if (filtersOpen()) {
        <app-drawer
          [open]="true"
          title="Report period"
          subtitle="Choose the dates included in every report"
          (closed)="cancelReportFilters()"
        >
          <div class="grid gap-3">
            <app-form-field label="From">
              <input type="date" class="input input-bordered w-full" [formControl]="from" />
            </app-form-field>
            <app-form-field label="To">
              <input type="date" class="input input-bordered w-full" [formControl]="to" />
            </app-form-field>
          </div>
          <div drawerFooter class="flex justify-end gap-2">
            <button appButton variant="ghost" type="button" (click)="cancelReportFilters()">
              Cancel
            </button>
            <button appButton type="button" [loading]="loading()" (click)="applyReportFilters()">
              View report
            </button>
          </div>
        </app-drawer>
      }

      @if (error()) {
        <p class="mb-2 text-sm text-error">{{ error() }}</p>
      }

      <select
        class="select select-bordered mb-3 min-h-11 w-full sm:hidden"
        [value]="tab()"
        (change)="setReportTab($event)"
      >
        <option value="sales">Sales</option>
        <option value="products">Products</option>
        <option value="customers">Customers</option>
        <option value="inventory">Inventory</option>
      </select>
      <div role="tablist" class="section-tabs mb-4 hidden sm:flex">
        <button
          role="tab"
          type="button"
          class="section-tab"
          [class.section-tab-active]="tab() === 'sales'"
          [attr.aria-selected]="tab() === 'sales'"
          (click)="tab.set('sales')"
        >
          Sales
        </button>
        <button
          role="tab"
          type="button"
          class="section-tab"
          [class.section-tab-active]="tab() === 'products'"
          [attr.aria-selected]="tab() === 'products'"
          (click)="tab.set('products')"
        >
          Products
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
        <button
          role="tab"
          type="button"
          class="section-tab"
          [class.section-tab-active]="tab() === 'inventory'"
          [attr.aria-selected]="tab() === 'inventory'"
          (click)="tab.set('inventory')"
        >
          Inventory
        </button>
      </div>

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
          <div class="card bg-base-100">
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

      <!-- Products tab -->
      @if (tab() === 'products') {
        <app-restock-intelligence [since]="appliedFrom()" [until]="appliedTo()" />
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
              <div mobileListRow class="flex min-h-20 items-center gap-3 p-3">
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
              </div>
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
                      <td class="text-sm font-medium">{{ c.name }}</td>
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

      @if (tab() === 'inventory') {
        <div class="mb-3 grid gap-2 sm:grid-cols-3">
          <div class="card bg-base-100">
            <div class="card-body p-3">
              <span class="type-caption">Stock at cost</span
              ><strong class="text-xl">{{ fmt(inventoryTotals().cost) }}</strong>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body p-3">
              <span class="type-caption">Potential retail</span
              ><strong class="text-xl">{{ fmt(inventoryTotals().retail) }}</strong>
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body p-3">
              <span class="type-caption">Potential margin</span
              ><strong class="text-xl text-success">{{ fmt(inventoryTotals().margin) }}</strong>
            </div>
          </div>
        </div>
        @if (!loading() && inventory().length === 0) {
          <app-empty-state
            [compact]="true"
            icon="heroArchiveBox"
            title="No stock valuation"
            description="Opening stock and received purchases appear here."
          />
        } @else {
          <app-mobile-list>
            @for (row of inventory(); track row.variantId) {
              <div mobileListRow class="flex min-h-20 items-center gap-3 p-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ row.label }}</p>
                  <p class="type-caption mt-1 truncate">
                    {{ row.manufacturer }} · {{ row.stock }} on hand
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="font-semibold tabular-nums">{{ fmt(row.value) }}</p>
                  <p class="type-caption tabular-nums">retail {{ fmt(row.retailValue) }}</p>
                </div>
              </div>
            }
          </app-mobile-list>
          <div class="hidden overflow-hidden bg-base-100 lg:block lg:rounded-box">
            <div class="hidden lg:block">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th class="text-right">On hand</th>
                    <th class="text-right">Cost value</th>
                    <th class="text-right">Retail value</th>
                    <th class="text-right">Potential margin</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of inventory(); track row.variantId) {
                    <tr>
                      <td>
                        <p class="font-medium">{{ row.label }}</p>
                        <p class="type-caption">{{ row.manufacturer }}</p>
                      </td>
                      <td class="text-right">{{ row.stock }}</td>
                      <td class="text-right">{{ fmt(row.value) }}</td>
                      <td class="text-right">{{ fmt(row.retailValue) }}</td>
                      <td class="text-right text-success">{{ fmt(row.potentialMargin) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </app-page>
  `,
})
export class ReportsComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly tab = signal<Tab>('sales');
  protected readonly from = new FormControl(this.daysAgoIso(29), { nonNullable: true });
  protected readonly to = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly appliedFrom = signal(this.from.value);
  protected readonly appliedTo = signal(this.to.value);

  protected readonly summary = signal<DailySummary[]>([]);
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly inventory = signal<InventoryRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly filtersOpen = signal(false);
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
  protected readonly inventoryTotals = computed(() =>
    this.inventory().reduce(
      (acc, row) => ({
        cost: acc.cost + row.value,
        retail: acc.retail + row.retailValue,
        margin: acc.margin + row.potentialMargin,
      }),
      { cost: 0, retail: 0, margin: 0 }
    )
  );

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    this.page.set(1);
    if (this.from.value > this.to.value) {
      this.error.set('The From date must be before the To date');
      return;
    }
    this.loading.set(true);
    try {
      const since = this.from.value;
      const until = this.to.value;
      const [summary, customerStats, stock, catalog] = await Promise.all([
        this.reports.salesSummary(since, until),
        this.reports.customerStats(since, until),
        this.pos.productStock(),
        this.pos.fetchActiveVariants(),
      ]);
      this.summary.set(summary);
      await this.aggregateCustomers(customerStats);
      this.inventory.set(
        catalog
          .filter(v => v.kind !== 'service' && v.track_inventory && v.variant_id)
          .map(v => {
            const current = stock.get(v.variant_id!) ?? { stock: 0, stock_value: 0 };
            const retail = Math.round(current.stock * (v.price ?? 0));
            return {
              variantId: v.variant_id!,
              label: variantLabel(v),
              manufacturer: v.manufacturer_name || 'Manufacturer not set',
              stock: current.stock,
              value: current.stock_value,
              retailValue: retail,
              potentialMargin: retail - current.stock_value,
            };
          })
          .sort((a, b) => b.value - a.value)
      );
      this.appliedFrom.set(since);
      this.appliedTo.set(until);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      this.loading.set(false);
    }
  }

  protected async applyReportFilters(): Promise<void> {
    await this.load();
    if (!this.error()) this.filtersOpen.set(false);
  }

  protected cancelReportFilters(): void {
    this.from.setValue(this.appliedFrom());
    this.to.setValue(this.appliedTo());
    this.filtersOpen.set(false);
  }

  protected setReportTab(event: Event): void {
    this.tab.set((event.target as HTMLSelectElement).value as Tab);
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

  private todayIso(): string {
    return this.nairobiDate(new Date());
  }

  private daysAgoIso(n: number): string {
    return this.nairobiDate(new Date(Date.now() - n * 86_400_000));
  }

  /** Business dates are Africa/Nairobi, not UTC (00:00-03:00 EAT is still "today"). */
  private nairobiDate(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }
}
