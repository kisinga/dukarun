import { Injectable } from '@nestjs/common';
import { UserInputError } from '@vendure/core';
import { RecordPurchaseInput } from './purchase.service';
import { RecordStockAdjustmentInput } from './stock-adjustment.service';

/**
 * Stock Validation Service
 *
 * Centralized validation logic for stock operations.
 * Separated for single responsibility and reusability.
 */
@Injectable()
export class StockValidationService {
  /**
   * Validate purchase input
   */
  validatePurchaseInput(input: RecordPurchaseInput): void {
    if (!input.supplierId) {
      throw new UserInputError('Supplier ID is required');
    }

    if (!input.purchaseDate) {
      throw new UserInputError('Purchase date is required');
    }

    if (!input.lines || input.lines.length === 0) {
      throw new UserInputError('Purchase must have at least one line item');
    }

    if (!input.paymentStatus) {
      throw new UserInputError('Payment status is required');
    }

    // Validate lines
    for (const line of input.lines) {
      if (!line.variantId) {
        throw new UserInputError('All purchase lines must have a variant ID');
      }

      if (line.quantity <= 0) {
        throw new UserInputError('All purchase line quantities must be positive');
      }

      if (line.unitCost < 0) {
        throw new UserInputError('Unit cost cannot be negative');
      }

      if (!line.stockLocationId) {
        throw new UserInputError('All purchase lines must have a stock location ID');
      }
    }
  }

  /**
   * Validate adjustment input
   */
  validateAdjustmentInput(input: RecordStockAdjustmentInput): void {
    if (!input.reason || input.reason.trim() === '') {
      throw new UserInputError('Adjustment reason is required');
    }

    if (!input.lines || input.lines.length === 0) {
      throw new UserInputError('Stock adjustment must have at least one line item');
    }

    // Validate lines
    for (const line of input.lines) {
      if (!line.variantId) {
        throw new UserInputError('All adjustment lines must have a variant ID');
      }

      if (line.quantityChange === 0) {
        throw new UserInputError('Quantity change cannot be zero');
      }

      if (!line.stockLocationId) {
        throw new UserInputError('All adjustment lines must have a stock location ID');
      }
    }
  }
}
