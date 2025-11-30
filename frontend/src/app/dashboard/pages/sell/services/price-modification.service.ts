import { Injectable, inject, signal, computed } from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Price Modification Service
 *
 * Composable service for managing price adjustments with undo/redo buffer.
 * Stores prices in cents internally, uses CurrencyService for display.
 *
 * ARCHITECTURE:
 * - Stack-based history (LIFO) for undo/redo
 * - Prices stored in cents (Vendure format)
 * - CurrencyService handles display formatting
 * - Reset buffer when quantity changes
 */
@Injectable()
export class PriceModificationService {
  private readonly currencyService = inject(CurrencyService);

  // History stacks (LIFO)
  private undoStack: number[] = []; // Previous prices (for undo)
  private redoStack: number[] = []; // Future prices (for redo)

  // Current price in cents
  private readonly currentPriceCents = signal<number | undefined>(undefined);
  private readonly basePriceCents = signal<number>(0); // Original price before any modifications

  // Computed values
  readonly currentPrice = computed(() => this.currentPriceCents());
  readonly canUndo = computed(() => this.undoStack.length > 0);
  readonly canRedo = computed(() => this.redoStack.length > 0);

  /**
   * Initialize with base price (in cents)
   */
  initialize(basePriceCents: number): void {
    this.basePriceCents.set(basePriceCents);
    this.currentPriceCents.set(basePriceCents);
    this.reset();
  }

  /**
   * Adjust price by percentage (e.g., 0.03 for 3% increase, -0.03 for 3% decrease)
   * Stores current price in undo buffer before applying change
   */
  adjustPrice(percentageChange: number): number {
    const current = this.currentPriceCents() ?? this.basePriceCents();

    // Store current price in undo buffer
    this.undoStack.push(current);

    // Clear redo stack (new action invalidates redo history)
    this.redoStack = [];

    // Calculate new price
    const newPriceCents = Math.round(current * (1 + percentageChange));

    this.currentPriceCents.set(newPriceCents);
    return newPriceCents;
  }

  /**
   * Undo last price adjustment
   * Restores previous price from undo buffer
   */
  undo(): number | undefined {
    if (this.undoStack.length === 0) {
      return undefined;
    }

    const current = this.currentPriceCents() ?? this.basePriceCents();

    // Move current price to redo stack
    this.redoStack.push(current);

    // Pop previous price from undo stack
    const previousPrice = this.undoStack.pop()!;

    this.currentPriceCents.set(previousPrice);
    return previousPrice;
  }

  /**
   * Redo last undone price adjustment
   * Restores price from redo buffer
   */
  redo(): number | undefined {
    if (this.redoStack.length === 0) {
      return undefined;
    }

    const current = this.currentPriceCents() ?? this.basePriceCents();

    // Move current price to undo stack
    this.undoStack.push(current);

    // Pop next price from redo stack
    const nextPrice = this.redoStack.pop()!;

    this.currentPriceCents.set(nextPrice);
    return nextPrice;
  }

  /**
   * Get current price in cents
   */
  getCurrentPriceCents(): number | undefined {
    return this.currentPriceCents();
  }

  /**
   * Get formatted current price for display
   */
  getFormattedPrice(showCurrency: boolean = false): string {
    const price = this.currentPriceCents() ?? this.basePriceCents();
    return this.currencyService.format(price, showCurrency);
  }

  /**
   * Check if price has been modified from base
   */
  isModified(): boolean {
    const current = this.currentPriceCents();
    if (current === undefined) return false;
    return current !== this.basePriceCents();
  }

  /**
   * Reset history buffers (call when quantity changes)
   */
  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Reset to base price and clear history
   */
  resetToBase(): void {
    this.currentPriceCents.set(this.basePriceCents());
    this.reset();
  }

  /**
   * Set custom price directly (in cents)
   * Stores current price in undo buffer
   */
  setCustomPrice(priceCents: number): void {
    const current = this.currentPriceCents() ?? this.basePriceCents();

    // Store current price in undo buffer
    this.undoStack.push(current);

    // Clear redo stack
    this.redoStack = [];

    this.currentPriceCents.set(priceCents);
  }
}

