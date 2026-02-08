import { ProductVariant } from './product/product-search.service';

/**
 * Purchase line item interface
 */
export interface PurchaseLineItem {
  variantId: string;
  variant?: ProductVariant; // Optional for display
  quantity: number;
  unitCost: number; // In base currency units (e.g., 10.99)
  stockLocationId: string;
}

/**
 * Purchase draft interface
 */
export interface PurchaseDraft {
  supplierId: string | null;
  purchaseDate: Date;
  referenceNumber: string;
  paymentStatus: 'paid' | 'pending' | 'partial';
  notes: string;
  lines: PurchaseLineItem[];
  /** Amount paid in base currency units (e.g., 10.99). null = full amount for 'paid' status. */
  paymentAmount: number | null;
  /** Debit account code for payment source (e.g., CASH_ON_HAND, CLEARING_MPESA). '' = default. */
  paymentAccountCode: string;
  /** External payment reference (M-Pesa code, bank ref, receipt #). */
  paymentReference: string;
}

/**
 * Prepopulation data for purchase draft
 */
export interface PurchasePrepopulationData {
  variantId: string;
  quantity?: number; // Optional, defaults to 1
}
