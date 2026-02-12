import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SupplierService } from '../../../core/services/supplier.service';
import { calculateSupplierStats } from '../../../core/services/stats/supplier-stats.util';
import {
  DeleteConfirmationData,
  DeleteConfirmationModalComponent,
} from '../../components/shared/delete-confirmation-modal.component';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { SupplierAction, SupplierCardComponent } from './components/supplier-card.component';
import { SupplierSearchBarComponent } from './components/supplier-search-bar.component';
import { SupplierStats, SupplierStatsComponent } from './components/supplier-stats.component';
import { SupplierTableRowComponent } from './components/supplier-table-row.component';
import { SupplierViewModalComponent } from './components/supplier-view-modal.component';
import { SupplierPaymentModalComponent } from './components/supplier-payment-modal.component';

/**
 * Suppliers list page - similar to products and customers pages
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 * - KISS principles applied
 */
@Component({
  selector: 'app-suppliers',
  imports: [
    CommonModule,
    SupplierCardComponent,
    SupplierStatsComponent,
    SupplierSearchBarComponent,
    SupplierTableRowComponent,
    PaginationComponent,
    DeleteConfirmationModalComponent,
    SupplierViewModalComponent,
    SupplierPaymentModalComponent,
  ],
  templateUrl: './suppliers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuppliersComponent implements OnInit, OnDestroy {
  private readonly supplierService = inject(SupplierService);
  readonly router = inject(Router);
  private readonly routerEventsSub = this.router.events
    .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
    .subscribe((e) => {
      if (
        e.urlAfterRedirects?.startsWith('/dashboard/suppliers') &&
        !e.urlAfterRedirects.includes('/edit')
      )
        this.loadSuppliers();
    });

  // View references
  readonly deleteModal = viewChild<DeleteConfirmationModalComponent>('deleteModal');
  readonly viewModal = viewChild<SupplierViewModalComponent>('viewModal');
  readonly supplierPaymentModal = viewChild<SupplierPaymentModalComponent>('supplierPaymentModal');

  // State from service
  readonly suppliers = this.supplierService.suppliers;
  readonly isLoading = this.supplierService.isLoading;
  readonly error = this.supplierService.error;
  readonly totalItems = this.supplierService.totalItems;

  // Local UI state
  readonly searchQuery = signal('');
  readonly verifiedFilter = signal(false);
  readonly withAddressesFilter = signal(false);
  readonly recentFilter = signal(false);
  readonly activeFilterColors = signal<{
    verified?: string;
    withAddresses?: string;
    recent?: string;
  }>({});
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly deleteModalData = signal<DeleteConfirmationData>({ entityName: '', relatedCount: 0 });
  readonly supplierToDelete = signal<string | null>(null);
  readonly supplierToView = signal<any | null>(null);
  readonly supplierForPayment = signal<{ id: string; name: string } | null>(null);

  // Computed: filtered suppliers
  readonly filteredSuppliers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const verified = this.verifiedFilter();
    const withAddresses = this.withAddressesFilter();
    const recent = this.recentFilter();
    let allSuppliers = this.suppliers();

    // Apply verified filter
    if (verified) {
      allSuppliers = allSuppliers.filter((s) => s.user?.verified);
    }

    // Apply with addresses filter
    if (withAddresses) {
      allSuppliers = allSuppliers.filter((s) => s.addresses && s.addresses.length > 0);
    }

    // Apply recent filter (last 30 days)
    if (recent) {
      // Calculate date threshold once (constant for filter evaluation)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thresholdTime = thirtyDaysAgo.getTime();

      allSuppliers = allSuppliers.filter((s) => {
        if (!s.createdAt) return false;
        return new Date(s.createdAt).getTime() >= thresholdTime;
      });
    }

    // Apply search query
    if (!query) return allSuppliers;

    return allSuppliers.filter(
      (supplier) =>
        supplier.firstName?.toLowerCase().includes(query) ||
        supplier.lastName?.toLowerCase().includes(query) ||
        supplier.emailAddress?.toLowerCase().includes(query) ||
        supplier.phoneNumber?.toLowerCase().includes(query) ||
        supplier.customFields?.supplierType?.toLowerCase().includes(query) ||
        supplier.customFields?.contactPerson?.toLowerCase().includes(query),
    );
  });

  // Computed: paginated suppliers
  readonly paginatedSuppliers = computed(() => {
    const filtered = this.filteredSuppliers();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredSuppliers();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics - using utility for single source of truth
  readonly stats = computed((): SupplierStats => {
    return calculateSupplierStats(this.suppliers());
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredSuppliers().length);
  });

  ngOnInit(): void {
    this.loadSuppliers();
  }

  ngOnDestroy(): void {
    this.routerEventsSub.unsubscribe();
  }

  async loadSuppliers(): Promise<void> {
    await this.supplierService.fetchSuppliers({
      take: 100,
      skip: 0,
    });
  }

  async refreshSuppliers(): Promise<void> {
    await this.loadSuppliers();
  }

  /**
   * Handle supplier actions (view, edit, delete)
   */
  onSupplierAction(event: { action: SupplierAction; supplierId: string }): void {
    const { action, supplierId } = event;

    switch (action) {
      case 'view':
        this.openViewModal(supplierId);
        break;

      case 'edit':
        this.router.navigate(['/dashboard/suppliers/edit', supplierId]);
        break;

      case 'delete':
        this.confirmDeleteSupplier(supplierId);
        break;

      case 'recordPayment':
        this.onRecordPaymentRequested(supplierId);
        break;
    }
  }

  /**
   * Show delete confirmation modal
   */
  confirmDeleteSupplier(supplierId: string): void {
    const supplier = this.suppliers().find((s) => s.id === supplierId);
    if (!supplier) return;

    this.supplierToDelete.set(supplierId);
    this.deleteModalData.set({
      entityName: `${supplier.firstName} ${supplier.lastName}`,
      relatedCount: supplier.addresses?.length || 0,
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
    const supplierId = this.supplierToDelete();
    if (!supplierId) return;

    // Hide modal
    const modal = this.deleteModal();
    if (modal) {
      modal.hide();
    }

    // Delete the supplier
    const success = await this.supplierService.deleteSupplier(supplierId);

    if (success) {
      // Clear state
      this.supplierToDelete.set(null);

      // Refresh the supplier list
      await this.refreshSuppliers();
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
    this.supplierToDelete.set(null);
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
    this.supplierService.clearError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackBySupplierId(index: number, supplier: any): string {
    return supplier.id;
  }

  /**
   * Open view modal for supplier
   */
  openViewModal(supplierId: string): void {
    const supplier = this.suppliers().find((s) => s.id === supplierId);
    if (supplier) {
      this.supplierToView.set(supplier);
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
  onEditRequested(supplierId: string): void {
    this.router.navigate(['/dashboard/suppliers/edit', supplierId]);
  }

  /**
   * Handle delete requested from view modal
   */
  onDeleteRequested(supplierId: string): void {
    this.confirmDeleteSupplier(supplierId);
  }

  /**
   * Handle view purchases from view modal: navigate to purchases filtered by supplier
   */
  onViewPurchasesRequested(supplierId: string): void {
    this.router.navigate(['/dashboard/purchases'], { queryParams: { supplierId } });
  }

  /**
   * Handle record payment from view modal: open supplier payment modal
   */
  onRecordPaymentRequested(supplierId: string): void {
    const supplier = this.suppliers().find((s) => s.id === supplierId);
    const name = supplier
      ? `${supplier.firstName ?? ''} ${supplier.lastName ?? ''}`.trim() ||
        supplier.emailAddress ||
        'Supplier'
      : 'Supplier';
    this.supplierForPayment.set({ id: supplierId, name });
    setTimeout(() => {
      this.supplierPaymentModal()?.show();
    }, 0);
  }

  onSupplierPaymentRecorded(): void {
    this.supplierForPayment.set(null);
    this.refreshSuppliers();
  }

  onSupplierPaymentCancelled(): void {
    this.supplierForPayment.set(null);
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
    } else if (type === 'withAddresses') {
      const newValue = !this.withAddressesFilter();
      this.withAddressesFilter.set(newValue);
      this.activeFilterColors.set({ ...colors, withAddresses: newValue ? color : undefined });
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
    } else if (type === 'withAddresses') {
      this.withAddressesFilter.set(false);
      this.activeFilterColors.set({ ...colors, withAddresses: undefined });
    } else if (type === 'recent') {
      this.recentFilter.set(false);
      this.activeFilterColors.set({ ...colors, recent: undefined });
    }
    this.currentPage.set(1);
  }

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
