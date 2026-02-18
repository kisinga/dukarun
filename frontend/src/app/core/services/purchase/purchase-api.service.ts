import { Injectable, inject } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { RECORD_PURCHASE } from '../../graphql/operations.graphql';
import { PurchaseDraft } from '../purchase.service.types';

/**
 * Purchase API Service
 *
 * Handles API communication for purchases.
 * Separated for single responsibility and testability.
 */
@Injectable({
  providedIn: 'root',
})
export class PurchaseApiService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Record purchase via GraphQL mutation
   * @param draft Purchase draft data
   * @param options.saveAsDraft When true, creates draft PO only (no ledger, no stock)
   */
  async recordPurchase(draft: PurchaseDraft, options?: { saveAsDraft?: boolean }): Promise<any> {
    const client = this.apolloService.getClient();

    // Convert unitCost to cents for backend
    const totalCostCents = draft.lines.reduce(
      (sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity,
      0,
    );

    const input: any = {
      supplierId: draft.supplierId!,
      purchaseDate: draft.purchaseDate.toISOString(),
      referenceNumber: draft.referenceNumber || null,
      paymentStatus: options?.saveAsDraft ? 'pending' : draft.paymentStatus,
      notes: draft.notes || null,
      lines: draft.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        unitCost: Math.round(line.unitCost * 100), // Convert to cents
        stockLocationId: line.stockLocationId,
        batchNumber: line.batchNumber ?? null,
        expiryDate: line.expiryDate
          ? typeof line.expiryDate === 'string'
            ? line.expiryDate
            : new Date(line.expiryDate).toISOString()
          : null,
      })),
    };

    // Include saveAsDraft when creating PO (draft purchase)
    if (options?.saveAsDraft) {
      input.saveAsDraft = true;
    }

    // Include approval ID if present (for overdraft-approved purchases)
    if (draft.approvalId) {
      input.approvalId = draft.approvalId;
    }

    // Include inline payment for paid/partial purchases (skip for draft PO)
    if (!options?.saveAsDraft && draft.paymentStatus !== 'pending') {
      input.payment = {
        amount:
          draft.paymentAmount != null ? Math.round(draft.paymentAmount * 100) : totalCostCents,
        debitAccountCode: draft.paymentAccountCode || undefined,
        reference: draft.paymentReference || undefined,
      };
    }

    const result = await client.mutate({
      mutation: RECORD_PURCHASE,
      variables: { input },
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to record purchase');
    }

    return result.data?.recordPurchase;
  }
}
