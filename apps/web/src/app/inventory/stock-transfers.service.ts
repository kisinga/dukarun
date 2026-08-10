import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';
import { nairobiDayEndExclusive, nairobiDayStart } from '../core/nairobi-date';

export type StockTransfer = Database['public']['Tables']['stock_transfers']['Row'];

export interface StockTransferListRow extends StockTransfer {
  from_location: { name: string } | null;
  to_location: { name: string } | null;
  stock_transfer_lines: Array<{
    quantity: number;
    variant_id: string;
    product_variants: { name: string; sku: string; products: { name: string } | null } | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class StockTransfersService {
  private readonly supabase = inject(SupabaseService);

  async recent(): Promise<StockTransferListRow[]> {
    const { data, error } = await this.supabase.client
      .from('stock_transfers')
      .select(
        '*, from_location:stock_locations!stock_transfers_from_location_id_fkey(name), to_location:stock_locations!stock_transfers_to_location_id_fkey(name), stock_transfer_lines(quantity, variant_id, product_variants(name, sku, products(name)))'
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as StockTransferListRow[];
  }

  async page(input: {
    page: number;
    pageSize: number;
    fromLocationId?: string;
    toLocationId?: string;
    from?: string;
    to?: string;
  }): Promise<{ rows: StockTransferListRow[]; count: number }> {
    let query = this.supabase.client
      .from('stock_transfers')
      .select(
        '*, from_location:stock_locations!stock_transfers_from_location_id_fkey(name), to_location:stock_locations!stock_transfers_to_location_id_fkey(name), stock_transfer_lines(quantity, variant_id, product_variants(name, sku, products(name)))',
        { count: 'exact' }
      );
    if (input.fromLocationId) query = query.eq('from_location_id', input.fromLocationId);
    if (input.toLocationId) query = query.eq('to_location_id', input.toLocationId);
    if (input.from) query = query.gte('created_at', nairobiDayStart(input.from));
    if (input.to) query = query.lt('created_at', nairobiDayEndExclusive(input.to));
    const start = (input.page - 1) * input.pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(start, start + input.pageSize - 1);
    if (error) throw error;
    return { rows: data as StockTransferListRow[], count: count ?? 0 };
  }

  async transfer(
    fromLocationId: string,
    toLocationId: string,
    lines: { variant_id: string; quantity: number }[],
    notes?: string
  ): Promise<string> {
    const { data, error } = await this.supabase.client.rpc('transfer_stock', {
      p_from_location_id: fromLocationId,
      p_to_location_id: toLocationId,
      p_lines: lines as never,
      ...(notes?.trim() ? { p_notes: notes.trim() } : {}),
    });
    if (error) throw rpcError(error);
    return data;
  }
}
