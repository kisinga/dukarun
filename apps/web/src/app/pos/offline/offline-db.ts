import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CartLine } from '../cart.service';
import type { PaymentInput, SaleLineInput, Variant } from '../pos.service';

/**
 * A sale completed locally while offline (or after a network failure).
 * `client_ref` makes the eventual replay exactly-once: post_sale with the
 * same client_ref returns the original order id instead of double-posting.
 */
export interface OutboxEntry {
  client_ref: string;
  customer_id: string | null;
  lines: SaleLineInput[];
  payments: PaymentInput[];
  queued_at: string; // ISO
  status: 'queued' | 'failed';
  /** Server rejection message (P0001) when status is 'failed'. */
  error?: string;
}

export interface ProductSnapshot {
  key: 'latest';
  products: Variant[];
  fetched_at: string; // ISO
}

export interface PersistedCart {
  key: 'current';
  lines: CartLine[];
  customerId: string | null;
  customerName: string;
  draftId: string | null;
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
}

let dbPromise: Promise<IDBPDatabase<PosOfflineDb>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<PosOfflineDb>> {
  // v2: catalog remodeled to families + variants (line items carry variant_id).
  // The old flat-product outbox/snapshot/cart payloads are incompatible, so
  // the upgrade drops and recreates all stores — dev-stage data loss is fine.
  dbPromise ??= openDB<PosOfflineDb>('dukarun-pos-offline', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion >= 1) {
        for (const store of ['outbox', 'products', 'cart'] as const) {
          if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
        }
      }
      const outbox = db.createObjectStore('outbox', { keyPath: 'client_ref' });
      outbox.createIndex('by-queued-at', 'queued_at');
      db.createObjectStore('products', { keyPath: 'key' });
      db.createObjectStore('cart', { keyPath: 'key' });
    },
  });
  return dbPromise;
}
