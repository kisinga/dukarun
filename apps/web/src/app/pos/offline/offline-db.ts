import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Database } from '@dukarun/shared-types';
import type { AppIdentity } from '../../core/supabase.service';
import type { CartLine } from '../cart.service';
import type { PaymentInput, SaleLineInput, Variant } from '../pos.service';

type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];

interface ScopedRecord {
  company_id: string;
  user_id: string;
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
  queued_at: string; // ISO
  status: 'queued' | 'failed';
  /** Server rejection message (P0001) when status is 'failed'. */
  error?: string;
}

export interface ProductSnapshot {
  key: string;
  company_id: string;
  user_id: string;
  products: Variant[];
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

export interface PosSettingsSnapshot extends ScopedRecord {
  key: string;
  payment_methods: string[];
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
  // v3 scopes all new records by company + user. Existing records are never
  // deleted here: unscoped outbox entries are quarantined by SyncService so an
  // upgrade cannot lose or accidentally replay a sale under another account.
  dbPromise ??= openDB<PosOfflineDb>('dukarun-pos-offline', 3, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      const outbox = db.objectStoreNames.contains('outbox')
        ? transaction.objectStore('outbox')
        : db.createObjectStore('outbox', { keyPath: 'client_ref' });
      if (!outbox.indexNames.contains('by-queued-at')) {
        outbox.createIndex('by-queued-at', 'queued_at');
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('cashier')) {
        db.createObjectStore('cashier', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
  return dbPromise;
}

export function offlineScopeKey(identity: AppIdentity): string {
  return `${identity.companyId}:${identity.userId}`;
}

export function belongsToIdentity(record: Partial<ScopedRecord>, identity: AppIdentity): boolean {
  return record.company_id === identity.companyId && record.user_id === identity.userId;
}
