import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { environment } from '../../environments/environment';

export type Product = Database['public']['Tables']['products']['Row'];
export type Collection = Database['public']['Tables']['collections']['Row'];
export type CollectionWithCount = Collection & { product_count: number };
export type Variant = Database['public']['Views']['variant_catalog']['Row'];
export type ProductVariant = Database['public']['Tables']['product_variants']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerWithCredit = Customer & { ar_balance: number };
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderLine = Database['public']['Tables']['order_lines']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type InventoryBatch = Database['public']['Tables']['inventory_batches']['Row'];
export type StockLocation = Database['public']['Tables']['stock_locations']['Row'];

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

/** p_lines item for post_sale / save_draft (amounts in cents). */
export interface SaleLineInput {
  variant_id: string;
  quantity: number;
  unit_price: number;
  custom_price?: number;
  override_reason?: string;
}

/** p_payments item for post_sale / convert_draft / settle_order. */
export interface PaymentInput {
  method: 'cash' | 'mpesa' | 'bank';
  amount: number;
  reference?: string;
  mpesa_receipt?: string;
}

export type OrderWithCustomer = Order & {
  customers: Pick<Customer, 'first_name' | 'last_name'> | null;
};

export type OrderLineWithProduct = OrderLine & {
  /** Resolved from variant_catalog (product — variant). */
  label: string;
};

