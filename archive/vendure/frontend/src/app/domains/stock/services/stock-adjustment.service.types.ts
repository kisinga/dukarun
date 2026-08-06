import { ProductVariant } from '@dukarun/product';

/**
 * Stock adjustment line item interface
 */
export interface StockAdjustmentLineItem {
  variantId: string;
  variant?: ProductVariant; // Optional for display
  quantityChange: number; // Positive for increase, negative for decrease
  stockLocationId: string;
  /** Unit cost in cents for increases; required by the backend when the variant has no stock */
  unitCost?: number;
}

/**
 * Stock adjustment draft interface
 */
export interface StockAdjustmentDraft {
  reason: string;
  notes: string;
  lines: StockAdjustmentLineItem[];
}
