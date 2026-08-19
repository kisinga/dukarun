import { Injectable, inject } from '@angular/core';
import type { Database, Json } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { environment } from '../../environments/environment';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService, type PartyQueryResult } from '../core/party-cache.service';
import { ActionExecutorService, type ActionOutcome } from '../core/action-executor.service';

export type Product = Database['public']['Tables']['products']['Row'];
export type Manufacturer = Database['public']['Tables']['manufacturers']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type CategoryWithCount = Category & { product_count: number };
export type ProductCategoryLink = Pick<
  Database['public']['Tables']['product_categories']['Row'],
  'product_id' | 'category_id'
>;
export type Variant = Database['public']['Views']['variant_catalog']['Row'];
export type ProductVariant = Database['public']['Tables']['product_variants']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerWithCredit = Customer & { ar_balance: number };
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderLine = Database['public']['Tables']['order_lines']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type Refund = Database['public']['Tables']['refunds']['Row'];
export type InventoryBatch = Database['public']['Tables']['inventory_batches']['Row'];
export type BarcodeAssignmentResult =
  Database['public']['Functions']['assign_missing_variant_barcodes']['Returns'][number];

export interface CatalogVariantInput {
  variant_id?: string;
  name?: string;
  price: number;
  sku?: string;
  barcode?: string | null;
  wholesale_price?: number | null;
  kind?: string;
  allow_fractional?: boolean;
  track_inventory?: boolean;
  active?: boolean;
  opening_quantity?: number;
  opening_unit_cost?: number;
  opening_location_id?: string;
  batch_number?: string;
  expiry_date?: string;
}

/** Display name for a catalog row; hides the synthetic 'Default' variant name. */
export function variantLabel(v: Pick<Variant, 'product_name' | 'variant_name'>): string {
  const product = v.product_name ?? '';
  if (!v.variant_name || v.variant_name === 'Default') return product;
  return `${product} — ${v.variant_name}`;
}

/** p_lines item for post_sale / save_draft (amounts in shillings). */
export interface SaleLineInput {
  variant_id: string;
  quantity: number;
  unit_price: number;
  custom_price?: number;
  override_reason?: string;
}

/** p_payments item for post_sale / convert_draft / settle_order. */
export interface PaymentInput {
  /** Method code from the payment_methods table (backend-validated). */
  method: string;
  amount: number;
  reference?: string;
  mpesa_receipt?: string;
  /** Explicit Bank/M-Pesa ledger destination; omitted clients use the location default. */
  account_code?: string;
  /** Used only to initiate STK; never stored on the payment row. */
  phone?: string;
}

/** Explicit checkout allocation. Payment rows remain real money tenders. */
export interface SaleSettlementInput {
  payments: PaymentInput[];
  depositAmount: number;
  creditAmount: number;
}

export type OrderWithCustomer = Order & {
  customers: Pick<Customer, 'first_name' | 'last_name'> | null;
};

export type OrderLineWithProduct = OrderLine & {
  /** Resolved from variant_catalog (product — variant). */
  label: string;
  manufacturer_name: string | null;
  sku: string | null;
  wholesale_price: number | null;
  stock: number;
  track_inventory: boolean;
};

/** One enabled tender method from `available_payment_methods` (credit excluded). */
export interface EnabledPaymentMethod {
  code: string;
  name: string;
  is_cashier_controlled: boolean;
  /** blind_count | transaction_verification | statement_match (credit excluded). */
  reconciliation_type: string | null;
  default_account_code: string;
  accounts: PaymentAccountOption[];
}

export interface PaymentAccountOption {
  code: string;
  name: string;
  is_default: boolean;
}

/** post_sale_at_location result (jsonb since migration 0054). */
export type PostSaleResult =
  | {
      status: 'completed' | 'parked';
      orderId: string;
      downpaymentApplied?: number;
      creditAmount?: number;
    }
  | {
      status: 'approval_required';
      orderId: string;
      approvalId: string;
      downpaymentApplied?: number;
      creditAmount?: number;
    };

export type OfflineSaleResult =
  PostSaleResult | { status: 'late_review_required'; reviewId: string };

export type VoidResult = ActionOutcome;

/**
 * RPC failure with the PostgREST/PostgreSQL error code preserved.
 * 'P0001' = business rejection from a raise exception (insufficient_stock,
 * payment_mismatch, permission_denied, …) — safe to show to the user and
 * NOT retryable by the sync engine. Thrown fetch errors (network) never
 * become PosRpcError.
 */
