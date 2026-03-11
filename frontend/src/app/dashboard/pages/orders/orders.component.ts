import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { OrderListOptions } from '../../../core/graphql/generated/graphql';
import { CustomerService } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';
import { OrdersService } from '../../../core/services/orders.service';
import { ToastService } from '../../../core/services/toast.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { OrderAction, OrderCardComponent } from './components/order-card.component';
import { PayOrderModalComponent, PayOrderModalData } from './components/pay-order-modal.component';
import { OrderStats, OrderStatsComponent } from './components/order-stats.component';
import { OrderTableRowComponent } from './components/order-table-row.component';
import { PageHeaderComponent } from '../../components/shared/page-header.component';
import { ListSearchBarComponent } from '../../components/shared/list-search-bar.component';
import {
  PeriodSelectorComponent,
  type AnalyticsPeriod,
} from '../../components/shared/charts/period-selector.component';
import { EchartContainerComponent } from '../../components/shared/charts/echart-container.component';
import { OrdersAdvancedFiltersModalComponent } from './components/orders-advanced-filters-modal.component';
import { OrdersListFilterService } from './services/orders-list-filter.service';

/**
 * Orders list page - refactored with composable components
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 * - KISS principles applied
 */
@Component({
  selector: 'app-orders',
  imports: [
    CommonModule,
    OrderCardComponent,
    OrderStatsComponent,
    OrderTableRowComponent,
    PaginationComponent,
    PayOrderModalComponent,
    PageHeaderComponent,
    ListSearchBarComponent,
    PeriodSelectorComponent,
    EchartContainerComponent,
    OrdersAdvancedFiltersModalComponent,
  ],
  templateUrl: './orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly orderService = inject(OrderService);
  private readonly customerService = inject(CustomerService);
  private readonly toastService = inject(ToastService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly filterService = inject(OrdersListFilterService);

  // State from service
  readonly orders = this.ordersService.orders;
  readonly isLoading = this.ordersService.isLoading;
  readonly error = this.ordersService.error;
  readonly totalItems = this.ordersService.totalItems;
  readonly allOrdersForStats = this.ordersService.allOrdersForStats;
  readonly isLoadingStats = this.ordersService.isLoadingStats;

  // Query parameters
  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} });

  // Local UI state (pagination, modal)
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly selectedOrderForPayment = signal<PayOrderModalData | null>(null);
  private readonly payOrderModal = viewChild(PayOrderModalComponent);

  // Order volume trend (lazy, MV-backed)
  readonly trendOpen = signal(false);
  readonly trendPeriod = signal<AnalyticsPeriod>('30d');
  readonly analyticsStats = this.analyticsService.stats;
  readonly analyticsLoading = this.analyticsService.isLoading;
  private trendFetched = false;
  readonly orderVolumeChartOption = computed(() => {
    const trend = this.analyticsStats()?.orderVolumeTrend ?? [];
    const dates = trend.map((p) => p.date);
    const values = trend.map((p) => p.value);
    return {
      xAxis: { type: 'category' as const, data: dates },
      yAxis: { type: 'value' as const },
      series: [{ type: 'bar' as const, data: values }],
      grid: { left: '3%', right: '4%', bottom: '3%', top: '4%', containLabel: true },
    };
  });

  // Computed: filtered orders (server applies date + state; we apply search + customerId client-side)
  readonly filteredOrders = computed(() => {
    const query = this.filterService.searchQuery().toLowerCase().trim();
    const stateFilter = this.filterService.stateFilter();
    const customerIdFilter = this.filterService.customerIdFilter();
    const allOrders = this.orders();

    let filtered = allOrders;

    if (customerIdFilter) {
      filtered = filtered.filter((order) => order.customer?.id === customerIdFilter);
    }

    if (stateFilter) {
      if (stateFilter === 'PaymentSettled') {
        filtered = filtered.filter(
          (order) => order.state === 'PaymentSettled' || order.state === 'Fulfilled',
        );
      } else {
        filtered = filtered.filter((order) => order.state === stateFilter);
      }
    }

    if (query) {
      filtered = filtered.filter((order) => {
        const code = order.code?.toLowerCase().trim() || '';
        if (code.includes(query)) return true;
        const customer = order.customer;
        if (customer) {
          const firstName = (customer.firstName || '').toLowerCase().trim();
          const lastName = (customer.lastName || '').toLowerCase().trim();
          const fullName = `${firstName} ${lastName}`.trim();
          if (fullName.includes(query)) return true;
          if (firstName.includes(query) || lastName.includes(query)) return true;
          const email = (customer.emailAddress || '').toLowerCase().trim();
          if (email.includes(query)) return true;
        }
        return false;
      });
    }

    return filtered;
  });

  // Computed: paginated orders
  readonly paginatedOrders = computed(() => {
    const filtered = this.filteredOrders();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredOrders();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics
  readonly stats = computed((): OrderStats => {
    // Use all orders for stats to get accurate counts
    const allOrders = this.allOrdersForStats();
    // Use totalItems for total orders count (most accurate)
    const totalOrders = this.totalItems();

    // Calculate stats from all fetched orders
    const draftOrders = allOrders.filter((o) => o.state === 'Draft').length;
    const unpaidOrders = allOrders.filter((o) => o.state === 'ArrangingPayment').length;
    const paidOrders = allOrders.filter(
      (o) => o.state === 'PaymentSettled' || o.state === 'Fulfilled',
    ).length;

    return { totalOrders, draftOrders, unpaidOrders, paidOrders };
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredOrders().length);
  });

  constructor() {
    // Effect: when list filter (date/state) changes, refetch with new options
    effect(() => {
      this.filterService.dateFrom();
      this.filterService.dateTo();
      this.filterService.stateFilter();
      this.loadOrdersWithFilter();
    });

    // Effect to handle customerId query parameter
    effect(() => {
      const params = this.queryParams();
      const customerId = 'customerId' in params ? (params['customerId'] as string) : undefined;
      const orders = this.orders();

      if (customerId) {
        this.filterService.customerIdFilter.set(customerId);
        if (orders.length > 0) {
          const orderWithCustomer = orders.find((o) => o.customer?.id === customerId);
          if (orderWithCustomer?.customer) {
            const customer = orderWithCustomer.customer;
            const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
            if (fullName) {
              this.filterService.searchQuery.set(fullName);
            } else if (customer.emailAddress) {
              this.filterService.searchQuery.set(customer.emailAddress);
            }
          }
        }
      } else {
        this.filterService.customerIdFilter.set(null);
      }
    });

    // Effect to show payment modal when order is selected
    effect(() => {
      const orderData = this.selectedOrderForPayment();
      const modal = this.payOrderModal();
      if (orderData && modal) {
        setTimeout(async () => {
          await modal.show();
        }, 0);
      }
    });
  }

  ngOnInit(): void {
    this.loadOrdersAndStats();
  }

  /** Build OrderListOptions from filter service (single place that composes filter → options). */
  private buildOrderListOptions(): OrderListOptions {
    const dateFrom = this.filterService.dateFrom();
    const dateTo = this.filterService.dateTo();
    const stateFilter = this.filterService.stateFilter();
    const hasDateFilter = dateFrom != null || dateTo != null;
    const hasStateFilter = stateFilter !== '';
    const hasAnyFilter = hasDateFilter || hasStateFilter;

    const filter: OrderListOptions['filter'] = {};
    if (dateFrom != null || dateTo != null) {
      const after = dateFrom ? `${dateFrom.slice(0, 10)}T00:00:00.000Z` : undefined;
      const before = dateTo ? `${dateTo.slice(0, 10)}T23:59:59.999Z` : undefined;
      filter.orderPlacedAt = { ...(after && { after }), ...(before && { before }) } as any;
    }
    if (stateFilter) {
      filter.state = { eq: stateFilter } as any;
    }

    return {
      take: hasAnyFilter ? 500 : 100,
      skip: 0,
      sort: { createdAt: 'DESC' as any },
      ...(Object.keys(filter).length > 0 && { filter }),
    };
  }

  async loadOrdersWithFilter(): Promise<void> {
    await this.ordersService.fetchOrders(this.buildOrderListOptions());
  }

  async loadOrdersForStats(): Promise<void> {
    await this.ordersService.fetchAllOrdersForStats();
  }

  async loadOrdersAndStats(): Promise<void> {
    await this.loadOrdersWithFilter();
    await this.loadOrdersForStats();
  }

  async refreshOrders(): Promise<void> {
    await this.loadOrdersAndStats();
  }

  /**
   * Handle order actions (view, print, pay, void)
   */
  onOrderAction(event: { action: OrderAction; orderId: string }): void {
    const { action, orderId } = event;

    switch (action) {
      case 'view':
        this.router.navigate(['/dashboard/orders', orderId]);
        break;

      case 'print':
        this.router.navigate(['/dashboard/orders', orderId], { queryParams: { print: true } });
        break;

      case 'pay':
        this.handlePayOrder(orderId);
        break;

      case 'void':
        this.handleVoidOrder(orderId);
        break;
    }
  }

  /**
   * Void order: confirm then call backend, refresh list, show toast.
   */
  private async handleVoidOrder(orderId: string): Promise<void> {
    if (
      !confirm(
        'Void this order? Stock will be restored, ledger reversed, payments cancelled, and order marked as Cancelled.',
      )
    ) {
      return;
    }
    try {
      await this.orderService.voidOrder(orderId);
      this.toastService.show('Order voided', 'The order has been voided successfully.', 'success');
      await this.refreshOrders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to void order';
      this.toastService.show('Void failed', message, 'error');
    }
  }

  /**
   * Handle pay order action - fetch ledger-based outstanding and show modal
   */
  private async handlePayOrder(orderId: string): Promise<void> {
    const order = this.orders().find((o) => o.id === orderId);
    if (!order) return;

    const customerName = order.customer
      ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() ||
        'Walk-in Customer'
      : 'Walk-in Customer';

    const total = order.totalWithTax || order.total || 0;
    const settled = (order.payments || [])
      .filter((p: { state: string }) => p.state === 'Settled')
      .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    const orderBasedOutstanding = Math.max(0, total - settled);

    const status = await this.ordersService.getOrderPaymentStatus(orderId);
    const outstanding =
      status != null && status.amountOwing >= 0 ? status.amountOwing : orderBasedOutstanding;

    const modalData: PayOrderModalData = {
      customerId: order.customer?.id ?? '',
      customerName,
      outstandingAmount: outstanding,
      totalAmount: total,
      orderId: order.id,
      orderCode: order.code || '',
    };

    this.selectedOrderForPayment.set(modalData);
  }

  /**
   * Handle payment modal closed/cancelled
   */
  onPaymentModalCancelled(): void {
    this.selectedOrderForPayment.set(null);
  }

  /**
   * Handle payment recorded - refresh orders and customer list so balance heals everywhere
   */
  async onPaymentRecorded(): Promise<void> {
    this.selectedOrderForPayment.set(null);
    await this.refreshOrders();
    this.customerService
      .fetchCustomers({ take: 100, skip: 0 }, { fetchPolicy: 'network-only' })
      .catch(() => {});
  }

  /**
   * Go to specific page
   */
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  /**
   * Change items per page
   */
  changeItemsPerPage(items: number): void {
    this.itemsPerPage.set(items);
    this.currentPage.set(1); // Reset to first page
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.ordersService.clearError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackByOrderId(index: number, order: any): string {
    return order.id;
  }

  onStatsFilterClick(event: { type: string; value: string; color: string }): void {
    if (event.type === 'state') {
      if (this.filterService.stateFilter() === event.value) {
        this.filterService.stateFilter.set('');
        this.filterService.stateFilterColor.set('primary');
      } else {
        this.filterService.stateFilter.set(event.value);
        this.filterService.stateFilterColor.set(event.color);
      }
      this.currentPage.set(1);
    }
  }

  clearStateFilter(): void {
    this.filterService.stateFilter.set('');
    this.filterService.stateFilterColor.set('primary');
    this.currentPage.set(1);
  }

  getStateFilterLabel(): string {
    const filter = this.filterService.stateFilter();
    if (filter === 'Draft') return 'Draft';
    if (filter === 'ArrangingPayment') return 'Unpaid';
    if (filter === 'PaymentSettled') return 'Paid';
    return '';
  }

  clearAllFilters(): void {
    this.filterService.clearFilters();
    this.currentPage.set(1);
  }

  readonly advancedFiltersOpen = signal(false);

  openAdvancedFilters(): void {
    this.advancedFiltersOpen.set(true);
  }

  closeAdvancedFilters(): void {
    this.advancedFiltersOpen.set(false);
  }

  toggleOrderVolumeTrend(): void {
    const opening = !this.trendOpen();
    this.trendOpen.set(opening);
    if (opening && !this.trendFetched) {
      this.trendFetched = true;
      void this.analyticsService.fetch(this.trendPeriod());
    }
  }

  onTrendPeriodChange(period: AnalyticsPeriod): void {
    this.trendPeriod.set(period);
    void this.analyticsService.fetch(period);
  }

  /** When user clicks a bar on the order volume trend chart, filter list by that date. */
  onChartClick(payload: { name?: string; dataIndex: number; value?: unknown }): void {
    const dateStr = payload?.name;
    if (dateStr) {
      const normalized = dateStr.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        this.filterService.setSingleDate(normalized);
        this.currentPage.set(1);
        return;
      }
      const asDate = new Date(dateStr);
      if (!isNaN(asDate.getTime())) {
        this.filterService.setSingleDate(asDate.toISOString().slice(0, 10));
        this.currentPage.set(1);
      }
    }
  }

  readonly Math = Math;
}
