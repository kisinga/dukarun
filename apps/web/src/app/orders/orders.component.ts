import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { reconciliationLabel, reconciliationTypeForCode } from '../core/payment-methods';
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
import { DrawerComponent } from '../shared/ui/drawer.component';
import { StatCardComponent } from '../shared/ui/stat-card.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { StatBarComponent } from '../shared/ui/stat-bar.component';
import { MoneyComponent } from '../shared/ui/money.component';

const ALL_STATUSES = ['completed', 'voided', 'draft', 'expired', 'pending_payment'];

/**
 * Sales history — the canonical sales screen. Defaults to "today" with realtime
 * updates (live badge); status + date-range filters for full history;
 * drawer detail with lines/payments, void flow, and receipt reprint.
 */
@Component({
  selector: 'app-orders',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageLayoutComponent,
    EmptyStateComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatusBadgeComponent,
    DataTableShellComponent,
    DrawerComponent,
    StatCardComponent,
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
      [wide]="true"
    >
      @if (isLive()) {
        <span actions class="badge badge-success gap-1">
          <app-icon name="heroSignal" size="sm" class="animate-pulse" />
          Live
        </span>
      }
      <button
        actions
        appButton
        variant="ghost"
        [iconOnly]="true"
        [loading]="loading()"
        type="button"
        title="Refresh sales"
        aria-label="Refresh sales"
        (click)="load()"
      >
        <app-icon name="heroArrowPath" />
      </button>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (warning()) {
        <div role="status" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ warning() }}</span>
        </div>
      }

      <app-list-search-bar
        placeholder="Search sale code or customer…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
      >
        <app-stat-bar summary [stats]="salesStats()" />
        <div filters class="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <app-form-field label="Status" class="sm:col-span-2 lg:w-44">
            <select class="select select-bordered select-sm w-full" [formControl]="status">
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="draft">Draft (proforma)</option>
              <option value="expired">Expired proforma</option>
              <option value="pending_payment">Cashier queue</option>
            </select>
          </app-form-field>
          <app-form-field label="From" class="lg:w-40">
            <input type="date" class="input input-bordered input-sm w-full" [formControl]="from" />
          </app-form-field>
          <app-form-field label="To" class="lg:w-40">
            <input type="date" class="input input-bordered input-sm w-full" [formControl]="to" />
          </app-form-field>
          <div class="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button appButton type="button" (click)="apply()">Apply filters</button>
            <button appButton variant="ghost" type="button" (click)="setToday()">Today</button>
            <button appButton variant="ghost" type="button" (click)="setWeek()">7 days</button>
          </div>
        </div>
      </app-list-search-bar>

      @if (!loading() && orders().length === 0) {
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
            <div
              class="card cursor-pointer bg-base-100"
              role="button"
              tabindex="0"
              [class.border-primary]="selectedOrderId() === order.id"
              (click)="openOrder(order.id)"
              (keydown.enter)="openOrder(order.id)"
            >
              <div class="card-body p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <span class="font-mono font-semibold">{{ order.code }}</span>
                  <span class="text-sm text-base-content/60">{{ time(order.created_at) }}</span>
                  <span class="text-sm">{{ customerName(order) }}</span>
                  <app-status-badge
                    [type]="statusType(order.status)"
                    [label]="statusLabel(order.status)"
                  />
                  @if (order.is_credit_sale) {
                    <app-status-badge
                      [type]="creditBadge(order).type"
                      [label]="creditBadge(order).label"
                    />
                  }
                  <span class="ml-auto font-bold tabular-nums"
                    ><app-money [amount]="order.total"
                  /></span>
                  @if (order.status === 'pending_payment') {
                    <a
                      appButton
                      variant="soft"
                      size="sm"
                      routerLink="/pos/cashier"
                      (click)="$event.stopPropagation()"
                    >
                      <app-icon name="heroBanknotes" />
                      Collect payment
                    </a>
                  } @else if (order.status === 'draft') {
                    <a
                      appButton
                      variant="outline"
                      size="sm"
                      routerLink="/pos/proformas"
                      (click)="$event.stopPropagation()"
                    >
                      <app-icon name="heroDocumentText" />
                      Open proforma
                    </a>
                  }
                </div>

                @if (order.status === 'voided' && order.void_reason) {
                  <p class="mt-1 text-xs text-base-content/60">
                    Void reason: {{ order.void_reason }}
                  </p>
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
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.table-row-active]="selectedOrderId() === order.id"
                    (click)="openOrder(order.id)"
                    (keydown.enter)="openOrder(order.id)"
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
                        <app-status-badge
                          [type]="creditBadge(order).type"
                          [label]="creditBadge(order).label"
                        />
                      }
                    </td>
                    <td
                      [class.font-medium]="order.status === 'pending_payment'"
                      [class.text-warning]="order.status === 'pending_payment'"
                    >
                      {{ paymentLabel(order) }}
                    </td>
                    <td class="table-number"><app-money [amount]="order.total" /></td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      @if (printerEnabled() && order.status === 'completed') {
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
                      } @else if (order.status === 'pending_payment') {
                        <a
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          routerLink="/pos/cashier"
                          title="Collect payment"
                          aria-label="Collect payment"
                        >
                          <app-icon name="heroBanknotes" />
                        </a>
                      } @else if (order.status === 'draft') {
                        <a
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          routerLink="/pos/proformas"
                          title="Open proforma"
                          aria-label="Open proforma"
                        >
                          <app-icon name="heroDocumentText" />
                        </a>
                      }
                      @if (order.status === 'completed') {
                        <button
                          appButton
                          variant="ghost"
                          [iconOnly]="true"
                          title="Void sale"
                          aria-label="Void sale"
                          (click)="openOrder(order.id); startVoid(order.id)"
                        >
                          <app-icon name="heroXMark" />
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-data-table-shell>
        </div>

        <!-- Order detail drawer -->
        @if (selectedOrder(); as order) {
          <app-drawer
            [open]="true"
            (closed)="closeOrderDrawer()"
            [title]="order.code"
            [subtitle]="time(order.created_at) + ' · ' + customerName(order)"
          >
            @if (printerEnabled() && order.status === 'completed') {
              <button
                actions
                appButton
                variant="ghost"
                [iconOnly]="true"
                type="button"
                title="Print receipt"
                aria-label="Print receipt"
                (click)="printOrder(order.id)"
              >
                <app-icon name="heroPrinter" />
              </button>
            }

            <div class="flex flex-wrap items-center gap-1">
              <app-status-badge
                size="xs"
                [type]="statusType(order.status)"
                [label]="statusLabel(order.status)"
              />
              @if (order.is_credit_sale) {
                <app-status-badge
                  size="xs"
                  [type]="creditBadge(order).type"
                  [label]="creditBadge(order).label"
                />
              }
            </div>
            @if (order.status === 'voided' && order.void_reason) {
              <p class="type-caption mt-1">Void reason: {{ order.void_reason }}</p>
            }

            <div class="mt-3 grid grid-cols-2 gap-2">
              <app-stat-card label="Total" [value]="fmtKes(order.total)" />
              @if (order.is_credit_sale && order.status === 'completed') {
                <app-stat-card
                  label="Paid so far"
                  [value]="fmtKes(creditPaid().get(order.id) ?? 0)"
                  [tone]="(creditPaid().get(order.id) ?? 0) >= order.total ? 'success' : 'warning'"
                  [sub]="paymentLabel(order)"
                />
              } @else {
                <app-stat-card
                  label="Payment"
                  [value]="paymentLabel(order)"
                  [tone]="order.status === 'pending_payment' ? 'warning' : 'neutral'"
                />
              }
            </div>

            @if (detailLoading()) {
              <div class="flex items-center justify-center gap-2 py-8 text-base-content/60">
                <span class="loading loading-spinner loading-md"></span>
                <span class="text-sm">Loading sale details…</span>
              </div>
            } @else {
              <div class="mt-4 flex flex-col gap-4">
                <section>
                  <h3 class="section-title mb-2">Items</h3>
                  @if (lines().length === 0) {
                    <app-empty-state
                      [compact]="true"
                      icon="heroShoppingCart"
                      title="No line items"
                    />
                  } @else {
                    <ul class="divide-y divide-base-200">
                      @for (line of lines(); track line.id) {
                        <li class="flex items-center gap-3 py-2">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ line.label }}</p>
                            <p class="type-caption">
                              {{ line.quantity }} ×
                              <app-money [amount]="line.custom_price ?? line.unit_price" />
                            </p>
                          </div>
                          <span class="text-sm font-semibold tabular-nums">
                            <app-money [amount]="line.line_total" />
                          </span>
                        </li>
                      }
                    </ul>
                  }
                </section>

                <section class="border-t border-base-300/60 pt-3">
                  <h3 class="section-title mb-2">Payments</h3>
                  @if (payments().length === 0) {
                    <p class="text-xs text-base-content/60">{{ noPaymentsMessage(order) }}</p>
                  } @else {
                    <div class="flex flex-wrap gap-2">
                      @for (p of payments(); track p.id) {
                        <span
                          class="inline-flex items-center gap-1 rounded-field border border-base-300 px-2 py-1 text-xs"
                        >
                          {{ p.method_code }} · <app-money [amount]="p.amount" /> · {{ p.status }}
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
                  }
                </section>

                @if (order.status === 'pending_payment' || order.status === 'draft') {
                  <section class="border-t border-base-300/60 pt-3">
                    @if (order.status === 'pending_payment') {
                      <a appButton variant="soft" size="sm" routerLink="/pos/cashier">
                        <app-icon name="heroBanknotes" />
                        Collect payment
                      </a>
                    } @else {
                      <a appButton variant="outline" size="sm" routerLink="/pos/proformas">
                        <app-icon name="heroDocumentText" />
                        Open proforma
                      </a>
                    }
                  </section>
                }

                @if (order.status === 'completed') {
                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Refund</h3>
                    @if (refundingFor() !== order.id) {
                      <button
                        appButton
                        variant="outline"
                        size="sm"
                        (click)="startRefund(order.id, order.total)"
                      >
                        Record refund
                      </button>
                    } @else {
                      <form
                        (submit)="$event.preventDefault(); confirmRefund(order.id)"
                        class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                      >
                        <app-form-field label="Amount (KES)" [required]="true">
                          <input
                            class="input input-bordered input-sm w-full"
                            inputmode="numeric"
                            [formControl]="refundAmount"
                          />
                        </app-form-field>
                        <app-form-field label="Method">
                          <select
                            class="select select-bordered select-sm w-full"
                            [formControl]="refundMethod"
                          >
                            <option value="cash">{{ methodOptionLabel('cash') }}</option>
                            <option value="mpesa">{{ methodOptionLabel('mpesa') }}</option>
                            <option value="bank">{{ methodOptionLabel('bank') }}</option>
                          </select>
                        </app-form-field>
                        <app-form-field label="Reason" [required]="true">
                          <input
                            class="input input-bordered input-sm w-full"
                            [formControl]="refundReason"
                          />
                        </app-form-field>
                        <div class="flex gap-2">
                          <button
                            appButton
                            variant="error"
                            size="sm"
                            type="submit"
                            [disabled]="busy()"
                          >
                            Post refund
                          </button>
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            type="button"
                            (click)="refundingFor.set(null)"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    }
                  </section>

                  <section class="border-t border-base-300/60 pt-3">
                    <h3 class="section-title mb-2">Void sale</h3>
                    @if (voidingFor() !== order.id) {
                      <button appButton variant="error" size="sm" (click)="startVoid(order.id)">
                        Void sale
                      </button>
                    } @else {
                      <form
                        (submit)="$event.preventDefault(); confirmVoid(order.id)"
                        class="flex flex-col gap-2 rounded-field border border-base-300 bg-base-200/50 p-2"
                      >
                        <app-form-field label="Reason" [required]="true">
                          <input
                            type="text"
                            class="input input-bordered input-sm w-full"
                            placeholder="e.g. Wrong item rung up"
                            [formControl]="voidReason"
                          />
                        </app-form-field>
                        <div class="flex gap-2">
                          <button
                            appButton
                            variant="error"
                            size="sm"
                            type="submit"
                            [disabled]="voidReason.value.trim().length === 0 || busy()"
                          >
                            Confirm void
                          </button>
                          <button
                            appButton
                            variant="ghost"
                            size="sm"
                            type="button"
                            (click)="voidingFor.set(null)"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    }
                  </section>
                }
              </div>
            }
          </app-drawer>
        }

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
  protected readonly fmtKes = formatKes;

  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly orders = signal<OrderWithCustomer[]>([]);
  /** Paid-so-far totals (shillings) for the credit sales currently listed. */
  protected readonly creditPaid = signal<Map<string, number>>(new Map());
  protected readonly selectedOrderId = signal<string | null>(null);
  protected readonly detailLoading = signal(false);
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
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Live when the range covers today (the old Today's Sales behaviour). */
  protected readonly isLive = computed(
    () => this.from.value <= this.todayIso() && this.to.value >= this.todayIso()
  );

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    return id ? (this.orders().find(order => order.id === id) ?? null) : null;
  });
  protected readonly salesStats = computed(() => {
    const rows = this.orders();
    const completed = rows.filter(order => order.status === 'completed');
    const pending = rows.filter(order => order.status === 'pending_payment').length;
    return [
      { label: 'Matching sales', value: this.totalItems() },
      {
        label: 'Sales value on page',
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
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
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
      await this.pos.expireProformas();
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
      const creditIds = result.rows.filter(order => order.is_credit_sale).map(order => order.id);
      this.creditPaid.set(await this.pos.paidTotalsByOrder(creditIds));
      // Keep an open drawer's lines/payments in sync with realtime refreshes.
      const openId = this.selectedOrderId();
      if (openId && result.rows.some(order => order.id === openId)) {
        void this.refreshDetail(openId);
      }
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

  protected async openOrder(orderId: string): Promise<void> {
    this.selectedOrderId.set(orderId);
    this.voidingFor.set(null);
    this.refundingFor.set(null);
    this.lines.set([]);
    this.payments.set([]);
    this.detailLoading.set(true);
    await this.refreshDetail(orderId);
  }

  /** Refetch lines + payments for the open drawer; ignores stale results. */
  protected async refreshDetail(orderId: string): Promise<void> {
    try {
      const [lines, payments] = await Promise.all([
        this.pos.orderLines(orderId),
        this.pos.orderPayments(orderId),
      ]);
      if (this.selectedOrderId() !== orderId) return;
      this.lines.set(lines);
      this.payments.set(payments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      if (this.selectedOrderId() === orderId) this.detailLoading.set(false);
    }
  }

  /** Called by the drawer after its close transition finishes. */
  protected closeOrderDrawer(): void {
    this.selectedOrderId.set(null);
    this.voidingFor.set(null);
    this.refundingFor.set(null);
    this.detailLoading.set(false);
    this.lines.set([]);
    this.payments.set([]);
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
        this.closeOrderDrawer();
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
    const amount = parseKes(this.refundAmount.value);
    if (amount === null || amount <= 0 || !this.refundReason.value.trim()) {
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
      await this.refreshDetail(orderId);
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
      const orderId = this.selectedOrderId();
      if (orderId) {
        await this.refreshDetail(orderId);
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
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    }
  }

  protected statusType(status: string) {
    return ORDER_STATUS_MAP[status] ?? 'neutral';
  }

  /** Select option label: method code plus its reconciliation-type caption. */
  protected methodOptionLabel(code: string): string {
    const type = reconciliationLabel(reconciliationTypeForCode(code));
    return type === '—' ? code : `${code} · ${type}`;
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'Cashier queue';
      case 'draft':
        return 'Proforma';
      case 'expired':
        return 'Expired proforma';
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
    if (order.status === 'expired') return 'Expired';
    if (order.status === 'voided') return 'Voided';
    if (!order.is_credit_sale) return 'Paid';
    const paid = this.creditPaid().get(order.id) ?? 0;
    if (paid <= 0) return 'Credit · Unpaid';
    if (paid >= order.total) return 'Credit · Settled';
    return `Credit · Part-paid (${formatKes(paid)} of ${formatKes(order.total)})`;
  }

  /** Badge for a credit sale: warning while anything is outstanding, success once settled. */
  protected creditBadge(order: OrderWithCustomer): { type: 'warning' | 'success'; label: string } {
    const paid = this.creditPaid().get(order.id) ?? 0;
    return paid >= order.total
      ? { type: 'success', label: 'credit · settled' }
      : { type: 'warning', label: paid > 0 ? 'credit · part-paid' : 'credit' };
  }

  protected noPaymentsMessage(order: OrderWithCustomer): string {
    if (order.status === 'pending_payment') return 'Awaiting payment in the cashier queue.';
    if (order.status === 'draft') return 'No payments on this proforma.';
    if (order.status === 'expired') return 'This proforma expired without being converted.';
    if (order.is_credit_sale) {
      const paid = this.creditPaid().get(order.id) ?? 0;
      if (paid >= order.total) return 'Credit sale — fully repaid.';
      if (paid > 0) return `Credit sale — ${formatKes(order.total - paid)} still outstanding.`;
      return 'Credit sale — no payment collected yet.';
    }
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
