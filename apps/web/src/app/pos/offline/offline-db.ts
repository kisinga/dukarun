import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Database } from '@dukarun/shared-types';
import type { AppIdentity } from '../../core/supabase.service';
import type { CartLine } from '../cart.service';
import type { PaymentInput, Product, SaleLineInput, Variant } from '../pos.service';

type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];

interface ScopedRecord {
  company_id: string;
  user_id: string;
  location_id?: string;
}

/**
 * A sale completed locally while offline (or after a network failure).
 * `client_ref` makes the eventual replay exactly-once: post_sale with the
 * same client_ref returns the original order id instead of double-posting.
 */
export interface OutboxEntry extends ScopedRecord {
  client_ref: string;
  customer_id: string | null;
  lines: SaleLineInput[];
  payments: PaymentInput[];
  /** Proforma being converted — passed as p_draft_id on replay so it retires with the sale. */
  draft_id?: string | null;
  queued_at: string; // ISO
  status: 'queued' | 'failed';
  /** Server rejection message (P0001) when status is 'failed'. */
  error?: string;
}

export interface ProductSnapshot {
  key: string;
  company_id: string;
  user_id: string;
  location_id: string;
  products: Variant[];
  /** Cached separately so management can render products with no variants. */
  families?: Product[];
  /** Location-correct stock; variant_catalog.stock is company-wide. */
  location_stock?: Array<{ variant_id: string; stock: number; stock_value: number }>;
  truncated?: boolean;
  fetched_at: string; // ISO
}

export interface PersistedCart extends ScopedRecord {
  key: string;
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  draftId: string | null;
}

export interface CashierSessionSnapshot extends ScopedRecord {
  key: string;
  session: CashierSession;
  confirmed_at: string;
}

export interface CachedPaymentMethod {
  code: string;
  name: string;
  isCashierControlled: boolean;
  /** Carried through from the RPC; absent in snapshots cached before it existed. */
  reconciliationType?: string | null;
}

export interface PosSettingsSnapshot extends ScopedRecord {
  key: string;
  payment_methods: CachedPaymentMethod[];
  cashier_flow_enabled?: boolean;
  cash_control_enabled?: boolean;
  require_opening_count?: boolean;
  batch_expiry_enabled?: boolean;
  fetched_at: string;
}

interface PosOfflineDb extends DBSchema {
  outbox: {
    key: string; // client_ref
    value: OutboxEntry;
    indexes: { 'by-queued-at': string };
  };
  products: {
    key: string;
    value: ProductSnapshot;
  };
  cart: {
    key: string;
    value: PersistedCart;
  };
  cashier: {
    key: string;
    value: CashierSessionSnapshot;
  };
  settings: {
    key: string;
    value: PosSettingsSnapshot;
  };
}

let dbPromise: Promise<IDBPDatabase<PosOfflineDb>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<PosOfflineDb>> {
  dbPromise ??= openDB<PosOfflineDb>('dukarun-pos-offline', 4, {
    upgrade(db) {
      const outbox = db.createObjectStore('outbox', { keyPath: 'client_ref' });
      outbox.createIndex('by-queued-at', 'queued_at');
      db.createObjectStore('products', { keyPath: 'key' });
      db.createObjectStore('cart', { keyPath: 'key' });
      db.createObjectStore('cashier', { keyPath: 'key' });
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export function offlineScopeKey(identity: AppIdentity, locationId?: string | null): string {
  return [identity.companyId, identity.userId, locationId].filter(Boolean).join(':');
}

export function belongsToIdentity(record: Partial<ScopedRecord>, identity: AppIdentity): boolean {
  return record.company_id === identity.companyId && record.user_id === identity.userId;
}
