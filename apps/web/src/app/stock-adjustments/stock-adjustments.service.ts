import { Injectable, inject } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { SupabaseService } from '../core/supabase.service';
import { LocationContextService } from '../core/location-context.service';
import { rpcError } from '../pos/pos.service';

export type StockAdjustmentHistoryRow =
  Database['public']['Functions']['stock_adjustment_history']['Returns'][number];

@Injectable({ providedIn: 'root' })
export class StockAdjustmentsService {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);

  async history(options: {
    variantId?: string | null;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: StockAdjustmentHistoryRow[]; total: number }> {
    const { data, error } = await this.supabase.client.rpc('stock_adjustment_history', {
      p_location_id: this.locations.requireActiveId(),
      p_variant_id: options.variantId ?? undefined,
      p_search: options.search?.trim() || undefined,
      p_limit: options.pageSize,
      p_offset: (options.page - 1) * options.pageSize,
    });
    if (error) throw rpcError(error);
    return { rows: data, total: Number(data[0]?.total_count ?? 0) };
  }
}
