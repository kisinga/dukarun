import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { OrdersService } from '../../../core/services/orders.service';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { OrderAction, OrderCardComponent } from './components/order-card.component';
import { OrderSearchBarComponent } from './components/order-search-bar.component';
import { OrderStats, OrderStatsComponent } from './components/order-stats.component';
import { OrderTableRowComponent } from './components/order-table-row.component';

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
    OrderSearchBarComponent,
    OrderTableRowComponent,
    PaginationComponent,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // State from service
  readonly orders = this.ordersService.orders;
  readonly isLoading = this.ordersService.isLoading;
  readonly error = this.ordersService.error;
  readonly totalItems = this.ordersService.totalItems;
  readonly allOrdersForStats = this.ordersService.allOrdersForStats;
  readonly isLoadingStats = this.ordersService.isLoadingStats;

  // Query parameters
  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} });

  // Local UI state
  readonly searchQuery = signal('');
  readonly stateFilter = signal('');
  readonly customerIdFilter = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];

  // Computed: filtered orders
  readonly filteredOrders = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const stateFilter = this.stateFilter();
    const customerIdFilter = this.customerIdFilter();
    const allOrders = this.orders();

    let filtered = allOrders;

    // Apply customer ID filter (from query param)
    if (customerIdFilter) {
      filtered = filtered.filter((order) => order.customer?.id === customerIdFilter);
    }

    // Apply state filter
    if (stateFilter) {
      filtered = filtered.filter((order) => order.state === stateFilter);
    }

    // Apply search query
    if (query) {
      filtered = filtered.filter((order) => {
        // Search by order code
        const code = order.code?.toLowerCase().trim() || '';
        if (code.includes(query)) return true;

        // Search by customer information
        const customer = order.customer;
        if (customer) {
          // Search by full name (first + last)
          const firstName = (customer.firstName || '').toLowerCase().trim();
          const lastName = (customer.lastName || '').toLowerCase().trim();
          const fullName = `${firstName} ${lastName}`.trim();

          if (fullName.includes(query)) return true;

          // Search by first name or last name separately
          if (firstName.includes(query) || lastName.includes(query)) return true;

          // Search by email
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
    // Effect to handle customerId query parameter
    effect(() => {
      const params = this.queryParams();
      const customerId = 'customerId' in params ? (params['customerId'] as string) : undefined;
      const orders = this.orders(); // Watch orders to update search query when orders load

      if (customerId) {
        this.customerIdFilter.set(customerId);

        // After orders are loaded, set search query to customer name for visual feedback
        if (orders.length > 0) {
          const orderWithCustomer = orders.find((o) => o.customer?.id === customerId);
          if (orderWithCustomer?.customer) {
            const customer = orderWithCustomer.customer;
            const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
            if (fullName) {
              this.searchQuery.set(fullName);
            } else if (customer.emailAddress) {
              this.searchQuery.set(customer.emailAddress);
            }
          }
        }
      } else {
        this.customerIdFilter.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.loadOrdersAndStats();
  }

  async loadOrders(): Promise<void> {
    await this.ordersService.fetchOrders({
      take: 100,
      skip: 0,
      sort: { createdAt: 'DESC' as any },
    });
  }

  async loadOrdersForStats(): Promise<void> {
    // Fetch all orders for accurate stats calculation
    // This should be called after loadOrders to ensure totalItems is available
    await this.ordersService.fetchAllOrdersForStats();
  }

  async loadOrdersAndStats(): Promise<void> {
    // Load main orders first to get totalItems
    await this.loadOrders();
    // Then load all orders for stats calculation
    await this.loadOrdersForStats();
  }

  async refreshOrders(): Promise<void> {
    // Refresh in sequence to ensure totalItems is available for stats
    await this.loadOrdersAndStats();
  }

  /**
   * Handle order actions (view, print)
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
    }
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

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
