import { Injectable, inject } from '@angular/core';
import { ApolloService } from '../apollo.service';
import { RECORD_STOCK_ADJUSTMENT } from '../../graphql/operations.graphql';
import { StockAdjustmentDraft } from '../stock-adjustment.service.types';
import { GetStockAdjustmentsDocument } from '../../graphql/generated/graphql';
import type { StockAdjustmentListOptions } from '../../graphql/generated/graphql';

/**
 * Stock Adjustment API Service
 *
 * Handles API communication for stock adjustments.
 * Separated for single responsibility and testability.
 */
@Injectable({
  providedIn: 'root',
})
export class StockAdjustmentApiService {
  private readonly apolloService = inject(ApolloService);

  /**
   * Fetch stock adjustments list with optional filter/sort/pagination
   */
  async getStockAdjustments(options?: StockAdjustmentListOptions): Promise<{
    items: any[];
    totalItems: number;
  }> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: GetStockAdjustmentsDocument,
      variables: { options: options ?? {} },
      fetchPolicy: 'network-only',
    });
    const data = result.data?.stockAdjustments;
    return {
      items: data?.items ?? [],
      totalItems: data?.totalItems ?? 0,
    };
  }

  /**
   * Record stock adjustment via GraphQL mutation
   */
  async recordStockAdjustment(draft: StockAdjustmentDraft): Promise<any> {
    const client = this.apolloService.getClient();

    const input = {
      reason: draft.reason,
      notes: draft.notes || null,
      lines: draft.lines.map((line) => ({
        variantId: line.variantId,
        quantityChange: line.quantityChange,
        stockLocationId: line.stockLocationId,
      })),
    };

    const result = await client.mutate({
      mutation: RECORD_STOCK_ADJUSTMENT,
      variables: { input },
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to record stock adjustment');
    }

    return result.data?.recordStockAdjustment;
  }
}
