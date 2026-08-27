import type { Product } from '../pos/pos.service';

export interface ProductEditorRow {
  key: string;
  variantId: string | null;
  name: string;
  price: string;
  sku: string;
  barcode: string;
  pendingBarcode: string | null;
  wholesale: string;
  kind: string;
  trackInventory: boolean;
  allowFractional: boolean;
  openingQuantity: string;
  openingUnitCost: string;
  openingLocationId: string;
  batchNumber: string;
  expiryDate: string;
  active: boolean;
}

export type ProductEditorStockInfo = { stock: number; stock_value: number };

export type ProductEditorRequest =
  | { mode: 'create'; initialStep?: 1 | 2 }
  | {
      mode: 'edit';
      product: Product;
      initialStep?: 1 | 2;
      stock: ReadonlyMap<string, ProductEditorStockInfo>;
    };

export interface ProductEditorResult {
  productId: string;
  mode: 'created' | 'updated';
  name: string;
  variantCount: number;
  photoWarning?: string;
}

export interface ProductEditorCloseResult {
  refreshCatalog: boolean;
}

/** Immutable intent emitted by the dense variant form surface. */
export interface ProductEditorRowMutation {
  index: number;
  changes: Partial<Omit<ProductEditorRow, 'key' | 'variantId'>>;
}
