import {
  ID,
  Injector,
  Logger,
  MultiChannelStockLocationStrategy,
  RequestContext,
  StockLevel,
} from '@vendure/core';
import { InventoryBatch } from '../../services/inventory/entities/inventory-batch.entity';

/**
 * StockLocationStrategy that resolves available stock from FIFO batch inventory
 * instead of Vendure's stock_level table.
 *
 * This is the GLOBAL stock resolution path. It is configured via
 * VendureConfig.catalogOptions.stockLocationStrategy in LedgerPlugin, so it
 * applies to ALL stock queries: GraphQL stockOnHand, saleable/fulfillable checks,
 * add-to-cart validation, etc. — without NestJS module-scoping issues.
 *
 * Sums batch quantities across ALL stock locations for the channel.
 * channelId already isolates tenant data; stockLocationId is not filtered
 * because defaultStockLocation() may not match the location where batches
 * were actually created (e.g. "Main" vs "Default Stock Location").
 *
 * Falls back to the default MultiChannelStockLocationStrategy when batch
 * inventory is unavailable (e.g. during initial bootstrap before tables exist).
 */
export class BatchStockLocationStrategy extends MultiChannelStockLocationStrategy {
  async init(injector: Injector): Promise<void> {
    await super.init(injector);
    Logger.info('BatchStockLocationStrategy initialized', 'BatchStockLocationStrategy');
  }

  async getAvailableStock(
    ctx: RequestContext,
    productVariantId: ID,
    stockLevels: StockLevel[]
  ): Promise<{ stockOnHand: number; stockAllocated: number }> {
    if (!ctx.channelId) {
      return super.getAvailableStock(ctx, productVariantId, stockLevels);
    }

    try {
      const result = await this.connection
        .getRepository(ctx, InventoryBatch)
        .createQueryBuilder('batch')
        .select('SUM(batch.quantity)', 'total')
        .where('batch."channelId" = :channelId', { channelId: Number(ctx.channelId) })
        .andWhere('batch."productVariantId" = :productVariantId', {
          productVariantId: Number(productVariantId),
        })
        .andWhere('batch.quantity > 0')
        .getRawOne<{ total: string | null }>();

      const stockOnHand = Number(result?.total ?? 0);

      return {
        stockOnHand,
        stockAllocated: 0,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.error(
        `Error querying batch stock for variant ${productVariantId}: ${msg}`,
        'BatchStockLocationStrategy'
      );
      return super.getAvailableStock(ctx, productVariantId, stockLevels);
    }
  }
}
