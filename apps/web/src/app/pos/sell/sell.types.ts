export interface DraftFlag {
  kind: 'price' | 'override' | 'override-blocked' | 'stock' | 'unavailable';
  label: string;
  was: number;
  now: number;
  overridePrice: number;
  available: number;
  needed: number;
  count: number;
}

export interface SaleSuccessMessage {
  text: string;
  tone: 'success' | 'warning';
  orderId?: string;
}
