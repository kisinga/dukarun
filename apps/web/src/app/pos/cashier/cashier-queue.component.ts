import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { ListSearchBarComponent } from '../../shared/ui/list-search-bar.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { StatBarComponent } from '../../shared/ui/stat-bar.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

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
  ],
  template: `
    <app-page
      title="Cashier Queue"
      subtitle="Collect payment for sales handed off from the Sell screen."
      [badge]="orderQueueCounts.cashierQueue()"
      [wide]="true"
    >
      @if (live()) {
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
        title="Refresh cashier queue"
        aria-label="Refresh cashier queue"
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

      <app-list-search-bar
        placeholder="Search sale code or customer…"
        [searchQuery]="query()"
        (searchQueryChange)="onSearch($event)"
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
        <div class="flex flex-col gap-2 lg:hidden">
          @for (order of parked(); track order.id) {
            <div class="card bg-base-100">
              <div class="card-body gap-3 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-mono font-semibold">{{ order.code }}</p>
                      <app-status-badge type="warning" label="Awaiting payment" size="xs" />
                    </div>
                    <p class="type-caption mt-1">{{ customerName(order) }}</p>
                    <p class="mt-1 text-xs text-warning">
                      Waiting {{ waitLabel(order.created_at) }} · {{ time(order.created_at) }}
                    </p>
                  </div>
                  <span class="shrink-0 font-bold">
                    <app-money [amount]="order.total" />
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-2 border-t border-base-300/60 pt-3">
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    [loading]="loadingLinesFor() === order.id"
                    [attr.aria-expanded]="expandedFor() === order.id"
                    (click)="toggleItems(order.id)"
                  >
                    <app-icon
                      [name]="expandedFor() === order.id ? 'heroChevronUp' : 'heroChevronDown'"
                    />
                    {{ expandedFor() === order.id ? 'Hide items' : 'View items' }}
                  </button>
                  <button
                    appButton
                    size="sm"
                    class="ml-auto"
                    type="button"
                    [disabled]="!cashierSession.canTakePayment() || busy()"
                    (click)="startSettlement(order)"
                  >
                    <app-icon name="heroBanknotes" />
                    Collect payment
                  </button>
                </div>

                @if (expandedFor() === order.id) {
                  <div class="border-t border-base-300/60 pt-1">
                    @if (loadingLinesFor() === order.id) {
                      <div class="flex items-center justify-center gap-2 py-6 text-base-content/60">
                        <span class="loading loading-spinner loading-sm"></span>
                        <span>Loading items…</span>
                      </div>
                    } @else if (lines().length === 0) {
                      <p class="py-4 text-sm text-base-content/60">No items found for this sale.</p>
                    } @else {
                      <ul class="divide-y divide-base-300/60" aria-label="Sale items">
                        @for (line of lines(); track line.id) {
                          <li class="flex items-center gap-4 py-3">
                            <div class="min-w-0 flex-1">
                              <p class="truncate font-medium">{{ line.label }}</p>
                              <p class="type-caption mt-1">
                                {{ line.quantity }} ×
                                <app-money [amount]="line.custom_price ?? line.unit_price" />
                              </p>
                            </div>
                            <span class="font-semibold">
                              <app-money [amount]="line.line_total" />
                            </span>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <div class="hidden lg:block">
          <app-data-table-shell
            title="Waiting for payment"
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
                    [attr.aria-expanded]="expandedFor() === order.id"
                    (click)="toggleItems(order.id)"
                    (keydown.enter)="toggleItems(order.id)"
                  >
                    <td>
                      <p class="table-primary text-warning">{{ waitLabel(order.created_at) }}</p>
                      <p class="table-secondary">{{ time(order.created_at) }}</p>
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
                                  <td>{{ line.label }}</td>
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
          [busy]="busy()"
          [heading]="'Collect payment · ' + order.code"
          (confirmed)="settle(order.id, $event)"
          (approvalRequested)="directAccountRequested()"
          (cancelled)="settling.set(null)"
        />
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
  protected readonly cashierSession = inject(CashierSessionService);
  protected readonly orderQueueCounts = inject(OrderQueueCountsService);

  protected readonly parked = signal<OrderWithCustomer[]>([]);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly totalItems = signal(0);
  protected readonly query = signal('');
  protected readonly live = signal(false);
  protected readonly expandedFor = signal<string | null>(null);
  protected readonly loadingLinesFor = signal<string | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly settling = signal<OrderWithCustomer | null>(null);
  protected readonly methods = signal<PaymentMethodOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly completedSale = signal<{ id: string; code: string } | null>(null);
  protected readonly printerEnabled = signal(false);
  protected readonly directAccountNotice = signal(false);
  protected readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
  private directAccountTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize()))
  );
  protected readonly queueStats = computed(() => {
    const rows = this.parked();
    const oldest = rows.reduce<OrderWithCustomer | null>((current, order) => {
      if (!current) return order;
      return new Date(order.created_at).getTime() < new Date(current.created_at).getTime()
        ? order
        : current;
    }, null);
    return [
      { label: 'Waiting', value: this.totalItems(), tone: 'warning' as const },
      {
        label: 'Value on page',
        value: formatKes(rows.reduce((total, order) => total + order.total, 0)),
      },
      { label: 'Oldest on page', value: oldest ? this.waitLabel(oldest.created_at) : '—' },
      {
        label: 'Walk-ins on page',
        value: rows.filter(order => order.customer_id === null).length,
      },
    ];
  });

  private channel: RealtimeChannel | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    this.printerEnabled.set(await this.receiptData.printerEnabled());
    try {
      const methods = await this.pos.enabledPaymentMethods();
      this.methods.set(
        methods.map(m => ({
          code: m.code,
          name: m.name,
          isCashierControlled: m.is_cashier_controlled,
        }))
      );
    } catch {
      // No methods configured yet; the panel will show an empty method list.
    }
    await this.load();
    this.channel = this.pos.client
      .channel('cashier-queue-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => void this.load(true)
      )
      .subscribe(status => this.live.set(status === 'SUBSCRIBED'));
  }

  ngOnDestroy(): void {
    if (this.channel) void this.pos.client.removeChannel(this.channel);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.directAccountTimer) clearTimeout(this.directAccountTimer);
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
      await this.pos.settleOrder(orderId, payments);
      this.settling.set(null);
      this.completedSale.set({ id: orderId, code: order?.code ?? 'Sale' });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Payment collection failed');
      this.settling.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected async startSettlement(order: OrderWithCustomer): Promise<void> {
    this.error.set(null);
    this.completedSale.set(null);
    try {
      await this.cashierSession.assertOpen('collecting payment');
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
      await this.print.printOrder(order, company.name, company.logoUrl, meta);
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

  protected waitLabel(iso: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
}
