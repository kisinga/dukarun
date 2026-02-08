import { Injectable } from '@angular/core';
import { PurchaseDraft, PurchaseLineItem } from '../purchase.service.types';
import { DraftBaseService } from './draft-base.service';

/**
 * Purchase Draft Service
 *
 * Manages purchase draft state with caching.
 * Separated from PurchaseService for single responsibility.
 */
@Injectable({
  providedIn: 'root',
})
export class PurchaseDraftService extends DraftBaseService<PurchaseDraft> {
  constructor() {
    super('purchase_draft');
  }

  /**
   * Create new purchase draft
   */
  protected override createNew(): void {
    const draft: PurchaseDraft = {
      supplierId: null,
      purchaseDate: new Date(),
      referenceNumber: '',
      paymentStatus: 'pending',
      notes: '',
      lines: [],
      paymentAmount: null,
      paymentAccountCode: '',
      paymentReference: '',
    };
    this.draftSignal.set(draft);
    this.persist();
  }

  /**
   * Prepopulate draft with items
   * Useful when navigating from products table to purchases page
   */
  prepopulateItems(items: PurchaseLineItem[]): void {
    const draft = this.draft();
    if (!draft) {
      this.createNewDraft();
      return;
    }

    this.draftSignal.set({
      ...draft,
      lines: [...draft.lines, ...items],
    });
    this.persist();
  }

  /**
   * Transform cached data (parse Date from string)
   */
  protected override transformCachedData(cached: PurchaseDraft): PurchaseDraft {
    return {
      ...cached,
      purchaseDate:
        cached.purchaseDate instanceof Date ? cached.purchaseDate : new Date(cached.purchaseDate),
      // Backward compatibility for cached drafts without payment fields
      paymentAmount: cached.paymentAmount ?? null,
      paymentAccountCode: cached.paymentAccountCode ?? '',
      paymentReference: cached.paymentReference ?? '',
    };
  }

  /**
   * Update draft field (public method)
   */
  override updateField<K extends keyof PurchaseDraft>(field: K, value: PurchaseDraft[K]): void {
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
  addLineItem(item: PurchaseLineItem): void {
    const draft = this.draft();
    if (!draft) {
      this.createNewDraft();
      return;
    }

    // Check if variant already exists, update quantity if so
    const existingIndex = draft.lines.findIndex(
      (line) => line.variantId === item.variantId && line.stockLocationId === item.stockLocationId,
    );

    if (existingIndex >= 0) {
      // Update existing line
      const updatedLines = [...draft.lines];
      updatedLines[existingIndex] = {
        ...updatedLines[existingIndex],
        quantity: updatedLines[existingIndex].quantity + item.quantity,
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
  updateLineItem(index: number, updates: Partial<PurchaseLineItem>): void {
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
