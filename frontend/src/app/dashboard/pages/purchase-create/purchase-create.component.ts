import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DeepLinkService } from '../../../core/services/deep-link.service';
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
import { PurchaseSupplierSelectorComponent } from './components/purchase-supplier-selector.component';

/**
 * Purchase Create Component
 *
 * Orchestrates purchase creation using composable child components.
 * Reuses existing PurchaseService draft infrastructure with caching.
 *
 * ARCHITECTURE:
 * - Thin orchestration layer
 * - Composable child components for each concern
 * - Draft caching handled by PurchaseService
 */
@Component({
  selector: 'app-purchase-create',
  imports: [
    CommonModule,
    PurchaseSupplierSelectorComponent,
    PurchaseFormFieldsComponent,
    PurchaseLineItemFormComponent,
    PurchaseLineItemsTableComponent,
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
          <h1 class="text-lg font-semibold">Create Purchase</h1>
          <div class="w-10"></div>
        </div>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        <!-- Error Message -->
        @if (error()) {
          <div class="alert alert-error">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span>{{ error() }}</span>
            <button (click)="clearError()" class="btn btn-ghost btn-sm">×</button>
          </div>
        }

        <!-- Success Message -->
        @if (showSuccessMessage()) {
          <div class="alert alert-success">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span>Purchase recorded successfully!</span>
          </div>
        }

        @if (purchaseDraft(); as draft) {
          <div class="card bg-base-100 shadow">
            <div class="card-body space-y-4">
              <!-- Supplier Selection -->
              <app-purchase-supplier-selector
                [suppliers]="suppliers()"
                [selectedSupplierId]="draft.supplierId"
                (supplierChange)="updateDraftField('supplierId', $event)"
              />

              <!-- Purchase Form Fields -->
              <app-purchase-form-fields [draft]="draft" (fieldChange)="onFieldChange($event)" />

              <!-- Line Items Section -->
              <div class="form-control">
                <label class="label">
                  <span class="label-text font-semibold">📦 Items *</span>
                </label>

                <!-- Add New Line Item Form -->
                <app-purchase-line-item-form
                  [stockLocations]="stockLocations()"
                  [productSearchTerm]="productSearchTerm()"
                  [productSearchResults]="productSearchResults()"
                  [lineItem]="newLineItem()"
                  (productSearch)="handleProductSearch($event)"
                  (productSelect)="handleProductSelect($event)"
                  (lineItemFieldChange)="updateNewLineItem($event.field, $event.value)"
                  (addItem)="handleAddLineItem()"
                />

                <!-- Line Items Table -->
                <app-purchase-line-items-table
                  [lineItems]="draft.lines"
                  [stockLocations]="stockLocations()"
                  [totalCost]="totalCost()"
                  (lineItemUpdate)="updateLineItem($event.index, $event.field, $event.value)"
                  (lineItemRemove)="removeLineItem($event)"
                />
              </div>

              <!-- Submit Button -->
              <div class="card-actions justify-end pt-4">
                <button
                  class="btn btn-primary"
                  [disabled]="!draft.supplierId || draft.lines.length === 0 || isLoading()"
                  (click)="handleSubmitPurchase()"
                >
                  @if (isLoading()) {
                    <span class="loading loading-spinner loading-xs"></span>
                  }
                  💾 Record Purchase
                </button>
              </div>
            </div>
          </div>
        }
      </div>
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

  // New line item form
  readonly newLineItem = signal<Partial<PurchaseLineItem>>({
    variantId: '',
    quantity: 0,
    unitCost: 0,
    stockLocationId: '',
  });

  async ngOnInit(): Promise<void> {
    // Initialize draft (loads from cache if exists)
    this.purchaseService.initializeDraft();
    // Load suppliers and stock locations
    this.supplierService.fetchSuppliers({ take: 100, skip: 0 });
    this.stockLocationService.fetchStockLocations();

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

  /**
   * Product search for line items
   */
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

  /**
   * Add line item to draft
   */
  handleAddLineItem(): void {
    const item = this.newLineItem();
    if (!item.variantId || !item.stockLocationId || !item.quantity || !item.unitCost) {
      return;
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

  /**
   * Remove line item
   */
  removeLineItem(index: number): void {
    this.purchaseService.removePurchaseItemLocal(index);
  }

  /**
   * Update line item
   */
  updateLineItem(index: number, field: keyof PurchaseLineItem, value: any): void {
    this.purchaseService.updatePurchaseItemLocal(index, { [field]: value });
  }

  /**
   * Update draft field
   */
  onFieldChange(event: { field: keyof PurchaseDraft; value: any }): void {
    this.purchaseService.updateDraftField(event.field, event.value);
  }

  /**
   * Update draft field (for supplier selector)
   */
  updateDraftField(field: keyof PurchaseDraft, value: any): void {
    this.purchaseService.updateDraftField(field, value);
  }

  /**
   * Update new line item field
   */
  updateNewLineItem(field: keyof PurchaseLineItem, value: any): void {
    const current = this.newLineItem();
    this.newLineItem.set({
      ...current,
      [field]: value,
    });
  }

  /**
   * Submit purchase
   */
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

  /**
   * Clear error state
   */
  clearError(): void {
    this.purchaseService.clearError();
  }

  /**
   * Navigate back
   */
  goBack(): void {
    this.router.navigate(['/dashboard/purchases']);
  }

  /**
   * Handle pre-population from variant ID (deep linking)
   * Fetches variant data and adds it to the purchase draft
   */
  private async handlePrepopulationFromVariantId(variantId: string): Promise<void> {
    try {
      // Fetch variant data
      const variant = await this.productSearchService.getVariantById(variantId);

      if (!variant) {
        console.warn(`Variant ${variantId} not found`);
        // Optionally show error to user
        return;
      }

      // Get default stock location
      const defaultLocation = this.stockLocations()[0];
      if (!defaultLocation) {
        console.warn('No stock locations available');
        return;
      }

      // Create line item with variant data
      const lineItem: PurchaseLineItem = {
        variantId: variant.id,
        variant: variant,
        quantity: 1, // Default quantity
        unitCost: 0, // User needs to enter this
        stockLocationId: defaultLocation.id,
      };

      // Prepopulate the draft with the line item
      this.purchaseService.prepopulateItems([lineItem]);
    } catch (error) {
      console.error('Failed to pre-populate from variant ID:', error);
      // Optionally show error to user
    }
  }
}
