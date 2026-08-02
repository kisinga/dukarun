import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { formatKes } from '../../core/money';
import { Company, SupabaseService } from '../../core/supabase.service';
import { ThemeService } from '../../core/theme.service';
import { ApprovalsService } from '../../approvals/approvals.service';
import { SyncService } from '../../pos/offline/sync.service';
import { PosService, variantLabel, type Variant } from '../../pos/pos.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import {
  DailyProductSales,
  DailySummary,
  ExpiringBatch,
  LowStockVariant,
  ReportsService,
} from '../../reports/reports.service';

type TopVariant = { variantId: string; label: string; revenue: number; margin: number };

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgIcon, PageHeaderComponent, StatCardComponent, EmptyStateComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-4xl">
        <app-page-header [title]="company()?.name ?? 'Dukarun'" subtitle="Dashboard">
          <button
            actions
            class="btn btn-ghost btn-sm min-h-11 min-w-11"
            [title]="theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
            (click)="theme.toggle()"
          >
            <ng-icon [name]="theme.theme() === 'light' ? 'heroMoon' : 'heroSun'" />
          </button>
          <button actions class="btn btn-outline btn-sm min-h-11" (click)="signOut()">
            Sign out
          </button>
        </app-page-header>

        @if (loadError()) {
          <p class="mb-2 text-sm text-error">{{ loadError() }}</p>
        }

        <!-- Hero stats — money talks first -->
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <app-stat-card label="Today's revenue" [value]="fmt(today()?.revenue ?? 0)" />
          <app-stat-card label="Today's orders" [value]="String(today()?.orders ?? 0)" />
          <app-stat-card
            label="Today's margin"
            [value]="fmt(today()?.margin ?? 0)"
            [tone]="(today()?.margin ?? 0) >= 0 ? 'success' : 'error'"
          />
          <app-stat-card
            label="Pending sync"
            [value]="String(pendingCount())"
            [tone]="sync.failedCount() > 0 ? 'error' : pendingCount() > 0 ? 'warning' : 'neutral'"
          />
        </div>
        <p class="type-caption mt-1">Figures refresh hourly.</p>

        @if (pendingCount() > 0) {
          <a
            routerLink="/pos/sync"
            class="btn mt-2 w-full min-h-11"
            [class.btn-error]="sync.failedCount() > 0"
            [class.btn-warning]="sync.failedCount() === 0"
          >
            {{ pendingCount() }} sale(s) awaiting sync
            @if (sync.failedCount() > 0) {
              — {{ sync.failedCount() }} failed
            }
          </a>
        }

        <!-- Last 7 days -->
        <h2 class="type-heading mt-6">Last 7 days</h2>
        <div class="card mt-2 bg-base-100">
          @if (week().length === 0) {
            <app-empty-state
              [embedded]="true"
              icon="heroBanknotes"
              title="No sales this week"
              description="Revenue and margin show up here once you start selling."
            />
          } @else {
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Day</th>
                  <th></th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                @for (d of week(); track d.day) {
                  <tr>
                    <td class="text-sm">{{ shortDay(d.day) }}</td>
                    <td class="w-full">
                      <div
                        class="h-2 rounded-full bg-primary/70"
                        [style.width.%]="barWidth(d.revenue ?? 0)"
                      ></div>
                    </td>
                    <td class="text-right">{{ fmt(d.revenue ?? 0) }}</td>
                    <td
                      class="text-right font-medium"
                      [class.text-success]="(d.margin ?? 0) > 0"
                      [class.text-error]="(d.margin ?? 0) < 0"
                    >
                      {{ fmt(d.margin ?? 0) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Top variants by margin -->
        <h2 class="type-heading mt-6">Top variants by margin · 7 days</h2>
        <div class="card mt-2 bg-base-100">
          @if (topVariants().length === 0) {
            <app-empty-state
              [embedded]="true"
              icon="heroCube"
              title="Nothing sold yet"
              description="Your best-margin variants rank here after a week of sales."
            />
          } @else {
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Variant</th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                @for (v of topVariants(); track v.variantId) {
                  <tr>
                    <td class="type-caption">{{ $index + 1 }}</td>
                    <td class="text-sm font-medium">{{ v.label }}</td>
                    <td class="text-right">{{ fmt(v.revenue) }}</td>
                    <td
                      class="text-right font-medium"
                      [class.text-success]="v.margin > 0"
                      [class.text-error]="v.margin < 0"
                    >
                      {{ fmt(v.margin) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Needs attention (warning semantics — never decorative) -->
        <h2 class="type-heading mt-6">Needs attention</h2>
        <div class="mt-2 grid gap-2 lg:grid-cols-2">
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <h3 class="type-heading">Low stock</h3>
              @if (lowStock().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  icon="heroCheckCircle"
                  title="All stocked up"
                  description="Nothing below its low-stock threshold."
                />
              } @else {
                <div class="mt-1 flex flex-col gap-2">
                  @for (item of lowStock(); track item.variant_id) {
                    <div class="flex items-center gap-2 text-sm">
                      <ng-icon name="heroCube" class="text-warning" />
                      <span class="flex-1">
                        {{ item.product_name }} — {{ item.variant_name }}
                      </span>
                      <span class="font-medium tabular-nums text-warning">
                        {{ item.stock }} / {{ item.low_stock_threshold }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <h3 class="type-heading">Expiring batches</h3>
              @if (expiring().length === 0) {
                <app-empty-state
                  [embedded]="true"
                  icon="heroCheckCircle"
                  title="Nothing expiring"
                  description="No batches nearing their expiry date."
                />
              } @else {
                <div class="mt-1 flex flex-col gap-2">
                  @for (batch of expiring(); track batch.batch_id) {
                    <div class="flex items-center gap-2 text-sm">
                      <span class="flex-1">
                        {{ batch.product_name }} — {{ batch.variant_name }}
                      </span>
                      <span class="type-caption">{{ batch.expiry_date }}</span>
                      <span class="font-medium tabular-nums text-warning">
                        {{ batch.remaining }} left
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <h2 class="type-heading mt-6">Sell</h2>
        <nav class="mt-2 grid grid-cols-2 gap-2">
          <a routerLink="/pos/sell" class="btn btn-primary min-h-11">Sell</a>
          <a routerLink="/pos/sales" class="btn btn-outline min-h-11">Today's Sales</a>
          <a routerLink="/orders" class="btn btn-outline min-h-11">Orders</a>
          <a routerLink="/pos/proformas" class="btn btn-outline min-h-11">Proformas</a>
          <a routerLink="/pos/cashier" class="btn btn-outline min-h-11">Cashier Queue</a>
          <a routerLink="/products" class="btn btn-outline min-h-11">Products</a>
          <a routerLink="/customers" class="btn btn-outline min-h-11">Customers</a>
          <a routerLink="/reports" class="btn btn-outline min-h-11">Reports</a>
          <a routerLink="/approvals" class="btn btn-outline min-h-11">
            Approvals
            @if (approvals.pending().length > 0) {
              <span class="badge badge-warning">{{ approvals.pending().length }}</span>
            }
          </a>
          <a routerLink="/team" class="btn btn-outline min-h-11">Team</a>
          <a routerLink="/settings" class="btn btn-outline min-h-11">Settings</a>
        </nav>

        <h2 class="type-heading mt-6">Money</h2>
        <nav class="mt-2 grid grid-cols-2 gap-2">
          <a routerLink="/money/cashier" class="btn btn-outline min-h-11">Cashier Sessions</a>
          <a routerLink="/money/expenses" class="btn btn-outline min-h-11">Expenses</a>
          <a routerLink="/money/transfers" class="btn btn-outline min-h-11">Transfers</a>
          <a routerLink="/money/credit" class="btn btn-outline min-h-11">Customer Credit</a>
          <a routerLink="/money/suppliers" class="btn btn-outline min-h-11">Suppliers</a>
          <a routerLink="/money/periods" class="btn btn-outline min-h-11">Reconciliation</a>
          <a routerLink="/money/stock" class="btn btn-outline min-h-11">Stock Adjustments</a>
        </nav>

        @if (company(); as c) {
          <p class="type-caption mt-6">{{ c.code }} · {{ role() ?? '—' }}</p>
        }
      </div>
    </main>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly reports = inject(ReportsService);
  private readonly pos = inject(PosService);
  protected readonly sync = inject(SyncService);
  protected readonly theme = inject(ThemeService);
  protected readonly approvals = inject(ApprovalsService);

  protected readonly fmt = formatKes;
  protected readonly String = String;

  protected readonly company = signal<Company | null>(null);
  protected readonly role = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly summary = signal<DailySummary[]>([]);
  protected readonly productSales = signal<DailyProductSales[]>([]);
  protected readonly topVariants = signal<TopVariant[]>([]);
  protected readonly lowStock = signal<LowStockVariant[]>([]);
  protected readonly expiring = signal<ExpiringBatch[]>([]);

  protected readonly pendingCount = computed(
    () => this.sync.queuedCount() + this.sync.failedCount()
  );

  protected readonly today = computed(() => this.summary().find(d => d.day === this.todayIso()));
  protected readonly week = computed(() => this.summary());

  private readonly maxRevenue = computed(() =>
    Math.max(1, ...this.summary().map(d => d.revenue ?? 0))
  );

  async ngOnInit(): Promise<void> {
    this.role.set(this.supabase.claims()?.user_role ?? null);
    try {
      const company = await this.supabase.currentCompany();
      if (!company) {
        // Authenticated but not provisioned — send to registration.
        await this.router.navigate(['/register']);
        return;
      }
      this.company.set(company);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load company');
      return;
    }
    void this.loadReports();
  }

  private async loadReports(): Promise<void> {
    try {
      const since = this.daysAgoIso(6); // today + 6 back = last 7 days
      const [summary, productSales, lowStock, expiring] = await Promise.all([
        this.reports.salesSummary(since),
        this.reports.productSales(since),
        this.reports.lowStock(),
        this.reports.expiringBatches(),
      ]);
      this.summary.set(summary);
      this.productSales.set(productSales);
      this.lowStock.set(lowStock);
      this.expiring.set(expiring);
      await this.computeTopVariants(productSales);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load reports');
    }
  }

  /** Aggregate 7-day product sales by variant, rank by margin, resolve labels. */
  private async computeTopVariants(rows: DailyProductSales[]): Promise<void> {
    const byVariant = new Map<string, { revenue: number; margin: number }>();
    for (const r of rows) {
      if (!r.variant_id) continue;
      const acc = byVariant.get(r.variant_id) ?? { revenue: 0, margin: 0 };
      acc.revenue += r.revenue ?? 0;
      acc.margin += (r.revenue ?? 0) - (r.cogs ?? 0);
      byVariant.set(r.variant_id, acc);
    }
    const top = [...byVariant.entries()].sort((a, b) => b[1].margin - a[1].margin).slice(0, 5);
    const variants = await this.pos.variantsByIds(top.map(([id]) => id));
    const byId = new Map(variants.map(v => [v.variant_id, v]));
    this.topVariants.set(
      top.map(([variantId, acc]) => ({
        variantId,
        label: byId.has(variantId)
          ? variantLabel(byId.get(variantId) as Variant)
          : variantId.slice(0, 8),
        revenue: acc.revenue,
        margin: acc.margin,
      }))
    );
  }

  protected barWidth(revenue: number): number {
    return Math.max(2, Math.round((revenue / this.maxRevenue()) * 100));
  }

  protected shortDay(day: string | null): string {
    if (!day) return '—';
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-KE', {
      weekday: 'short',
      day: 'numeric',
    });
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private daysAgoIso(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  protected async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
