import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../../core/money';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import {
  CheckoutPanelComponent,
  type PaymentMethodOption,
} from '../checkout/checkout-panel.component';
import { OrderLineWithProduct, OrderWithCustomer, PaymentInput, PosService } from '../pos.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { PermissionsService } from '../../core/permissions.service';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { OrderQueueCountsService } from '../order-queue-counts.service';
import { QUEUE_LONG_COUNT, queueAge, waitLabel, type QueueAge } from '../queue-aging';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import {
  ListSearchBarComponent,
  type ListSortDirection,
  type ListSortOption,
} from '../../shared/ui/list-search-bar.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { RecentSalesCacheService } from '../../core/recent-sales-cache.service';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { MobileListComponent } from '../../shared/ui/mobile-list.component';
import { PageActionsComponent } from '../../shared/ui/page-actions.component';
import { MpesaService } from '../../core/mpesa.service';
import { MpesaCheckoutCoordinator } from '../../core/mpesa-checkout-coordinator.service';

const QUEUE_SORT_OPTIONS: readonly ListSortOption[] = [
  { value: 'cashier_pending_at', label: 'Time waiting' },
  { value: 'code', label: 'Sale code' },
  { value: 'total', label: 'Sale value' },
];

@Component({
  selector: 'app-cashier-queue',
  imports: [
    RouterLink,
    CheckoutPanelComponent,
    PageLayoutComponent,
    EmptyStateComponent,
    SessionRequiredNoticeComponent,
    ButtonComponent,
    MoneyComponent,
    IconComponent,
    DataTableShellComponent,
    ListSearchBarComponent,
    PaginationComponent,
    StatBarComponent,
    StatusBadgeComponent,
    MobileListComponent,
    PageActionsComponent,
  ],
  template: `
    <app-page
      title="Cashier Queue"
      subtitle="Collect payment for sales handed off from the Sell screen."
      [badge]="orderQueueCounts.cashierQueue()"
      [wide]="true"
    >
      <app-page-actions actions>
        <button
          utilityAction
          appButton
          variant="ghost"
          [iconOnly]="true"
          [loading]="loading()"
          type="button"
          title="Refresh cashier queue"
          aria-label="Refresh cashier queue"
          (click)="load()"
        >
          <app-icon name="heroArrowPath" />
        </button>
      </app-page-actions>

      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (completedSale(); as completed) {
        <div class="alert alert-success mb-3" aria-live="polite">
          <app-icon name="heroCheckCircle" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">Payment collected</p>
            <p class="text-sm">
              {{ completed.code }} is complete.
              {{ printerEnabled() ? 'The receipt is ready.' : 'The sale is finalized.' }}
            </p>
          </div>
          @if (printerEnabled()) {
            <button
              appButton
              variant="outline"
              size="sm"
              [loading]="printing()"
              (click)="printReceipt(completed.id)"
            >
              <app-icon name="heroPrinter" />
              Print receipt
            </button>
          }
          <button
            appButton
            variant="ghost"
            size="sm"
            [iconOnly]="true"
            aria-label="Dismiss completed sale"
            (click)="completedSale.set(null)"
          >
            <app-icon name="heroXMark" />
          </button>
        </div>
      }

      @if (cashierSession.configurationLoaded() && !cashierSession.cashierFlowEnabled()) {
        <div role="status" class="alert alert-info mb-3 text-sm">
          <app-icon name="heroInformationCircle" />
          <span
            >Cashier workflow is off. New sales use direct checkout; only previously queued sales
            appear here.</span
          >
        </div>
      }

      @if (staleCount() > 0) {
        <div role="alert" class="alert alert-warning mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>
            {{ staleCount() }} {{ staleCount() === 1 ? 'sale' : 'sales' }} waiting over an hour.
            Collect payment or follow up with the salesperson.
          </span>
        </div>
      }
      @if (totalItems() >= longQueueCount) {
        <div role="status" class="alert alert-info mb-3 text-sm">
          <app-icon name="heroInformationCircle" />
          <span
            >Queue is getting long ({{ totalItems() }} waiting) — work the oldest sales first.</span
          >
        </div>
      }

      <app-list-search-bar
        placeholder="Search sale code or customer…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
        [sortOptions]="queueSortOptions"
        [sortKey]="queueSort()"
        (sortKeyChange)="changeSort($event, queueSortDirection())"
        [sortDirection]="queueSortDirection()"
        (sortDirectionChange)="changeSort(queueSort(), $event)"
      >
        <app-stat-bar summary [stats]="queueStats()" />
      </app-list-search-bar>

      @if (cashierSession.cashControlEnabled() && !cashierSession.isOpen()) {
        <app-session-required-notice action="collecting payment from the cashier queue" />
      }

      @if (!loading() && parked().length === 0) {
        <app-empty-state
          [compact]="query().length > 0"
          icon="heroBanknotes"
          [title]="query().length > 0 ? 'No matching sales' : 'No sales waiting'"
          [description]="
            query().length > 0
              ? 'Try another sale code or customer name.'
              : 'Sales sent from the Sell screen appear here until payment is collected.'
          "
        />
      } @else {
        <app-mobile-list>
          @for (order of parked(); track order.id) {
            <div mobileListRow [class.bg-error/5]="ageOf(order) === 'stale'">
              <div class="p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-mono font-semibold">{{ order.code }}</p>
                      <app-status-badge type="warning" label="Awaiting payment" size="xs" />
                    </div>
                    <p class="type-caption mt-1">{{ customerName(order) }}</p>
                    <p class="mt-1 text-xs" [class]="waitToneClass(order)">
                      Waiting {{ waitLabel(pendingSince(order), now()) }} ·
                      {{ time(pendingSince(order)) }}
                    </p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="font-bold"><app-money [amount]="order.total" /></p>
                    <button
                      appButton
                      size="sm"
                      class="mt-2"
                      type="button"
                      [disabled]="!cashierSession.canTakePayment() || busy()"
                      (click)="startSettlement(order)"
                    >
                      Collect payment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          }
        </app-mobile-list>

        <div class="hidden lg:block">
          <app-data-table-shell
            heading="Waiting for payment"
            [description]="
              totalItems() + ' ' + (totalItems() === 1 ? 'sale' : 'sales') + ' in queue'
            "
          >
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Waiting since</th>
                  <th>Sale</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th class="text-right">Amount due</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (order of parked(); track order.id) {
                  <tr
                    role="button"
                    tabindex="0"
                    class="cursor-pointer"
                    [class.bg-error/5]="ageOf(order) === 'stale'"
                    [attr.aria-expanded]="expandedFor() === order.id"
                    (click)="toggleItems(order.id)"
                    (keydown.enter)="toggleItems(order.id)"
                  >
                    <td>
                      <p class="table-primary" [class]="waitToneClass(order)">
                        {{ waitLabel(pendingSince(order), now()) }}
                      </p>
                      <p class="table-secondary">{{ time(pendingSince(order)) }}</p>
                    </td>
                    <td class="font-mono font-semibold">{{ order.code }}</td>
                    <td>{{ customerName(order) }}</td>
                    <td>
                      <app-status-badge type="warning" label="Awaiting payment" size="xs" />
                    </td>
                    <td class="table-number"><app-money [amount]="order.total" /></td>
                    <td class="table-actions" (click)="$event.stopPropagation()">
                      <button
                        appButton
                        variant="ghost"
                        [iconOnly]="true"
                        [loading]="loadingLinesFor() === order.id"
                        [attr.aria-expanded]="expandedFor() === order.id"
                        [title]="expandedFor() === order.id ? 'Hide sale items' : 'View sale items'"
                        [attr.aria-label]="
                          expandedFor() === order.id ? 'Hide sale items' : 'View sale items'
                        "
                        (click)="toggleItems(order.id)"
                      >
                        <app-icon
                          [name]="expandedFor() === order.id ? 'heroChevronUp' : 'heroChevronDown'"
                        />
                      </button>
                      <button
                        appButton
                        size="sm"
                        class="ml-2"
                        type="button"
                        [disabled]="!cashierSession.canTakePayment() || busy()"
                        (click)="startSettlement(order)"
                      >
                        <app-icon name="heroBanknotes" />
                        Collect payment
                      </button>
                    </td>
                  </tr>

                  @if (expandedFor() === order.id) {
                    <tr class="row-detail">
                      <td colspan="6">
                        @if (loadingLinesFor() === order.id) {
                          <div
                            class="flex items-center justify-center gap-2 py-6 text-base-content/60"
                          >
                            <span class="loading loading-spinner loading-sm"></span>
                            <span>Loading items…</span>
                          </div>
                        } @else if (lines().length === 0) {
                          <p class="py-2 text-sm text-base-content/60">
                            No items found for this sale.
                          </p>
                        } @else {
                          <table class="table table-xs">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Unit price</th>
                                <th class="text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (line of lines(); track line.id) {
                                <tr>
                                  <td>
                                    <p>{{ line.label }}</p>
                                    <p class="type-caption">
                                      {{ line.manufacturer_name || 'Manufacturer not set' }}
                                      @if (line.sku) {
                                        · {{ line.sku }}
                                      }
                                    </p>
                                  </td>
                                  <td class="text-right">{{ line.quantity }}</td>
                                  <td class="table-number">
                                    <app-money [amount]="line.custom_price ?? line.unit_price" />
                                  </td>
                                  <td class="table-number">
                                    <app-money [amount]="line.line_total" />
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
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
      @if (cashierSession.canTakePayment() && settling(); as order) {
        <app-checkout-panel
          [total]="order.total"
          [methods]="methods()"
          [canUseDirectAccounts]="canUseDirectAccounts()"
          [mpesaStkEnabled]="mpesa.availability().active"
          [mpesaManualFallback]="mpesa.availability().manualFallback"
          [busy]="busy()"
          [heading]="'Collect payment · ' + order.code"
          (confirmed)="settle(order.id, $event)"
          (approvalRequested)="directAccountRequested()"
          (cancelled)="settling.set(null)"
        />
      }
      @if (mpesaSplitReady(); as split) {
        <dialog class="modal modal-open" aria-labelledby="queue-mpesa-cash-heading">
          <div class="modal-box modal-box-scroll">
            <h2 id="queue-mpesa-cash-heading" class="type-title">M-PESA received</h2>
            <p class="mt-2 text-sm">Confirm cash only after it is in hand.</p>
            <p class="mt-4 text-xl font-semibold"><app-money [amount]="split.cashAmount" /></p>
            <div class="modal-action">
              <button appButton variant="ghost" (click)="mpesaSplitReady.set(null)">
                Keep pending
              </button>
              <button appButton [loading]="busy()" (click)="confirmMpesaCash()">
                Confirm cash received
              </button>
            </div>
          </div>
        </dialog>
      }
      @if (directAccountNotice()) {
        <div class="toast toast-bottom toast-end z-50" aria-live="polite">
          <div class="alert alert-warning max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Direct account payment needs finance sign-off</p>
              <p class="text-sm">
                Someone with finance access can settle it, or approve it from the
                <a routerLink="/approvals" class="link font-medium">Approvals inbox</a>.
              </p>
            </div>
          </div>
        </div>
      }
    </app-page>
  `,
})
export class CashierQueueComponent implements OnInit, OnDestroy {
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  private readonly perms = inject(PermissionsService);
  private readonly recentSales = inject(RecentSalesCacheService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly orderQueueCounts = inject(OrderQueueCountsService);
  protected readonly mpesa = inject(MpesaService);
  private readonly mpesaCheckout = inject(MpesaCheckoutCoordinator);

  protected readonly parked = signal<OrderWithCustomer[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly query = signal('');
  protected readonly queueSortOptions = QUEUE_SORT_OPTIONS;
  protected readonly queueSort = signal('cashier_pending_at');
  protected readonly queueSortDirection = signal<ListSortDirection>('asc');
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly loadingLinesFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly settling = signal<OrderWithCustomer | null>(null);
  protected readonly mpesaSplitReady = signal<{
    intentId: string;
    orderId: string;
    code: string;
    cashPayments: PaymentInput[];
    cashAmount: number;
  } | null>(null);
  /** Idempotency key for the in-flight settlement (see startSettlement). */
  protected settleClientRef: string | null = null;
  private settleMpesaRetryAllowed = false;
  protected readonly methods = signal<PaymentMethodOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly completedSale = signal<{ id: string; code: string } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly directAccountNotice = signal(false);
  protected readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
  protected readonly longQueueCount = QUEUE_LONG_COUNT;
  /** Ticks once a minute so wait labels and aging tones stay current. */
  protected readonly now = signal(Date.now());
  private nowTimer: ReturnType<typeof setInterval> | null = null;
  private directAccountTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly staleCount = computed(
    () => this.parked().filter(order => this.ageOf(order) === 'stale').length
  );
  protected readonly queueStats = computed(() => {
    const rows = this.parked();
    const oldest = rows.reduce<OrderWithCustomer | null>((current, order) => {
      if (!current) return order;
      return new Date(this.pendingSince(order)).getTime() <
        new Date(this.pendingSince(current)).getTime()
        ? order
        : current;
    }, null);
    return [
      {
        label: 'Waiting',
        value: this.totalItems(),
        tone: 'warning' as const,
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Value on page',
        value: formatKes(rows.reduce((total, order) => total + order.total, 0)),
        mobilePriority: 'primary' as const,
      },
      {
        label: 'Stale (1h+)',
        value: this.staleCount(),
        tone: 'error' as const,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Oldest on page',
        value: oldest ? this.waitLabel(this.pendingSince(oldest), this.now()) : '—',
        tone: oldest ? this.ageTone(this.ageOf(oldest)) : undefined,
        mobilePriority: 'secondary' as const,
      },
      {
        label: 'Walk-ins on page',
        value: rows.filter(order => order.customer_id === null).length,
        mobilePriority: 'secondary' as const,
      },
    ];
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.recentSales.revision();
      const online = this.connectivity.online();
      const loaded = this.recentSales.loaded();
      untracked(() => {
        this.applyCachedQueue();
        void this.load(true);
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    void this.mpesa.refreshAvailability();
    try {
      this.methods.set(await this.sync.paymentMethods());
    } catch {
      // No methods configured yet; the panel will show an empty method list.
    }
    await this.load();
    this.nowTimer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.nowTimer) clearInterval(this.nowTimer);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.directAccountTimer) clearTimeout(this.directAccountTimer);
  }

  private applyCachedQueue(): void {
    if (!this.recentSales.loaded() || this.page() !== 1 || this.query().trim()) return;
    const rows = this.recentSales
      .orders()
      .filter(order => order.status === 'pending_payment' && order.cashier_pending_at !== null)
      .sort((a, b) =>
        (a.cashier_pending_at ?? a.created_at).localeCompare(b.cashier_pending_at ?? b.created_at)
      )
      .slice(0, this.pageSize());
    this.parked.set(rows);
    if (this.totalItems() === 0) this.totalItems.set(rows.length);
  }

  /**
   * The external-account gate lives in post_sale_at_location, not settle_order,
   * so the queue cannot create the approval itself — point the cashier at the
   * approvals inbox instead.
   */
  protected directAccountRequested(): void {
    this.settling.set(null);
    if (this.directAccountTimer) clearTimeout(this.directAccountTimer);
    this.directAccountNotice.set(true);
    this.directAccountTimer = setTimeout(() => this.directAccountNotice.set(false), 6000);
  }

  protected onSearch(query: string): void {
    this.query.set(query);
    this.page.set(1);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 250);
  }

  /** Silent reloads (realtime events) update the list without flashing the header spinner. */
  protected async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    void this.orderQueueCounts.refresh();
    try {
      const result = await this.pos.ordersPage({
        statuses: ['pending_payment'],
        search: this.query(),
        page: this.page(),
        pageSize: this.pageSize(),
        sortBy: this.queueSort() as 'cashier_pending_at' | 'code' | 'total',
        sortDirection: this.queueSortDirection(),
        cashierQueueOnly: true,
      });
      this.parked.set(result.rows);
      this.totalItems.set(result.count);
      if (this.expandedFor() && !result.rows.some(order => order.id === this.expandedFor())) {
        this.expandedFor.set(null);
        this.lines.set([]);
      }
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load queue');
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

  protected changeSort(key: string, direction: ListSortDirection): void {
    this.queueSort.set(key);
    this.queueSortDirection.set(direction);
    this.page.set(1);
    void this.load();
  }

  protected async toggleItems(orderId: string): Promise<void> {
    if (this.expandedFor() === orderId) {
      this.expandedFor.set(null);
      this.lines.set([]);
      return;
    }

    this.expandedFor.set(orderId);
    this.loadingLinesFor.set(orderId);
    this.lines.set([]);
    this.error.set(null);
    try {
      const lines = await this.pos.orderLines(orderId);
      if (this.expandedFor() === orderId) this.lines.set(lines);
    } catch (err) {
      if (this.expandedFor() === orderId) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load sale items');
      }
    } finally {
      if (this.loadingLinesFor() === orderId) this.loadingLinesFor.set(null);
    }
  }

  protected async settle(orderId: string, payments: PaymentInput[]): Promise<void> {
    try {
      await this.cashierSession.assertOpen('collecting payment');
    } catch (err) {
      this.settling.set(null);
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.completedSale.set(null);
    const order = this.settling();
    try {
      const mpesaPayment = payments.find(
        payment =>
          payment.method === 'mpesa' &&
          (payment.phone || (this.mpesa.availability().manualFallback && payment.reference))
      );
      if (mpesaPayment) {
        if (!this.connectivity.online())
          throw new Error('Integrated M-PESA requires an internet connection.');
        if (!order?.location_id) throw new Error('This sale has no business location.');
        const cashPayments = payments
          .filter(payment => payment !== mpesaPayment)
          .map(({ phone: _phone, ...payment }) => payment);
        const outcome = await this.mpesaCheckout.run(
          retry =>
            this.mpesa.initiateOrder({
              orderId,
              locationId: order.location_id,
              mpesaAmount: mpesaPayment.amount,
              cashAmount: cashPayments.reduce((sum, payment) => sum + payment.amount, 0),
              clientRef: this.settleClientRef!,
              retry,
              ...(mpesaPayment.phone
                ? { phone: mpesaPayment.phone }
                : { receipt: mpesaPayment.reference! }),
            }),
          this.settleMpesaRetryAllowed
        );
        if (outcome.kind === 'awaiting_cash') {
          this.settling.set(null);
          this.mpesaSplitReady.set({
            intentId: outcome.intentId,
            orderId,
            code: order.code,
            cashPayments,
            cashAmount: outcome.cashAmount,
          });
          return;
        }
        if (outcome.kind === 'manual_review') {
          this.settling.set(null);
          this.settleClientRef = null;
          this.settleMpesaRetryAllowed = false;
          await this.load();
          throw new Error(outcome.message);
        }
        if (outcome.kind === 'failed' && outcome.retryAllowed) {
          this.settleMpesaRetryAllowed = true;
        }
        if (outcome.kind !== 'completed') throw new Error(outcome.message);
        this.completeSettlement(orderId, order.code);
        await this.load();
        return;
      }
      await this.pos.settleOrder(orderId, payments, this.settleClientRef ?? undefined);
      this.completeSettlement(orderId, order?.code ?? 'Sale');
      await this.load();
    } catch (err) {
      // Keep the settlement (and its client ref) open: if the failure was a
      // lost response, the retry must reuse the same ref so the server
      // replays instead of double-posting the payment.
      this.error.set(err instanceof Error ? err.message : 'Payment collection failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmMpesaCash(): Promise<void> {
    const split = this.mpesaSplitReady();
    if (!split) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.mpesaCheckout.finalizeCash(split.intentId);
      this.mpesaSplitReady.set(null);
      this.completeSettlement(split.orderId, split.code);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not finish split payment');
    } finally {
      this.busy.set(false);
    }
  }

  private completeSettlement(orderId: string, code: string): void {
    this.settling.set(null);
    this.settleClientRef = null;
    this.settleMpesaRetryAllowed = false;
    this.completedSale.set({ id: orderId, code });
  }

  protected async startSettlement(order: OrderWithCustomer): Promise<void> {
    this.error.set(null);
    this.completedSale.set(null);
    try {
      await this.cashierSession.assertOpen('collecting payment');
      // One reference per settlement attempt: every retry/replay of this
      // settle reuses it, so a lost response cannot double-post the payment.
      this.settleClientRef = crypto.randomUUID();
      this.settleMpesaRetryAllowed = false;
      this.settling.set(order);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Open a cashier session first');
    }
  }

  protected async printReceipt(orderId: string): Promise<void> {
    this.printing.set(true);
    this.error.set(null);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.printing.set(false);
    }
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

  /** When the sale was handed to the cashier; falls back to creation time. */
  protected pendingSince(order: OrderWithCustomer): string {
    return order.cashier_pending_at ?? order.created_at;
  }

  protected ageOf(order: OrderWithCustomer): QueueAge {
    return queueAge(this.pendingSince(order), this.now());
  }

  protected ageTone(age: QueueAge): 'neutral' | 'warning' | 'error' {
    return age === 'stale' ? 'error' : age === 'aging' ? 'warning' : 'neutral';
  }

  protected waitToneClass(order: OrderWithCustomer): string {
    const age = this.ageOf(order);
    if (age === 'stale') return 'text-error font-semibold';
    if (age === 'aging') return 'text-warning';
    return 'text-base-content/60';
  }

  protected waitLabel(iso: string, now = Date.now()): string {
    return waitLabel(iso, now);
  }
}
