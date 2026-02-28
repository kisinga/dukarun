import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PaymentsService, PaymentWithOrder } from '../../../core/services/payments.service';
import { calculatePaymentStats } from '../../../core/services/stats/payment-stats.util';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { OrderDetailComponent } from '../orders/order-detail/order-detail.component';
import { PaymentAction, PaymentCardComponent } from './components/payment-card.component';
import { PaymentSearchBarComponent } from './components/payment-search-bar.component';
import { PaymentStats, PaymentStatsComponent } from './components/payment-stats.component';
import { PaymentTableRowComponent } from './components/payment-table-row.component';

/**
 * Payments list page - similar to orders page
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 */
@Component({
  selector: 'app-payments',
  imports: [
    CommonModule,
    PaymentCardComponent,
    PaymentStatsComponent,
    PaymentSearchBarComponent,
    PaymentTableRowComponent,
    PaginationComponent,
    OrderDetailComponent,
  ],
  templateUrl: './payments.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} });

  // State from service
  readonly payments = this.paymentsService.payments;
  readonly isLoading = this.paymentsService.isLoading;
  readonly error = this.paymentsService.error;
  readonly totalItems = this.paymentsService.totalItems;

  // Context filter from route (payments by customer or by order)
  readonly contextCustomerId = computed(
    () => (this.queryParams() as Record<string, string>)['customerId'] ?? null,
  );
  readonly contextOrderId = computed(
    () => (this.queryParams() as Record<string, string>)['orderId'] ?? null,
  );
  readonly contextCustomerName = computed(() => {
    const id = this.contextCustomerId();
    if (!id) return null;
    const p = this.payments().find((x) => x.order.customer?.id === id);
    return p?.order.customer
      ? `${p.order.customer.firstName ?? ''} ${p.order.customer.lastName ?? ''}`.trim() || null
      : null;
  });
  readonly contextOrderCode = computed(() => {
    const id = this.contextOrderId();
    if (!id) return null;
    return this.payments().find((x) => x.order.id === id)?.order.code ?? null;
  });
  readonly hasContextFilter = computed(() => !!this.contextCustomerId() || !!this.contextOrderId());

  // Local UI state
  readonly searchQuery = signal('');
  readonly stateFilter = signal('');
  readonly stateFilterColor = signal<string>('primary');
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly selectedOrderId = signal<string | null>(null);

  // Computed: filtered payments (search + state + context customer/order)
  readonly filteredPayments = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const stateFilter = this.stateFilter();
    const customerId = this.contextCustomerId();
    const orderId = this.contextOrderId();
    const allPayments = this.payments();

    let filtered = allPayments;

    if (customerId) {
      filtered = filtered.filter((p) => p.order.customer?.id === customerId);
    }
    if (orderId) {
      filtered = filtered.filter((p) => p.order.id === orderId);
    }

    // Apply state filter
    if (stateFilter) {
      // Handle "Pending" filter which includes both Created and Authorized
      if (stateFilter === 'Created') {
        filtered = filtered.filter(
          (payment) => payment.state === 'Created' || payment.state === 'Authorized',
        );
      }
      // Handle "Failed" filter which includes both Declined and Cancelled
      else if (stateFilter === 'Declined') {
        filtered = filtered.filter(
          (payment) => payment.state === 'Declined' || payment.state === 'Cancelled',
        );
      } else {
        filtered = filtered.filter((payment) => payment.state === stateFilter);
      }
    }

    // Apply search query
    if (query) {
      filtered = filtered.filter((payment) => {
        const orderCode = payment.order.code?.toLowerCase() || '';
        const customerName = payment.order.customer
          ? `${payment.order.customer.firstName} ${payment.order.customer.lastName}`.toLowerCase()
          : '';
        const customerEmail = payment.order.customer?.emailAddress?.toLowerCase() || '';
        const transactionId = payment.transactionId?.toLowerCase() || '';
        const method = payment.method?.toLowerCase() || '';
        return (
          orderCode.includes(query) ||
          customerName.includes(query) ||
          customerEmail.includes(query) ||
          transactionId.includes(query) ||
          method.includes(query)
        );
      });
    }

    return filtered;
  });

  // Computed: paginated payments
  readonly paginatedPayments = computed(() => {
    const filtered = this.filteredPayments();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredPayments();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics - using utility for single source of truth
  readonly stats = computed((): PaymentStats => {
    return calculatePaymentStats(this.payments());
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredPayments().length);
  });

  ngOnInit(): void {
    this.loadPayments();
  }

  async loadPayments(): Promise<void> {
    await this.paymentsService.fetchPayments({
      take: 100,
      skip: 0,
      sort: { createdAt: 'DESC' as any },
    });
  }

  async refreshPayments(): Promise<void> {
    await this.loadPayments();
  }

  /**
   * Handle payment actions (view, viewOrder)
   */
  onPaymentAction(event: { action: PaymentAction; paymentId: string; orderId?: string }): void {
    const { action, paymentId, orderId } = event;

    switch (action) {
      case 'view':
        this.router.navigate(['/dashboard/payments', paymentId]);
        break;
      case 'viewOrder':
        if (orderId) {
          this.selectedOrderId.set(orderId);
        }
        break;
    }
  }

  /**
   * Close order modal
   */
  onOrderModalClosed(): void {
    this.selectedOrderId.set(null);
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
    this.paymentsService.clearError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackByPaymentId(index: number, payment: PaymentWithOrder): string {
    return payment.id;
  }

  /**
   * Handle filter click from stats component
   */
  onStatsFilterClick(event: { type: string; value: string; color: string }): void {
    if (event.type === 'state') {
      // Toggle filter if clicking the same filter
      if (this.stateFilter() === event.value) {
        this.stateFilter.set('');
        this.stateFilterColor.set('primary');
      } else {
        this.stateFilter.set(event.value);
        this.stateFilterColor.set(event.color);
      }
      // Reset to first page when filter changes
      this.currentPage.set(1);
    }
  }

  /**
   * Clear state filter
   */
  clearStateFilter(): void {
    this.stateFilter.set('');
    this.stateFilterColor.set('primary');
    this.currentPage.set(1);
  }

  /**
   * Clear context filter (customer/order) and show all payments
   */
  clearContextFilter(): void {
    this.router.navigate(['/dashboard/payments'], { queryParams: {} });
    this.currentPage.set(1);
  }

  goToCustomersPage(): void {
    this.router.navigate(['/dashboard/customers']);
  }

  goToOrder(orderId: string): void {
    this.router.navigate(['/dashboard/orders', orderId]);
  }

  /**
   * Get filter label for display
   */
  getStateFilterLabel(): string {
    const filter = this.stateFilter();
    if (filter === 'Settled') return 'Successful';
    if (filter === 'Created') return 'Pending';
    if (filter === 'Declined') return 'Failed';
    return '';
  }

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
