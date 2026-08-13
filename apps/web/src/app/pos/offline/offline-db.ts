import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Database } from '@dukarun/shared-types';
import type { AppIdentity } from '../../core/supabase.service';
import type { CartLine } from '../cart.service';
import type {
  CategoryWithCount,
  Manufacturer,
  PaymentInput,
  Product,
  ProductCategoryLink,
  OrderWithCustomer,
  SaleLineInput,
  Variant,
} from '../pos.service';

type CashierSession = Database['public']['Tables']['cashier_sessions']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];

export type CachedCustomer = Customer & {
  ar_balance: number;
  downpayment_balance: number;
  net_balance: number;
  days_outstanding: number | null;
  bucket: string | null;
};

export type CachedSupplier = Customer & {
  ap_balance: number;
  days_outstanding: number | null;
  bucket: string | null;
};

export type CachedManufacturer = Pick<Manufacturer, 'id' | 'name'>;

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
  /** Location-correct stock for the cached variants. */
  location_stock?: Array<{ variant_id: string; stock: number; stock_value: number }>;
  /** Catalog reference data, hydrated with products to avoid staggered labels and filters. */
  manufacturers?: CachedManufacturer[];
  categories?: CategoryWithCount[];
  product_categories?: ProductCategoryLink[];
  category_memberships_complete?: boolean;
  truncated?: boolean;
  /** True when the cache writer probed beyond its row ceiling. */
  catalog_complete?: boolean;
  fetched_at: string; // ISO
}

/** One hot catalogue row so stock/variant patches never rewrite all 10k rows. */
export interface CatalogVariantRecord extends ScopedRecord {
  key: string;
  scope_key: string;
  location_id: string;
  variant_id: string;
  variant: Variant;
  stock_value: number;
}

/** Family/reference data changes far less often and is stored separately. */
export interface CatalogMetadata extends ScopedRecord {
  key: string;
  location_id: string;
  families: Product[];
  manufacturers: CachedManufacturer[];
  categories: CategoryWithCount[];
  product_categories?: ProductCategoryLink[];
  category_memberships_complete?: boolean;
  truncated: boolean;
  catalog_complete?: boolean;
  fetched_at: string;
}

export interface PartySnapshot extends ScopedRecord {
  key: string;
  customers: CachedCustomer[];
  suppliers: CachedSupplier[];
  /** False means local browse/search can return matches, never authoritative absence. */
  complete: boolean;
  directory_fetched_at: string;
  financial_fetched_at: string;
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
  payment_methods_fetched_at?: string;
  cashier_flow_enabled?: boolean;
  cash_control_enabled?: boolean;
  require_opening_count?: boolean;
  batch_expiry_enabled?: boolean;
  fetched_at: string;
}

export type CacheStream = 'catalog' | 'parties' | 'sales' | 'settings' | 'inbox' | 'team';

export interface CacheWatermark extends ScopedRecord {
  key: string;
  stream: CacheStream;
  sequence: number;
  updated_at: string;
}

export interface RecentSalesSnapshot extends ScopedRecord {
  key: string;
  orders: OrderWithCustomer[];
  fetched_at: string;
}

export interface SaleDetailSnapshot extends ScopedRecord {
  key: string;
  scope_key: string;
  order_id: string;
  detail: unknown;
  opened_at: string;
}

export interface NamedSnapshot extends ScopedRecord {
  key: string;
  name:
    | 'dashboard'
    | 'settings'
    | 'locations'
    | 'inbox'
    | 'approvals'
    | 'team'
    | 'access'
    | 'cashier-display';
  value: unknown;
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
  catalogVariants: {
    key: string;
    value: CatalogVariantRecord;
    indexes: { 'by-scope': string };
  };
  catalogMetadata: {
    key: string;
    value: CatalogMetadata;
  };
  parties: {
    key: string;
    value: PartySnapshot;
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
  watermarks: {
    key: string;
    value: CacheWatermark;
  };
  recentSales: {
    key: string;
    value: RecentSalesSnapshot;
  };
  saleDetails: {
    key: string;
    value: SaleDetailSnapshot;
    indexes: { 'by-scope-opened': [string, string] };
  };
  snapshots: {
    key: string;
    value: NamedSnapshot;
  };
}

let dbPromise: Promise<IDBPDatabase<PosOfflineDb>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<PosOfflineDb>> {
  // v3 scopes all new records by company + user. Existing records are never
  // deleted here: unscoped outbox entries are quarantined by SyncService so an
  // upgrade cannot lose or accidentally replay a sale under another account.
  dbPromise ??= openDB<PosOfflineDb>('dukarun-pos-offline', 6, {
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
      if (!db.objectStoreNames.contains('catalogVariants')) {
        const variants = db.createObjectStore('catalogVariants', { keyPath: 'key' });
        variants.createIndex('by-scope', 'scope_key');
      }
      if (!db.objectStoreNames.contains('catalogMetadata')) {
        db.createObjectStore('catalogMetadata', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('parties')) {
        db.createObjectStore('parties', { keyPath: 'key' });
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
      if (!db.objectStoreNames.contains('watermarks')) {
        db.createObjectStore('watermarks', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('recentSales')) {
        db.createObjectStore('recentSales', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('saleDetails')) {
        const details = db.createObjectStore('saleDetails', { keyPath: 'key' });
        details.createIndex('by-scope-opened', ['scope_key', 'opened_at']);
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'key' });
      }
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

export function cacheWatermarkKey(scope: string, stream: CacheStream): string {
  return `${scope}:stream:${stream}`;
}
