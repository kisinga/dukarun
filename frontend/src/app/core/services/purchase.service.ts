import { Injectable, computed, inject, signal } from '@angular/core';
import { PurchaseDraftService } from './draft/purchase-draft.service';
import { PurchaseValidationService } from './purchase/purchase-validation.service';
import { PurchaseApiService } from './purchase/purchase-api.service';
import {
  PurchaseDraft,
  PurchaseLineItem,
  PurchasePrepopulationData,
} from './purchase.service.types';
import { PartialPaymentService } from './payments/partial-payment.service';
import { ApolloService } from './apollo.service';
import {
  GetPurchasesDocument,
  GetPurchaseDocument,
  ConfirmPurchaseDocument,
  UpdateDraftPurchaseDocument,
} from '../graphql/generated/graphql';

/**
 * Purchase Service
 *
 * Orchestrates purchase recording by composing focused services.
 * Follows composable service pattern: thin orchestration layer.
 *
 * ARCHITECTURE:
 * - DraftService: Manages draft state and caching
 * - ValidationService: Handles validation logic
 * - ApiService: Handles API communication
 * - PurchaseService: Orchestrates the above
 */
@Injectable({
  providedIn: 'root',
})
export class PurchaseService {
  private readonly draftService = inject(PurchaseDraftService);
  private readonly validationService = inject(PurchaseValidationService);
  private readonly apiService = inject(PurchaseApiService);
  private readonly partialPaymentService = inject(PartialPaymentService);
  private readonly apolloService = inject(ApolloService);

  // Expose draft service signals
  readonly purchaseDraft = this.draftService.draft;
  readonly isLoading = this.draftService.isLoading;
  readonly error = this.draftService.error;
  readonly hasDraft = this.draftService.hasDraft;

  // List view signals
  private readonly purchasesSignal = signal<any[]>([]);
  private readonly isLoadingListSignal = signal(false);
  private readonly errorListSignal = signal<string | null>(null);
  private readonly totalItemsSignal = signal(0);

  readonly purchases = this.purchasesSignal.asReadonly();
  readonly isLoadingList = this.isLoadingListSignal.asReadonly();
  readonly errorList = this.errorListSignal.asReadonly();
  readonly totalItems = this.totalItemsSignal.asReadonly();

  // Computed signals
  readonly totalCost = computed(() => {
    const draft = this.purchaseDraft();
    if (!draft) return 0;
    return draft.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  });
  readonly lineCount = computed(() => {
    const draft = this.purchaseDraft();
    return draft?.lines.length || 0;
  });

  /**
   * Initialize purchase draft (load from cache or create new)
   * @param prepopulationData - Optional items to prepopulate the draft with
   */
  async initializeDraft(prepopulationData?: PurchasePrepopulationData[]): Promise<void> {
    this.draftService.initialize();

    // Prepopulate items if provided
    if (prepopulationData && prepopulationData.length > 0) {
      // Note: This requires product lookup, so items will be added asynchronously
      // The component should handle this after draft is initialized
    }
  }

  /**
   * Prepopulate draft with line items
   * @param items - Line items to add to the draft
   */
  prepopulateItems(items: PurchaseLineItem[]): void {
    this.draftService.prepopulateItems(items);
  }

  /**
   * Create a new purchase draft
   */
  createNewDraft(): void {
    this.draftService.createNewDraft();
  }

  /**
   * Update purchase draft fields
   */
  updateDraftField<K extends keyof PurchaseDraft>(field: K, value: PurchaseDraft[K]): void {
    this.draftService.updateField(field, value);
  }

  /**
   * Add item to local purchase draft
   */
  addPurchaseItemLocal(item: PurchaseLineItem): void {
    this.draftService.addLineItem(item);
  }

  /**
   * Remove item from draft
   */
  removePurchaseItemLocal(index: number): void {
    this.draftService.removeLineItem(index);
  }

  /**
   * Update purchase item
   */
  updatePurchaseItemLocal(index: number, updates: Partial<PurchaseLineItem>): void {
    this.draftService.updateLineItem(index, updates);
  }

  /**
   * Clear purchase draft
   */
  clearPurchaseDraft(): void {
    this.draftService.clear();
  }

  /**
   * Submit purchase to backend
   * @param saveAsDraft When true, creates draft PO only (no ledger, no stock, no payment)
   */
  async submitPurchase(saveAsDraft?: boolean): Promise<any> {
    const draft = this.purchaseDraft();

    // Validate draft (relaxed for PO: payment not required)
    const validation = this.validationService.validateDraft(draft, saveAsDraft);
    if (!validation.isValid) {
      const error = validation.error || 'Invalid purchase draft';
      this.draftService.setError(error);
      throw new Error(error);
    }

    this.draftService.setLoading(true);
    this.draftService.clearError();

    try {
      const result = await this.apiService.recordPurchase(draft!, {
        saveAsDraft: saveAsDraft ?? false,
      });

      // Clear draft on success
      this.draftService.clear();

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to submit purchase';
      this.draftService.setError(errorMessage);
      throw error;
    } finally {
      this.draftService.setLoading(false);
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.draftService.clearError();
  }

  /**
   * Fetch purchases list
   */
  async fetchPurchases(options?: any): Promise<void> {
    this.isLoadingListSignal.set(true);
    this.errorListSignal.set(null);

    try {
      const client = this.apolloService.getClient();

      const result = await client.query({
        query: GetPurchasesDocument,
        variables: {
          options: options || {
            take: 100,
            skip: 0,
          },
        },
        fetchPolicy: 'network-only',
      });

      const items = result.data?.purchases?.items || [];
      const totalItems = result.data?.purchases?.totalItems || 0;

      this.purchasesSignal.set(items);
      this.totalItemsSignal.set(totalItems);
    } catch (error: any) {
      console.error('❌ Failed to fetch purchases:', error);
      this.errorListSignal.set(error.message || 'Failed to fetch purchases');
      this.purchasesSignal.set([]);
      this.totalItemsSignal.set(0);
    } finally {
      this.isLoadingListSignal.set(false);
    }
  }

  /**
   * Clear list error state
   */
  clearListError(): void {
    this.errorListSignal.set(null);
  }

  /**
   * Fetch a single purchase by ID (e.g. for detail view or draft edit)
   */
  async fetchPurchaseById(id: string): Promise<any | null> {
    try {
      const client = this.apolloService.getClient();
      const result = await client.query({
        query: GetPurchaseDocument,
        variables: { id },
        fetchPolicy: 'network-only',
      });
      return result.data?.purchase ?? null;
    } catch (error: any) {
      console.error('❌ Failed to fetch purchase:', error);
      throw error;
    }
  }

  /**
   * Confirm a draft purchase (run ledger/stock, set status to confirmed)
   */
  async confirmPurchase(id: string): Promise<any> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: ConfirmPurchaseDocument,
      variables: { id },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to confirm purchase');
    }
    const purchase = result.data?.confirmPurchase;
    if (!purchase) {
      throw new Error('No purchase returned from confirmPurchase');
    }
    return purchase;
  }

  /**
   * Update a draft purchase (supplier, date, reference, notes, optionally lines)
   */
  async updateDraftPurchase(
    id: string,
    input: {
      supplierId?: string;
      purchaseDate?: string;
      referenceNumber?: string;
      notes?: string;
      lines?: Array<{
        variantId: string;
        quantity: number;
        unitCost: number;
        stockLocationId: string;
      }>;
    },
  ): Promise<any> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: UpdateDraftPurchaseDocument,
      variables: { id, input },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to update draft purchase');
    }
    return result.data?.updateDraftPurchase ?? null;
  }
}
