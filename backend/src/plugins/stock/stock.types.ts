import { ID } from '@vendure/core';

export interface PurchaseLineInput {
  variantId: ID;
  quantity: number;
  unitCost: number; // In smallest currency unit (cents)
  stockLocationId: ID;
  /** Optional supplier lot or batch number */
  batchNumber?: string | null;
  /** Optional expiry / use-by date for this line's batch */
  expiryDate?: Date | null;
}

export interface RecordPurchaseInput {
  supplierId: ID;
  purchaseDate: Date;
  referenceNumber?: string | null;
  paymentStatus: string;
  notes?: string | null;
  lines: PurchaseLineInput[];
}

export interface StockAdjustmentLineInput {
  variantId: ID;
  quantityChange: number; // Positive for increase, negative for decrease
  stockLocationId: ID;
}

export interface RecordStockAdjustmentInput {
  reason: string;
  notes?: string | null;
  lines: StockAdjustmentLineInput[];
}