/** void_sale result: voided immediately, or parked for approval (supervisor path). */
export type VoidResult =
  { status: 'voided'; entry_id?: string } | { status: 'approval_required'; approval_id?: string };

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

  get client() {
    return this.supabase.client;
  }

  /** POS search: active variants of active products from variant_catalog. */
  async searchVariants(query: string): Promise<Variant[]> {
    // Strip characters that would break the PostgREST .or() filter string.
    const pattern = `%${query.trim().replace(/[%_,()]/g, ' ')}%`;
    const { data, error } = await this.client
      .from('variant_catalog')
      .select('*')
      .or(
        `product_name.ilike.${pattern},variant_name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`
      )
      .eq('variant_active', true)
      .eq('product_active', true)
      .limit(20);
    if (error) throw error;
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
        `product_name.ilike.${pattern},variant_name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  /** Product families (the products table) for the management screen grouping. */
  async listFamilies(): Promise<Product[]> {
    const { data, error } = await this.client.from('products').select('*').order('name').limit(500);
    if (error) throw error;
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
    const { data, error } = await this.client.from('product_stock').select('*');
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
    variants: CatalogVariantInput[];
  }): Promise<string> {
    const { data, error } = await this.client.rpc('create_catalog_product', {
      p_name: input.name,
      p_variants: input.variants as never,
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
    variants: CatalogVariantInput[];
  }): Promise<string> {
    const { data, error } = await this.client.rpc('update_catalog_product', {
      p_product_id: input.product_id,
      p_name: input.name,
      p_barcode: input.barcode,
      p_active: input.active,
      p_variants: input.variants as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async listStockLocations(): Promise<StockLocation[]> {
    const { data, error } = await this.client
      .from('stock_locations')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
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
    return data;
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
      products.push(...data);
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

  // --- Collections ---

  async listCollections(): Promise<CollectionWithCount[]> {
    const [{ data: collections, error: e1 }, { data: links, error: e2 }] = await Promise.all([
      this.client.from('collections').select('*').order('name'),
      this.client.from('product_collections').select('collection_id'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const counts = new Map<string, number>();
    for (const l of links ?? [])
      counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);
    return (collections ?? []).map(c => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
  }

  async upsertCollection(input: {
    name: string;
    slug?: string;
    description?: string;
    collection_id?: string;
    active?: boolean;
  }): Promise<string> {
    const { data, error } = await this.client.rpc('upsert_collection', {
      p_name: input.name,
      ...(input.slug ? { p_slug: input.slug } : {}),
      ...(input.description ? { p_description: input.description } : {}),
      ...(input.collection_id ? { p_collection_id: input.collection_id } : {}),
      ...(input.active !== undefined ? { p_active: input.active } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Replace a family's collection set with exactly `collectionIds`. */
  async setProductCollections(productId: string, collectionIds: string[]): Promise<string> {
    const { data, error } = await this.client.rpc('set_product_collections', {
      p_product_id: productId,
      p_collection_ids: collectionIds,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async productCollectionIds(productId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('product_collections')
      .select('collection_id')
      .eq('product_id', productId);
    if (error) throw error;
    return (data ?? []).map(r => r.collection_id);
  }

  async searchCustomers(query: string): Promise<CustomerWithCredit[]> {
    const pattern = `%${query.trim().replace(/[%_,()]/g, ' ')}%`;
    const { data, error } = await this.client
      .from('customers')
      .select('*')
      .eq('is_supplier', false)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(10);
    if (error) throw error;
    return this.withCustomerBalances(data);
  }

  async customerWithCredit(customerId: string): Promise<CustomerWithCredit | null> {
    const { data, error } = await this.client
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('is_supplier', false)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (await this.withCustomerBalances([data]))[0] ?? null;
  }

  private async withCustomerBalances(customers: Customer[]): Promise<CustomerWithCredit[]> {
    if (customers.length === 0) return [];
    const ids = customers.map(customer => customer.id);
    const { data, error } = await this.client
      .from('customer_ar_balances')
      .select('customer_id, balance')
      .in('customer_id', ids);
    if (error) throw error;
    const balances = new Map((data ?? []).map(row => [row.customer_id, row.balance ?? 0]));
    return customers.map(customer => ({
      ...customer,
      ar_balance: balances.get(customer.id) ?? 0,
    }));
  }

  /** Enabled non-credit payment method codes (credit is handled as its own checkout mode). */
  async enabledPaymentMethods(): Promise<string[]> {
    const { data, error } = await this.client
      .from('payment_methods')
      .select('code')
      .eq('enabled', true)
      .neq('code', 'credit');
    if (error) throw error;
    return data.map(m => m.code);
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
    page: number;
    pageSize: number;
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
    if (input.since) query = query.gte('created_at', input.since);
    if (input.until) query = query.lt('created_at', input.until);
    if (term) {
      const customerFilter = customerIds.length ? `,customer_id.in.(${customerIds.join(',')})` : '';
      query = query.or(`code.ilike.%${term}%${customerFilter}`);
    }
    const start = (input.page - 1) * input.pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return { rows: data ?? [], count: count ?? 0 };
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
    const variants = await this.variantsByIds(ids);
    const byId = new Map(variants.map(v => [v.variant_id, v]));
    return data.map(l => {
      const v = byId.get(l.variant_id);
      return { ...l, label: v ? variantLabel(v) : l.variant_id.slice(0, 8) };
    });
  }

  async orderPayments(orderId: string): Promise<Payment[]> {
    const { data, error } = await this.client.from('payments').select('*').eq('order_id', orderId);
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
    clientRef?: string
  ): Promise<string> {
    const { data, error } = await this.client.rpc('post_sale', {
      // null = walk-in customer (accepted by the backend; generated types mark it non-null)
      p_customer_id: customerId!,
      p_lines: lines as never,
      p_payments: payments as never,
      p_park: park,
      // Exactly-once replay: same client_ref returns the original order id.
      ...(clientRef ? { p_client_ref: clientRef } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  async saveDraft(
    customerId: string | null,
    lines: SaleLineInput[],
    draftId: string | null
  ): Promise<string> {
    const { data, error } = await this.client.rpc('save_draft', {
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

  async settleOrder(orderId: string, payments: PaymentInput[]): Promise<string> {
    const { data, error } = await this.client.rpc('settle_order', {
      p_order_id: orderId,
      p_payments: payments as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async voidSale(orderId: string, reason: string): Promise<VoidResult> {
    const { data, error } = await this.client.rpc('void_sale', {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    return data as VoidResult;
  }
}
