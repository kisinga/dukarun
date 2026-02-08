import { Injectable } from '@angular/core';
import { PurchaseDraft } from '../purchase.service.types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Purchase Validation Service
 *
 * Handles validation logic for purchase drafts.
 * Separated for single responsibility and testability.
 */
@Injectable({
  providedIn: 'root',
})
export class PurchaseValidationService {
  /**
   * Validate purchase draft
   */
  validateDraft(draft: PurchaseDraft | null): ValidationResult {
    if (!draft) {
      return {
        isValid: false,
        error: 'No purchase draft to validate',
      };
    }

    if (!draft.supplierId) {
      return {
        isValid: false,
        error: 'Supplier is required',
      };
    }

    if (draft.lines.length === 0) {
      return {
        isValid: false,
        error: 'Purchase must have at least one item',
      };
    }

    // Validate lines
    for (const line of draft.lines) {
      if (!line.variantId) {
        return {
          isValid: false,
          error: 'All purchase lines must have a variant ID',
        };
      }

      if (line.quantity <= 0) {
        return {
          isValid: false,
          error: 'All purchase line quantities must be positive',
        };
      }

      if (line.unitCost < 0) {
        return {
          isValid: false,
          error: 'Unit cost cannot be negative',
        };
      }

      if (!line.stockLocationId) {
        return {
          isValid: false,
          error: 'All purchase lines must have a stock location ID',
        };
      }
    }

    // Validate payment fields
    if (draft.paymentStatus === 'partial') {
      if (draft.paymentAmount == null || draft.paymentAmount <= 0) {
        return {
          isValid: false,
          error: 'Partial payment requires a positive amount',
        };
      }
      const totalCost = draft.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
      if (draft.paymentAmount >= totalCost) {
        return {
          isValid: false,
          error:
            'Partial payment amount must be less than the total cost. Use "Paid" for full payment.',
        };
      }
    }

    return { isValid: true };
  }
}
