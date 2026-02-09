import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CustomerService } from '../../../core/services/customer.service';
import {
  calculateCustomerStats,
  isCustomerCreditFrozen,
} from '../../../core/services/stats/customer-stats.util';
import { BulkPaymentModalComponent } from './components/bulk-payment-modal.component';
import { CustomerAction, CustomerCardComponent } from './components/customer-card.component';
import { CustomerSearchBarComponent } from './components/customer-search-bar.component';
import type { CustomerStats } from '../../../core/services/stats/customer-stats.util';
import { CustomerStatsComponent } from './components/customer-stats.component';
import { CustomerTableRowComponent } from './components/customer-table-row.component';
import { CustomerViewModalComponent } from './components/customer-view-modal.component';
import {
  DeleteConfirmationData,
  DeleteConfirmationModalComponent,
} from '../../components/shared/delete-confirmation-modal.component';
import { PaginationComponent } from '../../components/shared/pagination.component';

/**
 * Customers list page - similar to products page
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 * - KISS principles applied
 */
@Component({
  selector: 'app-customers',
  imports: [
    CommonModule,
    CustomerCardComponent,
    CustomerStatsComponent,
    CustomerSearchBarComponent,
    CustomerTableRowComponent,
    PaginationComponent,
    DeleteConfirmationModalComponent,
    BulkPaymentModalComponent,
    CustomerViewModalComponent,
  ],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersComponent implements OnInit {
  private readonly customerService = inject(CustomerService);
  readonly router = inject(Router);

  // View references
  readonly deleteModal = viewChild<DeleteConfirmationModalComponent>('deleteModal');
  readonly bulkPaymentModal = viewChild<BulkPaymentModalComponent>('bulkPaymentModal');
  readonly viewModal = viewChild<CustomerViewModalComponent>('viewModal');

  // State from service
  readonly customers = this.customerService.customers;
  readonly isLoading = this.customerService.isLoading;
  readonly error = this.customerService.error;
  readonly totalItems = this.customerService.totalItems;

  // Local UI state
  readonly searchQuery = signal('');
  readonly verifiedFilter = signal(false);
  readonly creditApprovedFilter = signal(false);
  readonly frozenFilter = signal(false);
  readonly recentFilter = signal(false);
  readonly activeFilterColors = signal<{
    verified?: string;
    creditApproved?: string;
    frozen?: string;
    recent?: string;
  }>({});
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly deleteModalData = signal<DeleteConfirmationData>({ entityName: '', relatedCount: 0 });
  readonly customerToDelete = signal<string | null>(null);
  readonly customerForPayment = signal<{
    id: string;
    name: string;
    outstandingAmount: number;
    availableCredit: number;
  } | null>(null);
  readonly customerToView = signal<any | null>(null);

  // Computed: filtered customers
  readonly filteredCustomers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const verified = this.verifiedFilter();
    const creditApproved = this.creditApprovedFilter();
    const recent = this.recentFilter();
    let allCustomers = this.customers();

    // Apply verified filter
    if (verified) {
      allCustomers = allCustomers.filter((c) => c.user?.verified);
    }

    // Apply credit approved filter
    if (creditApproved) {
      allCustomers = allCustomers.filter((c) => c.customFields?.isCreditApproved);
    }

    // Apply frozen filter (inferred: not approved and outstanding ≠ 0)
    if (this.frozenFilter()) {
      allCustomers = allCustomers.filter(isCustomerCreditFrozen);
    }

    // Apply recent filter (last 30 days)
    if (recent) {
      // Calculate date threshold once (constant for filter evaluation)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thresholdTime = thirtyDaysAgo.getTime();

      allCustomers = allCustomers.filter((c) => {
        if (!c.createdAt) return false;
        return new Date(c.createdAt).getTime() >= thresholdTime;
      });
    }

    // Apply search query
    if (!query) return allCustomers;

    return allCustomers.filter(
      (customer) =>
        customer.firstName?.toLowerCase().includes(query) ||
        customer.lastName?.toLowerCase().includes(query) ||
        customer.emailAddress?.toLowerCase().includes(query) ||
        customer.phoneNumber?.toLowerCase().includes(query),
    );
  });

  // Computed: paginated customers
  readonly paginatedCustomers = computed(() => {
    const filtered = this.filteredCustomers();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredCustomers();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics - using utility for single source of truth
  readonly stats = computed((): CustomerStats => {
    return calculateCustomerStats(this.customers());
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredCustomers().length);
  });

  ngOnInit(): void {
    this.loadCustomers();
  }

  async loadCustomers(): Promise<void> {
    await this.customerService.fetchCustomers({
      take: 100,
      skip: 0,
    });
  }

  async refreshCustomers(): Promise<void> {
    await this.loadCustomers();
  }

  /**
   * Check if customer is a walk-in customer
   */
  private isWalkInCustomer(customerId: string): boolean {
    const customer = this.customers().find((c) => c.id === customerId);
    if (!customer) return false;
    const email = customer.emailAddress?.toLowerCase() || '';
    const firstName = customer.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  }

  /**
   * Handle customer actions (view, edit, delete)
   */
  onCustomerAction(event: { action: CustomerAction; customerId: string }): void {
    const { action, customerId } = event;

    switch (action) {
      case 'view':
        this.openViewModal(customerId);
        break;

      case 'viewOrders':
        this.router.navigate(['/dashboard/orders'], { queryParams: { customerId } });
        break;

      case 'edit':
        // Prevent editing walk-in customers
        if (this.isWalkInCustomer(customerId)) {
          console.warn('Cannot edit walk-in customer:', customerId);
          // Could show a toast notification here
          return;
        }
        this.router.navigate(['/dashboard/customers/edit', customerId]);
        break;

      case 'delete':
        this.confirmDeleteCustomer(customerId);
        break;

      case 'recordPayment':
        this.openBulkPaymentModal(customerId);
        break;
    }
  }

  /**
   * Show delete confirmation modal
   */
  confirmDeleteCustomer(customerId: string): void {
    const customer = this.customers().find((c) => c.id === customerId);
    if (!customer) return;

    this.customerToDelete.set(customerId);
    this.deleteModalData.set({
      entityName: `${customer.firstName} ${customer.lastName}`,
      relatedCount: customer.addresses?.length || 0,
      relatedLabel: 'address',
    });

    // Show modal
    const modal = this.deleteModal();
    if (modal) {
      modal.show();
    }
  }

  /**
   * Handle delete confirmation
   */
  async onDeleteConfirmed(): Promise<void> {
    const customerId = this.customerToDelete();
    if (!customerId) return;

    // Hide modal
    const modal = this.deleteModal();
    if (modal) {
      modal.hide();
    }

    // Delete the customer
    const success = await this.customerService.deleteCustomer(customerId);

    if (success) {
      // Clear state
      this.customerToDelete.set(null);

      // Refresh the customer list
      await this.refreshCustomers();
    }
  }

  /**
   * Handle delete cancellation
   */
  onDeleteCancelled(): void {
    const modal = this.deleteModal();
    if (modal) {
      modal.hide();
    }
    this.customerToDelete.set(null);
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
    this.customerService.clearError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackByCustomerId(index: number, customer: any): string {
    return customer.id;
  }

  /**
   * Open bulk payment modal for a customer
   */
  openBulkPaymentModal(customerId: string): void {
    const customer = this.customers().find((c) => c.id === customerId);
    if (!customer) return;

    // Use snapshot data for initial display
    // The bulk payment modal will fetch fresh data via getCreditSummary() for validation
    const outstandingAmount = Number(customer.outstandingAmount ?? 0);
    const creditLimit = Number(customer.customFields?.creditLimit ?? 0);
    const availableCredit = Math.max(creditLimit - Math.abs(outstandingAmount), 0);

    this.customerForPayment.set({
      id: customerId,
      name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      outstandingAmount,
      availableCredit,
    });

    // Wait for the modal component to be rendered before showing it
    setTimeout(() => {
      const modal = this.bulkPaymentModal();
      if (modal) {
        modal.show();
      }
    }, 0);
  }

  /**
   * Handle payment recorded
   */
  async onPaymentRecorded(): Promise<void> {
    // Refresh customer list to show updated balances
    await this.refreshCustomers();
    this.customerForPayment.set(null);
  }

  /**
   * Handle payment cancelled
   */
  onPaymentCancelled(): void {
    this.customerForPayment.set(null);
  }

  /**
   * Open view modal for customer
   */
  openViewModal(customerId: string): void {
    const customer = this.customers().find((c) => c.id === customerId);
    if (customer) {
      this.customerToView.set(customer);
      setTimeout(() => {
        const modal = this.viewModal();
        if (modal) {
          modal.show();
        }
      }, 0);
    }
  }

  /**
   * Handle edit requested from view modal
   */
  onEditRequested(customerId: string): void {
    if (this.isWalkInCustomer(customerId)) {
      console.warn('Cannot edit walk-in customer:', customerId);
      return;
    }
    this.router.navigate(['/dashboard/customers/edit', customerId]);
  }

  /**
   * Handle record payment requested from view modal
   */
  onRecordPaymentRequested(customerId: string): void {
    this.openBulkPaymentModal(customerId);
  }

  /**
   * Handle view orders requested from view modal
   */
  onViewOrdersRequested(customerId: string): void {
    this.router.navigate(['/dashboard/orders'], { queryParams: { customerId } });
  }

  /**
   * Handle filter click from stats component
   */
  onStatsFilterClick(event: { type: string; color: string }): void {
    const { type, color } = event;
    const colors = this.activeFilterColors();
    if (type === 'verified') {
      const newValue = !this.verifiedFilter();
      this.verifiedFilter.set(newValue);
      this.activeFilterColors.set({ ...colors, verified: newValue ? color : undefined });
    } else if (type === 'creditApproved') {
      const newValue = !this.creditApprovedFilter();
      this.creditApprovedFilter.set(newValue);
      this.activeFilterColors.set({ ...colors, creditApproved: newValue ? color : undefined });
    } else if (type === 'frozen') {
      const newValue = !this.frozenFilter();
      this.frozenFilter.set(newValue);
      this.activeFilterColors.set({ ...colors, frozen: newValue ? color : undefined });
    } else if (type === 'recent') {
      const newValue = !this.recentFilter();
      this.recentFilter.set(newValue);
      this.activeFilterColors.set({ ...colors, recent: newValue ? color : undefined });
    }
    // Reset to first page when filter changes
    this.currentPage.set(1);
  }

  /**
   * Clear a specific filter
   */
  clearFilter(type: string): void {
    const colors = this.activeFilterColors();
    if (type === 'verified') {
      this.verifiedFilter.set(false);
      this.activeFilterColors.set({ ...colors, verified: undefined });
    } else if (type === 'creditApproved') {
      this.creditApprovedFilter.set(false);
      this.activeFilterColors.set({ ...colors, creditApproved: undefined });
    } else if (type === 'frozen') {
      this.frozenFilter.set(false);
      this.activeFilterColors.set({ ...colors, frozen: undefined });
    } else if (type === 'recent') {
      this.recentFilter.set(false);
      this.activeFilterColors.set({ ...colors, recent: undefined });
    }
    this.currentPage.set(1);
  }

  /**
   * Get filter label for display
   */
  getFilterLabel(type: string): string {
    if (type === 'verified') return 'Verified';
    if (type === 'creditApproved') return 'Credit Approved';
    if (type === 'frozen') return 'Frozen';
    if (type === 'recent') return 'Recent';
    return '';
  }

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
