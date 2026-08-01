import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';

export type Product = Database['public']['Tables']['products']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderLine = Database['public']['Tables']['order_lines']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type InventoryBatch = Database['public']['Tables']['inventory_batches']['Row'];

/** p_lines item for post_sale / save_draft (amounts in cents). */
export interface SaleLineInput {
  product_id: string;
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
  products: Pick<Product, 'name' | 'sku'> | null;
};

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

  async searchProducts(query: string): Promise<Product[]> {
    // Strip characters that would break the PostgREST .or() filter string.
    const pattern = `%${query.trim().replace(/[%_,()]/g, ' ')}%`;
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`)
      .eq('active', true)
      .limit(20);
    if (error) throw error;
    return data;
  }

  /** Management list: all products (active + inactive), name/sku/barcode search, sorted by name. */
  async listProducts(query = ''): Promise<Product[]> {
    let q = this.client.from('products').select('*').order('name').limit(500);
    const trimmed = query.trim();
    if (trimmed) {
      const pattern = `%${trimmed.replace(/[%_,()]/g, ' ')}%`;
      q = q.or(`name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  /** Stock per product from the product_stock view (client-side join). */
  async productStock(): Promise<Map<string, { stock: number; stock_value: number }>> {
    const { data, error } = await this.client.from('product_stock').select('*');
    if (error) throw error;
    return new Map(
      (data ?? [])
        .filter(r => r.product_id !== null)
        .map(r => [r.product_id!, { stock: Number(r.stock ?? 0), stock_value: r.stock_value ?? 0 }])
    );
  }

  /** Batch history for one product (expand row on the Products screen). */
  async productBatches(productId: string): Promise<InventoryBatch[]> {
    const { data, error } = await this.client
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .order('purchased_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }

  async createProduct(input: {
    name: string;
    price: number;
    sku?: string;
    barcode?: string;
    wholesale_price?: number;
    allow_fractional?: boolean;
    track_inventory?: boolean;
  }): Promise<string> {
    const { data, error } = await this.client.rpc('create_product', {
      p_name: input.name,
      p_price: input.price,
      ...(input.sku ? { p_sku: input.sku } : {}),
      ...(input.barcode ? { p_barcode: input.barcode } : {}),
      ...(input.wholesale_price !== undefined ? { p_wholesale_price: input.wholesale_price } : {}),
      ...(input.allow_fractional !== undefined
        ? { p_allow_fractional: input.allow_fractional }
        : {}),
      ...(input.track_inventory !== undefined ? { p_track_inventory: input.track_inventory } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** null/undefined fields are left unchanged by the backend. */
  async updateProduct(
    productId: string,
    changes: {
      name?: string;
      price?: number;
      barcode?: string;
      wholesale_price?: number;
      allow_fractional?: boolean;
      track_inventory?: boolean;
      active?: boolean;
    }
  ): Promise<string> {
    const { data, error } = await this.client.rpc('update_product', {
      p_product_id: productId,
      ...(changes.name !== undefined ? { p_name: changes.name } : {}),
      ...(changes.price !== undefined ? { p_price: changes.price } : {}),
      ...(changes.barcode !== undefined ? { p_barcode: changes.barcode } : {}),
      ...(changes.wholesale_price !== undefined
        ? { p_wholesale_price: changes.wholesale_price }
        : {}),
      ...(changes.allow_fractional !== undefined
        ? { p_allow_fractional: changes.allow_fractional }
        : {}),
      ...(changes.track_inventory !== undefined
        ? { p_track_inventory: changes.track_inventory }
        : {}),
      ...(changes.active !== undefined ? { p_active: changes.active } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }

  /** Full active catalog for the offline product snapshot (IndexedDB cache). */
  async fetchActiveProducts(): Promise<Product[]> {
    const { data, error } = await this.client
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name')
      .limit(500);
    if (error) throw error;
    return data;
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    const pattern = `%${query.trim().replace(/[%_,()]/g, ' ')}%`;
    const { data, error } = await this.client
      .from('customers')
      .select('*')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(10);
    if (error) throw error;
    return data;
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

  /** Orders by status, most recent first. `since` limits to orders created at/after it. */
  async ordersByStatus(statuses: string[], since?: string): Promise<OrderWithCustomer[]> {
    let query = this.client
      .from('orders')
      .select('*, customers(first_name, last_name)')
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(100);
    if (since) query = query.gte('created_at', since);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async orderLines(orderId: string): Promise<OrderLineWithProduct[]> {
    const { data, error } = await this.client
      .from('order_lines')
      .select('*, products(name, sku)')
      .eq('order_id', orderId);
    if (error) throw error;
    return data;
  }

  async orderPayments(orderId: string): Promise<Payment[]> {
    const { data, error } = await this.client.from('payments').select('*').eq('order_id', orderId);
    if (error) throw error;
    return data;
  }

  async productsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.client.from('products').select('*').in('id', ids);
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

  async settleOrder(orderId: string, payments: PaymentInput[]): Promise<string> {
    const { data, error } = await this.client.rpc('settle_order', {
      p_order_id: orderId,
      p_payments: payments as never,
    });
    if (error) throw rpcError(error);
    return data;
  }

  async voidSale(orderId: string, reason: string): Promise<string> {
    const { data, error } = await this.client.rpc('void_sale', {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error) throw rpcError(error);
    return data;
  }
}