export class PosRpcError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PosRpcError';
    this.code = code;
  }
}

export function rpcError(error: { message: string; code?: string }): PosRpcError {
  return new PosRpcError(error.message, error.code ?? '');
}

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  private readonly parties = inject(PartyCacheService);
  private readonly actions = inject(ActionExecutorService);

  get client() {
    return this.supabase.client;
  }

  /** POS search: active variants of active products from variant_catalog. */
  async searchVariants(query: string, limit = 20): Promise<Variant[]> {
    const { data, error } = await this.client.rpc('search_catalog_variants', {
      p_query: query,
      p_limit: Math.min(Math.max(Math.trunc(limit), 1), 100),
      ...(this.locations.activeId() ? { p_location_id: this.locations.activeId()! } : {}),
    });
    if (error) throw error;
    return data;
  }

  /** Exact, tenant-scoped barcode lookup with current price and location stock. */
  async resolveBarcode(barcode: string): Promise<Variant | null> {
    const value = barcode.trim();
    if (!value) return null;
    const { data, error } = await this.client.rpc('resolve_catalog_barcode', {
      p_barcode: value,
      ...(this.locations.activeId() ? { p_location_id: this.locations.activeId()! } : {}),
    });
    if (error) throw rpcError(error);
    return data[0] ?? null;
  }

  /** Atomically assign labels only to variants that still lack their own barcode. */
  async assignMissingVariantBarcodes(
    assignments: Array<{ variant_id: string; barcode: string }>
  ): Promise<BarcodeAssignmentResult[]> {
    const { data, error } = await this.client.rpc('assign_missing_variant_barcodes', {
      p_assignments: assignments,
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Management list: whole catalog (active + inactive), search across family/variant/sku/barcode. */
  async listCatalog(query = ''): Promise<Variant[]> {
    let q = this.client
      .from('variant_catalog')
      .select('*')
      .order('product_name')
      .order('variant_name')
      .limit(1000);
    const trimmed = query.trim();
    if (trimmed) {
      const pattern = `%${trimmed.replace(/[%_,()]/g, ' ')}%`;
      q = q.or(
        `product_name.ilike.${pattern},variant_name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}` +
          `,manufacturer_name.ilike.${pattern}`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return this.withLocationStock(data);
  }

  /** Product families (the products table) for the management screen grouping. */
  async listFamilies(): Promise<Product[]> {
    const { data, error } = await this.client.from('products').select('*').order('name').limit(500);
    if (error) throw error;
    return data;
  }

  async listManufacturers(query = ''): Promise<Manufacturer[]> {
    let request = this.client
      .from('manufacturers')
      .select('*')
      .eq('active', true)
      .order('name')
      .limit(500);
    const term = query.trim();
    if (term) request = request.ilike('name', `%${term.replace(/[%_]/g, ' ')}%`);
    const { data, error } = await request;
    if (error) throw error;
    return data;
  }

  async upsertManufacturer(name: string): Promise<string> {
    const { data, error } = await this.client.rpc('upsert_manufacturer', { p_name: name.trim() });
    if (error) throw rpcError(error);
    return data;
  }

  /** Raw variants for one product editor; unlike variant_catalog, barcodes are not family-coalesced. */
  async variantsForProduct(productId: string): Promise<ProductVariant[]> {
    const { data, error } = await this.client
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  /** Stock per variant from the product_stock view (client-side join). */
  async productStock(): Promise<Map<string, { stock: number; stock_value: number }>> {
    const { data, error } = await this.client.rpc('location_stock_snapshot', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw error;
    return new Map(
      (data ?? [])
        .filter(r => r.variant_id !== null)
        .map(r => [r.variant_id!, { stock: Number(r.stock ?? 0), stock_value: r.stock_value ?? 0 }])
    );
  }

  /** Batch history for one variant (expand row on the Products screen). */
  async variantBatches(variantId: string): Promise<InventoryBatch[]> {
    const { data, error } = await this.client
      .from('inventory_batches')
      .select('*')
      .eq('variant_id', variantId)
      .eq('stock_location_id', this.locations.requireActiveId())
      .order('purchased_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  /** Create a product family (variants are added via upsertVariant). */
  async createProduct(input: { name: string; barcode?: string }): Promise<string> {
    const { data, error } = await this.client.rpc('create_product', {
      p_name: input.name,
      ...(input.barcode ? { p_barcode: input.barcode } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /**
   * Coupled create: family + >= 1 variant in one transaction.
   * A single unlabeled variant becomes 'Default' server-side; sku auto-generates when blank.
   */
  async createProductWithVariants(input: {
    name: string;
    barcode?: string;
    manufacturer_id?: string | null;
    variants: CatalogVariantInput[];
  }): Promise<string> {
    const { data, error } = await this.client.rpc('create_catalog_product_with_manufacturer', {
      p_name: input.name,
      p_variants: input.variants as never,
      p_manufacturer_id: input.manufacturer_id ?? undefined,
      ...(input.barcode ? { p_barcode: input.barcode } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Coupled edit: product details plus existing/new variants in one database transaction. */
  async updateProductWithVariants(input: {
    product_id: string;
    name: string;
    barcode: string;
    active: boolean;
    manufacturer_id?: string | null;
    variants: CatalogVariantInput[];
  }): Promise<string> {
    const { data, error } = await this.client.rpc('update_catalog_product_with_manufacturer', {
      p_product_id: input.product_id,
      p_name: input.name,
      p_barcode: input.barcode,
      p_active: input.active,
      p_manufacturer_id: input.manufacturer_id ?? undefined,
      p_variants: input.variants as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** null/undefined fields are left unchanged by the backend. */
  async updateProduct(
    productId: string,
    changes: { name?: string; barcode?: string; active?: boolean; image_path?: string }
  ): Promise<string> {
    const { data, error } = await this.client.rpc('update_product', {
      p_product_id: productId,
      ...(changes.name !== undefined ? { p_name: changes.name } : {}),
      ...(changes.barcode !== undefined ? { p_barcode: changes.barcode } : {}),
      ...(changes.active !== undefined ? { p_active: changes.active } : {}),
      ...(changes.image_path !== undefined ? { p_image_path: changes.image_path } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Create (no variantId) or update a variant. */
  async upsertVariant(input: {
    product_id: string;
    name: string;
    price: number;
    variant_id?: string;
    sku?: string;
    barcode?: string;
    wholesale_price?: number;
    allow_fractional?: boolean;
    track_inventory?: boolean;
    active?: boolean;
    kind?: string;
  }): Promise<string> {
    const { data, error } = await this.client.rpc('upsert_variant', {
      p_product_id: input.product_id,
      p_name: input.name,
      p_price: input.price,
      ...(input.variant_id ? { p_variant_id: input.variant_id } : {}),
      ...(input.sku ? { p_sku: input.sku } : {}),
      ...(input.barcode ? { p_barcode: input.barcode } : {}),
      ...(input.wholesale_price !== undefined ? { p_wholesale_price: input.wholesale_price } : {}),
      ...(input.allow_fractional !== undefined
        ? { p_allow_fractional: input.allow_fractional }
        : {}),
      ...(input.track_inventory !== undefined ? { p_track_inventory: input.track_inventory } : {}),
      ...(input.active !== undefined ? { p_active: input.active } : {}),
      ...(input.kind ? { p_kind: input.kind } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Top active variants for the Sell quick-pick grid. */
  async topVariants(limit = 24): Promise<Variant[]> {
    const { data, error } = await this.client
      .from('variant_catalog')
      .select('*')
      .eq('variant_active', true)
      .eq('product_active', true)
      .order('product_name')
      .order('variant_name')
      .limit(limit);
    if (error) throw error;
    return this.withLocationStock(data);
  }

  /** Full active catalog for the offline snapshot (IndexedDB cache). */
  async fetchActiveVariants(): Promise<Variant[]> {
    const pageSize = 500;
    const products: Variant[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('variant_catalog')
        .select('*')
        .eq('variant_active', true)
        .eq('product_active', true)
        .order('product_name')
        .order('variant_name')
        .order('variant_id')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      products.push(...(await this.withLocationStock(data)));
      if (data.length < pageSize) return products;
    }
  }

  // --- Product images (bucket: product-images, public) ---

  /** Public URL for a stored image path. */
  imageUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    return `${environment.supabaseUrl}/storage/v1/object/public/product-images/${path}`;
  }

  /**
   * Upload under the mandatory <company_id>/ prefix (RLS allows writes only
   * under the caller's company). Returns the storage PATH (not a URL).
   */
  async uploadProductImage(companyId: string, blob: Blob, ext: string): Promise<string> {
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.client.storage.from('product-images').upload(path, blob, {
      contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  async removeProductImage(path: string): Promise<void> {
    const { error } = await this.client.storage.from('product-images').remove([path]);
    if (error) throw new Error(error.message);
  }

  // --- Categories ---

  async listCategories(
    productCategoryLinks?: readonly ProductCategoryLink[]
  ): Promise<CategoryWithCount[]> {
    const [{ data: categories, error }, links] = await Promise.all([
      this.client.from('categories').select('*').order('name'),
      productCategoryLinks ?? this.listProductCategoryLinks(),
    ]);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const link of links) {
      counts.set(link.category_id, (counts.get(link.category_id) ?? 0) + 1);
    }
    return (categories ?? []).map(c => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
  }

  /** Full tenant category membership, paged past PostgREST's default row ceiling. */
  async listProductCategoryLinks(): Promise<ProductCategoryLink[]> {
    const pageSize = 1_000;
    const links: ProductCategoryLink[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('product_categories')
        .select('product_id,category_id')
        .order('product_id')
        .order('category_id')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      links.push(...data);
      if (data.length < pageSize) return links;
    }
  }

  async upsertCategory(input: {
    name: string;
    slug?: string;
    description?: string;
    category_id?: string;
    active?: boolean;
  }): Promise<string> {
    const { data, error } = await this.client.rpc('upsert_category', {
      p_name: input.name,
      ...(input.slug ? { p_slug: input.slug } : {}),
      ...(input.description ? { p_description: input.description } : {}),
      ...(input.category_id ? { p_category_id: input.category_id } : {}),
      ...(input.active !== undefined ? { p_active: input.active } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Replace a family's category set with exactly `categoryIds`. */
  async setProductCategories(productId: string, categoryIds: string[]): Promise<string> {
    const { data, error } = await this.client.rpc('set_product_categories', {
      p_product_id: productId,
      p_category_ids: categoryIds,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async productCategoryIds(productId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('product_categories')
      .select('category_id')
      .eq('product_id', productId);
    if (error) throw error;
    return (data ?? []).map(r => r.category_id);
  }

  async patchProductCategories(
    productIds: string[],
    addCategoryIds: string[],
    removeCategoryIds: string[]
  ): Promise<{ product_count: number; added_count: number; removed_count: number }> {
    const { data, error } = await this.client.rpc('patch_product_categories', {
      p_product_ids: productIds,
      p_add_category_ids: addCategoryIds,
      p_remove_category_ids: removeCategoryIds,
    });
    if (error) throw rpcError(error);
    return data as { product_count: number; added_count: number; removed_count: number };
  }

  async searchCustomers(query: string): Promise<PartyQueryResult<CustomerWithCredit>> {
    return this.parties.searchCustomers(query);
  }

  async customerWithCredit(customerId: string): Promise<CustomerWithCredit | null> {
    return this.parties.customerWithCredit(customerId);
  }

  /** Enabled non-credit payment methods with display names and till-control flags. */
  async enabledPaymentMethods(): Promise<EnabledPaymentMethod[]> {
    const locationId = this.locations.requireActiveId();
    const [methodsResult, accountsResult] = await Promise.all([
      this.client.rpc('available_payment_methods', { p_location_id: locationId }),
      this.client.rpc('available_tender_accounts', { p_location_id: locationId }),
    ]);
    if (methodsResult.error) throw methodsResult.error;
    if (accountsResult.error) throw accountsResult.error;
    const accounts = accountsResult.data as Array<{
      account_code: string;
      account_name: string;
      method_code: string;
      is_default: boolean;
    }>;
    return methodsResult.data
      .filter(method => method.code !== 'credit')
      .map(method => ({
        code: method.code,
        name: method.name,
        is_cashier_controlled: method.is_cashier_controlled,
        reconciliation_type: method.reconciliation_type ?? null,
        default_account_code: method.ledger_account_code,
        accounts: accounts
          .filter(account => account.method_code === method.code)
          .map(account => ({
            code: account.account_code,
            name: account.account_name,
            is_default: account.is_default,
          })),
      }));
  }

  /** Orders by status, most recent first. `since`/`until` bound created_at. */
  async ordersByStatus(
    statuses: string[],
    since?: string,
    until?: string
  ): Promise<OrderWithCustomer[]> {
    let query = this.client
      .from('orders')
      .select('*, customers(first_name, last_name)')
      .eq('location_id', this.locations.requireActiveId())
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(100);
    if (since) query = query.gte('created_at', since);
    if (until) query = query.lt('created_at', until);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async ordersPage(input: {
    statuses: string[];
    since?: string;
    until?: string;
    search?: string;
    customerId?: string;
    allLocations?: boolean;
    page: number;
    pageSize: number;
    sortBy?: 'created_at' | 'cashier_pending_at' | 'code' | 'total' | 'status';
    sortDirection?: 'asc' | 'desc';
    cashierQueueOnly?: boolean;
  }): Promise<{ rows: OrderWithCustomer[]; count: number }> {
    let customerIds: string[] = [];
    const term = input.search?.trim().replace(/[%_,()]/g, ' ') ?? '';
    if (term) {
      const { data, error } = await this.client
        .from('customers')
        .select('id')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .limit(100);
      if (error) throw error;
      customerIds = (data ?? []).map(row => row.id);
    }
    let query = this.client
      .from('orders')
      .select('*, customers(first_name, last_name)', { count: 'exact' })
      .in('status', input.statuses);
    if (!input.allLocations) query = query.eq('location_id', this.locations.requireActiveId());
    if (input.customerId) query = query.eq('customer_id', input.customerId);
    if (input.since) query = query.gte('created_at', input.since);
    if (input.until) query = query.lt('created_at', input.until);
    if (input.cashierQueueOnly) query = query.not('cashier_pending_at', 'is', null);
    if (term) {
      const customerFilter = customerIds.length ? `,customer_id.in.(${customerIds.join(',')})` : '';
      query = query.or(`code.ilike.%${term}%${customerFilter}`);
    }
    const start = (input.page - 1) * input.pageSize;
    const sortBy = input.sortBy ?? 'created_at';
    const ascending = input.sortDirection === 'asc';
    const { data, error, count } = await query
      .order(sortBy, { ascending })
      .order('id', { ascending })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
  }

  /**
   * The current user's own sales waiting at the cashier — powers the
   * "awaiting payment" follow-up chip on the Sell screen.
   */
  async myPendingSales(limit = 50): Promise<OrderWithCustomer[]> {
    const userId = this.supabase.offlineIdentity()?.userId;
    if (!userId) return [];
    const { data, error } = await this.client
      .from('orders')
      .select('*, customers(first_name, last_name)')
      .eq('location_id', this.locations.requireActiveId())
      .eq('status', 'pending_payment')
      .eq('created_by', userId)
      .not('cashier_pending_at', 'is', null)
      .order('cashier_pending_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  /** Full order history for one customer (all statuses). */
  async customerOrders(customerId: string, limit = 20): Promise<OrderWithCustomer[]> {
    const { data, error } = await this.client
      .from('orders')
      .select('*, customers(first_name, last_name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** Order lines with variant labels resolved from variant_catalog. */
  async orderLines(orderId: string): Promise<OrderLineWithProduct[]> {
    const { data, error } = await this.client
      .from('order_lines')
      .select('*')
      .eq('order_id', orderId);
    if (error) throw error;
    const ids = [...new Set(data.map(l => l.variant_id))];
    const variants = await this.variantsByIdsWithStock(ids);
    const byId = new Map(variants.map(v => [v.variant_id, v]));
    return data.map(l => {
      const v = byId.get(l.variant_id);
      return {
        ...l,
        label: v ? variantLabel(v) : l.variant_id.slice(0, 8),
        manufacturer_name: v?.manufacturer_name ?? null,
        sku: v?.sku ?? null,
        wholesale_price: v?.wholesale_price ?? null,
        stock: v?.stock ?? 0,
        track_inventory: v?.track_inventory ?? false,
      };
    });
  }

  /** Settled payment totals (shillings) per order, for many orders at once. */
  async paidTotalsByOrder(orderIds: string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (orderIds.length === 0) return totals;
    const { data, error } = await this.client
      .from('payments')
      .select('order_id, amount, status')
      .in('order_id', orderIds)
      .eq('status', 'settled');
    if (error) throw error;
    for (const row of data ?? []) {
      totals.set(row.order_id, (totals.get(row.order_id) ?? 0) + row.amount);
    }
    return totals;
  }

  async orderPayments(orderId: string): Promise<Payment[]> {
    const { data, error } = await this.client.from('payments').select('*').eq('order_id', orderId);
    if (error) throw error;
    return data;
  }

  async orderRefunds(orderId: string): Promise<Refund[]> {
    const { data, error } = await this.client.from('refunds').select('*').eq('order_id', orderId);
    if (error) throw error;
    return data;
  }

  async variantsByIds(ids: string[]): Promise<Variant[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.client
      .from('variant_catalog')
      .select('*')
      .in('variant_id', ids);
    if (error) throw error;
    return data;
  }

  /** Variants with stock resolved for the active location (proforma load checks). */
  async variantsByIdsWithStock(ids: string[]): Promise<Variant[]> {
    return this.withLocationStock(await this.variantsByIds(ids));
  }

  async variantById(id: string): Promise<Variant | null> {
    const rows = await this.variantsByIds([id]);
    return (await this.withLocationStock(rows))[0] ?? null;
  }

  async getOrder(orderId: string): Promise<OrderWithCustomer> {
    const { data, error } = await this.client
      .from('orders')
      .select('*, customers(first_name, last_name)')
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data;
  }

  // --- RPCs (errors come back as P0001 with a human-readable message) ---

  async postSale(
    customerId: string | null,
    lines: SaleLineInput[],
    payments: PaymentInput[],
    park: boolean,
    clientRef?: string,
    locationId?: string,
    draftId?: string,
    approvalReason?: string
  ): Promise<PostSaleResult> {
    const { data, error } = await this.client.rpc('post_sale_at_location', {
      p_location_id: locationId ?? this.locations.requireActiveId(),
      // null = walk-in customer (accepted by the backend; generated types mark it non-null)
      p_customer_id: customerId!,
      p_lines: lines as never,
      p_payments: payments as never,
      p_park: park,
      // Exactly-once replay: same client_ref returns the original order id.
      ...(clientRef ? { p_client_ref: clientRef } : {}),
      // Proforma being converted: deleted atomically with the posted sale.
      ...(draftId ? { p_draft_id: draftId } : {}),
      ...(approvalReason ? { p_approval_reason: approvalReason } : {}),
    });
    if (error) throw rpcError(error);
    const result = data as { status: string; order_id: string; approval_id?: string };
    if (result.status === 'approval_required') {
      return {
        status: 'approval_required',
        orderId: result.order_id,
        approvalId: result.approval_id!,
      };
    }
    return {
      status: result.status === 'parked' ? 'parked' : 'completed',
      orderId: result.order_id,
    };
  }

  async postOfflineSale(input: {
    locationId: string;
    customerId: string | null;
    lines: SaleLineInput[];
    payments: PaymentInput[];
    clientRef: string;
    occurredAt: string;
    deviceKey: string;
    pendingCount: number;
    draftId?: string;
  }): Promise<OfflineSaleResult> {
    const { data, error } = await this.client.rpc('post_offline_sale_at_location', {
      p_location_id: input.locationId,
      p_customer_id: input.customerId!,
      p_lines: input.lines as never,
      p_payments: input.payments as never,
      p_client_ref: input.clientRef,
      p_occurred_at: input.occurredAt,
      p_device_key: input.deviceKey,
      p_pending_count: input.pendingCount,
      ...(input.draftId ? { p_draft_id: input.draftId } : {}),
    });
    if (error) throw rpcError(error);
    const result = data as unknown as {
      status: string;
      order_id?: string;
      approval_id?: string;
      review_id?: string;
    };
    if (result.status === 'late_review_required') {
      return { status: 'late_review_required', reviewId: result.review_id! };
    }
    if (result.status === 'approval_required') {
      return {
        status: 'approval_required',
        orderId: result.order_id!,
        approvalId: result.approval_id!,
      };
    }
    return {
      status: result.status === 'parked' ? 'parked' : 'completed',
      orderId: result.order_id!,
    };
  }

  async heartbeatPosDevice(
    deviceKey: string,
    locationId: string,
    pendingCount: number,
    synced: boolean
  ): Promise<string> {
    const { data, error } = await this.client.rpc('pos_device_heartbeat', {
      p_device_key: deviceKey,
      p_location_id: locationId,
      p_pending_count: pendingCount,
      p_synced: synced,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async customerDepositAvailable(customerId: string): Promise<number> {
    const { data, error } = await this.client.rpc('customer_deposit_available', {
      p_customer_id: customerId,
    });
    if (error) throw rpcError(error);
    return Number(data ?? 0);
  }

  async postSaleWithPrepayment(
    customerId: string,
    lines: SaleLineInput[],
    settlement: SaleSettlementInput,
    clientRef: string,
    draftId?: string
  ): Promise<PostSaleResult> {
    const { data, error } = await this.client.rpc('post_sale_with_prepayment_at_location', {
      p_location_id: this.locations.requireActiveId(),
      p_customer_id: customerId,
      p_lines: lines as unknown as Json,
      p_payments: settlement.payments as unknown as Json,
      p_deposit_amount: settlement.depositAmount,
      p_credit_amount: settlement.creditAmount,
      p_client_ref: clientRef,
      ...(draftId ? { p_draft_id: draftId } : {}),
    });
    if (error) throw rpcError(error);
    const result = data as unknown as { status: string; order_id: string; approval_id?: string };
    return result.status === 'approval_required'
      ? { status: 'approval_required', orderId: result.order_id, approvalId: result.approval_id! }
      : { status: 'completed', orderId: result.order_id };
  }

  async postCreditSale(
    customerId: string,
    lines: SaleLineInput[],
    clientRef: string,
    draftId?: string,
    approvalReason?: string
  ): Promise<PostSaleResult> {
    const { data, error } = await this.client.rpc('post_credit_sale_at_location', {
      p_location_id: this.locations.requireActiveId(),
      p_customer_id: customerId,
      p_lines: lines as unknown as Json,
      p_client_ref: clientRef,
      ...(draftId ? { p_draft_id: draftId } : {}),
      ...(approvalReason ? { p_approval_reason: approvalReason } : {}),
    });
    if (error) throw rpcError(error);
    const result = data as unknown as {
      status: string;
      order_id: string;
      approval_id?: string;
      downpayment_applied: number;
      credit_amount: number;
    };
    const split = {
      downpaymentApplied: Number(result.downpayment_applied ?? 0),
      creditAmount: Number(result.credit_amount ?? 0),
    };
    return result.status === 'approval_required'
      ? {
          status: 'approval_required',
          orderId: result.order_id,
          approvalId: result.approval_id!,
          ...split,
        }
      : { status: 'completed', orderId: result.order_id, ...split };
  }

  private async withLocationStock(rows: Variant[]): Promise<Variant[]> {
    if (rows.length === 0) return rows;
    const { data, error } = await this.client.rpc('location_stock_snapshot', {
      p_location_id: this.locations.requireActiveId(),
    });
    if (error) throw error;
    const stock = new Map(
      data.map(item => [
        item.variant_id,
        { quantity: Number(item.stock ?? 0), value: item.stock_value ?? 0 },
      ])
    );
    return rows.map(row => ({
      ...row,
      stock: stock.get(row.variant_id!)?.quantity ?? 0,
      stock_value: stock.get(row.variant_id!)?.value ?? 0,
    }));
  }

  async saveDraft(
    customerId: string | null,
    lines: SaleLineInput[],
    draftId: string | null
  ): Promise<string> {
    const { data, error } = await this.client.rpc('save_draft_at_location', {
      p_location_id: this.locations.requireActiveId(),
      // null = walk-in customer (accepted by the backend; generated types mark it non-null)
      p_customer_id: customerId!,
      p_lines: lines as never,
      ...(draftId ? { p_draft_id: draftId } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async convertDraft(orderId: string, payments: PaymentInput[]): Promise<string> {
    const { data, error } = await this.client.rpc('convert_draft', {
      p_order_id: orderId,
      p_payments: payments as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async deleteProforma(orderId: string): Promise<string> {
    const { data, error } = await this.client.rpc('delete_proforma', {
      p_order_id: orderId,
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Mark this company's unconverted, past-due proformas as expired. */
  async expireProformas(): Promise<number> {
    const { data, error } = await this.client.rpc('expire_proformas');
    if (error) throw rpcError(error);
    return data;
  }

  async settleOrder(
    orderId: string,
    payments: PaymentInput[],
    clientRef?: string
  ): Promise<string> {
    const { data, error } = await this.client.rpc('settle_order', {
      p_order_id: orderId,
      p_payments: payments as never,
      // Exactly-once replay: same client_ref returns the original result.
      ...(clientRef ? { p_client_ref: clientRef } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async voidSale(orderId: string, reason: string): Promise<VoidResult> {
    return this.actions.run(async () => {
      const { data, error } = await this.client.rpc('void_sale', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw rpcError(error);
      return data;
    });
  }
}
