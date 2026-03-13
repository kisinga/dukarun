import {
  ID,
  Injector,
  MultiChannelStockLocationStrategy,
  RequestContext,
  StockLevel,
  StockLocationService,
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
 * NOTE: BatchAwareStockLevelService is a separate, module-scoped override of
 * StockLevelService within LedgerPlugin. It does NOT affect GraphQL queries
 * because Vendure's ProductVariantAdminEntityResolver lives in a different module.
 * This strategy is the only code path that matters for stock display.
 *
 * Falls back to the default MultiChannelStockLocationStrategy when batch
 * inventory is unavailable (e.g. during initial bootstrap before tables exist).
 */
export class BatchStockLocationStrategy extends MultiChannelStockLocationStrategy {
  private stockLocationService!: StockLocationService;

  async init(injector: Injector): Promise<void> {
    await super.init(injector);
    this.stockLocationService = injector.get(StockLocationService);
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
      const location = await this.stockLocationService.defaultStockLocation(ctx);
      if (!location?.id) {
        return super.getAvailableStock(ctx, productVariantId, stockLevels);
      }

      const result = await this.connection
        .getRepository(ctx, InventoryBatch)
        .createQueryBuilder('batch')
        .select('SUM(batch.quantity)', 'total')
        .where('batch."channelId" = :channelId', { channelId: Number(ctx.channelId) })
        .andWhere('batch."stockLocationId" = :stockLocationId', {
          stockLocationId: Number(location.id),
        })
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
    } catch {
      // Table may not exist yet during migrations/bootstrap
      return super.getAvailableStock(ctx, productVariantId, stockLevels);
    }
  }
}
