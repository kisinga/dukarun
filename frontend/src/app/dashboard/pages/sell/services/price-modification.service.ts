import { Injectable } from '@angular/core';

export interface PriceModificationResult {
  newPrice: number;
  reason: string;
}

/**
 * Service for managing price modifications with stack-based undo/redo behavior.
 * 
 * Stack behavior:
 * - Increase: Always pushes current price to undo stack, then calculates new increased price
 * - Decrease: If undo stack has items, pops from undo stack (goes back). Otherwise, pushes current to undo stack and calculates new decreased price
 * 
 * Context types:
 * - 'unit': For unit price modifications (modal)
 * - 'line': For line price modifications (cart)
 */
@Injectable({
  providedIn: 'root',
})
export class PriceModificationService {
  // Price modification undo/redo buffers (per variant and context)
  private priceUndoStacks = new Map<string, number[]>();
  private priceRedoStacks = new Map<string, number[]>();

  /**
   * Get stack key for a variant and context
   */
  private getStackKey(variantId: string, context: 'unit' | 'line' = 'line'): string {
    return `${variantId}:${context}`;
  }

  /**
   * Increase price by 3%
   * If undo stack has items, pops from undo stack (goes back in history).
   * Otherwise, pushes current to undo stack and calculates new increased price.
   * Limited to 10 steps maximum. Shares the same stack with decrease.
   */
  increasePrice(
    variantId: string,
    currentPriceCents: number,
    context: 'unit' | 'line' = 'line',
  ): PriceModificationResult | null {
    const stackKey = this.getStackKey(variantId, context);

    // Initialize stacks if needed
    if (!this.priceUndoStacks.has(stackKey)) {
      this.priceUndoStacks.set(stackKey, []);
    }
    if (!this.priceRedoStacks.has(stackKey)) {
      this.priceRedoStacks.set(stackKey, []);
    }

    const undoStack = this.priceUndoStacks.get(stackKey)!;
    const redoStack = this.priceRedoStacks.get(stackKey)!;

    // If there's something in undo stack, pop from undo stack (go back in history)
    if (undoStack.length > 0) {
      // Move current price to redo stack
      redoStack.push(currentPriceCents);
      // Pop previous price from undo stack and restore
      const previousPrice = undoStack.pop()!;
      return {
        newPrice: previousPrice,
        reason: 'Price restored',
      };
    } else {
      // No undo available, apply increase
      // Check if stack is at maximum (10 steps)
      if (undoStack.length >= 10) {
        // At maximum, decline the action
        return null;
      }

      // Store current price in undo stack before increasing
      undoStack.push(currentPriceCents);
      // Clear redo stack (new action invalidates redo)
      redoStack.length = 0;
      // Apply 3% increase, then round to nearest whole number (no cents)
      const newPriceCents = Math.round(currentPriceCents * 1.03);

      return {
        newPrice: newPriceCents,
        reason: '3% increase',
      };
    }
  }

  /**
   * Decrease price by 3%
   * If undo stack has items, pops from undo stack (goes back in history).
   * Otherwise, pushes current to undo stack and calculates new decreased price.
   * Respects wholesale price limit (per-item comparison) and stack size limit (10 steps).
   */
  decreasePrice(
    variantId: string,
    currentPriceCents: number,
    quantity: number,
    wholesalePriceCents?: number,
    context: 'unit' | 'line' = 'line',
  ): PriceModificationResult | null {
    const stackKey = this.getStackKey(variantId, context);

    // Initialize stacks if needed
    if (!this.priceUndoStacks.has(stackKey)) {
      this.priceUndoStacks.set(stackKey, []);
    }
    if (!this.priceRedoStacks.has(stackKey)) {
      this.priceRedoStacks.set(stackKey, []);
    }

    const undoStack = this.priceUndoStacks.get(stackKey)!;
    const redoStack = this.priceRedoStacks.get(stackKey)!;

    // If there's something in undo stack, pop from undo stack (go back in history)
    if (undoStack.length > 0) {
      // Move current price to redo stack
      redoStack.push(currentPriceCents);
      // Pop previous price from undo stack and restore
      const previousPrice = undoStack.pop()!;
      return {
        newPrice: previousPrice,
        reason: 'Price restored',
      };
    } else {
      // No undo available, apply decrease
      // Check if stack is at maximum (10 steps)
      if (undoStack.length >= 10) {
        // At maximum, decline the action
        return null;
      }

      // Calculate new decreased price (3% decrease)
      let newPriceCents = Math.round(currentPriceCents * 0.97);

      // Calculate price per item to compare with wholesale price (which is per-item)
      const pricePerItem = newPriceCents / quantity;

      // Check if price per item would be at or below wholesale price (per-item)
      if (wholesalePriceCents && pricePerItem <= wholesalePriceCents) {
        // Set price to wholesale price * quantity (rounded to whole number)
        newPriceCents = Math.round(wholesalePriceCents * quantity);
      }

      // Store current price in undo stack before decreasing
      undoStack.push(currentPriceCents);
      // Clear redo stack (new action invalidates redo)
      redoStack.length = 0;

      // Return new price (already rounded to whole number)
      return {
        newPrice: newPriceCents,
        reason: '3% decrease',
      };
    }
  }

  /**
   * Clear undo/redo stacks for a variant (e.g., when quantity changes)
   * Clears both unit and line price stacks for the variant
   */
  clearStacks(variantId: string): void {
    const unitKey = this.getStackKey(variantId, 'unit');
    const lineKey = this.getStackKey(variantId, 'line');
    this.priceUndoStacks.delete(unitKey);
    this.priceRedoStacks.delete(unitKey);
    this.priceUndoStacks.delete(lineKey);
    this.priceRedoStacks.delete(lineKey);
  }

  /**
   * Check if price is at lowest (wholesale price)
   * Compares price per item against wholesale price (which is per-item)
   */
  isAtLowestPrice(
    currentPriceCents: number,
    quantity: number,
    wholesalePriceCents?: number,
  ): boolean {
    if (!wholesalePriceCents) return false;
    // Calculate price per item and compare with wholesale price (per-item)
    const pricePerItem = currentPriceCents / quantity;
    return pricePerItem <= wholesalePriceCents;
  }

  /**
   * Get current undo stack length for a variant (useful for UI state)
   */
  getUndoStackLength(variantId: string, context: 'unit' | 'line' = 'line'): number {
    const stackKey = this.getStackKey(variantId, context);
    return this.priceUndoStacks.get(stackKey)?.length ?? 0;
  }
}
