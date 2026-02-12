import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApprovalService } from '../../../core/services/approval.service';
import { DeepLinkService } from '../../../core/services/deep-link.service';
import { LedgerService } from '../../../core/services/ledger/ledger.service';
import {
  ProductSearchResult,
  ProductSearchService,
  ProductVariant,
} from '../../../core/services/product/product-search.service';
import { PurchaseService } from '../../../core/services/purchase.service';
import { PurchaseDraft, PurchaseLineItem } from '../../../core/services/purchase.service.types';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { ProductSearchViewComponent } from '../shared/components/product-search-view.component';
import { RejectionBannerComponent } from '../shared/components/rejection-banner.component';
import { ApprovableFormBase } from '../shared/directives/approvable-form-base.directive';
import { PurchaseLineItemFormComponent } from './components/purchase-line-item-form.component';
import { PurchaseLineItemsTableComponent } from './components/purchase-line-items-table.component';
import { PurchasePaymentSectionComponent } from './components/purchase-payment-section.component';
import { PurchaseVariantPickerModalComponent } from './components/purchase-variant-picker-modal.component';

@Component({
  selector: 'app-purchase-create',
  imports: [
    CommonModule,
    ProductSearchViewComponent,
    PurchaseLineItemFormComponent,
    PurchaseLineItemsTableComponent,
    PurchasePaymentSectionComponent,
    PurchaseVariantPickerModalComponent,
    RejectionBannerComponent,
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
      <div class="p-4 pb-28 space-y-4">
        <!-- Rejection banner (from rejected approval) -->
        <app-rejection-banner [message]="rejectionMessage()" (dismiss)="dismissRejection()" />

        <!-- Approval success banner -->
        @if (approvalStatus() === 'approved') {
          <div class="alert alert-success text-sm mb-4">
            <span>Overdraft approved. You may proceed with the purchase.</span>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="alert alert-error text-sm">
            <span>{{ error() }}</span>
            <button (click)="clearError()" class="btn btn-ghost btn-xs">Dismiss</button>
          </div>
        }

        <!-- Overdraft confirmation -->
        @if (showOverdraftConfirm()) {
          <div class="alert alert-warning text-sm">
            <div class="flex-1">
              <p class="font-semibold">Insufficient account balance</p>
              <p>Would you like to request overdraft approval to proceed?</p>
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-warning btn-sm"
                (click)="requestOverdraftApproval()"
                [disabled]="isRequestingApproval()"
              >
                @if (isRequestingApproval()) {
                  <span class="loading loading-spinner loading-xs"></span>
                }
                Request Approval
              </button>
              <button class="btn btn-ghost btn-sm" (click)="cancelOverdraftRequest()">
                Cancel
              </button>
            </div>
          </div>
        }

        <!-- Approval requested success -->
        @if (showApprovalRequestedMessage()) {
          <div class="alert alert-info text-sm">
            <span>Overdraft approval requested. You'll be notified when it's reviewed.</span>
          </div>
        }

        <!-- Success -->
        @if (showSuccessMessage()) {
          <div class="alert alert-success text-sm">
            <span>Purchase recorded successfully!</span>
          </div>
        }

        @if (purchaseDraft(); as draft) {
          <!-- Supplier + Date + Reference (inline) -->
          <div class="space-y-2">
            <select
              class="select select-bordered select-sm w-full"
              [value]="draft.supplierId || ''"
              (change)="updateDraftField('supplierId', $any($event.target).value || null)"
            >
              <option value="">Select supplier...</option>
              @for (supplier of suppliers(); track supplier.id) {
                <option [value]="supplier.id">
                  {{ supplier.firstName }} {{ supplier.lastName }}
                  @if (supplier.emailAddress) {
                    ({{ supplier.emailAddress }})
                  }
                </option>
              }
            </select>
            <div class="grid grid-cols-2 gap-2">
              <input
                type="date"
                class="input input-bordered input-sm"
                [value]="formatDateForInput(draft.purchaseDate)"
                (change)="
                  updateDraftField('purchaseDate', parseDateInput($any($event.target).value))
                "
              />
              <input
                type="text"
                class="input input-bordered input-sm"
                placeholder="Invoice / reference"
                [value]="draft.referenceNumber"
                (input)="updateDraftField('referenceNumber', $any($event.target).value)"
              />
            </div>
          </div>

          <!-- Items -->
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">
              Items
              @if (draft.lines.length > 0) {
                <span class="badge badge-xs badge-primary ml-1">{{ draft.lines.length }}</span>
              }
            </div>
            <app-product-search-view
              [searchResults]="productSearchResults()"
              [isSearching]="isSearchingProducts()"
              [placeholder]="'Search product by name or SKU...'"
              [compact]="true"
              (searchTermChange)="handleProductSearch($event)"
              (productSelected)="onProductSelectedFromSearch($event)"
            />
            <app-purchase-line-item-form
              [lineItem]="newLineItem()"
              (lineItemFieldChange)="updateNewLineItem($event.field, $event.value)"
              (addItem)="handleAddLineItem()"
            />
            <div class="mt-2">
              <app-purchase-line-items-table
                [lineItems]="draft.lines"
                (lineItemUpdate)="updateLineItem($event.index, $event.field, $event.value)"
                (lineItemRemove)="removeLineItem($event)"
              />
            </div>
          </div>

          <!-- Notes -->
          <textarea
            class="textarea textarea-bordered textarea-sm w-full"
            rows="2"
            placeholder="Notes (optional)"
            [value]="draft.notes"
            (input)="updateDraftField('notes', $any($event.target).value)"
          ></textarea>

          <!-- Payment -->
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-2">
              Payment
            </div>
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
        }
      </div>

      <!-- Sticky Footer -->
      @if (purchaseDraft(); as draft) {
        <div
          class="fixed bottom-0 left-0 right-0 bg-base-100 border-t border-base-300 px-4 py-3 z-10"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-base-content/70">
              {{ draft.lines.length }} item{{ draft.lines.length !== 1 ? 's' : '' }}
            </span>
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

      <!-- Variant picker modal (scrollable list when many variants) -->
      <app-purchase-variant-picker-modal
        [isOpen]="showVariantPickerModal()"
        [variants]="variantPickerProduct()?.variants ?? []"
        [searchTerm]="productSearchTerm()"
        (variantSelected)="onVariantSelectedFromModal($event)"
        (close)="closeVariantPickerModal()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateComponent extends ApprovableFormBase implements OnInit, AfterViewInit {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly deepLinkService = inject(DeepLinkService);
  private readonly approvalServiceLocal = inject(ApprovalService);
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
  readonly productSearchResults = signal<ProductSearchResult[]>([]);
  readonly variantPickerProduct = signal<ProductSearchResult | null>(null);
  readonly isSearchingProducts = signal<boolean>(false);
  readonly showSuccessMessage = signal<boolean>(false);
  readonly eligibleAccounts = signal<{ code: string; name: string }[]>([]);
  readonly showVariantPickerModal = signal<boolean>(false);

  // Overdraft approval UI state
  readonly showOverdraftConfirm = signal<boolean>(false);
  readonly isRequestingApproval = signal<boolean>(false);
  readonly showApprovalRequestedMessage = signal<boolean>(false);

  // New line item form
  readonly newLineItem = signal<Partial<PurchaseLineItem>>({
    variantId: '',
    quantity: 0,
    unitCost: 0,
    stockLocationId: '',
  });

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
  }

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
    await this.deepLinkService.processQueryParams(this.activatedRoute, {
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
      this.productSearchResults.set(results);
    } catch (error) {
      console.error('Product search failed:', error);
      this.productSearchResults.set([]);
    } finally {
      this.isSearchingProducts.set(false);
    }
  }

  handleProductSelect(variant: ProductVariant): void {
    const defaultLocation = this.stockLocations()[0];
    const unitCost =
      variant.customFields?.wholesalePrice != null ? variant.customFields.wholesalePrice / 100 : 0;
    this.newLineItem.set({
      variantId: variant.id,
      variant: variant,
      quantity: 1,
      unitCost,
      stockLocationId: defaultLocation?.id || '',
    });
    this.clearProductSearch();
  }

  onProductSelectedFromSearch(product: ProductSearchResult): void {
    const variants = product.variants ?? [];
    if (variants.length === 0) return;
    if (variants.length === 1) {
      this.handleProductSelect(variants[0]);
      return;
    }
    this.variantPickerProduct.set(product);
    this.showVariantPickerModal.set(true);
  }

  onVariantSelectedFromModal(variant: ProductVariant): void {
    this.handleProductSelect(variant);
    this.closeVariantPickerModal();
  }

  closeVariantPickerModal(): void {
    this.showVariantPickerModal.set(false);
    this.variantPickerProduct.set(null);
    this.clearProductSearch();
  }

  private clearProductSearch(): void {
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
    // If we have a valid approval, set it on the draft before submitting
    if (this.approvalId() && this.approvalStatus() === 'approved') {
      this.purchaseService.updateDraftField('approvalId', this.approvalId()!);
    }

    try {
      await this.purchaseService.submitPurchase();
      this.showSuccessMessage.set(true);
      setTimeout(() => {
        this.showSuccessMessage.set(false);
        this.router.navigate(['/dashboard/purchases']);
      }, 2000);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('Insufficient balance')) {
        // Show overdraft confirmation instead of raw error
        this.purchaseService.clearError();
        this.showOverdraftConfirm.set(true);
      } else {
        console.error('Purchase submission failed:', error);
      }
    }
  }

  async requestOverdraftApproval(): Promise<void> {
    this.isRequestingApproval.set(true);
    try {
      const draft = this.purchaseDraft();
      if (!draft) return;

      await this.approvalServiceLocal.createApprovalRequest({
        type: 'overdraft',
        metadata: {
          formState: this.serializeFormState(),
          accountCode: draft.paymentAccountCode || 'CASH_ON_HAND',
          requiredAmount:
            draft.paymentAmount != null
              ? Math.round(draft.paymentAmount * 100)
              : Math.round(this.totalCost() * 100),
        },
        entityType: 'purchase',
      });

      this.showOverdraftConfirm.set(false);
      this.showApprovalRequestedMessage.set(true);
      setTimeout(() => this.showApprovalRequestedMessage.set(false), 5000);
    } catch (err: any) {
      this.purchaseService.clearError();
      this.purchaseService.updateDraftField('notes', this.purchaseDraft()?.notes || '');
      console.error('Failed to create approval request:', err);
    } finally {
      this.isRequestingApproval.set(false);
    }
  }

  cancelOverdraftRequest(): void {
    this.showOverdraftConfirm.set(false);
  }

  clearError(): void {
    this.purchaseService.clearError();
    this.showOverdraftConfirm.set(false);
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

  formatDateForInput(date: Date): string {
    return new Date(date).toISOString().split('T')[0];
  }

  parseDateInput(dateString: string): Date {
    return new Date(dateString);
  }

  // ApprovableFormBase overrides
  override isValid(): boolean {
    const draft = this.purchaseDraft();
    return !!draft && this.canSubmit(draft);
  }

  override serializeFormState(): Record<string, any> {
    const draft = this.purchaseDraft();
    if (!draft) return {};
    return {
      supplierId: draft.supplierId,
      purchaseDate: draft.purchaseDate.toISOString(),
      referenceNumber: draft.referenceNumber,
      paymentStatus: draft.paymentStatus,
      notes: draft.notes,
      paymentAmount: draft.paymentAmount,
      paymentAccountCode: draft.paymentAccountCode,
      paymentReference: draft.paymentReference,
      lines: draft.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitCost: l.unitCost,
        stockLocationId: l.stockLocationId,
      })),
    };
  }

  override restoreFormState(data: Record<string, any>): void {
    if (!data) return;
    this.purchaseService.initializeDraft();

    if (data['supplierId']) this.purchaseService.updateDraftField('supplierId', data['supplierId']);
    if (data['purchaseDate'])
      this.purchaseService.updateDraftField('purchaseDate', new Date(data['purchaseDate']));
    if (data['referenceNumber'])
      this.purchaseService.updateDraftField('referenceNumber', data['referenceNumber']);
    if (data['paymentStatus'])
      this.purchaseService.updateDraftField('paymentStatus', data['paymentStatus']);
    if (data['notes']) this.purchaseService.updateDraftField('notes', data['notes']);
    if (data['paymentAmount'] != null)
      this.purchaseService.updateDraftField('paymentAmount', data['paymentAmount']);
    if (data['paymentAccountCode'])
      this.purchaseService.updateDraftField('paymentAccountCode', data['paymentAccountCode']);
    if (data['paymentReference'])
      this.purchaseService.updateDraftField('paymentReference', data['paymentReference']);

    if (Array.isArray(data['lines'])) {
      for (const line of data['lines']) {
        this.purchaseService.addPurchaseItemLocal(line as PurchaseLineItem);
      }
    }
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
