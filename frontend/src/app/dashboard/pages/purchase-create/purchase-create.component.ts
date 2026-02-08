import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DeepLinkService } from '../../../core/services/deep-link.service';
import { LedgerService } from '../../../core/services/ledger/ledger.service';
import {
  ProductSearchService,
  ProductVariant,
} from '../../../core/services/product/product-search.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { PurchaseDraft, PurchaseLineItem } from '../../../core/services/purchase.service.types';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { PurchaseFormFieldsComponent } from './components/purchase-form-fields.component';
import { PurchaseLineItemFormComponent } from './components/purchase-line-item-form.component';
import { PurchaseLineItemsTableComponent } from './components/purchase-line-items-table.component';
import { PurchasePaymentSectionComponent } from './components/purchase-payment-section.component';
import { PurchaseSupplierSelectorComponent } from './components/purchase-supplier-selector.component';

@Component({
  selector: 'app-purchase-create',
  imports: [
    CommonModule,
    PurchaseSupplierSelectorComponent,
    PurchaseFormFieldsComponent,
    PurchaseLineItemFormComponent,
    PurchaseLineItemsTableComponent,
    PurchasePaymentSectionComponent,
  ],
  template: `
    <div class="min-h-screen bg-base-100">
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-base-100 border-b border-base-200 px-4 py-3">
        <div class="flex items-center justify-between">
          <button (click)="goBack()" class="btn btn-ghost btn-sm btn-circle" aria-label="Go back">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              ></path>
            </svg>
          </button>
          <h1 class="text-lg font-semibold">Record Purchase</h1>
          <div class="w-10"></div>
        </div>
      </div>

      <!-- Content -->
      <div class="p-4 pb-28 space-y-3">
        <!-- Error Message -->
        @if (error()) {
          <div class="alert alert-error text-sm">
            <span>{{ error() }}</span>
            <button (click)="clearError()" class="btn btn-ghost btn-xs">Dismiss</button>
          </div>
        }

        <!-- Success Message -->
        @if (showSuccessMessage()) {
          <div class="alert alert-success text-sm">
            <span>Purchase recorded successfully!</span>
          </div>
        }

        @if (purchaseDraft(); as draft) {
          <!-- Section 1: Supplier -->
          <div class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
            <input type="checkbox" checked />
            <div class="collapse-title text-sm font-semibold py-2 min-h-0">Supplier</div>
            <div class="collapse-content px-4 pb-3">
              <app-purchase-supplier-selector
                [suppliers]="suppliers()"
                [selectedSupplierId]="draft.supplierId"
                (supplierChange)="updateDraftField('supplierId', $event)"
              />
            </div>
          </div>

          <!-- Section 2: Purchase Details -->
          <div class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
            <input type="checkbox" checked />
            <div class="collapse-title text-sm font-semibold py-2 min-h-0">Purchase Details</div>
            <div class="collapse-content px-4 pb-3">
              <app-purchase-form-fields [draft]="draft" (fieldChange)="onFieldChange($event)" />
            </div>
          </div>

          <!-- Section 3: Items -->
          <div class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
            <input type="checkbox" checked />
            <div class="collapse-title text-sm font-semibold py-2 min-h-0">
              Items
              @if (draft.lines.length > 0) {
                <span class="badge badge-sm badge-primary ml-2">{{ draft.lines.length }}</span>
              }
            </div>
            <div class="collapse-content px-4 pb-3">
              <!-- Add New Line Item Form -->
              <app-purchase-line-item-form
                [productSearchTerm]="productSearchTerm()"
                [productSearchResults]="productSearchResults()"
                [lineItem]="newLineItem()"
                (productSearch)="handleProductSearch($event)"
                (productSelect)="handleProductSelect($event)"
                (lineItemFieldChange)="updateNewLineItem($event.field, $event.value)"
                (addItem)="handleAddLineItem()"
              />

              <!-- Line Items -->
              <div class="mt-3">
                <app-purchase-line-items-table
                  [lineItems]="draft.lines"
                  [totalCost]="totalCost()"
                  (lineItemUpdate)="updateLineItem($event.index, $event.field, $event.value)"
                  (lineItemRemove)="removeLineItem($event)"
                />
              </div>
            </div>
          </div>

          <!-- Section 4: Payment -->
          <div class="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
            <input type="checkbox" checked />
            <div class="collapse-title text-sm font-semibold py-2 min-h-0">Payment</div>
            <div class="collapse-content px-4 pb-3">
              <app-purchase-payment-section
                [paymentStatus]="draft.paymentStatus"
                [paymentAmount]="draft.paymentAmount"
                [paymentAccountCode]="draft.paymentAccountCode"
                [paymentReference]="draft.paymentReference"
                [eligibleAccounts]="eligibleAccounts()"
                [totalCost]="totalCost()"
                (fieldChange)="onFieldChange($event)"
              />
            </div>
          </div>
        }
      </div>

      <!-- Sticky Submit Footer -->
      @if (purchaseDraft(); as draft) {
        <div
          class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 px-4 py-3 z-10"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold">Total</span>
            <span class="text-lg font-bold">{{ formatCurrency(totalCost()) }}</span>
          </div>
          <button
            class="btn btn-primary w-full"
            [disabled]="!canSubmit(draft)"
            (click)="handleSubmitPurchase()"
          >
            @if (isLoading()) {
              <span class="loading loading-spinner loading-xs"></span>
            }
            Record Purchase
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly deepLinkService = inject(DeepLinkService);
  readonly purchaseService = inject(PurchaseService);
  readonly supplierService = inject(SupplierService);
  readonly productSearchService = inject(ProductSearchService);
  readonly stockLocationService = inject(StockLocationService);
  private readonly ledgerService = inject(LedgerService);

  // Service signals
  readonly purchaseDraft = this.purchaseService.purchaseDraft;
  readonly isLoading = this.purchaseService.isLoading;
  readonly error = this.purchaseService.error;
  readonly totalCost = this.purchaseService.totalCost;
  readonly suppliers = this.supplierService.suppliers;
  readonly stockLocations = this.stockLocationService.locations;

  // Local UI state
  readonly productSearchTerm = signal<string>('');
  readonly productSearchResults = signal<ProductVariant[]>([]);
  readonly isSearchingProducts = signal<boolean>(false);
  readonly showSuccessMessage = signal<boolean>(false);
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);

  // New line item form
  readonly newLineItem = signal<Partial<PurchaseLineItem>>({
    variantId: '',
    quantity: 0,
    unitCost: 0,
    stockLocationId: '',
  });

  async ngOnInit(): Promise<void> {
    this.purchaseService.initializeDraft();
    this.supplierService.fetchSuppliers({ take: 100, skip: 0 });
    this.stockLocationService.fetchStockLocations();

    // Load eligible debit accounts for payment source dropdown
    try {
      const accounts = await firstValueFrom(this.ledgerService.loadEligibleDebitAccounts());
      this.eligibleAccounts.set(accounts.map((a) => ({ code: a.code, name: a.name })));
    } catch {
      this.eligibleAccounts.set([]);
    }

    // Handle deep linking for variant pre-population
    await this.deepLinkService.processQueryParams(this.route, {
      params: {
        variantId: { type: 'string', required: false },
      },
      handler: async (params) => {
        if (params.variantId && typeof params.variantId === 'string') {
          await this.handlePrepopulationFromVariantId(params.variantId);
        }
      },
      clearAfterProcess: true,
      strategy: 'immediate',
    });
  }

  async handleProductSearch(term: string): Promise<void> {
    this.productSearchTerm.set(term);
    const trimmed = term.trim();

    if (trimmed.length < 2) {
      this.productSearchResults.set([]);
      return;
    }

    this.isSearchingProducts.set(true);
    try {
      const results = await this.productSearchService.searchProducts(trimmed);
      const variants = results.flatMap((r: any) => r.variants || []);
      this.productSearchResults.set(variants);
    } catch (error) {
      console.error('Product search failed:', error);
      this.productSearchResults.set([]);
    } finally {
      this.isSearchingProducts.set(false);
    }
  }

  handleProductSelect(variant: ProductVariant): void {
    const defaultLocation = this.stockLocations()[0];
    this.newLineItem.set({
      variantId: variant.id,
      variant: variant,
      quantity: 0,
      unitCost: 0,
      stockLocationId: defaultLocation?.id || '',
    });
    this.productSearchTerm.set('');
    this.productSearchResults.set([]);
  }

  handleAddLineItem(): void {
    const item = this.newLineItem();
    if (!item.variantId || !item.quantity || !item.unitCost) {
      return;
    }

    // Auto-set stock location if not set
    if (!item.stockLocationId) {
      const defaultLocation = this.stockLocations()[0];
      if (!defaultLocation) return;
      item.stockLocationId = defaultLocation.id;
    }

    try {
      this.purchaseService.addPurchaseItemLocal(item as PurchaseLineItem);
      this.newLineItem.set({
        variantId: '',
        quantity: 0,
        unitCost: 0,
        stockLocationId: '',
      });
    } catch (error: any) {
      console.error('Failed to add item:', error);
    }
  }

  removeLineItem(index: number): void {
    this.purchaseService.removePurchaseItemLocal(index);
  }

  updateLineItem(index: number, field: keyof PurchaseLineItem, value: any): void {
    this.purchaseService.updatePurchaseItemLocal(index, { [field]: value });
  }

  onFieldChange(event: { field: keyof PurchaseDraft; value: any }): void {
    this.purchaseService.updateDraftField(event.field, event.value);
  }

  updateDraftField(field: keyof PurchaseDraft, value: any): void {
    this.purchaseService.updateDraftField(field, value);
  }

  updateNewLineItem(field: keyof PurchaseLineItem, value: any): void {
    const current = this.newLineItem();
    this.newLineItem.set({
      ...current,
      [field]: value,
    });
  }

  canSubmit(draft: PurchaseDraft): boolean {
    return !!(draft.supplierId && draft.lines.length > 0 && !this.isLoading());
  }

  async handleSubmitPurchase(): Promise<void> {
    try {
      await this.purchaseService.submitPurchase();
      this.showSuccessMessage.set(true);
      setTimeout(() => {
        this.showSuccessMessage.set(false);
        this.router.navigate(['/dashboard/purchases']);
      }, 2000);
    } catch (error: any) {
      console.error('Purchase submission failed:', error);
    }
  }

  clearError(): void {
    this.purchaseService.clearError();
  }

  goBack(): void {
    this.router.navigate(['/dashboard/purchases']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  private async handlePrepopulationFromVariantId(variantId: string): Promise<void> {
    try {
      const variant = await this.productSearchService.getVariantById(variantId);

      if (!variant) {
        console.warn(`Variant ${variantId} not found`);
        return;
      }

      const defaultLocation = this.stockLocations()[0];
      if (!defaultLocation) {
        console.warn('No stock locations available');
        return;
      }

      const lineItem: PurchaseLineItem = {
        variantId: variant.id,
        variant: variant,
        quantity: 1,
        unitCost: 0,
        stockLocationId: defaultLocation.id,
      };

      this.purchaseService.prepopulateItems([lineItem]);
    } catch (error) {
      console.error('Failed to pre-populate from variant ID:', error);
    }
  }
}
