import { Injectable } from '@angular/core';
import { StockAdjustmentDraft } from './stock-adjustment.service.types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Stock Adjustment Validation Service
 *
 * Handles validation logic for stock adjustment drafts.
 * Separated for single responsibility and testability.
 */
@Injectable({
  providedIn: 'root',
})
export class StockAdjustmentValidationService {
  /**
   * Validate adjustment draft
   */
  validateDraft(draft: StockAdjustmentDraft | null): ValidationResult {
    if (!draft) {
      return {
        isValid: false,
        error: 'No adjustment draft to validate',
      };
    }

    if (!draft.reason || draft.reason.trim() === '') {
      return {
        isValid: false,
        error: 'Adjustment reason is required',
      };
    }

    if (draft.lines.length === 0) {
      return {
        isValid: false,
        error: 'Stock adjustment must have at least one item',
      };
    }

    // Validate lines
    for (const line of draft.lines) {
      if (!line.variantId) {
        return {
          isValid: false,
          error: 'All adjustment lines must have a variant ID',
        };
      }

      if (line.quantityChange === 0) {
        return {
          isValid: false,
          error: 'Quantity change cannot be zero',
        };
      }

      if (!line.stockLocationId) {
        return {
          isValid: false,
          error: 'All adjustment lines must have a stock location ID',
        };
      }
    }

    return { isValid: true };
  }
}
