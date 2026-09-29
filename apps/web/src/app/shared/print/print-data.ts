/** Data contracts used by the internal transaction-to-document adapters. */
export interface OrderData {
  id: string;
  code: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  orderPlacedAt?: string | null;
  total: number;
  totalWithTax: number;
  /** Immutable server snapshots for completed sales; estimates for proformas. */
  netTotal?: number;
  taxTotal?: number;
  taxDocumentNumber?: string | null;
  taxBreakdown?: Array<{
    code: string;
    classification: string;
    rateBps: number;
    gross: number;
    net: number;
    tax: number;
  }>;
  currencyCode: string;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string | null;
    phoneNumber?: string | null;
  } | null;
  lines: Array<{
    id: string;
    quantity: number;
    linePrice: number;
    linePriceWithTax: number;
    netAmount?: number;
    taxAmount?: number;
    taxCategoryCode?: string | null;
    taxClassification?: string | null;
    taxRateBps?: number;
    productVariant: {
      id: string;
      name: string;
      product?: { id: string; name: string; manufacturerName?: string };
    };
  }>;
  payments?: Array<{
    id: string;
    state: string;
    amount: number;
    method: string;
    createdAt: string;
    metadata?: any;
  }>;
  fulfillments?: Array<{
    id: string;
    state: string;
    method: string;
    trackingCode?: string | null;
    createdAt: string;
  }>;
  billingAddress?: {
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country: string;
    phoneNumber?: string | null;
  } | null;
  shippingAddress?: {
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country: string;
    phoneNumber?: string | null;
  } | null;
}

/**
 * Document type for print - drives header and payment/fulfillment visibility.
 */
export type DocumentType = 'receipt' | 'invoice' | 'proforma' | 'purchase-order' | 'cashier-slip';

/**
 * Contextual metadata for print rendering that isn't part of the order itself.
 * Supplied by the existing company, tax and staff data services.
 */
export interface PrintMeta {
  /** Document type - drives header and payment section visibility */
  documentType?: DocumentType;
  /** Display-friendly payment method name (e.g. "M-Pesa") - never use raw code */
  paymentMethodName?: string;
  /** First name of the staff member who served the customer */
  servedBy?: string;
  /** Cosmetic shop-wide visibility only; never feeds transaction calculations. */
  showVatBreakdown?: boolean;
  vatRegistered?: boolean;
  taxRegistrationNumber?: string | null;
}

/**
 * Purchase data for A4 purchase order / purchase invoice printing.
 */
export interface PurchaseData {
  id: string;
  supplierId: string;
  purchaseDate: string;
  referenceNumber?: string | null;
  totalCost: number;
  paymentStatus: string;
  notes?: string | null;
  status: string;
  supplier?: {
    id: string;
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
  } | null;
  lines: Array<{
    id: string;
    variantId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    variant?: {
      id: string;
      name: string;
      product?: { id: string; name: string; manufacturerName?: string };
    };
  }>;
  expenses?: Array<{
    id: string;
    category: string;
    custom_label?: string | null;
    memo?: string | null;
    amount: number;
  }>;
}
