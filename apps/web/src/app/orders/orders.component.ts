import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes } from '../core/money';
import { OrderLineWithProduct, OrderWithCustomer, Payment, PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { ORDER_STATUS_MAP, StatusBadgeComponent } from '../shared/ui/status-badge.component';

const ALL_STATUSES = ['completed', 'voided', 'draft', 'pending_payment'];
const PAGE_SIZE = 20;

/**
 * Order history — the ONE orders screen. Defaults to "today" with realtime
 * updates (live badge); status + date-range filters for full history;
 * expandable rows with lines/payments, void flow, and receipt reprint.
 */
@Component({
  selector: 'app-orders',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    EmptyStateComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatusBadgeComponent,
  ],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="page">
        <app-page-header title="Orders" backLink="/dashboard" backLabel="Dashboard">
          @if (isLive()) {
            <span actions class="badge badge-success gap-1">
              <span class="h-2 w-2 animate-pulse rounded-full bg-success"></span>
              live
            </span>
          }
          <button actions class="btn btn-ghost btn-sm" (click)="load()">Refresh</button>
        </app-page-header>

        <!-- Filters -->
        <app-list-search-bar placeholder="Search order code or customer…" [(searchQuery)]="query">
          <div filters class="flex flex-wrap items-end gap-3">
            <label class="form-control">
              <span class="label-text text-xs">Status</span>
              <select class="select select-bordered select-sm" [formControl]="status">
                <option value="all">All</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
                <option value="draft">Draft (proforma)</option>
                <option value="pending_payment">Pending payment</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs">From</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="from" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">To</span>
              <input type="date" class="input input-bordered input-sm" [formControl]="to" />
            </label>
            <button class="btn btn-primary btn-sm min-h-11" (click)="apply()">Apply</button>
            <button class="btn btn-ghost btn-sm min-h-11" (click)="setToday()">Today</button>
            <button class="btn btn-ghost btn-sm min-h-11" (click)="setWeek()">Last 7 days</button>
          </div>
        </app-list-search-bar>

        @if (error()) {
          <p class="my-2 text-sm text-error">{{ error() }}</p>
        }
        @if (warning()) {
          <p class="my-2 text-sm text-warning">{{ warning() }}</p>
        }

        @if (paged().length === 0) {
          <div class="mt-3">
            <app-empty-state
              [compact]="true"
              icon="heroClipboardDocumentList"
              title="No orders in this range"
              description="— widen the dates or clear the status filter."
            />
          </div>
        } @else {
          <div class="mt-3 flex flex-col gap-2">
            @for (order of paged(); track order.id) {
              <div class="card bg-base-100">
                <div class="card-body p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <button class="link font-mono font-semibold" (click)="toggle(order.id)">
                      {{ order.code }}
                    </button>
                    <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                    <span class="text-sm">{{ customerName(order) }}</span>
                    <app-status-badge [type]="statusType(order.status)" [label]="order.status" />
                    @if (order.is_credit_sale) {
                      <app-status-badge type="warning" label="credit" />
                    }
                    <span class="ml-auto font-bold tabular-nums">{{ fmt(order.total) }}</span>
                    @if (order.status !== 'voided' && order.status !== 'draft') {
                      <button
                        class="btn btn-error btn-outline btn-sm"
                        (click)="startVoid(order.id)"
                      >
                        Void
                      </button>
                    }
                  </div>

                  @if (order.status === 'voided' && order.void_reason) {
                    <p class="mt-1 text-xs text-base-content/60">
                      Void reason: {{ order.void_reason }}
                    </p>
                  }

                  @if (voidingFor() === order.id) {
                    <form
                      (submit)="$event.preventDefault(); confirmVoid(order.id)"
                      class="mt-2 flex flex-wrap items-end gap-2 rounded-field bg-base-200 p-2"
                    >
                      <label class="form-control flex-1">
                        <span class="label-text text-xs">Reason</span>
                        <input
                          type="text"
                          class="input input-bordered input-sm"
                          placeholder="e.g. Wrong item rung up"
                          [formControl]="voidReason"
                        />
                      </label>
                      <button
                        type="submit"
                        class="btn btn-error btn-sm min-h-11"
                        [disabled]="voidReason.value.trim().length === 0 || busy()"
                      >
                        Confirm void
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        (click)="voidingFor.set(null)"
                      >
                        Cancel
                      </button>
                    </form>
                  }

                  @if (expandedFor() === order.id) {
                    <div class="mt-3 border-t border-base-300/60 pt-3">
                      <table class="table table-sm">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th class="text-right">Qty</th>
                            <th class="text-right">Price</th>
                            <th class="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (line of lines(); track line.id) {
                            <tr>
                              <td>{{ line.label }}</td>
                              <td class="text-right">{{ line.quantity }}</td>
                              <td class="text-right">
                                {{ fmt(line.custom_price ?? line.unit_price) }}
                              </td>
                              <td class="text-right">{{ fmt(line.line_total) }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      @if (payments().length > 0) {
                        <div class="mt-2 flex flex-wrap gap-2">
                          @for (p of payments(); track p.id) {
                            <span class="badge badge-outline">
                              {{ p.method_code }} · {{ fmt(p.amount) }}
                              @if (p.reference) {
                                · {{ p.reference }}
                              }
                            </span>
                          }
                        </div>
                      } @else {
                        <p class="mt-2 text-xs text-base-content/60">
                          No payments (credit sale or proforma).
                        </p>
                      }
                      @if (printerEnabled()) {
                        <button class="btn btn-outline btn-xs mt-2" (click)="printOrder(order.id)">
                          Print receipt
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <div class="mt-3">
            <app-pagination
              [currentPage]="page()"
              [totalPages]="totalPages()"
              [totalItems]="filtered().length"
              [itemsPerPage]="pageSize"
              itemLabel="orders"
              (pageChange)="page.set($event)"
            />
          </div>
        }
      </div>
    </main>
  `,
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);

  protected readonly fmt = formatKes;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly voidingFor = signal<string | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly warning = signal<string | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly page = signal(1);
  protected readonly query = signal('');

  protected readonly status = new FormControl('all', { nonNullable: true });
  protected readonly from = new FormControl(this.todayIso(), { nonNullable: true });
  protected readonly to = new FormControl(this.todayIso(), { nonNullable: true });

  private channel: RealtimeChannel | null = null;

  /** Live when the range covers today (the old Today's Sales behaviour). */
  protected readonly isLive = computed(
    () => this.from.value <= this.todayIso() && this.to.value >= this.todayIso()
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.orders();
    return this.orders().filter(
      o => o.code.toLowerCase().includes(q) || this.customerName(o).toLowerCase().includes(q)
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize))
  );

  protected readonly paged = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.filtered().slice((page - 1) * this.pageSize, page * this.pageSize);
  });

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    await this.load();
    // Realtime: today's list refreshes on any order/payment change.
    this.channel = this.pos.client
      .channel('orders-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => void this.load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => void this.load()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.channel) void this.pos.client.removeChannel(this.channel);
  }

  protected async apply(): Promise<void> {
    this.page.set(1);
    await this.load();
  }

  protected async setToday(): Promise<void> {
    this.from.setValue(this.todayIso());
    this.to.setValue(this.todayIso());
    await this.apply();
  }

  protected async setWeek(): Promise<void> {
    this.from.setValue(this.daysAgoIso(6));
    this.to.setValue(this.todayIso());
    await this.apply();
  }

  protected async load(): Promise<void> {
    try {
      const statuses = this.status.value === 'all' ? ALL_STATUSES : [this.status.value];
      const since = new Date(`${this.from.value}T00:00:00`).toISOString();
      const untilDate = new Date(`${this.to.value}T00:00:00`);
      untilDate.setDate(untilDate.getDate() + 1); // "to" inclusive
      this.orders.set(await this.pos.ordersByStatus(statuses, since, untilDate.toISOString()));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load orders');
    }
  }

  protected async toggle(orderId: string): Promise<void> {
    if (this.expandedFor() === orderId) {
      this.expandedFor.set(null);
      return;
    }
    this.expandedFor.set(orderId);
    try {
      const [lines, payments] = await Promise.all([
        this.pos.orderLines(orderId),
        this.pos.orderPayments(orderId),
      ]);
      this.lines.set(lines);
      this.payments.set(payments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load order details');
    }
  }

  protected startVoid(orderId: string): void {
    this.voidingFor.set(orderId);
    this.voidReason.setValue('');
  }

  protected async confirmVoid(orderId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.warning.set(null);
    try {
      const result = await this.pos.voidSale(orderId, this.voidReason.value.trim());
      this.voidingFor.set(null);
      if (result.status === 'approval_required') {
        // Not voided — the request waits in the Approvals inbox. Not an error.
        this.warning.set('Void request sent for approval');
      } else {
        this.expandedFor.set(null);
      }
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Void failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async printOrder(orderId: string): Promise<void> {
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildOrderData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected statusType(status: string) {
    return ORDER_STATUS_MAP[status] ?? 'neutral';
  }

  protected customerName(order: OrderWithCustomer): string {
    if (!order.customers) return 'Walk-in';
    return [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ');
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('en-KE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
}
