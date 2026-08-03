import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes, formatKesInput } from '../core/money';
import { OrderLineWithProduct, OrderWithCustomer, Payment, PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { ListSearchBarComponent } from '../shared/ui/list-search-bar.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PaginationComponent } from '../shared/ui/pagination.component';
import { ORDER_STATUS_MAP, StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { MoneyService } from '../money/money.service';
import { DataTableShellComponent } from '../shared/ui/data-table-shell.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';

const ALL_STATUSES = ['completed', 'voided', 'draft', 'pending_payment'];

/**
 * Sales history — the canonical sales screen. Defaults to "today" with realtime
 * updates (live badge); status + date-range filters for full history;
 * expandable rows with lines/payments, void flow, and receipt reprint.
 */
@Component({
  selector: 'app-orders',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    EmptyStateComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    StatBarComponent,
    MoneyComponent,
  ],
  template: `
    <app-page
      title="Sales"
      subtitle="Review completed sales, cashier handoffs, proformas, refunds, and voids."
    >
      @if (isLive()) {
        <span actions class="badge badge-success gap-1">
          <span class="h-2 w-2 animate-pulse rounded-full bg-success"></span>
          Live
        </span>
      }
      <button actions appButton variant="ghost" [loading]="loading()" (click)="load()">
        <app-icon name="heroArrowPath" /> Refresh
      </button>

      <app-list-search-bar placeholder="Search sale code or customer…" [(searchQuery)]="query">
        <app-stat-bar summary [stats]="salesStats()" />
        <div filters class="flex flex-wrap items-end gap-2">
          <app-form-field label="Status">
            <select class="select select-bordered select-sm" [formControl]="status">
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="draft">Draft (proforma)</option>
              <option value="pending_payment">Cashier queue</option>
            </select>
          </app-form-field>
          <app-form-field label="From">
            <input type="date" class="input input-bordered input-sm" [formControl]="from" />
          </app-form-field>
          <app-form-field label="To">
            <input type="date" class="input input-bordered input-sm" [formControl]="to" />
          </app-form-field>
          <button appButton type="button" (click)="apply()">Apply</button>
          <button appButton variant="ghost" type="button" (click)="setToday()">Today</button>
          <button appButton variant="ghost" type="button" (click)="setWeek()">7 days</button>
        </div>
      </app-list-search-bar>

      @if (error()) {
        <p class="my-2 text-sm text-error">{{ error() }}</p>
      }
      @if (warning()) {
        <p class="my-2 text-sm text-warning">{{ warning() }}</p>
      }

      @if (orders().length === 0) {
        <div class="mt-3">
          <app-empty-state
            [compact]="true"
            icon="heroClipboardDocumentList"
            title="No sales in this range"
            description="— widen the dates or clear the status filter."
          />
        </div>
      } @else {
        <div class="mt-3 flex flex-col gap-2 lg:hidden">
          @for (order of orders(); track order.id) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <button class="link font-mono font-semibold" (click)="toggle(order.id)">
                    {{ order.code }}
                  </button>
                  <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                  <span class="text-sm">{{ customerName(order) }}</span>
                  <app-status-badge
                    [type]="statusType(order.status)"
                    [label]="statusLabel(order.status)"
                  />
                  @if (order.is_credit_sale) {
                    <app-status-badge type="warning" label="credit" />
                  }
                  <span class="ml-auto font-bold tabular-nums"
                    ><app-money [cents]="order.total"
                  /></span>
                  @if (order.status !== 'voided' && order.status !== 'draft') {
                    <button class="btn btn-error btn-outline btn-sm" (click)="startVoid(order.id)">
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
                              <app-money [cents]="line.custom_price ?? line.unit_price" />
                            </td>
                            <td class="text-right"><app-money [cents]="line.line_total" /></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                    @if (payments().length > 0) {
                      <div class="mt-2 flex flex-wrap gap-2">
                        @for (p of payments(); track p.id) {
                          <span
                            class="inline-flex items-center gap-1 rounded-field border border-base-300 px-2 py-1 text-xs"
                          >
                            {{ p.method_code }} · <app-money [cents]="p.amount" /> · {{ p.status }}
                            @if (p.reference) {
                              · {{ p.reference }}
                            }
                            @if (p.status === 'settled') {
                              <button
                                class="btn btn-ghost btn-xs"
                                [disabled]="busy()"
                                (click)="reversePayment(p.id)"
                              >
                                Reverse
                              </button>
                            }
                          </span>
                        }
                      </div>
                    } @else {
                      <p class="mt-2 text-xs text-base-content/60">
                        {{ noPaymentsMessage(order) }}
                      </p>
                    }
                    @if (printerEnabled()) {
                      <button class="btn btn-outline btn-xs mt-2" (click)="printOrder(order.id)">
                        Print receipt
                      </button>
                    }
                    @if (order.status === 'completed') {
                      <div class="mt-3 border-t border-base-300/60 pt-3">
                        @if (refundingFor() !== order.id) {
                          <button
                            class="btn btn-outline btn-xs"
                            (click)="startRefund(order.id, order.total)"
                          >
                            Record refund
                          </button>
                        } @else {
                          <form
                            (submit)="$event.preventDefault(); confirmRefund(order.id)"
                            class="grid gap-2 rounded-field bg-base-200 p-2 sm:grid-cols-4"
                          >
                            <label class="form-control"
                              ><span class="label-text text-xs">Amount (KES)</span
                              ><input
                                class="input input-bordered input-sm"
                                inputmode="numeric"
                                [formControl]="refundAmount"
                            /></label>
                            <label class="form-control"
                              ><span class="label-text text-xs">Method</span
                              ><select
                                class="select select-bordered select-sm"
                                [formControl]="refundMethod"
                              >
                                <option value="cash">Cash</option>
                                <option value="mpesa">M-Pesa</option>
                                <option value="bank">Bank</option>
                              </select></label
                            >
                            <label class="form-control sm:col-span-2"
                              ><span class="label-text text-xs">Reason</span
                              ><input
                                class="input input-bordered input-sm"
                                [formControl]="refundReason"
                            /></label>
                            <div class="flex gap-2 sm:col-span-4">
                              <button
                                class="btn btn-error btn-sm"
                                type="submit"
                                [disabled]="busy()"
                              >
                                Post refund</button
                              ><button
                                type="button"
                                class="btn btn-ghost btn-sm"
                                (click)="refundingFor.set(null)"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <div class="mt-3 hidden lg:block">
          <app-data-table-shell
            title="Sales history"
            [description]="totalItems() + ' matching sales'"
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sale</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th class="text-right">Total</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.id) {
                  <tr
                    class="cursor-pointer"
                    [attr.aria-expanded]="expandedFor() === order.id"
                    (click)="toggle(order.id)"
                  >
                    <td>{{ time(order.created_at) }}</td>
                    <td class="font-mono font-semibold">{{ order.code }}</td>
                    <td>{{ customerName(order) }}</td>
                    <td>
                      <app-status-badge
                        [type]="statusType(order.status)"
                        [label]="statusLabel(order.status)"
                      />
                      @if (order.is_credit_sale) {
                        <app-status-badge type="warning" label="credit" />
                      }
                    </td>
                    <td
                      [class.font-medium]="order.status === 'pending_payment'"
                      [class.text-warning]="order.status === 'pending_payment'"
                    >
                      {{ paymentLabel(order) }}
                    </td>
                    <td class="table-number"><app-money [cents]="order.total" /></td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      @if (printerEnabled()) {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Print receipt"
                          aria-label="Print receipt"
                          (click)="printOrder(order.id)"
                        >
                          <app-icon name="heroPrinter" />
                        </button>
                      }
                      @if (order.status !== 'voided' && order.status !== 'draft') {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Void sale"
                          aria-label="Void sale"
                          (click)="startVoid(order.id)"
                        >
                          <app-icon name="heroXMark" />
                        </button>
                      }
                    </td>
                  </tr>
                  @if (voidingFor() === order.id) {
                    <tr class="row-detail">
                      <td colspan="7">
                        <form
                          (submit)="$event.preventDefault(); confirmVoid(order.id)"
                          class="flex items-end gap-2"
                        >
                          <label class="form-control flex-1"
                            ><span class="label-text text-xs">Void reason</span
                            ><input
                              class="input input-bordered input-sm"
                              [formControl]="voidReason" /></label
                          ><button
                            class="btn btn-error btn-sm"
                            type="submit"
                            [disabled]="busy() || !voidReason.value.trim()"
                          >
                            Confirm void</button
                          ><button
                            class="btn btn-ghost btn-sm"
                            type="button"
                            (click)="voidingFor.set(null)"
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  }
                  @if (expandedFor() === order.id) {
                    <tr class="row-detail">
                      <td colspan="7">
                        <table class="table table-xs">
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
                                  <app-money [cents]="line.custom_price ?? line.unit_price" />
                                </td>
                                <td class="text-right">
                                  <app-money [cents]="line.line_total" />
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                        @if (payments().length > 0) {
                          <div class="mt-2 flex flex-wrap gap-2">
                            @for (payment of payments(); track payment.id) {
                              <span
                                class="inline-flex items-center gap-1 rounded-field border border-base-300 px-2 py-1 text-xs"
                                >{{ payment.method_code }} ·
                                <app-money [cents]="payment.amount" /> ·
                                {{ payment.status }}
                                @if (payment.status === 'settled') {
                                  <button
                                    class="btn btn-ghost btn-xs"
                                    (click)="reversePayment(payment.id)"
                                  >
                                    Reverse
                                  </button>
                                }
                              </span>
                            }
                          </div>
                        } @else {
                          <p class="mt-2 text-xs text-base-content/60">
                            {{ noPaymentsMessage(order) }}
                          </p>
                        }
                        @if (order.status === 'completed') {
                          <div class="mt-3">
                            @if (refundingFor() !== order.id) {
                              <button
                                class="btn btn-outline btn-xs"
                                (click)="startRefund(order.id, order.total)"
                              >
                                Record refund
                              </button>
                            } @else {
                              <form
                                (submit)="$event.preventDefault(); confirmRefund(order.id)"
                                class="grid gap-2 sm:grid-cols-4"
                              >
                                <label class="form-control"
                                  ><span class="label-text text-xs">Amount (KES)</span
                                  ><input
                                    class="input input-bordered input-sm"
                                    [formControl]="refundAmount" /></label
                                ><label class="form-control"
                                  ><span class="label-text text-xs">Method</span
                                  ><select
                                    class="select select-bordered select-sm"
                                    [formControl]="refundMethod"
                                  >
                                    <option value="cash">Cash</option>
                                    <option value="mpesa">M-Pesa</option>
                                    <option value="bank">Bank</option>
                                  </select></label
                                ><label class="form-control sm:col-span-2"
                                  ><span class="label-text text-xs">Reason</span
                                  ><input
                                    class="input input-bordered input-sm"
                                    [formControl]="refundReason"
                                /></label>
                                <div class="sm:col-span-4">
                                  <button class="btn btn-error btn-sm" type="submit">
                                    Post refund</button
                                  ><button
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    (click)="refundingFor.set(null)"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            }
                          </div>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <div class="mt-3">
          <app-pagination
            [currentPage]="page()"
            [totalPages]="totalPages()"
            [totalItems]="totalItems()"
            [itemsPerPage]="pageSize()"
            [showItemsPerPage]="true"
            itemLabel="sales"
            (pageChange)="changePage($event)"
            (itemsPerPageChange)="changePageSize($event)"
          />
        </div>
      }
    </app-page>
  `,
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  private readonly money = inject(MoneyService);

  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly voidingFor = signal<string | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true });
  protected readonly refundingFor = signal<string | null>(null);
  protected readonly refundAmount = new FormControl('', { nonNullable: true });
  protected readonly refundMethod = new FormControl('cash', { nonNullable: true });
  protected readonly refundReason = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
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

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly salesStats = computed(() => {
    const rows = this.orders();
    const completed = rows.filter(order => order.status === 'completed');
    const pending = rows.filter(order => order.status === 'pending_payment').length;
    return [
      { label: 'Matching sales', value: this.totalItems() },
      {
        label: 'Page value',
        value: formatKes(completed.reduce((sum, order) => sum + order.total, 0)),
      },
      { label: 'Completed on page', value: completed.length, tone: 'success' as const },
      { label: 'Awaiting payment', value: pending, tone: 'warning' as const },
    ];
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
    this.loading.set(true);
    try {
      const statuses = this.status.value === 'all' ? ALL_STATUSES : [this.status.value];
      const since = new Date(`${this.from.value}T00:00:00`).toISOString();
      const untilDate = new Date(`${this.to.value}T00:00:00`);
      untilDate.setDate(untilDate.getDate() + 1); // "to" inclusive
      const result = await this.pos.ordersPage({
        statuses,
        since,
        until: untilDate.toISOString(),
        search: this.query(),
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.orders.set(result.rows);
      this.totalItems.set(result.count);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      this.loading.set(false);
    }
  }

  protected async changePage(page: number): Promise<void> {
    this.page.set(page);
    await this.load();
  }

  protected async changePageSize(size: number): Promise<void> {
    this.pageSize.set(size);
    this.page.set(1);
    await this.load();
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

  protected startRefund(orderId: string, total: number): void {
    this.refundingFor.set(orderId);
    this.refundAmount.setValue(formatKesInput(total));
    this.refundReason.setValue('');
  }

  protected async confirmRefund(orderId: string): Promise<void> {
    const amount = Math.round(Number(this.refundAmount.value) * 100);
    if (!Number.isFinite(amount) || amount <= 0 || !this.refundReason.value.trim()) {
      this.error.set('Refund amount and reason are required');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.postRefund(
        orderId,
        amount,
        this.refundMethod.value,
        this.refundReason.value.trim()
      );
      this.refundingFor.set(null);
      await this.toggle(orderId);
      await this.toggle(orderId);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Refund failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async reversePayment(paymentId: string): Promise<void> {
    if (!window.confirm('Reverse this payment? The action is recorded in the ledger.')) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.money.reversePayment(paymentId);
      const orderId = this.expandedFor();
      if (orderId) {
        this.expandedFor.set(null);
        await this.toggle(orderId);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Payment reversal failed');
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

  protected statusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'Cashier queue';
      case 'draft':
        return 'Proforma';
      case 'completed':
        return 'Completed';
      case 'voided':
        return 'Voided';
      default:
        return status.replaceAll('_', ' ');
    }
  }

  protected paymentLabel(order: OrderWithCustomer): string {
    if (order.status === 'pending_payment') return 'Awaiting payment';
    if (order.status === 'draft') return 'Not posted';
    if (order.status === 'voided') return 'Voided';
    return order.is_credit_sale ? 'Credit' : 'Paid';
  }

  protected noPaymentsMessage(order: OrderWithCustomer): string {
    if (order.status === 'pending_payment') return 'Awaiting payment in the cashier queue.';
    if (order.status === 'draft') return 'No payments on this proforma.';
    if (order.is_credit_sale) return 'Credit sale — no payment collected.';
    return 'No payments recorded.';
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
