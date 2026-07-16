import { Injectable } from '@angular/core';
import { DraftBaseService } from '../../../shared/services/draft/draft-base.service';
import { StockAdjustmentDraft, StockAdjustmentLineItem } from './stock-adjustment.service.types';

/**
 * Stock Adjustment Draft Service
 *
 * Manages stock adjustment draft state with caching.
 * Separated from StockAdjustmentService for single responsibility.
 */
@Injectable({
  providedIn: 'root',
})
export class StockAdjustmentDraftService extends DraftBaseService<StockAdjustmentDraft> {
  constructor() {
    super('adjustment_draft');
  }

  /**
   * Create new adjustment draft
   */
  protected override createNew(): void {
    const draft: StockAdjustmentDraft = {
      reason: '',
      notes: '',
      lines: [],
    };
    this.draftSignal.set(draft);
    this.persist();
  }

  /**
   * Update draft field (public method)
   */
  override updateField<K extends keyof StockAdjustmentDraft>(
    field: K,
    value: StockAdjustmentDraft[K],
  ): void {
    const draft = this.draft();
    if (!draft) {
      this.createNewDraft();
      return;
    }
    this.draftSignal.set({
      ...draft,
      [field]: value,
    });
    this.persist();
  }

  /**
   * Add line item
   */
  addLineItem(item: StockAdjustmentLineItem): void {
    const draft = this.draft();
    if (!draft) {
      this.createNewDraft();
      return;
    }

    // Check if variant already exists, update quantity change if so
    const existingIndex = draft.lines.findIndex(
      (line) => line.variantId === item.variantId && line.stockLocationId === item.stockLocationId,
    );

    if (existingIndex >= 0) {
      // Update existing line
      const updatedLines = [...draft.lines];
      updatedLines[existingIndex] = {
        ...updatedLines[existingIndex],
        quantityChange: updatedLines[existingIndex].quantityChange + item.quantityChange,
      };
      this.draftSignal.set({
        ...draft,
        lines: updatedLines,
      });
    } else {
      // Add new line
      this.draftSignal.set({
        ...draft,
        lines: [...draft.lines, item],
      });
    }

    this.persist();
  }

  /**
   * Remove line item
   */
  removeLineItem(index: number): void {
    const draft = this.draft();
    if (!draft) return;

    const updatedLines = draft.lines.filter((_, i) => i !== index);
    this.draftSignal.set({
      ...draft,
      lines: updatedLines,
    });
    this.persist();
  }

  /**
   * Update line item
   */
  updateLineItem(index: number, updates: Partial<StockAdjustmentLineItem>): void {
    const draft = this.draft();
    if (!draft) return;

    const updatedLines = [...draft.lines];
    updatedLines[index] = {
      ...updatedLines[index],
      ...updates,
    };
    this.draftSignal.set({
      ...draft,
      lines: updatedLines,
    });
    this.persist();
  }
}
