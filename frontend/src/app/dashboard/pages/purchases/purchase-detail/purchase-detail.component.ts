import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { PrintService } from '../../../../core/services/print.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import type { PurchaseData } from '../../../../core/services/print-templates';
import { PurchaseDetailHeaderComponent } from './components/purchase-detail-header.component';
import { PurchaseSupplierInfoComponent } from './components/purchase-supplier-info.component';
import { PurchaseItemsTableComponent } from './components/purchase-items-table.component';
import { PurchaseTotalsComponent } from './components/purchase-totals.component';
import { PurchasePaymentInfoComponent } from './components/purchase-payment-info.component';

/**
 * Purchase Detail Component (Container)
 *
 * Orchestrates data fetching and composes presentational components.
 * Works in multiple contexts:
 * - Full-page mode: Standalone page with navigation
 * - Modal mode: Embedded in modal dialog
 *
 * Usage:
 * - As page: <app-purchase-detail></app-purchase-detail> (uses route params)
 * - As modal: <app-purchase-detail [purchaseId]="id" [modalMode]="true" (closed)="handleClose()"></app-purchase-detail>
 */
@Component({
  selector: 'app-purchase-detail',
  imports: [
    CommonModule,
    RouterModule,
    PurchaseDetailHeaderComponent,
    PurchaseSupplierInfoComponent,
    PurchaseItemsTableComponent,
    PurchaseTotalsComponent,
    PurchasePaymentInfoComponent,
  ],
  templateUrl: './purchase-detail.component.html',
  styleUrl: './purchase-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseDetailComponent implements OnInit, AfterViewInit {
  private readonly purchaseService = inject(PurchaseService);
  private readonly printService = inject(PrintService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly currencyService = inject(CurrencyService);

  // Inputs for composable usage
  readonly purchaseId = input<string | null>(null);
  readonly modalMode = input<boolean>(false);
  readonly showHeader = input<boolean>(true);

  // Outputs
  readonly closed = output<void>();

  // State
  readonly purchase = signal<any | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly modalId = signal<string>(
    `purchase-detail-modal-${Math.random().toString(36).substring(2, 9)}`,
  );
  private readonly modalElement = viewChild<ElementRef<HTMLDialogElement>>('modalDialog');

  // Convert route query params to signal
  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} });
  private readonly routeParams = toSignal(this.route.paramMap);

  // Computed values
  readonly supplierName = computed(() => {
    const purchase = this.purchase();
    if (!purchase?.supplier) return 'Unknown Supplier';
    const supplier = purchase.supplier;
    return (
      `${supplier.firstName || ''} ${supplier.lastName || ''}`.trim() ||
      supplier.emailAddress ||
      'Unknown Supplier'
    );
  });

  readonly totalCost = computed(() => {
    const purchase = this.purchase();
    return purchase?.totalCost || 0;
  });

  readonly referenceNumber = computed(() => {
    const purchase = this.purchase();
    return purchase?.referenceNumber || null;
  });

  readonly paymentStatus = computed(() => {
    const purchase = this.purchase();
    return purchase?.paymentStatus || 'Unknown';
  });

  readonly purchaseDate = computed(() => {
    const purchase = this.purchase();
    return purchase?.purchaseDate || null;
  });

  readonly lines = computed(() => {
    const purchase = this.purchase();
    return purchase?.lines || [];
  });

  readonly notes = computed(() => {
    const purchase = this.purchase();
    return purchase?.notes || null;
  });

  readonly isCreditPurchase = computed(() => {
    const purchase = this.purchase();
    return purchase?.isCreditPurchase || false;
  });

  readonly isDraftPurchase = computed(() => {
    const p = this.purchase();
    return p && (p.status === 'draft' || (p as any).status === 'Draft');
  });

  constructor() {
    // Watch for purchaseId input changes (modal mode)
    effect(() => {
      const inputPurchaseId = this.purchaseId();
      if (inputPurchaseId) {
        this.fetchPurchase(inputPurchaseId);
      }
    });

    // Watch for route params (page mode)
    effect(() => {
      if (this.modalMode()) return;
      const params = this.routeParams();
      const id = params?.get('id');
      if (id) {
        this.fetchPurchase(id);
      }
    });

    // Handle modal open/close (modal mode only)
    effect(() => {
      if (!this.modalMode()) return;
      const inputPurchaseId = this.purchaseId();
      const modal = this.modalElement()?.nativeElement;

      if (inputPurchaseId && modal) {
        // Use setTimeout to ensure modal is rendered
        setTimeout(() => {
          if (modal && !modal.open) {
            modal.showModal();
          }
        }, 0);
      } else if (!inputPurchaseId && modal) {
        modal.close();
      }
    });
  }

  ngOnInit(): void {
    // If in page mode and no purchaseId input, get from route
    if (!this.modalMode() && !this.purchaseId()) {
      const params = this.routeParams();
      const id = params?.get('id');
      if (id) {
        this.fetchPurchase(id);
      }
    }
  }

  ngAfterViewInit(): void {
    // Ensure modal opens if purchaseId is already set
    if (this.modalMode() && this.purchaseId()) {
      const modal = this.modalElement()?.nativeElement;
      if (modal) {
        setTimeout(() => {
          if (modal && !modal.open) {
            modal.showModal();
          }
        }, 0);
      }
    }
  }

  async fetchPurchase(id: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const purchases = this.purchaseService.purchases();
      const foundPurchase = purchases.find((p) => p.id === id);
      if (foundPurchase) {
        this.purchase.set(foundPurchase);
      } else {
        const fetched = await this.purchaseService.fetchPurchaseById(id);
        this.purchase.set(fetched ?? null);
        if (!fetched) {
          this.error.set('Purchase not found.');
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch purchase:', error);
      this.error.set(error.message || 'Failed to fetch purchase');
      this.purchase.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  readonly isConfirming = signal(false);
  readonly confirmError = signal<string | null>(null);

  async handleConfirmPurchase(): Promise<void> {
    const p = this.purchase();
    if (!p?.id) return;

    this.isConfirming.set(true);
    this.confirmError.set(null);
    try {
      await this.purchaseService.confirmPurchase(p.id);
      await this.fetchPurchase(p.id);
    } catch (error: any) {
      this.confirmError.set(error?.message || 'Failed to confirm purchase');
    } finally {
      this.isConfirming.set(false);
    }
  }

  async handlePrintPurchase(): Promise<void> {
    const p = this.purchase();
    if (!p) return;

    const purchaseData: PurchaseData = {
      id: p.id,
      supplierId: p.supplierId,
      purchaseDate: p.purchaseDate,
      referenceNumber: p.referenceNumber,
      totalCost: p.totalCost,
      paymentStatus: p.paymentStatus ?? 'pending',
      notes: p.notes,
      status: p.status ?? 'draft',
      supplier: p.supplier,
      lines: (p.lines || []).map((line: any) => ({
        id: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        totalCost: line.totalCost,
        variant: line.variant,
      })),
    };
    await this.printService.printPurchase(purchaseData, {
      documentType: 'purchase-order',
    });
  }

  close(): void {
    if (this.modalMode()) {
      const modal = this.modalElement();
      if (modal) {
        const dialog = modal.nativeElement;
        if (dialog && dialog.open) {
          dialog.close();
        }
      }
    }
    this.closed.emit();
  }

  goBack(): void {
    this.router.navigate(['/dashboard/purchases']);
  }
}
