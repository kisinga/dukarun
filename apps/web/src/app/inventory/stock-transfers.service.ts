import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type StockTransfer = Database['public']['Tables']['stock_transfers']['Row'];

export interface StockTransferListRow extends StockTransfer {
  from_location: { name: string } | null;
  to_location: { name: string } | null;
}

@Injectable({ providedIn: 'root' })
export class StockTransfersService {
  private readonly supabase = inject(SupabaseService);

  async recent(): Promise<StockTransferListRow[]> {
    const { data, error } = await this.supabase.client
      .from('stock_transfers')
      .select(
        '*, from_location:stock_locations!stock_transfers_from_location_id_fkey(name), to_location:stock_locations!stock_transfers_to_location_id_fkey(name)'
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data as StockTransferListRow[];
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
