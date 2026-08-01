import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import { PosService, variantLabel } from '../pos/pos.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { DailySummary, ReportsService } from './reports.service';

type Tab = 'sales' | 'products' | 'customers';

type ProductRow = {
  variantId: string;
  label: string;
  quantity: number;
  revenue: number;
  cogs: number;
  margin: number;
};

type CustomerRow = {
  customerId: string;
  name: string;
  orders: number;
  revenue: number;
  arDelta: number;
};

@Component({
  selector: 'app-reports',
  imports: [RouterLink, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header title="Reports" backLink="/dashboard" backLabel="Dashboard" />

        <!-- Date range -->
        <div class="card mb-4 bg-base-100">
          <div class="card-body flex-row flex-wrap items-end gap-3 p-4">
            <label class="form-control">
              <span class="label-text text-xs">From</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="from" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">To</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="to" />
            </label>
            <button class="btn btn-primary btn-sm min-h-11" (click)="load()">Apply</button>
            <span class="type-caption ml-auto">Figures refresh hourly.</span>
          </div>
        </div>

        @if (error()) {
          <p class="mb-2 text-sm text-error">{{ error() }}</p>
        }

        <div role="tablist" class="tabs tabs-boxed mb-4">
          <a
            role="tab"
            class="tab min-h-11"
            [class.tab-active]="tab() === 'sales'"
            (click)="tab.set('sales')"
            >Sales</a
          >
          <a
            role="tab"
            class="tab min-h-11"
            [class.tab-active]="tab() === 'products'"
            (click)="tab.set('products')"
            >Products</a
          >
          <a
            role="tab"
            class="tab min-h-11"
            [class.tab-active]="tab() === 'customers'"
            (click)="tab.set('customers')"
            >Customers</a
          >
        </div>

        <!-- Sales tab -->
        @if (tab() === 'sales') {
          @if (summary().length === 0) {
            <app-empty-state
              icon="heroBanknotes"
              title="No sales in this range"
              description="Daily revenue, COGS, and margin appear here."
            />
          } @else {
            <div class="card bg-base-100">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th class="text-right">Orders</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">COGS</th>
                    <th class="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of summary(); track d.day) {
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
          }
        }

        <!-- Products tab -->
        @if (tab() === 'products') {
          @if (products().length === 0) {
            <app-empty-state
              icon="heroCube"
              title="No product sales in this range"
              description="Variants rank here by revenue once you sell."
            />
          } @else {
            <div class="card bg-base-100">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Revenue</th>
                    <th class="text-right">COGS</th>
                    <th class="text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of products(); track p.variantId) {
                    <tr>
                      <td class="text-sm font-medium">{{ p.label }}</td>
                      <td class="text-right">{{ p.quantity }}</td>
                      <td class="text-right">{{ fmt(p.revenue) }}</td>
                      <td class="text-right">{{ fmt(p.cogs) }}</td>
                      <td
                        class="text-right font-medium"
                        [class.text-success]="p.margin > 0"
                        [class.text-error]="p.margin < 0"
                      >
                        {{ fmt(p.margin) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <!-- Customers tab -->
        @if (tab() === 'customers') {
          @if (customers().length === 0) {
            <app-empty-state
              icon="heroUsers"
              title="No customer sales in this range"
              description="Customers rank here by revenue, with their AR movement."
            />
          } @else {
            <div class="card bg-base-100">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th class="text-right">Orders</th>
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
          }
        }
      </div>
    </main>
  `,
})
export class ReportsComponent implements OnInit {
  private readonly reports = inject(ReportsService);
  private readonly pos = inject(PosService);

  protected readonly fmt = formatKes;
  protected readonly tab = signal<Tab>('sales');
  protected readonly from = new FormControl(this.daysAgoIso(29), { nonNullable: true });
  protected readonly to = new FormControl(this.todayIso(), { nonNullable: true });

  protected readonly summary = signal<DailySummary[]>([]);
  protected readonly products = signal<ProductRow[]>([]);
  protected readonly customers = signal<CustomerRow[]>([]);
  protected readonly error = signal<string | null>(null);

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

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const since = this.from.value;
      const [summary, productSales, customerStats] = await Promise.all([
        this.reports.salesSummary(since),
        this.reports.productSales(since),
        this.reports.customerStats(since),
      ]);
      this.summary.set(summary);
      await this.aggregateProducts(productSales);
      await this.aggregateCustomers(customerStats);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load reports');
    }
  }

  private async aggregateProducts(
    rows: import('./reports.service').DailyProductSales[]
  ): Promise<void> {
    const byVariant = new Map<string, { quantity: number; revenue: number; cogs: number }>();
    for (const r of rows) {
      if (!r.variant_id) continue;
      const acc = byVariant.get(r.variant_id) ?? { quantity: 0, revenue: 0, cogs: 0 };
      acc.quantity += Number(r.quantity ?? 0);
      acc.revenue += r.revenue ?? 0;
      acc.cogs += r.cogs ?? 0;
      byVariant.set(r.variant_id, acc);
    }
    const top = [...byVariant.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 20);
    const variants = await this.pos.variantsByIds(top.map(([id]) => id));
    const byId = new Map(variants.map(v => [v.variant_id, v]));
    this.products.set(
      top.map(([variantId, acc]) => ({
        variantId,
        label: byId.has(variantId) ? variantLabel(byId.get(variantId)!) : variantId.slice(0, 8),
        quantity: acc.quantity,
        revenue: acc.revenue,
        cogs: acc.cogs,
        margin: acc.revenue - acc.cogs,
      }))
    );
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
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgoIso(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
}
