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
import { PurchaseService } from '../../../core/services/purchase.service';
import { calculatePurchaseStats } from '../../../core/services/stats/purchase-stats.util';
import { PaginationComponent } from '../../components/shared/pagination.component';
import { PurchaseCardComponent } from './components/purchase-card.component';
import { PurchaseSearchBarComponent } from './components/purchase-search-bar.component';
import { PurchaseStats, PurchaseStatsComponent } from './components/purchase-stats.component';
import {
  PayPurchaseModalComponent,
  PayPurchaseModalData,
} from './components/pay-purchase-modal.component';
import {
  PurchaseAction,
  PurchaseTableRowComponent,
} from './components/purchase-table-row.component';
import { PurchaseDetailComponent } from './purchase-detail/purchase-detail.component';

/**
 * Purchases list page
 *
 * ARCHITECTURE:
 * - Uses composable components for better maintainability
 * - Separates mobile (cards) and desktop (table) views
 * - Centralized action handling
 * - KISS principles applied
 */
@Component({
  selector: 'app-purchases',
  imports: [
    CommonModule,
    PurchaseStatsComponent,
    PurchaseSearchBarComponent,
    PurchaseCardComponent,
    PurchaseTableRowComponent,
    PayPurchaseModalComponent,
    PaginationComponent,
    PurchaseDetailComponent,
  ],
  templateUrl: './purchases.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesComponent implements OnInit {
  private readonly purchaseService = inject(PurchaseService);
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly queryParams = toSignal(this.route.queryParams, {
    initialValue: {} as Record<string, string>,
  });

  // State from service
  readonly purchases = this.purchaseService.purchases;
  readonly isLoading = this.purchaseService.isLoadingList;
  readonly error = this.purchaseService.errorList;
  readonly totalItems = this.purchaseService.totalItems;

  // Local UI state
  readonly searchQuery = signal('');
  readonly pendingPaymentsFilter = signal(false);
  readonly supplierIdFilter = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly pageOptions = [10, 25, 50, 100];
  readonly selectedPurchaseId = signal<string | null>(null);
  readonly selectedPurchaseForPayment = signal<PayPurchaseModalData | null>(null);
  private readonly purchaseDetailModal = viewChild(PurchaseDetailComponent);
  private readonly payPurchaseModal = viewChild(PayPurchaseModalComponent);

  /** Supplier name for badge when supplierIdFilter is set (from first matching purchase) */
  readonly supplierNameFilter = computed(() => {
    const sid = this.supplierIdFilter();
    if (!sid) return null;
    const purchase = this.purchases().find((p) => p.supplier?.id === sid);
    const supplier = purchase?.supplier;
    if (!supplier) return null;
    return (
      `${supplier.firstName ?? ''} ${supplier.lastName ?? ''}`.trim() ||
      supplier.emailAddress ||
      null
    );
  });

  // Computed: filtered purchases
  readonly filteredPurchases = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const pendingPayments = this.pendingPaymentsFilter();
    const supplierId = this.supplierIdFilter();
    let allPurchases = this.purchases();

    // Apply supplier filter from query param
    if (supplierId) {
      allPurchases = allPurchases.filter((p) => p.supplier?.id === supplierId);
    }

    // Apply pending payments filter (matches stats calculation: pending or partial)
    if (pendingPayments) {
      allPurchases = allPurchases.filter((purchase) => {
        const status = purchase.paymentStatus?.toLowerCase() || '';
        return status === 'pending' || status === 'partial';
      });
    }

    // Apply search query
    if (!query) return allPurchases;

    return allPurchases.filter((purchase) => {
      const supplier = purchase.supplier;
      const supplierName = supplier
        ? `${supplier.firstName} ${supplier.lastName}`.trim() || supplier.emailAddress || ''
        : '';
      const reference = purchase.referenceNumber || '';
      return supplierName.toLowerCase().includes(query) || reference.toLowerCase().includes(query);
    });
  });

  // Computed: paginated purchases
  readonly paginatedPurchases = computed(() => {
    const filtered = this.filteredPurchases();
    const page = this.currentPage();
    const perPage = this.itemsPerPage();
    const start = (page - 1) * perPage;
    const end = start + perPage;

    return filtered.slice(start, end);
  });

  // Computed: total pages
  readonly totalPages = computed(() => {
    const filtered = this.filteredPurchases();
    const perPage = this.itemsPerPage();
    return Math.ceil(filtered.length / perPage) || 1;
  });

  // Computed: statistics - using utility for single source of truth
  readonly stats = computed((): PurchaseStats => {
    return calculatePurchaseStats(this.purchases());
  });

  // Computed: end item for pagination display
  readonly endItem = computed(() => {
    return Math.min(this.currentPage() * this.itemsPerPage(), this.filteredPurchases().length);
  });

  constructor() {
    effect(() => {
      const payData = this.selectedPurchaseForPayment();
      const modal = this.payPurchaseModal();
      if (payData && modal) {
        setTimeout(() => modal.show(), 0);
      }
    });
    effect(() => {
      const params = this.queryParams();
      const supplierId = params['supplierId'] ?? null;
      if (supplierId) {
        this.supplierIdFilter.set(supplierId);
      } else {
        this.supplierIdFilter.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.loadPurchases();
  }

  async loadPurchases(): Promise<void> {
    await this.purchaseService.fetchPurchases({
      take: 100,
      skip: 0,
    });
  }

  async refreshPurchases(): Promise<void> {
    await this.loadPurchases();
  }

  /**
   * Handle purchase actions (view, edit, delete)
   */
  onPurchaseAction(event: { action: PurchaseAction; purchaseId: string }): void {
    const { action, purchaseId } = event;

    switch (action) {
      case 'view':
        this.selectedPurchaseId.set(purchaseId);
        break;

      case 'pay': {
        const purchase = this.purchases().find((p) => p.id === purchaseId);
        if (purchase) {
          const supplier = purchase.supplier;
          const supplierName = supplier
            ? `${supplier.firstName} ${supplier.lastName}`.trim() ||
              supplier.emailAddress ||
              'Unknown'
            : 'Unknown';
          this.selectedPurchaseForPayment.set({
            purchaseId: purchase.id,
            purchaseReference: purchase.referenceNumber || purchase.id,
            supplierName,
            totalCost: purchase.totalCost,
          });
        }
        break;
      }

      case 'edit':
        console.log('Edit purchase:', purchaseId);
        break;

      case 'delete':
        console.log('Delete purchase:', purchaseId);
        break;
    }
  }

  onPayPurchaseRecorded(): void {
    this.selectedPurchaseForPayment.set(null);
    this.loadPurchases();
  }

  onPayPurchaseCancelled(): void {
    this.selectedPurchaseForPayment.set(null);
  }

  /**
   * Handle purchase detail modal closed
   */
  onPurchaseDetailClosed(): void {
    this.selectedPurchaseId.set(null);
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
    this.purchaseService.clearListError();
  }

  /**
   * Track by function for ngFor performance
   */
  trackByPurchaseId(index: number, purchase: any): string {
    return purchase.id;
  }

  /**
   * Handle pending payments filter click from stats component
   */
  onPendingPaymentsStatsClick(): void {
    this.pendingPaymentsFilter.set(!this.pendingPaymentsFilter());
    this.currentPage.set(1);
  }

  /**
   * Clear pending payments filter
   */
  clearPendingPaymentsFilter(): void {
    this.pendingPaymentsFilter.set(false);
    this.currentPage.set(1);
  }

  /**
   * Clear supplier filter and remove from URL
   */
  clearSupplierFilter(): void {
    this.supplierIdFilter.set(null);
    this.currentPage.set(1);
    this.router.navigate(['/dashboard/purchases'], { queryParams: {} });
  }

  /**
   * Math utilities for template
   */
  readonly Math = Math;
}
